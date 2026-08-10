// hubrise-webhook — reçoit les événements HubRise et met à jour la commande.
//
// Enregistré comme callback à la connexion (POST /callback avec
// events: { order: ["create","update"] }). HubRise signe le corps brut en
// HMAC-SHA256 avec le client secret de l'app et place le résultat dans
// l'en-tête X-HubRise-Hmac-SHA256.
//
// À déployer SANS vérification de JWT, HubRise n'étant pas un utilisateur
// Supabase : `supabase functions deploy hubrise-webhook --no-verify-jwt`.
// L'authenticité repose entièrement sur la signature HMAC.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { mapHubriseStatus, verifySignature } from "../_shared/hubrise.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CLIENT_SECRET = Deno.env.get("HUBRISE_CLIENT_SECRET") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Le corps doit être lu BRUT : re-sérialiser un objet JSON changerait les
    // octets et invaliderait la signature.
    const raw = await req.text();
    const signature = req.headers.get("X-HubRise-Hmac-SHA256");

    if (!await verifySignature(raw, signature, CLIENT_SECRET)) {
      // On répond 401 sans détail : inutile d'indiquer à un émetteur non
      // authentifié pourquoi sa signature est rejetée.
      return json({ error: "invalid_signature" }, 401);
    }

    const event = JSON.parse(raw || "{}");
    const resourceType = event?.resource_type ?? event?.resource ?? "";
    const eventType = event?.event_type ?? event?.event ?? "";

    // Seuls les événements de commande nous intéressent ; on acquitte le reste
    // en 200 pour que HubRise ne les rejoue pas indéfiniment.
    if (resourceType && resourceType !== "order") {
      return json({ ignored: true, reason: "not_an_order_event" });
    }

    const payload = event?.new_state ?? event?.data ?? event?.order ?? event;
    const hubriseOrderId: string | null = payload?.id ?? null;
    // private_ref porte l'UUID de commande Wegemo, posé à l'envoi.
    const privateRef: string | null = payload?.private_ref ?? null;
    const status: string | null = payload?.status ?? null;

    if (!status || (!hubriseOrderId && !privateRef)) {
      return json({ ignored: true, reason: "incomplete_event" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Retrouve la commande par référence privée (fiable) puis, à défaut, par
    // l'id HubRise mémorisé à l'envoi.
    let query = admin.from("orders").select("id, restaurant_id, pos_sync_status");
    query = privateRef
      ? query.eq("id", privateRef)
      : query.eq("pos_order_id", hubriseOrderId as string);

    const { data: order } = await query.maybeSingle();

    if (!order) {
      // Commande créée directement en caisse, ou non suivie par Wegemo :
      // on acquitte pour éviter les rejeux.
      return json({ ignored: true, reason: "unknown_order" });
    }

    const syncStatus = mapHubriseStatus(status);

    const update: Record<string, unknown> = { pos_sync_status: syncStatus };
    if (hubriseOrderId) update.pos_order_id = hubriseOrderId;
    if (syncStatus === "rejected") {
      update.pos_sync_error = `Refusée par la caisse (statut HubRise : ${status})`;
    } else {
      update.pos_sync_error = null;
    }

    await admin.from("orders").update(update).eq("id", order.id);

    await admin.from("pos_sync_log").insert({
      restaurant_id: order.restaurant_id,
      order_id: order.id,
      direction: "inbound",
      action: "webhook",
      ok: true,
      http_status: 200,
      message: `${eventType || "order.update"} → ${status} (${syncStatus})`,
    });

    return json({ received: true, order_id: order.id, pos_sync_status: syncStatus });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

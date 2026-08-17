// hubrise-push-order — transmet une commande Wegemo à la caisse via HubRise.
//
// FLUX PAIEMENT EN CAISSE, STRICTEMENT SÉPARÉ DE STRIPE.
// Cette fonction ne touche jamais à Stripe et refuse toute commande dont le
// payment_mode n'est pas 'pay_at_counter'. Le payload envoyé à HubRise ne
// contient volontairement pas de tableau `payments`, ce qui fait remonter la
// commande en caisse comme un encaissement à réaliser.
//
// Appelable :
//   - par le client au moment de valider sa commande (JWT anon accepté : la
//     preuve de légitimité est la connaissance de l'UUID secret de commande,
//     comme pour le suivi de commande anonyme existant) ;
//   - par le restaurateur depuis le dashboard pour relancer un envoi échoué.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { buildOrderPayload, hubriseFetch } from "../_shared/hubrise.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  let orderId: string | null = null;

  try {
    const body = await req.json();
    orderId = body?.order_id ?? null;
    if (!orderId) return json({ error: "missing_order" }, 400);

    // --- Chargement de la commande -----------------------------------------
    const { data: order } = await admin
      .from("orders")
      .select("id, restaurant_id, table_id, status, note, total, payment_mode, " +
        "pos_sync_status, pos_order_id, pos_sync_attempts, customer_name, customer_email, order_type")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return json({ error: "order_not_found" }, 404);

    // --- Garde-fou paiement -------------------------------------------------
    // Une commande payée en ligne suit le flux Stripe et ne doit jamais être
    // déclarée « à encaisser » à la caisse : on refuse plutôt que de deviner.
    if (order.payment_mode !== "pay_at_counter") {
      return json({ error: "not_a_counter_payment_order" }, 400);
    }

    // --- Idempotence --------------------------------------------------------
    // Déjà transmise : on renvoie l'état connu sans recréer de commande côté
    // caisse. Indispensable, le client pouvant relancer la requête.
    if (order.pos_order_id) {
      return json({
        pushed: false,
        already_sent: true,
        pos_order_id: order.pos_order_id,
        pos_sync_status: order.pos_sync_status,
      });
    }

    // --- Connexion caisse ---------------------------------------------------
    const { data: conn } = await admin
      .from("pos_connections")
      .select("access_token, hubrise_location_id, status")
      .eq("restaurant_id", order.restaurant_id)
      .maybeSingle();

    if (!conn?.access_token || !conn.hubrise_location_id) {
      // Pas d'intégration caisse : ce n'est pas une erreur, la commande reste
      // gérée dans la vue cuisine Wegemo.
      await admin.from("orders").update({ pos_sync_status: "not_applicable" })
        .eq("id", orderId);
      return json({ pushed: false, reason: "pos_not_connected" });
    }

    // --- Construction du payload -------------------------------------------
    const { data: lines } = await admin
      .from("order_items")
      .select("menu_item_id, quantity, detail, menu_items(name, price, pos_ref)")
      .eq("order_id", orderId);

    if (!lines?.length) return json({ error: "empty_order" }, 400);

    const { data: table } = order.table_id
      ? await admin.from("tables").select("number, label").eq("id", order.table_id).maybeSingle()
      : { data: null };

    const tableLabel = table
      ? (table.label || (table.number === 0 ? "À emporter" : `Table ${table.number}`))
      : null;

    const payload = buildOrderPayload({
      wegemoOrderId: order.id,
      serviceType: order.order_type === "takeaway" ? "collection" : "eat_in",
      tableLabel,
      customerName: order.customer_name,
      customerEmail: order.customer_email,
      note: order.note,
      total: order.total,
      lines: lines.map((l: Record<string, unknown>) => {
        const mi = (l.menu_items ?? {}) as Record<string, unknown>;
        return {
          menu_item_id: l.menu_item_id as string,
          quantity: Number(l.quantity ?? 1),
          detail: (l.detail as string) || null,
          name: (mi.name as string) ?? "Article",
          price: (mi.price as number) ?? 0,
          pos_ref: (mi.pos_ref as string) || null,
          // Les suppléments choisis sont stockés en texte libre dans `detail`
          // côté Wegemo : on les laisse en note de ligne plutôt que d'inventer
          // des refs d'options que la caisse ne reconnaîtrait pas.
          supplements: null,
        };
      }),
    });

    await admin.from("orders").update({
      pos_sync_status: "pending",
      pos_sync_attempts: (order.pos_sync_attempts ?? 0) + 1,
    }).eq("id", orderId);

    // --- Envoi --------------------------------------------------------------
    const call = await hubriseFetch(
      `/locations/${conn.hubrise_location_id}/orders`,
      conn.access_token,
      { method: "POST", body: JSON.stringify(payload) },
    );

    const posOrderId = call.ok && call.data && typeof call.data === "object"
      ? ((call.data as Record<string, unknown>).id as string ?? null)
      : null;

    await admin.from("pos_sync_log").insert({
      restaurant_id: order.restaurant_id,
      order_id: orderId,
      direction: "outbound",
      action: "push_order",
      ok: call.ok,
      http_status: call.status,
      message: call.ok
        ? `commande transmise (${posOrderId ?? "sans id"})`
        : (call.error ?? "unknown_error").slice(0, 500),
    });

    if (!call.ok) {
      // hubriseFetch a déjà retenté les erreurs transitoires : arriver ici
      // signifie un échec définitif, à remonter au restaurateur.
      await admin.from("orders").update({
        pos_sync_status: "failed",
        pos_sync_error: (call.error ?? "push_failed").slice(0, 500),
      }).eq("id", orderId);

      await admin.from("pos_connections").update({
        status: "error",
        last_error: (call.error ?? "push_failed").slice(0, 500),
        updated_at: new Date().toISOString(),
      }).eq("restaurant_id", order.restaurant_id);

      return json({ pushed: false, error: call.error ?? "push_failed" }, 502);
    }

    await admin.from("orders").update({
      pos_sync_status: "sent",
      pos_order_id: posOrderId,
      pos_sync_error: null,
    }).eq("id", orderId);

    await admin.from("pos_connections").update({
      status: "connected",
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq("restaurant_id", order.restaurant_id);

    return json({ pushed: true, pos_order_id: posOrderId });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (orderId) {
      await admin.from("orders").update({
        pos_sync_status: "failed",
        pos_sync_error: msg.slice(0, 500),
      }).eq("id", orderId);
    }
    return json({ error: msg }, 500);
  }
});

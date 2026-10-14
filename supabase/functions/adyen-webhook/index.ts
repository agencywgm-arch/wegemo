// adyen-webhook — notification standard Adyen (JSON). Seule source de vérité
// pour passer un paiement à PAID : AUTHORISATION success=true, signature HMAC
// valide (clé propre au restaurant), compte marchand et montant concordants.
//
// Déploiement SANS JWT : supabase functions deploy adyen-webhook --no-verify-jwt
// Adyen exige une réponse HTTP 200 contenant [accepted] ; toute autre réponse
// provoque un nouvel envoi (donc on répond 500 sur erreur transitoire).
// Protection optionnelle supplémentaire : secrets ADYEN_WEBHOOK_USER / ADYEN_WEBHOOK_PASS
// (Basic auth configurée dans le webhook Adyen).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AdyenProvider, interpretAuthorisation, loadAdyenConfig, parseNotificationItems, verifyAdyenNotification } from "../_shared/adyen.ts";
import { finalizePaymentAttempt } from "../_shared/payment_finalize.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BASIC_USER = Deno.env.get("ADYEN_WEBHOOK_USER") ?? "";
const BASIC_PASS = Deno.env.get("ADYEN_WEBHOOK_PASS") ?? "";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const accepted = () => new Response("[accepted]", { status: 200, headers: { "Content-Type": "text/plain" } });
const text = (s: string, status: number) => new Response(s, { status, headers: { "Content-Type": "text/plain" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return text("method_not_allowed", 405);
  try {
    if (BASIC_USER || BASIC_PASS) {
      const expected = "Basic " + btoa(`${BASIC_USER}:${BASIC_PASS}`);
      if (req.headers.get("Authorization") !== expected) return text("unauthorized", 401);
    }

    let body: any;
    try { body = JSON.parse(await req.text() || "{}"); } catch { return text("invalid_json", 400); }
    const items = parseNotificationItems(body);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    for (const item of items) {
      if (item.eventCode !== "AUTHORISATION") continue; // autres événements : ignorés, acquittés
      const ref = item.merchantReference ?? "";
      if (!UUID_RE.test(ref)) continue;

      const { data: attempt, error: aErr } = await admin
        .from("payment_attempts").select("id, restaurant_id, provider").eq("id", ref).maybeSingle();
      if (aErr) return text("db_error", 500);
      if (!attempt || attempt.provider !== "adyen") continue;

      const { data: connection, error: cErr } = await admin
        .from("payment_connections")
        .select("api_key, merchant_account, environment, live_url_prefix, hmac_key")
        .eq("restaurant_id", attempt.restaurant_id).maybeSingle();
      if (cErr) return text("db_error", 500);
      const config = loadAdyenConfig(connection);
      if (!config) continue;

      const valid = config.merchantAccount === item.merchantAccountCode
        && await verifyAdyenNotification(item, config.hmacKey);
      if (!valid) {
        await admin.from("payment_events").insert({
          restaurant_id: attempt.restaurant_id, payment_attempt_id: attempt.id,
          direction: "inbound", action: "webhook", ok: false, message: "signature HMAC invalide ou compte marchand inattendu",
        });
        return text("invalid_signature", 401);
      }

      const r = interpretAuthorisation(item);
      if (!r.paid) {
        // Refus : le client peut réessayer sur le même lien, on ne ferme rien.
        await admin.from("payment_events").insert({
          restaurant_id: attempt.restaurant_id, payment_attempt_id: attempt.id,
          direction: "inbound", action: "webhook", ok: true,
          message: `autorisation refusée (${String(item.reason ?? "").slice(0, 200)})`,
        });
        continue;
      }

      const result = await finalizePaymentAttempt(admin, new AdyenProvider(config), attempt.id, "webhook", {
        status: "paid", amount: r.amount, currency: r.currency,
        rawStatus: "AUTHORISATION:true", pspReference: r.pspReference,
      });
      if (result.error?.startsWith("order_creation_failed")) {
        // Paiement conservé (PAID) ; à traiter à la main, inutile de rejouer.
        console.error("adyen-webhook", result.error);
      }
    }
    return accepted();
  } catch (e) {
    console.error("adyen-webhook", e);
    return text("error", 500);
  }
});

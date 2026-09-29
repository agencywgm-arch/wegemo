// flatpay-webhook — reçoit la notification serveur-à-serveur de Flatpay et
// finalise le paiement. Même logique de finalisation que
// flatpay-payment-status (finalizePaymentAttempt) : idempotent, peut être
// rejoué sans effet de bord si Flatpay renvoie le même événement plusieurs
// fois.
//
// CONFIRM avant mise en production : le nom exact du champ portant la
// référence WGM (reference / private_ref / metadata.reference / autre ?) et
// le mécanisme de signature réel (voir _shared/flatpay.ts, hypothèse
// HMAC-SHA256 sur le corps brut). Tant que FLATPAY_WEBHOOK_SECRET n'est pas
// configuré, toute notification est rejetée (401) plutôt que traitée sans
// vérification.
//
// À déployer SANS vérification de JWT (Flatpay n'est pas un utilisateur
// Supabase) : `supabase functions deploy flatpay-webhook --no-verify-jwt`.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { FlatpayProvider, loadFlatpayConfigFromEnv, verifyFlatpaySignature } from "../_shared/flatpay.ts";
import { finalizePaymentAttempt } from "../_shared/payment_finalize.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("FLATPAY_WEBHOOK_SECRET") ?? "";
// CONFIRM: nom exact de l'en-tête de signature Flatpay.
const SIGNATURE_HEADER = Deno.env.get("FLATPAY_WEBHOOK_SIGNATURE_HEADER") ?? "X-Flatpay-Signature";
// CONFIRM: nom exact du champ référence dans le payload webhook.
const REFERENCE_FIELDS = ["reference", "private_ref", "order_reference"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // Corps lu BRUT : re-sérialiser changerait les octets et invaliderait la
    // signature (même piège que hubrise-webhook).
    const raw = await req.text();

    if (!WEBHOOK_SECRET) {
      return json({ error: "flatpay_webhook_secret_not_configured" }, 500);
    }
    const signature = req.headers.get(SIGNATURE_HEADER);
    if (!await verifyFlatpaySignature(raw, signature, WEBHOOK_SECRET)) {
      return json({ error: "invalid_signature" }, 401);
    }

    const event = JSON.parse(raw || "{}");
    let reference: string | null = null;
    for (const f of REFERENCE_FIELDS) {
      if (typeof event?.[f] === "string") { reference = event[f]; break; }
      if (typeof event?.data?.[f] === "string") { reference = event.data[f]; break; }
    }
    if (!reference) {
      // Acquitte en 200 pour que Flatpay ne rejoue pas un événement qu'on ne
      // saura de toute façon jamais rattacher.
      return json({ ignored: true, reason: "no_reference_field" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: attempt } = await admin
      .from("payment_attempts")
      .select("id, restaurant_id")
      .eq("id", reference)
      .maybeSingle();
    if (!attempt) return json({ ignored: true, reason: "unknown_payment_attempt" });

    const connection = await admin
      .from("payment_connections")
      .select("api_key, environment")
      .eq("restaurant_id", attempt.restaurant_id)
      .maybeSingle();
    const config = loadFlatpayConfigFromEnv({
      get: (k) => {
        if (k === "FLATPAY_API_KEY" && connection.data?.api_key) return connection.data.api_key;
        if (k === "FLATPAY_ENVIRONMENT" && connection.data?.environment) return connection.data.environment;
        return Deno.env.get(k) ?? undefined;
      },
    });
    if (!config) return json({ error: "flatpay_not_configured" }, 500);

    const result = await finalizePaymentAttempt(admin, new FlatpayProvider(config), attempt.id, "webhook");
    return json({ received: true, ...result });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

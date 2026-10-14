// flatpay-payment-status — appelé par le client après son retour de Flatpay
// (/payment/success, /payment/pending) pour connaître le statut RÉEL du
// paiement. Le simple fait d'être revenu sur success_url ne garantit rien :
// cette fonction revérifie toujours auprès de Flatpay (via
// finalizePaymentAttempt) avant de renvoyer un statut au client.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { FlatpayProvider, loadFlatpayConfigFromEnv } from "../_shared/flatpay.ts";
import { finalizePaymentAttempt } from "../_shared/payment_finalize.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { payment_attempt_id } = await req.json();
    if (!payment_attempt_id) return json({ error: "missing_payment_attempt_id" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: attempt } = await admin
      .from("payment_attempts")
      .select("restaurant_id")
      .eq("id", payment_attempt_id)
      .maybeSingle();
    if (!attempt) return json({ error: "payment_attempt_introuvable" }, 404);

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
    if (!config) return json({ error: "flatpay_not_configured" }, 400);

    const result = await finalizePaymentAttempt(admin, new FlatpayProvider(config), payment_attempt_id, "status_check");
    return json(result);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

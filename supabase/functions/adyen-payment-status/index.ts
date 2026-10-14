// adyen-payment-status — appelé par la page de retour. Le retour navigateur ne
// prouve rien : le paiement n'est PAID que par le webhook signé. Ici on relit
// l'état de la tentative (et on détecte l'expiration du lien).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { AdyenProvider, loadAdyenConfig } from "../_shared/adyen.ts";
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
      .from("payment_attempts").select("restaurant_id").eq("id", payment_attempt_id).maybeSingle();
    if (!attempt) return json({ error: "payment_attempt_introuvable" }, 404);

    const { data: connection } = await admin
      .from("payment_connections")
      .select("api_key, merchant_account, environment, live_url_prefix, hmac_key")
      .eq("restaurant_id", attempt.restaurant_id).maybeSingle();
    const config = loadAdyenConfig(connection);
    if (!config) return json({ error: "adyen_not_configured" }, 400);

    const result = await finalizePaymentAttempt(admin, new AdyenProvider(config), payment_attempt_id, "status_check");
    return json(result);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

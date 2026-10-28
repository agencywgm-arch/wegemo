// adyen-save-credentials — le restaurateur saisit ses identifiants Adyen dans
// Réglages. Ils transitent une fois ici (HTTPS, jamais loggés) puis vivent
// dans payment_connections (illisible côté navigateur). La clé API est testée
// auprès d'Adyen avant d'afficher « connecté ».
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { AdyenProvider, isValidHmacKey, isValidLiveUrlPrefix, isValidMerchantAccount } from "../_shared/adyen.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const restaurant_id = body.restaurant_id;
    const api_key = String(body.api_key ?? "").trim();
    const merchant_account = String(body.merchant_account ?? "").trim();
    const environment = body.environment ?? "test";
    const live_url_prefix = String(body.live_url_prefix ?? "").trim();
    const hmac_key = String(body.hmac_key ?? "").trim();

    if (!restaurant_id || !api_key) return json({ error: "missing_params" }, 400);
    if (!["test", "production"].includes(environment)) return json({ error: "invalid_environment" }, 400);
    if (!isValidMerchantAccount(merchant_account)) return json({ error: "invalid_merchant_account" }, 400);
    if (environment === "production" && !isValidLiveUrlPrefix(live_url_prefix)) return json({ error: "invalid_live_url_prefix" }, 400);
    if (!isValidHmacKey(hmac_key)) return json({ error: "invalid_hmac_key" }, 400);

    const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: "not_authenticated" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: restaurant } = await admin.from("restaurants").select("id, owner_id").eq("id", restaurant_id).maybeSingle();
    if (!restaurant || restaurant.owner_id !== user.id) return json({ error: "not_authorized" }, 403);

    const check = await new AdyenProvider({
      apiKey: api_key, merchantAccount: merchant_account, environment,
      liveUrlPrefix: environment === "production" ? live_url_prefix : undefined, hmacKey: hmac_key,
    }).checkCredentials();
    if (!check.ok) return json({ error: check.error ?? "adyen_credentials_invalid" }, 400);

    const now = new Date().toISOString();
    const { error } = await admin.from("payment_connections").upsert({
      restaurant_id, provider: "adyen", environment, api_key, merchant_account,
      live_url_prefix: environment === "production" ? live_url_prefix : null, hmac_key,
      status: "connected", last_error: null, connected_at: now, updated_at: now,
    }, { onConflict: "restaurant_id" });
    if (error) return json({ error: error.message }, 500);

    return json({ connected: true, environment });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

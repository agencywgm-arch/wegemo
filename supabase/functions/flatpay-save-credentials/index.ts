// flatpay-save-credentials — le restaurateur saisit sa clé API Flatpay dans
// Réglages ; elle transite UNE FOIS par cette fonction (HTTPS, jamais
// loggée) puis vit uniquement dans payment_connections (RLS sans policy,
// illisible même par le propriétaire ensuite — voir migration_flatpay.sql).
// Le dashboard affiche seulement l'état via get_payment_connection_status().
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { restaurant_id, api_key, environment = "test" } = await req.json();
    if (!restaurant_id || !api_key) return json({ error: "missing_params" }, 400);
    if (!["test", "production"].includes(environment)) return json({ error: "invalid_environment" }, 400);

    const authHeader = req.headers.get("Authorization") ?? "";
    const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: "not_authenticated" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: restaurant } = await admin.from("restaurants").select("id, owner_id").eq("id", restaurant_id).maybeSingle();
    if (!restaurant || restaurant.owner_id !== user.id) return json({ error: "not_authorized" }, 403);

    const { error } = await admin.from("payment_connections").upsert({
      restaurant_id, provider: "flatpay", environment, api_key,
      status: "connected", last_error: null, connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "restaurant_id" });
    if (error) return json({ error: error.message }, 500);

    return json({ connected: true, environment });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

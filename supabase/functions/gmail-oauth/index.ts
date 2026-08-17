// gmail-oauth — exchanges an OAuth code for tokens and stores the connection.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { code, restaurant_id, redirect_uri } = await req.json();
    if (!code || !restaurant_id || !redirect_uri) {
      return json({ error: "missing_params" }, 400);
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri,
        grant_type: "authorization_code",
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok) return json({ error: tokens?.error ?? "token_error" }, 400);

    const infoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const info = await infoRes.json();

    const expiry = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    await admin.from("email_connections").upsert(
      {
        restaurant_id,
        email: info.email ?? "",
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? "",
        token_expiry: expiry,
      },
      { onConflict: "restaurant_id" },
    );

    return json({ success: true, email: info.email ?? "" });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

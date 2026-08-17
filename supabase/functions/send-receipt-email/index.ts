// send-receipt-email — single transactional receipt email via Resend.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GLOBAL_RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const GLOBAL_RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { restaurant_id, to_email, subject, html_body } = await req.json();
    if (!to_email || !subject || !html_body) return json({ error: "missing_params" }, 400);

    let apiKey = GLOBAL_RESEND_KEY;
    let from = GLOBAL_RESEND_FROM || "Wegemo <onboarding@resend.dev>";

    if (restaurant_id) {
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
      const { data: settings } = await admin
        .from("restaurant_settings")
        .select("resend_api_key, resend_from")
        .eq("restaurant_id", restaurant_id)
        .single();
      if (settings?.resend_api_key) apiKey = settings.resend_api_key;
      if (settings?.resend_from) from = settings.resend_from;
    }
    if (!apiKey) return json({ error: "resend_not_configured" }, 400);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: to_email, subject, html: html_body }),
    });
    if (!res.ok) return json({ error: `resend_${res.status}` }, 400);

    return json({ sent: true });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

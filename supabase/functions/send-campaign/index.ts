// send-campaign — authenticated bulk email send via Resend (max 500 recipients).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GLOBAL_RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const GLOBAL_RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "unauthorized" }, 401);

    const { restaurant_id, restaurant_name, subject, html_body, recipients } = await req.json();
    if (!restaurant_id || !subject || !html_body || !Array.isArray(recipients)) {
      return json({ error: "missing_params" }, 400);
    }
    const list = recipients.slice(0, 500);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: settings } = await admin
      .from("restaurant_settings")
      .select("resend_api_key, resend_from")
      .eq("restaurant_id", restaurant_id)
      .single();

    const apiKey = settings?.resend_api_key || GLOBAL_RESEND_KEY;
    const from = settings?.resend_from || GLOBAL_RESEND_FROM ||
      `${restaurant_name ?? "Wegemo"} <onboarding@resend.dev>`;
    if (!apiKey) return json({ error: "resend_not_configured" }, 400);

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const to of list) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to, subject, html: html_body }),
        });
        if (res.ok) sent++;
        else {
          failed++;
          errors.push(`${to}: ${res.status}`);
        }
      } catch (err) {
        failed++;
        errors.push(`${to}: ${String(err)}`);
      }
    }

    await admin.from("campaign_logs").insert({
      restaurant_id,
      subject,
      sent_count: sent,
      failed_count: failed,
    });

    return json({ sent, failed, errors });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

// create-payment-intent — creates a Stripe PaymentIntent using the restaurant's
// own secret key (read with the service-role client).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { amount, currency = "eur", restaurant_id } = await req.json();

    if (typeof amount !== "number" || amount <= 0 || amount > 10000) {
      return json({ error: "invalid_amount" }, 400);
    }
    if (!restaurant_id) return json({ error: "missing_restaurant" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: settings } = await admin
      .from("restaurant_settings")
      .select("stripe_secret_key, stripe_publishable_key")
      .eq("restaurant_id", restaurant_id)
      .single();

    const secret = settings?.stripe_secret_key;
    if (!secret) return json({ error: "stripe_not_configured" }, 400);

    // Stripe expects the amount in the smallest currency unit (cents).
    const body = new URLSearchParams();
    body.set("amount", String(Math.round(amount * 100)));
    body.set("currency", currency);
    body.set("automatic_payment_methods[enabled]", "true");

    const res = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const intent = await res.json();
    if (!res.ok) return json({ error: intent?.error?.message ?? "stripe_error" }, 400);

    return json({
      client_secret: intent.client_secret,
      publishable_key: settings?.stripe_publishable_key ?? null,
    });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

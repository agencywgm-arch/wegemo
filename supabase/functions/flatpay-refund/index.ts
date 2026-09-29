// flatpay-refund — remboursement staff d'une commande payée par Flatpay.
// Authentifié : seul le propriétaire du restaurant peut déclencher un
// remboursement (même contrôle que hubrise-connect).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { FlatpayProvider, loadFlatpayConfigFromEnv } from "../_shared/flatpay.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { order_id, amount } = await req.json();
    if (!order_id) return json({ error: "missing_order_id" }, 400);

    const authHeader = req.headers.get("Authorization") ?? "";
    const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: "not_authenticated" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: attempt } = await admin
      .from("payment_attempts")
      .select("id, restaurant_id, provider_payment_id, status, amount")
      .eq("order_id", order_id)
      .eq("provider", "flatpay")
      .maybeSingle();
    if (!attempt) return json({ error: "no_flatpay_payment_for_order" }, 404);
    if (attempt.status !== "PAID") return json({ error: `payment_not_paid (status=${attempt.status})` }, 400);
    if (!attempt.provider_payment_id) return json({ error: "missing_provider_payment_id" }, 500);

    const { data: restaurant } = await admin
      .from("restaurants").select("owner_id").eq("id", attempt.restaurant_id).maybeSingle();
    if (!restaurant || restaurant.owner_id !== user.id) return json({ error: "not_authorized" }, 403);

    const connection = await admin
      .from("payment_connections").select("api_key, environment").eq("restaurant_id", attempt.restaurant_id).maybeSingle();
    const config = loadFlatpayConfigFromEnv({
      get: (k) => {
        if (k === "FLATPAY_API_KEY" && connection.data?.api_key) return connection.data.api_key;
        if (k === "FLATPAY_ENVIRONMENT" && connection.data?.environment) return connection.data.environment;
        return Deno.env.get(k) ?? undefined;
      },
    });
    if (!config) return json({ error: "flatpay_not_configured" }, 400);

    const refundAmount = typeof amount === "number" && amount > 0 ? Math.min(amount, Number(attempt.amount)) : undefined;
    const result = await new FlatpayProvider(config).refundPayment(attempt.provider_payment_id, refundAmount);

    await admin.from("payment_events").insert({
      restaurant_id: attempt.restaurant_id, payment_attempt_id: attempt.id,
      direction: "outbound", action: "refund", ok: result.ok,
      message: result.ok ? `remboursement ${refundAmount ?? attempt.amount}€ (${result.providerRefundId ?? "?"})` : result.error,
    });

    if (!result.ok) return json({ error: result.error ?? "refund_failed" }, 502);
    return json({ refunded: true, provider_refund_id: result.providerRefundId ?? null });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

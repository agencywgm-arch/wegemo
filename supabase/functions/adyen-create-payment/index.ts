// adyen-create-payment — ouvre une tentative de paiement Adyen (lien de
// paiement hébergé). Même principe que flatpay-create-payment :
//   - le montant est recalculé serveur (price_cart_secure), jamais celui du navigateur ;
//   - les suppléments sont reconstruits depuis la carte en base (cart_options.ts) ;
//   - aucune commande n'est créée ici : seulement une ligne payment_attempts,
//     la commande naît quand le webhook signé AUTHORISATION arrive.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { AdyenProvider, loadAdyenConfig } from "../_shared/adyen.ts";
import { CartOptionsError, sanitizeCartItems } from "../_shared/cart_options.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const {
      restaurant_id, table_id, order_type = "dine_in", covers = 1, session_id = null,
      items, promo_code = null, customer_name = "", customer_email = "", note = "",
      client_token, return_base_url,
    } = await req.json();

    if (!restaurant_id || !table_id || !client_token || !Array.isArray(items) || items.length === 0) {
      return json({ error: "missing_params" }, 400);
    }
    if (!return_base_url || typeof return_base_url !== "string") {
      return json({ error: "missing_return_base_url" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: existing } = await admin
      .from("payment_attempts").select("*")
      .eq("restaurant_id", restaurant_id).eq("client_token", client_token).maybeSingle();
    if (existing) {
      if (existing.status === "PAYMENT_PROCESSING" && existing.checkout_url) {
        return json({ payment_attempt_id: existing.id, redirect_url: existing.checkout_url, amount: existing.amount });
      }
      if (existing.status !== "PENDING_PAYMENT") {
        return json({ error: `payment_attempt_already_${existing.status.toLowerCase()}` }, 409);
      }
    }

    const { data: connection } = await admin
      .from("payment_connections")
      .select("provider, status, api_key, merchant_account, environment, live_url_prefix, hmac_key")
      .eq("restaurant_id", restaurant_id).maybeSingle();
    const config = connection?.provider === "adyen" && connection?.status === "connected"
      ? loadAdyenConfig(connection) : null;
    if (!config) return json({ error: "adyen_not_configured" }, 400);

    // --- Panier assaini : prix/groupes des options pris en base ---
    const ids = [...new Set(items.map((i: any) => i?.menu_item_id).filter(Boolean))];
    const { data: dbItems, error: dbError } = await admin
      .from("menu_items").select("id, supplements")
      .eq("restaurant_id", restaurant_id).in("id", ids);
    if (dbError) return json({ error: dbError.message }, 500);
    let cart;
    try {
      cart = sanitizeCartItems(items, dbItems ?? []);
    } catch (e) {
      if (e instanceof CartOptionsError) return json({ error: e.message || e.code, code: e.code }, 400);
      throw e;
    }

    const { data: priced, error: priceError } = await admin.rpc("price_cart_secure", {
      p_restaurant: restaurant_id, p_items: cart, p_promo_code: promo_code,
    });
    if (priceError) return json({ error: `pricing_failed: ${priceError.message}` }, 400);
    const amount = Number(priced.total);
    if (!(amount > 0)) return json({ error: "invalid_amount" }, 400);

    let attemptId: string;
    if (existing) {
      attemptId = existing.id;
      await admin.from("payment_attempts").update({ amount, cart_items: cart }).eq("id", attemptId);
    } else {
      const { data: row, error: insertError } = await admin
        .from("payment_attempts")
        .insert({
          restaurant_id, table_id, session_id, order_type, covers,
          customer_name, customer_email, note, promo_code,
          cart_items: cart, provider: "adyen", status: "PENDING_PAYMENT",
          amount, currency: "eur", client_token,
        })
        .select("id").single();
      if (insertError) return json({ error: insertError.message }, 500);
      attemptId = row.id as string;
    }

    const base = return_base_url.replace(/\/+$/, "");
    try {
      const created = await new AdyenProvider(config).createPayment({
        amount, currency: "eur", reference: attemptId,
        description: `Commande WGM — ${attemptId.slice(0, 8)}`,
        successUrl: `${base}/payment/success?attempt=${attemptId}&provider=adyen`,
        cancelUrl: `${base}/payment/cancel?attempt=${attemptId}&provider=adyen`,
      });
      await admin.from("payment_attempts").update({
        provider_payment_id: created.providerPaymentId, status: "PAYMENT_PROCESSING",
        checkout_url: created.redirectUrl,
      }).eq("id", attemptId);
      await admin.from("payment_events").insert({
        restaurant_id, payment_attempt_id: attemptId, direction: "outbound", action: "create",
        ok: true, message: `lien de paiement Adyen créé: ${created.providerPaymentId}`,
      });
      return json({ payment_attempt_id: attemptId, redirect_url: created.redirectUrl, amount });
    } catch (e) {
      const message = String((e as Error)?.message ?? e);
      await admin.from("payment_attempts").update({ status: "PAYMENT_FAILED", last_status_detail: message }).eq("id", attemptId);
      await admin.from("payment_events").insert({
        restaurant_id, payment_attempt_id: attemptId, direction: "outbound", action: "create", ok: false, message,
      });
      return json({ error: message }, 502);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

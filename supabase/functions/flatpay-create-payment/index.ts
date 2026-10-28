// flatpay-create-payment — ouvre une tentative de paiement Flatpay pour un
// panier client. Symétrique de create-payment-intent (Stripe) mais :
//
//   - le montant n'est JAMAIS pris du corps de la requête : il est recalculé
//     serveur via price_cart_secure() à partir du panier envoyé ;
//   - aucune commande WGM n'est créée ici — seulement une ligne
//     payment_attempts (voir migration_flatpay.sql pour le pourquoi fiscal) ;
//   - le client est redirigé vers l'URL de paiement hébergée renvoyée par
//     Flatpay, pas de formulaire de carte embarqué côté Wegemo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { FlatpayProvider, loadFlatpayConfigFromEnv } from "../_shared/flatpay.ts";

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

    // Idempotence : un double-tap sur "Payer" (ou une reprise réseau) doit
    // réutiliser la tentative déjà ouverte plutôt que d'en créer une seconde
    // et de facturer deux fois.
    const { data: existing } = await admin
      .from("payment_attempts")
      .select("*")
      .eq("restaurant_id", restaurant_id)
      .eq("client_token", client_token)
      .maybeSingle();
    if (existing) {
      if (existing.status === "PAYMENT_PROCESSING" && existing.checkout_url) {
        // Paiement déjà créé chez Flatpay : on renvoie la même URL de
        // checkout plutôt que d'en ouvrir un second (double facturation).
        return json({ payment_attempt_id: existing.id, redirect_url: existing.checkout_url, amount: existing.amount });
      }
      if (existing.status !== "PENDING_PAYMENT") {
        return json({ error: `payment_attempt_already_${existing.status.toLowerCase()}` }, 409);
      }
      // PENDING_PAYMENT sans checkout_url : l'appel Flatpay précédent n'a
      // jamais abouti (crash, timeout). On continue avec cette même ligne
      // plutôt que d'en créer une nouvelle pour le même client_token.
    }

    const connection = await admin
      .from("payment_connections")
      .select("api_key, environment, status")
      .eq("restaurant_id", restaurant_id)
      .maybeSingle();
    const config = loadFlatpayConfigFromEnv({
      get: (k) => {
        // Priorité aux credentials par restaurant (payment_connections) sur
        // le fallback global (variables d'environnement de la fonction) —
        // utile tant qu'il n'y a qu'un restaurant, prêt pour plusieurs.
        if (k === "FLATPAY_API_KEY" && connection.data?.api_key) return connection.data.api_key;
        if (k === "FLATPAY_ENVIRONMENT" && connection.data?.environment) return connection.data.environment;
        return Deno.env.get(k) ?? undefined;
      },
    });
    if (!config || connection.data?.status !== "connected") {
      return json({ error: "flatpay_not_configured" }, 400);
    }

    // --- Montant : recalculé serveur, jamais celui envoyé par le navigateur ---
    const { data: priced, error: priceError } = await admin.rpc("price_cart_secure", {
      p_restaurant: restaurant_id, p_items: items, p_promo_code: promo_code,
    });
    if (priceError) {
      const msg = priceError.message || "";
      if (msg.includes("rupture_stock") || msg.includes("article_")) return json({ error: msg }, 400);
      return json({ error: `pricing_failed: ${msg}` }, 400);
    }
    const amount = Number(priced.total);
    if (!(amount > 0)) return json({ error: "invalid_amount" }, 400);

    let attemptId: string;
    if (existing) {
      attemptId = existing.id;
      // Le prix peut avoir changé depuis la 1re tentative avortée (menu
      // modifié entre-temps) : on relit le montant à jour.
      await admin.from("payment_attempts").update({ amount }).eq("id", attemptId);
    } else {
      const { data: attemptRow, error: insertError } = await admin
        .from("payment_attempts")
        .insert({
          restaurant_id, table_id, session_id, order_type, covers,
          customer_name, customer_email, note, promo_code,
          cart_items: items, provider: "flatpay", status: "PENDING_PAYMENT",
          amount, currency: "eur", client_token,
        })
        .select("id")
        .single();
      if (insertError) return json({ error: insertError.message }, 500);
      attemptId = attemptRow.id as string;
    }
    const provider = new FlatpayProvider(config);

    const base = return_base_url.replace(/\/+$/, "");
    try {
      const created = await provider.createPayment({
        amount, currency: "eur", reference: attemptId,
        description: `Commande WGM — ${attemptId.slice(0, 8)}`,
        successUrl: `${base}/payment/success?attempt=${attemptId}`,
        cancelUrl: `${base}/payment/cancel?attempt=${attemptId}`,
        webhookUrl: Deno.env.get("FLATPAY_WEBHOOK_URL") || undefined,
      });

      await admin.from("payment_attempts").update({
        provider_payment_id: created.providerPaymentId, status: "PAYMENT_PROCESSING",
        checkout_url: created.redirectUrl,
      }).eq("id", attemptId);
      await admin.from("payment_events").insert({
        restaurant_id, payment_attempt_id: attemptId, direction: "outbound", action: "create",
        ok: true, message: `paiement créé chez Flatpay: ${created.providerPaymentId}`,
      });

      return json({ payment_attempt_id: attemptId, redirect_url: created.redirectUrl, amount });
    } catch (e) {
      const message = String((e as Error)?.message ?? e);
      await admin.from("payment_attempts").update({ status: "PAYMENT_FAILED", last_status_detail: message }).eq("id", attemptId);
      await admin.from("payment_events").insert({
        restaurant_id, payment_attempt_id: attemptId, direction: "outbound", action: "create",
        ok: false, message,
      });
      return json({ error: message }, 502);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});


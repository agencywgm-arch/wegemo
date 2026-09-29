// Finalisation d'un paiement Flatpay — code PARTAGÉ entre flatpay-payment-status
// (appelé par le retour client sur /payment/success) et flatpay-webhook
// (notification serveur Flatpay). Les deux chemins peuvent arriver dans
// n'importe quel ordre, voire être appelés plusieurs fois chacun (webhook
// rejoué, utilisateur qui recharge /payment/success) : toute la logique est
// donc idempotente par construction plutôt que par un simple flag "déjà
// traité".
//
// Règle d'or : le statut PAID n'est écrit qu'après relecture du statut RÉEL
// auprès de Flatpay (jamais sur la seule foi du retour navigateur), et la
// commande WGM (create_order_secure, numéro fiscal inclus) n'est créée
// QU'À CE MOMENT — jamais avant.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { PaymentProvider } from "./payment_provider.ts";

export interface FinalizeResult {
  status: "PAID" | "PAYMENT_PROCESSING" | "PAYMENT_FAILED" | "PAYMENT_CANCELLED";
  orderId: string | null;
  fiscalNumber?: string | null;
  total?: number | null;
  error?: string;
}

export async function finalizePaymentAttempt(
  admin: SupabaseClient,
  provider: PaymentProvider,
  attemptId: string,
  source: "status_check" | "webhook",
): Promise<FinalizeResult> {
  const { data: attempt } = await admin
    .from("payment_attempts")
    .select("*")
    .eq("id", attemptId)
    .maybeSingle();

  if (!attempt) return { status: "PAYMENT_FAILED", orderId: null, error: "payment_attempt_introuvable" };

  // Déjà finalisé (paiement confirmé ET commande créée) : idempotence totale,
  // qu'on soit rappelés par le webhook ou par un rechargement de la page de
  // retour. On ne rappelle même pas Flatpay.
  if (attempt.status === "PAID" && attempt.order_id) {
    const { data: order } = await admin
      .from("orders")
      .select("fiscal_number, total")
      .eq("id", attempt.order_id)
      .maybeSingle();
    return { status: "PAID", orderId: attempt.order_id, fiscalNumber: order?.fiscal_number, total: order?.total };
  }

  // Statuts terminaux non-payés : rien à revérifier auprès de Flatpay, la
  // décision est déjà prise et ne doit pas être rejouée.
  if (attempt.status === "PAYMENT_FAILED" || attempt.status === "PAYMENT_CANCELLED") {
    return { status: attempt.status, orderId: null };
  }

  if (!attempt.provider_payment_id) {
    return { status: "PAYMENT_PROCESSING", orderId: null, error: "provider_payment_id_absent" };
  }

  let live;
  try {
    live = await provider.getPaymentStatus(attempt.provider_payment_id);
  } catch (e) {
    await logEvent(admin, attempt, source, "status", false, undefined, String((e as Error)?.message ?? e));
    // Panne réseau/API côté Flatpay : on laisse la tentative en l'état
    // (PAYMENT_PROCESSING) plutôt que de la marquer échouée à tort — un
    // prochain appel (webhook ou nouveau check) retentera.
    return { status: "PAYMENT_PROCESSING", orderId: null, error: "flatpay_unreachable" };
  }

  await logEvent(admin, attempt, source, "status", true, undefined, `statut Flatpay: ${live.rawStatus ?? live.status}`);

  if (live.status === "failed") {
    await admin.from("payment_attempts").update({ status: "PAYMENT_FAILED", last_status_detail: live.rawStatus ?? null }).eq("id", attempt.id);
    return { status: "PAYMENT_FAILED", orderId: null };
  }
  if (live.status === "cancelled") {
    await admin.from("payment_attempts").update({ status: "PAYMENT_CANCELLED", last_status_detail: live.rawStatus ?? null }).eq("id", attempt.id);
    return { status: "PAYMENT_CANCELLED", orderId: null };
  }
  if (live.status !== "paid") {
    // "processing" côté Flatpay : rien à faire de plus pour l'instant.
    await admin.from("payment_attempts").update({ status: "PAYMENT_PROCESSING", last_status_detail: live.rawStatus ?? null }).eq("id", attempt.id);
    return { status: "PAYMENT_PROCESSING", orderId: null };
  }

  // --- Paiement confirmé payé : vérifier montant/devise avant de créer quoi
  // que ce soit. Un écart ici est une anomalie sérieuse (bug côté Flatpay,
  // ou tentative de manipulation) — on ne crée jamais la commande dans ce cas.
  if (live.amount != null && Math.abs(live.amount - Number(attempt.amount)) > 0.01) {
    await logEvent(admin, attempt, source, "status", false, undefined,
      `montant Flatpay (${live.amount}) ≠ montant attendu (${attempt.amount})`);
    return { status: "PAYMENT_PROCESSING", orderId: null, error: "montant_incoherent" };
  }
  if (live.currency && live.currency !== attempt.currency) {
    await logEvent(admin, attempt, source, "status", false, undefined,
      `devise Flatpay (${live.currency}) ≠ devise attendue (${attempt.currency})`);
    return { status: "PAYMENT_PROCESSING", orderId: null, error: "devise_incoherente" };
  }

  // Marque PAID avant de créer la commande, avec une condition WHERE qui
  // n'autorise la transition que depuis un état non-terminal : si deux
  // appels concurrents (webhook + status-check quasi simultanés) arrivent
  // ici en même temps, un seul gagne la mise à jour et donc l'appel à
  // create_order_secure qui suit.
  const { data: claimed } = await admin
    .from("payment_attempts")
    .update({ status: "PAID", last_status_detail: live.rawStatus ?? null })
    .eq("id", attempt.id)
    .in("status", ["PENDING_PAYMENT", "PAYMENT_PROCESSING"])
    .select("id")
    .maybeSingle();

  if (!claimed) {
    // Un autre appel a gagné la course entre-temps : relire le résultat final.
    const { data: fresh } = await admin.from("payment_attempts").select("order_id").eq("id", attempt.id).maybeSingle();
    if (fresh?.order_id) {
      const { data: order } = await admin.from("orders").select("fiscal_number, total").eq("id", fresh.order_id).maybeSingle();
      return { status: "PAID", orderId: fresh.order_id, fiscalNumber: order?.fiscal_number, total: order?.total };
    }
    return { status: "PAYMENT_PROCESSING", orderId: null };
  }

  // create_order_secure utilise client_token pour l'idempotence : si cette
  // ligne était rejouée après un crash entre l'update ci-dessus et l'appel
  // RPC, le même client_token renvoie la commande déjà créée au lieu d'en
  // ouvrir une seconde.
  const { data: res, error } = await admin.rpc("create_order_secure", {
    p_restaurant: attempt.restaurant_id,
    p_table: attempt.table_id,
    p_order_type: attempt.order_type,
    p_payment_method: "card",
    p_payment_mode: "online_flatpay",
    p_customer_name: attempt.customer_name,
    p_customer_email: attempt.customer_email,
    p_note: attempt.note,
    p_promo_code: attempt.promo_code,
    p_items: attempt.cart_items,
    p_client_token: attempt.client_token,
    p_covers: attempt.covers,
    p_session_id: attempt.session_id,
  });

  if (error) {
    await logEvent(admin, attempt, source, "webhook", false, undefined, `create_order_secure a échoué après paiement confirmé: ${error.message}`);
    // Le paiement RESTE marqué PAID (l'argent est bien chez le restaurant) —
    // mais order_id reste null : ça doit être visible et traité manuellement
    // (article devenu indisponible entre-temps, etc). On ne fait jamais
    // disparaître un paiement confirmé.
    return { status: "PAID", orderId: null, error: `order_creation_failed: ${error.message}` };
  }

  await admin.from("payment_attempts").update({ order_id: res.order_id }).eq("id", attempt.id);
  await logEvent(admin, attempt, source, "webhook", true, undefined, `commande créée: ${res.order_id} (${res.fiscal_number})`);

  return { status: "PAID", orderId: res.order_id, fiscalNumber: res.fiscal_number, total: res.total };
}

async function logEvent(
  admin: SupabaseClient,
  attempt: { id: string; restaurant_id: string },
  source: "status_check" | "webhook",
  action: string,
  ok: boolean,
  httpStatus: number | undefined,
  message: string,
) {
  await admin.from("payment_events").insert({
    restaurant_id: attempt.restaurant_id,
    payment_attempt_id: attempt.id,
    direction: source === "webhook" ? "inbound" : "outbound",
    action,
    ok,
    http_status: httpStatus ?? null,
    message: message?.slice(0, 500) ?? null,
  });
}

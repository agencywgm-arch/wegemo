// Abstraction commune à tous les providers de paiement en ligne.
//
// Stripe n'implémente PAS cette interface aujourd'hui — son flux
// (create-payment-intent + Stripe Elements côté client) reste tel quel,
// volontairement non touché. Cette interface documente comment il s'y
// insérerait conceptuellement (voir le commentaire en bas de fichier) et sert
// d'implémentation réelle pour Flatpay (flatpay.ts).
//
// Le reste de Wegemo (les edge functions flatpay-*) ne dépend que de ces
// types, jamais des détails HTTP/format Flatpay.

export interface CreatePaymentParams {
  /** Montant en unité principale (euros), calculé SERVEUR (price_cart_secure). */
  amount: number;
  /** Toujours "eur" pour l'instant — le paramètre existe pour ne pas re-migrer plus tard. */
  currency: string;
  /** Référence unique WGM pour cette tentative — sert à la réconciliation et à l'idempotence côté provider. */
  reference: string;
  /** Libellé court affiché côté provider (ex: nom du restaurant + table). */
  description: string;
  /** URL de retour client après paiement, avec le statut en dernier segment. */
  successUrl: string;
  cancelUrl: string;
  /** URL de webhook/callback serveur, si le provider le supporte. */
  webhookUrl?: string;
}

export interface CreatePaymentResult {
  /** Identifiant du paiement chez le provider — stocké dans payment_attempts.provider_payment_id. */
  providerPaymentId: string;
  /** URL vers laquelle rediriger le client pour payer (checkout hébergé). */
  redirectUrl: string;
  /** Statut initial tel que rapporté par le provider, brut (pour les logs). */
  rawStatus?: string;
}

export type NormalizedPaymentStatus = "processing" | "paid" | "failed" | "cancelled";

export interface PaymentStatusResult {
  status: NormalizedPaymentStatus;
  /** Montant confirmé par le provider, pour recoupement avec payment_attempts.amount. */
  amount?: number;
  currency?: string;
  rawStatus?: string;
}

export interface RefundResult {
  ok: boolean;
  providerRefundId?: string;
  error?: string;
}

export interface PaymentProvider {
  readonly name: string;
  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;
  getPaymentStatus(providerPaymentId: string): Promise<PaymentStatusResult>;
  refundPayment(providerPaymentId: string, amount?: number): Promise<RefundResult>;
}

// ---------------------------------------------------------------------------
// Où Stripe s'insérerait dans cette abstraction (non implémenté ici) :
//
//   createPayment    → Stripe PaymentIntents API (déjà fait par
//                       create-payment-intent, mais renvoie un client_secret
//                       pour Stripe Elements plutôt qu'une redirectUrl —
//                       Stripe est intégré "embedded", Flatpay "hosted
//                       redirect". Un StripeProvider unifié nécessiterait de
//                       migrer vers Stripe Checkout Sessions ; hors scope
//                       tant que Stripe fonctionne et n'est pas cassé.)
//   getPaymentStatus → GET /v1/payment_intents/{id}
//   refundPayment    → POST /v1/refunds
// ---------------------------------------------------------------------------

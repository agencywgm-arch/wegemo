// Client Flatpay — implémentation de PaymentProvider.
//
// IMPORTANT — lire avant de toucher ce fichier :
//
// Flatpay ne publie pas de portail développeur/référence API publique pour
// son offre paiement en ligne (recherché le 2026-09-29 — voir FLATPAY_INTEGRATION.md
// pour le détail de la recherche). Leur solution "Online payments" est bâtie
// sur la plateforme Frisbii (ex-Billwerk+), qui elle a une vraie doc OpenAPI
// (docs.frisbii.com / docs.frisbii-transform.com), mais l'accès à cette doc
// depuis cet environnement d'exécution était bloqué par la politique réseau
// du sandbox (egress proxy, 403) — impossible donc de lire les noms de champs
// exacts, les chemins d'endpoint exacts, ou le mécanisme précis de signature
// des webhooks.
//
// Conséquence : AUCUN chemin d'endpoint n'est codé en dur ici. Tout est lu
// depuis des variables d'environnement (voir la section CONFIG ci-dessous),
// donc rien ne casse silencieusement — si une variable manque, on obtient une
// erreur explicite ("flatpay_not_configured: ..."), jamais un appel vers une
// URL inventée. Le corps de requête utilise la forme la plus standard pour ce
// type d'API (paiement hébergé par redirection : montant, devise, référence,
// success/cancel/webhook URLs) — à confronter et ajuster contre la vraie doc
// Frisbii avant le premier vrai paiement. Chaque endroit concerné est marqué
// "CONFIRM:" ci-dessous.
import type {
  CreatePaymentParams,
  CreatePaymentResult,
  NormalizedPaymentStatus,
  PaymentProvider,
  PaymentStatusResult,
  RefundResult,
} from "./payment_provider.ts";

export interface FlatpayConfig {
  /** Base URL de l'API — ex: https://api.frisbii.com ou l'URL fournie par Flatpay à l'activation. */
  apiBaseUrl: string;
  apiKey: string;
  environment: "test" | "production";
  /** CONFIRM: chemin exact de création de paiement (doc Frisbii /reference). */
  createPaymentPath: string;
  /** CONFIRM: chemin de lecture de statut — {id} est remplacé par providerPaymentId. */
  getPaymentPathTemplate: string;
  /** CONFIRM: chemin de remboursement — {id} est remplacé par providerPaymentId. */
  refundPathTemplate: string;
}

export function loadFlatpayConfigFromEnv(env: {
  get(key: string): string | undefined;
}): FlatpayConfig | null {
  const apiBaseUrl = env.get("FLATPAY_API_BASE_URL") ?? "";
  const apiKey = env.get("FLATPAY_API_KEY") ?? "";
  if (!apiBaseUrl || !apiKey) return null;
  const environment = (env.get("FLATPAY_ENVIRONMENT") ?? "test") as "test" | "production";
  return {
    apiBaseUrl: apiBaseUrl.replace(/\/+$/, ""),
    apiKey,
    environment,
    // CONFIRM: valeurs par défaut plausibles (REST générique), à écraser via
    // env dès que la doc réelle est consultée — aucun besoin de redéployer de
    // code pour corriger, seulement les secrets Supabase.
    createPaymentPath: env.get("FLATPAY_CREATE_PAYMENT_PATH") ?? "/v1/payments",
    getPaymentPathTemplate: env.get("FLATPAY_GET_PAYMENT_PATH") ?? "/v1/payments/{id}",
    refundPathTemplate: env.get("FLATPAY_REFUND_PATH") ?? "/v1/payments/{id}/refund",
  };
}

/** Construit le corps de la requête de création de paiement. Fonction pure — testée sans réseau. */
export function buildCreatePaymentBody(params: CreatePaymentParams): Record<string, unknown> {
  return {
    // CONFIRM: noms de champs exacts attendus par Frisbii/Flatpay.
    amount: Math.round(params.amount * 100), // hypothèse : plus petite unité (centimes), comme Stripe. CONFIRM.
    currency: params.currency.toUpperCase(),
    reference: params.reference,
    description: params.description,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    ...(params.webhookUrl ? { webhook_url: params.webhookUrl } : {}),
  };
}

/** Extrait providerPaymentId + redirectUrl d'une réponse de création. Fonction pure. */
export function parseCreatePaymentResponse(body: Record<string, unknown>): CreatePaymentResult {
  // CONFIRM: noms de champs exacts de la réponse Frisbii/Flatpay.
  const id = (body.id ?? body.payment_id ?? body.handle) as string | undefined;
  const redirectUrl = (body.redirect_url ?? body.checkout_url ?? body.url) as string | undefined;
  if (!id || !redirectUrl) {
    throw new Error(`flatpay_unexpected_response: champs id/redirect_url absents — ${JSON.stringify(body).slice(0, 300)}`);
  }
  return { providerPaymentId: id, redirectUrl, rawStatus: body.status as string | undefined };
}

/** Normalise un statut brut Flatpay vers notre enum interne. Fonction pure, testée exhaustivement. */
export function mapProviderStatus(rawStatus: string | undefined | null): NormalizedPaymentStatus {
  // CONFIRM: valeurs exactes retournées par Frisbii/Flatpay — mapping large
  // sur des synonymes usuels en attendant. Toute valeur inconnue est traitée
  // comme "processing" (jamais comme "paid" par défaut : on ne doit jamais
  // marquer payé par excès de confiance sur un statut non reconnu).
  const s = (rawStatus ?? "").toLowerCase();
  if (["paid", "captured", "succeeded", "completed", "authorized_and_captured"].includes(s)) return "paid";
  if (["failed", "declined", "error", "rejected"].includes(s)) return "failed";
  if (["cancelled", "canceled", "expired", "voided"].includes(s)) return "cancelled";
  return "processing";
}

export function parseStatusResponse(body: Record<string, unknown>): PaymentStatusResult {
  const rawStatus = (body.status ?? body.state) as string | undefined;
  const amountRaw = body.amount as number | undefined;
  return {
    status: mapProviderStatus(rawStatus),
    amount: typeof amountRaw === "number" ? amountRaw / 100 : undefined, // CONFIRM: unité (centimes ?)
    currency: typeof body.currency === "string" ? (body.currency as string).toLowerCase() : undefined,
    rawStatus,
  };
}

// ---------------------------------------------------------------------------
// Signature de webhook — CONFIRM: Flatpay/Frisbii peut utiliser HMAC-SHA256
// sur le corps brut (comme HubRise, voir _shared/hubrise.ts) ou un autre
// mécanisme (secret partagé en en-tête, signature asymétrique...). Cette
// implémentation suppose HMAC-SHA256 sur le corps brut avec le secret
// FLATPAY_WEBHOOK_SECRET, signature en hexadécimal dans l'en-tête indiqué par
// FLATPAY_WEBHOOK_SIGNATURE_HEADER — schéma le plus répandu chez les
// providers de paiement (Stripe, HubRise, la plupart des PSP européens).
// Si Flatpay documente autre chose, seule cette fonction doit changer.
export async function verifyFlatpaySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader || !secret) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
    const expectedHex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const expectedB64 = btoa(String.fromCharCode(...new Uint8Array(mac)));
    // Accepte hex OU base64 pour ne pas dépendre d'un choix qu'on ne peut pas
    // confirmer — la comparaison reste en temps constant pour chaque essai.
    return timingSafeEqual(signatureHeader, expectedHex) || timingSafeEqual(signatureHeader, expectedB64);
  } catch {
    return false;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Implémentation PaymentProvider
// ---------------------------------------------------------------------------
export class FlatpayProvider implements PaymentProvider {
  readonly name = "flatpay";
  private config: FlatpayConfig;
  constructor(config: FlatpayConfig) {
    this.config = config;
  }

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const res = await fetch(this.config.apiBaseUrl + this.config.createPaymentPath, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`, // CONFIRM: schéma d'auth (Bearer ? Basic ? en-tête custom ?)
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildCreatePaymentBody(params)),
    });
    const raw = await res.text();
    let body: Record<string, unknown> = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { /* pas du JSON */ }
    if (!res.ok) {
      const detail = (body.error as string) ?? (body.message as string) ?? raw.slice(0, 300) ?? `http_${res.status}`;
      throw new Error(`flatpay_create_payment_failed: ${detail}`);
    }
    return parseCreatePaymentResponse(body);
  }

  async getPaymentStatus(providerPaymentId: string): Promise<PaymentStatusResult> {
    const path = this.config.getPaymentPathTemplate.replace("{id}", encodeURIComponent(providerPaymentId));
    const res = await fetch(this.config.apiBaseUrl + path, {
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
    });
    const raw = await res.text();
    let body: Record<string, unknown> = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { /* pas du JSON */ }
    if (!res.ok) {
      throw new Error(`flatpay_get_status_failed: ${(body.error as string) ?? raw.slice(0, 300) ?? `http_${res.status}`}`);
    }
    return parseStatusResponse(body);
  }

  async refundPayment(providerPaymentId: string, amount?: number): Promise<RefundResult> {
    const path = this.config.refundPathTemplate.replace("{id}", encodeURIComponent(providerPaymentId));
    const res = await fetch(this.config.apiBaseUrl + path, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      // CONFIRM: remboursement partiel supporté ? nom du champ montant ?
      body: JSON.stringify(amount != null ? { amount: Math.round(amount * 100) } : {}),
    });
    const raw = await res.text();
    let body: Record<string, unknown> = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { /* pas du JSON */ }
    if (!res.ok) {
      return { ok: false, error: (body.error as string) ?? raw.slice(0, 300) ?? `http_${res.status}` };
    }
    return { ok: true, providerRefundId: (body.id ?? body.refund_id) as string | undefined };
  }
}

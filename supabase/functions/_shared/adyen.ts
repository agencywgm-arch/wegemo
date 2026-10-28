// Client Adyen — implémentation de PaymentProvider via les « liens de paiement »
// (Pay by Link, POST /paymentLinks) : le client est redirigé vers une page de
// paiement hébergée par Adyen (carte, Apple Pay / Google Pay selon l'appareil
// et ce qui est activé sur le compte), puis revient sur Wegemo.
//
// Règle de sécurité centrale : un paiement n'est considéré PAYÉ que sur la
// foi d'une notification (webhook) signée HMAC par Adyen — jamais sur le seul
// retour du navigateur, ni sur le statut du lien (voir getPaymentStatus).
//
// Références API (Checkout API v71) :
//   POST {base}/paymentLinks               création du lien
//   GET  {base}/paymentLinks/{id}          statut du lien
//   POST {base}/payments/{psp}/refunds     remboursement
//   Test : https://checkout-test.adyen.com/v71
//   Live : https://{PREFIXE}-checkout-live.adyenpayments.com/checkout/v71
//          (PREFIXE affiché dans Customer Area > Developers > API URLs)
import type {
  CreatePaymentParams,
  CreatePaymentResult,
  PaymentProvider,
  PaymentStatusResult,
  RefundResult,
} from "./payment_provider.ts";

export interface AdyenConfig {
  apiKey: string;
  merchantAccount: string;
  environment: "test" | "production";
  /** Préfixe d'URL live (requis en production). */
  liveUrlPrefix?: string;
  /** Clé HMAC du webhook standard (64 caractères hexadécimaux). */
  hmacKey?: string;
}

const MERCHANT_RE = /^[A-Za-z0-9_-]{1,80}$/;
const PREFIX_RE = /^[A-Za-z0-9-]{1,80}$/;

export function isValidMerchantAccount(v: unknown): v is string {
  return typeof v === "string" && MERCHANT_RE.test(v);
}
export function isValidLiveUrlPrefix(v: unknown): v is string {
  return typeof v === "string" && PREFIX_RE.test(v);
}
export function isValidHmacKey(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-fA-F]{64}$/.test(v);
}

export function checkoutBaseUrl(cfg: Pick<AdyenConfig, "environment" | "liveUrlPrefix">): string {
  if (cfg.environment === "test") return "https://checkout-test.adyen.com/v71";
  if (!isValidLiveUrlPrefix(cfg.liveUrlPrefix)) throw new Error("adyen_live_url_prefix_missing");
  return `https://${cfg.liveUrlPrefix}-checkout-live.adyenpayments.com/checkout/v71`;
}

/** Montant en unité principale (euros) -> unité mineure (centimes), entier. */
export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

export function loadAdyenConfig(row: {
  api_key?: string | null;
  merchant_account?: string | null;
  environment?: string | null;
  live_url_prefix?: string | null;
  hmac_key?: string | null;
} | null | undefined): AdyenConfig | null {
  if (!row?.api_key || !isValidMerchantAccount(row.merchant_account)) return null;
  const environment = row.environment === "production" ? "production" : "test";
  return {
    apiKey: row.api_key,
    merchantAccount: row.merchant_account,
    environment,
    liveUrlPrefix: row.live_url_prefix ?? undefined,
    hmacKey: row.hmac_key ?? undefined,
  };
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function buildPaymentLinkBody(cfg: AdyenConfig, p: CreatePaymentParams, now = Date.now(), ttlMinutes = 30) {
  return {
    reference: p.reference,
    amount: { currency: p.currency.toUpperCase(), value: toMinorUnits(p.amount) },
    merchantAccount: cfg.merchantAccount,
    description: p.description.slice(0, 200),
    returnUrl: p.successUrl,
    countryCode: "FR",
    shopperLocale: "fr-FR",
    expiresAt: new Date(now + ttlMinutes * 60_000).toISOString().replace(/\.\d{3}Z$/, "Z"),
  };
}

export class AdyenProvider implements PaymentProvider {
  readonly name = "adyen";
  private cfg: AdyenConfig;
  private fetchImpl: FetchLike;
  constructor(cfg: AdyenConfig, fetchImpl: FetchLike = fetch) {
    this.cfg = cfg;
    this.fetchImpl = fetchImpl;
  }

  private async call(method: "GET" | "POST", path: string, body?: unknown): Promise<{ status: number; data: any }> {
    const res = await this.fetchImpl(`${checkoutBaseUrl(this.cfg)}${path}`, {
      method,
      headers: { "X-API-Key": this.cfg.apiKey, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data: any = null;
    try { data = await res.json(); } catch { /* corps vide */ }
    return { status: res.status, data };
  }

  async createPayment(p: CreatePaymentParams): Promise<CreatePaymentResult> {
    const { status, data } = await this.call("POST", "/paymentLinks", buildPaymentLinkBody(this.cfg, p));
    if (status < 200 || status >= 300) {
      throw new Error(`adyen_http_${status}: ${data?.message ?? data?.errorCode ?? "création du lien refusée"}`);
    }
    if (!data?.id || !data?.url) throw new Error("adyen_reponse_invalide: id ou url du lien absent");
    return { providerPaymentId: String(data.id), redirectUrl: String(data.url), rawStatus: data.status };
  }

  // Le statut du lien ne suffit PAS à déclarer un paiement réussi (un lien
  // « completed » ne dit rien du montant ni de l'autorisation). Seule la
  // notification AUTHORISATION signée fait passer un paiement à « paid »
  // (voir adyen-webhook). Ici on ne détecte que l'expiration (→ annulé) ; tout
  // le reste reste « en cours » et sera tranché par le webhook.
  async getPaymentStatus(providerPaymentId: string): Promise<PaymentStatusResult> {
    const { status, data } = await this.call("GET", `/paymentLinks/${encodeURIComponent(providerPaymentId)}`);
    if (status < 200 || status >= 300) {
      throw new Error(`adyen_http_${status}: ${data?.message ?? "statut du lien indisponible"}`);
    }
    const raw = String(data?.status ?? "");
    if (raw === "expired") return { status: "cancelled", rawStatus: raw };
    return { status: "processing", rawStatus: raw };
  }

  async refundPayment(pspReference: string, amount?: number): Promise<RefundResult> {
    if (!(typeof amount === "number" && amount > 0)) return { ok: false, error: "adyen_refund_amount_required" };
    const { status, data } = await this.call("POST", `/payments/${encodeURIComponent(pspReference)}/refunds`, {
      merchantAccount: this.cfg.merchantAccount,
      amount: { currency: "EUR", value: toMinorUnits(amount) },
      reference: `refund-${pspReference}-${Date.now()}`,
    });
    if (status < 200 || status >= 300) return { ok: false, error: `adyen_http_${status}: ${data?.message ?? "remboursement refusé"}` };
    return { ok: true, providerRefundId: data?.pspReference };
  }

  /**
   * Vérifie que la clé API est acceptée : on interroge un lien inexistant.
   * 401/403 = clé ou droits invalides ; toute autre réponse HTTP (404, 422…)
   * prouve que l'authentification a réussi.
   */
  async checkCredentials(): Promise<{ ok: boolean; error?: string }> {
    try {
      const { status } = await this.call("GET", "/paymentLinks/PL_WEGEMO_CREDENTIAL_CHECK");
      if (status === 401 || status === 403) return { ok: false, error: `adyen_http_${status}: clé API refusée ou rôle « Checkout webservice » manquant` };
      if (status >= 500) return { ok: false, error: `adyen_http_${status}: Adyen indisponible` };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message ?? e) };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Notifications (webhook standard) — signature HMAC                   */
/* ------------------------------------------------------------------ */

export interface AdyenNotificationItem {
  pspReference?: string;
  originalReference?: string;
  merchantAccountCode?: string;
  merchantReference?: string;
  amount?: { value?: number; currency?: string };
  eventCode?: string;
  success?: string;
  reason?: string;
  additionalData?: { hmacSignature?: string; [k: string]: unknown };
}

/** Extrait les NotificationRequestItem du corps JSON du webhook. */
export function parseNotificationItems(body: any): AdyenNotificationItem[] {
  const list = Array.isArray(body?.notificationItems) ? body.notificationItems : [];
  return list.map((i: any) => i?.NotificationRequestItem).filter((i: unknown): i is AdyenNotificationItem => !!i && typeof i === "object");
}

// Chaîne signée par Adyen : champs séparés par « : », avec « \ » et « : »
// échappés par un « \ » dans chaque valeur.
export function hmacSigningString(item: AdyenNotificationItem): string {
  const esc = (v: unknown) => String(v ?? "").replace(/\\/g, "\\\\").replace(/:/g, "\\:");
  return [
    item.pspReference,
    item.originalReference ?? "",
    item.merchantAccountCode,
    item.merchantReference,
    item.amount?.value,
    item.amount?.currency,
    item.eventCode,
    item.success,
  ].map(esc).join(":");
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function computeAdyenHmac(item: AdyenNotificationItem, hmacKeyHex: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", hexToBytes(hmacKeyHex), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(hmacSigningString(item)));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

export async function verifyAdyenNotification(item: AdyenNotificationItem, hmacKeyHex: string | undefined): Promise<boolean> {
  const received = item?.additionalData?.hmacSignature;
  if (!received || !isValidHmacKey(hmacKeyHex)) return false;
  try {
    return timingSafeEqual(received, await computeAdyenHmac(item, hmacKeyHex));
  } catch {
    return false;
  }
}

/** Interprétation d'une notification AUTHORISATION déjà vérifiée. */
export function interpretAuthorisation(item: AdyenNotificationItem): {
  paid: boolean; amount?: number; currency?: string; pspReference?: string;
} {
  const paid = item.eventCode === "AUTHORISATION" && item.success === "true";
  return {
    paid,
    amount: typeof item.amount?.value === "number" ? item.amount.value / 100 : undefined,
    currency: item.amount?.currency ? item.amount.currency.toLowerCase() : undefined,
    pspReference: item.pspReference,
  };
}

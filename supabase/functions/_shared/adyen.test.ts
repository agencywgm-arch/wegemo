// Tests du client Adyen — aucun réseau : fetch est simulé.
//
//   node --experimental-strip-types --test supabase/functions/_shared/adyen.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AdyenProvider, buildPaymentLinkBody, checkoutBaseUrl, computeAdyenHmac, hmacSigningString,
  interpretAuthorisation, isValidHmacKey, loadAdyenConfig, parseNotificationItems, toMinorUnits,
  verifyAdyenNotification,
} from "./adyen.ts";
import type { AdyenConfig, AdyenNotificationItem } from "./adyen.ts";

const cfg: AdyenConfig = { apiKey: "AQE-secret", merchantAccount: "BaomaECOM", environment: "test" };

function fakeFetch(responses: Array<{ status: number; body?: unknown }>) {
  const calls: Array<{ url: string; init: any }> = [];
  const impl = async (url: string, init?: any) => {
    calls.push({ url, init });
    const r = responses.shift() ?? { status: 500 };
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status });
  };
  return { impl, calls };
}

/* ---------------- Signature HMAC : exemple de la doc Adyen ---------------- */

// Exemple publié par Adyen pour la vérification HMAC des notifications.
const DOC_KEY = "44782DEF547AAA06C910C43932B1EB0C71FC68D9D0C057550C48EC2ACF6BA056";
const DOC_ITEM: AdyenNotificationItem = {
  pspReference: "7914073381342284",
  originalReference: "",
  merchantAccountCode: "TestMerchant",
  merchantReference: "TestPayment-1407325143704",
  amount: { value: 1130, currency: "EUR" },
  eventCode: "AUTHORISATION",
  success: "true",
};

test("chaîne signée : champs dans l'ordre Adyen, séparés par ':'", () => {
  assert.equal(
    hmacSigningString(DOC_ITEM),
    "7914073381342284::TestMerchant:TestPayment-1407325143704:1130:EUR:AUTHORISATION:true",
  );
});

test("chaîne signée : « \\ » et « : » sont échappés", () => {
  const s = hmacSigningString({ ...DOC_ITEM, merchantReference: "a:b\\c" });
  assert.ok(s.includes("a\\:b\\\\c"));
});

test("HMAC : reproduit la signature de l'exemple de la documentation Adyen", async () => {
  assert.equal(await computeAdyenHmac(DOC_ITEM, DOC_KEY), "coqCmt/IZ4E3CzPvMY8zTjQVL5hYJUiBRg8UU+iCWo0=");
});

test("verifyAdyenNotification : signature valide acceptée", async () => {
  const item = { ...DOC_ITEM, additionalData: { hmacSignature: "coqCmt/IZ4E3CzPvMY8zTjQVL5hYJUiBRg8UU+iCWo0=" } };
  assert.equal(await verifyAdyenNotification(item, DOC_KEY), true);
});

test("verifyAdyenNotification : montant modifié → rejeté", async () => {
  const item = { ...DOC_ITEM, amount: { value: 1, currency: "EUR" }, additionalData: { hmacSignature: "coqCmt/IZ4E3CzPvMY8zTjQVL5hYJUiBRg8UU+iCWo0=" } };
  assert.equal(await verifyAdyenNotification(item, DOC_KEY), false);
});

test("verifyAdyenNotification : mauvaise clé, signature absente ou clé invalide → rejeté", async () => {
  const signed = { ...DOC_ITEM, additionalData: { hmacSignature: "coqCmt/IZ4E3CzPvMY8zTjQVL5hYJUiBRg8UU+iCWo0=" } };
  assert.equal(await verifyAdyenNotification(signed, "A".repeat(64)), false);
  assert.equal(await verifyAdyenNotification(DOC_ITEM, DOC_KEY), false);
  assert.equal(await verifyAdyenNotification(signed, undefined), false);
  assert.equal(await verifyAdyenNotification(signed, "pas-hex"), false);
});

test("isValidHmacKey : exactement 64 caractères hexadécimaux", () => {
  assert.equal(isValidHmacKey(DOC_KEY), true);
  assert.equal(isValidHmacKey(DOC_KEY.slice(1)), false);
  assert.equal(isValidHmacKey("Z".repeat(64)), false);
});

/* ---------------- Notifications ---------------- */

test("parseNotificationItems : extrait les NotificationRequestItem", () => {
  const items = parseNotificationItems({ live: "false", notificationItems: [{ NotificationRequestItem: DOC_ITEM }, {}, null] });
  assert.equal(items.length, 1);
  assert.equal(items[0].pspReference, "7914073381342284");
  assert.deepEqual(parseNotificationItems({}), []);
});

test("interpretAuthorisation : seul AUTHORISATION + success=true est payé", () => {
  assert.deepEqual(interpretAuthorisation(DOC_ITEM), { paid: true, amount: 11.3, currency: "eur", pspReference: "7914073381342284" });
  assert.equal(interpretAuthorisation({ ...DOC_ITEM, success: "false" }).paid, false);
  assert.equal(interpretAuthorisation({ ...DOC_ITEM, eventCode: "REFUND" }).paid, false);
  assert.equal(interpretAuthorisation({ ...DOC_ITEM, eventCode: "CANCELLATION" }).paid, false);
});

/* ---------------- URLs, montants, config ---------------- */

test("toMinorUnits : euros → centimes sans erreur d'arrondi flottant", () => {
  assert.equal(toMinorUnits(12.9), 1290);
  assert.equal(toMinorUnits(0.1 + 0.2), 30);
  assert.equal(toMinorUnits(17.95), 1795);
});

test("checkoutBaseUrl : test, production avec préfixe, préfixe manquant ou piégé", () => {
  assert.equal(checkoutBaseUrl({ environment: "test" }), "https://checkout-test.adyen.com/v71");
  assert.equal(
    checkoutBaseUrl({ environment: "production", liveUrlPrefix: "1797a841fbb37ca7-AdyenDemo" }),
    "https://1797a841fbb37ca7-AdyenDemo-checkout-live.adyenpayments.com/checkout/v71",
  );
  assert.throws(() => checkoutBaseUrl({ environment: "production" }), /adyen_live_url_prefix_missing/);
  assert.throws(() => checkoutBaseUrl({ environment: "production", liveUrlPrefix: "evil.com/x#" }), /adyen_live_url_prefix_missing/);
});

test("loadAdyenConfig : refuse une config incomplète ou un compte marchand piégé", () => {
  assert.equal(loadAdyenConfig(null), null);
  assert.equal(loadAdyenConfig({ api_key: "k" }), null);
  assert.equal(loadAdyenConfig({ api_key: "k", merchant_account: "a b" }), null);
  const ok = loadAdyenConfig({ api_key: "k", merchant_account: "BaomaECOM", environment: "production", live_url_prefix: "abc" });
  assert.equal(ok?.environment, "production");
  assert.equal(loadAdyenConfig({ api_key: "k", merchant_account: "BaomaECOM", environment: "n'importe quoi" })?.environment, "test");
});

/* ---------------- Création du lien de paiement ---------------- */

test("buildPaymentLinkBody : montant en centimes, devise, référence, retour, expiration sans millisecondes", () => {
  const body = buildPaymentLinkBody(cfg, {
    amount: 25.8, currency: "eur", reference: "att-123", description: "Baoma — table 4",
    successUrl: "https://x.fr/r/baoma/t/4/payment/success?attempt=att-123", cancelUrl: "https://x.fr/c",
  }, Date.UTC(2026, 9, 14, 12, 0, 0), 30);
  assert.deepEqual(body.amount, { currency: "EUR", value: 2580 });
  assert.equal(body.reference, "att-123");
  assert.equal(body.merchantAccount, "BaomaECOM");
  assert.equal(body.returnUrl, "https://x.fr/r/baoma/t/4/payment/success?attempt=att-123");
  assert.equal(body.expiresAt, "2026-10-14T12:30:00Z");
  assert.equal(body.countryCode, "FR");
});

test("createPayment : appelle /paymentLinks avec la clé API en en-tête et renvoie id + url", async () => {
  const f = fakeFetch([{ status: 201, body: { id: "PL123", url: "https://test.adyen.link/PL123", status: "active" } }]);
  const out = await new AdyenProvider(cfg, f.impl).createPayment({
    amount: 10, currency: "eur", reference: "r1", description: "d", successUrl: "https://x/ok", cancelUrl: "https://x/ko",
  });
  assert.deepEqual(out, { providerPaymentId: "PL123", redirectUrl: "https://test.adyen.link/PL123", rawStatus: "active" });
  assert.equal(f.calls[0].url, "https://checkout-test.adyen.com/v71/paymentLinks");
  assert.equal(f.calls[0].init.headers["X-API-Key"], "AQE-secret");
  assert.equal(JSON.parse(f.calls[0].init.body).amount.value, 1000);
});

test("createPayment : erreur HTTP → exception sans fuite de la clé API ; réponse sans url → exception", async () => {
  const bad = fakeFetch([{ status: 422, body: { message: "Invalid merchant account" } }]);
  await assert.rejects(new AdyenProvider(cfg, bad.impl).createPayment({ amount: 1, currency: "eur", reference: "r", description: "d", successUrl: "u", cancelUrl: "u" }),
    (e: Error) => e.message.includes("adyen_http_422") && !e.message.includes("AQE-secret"));
  const empty = fakeFetch([{ status: 201, body: { id: "PL1" } }]);
  await assert.rejects(new AdyenProvider(cfg, empty.impl).createPayment({ amount: 1, currency: "eur", reference: "r", description: "d", successUrl: "u", cancelUrl: "u" }), /adyen_reponse_invalide/);
});

/* ---------------- Statut : jamais « paid » depuis le lien ---------------- */

test("getPaymentStatus : « completed »/« paid »/« active » restent en cours (seul le webhook confirme)", async () => {
  for (const s of ["active", "completed", "paid", "paymentPending", "inconnu"]) {
    const f = fakeFetch([{ status: 200, body: { status: s } }]);
    assert.equal((await new AdyenProvider(cfg, f.impl).getPaymentStatus("PL1")).status, "processing", s);
  }
});

test("getPaymentStatus : lien expiré → annulé ; erreur HTTP → exception (jamais marqué échoué à tort)", async () => {
  const exp = fakeFetch([{ status: 200, body: { status: "expired" } }]);
  assert.equal((await new AdyenProvider(cfg, exp.impl).getPaymentStatus("PL1")).status, "cancelled");
  const down = fakeFetch([{ status: 503 }]);
  await assert.rejects(new AdyenProvider(cfg, down.impl).getPaymentStatus("PL1"), /adyen_http_503/);
});

/* ---------------- Remboursement et vérification des identifiants ---------------- */

test("refundPayment : montant obligatoire, envoyé en centimes sur la référence PSP", async () => {
  assert.deepEqual(await new AdyenProvider(cfg, fakeFetch([]).impl).refundPayment("PSP1"), { ok: false, error: "adyen_refund_amount_required" });
  const f = fakeFetch([{ status: 201, body: { pspReference: "REF9", status: "received" } }]);
  const out = await new AdyenProvider(cfg, f.impl).refundPayment("PSP1", 12.5);
  assert.deepEqual(out, { ok: true, providerRefundId: "REF9" });
  assert.equal(f.calls[0].url, "https://checkout-test.adyen.com/v71/payments/PSP1/refunds");
  assert.equal(JSON.parse(f.calls[0].init.body).amount.value, 1250);
});

test("checkCredentials : 401/403 = refusé, 404/422 = authentification OK, 5xx = indisponible", async () => {
  const run = async (status: number) => new AdyenProvider(cfg, fakeFetch([{ status }]).impl).checkCredentials();
  assert.equal((await run(401)).ok, false);
  assert.equal((await run(403)).ok, false);
  assert.equal((await run(404)).ok, true);
  assert.equal((await run(422)).ok, true);
  assert.equal((await run(503)).ok, false);
});

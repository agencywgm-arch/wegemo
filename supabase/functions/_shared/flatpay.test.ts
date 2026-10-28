// Tests du client Flatpay — logique pure uniquement (pas d'appel réseau réel,
// Flatpay ne fournissant pas de sandbox public documenté à ce jour). Les
// scénarios de bout en bout (vrai paiement 1€, vrai webhook Flatpay) ne sont
// pas automatisables ici et sont décrits dans FLATPAY_INTEGRATION.md.
//
//   node --experimental-strip-types --test supabase/functions/_shared/flatpay.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildCreatePaymentBody,
  loadFlatpayConfigFromEnv,
  mapProviderStatus,
  parseCreatePaymentResponse,
  parseStatusResponse,
  verifyFlatpaySignature,
} from "./flatpay.ts";

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

function fakeEnv(vars: Record<string, string>) {
  return { get: (k: string) => vars[k] };
}

test("sans FLATPAY_API_BASE_URL ou FLATPAY_API_KEY, la config est null (jamais d'appel vers une URL inventée)", () => {
  assert.equal(loadFlatpayConfigFromEnv(fakeEnv({})), null);
  assert.equal(loadFlatpayConfigFromEnv(fakeEnv({ FLATPAY_API_BASE_URL: "https://api.example" })), null);
  assert.equal(loadFlatpayConfigFromEnv(fakeEnv({ FLATPAY_API_KEY: "k" })), null);
});

test("la config se charge depuis l'environnement, slash de fin retiré", () => {
  const cfg = loadFlatpayConfigFromEnv(fakeEnv({
    FLATPAY_API_BASE_URL: "https://api.example/", FLATPAY_API_KEY: "sk_test_123",
  }));
  assert.ok(cfg);
  assert.equal(cfg!.apiBaseUrl, "https://api.example");
  assert.equal(cfg!.environment, "test"); // valeur par défaut
  assert.equal(cfg!.apiKey, "sk_test_123");
});

test("les chemins d'endpoint sont surchargeables sans redéploiement de code", () => {
  const cfg = loadFlatpayConfigFromEnv(fakeEnv({
    FLATPAY_API_BASE_URL: "https://api.example", FLATPAY_API_KEY: "k",
    FLATPAY_CREATE_PAYMENT_PATH: "/custom/create",
  }));
  assert.equal(cfg!.createPaymentPath, "/custom/create");
  assert.equal(cfg!.getPaymentPathTemplate, "/v1/payments/{id}"); // défaut inchangé
});

/* ------------------------------------------------------------------ */
/* Création de paiement                                                */
/* ------------------------------------------------------------------ */

test("le corps de création convertit le montant en centimes et fige la devise en majuscules", () => {
  const body = buildCreatePaymentBody({
    amount: 17.5, currency: "eur", reference: "attempt-1", description: "Commande WGM",
    successUrl: "https://wgm.example/success", cancelUrl: "https://wgm.example/cancel",
  });
  assert.equal(body.amount, 1750);
  assert.equal(body.currency, "EUR");
  assert.equal(body.reference, "attempt-1");
  assert.equal(body.success_url, "https://wgm.example/success");
  assert.equal("webhook_url" in body, false); // absent si non fourni
});

test("un centime ne se perd pas à l'arrondi (1,00 € reste 100 centimes pile)", () => {
  assert.equal(buildCreatePaymentBody({
    amount: 1, currency: "eur", reference: "r", description: "d",
    successUrl: "s", cancelUrl: "c",
  }).amount, 100);
});

test("parseCreatePaymentResponse extrait id + redirect_url, tolère plusieurs noms de champs", () => {
  const a = parseCreatePaymentResponse({ id: "pay_1", redirect_url: "https://pay.example/1" });
  assert.equal(a.providerPaymentId, "pay_1");
  assert.equal(a.redirectUrl, "https://pay.example/1");

  const b = parseCreatePaymentResponse({ payment_id: "pay_2", checkout_url: "https://pay.example/2" });
  assert.equal(b.providerPaymentId, "pay_2");
  assert.equal(b.redirectUrl, "https://pay.example/2");
});

test("une réponse sans id/redirect_url lève une erreur explicite plutôt que de continuer silencieusement", () => {
  assert.throws(() => parseCreatePaymentResponse({ status: "created" }), /flatpay_unexpected_response/);
});

/* ------------------------------------------------------------------ */
/* Statuts                                                             */
/* ------------------------------------------------------------------ */

test("les statuts payés reconnus se mappent sur 'paid'", () => {
  for (const s of ["paid", "captured", "succeeded", "completed", "authorized_and_captured"]) {
    assert.equal(mapProviderStatus(s), "paid", s);
  }
});

test("les statuts d'échec/annulation ne sont jamais confondus avec un paiement réussi", () => {
  for (const s of ["failed", "declined", "error", "rejected"]) assert.equal(mapProviderStatus(s), "failed", s);
  for (const s of ["cancelled", "canceled", "expired", "voided"]) assert.equal(mapProviderStatus(s), "cancelled", s);
});

test("un statut inconnu, absent ou null n'est JAMAIS traité comme payé (fail-safe)", () => {
  assert.equal(mapProviderStatus("un_statut_qui_nexiste_pas_encore"), "processing");
  assert.equal(mapProviderStatus(undefined), "processing");
  assert.equal(mapProviderStatus(null), "processing");
  assert.equal(mapProviderStatus(""), "processing");
});

test("parseStatusResponse reconvertit le montant de centimes en euros", () => {
  const r = parseStatusResponse({ status: "paid", amount: 1750, currency: "EUR" });
  assert.equal(r.status, "paid");
  assert.equal(r.amount, 17.5);
  assert.equal(r.currency, "eur");
});

/* ------------------------------------------------------------------ */
/* Signature de webhook                                                */
/* ------------------------------------------------------------------ */

async function hmacHex(body: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

test("une signature HMAC-SHA256 hexadécimale valide est acceptée", async () => {
  const body = JSON.stringify({ reference: "attempt-1", status: "paid" });
  assert.equal(await verifyFlatpaySignature(body, await hmacHex(body, "wh_secret"), "wh_secret"), true);
});

test("signature falsifiée, corps modifié après signature, secret erroné ou en-tête absent : toujours rejeté", async () => {
  const body = JSON.stringify({ reference: "attempt-1" });
  const good = await hmacHex(body, "wh_secret");

  assert.equal(await verifyFlatpaySignature(body, good, "mauvais-secret"), false);
  assert.equal(await verifyFlatpaySignature(body + "x", good, "wh_secret"), false);
  assert.equal(await verifyFlatpaySignature(body, null, "wh_secret"), false);
  assert.equal(await verifyFlatpaySignature(body, good, ""), false);
});

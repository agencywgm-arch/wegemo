// Tests de finalizePaymentAttempt() — la partie la plus sensible du flux
// Flatpay : c'est elle qui décide si une commande WGM (donc un numéro
// fiscal) doit être créée. Testée contre un faux client Supabase en mémoire
// (aucune base réelle), pour couvrir précisément ce que la doc de tâche
// demande : webhook reçu deux fois, commande déjà payée, montant incohérent,
// provider injoignable.
//
//   node --experimental-strip-types --test supabase/functions/_shared/payment_finalize.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { finalizePaymentAttempt } from "./payment_finalize.ts";
import type { PaymentProvider, PaymentStatusResult } from "./payment_provider.ts";

/* ------------------------------------------------------------------ */
/* Faux client Supabase — juste ce dont payment_finalize.ts a besoin   */
/* ------------------------------------------------------------------ */

function makeFakeAdmin(seed: { attempts?: any[]; orders?: any[] } = {}) {
  const state = {
    payment_attempts: seed.attempts ?? [],
    orders: seed.orders ?? [],
    payment_events: [] as any[],
  };
  let fiscalSeq = 0;

  function table(name: keyof typeof state) {
    let filters: Array<(row: any) => boolean> = [];
    let pendingUpdate: any = null;
    let insertRow: any = null;

    const builder: any = {
      select() { return builder; },
      eq(col: string, val: unknown) { filters.push((r) => r[col] === val); return builder; },
      in(col: string, vals: unknown[]) { filters.push((r) => vals.includes(r[col])); return builder; },
      update(obj: any) { pendingUpdate = obj; return builder; },
      insert(obj: any) { insertRow = { id: `evt-${state.payment_events.length}`, ...obj }; return builder; },
      maybeSingle() { return exec(true); },
      then(resolve: any, reject: any) { return exec(false).then(resolve, reject); },
    };

    async function exec(single: boolean) {
      const rows = state[name] as any[];
      if (insertRow) {
        rows.push(insertRow);
        return { data: insertRow, error: null };
      }
      if (pendingUpdate) {
        const matched = rows.filter((r) => filters.every((f) => f(r)));
        matched.forEach((r) => Object.assign(r, pendingUpdate));
        if (single) return { data: matched[0] ? { ...matched[0] } : null, error: null };
        return { data: matched.map((r) => ({ ...r })), error: null };
      }
      const matched = rows.filter((r) => filters.every((f) => f(r)));
      if (single) return { data: matched[0] ? { ...matched[0] } : null, error: null };
      return { data: matched.map((r) => ({ ...r })), error: null };
    }

    return builder;
  }

  return {
    from: (name: string) => table(name as keyof typeof state),
    async rpc(fn: string, args: any) {
      if (fn !== "create_order_secure") throw new Error(`rpc inattendue: ${fn}`);
      // Reproduit l'idempotence par client_token de la vraie fonction SQL.
      const existing = state.orders.find((o) => o.client_token === args.p_client_token);
      if (existing) return { data: { order_id: existing.id, fiscal_number: existing.fiscal_number, total: existing.total }, error: null };
      fiscalSeq += 1;
      const order = {
        id: `order-${fiscalSeq}`, fiscal_number: `2026-${String(fiscalSeq).padStart(6, "0")}`,
        total: args.p_items ? 17.5 : 0, client_token: args.p_client_token,
      };
      state.orders.push(order);
      return { data: { order_id: order.id, fiscal_number: order.fiscal_number, total: order.total }, error: null };
    },
    _state: state,
  };
}

function fakeProvider(statusResult: PaymentStatusResult | (() => PaymentStatusResult)): PaymentProvider {
  let calls = 0;
  return {
    name: "flatpay",
    async createPayment() { throw new Error("not used in these tests"); },
    async getPaymentStatus() {
      calls++;
      return typeof statusResult === "function" ? statusResult() : statusResult;
    },
    async refundPayment() { throw new Error("not used in these tests"); },
    // exposé pour les assertions
    _calls: () => calls,
  } as any;
}

function baseAttempt(overrides: Record<string, unknown> = {}) {
  return {
    id: "attempt-1", restaurant_id: "resto-1", table_id: "table-1", session_id: null,
    order_type: "dine_in", covers: 1, customer_name: "", customer_email: "", note: "",
    promo_code: null, cart_items: [{ menu_item_id: "item-1", quantity: 1 }],
    provider: "flatpay", provider_payment_id: "pay-1", status: "PAYMENT_PROCESSING",
    amount: 17.5, currency: "eur", client_token: "tok-1", order_id: null,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */

test("paiement confirmé payé : la commande est créée une seule fois, statut PAID renvoyé", async () => {
  const admin = makeFakeAdmin({ attempts: [baseAttempt()] });
  const provider = fakeProvider({ status: "paid", amount: 17.5, currency: "eur", rawStatus: "paid" });

  const result = await finalizePaymentAttempt(admin as any, provider, "attempt-1", "webhook");

  assert.equal(result.status, "PAID");
  assert.ok(result.orderId);
  assert.equal(admin._state.orders.length, 1);
  assert.equal(admin._state.payment_attempts[0].status, "PAID");
  assert.equal(admin._state.payment_attempts[0].order_id, result.orderId);
});

test("webhook reçu deux fois : la deuxième finalisation ne recrée pas de commande (idempotence)", async () => {
  const admin = makeFakeAdmin({ attempts: [baseAttempt()] });
  const provider = fakeProvider({ status: "paid", amount: 17.5, currency: "eur", rawStatus: "paid" });

  const first = await finalizePaymentAttempt(admin as any, provider, "attempt-1", "webhook");
  const second = await finalizePaymentAttempt(admin as any, provider, "attempt-1", "webhook");

  assert.equal(first.status, "PAID");
  assert.equal(second.status, "PAID");
  assert.equal(first.orderId, second.orderId);
  assert.equal(admin._state.orders.length, 1); // toujours une seule commande
});

test("status-check après webhook déjà passé : même résultat, pas de second appel Flatpay ni de seconde commande", async () => {
  const admin = makeFakeAdmin({ attempts: [baseAttempt()] });
  const provider = fakeProvider({ status: "paid", amount: 17.5, currency: "eur", rawStatus: "paid" });

  await finalizePaymentAttempt(admin as any, provider, "attempt-1", "webhook");
  const viaStatusCheck = await finalizePaymentAttempt(admin as any, provider, "attempt-1", "status_check");

  assert.equal(viaStatusCheck.status, "PAID");
  assert.equal(admin._state.orders.length, 1);
  // Deuxième appel : ne rappelle pas provider.getPaymentStatus (court-circuité
  // par le "déjà PAID + order_id" en tête de fonction).
  assert.equal((provider as any)._calls(), 1);
});

test("commande déjà payée puis re-signalée FAILED par erreur : le statut PAID n'est jamais reculé", async () => {
  const admin = makeFakeAdmin({ attempts: [baseAttempt()] });
  const provider = fakeProvider({ status: "paid", amount: 17.5, currency: "eur", rawStatus: "paid" });
  await finalizePaymentAttempt(admin as any, provider, "attempt-1", "webhook");

  // Un webhook tardif et incohérent (rejoué après un remboursement manuel
  // externe, par exemple) ne doit rien changer : la fonction s'arrête avant
  // même d'interroger Flatpay à nouveau.
  const failProvider = fakeProvider({ status: "failed", rawStatus: "failed" });
  const result = await finalizePaymentAttempt(admin as any, failProvider, "attempt-1", "webhook");

  assert.equal(result.status, "PAID");
  assert.equal(admin._state.payment_attempts[0].status, "PAID");
});

test("montant renvoyé par Flatpay incohérent avec le montant attendu : commande PAS créée", async () => {
  const admin = makeFakeAdmin({ attempts: [baseAttempt({ amount: 17.5 })] });
  const provider = fakeProvider({ status: "paid", amount: 1.0, currency: "eur", rawStatus: "paid" }); // 1€ au lieu de 17,50€

  const result = await finalizePaymentAttempt(admin as any, provider, "attempt-1", "webhook");

  assert.equal(result.status, "PAYMENT_PROCESSING");
  assert.equal(result.error, "montant_incoherent");
  assert.equal(admin._state.orders.length, 0);
});

test("devise renvoyée par Flatpay différente de la devise attendue : commande PAS créée", async () => {
  const admin = makeFakeAdmin({ attempts: [baseAttempt({ currency: "eur" })] });
  const provider = fakeProvider({ status: "paid", amount: 17.5, currency: "usd", rawStatus: "paid" });

  const result = await finalizePaymentAttempt(admin as any, provider, "attempt-1", "webhook");

  assert.equal(result.status, "PAYMENT_PROCESSING");
  assert.equal(result.error, "devise_incoherente");
  assert.equal(admin._state.orders.length, 0);
});

test("paiement refusé par Flatpay : PAYMENT_FAILED, aucune commande créée", async () => {
  const admin = makeFakeAdmin({ attempts: [baseAttempt()] });
  const provider = fakeProvider({ status: "failed", rawStatus: "declined" });

  const result = await finalizePaymentAttempt(admin as any, provider, "attempt-1", "status_check");

  assert.equal(result.status, "PAYMENT_FAILED");
  assert.equal(result.orderId, null);
  assert.equal(admin._state.orders.length, 0);
});

test("statut terminal déjà écrit (FAILED) : ne rappelle plus jamais Flatpay", async () => {
  const admin = makeFakeAdmin({ attempts: [baseAttempt({ status: "PAYMENT_FAILED" })] });
  const provider = fakeProvider({ status: "paid", amount: 17.5, currency: "eur" }); // ignoré si jamais appelé

  const result = await finalizePaymentAttempt(admin as any, provider, "attempt-1", "status_check");

  assert.equal(result.status, "PAYMENT_FAILED");
  assert.equal((provider as any)._calls(), 0);
});

test("Flatpay injoignable : la tentative reste PAYMENT_PROCESSING, jamais marquée échouée à tort", async () => {
  const admin = makeFakeAdmin({ attempts: [baseAttempt()] });
  const provider: PaymentProvider = {
    name: "flatpay",
    async createPayment() { throw new Error("not used"); },
    async getPaymentStatus() { throw new Error("network timeout"); },
    async refundPayment() { throw new Error("not used"); },
  };

  const result = await finalizePaymentAttempt(admin as any, provider, "attempt-1", "webhook");

  assert.equal(result.status, "PAYMENT_PROCESSING");
  assert.equal(result.error, "flatpay_unreachable");
  assert.equal(admin._state.orders.length, 0);
});

test("payment_attempt introuvable : échec propre, jamais de commande fantôme", async () => {
  const admin = makeFakeAdmin({ attempts: [] });
  const provider = fakeProvider({ status: "paid", amount: 17.5, currency: "eur" });

  const result = await finalizePaymentAttempt(admin as any, provider, "attempt-inconnu", "webhook");

  assert.equal(result.status, "PAYMENT_FAILED");
  assert.equal(result.error, "payment_attempt_introuvable");
});

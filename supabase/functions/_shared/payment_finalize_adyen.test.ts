// finalizePaymentAttempt() côté Adyen : paiement confirmé par une notification
// dont la signature HMAC a déjà été vérifiée (paramètre `verified`).
//
//   node --experimental-strip-types --test supabase/functions/_shared/payment_finalize_adyen.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { finalizePaymentAttempt } from "./payment_finalize.ts";
import { AdyenProvider } from "./adyen.ts";

function makeAdmin(attempts: any[]) {
  const state = { payment_attempts: attempts, orders: [] as any[], payment_events: [] as any[], rpcCalls: [] as any[] };
  function table(name: "payment_attempts" | "orders" | "payment_events") {
    const filters: Array<(r: any) => boolean> = [];
    let upd: any = null; let ins: any = null;
    const b: any = {
      select() { return b; },
      eq(c: string, v: unknown) { filters.push((r) => r[c] === v); return b; },
      in(c: string, vs: unknown[]) { filters.push((r) => vs.includes(r[c])); return b; },
      update(o: any) { upd = o; return b; },
      insert(o: any) { ins = o; return b; },
      maybeSingle() { return run(true); },
      then(res: any, rej: any) { return run(false).then(res, rej); },
    };
    async function run(single: boolean) {
      const rows = state[name] as any[];
      if (ins) { rows.push(ins); return { data: ins, error: null }; }
      const matched = rows.filter((r) => filters.every((f) => f(r)));
      if (upd) matched.forEach((r) => Object.assign(r, upd));
      return single ? { data: matched[0] ? { ...matched[0] } : null, error: null } : { data: matched.map((r) => ({ ...r })), error: null };
    }
    return b;
  }
  return {
    from: (n: string) => table(n as any),
    async rpc(fn: string, args: any) {
      state.rpcCalls.push({ fn, args });
      const existing = state.orders.find((o) => o.client_token === args.p_client_token);
      if (existing) return { data: { order_id: existing.id, fiscal_number: existing.fiscal_number, total: existing.total }, error: null };
      const o = { id: `order-${state.orders.length + 1}`, fiscal_number: "2026-000001", total: 17.5, client_token: args.p_client_token };
      state.orders.push(o);
      return { data: { order_id: o.id, fiscal_number: o.fiscal_number, total: o.total }, error: null };
    },
    _state: state,
  };
}

function attempt(over: Record<string, unknown> = {}) {
  return {
    id: "att-1", restaurant_id: "r1", table_id: "t1", session_id: null, order_type: "dine_in", covers: 1,
    customer_name: "", customer_email: "", note: "", promo_code: null,
    cart_items: [{ menu_item_id: "i1", quantity: 1, supplements: [], detail: "" }],
    provider: "adyen", provider_payment_id: "PL1", status: "PAYMENT_PROCESSING",
    amount: 17.5, currency: "eur", client_token: "tok-1", order_id: null, ...over,
  };
}

function provider(fetchStatus: number, body: unknown) {
  let calls = 0;
  const impl = async () => { calls++; return new Response(JSON.stringify(body), { status: fetchStatus }); };
  const p = new AdyenProvider({ apiKey: "k", merchantAccount: "M", environment: "test" }, impl as any);
  return { p, calls: () => calls };
}

test("notification vérifiée : commande créée en mode online_adyen, référence PSP conservée, Adyen non rappelé", async () => {
  const admin = makeAdmin([attempt()]);
  const prov = provider(200, { status: "completed" });
  const res = await finalizePaymentAttempt(admin as any, prov.p, "att-1", "webhook",
    { status: "paid", amount: 17.5, currency: "eur", rawStatus: "AUTHORISATION:true", pspReference: "PSP-99" });
  assert.equal(res.status, "PAID");
  assert.ok(res.orderId);
  assert.equal(admin._state.rpcCalls[0].args.p_payment_mode, "online_adyen");
  assert.equal(admin._state.payment_attempts[0].provider_reference, "PSP-99");
  assert.equal(prov.calls(), 0);
});

test("notification rejouée : une seule commande", async () => {
  const admin = makeAdmin([attempt()]);
  const prov = provider(200, {});
  const v = { status: "paid" as const, amount: 17.5, currency: "eur", pspReference: "PSP-99" };
  const a = await finalizePaymentAttempt(admin as any, prov.p, "att-1", "webhook", v);
  const b = await finalizePaymentAttempt(admin as any, prov.p, "att-1", "webhook", v);
  assert.equal(a.orderId, b.orderId);
  assert.equal(admin._state.orders.length, 1);
});

test("montant notifié ≠ montant attendu : aucune commande", async () => {
  const admin = makeAdmin([attempt()]);
  const res = await finalizePaymentAttempt(admin as any, provider(200, {}).p, "att-1", "webhook", { status: "paid", amount: 1, currency: "eur" });
  assert.equal(res.status, "PAYMENT_PROCESSING");
  assert.equal(res.error, "montant_incoherent");
  assert.equal(admin._state.orders.length, 0);
});

test("devise notifiée ≠ devise attendue : aucune commande", async () => {
  const admin = makeAdmin([attempt()]);
  const res = await finalizePaymentAttempt(admin as any, provider(200, {}).p, "att-1", "webhook", { status: "paid", amount: 17.5, currency: "usd" });
  assert.equal(res.error, "devise_incoherente");
  assert.equal(admin._state.orders.length, 0);
});

test("retour client SANS notification : lien « completed » ne suffit pas, aucune commande, statut en cours", async () => {
  const admin = makeAdmin([attempt()]);
  const res = await finalizePaymentAttempt(admin as any, provider(200, { status: "completed" }).p, "att-1", "status_check");
  assert.equal(res.status, "PAYMENT_PROCESSING");
  assert.equal(admin._state.orders.length, 0);
});

test("lien expiré sans paiement : tentative annulée, aucune commande", async () => {
  const admin = makeAdmin([attempt()]);
  const res = await finalizePaymentAttempt(admin as any, provider(200, { status: "expired" }).p, "att-1", "status_check");
  assert.equal(res.status, "PAYMENT_CANCELLED");
  assert.equal(admin._state.orders.length, 0);
});

test("Adyen injoignable au retour client : reste en cours avec l'erreur adyen_unreachable", async () => {
  const admin = makeAdmin([attempt()]);
  const res = await finalizePaymentAttempt(admin as any, provider(503, {}).p, "att-1", "status_check");
  assert.equal(res.status, "PAYMENT_PROCESSING");
  assert.equal(res.error, "adyen_unreachable");
});

test("notification payée arrivée APRÈS une expiration du lien : le paiement reçu prime (argent encaissé)", async () => {
  const admin = makeAdmin([attempt()]);
  await finalizePaymentAttempt(admin as any, provider(200, { status: "expired" }).p, "att-1", "status_check");
  assert.equal(admin._state.payment_attempts[0].status, "PAYMENT_CANCELLED");
  const res = await finalizePaymentAttempt(admin as any, provider(200, {}).p, "att-1", "webhook", { status: "paid", amount: 17.5, currency: "eur", pspReference: "P" });
  // Statut terminal : on ne ressuscite pas automatiquement, mais ce cas est tracé pour traitement manuel.
  assert.equal(res.status, "PAYMENT_CANCELLED");
});

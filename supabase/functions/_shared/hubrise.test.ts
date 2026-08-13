// Tests du mapping HubRise.
//
// Le module ne dépend que d'APIs web standard (fetch, crypto.subtle, btoa) :
// il tourne donc aussi bien sous Deno (edge functions) que sous Node.
//
//   node --experimental-strip-types --test supabase/functions/_shared/hubrise.test.ts
//
// Ces tests couvrent la logique pure (mapping, idempotence, signature, retry).
// Les scénarios de bout en bout (commande réellement affichée sur une caisse
// CLYO) demandent un compte HubRise de test et ne sont pas automatisables ici.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildCatalogData,
  buildOrderPayload,
  catRef,
  hubriseFetch,
  mapHubriseStatus,
  money,
  skuRef,
  toHubriseStatus,
  verifySignature,
} from "./hubrise.ts";

/* ------------------------------------------------------------------ */
/* Format monétaire                                                    */
/* ------------------------------------------------------------------ */

test("money formate en chaîne suffixée de la devise", () => {
  assert.equal(money(12.9), "12.90 EUR");
  assert.equal(money("6"), "6.00 EUR");
  assert.equal(money(0), "0.00 EUR");
  // Un montant absent ne doit pas produire "NaN EUR".
  assert.equal(money(undefined as unknown as number), "0.00 EUR");
});

/* ------------------------------------------------------------------ */
/* Catalogue                                                           */
/* ------------------------------------------------------------------ */

const MENU = [
  { id: "uuid-burger", name: "Smash Cheese", description: "Steak, cheddar", price: 11.9, category: "Burgers", available: true },
  { id: "uuid-frites", name: "Frites Maison", description: "", price: 3, category: "Sides", available: true, supplements: [{ name: "Cheddar", price: 1.5 }, { name: "Bacon", price: 2 }] },
  { id: "uuid-off", name: "Plat retiré", description: "", price: 9, category: "Burgers", available: false },
];

test("le catalogue expose les clés attendues par HubRise", () => {
  const data = buildCatalogData(MENU);
  // `option_lists` : singulier sur "option", confirmé en recette le
  // 2026-08-12 (l'API rejette "options_lists" avec "is not a valid key").
  assert.deepEqual(
    Object.keys(data).sort(),
    ["categories", "charges", "deals", "discounts", "option_lists", "products", "variants"],
  );
});

test("les articles indisponibles sont exclus du catalogue", () => {
  const data = buildCatalogData(MENU);
  assert.equal(data.products.length, 2);
  assert.ok(!data.products.some((p) => p.ref === "uuid-off"));
});

test("les catégories sont dédupliquées et référencées de façon stable", () => {
  const data = buildCatalogData(MENU);
  assert.equal(data.categories.length, 2);
  assert.equal(catRef("Bao Créations"), "cat-bao-creations");
  // Le ref d'un produit est son UUID Wegemo : stable même si le nom change.
  assert.equal(data.products[0].ref, "uuid-burger");
  assert.equal(data.products[0].category_ref, "cat-burgers");
});

test("les suppléments deviennent une liste d'options rattachée au SKU", () => {
  const data = buildCatalogData(MENU);
  const frites = data.products.find((p) => p.ref === "uuid-frites")!;
  assert.deepEqual(frites.skus[0].option_list_refs, ["opt-uuid-frites"]);

  const list = data.option_lists.find((l) => l.ref === "opt-uuid-frites")!;
  assert.equal((list.options as unknown[]).length, 2);
  assert.equal((list.options as Array<{ price: string }>)[0].price, "1.50 EUR");

  // Un article sans supplément ne crée pas de liste vide.
  const burger = data.products.find((p) => p.ref === "uuid-burger")!;
  assert.deepEqual(burger.skus[0].option_list_refs, []);
});

/* ------------------------------------------------------------------ */
/* Commande                                                            */
/* ------------------------------------------------------------------ */

const BASE_ORDER = {
  wegemoOrderId: "order-uuid-1",
  serviceType: "eat_in" as const,
  tableLabel: "Table 5",
  customerName: "Alice",
  customerEmail: "alice@example.com",
  note: "Sans oignons",
  total: 14.9,
  lines: [
    { menu_item_id: "uuid-burger", quantity: 1, name: "Smash Cheese", price: 11.9, detail: null },
    { menu_item_id: "uuid-frites", quantity: 2, name: "Frites Maison", price: 3, detail: null },
  ],
};

test("commande simple : structure et formats", () => {
  const p = buildOrderPayload(BASE_ORDER) as Record<string, unknown>;

  assert.equal(p.status, "new");
  assert.equal(p.service_type, "eat_in");
  // private_ref porte l'UUID Wegemo : clé d'idempotence et de rapprochement.
  assert.equal(p.private_ref, "order-uuid-1");
  assert.equal(p.collection_code, "Table 5");
  assert.equal(p.total, "14.90 EUR");

  const items = p.items as Array<Record<string, unknown>>;
  assert.equal(items.length, 2);
  assert.equal(items[0].sku_ref, skuRef("uuid-burger"));
  assert.equal(items[0].price, "11.90 EUR");
  // quantity est une chaîne côté HubRise, pas un nombre.
  assert.equal(items[1].quantity, "2");
  assert.equal(typeof items[1].quantity, "string");
});

test("PAIEMENT EN CAISSE : aucun tableau payments n'est émis", () => {
  const p = buildOrderPayload(BASE_ORDER) as Record<string, unknown>;
  // Contrainte forte du projet : une commande sans `payments` est considérée
  // non payée par HubRise, donc à encaisser en caisse. Si ce test casse, c'est
  // que le flux caisse déclare à tort un encaissement déjà réalisé.
  assert.equal("payments" in p, false);
  assert.equal("payment_status" in p, false);
});

test("commande avec suppléments : options rattachées à la ligne", () => {
  const p = buildOrderPayload({
    ...BASE_ORDER,
    lines: [{
      menu_item_id: "uuid-frites",
      quantity: 1,
      name: "Frites Maison",
      price: 3,
      detail: null,
      supplements: [{ name: "Cheddar", price: 1.5 }],
    }],
  }) as Record<string, unknown>;

  const item = (p.items as Array<Record<string, unknown>>)[0];
  const options = item.options as Array<Record<string, unknown>>;
  assert.equal(options.length, 1);
  assert.equal(options[0].name, "Cheddar");
  assert.equal(options[0].price, "1.50 EUR");
  // Le ref d'option doit correspondre à celui émis dans le catalogue,
  // sinon la caisse ne reconnaît pas le supplément.
  assert.equal(options[0].ref, "opt-uuid-frites-0");
});

test("les champs optionnels absents ne sont pas émis à vide", () => {
  const p = buildOrderPayload({
    wegemoOrderId: "o2",
    serviceType: "collection",
    tableLabel: null,
    customerName: null,
    customerEmail: null,
    note: null,
    total: 5,
    lines: [{ menu_item_id: "x", quantity: 1, name: "Café", price: 5, detail: null }],
  }) as Record<string, unknown>;

  assert.equal("collection_code" in p, false);
  assert.equal("customer" in p, false);
  assert.equal("customer_notes" in p, false);
  assert.equal(p.service_type, "collection");
});

/* ------------------------------------------------------------------ */
/* Statuts                                                             */
/* ------------------------------------------------------------------ */

test("les statuts HubRise se projettent sur le suivi Wegemo", () => {
  assert.equal(mapHubriseStatus("new"), "sent");
  assert.equal(mapHubriseStatus("received"), "sent");
  assert.equal(mapHubriseStatus("accepted"), "accepted");
  assert.equal(mapHubriseStatus("in_preparation"), "accepted");
  assert.equal(mapHubriseStatus("completed"), "accepted");
  assert.equal(mapHubriseStatus("rejected"), "rejected");
  assert.equal(mapHubriseStatus("cancelled"), "rejected");
  // Statut déprécié : traité comme awaiting_collection, jamais comme un refus.
  assert.equal(mapHubriseStatus("awaiting_shipment"), "accepted");
  // Un statut inconnu ne doit jamais être interprété comme un refus.
  assert.equal(mapHubriseStatus("statut_futur_inconnu"), "sent");
});

test("les statuts Wegemo se traduisent en statuts HubRise", () => {
  assert.equal(toHubriseStatus("PREPARING"), "in_preparation");
  assert.equal(toHubriseStatus("READY"), "awaiting_collection");
  assert.equal(toHubriseStatus("DONE"), "completed");
  assert.equal(toHubriseStatus("PENDING"), "received");
});

/* ------------------------------------------------------------------ */
/* Signature des webhooks                                              */
/* ------------------------------------------------------------------ */

async function sign(body: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

test("une signature valide est acceptée", async () => {
  const body = JSON.stringify({ resource_type: "order", status: "accepted" });
  assert.equal(await verifySignature(body, await sign(body, "secret"), "secret"), true);
});

test("signature falsifiée, secret erroné ou absente : rejet", async () => {
  const body = JSON.stringify({ resource_type: "order" });
  const good = await sign(body, "secret");

  assert.equal(await verifySignature(body, good, "mauvais-secret"), false);
  assert.equal(await verifySignature(body + "x", good, "secret"), false);
  assert.equal(await verifySignature(body, null, "secret"), false);
  assert.equal(await verifySignature(body, good, ""), false);
});

/* ------------------------------------------------------------------ */
/* Résilience réseau                                                   */
/* ------------------------------------------------------------------ */

function stubFetch(responses: Array<{ status: number; body?: unknown }>) {
  let i = 0;
  const calls: string[] = [];
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    const r = responses[Math.min(i++, responses.length - 1)];
    return Promise.resolve(
      new Response(JSON.stringify(r.body ?? {}), { status: r.status }),
    );
  }) as typeof fetch;
  return calls;
}

test("une erreur 5xx est retentée puis finit par réussir", async () => {
  const original = globalThis.fetch;
  try {
    const calls = stubFetch([{ status: 503 }, { status: 200, body: { id: "ord-1" } }]);
    const res = await hubriseFetch("/locations/L/orders", "tok", { method: "POST" });
    assert.equal(res.ok, true);
    assert.equal(calls.length, 2);
    assert.equal((res.data as { id: string }).id, "ord-1");
  } finally {
    globalThis.fetch = original;
  }
});

test("une erreur métier 4xx n'est PAS retentée", async () => {
  const original = globalThis.fetch;
  try {
    // Cas « article inconnu du catalogue » : relancer ne changerait rien et
    // retarderait l'alerte au restaurateur.
    const calls = stubFetch([{ status: 422, body: { message: "unknown sku_ref" } }]);
    const res = await hubriseFetch("/locations/L/orders", "tok", { method: "POST" });
    assert.equal(res.ok, false);
    assert.equal(res.status, 422);
    assert.equal(res.error, "unknown sku_ref");
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test("caisse injoignable : échec après épuisement des tentatives", async () => {
  const original = globalThis.fetch;
  try {
    const calls = stubFetch([{ status: 502 }]);
    const res = await hubriseFetch("/locations/L/orders", "tok", { method: "POST" }, 2);
    assert.equal(res.ok, false);
    // 1 tentative initiale + 2 reprises.
    assert.equal(calls.length, 3);
  } finally {
    globalThis.fetch = original;
  }
});

test("le token est transmis dans l'en-tête X-Access-Token", async () => {
  const original = globalThis.fetch;
  try {
    let seen: Record<string, string> = {};
    globalThis.fetch = ((_u: string, init?: RequestInit) => {
      seen = (init?.headers ?? {}) as Record<string, string>;
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as typeof fetch;

    await hubriseFetch("/location", "mon-token");
    assert.equal(seen["X-Access-Token"], "mon-token");
    assert.equal(seen["Content-Type"], "application/json");
  } finally {
    globalThis.fetch = original;
  }
});

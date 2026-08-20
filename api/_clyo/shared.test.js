// Vérifie le format de sérialisation contre les exemples de flux exacts du
// document CLYO ("interfacage_entre_site_web_et_clyo.pdf") — pas de logique
// métier ici, juste la fidélité au protocole documenté.
//
//   node --test api/_clyo/shared.test.js

import { test } from "node:test";
import assert from "node:assert/strict";
import { serializeProductRow, serializeOrderRow, PRODUCT_FIELDS, ORDER_FIELDS } from "./shared.js";

test("ligne produit : délimiteur '|', terminée par '|^^'", () => {
  const row = serializeProductRow(["2", "Salade de choux", "Salade de choux fait maison", "6", "N", "1", "2", "1", "6.8", "6.8", "0", ""]);
  assert.equal(row, "2|Salade de choux|Salade de choux fait maison|6|N|1|2|1|6.8|6.8|0||^^\n");
});

test("en-tête produit correspond exactement aux 12 champs documentés", () => {
  assert.equal(
    serializeProductRow(PRODUCT_FIELDS),
    "idProd|name|description|idCategExt|isFormula|idProductPrice|idProdExt|size|priceWeb|priceShop|position|idClyo|^^\n"
  );
});

test("ligne commande : délimiteur '~~', terminée par '~~^^'", () => {
  const row = serializeOrderRow(["58", " ", "", "-1", "13.9", "0", "2013-04-11", "Paiement par CB ", "WAIT", "Carte,Poivre,"]);
  assert.equal(row, "58~~ ~~~~-1~~13.9~~0~~2013-04-11~~Paiement par CB ~~WAIT~~Carte,Poivre,~~^^\n");
});

test("en-tête commande a bien les 33 champs documentés, dans l'ordre", () => {
  assert.equal(ORDER_FIELDS.length, 33);
  assert.equal(ORDER_FIELDS[0], "idCommande");
  assert.equal(ORDER_FIELDS.at(-1), "nb_couvert");
  assert.deepEqual(ORDER_FIELDS.slice(25, 29), ["idShopExt", "keyAndPrice", "resultBNK", "ID_SHOP_CP"]);
});

test("keyAndPrice : Ligne{n}:Qty{qty}>id{clyo}>price{unitaire}, jointes par '|' avec '|' final", () => {
  const items = [
    { quantity: 2, menu_items: { pos_ref: "76", price: 1.5 } },
    { quantity: 1, menu_items: { pos_ref: "80", price: 2.4 } },
    { quantity: 5, menu_items: { pos_ref: "415", price: 1.7 } },
  ];
  const keyAndPrice = items
    .map((it, i) => `Ligne${i}:Qty${it.quantity}>id${it.menu_items.pos_ref}>price${Number(it.menu_items.price).toFixed(2)}`)
    .join("|") + (items.length ? "|" : "");
  assert.equal(keyAndPrice, "Ligne0:Qty2>id76>price1.50|Ligne1:Qty1>id80>price2.40|Ligne2:Qty5>id415>price1.70|");
});

//   node --experimental-strip-types --test supabase/functions/_shared/cart_options.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { CartOptionsError, sanitizeCartItems } from "./cart_options.ts";

const burger = {
  id: "b1",
  supplements: [
    { name: "Sans oignon", price: 0, group: "Retirer", multi: true },
    { name: "Supplément steak", price: 4, group: "Extras", multi: true },
    { name: "Sans frites", price: -3, group: "Frites" },
    { name: "Frites Paprika", price: 1.2, group: "Frites" },
    { name: "Sprite", price: 1.5, group: "Boisson" },
  ],
};
const midi = {
  id: "m1",
  supplements: [
    { name: "Bao Végé", price: 0, group: "Burger", required: true },
    { name: "Smash Cheese", price: 0, group: "Burger", required: true },
  ],
};
const starter = { id: "s1", supplements: [] };

const code = (fn: () => unknown) => { try { fn(); return null; } catch (e) { return (e as CartOptionsError).code; } };

test("les prix envoyés par le navigateur sont ignorés : seuls les prix de la carte comptent", () => {
  const out = sanitizeCartItems([{ menu_item_id: "b1", quantity: 1, supplements: [{ name: "Sans frites", price: -300 } as any, { name: "Sprite", price: 0 } as any] }], [burger]);
  assert.deepEqual(out[0].supplements, [
    { name: "Sans frites", price: -3, group: "Frites" },
    { name: "Sprite", price: 1.5, group: "Boisson" },
  ]);
  assert.equal(out[0].detail, "Sans frites, Sprite");
});

test("une option qui n'existe pas dans la carte est refusée", () => {
  assert.equal(code(() => sanitizeCartItems([{ menu_item_id: "b1", supplements: [{ name: "Caviar gratuit" }] }], [burger])), "supplement_inconnu:Caviar gratuit");
  assert.equal(code(() => sanitizeCartItems([{ menu_item_id: "s1", supplements: [{ name: "Sprite" }] }], [starter])), "supplement_inconnu:Sprite");
});

test("article inconnu refusé ; quantité bornée entre 1 et 99", () => {
  assert.equal(code(() => sanitizeCartItems([{ menu_item_id: "zzz" }], [burger])), "article_introuvable");
  assert.equal(sanitizeCartItems([{ menu_item_id: "s1", quantity: -5 }], [starter])[0].quantity, 1);
  assert.equal(sanitizeCartItems([{ menu_item_id: "s1", quantity: 100000 }], [starter])[0].quantity, 99);
  assert.equal(sanitizeCartItems([{ menu_item_id: "s1", quantity: 2.9 }], [starter])[0].quantity, 2);
  assert.equal(sanitizeCartItems([{ menu_item_id: "s1" }], [starter])[0].quantity, 1);
});

test("groupe à choix unique : deux frites différentes refusées ; une option cochée deux fois comptée une fois", () => {
  assert.equal(code(() => sanitizeCartItems([{ menu_item_id: "b1", supplements: [{ name: "Sans frites" }, { name: "Frites Paprika" }] }], [burger])), "choix_multiple:Frites");
  const out = sanitizeCartItems([{ menu_item_id: "b1", supplements: [{ name: "Sans oignon" }, { name: "Sans oignon" }] }], [burger]);
  assert.equal(out[0].supplements.length, 1);
});

test("cases à cocher (multi) : plusieurs choix autorisés dans le groupe", () => {
  const out = sanitizeCartItems([{ menu_item_id: "b1", supplements: [{ name: "Sans oignon" }, { name: "Supplément steak" }] }], [burger]);
  assert.equal(out[0].supplements.length, 2);
});

test("choix obligatoire : la Formule Midi sans burger est refusée, avec un burger acceptée", () => {
  assert.equal(code(() => sanitizeCartItems([{ menu_item_id: "m1", supplements: [] }], [midi])), "choix_requis:Burger");
  assert.equal(sanitizeCartItems([{ menu_item_id: "m1", supplements: [{ name: "Smash Cheese" }] }], [midi])[0].detail, "Smash Cheese");
});

test("sans options choisies : liste vide, détail vide", () => {
  const out = sanitizeCartItems([{ menu_item_id: "b1" }], [burger]);
  assert.deepEqual(out[0], { menu_item_id: "b1", quantity: 1, supplements: [], detail: "" });
});

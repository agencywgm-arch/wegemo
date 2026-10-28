// Assainissement du panier pour les paiements en ligne.
//
// Le navigateur envoie, pour chaque ligne, les « suppléments » choisis (frites,
// boisson, retraits, extra steak…) AVEC leur prix. Les fonctions SQL
// price_cart_secure / create_order_secure additionnent ces prix tels quels :
// un client pourrait donc modifier la requête pour payer moins (ex. « Sans
// frites » à -300 €). Ici, on ne garde de ce que le navigateur envoie que les
// NOMS d'options ; les prix, groupes et règles viennent de la carte en base
// (menu_items.supplements), et les choix obligatoires / à choix unique sont
// vérifiés. Tout ce qui ne correspond pas à la carte est refusé.

export interface DbSupplement {
  name: string;
  price: number | string;
  group?: string;
  multi?: boolean;
  required?: boolean;
}

export interface DbMenuItem {
  id: string;
  supplements?: DbSupplement[] | null;
}

export interface CartLineIn {
  menu_item_id: string;
  quantity?: number;
  supplements?: Array<{ name?: string }> | null;
}

export interface CartLineOut {
  menu_item_id: string;
  quantity: number;
  supplements: Array<{ name: string; price: number; group?: string }>;
  detail: string;
}

export class CartOptionsError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

const MAX_QTY = 99;

export function sanitizeCartItems(items: CartLineIn[], dbItems: DbMenuItem[]): CartLineOut[] {
  const byId = new Map(dbItems.map((i) => [i.id, i]));
  return items.map((line) => {
    const db = byId.get(line.menu_item_id);
    if (!db) throw new CartOptionsError("article_introuvable");

    const quantity = Math.min(MAX_QTY, Math.max(1, Math.floor(Number(line.quantity) || 1)));
    const catalog = db.supplements ?? [];

    const chosen: DbSupplement[] = [];
    for (const s of line.supplements ?? []) {
      const name = typeof s?.name === "string" ? s.name : "";
      const found = catalog.find((c) => c.name === name);
      if (!found) throw new CartOptionsError(`supplement_inconnu:${name}`);
      if (!chosen.includes(found)) chosen.push(found);
    }

    const groups = [...new Set(catalog.filter((c) => c.group).map((c) => c.group as string))];
    for (const g of groups) {
      const members = catalog.filter((c) => c.group === g);
      const multi = members.some((m) => m.multi);
      const required = members.some((m) => m.required);
      const picked = chosen.filter((c) => c.group === g).length;
      if (!multi && picked > 1) throw new CartOptionsError(`choix_multiple:${g}`);
      if (required && picked === 0) throw new CartOptionsError(`choix_requis:${g}`);
    }

    return {
      menu_item_id: line.menu_item_id,
      quantity,
      supplements: chosen.map((c) => ({ name: c.name, price: Number(c.price), ...(c.group ? { group: c.group } : {}) })),
      detail: chosen.map((c) => c.name).join(", "),
    };
  });
}

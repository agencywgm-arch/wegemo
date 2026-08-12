// Client HubRise + mapping Wegemo → HubRise.
//
// HubRise est un middleware : on ne parle qu'à son API, et il traduit vers la
// caisse du restaurateur (CLYO aujourd'hui). Rien ici n'est spécifique à CLYO.
//
// Contrat API vérifié le 2026-08-09 sur les sources suivantes :
//   - https://www.hubrise.com/developers/api/authentication
//   - https://www.hubrise.com/developers/api/orders
//   - https://www.hubrise.com/developers/api/catalogs
//   - https://www.hubrise.com/developers/api/callbacks
//   - https://github.com/HubRise/ruby-client/blob/master/V1_ENDPOINTS.md
//     (liste d'endpoints officielle, source de vérité pour les chemins)
//   - https://github.com/HubRise/tiny-tablet (flux OAuth + en-têtes)
//
// Points de contrat à connaître :
//   * Les montants sont des CHAÎNES suffixées de la devise : "12.95 EUR".
//   * quantity est également une chaîne.
//   * Il n'existe PAS de champ payment_status. Une commande sans tableau
//     `payments` est considérée comme NON PAYÉE — c'est exactement ce qu'on
//     veut pour l'encaissement en caisse.
//   * Le tableau d'options du catalogue s'appelle `option_lists` (au singulier
//     sur "option", comme le `option_list_refs` que les SKU utilisent pour y
//     référer). Confirmé en recette le 2026-08-12 : `options_lists` (pluriel
//     aux deux mots, ma première hypothèse) est rejeté par l'API avec
//     "is not a valid key".

export const HUBRISE_OAUTH_BASE = "https://manager.hubrise.com/oauth2/v1";
export const HUBRISE_API_BASE = "https://api.hubrise.com/v1";

// Portée demandée au restaurateur : écrire les commandes, gérer le catalogue.
// On ne demande aucun accès aux clients HubRise : Wegemo gère les siens.
export const HUBRISE_SCOPE = "location[orders.write,catalog.write]";

export const CURRENCY = "EUR";

/** Formate un montant au format monétaire HubRise ("12.95 EUR"). */
export function money(amount: number | string, currency = CURRENCY): string {
  return `${Number(amount || 0).toFixed(2)} ${currency}`;
}

/**
 * Statuts de commande HubRise.
 * `awaiting_shipment` est déprécié côté HubRise et traité comme
 * `awaiting_collection` — on ne l'émet jamais, mais on sait le recevoir.
 */
export type HubriseStatus =
  | "new"
  | "received"
  | "accepted"
  | "in_preparation"
  | "awaiting_shipment"
  | "awaiting_collection"
  | "in_delivery"
  | "completed"
  | "rejected"
  | "cancelled"
  | "delivery_failed";

/**
 * Projection des statuts HubRise vers le suivi interne Wegemo.
 * Volontairement grossière : Wegemo n'a besoin que de savoir si la caisse a
 * pris la commande, l'a refusée, ou ne s'est pas encore prononcée.
 */
export function mapHubriseStatus(
  status: string,
): "sent" | "accepted" | "rejected" {
  switch (status) {
    case "accepted":
    case "in_preparation":
    case "awaiting_collection":
    case "awaiting_shipment":
    case "in_delivery":
    case "completed":
      return "accepted";
    case "rejected":
    case "cancelled":
    case "delivery_failed":
      return "rejected";
    // "new" / "received" : transmise, la caisse n'a pas encore tranché.
    default:
      return "sent";
  }
}

/** Statut de commande Wegemo → statut HubRise, pour les mises à jour sortantes. */
export function toHubriseStatus(wegemoStatus: string): HubriseStatus {
  switch (wegemoStatus) {
    case "PREPARING":
      return "in_preparation";
    case "READY":
      return "awaiting_collection";
    case "DONE":
      return "completed";
    default:
      return "received";
  }
}

export interface HubriseCall {
  ok: boolean;
  status: number;
  data: unknown;
  error?: string;
}

/**
 * Appel authentifié à l'API HubRise.
 * `retries` ne relance que sur les erreurs transitoires (réseau, 429, 5xx) :
 * un 4xx métier (article inconnu, location déconnectée) est définitif et
 * relancer ne ferait que retarder l'alerte au restaurateur.
 */
export async function hubriseFetch(
  path: string,
  accessToken: string,
  init: RequestInit = {},
  retries = 2,
): Promise<HubriseCall> {
  let lastError = "";

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${HUBRISE_API_BASE}${path}`, {
        ...init,
        headers: {
          "X-Access-Token": accessToken,
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });

      const text = await res.text();
      let data: unknown = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }

      if (res.ok) return { ok: true, status: res.status, data };

      // 429 = quota (HubRise limite certaines lectures à 10 req/min),
      // 5xx = incident côté HubRise : les deux valent une nouvelle tentative.
      const transient = res.status === 429 || res.status >= 500;
      lastError = extractError(data) ?? `http_${res.status}`;
      if (!transient || attempt === retries) {
        return { ok: false, status: res.status, data, error: lastError };
      }
    } catch (e) {
      // Erreur réseau : transitoire par nature.
      lastError = String((e as Error)?.message ?? e);
      if (attempt === retries) {
        return { ok: false, status: 0, data: null, error: lastError };
      }
    }

    // Repli exponentiel : 400ms, 800ms.
    await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
  }

  return { ok: false, status: 0, data: null, error: lastError };
}

function extractError(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const d = data as Record<string, unknown>;
  // HubRise renvoie parfois un message générique ("Validation failed") ET un
  // détail par champ dans `errors` — les deux sont utiles, on les combine
  // plutôt que de perdre le détail derrière le message générique.
  const parts: string[] = [];
  if (typeof d.message === "string") parts.push(d.message);
  if (typeof d.error === "string" && d.error !== d.message) parts.push(d.error);
  if (Array.isArray(d.errors) && d.errors.length) parts.push(JSON.stringify(d.errors));
  return parts.length ? parts.join(" — ") : undefined;
}

/* ==========================================================================
 * MAPPING CATALOGUE
 * ========================================================================== */

export interface WegemoMenuItem {
  id: string;
  name: string;
  description?: string | null;
  price: number | string;
  category?: string | null;
  supplements?: Array<{ name: string; price: number | string }> | null;
  available?: boolean;
  sort_order?: number | null;
}

/**
 * Construit le `data` d'un catalogue HubRise à partir du menu Wegemo.
 *
 * Les `ref` sont les identifiants qui feront le lien entre une ligne de
 * commande et l'article connu de la caisse : ils DOIVENT être stables dans le
 * temps. On utilise donc l'UUID Wegemo du produit, jamais son nom.
 *
 * Wegemo n'a pas de notion de variante (un produit = un prix), on émet donc un
 * SKU unique par produit, suffixé `-sku`.
 */
export function buildCatalogData(items: WegemoMenuItem[]) {
  const available = items.filter((i) => i.available !== false);

  // Catégories déduites du champ texte `category` des articles.
  const categoryNames = [
    ...new Set(available.map((i) => (i.category || "Autres").trim())),
  ];
  const categories = categoryNames.map((name) => ({
    ref: catRef(name),
    name,
  }));

  // Les suppléments Wegemo sont libres par article ; on crée donc une liste
  // d'options par article plutôt qu'un référentiel partagé, faute de pouvoir
  // deviner que deux suppléments homonymes sont le même.
  const option_lists: Array<Record<string, unknown>> = [];
  const products = available.map((item) => {
    const supplements = (item.supplements ?? []).filter((s) => s?.name);
    const optionListRefs: string[] = [];

    if (supplements.length) {
      const listRef = `opt-${item.id}`;
      optionListRefs.push(listRef);
      option_lists.push({
        ref: listRef,
        name: "Suppléments",
        // Choix libre et multiple : correspond au ComposeModal de Wegemo.
        min_selections: 0,
        max_selections: supplements.length,
        options: supplements.map((s, idx) => ({
          ref: `${listRef}-${idx}`,
          name: s.name,
          price: money(s.price),
        })),
      });
    }

    return {
      ref: item.id,
      name: item.name,
      description: item.description ?? "",
      category_ref: catRef(item.category || "Autres"),
      skus: [
        {
          ref: skuRef(item.id),
          name: item.name,
          price: money(item.price),
          option_list_refs: optionListRefs,
        },
      ],
    };
  });

  return {
    variants: [],
    categories,
    products,
    option_lists,
    deals: [],
    discounts: [],
    charges: [],
  };
}

/** Référence stable d'un SKU à partir de l'id produit Wegemo. */
export function skuRef(itemId: string): string {
  return `${itemId}-sku`;
}

/** Référence de catégorie : dérivée du nom, normalisée et sans accent. */
export function catRef(name: string): string {
  return (
    "cat-" +
      (name || "autres")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "cat-autres"
  );
}

/* ==========================================================================
 * MAPPING COMMANDE
 * ========================================================================== */

export interface WegemoOrderLine {
  menu_item_id: string;
  quantity: number;
  detail?: string | null;
  name: string;
  price: number | string;
  supplements?: Array<{ name: string; price: number | string }> | null;
}

export interface BuildOrderInput {
  wegemoOrderId: string;
  lines: WegemoOrderLine[];
  serviceType: "eat_in" | "collection";
  tableLabel?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  note?: string | null;
  total: number | string;
}

/**
 * Construit le payload d'une commande HubRise en mode ENCAISSEMENT EN CAISSE.
 *
 * Le tableau `payments` est délibérément absent : HubRise considère alors la
 * commande comme non payée, ce qui la fait remonter en caisse comme un
 * encaissement à réaliser. Aucun appel Stripe n'intervient dans ce flux.
 *
 * `private_ref` porte l'UUID de commande Wegemo : c'est la clé d'idempotence
 * (un renvoi de la même commande n'en crée pas une seconde côté caisse) et le
 * moyen de retrouver la commande locale depuis un webhook.
 */
export function buildOrderPayload(input: BuildOrderInput) {
  const items = input.lines.map((line) => {
    const options = (line.supplements ?? [])
      .filter((s) => s?.name)
      .map((s, idx) => ({
        option_list_name: "Suppléments",
        name: s.name,
        ref: `opt-${line.menu_item_id}-${idx}`,
        price: money(s.price),
      }));

    return {
      product_name: line.name,
      sku_ref: skuRef(line.menu_item_id),
      sku_name: line.name,
      price: money(line.price),
      quantity: String(line.quantity ?? 1),
      ...(line.detail ? { customer_notes: line.detail } : {}),
      ...(options.length ? { options } : {}),
    };
  });

  const customerName = (input.customerName ?? "").trim();

  return {
    status: "new",
    service_type: input.serviceType,
    private_ref: input.wegemoOrderId,
    // Repère lisible pour le personnel en caisse (n° ou libellé de table).
    ...(input.tableLabel ? { collection_code: input.tableLabel } : {}),
    ...(input.note ? { customer_notes: input.note } : {}),
    ...(customerName || input.customerEmail
      ? {
        customer: {
          ...(customerName ? { first_name: customerName } : {}),
          ...(input.customerEmail ? { email: input.customerEmail } : {}),
        },
      }
      : {}),
    items,
    total: money(input.total),
    // PAS de `payments` : commande à encaisser sur place. Ne pas ajouter de
    // paiement ici sans revoir tout le flux — ce serait déclarer à la caisse
    // que l'argent est déjà encaissé.
  };
}

/* ==========================================================================
 * WEBHOOKS
 * ========================================================================== */

/**
 * Vérifie la signature d'un événement HubRise.
 * HubRise signe le corps brut en HMAC-SHA256 avec le client secret de l'app et
 * place le résultat dans l'en-tête X-HubRise-Hmac-SHA256.
 */
export async function verifySignature(
  rawBody: string,
  signature: string | null,
  clientSecret: string,
): Promise<boolean> {
  if (!signature || !clientSecret) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(clientSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );

  // HubRise transmet la signature en base64.
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return timingSafeEqual(expected, signature.trim());
}

/** Comparaison à temps constant, pour ne pas fuiter la signature octet par octet. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

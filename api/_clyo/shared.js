// Aides communes aux endpoints du pont CLYO (api/clyo-*.js).
//
// Protocole documenté par CLYO pour interfacer un site de vente en ligne :
// texte à plat, pas JSON. Deux familles de délimiteurs différentes :
//   - lignes produit : champs joints par "|", terminées par "|^^"
//   - lignes commande : champs joints par "~~", terminées par "~~^^"
// Chaque ligne se termine par un retour à la ligne réel ("la première ligne
// est toujours celle des champs" implique un flux ligne par ligne).
//
// Ces fonctions tournent en Node (Vercel serverless), jamais dans le
// navigateur : la clé service-role Supabase ne doit exister que dans les
// variables d'environnement du projet Vercel.

import { createClient } from "@supabase/supabase-js";

export function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants côté Vercel");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export function serializeProductRow(fields) {
  return fields.map((f) => (f === null || f === undefined ? "" : String(f))).join("|") + "|^^\n";
}

export function serializeOrderRow(fields) {
  return fields.map((f) => (f === null || f === undefined ? "" : String(f))).join("~~") + "~~^^\n";
}

export const PRODUCT_FIELDS = [
  "idProd", "name", "description", "idCategExt", "isFormula",
  "idProductPrice", "idProdExt", "size", "priceWeb", "priceShop",
  "position", "idClyo",
];

export const ORDER_FIELDS = [
  "idCommande", "contenu", "contenuVisuel", "productFree", "amount", "frais",
  "dateLiv", "payement", "status", "supplement", "comment", "hourValue",
  "hourOpening", "nom", "email", "telephone", "libelle", "adr", "CP", "bat",
  "etage", "interphone", "porte", "digicode", "commentaire", "idShopExt",
  "keyAndPrice", "resultBNK", "ID_SHOP_CP", "amount_reduction",
  "id_carte_client", "id_table", "nb_couvert",
];

// Débit très permissif : la caisse sonde régulièrement, mais un abus (script
// externe qui matraque le token) doit être freiné. Compte les appels
// journalisés pour ce restaurant sur les 10 dernières secondes.
async function rateLimited(supabase, restaurantId) {
  const since = new Date(Date.now() - 10_000).toISOString();
  const { count } = await supabase
    .from("pos_sync_log")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .eq("direction", "inbound")
    .gte("created_at", since);
  return (count || 0) > 20;
}

// Authentifie un appel CLYO : token dans le chemin (isolation multi-tenant),
// mot de passe en query string (vide côté connexion = pas de contrôle,
// même comportement que la caisse elle-même). Journalise systématiquement.
export async function authenticateClyoRequest(req, action) {
  const supabase = supabaseAdmin();
  const token = req.query.token;
  const password = req.query.password || "";

  if (!token) {
    return { error: { status: 400, body: "token manquant" } };
  }

  const { data: conn, error } = await supabase
    .from("pos_connections")
    .select("id, restaurant_id, clyo_password, clyo_cb_label, status")
    .eq("clyo_site_token", token)
    .eq("provider", "clyo_native")
    .maybeSingle();

  if (error || !conn) {
    return { error: { status: 404, body: "connexion inconnue" } };
  }

  if (conn.clyo_password && conn.clyo_password !== password) {
    await logSync(supabase, {
      restaurant_id: conn.restaurant_id, direction: "inbound", action,
      ok: false, http_status: 401, message: "mot de passe invalide",
    });
    return { error: { status: 401, body: "mot de passe invalide" } };
  }

  if (await rateLimited(supabase, conn.restaurant_id)) {
    return { error: { status: 429, body: "trop de requêtes" } };
  }

  return { supabase, connection: conn };
}

export async function logSync(supabase, { restaurant_id, order_id = null, direction, action, ok, http_status = null, message = null }) {
  await supabase.from("pos_sync_log").insert({
    restaurant_id, order_id, direction, action, ok, http_status, message,
  });
}

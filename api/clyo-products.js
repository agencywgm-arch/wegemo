// Équivalents WGM de prodNoClyoKey.php (mapped=0) et prodClyoKey.php
// (mapped=1) — appelés par la caisse CLYO pour lister les produits du site,
// respectivement sans et avec identifiant CLYO déjà lié.
//
// idProductPrice = l'UUID du menu_item Wegemo : c'est cette valeur que la
// caisse renverra telle quelle à prodInfoUpdate_KEY.php (api/clyo-product-link.js).
import { authenticateClyoRequest, logSync, serializeProductRow, PRODUCT_FIELDS } from "./_clyo/shared.js";

export default async function handler(req, res) {
  const action = req.query.mapped === "1" ? "prodClyoKey" : "prodNoClyoKey";
  const { supabase, connection, error } = await authenticateClyoRequest(req, action);
  if (error) return res.status(error.status).send(error.body);

  const wantMapped = req.query.mapped === "1";
  let query = supabase
    .from("menu_items")
    .select("id, name, description, price, pos_ref")
    .eq("restaurant_id", connection.restaurant_id);
  query = wantMapped ? query.not("pos_ref", "is", null) : query.is("pos_ref", null);

  const { data: items, error: qErr } = await query;
  if (qErr) {
    await logSync(supabase, { restaurant_id: connection.restaurant_id, direction: "inbound", action, ok: false, http_status: 500, message: qErr.message });
    return res.status(500).send("erreur serveur");
  }

  let body = serializeProductRow(PRODUCT_FIELDS);
  for (const it of items) {
    body += serializeProductRow([
      "",                          // idProd (facultatif)
      it.name,
      it.description || "",
      "",                          // idCategExt (facultatif)
      "N",                         // isFormula
      it.id,                       // idProductPrice
      "",                          // idProdExt (facultatif)
      "1",                         // size
      Number(it.price || 0).toFixed(2), // priceWeb
      Number(it.price || 0).toFixed(2), // priceShop
      "0",                         // position
      it.pos_ref || "",            // idClyo
    ]);
  }

  await logSync(supabase, { restaurant_id: connection.restaurant_id, direction: "inbound", action, ok: true, http_status: 200, message: `${items.length} produit(s)` });
  await supabase.from("pos_connections").update({ clyo_last_products_pull_at: new Date().toISOString() }).eq("id", connection.id);

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  return res.status(200).send(body);
}

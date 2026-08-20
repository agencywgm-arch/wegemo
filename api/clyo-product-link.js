// Équivalents WGM de prodInfoUpdate_KEY.php (action=link) et
// delierProduit.php (action=unlink) — la caisse CLYO appelle ceci après que
// le restaurateur a lié/délié un article dans son écran "Lien des Article
// E-Commerce". idProductPrice = l'UUID du menu_item renvoyé par
// api/clyo-products.js ; idClyo = l'identifiant interne de l'article côté
// caisse, stocké tel quel dans menu_items.pos_ref (colonne déjà utilisée
// pour la même chose côté HubRise).
import { authenticateClyoRequest, logSync } from "./_clyo/shared.js";

export default async function handler(req, res) {
  const isLink = req.query.action !== "unlink";
  const action = isLink ? "prodInfoUpdate_KEY" : "delierProduit";
  const { supabase, connection, error } = await authenticateClyoRequest(req, action);
  if (error) return res.status(error.status).send(error.body);

  const idProductPrice = req.query.idProductPrice;
  if (!idProductPrice) {
    return res.status(400).send("idProductPrice manquant");
  }
  const newRef = isLink ? (req.query.idClyo || null) : null;
  if (isLink && !newRef) {
    return res.status(400).send("idClyo manquant");
  }

  const { data, error: uErr } = await supabase
    .from("menu_items")
    .update({ pos_ref: newRef })
    .eq("id", idProductPrice)
    .eq("restaurant_id", connection.restaurant_id)
    .select("id");

  const ok = !uErr && data && data.length > 0;
  await logSync(supabase, {
    restaurant_id: connection.restaurant_id, direction: "inbound", action, ok,
    http_status: ok ? 200 : 404,
    message: ok ? `menu_item ${idProductPrice} -> pos_ref=${newRef ?? "(vide)"}` : (uErr?.message || "article introuvable pour ce restaurant"),
  });

  if (!ok) return res.status(404).send("article introuvable");
  return res.status(200).send("OK");
}

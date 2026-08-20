// Équivalent WGM de updateOrder.php — CLYO appelle ceci pour chaque
// commande qu'elle a traitée, avec status=pre et idCommande = le numéro
// renvoyé par customerListOrder.php (clyo_order_seq, pas l'UUID Wegemo).
// C'est la confirmation explicite documentée par CLYO : on passe la
// commande de 'sent' à 'accepted'.
import { authenticateClyoRequest, logSync } from "./_clyo/shared.js";

export default async function handler(req, res) {
  const { supabase, connection, error } = await authenticateClyoRequest(req, "updateOrder");
  if (error) return res.status(error.status).send(error.body);

  const idCommande = req.query.idCommande;
  if (!idCommande || Number.isNaN(Number(idCommande))) {
    return res.status(400).send("idCommande manquant ou invalide");
  }

  const { data, error: uErr } = await supabase
    .from("orders")
    .update({ pos_sync_status: "accepted" })
    .eq("clyo_order_seq", Number(idCommande))
    .eq("restaurant_id", connection.restaurant_id)
    .select("id");

  const ok = !uErr && data && data.length > 0;
  await logSync(supabase, {
    restaurant_id: connection.restaurant_id,
    order_id: ok ? data[0].id : null,
    direction: "inbound", action: "updateOrder", ok,
    http_status: ok ? 200 : 404,
    message: ok ? `idCommande=${idCommande} -> accepted` : (uErr?.message || `idCommande=${idCommande} introuvable`),
  });

  if (!ok) return res.status(404).send("commande introuvable");
  return res.status(200).send("OK");
}

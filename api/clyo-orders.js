// Équivalent WGM de customerListOrder.php — la caisse CLYO sonde ceci pour
// récupérer les commandes à faire apparaître en caisse.
//
// Anti-doublon : on ne renvoie jamais une commande déjà transmise. Le flip
// pending/blocked -> sent se fait par un seul UPDATE ... WHERE ... RETURNING
// atomique ; la réponse HTTP n'est construite qu'à partir des lignes que CET
// appel a réellement fait basculer. Deux sondages simultanés ne peuvent donc
// jamais renvoyer la même commande deux fois.
//
// Un article de commande sans correspondance CLYO (menu_items.pos_ref vide)
// bloque uniquement CETTE commande, pas les autres : elle passe en
// pos_sync_status='blocked', visible dans le dashboard, et repart
// automatiquement au sondage suivant dès que le mapping est complété.
import { authenticateClyoRequest, logSync, serializeOrderRow, ORDER_FIELDS } from "./_clyo/shared.js";

export default async function handler(req, res) {
  const { supabase, connection, error } = await authenticateClyoRequest(req, "customerListOrder");
  if (error) return res.status(error.status).send(error.body);

  const { data: candidates, error: qErr } = await supabase
    .from("orders")
    .select(`
      id, table_id, total, discount, payment_method, customer_name, customer_email,
      note, created_at, pos_sync_status, clyo_order_seq,
      order_items ( quantity, menu_items ( id, name, price, pos_ref ) )
    `)
    .eq("restaurant_id", connection.restaurant_id)
    .in("pos_sync_status", ["pending", "blocked"])
    .order("created_at", { ascending: true });

  if (qErr) {
    await logSync(supabase, { restaurant_id: connection.restaurant_id, direction: "inbound", action: "customerListOrder", ok: false, http_status: 500, message: qErr.message });
    return res.status(500).send("erreur serveur");
  }

  let body = serializeOrderRow(ORDER_FIELDS);

  if (!candidates || candidates.length === 0) {
    await logSync(supabase, { restaurant_id: connection.restaurant_id, direction: "inbound", action: "customerListOrder", ok: true, http_status: 200, message: "0 commande" });
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(200).send(body);
  }

  const readyIds = [];
  const blocked = [];
  for (const o of candidates) {
    const missing = (o.order_items || []).filter((it) => !it.menu_items?.pos_ref);
    if (missing.length > 0) {
      blocked.push({ id: o.id, names: missing.map((m) => m.menu_items?.name || "article inconnu").join(", ") });
    } else {
      readyIds.push(o.id);
    }
  }

  for (const b of blocked) {
    await supabase.from("orders").update({ pos_sync_status: "blocked", pos_sync_error: `Articles non mappés CLYO : ${b.names}` }).eq("id", b.id);
    await logSync(supabase, { restaurant_id: connection.restaurant_id, order_id: b.id, direction: "inbound", action: "customerListOrder", ok: false, http_status: 200, message: `bloquée — ${b.names}` });
  }

  if (readyIds.length === 0) {
    await supabase.from("pos_connections").update({ clyo_last_orders_pull_at: new Date().toISOString() }).eq("id", connection.id);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(200).send(body);
  }

  // Flip atomique : ne récupère que les lignes réellement basculées par CET appel.
  const { data: flipped, error: flipErr } = await supabase
    .from("orders")
    .update({ pos_sync_status: "sent", pos_sync_error: null })
    .in("id", readyIds)
    .in("pos_sync_status", ["pending", "blocked"])
    .select("id");

  if (flipErr) {
    await logSync(supabase, { restaurant_id: connection.restaurant_id, direction: "inbound", action: "customerListOrder", ok: false, http_status: 500, message: flipErr.message });
    return res.status(500).send("erreur serveur");
  }

  const flippedIds = new Set((flipped || []).map((r) => r.id));
  const byId = Object.fromEntries(candidates.map((o) => [o.id, o]));

  const tableIds = [...new Set(candidates.filter((o) => flippedIds.has(o.id) && o.table_id).map((o) => o.table_id))];
  let tableNumbers = {};
  if (tableIds.length) {
    const { data: tables } = await supabase.from("tables").select("id, number").in("id", tableIds);
    tableNumbers = Object.fromEntries((tables || []).map((t) => [t.id, t.number]));
  }

  for (const id of flippedIds) {
    const o = byId[id];
    if (!o) continue;

    const { data: seqRow } = await supabase.rpc("clyo_assign_order_seq", { p_order_id: o.id });
    const idCommande = Array.isArray(seqRow) ? seqRow[0] : seqRow;

    const items = o.order_items || [];
    const keyAndPrice = items
      .map((it, i) => `Ligne${i}:Qty${it.quantity}>id${it.menu_items.pos_ref}>price${Number(it.menu_items.price || 0).toFixed(2)}`)
      .join("|") + (items.length ? "|" : "");

    const isCard = o.payment_method === "card";
    const dateLiv = new Date(o.created_at).toISOString().slice(0, 10);
    const tableNumber = o.table_id ? tableNumbers[o.table_id] : null;

    body += serializeOrderRow([
      idCommande,
      "", "",                                        // contenu, contenuVisuel (facultatif)
      "-1",                                           // productFree
      Number(o.total || 0).toFixed(2),                // amount (déjà net de remise)
      "0",                                             // frais
      dateLiv,
      isCard ? connection.clyo_cb_label : "Paiement en espèces / TPE au comptoir",
      "WAIT",                                          // status
      "",                                              // supplement
      o.note || "",                                    // comment
      "", "",                                          // hourValue, hourOpening
      o.customer_name || "",
      o.customer_email || "",
      "",                                              // telephone (non collecté)
      "", "", "", "", "", "", "", "", "",               // libelle..commentaire (livraison, N/A)
      "2",                                              // idShopExt : toujours magasin
      keyAndPrice,
      isCard ? "OK" : "",
      "",                                              // ID_SHOP_CP
      o.discount > 0 ? Number(o.discount).toFixed(2) : "",
      "",                                              // id_carte_client
      tableNumber ?? "",
      tableNumber ? "1" : "",                           // nb_couvert (nombre réel de couverts non encore tracé en base)
    ]);

    await logSync(supabase, { restaurant_id: connection.restaurant_id, order_id: o.id, direction: "inbound", action: "customerListOrder", ok: true, http_status: 200, message: `envoyée, idCommande=${idCommande}` });
  }

  await supabase.from("pos_connections").update({ clyo_last_orders_pull_at: new Date().toISOString() }).eq("id", connection.id);

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  return res.status(200).send(body);
}

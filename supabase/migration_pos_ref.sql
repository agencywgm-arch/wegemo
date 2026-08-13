-- Référence de l'article tel que connu par la caisse elle-même (ex: l'Id
-- interne CLYO), distincte de l'UUID Wegemo. Quand elle est renseignée,
-- hubrise-sync-catalog et hubrise-push-order l'utilisent comme sku_ref au
-- lieu d'inventer une référence — la caisse ne reconnaît que ses propres
-- codes.
alter table menu_items add column if not exists pos_ref text;

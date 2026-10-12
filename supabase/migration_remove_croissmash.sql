-- Retrait du Croissmash de la carte Baoma (demandé le 2026-10-12).
-- À exécuter dans l'éditeur SQL Supabase. Idempotent.
--
-- Jamais de DELETE sur menu_items : order_items.menu_item_id référence
-- menu_items(id) ON DELETE RESTRICT, donc un plat déjà commandé bloquerait la
-- suppression. On le désactive (available = false) : create_order_secure et la
-- carte client filtrent sur available = true, il disparaît donc partout.

update menu_items set available = false
 where restaurant_id = (select id from restaurants where slug = 'baoma')
   and name = 'Croissmash';

-- Vérification : doit afficher available = false.
select name, category, available
  from menu_items
 where restaurant_id = (select id from restaurants where slug = 'baoma')
   and name = 'Croissmash';

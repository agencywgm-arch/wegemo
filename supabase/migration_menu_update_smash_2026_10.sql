-- Mise à jour de la carte Baoma (famille Smash Bao + retraits divers)
-- demandée le 2026-10-05. À exécuter dans l'éditeur SQL Supabase.
--
-- Jamais de DELETE sur menu_items : order_items.menu_item_id référence
-- menu_items(id) ON DELETE RESTRICT (voir schema.sql), donc tout article
-- déjà commandé une seule fois bloquerait la suppression de toute façon.
-- Les retraits se font via available = false (déjà le mécanisme standard :
-- create_order_secure et price_cart_secure filtrent sur available = true).
--
-- Prix des 4 nouveaux Smash : pas de prix fournis par le client, alignés à
-- 14,90€ sur demande ("à peu près au prix des bao") — à ajuster depuis le
-- dashboard (Menu) dès que les vrais prix sont connus.
--
-- Hypothèse à vérifier : "Poulet Croustillant" existe sous ce nom identique
-- à la fois en Bao Créations (burger) et en Asian Fusion (bowl) — ce script
-- désactive les DEUX, le client n'ayant pas précisé lequel retirer. Si un
-- seul doit disparaître, réactive l'autre depuis le dashboard.

do $$
declare
  v_rest uuid;
begin
  select id into v_rest from restaurants where slug = 'baoma';
  if v_rest is null then
    raise exception 'Restaurant "baoma" introuvable — vérifie le slug avant de relancer.';
  end if;

  -- --- Retraits (désactivés, pas supprimés) ---------------------------------
  update menu_items set available = false
   where restaurant_id = v_rest
     and name in ('Smash Choji', 'Poulet Croustillant', 'Gyoza Crevette');

  -- --- Re-tarification : Cheese & Truffée gardés, alignés sur la famille ----
  update menu_items set price = 14.90
   where restaurant_id = v_rest
     and name in ('Smash Cheese', 'Smash Truffée');

  -- --- Nouveaux Smash --------------------------------------------------------
  -- photo_url réutilise temporairement la photo de Smash Bao Burger en
  -- attendant de vraies photos pour ces 4 plats (à remplacer depuis le
  -- dashboard dès qu'elles sont disponibles).
  insert into menu_items (restaurant_id, name, description, price, category, emoji, photo_url, is_popular, available, sort_order, is_menu)
  values
    (v_rest, 'Smash Braisé', 'Steak smashé, bœuf braisé effiloché, sauce maison, bun vapeur', 14.90, 'Smash Bao', '🍽️', '/menu/smash-bao-burger.jpg', false, true, 50, false),
    (v_rest, 'Smash Chèvre Miel', 'Steak smashé, chèvre fondant, miel, roquette, bun vapeur', 14.90, 'Smash Bao', '🍽️', '/menu/smash-bao-burger.jpg', false, true, 51, false),
    (v_rest, 'Smash Bacon', 'Steak smashé, bacon grillé, cheddar fondu, sauce maison, bun vapeur', 14.90, 'Smash Bao', '🍽️', '/menu/smash-bao-burger.jpg', false, true, 52, false),
    (v_rest, 'Smash Oignon', 'Steak smashé, oignons confits, oignons frits croustillants, sauce maison, bun vapeur', 14.90, 'Smash Bao', '🍽️', '/menu/smash-bao-burger.jpg', false, true, 53, false);
end $$;

-- Vérification : la carte Smash Bao après exécution.
select name, price, available
  from menu_items
 where restaurant_id = (select id from restaurants where slug = 'baoma')
   and category = 'Smash Bao'
 order by sort_order;

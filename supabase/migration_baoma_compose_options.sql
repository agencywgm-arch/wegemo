-- Options de composition des plats Baoma (menus déroulants dans la commande client).
-- À exécuter dans l'éditeur SQL Supabase. Idempotent : réexécutable sans effet de bord.
--
-- Burgers (Bao Créations, Smash Bao, Smash Burger) : choix de frites + choix de
-- boisson. Bowls (Asian Fusion) : boisson uniquement. Prix = ceux de la carte
-- (frites "avec Bao burger", la frite maison est incluse ; boissons au tarif carte).
-- Généré depuis src/baomaData.js (BAOMA_OPTIONS_BY_CATEGORY) : ne pas éditer à la main.
--
-- Rappel : create_order_secure additionne les prix de supplements envoyés par
-- le client ; ces valeurs doivent donc rester alignées avec la carte.

do $$
declare
  v_rest uuid;
begin
  select id into v_rest from restaurants where slug = 'baoma';
  if v_rest is null then
    raise exception 'Restaurant "baoma" introuvable — vérifie le slug avant de relancer.';
  end if;

  update menu_items set supplements = '[{"name":"Sans frites","price":0,"group":"Frites"},{"name":"Frites Paprika","price":1.2,"group":"Frites"},{"name":"Frites de Patate Douce","price":1.6,"group":"Frites"},{"name":"Frites Cheddar Maison","price":1.5,"group":"Frites"},{"name":"Frites Bacon Cheddar","price":3,"group":"Frites"},{"name":"Pepsi","price":2.5,"group":"Boisson"},{"name":"Pepsi Zero","price":2.5,"group":"Boisson"},{"name":"Pepsi Cherry","price":2.5,"group":"Boisson"},{"name":"Schweppes Pomme","price":2.5,"group":"Boisson"},{"name":"Schweppes Agrumes","price":2.5,"group":"Boisson"},{"name":"Orangina","price":2.5,"group":"Boisson"},{"name":"Oasis Tropical","price":2.5,"group":"Boisson"},{"name":"Ice Tea","price":2.5,"group":"Boisson"},{"name":"Perrier","price":2.5,"group":"Boisson"},{"name":"Eau","price":2.5,"group":"Boisson"},{"name":"Thé","price":2,"group":"Boisson"},{"name":"Café","price":2,"group":"Boisson"},{"name":"Mojito Violette","price":5.5,"group":"Boisson"},{"name":"Mojito Passion","price":5.5,"group":"Boisson"},{"name":"Mojito Cerise","price":5.5,"group":"Boisson"},{"name":"Mojito Kiwi","price":5.5,"group":"Boisson"},{"name":"Mojito Classique","price":5.5,"group":"Boisson"},{"name":"Thé Glacé Maison","price":5.5,"group":"Boisson"}]'::jsonb
   where restaurant_id = v_rest and category = 'Bao Créations' and is_menu = false;

  update menu_items set supplements = '[{"name":"Sans frites","price":0,"group":"Frites"},{"name":"Frites Paprika","price":1.2,"group":"Frites"},{"name":"Frites de Patate Douce","price":1.6,"group":"Frites"},{"name":"Frites Cheddar Maison","price":1.5,"group":"Frites"},{"name":"Frites Bacon Cheddar","price":3,"group":"Frites"},{"name":"Pepsi","price":2.5,"group":"Boisson"},{"name":"Pepsi Zero","price":2.5,"group":"Boisson"},{"name":"Pepsi Cherry","price":2.5,"group":"Boisson"},{"name":"Schweppes Pomme","price":2.5,"group":"Boisson"},{"name":"Schweppes Agrumes","price":2.5,"group":"Boisson"},{"name":"Orangina","price":2.5,"group":"Boisson"},{"name":"Oasis Tropical","price":2.5,"group":"Boisson"},{"name":"Ice Tea","price":2.5,"group":"Boisson"},{"name":"Perrier","price":2.5,"group":"Boisson"},{"name":"Eau","price":2.5,"group":"Boisson"},{"name":"Thé","price":2,"group":"Boisson"},{"name":"Café","price":2,"group":"Boisson"},{"name":"Mojito Violette","price":5.5,"group":"Boisson"},{"name":"Mojito Passion","price":5.5,"group":"Boisson"},{"name":"Mojito Cerise","price":5.5,"group":"Boisson"},{"name":"Mojito Kiwi","price":5.5,"group":"Boisson"},{"name":"Mojito Classique","price":5.5,"group":"Boisson"},{"name":"Thé Glacé Maison","price":5.5,"group":"Boisson"}]'::jsonb
   where restaurant_id = v_rest and category = 'Smash Bao' and is_menu = false;

  update menu_items set supplements = '[{"name":"Sans frites","price":0,"group":"Frites"},{"name":"Frites Paprika","price":1.2,"group":"Frites"},{"name":"Frites de Patate Douce","price":1.6,"group":"Frites"},{"name":"Frites Cheddar Maison","price":1.5,"group":"Frites"},{"name":"Frites Bacon Cheddar","price":3,"group":"Frites"},{"name":"Pepsi","price":2.5,"group":"Boisson"},{"name":"Pepsi Zero","price":2.5,"group":"Boisson"},{"name":"Pepsi Cherry","price":2.5,"group":"Boisson"},{"name":"Schweppes Pomme","price":2.5,"group":"Boisson"},{"name":"Schweppes Agrumes","price":2.5,"group":"Boisson"},{"name":"Orangina","price":2.5,"group":"Boisson"},{"name":"Oasis Tropical","price":2.5,"group":"Boisson"},{"name":"Ice Tea","price":2.5,"group":"Boisson"},{"name":"Perrier","price":2.5,"group":"Boisson"},{"name":"Eau","price":2.5,"group":"Boisson"},{"name":"Thé","price":2,"group":"Boisson"},{"name":"Café","price":2,"group":"Boisson"},{"name":"Mojito Violette","price":5.5,"group":"Boisson"},{"name":"Mojito Passion","price":5.5,"group":"Boisson"},{"name":"Mojito Cerise","price":5.5,"group":"Boisson"},{"name":"Mojito Kiwi","price":5.5,"group":"Boisson"},{"name":"Mojito Classique","price":5.5,"group":"Boisson"},{"name":"Thé Glacé Maison","price":5.5,"group":"Boisson"}]'::jsonb
   where restaurant_id = v_rest and category = 'Smash Burger' and is_menu = false;

  update menu_items set supplements = '[{"name":"Pepsi","price":2.5,"group":"Boisson"},{"name":"Pepsi Zero","price":2.5,"group":"Boisson"},{"name":"Pepsi Cherry","price":2.5,"group":"Boisson"},{"name":"Schweppes Pomme","price":2.5,"group":"Boisson"},{"name":"Schweppes Agrumes","price":2.5,"group":"Boisson"},{"name":"Orangina","price":2.5,"group":"Boisson"},{"name":"Oasis Tropical","price":2.5,"group":"Boisson"},{"name":"Ice Tea","price":2.5,"group":"Boisson"},{"name":"Perrier","price":2.5,"group":"Boisson"},{"name":"Eau","price":2.5,"group":"Boisson"},{"name":"Thé","price":2,"group":"Boisson"},{"name":"Café","price":2,"group":"Boisson"},{"name":"Mojito Violette","price":5.5,"group":"Boisson"},{"name":"Mojito Passion","price":5.5,"group":"Boisson"},{"name":"Mojito Cerise","price":5.5,"group":"Boisson"},{"name":"Mojito Kiwi","price":5.5,"group":"Boisson"},{"name":"Mojito Classique","price":5.5,"group":"Boisson"},{"name":"Thé Glacé Maison","price":5.5,"group":"Boisson"}]'::jsonb
   where restaurant_id = v_rest and category = 'Asian Fusion' and is_menu = false;
end $$;

-- Vérification : nombre d'options par catégorie après exécution.
select category, count(*) as plats, max(jsonb_array_length(supplements)) as options
  from menu_items
 where restaurant_id = (select id from restaurants where slug = 'baoma')
   and category in ('Bao Créations', 'Smash Bao', 'Smash Burger', 'Asian Fusion')
 group by category order by category;

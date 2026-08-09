-- Seed Baoma — restaurant + carte complète (49 produits).
-- À exécuter dans l'éditeur SQL Supabase APRÈS schema.sql et les migrations.
-- Idempotent : réexécutable sans dupliquer (upsert sur slug / (restaurant,nom)).
--
-- IMPORTANT : remplace l'email ci-dessous par celui de TON compte Wegemo
-- (celui avec lequel tu te connectes au dashboard), sinon le restaurant ne
-- t'appartiendra pas et les policies RLS te le masqueront.

do $$
declare
  v_owner uuid;
  v_rest  uuid;
begin
  select id into v_owner from profiles where email = 'agencywgm@gmail.com' limit 1;
  if v_owner is null then
    raise exception 'Aucun profil pour cet email — connecte-toi au moins une fois au dashboard, puis relance ce script.';
  end if;

  insert into restaurants (owner_id, name, address, logo_emoji, tables_count, slug)
  values (v_owner, 'Baoma', '', '🐼', 12, 'baoma')
  on conflict (slug) do update set name = excluded.name, logo_emoji = excluded.logo_emoji
  returning id into v_rest;

  if v_rest is null then
    select id into v_rest from restaurants where slug = 'baoma';
  end if;

  -- Tables 1 → 12 (+ table 0 = vente à emporter / lien direct)
  insert into tables (restaurant_id, number, qr_url)
  select v_rest, g, '' from generate_series(0, 12) g
  on conflict (restaurant_id, number) do nothing;

  -- Réglages : palette Baoma côté reçus/branding
  insert into restaurant_settings (restaurant_id, category_order)
  values (v_rest, '["Bao Créations","Smash Bao","Asian Fusion","Starters","Starters Signatures","Wings","Sides","Desserts","Mojitos & Boissons","Formules"]'::jsonb)
  on conflict (restaurant_id) do update set category_order = excluded.category_order;

  -- Carte
  delete from menu_items where restaurant_id = v_rest;
  insert into menu_items (restaurant_id, name, description, price, category, emoji, photo_url, is_popular, available, sort_order, is_menu) values
    (v_rest, 'Boeuf Croustillant', 'Boeuf croustillant, sauce maison, cheddar fondu, bun vapeur', 14.9, 'Bao Créations', '🍽️', '/menu/boeuf-croustillant-burger.jpg', false, true, 1, false),
    (v_rest, 'Boeuf Fondant', 'Boeuf fondant mijoté, oignons caramélisés, cheddar fondu', 14.9, 'Bao Créations', '🍽️', '/menu/boeuf-fondant.jpg', false, true, 2, false),
    (v_rest, 'Poulet Croustillant', 'Poulet croustillant, sauce maison, cheddar fondu, bun vapeur', 14.9, 'Bao Créations', '🍽️', '/menu/poulet-croustillant-burger.jpg', false, true, 3, false),
    (v_rest, 'Fried Chicken / Spicy', 'Poulet pané, sauce épicée aigre-douce, sésame', 12.9, 'Bao Créations', '🍽️', '/menu/fried-chicken-spicy.jpg', false, true, 4, false),
    (v_rest, 'Chicken Thaï', 'Poulet grillé façon thaï, oignons rouges, cheddar fondu', 12.9, 'Bao Créations', '🍽️', '/menu/chicken-thai-burger.jpg', false, true, 5, false),
    (v_rest, 'Bao Végé', 'Avocat, oeuf au plat, salade, oignons rouges, sésame, bun vapeur', 12.9, 'Bao Créations', '🍽️', '/menu/bao-vege.jpg', false, true, 6, false),
    (v_rest, 'Bao Fried Chicken Moutarde-Miel', 'Poulet croustillant, cheddar fondu, sauce miel moutarde, salade, bun vapeur', 12.9, 'Bao Créations', '🍽️', '/menu/bao-fried-chicken-moutarde-miel.jpg', false, true, 7, false),
    (v_rest, 'Crazy Champi', 'Double steak smashé, champignons, sauce crémeuse maison', 17.9, 'Smash Bao', '🍽️', '/menu/crazy-champi.jpg', false, true, 8, false),
    (v_rest, 'Smash Choji', 'Steak smashé, oignon frit croustillant, sauce signature', 15.9, 'Smash Bao', '🍽️', '/menu/smash-choji.jpg', false, true, 9, false),
    (v_rest, 'Smash Bao Burger', 'Steak smashé, champignons confits, sauce crémeuse, bun vapeur', 13.9, 'Smash Bao', '🍽️', '/menu/smash-bao-burger.jpg', false, true, 10, false),
    (v_rest, 'Konoha Smash', 'Double steak smashé, cheddar fondu, oignons rouges confits', 14.9, 'Smash Bao', '🍽️', '/menu/konoha-smash.jpg', false, true, 11, false),
    (v_rest, 'Croissmash', 'Croissant au beurre, sauce bbq, sauce Smoky bacon, salade, double cheddar, double steak smashés', 12.9, 'Smash Bao', '🍽️', '/menu/croissmash.jpg', false, true, 12, false),
    (v_rest, 'Smash Cheese', 'Steak smashé, cheddar fondu, oignons rouges, sauce maison, bun vapeur', 11.9, 'Smash Bao', '🍽️', '/menu/smash-cheese.jpg', false, true, 13, false),
    (v_rest, 'Smash Truffée', 'Double steak smashé, champignons grillés, cheddar, sauce crémeuse à la truffe', 17.9, 'Smash Bao', '🍽️', '/menu/smash-truffee.jpg', false, true, 14, false),
    (v_rest, 'Boeuf Croustillant', 'Riz vinaigré, boeuf croustillant, oeuf mariné, légumes sautés', 14.9, 'Asian Fusion', '🍽️', '/menu/boeuf-croustillant-bowl.jpg', false, true, 15, false),
    (v_rest, 'Crousty Chicken', 'Riz vinaigré, poulet croustillant, oeuf mariné, légumes sautés', 13.9, 'Asian Fusion', '🍽️', '/menu/crousty-chicken.jpg', false, true, 16, false),
    (v_rest, 'Poulet Croustillant', 'Riz vinaigré, poulet croustillant, oeuf mariné, sésame', 13.9, 'Asian Fusion', '🍽️', '/menu/poulet-croustillant-bowl.jpg', false, true, 17, false),
    (v_rest, 'Poulet Thaï', 'Riz vinaigré, poulet grillé façon thaï, oeuf mariné', 13.5, 'Asian Fusion', '🍽️', '/menu/poulet-thai.jpg', false, true, 18, false),
    (v_rest, 'Crevette Thaï', 'Riz vinaigré, crevettes sautées, oeuf mariné, légumes croquants', 14.9, 'Asian Fusion', '🍽️', '/menu/crevette-thai.jpg', false, true, 19, false),
    (v_rest, 'Nêms Poulet', '2 pièces, sauce aigre-douce', 3.9, 'Starters', '🍽️', '/menu/nems-poulet.jpg', false, true, 20, false),
    (v_rest, 'Nêms Crevette', '2 pièces, sauce aigre-douce', 3.9, 'Starters', '🍽️', '/menu/nems-crevette.jpg', false, true, 21, false),
    (v_rest, 'Gyoza Crevette', '2 pièces, sauce aigre-douce', 3.9, 'Starters', '🍽️', '/menu/gyoza-crevette.jpg', false, true, 22, false),
    (v_rest, 'Tempura Crevette', '2 pièces, sauce aigre-douce', 3.9, 'Starters', '🍽️', '/menu/tempura-crevette.jpg', false, true, 23, false),
    (v_rest, 'Chicken Rasengan', 'Bouchées de poulet pané, sauce Rasengan épicée, coriandre', 6.9, 'Starters Signatures', '🍽️', '/menu/chicken-rasengan.jpg', false, true, 24, false),
    (v_rest, 'Chidori Shrimp', 'Crevettes panées croustillantes, sauce épicée signature, coriandre', 7.9, 'Starters Signatures', '🍽️', '/menu/chidori-shrimp.jpg', false, true, 25, false),
    (v_rest, 'Boeuf Fromage', '2 pièces, boeuf mariné, cheddar fondant, glaçage sésame', 6, 'Starters Signatures', '🍽️', '/menu/boeuf-fromage.jpg', false, true, 26, false),
    (v_rest, 'Boeuf Fromage Crunchy', '2 pièces, panure croustillante, coeur cheddar fondant', 6.9, 'Starters Signatures', '🍽️', '/menu/boeuf-fromage-crunchy.jpg', false, true, 27, false),
    (v_rest, 'Wings Korean Style', '4 pièces : 6.00€ · 6 pièces : 8.00€ · sauce coréenne épicée, sésame', 6, 'Wings', '🍽️', '/menu/wings-korean-style.jpg', false, true, 28, false),
    (v_rest, 'Wings Korean Moutarde-Miel', '4 pièces : 6.00€ · 6 pièces : 8.00€ · sauce miel moutarde coréenne, sésame', 6, 'Wings', '🍽️', '/menu/wings-korean-moutarde-miel.jpg', false, true, 29, false),
    (v_rest, 'Wings Thai Style', '4 pièces : 6.00€ · 6 pièces : 8.00€ · sauce thaï épicée, sésame', 6, 'Wings', '🍽️', '/menu/wings-thai-style.jpg', false, true, 30, false),
    (v_rest, 'Frites Maison', 'Seules : 3.00€', 3, 'Sides', '🍽️', '/menu/frites-maison.jpg', false, true, 31, false),
    (v_rest, 'Frites Paprika', 'Seules : 3.50€ · avec Bao burger : +1.20€', 3.5, 'Sides', '🍽️', '/menu/frites-paprika.jpg', false, true, 32, false),
    (v_rest, 'Frites de Patate Douce', 'Seules : 4.00€ · avec Bao burger : +1.60€', 4, 'Sides', '🍽️', '/menu/frites-patate-douce.jpg', false, true, 33, false),
    (v_rest, 'Frites Cheddar Maison', 'Seules : 4.50€ · avec Bao burger : +1.50€', 4.5, 'Sides', '🍽️', '/menu/frites-cheddar-maison.jpg', false, true, 34, false),
    (v_rest, 'Frites Bacon Cheddar', 'Seules : 5.50€ · avec Bao burger : +3.00€', 5.5, 'Sides', '🍽️', '/menu/frites-bacon-cheddar.jpg', false, true, 35, false),
    (v_rest, 'Cheesecake Fruits Rouges', 'Cheesecake new-yorkais, coulis de fruits rouges', 6.9, 'Desserts', '🍽️', '/menu/cheesecake-fruits-rouges.jpg', false, true, 36, false),
    (v_rest, 'Cheesecake Mangue', 'Cheesecake new-yorkais, coulis de mangue', 6.9, 'Desserts', '🍽️', '/menu/cheesecake-mangue.jpg', false, true, 37, false),
    (v_rest, 'Cheesecake Caramel', 'Cheesecake new-yorkais, caramel, éclats de noisettes', 6.9, 'Desserts', '🍽️', '/menu/cheesecake-caramel.jpg', false, true, 38, false),
    (v_rest, 'Brioche Perdue Caramel', 'Brioche perdue, glace vanille, caramel, éclats de noisettes', 8.9, 'Desserts', '🍽️', '/menu/brioche-perdue-caramel.jpg', false, true, 39, false),
    (v_rest, 'Brioche Perdue Chocolat', 'Brioche perdue, chantilly, chocolat, fruits rouges', 8.9, 'Desserts', '🍽️', '/menu/brioche-perdue-chocolat.jpg', false, true, 40, false),
    (v_rest, 'Brookie au Chocolat', 'Brownie-cookie fondant, pépites de chocolat, glace vanille', 6.5, 'Desserts', '🍽️', '/menu/brookie-chocolat.jpg', false, true, 41, false),
    (v_rest, 'Mojito Violette', 'Citron vert, menthe fraîche, sirop de violette', 5.5, 'Mojitos & Boissons', '🍽️', '/menu/mojito-violette.jpg', false, true, 42, false),
    (v_rest, 'Mojito Passion', 'Citron vert, menthe fraîche, fruit de la passion', 5.5, 'Mojitos & Boissons', '🍽️', '/menu/mojito-passion.jpg', false, true, 43, false),
    (v_rest, 'Mojito Cerise', 'Citron vert, menthe fraîche, sirop de cerise', 5.5, 'Mojitos & Boissons', '🍽️', '/menu/mojito-cerise.jpg', false, true, 44, false),
    (v_rest, 'Mojito Kiwi', 'Citron vert, menthe fraîche, kiwi', 5.5, 'Mojitos & Boissons', '🍽️', '/menu/mojito-kiwi.jpg', false, true, 45, false),
    (v_rest, 'Mojito Classique', 'Citron vert, menthe fraîche, sucre de canne', 5.5, 'Mojitos & Boissons', '🍽️', '/menu/mojito-classique.jpg', false, true, 46, false),
    (v_rest, 'Thé Glacé Maison', 'Thé glacé maison, menthe fraîche', 5.5, 'Mojitos & Boissons', '🍽️', '/menu/the-glace.jpg', false, true, 47, false),
    (v_rest, 'Menu Midi', 'Burger + frites — formule valable de 12h à 15h, du lundi au vendredi · Au choix : Végé, Fried Chicken, Cheese Burger, Smash Bao, Chicken Thaï · Boisson au choix : +1.50€ · Cocktail au choix : +3.50€', 15.9, 'Formules', '🍽️', '/menu/menu-midi.jpg', true, true, 48, true),
    (v_rest, 'Menu Enfant', 'Burger ou Nuggets · + 1 frite · + 1 boisson · + 1 compote ou 1 boule de glace', 9.9, 'Formules', '🍽️', '/menu/menu-enfant.jpg', true, true, 49, true);

  raise notice 'Baoma OK — restaurant % , % produits', v_rest, 49;
end $$;

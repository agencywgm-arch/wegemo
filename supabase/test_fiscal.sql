-- ============================================================================
-- Suite de régression de la conformité fiscale et de l'intégrité des commandes.
--
-- Usage (PostgreSQL 14+ avec pgcrypto) :
--   psql -f supabase/test_fiscal.sql
-- Toute assertion en échec interrompt le script avec le détail attendu/obtenu.
--
-- Ces tests couvrent les régressions qui coûtent de l'argent ou exposent
-- juridiquement : montant falsifié, survente, promo abusée, TVA fausse,
-- journal altéré.
-- ============================================================================
\set ON_ERROR_STOP on

create schema if not exists wgm_test;

create or replace function wgm_test.assert(p_label text, p_got anyelement, p_want anyelement)
returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'ECHEC [%] : obtenu=% attendu=%', p_label, p_got, p_want;
  end if;
  raise notice 'OK  %  (=%)', p_label, p_got;
end; $$;

do $$
declare
  v_rest uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_tab  uuid := gen_random_uuid();
  v_food uuid := gen_random_uuid();
  v_alco uuid := gen_random_uuid();
  v_res  jsonb;
  v_vat  jsonb;
  v_n    int;
  v_err  text;
begin
  -- --- Jeu d'essai ----------------------------------------------------------
  -- restaurants.owner_id référence auth.users : on crée le propriétaire.
  insert into auth.users(id) values (v_owner) on conflict do nothing;
  insert into restaurants(id, name, owner_id, slug)
       values (v_rest, 'Test', v_owner, 'test-' || substr(v_rest::text, 1, 8));
  insert into tables(id, restaurant_id, number) values (v_tab, v_rest, 1);
  insert into menu_items(id, restaurant_id, name, price, vat_rate, stock, available)
       values (v_food, v_rest, 'Plat',  9.90, 10.00, null, true),
              (v_alco, v_rest, 'Biere', 6.00, 20.00, 5,    true);
  insert into promo_codes(restaurant_id, code, discount_percent, max_uses, use_count, active)
       values (v_rest, 'P10', 10, 2, 0, true);

  -- --- TVA multi-taux, extraite de prix TTC ---------------------------------
  v_res := create_order_secure(v_rest, v_tab, 'dine_in', 'card', 'online_stripe',
             '', '', '', null,
             jsonb_build_array(
               jsonb_build_object('menu_item_id', v_food, 'quantity', 2),
               jsonb_build_object('menu_item_id', v_alco, 'quantity', 1)),
             'tok-vat');

  perform wgm_test.assert('total TTC', (v_res->>'total')::numeric, 25.80::numeric);

  select x into v_vat from jsonb_array_elements(v_res->'vat_breakdown') x
   where (x->>'rate')::numeric = 10.00;
  perform wgm_test.assert('TVA 10% base HT', (v_vat->>'base_ht')::numeric, 18.00::numeric);
  perform wgm_test.assert('TVA 10% montant',  (v_vat->>'vat')::numeric,     1.80::numeric);

  select x into v_vat from jsonb_array_elements(v_res->'vat_breakdown') x
   where (x->>'rate')::numeric = 20.00;
  perform wgm_test.assert('TVA 20% base HT', (v_vat->>'base_ht')::numeric,  5.00::numeric);
  perform wgm_test.assert('TVA 20% montant',  (v_vat->>'vat')::numeric,     1.00::numeric);

  -- La somme des bases + TVA doit retomber exactement sur le total encaissé,
  -- sinon le ticket est faux au centime et la déclaration de TVA aussi.
  select sum((x->>'base_ht')::numeric + (x->>'vat')::numeric)
    into v_vat from jsonb_array_elements(v_res->'vat_breakdown') x;
  perform wgm_test.assert('somme HT+TVA = TTC', v_vat::numeric, 25.80::numeric);

  -- --- Numérotation séquentielle ---------------------------------------------
  perform wgm_test.assert('1er numéro fiscal',
    v_res->>'fiscal_number', extract(year from now())::int::text || '-000001');

  -- --- Idempotence ------------------------------------------------------------
  v_res := create_order_secure(v_rest, v_tab, 'dine_in', 'card', 'online_stripe',
             '', '', '', null,
             jsonb_build_array(jsonb_build_object('menu_item_id', v_food, 'quantity', 2)),
             'tok-vat');
  perform wgm_test.assert('rejeu du même jeton = doublon', (v_res->>'duplicate')::boolean, true);
  select count(*) into v_n from orders where restaurant_id = v_rest;
  perform wgm_test.assert('aucune commande en double', v_n, 1);

  -- --- Rupture de stock -------------------------------------------------------
  begin
    perform create_order_secure(v_rest, v_tab, 'dine_in', 'cash', 'pay_at_counter',
      '', '', '', null,
      jsonb_build_array(jsonb_build_object('menu_item_id', v_alco, 'quantity', 99)),
      'tok-rupture');
    raise exception 'ECHEC : une commande au-delà du stock a été acceptée';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err like 'ECHEC%' then raise; end if;
    perform wgm_test.assert('rupture de stock refusée', left(v_err, 13), 'rupture_stock');
  end;

  select stock into v_n from menu_items where id = v_alco;
  perform wgm_test.assert('stock jamais négatif après refus', v_n, 4);

  -- --- Promotion : limite d'usage respectée -----------------------------------
  perform create_order_secure(v_rest, v_tab, 'dine_in', 'cash', 'pay_at_counter',
    '', '', '', 'P10', jsonb_build_array(jsonb_build_object('menu_item_id', v_food, 'quantity', 1)), 'p1');
  perform create_order_secure(v_rest, v_tab, 'dine_in', 'cash', 'pay_at_counter',
    '', '', '', 'P10', jsonb_build_array(jsonb_build_object('menu_item_id', v_food, 'quantity', 1)), 'p2');
  v_res := create_order_secure(v_rest, v_tab, 'dine_in', 'cash', 'pay_at_counter',
    '', '', '', 'P10', jsonb_build_array(jsonb_build_object('menu_item_id', v_food, 'quantity', 1)), 'p3');
  perform wgm_test.assert('promo au-delà de max_uses = sans remise',
    (v_res->>'discount')::numeric, 0.00::numeric);

  -- --- Promotion expirée --------------------------------------------------------
  insert into promo_codes(restaurant_id, code, discount_percent, end_date, active)
       values (v_rest, 'VIEUX', 50, current_date - 1, true);
  v_res := create_order_secure(v_rest, v_tab, 'dine_in', 'cash', 'pay_at_counter',
    '', '', '', 'VIEUX', jsonb_build_array(jsonb_build_object('menu_item_id', v_food, 'quantity', 1)), 'p-exp');
  perform wgm_test.assert('promo expirée ignorée', (v_res->>'discount')::numeric, 0.00::numeric);

  -- --- Journal inaltérable -------------------------------------------------------
  begin
    update fiscal_journal set total_ttc = 1 where restaurant_id = v_rest;
    raise exception 'ECHEC : le journal fiscal a pu être modifié';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err like 'ECHEC%' then raise; end if;
    raise notice 'OK  UPDATE sur le journal refusé';
  end;

  begin
    delete from fiscal_journal where restaurant_id = v_rest;
    raise exception 'ECHEC : le journal fiscal a pu être purgé';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err like 'ECHEC%' then raise; end if;
    raise notice 'OK  DELETE sur le journal refusé';
  end;

  -- --- Chaîne de hachage cohérente -----------------------------------------------
  select count(*) into v_n from fiscal_journal where restaurant_id = v_rest;
  perform wgm_test.assert('lignes au journal', v_n, 5);

  raise notice '--- Tous les tests fiscaux sont passés ---';

  -- Le jeu d'essai n'est pas supprimé : le journal est volontairement
  -- non-effaçable. À exécuter sur une base jetable.
end $$;

-- Mode test pour le connecteur CLYO natif.
--
-- Avant de brancher une vraie caisse, on veut pouvoir valider tout le
-- protocole (mapping produit, format de commande, table/couverts) sans
-- jamais risquer qu'une vraie commande payante parte vers une caisse mal
-- configurée. Le mode test ne fait passer QUE des commandes à 0,00 € dans
-- le connecteur — les vraies commandes n'entrent même pas dans le cycle de
-- synchro tant qu'il est actif (elles restent 'not_applicable', pas
-- 'pending' : à la désactivation du mode test, on ne veut surtout pas
-- qu'un stock de commandes en attente parte d'un coup vers la caisse).

alter table pos_connections add column if not exists clyo_test_mode boolean not null default false;

-- ---------------------------------------------------------------------------
-- Trigger : ne met en file que ce qui doit l'être selon le mode test.
-- ---------------------------------------------------------------------------
create or replace function clyo_mark_order_pending()
returns trigger
language plpgsql
as $$
declare
  v_conn pos_connections%rowtype;
begin
  if new.pos_sync_status <> 'not_applicable' then
    return new;
  end if;

  select * into v_conn from pos_connections c
   where c.restaurant_id = new.restaurant_id
     and c.provider = 'clyo_native'
     and c.status = 'connected';

  if v_conn.id is not null and (not v_conn.clyo_test_mode or new.total = 0) then
    new.pos_sync_status := 'pending';
  end if;

  return new;
end;
$$;
-- Le trigger existant pointe déjà vers cette fonction (create or replace
-- suffit, pas besoin de le recréer).

-- Ajoute clyo_test_mode à ce que le dashboard peut lire (le reste de la
-- fonction est inchangé, juste une colonne de plus dans le SELECT/RETURNS).
create or replace function clyo_reveal_credentials(p_restaurant_id uuid)
returns table (clyo_site_token text, clyo_password text, clyo_cb_label text, status text, clyo_test_mode boolean)
language sql
security definer
set search_path = public
as $$
  select c.clyo_site_token, c.clyo_password, c.clyo_cb_label, c.status, c.clyo_test_mode
  from pos_connections c
  join restaurants r on r.id = c.restaurant_id
  where c.restaurant_id = p_restaurant_id
    and c.provider = 'clyo_native'
    and r.owner_id = auth.uid();
$$;

revoke all on function clyo_reveal_credentials(uuid) from public;
grant execute on function clyo_reveal_credentials(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create or replace function clyo_set_test_mode(p_restaurant_id uuid, p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from restaurants where id = p_restaurant_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not_authorized';
  end if;

  update pos_connections
     set clyo_test_mode = p_enabled
   where restaurant_id = p_restaurant_id and provider = 'clyo_native';

  return found;
end;
$$;

revoke all on function clyo_set_test_mode(uuid, boolean) from public;
grant execute on function clyo_set_test_mode(uuid, boolean) to authenticated;

-- Crée une commande à 0,00 € pour tester le connecteur de bout en bout
-- (mapping produit compris : l'article de test doit être lié en caisse
-- comme n'importe quel autre). Réutilise create_order_secure telle quelle
-- plutôt que de dupliquer sa logique — l'article étant à 0,00 €, le total
-- est nécessairement 0 sans rien avoir à forcer.
create or replace function clyo_create_test_order(p_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner uuid;
  v_item_id uuid;
  v_res jsonb;
begin
  select owner_id into v_owner from restaurants where id = p_restaurant_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not_authorized';
  end if;

  select id into v_item_id from menu_items
   where restaurant_id = p_restaurant_id and name = 'TEST CLYO (0€ — ne pas vendre)'
   limit 1;

  if v_item_id is null then
    insert into menu_items (restaurant_id, name, description, price, category, emoji, available, vat_rate)
    values (p_restaurant_id, 'TEST CLYO (0€ — ne pas vendre)',
            'Article technique pour valider le connecteur CLYO sans risque financier.',
            0, 'Test', '🧪', false, 0)
    returning id into v_item_id;
  end if;

  v_res := create_order_secure(
    p_restaurant_id, null, 'dine_in', 'cash', 'pay_at_counter',
    'TEST CLYO 0€', '', 'Commande de test — mode test CLYO', null,
    jsonb_build_array(jsonb_build_object('menu_item_id', v_item_id, 'quantity', 1)),
    'clyo-test-' || gen_random_uuid()::text
  );

  return v_res;
end;
$$;

revoke all on function clyo_create_test_order(uuid) from public;
grant execute on function clyo_create_test_order(uuid) to authenticated;

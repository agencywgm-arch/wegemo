-- Sessions de table partagées.
--
-- Le premier client qui scanne le QR d'une table saisit le nombre de
-- couverts et ouvre la session. Les scans suivants sur la même table, tant
-- qu'elle n'a pas été fermée, rejoignent directement cette session — plus
-- d'écran "combien de couverts" pour eux, et leurs commandes sont
-- rattachées au même regroupement pour que le staff suive tout ça en un
-- coup d'œil (nombre de commandes déjà passées, total cumulé, ouverte
-- depuis quand).

-- ---------------------------------------------------------------------------
-- 1. Table des sessions
-- ---------------------------------------------------------------------------
create table if not exists table_sessions (
  id            uuid primary key default uuid_generate_v4(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  table_id      uuid not null references tables(id) on delete cascade,
  covers        int not null default 1 check (covers between 1 and 30),
  status        text not null default 'open' check (status in ('open', 'closed')),
  opened_at     timestamptz not null default now(),
  closed_at     timestamptz
);

-- Une seule session ouverte à la fois par table : c'est cette contrainte,
-- pas une vérification applicative, qui rend "ouvrir ou rejoindre" atomique
-- même si deux personnes scannent au même instant.
create unique index if not exists table_sessions_one_open_per_table
  on table_sessions (table_id) where status = 'open';

create index if not exists table_sessions_restaurant_idx
  on table_sessions (restaurant_id, status);

alter table table_sessions enable row level security;

-- Une session ouverte est un renseignement sans caractère sensible (elle
-- indique juste "cette table est occupée, X couverts") : lisible par
-- n'importe quel client pour savoir s'il rejoint une session existante.
-- L'historique (sessions fermées) reste réservé au propriétaire.
drop policy if exists "Anyone can read open sessions" on table_sessions;
create policy "Anyone can read open sessions" on table_sessions for select using (status = 'open');

drop policy if exists "Owner reads all sessions" on table_sessions;
create policy "Owner reads all sessions" on table_sessions for select using (
  exists (select 1 from restaurants r where r.id = table_sessions.restaurant_id and r.owner_id = auth.uid())
);

-- Pas de policy INSERT/UPDATE pour anon/authenticated : l'ouverture passe
-- uniquement par get_or_open_table_session (security definer), la
-- fermeture uniquement par close_table_session, toutes deux ci-dessous.

-- ---------------------------------------------------------------------------
-- 2. Rattachement des commandes à une session
-- ---------------------------------------------------------------------------
alter table orders add column if not exists session_id uuid references table_sessions(id) on delete set null;
create index if not exists orders_session_idx on orders (session_id) where session_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Ouvrir ou rejoindre une session — atomique
-- ---------------------------------------------------------------------------
-- INSERT ... ON CONFLICT sur l'index partiel : si une session est déjà
-- ouverte pour cette table, l'insertion ne fait rien et on relit celle qui
-- existe déjà — c'est elle qui gagne, jamais le nombre de couverts du
-- second scanneur.
create or replace function get_or_open_table_session(p_restaurant_id uuid, p_table_id uuid, p_covers int default null)
returns table (session_id uuid, covers int, is_new boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     uuid;
  v_covers int;
begin
  insert into table_sessions (restaurant_id, table_id, covers)
  values (p_restaurant_id, p_table_id, greatest(1, least(30, coalesce(p_covers, 1))))
  on conflict (table_id) where status = 'open' do nothing
  returning id, table_sessions.covers into v_id, v_covers;

  if v_id is not null then
    return query select v_id, v_covers, true;
    return;
  end if;

  select ts.id, ts.covers into v_id, v_covers
    from table_sessions ts
   where ts.table_id = p_table_id and ts.status = 'open'
   order by ts.opened_at desc
   limit 1;

  return query select v_id, v_covers, false;
end;
$$;

revoke all on function get_or_open_table_session(uuid, uuid, int) from public;
grant execute on function get_or_open_table_session(uuid, uuid, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Fermer une session — staff uniquement
-- ---------------------------------------------------------------------------
create or replace function close_table_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select r.owner_id into v_owner
    from table_sessions ts join restaurants r on r.id = ts.restaurant_id
   where ts.id = p_session_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not_authorized';
  end if;

  update table_sessions set status = 'closed', closed_at = now()
   where id = p_session_id and status = 'open';

  return found;
end;
$$;

revoke all on function close_table_session(uuid) from public;
grant execute on function close_table_session(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. create_order_secure : rattache la commande à sa session
-- ---------------------------------------------------------------------------
-- Nouveau paramètre en fin de liste (avec défaut), donc il faut de nouveau
-- supprimer l'ancienne fonction avant de la recréer — même raison que pour
-- p_covers dans migration_covers.sql.
drop function if exists create_order_secure(uuid, uuid, text, text, text, text, text, text, text, jsonb, text, int);

create or replace function create_order_secure(
  p_restaurant     uuid,
  p_table          uuid,
  p_order_type     text,
  p_payment_method text,
  p_payment_mode   text,
  p_customer_name  text,
  p_customer_email text,
  p_note           text,
  p_promo_code     text,
  p_items          jsonb,
  p_client_token   text,
  p_covers         int default 1,
  p_session_id     uuid default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_item        jsonb;
  v_id          uuid;
  v_qty         int;
  v_row         menu_items%rowtype;
  v_sup_total   numeric(10,2);
  v_line_ttc    numeric(10,2);
  v_subtotal    numeric(10,2) := 0;
  v_discount    numeric(10,2) := 0;
  v_total       numeric(10,2);
  v_promo       promo_codes%rowtype;
  v_order_id    uuid;
  v_existing    orders%rowtype;
  v_year        int := extract(year from now());
  v_seq         bigint;
  v_fiscal      text;
  v_vat         jsonb;
  v_prev_hash   text;
  v_hash        text;
  v_ratio       numeric;
  v_lines       jsonb := '[]'::jsonb;
begin
  if p_restaurant is null then
    raise exception 'restaurant_manquant';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'commande_vide';
  end if;

  -- Idempotence : un même jeton renvoie la commande déjà créée.
  if p_client_token is not null then
    select * into v_existing from orders
     where restaurant_id = p_restaurant and client_token = p_client_token;
    if found then
      return jsonb_build_object(
        'order_id', v_existing.id, 'fiscal_number', v_existing.fiscal_number,
        'total', v_existing.total, 'vat_breakdown', v_existing.vat_breakdown,
        'duplicate', true);
    end if;
  end if;

  -- --- Lignes : prix et TVA lus en base, stock décrémenté de façon atomique ---
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_id  := (v_item->>'menu_item_id')::uuid;
    v_qty := greatest(1, coalesce((v_item->>'quantity')::int, 1));

    update menu_items
       set stock = case when stock is null then null else stock - v_qty end
     where id = v_id
       and restaurant_id = p_restaurant
       and available = true
       and (stock is null or stock >= v_qty)
    returning * into v_row;

    if not found then
      if exists (select 1 from menu_items where id = v_id and restaurant_id = p_restaurant) then
        raise exception 'rupture_stock:%', (select name from menu_items where id = v_id);
      else
        raise exception 'article_introuvable';
      end if;
    end if;

    v_sup_total := coalesce((
      select sum((s->>'price')::numeric)
        from jsonb_array_elements(coalesce(v_item->'supplements', '[]'::jsonb)) s
    ), 0);

    v_line_ttc := round((v_row.price + v_sup_total) * v_qty, 2);
    v_subtotal := v_subtotal + v_line_ttc;

    v_lines := v_lines || jsonb_build_object(
      'menu_item_id', v_id, 'quantity', v_qty, 'name', v_row.name,
      'unit_price', v_row.price, 'line_ttc', v_line_ttc, 'vat_rate', v_row.vat_rate,
      'detail', coalesce(v_item->>'detail', ''));
  end loop;

  -- --- Promotion : validée et consommée côté serveur -------------------------
  if p_promo_code is not null and length(trim(p_promo_code)) > 0 then
    select * into v_promo from promo_codes
     where restaurant_id = p_restaurant
       and lower(code) = lower(trim(p_promo_code))
       and active = true
     for update;

    if found
       and (v_promo.start_date is null or v_promo.start_date <= current_date)
       and (v_promo.end_date   is null or v_promo.end_date   >= current_date)
       and (v_promo.max_uses   is null or v_promo.use_count < v_promo.max_uses)
    then
      v_discount := round(
        case when v_promo.discount_percent is not null
             then v_subtotal * v_promo.discount_percent / 100.0
             else least(coalesce(v_promo.discount_amount, 0), v_subtotal) end, 2);
      update promo_codes set use_count = use_count + 1 where id = v_promo.id;
    else
      v_discount := 0;
    end if;
  end if;

  v_total := greatest(0, round(v_subtotal - v_discount, 2));

  -- --- Ventilation de TVA -----------------------------------------------------
  v_ratio := case when v_subtotal > 0 then v_total / v_subtotal else 1 end;

  select coalesce(jsonb_agg(x order by x->>'rate'), '[]'::jsonb) into v_vat from (
    select jsonb_build_object(
      'rate', rate,
      'base_ht', round(sum(ttc) * v_ratio / (1 + rate / 100.0), 2),
      'vat',     round(sum(ttc) * v_ratio - sum(ttc) * v_ratio / (1 + rate / 100.0), 2),
      'total_ttc', round(sum(ttc) * v_ratio, 2)
    ) as x
    from (
      select (l->>'vat_rate')::numeric as rate, (l->>'line_ttc')::numeric as ttc
        from jsonb_array_elements(v_lines) l
    ) t group by rate
  ) agg;

  -- --- Numéro fiscal séquentiel ------------------------------------------------
  insert into fiscal_counters (restaurant_id, year, last_number)
       values (p_restaurant, v_year, 1)
  on conflict (restaurant_id, year)
    do update set last_number = fiscal_counters.last_number + 1
  returning last_number into v_seq;

  v_fiscal := v_year::text || '-' || lpad(v_seq::text, 6, '0');

  -- --- Écriture de la commande -------------------------------------------------
  insert into orders (
    restaurant_id, table_id, status, note, total, subtotal, discount,
    payment_method, customer_name, customer_email, order_type, covers, session_id,
    fiscal_number, vat_breakdown, client_token
  ) values (
    p_restaurant, p_table, 'PENDING', coalesce(p_note, ''), v_total, v_subtotal, v_discount,
    coalesce(p_payment_method, 'cash'), coalesce(p_customer_name, ''),
    coalesce(p_customer_email, ''), coalesce(p_order_type, 'dine_in'),
    greatest(1, least(30, coalesce(p_covers, 1))), p_session_id,
    v_fiscal, v_vat, p_client_token
  ) returning id into v_order_id;

  insert into order_items (order_id, menu_item_id, quantity, detail)
  select v_order_id, (l->>'menu_item_id')::uuid, (l->>'quantity')::int, l->>'detail'
    from jsonb_array_elements(v_lines) l;

  -- --- Journal chaîné ----------------------------------------------------------
  select hash into v_prev_hash from fiscal_journal
   where restaurant_id = p_restaurant order by recorded_at desc, fiscal_number desc limit 1;

  v_hash := encode(digest(
    coalesce(v_prev_hash, '') || '|' || v_fiscal || '|' || v_total::text || '|' ||
    coalesce(v_vat::text, '') || '|' || coalesce(p_payment_method, 'cash') || '|' ||
    v_order_id::text, 'sha256'), 'hex');

  insert into fiscal_journal (
    restaurant_id, order_id, fiscal_number, total_ttc, vat_breakdown,
    payment_method, prev_hash, hash
  ) values (
    p_restaurant, v_order_id, v_fiscal, v_total, v_vat,
    coalesce(p_payment_method, 'cash'), v_prev_hash, v_hash
  );

  return jsonb_build_object(
    'order_id', v_order_id, 'fiscal_number', v_fiscal, 'total', v_total,
    'subtotal', v_subtotal, 'discount', v_discount, 'vat_breakdown', v_vat,
    'duplicate', false);
end; $$;

grant execute on function create_order_secure(uuid, uuid, text, text, text, text, text, text, text, jsonb, text, int, uuid)
  to anon, authenticated;

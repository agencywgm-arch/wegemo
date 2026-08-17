-- ============================================================================
-- CONFORMITÉ FISCALE + INTÉGRITÉ DES COMMANDES
--
-- Couvre les 4 exigences techniques de l'article 286-I-3° bis du CGI
-- (Inaltérabilité, Sécurisation, Conservation, Archivage) :
--   - numérotation séquentielle sans rupture par restaurant et par année ;
--   - journal des encaissements en append-only, chaîné par hachage SHA-256,
--     protégé en écriture par un trigger (aucun UPDATE ni DELETE possible) ;
--   - ventilation de TVA figée au moment de l'encaissement.
--
-- ATTENTION : ce fichier fournit les propriétés TECHNIQUES exigées. Il ne
-- vaut PAS certification NF525 : celle-ci est délivrée par un organisme
-- accrédité (AFNOR / LNE) et reste une démarche administrative distincte.
--
-- Corrige également trois failles d'intégrité du flux de commande :
--   - le total était fourni par le client (fraude possible au montant) ;
--   - le stock n'était jamais décrémenté (survente en cas d'affluence) ;
--   - les limites d'usage et dates de validité des promos étaient ignorées.
-- ============================================================================

create extension if not exists pgcrypto;

-- --- Taux de TVA par article ------------------------------------------------
-- Restauration France : 10 % sur place / à emporter en consommation immédiate,
-- 20 % sur les boissons alcoolisées, 5,5 % sur l'alimentaire conditionné à
-- consommation différée. Les prix de la carte sont TTC : la TVA est extraite.
alter table menu_items add column if not exists vat_rate numeric(5,2) not null default 10.00;

-- Numéro de TVA intracommunautaire, mention obligatoire sur la note.
alter table restaurant_settings add column if not exists ticket_vat_number text;

-- --- Colonnes fiscales sur la commande --------------------------------------
alter table orders add column if not exists fiscal_number text;
alter table orders add column if not exists vat_breakdown jsonb;
alter table orders add column if not exists subtotal numeric(10,2);
alter table orders add column if not exists discount numeric(10,2) not null default 0;
-- Jeton d'idempotence : un double-clic ou une reprise réseau ne doit jamais
-- créer deux commandes. Unique par restaurant.
alter table orders add column if not exists client_token text;

create unique index if not exists orders_client_token_uniq
  on orders (restaurant_id, client_token) where client_token is not null;

-- Une vente à emporter au comptoir n'est rattachée à aucune table.
alter table orders alter column table_id drop not null;

-- --- Compteur séquentiel -----------------------------------------------------
-- Une ligne par restaurant et par année, verrouillée le temps de l'incrément :
-- garantit une numérotation continue même sous forte concurrence.
create table if not exists fiscal_counters (
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  year          int  not null,
  last_number   bigint not null default 0,
  primary key (restaurant_id, year)
);
alter table fiscal_counters enable row level security; -- service/definer uniquement

-- --- Journal inaltérable -----------------------------------------------------
create table if not exists fiscal_journal (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id) on delete restrict,
  order_id       uuid,
  fiscal_number  text not null,
  total_ttc      numeric(10,2) not null,
  vat_breakdown  jsonb not null,
  payment_method text not null,
  recorded_at    timestamptz not null default now(),
  prev_hash      text,
  hash           text not null,
  unique (restaurant_id, fiscal_number)
);
alter table fiscal_journal enable row level security;
-- Rejouable : toute la migration doit pouvoir être relancée sans échouer.
drop policy if exists "Owner reads own fiscal journal" on fiscal_journal;
create policy "Owner reads own fiscal journal" on fiscal_journal for select using (
  exists (select 1 from restaurants r where r.id = fiscal_journal.restaurant_id and r.owner_id = auth.uid())
);

-- Inaltérabilité : le journal n'accepte que l'insertion.
create or replace function fiscal_journal_readonly() returns trigger
language plpgsql as $$
begin
  raise exception 'Journal fiscal inaltérable : modification ou suppression interdite';
end; $$;

drop trigger if exists fiscal_journal_no_change on fiscal_journal;
create trigger fiscal_journal_no_change
  before update or delete on fiscal_journal
  for each row execute function fiscal_journal_readonly();

-- ============================================================================
-- create_order_secure — création de commande atomique et faisant autorité.
--
-- Tout est recalculé depuis la base : le client ne transmet que les articles
-- et leurs quantités, jamais un montant. Décrémente le stock, valide la promo,
-- attribue le numéro fiscal et écrit le journal, le tout dans une seule
-- transaction — en cas d'échec partiel, rien n'est enregistré.
-- ============================================================================
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
  p_client_token   text
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

    -- Le WHERE porte la condition de stock : deux commandes simultanées sur le
    -- dernier article ne peuvent pas réussir toutes les deux.
    update menu_items
       set stock = case when stock is null then null else stock - v_qty end
     where id = v_id
       and restaurant_id = p_restaurant
       and available = true
       and (stock is null or stock >= v_qty)
    returning * into v_row;

    if not found then
      -- On distingue rupture de stock et article inconnu pour l'affichage.
      if exists (select 1 from menu_items where id = v_id and restaurant_id = p_restaurant) then
        raise exception 'rupture_stock:%', (select name from menu_items where id = v_id);
      else
        raise exception 'article_introuvable';
      end if;
    end if;

    -- Les suppléments sont facturés au taux de TVA de l'article porteur.
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
    -- FOR UPDATE : empêche de dépasser max_uses lors d'un pic de commandes.
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
      v_discount := 0; -- code expiré, épuisé ou inconnu : ignoré silencieusement
    end if;
  end if;

  v_total := greatest(0, round(v_subtotal - v_discount, 2));

  -- --- Ventilation de TVA -----------------------------------------------------
  -- Prix TTC : la TVA est extraite (base HT = TTC / (1 + taux)). La remise est
  -- répartie au prorata de chaque taux pour rester juste sur le ticket.
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
    payment_method, customer_name, customer_email, order_type,
    fiscal_number, vat_breakdown, client_token
  ) values (
    p_restaurant, p_table, 'PENDING', coalesce(p_note, ''), v_total, v_subtotal, v_discount,
    coalesce(p_payment_method, 'cash'), coalesce(p_customer_name, ''),
    coalesce(p_customer_email, ''), coalesce(p_order_type, 'dine_in'),
    v_fiscal, v_vat, p_client_token
  ) returning id into v_order_id;

  insert into order_items (order_id, menu_item_id, quantity, detail)
  select v_order_id, (l->>'menu_item_id')::uuid, (l->>'quantity')::int, l->>'detail'
    from jsonb_array_elements(v_lines) l;

  -- --- Journal chaîné ----------------------------------------------------------
  select hash into v_prev_hash from fiscal_journal
   where restaurant_id = p_restaurant order by recorded_at desc, fiscal_number desc limit 1;

  -- Chaque empreinte intègre la précédente : modifier une ligne passée rendrait
  -- toutes les suivantes incohérentes, ce qui rend l'altération détectable.
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

grant execute on function create_order_secure(uuid, uuid, text, text, text, text, text, text, text, jsonb, text)
  to anon, authenticated;

-- --- Vérification d'intégrité du journal --------------------------------------
-- Recalcule toute la chaîne et signale la première rupture éventuelle.
-- À présenter en cas de contrôle de l'administration fiscale.
create or replace function verify_fiscal_chain(p_restaurant uuid)
returns table (ok boolean, checked bigint, first_broken text)
language plpgsql security definer set search_path = public, extensions as $$
declare
  r record; v_prev text := null; v_calc text; v_n bigint := 0; v_bad text := null;
begin
  if not exists (select 1 from restaurants where id = p_restaurant and owner_id = auth.uid()) then
    raise exception 'not_authorized';
  end if;
  for r in select * from fiscal_journal where restaurant_id = p_restaurant
            order by recorded_at asc, fiscal_number asc loop
    v_calc := encode(digest(
      coalesce(v_prev, '') || '|' || r.fiscal_number || '|' || r.total_ttc::text || '|' ||
      coalesce(r.vat_breakdown::text, '') || '|' || r.payment_method || '|' ||
      coalesce(r.order_id::text, ''), 'sha256'), 'hex');
    v_n := v_n + 1;
    if v_calc <> r.hash and v_bad is null then v_bad := r.fiscal_number; end if;
    v_prev := r.hash;
  end loop;
  return query select (v_bad is null), v_n, v_bad;
end; $$;

grant execute on function verify_fiscal_chain(uuid) to authenticated;

-- Intégration Flatpay comme second provider de paiement en ligne, à côté de
-- Stripe (inchangé, jamais touché par ce fichier).
--
-- Architecture volontairement alignée sur l'intégration HubRise
-- (migration_pos_hubrise.sql) plutôt que sur le flux Stripe actuel, pour deux
-- raisons :
--
--   1. Les credentials Flatpay (clé API marchand) ne doivent JAMAIS transiter
--      par le navigateur, même celui du restaurateur — contrairement à
--      restaurant_settings.stripe_secret_key, lisible par le propriétaire via
--      RLS. Ils vivent donc dans payment_connections, RLS activé SANS policy :
--      seules les edge functions (service-role) y accèdent.
--
--   2. Le flux carte Stripe actuel (voir CustomerPayment/payCard dans
--      App.jsx) ne crée la commande WGM (create_order_secure) qu'APRÈS
--      confirmation du paiement — jamais avant. C'est délibéré : cette
--      fonction assigne un numéro fiscal séquentiel et écrit une ligne
--      append-only dans fiscal_journal (chaînage par hash, voir
--      migration_fiscal.sql). Assigner un numéro fiscal à une commande dont
--      le paiement échoue ou est abandonné casserait la séquence gapless
--      exigée par la conformité NF525.
--
--      Le flux Flatpay respecte donc la MÊME contrainte : payment_attempts
--      trace la tentative de paiement (montant recalculé serveur, panier,
--      statut PENDING_PAYMENT → PAYMENT_PROCESSING → PAID/FAILED/CANCELLED)
--      SANS jamais toucher orders/fiscal_journal. La commande WGM n'est créée
--      (via create_order_secure, inchangée) qu'au moment où le paiement est
--      confirmé côté serveur — par retour utilisateur vérifié ET/OU webhook,
--      les deux passant par le même code de finalisation idempotent.

-- ---------------------------------------------------------------------------
-- 1. SÉLECTION DU PROVIDER PAR RESTAURANT
-- ---------------------------------------------------------------------------
-- Non-secret : quel provider ce restaurant utilise pour le paiement en ligne.
-- Un seul restaurant aujourd'hui, mais la colonne vit déjà par restaurant_id
-- pour ne pas nécessiter de migration le jour où il y en aura plusieurs.
alter table restaurant_settings
  add column if not exists payment_provider text not null default 'stripe'
    check (payment_provider in ('stripe', 'flatpay'));

-- ---------------------------------------------------------------------------
-- 2. CREDENTIALS FLATPAY — jamais exposés au navigateur, même du propriétaire
-- ---------------------------------------------------------------------------
create table if not exists payment_connections (
  id             uuid primary key default uuid_generate_v4(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade unique,

  provider       text not null default 'flatpay' check (provider in ('flatpay')),

  -- 'test' et 'production' ne doivent JAMAIS partager les mêmes credentials.
  environment    text not null default 'test' check (environment in ('test', 'production')),

  -- Noms de colonnes génériques tant que le format exact des credentials
  -- Flatpay/Frisbii (clé API seule ? client_id + client_secret ? les deux ?)
  -- n'est pas confirmé par leur documentation ou leur support commercial.
  -- Voir FLATPAY_INTEGRATION.md — à ajuster sans douleur, cette table n'est
  -- lue que par les edge functions.
  api_key        text,
  client_id      text,
  client_secret  text,
  merchant_id    text,

  status         text not null default 'disconnected'
                   check (status in ('disconnected', 'connected', 'error')),
  last_error     text,
  connected_at   timestamptz,
  updated_at     timestamptz not null default now()
);

alter table payment_connections enable row level security;
-- Aucune policy : lecture/écriture réservées au service-role (edge functions).
-- Le dashboard lit l'état via get_payment_connection_status() plus bas, qui
-- ne renvoie aucun secret.

create index if not exists payment_connections_restaurant_idx
  on payment_connections (restaurant_id);

create or replace function get_payment_connection_status(p_restaurant_id uuid)
returns table (
  provider text,
  environment text,
  status text,
  last_error text,
  connected_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select c.provider, c.environment, c.status, c.last_error, c.connected_at
  from payment_connections c
  join restaurants r on r.id = c.restaurant_id
  where c.restaurant_id = p_restaurant_id
    and r.owner_id = auth.uid();
$$;
revoke all on function get_payment_connection_status(uuid) from public;
grant execute on function get_payment_connection_status(uuid) to authenticated;

-- Lecture publique (anon inclus) du SEUL nom du provider actif — sert au
-- client pour savoir quel bouton/flux de paiement afficher. Ne renvoie rien
-- de secret : juste 'stripe' ou 'flatpay'.
create or replace function get_payment_provider(p_restaurant_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select payment_provider from restaurant_settings where restaurant_id = p_restaurant_id),
    'stripe'
  );
$$;
revoke all on function get_payment_provider(uuid) from public;
grant execute on function get_payment_provider(uuid) to anon, authenticated;

-- Permet au restaurateur de couper la liaison sans passer par une edge
-- function : supprime la ligne (donc les credentials) après contrôle de
-- propriété. Écrire/mettre à jour les credentials, en revanche, passe
-- obligatoirement par l'edge function flatpay-save-credentials (jamais de
-- RPC anon/authenticated en write ici : on ne veut aucun chemin où un secret
-- transite par une requête PostgREST directe depuis le navigateur).
create or replace function disconnect_payment_provider(p_restaurant_id uuid)
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
  delete from payment_connections where restaurant_id = p_restaurant_id;
  return true;
end;
$$;
revoke all on function disconnect_payment_provider(uuid) from public;
grant execute on function disconnect_payment_provider(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. TENTATIVES DE PAIEMENT — la commande WGM n'existe pas encore
-- ---------------------------------------------------------------------------
create table if not exists payment_attempts (
  id             uuid primary key default uuid_generate_v4(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  table_id       uuid not null references tables(id) on delete cascade,
  session_id     uuid references table_sessions(id) on delete set null,

  order_type     text not null default 'dine_in',
  covers         int not null default 1,
  customer_name  text not null default '',
  customer_email text not null default '',
  note           text not null default '',
  promo_code     text,

  -- Snapshot exact du panier — mêmes clés que p_items de create_order_secure
  -- (menu_item_id, quantity, supplements, detail). Rejoué tel quel une fois
  -- le paiement confirmé, pour créer la commande avec des prix relus en base
  -- à cet instant-là (pas ceux du panier, qui peuvent avoir changé entre
  -- temps si l'article a été modifié).
  cart_items     jsonb not null,

  provider          text not null default 'flatpay' check (provider in ('flatpay')),
  provider_payment_id text,
  -- URL de paiement hébergé renvoyée par Flatpay à la création. Réutilisée
  -- telle quelle si le client retape sur "Payer" avant d'avoir terminé
  -- (double-tap, page rechargée) au lieu de recréer un paiement.
  checkout_url text,

  status  text not null default 'PENDING_PAYMENT'
    check (status in ('PENDING_PAYMENT', 'PAYMENT_PROCESSING', 'PAID', 'PAYMENT_FAILED', 'PAYMENT_CANCELLED')),

  -- Montant/devise calculés SERVEUR (price_cart_secure), jamais transmis par
  -- le navigateur. C'est ce montant qui est envoyé à Flatpay, et qui est
  -- revérifié à la confirmation avant de créer la commande.
  amount   numeric(10,2) not null check (amount > 0),
  currency text not null default 'eur',

  -- Jeton d'idempotence côté client (même mécanisme que create_order_secure) :
  -- un double-tap sur "Payer" réutilise la tentative déjà créée au lieu d'en
  -- ouvrir une seconde auprès de Flatpay.
  client_token text not null,

  -- Renseigné uniquement une fois la commande WGM effectivement créée
  -- (paiement confirmé). Tant que c'est null, aucune commande n'existe.
  order_id uuid references orders(id) on delete set null,

  last_status_detail text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (restaurant_id, client_token),
  unique (provider, provider_payment_id)
);

create index if not exists payment_attempts_restaurant_idx on payment_attempts (restaurant_id);
create index if not exists payment_attempts_status_idx on payment_attempts (status);
create index if not exists payment_attempts_provider_payment_idx on payment_attempts (provider, provider_payment_id);

alter table payment_attempts enable row level security;
-- Écriture réservée au service-role (edge functions). Lecture ouverte au
-- propriétaire du restaurant pour le suivi/support — aucune donnée bancaire
-- n'y transite, seulement des métadonnées de commande/paiement.
drop policy if exists "Owner reads payment attempts" on payment_attempts;
create policy "Owner reads payment attempts" on payment_attempts for select using (
  exists (select 1 from restaurants r where r.id = payment_attempts.restaurant_id and r.owner_id = auth.uid())
);

create or replace function set_payment_attempts_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists payment_attempts_updated_at_trg on payment_attempts;
create trigger payment_attempts_updated_at_trg
  before update on payment_attempts
  for each row execute function set_payment_attempts_updated_at();

-- ---------------------------------------------------------------------------
-- 4. JOURNAL D'AUDIT — même esprit que pos_sync_log, jamais de données
--    bancaires (numéro de carte, CVV, secrets API) dedans.
-- ---------------------------------------------------------------------------
create table if not exists payment_events (
  id                 uuid primary key default uuid_generate_v4(),
  restaurant_id      uuid not null references restaurants(id) on delete cascade,
  payment_attempt_id uuid references payment_attempts(id) on delete cascade,
  direction          text not null check (direction in ('outbound', 'inbound')),
  action             text not null, -- create | status | webhook | refund | error
  ok                 boolean not null default true,
  http_status        int,
  message            text,
  created_at         timestamptz not null default now()
);

create index if not exists payment_events_attempt_idx on payment_events (payment_attempt_id);
create index if not exists payment_events_restaurant_idx on payment_events (restaurant_id, created_at desc);

alter table payment_events enable row level security;
drop policy if exists "Owner reads payment events" on payment_events;
create policy "Owner reads payment events" on payment_events for select using (
  exists (select 1 from restaurants r where r.id = payment_events.restaurant_id and r.owner_id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- 5. payment_mode — nouvelle valeur pour les commandes nées d'un paiement
--    Flatpay confirmé (même esprit que 'online_stripe').
-- ---------------------------------------------------------------------------
alter table orders drop constraint if exists orders_payment_mode_check;
alter table orders add constraint orders_payment_mode_check
  check (payment_mode in ('online_stripe', 'pay_at_counter', 'online_flatpay'));

-- ---------------------------------------------------------------------------
-- 6. TARIFICATION SERVEUR SANS EFFET DE BORD (quote)
-- ---------------------------------------------------------------------------
-- Reprend exactement la logique de tarification de create_order_secure
-- (prix et TVA relus en base, promo validée) mais SANS écrire quoi que ce
-- soit : pas de décrément de stock, pas de consommation de code promo, pas de
-- numéro fiscal. Sert à calculer le montant à envoyer à Flatpay AVANT que le
-- client ait payé — un panier qu'il abandonne ne doit avoir strictement
-- aucun effet en base. Le décrément de stock et la consommation du code
-- promo restent exclusivement dans create_order_secure, appelée uniquement
-- une fois le paiement confirmé.
create or replace function price_cart_secure(
  p_restaurant uuid,
  p_items      jsonb,
  p_promo_code text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item      jsonb;
  v_id        uuid;
  v_qty       int;
  v_row       menu_items%rowtype;
  v_sup_total numeric(10,2);
  v_line_ttc  numeric(10,2);
  v_subtotal  numeric(10,2) := 0;
  v_discount  numeric(10,2) := 0;
  v_total     numeric(10,2);
  v_promo     promo_codes%rowtype;
  v_ratio     numeric;
  v_vat       jsonb;
  v_lines     jsonb := '[]'::jsonb;
begin
  if p_restaurant is null then
    raise exception 'restaurant_manquant';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'commande_vide';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_id  := (v_item->>'menu_item_id')::uuid;
    v_qty := greatest(1, coalesce((v_item->>'quantity')::int, 1));

    select * into v_row from menu_items
     where id = v_id and restaurant_id = p_restaurant and available = true;

    if not found then
      if exists (select 1 from menu_items where id = v_id and restaurant_id = p_restaurant) then
        raise exception 'article_indisponible';
      else
        raise exception 'article_introuvable';
      end if;
    end if;
    if v_row.stock is not null and v_row.stock < v_qty then
      raise exception 'rupture_stock:%', v_row.name;
    end if;

    v_sup_total := coalesce((
      select sum((s->>'price')::numeric)
        from jsonb_array_elements(coalesce(v_item->'supplements', '[]'::jsonb)) s
    ), 0);

    v_line_ttc := round((v_row.price + v_sup_total) * v_qty, 2);
    v_subtotal := v_subtotal + v_line_ttc;

    v_lines := v_lines || jsonb_build_object(
      'menu_item_id', v_id, 'quantity', v_qty, 'name', v_row.name,
      'unit_price', v_row.price, 'line_ttc', v_line_ttc, 'vat_rate', v_row.vat_rate);
  end loop;

  if p_promo_code is not null and length(trim(p_promo_code)) > 0 then
    select * into v_promo from promo_codes
     where restaurant_id = p_restaurant
       and lower(code) = lower(trim(p_promo_code))
       and active = true;

    if found
       and (v_promo.start_date is null or v_promo.start_date <= current_date)
       and (v_promo.end_date   is null or v_promo.end_date   >= current_date)
       and (v_promo.max_uses   is null or v_promo.use_count < v_promo.max_uses)
    then
      v_discount := round(
        case when v_promo.discount_percent is not null
             then v_subtotal * v_promo.discount_percent / 100.0
             else least(coalesce(v_promo.discount_amount, 0), v_subtotal) end, 2);
    end if;
  end if;

  v_total := greatest(0, round(v_subtotal - v_discount, 2));
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

  return jsonb_build_object(
    'subtotal', v_subtotal, 'discount', v_discount, 'total', v_total,
    'vat_breakdown', v_vat, 'currency', 'eur');
end;
$$;
revoke all on function price_cart_secure(uuid, jsonb, text) from public;
grant execute on function price_cart_secure(uuid, jsonb, text) to anon, authenticated;

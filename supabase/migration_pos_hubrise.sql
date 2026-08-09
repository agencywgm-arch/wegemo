-- Intégration caisse (POS) via HubRise — CLYO Systems et autres caisses.
--
-- HubRise est un middleware : Wegemo ne parle qu'à son API, et HubRise traduit
-- vers la caisse du restaurateur (CLYO aujourd'hui, autre demain sans travail
-- supplémentaire ici). Rien dans ce schéma n'est spécifique à CLYO : le nom de
-- la caisse est une simple étiquette dans pos_connections.pos_vendor.

-- ---------------------------------------------------------------------------
-- 1. CONNEXIONS POS
-- ---------------------------------------------------------------------------
-- Table séparée de restaurant_settings *volontairement* : elle contient le
-- token d'accès HubRise, qui ne doit jamais transiter par le navigateur.
-- RLS est activé SANS aucune policy => personne n'y accède via la clé anon ou
-- authenticated ; seules les edge functions (service-role, qui contourne RLS)
-- peuvent lire le token. Le dashboard lit l'état de connexion via la fonction
-- get_pos_connection_status() plus bas, qui ne renvoie aucun secret.
create table if not exists pos_connections (
  id             uuid primary key default uuid_generate_v4(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade unique,

  -- Fournisseur d'intégration. Seul "hubrise" est implémenté ; la colonne
  -- existe pour brancher d'autres middlewares sans migration.
  provider       text not null default 'hubrise'
                   check (provider in ('hubrise')),
  -- Caisse effectivement branchée derrière HubRise (informatif : sert à
  -- l'affichage et au support, aucune logique métier ne doit en dépendre).
  pos_vendor     text not null default 'clyo'
                   check (pos_vendor in ('clyo', 'other', 'unknown')),

  -- Identifiants HubRise obtenus à l'issue du flux OAuth2.
  hubrise_account_id  text,
  hubrise_location_id text,
  hubrise_catalog_id  text,
  access_token        text,

  -- État de la connexion, pour l'indicateur du dashboard.
  status         text not null default 'disconnected'
                   check (status in ('disconnected', 'connected', 'error')),
  last_error     text,
  catalog_synced_at timestamptz,
  connected_at   timestamptz,
  updated_at     timestamptz not null default now()
);

alter table pos_connections enable row level security;
-- Aucune policy : lecture/écriture réservées au service-role.

create index if not exists pos_connections_restaurant_idx
  on pos_connections (restaurant_id);

-- ---------------------------------------------------------------------------
-- 2. CHAMPS DE SYNCHRO SUR LES COMMANDES
-- ---------------------------------------------------------------------------
-- payment_mode sépare strictement les deux flux de paiement :
--   'online_stripe'  → flux existant, PaymentIntent Stripe
--   'pay_at_counter' → flux caisse, AUCUN appel Stripe (encaissement physique)
alter table orders
  add column if not exists payment_mode text not null default 'online_stripe'
    check (payment_mode in ('online_stripe', 'pay_at_counter'));

-- Suivi de la transmission vers la caisse.
--   not_applicable → le restaurant n'a pas d'intégration caisse
--   pending        → à envoyer / en cours de retry
--   sent           → acceptée par HubRise, en attente de retour caisse
--   accepted       → la caisse a accepté la commande
--   rejected       → la caisse a refusé la commande
--   failed         → échec définitif après retries (action manuelle requise)
alter table orders
  add column if not exists pos_sync_status text not null default 'not_applicable'
    check (pos_sync_status in
      ('not_applicable', 'pending', 'sent', 'accepted', 'rejected', 'failed'));

-- Identifiant de la commande côté HubRise (renvoyé à la création).
alter table orders add column if not exists pos_order_id text;
-- Dernier message d'erreur de synchro, affiché au restaurateur.
alter table orders add column if not exists pos_sync_error text;
-- Nombre de tentatives d'envoi déjà effectuées.
alter table orders add column if not exists pos_sync_attempts int not null default 0;

create index if not exists orders_pos_sync_idx
  on orders (restaurant_id, pos_sync_status);
-- Retrouver une commande depuis un webhook HubRise.
create index if not exists orders_pos_order_id_idx
  on orders (pos_order_id) where pos_order_id is not null;

-- ---------------------------------------------------------------------------
-- 3. JOURNAL DE SYNCHRO
-- ---------------------------------------------------------------------------
-- Trace chaque échange avec HubRise, pour le debug par le restaurateur ou le
-- support. Aucun token n'y est écrit.
create table if not exists pos_sync_log (
  id            uuid primary key default uuid_generate_v4(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  order_id      uuid references orders(id) on delete set null,
  direction     text not null check (direction in ('outbound', 'inbound')),
  action        text not null,           -- push_order | sync_catalog | webhook | connect
  ok            boolean not null,
  http_status   int,
  message       text,
  created_at    timestamptz not null default now()
);

alter table pos_sync_log enable row level security;
create policy "Owner reads their pos logs" on pos_sync_log for select using (
  exists (select 1 from restaurants r
          where r.id = pos_sync_log.restaurant_id and r.owner_id = auth.uid())
);

create index if not exists pos_sync_log_restaurant_idx
  on pos_sync_log (restaurant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. ÉTAT DE CONNEXION SANS SECRET
-- ---------------------------------------------------------------------------
-- Le dashboard a besoin de savoir si la caisse est connectée, mais ne doit
-- jamais recevoir le token. Cette fonction security definer contourne le
-- verrou RLS de pos_connections tout en vérifiant l'appartenance, et ne
-- projette que des colonnes non sensibles.
create or replace function get_pos_connection_status(p_restaurant_id uuid)
returns table (
  provider text,
  pos_vendor text,
  status text,
  hubrise_location_id text,
  hubrise_catalog_id text,
  catalog_synced_at timestamptz,
  connected_at timestamptz,
  last_error text
)
language sql
security definer
set search_path = public
as $$
  select c.provider, c.pos_vendor, c.status, c.hubrise_location_id,
         c.hubrise_catalog_id, c.catalog_synced_at, c.connected_at, c.last_error
  from pos_connections c
  join restaurants r on r.id = c.restaurant_id
  where c.restaurant_id = p_restaurant_id
    and r.owner_id = auth.uid();
$$;

revoke all on function get_pos_connection_status(uuid) from public;
grant execute on function get_pos_connection_status(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. DÉCONNEXION
-- ---------------------------------------------------------------------------
-- Permet au restaurateur de couper la liaison sans passer par une edge
-- function : supprime la ligne (donc le token) après contrôle de propriété.
create or replace function disconnect_pos(p_restaurant_id uuid)
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
  delete from pos_connections where restaurant_id = p_restaurant_id;
  return true;
end;
$$;

revoke all on function disconnect_pos(uuid) from public;
grant execute on function disconnect_pos(uuid) to authenticated;

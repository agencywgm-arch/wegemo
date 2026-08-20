-- Intégration caisse CLYO — connecteur natif, sans passer par HubRise.
--
-- HubRise (migration_pos_hubrise.sql) reste en place mais son intégration
-- CLYO est cassée côté CLYO et non réparable depuis Wegemo. Ce fichier
-- ajoute un second provider, "clyo_native", qui implémente directement le
-- protocole documenté par CLYO pour interfacer un site de vente en ligne
-- (produitClyoKey / customerListOrder / updateOrder — voir api/clyo-*.js).
--
-- Contrairement à HubRise (Wegemo pousse vers HubRise), ce protocole est en
-- *pull* : c'est la caisse CLYO qui appelle Wegemo, à son propre rythme de
-- sondage. Pas d'OAuth, pas de webhook signé — juste un token d'URL +
-- un mot de passe, exactement le modèle attendu par la caisse.

-- ---------------------------------------------------------------------------
-- 1. pos_connections : nouveau provider + identifiants CLYO natifs
-- ---------------------------------------------------------------------------
alter table pos_connections drop constraint if exists pos_connections_provider_check;
alter table pos_connections add constraint pos_connections_provider_check
  check (provider in ('hubrise', 'clyo_native'));

-- Segment d'URL opaque et unique par restaurant : CLYO n'a qu'un seul champ
-- "URL du site" dans sa config, donc le multi-tenant se fait dans le
-- chemin (https://<domaine-pont>/r/<token>), pas dans le domaine.
alter table pos_connections add column if not exists clyo_site_token text unique;
-- Mot de passe de récupération des commandes. Vide = pas de contrôle côté
-- CLYO ("si vous ne le connaissez pas, laissez le champ vide") : même
-- comportement ici, mais un mot de passe est fortement recommandé.
alter table pos_connections add column if not exists clyo_password text;
-- Libellé exact choisi dans le menu déroulant "Reglement C.B internet" de la
-- caisse (défaut observé sur les captures CLYO : "CARTE BLEUE"). Doit
-- correspondre caractère pour caractère à ce qui est sélectionné en caisse.
alter table pos_connections add column if not exists clyo_cb_label text not null default 'CARTE BLEUE';
alter table pos_connections add column if not exists clyo_last_products_pull_at timestamptz;
alter table pos_connections add column if not exists clyo_last_orders_pull_at timestamptz;

create index if not exists pos_connections_clyo_token_idx
  on pos_connections (clyo_site_token) where clyo_site_token is not null;

-- ---------------------------------------------------------------------------
-- 2. orders.pos_sync_status : nouveaux états du cycle de vie CLYO
-- ---------------------------------------------------------------------------
--   blocked   → en attente d'envoi mais au moins un article de la commande
--               n'a pas encore de correspondance CLYO (pos_ref manquant)
--   cancelled → commande annulée côté Wegemo (avant ou après transmission)
alter table orders drop constraint if exists orders_pos_sync_status_check;
alter table orders add constraint orders_pos_sync_status_check
  check (pos_sync_status in
    ('not_applicable', 'pending', 'blocked', 'sent', 'accepted', 'rejected', 'failed', 'cancelled'));

-- L'exemple de flux CLYO utilise des idCommande courts et numériques (58,
-- 59...). Rien ne garantit qu'une longue chaîne UUID passe proprement dans
-- une base/caisse pensée pour un entier : on assigne donc un numéro court,
-- par restaurant, seulement au moment où la commande devient éligible à
-- l'envoi (pas à la création, pour ne pas consommer la séquence en vain).
create sequence if not exists clyo_order_seq_seq;
alter table orders add column if not exists clyo_order_seq bigint unique;

-- Assigne (une seule fois, de façon idempotente) le numéro court utilisé
-- comme idCommande. Appelée par le pont Vercel avec la clé service-role.
create or replace function clyo_assign_order_seq(p_order_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq bigint;
begin
  select clyo_order_seq into v_seq from orders where id = p_order_id for update;
  if v_seq is null then
    v_seq := nextval('clyo_order_seq_seq');
    update orders set clyo_order_seq = v_seq where id = p_order_id;
  end if;
  return v_seq;
end;
$$;

revoke all on function clyo_assign_order_seq(uuid) from public;
grant execute on function clyo_assign_order_seq(uuid) to service_role;

-- Retrouve une commande depuis son idCommande CLYO (le numéro court), pour
-- updateOrder.php.
create index if not exists orders_clyo_seq_idx on orders (clyo_order_seq) where clyo_order_seq is not null;

-- ---------------------------------------------------------------------------
-- 3. Mise en file automatique des nouvelles commandes
-- ---------------------------------------------------------------------------
-- Dès qu'un restaurant a une connexion clyo_native active, toute commande
-- créée doit entrer dans le cycle de synchro sans que chaque point d'entrée
-- de création de commande (Vente, QR, ...) ait à le savoir.
create or replace function clyo_mark_order_pending()
returns trigger
language plpgsql
as $$
begin
  if new.pos_sync_status = 'not_applicable' and exists (
    select 1 from pos_connections c
    where c.restaurant_id = new.restaurant_id
      and c.provider = 'clyo_native'
      and c.status = 'connected'
  ) then
    new.pos_sync_status := 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists clyo_mark_order_pending_trg on orders;
create trigger clyo_mark_order_pending_trg
  before insert on orders
  for each row execute function clyo_mark_order_pending();

-- ---------------------------------------------------------------------------
-- 4. RPCs propriétaire — jamais de secret exposé hors session authentifiée
-- ---------------------------------------------------------------------------
-- Active (ou réactive) la connexion CLYO native pour un restaurant. Génère
-- le token et le mot de passe s'ils n'existent pas encore ; sinon les
-- renvoie tels quels (idempotent — un rafraîchissement de page ne doit pas
-- régénérer des identifiants déjà collés dans la caisse).
create or replace function clyo_connect(p_restaurant_id uuid)
returns table (clyo_site_token text, clyo_password text, clyo_cb_label text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from restaurants where id = p_restaurant_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not_authorized';
  end if;

  insert into pos_connections (restaurant_id, provider, pos_vendor, status, connected_at,
                                clyo_site_token, clyo_password)
  values (p_restaurant_id, 'clyo_native', 'clyo', 'connected', now(),
          encode(gen_random_bytes(16), 'hex'), encode(gen_random_bytes(12), 'hex'))
  on conflict (restaurant_id) do update
    set provider = 'clyo_native',
        status = 'connected',
        connected_at = coalesce(pos_connections.connected_at, now()),
        clyo_site_token = coalesce(pos_connections.clyo_site_token, encode(gen_random_bytes(16), 'hex')),
        clyo_password = coalesce(pos_connections.clyo_password, encode(gen_random_bytes(12), 'hex'));

  return query
    select c.clyo_site_token, c.clyo_password, c.clyo_cb_label
    from pos_connections c
    where c.restaurant_id = p_restaurant_id;
end;
$$;

revoke all on function clyo_connect(uuid) from public;
grant execute on function clyo_connect(uuid) to authenticated;

-- Fait réapparaître les identifiants existants (pour les recopier dans la
-- caisse après coup) sans les régénérer.
create or replace function clyo_reveal_credentials(p_restaurant_id uuid)
returns table (clyo_site_token text, clyo_password text, clyo_cb_label text, status text)
language sql
security definer
set search_path = public
as $$
  select c.clyo_site_token, c.clyo_password, c.clyo_cb_label, c.status
  from pos_connections c
  join restaurants r on r.id = c.restaurant_id
  where c.restaurant_id = p_restaurant_id
    and c.provider = 'clyo_native'
    and r.owner_id = auth.uid();
$$;

revoke all on function clyo_reveal_credentials(uuid) from public;
grant execute on function clyo_reveal_credentials(uuid) to authenticated;

-- Rotation du mot de passe : nécessite de le re-coller dans la caisse.
create or replace function clyo_rotate_password(p_restaurant_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner uuid;
  v_new_password text;
begin
  select owner_id into v_owner from restaurants where id = p_restaurant_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not_authorized';
  end if;

  v_new_password := encode(gen_random_bytes(12), 'hex');
  update pos_connections
     set clyo_password = v_new_password
   where restaurant_id = p_restaurant_id and provider = 'clyo_native';

  if not found then
    raise exception 'not_connected';
  end if;

  return v_new_password;
end;
$$;

revoke all on function clyo_rotate_password(uuid) from public;
grant execute on function clyo_rotate_password(uuid) to authenticated;

create or replace function clyo_set_cb_label(p_restaurant_id uuid, p_label text)
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
     set clyo_cb_label = coalesce(nullif(trim(p_label), ''), 'CARTE BLEUE')
   where restaurant_id = p_restaurant_id and provider = 'clyo_native';

  return found;
end;
$$;

revoke all on function clyo_set_cb_label(uuid, text) from public;
grant execute on function clyo_set_cb_label(uuid, text) to authenticated;

-- Renvoyer une commande : ne fait rien si elle n'est pas dans un état
-- renvoyable, pour ne jamais créer de doublon côté CLYO (la commande garde
-- son idCommande = son UUID Wegemo, donc "renvoyer" = juste redevenir
-- éligible au prochain sondage de customerListOrder.php).
create or replace function clyo_resend_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select r.owner_id into v_owner
    from orders o join restaurants r on r.id = o.restaurant_id
   where o.id = p_order_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not_authorized';
  end if;

  update orders
     set pos_sync_status = 'pending', pos_sync_error = null
   where id = p_order_id
     and pos_sync_status in ('failed', 'blocked', 'rejected', 'sent');

  return found;
end;
$$;

revoke all on function clyo_resend_order(uuid) from public;
grant execute on function clyo_resend_order(uuid) to authenticated;

-- Annule le suivi CLYO d'une commande. Ne supprime jamais la commande ni son
-- historique — trace l'événement dans pos_sync_log. Le protocole CLYO ne
-- documente aucun appel "annuler" côté site : si la commande était déjà
-- 'sent'/'accepted' (donc déjà remontée en caisse), l'annulation doit aussi
-- être faite manuellement dans CLYO — la fonction renvoie needs_manual_clyo
-- pour que le dashboard l'affiche clairement au restaurateur.
create or replace function clyo_cancel_order(p_order_id uuid)
returns table (ok boolean, needs_manual_clyo boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_restaurant uuid;
  v_prev_status text;
begin
  select r.owner_id, o.restaurant_id, o.pos_sync_status
    into v_owner, v_restaurant, v_prev_status
    from orders o join restaurants r on r.id = o.restaurant_id
   where o.id = p_order_id;

  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not_authorized';
  end if;

  update orders set pos_sync_status = 'cancelled' where id = p_order_id;

  insert into pos_sync_log (restaurant_id, order_id, direction, action, ok, message)
  values (v_restaurant, p_order_id, 'outbound', 'cancel',
          true,
          case when v_prev_status in ('sent', 'accepted')
               then 'Commande annulée côté Wegemo après transmission (statut précédent : ' || v_prev_status || ') — suppression manuelle nécessaire dans la caisse CLYO.'
               else 'Commande annulée côté Wegemo avant transmission (statut précédent : ' || coalesce(v_prev_status, 'inconnu') || ').'
          end);

  return query select true, (v_prev_status in ('sent', 'accepted'));
end;
$$;

revoke all on function clyo_cancel_order(uuid) from public;
grant execute on function clyo_cancel_order(uuid) to authenticated;

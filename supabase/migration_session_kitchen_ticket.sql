-- Ticket cuisine groupé par session de table.
--
-- Jusqu'ici, chaque commande imprimait immédiatement son propre bon de
-- cuisine. Pour une session de table (plusieurs scans successifs sur la
-- même table), ça envoie N petits tickets dispersés au lieu d'un seul
-- récap pour la brigade. On attend maintenant que la session soit
-- "complète" pour imprimer UN SEUL ticket groupé listant toutes les
-- commandes de la session.
--
-- Deux façons pour une session de devenir "envoyée en cuisine" :
--   - automatique : dès que le nombre de commandes rattachées atteint le
--     nombre de couverts (déclencheur SQL ci-dessous) ;
--   - manuelle : le staff force l'envoi (send_session_to_kitchen), pour
--     les cas où l'automatique ne se déclenche pas (quelqu'un n'a rien
--     commandé, une seule commande pour toute la table, etc).
--
-- Une commande qui arrive sur une session déjà envoyée (retardataire) n'est
-- pas perdue : le code client (useAutoPrintQueue) imprime pour elle un
-- ticket individuel classique, en repli.

alter table table_sessions add column if not exists kitchen_sent_at timestamptz;

-- ---------------------------------------------------------------------------
-- Déclenchement automatique
-- ---------------------------------------------------------------------------
create or replace function table_sessions_maybe_send_to_kitchen()
returns trigger
language plpgsql
as $$
declare
  v_covers int;
  v_sent   timestamptz;
  v_count  int;
begin
  if new.session_id is null then
    return new;
  end if;

  select covers, kitchen_sent_at into v_covers, v_sent
    from table_sessions where id = new.session_id;

  -- Déjà envoyée : cette commande est un ajout tardif, on ne rouvre pas.
  if v_sent is not null then
    return new;
  end if;

  select count(*) into v_count from orders where session_id = new.session_id;

  if v_count >= v_covers then
    update table_sessions set kitchen_sent_at = now()
     where id = new.session_id and kitchen_sent_at is null;
  end if;

  return new;
end;
$$;

drop trigger if exists table_sessions_maybe_send_to_kitchen_trg on orders;
create trigger table_sessions_maybe_send_to_kitchen_trg
  after insert on orders
  for each row execute function table_sessions_maybe_send_to_kitchen();

-- ---------------------------------------------------------------------------
-- Déclenchement manuel — staff uniquement
-- ---------------------------------------------------------------------------
create or replace function send_session_to_kitchen(p_session_id uuid)
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

  update table_sessions set kitchen_sent_at = now()
   where id = p_session_id and kitchen_sent_at is null;

  return found;
end;
$$;

revoke all on function send_session_to_kitchen(uuid) from public;
grant execute on function send_session_to_kitchen(uuid) to authenticated;

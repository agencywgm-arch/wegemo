-- ============================================================================
-- Bootstrap pour exécuter les tests sur un PostgreSQL nu (hors Supabase).
--
-- Recrée le strict minimum de ce que Supabase fournit nativement : le schéma
-- `auth`, sa table `users` avec les colonnes que déclenchent nos triggers, la
-- fonction `auth.uid()` et les rôles applicatifs.
--
-- À n'exécuter QUE sur une base de test. Sur Supabase, tout ceci existe déjà.
--
--   createdb wegemo_test
--   psql -d wegemo_test -f supabase/test_bootstrap.sql
--   psql -d wegemo_test -f supabase/install.sql
--   psql -d wegemo_test -f supabase/test_fiscal.sql
-- ============================================================================

create extension if not exists pgcrypto;
create schema if not exists auth;

create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text,
  raw_user_meta_data  jsonb default '{}'::jsonb
);

-- L'identité de l'appelant est simulée par un paramètre de session, ce qui
-- permet de tester les politiques RLS en changeant d'utilisateur à la volée :
--   set test.uid = '...';
create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;

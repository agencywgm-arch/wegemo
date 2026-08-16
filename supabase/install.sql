-- ============================================================================
-- WEGEMO — INSTALLATION COMPLÈTE
--
-- Un seul fichier à coller dans l'éditeur SQL de Supabase pour monter une
-- base neuve, ou pour mettre à jour une base existante : tout est écrit de
-- façon rejouable (if not exists / or replace / drop policy if exists), donc
-- l'exécuter deux fois de suite ne casse rien.
--
-- ORDRE IMPOSÉ : chaque bloc dépend des précédents, ne pas réordonner.
--
-- Après exécution :
--   1. Storage : créer un bucket public nommé « assets » (photos des plats).
--   2. Authentication > Providers : activer Email.
--   3. Edge functions : déployer celles du dossier supabase/functions/
--      (hubrise-webhook impérativement avec --no-verify-jwt).
--   4. Vérifier l'installation avec le bloc de contrôle en fin de fichier.
--
-- CONFORMITÉ : ce script met en place les propriétés techniques exigées par
-- l'article 286-I-3° bis du CGI (inaltérabilité, sécurisation, conservation,
-- archivage). Il ne vaut PAS certification NF525, qui est délivrée par un
-- organisme accrédité et reste une démarche distincte à la charge de
-- l'exploitant.
-- ============================================================================

\echo '=== 1/8  Socle ==='
\i schema.sql

\echo '=== 2/8  Réglages, carte, options ==='
\i migration_settings.sql

\echo '=== 3/8  Promotions ==='
\i migration_promotions.sql

\echo '=== 4/8  Inventaire ==='
\i migration_inventory.sql

\echo '=== 5/8  Clients & marketing ==='
\i migration_customers.sql
\i migration_marketing.sql

\echo '=== 6/8  Modules & sécurité ==='
\i migration_modules.sql
\i migration_security_fixes.sql

\echo '=== 7/8  Caisse externe (HubRise) ==='
\i migration_pos_hubrise.sql
\i migration_pos_ref.sql

\echo '=== 8/8  Impression et conformité fiscale ==='
\i migration_auto_print.sql
\i migration_fiscal.sql

-- ============================================================================
-- CONTRÔLE D'INSTALLATION
-- Échoue explicitement si une brique attendue manque, plutôt que de laisser
-- découvrir le problème le jour de l'ouverture.
-- ============================================================================
do $$
declare
  v_missing text := '';
  v_t text;
  v_f text;
begin
  foreach v_t in array array[
    'restaurants','tables','menu_items','orders','order_items',
    'restaurant_settings','promo_codes','ingredients',
    'fiscal_counters','fiscal_journal'
  ] loop
    if to_regclass('public.' || v_t) is null then
      v_missing := v_missing || ' table:' || v_t;
    end if;
  end loop;

  foreach v_f in array array[
    'create_order_secure','verify_fiscal_chain','get_order_status'
  ] loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = v_f) then
      v_missing := v_missing || ' fonction:' || v_f;
    end if;
  end loop;

  -- Le trigger d'inaltérabilité est la pièce dont l'absence est la plus
  -- coûteuse : sans lui le journal fiscal n'a aucune valeur probante.
  if not exists (select 1 from pg_trigger where tgname = 'fiscal_journal_no_change') then
    v_missing := v_missing || ' trigger:fiscal_journal_no_change';
  end if;

  if v_missing <> '' then
    raise exception 'INSTALLATION INCOMPLÈTE —%', v_missing;
  end if;

  raise notice '';
  raise notice '  ✅ Installation vérifiée : schéma, RPC et journal fiscal en place.';
  raise notice '  Prochaine étape : bucket Storage « assets » + déploiement des edge functions.';
  raise notice '';
end $$;

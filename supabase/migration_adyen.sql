-- ============================================================================
-- Adyen — paiement en ligne par lien de paiement hébergé (Pay by Link)
-- À exécuter APRÈS migration_flatpay.sql (réutilise payment_connections,
-- payment_attempts, payment_events). Idempotent. Voir ADYEN_INTEGRATION.md.
-- ============================================================================

-- 1. Provider sélectionnable par restaurant
alter table restaurant_settings drop constraint if exists restaurant_settings_payment_provider_check;
alter table restaurant_settings add constraint restaurant_settings_payment_provider_check
  check (payment_provider in ('stripe', 'flatpay', 'adyen'));

-- 2. Credentials Adyen (même table, jamais lisible côté navigateur)
alter table payment_connections add column if not exists merchant_account text;
alter table payment_connections add column if not exists live_url_prefix  text;
alter table payment_connections add column if not exists hmac_key         text;
alter table payment_connections drop constraint if exists payment_connections_provider_check;
alter table payment_connections add constraint payment_connections_provider_check
  check (provider in ('flatpay', 'adyen'));

-- 3. Tentatives de paiement : provider + référence PSP (pour les remboursements)
alter table payment_attempts add column if not exists provider_reference text;
alter table payment_attempts drop constraint if exists payment_attempts_provider_check;
alter table payment_attempts add constraint payment_attempts_provider_check
  check (provider in ('flatpay', 'adyen'));

-- 4. Mode de paiement des commandes
alter table orders drop constraint if exists orders_payment_mode_check;
alter table orders add constraint orders_payment_mode_check
  check (payment_mode in ('online_stripe', 'pay_at_counter', 'online_flatpay', 'online_adyen'));

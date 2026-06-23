-- Per-restaurant active subscription modules (feature flags).
-- Each restaurant starts on the "base" socle; paid modules are added here.
-- Values come from the module catalog in the frontend:
--   base | mobile_pay | growth | voice | manager | franchise
alter table restaurant_settings
  add column if not exists active_modules jsonb not null default '["base"]'::jsonb;

-- Backfill any existing settings rows that predate this column.
update restaurant_settings set active_modules = '["base"]'::jsonb where active_modules is null;

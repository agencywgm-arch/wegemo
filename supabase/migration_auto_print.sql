-- Impression automatique du ticket de caisse à l'arrivée d'une commande.
-- Activée par défaut : dès qu'une nouvelle commande apparaît sur l'écran
-- Cuisine, le navigateur déclenche l'impression sur l'imprimante système
-- (celle sélectionnée par défaut sur l'ordinateur/tablette utilisé).
alter table restaurant_settings add column if not exists auto_print_enabled boolean not null default true;

-- Per-restaurant API keys + visual customisation
create table if not exists restaurant_settings (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid not null references restaurants(id) on delete cascade unique,
  resend_api_key text,
  resend_from text,
  openai_api_key text,
  stripe_publishable_key text,
  stripe_secret_key text,
  -- Google reviews
  google_review_url text,
  google_review_enabled boolean default false,
  -- Menu visual customisation
  category_order jsonb,
  menu_background_url text,
  menu_header_bg_url text,
  menu_body_bg_url text,
  -- Receipt / ticket info
  ticket_address text,
  ticket_phone text,
  ticket_tax_id text,
  ticket_footer text,
  updated_at timestamptz default now()
);
alter table restaurant_settings enable row level security;
create policy "Owner manages settings" on restaurant_settings for all using (
  exists (select 1 from restaurants r where r.id = restaurant_settings.restaurant_id and r.owner_id = auth.uid())
) with check (
  exists (select 1 from restaurants r where r.id = restaurant_settings.restaurant_id and r.owner_id = auth.uid())
);

-- Custom table label shown to the customer (e.g. "Terrasse 2" instead of "Table 3")
alter table tables add column if not exists label text;

-- Menu item extensions
alter table menu_items add column if not exists stock integer;            -- nullable = unlimited
alter table menu_items add column if not exists supplements jsonb default '[]'::jsonb; -- paid add-ons
alter table menu_items add column if not exists extras jsonb default '[]'::jsonb;      -- included choices
alter table menu_items add column if not exists sort_order integer;
alter table menu_items add column if not exists translations jsonb;
alter table menu_items add column if not exists is_menu boolean default false;

-- Order type + cash collection flag
alter table orders add column if not exists order_type text default 'dine_in'; -- dine_in | takeaway
alter table orders add column if not exists cash_collected boolean default false;

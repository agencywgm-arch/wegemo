-- Wegemo — base schema
-- Run first in the Supabase SQL editor.

create extension if not exists "uuid-ossp";

-- PROFILES
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text not null default '',
  email      text not null default '',
  created_at timestamptz not null default now()
);
alter table profiles enable row level security;
drop policy if exists "Users can read own profile" on profiles;
create policy "Users can read own profile" on profiles for select using (auth.uid() = id);
drop policy if exists "Users can update own profile" on profiles;
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  -- `profiles.name` et `email` sont NOT NULL : tout doit retomber sur une
  -- chaîne vide, jamais sur NULL. Un compte créé sans e-mail (connexion par
  -- téléphone ou fournisseur OAuth qui n'en fournit pas) ferait autrement
  -- échouer l'inscription entière, le profil étant créé dans la même
  -- transaction que l'utilisateur.
  insert into public.profiles (id, email, name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      nullif(new.raw_user_meta_data->>'name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Compte'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
create or replace trigger on_auth_user_created
  after insert on auth.users for each row execute procedure public.handle_new_user();

-- RESTAURANTS
create table if not exists restaurants (
  id           uuid primary key default uuid_generate_v4(),
  owner_id     uuid not null references profiles(id) on delete cascade,
  name         text not null,
  address      text not null default '',
  logo_emoji   text not null default '🍽️',
  tables_count int  not null default 1,
  slug         text not null unique,
  created_at   timestamptz not null default now()
);
alter table restaurants enable row level security;
drop policy if exists "Owners can manage their restaurants" on restaurants;
create policy "Owners can manage their restaurants" on restaurants for all using (auth.uid() = owner_id);
drop policy if exists "Anyone can read restaurants" on restaurants;
create policy "Anyone can read restaurants" on restaurants for select using (true);

-- MENU ITEMS
create table if not exists menu_items (
  id            uuid primary key default uuid_generate_v4(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name          text not null,
  description   text not null default '',
  price         numeric(10,2) not null,
  category      text not null default 'Plats',
  emoji         text not null default '🍴',
  photo_url     text,
  is_popular    boolean not null default false,
  available     boolean not null default true,
  created_at    timestamptz not null default now()
);
alter table menu_items enable row level security;
drop policy if exists "Owner manages menu items" on menu_items;
create policy "Owner manages menu items" on menu_items for all using (
  exists (select 1 from restaurants r where r.id = menu_items.restaurant_id and r.owner_id = auth.uid())
);
drop policy if exists "Anyone can read available menu items" on menu_items;
create policy "Anyone can read available menu items" on menu_items for select using (available = true);

-- TABLES
create table if not exists tables (
  id            uuid primary key default uuid_generate_v4(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  number        int  not null,
  qr_url        text not null default '',
  created_at    timestamptz not null default now(),
  unique(restaurant_id, number)
);
alter table tables enable row level security;
drop policy if exists "Owner manages tables" on tables;
create policy "Owner manages tables" on tables for all using (
  exists (select 1 from restaurants r where r.id = tables.restaurant_id and r.owner_id = auth.uid())
);
drop policy if exists "Anyone can read tables" on tables;
create policy "Anyone can read tables" on tables for select using (true);

-- ORDERS
do $$ begin
  create type order_status as enum ('PENDING', 'PREPARING', 'READY', 'DONE');
exception when duplicate_object then null; end $$;

create table if not exists orders (
  id            uuid primary key default uuid_generate_v4(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  table_id      uuid not null references tables(id) on delete cascade,
  status        order_status not null default 'PENDING',
  note          text not null default '',
  total         numeric(10,2) not null default 0,
  payment_method text not null default 'cash',
  customer_name  text not null default '',
  customer_email text not null default '',
  created_at    timestamptz not null default now()
);
alter table orders enable row level security;
drop policy if exists "Owner manages orders" on orders;
create policy "Owner manages orders" on orders for all using (
  exists (select 1 from restaurants r where r.id = orders.restaurant_id and r.owner_id = auth.uid())
);
drop policy if exists "Anyone can create orders" on orders;
create policy "Anyone can create orders" on orders for insert with check (true);

-- ORDER ITEMS
create table if not exists order_items (
  id           uuid primary key default uuid_generate_v4(),
  order_id     uuid not null references orders(id) on delete cascade,
  menu_item_id uuid not null references menu_items(id) on delete restrict,
  quantity     int  not null default 1,
  detail       text not null default '',
  created_at   timestamptz not null default now()
);
alter table order_items enable row level security;
drop policy if exists "Anyone can insert order items" on order_items;
create policy "Anyone can insert order items" on order_items for insert with check (true);
drop policy if exists "Owner can read order items" on order_items;
create policy "Owner can read order items" on order_items for select using (
  exists (select 1 from orders o join restaurants r on r.id = o.restaurant_id
          where o.id = order_items.order_id and r.owner_id = auth.uid())
);

-- REVIEWS
create table if not exists reviews (
  id            uuid primary key default uuid_generate_v4(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  order_id      uuid references orders(id) on delete set null,
  rating        int  not null check (rating between 1 and 5),
  comment       text not null default '',
  created_at    timestamptz not null default now()
);
alter table reviews enable row level security;
drop policy if exists "Anyone can insert reviews" on reviews;
create policy "Anyone can insert reviews" on reviews for insert with check (true);
drop policy if exists "Owner can read their reviews" on reviews;
create policy "Owner can read their reviews" on reviews for select using (
  exists (select 1 from restaurants r where r.id = reviews.restaurant_id and r.owner_id = auth.uid())
);

-- REALTIME: enable replication for `orders` and `order_items`
-- (Database > Replication, or:)
-- alter publication supabase_realtime add table orders;
-- alter publication supabase_realtime add table order_items;

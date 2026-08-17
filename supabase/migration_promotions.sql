-- Promotions / events
create table if not exists promotions (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  description text not null default '',
  discount_percent int not null default 0,
  emoji text not null default '🎁',
  color text not null default '#FF9F0A',
  type text not null default 'event', -- happy_hour | seasonal | event
  start_date date default null,
  end_date date default null,
  active boolean not null default true,
  send_count int not null default 0,
  created_at timestamptz not null default now()
);
alter table promotions enable row level security;
drop policy if exists "Owner manages promotions" on promotions;
create policy "Owner manages promotions" on promotions for all using (
  exists (select 1 from restaurants r where r.id = promotions.restaurant_id and r.owner_id = auth.uid())
);
drop policy if exists "Anyone can read active promotions" on promotions;
create policy "Anyone can read active promotions" on promotions for select using (active = true);

-- Customer-facing promo codes (% or fixed amount)
create table if not exists promo_codes (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  code text not null,
  discount_percent int default null,
  discount_amount numeric(10,2) default null,
  max_uses int default null,
  use_count int not null default 0,
  start_date date default null,
  end_date date default null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(restaurant_id, code)
);
alter table promo_codes enable row level security;
drop policy if exists "Owner manages promo_codes" on promo_codes;
create policy "Owner manages promo_codes" on promo_codes for all using (
  exists (select 1 from restaurants r where r.id = promo_codes.restaurant_id and r.owner_id = auth.uid())
);
drop policy if exists "Anyone can read active promo codes" on promo_codes;
create policy "Anyone can read active promo codes" on promo_codes for select using (active = true);

-- Increment use_count without exposing direct UPDATE to anon clients.
create or replace function increment_promo_use(p_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update promo_codes set use_count = use_count + 1 where lower(code) = lower(p_code) and active = true;
end; $$;
grant execute on function increment_promo_use(text) to anon, authenticated;

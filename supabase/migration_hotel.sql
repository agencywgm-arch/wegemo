-- Wegemo Hôtel vertical.
-- Marks a property as a hotel and adds the internal check-in board. The rest of
-- the tooling (rooms = tables, room service = orders/menu) is reused as-is.

-- Which vertical a property runs as: 'resto' (default) or 'hotel'.
alter table restaurants add column if not exists vertical text not null default 'resto';

-- Internal check-in / guest stay board.
create table if not exists checkins (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  guest_name text not null,
  email text,
  room integer not null,
  guests integer not null default 1,
  checkin_date date,
  checkout_date date,
  status text not null default 'arriving',   -- arriving | in_house | departing | checked_out
  created_at timestamptz not null default now()
);
alter table checkins enable row level security;
create policy "Owner manages checkins" on checkins for all using (
  exists (select 1 from restaurants r where r.id = checkins.restaurant_id and r.owner_id = auth.uid())
) with check (
  exists (select 1 from restaurants r where r.id = checkins.restaurant_id and r.owner_id = auth.uid())
);
create index if not exists checkins_restaurant_idx on checkins(restaurant_id, checkin_date);

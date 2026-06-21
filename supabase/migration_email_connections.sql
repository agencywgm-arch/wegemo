-- Gmail OAuth connection (one per restaurant)
create table if not exists email_connections (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  email text not null,
  access_token text not null,
  refresh_token text not null,
  token_expiry timestamptz,
  created_at timestamptz not null default now(),
  unique(restaurant_id)
);
alter table email_connections enable row level security;
create policy "Owner manages email connection" on email_connections for all using (
  exists (select 1 from restaurants r where r.id = email_connections.restaurant_id and r.owner_id = auth.uid())
);

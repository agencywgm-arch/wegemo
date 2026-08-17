-- Security hardening + anonymous order-tracking RPC
drop policy if exists "Anyone can read orders by id" on orders;
drop policy if exists "Anyone can read own order items" on order_items;

create or replace function get_order_status(p_order_id uuid)
returns table (
  id uuid, status text, total numeric, table_number int,
  created_at timestamptz, items jsonb
)
language plpgsql security definer set search_path = public as $$
begin
  return query
  select o.id, o.status::text, o.total, t.number, o.created_at,
    coalesce(
      (select jsonb_agg(jsonb_build_object('name', mi.name, 'emoji', mi.emoji, 'quantity', oi.quantity))
       from order_items oi join menu_items mi on mi.id = oi.menu_item_id
       where oi.order_id = o.id), '[]'::jsonb
    ) as items
  from orders o left join tables t on t.id = o.table_id
  where o.id = p_order_id;
end; $$;
grant execute on function get_order_status(uuid) to anon, authenticated;

alter table menu_items add column if not exists stock integer;

create table if not exists campaign_logs (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references restaurants(id) on delete cascade,
  subject text not null default '',
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  created_at timestamptz not null default now()
);
alter table campaign_logs enable row level security;
drop policy if exists "Owner manages campaign_logs" on campaign_logs;
create policy "Owner manages campaign_logs" on campaign_logs for all using (
  exists (select 1 from restaurants r where r.id = campaign_logs.restaurant_id and r.owner_id = auth.uid())
);

drop policy if exists "Anyone can read ingredients" on ingredients;
drop policy if exists "Anyone can read recipe_items" on recipe_items;

-- DESIGN NOTE (migration_rls_orders_fix):
-- Orders / order_items are readable anonymously ONLY when the exact UUID is known
-- (128 bits of entropy, non-enumerable), never via an open `select *`. There is no
-- customer auth — security relies on the secret order UUID + the get_order_status RPC.

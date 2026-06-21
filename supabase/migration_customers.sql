-- CRM customers + auto-increment trigger for order_count / total_spent
create table if not exists customers (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  email text not null,
  first_name text not null default '',
  phone text not null default '',
  first_visit date not null default current_date,
  last_visit date not null default current_date,
  last_order_total numeric(10,2) default 0,
  order_count int not null default 1,
  total_spent numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  unique(restaurant_id, email)
);
alter table customers enable row level security;
create policy "Owner manages customers" on customers for all using (
  exists (select 1 from restaurants r where r.id = customers.restaurant_id and r.owner_id = auth.uid())
);

create or replace function update_customer_stats()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    NEW.order_count := 1; NEW.total_spent := NEW.last_order_total;
  elsif TG_OP = 'UPDATE' then
    NEW.order_count := OLD.order_count + 1;
    NEW.total_spent := OLD.total_spent + NEW.last_order_total;
    NEW.first_visit := OLD.first_visit; NEW.created_at := OLD.created_at;
  end if;
  return NEW;
end; $$;
create trigger customer_stats_trigger before insert or update on customers
  for each row execute function update_customer_stats();

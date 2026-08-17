-- Ingredients + recipes
create table if not exists ingredients (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  unit text not null default 'kg',
  emoji text not null default '📦',
  stock numeric(10,3) not null default 0,
  alert_threshold numeric(10,3) default null,
  created_at timestamptz not null default now()
);
alter table ingredients enable row level security;
drop policy if exists "Owner manages ingredients" on ingredients;
create policy "Owner manages ingredients" on ingredients for all using (
  exists (select 1 from restaurants r where r.id = ingredients.restaurant_id and r.owner_id = auth.uid())
);

create table if not exists recipe_items (
  id uuid primary key default uuid_generate_v4(),
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  qty_per_portion numeric(10,3) not null default 0,
  unique(menu_item_id, ingredient_id)
);
alter table recipe_items enable row level security;
drop policy if exists "Owner manages recipe items" on recipe_items;
create policy "Owner manages recipe items" on recipe_items for all using (
  exists (select 1 from menu_items mi join restaurants r on r.id = mi.restaurant_id
          where mi.id = recipe_items.menu_item_id and r.owner_id = auth.uid())
);

-- NOTE: "Anyone can read ingredients/recipe_items" policies are dropped later
-- by migration_security_fixes.sql — access is restricted to the owner only.

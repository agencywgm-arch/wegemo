-- Influencer Matching — tracked partnerships (Growth module).
-- Closes the loop: an analysis can be launched as a tracked partnership with a
-- promo code, then actual visits are recorded to compare projected vs real ROI.
create table if not exists influencer_campaigns (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  username text,
  platform text,
  promo_code text,
  budget integer,
  projected_visits integer,
  projected_roi integer,
  actual_visits integer,
  status text not null default 'active',   -- active | done
  created_at timestamptz not null default now()
);
alter table influencer_campaigns enable row level security;
drop policy if exists "Owner manages influencer campaigns" on influencer_campaigns;
create policy "Owner manages influencer campaigns" on influencer_campaigns for all using (
  exists (select 1 from restaurants r where r.id = influencer_campaigns.restaurant_id and r.owner_id = auth.uid())
) with check (
  exists (select 1 from restaurants r where r.id = influencer_campaigns.restaurant_id and r.owner_id = auth.uid())
);
create index if not exists influencer_campaigns_restaurant_idx on influencer_campaigns(restaurant_id, created_at desc);

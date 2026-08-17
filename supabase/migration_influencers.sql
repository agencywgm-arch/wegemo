-- Influencer Matching — saved analyses (Growth module).
-- Stores only the observable inputs the restaurateur entered plus the computed
-- verdict/price/ROI, so past analyses can be reviewed and benchmarked.
create table if not exists influencer_analyses (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  username text,
  platform text,
  followers integer,
  engagement_rate numeric(6,2),
  verdict text,            -- TRY | NEGOTIATE | RISKY | SKIP
  price_target integer,
  roi_realistic integer,   -- % ROI, realistic scenario
  inputs jsonb,            -- raw observable inputs for re-computation
  created_at timestamptz not null default now()
);
alter table influencer_analyses enable row level security;
drop policy if exists "Owner manages influencer analyses" on influencer_analyses;
create policy "Owner manages influencer analyses" on influencer_analyses for all using (
  exists (select 1 from restaurants r where r.id = influencer_analyses.restaurant_id and r.owner_id = auth.uid())
) with check (
  exists (select 1 from restaurants r where r.id = influencer_analyses.restaurant_id and r.owner_id = auth.uid())
);
create index if not exists influencer_analyses_restaurant_idx on influencer_analyses(restaurant_id, created_at desc);

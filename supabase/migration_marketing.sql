-- Marketing performance tracking (Growth module).
-- A unified tracker for any promotion channel — influencer partnerships AND the
-- restaurant's own staff posts. Each tracker carries a short trackable link
-- (/go/{slug}) and/or a promo code, and accumulates clicks, redemptions and
-- attributed revenue so the restaurateur sees the precise ROI of each operation.
create table if not exists marketing_trackers (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  label text not null default '',
  source text not null default 'other',        -- influencer | staff | other
  channel text not null default 'other',         -- instagram | tiktok | youtube | other
  influencer_username text,
  analysis_id uuid references influencer_analyses(id) on delete set null,
  offer text,
  promo_code text,
  slug text not null unique,
  budget numeric(10,2) not null default 0,
  clicks integer not null default 0,
  redemptions integer not null default 0,
  revenue numeric(10,2) not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now()
);
alter table marketing_trackers enable row level security;
create policy "Owner manages trackers" on marketing_trackers for all using (
  exists (select 1 from restaurants r where r.id = marketing_trackers.restaurant_id and r.owner_id = auth.uid())
) with check (
  exists (select 1 from restaurants r where r.id = marketing_trackers.restaurant_id and r.owner_id = auth.uid())
);
create index if not exists marketing_trackers_restaurant_idx on marketing_trackers(restaurant_id, created_at desc);

-- Anonymous click tracking + redirect info for /go/{slug}.
create or replace function public.track_click(p_slug text)
returns table(restaurant_slug text, promo_code text, offer text)
language plpgsql security definer set search_path = public as $$
begin
  update marketing_trackers t set clicks = clicks + 1
   where t.slug = p_slug and t.status = 'active';
  return query
    select r.slug, t.promo_code, t.offer
    from marketing_trackers t
    join restaurants r on r.id = t.restaurant_id
    where t.slug = p_slug;
end; $$;
grant execute on function public.track_click(text) to anon, authenticated;

-- Attribute a redemption + revenue to active trackers carrying the used code.
create or replace function public.track_redemption(p_restaurant uuid, p_code text, p_revenue numeric)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update marketing_trackers t
     set redemptions = redemptions + 1,
         revenue = revenue + coalesce(p_revenue, 0)
   where t.restaurant_id = p_restaurant
     and t.promo_code is not null
     and upper(t.promo_code) = upper(p_code)
     and t.status = 'active';
end; $$;
grant execute on function public.track_redemption(uuid, text, numeric) to anon, authenticated;

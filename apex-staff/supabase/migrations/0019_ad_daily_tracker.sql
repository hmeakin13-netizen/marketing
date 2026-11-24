-- Daily tracker: per-ad per-day numbers written by the monitor job, with a suggested-verdict view. Applied live.
create table if not exists public.ad_daily (
  ad_id text not null, day date not null, client_name text not null, ad_name text, status text,
  spend numeric not null default 0, impressions integer not null default 0, link_clicks integer not null default 0,
  leads integer not null default 0, frequency numeric, updated_at timestamptz not null default now(),
  primary key (ad_id, day)
);
create index if not exists ad_daily_client_day_idx on public.ad_daily (client_name, day desc);
alter table public.ad_daily enable row level security;
create policy "Managers read ad daily" on public.ad_daily for select to authenticated using (public.is_manager_or_admin());
alter table public.ad_maker_rules add column if not exists max_cpl numeric;
-- publish_ad_daily(p_secret, p_rows) upserts rows when the shared ingest key matches; ad_tracker view gives totals and
-- a suggested verdict per ad. See the live database for the function and view definitions.

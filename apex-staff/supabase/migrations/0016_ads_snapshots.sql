-- Meta Ads Monitor: one row per daily run, written by the GitHub job (service role),
-- read by managers and admin on the /ads page.
create table if not exists public.ads_snapshots (
  id bigserial primary key,
  snapshot_date date not null,
  created_at timestamptz not null default now(),
  payload jsonb not null
);
create index if not exists ads_snapshots_created_idx on public.ads_snapshots (created_at desc);
alter table public.ads_snapshots enable row level security;
create policy "Managers read ads snapshots" on public.ads_snapshots for select to authenticated
  using (public.is_manager_or_admin());
-- No insert/update/delete policies: only the service role (the daily job) can write.

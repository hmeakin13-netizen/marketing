-- Client health score: one row per client per day, written by the Health Scorer desk
-- (client care team, full runs). Managers read it on the dashboard as a traffic light.
create table if not exists public.client_health (
  client_name text not null,
  day date not null,
  score smallint check (score between 0 and 100),
  band text check (band in ('red','amber','green')),
  reason text,
  components jsonb,
  computed_by text,
  computed_at timestamptz not null default now(),
  primary key (client_name, day)
);
alter table public.client_health enable row level security;
drop policy if exists "managers read client_health" on public.client_health;
create policy "managers read client_health" on public.client_health for select using (public.is_manager_or_admin());
insert into public.ad_agents (key, name, role, status, schedule)
values ('health', 'Health Scorer', 'worker', 'idle', 'Client care full runs 09:03, 14:03, 18:03')
on conflict (key) do nothing;

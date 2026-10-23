-- Ad maker: per-client guardrails and an activity log. Applied live.
create table if not exists public.ad_maker_rules (
  client_name text primary key,
  pilot boolean not null default false,
  daily_budget numeric not null default 20,
  test_budget_pct integer not null default 25 check (test_budget_pct between 0 and 100),
  approval_mode text not null default 'auto_small' check (approval_mode in ('always','auto_small','auto_all')),
  auto_approve_max_daily numeric not null default 5,
  max_live_tests integer not null default 3,
  early_kill_multiple numeric not null default 1.5,
  keep_kill_spend numeric not null default 100,
  frequency_limit numeric not null default 3,
  max_budget_step_pct integer not null default 20,
  budget_step_hours integer not null default 48,
  suggest_mode text not null default 'when_wrong' check (suggest_mode in ('when_wrong','weekly','on_request')),
  updated_at timestamptz not null default now()
);
alter table public.ad_maker_rules enable row level security;
create policy "Managers read ad rules" on public.ad_maker_rules for select to authenticated using (public.is_manager_or_admin());
create policy "Managers edit ad rules" on public.ad_maker_rules for update to authenticated using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());

create table if not exists public.ad_activity (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  client_name text,
  kind text not null,
  summary text not null,
  reason text,
  details jsonb
);
create index if not exists ad_activity_created_idx on public.ad_activity (created_at desc);
alter table public.ad_activity enable row level security;
create policy "Managers read ad activity" on public.ad_activity for select to authenticated using (public.is_manager_or_admin());

-- Ad maker learning brain: client profiles, lessons, test log. Applied live (with seed data).
create table if not exists public.ad_client_profiles (
  client_name text primary key, trade text not null, area text,
  status text not null default 'live' check (status in ('live','onboarding','left')),
  summary text, services text, job_value text, trust_angles text, constraints text, targets text, notes text,
  updated_at timestamptz not null default now()
);
create table if not exists public.ad_learnings (
  id bigserial primary key, scope text not null check (scope in ('all','trade','client')), trade text, client_name text,
  category text not null, lesson text not null, evidence text,
  confidence text not null default 'low' check (confidence in ('low','medium','high')), source text,
  created_at timestamptz not null default now()
);
create table if not exists public.ad_tests (
  id bigserial primary key, client_name text not null, ad_name text not null, idea text, spend numeric, leads integer,
  verdict text not null default 'testing' check (verdict in ('keep','kill','testing','no_verdict')),
  notes text, as_of date not null default current_date, created_at timestamptz not null default now()
);
alter table public.ad_client_profiles enable row level security;
alter table public.ad_learnings enable row level security;
alter table public.ad_tests enable row level security;
create policy "Managers read client profiles" on public.ad_client_profiles for select to authenticated using (public.is_manager_or_admin());
create policy "Managers read learnings" on public.ad_learnings for select to authenticated using (public.is_manager_or_admin());
create policy "Managers read tests" on public.ad_tests for select to authenticated using (public.is_manager_or_admin());
alter table public.ad_maker_rules add column if not exists early_kill_spend numeric not null default 40;
alter table public.ad_maker_rules add column if not exists active boolean not null default true;

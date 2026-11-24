-- Setter dashboard: one row per setter per day of GoHighLevel activity, filled by the Setter Stats
-- desk (Sales Recovery run) so the portal can show setters side by side. Managers see all; setters their own.
create table if not exists public.setter_daily (
  staff_id uuid not null references public.staff(id),
  day date not null,
  dials integer not null default 0,
  conversations integer not null default 0,
  talk_minutes numeric,
  texts_sent integer not null default 0,
  replies integer not null default 0,
  new_leads integer not null default 0,
  first_touch_median_min numeric,
  untouched_leads integer not null default 0,
  overdue_tasks integer not null default 0,
  note text,
  updated_at timestamptz not null default now(),
  primary key (staff_id, day)
);
alter table public.setter_daily enable row level security;
drop policy if exists setter_daily_manager on public.setter_daily;
create policy setter_daily_manager on public.setter_daily for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());
drop policy if exists setter_daily_own on public.setter_daily;
create policy setter_daily_own on public.setter_daily for select using (staff_id = public.my_staff_id());

insert into public.ad_agents (key, name, role, manager_key, job, schedule, connectors, status, sort) values
 ('setterstats','Setter Stats','worker','saleslead','Counts each setter''s dials, conversations, texts, replies, speed to lead and overdue follow-ups from GoHighLevel into setter_daily for the Setter dashboard','Sales team full runs 09:02, 14:02, 18:02','GoHighLevel, Supabase','idle',121)
on conflict (key) do nothing;

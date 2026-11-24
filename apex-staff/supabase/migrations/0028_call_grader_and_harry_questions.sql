-- Sales call grader: every recorded sales call (Fathom for closers, GoHighLevel for setters) gets a
-- score out of 10 on a fixed rubric, with tips. Managers see everyone; setters and closers see their own.
alter table public.staff add column if not exists ghl_user_id text;

create table if not exists public.call_grades (
  id bigint generated always as identity primary key,
  source text not null check (source in ('fathom','ghl')),
  source_ref text not null unique,
  call_url text,
  staff_id uuid references public.staff(id),
  staff_name text not null,
  role text not null check (role in ('setter','closer','unknown')),
  prospect_label text,
  call_at timestamptz not null,
  duration_s integer,
  opening smallint not null check (opening between 0 and 2),
  discovery smallint not null check (discovery between 0 and 2),
  objections smallint not null check (objections between 0 and 2),
  next_step smallint not null check (next_step between 0 and 2),
  confirmation smallint not null check (confirmation between 0 and 2),
  total smallint generated always as (opening + discovery + objections + next_step + confirmation) stored,
  outcome text,
  summary text not null,
  strengths text,
  tips text,
  graded_by text not null default 'grader',
  graded_at timestamptz not null default now()
);
create index if not exists call_grades_staff_week on public.call_grades (staff_id, call_at desc);
alter table public.call_grades enable row level security;
drop policy if exists call_grades_manager on public.call_grades;
create policy call_grades_manager on public.call_grades for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());
drop policy if exists call_grades_own on public.call_grades;
create policy call_grades_own on public.call_grades for select using (staff_id = public.my_staff_id());

create or replace view public.call_grade_weekly with (security_invoker = true) as
select staff_id, staff_name, role,
       (date_trunc('week', call_at at time zone 'Europe/London'))::date as week_start,
       count(*)::int as calls,
       round(avg(total), 1) as avg_total,
       round(avg(opening), 1) as avg_opening,
       round(avg(discovery), 1) as avg_discovery,
       round(avg(objections), 1) as avg_objections,
       round(avg(next_step), 1) as avg_next_step,
       round(avg(confirmation), 1) as avg_confirmation,
       sum(case when outcome in ('booked','rebooked','closed') then 1 else 0 end)::int as wins
from public.call_grades
group by 1, 2, 3, 4;

-- Questions for Harry: agents' questions and flags get a reply box on the dashboard.
alter table public.ad_activity add column if not exists harry_reply text;
alter table public.ad_activity add column if not exists handled_at timestamptz;

insert into public.ad_agents (key, name, role, manager_key, job, schedule, connectors, status, sort) values
 ('grader','Call Grader','worker','saleslead','Grades every recorded sales call (Fathom for closers, GoHighLevel for setters) out of 10 on the Apex rubric, with tips, and writes the weekly scorecard','Three times a day (07:13, 13:13, 18:13); Monday scorecard text to Harry','Fathom, GoHighLevel, Supabase','idle',120)
on conflict (key) do nothing;

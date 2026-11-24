-- Setter KPIs: the extra numbers the Setter Stats desk records, and the playbook steps a setter missed.
-- Nothing is deleted or renamed.

-- Speed to lead split: leads that arrive in working hours (09:00-18:00 Mon-Sat) and leads that
-- arrive overnight or on Sunday, which should be rung between 09:00 and 09:30, oldest first.
alter table public.setter_daily
  add column if not exists first_touch_inhours_median_min numeric,
  add column if not exists overnight_leads_total integer,
  add column if not exists overnight_leads_rung_by_0930 integer;

-- One row per playbook step a setter missed on a lead. Written by the Setter Stats desk, which
-- stamps fixed_at when the step is later done. No phone numbers, emails or message text in here.
create table if not exists public.setter_playbook_misses (
  id bigint generated always as identity primary key,
  staff_id uuid not null references public.staff (id),
  day date not null,                 -- the day the step was due (London date)
  contact_id text not null,          -- GoHighLevel contact id
  lead_label text not null,          -- first name and initial only, e.g. "Sam T"
  step text not null check (step in (
    'text_a_day0', 'text_b_day2', 'text_c_day7', 'text_d_booked',
    'confirm_call_morning', 'text_e_no_answer', 'text_f_1h_before',
    'no_show_call_2min', 'text_g_no_show', 'text_h_no_show',
    'too_many_texts', 'dropped_under_10_dials',
    'no_owner', 'no_stage', 'no_next_task')),
  detail text,                       -- one plain line: what was expected and what was found
  found_at timestamptz not null default now(),
  fixed_at timestamptz,
  unique (staff_id, contact_id, step, day)
);
create index if not exists setter_playbook_misses_open_idx on public.setter_playbook_misses (staff_id, day) where fixed_at is null;

alter table public.setter_playbook_misses enable row level security;
-- Harry sees everything; a setter sees only their own misses. Managers and closers see none.
drop policy if exists "Admin all playbook misses" on public.setter_playbook_misses;
create policy "Admin all playbook misses" on public.setter_playbook_misses for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Setters read own playbook misses" on public.setter_playbook_misses;
create policy "Setters read own playbook misses" on public.setter_playbook_misses for select to authenticated
  using (staff_id = public.my_staff_id());

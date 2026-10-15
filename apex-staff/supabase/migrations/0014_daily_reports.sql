-- End-of-day report: each setter files one per working day. Applied live.
create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id),
  report_date date not null,
  dials integer not null default 0 check (dials >= 0),
  conversations integer not null default 0 check (conversations >= 0),
  calls_booked integer not null default 0 check (calls_booked >= 0),
  summary text not null check (length(btrim(summary)) >= 10),
  issues text,
  submitted_at timestamptz not null default now(),
  unique (staff_id, report_date)
);
alter table public.daily_reports enable row level security;
create policy "Read own or all if manager" on public.daily_reports for select to authenticated
  using (public.is_manager_or_admin() or staff_id = public.my_staff_id());
create policy "File own report" on public.daily_reports for insert to authenticated
  with check (staff_id = public.my_staff_id() or public.is_admin());
create policy "Edit own report" on public.daily_reports for update to authenticated
  using (staff_id = public.my_staff_id() or public.is_admin())
  with check (staff_id = public.my_staff_id() or public.is_admin());
create trigger audit_daily_reports after insert or update or delete on public.daily_reports
  for each row execute function log_audit();

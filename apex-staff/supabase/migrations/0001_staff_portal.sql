-- Apex Leads Team Portal — staff, calls, deals, payments, targets, pay, audit log
-- Runs on the team portal's OWN Supabase project (separate from the client portal).
--
-- Access model (enforced here by RLS, not just in the UI):
--   admin    – everything, including pay / commission (only the owner has this)
--   manager  – everything except pay; can edit targets and see the audit trail
--   closer   – sees all calls/deals/leaderboards, logs outcomes + cash
--   setter   – sees all calls/deals/leaderboards, books calls
-- Every policy below is gated on being an ACTIVE staff member, so a stray
-- authenticated user with no staff row can read and write nothing.

-- ---------------------------------------------------------------- enums
do $$ begin
  create type public.staff_role as enum ('admin', 'manager', 'closer', 'setter');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.call_outcome as enum
    ('scheduled', 'no_show', 'cancelled', 'follow_up', 'lost', 'closed');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- staff
create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  full_name text not null,
  role public.staff_role not null,
  active boolean not null default true,
  calendly_email text,
  created_at timestamptz not null default now(),
  deactivated_at timestamptz
);

-- Helpers. SECURITY DEFINER so policies can look up the caller's staff row
-- without recursing into the staff table's own RLS.
create or replace function public.my_staff_role()
returns public.staff_role
language sql stable security definer set search_path = public as $$
  select role from public.staff
  where email = lower(auth.jwt() ->> 'email') and active
  limit 1
$$;

create or replace function public.my_staff_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.staff
  where email = lower(auth.jwt() ->> 'email') and active
  limit 1
$$;

create or replace function public.is_staff() returns boolean
language sql stable set search_path = public as $$ select public.my_staff_role() is not null $$;

create or replace function public.is_admin() returns boolean
language sql stable set search_path = public as $$ select public.my_staff_role() = 'admin' $$;

create or replace function public.is_manager_or_admin() returns boolean
language sql stable set search_path = public as $$ select public.my_staff_role() in ('admin', 'manager') $$;

-- Only signed-in users may call the helpers (RLS policies need `authenticated`).
revoke execute on function public.my_staff_role() from public, anon;
revoke execute on function public.my_staff_id() from public, anon;
revoke execute on function public.is_staff() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_manager_or_admin() from public, anon;
grant execute on function public.my_staff_role() to authenticated;
grant execute on function public.my_staff_id() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_manager_or_admin() to authenticated;

alter table public.staff enable row level security;

create policy "Staff can read the team"
  on public.staff for select to authenticated
  using (public.is_staff() or email = lower(auth.jwt() ->> 'email'));
create policy "Admin manages the team"
  on public.staff for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- calls
create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  lead_name text not null,
  lead_email text,
  lead_phone text,
  source text,                                  -- campaign / where the lead came from
  setter_id uuid references public.staff (id),
  closer_id uuid references public.staff (id),
  booked_at timestamptz not null default now(),
  call_at timestamptz not null,
  outcome public.call_outcome not null default 'scheduled',
  outcome_logged_at timestamptz,
  recording_url text,                           -- e.g. Fathom link
  notes text,
  created_by text default (auth.jwt() ->> 'email'),
  created_at timestamptz not null default now()
);
create index if not exists calls_call_at_idx on public.calls (call_at);
create index if not exists calls_booked_at_idx on public.calls (booked_at);
create index if not exists calls_setter_idx on public.calls (setter_id);
create index if not exists calls_closer_idx on public.calls (closer_id);

alter table public.calls enable row level security;

create policy "Staff read calls"
  on public.calls for select to authenticated using (public.is_staff());
create policy "Staff book calls"
  on public.calls for insert to authenticated
  with check (
    public.is_manager_or_admin()
    or setter_id = public.my_staff_id()
    or closer_id = public.my_staff_id()
  );
create policy "Owners and managers update calls"
  on public.calls for update to authenticated
  using (
    public.is_manager_or_admin()
    or setter_id = public.my_staff_id()
    or closer_id = public.my_staff_id()
  );
create policy "Managers delete calls"
  on public.calls for delete to authenticated using (public.is_manager_or_admin());

-- ---------------------------------------------------------------- deals
create table if not exists public.closes (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null unique references public.calls (id) on delete cascade,
  closer_id uuid references public.staff (id),
  setter_id uuid references public.staff (id),
  deal_value numeric(10, 2) not null check (deal_value > 0),
  payment_type text not null check (payment_type in ('paid_in_full', 'deposit', 'payment_plan')),
  next_payment_due date,
  notes text,
  closed_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  close_id uuid not null references public.closes (id) on delete cascade,
  amount numeric(10, 2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  method text not null default 'stripe',
  note text,
  recorded_by text default (auth.jwt() ->> 'email')
);
create index if not exists closes_closer_idx on public.closes (closer_id);
create index if not exists closes_setter_idx on public.closes (setter_id);
create index if not exists payments_paid_at_idx on public.payments (paid_at);
create index if not exists payments_close_idx on public.payments (close_id);

alter table public.closes enable row level security;
alter table public.payments enable row level security;

create policy "Staff read deals"
  on public.closes for select to authenticated using (public.is_staff());
create policy "Owners and managers log deals"
  on public.closes for insert to authenticated
  with check (public.is_manager_or_admin() or closer_id = public.my_staff_id());
create policy "Owners and managers edit deals"
  on public.closes for update to authenticated
  using (public.is_manager_or_admin() or closer_id = public.my_staff_id());
create policy "Managers delete deals"
  on public.closes for delete to authenticated using (public.is_manager_or_admin());

create policy "Staff read payments"
  on public.payments for select to authenticated using (public.is_staff());
create policy "Owners and managers add payments"
  on public.payments for insert to authenticated
  with check (
    public.is_manager_or_admin()
    or exists (select 1 from public.closes c
               where c.id = close_id and c.closer_id = public.my_staff_id())
  );
create policy "Managers delete payments"
  on public.payments for delete to authenticated using (public.is_manager_or_admin());

-- ---------------------------------------------------------------- targets (KPIs)
create table if not exists public.targets (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id) on delete cascade,
  metric text not null check (metric in
    ('calls_booked', 'calls_taken', 'show_rate', 'close_rate', 'closes', 'cash_collected')),
  period text not null check (period in ('week', 'month')),
  target numeric(12, 2) not null,
  unique (staff_id, metric, period)
);
alter table public.targets enable row level security;
create policy "Staff read targets"
  on public.targets for select to authenticated using (public.is_staff());
create policy "Managers set targets"
  on public.targets for all to authenticated
  using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());

-- ---------------------------------------------------------------- pay (ADMIN ONLY)
-- Deliberately its own table so no other role can ever read it, however the
-- UI changes. Nobody but admin has a policy here.
create table if not exists public.staff_pay (
  staff_id uuid primary key references public.staff (id) on delete cascade,
  commission_pct numeric(5, 2) not null default 0 check (commission_pct between 0 and 100),
  -- what the commission is calculated on:
  --   own_closes   – cash from deals this person closed (closers)
  --   own_bookings – cash from deals on calls this person set (setters)
  --   team_cash    – all cash collected by the team (managers)
  basis text not null default 'own_closes'
    check (basis in ('own_closes', 'own_bookings', 'team_cash')),
  base_pay_weekly numeric(10, 2) not null default 0
);
alter table public.staff_pay enable row level security;
create policy "Admin only: pay"
  on public.staff_pay for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- audit trail
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_email text,
  table_name text not null,
  row_id uuid,
  action text not null,
  old_data jsonb,
  new_data jsonb
);
alter table public.audit_log enable row level security;
create policy "Managers read the audit trail"
  on public.audit_log for select to authenticated using (public.is_manager_or_admin());
-- No insert/update/delete policies: only the trigger below (SECURITY DEFINER) writes.
-- (Applied to the live project already — see the migrations list in Supabase.)

create or replace function public.log_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
begin
  if tg_op = 'DELETE' then
    rid := old.id;
    insert into public.audit_log (actor_email, table_name, row_id, action, old_data)
      values (auth.jwt() ->> 'email', tg_table_name, rid, tg_op, to_jsonb(old));
    return old;
  elsif tg_op = 'UPDATE' then
    rid := new.id;
    insert into public.audit_log (actor_email, table_name, row_id, action, old_data, new_data)
      values (auth.jwt() ->> 'email', tg_table_name, rid, tg_op, to_jsonb(old), to_jsonb(new));
    return new;
  else
    rid := new.id;
    insert into public.audit_log (actor_email, table_name, row_id, action, new_data)
      values (auth.jwt() ->> 'email', tg_table_name, rid, tg_op, to_jsonb(new));
    return new;
  end if;
end $$;

-- Trigger functions must never be callable through the API.
revoke execute on function public.log_audit() from public, anon, authenticated;

drop trigger if exists audit_calls on public.calls;
create trigger audit_calls after insert or update or delete on public.calls
  for each row execute function public.log_audit();
drop trigger if exists audit_closes on public.closes;
create trigger audit_closes after insert or update or delete on public.closes
  for each row execute function public.log_audit();
drop trigger if exists audit_payments on public.payments;
create trigger audit_payments after insert or update or delete on public.payments
  for each row execute function public.log_audit();

-- ---------------------------------------------------------------- first admin
-- Run this once with YOUR email so you can log in and add everyone else
-- from the Team page (also invite/create the same email in Authentication > Users):
--
--   insert into public.staff (email, full_name, role)
--   values ('you@example.com', 'Your Name', 'admin');

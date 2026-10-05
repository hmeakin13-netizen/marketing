-- Calendly sync: closer shifts, integration secrets, and idempotency for bookings.
alter table public.staff add column if not exists login_enabled boolean not null default true;
alter table public.calls add column if not exists calendly_invitee_uri text;
create unique index if not exists calls_calendly_invitee_uri_key on public.calls (calendly_invitee_uri);

create table if not exists public.closer_shifts (
  staff_id uuid primary key references public.staff (id) on delete cascade,
  start_time time not null,
  end_time time not null,
  days int[] not null default '{1,2,3,4,5}'  -- ISO weekdays, 1 = Monday
);
alter table public.closer_shifts enable row level security;
create policy "Staff read shifts"
  on public.closer_shifts for select to authenticated using (public.is_staff());
create policy "Managers set shifts"
  on public.closer_shifts for all to authenticated
  using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());

create table if not exists public.integrations (
  provider text primary key,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.integrations enable row level security;
-- Deliberately no policies: tokens/signing keys are readable only with the service-role key.

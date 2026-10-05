-- Pay structure (retainer + twice-monthly commission + managed-setter override) and self-billing invoices.
-- Already applied to the live project as staff_portal_8 / 9 / 10.
alter table public.staff add column if not exists manager_id uuid references public.staff (id);

alter table public.staff_pay
  add column if not exists payee_name text,
  add column if not exists payee_address text,
  add column if not exists vat_number text,
  add column if not exists agreement_date date,
  add column if not exists override_pct numeric(5, 2) not null default 0 check (override_pct between 0 and 100),
  add column if not exists retainer_monthly numeric(10, 2) not null default 0,
  add column if not exists pay_schedule text not null default 'monthly' check (pay_schedule in ('monthly', 'semi_monthly')),
  add column if not exists override_basis text not null default 'deal_value' check (override_basis in ('deal_value', 'cash')),
  add column if not exists pay_frequency text not null default 'monthly'; -- legacy, unused

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  staff_id uuid not null references public.staff (id),
  period_start timestamptz not null,
  period_end timestamptz not null,
  period_label text not null,
  lines jsonb not null,
  subtotal numeric(10, 2) not null,
  vat numeric(10, 2) not null default 0,
  total numeric(10, 2) not null,
  status text not null default 'issued' check (status in ('issued', 'paid', 'void')),
  emailed_at timestamptz,
  email_error text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists invoices_one_per_period
  on public.invoices (staff_id, period_start, period_end) where status <> 'void';
alter table public.invoices enable row level security;
create policy "Admin only: invoices"
  on public.invoices for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Retainer clients: who signed them, what they pay, and when they leave. Drives closers' retainer share.
-- Already applied to the live project as staff_portal_11.
create table if not exists public.retainer_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  closer_id uuid references public.staff (id),
  setter_id uuid references public.staff (id),
  close_id uuid references public.closes (id) on delete set null,
  monthly_fee numeric(10, 2) not null check (monthly_fee >= 0),
  start_date date not null,
  billing_day int not null check (billing_day between 1 and 31),
  end_date date,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists retainer_clients_closer_idx on public.retainer_clients (closer_id);
alter table public.retainer_clients enable row level security;
create policy "Admin only: retainer clients"
  on public.retainer_clients for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.staff_pay
  add column if not exists retainer_share_pct numeric(5, 2) not null default 0 check (retainer_share_pct between 0 and 100);

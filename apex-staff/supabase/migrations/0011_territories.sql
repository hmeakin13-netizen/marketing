-- Exclusive territories: each client blocks a radius around their postcode. Readable by all staff
-- (no pay data here), writable by admin only. Applied live as staff_portal_14.
create table if not exists public.territories (
  id uuid primary key default gen_random_uuid(),
  client_id uuid unique references public.retainer_clients (id) on delete cascade,
  name text not null,
  postcode text not null,
  lat double precision not null,
  lng double precision not null,
  radius_km numeric(6, 2) not null default 15 check (radius_km > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.territories enable row level security;
create policy "Staff read territories" on public.territories for select to authenticated using (public.is_staff());
create policy "Admin writes territories" on public.territories for all to authenticated using (public.is_admin()) with check (public.is_admin());

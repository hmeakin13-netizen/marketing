-- Phase 2: chase log behind the "Needs attention" flags.
create table if not exists public.chases (
  id uuid primary key default gen_random_uuid(),
  close_id uuid references public.closes (id) on delete cascade,
  call_id uuid references public.calls (id) on delete cascade,
  note text,
  chased_by uuid references public.staff (id),
  chased_by_email text default (auth.jwt() ->> 'email'),
  chased_at timestamptz not null default now(),
  check (close_id is not null or call_id is not null)
);
create index if not exists chases_close_idx on public.chases (close_id);
create index if not exists chases_call_idx on public.chases (call_id);
alter table public.chases enable row level security;
create policy "Staff read chases"
  on public.chases for select to authenticated using (public.is_staff());
create policy "Staff log chases"
  on public.chases for insert to authenticated with check (public.is_staff());
create policy "Managers delete chases"
  on public.chases for delete to authenticated using (public.is_manager_or_admin());

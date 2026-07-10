-- Apex Leads Client Portal — clients table + row level security
-- Run this once in the Supabase SQL editor (or via `supabase db push`).

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  email text not null unique,
  notion_page_id text,
  looker_studio_url text,
  created_at timestamptz not null default now()
);

alter table public.clients enable row level security;

-- A logged-in user can only ever read the clients row whose email matches
-- their own authenticated email. No client can query another client's row.
create policy "Clients can read their own row"
  on public.clients
  for select
  to authenticated
  using (auth.jwt() ->> 'email' = email);

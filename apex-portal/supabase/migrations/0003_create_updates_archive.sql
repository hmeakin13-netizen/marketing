-- Permanent archive of every Notion update ever seen for a client, so
-- there's a durable history independent of what's currently in Notion.
-- The dashboard still reads live from Notion on every load; this table is
-- just a mirror written to in the background on each successful fetch.

create table if not exists public.updates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  notion_block_id text not null,
  title text not null,
  date timestamptz,
  last_edited_time timestamptz not null,
  content jsonb not null,
  first_archived_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, notion_block_id)
);

alter table public.updates enable row level security;

create policy "Clients can read their own updates"
  on public.updates
  for select
  to authenticated
  using (
    exists (
      select 1 from public.clients
      where clients.id = updates.client_id
      and clients.email = auth.jwt() ->> 'email'
    )
  );

create policy "Clients can archive their own updates"
  on public.updates
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.clients
      where clients.id = updates.client_id
      and clients.email = auth.jwt() ->> 'email'
    )
  );

create policy "Clients can update their own archived updates"
  on public.updates
  for update
  to authenticated
  using (
    exists (
      select 1 from public.clients
      where clients.id = updates.client_id
      and clients.email = auth.jwt() ->> 'email'
    )
  )
  with check (
    exists (
      select 1 from public.clients
      where clients.id = updates.client_id
      and clients.email = auth.jwt() ->> 'email'
    )
  );

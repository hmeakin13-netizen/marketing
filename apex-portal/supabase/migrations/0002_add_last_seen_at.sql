-- Adds last-visit tracking so the dashboard can badge updates posted since
-- the client's previous login. Run this in the Supabase SQL editor after
-- 0001_create_clients_table.sql.

alter table public.clients
  add column if not exists last_seen_at timestamptz;

-- Lets a logged-in client update their own row only (needed so the app can
-- stamp last_seen_at on each dashboard visit). Scoped by the same email
-- match as the read policy — no client can touch another client's row.
create policy "Clients can update their own row"
  on public.clients
  for update
  to authenticated
  using (auth.jwt() ->> 'email' = email)
  with check (auth.jwt() ->> 'email' = email);

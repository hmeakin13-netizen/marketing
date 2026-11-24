-- Finance team: Finance Lead (manager) plus Cash Watcher, Invoice Chaser, Ad Spend Reconciler, Profit Tracker.
-- Read-only on Xero; drafts only; never moves money.

create table if not exists public.fin_snapshots (
  id bigint generated always as identity primary key,
  taken_at timestamptz not null default now(),
  kind text not null,                  -- 'cash', 'receivables', 'payables', 'spend_vs_invoice', 'profit'
  client_name text,
  data jsonb not null default '{}'::jsonb,
  note text
);
alter table public.fin_snapshots enable row level security;
drop policy if exists fin_snapshots_read on public.fin_snapshots;
create policy fin_snapshots_read on public.fin_snapshots for select using (public.is_manager_or_admin());

insert into public.ad_agents (key, name, role, manager_key, job, schedule, connectors, status, sort) values
 ('fin','Finance Lead','manager',null,'Runs the funds desks: reads cash, invoices, ad spend and profit findings and writes one daily finance digest','Daily 09:33','Supabase, Xero','idle',80),
 ('cash','Cash Watcher','worker','fin','Reads cash position, upcoming bills and the run-rate; warns early about a dip','Daily 08:40','Supabase, Xero','idle',81),
 ('invoices','Invoice Chaser','worker','fin','Lists overdue and due-soon invoices and drafts polite reminders for Harry to send. Never sends','Daily 08:50','Supabase, Xero','idle',82),
 ('spend','Ad Spend Reconciler','worker','fin','Compares each client''s Meta ad spend with what is invoiced and with the guarantee, and flags drift','Daily 09:00','Supabase, Xero','idle',83),
 ('profit','Profit Tracker','worker','fin','Works out profit per client and for the agency from Xero and ad spend, and spots clients that cost more than they bring','Daily 09:10','Supabase, Xero','idle',84)
on conflict (key) do nothing;

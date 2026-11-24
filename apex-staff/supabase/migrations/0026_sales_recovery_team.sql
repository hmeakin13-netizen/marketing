-- Sales Recovery team: drafts for a person to approve, plus a log of every GHL stage move.
create table if not exists public.sales_drafts (
  id bigint generated always as identity primary key,
  opportunity_id text,
  contact_id text not null,
  contact_label text,
  stage text,
  kind text not null default 'followup' check (kind in ('rebook','followup','confirm','other')),
  body text not null,
  status text not null default 'draft' check (status in ('draft','approved','sent','skipped','failed')),
  written_by text,
  note text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  sent_at timestamptz
);
create table if not exists public.sales_moves (
  id bigint generated always as identity primary key,
  opportunity_id text not null,
  contact_label text,
  from_stage text,
  to_stage text not null,
  reason text not null,
  evidence text,
  moved_by text,
  result text not null default 'moved' check (result in ('moved','failed','suggested')),
  created_at timestamptz not null default now()
);
alter table public.sales_drafts enable row level security;
alter table public.sales_moves enable row level security;
drop policy if exists sales_drafts_all on public.sales_drafts;
drop policy if exists sales_moves_all on public.sales_moves;
create policy sales_drafts_all on public.sales_drafts for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());
create policy sales_moves_all on public.sales_moves for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());
insert into public.ad_agents (key, name, role, manager_key, job, schedule, connectors, status, sort) values
 ('saleslead','Sales Lead','manager',null,'Runs Sales Recovery: reads what the other desks did and writes one daily digest on the no-show backlog and booked calls','Daily 09:20, 14:20, 18:20','Supabase','idle',100),
 ('noshow','No-show Matcher','worker','saleslead','Matches missed calls in the portal and GHL, and drafts a rebook text for each','Daily 09:00, 14:00, 18:00','GoHighLevel, Supabase','idle',101),
 ('chaser','Follow-up Chaser','worker','saleslead','Drafts the next follow-up text for prospects who have gone quiet, and sends the ones you have approved','Daily 09:05, 14:05, 18:05','GoHighLevel, Supabase','idle',102),
 ('syncer','Stage Syncer','worker','saleslead','Moves GoHighLevel opportunities to the right stage when the portal or GHL shows a no-show, a show or a rebook','Daily 09:10, 14:10, 18:10','GoHighLevel, Supabase','idle',103),
 ('booster','Call Booster','worker','saleslead','Looks for what raises booked and showed calls: best send times, wording that gets replies, sources that show up','Daily 09:15','GoHighLevel, Supabase','idle',104)
on conflict (key) do nothing;

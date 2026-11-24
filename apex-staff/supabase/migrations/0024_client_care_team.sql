-- Client Care team: Care Lead (manager) plus Client Check-in, Report Writer, Video Requester.
-- Everything is a DRAFT for a person to send (WhatsApp or GoHighLevel). Nothing is sent automatically.

create table if not exists public.care_contacts (
  client_name text primary key,
  contact_name text,
  whatsapp text,                  -- international format, digits only, e.g. 447700900123
  ghl_contact_id text,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists public.care_drafts (
  id bigint generated always as identity primary key,
  client_name text not null,
  channel text not null check (channel in ('whatsapp','ghl')),
  kind text not null check (kind in ('checkin','report','video','other')),
  body text not null,
  status text not null default 'draft' check (status in ('draft','sent','skipped')),
  written_by text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table if not exists public.client_outcomes (
  id bigint generated always as identity primary key,
  client_name text not null,
  week_start date not null,
  leads_received integer,
  booked integer,
  won integer,
  won_value numeric,
  notes text,
  source text not null default 'harry' check (source in ('client','ghl','harry')),
  created_at timestamptz not null default now()
);

alter table public.care_contacts enable row level security;
alter table public.care_drafts enable row level security;
alter table public.client_outcomes enable row level security;
drop policy if exists care_contacts_all on public.care_contacts;
drop policy if exists care_drafts_all on public.care_drafts;
drop policy if exists client_outcomes_all on public.client_outcomes;
create policy care_contacts_all on public.care_contacts for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());
create policy care_drafts_all on public.care_drafts for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());
create policy client_outcomes_all on public.client_outcomes for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());

insert into public.care_contacts (client_name) values ('FG Landscaping'), ('Dreamy Landscapes'), ('Efficient Roofing') on conflict (client_name) do nothing;

insert into public.ad_agents (key, name, role, manager_key, job, schedule, connectors, status, sort) values
 ('carelead','Care Lead','manager',null,'Runs client care: reads what the check-in, report and video desks drafted and writes one daily client-care digest','Daily 09:53 and 15:53','Supabase, GoHighLevel','idle',90),
 ('checkin','Client Check-in','worker','carelead','Drafts the weekly "how many leads booked or won?" message for each client (WhatsApp or GHL), and notices quiet clients','Daily 09:43','Supabase, GoHighLevel','idle',91),
 ('reports','Report Writer','worker','carelead','Drafts a plain-English weekly report per client from the real numbers','Daily 09:46','Supabase','idle',92),
 ('videos','Video Requester','worker','carelead','Drafts a friendly request for a short clip or fresh photos when a client has none lately','Daily 09:49','Supabase','idle',93)
on conflict (key) do nothing;

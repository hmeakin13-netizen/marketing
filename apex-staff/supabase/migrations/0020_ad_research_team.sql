-- Research team: the agents, what they do and hand to each other, and the queue of questions to look into.
create table if not exists public.ad_agents (
  key text primary key,
  name text not null,
  role text not null,
  manager_key text references public.ad_agents(key),
  job text,
  schedule text,
  connectors text,
  status text not null default 'idle' check (status in ('idle','working','error','waiting')),
  current_task text,
  last_run_at timestamptz,
  last_summary text,
  sort integer not null default 100
);
create table if not exists public.ad_agent_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  agent_key text not null references public.ad_agents(key),
  to_agent_key text references public.ad_agents(key),
  kind text not null check (kind in ('started','finished','finding','handoff','review','flag','question','error')),
  summary text not null,
  ref text
);
create index if not exists ad_agent_events_created on public.ad_agent_events (created_at desc);
create table if not exists public.ad_research_queue (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  question text not null,
  why text,
  asked_by text references public.ad_agents(key),
  assigned_to text references public.ad_agents(key),
  status text not null default 'open' check (status in ('open','in_progress','done','dropped')),
  answer text,
  answered_at timestamptz
);
alter table public.ad_agents enable row level security;
alter table public.ad_agent_events enable row level security;
alter table public.ad_research_queue enable row level security;
create policy "Managers read agents" on public.ad_agents for select to authenticated using (public.is_manager_or_admin());
create policy "Managers read agent events" on public.ad_agent_events for select to authenticated using (public.is_manager_or_admin());
create policy "Managers read research queue" on public.ad_research_queue for select to authenticated using (public.is_manager_or_admin());

insert into public.ad_agents (key, name, role, manager_key, job, schedule, connectors, sort) values
('lead','Research Lead','manager',null,'Reads everyone''s work each morning, merges duplicates, sets the day''s questions and hands them out.','Daily 07:30','Supabase, Meta ads',0),
('scout','Competitor Scout','worker','lead','Watches named competitor pages and the Ad Library for hooks, offers and formats that last.','Daily 07:00','Meta ads, Supabase',10),
('analyst','History Analyst','worker','lead','Works out what separates cheap leads from expensive ones in our own ad history.','Daily 07:05','Supabase, Meta ads',20),
('voice','Customer Voice','worker','lead','Reads calls, reviews and forums for the words customers use, and peer benchmarks.','Daily 07:10','Meta ads, Supabase, Fathom',30),
('timing','Timing Watch','worker','lead','Checks the weather and seasons for storms, frost and dry spells worth an ad angle.','Daily 06:42','Supabase',40),
('checker','Fact Checker','reviewer','lead','Checks every new finding has real evidence and the right confidence. Flags overclaims.','Daily 08:15','Supabase',50),
('numbers','Numbers Monitor','worker','lead','Reads every client''s numbers from Meta around the clock and flags problems.','Hourly (GitHub)','Meta ads',60),
('maker','Ad Maker','worker','lead','Builds and launches the tests inside the rules, and logs every move.','On request','Meta ads, Supabase, Drive',70)
on conflict (key) do nothing;

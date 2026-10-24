-- Website team (rankings, site health, local SEO) with its own manager, plus an Ads Lead for the ads desks.

create table if not exists public.web_sites (
  id bigint generated always as identity primary key,
  owner text not null,                 -- 'apex' or a client name
  url text not null unique,
  area text,                           -- where this business wants to rank, e.g. 'Waltham Abbey, Essex'
  trade text,
  keywords text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now()
);
alter table public.web_sites enable row level security;
drop policy if exists web_sites_read on public.web_sites;
create policy web_sites_read on public.web_sites for select using (public.is_manager_or_admin());

create table if not exists public.web_rankings (
  id bigint generated always as identity primary key,
  site_id bigint references public.web_sites(id) on delete cascade,
  keyword text not null,
  position integer,                    -- null = not found in the first 20 results
  engine text not null default 'google.co.uk',
  seen_at timestamptz not null default now(),
  note text
);
alter table public.web_rankings enable row level security;
drop policy if exists web_rankings_read on public.web_rankings;
create policy web_rankings_read on public.web_rankings for select using (public.is_manager_or_admin());

insert into public.ad_agents (key, name, role, manager_key, job, schedule, connectors, status, sort) values
 ('adslead','Ads Lead','manager',null,'Runs the ads desks: reads what the Maker, Photo Ranker, Copywriter, Budget Watcher and Test Judge did, and writes one daily ads digest','Daily 08:23 and 14:23','Supabase','idle',60),
 ('web','Web Lead','manager',null,'Runs the website team: reads site health, rankings and local SEO findings and writes one daily website digest','Daily 09:03','Supabase','idle',70),
 ('sitehealth','Site Health Watcher','worker','web','Checks each site loads, is quick on mobile, has working forms and a valid certificate','Daily 07:30','Supabase','idle',71),
 ('rank','Rank Tracker','worker','web','Checks where each site shows for its target searches (Google UK) and logs moves','Daily 07:40','Supabase','idle',72),
 ('seo','SEO Auditor','worker','web','Audits titles, headings, internal links, schema and content gaps against what ranks above us','Daily 07:50','Supabase','idle',73),
 ('local','Local SEO Watcher','worker','web','Watches Google Business Profile, local listings and review counts for each client and for Apex','Daily 08:00','Supabase','idle',74)
on conflict (key) do nothing;

update public.ad_agents set manager_key = 'adslead' where key in ('maker','numbers','copy','photos','budget','judge');

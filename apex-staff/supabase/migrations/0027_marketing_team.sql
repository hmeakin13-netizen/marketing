-- Marketing team (Serena): drafts of Apex-Leads own social posts. Nothing is posted automatically.
create table if not exists public.marketing_posts (
  id bigint generated always as identity primary key,
  platform text not null default 'instagram' check (platform in ('instagram','facebook','both')),
  format text not null default 'reel' check (format in ('post','reel','carousel','story')),
  topic text not null,
  hook text,
  caption text,
  hashtags text,
  script text,
  visual_brief text,
  planned_for date,
  status text not null default 'idea' check (status in ('idea','drafted','approved','ready','posted','skipped')),
  written_by text,
  evidence text,
  note text,
  metrics text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  posted_at timestamptz
);
alter table public.marketing_posts enable row level security;
drop policy if exists marketing_posts_all on public.marketing_posts;
create policy marketing_posts_all on public.marketing_posts for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());
insert into public.ad_agents (key, name, role, manager_key, job, schedule, connectors, status, sort) values
 ('mktlead','Marketing Lead','manager',null,'Runs Apex-Leads own social media for Serena: reads what the planner, writers and publisher did and writes one daily marketing digest','Daily 09:33, 15:33','Supabase','idle',110),
 ('planner','Content Planner','worker','mktlead','Plans a week of Instagram and Facebook posts and reels for Apex-Leads from checked research, sales objections and what has worked','Daily 09:33 (full plan on Mondays)','Supabase','idle',111),
 ('captions','Caption Writer','worker','mktlead','Writes captions, hooks and hashtags for each planned post, in plain trade language','Daily 09:33, 15:33','Supabase','idle',112),
 ('scripts','Reel Scriptwriter','worker','mktlead','Writes short reel scripts and shot lists for Harry or the team to film on a phone','Daily 09:33','Supabase','idle',113),
 ('publisher','Publisher','worker','mktlead','Checks each post against our rules, then puts it in the ready-to-post queue with copy and a posting reminder','Daily 09:33, 15:33','Supabase','idle',114),
 ('inbox','Inbox Watcher','worker','mktlead','Reads reachable comments and messages on Apex-Leads social accounts and drafts replies for a person to send','Daily 09:33, 15:33','Supabase, Meta ads','idle',115),
 ('postwatch','Post Analyst','worker','mktlead','Measures how each post did and tells the planner what to do more and less of','Daily 15:33','Supabase, Meta ads','idle',116)
on conflict (key) do nothing;

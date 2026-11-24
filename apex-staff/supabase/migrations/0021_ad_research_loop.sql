-- Closing the loop: photo ranks, ad proposals, and linking every test to the finding that inspired it.
alter table public.ad_tests add column if not exists learning_id bigint references public.ad_learnings(id);
alter table public.ad_tests add column if not exists proposal_id bigint;
alter table public.ad_tests add column if not exists ad_id text;
alter table public.ad_tests add column if not exists outcome text;
alter table public.ad_tests add column if not exists judged_at timestamptz;
alter table public.ad_tests add column if not exists credited_agent text references public.ad_agents(key);
alter table public.ad_client_profiles add column if not exists drive_folder_id text;

create table if not exists public.ad_photo_ranks (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  client_name text not null,
  drive_file_id text not null,
  title text,
  rank integer,
  score numeric,
  shows text,
  has_person boolean,
  has_text_overlay boolean,
  orientation text,
  quality text,
  crop_note text,
  use_for text,
  status text not null default 'candidate' check (status in ('candidate','top','used','rejected')),
  reject_reason text,
  unique (client_name, drive_file_id)
);
create table if not exists public.ad_proposals (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  client_name text not null,
  learning_id bigint references public.ad_learnings(id),
  photo_rank_id bigint references public.ad_photo_ranks(id),
  angle text not null,
  one_change text,
  primary_text text not null,
  headline text,
  description text,
  cta text not null default 'GET_QUOTE',
  daily_budget numeric not null default 5,
  rules_check text,
  status text not null default 'proposed' check (status in ('proposed','approved','building','live','rejected','retired')),
  decided_note text,
  ad_test_id bigint
);
alter table public.ad_photo_ranks enable row level security;
alter table public.ad_proposals enable row level security;
create policy "Managers read photo ranks" on public.ad_photo_ranks for select to authenticated using (public.is_manager_or_admin());
create policy "Managers read proposals" on public.ad_proposals for select to authenticated using (public.is_manager_or_admin());

insert into public.ad_agents (key, name, role, manager_key, job, schedule, connectors, sort) values
('photos','Photo Ranker','worker','lead','Looks at every new client photo in Drive and ranks them: real, rough, people at work, no text on them, big enough. Marks the best ones.','Daily 07:18','Google Drive, Supabase',25),
('copy','Copywriter','worker','lead','Turns the best findings into ad proposals for approval: one idea per test, a ranked photo, copy inside the rules. Never launches anything.','Daily 08:35','Supabase',35),
('budget','Budget Watcher','worker','lead','Checks each client''s spend against budget and rules every day: pace, test split, frequency, payment and delivery problems. Flags, never changes.','Daily 07:20','Meta ads, Supabase',55),
('judge','Test Judge','worker','lead','Judges every test against the £40 and £100 rules, writes the verdict, and credits the finding that inspired it.','Daily 07:25','Supabase',65),
('trends','Trend Scout','worker','lead','Spots what is rising in UK home-service advertising and search: formats, hooks and seasonal demand, before competitors saturate it.','Daily 07:06','Meta ads, Supabase',12),
('reviews','Review Miner','worker','lead','Reads public reviews of our clients and their competitors for what customers praise and complain about, in their words.','Daily 07:16','Supabase',32)
on conflict (key) do nothing;

update public.ad_client_profiles set drive_folder_id = '1N7eMQQvOtcsUEGQrPrx1n34xHPUAIP6v' where client_name = 'FG Landscaping';
update public.ad_client_profiles set drive_folder_id = '1nKL_iSIdevi-5TFjBkpofLrJ1gt6uHki' where client_name = 'Efficient Roofing';
update public.ad_client_profiles set drive_folder_id = '1VeVi74ZhjN9DeXYuMA5fACLz1k5BZdWE' where client_name = 'Dreamy Landscapes';

-- Plans and listing usage for vinted-lister.
create type plan_id as enum ('trial', 'starter', 'unlimited');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  plan plan_id not null default 'trial',
  -- start of current billing period (paid plans reset monthly; trial is lifetime)
  period_start timestamptz not null default now(),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  created_at timestamptz not null default now()
);

-- One row per generated listing: the source of truth for quota counting.
create table listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  created_at timestamptz not null default now(),
  title text not null,
  draft jsonb not null
);
create index listings_user_created on listings (user_id, created_at desc);

alter table profiles enable row level security;
alter table listings enable row level security;

create policy "own profile" on profiles for select using (auth.uid() = id);
create policy "own listings" on listings for select using (auth.uid() = user_id);
-- Writes happen server-side with the service role only, so users can't edit their own plan or usage.

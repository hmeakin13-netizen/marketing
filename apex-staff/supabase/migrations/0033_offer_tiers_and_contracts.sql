-- Offer tiers (Growth / Pro / Executive), a tier per client, and the Contracts section.
-- Nothing is deleted or renamed. Existing retainer fees are left exactly as they are.

-- 1. The tiers: one row each; a price or term change later is one edit here ---------------------
create table if not exists public.offer_tiers (
  key text primary key,
  name text not null,
  sort int not null default 0,
  monthly_fee numeric not null,
  min_daily_ad_spend numeric not null,
  guarantee_leads int,              -- null = no guarantee
  guarantee_days int,
  report_every_days int not null,   -- 7 = weekly, 14 = every two weeks
  exclusive_radius_km numeric,      -- null = no exclusive area
  min_term_months int not null default 0,  -- counted from the day the client signs
  notice_days int not null default 7,
  extras text,
  updated_at timestamptz not null default now()
);
alter table public.offer_tiers enable row level security;
drop policy if exists "Staff read offer tiers" on public.offer_tiers;
create policy "Staff read offer tiers" on public.offer_tiers for select to authenticated using (public.is_staff());
drop policy if exists "Admin writes offer tiers" on public.offer_tiers;
create policy "Admin writes offer tiers" on public.offer_tiers for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.offer_tiers (key, name, sort, monthly_fee, min_daily_ad_spend, guarantee_leads, guarantee_days, report_every_days, exclusive_radius_km, min_term_months, notice_days, extras) values
  ('growth', 'Apex Growth', 1, 497, 10, null, null, 14, null, 0, 7, null),
  ('pro', 'Apex Pro', 2, 1000, 20, 30, 60, 7, 10, 2, 7, null),
  ('executive', 'Apex Executive', 3, 1500, 30, 45, 60, 7, 20, 2, 7, 'Monthly strategy call with Harry. Instant auto-text to every new lead.')
on conflict (key) do nothing;

-- 2. A tier per client --------------------------------------------------------------------------
alter table public.ad_client_profiles add column if not exists tier text references public.offer_tiers (key);
-- Harry, 23 Nov: every existing client goes on Apex Pro. Their fees, areas and monitor settings are not touched.
update public.ad_client_profiles set tier = 'pro' where tier is null and trade <> 'agency' and status <> 'left';

-- 3. Add a client: the tier sets the fee, the guarantee the monitor tracks and the daily ad spend -
create or replace function public.add_client(p jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_name text := btrim(coalesce(p->>'name', ''));
  v_trade text := btrim(coalesce(p->>'trade', ''));
  v_area text := nullif(btrim(coalesce(p->>'area', '')), '');
  v_account text := nullif(regexp_replace(coalesce(p->>'meta_ad_account_id', ''), '\D', '', 'g'), '');
  v_contact text := nullif(btrim(coalesce(p->>'contact_name', '')), '');
  v_start date := coalesce(nullif(p->>'start_date', '')::date, (now() at time zone 'Europe/London')::date);
  v_tier public.offer_tiers;
  v_fee numeric;
  v_setup numeric := coalesce(nullif(p->>'setup_fee', '')::numeric, 0);
  v_day int := coalesce(nullif(p->>'billing_day', '')::int, extract(day from v_start)::int);
  v_id uuid;
  v_line text;
begin
  if not public.is_admin() then
    raise exception 'Only the admin can add a client.' using errcode = '42501';
  end if;
  if v_name = '' then raise exception 'Add the client''s name.'; end if;
  if v_trade = '' then raise exception 'Add the client''s trade.'; end if;
  select * into v_tier from public.offer_tiers where key = coalesce(nullif(p->>'tier', ''), 'pro');
  if not found then raise exception 'Pick a tier.'; end if;
  v_fee := coalesce(nullif(p->>'monthly_fee', '')::numeric, v_tier.monthly_fee);
  if exists (select 1 from public.ad_client_profiles where lower(client_name) = lower(v_name)) then
    raise exception 'There is already a client called %.', v_name;
  end if;

  insert into public.ad_client_profiles
    (client_name, trade, area, status, tier, services, notes, meta_ad_account_id, meta_page_id, meta_form_id, monitor)
  values (
    v_name, v_trade, v_area, 'onboarding', v_tier.key,
    nullif(btrim(coalesce(p->>'services', '')), ''),
    nullif(btrim(coalesce(p->>'notes', '')), ''),
    v_account,
    nullif(btrim(coalesce(p->>'meta_page_id', '')), ''),
    nullif(btrim(coalesce(p->>'meta_form_id', '')), ''),
    case when v_account is null then null else public.tier_monitor(v_tier.key) end
  );

  insert into public.retainer_clients
    (name, client_name, monthly_fee, setup_fee, start_date, billing_day, closer_id, setter_id)
  values (
    v_name, v_name, v_fee, v_setup, v_start, v_day,
    nullif(p->>'closer_id', '')::uuid, nullif(p->>'setter_id', '')::uuid
  )
  returning id into v_id;

  insert into public.care_contacts (client_name, contact_name, ghl_contact_id)
  values (v_name, v_contact, nullif(btrim(coalesce(p->>'ghl_contact_id', '')), ''))
  on conflict (client_name) do update
    set contact_name = excluded.contact_name, ghl_contact_id = excluded.ghl_contact_id, updated_at = now();

  v_line := to_char(now() at time zone 'Europe/London', 'FMDD Mon')
    || ' NEW CLIENT (Harry, portal): ' || v_name || ', ' || v_trade
    || coalesce(', ' || v_area, '')
    || '. Tier ' || v_tier.name || ', status onboarding, signed ' || to_char(v_start, 'FMDD Mon YYYY')
    || ', £' || trim(to_char(v_fee, 'FM999999990')) || ' a month'
    || coalesce(', contact ' || v_contact, '')
    || '. Full record is in ad_client_profiles, retainer_clients and care_contacts; tier terms are in offer_tiers.';
  insert into public.team_playbooks (key, body) values ('standing_rules', v_line)
  on conflict (key) do update set body = public.team_playbooks.body || E'\n' || excluded.body, updated_at = now();

  return v_id;
end $$;

-- The ads monitor's settings for a tier (guarantee to track and the daily ad spend).
create or replace function public.tier_monitor(p_tier text)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  select jsonb_build_object(
    'guarantee', case when t.guarantee_leads is null then 'none' else t.guarantee_leads || '_in_' || t.guarantee_days end,
    'go_live', 'auto',
    'daily_budget', t.min_daily_ad_spend)
  from public.offer_tiers t where t.key = p_tier
$$;

-- 4. Contracts ----------------------------------------------------------------------------------
create table if not exists public.contract_templates (
  id bigint generated always as identity primary key,
  tier text not null references public.offer_tiers (key),
  version int not null,
  body text not null,               -- wording with {{placeholders}}; a new version is a new row
  created_by uuid references public.staff (id),
  created_at timestamptz not null default now(),
  unique (tier, version)
);
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  client_name text not null references public.ad_client_profiles (client_name),
  tier text not null references public.offer_tiers (key),
  template_id bigint references public.contract_templates (id),
  status text not null default 'draft' check (status in ('draft', 'sent', 'signed', 'ended')),
  details jsonb not null default '{}'::jsonb,   -- what was filled in: business, contact, area, start date, fee
  body text not null,                            -- the exact wording this client was shown
  sign_token text unique,                        -- the private link the client signs with
  closer_id uuid references public.staff (id),   -- whose client this is
  created_by uuid references public.staff (id),
  sent_at timestamptz,
  signed_at timestamptz,
  signer_name text,
  signer_ip text,
  file_path text,                                -- the signed PDF in the private 'contracts' bucket
  created_at timestamptz not null default now()
);
create index if not exists contracts_client_idx on public.contracts (client_name);

alter table public.contract_templates enable row level security;
alter table public.contracts enable row level security;
-- Templates: Harry writes them; closers (and managers) can read them; setters cannot.
drop policy if exists "Admin writes contract templates" on public.contract_templates;
create policy "Admin writes contract templates" on public.contract_templates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Closers read contract templates" on public.contract_templates;
create policy "Closers read contract templates" on public.contract_templates for select to authenticated
  using (public.my_staff_role()::text in ('admin', 'manager', 'closer'));
-- Contracts: Harry sees all; a closer sees and creates only their own clients'; setters and managers none.
drop policy if exists "Admin all contracts" on public.contracts;
create policy "Admin all contracts" on public.contracts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Closers read own contracts" on public.contracts;
create policy "Closers read own contracts" on public.contracts for select to authenticated
  using (public.my_staff_role()::text = 'closer' and closer_id = public.my_staff_id());
drop policy if exists "Closers create own contracts" on public.contracts;
create policy "Closers create own contracts" on public.contracts for insert to authenticated
  with check (public.my_staff_role()::text = 'closer' and closer_id = public.my_staff_id() and status in ('draft', 'sent'));

-- Signed copies live in a private bucket with no policies: only the portal's server can read it,
-- and it hands out short-lived links after checking who is asking.
insert into storage.buckets (id, name, public) values ('contracts', 'contracts', false) on conflict (id) do nothing;

-- Starter templates: the commercial terms are filled in from the tier; the legal wording is Harry's to add.
insert into public.contract_templates (tier, version, body)
select t.key, 1,
'SERVICE AGREEMENT: {{tier_name}}

Between Apex Leadgen Ltd ("Apex-Leads") and {{business_name}} ("the Client"), represented by {{contact_name}}.

1. Service
Apex-Leads will run lead generation advertising for the Client in this area: {{area}}.
[LEGAL WORDING FROM HARRY: what is included in this tier]

2. Fees
The Client pays {{monthly_fee}} a month, starting on {{start_date}}. There is no setup fee.

3. Ad spend
The Client pays their own advertising spend direct to Meta, at a minimum of {{ad_spend}} a day. The Client owns the Facebook Page, the ad account and all data.

4. Guarantee
{{guarantee}}

5. Exclusive area
{{exclusive_area}}

6. Term and notice
{{term}}

7. Reporting
{{reporting}}

[LEGAL WORDING FROM HARRY: liability, data protection, governing law and any other terms]

Signed for the Client: {{contact_name}}, {{business_name}}'
from public.offer_tiers t
where not exists (select 1 from public.contract_templates c where c.tier = t.key);

-- Add a client in one go, mark a client as left, and let the Meta ads monitor read its client
-- list from the database instead of meta-ads-monitor/config/clients.json.
-- Nothing is deleted or renamed: only new columns, three functions and a backfill of what is
-- already in clients.json.

-- 1. New columns -----------------------------------------------------------------------------
alter table public.ad_client_profiles
  add column if not exists meta_ad_account_id text, -- digits only, no "act_"
  add column if not exists meta_page_id text,
  add column if not exists meta_form_id text,       -- instant (lead) form id
  add column if not exists left_on date,
  add column if not exists monitor jsonb;           -- the monitor's settings for this client (guarantee, go_live, daily_budget ...)

-- Ties a retainer row to its client profile (the two tables have used different names until now).
alter table public.retainer_clients add column if not exists client_name text;

-- 2. Backfill ---------------------------------------------------------------------------------
-- Meta accounts and monitor settings, copied from config/clients.json as it stands today.
update public.ad_client_profiles set meta_ad_account_id = '27050808927935172',
  monitor = '{"guarantee":"none","own":true,"target_cpl":5,"max_cpl":5,"notes":"Own account. CPL target under £5."}'::jsonb
  where client_name = 'Apex-Leads' and meta_ad_account_id is null;
update public.ad_client_profiles set meta_ad_account_id = '1726310475597012',
  monitor = '{"guarantee":"30_in_60","go_live":"auto","daily_budget":20}'::jsonb
  where client_name = 'Efficient Roofing' and meta_ad_account_id is null;
update public.ad_client_profiles set meta_ad_account_id = '2051994528838795',
  monitor = '{"guarantee":"30_in_60","go_live":"auto","daily_budget":20}'::jsonb
  where client_name = 'Sovereign Roofing and Building' and meta_ad_account_id is null;
update public.ad_client_profiles set meta_ad_account_id = '2545632992580003',
  monitor = '{"guarantee":"30_in_60","go_live":"auto","daily_budget":20}'::jsonb
  where client_name = 'Eco Ground Solutions Ltd' and meta_ad_account_id is null;

-- Link the retainer rows we can match with certainty to their profile.
update public.retainer_clients r set client_name = m.profile
from (values
  ('Mateusz Brudecki', 'Mateusz Brudecki'),
  ('Nathan Hughes', 'Nathan Hughes'),
  ('Kian Fouche', 'Kian Fouche'),
  ('Michael Bond', 'Michael Bond (CrownCraft)'),
  ('Jamie Ryde-Phillips', 'JRP Landscape & Gardening (Jamie Ryder-Phillips)'),
  ('James Oleary', 'Efficient Roofing'),
  ('Bobby Friend (Sovereign Roofing)', 'Sovereign Roofing and Building'),
  ('Jim Parry', 'Eco Ground Solutions Ltd'),
  ('Sam Mccan', 'Elite Roofing')
) as m(retainer, profile)
where r.name = m.retainer and r.client_name is null
  and exists (select 1 from public.ad_client_profiles p where p.client_name = m.profile);

-- 3. Add a client: every table in one transaction (all of it saves, or none of it) -------------
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
  v_fee numeric := coalesce(nullif(p->>'monthly_fee', '')::numeric, 1000);
  v_setup numeric := coalesce(nullif(p->>'setup_fee', '')::numeric, 500);
  v_day int := coalesce(nullif(p->>'billing_day', '')::int, extract(day from v_start)::int);
  v_id uuid;
  v_line text;
begin
  if not public.is_admin() then
    raise exception 'Only the admin can add a client.' using errcode = '42501';
  end if;
  if v_name = '' then raise exception 'Add the client''s name.'; end if;
  if v_trade = '' then raise exception 'Add the client''s trade.'; end if;
  if exists (select 1 from public.ad_client_profiles where lower(client_name) = lower(v_name)) then
    raise exception 'There is already a client called %.', v_name;
  end if;

  insert into public.ad_client_profiles
    (client_name, trade, area, status, services, notes, meta_ad_account_id, meta_page_id, meta_form_id, monitor)
  values (
    v_name, v_trade, v_area, 'onboarding',
    nullif(btrim(coalesce(p->>'services', '')), ''),
    nullif(btrim(coalesce(p->>'notes', '')), ''),
    v_account,
    nullif(btrim(coalesce(p->>'meta_page_id', '')), ''),
    nullif(btrim(coalesce(p->>'meta_form_id', '')), ''),
    case when v_account is null then null
         else jsonb_build_object('guarantee', '30_in_60', 'go_live', 'auto', 'daily_budget', 20) end
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
    || '. Status onboarding, signed ' || to_char(v_start, 'FMDD Mon YYYY')
    || ', £' || trim(to_char(v_fee, 'FM999999990')) || ' a month plus £' || trim(to_char(v_setup, 'FM999999990')) || ' setup'
    || coalesce(', contact ' || v_contact, '')
    || '. Full record is in ad_client_profiles, retainer_clients and care_contacts.';
  insert into public.team_playbooks (key, body) values ('standing_rules', v_line)
  on conflict (key) do update set body = public.team_playbooks.body || E'\n' || excluded.body, updated_at = now();

  return v_id;
end $$;

-- 4. Mark a client as left ----------------------------------------------------------------------
create or replace function public.mark_client_left(p_client_name text, p_left_on date default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_on date := coalesce(p_left_on, (now() at time zone 'Europe/London')::date);
begin
  if not public.is_admin() then
    raise exception 'Only the admin can mark a client as left.' using errcode = '42501';
  end if;
  update public.ad_client_profiles set status = 'left', left_on = v_on, updated_at = now()
    where client_name = p_client_name;
  if not found then raise exception 'No client called %.', p_client_name; end if;

  update public.territories set active = false
    where client_id in (select id from public.retainer_clients where client_name = p_client_name);
  update public.retainer_clients set end_date = v_on
    where client_name = p_client_name and (end_date is null or end_date > v_on);

  insert into public.team_playbooks (key, body) values (
    'standing_rules',
    to_char(now() at time zone 'Europe/London', 'FMDD Mon') || ' CLIENT LEFT (Harry, portal): ' || p_client_name
      || ' left on ' || to_char(v_on, 'FMDD Mon YYYY') || '. Treat them as gone: no new work, drafts or messages for them.'
  )
  on conflict (key) do update set body = public.team_playbooks.body || E'\n' || excluded.body, updated_at = now();
end $$;

-- 5. Client list for the Meta ads monitor (same shared ingest key as publish_ad_daily) ----------
create or replace function public.monitor_clients(p_secret text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (select 1 from public.ads_ingest_key_check(p_secret)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(c.monitor || jsonb_build_object('name', c.client_name, 'ad_account_id', 'act_' || c.meta_ad_account_id)
                     order by c.client_name)
    from public.ad_client_profiles c
    where c.status in ('live', 'onboarding') and c.meta_ad_account_id is not null and c.monitor is not null
  ), '[]'::jsonb);
end $$;

revoke all on function public.add_client(jsonb) from public, anon;
revoke all on function public.mark_client_left(text, date) from public, anon;
grant execute on function public.add_client(jsonb) to authenticated;
grant execute on function public.mark_client_left(text, date) to authenticated;
grant execute on function public.monitor_clients(text) to anon, authenticated;

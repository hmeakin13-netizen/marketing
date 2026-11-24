-- Calls booked by hand have no campaign source. Credit them to the setter by first name
-- (that is what counts towards the setter's "calls booked"), but never overwrite a source
-- that is already there (for example 'meta').
create or replace function public.calls_default_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.source is null or btrim(new.source) = '') and new.setter_id is not null then
    select split_part(btrim(full_name), ' ', 1) into new.source
    from public.staff
    where id = new.setter_id;
  end if;
  return new;
end;
$$;

drop trigger if exists calls_default_source on public.calls;
create trigger calls_default_source
  before insert or update of setter_id, source on public.calls
  for each row execute function public.calls_default_source();

-- Fill the calls that are blank today.
update public.calls c
set source = split_part(btrim(s.full_name), ' ', 1)
from public.staff s
where s.id = c.setter_id
  and (c.source is null or btrim(c.source) = '');

-- Setter notes: what the setter learned before the closer rings (answers to a few set prompts).
alter table public.calls add column if not exists setter_notes jsonb;

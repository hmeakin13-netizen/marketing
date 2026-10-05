-- Only an admin can change who set / who closed a call or deal (filling in a blank is still allowed).
-- Applied live as staff_portal_15a / 15b.
create or replace function public.guard_assignment_change() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and not public.is_admin() then
    if (old.setter_id is not null and new.setter_id is distinct from old.setter_id)
       or (old.closer_id is not null and new.closer_id is distinct from old.closer_id) then
      raise exception 'Only an admin can change who set or closed this';
    end if;
  end if;
  return new;
end $$;
create trigger guard_call_assignment before update on public.calls
  for each row execute function public.guard_assignment_change();
create trigger guard_close_assignment before update on public.closes
  for each row execute function public.guard_assignment_change();

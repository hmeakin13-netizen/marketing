-- Staff emails must be trimmed + lowercase (stray newlines broke login matching). Applied live.
update public.staff set email = lower(btrim(email, E' \t\r\n')) where email <> lower(btrim(email, E' \t\r\n'));
alter table public.staff add constraint staff_email_clean check (email = lower(btrim(email, E' \t\r\n')));

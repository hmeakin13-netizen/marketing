-- GoHighLevel calendar sync: GHL users map to staff, GHL appointments map to calls.
alter table public.staff add column if not exists ghl_user_id text;
create unique index if not exists staff_ghl_user_id_key on public.staff (ghl_user_id) where ghl_user_id is not null;
alter table public.calls add column if not exists ghl_event_id text;
create unique index if not exists calls_ghl_event_id_key on public.calls (ghl_event_id) where ghl_event_id is not null;

update public.staff set ghl_user_id = '927Wl8qQGdh9iRDRiGjA' where email = 'hmeakin15@gmail.com';
update public.staff set ghl_user_id = '9AOWtX0Unjc0RlTjckkH' where email = 'info.danries@gmail.com';
update public.staff set ghl_user_id = 'mYKKbJegzfeussAabiTt' where email = 'kayaanchander@gmail.com';
update public.staff set ghl_user_id = 'Pc060Txfcu7C5ohGnkOc' where email = 'kyleella13@gmail.com';
update public.staff set ghl_user_id = 'icIM2qdHibWzHWdmjGo6' where email = 'saagar.makwana1003@gmail.com';

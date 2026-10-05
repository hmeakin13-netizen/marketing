-- Clients have a one-time setup fee (base for the manager override) and a recurring monthly retainer. Applied live as staff_portal_13.
alter table public.retainer_clients add column if not exists setup_fee numeric(10, 2) not null default 0 check (setup_fee >= 0);

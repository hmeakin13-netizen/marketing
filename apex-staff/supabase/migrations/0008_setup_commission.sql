-- One-time commission for the setter on each client they set. Applied live as staff_portal_14.
alter table public.staff_pay
  add column if not exists setup_commission_pct numeric(5, 2) not null default 0 check (setup_commission_pct between 0 and 100),
  add column if not exists setup_commission_flat numeric(10, 2) not null default 0 check (setup_commission_flat >= 0);

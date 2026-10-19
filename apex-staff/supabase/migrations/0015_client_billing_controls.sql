-- Retainer billing controls: choose when the first retainer payment is due, and pause/resume a client's
-- retainer (free trial, guarantee not yet hit, account still being set up). Applied live.
alter table public.retainer_clients
  add column if not exists first_billing_date date,
  add column if not exists pause_from date,
  add column if not exists pause_until date,
  add column if not exists pause_reason text;

-- Sale payouts are released the day a sale is fully paid AND its contract is signed.
-- Applied live as staff_portal_16 / 16b.
alter table public.closes add column if not exists contract_signed_at date;
alter table public.invoices add column if not exists close_id uuid references public.closes (id) on delete set null;
create unique index if not exists invoices_one_per_deal
  on public.invoices (staff_id, close_id) where status <> 'void' and close_id is not null;

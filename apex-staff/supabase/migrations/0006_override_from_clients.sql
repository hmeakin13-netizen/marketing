-- Override can be calculated automatically from the Clients list. Applied live as staff_portal_12.
alter table public.staff_pay drop constraint if exists staff_pay_override_basis_check;
alter table public.staff_pay add constraint staff_pay_override_basis_check check (override_basis in ('client_fee', 'deal_value', 'cash'));
alter table public.staff_pay alter column override_basis set default 'client_fee';

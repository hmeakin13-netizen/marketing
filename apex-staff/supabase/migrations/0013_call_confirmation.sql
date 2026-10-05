-- Setter pre-call confirmation (e.g. "confirmed on Zoom", "no answer"). Applied live.
alter table public.calls
  add column if not exists confirmation text not null default 'unconfirmed',
  add column if not exists confirmation_note text,
  add column if not exists confirmation_at timestamptz,
  add column if not exists confirmation_by uuid references public.staff (id);
alter table public.calls add constraint calls_confirmation_valid
  check (confirmation in ('unconfirmed','confirmed','no_answer','left_message','reschedule','other'));

-- Calendly's per-invitee reschedule link, shown to the setter when the lead wants to move the call. Applied live.
alter table public.calls add column if not exists reschedule_url text;

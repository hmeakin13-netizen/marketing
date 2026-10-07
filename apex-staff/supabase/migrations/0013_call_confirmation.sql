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

-- Admin can waive the Fathom requirement for a one-off call (e.g. a sale entered after the fact). Applied live.
alter table public.calls add column if not exists recording_waived boolean not null default false;

-- When Calendly moved a call to a new time, so the closer can be shown an "updated" notice. Applied live.
alter table public.calls add column if not exists rescheduled_at timestamptz;

-- Per-client override of the closer's retainer share (e.g. 25% on one client instead of their usual 17.5%). Applied live.
alter table public.retainer_clients add column if not exists closer_share_pct numeric(5,2)
  check (closer_share_pct is null or closer_share_pct between 0 and 100);

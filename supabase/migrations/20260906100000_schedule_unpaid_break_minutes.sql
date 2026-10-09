alter table public.schedule_published_shifts
  add column if not exists unpaid_break_minutes integer not null default 0
  check (unpaid_break_minutes in (0, 15, 30, 45, 60));

alter table public.schedule_draft_shifts
  add column if not exists unpaid_break_minutes integer not null default 0
  check (unpaid_break_minutes in (0, 15, 30, 45, 60));

alter table public.schedule_edit_session_shifts
  add column if not exists unpaid_break_minutes integer not null default 0
  check (unpaid_break_minutes in (0, 15, 30, 45, 60));

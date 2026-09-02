alter table public.schedule_published_shifts
  add column if not exists hide_time_on_badge boolean not null default false;

alter table public.schedule_draft_shifts
  add column if not exists hide_time_on_badge boolean not null default false;

alter table public.schedule_edit_session_shifts
  add column if not exists hide_time_on_badge boolean not null default false;

alter table public.schedule_template_shifts
  add column if not exists hide_time_on_badge boolean not null default false;

alter table public.owner_setup_checklist_progress
  drop constraint if exists owner_setup_checklist_progress_completed_item_ids_check;

alter table public.owner_setup_checklist_progress
  add constraint owner_setup_checklist_progress_completed_item_ids_check
  check (
    completed_item_ids <@ array[
      'app_tour',
      'scheduling_preferences',
      'employees',
      'kiosk',
      'documents',
      'schedule',
      'billing'
    ]::text[]
  );

create or replace function app_private.owner_setup_checklist_item_ids()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'app_tour',
    'scheduling_preferences',
    'employees',
    'kiosk',
    'documents',
    'schedule',
    'billing'
  ]::text[];
$$;

revoke all on function app_private.owner_setup_checklist_item_ids()
from public, anon, authenticated;

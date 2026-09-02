insert into public.permissions (key, label, category, description, custom_grantable, sort_order)
values
  ('time.export.preview.location', 'Preview time exports', 'Time', 'Preview reviewed time records for export within assigned locations.', true, 380),
  ('time.export.create.location', 'Create time exports', 'Time', 'Create immutable reviewed-time export snapshots for assigned locations.', true, 390),
  ('time.export.read.location', 'Read time exports', 'Time', 'Read prior reviewed-time export snapshots for assigned locations.', true, 400),
  ('time.export.audit.read', 'View time export audit', 'Time', 'View time export audit history.', true, 410)
on conflict (key) do update set
  label = excluded.label,
  category = excluded.category,
  description = excluded.description,
  custom_grantable = excluded.custom_grantable,
  sort_order = excluded.sort_order;

insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
select role.workspace_id, role.id, permission.key
from public.workspace_roles role
cross join (
  values
    ('time.export.preview.location'),
    ('time.export.create.location'),
    ('time.export.read.location'),
    ('time.export.audit.read')
) permission(key)
where role.system_key in ('owner', 'admin')
on conflict do nothing;

create or replace function public.grant_new_system_role_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.system_key in ('owner', 'admin') then
    insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
    select new.workspace_id, new.id, key from public.permissions on conflict do nothing;
  elsif new.system_key = 'manager' then
    insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
    select new.workspace_id, new.id, key from public.permissions
    where key in (
      'workspace.read', 'schedule.read', 'schedule.manage', 'schedule.publish',
      'schedule.templates.manage', 'schedule.export', 'schedule.lineup.read',
      'schedule.lineup.manage', 'schedule.lineup.share', 'schedule.time_off_requests.read',
      'schedule.time_off_requests.manage', 'schedule.shift_change_requests.read',
      'schedule.shift_change_requests.manage', 'employees.read', 'employees.manage',
      'employee_onboarding.review', 'announcements.read', 'announcements.manage',
      'notifications.read', 'time.capture.own', 'time.read.own',
      'time.correction.request.own', 'time.read.location', 'time.amend.location',
      'time.correction.review.location', 'time.review.approve.location',
      'kiosk.device.enroll.location', 'kiosk.device.read.location',
      'kiosk.device.revoke.location', 'kiosk.pin.reset.location',
      'kiosk.audit.read.location'
    ) on conflict do nothing;
  elsif new.system_key = 'employee' then
    insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
    select new.workspace_id, new.id, key from public.permissions
    where key in (
      'workspace.read', 'schedule.read', 'announcements.read', 'notifications.read',
      'time.capture.own', 'time.read.own', 'time.correction.request.own'
    ) on conflict do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.initialize_workspace_roles(target_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_role_id uuid;
  admin_role_id uuid;
  manager_role_id uuid;
  employee_role_id uuid;
begin
  insert into public.workspace_roles (
    workspace_id, name, description, system_key, access_class, sort_order
  ) values
    (target_workspace_id, 'Owner', 'Full workspace authority and ownership protection.', 'owner', 'owner', 0),
    (target_workspace_id, 'Admin', 'Workspace administration without ownership transfer.', 'admin', 'admin', 10),
    (target_workspace_id, 'Manager', 'Schedule operations for assigned locations.', 'manager', 'manager', 20),
    (target_workspace_id, 'Employee', 'Personal workspace and published schedule access.', 'employee', 'employee', 30)
  on conflict do nothing;

  select id into owner_role_id from public.workspace_roles
  where workspace_id = target_workspace_id and system_key = 'owner';
  select id into admin_role_id from public.workspace_roles
  where workspace_id = target_workspace_id and system_key = 'admin';
  select id into manager_role_id from public.workspace_roles
  where workspace_id = target_workspace_id and system_key = 'manager';
  select id into employee_role_id from public.workspace_roles
  where workspace_id = target_workspace_id and system_key = 'employee';

  insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
  select target_workspace_id, owner_role_id, key from public.permissions on conflict do nothing;
  insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
  select target_workspace_id, admin_role_id, key from public.permissions on conflict do nothing;
  insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
  select target_workspace_id, manager_role_id, key from public.permissions
  where key in (
    'workspace.read', 'schedule.read', 'schedule.manage', 'schedule.publish',
    'schedule.templates.manage', 'schedule.export', 'schedule.lineup.read',
    'schedule.lineup.manage', 'schedule.lineup.share', 'schedule.time_off_requests.read',
    'schedule.time_off_requests.manage', 'schedule.shift_change_requests.read',
    'schedule.shift_change_requests.manage', 'employees.read', 'employees.manage',
    'employee_onboarding.review', 'announcements.read', 'announcements.manage',
    'notifications.read', 'time.capture.own', 'time.read.own',
    'time.correction.request.own', 'time.read.location', 'time.amend.location',
    'time.correction.review.location', 'time.review.approve.location',
    'kiosk.device.enroll.location', 'kiosk.device.read.location',
    'kiosk.device.revoke.location', 'kiosk.pin.reset.location',
    'kiosk.audit.read.location'
  ) on conflict do nothing;
  insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
  select target_workspace_id, employee_role_id, key from public.permissions
  where key in (
    'workspace.read', 'schedule.read', 'announcements.read', 'notifications.read',
    'time.capture.own', 'time.read.own', 'time.correction.request.own'
  ) on conflict do nothing;
end;
$$;

create or replace function public.enforce_role_permission_dependencies()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  checked_role_id uuid := coalesce(new.role_id, old.role_id);
begin
  if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='schedule.manage') and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='schedule.read') then raise exception 'schedule.manage requires schedule.read' using errcode='23514'; end if;
  if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key in('schedule.publish','schedule.templates.manage')) and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='schedule.manage') then raise exception 'schedule publication and templates require schedule.manage' using errcode='23514'; end if;
  if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key in('schedule.export','schedule.lineup.read','schedule.time_off_requests.read','schedule.shift_change_requests.read')) and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='schedule.read') then raise exception 'schedule child access requires schedule.read' using errcode='23514'; end if;
  if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key in('schedule.lineup.manage','schedule.lineup.share')) and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='schedule.lineup.read') then raise exception 'line-up management and sharing require line-up read' using errcode='23514'; end if;
  if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='schedule.time_off_requests.manage') and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='schedule.time_off_requests.read') then raise exception 'time off request management requires read' using errcode='23514'; end if;
  if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='schedule.shift_change_requests.manage') and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='schedule.shift_change_requests.read') then raise exception 'shift change request management requires read' using errcode='23514'; end if;
  if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='documents.manage') and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='documents.read') then raise exception 'documents.manage requires documents.read' using errcode='23514'; end if;
  if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='signature_templates.manage') and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='signature_templates.read') then raise exception 'signature_templates.manage requires signature_templates.read' using errcode='23514'; end if;
  if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key in('employees.manage','employees.archive')) and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='employees.read') then raise exception 'employee management requires employees.read' using errcode='23514'; end if;
  if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='employee_access.manage') and (not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='employees.read') or not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='roles.read')) then raise exception 'employee_access.manage requires employees.read and roles.read' using errcode='23514'; end if;
  if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='employee_onboarding.review') and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='employees.read') then raise exception 'employee onboarding review requires employees.read' using errcode='23514'; end if;
  if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='employee_documents.review') and (not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='employee_onboarding.review') or not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='documents.read')) then raise exception 'employee document review requires onboarding review and documents.read' using errcode='23514'; end if;
  if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key in('time.capture.own','time.correction.request.own')) and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='time.read.own') then raise exception 'own time capture and correction require own time read' using errcode='23514'; end if;
  if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key in('time.amend.location','time.correction.review.location','time.review.approve.location','time.export.preview.location','time.export.create.location','time.export.read.location')) and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='time.read.location') then raise exception 'location time management requires location time read' using errcode='23514'; end if;
  if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key in('time.export.create.location','time.export.read.location')) and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='time.export.preview.location') then raise exception 'time export create and read require export preview' using errcode='23514'; end if;
  return null;
end;
$$;

create type public.time_export_snapshot_status as enum ('active', 'superseded');

create table public.time_export_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  from_date date not null,
  to_date date not null,
  location_ids uuid[] not null check (array_length(location_ids, 1) between 1 and 50),
  export_schema_version integer not null default 1 check (export_schema_version = 1),
  status public.time_export_snapshot_status not null default 'active',
  memo text not null check (char_length(btrim(memo)) between 3 and 500),
  row_count integer not null default 0 check (row_count >= 0),
  warning_count integer not null default 0 check (warning_count >= 0),
  created_by uuid not null references auth.users(id),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, created_by, idempotency_key),
  check (to_date >= from_date and to_date - from_date <= 41)
);

create table public.time_export_snapshot_rows (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.time_export_snapshots(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  session_id uuid not null,
  session_revision integer not null check (session_revision > 0),
  employee_id uuid not null,
  employee_code text not null,
  employee_display_name text not null,
  location_id uuid not null,
  location_name text not null,
  location_timezone text not null,
  session_date date not null,
  raw_started_at timestamptz not null,
  raw_ended_at timestamptz not null,
  effective_started_at timestamptz not null,
  effective_ended_at timestamptz not null,
  raw_elapsed_minutes integer not null check (raw_elapsed_minutes > 0),
  capture_state public.time_capture_state not null,
  review_state public.time_review_state not null,
  review_window_id uuid not null references public.time_review_windows(id) on delete restrict,
  warning_codes text[] not null default '{}',
  event_ids uuid[] not null default '{}',
  amendment_ids uuid[] not null default '{}',
  correction_request_ids uuid[] not null default '{}',
  manual_entry_id uuid,
  generated_columns jsonb not null default '{}'::jsonb,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (session_id, workspace_id, employee_id, location_id)
    references public.time_sessions(id, workspace_id, employee_id, location_id) on delete restrict,
  unique (snapshot_id, session_id),
  check (raw_ended_at > raw_started_at),
  check (effective_ended_at > effective_started_at)
);

create index time_export_snapshots_workspace_time_idx
  on public.time_export_snapshots (workspace_id, created_at desc);

create index time_export_snapshot_rows_session_idx
  on public.time_export_snapshot_rows (workspace_id, session_id, session_revision)
  where superseded_at is null;

create index time_export_snapshot_rows_location_date_idx
  on public.time_export_snapshot_rows (workspace_id, location_id, session_date);

alter table public.time_export_snapshots enable row level security;

alter table public.time_export_snapshot_rows enable row level security;

revoke all on public.time_export_snapshots, public.time_export_snapshot_rows from public, anon, authenticated;

grant select, insert, update on public.time_export_snapshots to service_role;

grant select, insert, update on public.time_export_snapshot_rows to service_role;

create function public.protect_time_export_snapshot_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'time export snapshots are append only' using errcode = '42501';
  end if;
  if old.workspace_id <> new.workspace_id
    or old.from_date <> new.from_date
    or old.to_date <> new.to_date
    or old.location_ids <> new.location_ids
    or old.export_schema_version <> new.export_schema_version
    or old.memo <> new.memo
    or old.row_count <> new.row_count
    or old.warning_count <> new.warning_count
    or old.created_by <> new.created_by
    or old.idempotency_key <> new.idempotency_key
    or old.created_at <> new.created_at
    or not (old.status = 'active' and new.status = 'superseded') then
    raise exception 'time export snapshot is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger protect_time_export_snapshot_history_trigger
before update or delete on public.time_export_snapshots
for each row execute function public.protect_time_export_snapshot_history();

create function public.protect_time_export_snapshot_row_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'time export snapshot rows are append only' using errcode = '42501';
  end if;
  if old.snapshot_id <> new.snapshot_id
    or old.workspace_id <> new.workspace_id
    or old.session_id <> new.session_id
    or old.session_revision <> new.session_revision
    or old.employee_id <> new.employee_id
    or old.employee_code <> new.employee_code
    or old.employee_display_name <> new.employee_display_name
    or old.location_id <> new.location_id
    or old.location_name <> new.location_name
    or old.location_timezone <> new.location_timezone
    or old.session_date <> new.session_date
    or old.raw_started_at <> new.raw_started_at
    or old.raw_ended_at <> new.raw_ended_at
    or old.effective_started_at <> new.effective_started_at
    or old.effective_ended_at <> new.effective_ended_at
    or old.raw_elapsed_minutes <> new.raw_elapsed_minutes
    or old.capture_state <> new.capture_state
    or old.review_state <> new.review_state
    or old.review_window_id <> new.review_window_id
    or old.warning_codes <> new.warning_codes
    or old.event_ids <> new.event_ids
    or old.amendment_ids <> new.amendment_ids
    or old.correction_request_ids <> new.correction_request_ids
    or old.manual_entry_id is distinct from new.manual_entry_id
    or old.generated_columns <> new.generated_columns
    or old.created_at <> new.created_at
    or old.superseded_at is not null
    or new.superseded_at is null then
    raise exception 'time export snapshot row is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger protect_time_export_snapshot_row_history_trigger
before update or delete on public.time_export_snapshot_rows
for each row execute function public.protect_time_export_snapshot_row_history();

create function public.time_export_normalize_location_ids(target_location_ids uuid[])
returns uuid[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(distinct location_id order by location_id), '{}')::uuid[]
  from unnest(coalesce(target_location_ids, '{}')) location_id;
$$;

create function public.time_export_preview_rows(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_location_ids uuid[],
  target_from date,
  target_to date
)
returns table (
  session_id uuid,
  session_revision integer,
  employee_id uuid,
  employee_code text,
  employee_display_name text,
  location_id uuid,
  location_name text,
  location_timezone text,
  session_date date,
  raw_started_at timestamptz,
  raw_ended_at timestamptz,
  effective_started_at timestamptz,
  effective_ended_at timestamptz,
  raw_elapsed_minutes integer,
  capture_state public.time_capture_state,
  review_state public.time_review_state,
  review_window_id uuid,
  status text,
  blocker_codes text[],
  warning_codes text[],
  event_ids uuid[],
  amendment_ids uuid[],
  correction_request_ids uuid[],
  manual_entry_id uuid,
  generated_columns jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with selected_sessions as (
    select
      session.id as session_id,
      session.revision as session_revision,
      session.employee_id,
      employee.employee_code::text,
      coalesce(nullif(employee.preferred_name, ''), concat_ws(' ', employee.first_name, employee.last_name))::text as employee_display_name,
      session.location_id,
      location.name::text as location_name,
      location.timezone::text as location_timezone,
      (session.started_at at time zone location.timezone)::date as session_date,
      session.started_at as raw_started_at,
      session.ended_at as raw_ended_at,
      session.effective_started_at,
      session.effective_ended_at,
      greatest(1, floor(extract(epoch from (session.ended_at - session.started_at)) / 60)::integer) as raw_elapsed_minutes,
      session.capture_state,
      session.review_state
    from public.time_sessions session
    join public.employee_profiles employee on employee.id = session.employee_id and employee.workspace_id = session.workspace_id
    join public.locations location on location.id = session.location_id and location.workspace_id = session.workspace_id
    where session.workspace_id = target_workspace_id
      and session.location_id = any(target_location_ids)
      and (session.started_at at time zone location.timezone)::date between target_from and target_to
      and public.service_actor_can_time_location(actor_user_id, target_workspace_id, session.location_id, 'time.export.preview.location')
  ),
  session_payload as (
    select
      session_row.*,
      review_window.id as review_window_id,
      array_remove(array[
        case when session_row.capture_state = 'open' then 'open_session' end,
        case when session_row.capture_state = 'on_break' then 'open_break' end,
        case when session_row.capture_state = 'needs_attention' then 'needs_attention' end,
        case when session_row.capture_state <> 'complete' then 'incomplete_session' end,
        case when session_row.raw_ended_at is null or session_row.effective_ended_at is null then 'missing_end_time' end,
        case when exists (
          select 1 from public.time_correction_requests correction
          where correction.session_id = session_row.session_id and correction.status = 'pending'
        ) then 'pending_correction' end,
        case when session_row.review_state <> 'approved' then 'review_required' end,
        case when review_window.id is null then 'review_window_missing_or_stale' end
      ], null)::text[] as blocker_codes,
      array_remove(array[
        case when exists (select 1 from public.time_amendments amendment where amendment.session_id = session_row.session_id) then 'amended' end,
        case when exists (select 1 from public.time_manual_entries manual where manual.session_id = session_row.session_id) then 'manual_entry' end,
        case when exists (select 1 from public.time_export_snapshot_rows prior where prior.workspace_id = target_workspace_id and prior.session_id = session_row.session_id and prior.superseded_at is null) then 'previously_exported' end
      ], null)::text[] as warning_codes
    from selected_sessions session_row
    left join lateral (
      select review_window.id
      from public.time_review_windows review_window
      where review_window.workspace_id = target_workspace_id
        and review_window.location_id = session_row.location_id
        and review_window.status = 'approved'
        and review_window.session_versions ? session_row.session_id::text
        and (review_window.session_versions->>session_row.session_id::text)::integer = session_row.session_revision
      order by review_window.approved_at desc
      limit 1
    ) review_window on true
  )
  select
    payload.session_id,
    payload.session_revision,
    payload.employee_id,
    payload.employee_code,
    payload.employee_display_name,
    payload.location_id,
    payload.location_name,
    payload.location_timezone,
    payload.session_date,
    payload.raw_started_at,
    payload.raw_ended_at,
    payload.effective_started_at,
    payload.effective_ended_at,
    payload.raw_elapsed_minutes,
    payload.capture_state,
    payload.review_state,
    payload.review_window_id,
    case when cardinality(payload.blocker_codes) > 0 then 'blocked'
         when cardinality(payload.warning_codes) > 0 then 'warning'
         else 'ready' end as status,
    payload.blocker_codes,
    payload.warning_codes,
    coalesce((select array_agg(event.id order by event.occurred_at, event.received_at) from public.time_events event where event.session_id = payload.session_id), '{}')::uuid[] as event_ids,
    coalesce((select array_agg(amendment.id order by amendment.result_revision) from public.time_amendments amendment where amendment.session_id = payload.session_id), '{}')::uuid[] as amendment_ids,
    coalesce((select array_agg(correction.id order by correction.submitted_at) from public.time_correction_requests correction where correction.session_id = payload.session_id), '{}')::uuid[] as correction_request_ids,
    (select manual.id from public.time_manual_entries manual where manual.session_id = payload.session_id) as manual_entry_id,
    jsonb_build_object(
      'employee_id', payload.employee_id,
      'employee_code', payload.employee_code,
      'employee_display_name', payload.employee_display_name,
      'location_id', payload.location_id,
      'location_name', payload.location_name,
      'session_date', payload.session_date,
      'raw_started_at', payload.raw_started_at,
      'raw_ended_at', payload.raw_ended_at,
      'effective_started_at', payload.effective_started_at,
      'effective_ended_at', payload.effective_ended_at,
      'raw_elapsed_minutes', payload.raw_elapsed_minutes,
      'review_window_id', payload.review_window_id,
      'warning_codes', payload.warning_codes
    ) as generated_columns
  from session_payload payload
  order by payload.session_date, payload.employee_display_name, payload.raw_started_at;
$$;

create function public.preview_time_export_snapshot_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_location_ids uuid[],
  target_from date,
  target_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_location_ids uuid[] := public.time_export_normalize_location_ids(target_location_ids);
  location_count integer;
  visible_location_count integer;
  row_count integer;
  blocked_count integer;
  warning_count integer;
begin
  if target_from is null or target_to is null or target_to < target_from or target_to - target_from > 41 then
    raise exception 'valid time export range required' using errcode = '22023';
  end if;
  if cardinality(normalized_location_ids) = 0 then
    raise exception 'time export location scope required' using errcode = '22023';
  end if;

  select count(*) into location_count
  from public.locations location
  where location.workspace_id = target_workspace_id
    and location.id = any(normalized_location_ids)
    and location.archived_at is null;
  if location_count <> cardinality(normalized_location_ids) then
    raise exception 'time export location not found' using errcode = 'P0002';
  end if;

  select count(*) into visible_location_count
  from public.locations location
  where location.workspace_id = target_workspace_id
    and location.id = any(normalized_location_ids)
    and public.service_actor_can_time_location(actor_user_id, target_workspace_id, location.id, 'time.export.preview.location');
  if visible_location_count <> cardinality(normalized_location_ids) then
    raise exception 'time export preview denied' using errcode = '42501';
  end if;

  select count(*), count(*) filter (where status = 'blocked'), count(*) filter (where status = 'warning')
  into row_count, blocked_count, warning_count
  from public.time_export_preview_rows(actor_user_id, target_workspace_id, normalized_location_ids, target_from, target_to);

  return jsonb_build_object(
    'workspace_id', target_workspace_id,
    'from', target_from,
    'to', target_to,
    'location_ids', to_jsonb(normalized_location_ids),
    'status', case when blocked_count > 0 then 'blocked' when row_count = 0 then 'empty' when warning_count > 0 then 'warning' else 'ready' end,
    'export_schema_version', 1,
    'summary', jsonb_build_object('row_count', row_count, 'blocked_count', blocked_count, 'warning_count', warning_count),
    'locations', (
      select coalesce(jsonb_agg(jsonb_build_object('id', location.id, 'name', location.name, 'timezone', location.timezone) order by location.sort_order, location.name), '[]'::jsonb)
      from public.locations location
      where location.workspace_id = target_workspace_id and location.id = any(normalized_location_ids)
    ),
    'rows', (
      select coalesce(jsonb_agg(to_jsonb(preview_row) order by preview_row.session_date, preview_row.employee_display_name, preview_row.raw_started_at), '[]'::jsonb)
      from public.time_export_preview_rows(actor_user_id, target_workspace_id, normalized_location_ids, target_from, target_to) preview_row
    )
  );
end;
$$;

create function public.create_time_export_snapshot_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_location_ids uuid[],
  target_from date,
  target_to date,
  target_memo text,
  target_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_location_ids uuid[] := public.time_export_normalize_location_ids(target_location_ids);
  existing_snapshot public.time_export_snapshots%rowtype;
  snapshot_row public.time_export_snapshots%rowtype;
  preview jsonb;
  row_count integer;
  warning_count integer;
  created_count integer;
begin
  select * into existing_snapshot
  from public.time_export_snapshots candidate
  where candidate.workspace_id = target_workspace_id
    and candidate.created_by = actor_user_id
    and candidate.idempotency_key = target_idempotency_key;
  if found then
    if existing_snapshot.from_date <> target_from
      or existing_snapshot.to_date <> target_to
      or existing_snapshot.location_ids <> normalized_location_ids
      or existing_snapshot.memo <> btrim(target_memo) then
      raise exception 'idempotency key payload conflict' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'snapshot', to_jsonb(existing_snapshot) - 'idempotency_key',
      'rows', (select coalesce(jsonb_agg(to_jsonb(row) order by row.session_date, row.employee_display_name, row.raw_started_at), '[]'::jsonb) from public.time_export_snapshot_rows row where row.snapshot_id = existing_snapshot.id),
      'idempotent_replay', true
    );
  end if;

  if char_length(btrim(target_memo)) not between 3 and 500 then
    raise exception 'time export memo must be between 3 and 500 characters' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.locations location
    where location.workspace_id = target_workspace_id
      and location.id = any(normalized_location_ids)
      and not public.service_actor_can_time_location(actor_user_id, target_workspace_id, location.id, 'time.export.create.location')
  ) then
    raise exception 'time export creation denied' using errcode = '42501';
  end if;

  preview := public.preview_time_export_snapshot_service(actor_user_id, target_workspace_id, normalized_location_ids, target_from, target_to);
  if preview->>'status' in ('blocked', 'empty') then
    raise exception 'time export snapshot is not ready' using errcode = '23514';
  end if;
  row_count := ((preview->'summary'->>'row_count')::integer);
  warning_count := ((preview->'summary'->>'warning_count')::integer);

  insert into public.time_export_snapshots (
    workspace_id, from_date, to_date, location_ids, memo, row_count, warning_count,
    created_by, idempotency_key
  ) values (
    target_workspace_id, target_from, target_to, normalized_location_ids, btrim(target_memo),
    row_count, warning_count, actor_user_id, target_idempotency_key
  ) returning * into snapshot_row;

  insert into public.time_export_snapshot_rows (
    snapshot_id, workspace_id, session_id, session_revision, employee_id, employee_code,
    employee_display_name, location_id, location_name, location_timezone, session_date,
    raw_started_at, raw_ended_at, effective_started_at, effective_ended_at, raw_elapsed_minutes,
    capture_state, review_state, review_window_id, warning_codes, event_ids, amendment_ids,
    correction_request_ids, manual_entry_id, generated_columns
  )
  select
    snapshot_row.id, target_workspace_id, preview_row.session_id, preview_row.session_revision,
    preview_row.employee_id, preview_row.employee_code, preview_row.employee_display_name,
    preview_row.location_id, preview_row.location_name, preview_row.location_timezone,
    preview_row.session_date, preview_row.raw_started_at, preview_row.raw_ended_at,
    preview_row.effective_started_at, preview_row.effective_ended_at, preview_row.raw_elapsed_minutes,
    preview_row.capture_state, preview_row.review_state, preview_row.review_window_id,
    preview_row.warning_codes, preview_row.event_ids, preview_row.amendment_ids,
    preview_row.correction_request_ids, preview_row.manual_entry_id, preview_row.generated_columns
  from public.time_export_preview_rows(actor_user_id, target_workspace_id, normalized_location_ids, target_from, target_to) preview_row
  where preview_row.status in ('ready', 'warning');
  get diagnostics created_count = row_count;
  if created_count <> row_count then
    raise exception 'time export snapshot row count changed' using errcode = '40001';
  end if;

  insert into public.audit_events(workspace_id, actor_user_id, action, target_type, target_id, metadata)
  values (
    target_workspace_id, actor_user_id, 'time.export_snapshot_created', 'time_export_snapshot',
    snapshot_row.id::text, jsonb_build_object('from', target_from, 'to', target_to, 'location_ids', normalized_location_ids, 'row_count', row_count, 'warning_count', warning_count, 'schema_version', 1)
  );

  return jsonb_build_object(
    'snapshot', to_jsonb(snapshot_row) - 'idempotency_key',
    'rows', (select coalesce(jsonb_agg(to_jsonb(row) order by row.session_date, row.employee_display_name, row.raw_started_at), '[]'::jsonb) from public.time_export_snapshot_rows row where row.snapshot_id = snapshot_row.id),
    'idempotent_replay', false
  );
end;
$$;

create function public.mark_time_export_snapshot_superseded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.revision <> old.revision then
    update public.time_export_snapshot_rows
    set superseded_at = now()
    where workspace_id = old.workspace_id
      and session_id = old.id
      and session_revision = old.revision
      and superseded_at is null;

    update public.time_export_snapshots snapshot
    set status = 'superseded'
    where snapshot.workspace_id = old.workspace_id
      and snapshot.status = 'active'
      and exists (
        select 1 from public.time_export_snapshot_rows row
        where row.snapshot_id = snapshot.id
          and row.session_id = old.id
          and row.superseded_at is not null
      );
  end if;
  return new;
end;
$$;

create trigger mark_time_export_snapshot_superseded_trigger
after update of revision on public.time_sessions
for each row execute function public.mark_time_export_snapshot_superseded();

revoke all on function public.time_export_normalize_location_ids(uuid[]) from public, anon, authenticated;

revoke all on function public.time_export_preview_rows(uuid, uuid, uuid[], date, date) from public, anon, authenticated;

revoke all on function public.preview_time_export_snapshot_service(uuid, uuid, uuid[], date, date) from public, anon, authenticated;

revoke all on function public.create_time_export_snapshot_service(uuid, uuid, uuid[], date, date, text, uuid) from public, anon, authenticated;

revoke all on function public.mark_time_export_snapshot_superseded() from public, anon, authenticated;

grant execute on function public.preview_time_export_snapshot_service(uuid, uuid, uuid[], date, date) to service_role;

grant execute on function public.create_time_export_snapshot_service(uuid, uuid, uuid[], date, date, text, uuid) to service_role;

insert into public.permissions (key, label, category, description, custom_grantable, sort_order)
values
  ('time.capture.own', 'Capture own time', 'Time', 'Record personal clock and break events.', true, 300),
  ('time.read.own', 'View own time', 'Time', 'View personal time sessions and history.', true, 310),
  ('time.correction.request.own', 'Request own time corrections', 'Time', 'Request amendments to personal time sessions.', true, 320),
  ('time.read.location', 'View location time', 'Time', 'View time sessions for assigned locations.', true, 330),
  ('time.amend.location', 'Amend location time', 'Time', 'Create explained time amendments for assigned locations.', true, 340),
  ('time.correction.review.location', 'Review time corrections', 'Time', 'Review correction requests for assigned locations.', true, 350),
  ('time.review.approve.location', 'Approve time reviews', 'Time', 'Approve operational time review windows for assigned locations.', true, 360),
  ('time.audit.read', 'View time audit history', 'Time', 'View organization time audit history.', true, 370)
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
    ('time.capture.own'),
    ('time.read.own'),
    ('time.correction.request.own'),
    ('time.read.location'),
    ('time.amend.location'),
    ('time.correction.review.location'),
    ('time.review.approve.location'),
    ('time.audit.read')
) permission(key)
where role.system_key in ('owner', 'admin')
on conflict do nothing;

insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
select role.workspace_id, role.id, permission.key
from public.workspace_roles role
cross join (
  values
    ('time.capture.own'),
    ('time.read.own'),
    ('time.correction.request.own'),
    ('time.read.location'),
    ('time.amend.location'),
    ('time.correction.review.location'),
    ('time.review.approve.location')
) permission(key)
where role.system_key = 'manager'
on conflict do nothing;

insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
select role.workspace_id, role.id, permission.key
from public.workspace_roles role
cross join (
  values
    ('time.capture.own'),
    ('time.read.own'),
    ('time.correction.request.own')
) permission(key)
where role.system_key = 'employee'
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
      'time.correction.review.location', 'time.review.approve.location'
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
    'time.correction.review.location', 'time.review.approve.location'
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
  if exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key in('time.amend.location','time.correction.review.location','time.review.approve.location')) and not exists(select 1 from public.workspace_role_permissions where role_id=checked_role_id and permission_key='time.read.location') then raise exception 'location time management requires location time read' using errcode='23514'; end if;
  return null;
end;
$$;

create type public.time_event_type as enum ('clock_in', 'break_start', 'break_end', 'clock_out');
create type public.time_capture_source as enum ('web', 'mobile_web', 'manager');
create type public.time_capture_state as enum ('open', 'on_break', 'complete', 'needs_attention');
create type public.time_review_state as enum ('unreviewed', 'approved', 'reopened');

create table public.time_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  employee_id uuid not null,
  location_id uuid not null,
  capture_state public.time_capture_state not null,
  review_state public.time_review_state not null default 'unreviewed',
  started_at timestamptz not null,
  ended_at timestamptz,
  effective_started_at timestamptz not null,
  effective_ended_at timestamptz,
  last_event_at timestamptz not null,
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id, employee_id, location_id),
  foreign key (employee_id, workspace_id) references public.employee_profiles(id, workspace_id) on delete restrict,
  foreign key (location_id, workspace_id) references public.locations(id, workspace_id) on delete restrict,
  check (ended_at is null or ended_at > started_at),
  check (effective_ended_at is null or effective_ended_at > effective_started_at),
  check ((capture_state = 'complete' and ended_at is not null and effective_ended_at is not null) or capture_state <> 'complete')
);

create unique index time_sessions_one_active_employee_idx
  on public.time_sessions (workspace_id, employee_id)
  where capture_state in ('open', 'on_break');
create index time_sessions_location_time_idx
  on public.time_sessions (workspace_id, location_id, started_at desc);
create index time_sessions_employee_time_idx
  on public.time_sessions (workspace_id, employee_id, started_at desc);

create table public.time_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  session_id uuid not null,
  employee_id uuid not null,
  location_id uuid not null,
  event_type public.time_event_type not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  actor_user_id uuid not null references auth.users(id),
  source public.time_capture_source not null,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  foreign key (session_id, workspace_id, employee_id, location_id)
    references public.time_sessions(id, workspace_id, employee_id, location_id) on delete restrict,
  unique (workspace_id, actor_user_id, idempotency_key)
);

create index time_events_session_time_idx
  on public.time_events (session_id, occurred_at, received_at);

create table public.time_amendments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  session_id uuid not null,
  employee_id uuid not null,
  location_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  before_started_at timestamptz not null,
  before_ended_at timestamptz not null,
  after_started_at timestamptz not null,
  after_ended_at timestamptz not null,
  base_revision integer not null check (base_revision > 0),
  result_revision integer not null check (result_revision = base_revision + 1),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  foreign key (session_id, workspace_id, employee_id, location_id)
    references public.time_sessions(id, workspace_id, employee_id, location_id) on delete restrict,
  unique (workspace_id, actor_user_id, idempotency_key),
  check (before_ended_at > before_started_at),
  check (after_ended_at > after_started_at)
);

create index time_amendments_session_revision_idx
  on public.time_amendments (session_id, result_revision);

create function public.prevent_time_history_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'time history is append only' using errcode = '42501';
end;
$$;

create trigger prevent_time_event_mutation_trigger
before update or delete on public.time_events
for each row execute function public.prevent_time_history_mutation();

create trigger prevent_time_amendment_mutation_trigger
before update or delete on public.time_amendments
for each row execute function public.prevent_time_history_mutation();

alter table public.time_sessions enable row level security;
alter table public.time_events enable row level security;
alter table public.time_amendments enable row level security;

revoke all on public.time_sessions, public.time_events, public.time_amendments from public, anon, authenticated;
grant select, insert, update on public.time_sessions to service_role;
grant select, insert on public.time_events, public.time_amendments to service_role;

create function public.service_actor_can_time_location(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_location_id uuid,
  target_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_memberships membership
    join public.workspace_role_permissions permission
      on permission.workspace_id = membership.workspace_id
      and permission.role_id = membership.role_id
    where membership.user_id = actor_user_id
      and membership.workspace_id = target_workspace_id
      and membership.status = 'active'
      and permission.permission_key = target_permission
      and (
        membership.all_locations
        or exists (
          select 1 from public.membership_location_scopes scope
          where scope.membership_id = membership.id
            and scope.workspace_id = target_workspace_id
            and scope.location_id = target_location_id
        )
      )
  );
$$;

create function public.time_employee_has_location(
  target_workspace_id uuid,
  target_employee_id uuid,
  target_location_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.employee_profiles employee
    join public.employee_location_assignments assignment
      on assignment.workspace_id = employee.workspace_id
      and assignment.employee_id = employee.id
      and assignment.location_id = target_location_id
      and assignment.ended_at is null
    where employee.id = target_employee_id
      and employee.workspace_id = target_workspace_id
      and employee.archived_at is null
  );
$$;

create function public.capture_time_event_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid,
  target_location_id uuid,
  target_session_id uuid,
  target_event_type public.time_event_type,
  target_occurred_at timestamptz,
  target_idempotency_key uuid,
  target_source public.time_capture_source
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_employee_user_id uuid;
  existing_event public.time_events%rowtype;
  event_row public.time_events%rowtype;
  session_row public.time_sessions%rowtype;
  own_capture boolean;
begin
  select user_id into target_employee_user_id
  from public.employee_profiles
  where id = target_employee_id
    and workspace_id = target_workspace_id
    and archived_at is null;
  if not found then raise exception 'time employee not found' using errcode = 'P0002'; end if;

  own_capture := target_employee_user_id = actor_user_id;
  if own_capture then
    if not public.service_actor_can_time_location(actor_user_id, target_workspace_id, target_location_id, 'time.capture.own') then
      raise exception 'own time capture denied' using errcode = '42501';
    end if;
    if target_source = 'manager' then raise exception 'invalid own capture source' using errcode = '22023'; end if;
  else
    if not public.service_actor_can_time_location(actor_user_id, target_workspace_id, target_location_id, 'time.amend.location') then
      raise exception 'location time amendment denied' using errcode = '42501';
    end if;
    if target_source <> 'manager' then raise exception 'manager capture source required' using errcode = '22023'; end if;
  end if;

  if not public.time_employee_has_location(target_workspace_id, target_employee_id, target_location_id) then
    raise exception 'employee location assignment required' using errcode = '42501';
  end if;

  select candidate.* into existing_event
  from public.time_events candidate
  where candidate.workspace_id = target_workspace_id
    and candidate.actor_user_id = capture_time_event_service.actor_user_id
    and candidate.idempotency_key = target_idempotency_key;
  if found then
    if existing_event.employee_id <> target_employee_id
      or existing_event.location_id <> target_location_id
      or existing_event.event_type <> target_event_type
      or existing_event.occurred_at <> target_occurred_at
      or existing_event.source <> target_source
      or (target_session_id is not null and existing_event.session_id <> target_session_id) then
      raise exception 'idempotency key payload conflict' using errcode = '23505';
    end if;
    select * into session_row from public.time_sessions where id = existing_event.session_id;
    return jsonb_build_object(
      'session', to_jsonb(session_row),
      'event', to_jsonb(existing_event),
      'idempotent_replay', true
    );
  end if;

  if target_event_type = 'clock_in' then
    if target_session_id is not null then raise exception 'clock in cannot target a session' using errcode = '22023'; end if;
    insert into public.time_sessions (
      workspace_id, employee_id, location_id, capture_state, started_at,
      effective_started_at, last_event_at, created_by
    ) values (
      target_workspace_id, target_employee_id, target_location_id, 'open', target_occurred_at,
      target_occurred_at, target_occurred_at, actor_user_id
    ) returning * into session_row;
  else
    if target_session_id is null then raise exception 'session id required' using errcode = '22023'; end if;
    select * into session_row
    from public.time_sessions
    where id = target_session_id
      and workspace_id = target_workspace_id
      and employee_id = target_employee_id
      and location_id = target_location_id
    for update;
    if not found then raise exception 'time session not found' using errcode = 'P0002'; end if;
    if target_occurred_at < session_row.last_event_at then
      raise exception 'time event precedes the current session state' using errcode = '22023';
    end if;

    if target_event_type = 'break_start' and session_row.capture_state = 'open' then
      update public.time_sessions set
        capture_state = 'on_break', last_event_at = target_occurred_at,
        revision = revision + 1, updated_at = now()
      where id = session_row.id returning * into session_row;
    elsif target_event_type = 'break_end' and session_row.capture_state = 'on_break' then
      update public.time_sessions set
        capture_state = 'open', last_event_at = target_occurred_at,
        revision = revision + 1, updated_at = now()
      where id = session_row.id returning * into session_row;
    elsif target_event_type = 'clock_out' and session_row.capture_state = 'open' then
      if target_occurred_at <= session_row.started_at then
        raise exception 'clock out must follow clock in' using errcode = '22023';
      end if;
      update public.time_sessions set
        capture_state = 'complete', ended_at = target_occurred_at,
        effective_ended_at = target_occurred_at, last_event_at = target_occurred_at,
        revision = revision + 1, updated_at = now()
      where id = session_row.id returning * into session_row;
    else
      raise exception 'time event is invalid for the current session state' using errcode = '23514';
    end if;
  end if;

  insert into public.time_events (
    workspace_id, session_id, employee_id, location_id, event_type, occurred_at,
    actor_user_id, source, idempotency_key
  ) values (
    target_workspace_id, session_row.id, target_employee_id, target_location_id,
    target_event_type, target_occurred_at, actor_user_id, target_source, target_idempotency_key
  ) returning * into event_row;

  insert into public.audit_events (workspace_id, actor_user_id, action, target_type, target_id, metadata)
  values (
    target_workspace_id, actor_user_id, 'time.event_recorded', 'time_session', session_row.id::text,
    jsonb_build_object('event_id', event_row.id, 'event_type', target_event_type, 'source', target_source)
  );

  return jsonb_build_object(
    'session', to_jsonb(session_row),
    'event', to_jsonb(event_row),
    'idempotent_replay', false
  );
end;
$$;

create function public.apply_time_amendment_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_session_id uuid,
  target_expected_revision integer,
  target_effective_started_at timestamptz,
  target_effective_ended_at timestamptz,
  target_reason text,
  target_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.time_sessions%rowtype;
  existing_amendment public.time_amendments%rowtype;
  amendment_row public.time_amendments%rowtype;
begin
  select candidate.* into existing_amendment
  from public.time_amendments candidate
  where candidate.workspace_id = target_workspace_id
    and candidate.actor_user_id = apply_time_amendment_service.actor_user_id
    and candidate.idempotency_key = target_idempotency_key;
  if found then
    if existing_amendment.session_id <> target_session_id
      or existing_amendment.base_revision <> target_expected_revision
      or existing_amendment.after_started_at <> target_effective_started_at
      or existing_amendment.after_ended_at <> target_effective_ended_at
      or existing_amendment.reason <> btrim(target_reason) then
      raise exception 'idempotency key payload conflict' using errcode = '23505';
    end if;
    select * into session_row from public.time_sessions where id = existing_amendment.session_id;
    return jsonb_build_object('session', to_jsonb(session_row), 'amendment', to_jsonb(existing_amendment), 'idempotent_replay', true);
  end if;

  select * into session_row
  from public.time_sessions
  where id = target_session_id and workspace_id = target_workspace_id
  for update;
  if not found then raise exception 'time session not found' using errcode = 'P0002'; end if;
  if not public.service_actor_can_time_location(actor_user_id, target_workspace_id, session_row.location_id, 'time.amend.location') then
    raise exception 'location time amendment denied' using errcode = '42501';
  end if;
  if session_row.capture_state <> 'complete' then
    raise exception 'only complete sessions can be amended' using errcode = '23514';
  end if;
  if session_row.revision <> target_expected_revision then
    raise exception 'stale time session revision' using errcode = '40001';
  end if;
  if target_effective_ended_at <= target_effective_started_at then
    raise exception 'amended end must follow amended start' using errcode = '22023';
  end if;
  if char_length(btrim(target_reason)) not between 3 and 500 then
    raise exception 'amendment reason must be between 3 and 500 characters' using errcode = '22023';
  end if;

  insert into public.time_amendments (
    workspace_id, session_id, employee_id, location_id, actor_user_id, reason,
    before_started_at, before_ended_at, after_started_at, after_ended_at,
    base_revision, result_revision, idempotency_key
  ) values (
    target_workspace_id, session_row.id, session_row.employee_id, session_row.location_id,
    actor_user_id, btrim(target_reason), session_row.effective_started_at,
    session_row.effective_ended_at, target_effective_started_at, target_effective_ended_at,
    session_row.revision, session_row.revision + 1, target_idempotency_key
  ) returning * into amendment_row;

  update public.time_sessions set
    effective_started_at = target_effective_started_at,
    effective_ended_at = target_effective_ended_at,
    review_state = case when review_state = 'approved' then 'reopened' else review_state end,
    revision = revision + 1,
    updated_at = now()
  where id = session_row.id returning * into session_row;

  insert into public.audit_events (workspace_id, actor_user_id, action, target_type, target_id, metadata)
  values (
    target_workspace_id, actor_user_id, 'time.session_amended', 'time_session', session_row.id::text,
    jsonb_build_object('amendment_id', amendment_row.id, 'base_revision', amendment_row.base_revision, 'result_revision', amendment_row.result_revision)
  );

  return jsonb_build_object('session', to_jsonb(session_row), 'amendment', to_jsonb(amendment_row), 'idempotent_replay', false);
end;
$$;

revoke all on function public.service_actor_can_time_location(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.time_employee_has_location(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.capture_time_event_service(uuid, uuid, uuid, uuid, uuid, public.time_event_type, timestamptz, uuid, public.time_capture_source) from public, anon, authenticated;
revoke all on function public.apply_time_amendment_service(uuid, uuid, uuid, integer, timestamptz, timestamptz, text, uuid) from public, anon, authenticated;
grant execute on function public.capture_time_event_service(uuid, uuid, uuid, uuid, uuid, public.time_event_type, timestamptz, uuid, public.time_capture_source) to service_role;
grant execute on function public.apply_time_amendment_service(uuid, uuid, uuid, integer, timestamptz, timestamptz, text, uuid) to service_role;

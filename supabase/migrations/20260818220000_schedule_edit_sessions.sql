create type public.schedule_edit_source as enum ('blank', 'published', 'draft');
create type public.schedule_edit_session_status as enum (
  'active', 'saved', 'discarded', 'expired', 'recovered'
);

create table public.schedule_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  week_start date not null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, workspace_id)
);

create unique index schedule_drafts_active_name_idx
  on public.schedule_drafts (workspace_id, week_start, lower(btrim(name)))
  where archived_at is null;
create index schedule_drafts_week_idx
  on public.schedule_drafts (workspace_id, week_start, updated_at desc)
  where archived_at is null;

create table public.schedule_draft_shifts (
  id uuid not null,
  workspace_id uuid not null,
  draft_id uuid not null,
  location_id uuid not null,
  employee_id uuid,
  job_id uuid not null,
  shift_type_id uuid,
  scheduled_date date not null,
  start_time time not null,
  end_time time not null,
  crosses_midnight boolean generated always as (end_time <= start_time) stored,
  note text not null default '' check (char_length(note) <= 500),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (draft_id, id),
  foreign key (draft_id, workspace_id)
    references public.schedule_drafts(id, workspace_id) on delete cascade,
  foreign key (location_id, workspace_id)
    references public.locations(id, workspace_id) on delete restrict,
  foreign key (employee_id, workspace_id)
    references public.employee_profiles(id, workspace_id) on delete restrict,
  foreign key (job_id, workspace_id)
    references public.jobs(id, workspace_id) on delete restrict,
  foreign key (shift_type_id, workspace_id)
    references public.shift_types(id, workspace_id) on delete restrict,
  check (start_time <> end_time)
);

create index schedule_draft_shifts_period_idx
  on public.schedule_draft_shifts (workspace_id, scheduled_date, location_id);

create table public.schedule_edit_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  week_start date not null,
  source_kind public.schedule_edit_source not null,
  source_draft_id uuid,
  source_revision integer not null default 0 check (source_revision >= 0),
  holder_user_id uuid not null references auth.users(id),
  revision integer not null default 1 check (revision > 0),
  dirty boolean not null default false,
  status public.schedule_edit_session_status not null default 'active',
  last_heartbeat timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '4 minutes',
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  recovered_draft_id uuid references public.schedule_drafts(id),
  foreign key (source_draft_id, workspace_id)
    references public.schedule_drafts(id, workspace_id) on delete restrict,
  check (
    (source_kind = 'draft' and source_draft_id is not null and source_revision > 0)
    or (source_kind <> 'draft' and source_draft_id is null)
  )
);

create unique index schedule_edit_sessions_active_week_idx
  on public.schedule_edit_sessions (workspace_id, week_start)
  where status = 'active';
create index schedule_edit_sessions_holder_idx
  on public.schedule_edit_sessions (holder_user_id, status, expires_at);

create table public.schedule_edit_session_shifts (
  id uuid not null,
  workspace_id uuid not null,
  session_id uuid not null references public.schedule_edit_sessions(id) on delete cascade,
  location_id uuid not null,
  employee_id uuid,
  job_id uuid not null,
  shift_type_id uuid,
  scheduled_date date not null,
  start_time time not null,
  end_time time not null,
  crosses_midnight boolean generated always as (end_time <= start_time) stored,
  note text not null default '' check (char_length(note) <= 500),
  revision integer not null default 1 check (revision > 0),
  idempotency_key uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, id),
  foreign key (location_id, workspace_id)
    references public.locations(id, workspace_id) on delete restrict,
  foreign key (employee_id, workspace_id)
    references public.employee_profiles(id, workspace_id) on delete restrict,
  foreign key (job_id, workspace_id)
    references public.jobs(id, workspace_id) on delete restrict,
  foreign key (shift_type_id, workspace_id)
    references public.shift_types(id, workspace_id) on delete restrict,
  unique (session_id, idempotency_key),
  check (start_time <> end_time)
);

alter table public.schedule_drafts enable row level security;
alter table public.schedule_draft_shifts enable row level security;
alter table public.schedule_edit_sessions enable row level security;
alter table public.schedule_edit_session_shifts enable row level security;

revoke all on public.schedule_drafts, public.schedule_draft_shifts,
  public.schedule_edit_sessions, public.schedule_edit_session_shifts
from public, anon, authenticated;
grant select on public.schedule_drafts, public.schedule_draft_shifts,
  public.schedule_edit_sessions, public.schedule_edit_session_shifts
to service_role;

create function public.schedule_actor_can_manage_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_location_id uuid default null
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
    join public.workspace_roles role
      on role.id = membership.role_id and role.workspace_id = membership.workspace_id
    join public.workspace_role_permissions permission
      on permission.role_id = role.id and permission.workspace_id = role.workspace_id
    where membership.workspace_id = target_workspace_id
      and membership.user_id = actor_user_id
      and membership.status = 'active'
      and role.access_class in ('owner', 'admin', 'manager')
      and permission.permission_key = 'schedule.manage'
      and (
        target_location_id is null
        or membership.all_locations
        or exists (
          select 1 from public.membership_location_scopes scope
          where scope.membership_id = membership.id
            and scope.workspace_id = target_workspace_id
            and scope.location_id = target_location_id
        )
      )
  );
$$;

create function public.get_schedule_edit_session_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_session public.schedule_edit_sessions%rowtype;
  result jsonb;
begin
  select * into target_session
  from public.schedule_edit_sessions session
  where session.id = target_session_id
    and session.workspace_id = target_workspace_id
    and session.holder_user_id = actor_user_id;
  if target_session.id is null then
    raise exception 'edit session not found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'id', target_session.id,
    'workspace_id', target_session.workspace_id,
    'week_start', target_session.week_start,
    'source_kind', target_session.source_kind,
    'source_draft_id', target_session.source_draft_id,
    'source_revision', target_session.source_revision,
    'holder_user_id', target_session.holder_user_id,
    'holder_name', coalesce((
      select profile.display_name from public.user_profiles profile
      where profile.user_id = target_session.holder_user_id
    ), 'Manager'),
    'revision', target_session.revision,
    'dirty', target_session.dirty,
    'last_heartbeat', target_session.last_heartbeat,
    'expires_at', target_session.expires_at,
    'shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', shift.id,
        'location_id', shift.location_id,
        'employee_id', shift.employee_id,
        'job_id', shift.job_id,
        'shift_type_id', shift.shift_type_id,
        'scheduled_date', shift.scheduled_date,
        'start_time', to_char(shift.start_time, 'HH24:MI'),
        'end_time', to_char(shift.end_time, 'HH24:MI'),
        'crosses_midnight', shift.crosses_midnight,
        'note', shift.note,
        'revision', shift.revision,
        'warning_codes', to_jsonb(array_remove(array[
          case when exists (
            select 1 from public.schedule_closures closure
            where closure.location_id = shift.location_id
              and closure.closed_date = shift.scheduled_date and closure.is_all_day
          ) then 'closed_location' end,
          case when shift.employee_id is not null and exists (
            select 1 from public.employee_schedule_availability_versions version,
              lateral jsonb_array_elements(version.recurring_rules) rule
            where version.employee_id = shift.employee_id
              and version.version_number = (
                select max(latest.version_number)
                from public.employee_schedule_availability_versions latest
                where latest.employee_id = shift.employee_id
              )
              and (rule->>'day')::integer = extract(dow from shift.scheduled_date)::integer
              and rule->>'mode' = 'unavailable'
          ) then 'availability' end,
          case when shift.employee_id is not null and exists (
            select 1 from public.schedule_edit_session_shifts other
            where other.session_id = target_session.id
              and other.employee_id = shift.employee_id
              and other.scheduled_date = shift.scheduled_date
              and other.id <> shift.id
              and not shift.crosses_midnight and not other.crosses_midnight
              and shift.start_time < other.end_time and shift.end_time > other.start_time
          ) then 'overlap' end
        ]::text[], null))
      ) order by shift.scheduled_date, shift.start_time, shift.id)
      from public.schedule_edit_session_shifts shift
      where shift.session_id = target_session.id
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create function public.list_schedule_drafts_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_week_start date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.schedule_actor_can_manage_service(actor_user_id, target_workspace_id) then
    raise exception 'schedule manage access required' using errcode = '42501';
  end if;
  return jsonb_build_object('drafts', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', draft.id, 'workspace_id', draft.workspace_id,
      'week_start', draft.week_start, 'name', draft.name,
      'revision', draft.revision, 'created_by', draft.created_by,
      'updated_by', draft.updated_by, 'created_at', draft.created_at,
      'updated_at', draft.updated_at
    ) order by draft.updated_at desc, draft.name)
    from public.schedule_drafts draft
    where draft.workspace_id = target_workspace_id
      and draft.week_start = target_week_start and draft.archived_at is null
  ), '[]'::jsonb));
end;
$$;

create function public.acquire_schedule_edit_session_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_week_start date,
  requested_source public.schedule_edit_source,
  requested_draft_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_session public.schedule_edit_sessions%rowtype;
  source_draft public.schedule_drafts%rowtype;
  new_session_id uuid;
  recovery_draft_id uuid;
  recovery_name text;
  holder_label text;
begin
  if not public.schedule_actor_can_manage_service(actor_user_id, target_workspace_id) then
    raise exception 'schedule manage access required' using errcode = '42501';
  end if;
  if requested_source = 'draft' and requested_draft_id is null then
    raise exception 'draft source requires draft id' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text || target_week_start::text, 0));

  select * into existing_session
  from public.schedule_edit_sessions session
  where session.workspace_id = target_workspace_id
    and session.week_start = target_week_start and session.status = 'active'
  for update;

  if existing_session.id is not null and existing_session.expires_at > now() then
    if existing_session.holder_user_id = actor_user_id then
      return jsonb_build_object(
        'status', 'resumed',
        'session', public.get_schedule_edit_session_service(
          actor_user_id, target_workspace_id, existing_session.id
        )
      );
    end if;
    select coalesce(profile.display_name, 'Another manager') into holder_label
    from public.user_profiles profile where profile.user_id = existing_session.holder_user_id;
    return jsonb_build_object(
      'status', 'conflict', 'holder_name', coalesce(holder_label, 'Another manager'),
      'last_heartbeat', existing_session.last_heartbeat,
      'expires_at', existing_session.expires_at
    );
  end if;

  if existing_session.id is not null then
    if existing_session.dirty then
      recovery_draft_id := gen_random_uuid();
      recovery_name := left(
        'Recovery ' || to_char(now(), 'YYYY-MM-DD HH24:MI') || ' ' || left(existing_session.id::text, 8),
        80
      );
      insert into public.schedule_drafts (
        id, workspace_id, week_start, name, created_by, updated_by
      ) values (
        recovery_draft_id, target_workspace_id, target_week_start, recovery_name,
        existing_session.holder_user_id, existing_session.holder_user_id
      );
      insert into public.schedule_draft_shifts (
        id, workspace_id, draft_id, location_id, employee_id, job_id,
        shift_type_id, scheduled_date, start_time, end_time, note, revision
      )
      select id, workspace_id, recovery_draft_id, location_id, employee_id, job_id,
        shift_type_id, scheduled_date, start_time, end_time, note, revision
      from public.schedule_edit_session_shifts
      where session_id = existing_session.id;
    end if;
    update public.schedule_edit_sessions
    set status = case when recovery_draft_id is null then 'expired' else 'recovered' end,
      recovered_draft_id = recovery_draft_id, closed_at = now()
    where id = existing_session.id;
  end if;

  if requested_source = 'draft' then
    select * into source_draft
    from public.schedule_drafts draft
    where draft.id = requested_draft_id and draft.workspace_id = target_workspace_id
      and draft.week_start = target_week_start and draft.archived_at is null;
    if source_draft.id is null then
      raise exception 'draft not found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.schedule_edit_sessions (
    workspace_id, week_start, source_kind, source_draft_id, source_revision,
    holder_user_id
  ) values (
    target_workspace_id, target_week_start, requested_source,
    case when requested_source = 'draft' then source_draft.id else null end,
    case when requested_source = 'draft' then source_draft.revision else 0 end,
    actor_user_id
  ) returning id into new_session_id;

  if requested_source = 'published' then
    insert into public.schedule_edit_session_shifts (
      id, workspace_id, session_id, location_id, employee_id, job_id,
      shift_type_id, scheduled_date, start_time, end_time, note
    )
    select shift.source_shift_id, shift.workspace_id, new_session_id,
      shift.location_id, shift.employee_id, shift.job_id, shift.shift_type_id,
      shift.scheduled_date, shift.start_time, shift.end_time, shift.note
    from public.schedule_published_shifts shift
    join public.schedule_location_publications publication on publication.id = shift.publication_id
    where shift.workspace_id = target_workspace_id
      and publication.week_start = target_week_start and publication.status = 'current'
      and public.schedule_actor_can_manage_service(actor_user_id, target_workspace_id, shift.location_id);
  elsif requested_source = 'draft' then
    insert into public.schedule_edit_session_shifts (
      id, workspace_id, session_id, location_id, employee_id, job_id,
      shift_type_id, scheduled_date, start_time, end_time, note, revision
    )
    select shift.id, shift.workspace_id, new_session_id, shift.location_id,
      shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date,
      shift.start_time, shift.end_time, shift.note, shift.revision
    from public.schedule_draft_shifts shift
    where shift.draft_id = source_draft.id
      and public.schedule_actor_can_manage_service(actor_user_id, target_workspace_id, shift.location_id);
  end if;

  return jsonb_build_object(
    'status', case when recovery_draft_id is null then 'acquired' else 'acquired_after_recovery' end,
    'session', public.get_schedule_edit_session_service(
      actor_user_id, target_workspace_id, new_session_id
    ),
    'recovered_draft_id', recovery_draft_id
  );
end;
$$;

create function public.heartbeat_schedule_edit_session_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.schedule_edit_sessions session
  set last_heartbeat = now(), expires_at = now() + interval '4 minutes'
  where session.id = target_session_id and session.workspace_id = target_workspace_id
    and session.holder_user_id = actor_user_id and session.status = 'active'
    and session.expires_at > now();
  if not found then
    raise exception 'edit lease expired' using errcode = '40001';
  end if;
  return public.get_schedule_edit_session_service(actor_user_id, target_workspace_id, target_session_id);
end;
$$;

create function public.mutate_schedule_edit_shift_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_session_id uuid,
  expected_session_revision integer,
  operation text,
  target_shift_id uuid,
  expected_shift_revision integer default null,
  shift_payload jsonb default null,
  request_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_session public.schedule_edit_sessions%rowtype;
  target_location_id uuid;
  target_employee_id uuid;
  target_job_id uuid;
  target_shift_type_id uuid;
  target_scheduled_date date;
  target_start_time time;
  target_end_time time;
  target_note text;
begin
  select * into target_session from public.schedule_edit_sessions session
  where session.id = target_session_id and session.workspace_id = target_workspace_id
  for update;
  if target_session.id is null or target_session.holder_user_id <> actor_user_id then
    raise exception 'edit session not found' using errcode = 'P0002';
  end if;
  if target_session.status <> 'active' or target_session.expires_at <= now() then
    raise exception 'edit lease expired' using errcode = '40001';
  end if;
  if target_session.revision <> expected_session_revision then
    raise exception 'session revision stale' using errcode = '40001';
  end if;
  if operation not in ('create', 'update', 'delete') then
    raise exception 'invalid shift operation' using errcode = '22023';
  end if;

  if operation in ('create', 'update') then
    target_location_id := (shift_payload->>'location_id')::uuid;
    target_employee_id := nullif(shift_payload->>'employee_id', '')::uuid;
    target_job_id := (shift_payload->>'job_id')::uuid;
    target_shift_type_id := nullif(shift_payload->>'shift_type_id', '')::uuid;
    target_scheduled_date := (shift_payload->>'scheduled_date')::date;
    target_start_time := (shift_payload->>'start_time')::time;
    target_end_time := (shift_payload->>'end_time')::time;
    target_note := coalesce(shift_payload->>'note', '');
    if target_start_time = target_end_time or char_length(target_note) > 500
      or target_scheduled_date not between target_session.week_start and target_session.week_start + 6 then
      raise exception 'invalid shift values' using errcode = '22023';
    end if;
    if not public.schedule_actor_can_manage_service(actor_user_id, target_workspace_id, target_location_id) then
      raise exception 'location scope denied' using errcode = '42501';
    end if;
    if not exists (select 1 from public.jobs job where job.id = target_job_id and job.workspace_id = target_workspace_id and job.archived_at is null)
      or not exists (select 1 from public.locations location where location.id = target_location_id and location.workspace_id = target_workspace_id and location.archived_at is null)
      or (target_shift_type_id is not null and not exists (select 1 from public.shift_types shift_type where shift_type.id = target_shift_type_id and shift_type.workspace_id = target_workspace_id and shift_type.archived_at is null))
      or (target_employee_id is not null and not exists (
        select 1 from public.employee_profiles employee
        join public.employee_location_assignments location_assignment
          on location_assignment.employee_id = employee.id and location_assignment.location_id = target_location_id and location_assignment.ended_at is null
        join public.employee_job_assignments job_assignment
          on job_assignment.employee_id = employee.id and job_assignment.job_id = target_job_id and job_assignment.ended_at is null
        where employee.id = target_employee_id and employee.workspace_id = target_workspace_id and employee.archived_at is null
      )) then
      raise exception 'invalid shift reference' using errcode = '23503';
    end if;
  end if;

  if operation = 'create' then
    if request_idempotency_key is not null and exists (
      select 1 from public.schedule_edit_session_shifts shift
      where shift.session_id = target_session_id and shift.idempotency_key = request_idempotency_key
    ) then
      return public.get_schedule_edit_session_service(actor_user_id, target_workspace_id, target_session_id);
    end if;
    insert into public.schedule_edit_session_shifts (
      id, workspace_id, session_id, location_id, employee_id, job_id,
      shift_type_id, scheduled_date, start_time, end_time, note, idempotency_key
    ) values (
      coalesce(target_shift_id, gen_random_uuid()), target_workspace_id, target_session_id,
      target_location_id, target_employee_id, target_job_id, target_shift_type_id,
      target_scheduled_date, target_start_time, target_end_time, target_note,
      request_idempotency_key
    );
  elsif operation = 'update' then
    update public.schedule_edit_session_shifts shift
    set location_id = target_location_id, employee_id = target_employee_id,
      job_id = target_job_id, shift_type_id = target_shift_type_id,
      scheduled_date = target_scheduled_date, start_time = target_start_time,
      end_time = target_end_time, note = target_note,
      revision = revision + 1, updated_at = now()
    where shift.session_id = target_session_id and shift.id = target_shift_id
      and shift.revision = expected_shift_revision
      and public.schedule_actor_can_manage_service(actor_user_id, target_workspace_id, shift.location_id);
    if not found then
      raise exception 'shift revision stale' using errcode = '40001';
    end if;
  else
    delete from public.schedule_edit_session_shifts shift
    where shift.session_id = target_session_id and shift.id = target_shift_id
      and shift.revision = expected_shift_revision
      and public.schedule_actor_can_manage_service(actor_user_id, target_workspace_id, shift.location_id);
    if not found then
      raise exception 'shift revision stale' using errcode = '40001';
    end if;
  end if;

  update public.schedule_edit_sessions
  set revision = revision + 1, dirty = true,
    last_heartbeat = now(), expires_at = now() + interval '4 minutes'
  where id = target_session_id;
  return public.get_schedule_edit_session_service(actor_user_id, target_workspace_id, target_session_id);
end;
$$;

create function public.save_schedule_edit_session_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_session_id uuid,
  expected_session_revision integer,
  target_name text,
  target_draft_id uuid default null,
  expected_draft_revision integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_session public.schedule_edit_sessions%rowtype;
  saved_draft public.schedule_drafts%rowtype;
begin
  select * into target_session from public.schedule_edit_sessions session
  where session.id = target_session_id and session.workspace_id = target_workspace_id
  for update;
  if target_session.id is null or target_session.holder_user_id <> actor_user_id then
    raise exception 'edit session not found' using errcode = 'P0002';
  end if;
  if target_session.status <> 'active' or target_session.expires_at <= now() then
    raise exception 'edit lease expired' using errcode = '40001';
  end if;
  if target_session.revision <> expected_session_revision then
    raise exception 'session revision stale' using errcode = '40001';
  end if;
  if char_length(btrim(target_name)) not between 1 and 80 then
    raise exception 'invalid draft name' using errcode = '22023';
  end if;

  if target_draft_id is null then
    insert into public.schedule_drafts (
      workspace_id, week_start, name, created_by, updated_by
    ) values (
      target_workspace_id, target_session.week_start, btrim(target_name),
      actor_user_id, actor_user_id
    ) returning * into saved_draft;
  else
    update public.schedule_drafts draft
    set name = btrim(target_name), revision = revision + 1,
      updated_by = actor_user_id, updated_at = now()
    where draft.id = target_draft_id and draft.workspace_id = target_workspace_id
      and draft.week_start = target_session.week_start and draft.archived_at is null
      and draft.revision = expected_draft_revision
    returning * into saved_draft;
    if saved_draft.id is null then
      raise exception 'draft revision stale' using errcode = '40001';
    end if;
  end if;

  delete from public.schedule_draft_shifts shift
  where shift.draft_id = saved_draft.id
    and public.schedule_actor_can_manage_service(actor_user_id, target_workspace_id, shift.location_id);
  insert into public.schedule_draft_shifts (
    id, workspace_id, draft_id, location_id, employee_id, job_id,
    shift_type_id, scheduled_date, start_time, end_time, note, revision
  )
  select shift.id, shift.workspace_id, saved_draft.id, shift.location_id,
    shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date,
    shift.start_time, shift.end_time, shift.note, shift.revision
  from public.schedule_edit_session_shifts shift
  where shift.session_id = target_session_id;

  delete from public.schedule_edit_session_shifts where session_id = target_session_id;
  update public.schedule_edit_sessions
  set status = 'saved', dirty = false, closed_at = now(), expires_at = now()
  where id = target_session_id;

  return jsonb_build_object(
    'id', saved_draft.id, 'workspace_id', saved_draft.workspace_id,
    'week_start', saved_draft.week_start, 'name', saved_draft.name,
    'revision', saved_draft.revision, 'created_by', saved_draft.created_by,
    'updated_by', saved_draft.updated_by, 'created_at', saved_draft.created_at,
    'updated_at', saved_draft.updated_at
  );
exception
  when unique_violation then
    raise exception 'draft name conflict' using errcode = '23505';
end;
$$;

create function public.discard_schedule_edit_session_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.schedule_edit_session_shifts shift
  using public.schedule_edit_sessions session
  where session.id = target_session_id and session.workspace_id = target_workspace_id
    and session.holder_user_id = actor_user_id and session.status = 'active'
    and shift.session_id = session.id;
  update public.schedule_edit_sessions session
  set status = 'discarded', dirty = false, closed_at = now(), expires_at = now()
  where session.id = target_session_id and session.workspace_id = target_workspace_id
    and session.holder_user_id = actor_user_id and session.status = 'active';
  if not found then
    raise exception 'edit session not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('status', 'discarded');
end;
$$;

revoke all on function public.schedule_actor_can_manage_service(uuid, uuid, uuid),
  public.get_schedule_edit_session_service(uuid, uuid, uuid),
  public.list_schedule_drafts_service(uuid, uuid, date),
  public.acquire_schedule_edit_session_service(uuid, uuid, date, public.schedule_edit_source, uuid),
  public.heartbeat_schedule_edit_session_service(uuid, uuid, uuid),
  public.mutate_schedule_edit_shift_service(uuid, uuid, uuid, integer, text, uuid, integer, jsonb, uuid),
  public.save_schedule_edit_session_service(uuid, uuid, uuid, integer, text, uuid, integer),
  public.discard_schedule_edit_session_service(uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.schedule_actor_can_manage_service(uuid, uuid, uuid),
  public.get_schedule_edit_session_service(uuid, uuid, uuid),
  public.list_schedule_drafts_service(uuid, uuid, date),
  public.acquire_schedule_edit_session_service(uuid, uuid, date, public.schedule_edit_source, uuid),
  public.heartbeat_schedule_edit_session_service(uuid, uuid, uuid),
  public.mutate_schedule_edit_shift_service(uuid, uuid, uuid, integer, text, uuid, integer, jsonb, uuid),
  public.save_schedule_edit_session_service(uuid, uuid, uuid, integer, text, uuid, integer),
  public.discard_schedule_edit_session_service(uuid, uuid, uuid)
to service_role;

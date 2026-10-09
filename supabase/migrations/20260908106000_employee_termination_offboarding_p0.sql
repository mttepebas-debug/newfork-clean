create table public.employee_terminations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  employee_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  effective_at timestamptz not null,
  worksite_timezone text not null check (char_length(btrim(worksite_timezone)) between 1 and 80),
  time_entry_action text not null check (time_entry_action in ('block', 'close_at', 'keep_open')),
  reason text not null check (char_length(btrim(reason)) between 3 and 240),
  idempotency_key uuid not null,
  active_session_id uuid,
  released_shift_count integer not null default 0 check (released_shift_count >= 0),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (id, workspace_id),
  unique (workspace_id, actor_user_id, idempotency_key),
  foreign key (employee_id, workspace_id)
    references public.employee_profiles(id, workspace_id) on delete restrict,
  foreign key (active_session_id)
    references public.time_sessions(id) on delete restrict
);

create index employee_terminations_employee_time_idx
  on public.employee_terminations (employee_id, effective_at desc);

create table public.employee_offboarding_shift_actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  termination_id uuid not null,
  shift_id uuid not null,
  location_id uuid not null,
  previous_employee_id uuid not null,
  shift_start_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (termination_id, shift_id),
  foreign key (termination_id, workspace_id)
    references public.employee_terminations(id, workspace_id) on delete restrict,
  foreign key (shift_id)
    references public.schedule_published_shifts(id) on delete restrict,
  foreign key (location_id, workspace_id)
    references public.locations(id, workspace_id) on delete restrict,
  foreign key (previous_employee_id, workspace_id)
    references public.employee_profiles(id, workspace_id) on delete restrict
);

create table public.employee_offboarding_followups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  termination_id uuid not null,
  shift_id uuid not null,
  location_id uuid not null,
  kind text not null check (kind in ('coverage_alert', 'compliance_review')),
  status text not null default 'review_required' check (status = 'review_required'),
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (termination_id, shift_id, kind),
  foreign key (termination_id, workspace_id)
    references public.employee_terminations(id, workspace_id) on delete restrict,
  foreign key (shift_id)
    references public.schedule_published_shifts(id) on delete restrict,
  foreign key (location_id, workspace_id)
    references public.locations(id, workspace_id) on delete restrict
);

alter table public.employee_terminations enable row level security;
alter table public.employee_offboarding_shift_actions enable row level security;
alter table public.employee_offboarding_followups enable row level security;

create policy employee_terminations_select
on public.employee_terminations for select to authenticated
using (
  public.workspace_has_permission(workspace_id, 'employees.read')
  and public.can_access_employee(workspace_id, employee_id)
);

create policy employee_offboarding_shift_actions_select
on public.employee_offboarding_shift_actions for select to authenticated
using (
  exists (
    select 1
    from public.employee_terminations termination
    where termination.id = termination_id
      and termination.workspace_id = workspace_id
      and public.workspace_has_permission(termination.workspace_id, 'employees.read')
      and public.can_access_employee(termination.workspace_id, termination.employee_id)
  )
);

create policy employee_offboarding_followups_select
on public.employee_offboarding_followups for select to authenticated
using (
  exists (
    select 1
    from public.employee_terminations termination
    where termination.id = termination_id
      and termination.workspace_id = workspace_id
      and public.workspace_has_permission(termination.workspace_id, 'employees.read')
      and public.can_access_employee(termination.workspace_id, termination.employee_id)
  )
);

revoke all on public.employee_terminations,
  public.employee_offboarding_shift_actions,
  public.employee_offboarding_followups
from public, anon, authenticated;

grant select on public.employee_terminations,
  public.employee_offboarding_shift_actions,
  public.employee_offboarding_followups
to authenticated;

create function public.terminate_employee(
  target_workspace_id uuid,
  target_employee_id uuid,
  effective_local timestamp without time zone,
  worksite_timezone text,
  time_entry_action text,
  termination_reason text,
  target_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_membership public.workspace_memberships%rowtype;
  employee public.employee_profiles%rowtype;
  member public.workspace_memberships%rowtype;
  active_session public.time_sessions%rowtype;
  existing_termination public.employee_terminations%rowtype;
  v_termination_id uuid;
  resolved_effective_at timestamptz;
  released_count integer := 0;
  response jsonb;
begin
  if actor_id is null
    or not public.workspace_has_permission(target_workspace_id, 'employees.archive') then
    raise exception 'employee archive access required' using errcode = '42501';
  end if;
  if effective_local is null or target_idempotency_key is null then
    raise exception 'effective time and idempotency key are required' using errcode = '22023';
  end if;
  if time_entry_action not in ('block', 'close_at', 'keep_open') then
    raise exception 'invalid time entry action' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(termination_reason, ''))) not between 3 and 240 then
    raise exception 'termination reason must be between 3 and 240 characters' using errcode = '22023';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_timezone_names zone where zone.name = worksite_timezone
  ) then
    raise exception 'invalid worksite timezone' using errcode = '22023';
  end if;

  resolved_effective_at := effective_local at time zone worksite_timezone;
  if resolved_effective_at > now() + interval '5 minutes' then
    raise exception 'future termination requires a scheduled offboarding workflow' using errcode = '22023';
  end if;

  select candidate.* into existing_termination
  from public.employee_terminations candidate
  where candidate.workspace_id = target_workspace_id
    and candidate.actor_user_id = actor_id
    and candidate.idempotency_key = target_idempotency_key
  for update;
  if found then
    if existing_termination.employee_id <> target_employee_id
      or existing_termination.effective_at <> resolved_effective_at
      or existing_termination.worksite_timezone <> worksite_timezone
      or existing_termination.time_entry_action <> time_entry_action
      or existing_termination.reason <> btrim(termination_reason) then
      raise exception 'idempotency key payload conflict' using errcode = '23505';
    end if;
    return existing_termination.result || jsonb_build_object('idempotent_replay', true);
  end if;

  select candidate.* into employee
  from public.employee_profiles candidate
  where candidate.id = target_employee_id
    and candidate.workspace_id = target_workspace_id
    and candidate.archived_at is null
    and public.can_access_employee(target_workspace_id, candidate.id)
  for update;
  if not found then
    raise exception 'active employee not found' using errcode = 'P0002';
  end if;
  if employee.user_id = actor_id then
    raise exception 'self termination is not permitted' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.employee_location_assignments assignment
    join public.locations location
      on location.id = assignment.location_id
     and location.workspace_id = assignment.workspace_id
    where assignment.workspace_id = target_workspace_id
      and assignment.employee_id = target_employee_id
      and assignment.ended_at is null
      and location.timezone = worksite_timezone
  ) then
    raise exception 'worksite timezone must match an active employee location' using errcode = '22023';
  end if;

  select candidate.* into actor_membership
  from public.workspace_memberships candidate
  where candidate.workspace_id = target_workspace_id
    and candidate.user_id = actor_id
    and candidate.status = 'active';
  if actor_membership.id is null then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;
  if not actor_membership.all_locations and exists (
    select affected.location_id
    from (
      select assignment.location_id
      from public.employee_location_assignments assignment
      where assignment.workspace_id = target_workspace_id
        and assignment.employee_id = target_employee_id
        and assignment.ended_at is null
      union
      select shift.location_id
      from public.schedule_published_shifts shift
      join public.schedule_location_publications publication
        on publication.id = shift.publication_id
       and publication.workspace_id = shift.workspace_id
       and publication.location_id = shift.location_id
       and publication.status = 'current'
      where shift.workspace_id = target_workspace_id
        and shift.employee_id = target_employee_id
      union
      select session.location_id
      from public.time_sessions session
      where session.workspace_id = target_workspace_id
        and session.employee_id = target_employee_id
        and session.capture_state in ('open', 'on_break')
    ) affected
    where not exists (
      select 1
      from public.membership_location_scopes scope
      where scope.membership_id = actor_membership.id
        and scope.workspace_id = target_workspace_id
        and scope.location_id = affected.location_id
    )
  ) then
    raise exception 'termination requires access to every affected location' using errcode = '42501';
  end if;

  select candidate.* into member
  from public.workspace_memberships candidate
  where candidate.workspace_id = target_workspace_id
    and candidate.user_id = employee.user_id
  for update;
  if member.id is not null and member.status in ('active', 'pending_activation')
    and not public.workspace_has_permission(target_workspace_id, 'employee_access.manage') then
    raise exception 'linked employee termination requires access management' using errcode = '42501';
  end if;

  select candidate.* into active_session
  from public.time_sessions candidate
  where candidate.workspace_id = target_workspace_id
    and candidate.employee_id = target_employee_id
    and candidate.capture_state in ('open', 'on_break')
  for update;
  if active_session.id is not null and time_entry_action = 'block' then
    raise exception 'active time session requires close_at or keep_open decision' using errcode = '23514';
  end if;
  if active_session.id is not null and time_entry_action = 'close_at'
    and (
      resolved_effective_at <= active_session.started_at
      or resolved_effective_at <= active_session.effective_started_at
      or resolved_effective_at < active_session.last_event_at
    ) then
    raise exception 'termination time must follow the active time session state' using errcode = '22023';
  end if;

  insert into public.employee_terminations (
    workspace_id, employee_id, actor_user_id, effective_at, worksite_timezone,
    time_entry_action, reason, idempotency_key, active_session_id
  ) values (
    target_workspace_id, target_employee_id, actor_id, resolved_effective_at,
    worksite_timezone, time_entry_action, btrim(termination_reason),
    target_idempotency_key, active_session.id
  ) returning id into v_termination_id;

  if active_session.id is not null and time_entry_action = 'close_at' then
    if active_session.capture_state = 'on_break' then
      insert into public.time_events (
        workspace_id, session_id, employee_id, location_id, event_type,
        occurred_at, actor_user_id, source, idempotency_key
      ) values (
        target_workspace_id, active_session.id, target_employee_id,
        active_session.location_id, 'break_end', resolved_effective_at,
        actor_id, 'manager', gen_random_uuid()
      );
    end if;
    update public.time_sessions
    set capture_state = 'complete', ended_at = resolved_effective_at,
      effective_ended_at = resolved_effective_at, last_event_at = resolved_effective_at,
      revision = revision + 1, updated_at = now()
    where id = active_session.id;
    insert into public.time_events (
      workspace_id, session_id, employee_id, location_id, event_type,
      occurred_at, actor_user_id, source, idempotency_key
    ) values (
      target_workspace_id, active_session.id, target_employee_id,
      active_session.location_id, 'clock_out', resolved_effective_at,
      actor_id, 'manager', gen_random_uuid()
    );
  end if;

  if member.id is not null and member.status in ('active', 'pending_activation') then
    insert into public.employee_access_snapshots (
      workspace_id, employee_id, membership_id, role_id, all_locations,
      location_ids, captured_by
    )
    select target_workspace_id, target_employee_id, member.id, member.role_id,
      member.all_locations,
      coalesce(array_agg(scope.location_id) filter (where scope.location_id is not null), '{}'::uuid[]),
      actor_id
    from public.membership_location_scopes scope
    where scope.membership_id = member.id;
    update public.workspace_memberships
    set status = 'suspended', updated_at = now()
    where id = member.id;
  end if;

  update public.employee_invitations
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where workspace_id = target_workspace_id
    and employee_id = target_employee_id
    and status = 'pending';

  insert into public.employee_offboarding_shift_actions (
    workspace_id, termination_id, shift_id, location_id,
    previous_employee_id, shift_start_at
  )
  select shift.workspace_id, v_termination_id, shift.id, shift.location_id,
    shift.employee_id,
    (shift.scheduled_date + shift.start_time) at time zone location.timezone
  from public.schedule_published_shifts shift
  join public.schedule_location_publications publication
    on publication.id = shift.publication_id
   and publication.workspace_id = shift.workspace_id
   and publication.location_id = shift.location_id
   and publication.status = 'current'
  join public.locations location
    on location.id = shift.location_id
   and location.workspace_id = shift.workspace_id
  where shift.workspace_id = target_workspace_id
    and shift.employee_id = target_employee_id
    and (shift.scheduled_date + shift.start_time) at time zone location.timezone >= resolved_effective_at;

  get diagnostics released_count = row_count;

  update public.schedule_published_shifts shift
  set employee_id = null
  from public.employee_offboarding_shift_actions action
  where action.termination_id = v_termination_id
    and action.shift_id = shift.id
    and action.workspace_id = shift.workspace_id;

  insert into public.employee_offboarding_followups (
    workspace_id, termination_id, shift_id, location_id, kind, context
  )
  select action.workspace_id, action.termination_id, action.shift_id,
    action.location_id, kind.value,
    jsonb_build_object('shift_start_at', action.shift_start_at, 'employee_id', target_employee_id)
  from public.employee_offboarding_shift_actions action
  cross join (values ('coverage_alert'), ('compliance_review')) as kind(value)
  where action.termination_id = v_termination_id;

  update public.employee_profiles
  set archived_at = resolved_effective_at, archived_by = actor_id,
    revision = revision + 1, updated_at = now()
  where id = target_employee_id;

  insert into public.employee_events (
    workspace_id, employee_id, actor_user_id, action, summary, occurred_at
  ) values (
    target_workspace_id, target_employee_id, actor_id, 'employee.terminated',
    format('Employee terminated; %s published shift(s) released', released_count),
    resolved_effective_at
  );

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata, occurred_at
  ) values (
    target_workspace_id, actor_id, 'employee.terminated', 'employee', target_employee_id::text,
    jsonb_build_object(
      'termination_id', v_termination_id,
      'effective_at', resolved_effective_at,
      'worksite_timezone', worksite_timezone,
      'time_entry_action', time_entry_action,
      'active_session_id', active_session.id,
      'released_shift_count', released_count
    ),
    resolved_effective_at
  );

  response := jsonb_build_object(
    'termination_id', v_termination_id,
    'effective_at', resolved_effective_at,
    'worksite_timezone', worksite_timezone,
    'time_entry_action', time_entry_action,
    'active_session_id', active_session.id,
    'released_shift_count', released_count,
    'idempotent_replay', false
  );
  update public.employee_terminations
  set released_shift_count = released_count, result = response
  where id = v_termination_id;
  return response;
end;
$$;

revoke all on function public.terminate_employee(
  uuid, uuid, timestamp without time zone, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.terminate_employee(
  uuid, uuid, timestamp without time zone, text, text, text, uuid
) to authenticated;

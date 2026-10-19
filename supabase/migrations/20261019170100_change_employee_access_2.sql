-- ROL-CIFT slice 4.1 (design §4.8): a termination and Remove access close what the person left open on the
-- employee side, with the helper giving the employee access up uses (app_private.close_employee_side).

CREATE OR REPLACE FUNCTION "public"."terminate_employee_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_employee_id" "uuid", "effective_local" timestamp without time zone, "worksite_timezone" "text", "termination_reason" "text", "target_idempotency_key" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  employee public.employee_profiles%rowtype;
  member public.workspace_memberships%rowtype;
  existing_termination public.employee_terminations%rowtype;
  v_termination_id uuid;
  resolved_effective_at timestamptz;
  released_count integer := 0;
  response jsonb;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.terminate', target_person => target_employee_id);
  perform public.availability_lock_workspace(target_workspace_id);
  if effective_local is null or target_idempotency_key is null then
    raise exception 'effective time and idempotency key are required' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(termination_reason, ''))) not between 3 and 240 then
    raise exception 'termination reason must be between 3 and 240 characters' using errcode = '22023';
  end if;
  if not app_private.timezone_name_valid(worksite_timezone) then
    raise exception 'invalid worksite timezone' using errcode = '22023';
  end if;

  resolved_effective_at := effective_local at time zone worksite_timezone;
  if resolved_effective_at > now() + interval '5 minutes' then
    raise exception 'future termination requires a scheduled offboarding workflow' using errcode = '22023';
  end if;

  select candidate.* into existing_termination
  from public.employee_terminations candidate
  where candidate.workspace_id = target_workspace_id
    and candidate.actor_user_id = terminate_employee_service.actor_user_id
    and candidate.idempotency_key = target_idempotency_key
  for update;
  if found then
    if existing_termination.employee_id <> target_employee_id
      or existing_termination.effective_at <> resolved_effective_at
      or existing_termination.worksite_timezone <> worksite_timezone
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
  for update;
  if not found then
    raise exception 'active employee not found' using errcode = 'P0002';
  end if;
  -- The time zone is one of the places they work; somebody with no location
  -- left (S1) has nothing to match, and any valid one is taken.
  if exists (
      select 1 from public.employee_location_assignments assignment
      where assignment.employee_id = target_employee_id and assignment.ended_at is null
    )
    and not exists (
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

  select candidate.* into member
  from public.workspace_memberships candidate
  where candidate.workspace_id = target_workspace_id
    and candidate.user_id = employee.user_id
  for update;

  insert into public.employee_terminations (
    workspace_id, employee_id, actor_user_id, effective_at, worksite_timezone,
    reason, idempotency_key
  ) values (
    target_workspace_id, target_employee_id, actor_user_id, resolved_effective_at,
    worksite_timezone, btrim(termination_reason), target_idempotency_key
  ) returning id into v_termination_id;

  if member.id is not null and member.status in ('active', 'pending_activation') then
    insert into public.employee_access_snapshots (workspace_id, employee_id, membership_id, role_id, captured_by)
    values (target_workspace_id, target_employee_id, member.id, coalesce(member.role_id, member.employee_role_id), actor_user_id);
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
    and (shift.scheduled_date + shift.start_time) at time zone location.timezone >= greatest(resolved_effective_at, now());

  get diagnostics released_count = row_count;

  update public.schedule_published_shifts shift
  set employee_id = null
  from public.employee_offboarding_shift_actions action
  where action.termination_id = v_termination_id
    and action.shift_id = shift.id
    and action.workspace_id = shift.workspace_id;

  -- What they asked for or answered, and their time off waiting, closes with them (design §4.8).
  perform app_private.close_employee_side(target_workspace_id, target_employee_id, actor_user_id, 'terminated');

  update public.employee_profiles
  set archived_at = resolved_effective_at, archived_by = actor_user_id,
    revision = revision + 1, updated_at = now()
  where id = target_employee_id;

  insert into public.employee_events (
    workspace_id, employee_id, actor_user_id, action, summary, occurred_at
  ) values (
    target_workspace_id, target_employee_id, actor_user_id, 'employee.terminated',
    format('Employee terminated; %s published shift(s) released', released_count),
    resolved_effective_at
  );

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata, occurred_at
  ) values (
    target_workspace_id, actor_user_id, 'employee.terminated', 'employee', target_employee_id::text,
    jsonb_build_object(
      'termination_id', v_termination_id,
      'effective_at', resolved_effective_at,
      'worksite_timezone', worksite_timezone,
      'released_shift_count', released_count
    ),
    resolved_effective_at
  );

  -- The person hears their access ended, when they had any; the shifts left without anyone are told per
  -- location (access_tell_ended, schedule_tell_unassigned).
  if member.id is not null and member.status in ('active', 'pending_activation') then
    perform app_private.access_tell_ended(target_workspace_id, target_employee_id, employee.user_id, member.id, actor_user_id);
  else
    perform app_private.access_tell_ended(target_workspace_id, target_employee_id, null, null, actor_user_id);
  end if;
  perform app_private.schedule_tell_unassigned(target_workspace_id,
    array(select action.shift_id from public.employee_offboarding_shift_actions action
          where action.termination_id = v_termination_id), actor_user_id);

  response := jsonb_build_object(
    'termination_id', v_termination_id,
    'effective_at', resolved_effective_at,
    'worksite_timezone', worksite_timezone,
    'released_shift_count', released_count,
    'idempotent_replay', false
  );
  update public.employee_terminations
  set released_shift_count = released_count, result = response
  where id = v_termination_id;
  return response;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."remove_employee_access_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_employee_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  employee public.employee_profiles%rowtype;
  membership public.workspace_memberships%rowtype;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.remove_access', target_person => target_employee_id);

  select * into employee
  from public.employee_profiles
  where id = target_employee_id and workspace_id = target_workspace_id and archived_at is null
  for update;
  if employee.id is null then
    raise exception 'employee not found' using errcode = 'P0002';
  end if;
  if employee.user_id is null then
    return;
  end if;

  select * into membership
  from public.workspace_memberships
  where workspace_id = target_workspace_id and user_id = employee.user_id
  for update;
  if membership.id is null then
    raise exception 'linked workspace membership not found' using errcode = 'P0002';
  end if;

  update public.workspace_memberships
  set status = 'suspended'::public.membership_status, updated_at = now()
  where id = membership.id;

  -- The record and its shifts stay; what they asked for or answered does not wait half done (design §4.8).
  perform app_private.close_employee_side(target_workspace_id, employee.id, actor_user_id, 'access_removed');

  update public.employee_profiles
  set user_id = null, revision = revision + 1, updated_at = now()
  where id = employee.id;

  update public.employee_invitations
  set status = 'revoked'::public.employee_invitation_status, revoked_at = now(), updated_at = now()
  where employee_id = employee.id and status = 'pending'::public.employee_invitation_status;

  update public.employee_onboarding_cases
  set status = 'cancelled'::public.employee_onboarding_case_status,
      submitted_at = null,
      approved_at = null,
      approved_by = null,
      revision = revision + 1,
      updated_at = now()
  where employee_id = employee.id
    and status <> 'cancelled'::public.employee_onboarding_case_status;

  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
  values (target_workspace_id, target_employee_id, actor_user_id, 'employee.access_removed',
    'Workspace access removed and employee account unlinked');
  -- The person, no longer a member, hears it (access_tell_ended).
  perform app_private.access_tell_ended(target_workspace_id, employee.id, employee.user_id, membership.id, actor_user_id);
end;
$$;

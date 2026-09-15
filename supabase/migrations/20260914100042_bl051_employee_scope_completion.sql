-- BL-051: shared employee record edits and archiving use the operational hierarchy.
-- Access restoration remains independently authorized.
CREATE OR REPLACE FUNCTION public.save_employee(target_workspace_id uuid, target_employee_id uuid, employee_first_name text, employee_last_name text, employee_preferred_name text, employee_invitation_email text, employee_start_date date, employee_internal_note text, location_ids uuid[], primary_location_id uuid, job_ids uuid[], primary_job_id uuid, employee_is_remote boolean, employee_is_excluded_from_schedule boolean, expected_revision integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := (select auth.uid());
  saved_id uuid := target_employee_id;
  current_revision integer;
  next_code bigint;
  assignment_optional boolean := coalesce(employee_is_remote, false) or coalesce(employee_is_excluded_from_schedule, false);
begin
  if actor_id is null or not public.workspace_has_permission(target_workspace_id, 'employees.manage') then
    raise exception 'employee management access required' using errcode = '42501';
  end if;
  if char_length(btrim(employee_first_name)) not between 1 and 80 or char_length(btrim(employee_last_name)) not between 1 and 80 then
    raise exception 'employee first and last name are required' using errcode = '22023';
  end if;
  if not assignment_optional and (
    cardinality(coalesce(location_ids, '{}'::uuid[])) = 0
    or primary_location_id is null
    or cardinality(coalesce(job_ids, '{}'::uuid[])) = 0
    or primary_job_id is null
  ) then
    raise exception 'employee requires a location and job unless remote or excluded from schedule' using errcode = '22023';
  end if;
  if primary_location_id is not null and not primary_location_id = any(coalesce(location_ids, '{}'::uuid[])) then
    raise exception 'primary location must be assigned' using errcode = '22023';
  end if;
  if primary_job_id is not null and not primary_job_id = any(coalesce(job_ids, '{}'::uuid[])) then
    raise exception 'primary job must be assigned' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(location_ids, '{}'::uuid[])) selected(location_id) left join public.locations l on l.id = selected.location_id and l.workspace_id = target_workspace_id and l.archived_at is null where l.id is null)
    or not public.can_assign_employee_locations(target_workspace_id, array(
      select selected.location_id from unnest(coalesce(location_ids, '{}'::uuid[])) selected(location_id)
      where not exists (select 1 from public.employee_location_assignments existing
        where existing.employee_id = target_employee_id and existing.workspace_id = target_workspace_id
          and existing.location_id = selected.location_id and existing.ended_at is null)
    )) then
    raise exception 'invalid or inaccessible employee location' using errcode = '42501';
  end if;
  if target_employee_id is not null and exists (
    select 1 from public.employee_location_assignments existing
    where existing.employee_id = target_employee_id and existing.workspace_id = target_workspace_id
      and existing.ended_at is null
      and not public.can_assign_employee_locations(target_workspace_id, array[existing.location_id])
      and not existing.location_id = any(coalesce(location_ids, '{}'::uuid[]))
  ) then
    raise exception 'cannot remove an employee location outside your scope' using errcode='42501';
  end if;
  if exists (select 1 from unnest(coalesce(job_ids, '{}'::uuid[])) selected(job_id) left join public.jobs j on j.id = selected.job_id and j.workspace_id = target_workspace_id and j.archived_at is null where j.id is null) then
    raise exception 'invalid employee job' using errcode = '22023';
  end if;

  if saved_id is null then
    insert into public.workspace_employee_counters (workspace_id, next_value)
    values (target_workspace_id, 1)
    on conflict (workspace_id) do nothing;

    update public.workspace_employee_counters counter
    set next_value = greatest(
      counter.next_value,
      coalesce((
        select max(substring(employee.employee_code from 3)::bigint) + 1
        from public.employee_profiles employee
        where employee.workspace_id = target_workspace_id
          and employee.employee_code ~ '^E-[0-9]{4,}$'
      ), 1)
    ) + 1
    where counter.workspace_id = target_workspace_id
    returning counter.next_value - 1 into next_code;

    insert into public.employee_profiles (
      workspace_id, employee_code, first_name, last_name, preferred_name,
      invitation_email, start_date, internal_note, is_remote,
      is_excluded_from_schedule, created_by
    )
    values (
      target_workspace_id, 'E-' || lpad(next_code::text, 4, '0'),
      btrim(employee_first_name), btrim(employee_last_name),
      btrim(coalesce(employee_preferred_name, '')),
      nullif(lower(btrim(employee_invitation_email)), ''),
      employee_start_date, btrim(coalesce(employee_internal_note, '')),
      coalesce(employee_is_remote, false),
      coalesce(employee_is_excluded_from_schedule, false),
      actor_id
    )
    returning id into saved_id;
    insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
    values (target_workspace_id, saved_id, actor_id, 'employee.created', 'Employee record created');
  else
    select revision into current_revision from public.employee_profiles
    where id = saved_id and workspace_id = target_workspace_id and archived_at is null
      and public.can_manage_employee_record(target_workspace_id, id) for update;
    if current_revision is null then raise exception 'employee not found' using errcode = 'P0002'; end if;
    if expected_revision is null or expected_revision <> current_revision then raise exception 'employee revision conflict' using errcode = '40001'; end if;
    update public.employee_profiles set
      first_name = btrim(employee_first_name),
      last_name = btrim(employee_last_name),
      preferred_name = btrim(coalesce(employee_preferred_name, '')),
      invitation_email = nullif(lower(btrim(employee_invitation_email)), ''),
      start_date = employee_start_date,
      internal_note = btrim(coalesce(employee_internal_note, '')),
      is_remote = coalesce(employee_is_remote, false),
      is_excluded_from_schedule = coalesce(employee_is_excluded_from_schedule, false),
      revision = revision + 1,
      updated_at = now()
    where id = saved_id;
    insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
    values (target_workspace_id, saved_id, actor_id, 'employee.updated', 'Employee profile and assignments updated');
  end if;

  update public.employee_location_assignments set ended_at = now() where employee_id = saved_id and ended_at is null;
  insert into public.employee_location_assignments (workspace_id, employee_id, location_id, is_primary, created_by)
  select target_workspace_id, saved_id, selected.location_id, selected.location_id = primary_location_id, actor_id from unnest(coalesce(location_ids, '{}'::uuid[])) selected(location_id);
  update public.employee_job_assignments set ended_at = now() where employee_id = saved_id and ended_at is null;
  insert into public.employee_job_assignments (workspace_id, employee_id, job_id, is_primary, created_by)
  select target_workspace_id, saved_id, selected.job_id, selected.job_id = primary_job_id, actor_id from unnest(coalesce(job_ids, '{}'::uuid[])) selected(job_id);
  return saved_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_employee_archived(target_workspace_id uuid, target_employee_id uuid, should_archive boolean, restore_access boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := (select auth.uid());
  employee_user_id uuid;
  member public.workspace_memberships%rowtype;
  snapshot public.employee_access_snapshots%rowtype;
begin
  if actor_id is null or not public.workspace_has_permission(target_workspace_id, 'employees.archive') then
    raise exception 'employee archive access required' using errcode = '42501';
  end if;

  select user_id
  into employee_user_id
  from public.employee_profiles
  where id = target_employee_id
    and workspace_id = target_workspace_id
    and public.can_manage_employee_record(target_workspace_id, id)
  for update;

  if not found then
    raise exception 'employee not found' using errcode = 'P0002';
  end if;

  if employee_user_id = actor_id then
    raise exception 'self archive is not permitted' using errcode = '42501';
  end if;

  select *
  into member
  from public.workspace_memberships
  where workspace_id = target_workspace_id
    and user_id = employee_user_id;

  if should_archive and member.id is not null and member.status in ('active', 'pending_activation') then

    insert into public.employee_access_snapshots (
      workspace_id, employee_id, membership_id, role_id, all_locations, location_ids, captured_by
    )
    select target_workspace_id, target_employee_id, member.id, member.role_id, member.all_locations,
      coalesce(array_agg(scope.location_id) filter (where scope.location_id is not null), '{}'), actor_id
    from public.membership_location_scopes scope
    where scope.membership_id = member.id;

    update public.workspace_memberships
    set status = 'suspended'::public.membership_status,
        updated_at = now()
    where id = member.id;
  end if;

  update public.employee_profiles
  set archived_at = case when should_archive then now() else null end,
      archived_by = case when should_archive then actor_id else null end,
      user_id = case
        when not should_archive and not restore_access and employee_user_id is not null then null
        else user_id
      end,
      revision = revision + 1,
      updated_at = now()
  where id = target_employee_id;

  if not should_archive and restore_access then
    if not public.workspace_has_permission(target_workspace_id, 'employee_access.manage') then
      raise exception 'access restoration permission required' using errcode = '42501';
    end if;

    select *
    into snapshot
    from public.employee_access_snapshots
    where employee_id = target_employee_id
      and restored_at is null
    order by captured_at desc
    limit 1
    for update;

    if snapshot.id is null then
      raise exception 'restorable access snapshot not found' using errcode = 'P0002';
    end if;

    if not exists (
      select 1
      from public.workspace_roles
      where id = snapshot.role_id
        and workspace_id = target_workspace_id
    ) then
      raise exception 'snapshotted role is no longer available' using errcode = '22023';
    end if;

    update public.workspace_memberships
    set role_id = snapshot.role_id,
        all_locations = snapshot.all_locations,
        status = 'active'::public.membership_status,
        updated_at = now()
    where id = snapshot.membership_id;

    delete from public.membership_location_scopes
    where membership_id = snapshot.membership_id;

    insert into public.membership_location_scopes (membership_id, workspace_id, location_id)
    select snapshot.membership_id, target_workspace_id, restored_scope.location_id
    from unnest(snapshot.location_ids) as restored_scope(location_id)
    join public.locations location
      on location.id = restored_scope.location_id
     and location.workspace_id = target_workspace_id
     and location.archived_at is null;

    update public.employee_access_snapshots
    set restored_at = now()
    where id = snapshot.id;
  end if;

  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
  values (
    target_workspace_id,
    target_employee_id,
    actor_id,
    case when should_archive then 'employee.archived' else 'employee.restored' end,
    case
      when should_archive then 'Employee archived and linked access suspended'
      when restore_access then 'Employee record and access restored'
      else 'Employee record restored for rehire'
    end
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.terminate_employee(target_workspace_id uuid, target_employee_id uuid, effective_local timestamp without time zone, worksite_timezone text, time_entry_action text, termination_reason text, target_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 perform public.availability_lock_workspace(target_workspace_id);
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
    and public.can_manage_employee_record(target_workspace_id, candidate.id)
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

  select candidate.* into member
  from public.workspace_memberships candidate
  where candidate.workspace_id = target_workspace_id
    and candidate.user_id = employee.user_id
  for update;

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
$function$;

CREATE OR REPLACE FUNCTION public.get_employee_onboarding_review_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target_case public.employee_onboarding_cases%rowtype; requirement_rows jsonb; total_count integer; completed_count integer;
begin
  if not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'employees.read') then
    raise exception 'employee onboarding review required' using errcode = '42501';
  end if;
  if not public.service_actor_can_access_employee(actor_user_id, target_workspace_id, target_employee_id) then
    raise exception 'onboarding case unavailable' using errcode = 'P0002';
  end if;
  select * into target_case from public.employee_onboarding_cases
  where workspace_id = target_workspace_id and employee_id = target_employee_id;
  if target_case.id is null then raise exception 'onboarding case unavailable' using errcode = 'P0002'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', requirement.id, 'kind', requirement.kind, 'title', requirement.title,
    'description', requirement.description, 'status', requirement.status,
    'required', requirement.required, 'blocks_activation', requirement.blocks_activation,
    'requires_review', requirement.requires_review, 'sort_order', requirement.sort_order,
    'source_id', requirement.source_id,
    'accepted_formats', coalesce(requirement.source_snapshot->'accepted_formats', '[]'::jsonb),
    'content_text', null, 'content_digest', requirement.source_snapshot->>'content_digest',
    'intent_statement', null, 'rejection_reason', requirement.rejection_reason
  ) order by requirement.sort_order) filter (where requirement.kind <> 'document' or public.service_actor_has_permission(actor_user_id,target_workspace_id,'employee_documents.read')), '[]'::jsonb),
  count(*) filter (where requirement.required),
  count(*) filter (where requirement.required and requirement.status = 'completed')
  into requirement_rows, total_count, completed_count
  from public.employee_onboarding_requirements requirement
  where requirement.case_id = target_case.id and requirement.status <> 'superseded';
  return jsonb_build_object(
    'case_id', target_case.id, 'employee_id', target_case.employee_id,
    'case_status', target_case.status, 'revision', target_case.revision,
    'submitted_at', target_case.submitted_at,
    'progress_completed', completed_count, 'progress_total', total_count,
    'ssn_present', false,
    'requirements', requirement_rows
  );
end;
$function$;

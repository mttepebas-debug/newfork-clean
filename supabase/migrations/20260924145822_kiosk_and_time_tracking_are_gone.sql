-- FOUNDATION-B stage 5.2: kiosk and time tracking are gone.
--
-- The user decided (2026-09-23) to delete the systems outside the MVP. Kiosk
-- (shared clock-in devices and PINs) and time tracking (clock events,
-- sessions, corrections, review windows, time exports) never had a user: all
-- 14 of their tables were empty locally and on the hosted project on
-- 2026-09-24. Their tables, functions, types, permission keys and
-- notification types go, and so do the places that pointed at them.
-- supabase/tests/retired_objects_stay_gone.test.sql lists what went.

-- 1. What pointed at them ---------------------------------------------------------

-- Ending employment no longer asks what to do with an open time entry.
drop function public.terminate_employee_service(uuid, uuid, uuid, timestamp without time zone, text, text, text, uuid);
drop function public.terminate_employee(uuid, uuid, timestamp without time zone, text, text, text, uuid);
alter table public.employee_terminations
  drop constraint employee_terminations_active_session_id_workspace_id_fkey,
  drop column active_session_id,
  drop column time_entry_action;
CREATE FUNCTION public.terminate_employee(target_workspace_id uuid, target_employee_id uuid, effective_local timestamp without time zone, worksite_timezone text, termination_reason text, target_idempotency_key uuid)
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
    and candidate.actor_user_id = actor_id
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

  insert into public.employee_terminations (
    workspace_id, employee_id, actor_user_id, effective_at, worksite_timezone,
    reason, idempotency_key
  ) values (
    target_workspace_id, target_employee_id, actor_id, resolved_effective_at,
    worksite_timezone, btrim(termination_reason), target_idempotency_key
  ) returning id into v_termination_id;

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
      'released_shift_count', released_count
    ),
    resolved_effective_at
  );

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
$function$;
CREATE FUNCTION public.terminate_employee_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid, effective_local timestamp without time zone, worksite_timezone text, termination_reason text, target_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);

  return public.terminate_employee(
    target_workspace_id,
    target_employee_id,
    effective_local,
    worksite_timezone,
    termination_reason,
    target_idempotency_key
  );
end;
$function$;
revoke all on function public.terminate_employee(uuid, uuid, timestamp without time zone, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.terminate_employee_service(uuid, uuid, uuid, timestamp without time zone, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.terminate_employee_service(uuid, uuid, uuid, timestamp without time zone, text, text, uuid)
  to service_role;

-- Closing a workspace has no kiosk devices, codes, action sessions or PINs to revoke.
CREATE OR REPLACE FUNCTION public.request_workspace_closure_service(actor_user_id uuid, target_workspace_id uuid, closure_mode text, typed_workspace_name text DEFAULT NULL::text, acknowledged boolean DEFAULT false, target_effective_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  workspace_row public.workspaces%rowtype;
  actor_role public.workspace_role;
  request_id uuid;
  effective_at timestamptz;
  edit_sessions_expired integer := 0;
  notification_jobs_suppressed integer := 0;
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501', hint = 'actor.required';
  end if;
  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  if not acknowledged then
    raise exception 'workspace closure requires explicit acknowledgement' using errcode = '23514', hint = 'workspace.closure.acknowledgement_required';
  end if;
  if closure_mode not in ('scheduled_end_period', 'immediate') then
    raise exception 'valid workspace closure mode required' using errcode = '22023', hint = 'workspace.closure.mode_invalid';
  end if;

  select * into workspace_row
  from public.workspaces
  where id = target_workspace_id
  for update;

  if workspace_row.id is null or workspace_row.lifecycle_status = 'deleted' then
    raise exception 'workspace not found' using errcode = '02000', hint = 'workspace.not_found';
  end if;

  select coalesce(role.access_class, membership.role) into actor_role
  from public.workspace_memberships membership
  left join public.workspace_roles role
    on role.id = membership.role_id
   and role.workspace_id = membership.workspace_id
  where membership.workspace_id = target_workspace_id
    and membership.user_id = actor_user_id
    and membership.status = 'active'
  limit 1;

  if actor_role is distinct from 'owner'::public.workspace_role then
    raise exception 'workspace owner access required' using errcode = '42501', hint = 'workspace.owner_required';
  end if;

  if closure_mode = 'immediate' then
    if typed_workspace_name is distinct from workspace_row.name then
      raise exception 'workspace name confirmation does not match' using errcode = '23514', hint = 'workspace.closure.name_mismatch';
    end if;

    update public.workspace_closure_requests
    set status = 'cancelled',
        cancelled_at = now(),
        cancelled_by = actor_user_id,
        updated_at = now()
    where workspace_id = target_workspace_id
      and status = 'scheduled';

    insert into public.workspace_closure_requests (
      workspace_id,
      requested_by,
      mode,
      status,
      typed_workspace_name,
      effective_at,
      completed_at,
      metadata
    )
    values (
      target_workspace_id,
      actor_user_id,
      'immediate',
      'completed',
      typed_workspace_name,
      now(),
      now(),
      jsonb_build_object('unrecoverable_by_user', true)
    )
    returning id into request_id;

    update public.workspaces
    set lifecycle_status = 'deleted',
        closure_scheduled_at = null,
        closure_effective_at = now(),
        closed_at = now(),
        closed_by = actor_user_id,
        updated_at = now()
    where id = target_workspace_id;

    perform set_config('app.workspace_closure', 'on', true);

    update public.workspace_memberships
    set status = 'suspended',
        updated_at = now()
    where workspace_id = target_workspace_id
      and status <> 'suspended';

    update public.employee_invitations
    set status = 'revoked',
        revoked_at = coalesce(revoked_at, now()),
        updated_at = now()
    where workspace_id = target_workspace_id
      and status = 'pending';

    update public.schedule_edit_sessions
    set status = 'expired',
        closed_at = coalesce(closed_at, now()),
        expires_at = now()
    where workspace_id = target_workspace_id
      and status = 'active';
    get diagnostics edit_sessions_expired = row_count;

    update public.notification_outbox
    set status = 'processed',
        lease_owner = null,
        lease_expires_at = null,
        last_error = 'suppressed because workspace was closed immediately'
    where workspace_id = target_workspace_id
      and status in ('pending', 'retry', 'leased');
    get diagnostics notification_jobs_suppressed = row_count;

    delete from public.user_workspace_preferences
    where active_workspace_id = target_workspace_id;

    insert into public.audit_events (
      workspace_id,
      actor_user_id,
      action,
      target_type,
      target_id,
      metadata
    )
    values (
      target_workspace_id,
      actor_user_id,
      'workspace.closure.completed_immediate',
      'workspace',
      target_workspace_id::text,
      jsonb_build_object(
        'closure_request_id', request_id,
        'runtime_revocation', jsonb_build_object(
          'schedule_edit_sessions_expired', edit_sessions_expired,
          'notification_jobs_suppressed', notification_jobs_suppressed
        )
      )
    );

    return jsonb_build_object(
      'status', 'deleted',
      'workspace_id', target_workspace_id,
      'closure_request_id', request_id,
      'runtime_revocation', jsonb_build_object(
        'schedule_edit_sessions_expired', edit_sessions_expired,
        'notification_jobs_suppressed', notification_jobs_suppressed
      )
    );
  end if;

  effective_at := coalesce(target_effective_at, now() + app_private.default_closure_period());
  if effective_at <= now() then
    raise exception 'scheduled workspace closure requires a future effective time'
      using errcode = '23514', hint = 'workspace.closure.effective_at_past';
  end if;

  update public.workspace_closure_requests
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = actor_user_id,
      updated_at = now()
  where workspace_id = target_workspace_id
    and status = 'scheduled';

  insert into public.workspace_closure_requests (
    workspace_id,
    requested_by,
    mode,
    status,
    effective_at
  )
  values (
    target_workspace_id,
    actor_user_id,
    'scheduled_end_period',
    'scheduled',
    effective_at
  )
  returning id into request_id;

  update public.workspaces
  set lifecycle_status = 'closure_scheduled',
      closure_scheduled_at = now(),
      closure_effective_at = effective_at,
      closed_at = null,
      closed_by = null,
      updated_at = now()
  where id = target_workspace_id;

  insert into public.audit_events (
    workspace_id,
    actor_user_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    target_workspace_id,
    actor_user_id,
    'workspace.closure.scheduled',
    'workspace',
    target_workspace_id::text,
    jsonb_build_object('closure_request_id', request_id, 'effective_at', effective_at)
  );

  return jsonb_build_object(
    'status', 'scheduled',
    'workspace_id', target_workspace_id,
    'closure_request_id', request_id,
    'effective_at', effective_at
  );
end;
$function$;

-- Unpublishing has no worked time to keep. The count stays in the answer at 0
-- until the screens that show it are cleaned up (stage 5.5).
CREATE OR REPLACE FUNCTION public.unpublish_schedule_service_exchange_base(actor_user_id uuid, target_workspace_id uuid, target_week_start date, target_location_ids uuid[], expected_fingerprint text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  preview jsonb;
  normalized_locations uuid[];
  publication_ids uuid[];
  kept_worked_count integer := 0;
  effective_unpublished_at timestamptz := now();
begin
  select array_agg(distinct location_id order by location_id) into normalized_locations
  from unnest(target_location_ids) location_id;
  perform 1 from public.schedule_location_publications publication
  where publication.workspace_id = target_workspace_id
    and publication.week_start = target_week_start
    and publication.location_id = any(normalized_locations)
    and publication.status = 'current' for update;
  preview := public.preview_schedule_unpublication_service(
    actor_user_id, target_workspace_id, target_week_start, normalized_locations
  );
  if preview->>'status' = 'past_week_closed' then
    raise exception 'past schedule week is closed' using errcode = '42501';
  end if;
  if preview->>'fingerprint' <> expected_fingerprint then
    raise exception 'stale unpublication preview' using errcode = '40001';
  end if;
  select array_agg((item->>'publication_id')::uuid order by item->>'publication_id')
  into publication_ids from jsonb_array_elements(preview->'locations') item;

  update public.schedule_location_publications
  set status = 'unpublished', unpublished_by = actor_user_id,
    unpublished_at = effective_unpublished_at
  where id = any(publication_ids) and status = 'current';
  if not found then raise exception 'stale unpublication preview' using errcode = '40001'; end if;
  insert into public.schedule_publication_events (
    workspace_id, week_start, action, actor_user_id, location_ids,
    publication_ids, preflight_fingerprint, diff_summary
  ) values (
    target_workspace_id, target_week_start, 'unpublished', actor_user_id,
    normalized_locations, publication_ids, expected_fingerprint,
    jsonb_build_object('locations', preview->'locations')
  );
  return jsonb_build_object(
    'status', 'unpublished', 'workspace_id', target_workspace_id,
    'week_start', target_week_start, 'location_ids', to_jsonb(normalized_locations),
    'publication_ids', to_jsonb(publication_ids),
    'kept_worked_count', kept_worked_count,
    'unpublished_at', effective_unpublished_at
  );
end;
$function$;

-- The notification reconcile has no time corrections to look for.
CREATE OR REPLACE FUNCTION public.reconcile_notification_platform_service()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  active_without_producer jsonb;
  active_without_template jsonb;
  missing_domain_events jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'type_key', catalog.type_key,
    'schema_version', catalog.schema_version,
    'reason', 'active_catalog_without_outbox_producer'
  ) order by catalog.type_key), '[]'::jsonb)
  into active_without_producer
  from public.notification_catalog catalog
  where catalog.lifecycle = 'active'
    and not exists (
      select 1 from public.notification_producer_registry registry
      where registry.type_key = catalog.type_key
        and registry.schema_version = catalog.schema_version
        and registry.integration_contract = case when catalog.notification_scope='account' then 'account_audit_v1' else 'outbox_v1' end
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'type_key', catalog.type_key,
    'schema_version', catalog.schema_version,
    'reason', 'active_catalog_without_published_in_app_template'
  ) order by catalog.type_key), '[]'::jsonb)
  into active_without_template
  from public.notification_catalog catalog
  where catalog.lifecycle = 'active'
    and 'in_app' = any(catalog.supported_channels)
    and not exists (
      select 1 from public.notification_template_versions template
      where template.type_key = catalog.type_key
        and template.schema_version = catalog.schema_version
        and template.channel = 'in_app'
        and template.status = 'published'
    );

  with request_events as (
    select event.workspace_id, event.id event_id,
      case when event.action = 'submitted' then 'requests.time_off.submitted'
        else 'requests.time_off.status_changed' end type_key,
      event.created_at occurred_at
    from public.schedule_time_off_events event
    where event.action not in ('viewed', 'returned_to_pending')
    union all
    select event.workspace_id, event.id,
      case when event.action = 'submitted' then 'requests.shift_change.submitted'
        else 'requests.shift_change.status_changed' end,
      event.created_at
    from public.schedule_shift_change_events event
    where event.action <> 'viewed'
  ), missing_requests as (
    select request.workspace_id, request.event_id, request.type_key, request.occurred_at,
      'deterministic_request_event_without_outbox' reason
    from request_events request
    join public.notification_producer_registry registry
      on registry.type_key = request.type_key and registry.schema_version = 1
    where request.occurred_at >= registry.activated_at
      and not exists (
        select 1 from public.notification_outbox outbox
        where outbox.workspace_id = request.workspace_id and outbox.event_id = request.event_id
      )
  ), missing_announcements as (
    select announcement.workspace_id, null::uuid event_id,
      'communications.announcement.available' type_key,
      announcement.updated_at occurred_at,
      'published_announcement_without_outbox' reason
    from public.announcements announcement
    join public.notification_producer_registry registry
      on registry.type_key = 'communications.announcement.available' and registry.schema_version = 1
    where announcement.status in ('published', 'scheduled')
      and announcement.updated_at >= registry.activated_at
      and not exists (
        select 1 from public.notification_outbox outbox
        where outbox.workspace_id = announcement.workspace_id
          and outbox.type_key = 'communications.announcement.available'
          and outbox.subject_id = announcement.id::text
          and outbox.payload->>'announcement_revision' = announcement.revision::text
      )
  ), all_missing as (
    select * from missing_requests
    union all select * from missing_announcements
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'workspace_id', missing.workspace_id,
    'event_id', missing.event_id,
    'type_key', missing.type_key,
    'occurred_at', missing.occurred_at,
    'reason', missing.reason
  ) order by missing.occurred_at, missing.type_key), '[]'::jsonb)
  into missing_domain_events
  from all_missing missing;

  return jsonb_build_object(
    'status', case
      when jsonb_array_length(active_without_producer) = 0
        and jsonb_array_length(active_without_template) = 0
        and jsonb_array_length(missing_domain_events) = 0
      then 'healthy' else 'drift_detected' end,
    'active_catalog_without_producer', active_without_producer,
    'active_catalog_without_template', active_without_template,
    'deterministic_domain_events_without_outbox', missing_domain_events,
    'dead_letter_count', (select count(*) from public.notification_outbox where status = 'dead_letter'),
    'checked_at', now()
  );
end;
$function$;

-- A past week is read-only; there is no Time Entries screen to send people to.
CREATE OR REPLACE FUNCTION public.acquire_schedule_edit_session_service(actor_user_id uuid, target_workspace_id uuid, target_week_start date, requested_source schedule_edit_source, requested_draft_id uuid DEFAULT NULL::uuid, target_location_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_week_start date;
begin
  current_week_start := public.schedule_current_week_start_service(target_workspace_id);
  if current_week_start is not null and target_week_start < current_week_start then
    raise exception '%', jsonb_build_object(
      'status', 'past_edit_blocked',
      'past_edits', jsonb_build_array(jsonb_build_object(
        'op_type', 'update',
        'shift_id', null,
        'scheduled_date', to_char(target_week_start, 'YYYY-MM-DD'),
        'location_name', 'Schedule week',
        'employee_name', null,
        'reason', 'past_week',
        'severity', 'blocked'
      )),
      'past_edit_messages', jsonb_build_array(
        'Past schedule weeks are read-only.'
      ),
      'current_week_start', current_week_start
    )::text using errcode = 'P0001';
  end if;
  return public.acquire_schedule_edit_session_service_past_week_base(
    actor_user_id, target_workspace_id, target_week_start,
    requested_source, requested_draft_id, target_location_ids
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.save_schedule_edit_session_service_exchange_base(actor_user_id uuid, target_workspace_id uuid, target_session_id uuid, expected_session_revision integer, target_name text, target_draft_id uuid DEFAULT NULL::uuid, expected_draft_revision integer DEFAULT NULL::integer, acknowledge_past_edits boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_session public.schedule_edit_sessions%rowtype;
  current_week_start date;
  findings jsonb := '[]'::jsonb;
  blocked_findings jsonb := '[]'::jsonb;
  warning_findings jsonb := '[]'::jsonb;
begin
  select * into target_session
  from public.schedule_edit_sessions session
  where session.id = target_session_id
    and session.workspace_id = target_workspace_id
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

  current_week_start := public.schedule_current_week_start_service(target_workspace_id);

  if current_week_start is not null and target_session.week_start < current_week_start then
    select coalesce(jsonb_agg(jsonb_build_object(
      'op_type', coalesce(shift.pending_op_type, 'update'),
      'shift_id', shift.id,
      'scheduled_date', to_char(shift.scheduled_date, 'YYYY-MM-DD'),
      'location_name', coalesce(location.name, 'Unknown location'),
      'employee_name', coalesce(
        nullif(trim(concat_ws(' ', nullif(employee.preferred_name, ''), employee.last_name)), ''),
        nullif(trim(concat_ws(' ', employee.first_name, employee.last_name)), '')
      ),
      'reason', 'past_week',
      'severity', 'blocked'
    ) order by shift.scheduled_date, shift.start_time, shift.id), '[]'::jsonb)
    into blocked_findings
    from public.schedule_edit_session_shifts shift
    left join public.locations location
      on location.id = shift.location_id
     and location.workspace_id = shift.workspace_id
    left join public.employee_profiles employee
      on employee.id = shift.employee_id
     and employee.workspace_id = shift.workspace_id
    where shift.session_id = target_session_id
      and shift.workspace_id = target_workspace_id
      and public.schedule_actor_can_manage_service(actor_user_id, target_workspace_id, shift.location_id);

    if jsonb_array_length(blocked_findings) = 0 then
      blocked_findings := jsonb_build_array(jsonb_build_object(
        'op_type', 'update',
        'shift_id', null,
        'scheduled_date', to_char(target_session.week_start, 'YYYY-MM-DD'),
        'location_name', 'Schedule week',
        'employee_name', null,
        'reason', 'past_week',
        'severity', 'blocked'
      ));
    end if;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'op_type', shift.pending_op_type,
      'shift_id', shift.id,
      'scheduled_date', to_char(shift.scheduled_date, 'YYYY-MM-DD'),
      'location_name', coalesce(location.name, 'Unknown location'),
      'employee_name', coalesce(
        nullif(trim(concat_ws(' ', nullif(employee.preferred_name, ''), employee.last_name)), ''),
        nullif(trim(concat_ws(' ', employee.first_name, employee.last_name)), '')
      ),
      'reason', 'shift_started',
      'severity', 'warning'
    ) order by shift.scheduled_date, shift.start_time, shift.id), '[]'::jsonb)
    into warning_findings
    from public.schedule_edit_session_shifts shift
    join public.locations location
      on location.id = shift.location_id
     and location.workspace_id = shift.workspace_id
    left join public.employee_profiles employee
      on employee.id = shift.employee_id
     and employee.workspace_id = shift.workspace_id
    where shift.session_id = target_session_id
      and shift.workspace_id = target_workspace_id
      and shift.pending_op_type in ('create', 'update', 'delete')
      and public.schedule_actor_can_manage_service(actor_user_id, target_workspace_id, shift.location_id)
      and ((shift.scheduled_date::timestamp + shift.start_time) at time zone location.timezone) <= now();
  end if;

  if jsonb_array_length(blocked_findings) > 0 then
    findings := blocked_findings;
    raise exception '%', jsonb_build_object(
      'status', 'past_edit_blocked',
      'past_edits', findings,
      'past_edit_messages', (
        select coalesce(jsonb_agg(
          coalesce(finding->>'employee_name', 'An open shift')
          || ' - '
          || coalesce(finding->>'location_name', 'Unknown location')
          || ' on '
          || coalesce(finding->>'scheduled_date', target_session.week_start::text)
          || ' is in a past week and cannot change.'
        ), '[]'::jsonb)
        from jsonb_array_elements(findings) finding
      ),
      'current_week_start', current_week_start
    )::text using errcode = 'P0001';
  end if;

  if jsonb_array_length(warning_findings) > 0 and acknowledge_past_edits is distinct from true then
    findings := warning_findings;
    raise exception '%', jsonb_build_object(
      'status', 'past_shift_edit_requires_ack',
      'past_edits', findings,
      'past_edit_messages', (
        select coalesce(jsonb_agg(
          coalesce(finding->>'employee_name', 'An open shift')
          || ' - '
          || coalesce(finding->>'location_name', 'Unknown location')
          || ' on '
          || coalesce(finding->>'scheduled_date', target_session.week_start::text)
          || ' has already started. Employees will not be notified of this change.'
        ), '[]'::jsonb)
        from jsonb_array_elements(findings) finding
      )
    )::text using errcode = 'P0001';
  end if;

  return public.save_schedule_edit_session_service_retroactive_base(
    actor_user_id,
    target_workspace_id,
    target_session_id,
    expected_session_revision,
    target_name,
    target_draft_id,
    expected_draft_revision
  );
end;
$function$;

-- The two time correction notification types, and their inbox category.
delete from public.notification_template_versions where type_key like 'time_tracking.%';
delete from public.notification_producer_registry where type_key like 'time_tracking.%';
delete from public.notification_catalog where type_key like 'time_tracking.%';
alter table public.notification_catalog drop constraint notification_catalog_category_check;
alter table public.notification_catalog add constraint notification_catalog_category_check
  check (category in ('security', 'schedule', 'requests', 'payroll', 'people', 'communications', 'system'));
CREATE OR REPLACE FUNCTION public.get_notification_inbox_v2_service(actor_user_id uuid, target_workspace_id uuid, target_category text, target_severity text, target_read_state text, target_cursor_created_at timestamp with time zone, target_cursor_id uuid, target_limit integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  result jsonb;
  effective_limit integer := greatest(1, least(coalesce(target_limit, 30), 50));
begin
  if target_workspace_id is not null and not public.notification_actor_is_active_member_service(actor_user_id, target_workspace_id) then
    raise exception 'notification inbox access required' using errcode = '42501';
  end if;
  if (target_cursor_created_at is null) <> (target_cursor_id is null) then
    raise exception 'complete notification cursor required' using errcode = '22023';
  end if;
  if target_category is not null and target_category not in (
    'security', 'schedule', 'requests',
    'payroll', 'people', 'communications', 'system',
    'announcement', 'request'
  ) then
    raise exception 'valid notification category required' using errcode = '22023';
  end if;
  if target_severity is not null and target_severity not in ('info', 'success', 'warning', 'action_required') then
    raise exception 'valid notification severity required' using errcode = '22023';
  end if;
  if target_read_state is not null and target_read_state not in ('all', 'seen', 'unseen', 'read', 'unread') then
    raise exception 'valid notification read state required' using errcode = '22023';
  end if;

  with all_items as (
    select
      item.id,
      item.workspace_id,
      catalog.category,
      event.type_key,
      event.schema_version,
      catalog.severity,
      item.title,
      item.body,
      case when target_workspace_id is null then (select w.name from public.workspaces w where w.id=item.workspace_id)||' · A document update is available.' else item.safe_preview end as safe_preview,
      item.action_url,
      item.group_key,
      'notification_event'::text as source_type,
      event.id as source_id,
      item.created_at,
      item.seen_at,
      item.read_at,
      item.dismissed_at,
      item.visibility_state
    from public.notification_inbox_items item
    join public.notification_recipients recipient
      on recipient.id = item.recipient_projection_id
     and recipient.workspace_id = item.workspace_id
    join public.notification_events event
      on event.id = recipient.event_id
     and event.workspace_id = recipient.workspace_id
    join public.notification_catalog catalog
      on catalog.type_key = event.type_key
     and catalog.schema_version = event.schema_version
    where (item.workspace_id = target_workspace_id or (target_workspace_id is null and app_private.document_account_inbox_allowed(item.id,get_notification_inbox_v2_service.actor_user_id)))
      and recipient.recipient_user_id = get_notification_inbox_v2_service.actor_user_id
      and item.dismissed_at is null
      and item.visibility_state = 'visible'
      and not exists (
        select 1 from public.notification_outbox staffing_outbox
        where staffing_outbox.workspace_id = recipient.workspace_id
          and staffing_outbox.event_id = recipient.event_id
          and staffing_outbox.subject_type = 'lineup_staffing_notifications'
          and not public.lineup_staffing_notification_allowed(staffing_outbox.id, recipient.recipient_user_id)
      )

    union all
    select a.id,null::uuid,'security',a.type_key,a.schema_version,c.severity,t.content->>'title',t.content->>'body',
     t.content->>'safe_preview','/app/account/security',null::text,'account_security',a.event_id,a.created_at,a.seen_at,a.read_at,a.dismissed_at,'visible'
    from public.account_notification_items a join public.notification_catalog c using(type_key,schema_version)
    join public.notification_template_versions t using(type_key,schema_version)
    where a.user_id=actor_user_id and a.dismissed_at is null and t.channel='in_app' and t.locale='en' and t.status='published'
  ), candidate as (
    select * from all_items item where true
      and (
        target_category is null
        or item.category = target_category
        or (target_category = 'announcement' and item.category = 'communications')
        or (target_category = 'request' and item.category = 'requests')
      )
      and (target_severity is null or item.severity = target_severity)
      and (
        target_read_state is null
        or target_read_state = 'all'
        or (target_read_state = 'seen' and item.seen_at is not null)
        or (target_read_state = 'unseen' and item.seen_at is null)
        or (target_read_state = 'read' and item.read_at is not null)
        or (target_read_state = 'unread' and item.read_at is null)
      )
      and (
        target_cursor_created_at is null
        or (item.created_at, item.id) < (target_cursor_created_at, target_cursor_id)
      )
    order by item.created_at desc, item.id desc
    limit effective_limit + 1
  ), page as (
    select * from candidate
    order by created_at desc, id desc
    limit effective_limit
  )
  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'unread_count', (select count(*) from public.account_notification_items where user_id=actor_user_id and read_at is null and dismissed_at is null) + (
      select count(*)
      from public.notification_inbox_items unread_item
      join public.notification_recipients unread_recipient
        on unread_recipient.id = unread_item.recipient_projection_id
       and unread_recipient.workspace_id = unread_item.workspace_id
      where (unread_item.workspace_id = target_workspace_id or (target_workspace_id is null and app_private.document_account_inbox_allowed(unread_item.id,get_notification_inbox_v2_service.actor_user_id)))
        and unread_recipient.recipient_user_id = get_notification_inbox_v2_service.actor_user_id
        and unread_item.read_at is null
        and unread_item.dismissed_at is null
        and unread_item.visibility_state = 'visible'
        and not exists (
          select 1 from public.notification_outbox staffing_outbox
          where staffing_outbox.workspace_id = unread_recipient.workspace_id
            and staffing_outbox.event_id = unread_recipient.event_id
            and staffing_outbox.subject_type = 'lineup_staffing_notifications'
            and not public.lineup_staffing_notification_allowed(staffing_outbox.id, unread_recipient.recipient_user_id)
        )
    ),
    'next_cursor', case
      when (select count(*) from candidate) > effective_limit then (
        select jsonb_build_object('created_at', created_at, 'id', id)
        from page
        order by created_at asc, id asc
        limit 1
      )
      else null
    end,
    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', page_row.id,
        'workspace_id', page_row.workspace_id,
        'scope', case when page_row.workspace_id is null then 'account' else 'workspace' end,
        'category', page_row.category,
        'type_key', page_row.type_key,
        'severity', page_row.severity,
        'safe_preview', page_row.safe_preview,
        'title', page_row.title,
        'body', page_row.body,
        'action_url', page_row.action_url,
        'group_key', page_row.group_key,
        'source_type', page_row.source_type,
        'source_id', page_row.source_id,
        'created_at', page_row.created_at,
        'seen_at', page_row.seen_at,
        'read_at', page_row.read_at,
        'visibility_state', page_row.visibility_state
      ) order by page_row.created_at desc, page_row.id desc)
      from page page_row
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$function$;

-- The owner's setup checklist has no kiosk step.
alter table public.owner_setup_checklist_progress
  drop constraint owner_setup_checklist_progress_completed_item_ids_check;
update public.owner_setup_checklist_progress
set completed_item_ids = array_remove(completed_item_ids, 'kiosk')
where 'kiosk' = any (completed_item_ids);
alter table public.owner_setup_checklist_progress
  add constraint owner_setup_checklist_progress_completed_item_ids_check
  check (completed_item_ids <@ array['app_tour', 'scheduling_preferences', 'employees', 'documents', 'schedule', 'billing']);
CREATE OR REPLACE FUNCTION app_private.owner_setup_checklist_item_ids()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select array[
    'app_tour',
    'scheduling_preferences',
    'employees',
    'documents',
    'schedule',
    'billing'
  ]::text[];
$function$;

-- 2. The permission keys ------------------------------------------------------------

drop trigger grant_new_kiosk_system_role_permissions_trigger on public.workspace_roles;
delete from app_private.role_permission_dependencies
where permission_key like 'kiosk.%' or permission_key like 'time.%'
   or required_key like 'kiosk.%' or required_key like 'time.%';
delete from public.workspace_role_permissions where permission_key like 'kiosk.%' or permission_key like 'time.%';
delete from public.permissions where key like 'kiosk.%' or key like 'time.%';

create or replace function app_private.role_default_permissions(role_class public.workspace_role)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
 select coalesce(array_agg(key order by key), '{}'::text[]) from public.permissions where
 role_class in ('owner', 'admin')
 or (role_class = 'manager' and key in (
 'workspace.read','schedule.read','schedule.manage','schedule.availability.override','schedule.publish','schedule.templates.read','schedule.templates.manage','schedule.export',
 'schedule.lineup.read','schedule.lineup.manage','schedule.lineup.share','schedule.time_off_requests.read','schedule.time_off_requests.manage','schedule.shift_change_requests.read','schedule.shift_change_requests.manage',
 'availability.read','availability.manage','employees.read','employees.manage','employees.archive','employee_onboarding.review','announcements.read','announcements.manage','important_dates.read','important_dates.manage',
 'notifications.read','notifications.read_own','notifications.preferences.write_own'))
 or (role_class = 'employee' and employee_eligible);
$$;

-- 3. Functions, tables and types ------------------------------------------------------
-- Functions first (one takes a kiosk_devices row), then the tables with their
-- own triggers, then the trigger functions, then the types.

drop function public.apply_time_amendment_service(uuid, uuid, uuid, integer, timestamp with time zone, timestamp with time zone, text, uuid);
drop function public.approve_time_review_window_service(uuid, uuid, uuid, date, date, jsonb, uuid);
drop function public.begin_kiosk_pin_verification_service(text, uuid);
drop function public.cancel_kiosk_action_service(text, text);
drop function public.capture_kiosk_time_action_service(text, text, text, integer, timestamp with time zone, uuid);
drop function public.capture_own_time_event_service(uuid, uuid, uuid, uuid, public.time_event_type, timestamp with time zone, uuid);
drop function public.capture_time_event_service(uuid, uuid, uuid, uuid, uuid, public.time_event_type, timestamp with time zone, uuid, public.time_capture_source);
drop function public.create_kiosk_enrollment_service(uuid, uuid, uuid, text, text, timestamp with time zone);
drop function public.create_kiosk_reenrollment_service(uuid, uuid, uuid, text, timestamp with time zone);
drop function public.create_manual_time_session_service(uuid, uuid, uuid, uuid, timestamp with time zone, timestamp with time zone, text, uuid);
drop function public.create_time_export_snapshot_service(uuid, uuid, uuid[], date, date, text, uuid);
drop function public.decide_time_correction_service(uuid, uuid, uuid, integer, text, text, uuid);
drop function public.decide_time_correction_service_legacy_notifications(uuid, uuid, uuid, integer, text, text, uuid);
drop function public.exchange_kiosk_enrollment_service(text, text);
drop function public.finish_kiosk_pin_verification_service(uuid, boolean, text, timestamp with time zone);
drop function public.get_employee_time_tracking_service(uuid, uuid);
drop function public.get_kiosk_action_state_service(text, text);
drop function public.get_kiosk_directory_service(text);
drop function public.get_kiosk_management_service(uuid, uuid);
drop function public.get_manager_time_entries_service(uuid, uuid, date, date);
drop function public.kiosk_device_json(public.kiosk_devices);
drop function public.manager_time_session_detail_json(uuid);
drop function public.preview_time_export_snapshot_service(uuid, uuid, uuid[], date, date);
drop function public.request_own_time_correction_service(uuid, uuid, uuid, integer, timestamp with time zone, timestamp with time zone, text, uuid);
drop function public.request_own_time_correction_service_legacy_notifications(uuid, uuid, uuid, integer, timestamp with time zone, timestamp with time zone, text, uuid);
drop function public.revoke_kiosk_device_service(uuid, uuid, uuid);
drop function public.rotate_kiosk_device_credential_service(text, text);
drop function public.service_actor_can_kiosk_location(uuid, uuid, uuid, text);
drop function public.service_actor_can_time_location(uuid, uuid, uuid, text);
drop function public.set_employee_kiosk_pin_service(uuid, uuid, uuid, uuid, text);
drop function public.time_employee_has_location(uuid, uuid, uuid);
drop function public.time_export_normalize_location_ids(uuid[]);
drop function public.time_export_preview_rows(uuid, uuid, uuid[], date, date);
drop function public.time_session_detail_json(uuid);
drop function public.update_kiosk_device_label_service(uuid, uuid, uuid, text);

drop table
  public.employee_kiosk_credentials,
  public.kiosk_action_sessions,
  public.kiosk_devices,
  public.kiosk_enrollment_codes,
  public.kiosk_security_events,
  public.kiosk_verification_attempts,
  public.time_amendments,
  public.time_correction_requests,
  public.time_events,
  public.time_export_snapshot_rows,
  public.time_export_snapshots,
  public.time_manual_entries,
  public.time_review_windows,
  public.time_sessions;

drop function public.grant_new_kiosk_system_role_permissions();
drop function public.mark_time_export_snapshot_superseded();
drop function public.prevent_time_history_mutation();
drop function public.protect_time_correction_history();
drop function public.protect_time_export_snapshot_history();
drop function public.protect_time_export_snapshot_row_history();

drop type
  public.kiosk_device_status,
  public.kiosk_enrollment_status,
  public.kiosk_verification_outcome,
  public.time_capture_source,
  public.time_capture_state,
  public.time_correction_status,
  public.time_event_type,
  public.time_export_snapshot_status,
  public.time_review_state;

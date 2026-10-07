-- BL-958 (ACIL-40001, KK-211): a lasting conflict was refused with SQLSTATE
-- 40001 (an old revision, a reused request key, a closed request, a changed
-- list, picture of the shifts or time zone). PostgREST takes 40001 for a
-- passing serialization failure and runs the same request again without end,
-- holding one of its pooled connections; about ten such saves stopped the API
-- for every workspace (EKRAN-08-CEKMECE, 2026-10-07). These refusals now
-- answer PT409, which PostgREST hands back at once; the sentence and any hint
-- stay, and a stale employee save names itself (employee.revision_conflict).
-- The API answers both codes with 409 (apps/api/src/http-error.ts).
--
-- The two "a shift changed under us" refusals (time_off_release_shifts,
-- important_date_close_shifts) answer PT409 too: they read the shift through
-- shift_exchange_shift, which can hand back a moved copy, so the same request
-- may fail the same way every time; a real lost race now asks the person to
-- look again instead of being retried. Schedule's editing, template, auto-fill
-- and publishing services are EKRAN-01's and stay as they are.
-- Bodies are today's definitions from supabase/schema.sql; only the error
-- codes (and that one hint) change.

CREATE OR REPLACE FUNCTION "app_private"."apply_owner_onboarding_update"("actor_user_id" "uuid", "target_workspace_id" "uuid", "workspace_name" "text", "next_step" smallint, "mark_complete" boolean DEFAULT false, "expected_revision" integer DEFAULT NULL::integer, "owner_first_name" "text" DEFAULT NULL::"text", "owner_middle_name" "text" DEFAULT NULL::"text", "owner_last_name" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  owner_employee_id uuid;
  current_status public.onboarding_status;
  current_revision integer;
  completed_timestamp timestamptz;
  names_given boolean := coalesce(btrim(owner_first_name), '') <> ''
    or coalesce(btrim(owner_middle_name), '') <> ''
    or coalesce(btrim(owner_last_name), '') <> '';
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = actor_user_id
      and membership.role = 'owner'
      and membership.status = 'active'
  ) then
    raise exception 'owner access required' using errcode = '42501';
  end if;
  if char_length(btrim(workspace_name)) not between 1 and 120 then
    raise exception 'workspace name must be between 1 and 120 characters' using errcode = '22023';
  end if;
  if next_step not between 1 and 4 then
    raise exception 'invalid onboarding step' using errcode = '22023';
  end if;

  select onboarding.status, onboarding.revision
  into current_status, current_revision
  from public.workspace_onboarding onboarding
  where onboarding.workspace_id = target_workspace_id
  for update;

  if current_status is null then
    raise exception 'workspace onboarding was not found' using errcode = 'P0002';
  end if;

  if current_status = 'complete'::public.onboarding_status then
    if mark_complete then
      return;
    end if;
    raise exception 'completed owner onboarding cannot be changed' using errcode = '22023';
  end if;

  if expected_revision is not null and current_revision <> expected_revision then
    raise exception 'owner onboarding revision conflict' using errcode = 'PT409';
  end if;

  if mark_complete and not exists (
    select 1
    from public.locations location
    where location.workspace_id = target_workspace_id
      and location.archived_at is null
  ) then
    raise exception 'at least one active location is required to complete owner onboarding' using errcode = '23514';
  end if;

  if mark_complete and not exists (
    select 1
    from public.departments department
    where department.workspace_id = target_workspace_id
      and department.archived_at is null
      and department.system_key is null
  ) then
    raise exception 'at least one department of your own is required to complete owner onboarding' using errcode = '23514';
  end if;

  if mark_complete and not exists (
    select 1
    from public.jobs job
    left join public.departments department on department.id = job.department_id
    where job.workspace_id = target_workspace_id
      and job.archived_at is null
      and department.system_key is distinct from 'management'
  ) then
    raise exception 'at least one job outside Management is required to complete owner onboarding' using errcode = '23514';
  end if;

  completed_timestamp := now();

  update public.workspaces
  set name = btrim(workspace_name), updated_at = completed_timestamp
  where id = target_workspace_id;

  update public.workspace_onboarding
  set
    status = case
      when mark_complete then 'complete'::public.onboarding_status
      else 'incomplete'::public.onboarding_status
    end,
    current_step = next_step,
    completed_at = case when mark_complete then completed_timestamp else null end,
    revision = revision + 1,
    updated_by = actor_user_id,
    updated_at = completed_timestamp
  where workspace_id = target_workspace_id;

  -- No names sent and none on file: the first step has not been answered.
  if not names_given and not exists (
    select 1
    from public.employee_profiles employee
    join public.employee_private_profiles private_profile
      on private_profile.employee_id = employee.id
    where employee.workspace_id = target_workspace_id
      and employee.user_id = actor_user_id
      and employee.archived_at is null
  ) then
    raise exception 'the owner''s legal name is required' using errcode = '23514';
  end if;

  -- The owner is a member from the first step, so their record exists from the
  -- first step too. Waiting for completion meant the team list did not contain
  -- the one person who was certainly on the team.
  owner_employee_id := app_private.ensure_owner_employee_profile(
    target_workspace_id,
    actor_user_id,
    owner_first_name,
    owner_middle_name,
    owner_last_name
  );

  if names_given then
    perform app_private.write_owner_legal_name(
      target_workspace_id, owner_employee_id,
      owner_first_name, owner_middle_name, owner_last_name
    );
  end if;

  -- Management, Owner and Manager exist from the first save, so the setup steps
  -- and Settings show them; nothing under Management counts as the owner's own
  -- department and job (K2).
  perform app_private.ensure_management_and_owner(target_workspace_id);

  -- Locations come into existence during setup, so this runs on every save and
  -- picks up whatever was added since the last one.
  perform app_private.open_owner_record_to_everything(
    target_workspace_id,
    owner_employee_id,
    actor_user_id
  );

  if mark_complete then

    insert into public.workspace_entitlements (
      workspace_id,
      status,
      trial_started_at,
      trial_ends_at,
      current_period_started_at,
      current_period_ends_at,
      billing_owner_user_id,
      provider,
      created_at,
      updated_at
    ) values (
      target_workspace_id,
      'trialing'::public.workspace_entitlement_status,
      completed_timestamp,
      completed_timestamp + interval '14 days',
      completed_timestamp,
      completed_timestamp + interval '14 days',
      actor_user_id,
      'internal'::public.workspace_entitlement_provider,
      completed_timestamp,
      completed_timestamp
    )
    on conflict (workspace_id) do nothing;
  end if;

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    target_workspace_id,
    actor_user_id,
    case when mark_complete then 'workspace.onboarding_completed' else 'workspace.onboarding_saved' end,
    'workspace',
    target_workspace_id::text,
    jsonb_build_object(
      'step', next_step,
      'previous_revision', current_revision,
      'revision', current_revision + 1
    )
  );
end;
$$;

CREATE OR REPLACE FUNCTION "app_private"."important_date_close_shifts"("actor" "uuid", "item" "public"."important_dates", "impact" "jsonb", "keep" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  s jsonb;
  opened jsonb := coalesce((select jsonb_agg(x) from jsonb_array_elements(impact -> 'shifts') x
                            where not (x ->> 'id')::uuid = any (coalesce(keep, '{}'))), '[]'::jsonb);
  drafts uuid[] := array(select value::uuid from jsonb_array_elements_text(impact -> 'draft_shift_ids'));
  places uuid[];
  other record;
begin
  places := array(
    select distinct (x ->> 'location_id')::uuid from jsonb_array_elements(opened) x
    union select draft_shift.location_id from public.schedule_draft_shifts draft_shift where draft_shift.id = any (drafts)
    union select edit_shift.location_id from public.schedule_edit_session_shifts edit_shift
          where edit_shift.workspace_id = item.workspace_id and edit_shift.id = any (drafts));
  if cardinality(places) = 0 then
    return '[]'::jsonb;
  end if;
  perform app_private.authorize(actor, item.workspace_id, 'schedule.edit', target_locations => places);

  for s in select x from jsonb_array_elements(opened) x loop
    insert into public.important_date_shift_releases (workspace_id, important_date_id, published_shift_id, source_shift_id,
      before_assignment, actor_user_id)
    values (item.workspace_id, item.id, (s ->> 'id')::uuid, (s ->> 'source_id')::uuid, s, actor);
    update public.schedule_published_shifts set employee_id = null
    where workspace_id = item.workspace_id and id = (s ->> 'id')::uuid and employee_id = (s ->> 'employee_id')::uuid;
    if not found then
      raise exception 'A shift on this closed day changed. Review the shifts again.'
        using errcode = 'PT409', hint = 'important_date.closure_changed';
    end if;
  end loop;

  with dropped as (
    update public.schedule_draft_shifts draft_shift
    set employee_id = null, revision = draft_shift.revision + 1, updated_at = now()
    where draft_shift.id = any (drafts)
      and (draft_shift.location_id, draft_shift.scheduled_date) in (
        select (day ->> 'location_id')::uuid, (day ->> 'closed_date')::date from jsonb_array_elements(impact -> 'days') day)
    returning draft_shift.draft_id
  )
  update public.schedule_drafts set revision = revision + 1, updated_at = now()
  where id in (select draft_id from dropped);

  -- BL-545: the same shift in an open edit drops too; the edit's revision moves
  -- so the open screen reloads it (as shift_exchange_rebase_drafts does).
  with dropped_edit as (
    update public.schedule_edit_session_shifts edit_shift
    set employee_id = null, revision = edit_shift.revision + 1, updated_at = now()
    where edit_shift.workspace_id = item.workspace_id and edit_shift.id = any (drafts)
      and edit_shift.employee_id is not null and edit_shift.source_published_shift_id is null
      and edit_shift.pending_op_type is distinct from 'delete'
      and (edit_shift.location_id, edit_shift.scheduled_date) in (
        select (day ->> 'location_id')::uuid, (day ->> 'closed_date')::date from jsonb_array_elements(impact -> 'days') day)
      and exists (select 1 from public.schedule_edit_sessions edit where edit.id = edit_shift.session_id and edit.status = 'active')
    returning edit_shift.session_id
  )
  update public.schedule_edit_sessions set revision = revision + 1
  where id in (select session_id from dropped_edit);
  -- DB-1c: Undo does not take the closed day back.
  perform app_private.schedule_edit_undo_barrier();

  if jsonb_array_length(opened) > 0 then
    perform public.shift_exchange_reconcile_batch(actor, item.workspace_id,
      (select jsonb_agg(x || jsonb_build_object('new_employee_id', null)) from jsonb_array_elements(opened) x));
    -- ponytail: the same steps approved time off takes (time_off_release_shifts).
    for other in
      select c.id from public.shift_exchange_cases c
      where c.workspace_id = item.workspace_id and c.status = 'open'
        and exists (select 1 from jsonb_array_elements(opened) x
                    where (x ->> 'source_id')::uuid in (c.offered_source_id, c.requested_source_id))
    loop
      update public.shift_exchange_cases set status = 'invalidated', revision = revision + 1, updated_at = now() where id = other.id;
      update public.shift_exchange_applications set status = 'invalidated', updated_at = now()
      where case_id = other.id and status in ('invited', 'pending_manager');
      perform public.shift_exchange_emit(actor, item.workspace_id, other.id, null, 'invalidated',
        'An involved assignment was opened by a closed day. Review the current schedule.');
    end loop;
    perform realtime.send(jsonb_build_object('workspace_id', item.workspace_id, 'important_date_id', item.id),
      'changed', 'shift-exchanges:' || item.workspace_id::text, true);
  end if;
  return opened;
end;
$$;

CREATE OR REPLACE FUNCTION "app_private"."time_off_finalize"("w" "uuid", "rid" "uuid", "verdict" "text", "actor" "uuid", "note" "text", "alone" boolean, "expired" boolean DEFAULT false) RETURNS "public"."schedule_time_off_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  r public.schedule_time_off_requests%rowtype;
  parent public.schedule_time_off_requests%rowtype;
  decided jsonb;
  released jsonb := '[]';
  given tstzmultirange;
  remaining tstzmultirange;
begin
  select * into r from public.schedule_time_off_requests where id = rid and workspace_id = w for update;
  -- Whoever got here first closed it (a withdrawal, a last vote, the job).
  if r.status <> 'pending' then
    raise exception 'This request is already closed' using errcode = 'PT409';
  end if;
  if verdict = 'approve' and r.request_type = 'time_off_cancellation' then
    select p.* into parent from public.time_off_cancellation_links cl
    join public.schedule_time_off_requests p on p.id = cl.parent_request_id and p.workspace_id = cl.workspace_id
    where cl.request_id = rid and cl.workspace_id = w for update of p;
    if parent.status <> 'approved' then
      raise exception 'The time off this cancellation is about has changed; refresh' using errcode = 'PT409';
    end if;
  end if;
  update public.schedule_time_off_segments
  set status = case verdict when 'approve' then 'approved' else 'denied' end::public.time_off_segment_status
  where request_id = rid and workspace_id = w;
  update public.schedule_time_off_requests
  set status = case verdict when 'approve' then 'approved' else 'denied' end::public.time_off_request_status,
      revision = revision + 1, updated_at = now()
  where id = rid returning * into r;
  select coalesce(jsonb_agg(jsonb_build_object('segment_id', s.id, 'status', s.status) order by s.starts_at, s.id), '[]') into decided
  from public.schedule_time_off_segments s where s.request_id = rid and s.workspace_id = w;
  if verdict = 'approve' and r.request_type = 'time_off' then
    -- The job settles it with no actor; the records name an approval that still counts.
    released := app_private.time_off_release_shifts(w, rid, actor, r.revision, case when actor is null then
      (select (x ->> 'approved_by')::uuid from jsonb_array_elements(app_private.time_off_state(w, rid) -> 'locations') x
       where x -> 'approved_by' <> 'null'::jsonb order by x ->> 'approved_at' desc limit 1) end);
  end if;
  insert into public.schedule_time_off_events(workspace_id, request_id, action, actor_user_id, note, metadata)
  values (w, rid, case when expired then 'expired' else r.status::text end, actor, coalesce(note, ''),
    jsonb_build_object('revision', r.revision, 'alone', alone, 'segments', decided, 'released_assignments', released));

  if verdict = 'approve' and r.request_type = 'time_off_cancellation' then
    select coalesce(range_agg(public.time_off_period_span(s.id)), '{}') into given
    from public.schedule_time_off_segments s where s.request_id = rid and s.workspace_id = w;
    select coalesce(range_agg(p.span), '{}') into remaining
    from public.schedule_time_off_segments s cross join lateral unnest(public.time_off_effective_ranges(s.id)) p(span)
    where s.request_id = parent.id and s.workspace_id = w;
    update public.schedule_time_off_requests
    set status = case when isempty(remaining) then 'revoked'::public.time_off_request_status else status end,
        revision = revision + 1, updated_at = now()
    where id = parent.id returning * into parent;
    insert into public.schedule_time_off_events(workspace_id, request_id, action, actor_user_id, note, metadata)
    values (w, parent.id, case when isempty(remaining) then 'revoked' else parent.status::text end, actor,
      'Cancellation approved. Shifts opened earlier stay open.',
      jsonb_build_object('revision', parent.revision, 'cancellation_request_id', rid, 'cancelled_intervals', public.availability_ranges_json(given)));
  end if;
  return r;
end;
$$;

CREATE OR REPLACE FUNCTION "app_private"."time_off_release_shifts"("w" "uuid", "rid" "uuid", "actor" "uuid", "decision" integer, "recorded_by" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  person uuid := (select r.employee_id from public.schedule_time_off_requests r where r.id = rid and r.workspace_id = w);
  -- The records need a person; the job (no actor) names an approval that counts.
  who uuid := coalesce(actor, recorded_by);
  s jsonb;
  changes jsonb := '[]';
  other record;
begin
  for s in select x from jsonb_array_elements(app_private.time_off_impact(w, rid) -> 'shifts') x loop
    insert into public.time_off_assignment_releases(workspace_id, request_id, decision_revision, published_shift_id, before_assignment, actor_user_id)
    values (w, rid, decision, (s ->> 'id')::uuid, s, who);
    update public.schedule_published_shifts set employee_id = null where workspace_id = w and id = (s ->> 'id')::uuid and employee_id = person;
    if not found then raise exception 'A published shift changed before it could be opened; try again' using errcode = 'PT409'; end if;
    changes := changes || jsonb_build_array(s || jsonb_build_object('new_employee_id', null));
  end loop;
  if jsonb_array_length(changes) > 0 then
    perform public.shift_exchange_reconcile_batch(who, w, changes);
    for other in select c.id from public.shift_exchange_cases c where c.workspace_id = w and c.status = 'open'
     and exists (select 1 from jsonb_array_elements(changes) x where (x ->> 'source_id')::uuid in (c.offered_source_id, c.requested_source_id)) loop
      update public.shift_exchange_cases set status = 'invalidated', revision = revision + 1, updated_at = now() where id = other.id;
      update public.shift_exchange_applications set status = 'invalidated', updated_at = now() where case_id = other.id and status in ('invited', 'pending_manager');
      perform public.shift_exchange_emit(who, w, other.id, null, 'invalidated', 'An involved assignment was released with approved time off. Review the current schedule.');
    end loop;
    perform realtime.send(jsonb_build_object('workspace_id', w, 'request_id', rid), 'changed', 'shift-exchanges:' || w::text, true);
    perform app_private.time_off_notify_shifts_opened(actor, w, rid, decision);
  end if;
  return changes;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."create_employee_command_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "command_id" "uuid", "employee_input" "jsonb", "invite_role_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  stored public.employee_create_commands%rowtype;
  invite public.employee_invitations%rowtype;
  fingerprint text;
  saved_id uuid;
  prepared_id uuid;
  secret_token text;
begin
  -- Asked where the record will work, retries included: a manager only where
  -- they manage, never nowhere.
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.create',
    array(select jsonb_array_elements_text(coalesce(employee_input -> 'location_ids', '[]'::jsonb)))::uuid[]);
  if command_id is null then
    raise exception 'command id required' using errcode = '22023';
  end if;
  fingerprint := encode(extensions.digest(jsonb_build_object('employee', employee_input, 'role', invite_role_id)::text, 'sha256'), 'hex');
  -- Serializes retries before creating anything, including concurrent requests.
  perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text || actor_user_id::text || command_id::text, 0));
  select * into stored from public.employee_create_commands c
    where c.workspace_id = target_workspace_id and c.actor_user_id = create_employee_command_service.actor_user_id
      and c.command_id = create_employee_command_service.command_id;
  if found then
    if stored.input_hash <> fingerprint then
      raise exception 'idempotency key belongs to different employee details' using errcode = 'PT409';
    end if;
    -- A retry hands the token out again: only while the role is still theirs to give.
    if invite_role_id is not null
      and not app_private.can_invite_with_role(actor_user_id, target_workspace_id, invite_role_id) then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.rank', detail = 'employee.invite';
    end if;
  else
    if coalesce(employee_input->>'invitation_email', '') <> ''
      and (employee_input->>'invitation_email') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      raise exception 'valid invitation email required' using errcode = '22023';
    end if;
    saved_id := public.save_employee_service(
      actor_user_id, target_workspace_id, null,
      employee_input->>'first_name',
      coalesce(employee_input->>'middle_name', ''),
      employee_input->>'last_name', '',
      employee_input->>'invitation_email', nullif(employee_input->>'start_date', '')::date,
      employee_input->>'internal_note',
      array(select jsonb_array_elements_text(employee_input->'location_ids'))::uuid[],
      (employee_input->>'primary_location_id')::uuid,
      array(select jsonb_array_elements_text(employee_input->'job_ids'))::uuid[],
      (employee_input->>'primary_job_id')::uuid,
      coalesce((employee_input->>'is_remote')::boolean, false),
      coalesce((employee_input->>'is_excluded_from_schedule')::boolean, false), null
    );
    if invite_role_id is not null then
      secret_token := encode(extensions.gen_random_bytes(32), 'hex');
      prepared_id := public.prepare_employee_invitation_service(
        actor_user_id, target_workspace_id, saved_id, lower(btrim(employee_input->>'invitation_email')),
        invite_role_id, encode(extensions.digest(secret_token, 'sha256'), 'hex'), now() + interval '7 days'
      );
    end if;
    insert into public.employee_create_commands
      (workspace_id, actor_user_id, command_id, input_hash, employee_id, invitation_id, invitation_token)
      values (target_workspace_id, actor_user_id, command_id, fingerprint, saved_id, prepared_id, secret_token)
      returning * into stored;
  end if;
  if stored.invitation_id is not null then
    select * into invite from public.employee_invitations where id = stored.invitation_id;
  end if;
  return jsonb_build_object(
    'id', stored.employee_id, 'invitation_id', stored.invitation_id,
    'token', case when invite.status = 'pending' and invite.expires_at > now() then stored.invitation_token else null end,
    'delivery_status', invite.delivery_status
  );
end;
$_$;

CREATE OR REPLACE FUNCTION "public"."decide_time_off_service"("actor" "uuid", "w" "uuid", "rid" "uuid", "verdict" "text", "note" "text", "expected_impact" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  r public.schedule_time_off_requests%rowtype;
  alone_why text;
  mine uuid[];
  pictured jsonb;
  state jsonb;
  settled public.schedule_time_off_requests%rowtype;
begin
  perform public.availability_lock_workspace(w);
  select * into r from public.schedule_time_off_requests where id = rid and workspace_id = w for update;
  if r.id is null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'time_off.decide';
  end if;
  alone_why := app_private.time_off_reason(actor, w, 'time_off.decide_alone', r.employee_id);
  if alone_why is not null then
    if alone_why not in ('rank', 'out_of_scope') then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || alone_why, detail = 'time_off.decide';
    end if;
    select coalesce(array_agg(place order by place), '{}') into mine
    from unnest(app_private.time_off_live_locations(w, rid)) place
    where app_private.time_off_reason(actor, w, 'time_off.decide', r.employee_id, place) is null;
    if cardinality(mine) = 0 then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || alone_why, detail = 'time_off.decide';
    end if;
  end if;
  if verdict is null or verdict not in ('approve', 'deny') then raise exception 'Choose approve or deny' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(note, ''))) > 1000 then raise exception 'The note can be at most 1000 characters' using errcode = '22023'; end if;
  if r.status <> 'pending' then raise exception 'This request is already closed' using errcode = 'PT409'; end if;
  if r.decide_by is not null and r.decide_by <= now() then raise exception 'This request was not decided in time' using errcode = 'PT409'; end if;
  pictured := app_private.time_off_impact(w, rid);
  if expected_impact is distinct from pictured ->> 'fingerprint' then
    raise exception 'The shifts this time off affects have changed. Review them again' using errcode = 'PT409';
  end if;

  if alone_why is null then
    settled := app_private.time_off_finalize(w, rid, verdict, actor, btrim(coalesce(note, '')), true);
    return jsonb_build_object('status', settled.status, 'final', true, 'alone', true, 'remaining', 0,
      'revision', settled.revision, 'request_id', rid);
  end if;

  insert into public.time_off_votes(request_id, workspace_id, voter_user_id, verdict, note, impact)
  values (rid, w, actor, verdict, btrim(coalesce(note, '')),
    (select jsonb_object_agg(place, coalesce(pictured -> 'locations' -> place::text ->> 'fingerprint', app_private.time_off_shifts_fingerprint('[]')))
     from unnest(mine) place))
  on conflict (request_id, voter_user_id) do update
  set verdict = excluded.verdict, note = excluded.note, impact = excluded.impact, updated_at = now();

  if verdict = 'deny' then
    settled := app_private.time_off_finalize(w, rid, 'deny', actor, btrim(coalesce(note, '')), false);
    return jsonb_build_object('status', settled.status, 'final', true, 'alone', false, 'remaining', 0,
      'revision', settled.revision, 'request_id', rid);
  end if;
  state := app_private.time_off_state(w, rid);
  if (state ->> 'remaining')::integer = 0 and not (state ->> 'fallback')::boolean then
    settled := app_private.time_off_finalize(w, rid, 'approve', actor, btrim(coalesce(note, '')), false);
    return jsonb_build_object('status', settled.status, 'final', true, 'alone', false, 'remaining', 0,
      'revision', settled.revision, 'request_id', rid);
  end if;
  update public.schedule_time_off_requests set revision = revision + 1, updated_at = now() where id = rid returning * into r;
  return jsonb_build_object('status', r.status, 'final', false, 'alone', false, 'remaining', (state ->> 'remaining')::integer,
    'revision', r.revision, 'request_id', rid);
end;
$$;

CREATE OR REPLACE FUNCTION "public"."employee_request_action_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_request_id" "uuid", "target_kind" "text", "target_action" "text", "target_expected_revision" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare employee public.employee_profiles%rowtype; time_request public.schedule_time_off_requests%rowtype;
begin
  perform public.availability_lock_workspace(target_workspace_id);
employee:=public.employee_hub_actor_service(actor_user_id,target_workspace_id);
  if target_kind='time_off' and target_action='cancel' then
    select * into time_request from public.schedule_time_off_requests where id=target_request_id and workspace_id=target_workspace_id and employee_id=employee.id for update;
    if time_request.id is null then raise exception 'time off request not found' using errcode='P0002'; end if;
    if time_request.revision<>target_expected_revision or time_request.status<>'pending' then raise exception 'stale time off request' using errcode = 'PT409'; end if;
    update public.schedule_time_off_requests set status='revoked',revision=revision+1,updated_at=now() where id=time_request.id returning * into time_request;
    insert into public.schedule_time_off_events(workspace_id,request_id,action,actor_user_id,note) values(target_workspace_id,time_request.id,'revoked',actor_user_id,'Cancelled by employee');
    return jsonb_build_object('status','cancelled','request_id',time_request.id,'revision',time_request.revision);
  end if;
  raise exception 'unsupported employee request action' using errcode='22023';
end; $$;

CREATE OR REPLACE FUNCTION "public"."leave_employee_onboarding_service"("target_user_id" "uuid", "expected_revision" integer, "target_workspace_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  target_case public.employee_onboarding_cases%rowtype;
  target_membership public.workspace_memberships%rowtype;
begin
  perform app_private.authorize(target_user_id, app_private.onboarding_self_workspace(target_user_id, target_workspace_id, true), 'onboarding.self');

  select onboarding.* into target_case
  from public.employee_onboarding_cases onboarding
  where onboarding.id = app_private.employee_onboarding_case_id(target_user_id, target_workspace_id)
  for update;

  if target_case.id is null then
    raise exception 'onboarding unavailable' using errcode = 'P0002';
  end if;
  if target_case.revision <> expected_revision then
    raise exception 'onboarding changed; refresh required' using errcode = 'PT409';
  end if;

  select membership.* into target_membership
  from public.workspace_memberships membership
  where membership.id = target_case.membership_id
    and membership.workspace_id = target_case.workspace_id
    and membership.user_id = target_user_id
  for update;

  if target_membership.id is null then
    raise exception 'workspace membership unavailable' using errcode = 'P0002';
  end if;
  if target_membership.status = 'active'::public.membership_status then
    raise exception 'active employees cannot leave onboarding' using errcode = '23514';
  end if;
  if target_membership.status <> 'pending_activation'::public.membership_status then
    raise exception 'pending onboarding membership required' using errcode = '23514';
  end if;
  if target_case.status = 'approved'::public.employee_onboarding_case_status then
    raise exception 'approved onboarding cannot be cancelled' using errcode = '22023';
  end if;

  perform set_config('app.workspace_closure', 'on', true);

  update public.workspace_memberships
  set status = 'suspended'::public.membership_status,
      updated_at = now()
  where id = target_membership.id
    and workspace_id = target_case.workspace_id;

  update public.employee_onboarding_cases
  set status = 'cancelled'::public.employee_onboarding_case_status,
      revision = revision + 1,
      updated_at = now()
  where id = target_case.id
  returning * into target_case;

  insert into public.onboarding_events (
    workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id
  ) values (
    target_case.workspace_id, target_case.employee_id, target_case.id, target_user_id,
    'onboarding.left', 'onboarding_case', target_case.id::text
  );

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    target_case.workspace_id, target_user_id, 'employee_onboarding.left',
    'workspace_membership', target_membership.id::text,
    jsonb_build_object('employee_id', target_case.employee_id, 'case_id', target_case.id)
  );

  return jsonb_build_object(
    'status', 'left',
    'workspace_id', target_case.workspace_id,
    'employee_id', target_case.employee_id,
    'membership_id', target_membership.id,
    'revision', target_case.revision
  );
end;
$$;

CREATE OR REPLACE FUNCTION "public"."publish_announcement_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_announcement_id" "uuid", "target_expected_revision" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  item public.announcements;
  reached uuid[];
  told uuid[];
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'announcement.read');
  perform app_private.announcement_release(target_workspace_id);
  select * into item from public.announcements
  where id = target_announcement_id and workspace_id = target_workspace_id for update;
  if item.id is null or not app_private.announcement_visible(actor_user_id, item) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'announcement.write';
  end if;
  perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'announcement',
    app_private.announcement_places(item.id),
    item.created_by, app_private.announcement_places(item.id));
  if item.revision is distinct from target_expected_revision or item.archived_at is not null
     or item.status not in ('draft', 'scheduled', 'unpublished') then
    raise exception 'stale announcement revision' using errcode = 'PT409';
  end if;

  if item.expires_at is not null and item.expires_at <= now() then
    raise exception 'This announcement has expired' using errcode = '22023';
  end if;
  if item.publish_at is not null and item.publish_at > now() then
    update public.announcements
    set status = 'scheduled', release_failed_at = null, published_at = null, revision = revision + 1, updated_by = actor_user_id, updated_at = now()
    where id = item.id returning * into item;
    told := '{}';
  else
    reached := app_private.announcement_recipients(item);
    told := case when item.status = 'unpublished'
      then array(select who from unnest(reached) who where not exists (
        select 1 from public.announcement_acknowledgements a where a.announcement_id = item.id and a.user_id = who))
      else reached end;
    update public.announcements
    set status = 'published', published_at = now(), publish_at = coalesce(publish_at, now()),
        delivered_to = reached, revision = revision + 1, updated_by = actor_user_id, updated_at = now()
    where id = item.id returning * into item;
    perform app_private.announcement_deliver(item, told);
  end if;

  insert into public.audit_events (workspace_id, actor_user_id, action, target_type, target_id, metadata)
  values (target_workspace_id, actor_user_id, 'announcement.published', 'announcement', item.id::text,
    jsonb_build_object('status', item.status, 'recipient_count', cardinality(told)));
  return jsonb_build_object('status', item.status, 'announcement_id', item.id, 'revision', item.revision,
    'recipient_count', cardinality(told), 'notification_enqueued_count', cardinality(told));
end;
$$;

CREATE OR REPLACE FUNCTION "public"."request_time_off_cancellation_service"("actor" "uuid", "w" "uuid", "parent_id" "uuid", "expected_revision" integer, "periods" "jsonb", "reason" "text", "operation_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  employee public.employee_profiles%rowtype;
  parent public.schedule_time_off_requests%rowtype;
  original public.schedule_time_off_segments%rowtype;
  prior public.time_off_commands%rowtype;
  command jsonb;
  result jsonb;
  p jsonb;
  a timestamptz;
  b timestamptz;
  span tstzrange;
  covered tstzmultirange := '{}';
  rid uuid := gen_random_uuid();
  sid uuid;
begin
  perform public.availability_lock_workspace(w);
  perform app_private.time_off_authorize(actor, w, 'time_off.request_own');
  select r.* into parent from public.schedule_time_off_requests r
  join public.employee_profiles e on e.id = r.employee_id and e.workspace_id = r.workspace_id
  where r.id = parent_id and r.workspace_id = w and e.user_id = actor and e.archived_at is null
  for update of r;
  if parent.id is null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'time_off.request_own';
  end if;
  if operation_id is null then raise exception 'A cancellation request key is required' using errcode = '22023'; end if;
  command := jsonb_build_object('kind', 'cancellation', 'parent', parent_id, 'revision', expected_revision, 'reason', btrim(coalesce(reason, '')), 'periods', periods);
  select * into prior from public.time_off_commands c where c.workspace_id = w and c.actor_user_id = actor and c.operation_id = request_time_off_cancellation_service.operation_id;
  if found then
    if prior.input <> command then raise exception 'This request key was used for a different cancellation' using errcode = 'PT409'; end if;
    return prior.result;
  end if;
  if expected_revision is null or parent.revision <> expected_revision or parent.request_type <> 'time_off' or parent.status <> 'approved' then
    raise exception 'stale approved leave; refresh before requesting cancellation' using errcode = 'PT409'; end if;
  if exists (select 1 from public.time_off_cancellation_links cl join public.schedule_time_off_requests cr on cr.id = cl.request_id
    where cl.parent_request_id = parent.id and cr.status = 'pending') then
    raise exception 'A cancellation request is already pending for this leave' using errcode = '23514'; end if;
  if jsonb_typeof(periods) is distinct from 'array' then raise exception 'Choose approved hours to cancel' using errcode = '22023'; end if;
  if jsonb_array_length(periods) not between 1 and 124 or char_length(btrim(coalesce(reason, ''))) > 1000 then
    raise exception 'Choose up to 124 periods and a note of at most 1000 characters' using errcode = '22023'; end if;

  insert into public.schedule_time_off_requests(id, workspace_id, employee_id, request_type, reason, created_by)
  values (rid, w, parent.employee_id, 'time_off_cancellation', btrim(coalesce(reason, '')), actor);
  insert into public.time_off_cancellation_links values (rid, w, parent.id, parent.revision);
  for p in select value from jsonb_array_elements(periods) loop
    select * into original from public.schedule_time_off_segments where id = (p ->> 'segment_id')::uuid and workspace_id = w and request_id = parent.id;
    if original.id is null then raise exception 'Choose an approved period from this leave' using errcode = '22023'; end if;
    if coalesce(p ->> 'starts_at', '') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' or coalesce(p ->> 'ends_at', '') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then
      raise exception 'Cancellation needs exact start and end instants' using errcode = '22023'; end if;
    a := (p ->> 'starts_at')::timestamptz; b := (p ->> 'ends_at')::timestamptz;
    if not isfinite(a) or not isfinite(b) or a >= b or a <= now() then raise exception 'Only future approved hours can be cancelled' using errcode = '22023'; end if;
    span := tstzrange(a, b, '[)');
    if not (public.time_off_effective_ranges(original.id) @> span) or covered && span then
      raise exception 'Cancellation must select approved hours without overlap' using errcode = '22023'; end if;
    covered := covered + tstzmultirange(span);
    sid := gen_random_uuid();
    insert into public.schedule_time_off_segments(id, workspace_id, request_id, segment_date, start_time, end_time, time_timezone, starts_at, ends_at, ends_next_day)
    values (sid, w, rid, (a at time zone original.time_timezone)::date, (a at time zone original.time_timezone)::time, (b at time zone original.time_timezone)::time,
      original.time_timezone, a, b, (b at time zone original.time_timezone)::date > (a at time zone original.time_timezone)::date);
    insert into public.time_off_cancellation_periods values (sid, w, rid, original.id, parent.id);
  end loop;
  update public.schedule_time_off_requests set decide_by = app_private.time_off_decide_by(w, lower(range_merge(covered))) where id = rid;
  insert into public.time_off_required_locations(request_id, workspace_id, location_id)
  select rid, w, place from unnest(app_private.time_off_deciding_locations(w, parent.employee_id)) place;
  insert into public.schedule_time_off_events(workspace_id, request_id, action, actor_user_id, note, metadata)
  values (w, rid, 'submitted', actor, btrim(coalesce(reason, '')),
    jsonb_build_object('parent_request_id', parent.id, 'parent_revision', parent.revision, 'operation_id', request_time_off_cancellation_service.operation_id));
  -- Sent straight to an admin and the owner (nobody can vote somewhere): that was their one notice.
  update public.schedule_time_off_requests set fallback_notified_at = now()
  where id = rid and exists (select 1 from (select app_private.time_off_state(w, rid) s) x
    where (x.s ->> 'fallback')::boolean or (x.s ->> 'unattended')::integer > 0);
  if public.time_off_is_the_owners_own(actor, w, rid) then
    perform app_private.time_off_finalize(w, rid, 'approve', actor, '', true);
  end if;
  select jsonb_build_object('status', r.status, 'request_id', r.id, 'revision', r.revision, 'decide_by', r.decide_by) into result
  from public.schedule_time_off_requests r where r.id = rid;
  insert into public.time_off_commands(workspace_id, actor_user_id, operation_id, input, result)
  values (w, actor, request_time_off_cancellation_service.operation_id, command, result);
  return result;
end;
$_$;

CREATE OR REPLACE FUNCTION "public"."review_employee_onboarding_before_availability_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_employee_id" "uuid", "review_action" "text", "target_requirement_id" "uuid", "review_reason" "text", "expected_revision" integer, "production_ready" boolean) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  target_case public.employee_onboarding_cases%rowtype;
  requirement public.employee_onboarding_requirements%rowtype;
  private_profile public.employee_private_profiles%rowtype;
  target_employee_user_id uuid;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'onboarding.review', target_person => target_employee_id);

  select onboarding.* into target_case
  from public.employee_onboarding_cases onboarding
  where onboarding.workspace_id = target_workspace_id
    and onboarding.employee_id = target_employee_id
  for update of onboarding;
  if target_case.id is null or target_case.revision <> expected_revision then raise exception 'onboarding changed; refresh required' using errcode = 'PT409'; end if;
  select employee.user_id into target_employee_user_id
  from public.employee_profiles employee
  where employee.id = target_employee_id
    and employee.workspace_id = target_workspace_id;
  if review_action in ('accept_requirement', 'reject_requirement') then
    select * into requirement from public.employee_onboarding_requirements
    where id = target_requirement_id and case_id = target_case.id for update;
    if requirement.id is null or not requirement.requires_review then raise exception 'reviewable requirement unavailable' using errcode = 'P0002'; end if;
    if requirement.kind = 'document'::public.employee_onboarding_requirement_kind then
      perform app_private.authorize(actor_user_id, target_workspace_id, 'documents.review', target_person => target_employee_id);
    end if;
    -- A legal name is approved by an owner or an admin only (FB-6.6 S1).
    if requirement.kind = 'profile'::public.employee_onboarding_requirement_kind then
      perform app_private.authorize(actor_user_id, target_workspace_id, 'onboarding.legal_name', target_person => target_employee_id);
    end if;
    if review_action = 'reject_requirement' and char_length(btrim(coalesce(review_reason, ''))) not between 1 and 500 then
      raise exception 'specific correction reason required' using errcode = '22023';
    end if;
    update public.employee_onboarding_requirements set
      status = case
        when review_action = 'accept_requirement' then 'completed'::public.employee_onboarding_requirement_status
        else 'rejected'::public.employee_onboarding_requirement_status
      end,
      rejection_reason = case when review_action = 'reject_requirement' then btrim(review_reason) else null end,
      reviewed_by = actor_user_id,
      reviewed_at = now(),
      completed_at = case when review_action = 'accept_requirement' then now() else null end,
      updated_at = now()
    where id = requirement.id;
    if requirement.kind = 'document'::public.employee_onboarding_requirement_kind then
      update public.employee_documents set
        review_status = case
          when review_action = 'accept_requirement' then 'accepted'::public.employee_document_review_status
          else 'rejected'::public.employee_document_review_status
        end,
        rejection_reason = case when review_action = 'reject_requirement' then btrim(review_reason) else null end,
        reviewed_by = actor_user_id, reviewed_at = now()
      where requirement_id = requirement.id and review_status = 'awaiting_review'::public.employee_document_review_status;
    end if;
    if requirement.kind = 'profile'::public.employee_onboarding_requirement_kind and review_action = 'accept_requirement' then
      select * into private_profile
      from public.employee_private_profiles
      where employee_id = target_employee_id;
      if private_profile.employee_id is null then
        raise exception 'private profile unavailable' using errcode = 'P0002';
      end if;
      update public.employee_profiles set
        first_name = private_profile.legal_first_name,
        last_name = private_profile.legal_last_name,
        revision = revision + 1,
        updated_at = now()
      where id = target_employee_id;
      insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
      values (target_workspace_id, target_employee_id, actor_user_id,
        'employee.legal_name_approved', 'Employee legal name change approved from onboarding');
    end if;
    if review_action = 'reject_requirement' then
      update public.employee_onboarding_cases set status = 'changes_requested'::public.employee_onboarding_case_status, revision = revision + 1,
        updated_at = now() where id = target_case.id returning revision into expected_revision;
    else
      update public.employee_onboarding_cases set revision = revision + 1, updated_at = now()
      where id = target_case.id returning revision into expected_revision;
      if target_case.status = 'submitted'::public.employee_onboarding_case_status
        and not public.employee_onboarding_final_approval_required(target_workspace_id)
        and not exists (
          select 1
          from public.employee_onboarding_requirements
          where case_id = target_case.id
            and required
            and blocks_activation
            and status <> 'completed'::public.employee_onboarding_requirement_status
        ) then
        expected_revision := app_private.activate_employee_onboarding_case(
          target_case.id,
          actor_user_id,
          'employee.auto_activated_after_review'
        );
      end if;
    end if;
  elsif review_action = 'activate' then
    if target_case.status <> 'submitted'::public.employee_onboarding_case_status then raise exception 'submitted onboarding required' using errcode = '23514'; end if;
    if not production_ready then raise exception 'sensitive infrastructure readiness required' using errcode = '55000'; end if;
    if exists (select 1 from public.employee_onboarding_requirements
      where case_id = target_case.id and required and blocks_activation and status <> 'completed'::public.employee_onboarding_requirement_status) then
      raise exception 'activation-blocking requirements remain' using errcode = '23514';
    end if;
    expected_revision := app_private.activate_employee_onboarding_case(
      target_case.id,
      actor_user_id,
      'employee.activated'
    );
  else
    raise exception 'unsupported onboarding review action' using errcode = '22023';
  end if;
  insert into public.onboarding_events (workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id, metadata)
  values (target_workspace_id, target_employee_id, target_case.id, actor_user_id,
    'onboarding.' || review_action, 'onboarding_case', target_case.id::text,
    jsonb_build_object('requirement_id', target_requirement_id, 'reason_present', nullif(btrim(coalesce(review_reason, '')), '') is not null));
  return expected_revision;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."revoke_time_off_service"("actor" "uuid", "w" "uuid", "rid" "uuid", "expected_revision" integer, "reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  r public.schedule_time_off_requests%rowtype;
  said text := btrim(coalesce(reason, ''));
  taken tstzmultirange;
  ahead tstzmultirange;
  cut_id uuid;
  sid uuid;
  seg record;
  other record;
begin
  perform public.availability_lock_workspace(w);
  select * into r from public.schedule_time_off_requests where id = rid and workspace_id = w and request_type = 'time_off' for update;
  if r.id is null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'time_off.revoke';
  end if;
  perform app_private.time_off_authorize(actor, w, 'time_off.revoke', r.employee_id);
  if said = '' or char_length(said) > 1000 then raise exception 'Say why the time off is revoked (at most 1000 characters)' using errcode = '22023'; end if;
  if expected_revision is null or r.revision <> expected_revision or r.status <> 'approved' then
    raise exception 'This time off changed; refresh before revoking it' using errcode = 'PT409'; end if;

  select coalesce(range_agg(s.span), '{}') into taken
  from (select unnest(public.time_off_effective_ranges(x.id)) * tstzrange(null, now(), '[)') span
        from public.schedule_time_off_segments x where x.request_id = rid and x.workspace_id = w) s
  where not isempty(s.span);
  select coalesce(range_agg(s.span), '{}') into ahead
  from (select unnest(public.time_off_effective_ranges(x.id)) * tstzrange(now(), null, '[)') span
        from public.schedule_time_off_segments x where x.request_id = rid and x.workspace_id = w) s
  where not isempty(s.span);
  if isempty(ahead) then
    raise exception 'Nothing of this time off is left to revoke' using errcode = '22023';
  end if;

  if not isempty(taken) then
    -- Already under way: the hours from now on are given back by a
    -- cancellation the revoke settles itself; the time off stays approved.
    cut_id := gen_random_uuid();
    insert into public.schedule_time_off_requests(id, workspace_id, employee_id, request_type, reason, created_by)
    values (cut_id, w, r.employee_id, 'time_off_cancellation', said, actor);
    insert into public.time_off_cancellation_links values (cut_id, w, r.id, r.revision);
    for seg in select s.id, s.time_timezone, p.piece from public.schedule_time_off_segments s
      cross join lateral unnest(public.time_off_effective_ranges(s.id) * tstzmultirange(tstzrange(now(), null, '[)'))) p(piece)
      where s.request_id = rid and s.workspace_id = w order by lower(p.piece) loop
      sid := gen_random_uuid();
      insert into public.schedule_time_off_segments(id, workspace_id, request_id, segment_date, start_time, end_time, time_timezone, starts_at, ends_at, ends_next_day)
      values (sid, w, cut_id, (lower(seg.piece) at time zone seg.time_timezone)::date, (lower(seg.piece) at time zone seg.time_timezone)::time,
        (upper(seg.piece) at time zone seg.time_timezone)::time, seg.time_timezone, lower(seg.piece), upper(seg.piece),
        (upper(seg.piece) at time zone seg.time_timezone)::date > (lower(seg.piece) at time zone seg.time_timezone)::date);
      insert into public.time_off_cancellation_periods values (sid, w, cut_id, seg.id, r.id);
    end loop;
    insert into public.schedule_time_off_events(workspace_id, request_id, action, actor_user_id, note, metadata)
    values (w, cut_id, 'submitted', actor, said, jsonb_build_object('parent_request_id', r.id, 'parent_revision', r.revision, 'shortened', true, 'source', 'revoke'));
    update public.schedule_time_off_segments set status = 'approved' where request_id = cut_id and workspace_id = w;
    update public.schedule_time_off_requests set status = 'approved', revision = revision + 1, updated_at = now() where id = cut_id;
    insert into public.schedule_time_off_events(workspace_id, request_id, action, actor_user_id, note, metadata)
    values (w, cut_id, 'approved', actor, said, jsonb_build_object('shortened', true, 'source', 'revoke'));
  end if;

  update public.schedule_time_off_requests
  set status = case when isempty(taken) then 'revoked'::public.time_off_request_status else status end,
      revision = revision + 1, updated_at = now()
  where id = rid returning * into r;
  insert into public.schedule_time_off_events(workspace_id, request_id, action, actor_user_id, note, metadata)
  values (w, rid, 'revoked', actor, said,
    jsonb_build_object('revision', r.revision) || case when isempty(taken) then '{}'::jsonb
      else jsonb_build_object('taken_until', now(), 'cancellation_request_id', cut_id) end);

  for other in select cr.id from public.time_off_cancellation_links cl join public.schedule_time_off_requests cr on cr.id = cl.request_id
    where cl.parent_request_id = rid and cl.workspace_id = w and cr.status = 'pending' for update of cr loop
    update public.schedule_time_off_requests set status = 'revoked', revision = revision + 1, updated_at = now() where id = other.id;
    insert into public.schedule_time_off_events(workspace_id, request_id, action, actor_user_id, note, metadata)
    values (w, other.id, 'revoked', actor, 'Closed because the time off was revoked.', jsonb_build_object('parent_request_id', rid));
  end loop;
  return jsonb_build_object('status', r.status, 'request_id', r.id, 'revision', r.revision);
end;
$$;

CREATE OR REPLACE FUNCTION "public"."save_announcement_audience_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_announcement_id" "uuid", "target_expected_revision" integer, "target_title" "text", "target_body" "text", "target_category" "text", "target_audience_roles" "text"[], "target_location_ids" "uuid"[], "target_publish_at" timestamp with time zone, "target_expires_at" timestamp with time zone, "target_action_url" "text", "target_department_ids" "uuid"[], "target_job_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  item public.announcements;
  before public.announcements;
  stored uuid[];
  content_changed boolean := false;
  reached uuid[];
  dropped uuid[];
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'announcement.read');
  target_location_ids := array(select distinct id from unnest(coalesce(target_location_ids, '{}')) id order by id);
  if target_announcement_id is null then
    perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'announcement', target_location_ids, actor_user_id);
  else
    perform app_private.announcement_release(target_workspace_id);
    select * into before from public.announcements
    where id = target_announcement_id and workspace_id = target_workspace_id for update;
    if before.id is null or not app_private.announcement_visible(actor_user_id, before) then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'announcement.write';
    end if;
    stored := app_private.announcement_places(before.id);
    perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'announcement', stored, before.created_by, stored);
    perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'announcement', target_location_ids, before.created_by, stored);
    -- A record kept at an archived location never becomes the whole workspace
    -- by losing its locations (KK-86); the owner may still widen a live one (K1).
    if cardinality(target_location_ids) = 0
       and cardinality(stored) > cardinality(app_private.live_locations(target_workspace_id, stored)) then
      raise exception 'Choose at least one location' using errcode = '22023';
    end if;
  end if;

  target_department_ids := coalesce(target_department_ids, '{}');
  target_job_ids := coalesce(target_job_ids, '{}');
  if coalesce(cardinality(target_audience_roles), 0) = 0 then
    target_audience_roles := array['owner', 'admin', 'manager', 'employee'];
  end if;
  if cardinality(target_department_ids) > 100 or cardinality(target_job_ids) > 100 or cardinality(target_location_ids) > 100 then
    raise exception 'too many audience filters' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(target_department_ids) selected(id) where not exists (
       select 1 from public.departments d where d.id = selected.id and d.workspace_id = target_workspace_id and d.archived_at is null))
  or exists (select 1 from unnest(target_job_ids) selected(id) where not exists (
       select 1 from public.jobs j where j.id = selected.id and j.workspace_id = target_workspace_id and j.archived_at is null)) then
    raise exception 'active workspace department and job required' using errcode = '22023';
  end if;
  if char_length(btrim(target_title)) not between 1 and 120 or char_length(btrim(target_body)) not between 1 and 5000
     or target_category not in ('general', 'operations', 'schedule') then
    raise exception 'valid announcement content required' using errcode = '22023';
  end if;
  if cardinality(target_audience_roles) not between 1 and 4
     or exists (select 1 from unnest(target_audience_roles) role_name where role_name not in ('owner', 'admin', 'manager', 'employee')) then
    raise exception 'valid announcement audience required' using errcode = '22023';
  end if;
  if target_action_url is not null and (char_length(target_action_url) > 500 or target_action_url !~ '^/app(/|$)') then
    raise exception 'valid app action required' using errcode = '22023';
  end if;
  if target_expires_at is not null and target_publish_at is not null and target_expires_at <= target_publish_at then
    raise exception 'expiry must follow publication' using errcode = '22023';
  end if;

  if target_announcement_id is null then
    insert into public.announcements (workspace_id, title, body, category, audience_roles, publish_at, expires_at,
      action_url, department_ids, job_ids, created_by, updated_by)
    values (target_workspace_id, btrim(target_title), btrim(target_body), target_category::public.announcement_category,
      array(select distinct role_name::public.workspace_role from unnest(target_audience_roles) role_name),
      target_publish_at, target_expires_at, target_action_url,
      array(select distinct unnest(target_department_ids)), array(select distinct unnest(target_job_ids)),
      actor_user_id, actor_user_id)
    returning * into item;
  else
    if before.revision is distinct from target_expected_revision then
      raise exception 'stale announcement revision' using errcode = 'PT409';
    end if;
    if before.archived_at is not null then
      raise exception 'announcement can no longer be edited' using errcode = 'PT409';
    end if;
    content_changed := (before.title, before.body, before.category::text, before.action_url)
      is distinct from (btrim(target_title), btrim(target_body), target_category, target_action_url);
    update public.announcements
    set title = btrim(target_title), body = btrim(target_body), category = target_category::public.announcement_category,
        audience_roles = array(select distinct role_name::public.workspace_role from unnest(target_audience_roles) role_name),
        publish_at = target_publish_at, expires_at = target_expires_at, action_url = target_action_url,
        department_ids = array(select distinct unnest(target_department_ids)),
        job_ids = array(select distinct unnest(target_job_ids)),
        content_revision = content_revision + case when content_changed then 1 else 0 end,
        -- A scheduled one with its time taken away waits as a draft (P10).
        status = case when status = 'scheduled' and target_publish_at is null then 'draft' else status end,
        release_failed_at = null, release_error = null,
        revision = revision + 1, updated_by = actor_user_id, updated_at = now()
    where id = before.id
    returning * into item;
  end if;

  delete from public.announcement_locations where announcement_id = item.id;
  insert into public.announcement_locations (workspace_id, announcement_id, location_id)
  select target_workspace_id, item.id, id from unnest(target_location_ids) id;

  if content_changed then
    update public.announcements
    set acknowledged_before = array(select distinct who from unnest(acknowledged_before || array(
      select a.user_id from public.announcement_acknowledgements a where a.announcement_id = item.id)) who)
    where id = item.id returning * into item;
    delete from public.announcement_acknowledgements where announcement_id = item.id;
  end if;
  if item.status = 'published' then
    -- Past its end it reaches nobody (K12).
    reached := case when item.expires_at <= now() then '{}'::uuid[] else app_private.announcement_recipients(item) end;
    if content_changed then
      perform app_private.communication_withdraw(target_workspace_id, 'communications.announcement.available',
        'announcement', item.id::text, 'superseded');
      perform app_private.announcement_deliver(item, reached);
    else
      -- Those it no longer reaches lose it (BL-534); the new people are told.
      dropped := array(select who from unnest(item.delivered_to) who where not who = any (reached));
      if cardinality(dropped) > 0 then
        perform app_private.communication_withdraw(target_workspace_id, 'communications.announcement.available',
          'announcement', item.id::text, 'cancelled', dropped);
      end if;
      perform app_private.announcement_deliver(item,
        array(select who from unnest(reached) who where not who = any (item.delivered_to)));
    end if;
    update public.announcements set delivered_to = reached where id = item.id returning * into item;
  elsif content_changed then
    update public.announcements set delivered_to = '{}' where id = item.id returning * into item;
  end if;

  insert into public.audit_events (workspace_id, actor_user_id, action, target_type, target_id, metadata)
  values (target_workspace_id, actor_user_id,
    case when target_announcement_id is null then 'announcement.created' else 'announcement.updated' end,
    'announcement', item.id::text, jsonb_build_object('content_changed', content_changed));
  return jsonb_build_object('status', item.status, 'announcement_id', item.id, 'revision', item.revision,
    'recipient_count', cardinality(item.delivered_to));
end;
$_$;

CREATE OR REPLACE FUNCTION "public"."save_employee_onboarding_profile_service"("target_user_id" "uuid", "profile_payload" "jsonb", "expected_revision" integer, "target_workspace_id" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  target_case public.employee_onboarding_cases%rowtype;
  employee public.employee_profiles%rowtype;
  normalized_country_code text := nullif(upper(btrim(coalesce(profile_payload->>'country_code', ''))), '');
  normalized_birth_date text := nullif(btrim(coalesce(profile_payload->>'date_of_birth', '')), '');
  submitted_phone text := nullif(btrim(coalesce(profile_payload->>'phone', '')), '');
  emergency_email text := btrim(coalesce(profile_payload->>'emergency_contact_email', ''));
  account_phone text;
  legal_name_changed boolean;
  next_requirement_status public.employee_onboarding_requirement_status;
begin
 perform app_private.authorize(target_user_id, app_private.onboarding_self_workspace(target_user_id, target_workspace_id, true), 'onboarding.self');
  select onboarding.* into target_case from public.employee_onboarding_cases onboarding
  where onboarding.id = app_private.employee_onboarding_case_id(target_user_id, target_workspace_id)
  for update;
  if target_case.id is null then raise exception 'onboarding unavailable' using errcode = 'P0002'; end if;
  if target_case.revision <> expected_revision then raise exception 'onboarding changed; refresh required' using errcode = 'PT409'; end if;
  if target_case.status in ('submitted', 'approved', 'cancelled') then raise exception 'onboarding cannot be edited' using errcode = '22023'; end if;

  select * into employee
  from public.employee_profiles
  where id = target_case.employee_id
  for update;

  select profile.phone_e164 into account_phone
  from public.user_profiles profile
  where profile.user_id = target_user_id;

  if coalesce(profile_payload->>'legal_first_name', '') = ''
    or coalesce(profile_payload->>'legal_last_name', '') = ''
    or coalesce(account_phone, submitted_phone) is null
    or coalesce(profile_payload->>'emergency_contact_name', '') = ''
    or coalesce(profile_payload->>'emergency_contact_relationship', '') = ''
    or coalesce(profile_payload->>'emergency_contact_phone', '') = ''
    or (emergency_email <> '' and emergency_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
    or (normalized_country_code is not null and normalized_country_code !~ '^[A-Z]{2}$')
    or (normalized_birth_date is not null and normalized_birth_date !~ '^\d{4}-\d{2}-\d{2}$') then
    raise exception 'complete private profile required' using errcode = '22023';
  end if;

  -- The account is the phone's only source. An empty account takes the number
  -- typed here; a filled one keeps its own. The record copies the account.
  account_phone := app_private.adopt_account_phone(
    target_user_id, submitted_phone, btrim(employee.first_name || ' ' || employee.last_name)
  );

  legal_name_changed :=
    lower(btrim(profile_payload->>'legal_first_name')) is distinct from lower(btrim(employee.first_name))
    or lower(btrim(profile_payload->>'legal_last_name')) is distinct from lower(btrim(employee.last_name));
  next_requirement_status := case
    when legal_name_changed then 'awaiting_review'::public.employee_onboarding_requirement_status
    else 'completed'::public.employee_onboarding_requirement_status
  end;

  insert into public.employee_private_profiles (
    employee_id, workspace_id, legal_first_name, legal_middle_name, legal_last_name, preferred_name,
    phone, street_address, city, region, postal_code, country_code, date_of_birth,
    emergency_contact_name, emergency_contact_relationship, emergency_contact_phone,
    emergency_contact_email, share_phone_with_teammates, share_email_with_teammates
  ) values (
    target_case.employee_id, target_case.workspace_id,
    btrim(profile_payload->>'legal_first_name'),
    left(btrim(coalesce(profile_payload->>'legal_middle_name', '')), 80),
    btrim(profile_payload->>'legal_last_name'),
    left(btrim(coalesce(profile_payload->>'preferred_name', '')), 80),
    account_phone,
    nullif(btrim(coalesce(profile_payload->>'street_address', '')), ''),
    nullif(btrim(coalesce(profile_payload->>'city', '')), ''),
    nullif(btrim(coalesce(profile_payload->>'region', '')), ''),
    nullif(btrim(coalesce(profile_payload->>'postal_code', '')), ''),
    normalized_country_code,
    normalized_birth_date::date,
    btrim(profile_payload->>'emergency_contact_name'),
    btrim(profile_payload->>'emergency_contact_relationship'),
    btrim(profile_payload->>'emergency_contact_phone'),
    emergency_email,
    coalesce((profile_payload->>'share_phone_with_teammates')::boolean, false),
    coalesce((profile_payload->>'share_email_with_teammates')::boolean, false)
  ) on conflict (employee_id) do update set
    legal_first_name = excluded.legal_first_name,
    legal_middle_name = excluded.legal_middle_name,
    legal_last_name = excluded.legal_last_name,
    -- It was forced empty while the field was closed. The person answers it
    -- now, and leaving it blank is a valid answer.
    preferred_name = excluded.preferred_name,
    -- The account's number, same as the trigger writes; never the form's.
    phone = excluded.phone,
    street_address = excluded.street_address,
    city = excluded.city,
    region = excluded.region,
    postal_code = excluded.postal_code,
    country_code = excluded.country_code,
    date_of_birth = excluded.date_of_birth,
    emergency_contact_name = excluded.emergency_contact_name,
    emergency_contact_relationship = excluded.emergency_contact_relationship,
    emergency_contact_phone = excluded.emergency_contact_phone,
    emergency_contact_email = excluded.emergency_contact_email,
    share_phone_with_teammates = excluded.share_phone_with_teammates,
    share_email_with_teammates = excluded.share_email_with_teammates,
    updated_at = now();

  update public.employee_onboarding_requirements set
    status = next_requirement_status,
    requires_review = legal_name_changed,
    rejection_reason = null,
    reviewed_by = null,
    reviewed_at = null,
    completed_at = case when legal_name_changed then null else now() end,
    updated_at = now()
  where case_id = target_case.id and kind = 'profile'::public.employee_onboarding_requirement_kind;

  update public.employee_onboarding_cases set status = 'in_progress'::public.employee_onboarding_case_status, revision = revision + 1,
    updated_at = now() where id = target_case.id returning revision into expected_revision;
  insert into public.onboarding_events (workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id, metadata)
  values (target_case.workspace_id, target_case.employee_id, target_case.id, target_user_id,
    'onboarding.profile_saved', 'onboarding_case', target_case.id::text,
    jsonb_build_object('legal_name_review_required', legal_name_changed));
  return expected_revision;
end;
$_$;

CREATE OR REPLACE FUNCTION "public"."save_employee_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_employee_id" "uuid", "employee_first_name" "text", "employee_middle_name" "text", "employee_last_name" "text", "employee_preferred_name" "text", "employee_invitation_email" "text", "employee_start_date" "date", "employee_internal_note" "text", "location_ids" "uuid"[], "primary_location_id" "uuid", "job_ids" "uuid"[], "primary_job_id" "uuid", "employee_is_remote" boolean, "employee_is_excluded_from_schedule" boolean, "expected_revision" integer) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  saved_id uuid := target_employee_id;
  reachable uuid[];
  kept uuid[];
  current_revision integer;
  next_code bigint;
  assignment_optional boolean := coalesce(employee_is_remote, false) or coalesce(employee_is_excluded_from_schedule, false);
begin
  -- A new record is asked where it will work (a manager only where they
  -- manage, never nowhere); an existing one, whose it is.
  if target_employee_id is null then
    perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.create',
      coalesce(location_ids, '{}'::uuid[]));
  else
    perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.save',
      target_person => target_employee_id);
  end if;

  -- An assignment at a location that is not live (archived) is left as it is,
  -- sent or not: that location counts nowhere, and the assignment is back when
  -- the archive is undone (G8a, KK-13). Only live locations are added, kept or
  -- taken away here; the primary mark still follows primary_location_id.
  kept := coalesce((
    select array_agg(existing.location_id)
    from public.employee_location_assignments existing
    join public.locations location on location.id = existing.location_id
    where existing.employee_id = target_employee_id and existing.ended_at is null
      and not app_private.location_is_live(location)
  ), '{}');

  if char_length(btrim(employee_first_name)) not between 1 and 80 or char_length(btrim(employee_last_name)) not between 1 and 80 then
    raise exception 'employee first and last name are required' using errcode = '22023';
  end if;
  -- Somebody not Remote nor excluded from Schedule needs a location, a primary
  -- location, a job and a primary job; any job can be the primary one, under
  -- Management too (EMP-001 S2). The owner's record needs none of it: the owner
  -- may work anywhere, and their Owner job is never primary.
  if not assignment_optional and not app_private.employee_record_is_workspace_owner(target_workspace_id, target_employee_id) then
    if cardinality(coalesce(location_ids, '{}'::uuid[]) || kept) = 0 or primary_location_id is null then
      raise exception 'employee requires a location and job unless remote or excluded from schedule'
        using errcode = '22023', hint = 'employee.location_required';
    end if;
    if cardinality(coalesce(job_ids, '{}'::uuid[])) = 0 then
      raise exception 'employee requires a location and job unless remote or excluded from schedule'
        using errcode = '22023', hint = 'employee.job_required';
    end if;
    if primary_job_id is null then
      raise exception 'employee requires a primary job unless remote or excluded from schedule'
        using errcode = '22023', hint = 'employee.primary_job_required';
    end if;
  end if;
  if primary_location_id is not null and not primary_location_id = any(coalesce(location_ids, '{}'::uuid[]) || kept) then
    raise exception 'primary location must be assigned' using errcode = '22023';
  end if;
  if primary_job_id is not null and not primary_job_id = any(coalesce(job_ids, '{}'::uuid[])) then
    raise exception 'primary job must be assigned' using errcode = '22023';
  end if;

  -- A location added or taken away is one the actor reaches; an unknown or
  -- archived one reads the same.
  reachable := app_private.scope_set(actor_user_id, target_workspace_id, 'employee.save');
  if exists (
      select 1 from unnest(coalesce(location_ids, '{}'::uuid[])) selected(location_id)
      left join public.locations location
        on location.id = selected.location_id and location.workspace_id = target_workspace_id and location.archived_at is null
      where not selected.location_id = any (kept)
        and (location.id is null
         or (not selected.location_id = any (reachable) and not exists (
           select 1 from public.employee_location_assignments existing
           where existing.employee_id = target_employee_id and existing.location_id = selected.location_id
             and existing.ended_at is null)))
    )
    or exists (
      select 1 from public.employee_location_assignments existing
      where existing.employee_id = target_employee_id and existing.ended_at is null
        and not existing.location_id = any (coalesce(location_ids, '{}'::uuid[]) || kept)
        and not existing.location_id = any (reachable)
    ) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'employee.save';
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
      workspace_id, employee_code, first_name, middle_name, last_name, preferred_name,
      invitation_email, start_date, internal_note, is_remote,
      is_excluded_from_schedule, created_by
    )
    values (
      target_workspace_id, 'E-' || lpad(next_code::text, 4, '0'),
      btrim(employee_first_name), left(btrim(coalesce(employee_middle_name, '')), 80), btrim(employee_last_name),
      '',
      nullif(lower(btrim(employee_invitation_email)), ''),
      employee_start_date, btrim(coalesce(employee_internal_note, '')),
      coalesce(employee_is_remote, false),
      coalesce(employee_is_excluded_from_schedule, false),
      actor_user_id
    )
    returning id into saved_id;
    insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
    values (target_workspace_id, saved_id, actor_user_id, 'employee.created', 'Employee record created');
  else
    select revision into current_revision from public.employee_profiles
    where id = saved_id and workspace_id = target_workspace_id and archived_at is null
    for update;
    if current_revision is null then raise exception 'employee not found' using errcode = 'P0002'; end if;
    if expected_revision is null or expected_revision <> current_revision then raise exception 'employee revision conflict' using errcode = 'PT409', hint = 'employee.revision_conflict'; end if;
    -- The preferred name is not the drawer's: it changes by request and answer.
    update public.employee_profiles set
      first_name = btrim(employee_first_name),
      middle_name = left(btrim(coalesce(employee_middle_name, '')), 80),
      last_name = btrim(employee_last_name),
      invitation_email = nullif(lower(btrim(employee_invitation_email)), ''),
      start_date = employee_start_date,
      internal_note = btrim(coalesce(employee_internal_note, '')),
      is_remote = coalesce(employee_is_remote, false),
      is_excluded_from_schedule = coalesce(employee_is_excluded_from_schedule, false),
      revision = revision + 1,
      updated_at = now()
    where id = saved_id;
    insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
    values (target_workspace_id, saved_id, actor_user_id, 'employee.updated', 'Employee profile and assignments updated');
  end if;

  -- Only what changed is written (BL-218): a kept assignment keeps its row, so
  -- the rules on the assignment tables (the owner stays at every location, the
  -- Owner job stays the owner's) judge a real removal, not every save. The
  -- primary flag is cleared before it is set, one row at a time for the index.
  update public.employee_location_assignments set ended_at = now(), is_primary = false
  where employee_id = saved_id and ended_at is null
    and not location_id = any(coalesce(location_ids, '{}'::uuid[]) || kept);
  update public.employee_location_assignments set is_primary = false
  where employee_id = saved_id and ended_at is null and is_primary
    and location_id is distinct from primary_location_id;
  insert into public.employee_location_assignments (workspace_id, employee_id, location_id, is_primary, created_by)
  select distinct target_workspace_id, saved_id, selected.location_id, false, actor_user_id
  from unnest(coalesce(location_ids, '{}'::uuid[])) selected(location_id)
  where not exists (select 1 from public.employee_location_assignments existing
    where existing.employee_id = saved_id and existing.location_id = selected.location_id and existing.ended_at is null);
  update public.employee_location_assignments set is_primary = true
  where employee_id = saved_id and ended_at is null and not is_primary and location_id = primary_location_id;

  update public.employee_job_assignments set ended_at = now(), is_primary = false
  where employee_id = saved_id and ended_at is null
    and not job_id = any(coalesce(job_ids, '{}'::uuid[]));
  update public.employee_job_assignments set is_primary = false
  where employee_id = saved_id and ended_at is null and is_primary
    and job_id is distinct from primary_job_id;
  insert into public.employee_job_assignments (workspace_id, employee_id, job_id, is_primary, created_by)
  select distinct target_workspace_id, saved_id, selected.job_id, false, actor_user_id
  from unnest(coalesce(job_ids, '{}'::uuid[])) selected(job_id)
  where not exists (select 1 from public.employee_job_assignments existing
    where existing.employee_id = saved_id and existing.job_id = selected.job_id and existing.ended_at is null);
  update public.employee_job_assignments set is_primary = true
  where employee_id = saved_id and ended_at is null and not is_primary and job_id = primary_job_id;

  -- K4: excluded from the Schedule needs no location, except a manager, who
  -- manages only where they are assigned.
  perform app_private.keep_manager_at_a_location(target_workspace_id, saved_id);
  return saved_id;
end;
$_$;

CREATE OR REPLACE FUNCTION "public"."save_important_date_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_important_date_id" "uuid", "target_title" "text", "target_type" "text", "target_starts_on" "date", "target_ends_on" "date", "target_recurrence" "text", "target_note" "text", "target_affects_scheduling" boolean, "target_location_ids" "uuid"[], "target_expected_revision" integer, "target_keep_shift_ids" "uuid"[] DEFAULT '{}'::"uuid"[], "target_expected_fingerprint" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  item public.important_dates;
  before public.important_dates;
  line date := public.schedule_current_week_start_service(target_workspace_id);
  content_changed boolean := true;
  untouched boolean := false;
  was public.important_dates;
  ahead integer;
  impact jsonb;
  opened jsonb := '[]';
  removed uuid[] := '{}';
  reached uuid[];
  told uuid[];
  dropped uuid[];
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.important_dates.read');
  target_location_ids := array(select distinct id from unnest(coalesce(target_location_ids, '{}')) id order by id);
  if target_important_date_id is null then
    perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'important_date', target_location_ids, actor_user_id);
  else
    select * into before from public.important_dates
    where id = target_important_date_id and workspace_id = target_workspace_id for update;
    if before.id is null or not app_private.important_date_visible(actor_user_id, before) then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'important_date.write';
    end if;
    perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'important_date', before.location_ids, before.created_by, before.location_ids);
    perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'important_date', target_location_ids, before.created_by, before.location_ids);
    if before.archived_at is not null then
      raise exception 'Restore this date before you edit it' using errcode = 'PT409';
    end if;
    if before.revision is distinct from target_expected_revision then
      raise exception 'This date changed. Reload and try again.' using errcode = 'PT409';
    end if;
    -- The same as an announcement's (KK-86).
    if cardinality(target_location_ids) = 0
       and cardinality(before.location_ids) > cardinality(app_private.live_locations(target_workspace_id, before.location_ids)) then
      raise exception 'Choose at least one location' using errcode = '22023';
    end if;
  end if;

  if cardinality(target_location_ids) > 100 then
    raise exception 'too many locations' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(target_title, ''))) not between 1 and 120 or char_length(coalesce(target_note, '')) > 500
     or target_type not in ('holiday', 'event', 'blackout', 'closed_day') or target_recurrence not in ('none', 'annual')
     or target_starts_on is null or target_ends_on is null or target_ends_on < target_starts_on then
    raise exception 'valid important date required' using errcode = '22023';
  end if;
  if target_type = 'closed_day' then
    target_affects_scheduling := true;
  end if;

  -- K11. A save that changes nothing touches nothing.
  if before.id is not null then
    untouched := (before.title, before.type::text, before.starts_on, before.ends_on, before.recurrence::text, before.note,
      before.affects_scheduling, before.location_ids)
      is not distinct from (btrim(target_title), target_type, target_starts_on, target_ends_on, target_recurrence,
      coalesce(target_note, ''), coalesce(target_affects_scheduling, true), target_location_ids);
    if not untouched and app_private.important_date_is_past(before, line) then
      perform app_private.important_date_refuse_past();
    end if;
  end if;
  if not untouched then
    if target_recurrence = 'annual' and target_starts_on < line then
      -- A yearly date given a past year starts with its next day from the line on.
      ahead := (select min(k) from generate_series(1, extract(year from line)::integer - extract(year from target_starts_on)::integer + 1) k
                where (target_starts_on + make_interval(years => k))::date >= line);
      target_ends_on := (target_ends_on + make_interval(years => ahead))::date;
      target_starts_on := (target_starts_on + make_interval(years => ahead))::date;
    elsif target_starts_on < line then
      -- The past days of a date that began before the line stay its own; its
      -- unchanged start is not a change.
      if before.id is null or before.recurrence <> 'none' or target_starts_on <> before.starts_on or target_ends_on < line then
        perform app_private.important_date_refuse_past();
      end if;
      target_starts_on := line;
    end if;
  end if;

  -- K13: what a published closed day would newly land on.
  if before.id is null or before.status = 'published' then
    impact := app_private.important_date_closure_impact(target_workspace_id, before, target_type, target_starts_on,
      target_ends_on, target_recurrence, target_location_ids);
    if jsonb_array_length(impact -> 'shifts') > 0
       and target_expected_fingerprint is distinct from impact ->> 'fingerprint' then
      raise exception 'Review the shifts on this closed day again.' using errcode = 'PT409', hint = 'important_date.closure_changed';
    end if;
  end if;

  if before.id is not null and not untouched then
    -- The history keeps the version as it was, not the part left ahead.
    was := before;
    before := app_private.important_date_keep_past(before, line);
  end if;

  if target_important_date_id is null then
    insert into public.important_dates (workspace_id, title, type, starts_on, ends_on, recurrence, note,
      affects_scheduling, location_ids, location_id, created_by, updated_by)
    values (target_workspace_id, btrim(target_title), target_type::public.important_date_type, target_starts_on,
      target_ends_on, target_recurrence::public.important_date_recurrence, coalesce(target_note, ''),
      coalesce(target_affects_scheduling, true), target_location_ids,
      case when cardinality(target_location_ids) = 1 then target_location_ids[1] end, actor_user_id, actor_user_id)
    returning * into item;
  else
    content_changed := (before.title, before.type::text, before.starts_on, before.ends_on, before.recurrence::text,
      before.note, before.affects_scheduling)
      is distinct from (btrim(target_title), target_type, target_starts_on, target_ends_on, target_recurrence,
      coalesce(target_note, ''), coalesce(target_affects_scheduling, true));
    update public.important_dates
    set title = btrim(target_title), type = target_type::public.important_date_type, starts_on = target_starts_on,
        ends_on = target_ends_on, recurrence = target_recurrence::public.important_date_recurrence,
        note = coalesce(target_note, ''), affects_scheduling = coalesce(target_affects_scheduling, true),
        location_ids = target_location_ids,
        location_id = case when cardinality(target_location_ids) = 1 then target_location_ids[1] end,
        content_revision = content_revision + case when content_changed then 1 else 0 end,
        revision = revision + 1, updated_by = actor_user_id, updated_at = now()
    where id = before.id
    returning * into item;
  end if;

  if impact is not null then
    opened := app_private.important_date_close_shifts(actor_user_id, item, impact, target_keep_shift_ids);
  end if;

  if item.status = 'published' then
    -- Everybody it is for, and those told now: not where it is already over.
    reached := app_private.important_date_recipients(item);
    told := app_private.important_date_notified(item);
    if content_changed and before.id is not null then
      perform app_private.communication_withdraw(target_workspace_id, 'schedule.important_date.available',
        'important_date', item.id::text, 'superseded');
    end if;
    -- K14: who lost a shift hears it in its own notice, not in the common one.
    removed := app_private.important_date_tell_removed(item, opened);
    if content_changed then
      perform app_private.important_date_deliver(item, array(select who from unnest(told) who where not who = any (removed)));
    else
      -- Those it no longer reaches lose it (BL-534); the new people are told.
      dropped := array(select who from unnest(item.delivered_to) who where not who = any (reached) and not who = any (removed));
      if cardinality(dropped) > 0 then
        perform app_private.communication_withdraw(target_workspace_id, 'schedule.important_date.available',
          'important_date', item.id::text, 'cancelled', dropped);
      end if;
      perform app_private.important_date_deliver(item,
        array(select who from unnest(told) who where not who = any (item.delivered_to) and not who = any (removed)));
      told := array(select distinct who from unnest(told || array(
        select who from unnest(item.delivered_to) who where who = any (reached))) who);
    end if;
    update public.important_dates set delivered_to = array(select distinct who from unnest(told || removed) who)
    where id = item.id returning * into item;
  end if;

  insert into public.important_date_changes (workspace_id, important_date_id, actor_user_id, action, before, after)
  values (target_workspace_id, item.id, actor_user_id,
    case when before.id is null then 'created' else 'updated' end,
    case when before.id is null then null else app_private.important_date_snapshot(coalesce(was, before)) end,
    app_private.important_date_snapshot(item));
  return jsonb_build_object('important_date_id', item.id, 'status', item.status, 'revision', item.revision,
    'recipient_count', cardinality(item.delivered_to),
    'shifts_opened', jsonb_array_length(opened),
    'draft_shifts_opened', coalesce(jsonb_array_length(impact -> 'draft_shift_ids'), 0),
    'shifts_stay_open', case when before.id is null then 0 else app_private.important_date_stay_open(item) end);
end;
$$;

CREATE OR REPLACE FUNCTION "public"."save_notification_policy_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_type_key" "text", "target_schema_version" integer, "target_scope_kind" "text", "target_scope_id" "uuid", "target_expected_version" integer, "target_enabled" boolean, "target_allowed_channels" "text"[], "target_cadence" "text", "target_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  catalog_row public.notification_catalog%rowtype;
  membership_row public.workspace_memberships%rowtype;
  existing public.notification_org_policies%rowtype;
  saved public.notification_org_policies%rowtype;
  scoped_role_id uuid;
  scoped_location_id uuid;
  scope_name text;
begin
  if not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'notifications.settings.write') then
    raise exception 'notification settings write access required' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(target_reason, ''))) not between 3 and 500 then
    raise exception 'notification policy reason required' using errcode = '22023';
  end if;

  select * into catalog_row
  from public.notification_catalog entry
  where entry.type_key = target_type_key
    and entry.schema_version = target_schema_version
    and entry.lifecycle = 'active';
  if catalog_row.type_key is null then
    raise exception 'active notification type not found' using errcode = 'P0002';
  end if;
  if cardinality(coalesce(target_allowed_channels, '{}'::text[])) = 0
    or not target_allowed_channels <@ catalog_row.supported_channels then
    raise exception 'notification channel is not supported' using errcode = '22023';
  end if;
  if target_cadence not in ('immediate', 'daily_digest', 'weekly_digest') then
    raise exception 'notification cadence is invalid' using errcode = '22023';
  end if;
  if catalog_row.mandatory_in_app and (
    not target_enabled or not ('in_app' = any(target_allowed_channels))
  ) then
    raise exception 'mandatory in-app notification cannot be disabled' using errcode = '22023';
  end if;

  select * into membership_row
  from public.workspace_memberships membership
  where membership.workspace_id = target_workspace_id
    and membership.user_id = actor_user_id
    and membership.status = 'active';

  if target_scope_kind = 'global' then
    if target_scope_id is not null or not membership_row.all_locations then
      raise exception 'organization-wide notification scope required' using errcode = '42501';
    end if;
    scope_name := 'Organization';
  elsif target_scope_kind = 'role' then
    if target_scope_id is null or not membership_row.all_locations then
      raise exception 'organization-wide notification scope required' using errcode = '42501';
    end if;
    select role_row.id, role_row.name into scoped_role_id, scope_name
    from public.workspace_roles role_row
    where role_row.workspace_id = target_workspace_id and role_row.id = target_scope_id;
    if scoped_role_id is null then
      raise exception 'notification role scope not found' using errcode = '42501';
    end if;
  elsif target_scope_kind = 'location' then
    if target_scope_id is null then
      raise exception 'notification location scope not found' using errcode = '42501';
    end if;
    select location.id, location.name into scoped_location_id, scope_name
    from public.locations location
    where location.workspace_id = target_workspace_id
      and location.id = target_scope_id
      and location.archived_at is null;
    if scoped_location_id is null then
      raise exception 'notification location scope not found' using errcode = '42501';
    end if;
    if not membership_row.all_locations and not exists (
      select 1 from public.membership_location_scopes scope
      where scope.workspace_id = target_workspace_id
        and scope.membership_id = membership_row.id
        and scope.location_id = scoped_location_id
    ) then
      raise exception 'notification location scope access denied' using errcode = '42501';
    end if;
  else
    raise exception 'notification policy scope is invalid' using errcode = '22023';
  end if;

  select * into existing
  from public.notification_org_policies policy
  where policy.workspace_id = target_workspace_id
    and policy.type_key = target_type_key
    and policy.role_id is not distinct from scoped_role_id
    and policy.location_id is not distinct from scoped_location_id
  for update;

  if (existing.id is null and target_expected_version is not null)
    or (existing.id is not null and target_expected_version is null)
    or (existing.id is not null and existing.version <> target_expected_version) then
    raise exception 'notification policy stale version' using errcode = 'PT409';
  end if;

  if existing.id is null then
    insert into public.notification_org_policies (
      workspace_id, type_key, schema_version, role_id, location_id,
      enabled, allowed_channels, cadence, mandatory_in_app, updated_by
    ) values (
      target_workspace_id, target_type_key, target_schema_version,
      scoped_role_id, scoped_location_id, target_enabled,
      target_allowed_channels, target_cadence, catalog_row.mandatory_in_app,
      actor_user_id
    ) returning * into saved;
  else
    update public.notification_org_policies policy
    set enabled = target_enabled,
        allowed_channels = target_allowed_channels,
        cadence = target_cadence,
        mandatory_in_app = catalog_row.mandatory_in_app,
        version = policy.version + 1,
        updated_by = actor_user_id,
        updated_at = now()
    where policy.id = existing.id
    returning * into saved;
  end if;

  insert into public.notification_audit_log (
    workspace_id, actor_user_id, action, target_type, target_id, reason, metadata
  ) values (
    target_workspace_id, actor_user_id, 'notification.policy.saved',
    'notification_org_policy', saved.id::text, btrim(target_reason),
    jsonb_build_object(
      'type_key', target_type_key,
      'scope_kind', target_scope_kind,
      'scope_id', target_scope_id,
      'before_version', existing.version,
      'after_version', saved.version,
      'before', case when existing.id is null then null else to_jsonb(existing) end,
      'after', to_jsonb(saved)
    )
  );

  return jsonb_build_object(
    'status', 'saved',
    'policy', jsonb_build_object(
      'id', saved.id,
      'scope', jsonb_build_object(
        'kind', target_scope_kind,
        'id', target_scope_id,
        'name', scope_name
      ),
      'enabled', saved.enabled,
      'allowed_channels', to_jsonb(saved.allowed_channels),
      'cadence', saved.cadence,
      'version', saved.version,
      'updated_by', saved.updated_by,
      'updated_at', saved.updated_at,
      'source', 'organization_policy'
    )
  );
end;
$$;

CREATE OR REPLACE FUNCTION "public"."save_notification_user_preferences_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_updates" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  update_row jsonb;
  requested_preference_scope text;
  requested_scope_key text;
  requested_channel_preferences jsonb;
  requested_cadence text;
  requested_timezone text;
  requested_quiet_hours jsonb;
  requested_safe_preview boolean;
  expected_version integer;
  existing public.notification_user_preferences%rowtype;
  saved public.notification_user_preferences%rowtype;
  saved_rows jsonb := '[]'::jsonb;
  seen_keys text[] := array[]::text[];
  changed_channel text;
  changed_value text;
  lock_reason text;
  audit_before jsonb;
begin
  if not public.notification_actor_is_active_member_service(actor_user_id, target_workspace_id) then
    raise exception 'notification preference access required' using errcode = '42501';
  end if;
  if jsonb_typeof(target_updates) <> 'array'
    or jsonb_array_length(target_updates) = 0
    or jsonb_array_length(target_updates) > 50 then
    raise exception 'valid notification preference patch required' using errcode = '22023';
  end if;

  for update_row in select * from jsonb_array_elements(target_updates)
  loop
    requested_preference_scope := update_row->>'preference_scope';
    requested_scope_key := btrim(coalesce(update_row->>'scope_key', ''));
    requested_channel_preferences := coalesce(update_row->'channel_preferences', '{}'::jsonb);
    requested_cadence := nullif(update_row->>'cadence', '');
    requested_timezone := nullif(update_row->>'timezone', '');
    requested_quiet_hours := case
      when update_row ? 'quiet_hours' and update_row->'quiet_hours' <> 'null'::jsonb
      then update_row->'quiet_hours'
      else null
    end;
    requested_safe_preview := coalesce((update_row->>'safe_preview_enabled')::boolean, true);
    expected_version := case
      when update_row ? 'expected_version' and update_row->'expected_version' <> 'null'::jsonb
      then (update_row->>'expected_version')::integer
      else null
    end;

    if array[requested_preference_scope || ':' || requested_scope_key] && seen_keys then
      raise exception 'duplicate notification preference scope' using errcode = '22023';
    end if;
    seen_keys := seen_keys || (requested_preference_scope || ':' || requested_scope_key);

    if requested_preference_scope not in ('category', 'type')
      or requested_scope_key = ''
      or jsonb_typeof(requested_channel_preferences) <> 'object'
      or requested_channel_preferences - array['in_app', 'email', 'push']::text[] <> '{}'::jsonb
      or exists (
        select 1
        from jsonb_each_text(requested_channel_preferences) entry
        where entry.value not in ('enabled', 'disabled', 'inherit')
      )
      or (requested_cadence is not null and requested_cadence not in ('immediate', 'daily_digest', 'weekly_digest'))
      or (requested_timezone is not null and char_length(requested_timezone) > 80)
      or (requested_quiet_hours is not null and (
        jsonb_typeof(requested_quiet_hours) <> 'object'
        or not (requested_quiet_hours ? 'enabled')
        or not (requested_quiet_hours ? 'start')
        or not (requested_quiet_hours ? 'end')
      )) then
      raise exception 'valid notification preference required' using errcode = '22023';
    end if;

    if requested_preference_scope = 'category' and not exists (
      select 1 from public.notification_catalog catalog
      where catalog.lifecycle = 'active'
        and catalog.notification_scope = 'workspace' and catalog.category = requested_scope_key
    ) then
      raise exception 'notification preference scope not found' using errcode = 'P0002';
    end if;
    if requested_preference_scope = 'type' and not exists (
      select 1 from public.notification_catalog catalog
      where catalog.lifecycle = 'active'
        and catalog.type_key = requested_scope_key
    ) then
      raise exception 'notification preference scope not found' using errcode = 'P0002';
    end if;

    select * into existing
    from public.notification_user_preferences preference
    where preference.workspace_id = target_workspace_id
      and preference.user_id = actor_user_id
      and preference.preference_scope = requested_preference_scope
      and preference.scope_key = requested_scope_key
    for update;
    if requested_preference_scope='type' and exists(select 1 from public.notification_catalog where type_key=requested_scope_key and notification_scope='account') then
      raise exception 'account security notifications are mandatory' using errcode='42501';
    end if;
    for changed_channel, changed_value in
      select entry.key, entry.value from jsonb_each_text(requested_channel_preferences) entry
    loop
      if changed_value = 'enabled' and changed_value is distinct from existing.channel_preferences->>changed_channel then
        if requested_preference_scope = 'type' then
          lock_reason := public.notification_user_channel_lock_reason_service(
            actor_user_id,
            target_workspace_id,
            requested_scope_key,
            changed_channel
          );
          if lock_reason <> 'available' then
            raise exception 'notification channel managed by organization' using errcode = '42501';
          end if;
        elsif exists (
          select 1
          from public.notification_catalog catalog
          where catalog.lifecycle = 'active'
            and catalog.notification_scope = 'workspace' and catalog.category = requested_scope_key
            and public.notification_user_channel_lock_reason_service(
              actor_user_id,
              target_workspace_id,
              catalog.type_key,
              changed_channel
            ) <> 'available'
        ) then
          raise exception 'notification channel managed by organization' using errcode = '42501';
        end if;
      end if;
    end loop;

    audit_before := case
      when existing.id is null then null
      else public.notification_user_preference_to_json(existing)
    end;

    if existing.id is not null then
      if expected_version is null or existing.version <> expected_version then
        raise exception 'stale notification preference version' using errcode = 'PT409';
      end if;
      update public.notification_user_preferences
      set channel_preferences = existing.channel_preferences || requested_channel_preferences,
          cadence = requested_cadence,
          timezone = requested_timezone,
          quiet_hours = requested_quiet_hours,
          safe_preview_enabled = requested_safe_preview,
          version = public.notification_user_preferences.version + 1,
          updated_at = now()
      where id = existing.id
      returning * into saved;
    else
      if expected_version is not null then
        raise exception 'notification preference not found' using errcode = 'P0002';
      end if;
      insert into public.notification_user_preferences (
        workspace_id, user_id, preference_scope, scope_key,
        channel_preferences, cadence, timezone, quiet_hours, safe_preview_enabled
      ) values (
        target_workspace_id, actor_user_id, requested_preference_scope, requested_scope_key,
        requested_channel_preferences, requested_cadence, requested_timezone,
        requested_quiet_hours, requested_safe_preview
      )
      returning * into saved;
    end if;

    insert into public.notification_audit_log (
      workspace_id, actor_user_id, action, target_type, target_id, reason, metadata
    ) values (
      target_workspace_id,
      actor_user_id,
      'notification.preference.saved',
      'notification_user_preference',
      saved.id::text,
      null,
      jsonb_build_object(
        'before', audit_before,
        'after', public.notification_user_preference_to_json(saved)
      )
    );

    saved_rows := saved_rows || jsonb_build_array(public.notification_user_preference_to_json(saved));
  end loop;

  return jsonb_build_object('status', 'saved', 'preferences', saved_rows);
end;
$$;

CREATE OR REPLACE FUNCTION "public"."set_announcement_state_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_announcement_id" "uuid", "target_expected_revision" integer, "target_action" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  item public.announcements;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'announcement.read');
  perform app_private.announcement_release(target_workspace_id);
  select * into item from public.announcements
  where id = target_announcement_id and workspace_id = target_workspace_id for update;
  if item.id is null or not app_private.announcement_visible(actor_user_id, item) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'announcement.write';
  end if;
  perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'announcement',
    app_private.announcement_places(item.id),
    item.created_by, app_private.announcement_places(item.id));
  if target_action not in ('unpublish', 'archive', 'restore') then
    raise exception 'valid announcement action required' using errcode = '22023';
  end if;
  if item.revision is distinct from target_expected_revision
     or (target_action = 'unpublish' and (item.archived_at is not null or item.status not in ('scheduled', 'published')))
     or (target_action = 'archive' and item.archived_at is not null)
     or (target_action = 'restore' and item.archived_at is null) then
    raise exception 'stale announcement revision' using errcode = 'PT409';
  end if;

  if target_action in ('unpublish', 'archive') then
    perform app_private.communication_withdraw(target_workspace_id, 'communications.announcement.available',
      'announcement', item.id::text, 'cancelled');
  end if;
  update public.announcements
  set status = case
        when target_action = 'unpublish' then 'unpublished'
        when target_action = 'restore' and status <> 'draft' then 'unpublished'
        else status end,
      archived_at = case target_action when 'archive' then now() when 'restore' then null else archived_at end,
      revision = revision + 1, updated_by = actor_user_id, updated_at = now()
  where id = item.id returning * into item;

  insert into public.audit_events (workspace_id, actor_user_id, action, target_type, target_id)
  values (target_workspace_id, actor_user_id,
    'announcement.' || case target_action when 'unpublish' then 'unpublished' when 'archive' then 'archived' else 'restored' end,
    'announcement', item.id::text);
  return jsonb_build_object('status', item.status, 'announcement_id', item.id, 'revision', item.revision,
    'archived_at', item.archived_at, 'recipient_count', 0);
end;
$$;

CREATE OR REPLACE FUNCTION "public"."set_important_date_state_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_important_date_id" "uuid", "target_action" "text", "target_keep_shift_ids" "uuid"[] DEFAULT '{}'::"uuid"[], "target_expected_fingerprint" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  item public.important_dates;
  before public.important_dates;
  line date := public.schedule_current_week_start_service(target_workspace_id);
  was public.important_dates;
  impact jsonb;
  opened jsonb := '[]';
  removed uuid[] := '{}';
  reached uuid[];
  opened_notice uuid[];
  told uuid[];
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.important_dates.read');
  select * into before from public.important_dates
  where id = target_important_date_id and workspace_id = target_workspace_id for update;
  if before.id is null or not app_private.important_date_visible(actor_user_id, before) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'important_date.write';
  end if;
  perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'important_date', before.location_ids, before.created_by, before.location_ids);
  if target_action not in ('unpublish', 'republish', 'archive', 'restore') then
    raise exception 'valid important date action required' using errcode = '22023';
  end if;
  if app_private.important_date_is_past(before, line) then
    perform app_private.important_date_refuse_past();
  end if;
  if (target_action = 'unpublish' and (before.archived_at is not null or before.status <> 'published'))
     or (target_action = 'republish' and (before.archived_at is not null or before.status <> 'unpublished'))
     or (target_action = 'archive' and before.archived_at is not null)
     or (target_action = 'restore' and before.archived_at is null) then
    raise exception 'This date changed. Reload and try again.' using errcode = 'PT409';
  end if;

  if target_action = 'republish' then
    impact := app_private.important_date_closure_impact(target_workspace_id, before, before.type::text, before.starts_on,
      before.ends_on, before.recurrence::text, before.location_ids);
    if jsonb_array_length(impact -> 'shifts') > 0
       and target_expected_fingerprint is distinct from impact ->> 'fingerprint' then
      raise exception 'Review the shifts on this closed day again.' using errcode = 'PT409', hint = 'important_date.closure_changed';
    end if;
  end if;

  was := before;
  before := app_private.important_date_keep_past(before, line);
  if target_action in ('unpublish', 'archive') then
    perform app_private.communication_withdraw(target_workspace_id, 'schedule.important_date.available',
      'important_date', before.id::text, 'cancelled');
  end if;
  update public.important_dates
  set status = case when target_action in ('unpublish', 'restore') then 'unpublished'
                    when target_action = 'republish' then 'published' else status end,
      archived_at = case target_action when 'archive' then now() when 'restore' then null else archived_at end,
      revision = revision + 1, updated_by = actor_user_id, updated_at = now()
  where id = before.id
  returning * into item;

  if target_action = 'republish' then
    opened := app_private.important_date_close_shifts(actor_user_id, item, impact, target_keep_shift_ids);
    removed := app_private.important_date_tell_removed(item, opened);
    reached := app_private.important_date_recipients(item);
    -- Who opened the current content already is not told again (K7).
    opened_notice := array(
      select who from unnest(reached) who
      where exists (
        select 1 from public.notification_outbox outbox
        join public.notification_recipients recipient
          on recipient.workspace_id = outbox.workspace_id and recipient.event_id = outbox.event_id
        join public.notification_inbox_items inbox on inbox.recipient_projection_id = recipient.id
        where outbox.workspace_id = item.workspace_id and outbox.type_key = 'schedule.important_date.available'
          and outbox.subject_type = 'important_date' and outbox.subject_id = item.id::text
          and outbox.payload ->> 'content_revision' = item.content_revision::text
          and recipient.recipient_user_id = who and inbox.read_at is not null));
    told := array(select who from unnest(app_private.important_date_notified(item)) who
                  where not who = any (opened_notice) and not who = any (removed));
    perform app_private.important_date_deliver(item, told);
    update public.important_dates set delivered_to = array(select distinct who from unnest(told || opened_notice || removed) who)
    where id = item.id returning * into item;
  end if;

  insert into public.important_date_changes (workspace_id, important_date_id, actor_user_id, action, before, after)
  values (target_workspace_id, item.id, actor_user_id,
    case target_action when 'unpublish' then 'unpublished' when 'republish' then 'republished'
      when 'archive' then 'archived' else 'restored' end,
    app_private.important_date_snapshot(was), app_private.important_date_snapshot(item));
  return jsonb_build_object('important_date_id', item.id, 'status', item.status, 'revision', item.revision,
    'archived_at', item.archived_at,
    'shifts_opened', jsonb_array_length(opened),
    'draft_shifts_opened', coalesce(jsonb_array_length(impact -> 'draft_shift_ids'), 0),
    'shifts_stay_open', app_private.important_date_stay_open(item));
end;
$$;

CREATE OR REPLACE FUNCTION "public"."shorten_time_off_service"("actor" "uuid", "w" "uuid", "rid" "uuid", "expected_revision" integer, "periods" "jsonb", "note" "text", "operation_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare parent public.schedule_time_off_requests%rowtype; prior public.time_off_commands%rowtype; command jsonb; result jsonb;
 p jsonb; a timestamptz; b timestamptz; span tstzrange; cut tstzmultirange:='{}';
begin
 perform public.availability_lock_workspace(w);
 select * into parent from public.schedule_time_off_requests where id=rid and workspace_id=w and request_type='time_off' for update;
 if parent.id is null then raise exception 'Not allowed' using errcode='42501', hint='authz.out_of_scope', detail='time_off.revoke'; end if;
 perform app_private.time_off_authorize(actor,w,'time_off.revoke',parent.employee_id);
 if operation_id is null then raise exception 'A request key is required' using errcode='22023'; end if;
 command:=jsonb_build_object('kind','shorten','request_id',rid,'expected_revision',expected_revision,'periods',periods,'note',btrim(coalesce(note,'')));
 select * into prior from public.time_off_commands c where c.workspace_id=w and c.actor_user_id=actor and c.operation_id=shorten_time_off_service.operation_id;
 if found then
  if prior.input<>command then raise exception 'This request key was used for a different change' using errcode = 'PT409'; end if;
  return prior.result;
 end if;
 if expected_revision is null or parent.revision<>expected_revision or parent.status <> 'approved' then
  raise exception 'stale approved leave; refresh before shortening it' using errcode = 'PT409'; end if;
 if jsonb_typeof(periods) is distinct from 'array' or jsonb_array_length(periods) not between 1 and 124 then
  raise exception 'Choose up to 124 periods of approved hours' using errcode='22023'; end if;
 if char_length(btrim(coalesce(note,'')))>1000 then raise exception 'The note can be at most 1000 characters' using errcode='22023'; end if;
 for p in select value from jsonb_array_elements(periods) loop
  if coalesce(p->>'starts_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' or coalesce(p->>'ends_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then
   raise exception 'Each period needs exact start and end instants' using errcode='22023'; end if;
  a:=(p->>'starts_at')::timestamptz; b:=(p->>'ends_at')::timestamptz;
  if not isfinite(a) or not isfinite(b) or a>=b or a<=now() then raise exception 'Only future approved hours can be given back' using errcode='22023'; end if;
  span:=tstzrange(a,b,'[)');
  if cut && span or not exists(select 1 from public.schedule_time_off_segments s where s.id=(p->>'segment_id')::uuid and s.workspace_id=w
   and s.request_id=parent.id and public.time_off_effective_ranges(s.id) @> span) then
   raise exception 'Choose approved hours of this time off, without overlap' using errcode='22023'; end if;
  cut:=cut+tstzmultirange(span);
 end loop;
 perform app_private.shorten_time_off(actor,w,parent.employee_id,cut,coalesce(nullif(btrim(coalesce(note,'')),''),'Shortened by a manager.'),
  jsonb_build_object('source','manager','request_id',rid));
 select jsonb_build_object('status',r.status,'request_id',r.id,'revision',r.revision) into result
  from public.schedule_time_off_requests r where r.id=rid;
 insert into public.time_off_commands(workspace_id,actor_user_id,operation_id,input,result) values(w,actor,operation_id,command,result);
 return result;
end;
$_$;

CREATE OR REPLACE FUNCTION "public"."submit_employee_onboarding_service"("target_user_id" "uuid", "expected_revision" integer, "target_workspace_id" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  target_case public.employee_onboarding_cases%rowtype;
begin
 perform app_private.authorize(target_user_id, app_private.onboarding_self_workspace(target_user_id, target_workspace_id, true), 'onboarding.self');
  select onboarding.* into target_case
  from public.employee_onboarding_cases onboarding
  where onboarding.id = app_private.employee_onboarding_case_id(target_user_id, target_workspace_id)
  for update;

  if target_case.id is null or target_case.revision <> expected_revision then
    raise exception 'onboarding changed; refresh required' using errcode = 'PT409';
  end if;
  if exists(select 1 from public.employee_onboarding_requirements r where r.case_id=target_case.id and app_private.document_initial_action_missing(r)) then raise exception 'Submit conditional documents or give an initial reason' using errcode='23514'; end if;
  if exists (
    select 1
    from public.employee_onboarding_requirements
    where case_id = target_case.id
      and (kind<>'document' or (not lifecycle_exempt and lifecycle_closed_at is null and status<>'superseded')) and required
      and status not in (
        'completed'::public.employee_onboarding_requirement_status,
        'awaiting_review'::public.employee_onboarding_requirement_status
      )
  ) then
    raise exception 'required onboarding items remain incomplete' using errcode = '23514';
  end if;

  update public.employee_onboarding_cases
  set status = 'submitted'::public.employee_onboarding_case_status,
      submitted_at = now(),
      revision = revision + 1,
      updated_at = now()
  where id = target_case.id
  returning * into target_case;

  insert into public.onboarding_events (workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id)
  values (
    target_case.workspace_id,
    target_case.employee_id,
    target_case.id,
    target_user_id,
    'onboarding.submitted',
    'onboarding_case',
    target_case.id::text
  );

  if not exists(select 1 from public.employee_onboarding_requirements r where r.case_id=target_case.id and app_private.document_activation_blocked(r)) and not target_case.final_approval_required
    and not exists (
      select 1
      from public.employee_onboarding_requirements
      where case_id = target_case.id
        and (kind<>'document' or (not lifecycle_exempt and lifecycle_closed_at is null and status<>'superseded')) and required
        and blocks_activation
        and status <> 'completed'::public.employee_onboarding_requirement_status
    ) then
    return app_private.activate_employee_onboarding_case(
      target_case.id,
      target_user_id,
      'employee.auto_activated'
    );
  end if;

  return target_case.revision;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."submit_time_off_service"("actor" "uuid", "w" "uuid", "periods" "jsonb", "reason" "text", "expected_timezone" "text", "operation_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  employee public.employee_profiles%rowtype;
  zone_name text;
  command jsonb;
  prior public.time_off_commands%rowtype;
  period jsonb;
  resolved jsonb;
  asked jsonb := '[]';
  span tstzrange;
  covered tstzmultirange := '{}';
  rid uuid;
  result jsonb;
begin
  perform public.availability_lock_workspace(w);
  perform app_private.time_off_authorize(actor, w, 'time_off.request_own');
  select * into employee from public.employee_profiles e where e.workspace_id = w and e.user_id = actor and e.archived_at is null;
  if employee.id is null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'time_off.request_own';
  end if;
  if operation_id is null then raise exception 'A request key is required' using errcode = '22023'; end if;
  command := jsonb_build_object('kind', 'request', 'periods', periods, 'reason', btrim(coalesce(reason, '')), 'expected_timezone', expected_timezone);
  select * into prior from public.time_off_commands c where c.workspace_id = w and c.actor_user_id = actor and c.operation_id = submit_time_off_service.operation_id;
  if found then
    if prior.input <> command then raise exception 'This request key was used for different time-off hours' using errcode = 'PT409'; end if;
    return prior.result;
  end if;
  if jsonb_typeof(periods) is distinct from 'array' then raise exception 'Enter the requested time-off periods' using errcode = '22023'; end if;
  if jsonb_array_length(periods) not between 1 and 31 or char_length(btrim(coalesce(reason, ''))) > 1000 then
    raise exception 'Enter between 1 and 31 days and a note of at most 1000 characters' using errcode = '22023'; end if;

  zone_name := app_private.time_off_timezone(w, employee.id);
  if zone_name is null then
    zone_name := expected_timezone;
  elsif expected_timezone is distinct from zone_name then
    raise exception 'The time zone of your location changed. Review the hours in the current time zone before sending' using errcode = 'PT409';
  end if;

  for period in select value from jsonb_array_elements(periods) loop
    resolved := public.time_off_resolve_period(period, zone_name);
    span := tstzrange((resolved ->> 'starts_at')::timestamptz, (resolved ->> 'ends_at')::timestamptz, '[)');
    if covered && span then raise exception 'Requested time-off periods must not overlap or repeat' using errcode = '22023'; end if;
    covered := covered + tstzmultirange(span);
    asked := asked || jsonb_build_array(resolved);
  end loop;
  if lower(range_merge(covered)) <= now() then
    raise exception 'Time off that has already started cannot be asked for here. Talk to your manager directly' using errcode = '22023';
  end if;
  if (select max((p ->> 'segment_date')::date) - min((p ->> 'segment_date')::date) + 1 <> count(distinct p ->> 'segment_date')
      from jsonb_array_elements(asked) p) then
    raise exception 'A request is one run of days in a row' using errcode = '22023';
  end if;
  if exists (select 1 from public.schedule_time_off_requests other
    join public.schedule_time_off_segments s on s.request_id = other.id and s.workspace_id = other.workspace_id
    where other.workspace_id = w and other.employee_id = employee.id and other.request_type = 'time_off'
      and other.status in ('pending', 'approved') and s.status in ('pending', 'approved')
      and covered && public.time_off_effective_ranges(s.id)) then
    raise exception 'overlapping time off request exists' using errcode = '23514';
  end if;

  insert into public.schedule_time_off_requests(workspace_id, employee_id, reason, created_by, decide_by)
  values (w, employee.id, btrim(coalesce(reason, '')), actor, app_private.time_off_decide_by(w, lower(range_merge(covered))))
  returning id into rid;
  insert into public.schedule_time_off_segments(workspace_id, request_id, segment_date, start_time, end_time, time_timezone, starts_at, ends_at, ends_next_day, fold_choices)
  select w, rid, (p ->> 'segment_date')::date, (p ->> 'start_time')::time, (p ->> 'end_time')::time, p ->> 'time_timezone',
    (p ->> 'starts_at')::timestamptz, (p ->> 'ends_at')::timestamptz, (p ->> 'ends_next_day')::boolean, p -> 'fold_choices'
  from jsonb_array_elements(asked) p;
  insert into public.time_off_required_locations(request_id, workspace_id, location_id)
  select rid, w, place from unnest(app_private.time_off_deciding_locations(w, employee.id)) place;
  insert into public.schedule_time_off_events(workspace_id, request_id, action, actor_user_id, metadata)
  values (w, rid, 'submitted', actor, jsonb_build_object('periods', asked, 'operation_id', submit_time_off_service.operation_id));
  -- Sent straight to an admin and the owner (nobody can vote somewhere): that was their one notice.
  update public.schedule_time_off_requests set fallback_notified_at = now()
  where id = rid and exists (select 1 from (select app_private.time_off_state(w, rid) s) x
    where (x.s ->> 'fallback')::boolean or (x.s ->> 'unattended')::integer > 0);
  -- The owner's own time off is recorded approved (K12, BL-221).
  if public.time_off_is_the_owners_own(actor, w, rid) then
    perform app_private.time_off_finalize(w, rid, 'approve', actor, '', true);
  end if;
  select jsonb_build_object('status', r.status, 'request_id', r.id, 'revision', r.revision, 'decide_by', r.decide_by) into result
  from public.schedule_time_off_requests r where r.id = rid;
  insert into public.time_off_commands(workspace_id, actor_user_id, operation_id, input, result)
  values (w, actor, submit_time_off_service.operation_id, command, result);
  return result;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."weekly_preference_settings_save_service"("actor" "uuid", "w" "uuid", "command" "jsonb", "request_key" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare model jsonb; prior jsonb; stored public.weekly_preference_commands%rowtype;
 envelope jsonb:=jsonb_build_object('kind','settings','value',command); event uuid:=gen_random_uuid(); recipients uuid[];
begin
 perform public.availability_lock_workspace(w);
 perform app_private.authorize(actor,w,'settings.availability.write');
 model:=public.weekly_preference_settings_read_service(actor,w);
 if request_key is null then raise exception 'A save key is required' using errcode='22023'; end if;
 select * into stored from public.weekly_preference_commands q where q.workspace_id=w and q.actor_user_id=actor and q.request_key=weekly_preference_settings_save_service.request_key;
 if found then
  if stored.command<>envelope then raise exception 'Idempotency key was used for another save' using errcode='22023'; end if;
  return model;
 end if;
 if jsonb_typeof(command) is distinct from 'object' or command->>'input_mode' is null or command->>'input_mode' not in ('time_range','shift_type')
  or jsonb_typeof(command->'onboarding_required') is distinct from 'boolean'
  or jsonb_typeof(command->'expected_revision') is distinct from 'number' or (command->>'expected_revision') !~ '^[0-9]+$' then
  raise exception 'Choose valid availability settings' using errcode='22023'; end if;
 perform 1 from public.workspace_scheduling_settings where workspace_id=w for update;
 model:=public.weekly_preference_settings_read_service(actor,w); prior:=model->'settings';
 if (command->>'expected_revision')::integer is distinct from (prior->>'revision')::integer then
  raise exception 'Availability settings changed. Reload the latest settings before saving.' using errcode = 'PT409'; end if;
 if command->>'input_mode'='shift_type' and jsonb_array_length(model->'missing_shift_types')>0 then
  raise exception 'Complete default hours for all active shift types before using shift type availability' using errcode='22023',detail=(model->'missing_shift_types')::text; end if;
 if (command-'expected_revision') is distinct from (prior-'revision') then
  update public.workspace_scheduling_settings set availability_input_mode=command->>'input_mode',
   availability_onboarding_required=(command->>'onboarding_required')::boolean,updated_at=now() where workspace_id=w;
  model:=public.weekly_preference_settings_read_service(actor,w);
  insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata)
   values(w,actor,'availability.settings_updated','scheduling_settings',w::text,jsonb_build_object('before',prior,'after',model->'settings'));
  if prior->>'input_mode' is distinct from command->>'input_mode' then
   -- Every employee is told, active or still onboarding, whether or not they
   -- had saved a week (M4, D4); a manager whose note was converted is not.
   select coalesce(array_agg(distinct e.user_id),'{}') into recipients from public.employee_profiles e
    join public.workspace_memberships m on m.workspace_id=e.workspace_id and m.user_id=e.user_id and m.status in ('active','pending_activation')
    where e.workspace_id=w and e.archived_at is null and app_private.ranks_as_employee(w,e.user_id);
   with history as (
    insert into public.weekly_preference_events(workspace_id,employee_id,source,actor_user_id,before_record,after_record)
    select w,p.employee_id,'employee',actor,jsonb_build_object('revision',p.revision,'preference',p.preference),
     jsonb_build_object('revision',p.revision+1,'preference',public.weekly_preference_convert(w,p.preference,command->>'input_mode'))
    from public.employee_weekly_preferences p where p.workspace_id=w and p.preference->>'input_mode'<>command->>'input_mode'
    returning employee_id,after_record)
   update public.employee_weekly_preferences p set preference=h.after_record->'preference',revision=p.revision+1,updated_by=actor,updated_at=now()
    from history h where p.workspace_id=w and p.employee_id=h.employee_id;
   with history as (
    insert into public.weekly_preference_events(workspace_id,employee_id,source,actor_user_id,before_record,after_record)
    select w,p.employee_id,'manager',actor,jsonb_build_object('revision',p.revision,'preference',p.preference),
     jsonb_build_object('revision',p.revision+1,'preference',public.weekly_preference_convert(w,p.preference,command->>'input_mode'))
    from public.manager_weekly_reminders p where p.workspace_id=w and p.preference->>'input_mode'<>command->>'input_mode'
    returning employee_id,after_record)
   update public.manager_weekly_reminders p set preference=h.after_record->'preference',revision=p.revision+1,updated_by=actor,updated_at=now()
    from history h where p.workspace_id=w and p.employee_id=h.employee_id;
   perform public.enqueue_notification_outbox_service(w,event,'availability.status_changed',1,actor,'availability_settings',w::text,
    jsonb_build_object('recipient_user_ids',to_jsonb(recipients),'audience_contract','availability_scoped_recipients','category','request',
     'title','Check your availability','body','Your organization changed how availability is entered. Your saved week was converted; check that it is still right.',
     'safe_preview','Availability entry settings changed.','action_url','/app/employee-hub/my-availability',
     'input_mode',command->>'input_mode','group_key','availability-settings:'||w::text),now());
  end if;
 end if;
 insert into public.weekly_preference_commands(workspace_id,actor_user_id,request_key,command,result) values(w,actor,request_key,envelope,'{}');
 return model;
end; $_$;

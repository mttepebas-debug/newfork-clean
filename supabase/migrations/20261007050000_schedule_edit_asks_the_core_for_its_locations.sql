-- EKRAN-01 DB-1a (B-1, B-3, B-9, BL-159, BL-412): an open Schedule edit is
-- asked of the authorization core for its locations, and a draft somebody
-- cannot reach answers like one that does not exist.
--
-- Beşiktaş manager Can could save his edit into Kadıköy manager Ayşe's
-- Kadıköy-only draft (renaming it, widening it to Beşiktaş, making Ayşe's own
-- save stale), open it and learn who edits it, and tell an existing draft from
-- an unknown one. Ayşe, taken off Kadıköy, kept her open Kadıköy edit alive:
-- reading, saving, holding the draft's lease.
--
-- Now:
-- * Save writes into the draft the edit was opened from, a new draft, or a
--   draft the core lets the person write at all its locations. Opening a draft
--   and reading a draft's week need the draft to touch the person's
--   locations (the rule the drafts menu already lists by). Anything else,
--   unknown included: 42501 + authz.out_of_scope.
-- * Heartbeat, read and save ask the core for the edit's locations again.
--   An edit whose holder lost a location is closed as an expired one is
--   (unsaved work to a recovery draft) when anybody opens that draft or the
--   holder opens the week again.
-- * Refusals carry their reason; "past schedule week is closed" is a rule of
--   the week, not of the person: P0001 + schedule.past_week_closed.
--
-- One shared step closes an edit (app_private.close_schedule_edit_session);
-- DB-1b's auto-save builds on it.

create function app_private.close_schedule_edit_session(edit public.schedule_edit_sessions)
returns uuid
language plpgsql
set search_path to ''
as $function$
declare recovery_draft_id uuid;
begin
  -- Unsaved work becomes a recovery draft; nothing of it is deleted.
  if edit.dirty then
    insert into public.schedule_drafts (
      workspace_id, week_start, name, created_by, updated_by, location_ids, base_publication_ids
    ) values (
      edit.workspace_id, edit.week_start,
      'Recovered edit ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS') || ' ' || left(edit.id::text, 4),
      edit.holder_user_id, edit.holder_user_id, edit.location_ids, edit.base_publication_ids
    ) returning id into recovery_draft_id;
    insert into public.schedule_draft_shifts (id, workspace_id, draft_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, revision, label_ids, label_names)
    select id, workspace_id, recovery_draft_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, revision, label_ids, label_names
    from public.schedule_edit_session_shifts
    where session_id = edit.id;
  end if;
  update public.schedule_edit_sessions
  set status = case when recovery_draft_id is null then 'expired'::public.schedule_edit_session_status
                    else 'recovered'::public.schedule_edit_session_status end,
      recovered_draft_id = recovery_draft_id,
      closed_at = now()
  where id = edit.id;
  return recovery_draft_id;
end;
$function$;
revoke all on function app_private.close_schedule_edit_session(public.schedule_edit_sessions) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.acquire_schedule_edit_session_service(actor_user_id uuid, target_workspace_id uuid, target_week_start date, requested_source schedule_edit_source, requested_draft_id uuid DEFAULT NULL::uuid, target_location_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_week_start date;
  manageable uuid[];
  effective uuid[];
  adding uuid[];
  own_session public.schedule_edit_sessions%rowtype;
  holder public.schedule_edit_sessions%rowtype;
  source_draft public.schedule_drafts%rowtype;
  edit_session_id uuid;
  session_source public.schedule_edit_source;
  session_draft_id uuid;
  recovery_draft_id uuid;
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

  perform public.availability_lock_workspace(target_workspace_id);

  -- Where this person may edit: the live locations the core gives.
  manageable := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.edit');
  select coalesce(array_agg(location.id order by location.id), '{}') into manageable
  from public.locations location
  where location.workspace_id = target_workspace_id
    and location.archived_at is null
    and location.id = any(manageable);
  select coalesce(array_agg(distinct requested order by requested), '{}') into effective
  from unnest(coalesce(target_location_ids, manageable)) requested
  where requested = any(manageable);
  if cardinality(effective) = 0 then
    -- Nothing here to edit: asked of no place, the core answers with the
    -- person's reason (no permission, blocked) or out_of_scope.
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit', target_locations => array[null]::uuid[]);
  end if;

  select * into own_session
  from public.schedule_edit_sessions session
  where session.workspace_id = target_workspace_id
    and session.week_start = target_week_start
    and session.holder_user_id = actor_user_id
    and session.status = 'active'
  for update;
  -- The person's own edit reaching a location they no longer edit closes;
  -- they start again where they may (B-3).
  if own_session.id is not null
    and app_private.authz_reason(actor_user_id, target_workspace_id, 'schedule.edit', own_session.location_ids) is not null then
    perform app_private.close_schedule_edit_session(own_session);
    own_session := null;
  end if;
  adding := array(
    select location_id from unnest(effective) location_id
    where own_session.id is null or not location_id = any(own_session.location_ids)
  );

  if own_session.id is null and requested_source = 'draft' then
    select * into source_draft
    from public.schedule_drafts draft
    where draft.id = requested_draft_id
      and draft.workspace_id = target_workspace_id
      and draft.week_start = target_week_start
      and draft.archived_at is null
      and draft.location_ids && manageable;
    -- A draft touching none of the person's locations is not there for them.
    if source_draft.id is null then
      raise exception 'Not allowed' using errcode = '42501', detail = 'schedule.edit', hint = 'authz.out_of_scope';
    end if;

    -- One person edits a draft at a time: say who, take nothing.
    select * into holder
    from public.schedule_edit_sessions session
    where session.source_draft_id = source_draft.id
      and session.status = 'active'
    for update;
    -- An edit whose holder may no longer edit all of it holds nothing (B-3).
    if holder.id is not null and holder.expires_at > now()
      and app_private.authz_reason(holder.holder_user_id, target_workspace_id, 'schedule.edit', holder.location_ids) is null then
      return jsonb_build_object(
        'status', 'conflict',
        'session_id', holder.id,
        'holder_name', coalesce((
          select profile.display_name from public.user_profiles profile
          where profile.user_id = holder.holder_user_id
        ), 'Another manager'),
        'last_heartbeat', holder.last_heartbeat,
        'expires_at', holder.expires_at
      );
    end if;

    -- An expired edit of the draft closes; unsaved work becomes a recovery draft.
    if holder.id is not null then
      recovery_draft_id := app_private.close_schedule_edit_session(holder);
    end if;
  end if;

  if own_session.id is not null then
    -- BL-069: the same person picks their edit back up, widened to the new locations.
    update public.schedule_edit_sessions
    set last_heartbeat = now(),
        expires_at = now() + interval '4 minutes',
        location_ids = array(
          select distinct location_id from unnest(own_session.location_ids || adding) location_id
          order by location_id
        ),
        base_publication_ids = own_session.base_publication_ids || app_private.schedule_edit_starting_point(
          target_workspace_id, target_week_start, adding, own_session.source_draft_id
        )
    where id = own_session.id;
    edit_session_id := own_session.id;
    session_source := own_session.source_kind;
    session_draft_id := own_session.source_draft_id;
  else
    insert into public.schedule_edit_sessions (
      workspace_id, week_start, source_kind, source_draft_id, source_revision,
      holder_user_id, location_ids, base_publication_ids
    ) values (
      target_workspace_id, target_week_start, requested_source,
      case when requested_source = 'draft' then source_draft.id end,
      case when requested_source = 'draft' then source_draft.revision else 0 end,
      actor_user_id, effective,
      app_private.schedule_edit_starting_point(target_workspace_id, target_week_start, effective, source_draft.id)
    ) returning id into edit_session_id;
    session_source := requested_source;
    session_draft_id := source_draft.id;
  end if;

  if session_source = 'published' then
    insert into public.schedule_edit_session_shifts (id, workspace_id, session_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, label_ids, label_names)
    select shift.source_shift_id, shift.workspace_id, edit_session_id, shift.location_id, shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date, shift.start_time, shift.end_time, shift.time_basis, shift.time_snapshot, shift.time_timezone, shift.unpaid_break_minutes, shift.hide_time_on_badge, shift.note, shift.label_ids, shift.label_names
    from public.schedule_published_shifts shift
    join public.schedule_location_publications publication on publication.id = shift.publication_id
    where shift.workspace_id = target_workspace_id
      and publication.week_start = target_week_start
      and publication.status = 'current'
      and shift.location_id = any(adding);
  elsif session_source = 'draft' then
    insert into public.schedule_edit_session_shifts (id, workspace_id, session_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, revision, label_ids, label_names)
    select shift.id, shift.workspace_id, edit_session_id, shift.location_id, shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date, shift.start_time, shift.end_time, shift.time_basis, shift.time_snapshot, shift.time_timezone, shift.unpaid_break_minutes, shift.hide_time_on_badge, shift.note, shift.revision, shift.label_ids, shift.label_names
    from public.schedule_draft_shifts shift
    where shift.draft_id = session_draft_id
      and shift.location_id = any(adding);
  end if;

  return jsonb_build_object(
    'status', case
      when own_session.id is not null then 'resumed'
      when recovery_draft_id is not null then 'acquired_after_recovery'
      else 'acquired'
    end,
    'session', public.get_schedule_edit_session_service(actor_user_id, target_workspace_id, edit_session_id),
    'recovered_draft_id', recovery_draft_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.save_schedule_edit_session_service(actor_user_id uuid, target_workspace_id uuid, target_session_id uuid, expected_session_revision integer, target_name text, target_draft_id uuid DEFAULT NULL::uuid, expected_draft_revision integer DEFAULT NULL::integer, acknowledge_past_edits boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_session public.schedule_edit_sessions%rowtype;
  saved_draft public.schedule_drafts%rowtype;
  reach uuid[];
  current_week_start date;
  findings jsonb := '[]'::jsonb;
  blocked_findings jsonb := '[]'::jsonb;
  warning_findings jsonb := '[]'::jsonb;
  session_labels jsonb;
  result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,921));
  perform public.shift_exchange_assert_session(target_workspace_id,target_session_id);

  -- a. A past week never changes; a shift that already started changes only
  -- when the person says they know.
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
  -- The edit's locations are still the person's to edit (B-3), and the draft
  -- it writes into is the one it was opened from, a new one, or one the core
  -- lets the person write at all its locations (B-1).
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit', target_locations => target_session.location_ids);
  if target_draft_id is distinct from target_session.source_draft_id and target_draft_id is not null then
    select * into saved_draft from public.schedule_drafts draft
    where draft.id = target_draft_id and draft.workspace_id = target_workspace_id
      and draft.week_start = target_session.week_start and draft.archived_at is null;
    if saved_draft.id is null then
      raise exception 'Not allowed' using errcode = '42501', detail = 'schedule.edit', hint = 'authz.out_of_scope';
    end if;
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit', target_locations => saved_draft.location_ids);
    saved_draft := null;
  end if;

  reach := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.edit');
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
      and shift.location_id = any(reach);

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
      and shift.location_id = any(reach)
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

  -- b. The labels, kept aside: the draft rows are written fresh.
  perform public.availability_lock_workspace(target_workspace_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', shift.id,
    'label_ids', to_jsonb(coalesce(shift.label_ids, '{}'::uuid[])),
    'label_names', to_jsonb(coalesce(shift.label_names, '{}'::text[]))
  )), '[]'::jsonb)
  into session_labels
  from public.schedule_edit_session_shifts shift
  join public.schedule_edit_sessions session
    on session.id = shift.session_id
   and session.workspace_id = shift.workspace_id
  where shift.session_id = target_session_id
    and shift.workspace_id = target_workspace_id
    and session.holder_user_id = actor_user_id;

  -- c. Pending deletes go, then the draft is written.
  delete from public.schedule_edit_session_shifts shift
  using public.schedule_edit_sessions session
  where session.id = target_session_id
    and session.workspace_id = target_workspace_id
    and session.holder_user_id = actor_user_id
    and session.status = 'active'
    and shift.session_id = session.id
    and shift.pending_op_type = 'delete';

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
        workspace_id, week_start, name, created_by, updated_by, location_ids, base_publication_ids
      ) values (
        target_workspace_id, target_session.week_start, btrim(target_name),
        actor_user_id, actor_user_id, target_session.location_ids, target_session.base_publication_ids
      ) returning * into saved_draft;
    else
      update public.schedule_drafts draft
      set name = btrim(target_name), revision = revision + 1,
        updated_by = actor_user_id, updated_at = now(),
        location_ids = array(
          select distinct location_id from unnest(draft.location_ids || target_session.location_ids) location_id
          order by location_id
        ),
        -- The edit's locations now start where the edit started.
        base_publication_ids = array(
          select base_id from unnest(draft.base_publication_ids) base_id
          where not exists (
            select 1 from public.schedule_location_publications publication
            where publication.id = base_id
              and publication.location_id = any(target_session.location_ids)
          )
        ) || target_session.base_publication_ids
      where draft.id = target_draft_id and draft.workspace_id = target_workspace_id
        and draft.week_start = target_session.week_start and draft.archived_at is null
        and draft.revision = expected_draft_revision
      returning * into saved_draft;
      if saved_draft.id is null then
        raise exception 'draft revision stale' using errcode = '40001';
      end if;
    end if;

    -- BL-097: only the locations this session holds are replaced; the rest of
    -- the draft stays as it was.
    delete from public.schedule_draft_shifts shift
    where shift.draft_id = saved_draft.id
      and shift.location_id = any(target_session.location_ids);
    insert into public.schedule_draft_shifts (id, workspace_id, draft_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, revision)
    select shift.id, shift.workspace_id, saved_draft.id, shift.location_id, shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date, shift.start_time, shift.end_time, shift.time_basis, shift.time_snapshot, shift.time_timezone, shift.unpaid_break_minutes, shift.hide_time_on_badge, shift.note, shift.revision from public.schedule_edit_session_shifts shift
    where shift.session_id = target_session_id;

    delete from public.schedule_edit_session_shifts where session_id = target_session_id;
    update public.schedule_edit_sessions
    set status = 'saved', dirty = false, closed_at = now(), expires_at = now()
    where id = target_session_id;

    result := jsonb_build_object(
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

  -- d. The labels back on the draft rows.
  update public.schedule_draft_shifts draft_shift
     set label_ids = coalesce(label_row.label_ids, '{}'::uuid[]),
         label_names = coalesce(label_row.label_names, '{}'::text[])
    from jsonb_to_recordset(session_labels) as label_row(
      id uuid,
      label_ids uuid[],
      label_names text[]
    )
   where draft_shift.draft_id = saved_draft.id
     and draft_shift.id = label_row.id
     and draft_shift.workspace_id = target_workspace_id;

  return result;
exception when serialization_failure then raise exception '%',SQLERRM using errcode='PT409';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.heartbeat_schedule_edit_session_service(actor_user_id uuid, target_workspace_id uuid, target_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- The edit's locations are still the person's to edit (B-3).
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit', target_locations => session.location_ids)
  from public.schedule_edit_sessions session
  where session.id = target_session_id and session.workspace_id = target_workspace_id
    and session.holder_user_id = actor_user_id;
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_schedule_edit_session_service(actor_user_id uuid, target_workspace_id uuid, target_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- The edit's locations are still the person's to edit (B-3).
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit', target_locations => target_session.location_ids);

  with week_availability as materialized (
    select * from app_private.schedule_week_availability(
      target_workspace_id, target_session.week_start,
      array(select distinct s.employee_id from public.schedule_edit_session_shifts s
            where s.session_id = target_session.id and s.employee_id is not null),
      array(select distinct s.location_id from public.schedule_edit_session_shifts s
            where s.session_id = target_session.id))
  )
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
    'location_ids', to_jsonb(target_session.location_ids),
    'shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', shift.id,
        'location_id', shift.location_id,
        'employee_id', shift.employee_id,
        'job_id', shift.job_id,
        'shift_type_id', shift.shift_type_id,
        'scheduled_date', shift.scheduled_date,
        'time_basis',shift.time_basis,'time_snapshot',shift.time_snapshot,'time_timezone',shift.time_timezone,'start_time', to_char(shift.start_time, 'HH24:MI'),
        'end_time', to_char(shift.end_time, 'HH24:MI'),
        'crosses_midnight', shift.crosses_midnight,
        'unpaid_break_minutes', coalesce(shift.unpaid_break_minutes, 0),
        'hide_time_on_badge', coalesce(shift.hide_time_on_badge, false),
        'note', shift.note,
        'revision', shift.revision,
        'source_published_shift_id', shift.source_published_shift_id,
        'pending_op_type', shift.pending_op_type,
        'locked', shift.locked,
        'label_ids', to_jsonb(coalesce(shift.label_ids, '{}'::uuid[])),
        'label_names', to_jsonb(coalesce(shift.label_names, '{}'::text[])),
        'warning_codes', to_jsonb(array_remove(array[
          case when exists (
            select 1 from public.schedule_closures closure
            where closure.location_id = shift.location_id
              and closure.closed_date = shift.scheduled_date and closure.is_all_day
          ) then 'closed_location' end,
          -- Today's marks and approved leave, published or not (BL-186).
          case when shift.employee_id is not null and exists (select 1 from week_availability week
            where week.employee_id = shift.employee_id and week.location_id = shift.location_id
              and (week.unavailable + week.leave) && app_private.shift_time_range(shift.scheduled_date, shift.start_time, shift.end_time, shift.time_timezone)
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
$function$
;

CREATE OR REPLACE FUNCTION public.create_schedule_shifts_batch_service(actor uuid, w uuid, sid uuid, expected_revision integer, shifts jsonb, request_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare session public.schedule_edit_sessions%rowtype; receipt public.schedule_shift_batch_commands%rowtype;
 item jsonb; result jsonb; next_revision integer;
begin
 if jsonb_typeof(shifts) is distinct from 'array' then
  raise exception 'Choose 1 to 200 shifts' using errcode='22023'; end if;
 if jsonb_array_length(shifts) not between 1 and 200 or request_key is null or expected_revision is null
  or exists(select 1 from jsonb_array_elements(shifts) v where jsonb_typeof(v) is distinct from 'object') then
  raise exception 'Valid shifts, revision and request key required' using errcode='22023'; end if;
 perform public.availability_lock_workspace(w);
 select * into session from public.schedule_edit_sessions where workspace_id=w and id=sid for update;
 if session.id is null or session.holder_user_id is distinct from actor then
  raise exception 'Not allowed' using errcode = '42501', detail = 'schedule.edit', hint = 'authz.out_of_scope'; end if;
 -- The edit's locations are still the person's to edit (B-3).
 perform app_private.authorize(actor, w, 'schedule.edit', target_locations => session.location_ids);
 perform app_private.authorize(actor, w, 'schedule.edit', target_locations => array(
  select distinct nullif(v->>'location_id','')::uuid from jsonb_array_elements(shifts) v));
 if session.status<>'active' or session.expires_at<=now() then
  raise exception 'Schedule editing expired; reopen the schedule' using errcode='40001'; end if;
 select * into receipt from public.schedule_shift_batch_commands c
  where c.workspace_id=w and c.actor_user_id=actor and c.idempotency_key=request_key;
 if found then
  if receipt.session_id is distinct from sid or receipt.expected_revision is distinct from expected_revision or receipt.shifts is distinct from shifts then
   raise exception 'Request key already used for a different batch' using errcode='40001'; end if;
  return public.get_schedule_edit_session_service(actor,w,sid);
 end if;
 if session.revision is distinct from expected_revision then
  raise exception 'Schedule editing changed; reload before pasting' using errcode='40001'; end if;
 next_revision:=session.revision;
 for item in select value from jsonb_array_elements(shifts) loop
  result:=public.mutate_schedule_edit_shift_service(actor,w,sid,next_revision,'create',gen_random_uuid(),null,item,gen_random_uuid());
  next_revision:=(result->>'revision')::integer;
 end loop;
 insert into public.schedule_shift_batch_commands(workspace_id,actor_user_id,idempotency_key,session_id,expected_revision,shifts)
  values(w,actor,request_key,sid,expected_revision,shifts);
 return result;
end; $function$
;

CREATE OR REPLACE FUNCTION public.unpublish_schedule_service(actor_user_id uuid, target_workspace_id uuid, target_week_start date, target_location_ids uuid[], expected_fingerprint text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  preview jsonb;
  normalized_locations uuid[];
  publication_ids uuid[];
  effective_unpublished_at timestamptz := now();
begin
  perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,921));
  select array_agg(distinct location_id order by location_id) into normalized_locations
  from unnest(target_location_ids) location_id;
  perform 1 from public.schedule_location_publications publication
  where publication.workspace_id = target_workspace_id
    and publication.week_start = target_week_start
    and publication.location_id = any(normalized_locations)
    and publication.status = 'current' for update;
  -- The preview asks the core for every location.
  preview := public.preview_schedule_unpublication_service(
    actor_user_id, target_workspace_id, target_week_start, normalized_locations
  );
  if preview->>'status' = 'past_week_closed' then
    raise exception 'past schedule week is closed' using errcode = 'P0001', hint = 'schedule.past_week_closed';
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
    'unpublished_at', effective_unpublished_at
  );
exception when serialization_failure then raise exception '%',SQLERRM using errcode='PT409';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.publish_schedule_draft_service(actor_user_id uuid, target_workspace_id uuid, target_draft_id uuid, target_location_ids uuid[], target_department_ids uuid[], include_no_department boolean, expected_draft_revision integer, expected_fingerprint text, override_decisions jsonb DEFAULT '[]'::jsonb, target_notify_employee_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  requested uuid;
  result jsonb;
  notification_event_id uuid;
  normalized_recipient_ids uuid[];
  result_publication_ids uuid[];
  target_draft public.schedule_drafts%rowtype;
  preview jsonb;
  location_item jsonb;
  finding jsonb;
  decision jsonb;
  new_publication_id uuid;
  previous_publication_id uuid;
  publication_ids uuid[] := '{}'::uuid[];
  normalized_locations uuid[];
  normalized_departments uuid[];
  effective_include_no_department boolean := coalesce(include_no_department, true);
  total_shift_count integer := 0;
  published_at timestamptz := now();
begin
  if cardinality(coalesce(target_location_ids, '{}'::uuid[])) = 0 then
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.publish', target_locations => '{}'::uuid[]);
  end if;
  foreach requested in array target_location_ids loop
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.publish', target_locations => array[requested]);
  end loop;
  perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,921));

  perform public.availability_lock_workspace(target_workspace_id);
  select * into target_draft from public.schedule_drafts draft
  where draft.id = target_draft_id and draft.workspace_id = target_workspace_id
    and draft.archived_at is null for update;
  if target_draft.id is null then raise exception 'schedule draft not found' using errcode = 'P0002'; end if;
  if target_draft.revision <> expected_draft_revision then
    raise exception 'stale publication preview' using errcode = '40001';
  end if;
  select array_agg(distinct location_id order by location_id) into normalized_locations
  from unnest(target_location_ids) location_id;

  if target_department_ids is not null then
    select coalesce(array_agg(distinct department.id order by department.id), '{}'::uuid[])
    into normalized_departments
    from public.departments department
    join unnest(target_department_ids) requested(id) on requested.id = department.id
    where department.workspace_id = target_workspace_id
      and department.archived_at is null;

    if cardinality(normalized_departments) = 0
      and not effective_include_no_department then
      raise exception 'invalid department publication scope' using errcode = '22023';
    end if;
  end if;

  perform 1 from public.schedule_location_publications publication
  where publication.workspace_id = target_workspace_id
    and publication.week_start = target_draft.week_start
    and publication.location_id = any(normalized_locations) for update;

  preview := public.preview_schedule_publication_service(
    actor_user_id,
    target_workspace_id,
    target_draft_id,
    normalized_locations,
    normalized_departments,
    effective_include_no_department
  );
  if preview->>'status' = 'past_week_closed' then
    raise exception 'past schedule week is closed' using errcode = 'P0001', hint = 'schedule.past_week_closed';
  end if;
  if preview->>'fingerprint' <> expected_fingerprint then
    raise exception 'stale publication preview' using errcode = '40001';
  end if;
  if preview->>'status' = 'hard_blocked' then
    raise exception 'schedule has hard publication blockers' using errcode = '23514';
  end if;
  if jsonb_typeof(coalesce(override_decisions, '[]'::jsonb)) <> 'array' then
    raise exception 'publication overrides must be an array' using errcode = '22023';
  end if;
  -- The one place that says which findings are recorded and with which
  -- sentence (BL-190); the publisher's id and the time go with each row.
  override_decisions:=public.weekly_publication_decisions(preview,override_decisions);
  perform set_config('newfork.schedule_publish_scope',jsonb_build_object('workspace_id',target_workspace_id,'draft_id',target_draft_id,
   '_publish_locations',(select jsonb_agg(x->'location_id') from jsonb_array_elements(preview->'locations') x),
   '_publish_departments',preview->'department_ids','_publish_no_department',coalesce((preview->>'include_no_department')::boolean,true))::text,true);
  for location_item in select value from jsonb_array_elements(preview->'locations')
  loop
    previous_publication_id := nullif(location_item->>'active_publication_id', '')::uuid;
    new_publication_id := gen_random_uuid();
    if previous_publication_id is not null then
      update public.schedule_location_publications
      set status = 'superseded'
      where id = previous_publication_id and status = 'current';
      if not found then raise exception 'stale publication preview' using errcode = '40001'; end if;
    end if;
    insert into public.schedule_location_publications (
      id, workspace_id, location_id, week_start, version_number, status,
      published_by, published_at, source_draft_id, source_draft_revision,
      content_fingerprint, department_ids, include_no_department
    ) values (
      new_publication_id, target_workspace_id, (location_item->>'location_id')::uuid,
      target_draft.week_start,
      coalesce((select max(version_number) + 1 from public.schedule_location_publications
        where location_id = (location_item->>'location_id')::uuid and week_start = target_draft.week_start), 1),
      'current', actor_user_id, published_at, target_draft.id, target_draft.revision,
      expected_fingerprint, normalized_departments, effective_include_no_department
    );
    for finding in select value from jsonb_array_elements(preview->'findings')
    loop
      if finding->>'severity' <> 'soft'
        or finding->>'location_id' <> location_item->>'location_id' then continue; end if;
      select value into decision from jsonb_array_elements(override_decisions)
      where value->>'finding_id' = finding->>'id' limit 1;
      if decision is null then continue; end if;
      insert into public.schedule_publication_overrides (
        workspace_id, publication_id, source_draft_id, source_draft_revision,
        finding_id, finding_code, employee_id, location_id, scheduled_date,
        source_shift_ids, reason, actor_user_id
      ) values (
        target_workspace_id, new_publication_id, target_draft.id, target_draft.revision,
        finding->>'id', finding->>'code', nullif(finding->>'employee_id', '')::uuid,
        (finding->>'location_id')::uuid, (finding->>'scheduled_date')::date,
        array(select jsonb_array_elements_text(finding->'shift_ids')::uuid),
        btrim(decision->>'reason'), actor_user_id
      );
    end loop;
    if previous_publication_id is not null then
      update public.schedule_location_publications
      set superseded_by = new_publication_id
      where id = previous_publication_id;

      insert into public.schedule_published_shifts (workspace_id, location_id, publication_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, source_shift_id, label_ids, label_names)
      select shift.workspace_id, shift.location_id, new_publication_id, shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date, shift.start_time, shift.end_time, shift.time_basis, shift.time_snapshot, shift.time_timezone, shift.unpaid_break_minutes, shift.hide_time_on_badge, shift.note, shift.source_shift_id, shift.label_ids, shift.label_names from public.schedule_published_shifts shift
      where shift.publication_id = previous_publication_id
        and not public.schedule_shift_in_department_scope_service(
          shift.job_id, normalized_departments, effective_include_no_department
        );
    end if;

    insert into public.schedule_published_shifts (workspace_id, location_id, publication_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, source_shift_id, label_ids, label_names)
    select shift.workspace_id, shift.location_id, new_publication_id, shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date, shift.start_time, shift.end_time, shift.time_basis, shift.time_snapshot, shift.time_timezone, shift.unpaid_break_minutes, shift.hide_time_on_badge, shift.note, shift.id, shift.label_ids, shift.label_names from public.schedule_draft_shifts shift
    where shift.draft_id = target_draft.id
      and shift.location_id = (location_item->>'location_id')::uuid
      and public.schedule_shift_in_department_scope_service(
        shift.job_id, normalized_departments, effective_include_no_department
      );
    publication_ids := array_append(publication_ids, new_publication_id);

  end loop;

  select count(*)::integer into total_shift_count
  from public.schedule_published_shifts shift where shift.publication_id = any(publication_ids);
  insert into public.schedule_publication_events (
    workspace_id, week_start, action, actor_user_id, location_ids,
    source_draft_id, source_draft_revision, publication_ids,
    preflight_fingerprint, diff_summary
  ) values (
    target_workspace_id, target_draft.week_start, 'published', actor_user_id,
    normalized_locations, target_draft.id, target_draft.revision, publication_ids,
    expected_fingerprint,
    jsonb_build_object(
      'locations', preview->'locations',
      'department_ids', to_jsonb(normalized_departments),
      'include_no_department', effective_include_no_department
    )
  );
  result := jsonb_build_object(
    'status', 'published', 'workspace_id', target_workspace_id,
    'week_start', target_draft.week_start, 'draft_id', target_draft.id,
    'draft_revision', target_draft.revision, 'location_ids', to_jsonb(normalized_locations),
    'publication_ids', to_jsonb(publication_ids), 'published_shift_count', total_shift_count,
    'published_at', published_at
  );

  -- Nobody missing a required document goes out on the published week.
  if public.schedule_draft_has_hard_document_conflicts_service(
      actor_user_id,
      target_workspace_id,
      target_draft_id,
      (result->>'week_start')::date,
      target_location_ids,
      target_department_ids,
      include_no_department
    ) then
    raise exception 'schedule has hard document blockers' using errcode = '23514';
  end if;

  -- The people named hear that their week is out.
  if coalesce(cardinality(target_notify_employee_ids), 0) = 0 then
    return result;
  end if;

  select array(
    select jsonb_array_elements_text(result->'publication_ids')::uuid
  ) into result_publication_ids;

  select coalesce(array_agg(distinct employee.id order by employee.id), '{}'::uuid[])
  into normalized_recipient_ids
  from public.employee_profiles employee
  join public.workspace_memberships membership
    on membership.workspace_id = employee.workspace_id
   and membership.user_id = employee.user_id
   and membership.status = 'active'
  where employee.workspace_id = target_workspace_id
    and employee.id = any(target_notify_employee_ids)
    and employee.archived_at is null
    and exists (
      select 1
      from public.schedule_published_shifts shift
      where shift.workspace_id = target_workspace_id
        and shift.publication_id = any(result_publication_ids)
        and shift.employee_id = employee.id
    );

  if cardinality(normalized_recipient_ids) = 0 then
    return result;
  end if;

  notification_event_id := gen_random_uuid();
  perform public.enqueue_notification_outbox_service(
    target_workspace_id,
    notification_event_id,
    'schedule.published',
    1,
    actor_user_id,
    'schedule_week',
    result->>'week_start',
    jsonb_build_object(
      'correlation_id', notification_event_id,
      'week_start', result->>'week_start',
      'publication_ids', result->'publication_ids',
      'location_ids', result->'location_ids',
      'recipient_employee_ids', to_jsonb(normalized_recipient_ids)
    ),
    (result->>'published_at')::timestamptz
  );

  return result || jsonb_build_object(
    'notification_event_id', notification_event_id,
    'notification_enqueued_count', cardinality(normalized_recipient_ids)
  );
exception when serialization_failure then raise exception '%',SQLERRM using errcode='PT409';
end;
$function$
;

CREATE OR REPLACE FUNCTION app_private.keep_session_shift_in_session_locations()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if not exists (
    select 1 from public.schedule_edit_sessions session
    where session.id = new.session_id and new.location_id = any(session.location_ids)
  ) then
    raise exception 'shift location is outside this edit' using errcode = '42501', detail = 'schedule.edit', hint = 'authz.out_of_scope';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_schedule_weekly_shifts_service(actor_user_id uuid, target_workspace_id uuid, target_week_start date, target_location_ids uuid[] DEFAULT NULL::uuid[], target_draft_id uuid DEFAULT NULL::uuid, include_live_context boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  result jsonb;
  reason text;
  reachable uuid[];
begin
  -- May they read any week at all; which locations, the core answers.
  reason := app_private.authz_check(app_private.actor(actor_user_id, target_workspace_id),
    (select r from app_private.authz_actions r where r.key = 'schedule.read'), null, null, null);
  if reason is not null and reason <> 'out_of_scope' then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || reason, detail = 'schedule.read';
  end if;
  reachable := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.read');

  if target_draft_id is not null and not exists (
    select 1
    from public.schedule_drafts draft
    where draft.id = target_draft_id
      and draft.workspace_id = target_workspace_id
      and draft.week_start = target_week_start
      and draft.archived_at is null
      and draft.location_ids && reachable
  ) then
    -- A draft touching none of the person's locations is not there for them (BL-412).
    raise exception 'Not allowed' using errcode = '42501', detail = 'schedule.read', hint = 'authz.out_of_scope';
  end if;

  with requested_locations as (
    select unnest(coalesce(target_location_ids, array[]::uuid[])) as id
  ), allowed_locations as (
    select location.id
    from public.locations location
    where location.workspace_id = target_workspace_id
      and location.archived_at is null
      and location.id = any(reachable)
      and (
        coalesce(array_length(target_location_ids, 1), 0) = 0
        or location.id in (select id from requested_locations)
      )
  ), current_publications as (
    select publication.*
    from public.schedule_location_publications publication
    join allowed_locations location on location.id = publication.location_id
    where publication.workspace_id = target_workspace_id
      and publication.week_start = target_week_start
      and publication.status = 'current'
  ), draft_shifts as (
    select
      shift.id,
      shift.workspace_id,
      shift.location_id,
      shift.employee_id,
      shift.job_id,
      shift.shift_type_id,
      shift.scheduled_date,
      shift.start_time,
      shift.end_time,
      shift.crosses_midnight,
      shift.unpaid_break_minutes,
      shift.note
    from public.schedule_draft_shifts shift
    join allowed_locations location on location.id = shift.location_id
    where target_draft_id is not null
      and shift.workspace_id = target_workspace_id
      and shift.draft_id = target_draft_id
      and shift.scheduled_date between target_week_start and target_week_start + 6
  ), published_shifts as (
    select
      shift.source_shift_id as id,
      shift.workspace_id,
      shift.location_id,
      shift.employee_id,
      shift.job_id,
      shift.shift_type_id,
      shift.scheduled_date,
      shift.start_time,
      shift.end_time,
      shift.crosses_midnight,
      shift.unpaid_break_minutes,
      shift.note
    from public.schedule_published_shifts shift
    join current_publications publication on publication.id = shift.publication_id
    where shift.workspace_id = target_workspace_id
      and shift.scheduled_date between target_week_start and target_week_start + 6
  ), selected_shifts as (
    select * from draft_shifts
    union all
    select * from published_shifts where target_draft_id is null
  ), ghost_context as (
    select published.*
    from published_shifts published
    where include_live_context
      and target_draft_id is not null
      and not exists (
        select 1 from draft_shifts draft where draft.id = published.id
      )
  ), selected_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', shift.id,
      'location_id', shift.location_id,
      'employee_id', shift.employee_id,
      'job_id', shift.job_id,
      'shift_type_id', shift.shift_type_id,
      'scheduled_date', shift.scheduled_date,
      'start_time', to_char(shift.start_time, 'HH24:MI'),
      'end_time', to_char(shift.end_time, 'HH24:MI'),
      'crosses_midnight', shift.crosses_midnight,
      'unpaid_break_minutes', coalesce(shift.unpaid_break_minutes, 0),
      'note', shift.note,
      'warning_codes', to_jsonb(array_remove(array[
        case when exists (
          select 1
          from public.schedule_closures closure
          where closure.location_id = shift.location_id
            and closure.closed_date = shift.scheduled_date
            and closure.is_all_day
        ) then 'closed_location' end,
        case when shift.employee_id is not null and exists (
          select 1
          from selected_shifts other
          where other.employee_id = shift.employee_id
            and other.scheduled_date = shift.scheduled_date
            and other.id <> shift.id
            and not shift.crosses_midnight and not other.crosses_midnight
            and shift.start_time < other.end_time and shift.end_time > other.start_time
        ) then 'overlap' end
      ]::text[], null))
    ) order by shift.scheduled_date, shift.start_time, shift.id), '[]'::jsonb) as payload
    from selected_shifts shift
  ), ghost_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', shift.id,
      'location_id', shift.location_id,
      'employee_id', shift.employee_id,
      'job_id', shift.job_id,
      'shift_type_id', shift.shift_type_id,
      'scheduled_date', shift.scheduled_date,
      'start_time', to_char(shift.start_time, 'HH24:MI'),
      'end_time', to_char(shift.end_time, 'HH24:MI'),
      'crosses_midnight', shift.crosses_midnight,
      'unpaid_break_minutes', coalesce(shift.unpaid_break_minutes, 0),
      'note', shift.note,
      'warning_codes', to_jsonb(array_remove(array[
        case when exists (
          select 1
          from public.schedule_closures closure
          where closure.location_id = shift.location_id
            and closure.closed_date = shift.scheduled_date
            and closure.is_all_day
        ) then 'closed_location' end
      ]::text[], null))
    ) order by shift.scheduled_date, shift.start_time, shift.id), '[]'::jsonb) as payload
    from ghost_context shift
  )
  select jsonb_build_object(
    'shifts', selected_json.payload,
    'ghost_shifts', ghost_json.payload
  )
  into result
  from selected_json, ghost_json;

  return public.schedule_availability_enrich_read(actor_user_id,target_workspace_id,result,target_draft_id);
end;
$function$
;

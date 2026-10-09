-- BL-158: a shift keeps its tags wherever it is copied. The Schedule quick
-- editor saves a shift's labels on the draft; publishing, opening a week with
-- Edit, recovering an expired edit and the swap review copied every other
-- column but not label_ids / label_names, so an "On call" shift went out
-- untagged (on the employee's week and on another location's ghost card), or
-- lost its tag the first time the week was re-edited and saved.
--
-- Publishing: both copies into schedule_published_shifts now carry them: the
-- draft's shifts, and the shifts a department-scoped publish carries over from
-- the previous publication.
-- Body is the live definition from 20260926150000; only the two column lists grew.
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
  perform public.shift_exchange_assert_draft(target_workspace_id,target_draft_id,target_location_ids,target_department_ids,include_no_department);

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
    raise exception 'past schedule week is closed' using errcode = '42501';
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
  override_decisions:=public.weekly_publication_decisions(preview,override_decisions);
  perform set_config('newfork.schedule_publish_scope',jsonb_build_object('workspace_id',target_workspace_id,'draft_id',target_draft_id,
   '_publish_locations',(select jsonb_agg(x->'location_id') from jsonb_array_elements(preview->'locations') x),
   '_publish_departments',preview->'department_ids','_publish_no_department',coalesce((preview->>'include_no_department')::boolean,true))::text,true);
  for finding in select value from jsonb_array_elements(preview->'findings')
  loop
    if finding->>'severity' <> 'soft' then continue; end if;

    select value into decision from jsonb_array_elements(override_decisions)
    where value->>'finding_id' = finding->>'id' limit 1;
    if decision is null or char_length(btrim(coalesce(decision->>'reason', ''))) not between 10 and 500 then
      raise exception 'publication override reason required' using errcode = '22023';
    end if;
  end loop;

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
$function$;

-- Opening a week with Edit copies the published shifts or the draft's shifts
-- into the edit with their tags, and an expired unsaved edit becomes a
-- recovered draft with its tags. Without this, saving a re-edited week wrote
-- the untouched shifts back without their tags. Body is the live definition
-- from 20260926150000; only the three column lists grew.
CREATE OR REPLACE FUNCTION public.acquire_schedule_edit_session_service(actor_user_id uuid, target_workspace_id uuid, target_week_start date, requested_source public.schedule_edit_source, requested_draft_id uuid DEFAULT NULL::uuid, target_location_ids uuid[] DEFAULT NULL::uuid[])
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
      and draft.archived_at is null;
    if source_draft.id is null then
      raise exception 'draft not found' using errcode = 'P0002';
    end if;

    -- One person edits a draft at a time: say who, take nothing.
    select * into holder
    from public.schedule_edit_sessions session
    where session.source_draft_id = source_draft.id
      and session.status = 'active'
    for update;
    if holder.id is not null and holder.expires_at > now() then
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
      if holder.dirty then
        insert into public.schedule_drafts (
          workspace_id, week_start, name, created_by, updated_by, location_ids, base_publication_ids
        ) values (
          target_workspace_id, target_week_start,
          'Recovered edit ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS') || ' ' || left(holder.id::text, 4),
          holder.holder_user_id, holder.holder_user_id, holder.location_ids, holder.base_publication_ids
        ) returning id into recovery_draft_id;
        insert into public.schedule_draft_shifts (id, workspace_id, draft_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, revision, label_ids, label_names)
        select id, workspace_id, recovery_draft_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, revision, label_ids, label_names
        from public.schedule_edit_session_shifts
        where session_id = holder.id;
      end if;
      update public.schedule_edit_sessions
      set status = case when recovery_draft_id is null then 'expired'::public.schedule_edit_session_status
                        else 'recovered'::public.schedule_edit_session_status end,
          recovered_draft_id = recovery_draft_id,
          closed_at = now()
      where id = holder.id;
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
$function$;

-- The swap review (Shift Hub approval met by an open edit) takes a published
-- shift back into the edit with its tags. Body is the live definition from
-- 20260909007000; only the insert's column list grew.
CREATE OR REPLACE FUNCTION public.shift_exchange_schedule_recovery_service(actor uuid, w uuid, sid uuid, expected_fingerprint text DEFAULT NULL::text, idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare sess public.schedule_edit_sessions%rowtype; ps record; draft public.schedule_edit_session_shifts%rowtype;
 changes jsonb:='[]'; current_shift jsonb; result jsonb; fp text; command jsonb; prior public.shift_exchange_commands%rowtype;
 row_id uuid; edited_name text;
begin
 perform pg_advisory_xact_lock(hashtextextended(w::text,921));
 select * into sess from public.schedule_edit_sessions where workspace_id=w and id=sid for update;
 if sess.id is null or sess.holder_user_id<>actor then raise exception 'Your edit session was not found' using errcode='42501'; end if;
 if sess.expires_at<=now() then raise exception 'This edit session expired. Reopen it before reviewing assignments' using errcode='PT409'; end if;
 if exists(select 1 from public.schedule_edit_session_shifts d where d.session_id=sid and not public.schedule_actor_can_manage_service(actor,w,d.location_id)) then
  raise exception 'Schedule edit scope required' using errcode='42501';
 end if;
 command:=jsonb_build_object('action','recover_schedule','session_id',sid,'fingerprint',expected_fingerprint);
 if expected_fingerprint is not null then
  if idempotency_key is null then raise exception 'Idempotency key required' using errcode='22023'; end if;
  select * into prior from public.shift_exchange_commands c where c.workspace_id=w and c.actor_user_id=actor and c.idempotency_key=shift_exchange_schedule_recovery_service.idempotency_key;
  if prior.workspace_id is not null then
   if prior.command is distinct from command then raise exception 'Idempotency key already used' using errcode='22023'; end if;
   return prior.result;
  end if;
 end if;
 for ps in
  select distinct p.* from public.shift_exchange_cases c
  join public.schedule_published_shifts p on p.workspace_id=w and coalesce(p.source_shift_id,p.id) in(c.offered_source_id,c.requested_source_id)
  join public.schedule_location_publications pub on pub.id=p.publication_id and pub.status='current'
  where c.workspace_id=w and c.status='completed' and c.updated_at>sess.created_at
   and p.scheduled_date between sess.week_start and sess.week_start+6
   and exists(select 1 from public.schedule_edit_session_shifts scope where scope.session_id=sid and scope.location_id=p.location_id)
  order by p.id
 loop
  if not public.schedule_actor_can_manage_service(actor,w,ps.location_id) then raise exception 'Schedule edit scope required' using errcode='42501'; end if;
  select * into draft from public.schedule_edit_session_shifts d where d.workspace_id=w and d.session_id=sid
   and (d.id in(ps.id,ps.source_shift_id) or d.source_published_shift_id=ps.id) order by d.id limit 1;
  if draft.id is not null and draft.pending_op_type is distinct from 'delete' and public.shift_exchange_edit_matches(to_jsonb(draft),to_jsonb(ps)) then continue; end if;
  current_shift:=public.shift_exchange_shift(w,ps.id)||jsonb_build_object('shift_type_name',(select name from public.shift_types where id=ps.shift_type_id and workspace_id=w));
  select coalesce(nullif(preferred_name,''),concat_ws(' ',first_name,last_name)) into edited_name from public.employee_profiles where workspace_id=w and id=draft.employee_id;
  changes:=changes||jsonb_build_array(jsonb_build_object('current',current_shift,'session_shift_id',draft.id,'edited_revision',draft.revision,
   'edited_employee_name',edited_name,'edited_start_time',draft.start_time,'edited_end_time',draft.end_time,
   'edited_job_name',(select name from public.jobs where id=draft.job_id and workspace_id=w),
   'edited_shift_type_name',(select name from public.shift_types where id=draft.shift_type_id and workspace_id=w),
   'edited_timezone',draft.time_timezone,'edited_unpaid_break_minutes',draft.unpaid_break_minutes,
   'removed',draft.id is null or draft.pending_op_type='delete'));
 end loop;
 fp:=md5(jsonb_build_object('session_id',sid,'revision',sess.revision,'changes',changes)::text);
 if expected_fingerprint is null then return jsonb_build_object('session_id',sid,'session_revision',sess.revision,'fingerprint',fp,'changes',changes); end if;
 if fp is distinct from expected_fingerprint then raise exception 'Schedule or your edits changed. Review the latest comparison' using errcode='PT409'; end if;
 for current_shift in select x->'current' from jsonb_array_elements(changes) x loop
  select * into ps from public.schedule_published_shifts where workspace_id=w and id=(current_shift->>'id')::uuid;
  select id into row_id from public.schedule_edit_session_shifts d where d.workspace_id=w and d.session_id=sid
   and (d.id in(ps.id,ps.source_shift_id) or d.source_published_shift_id=ps.id) order by d.id limit 1;
  if row_id is null then
   insert into public.schedule_edit_session_shifts(id,workspace_id,session_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,time_basis,time_snapshot,time_timezone,unpaid_break_minutes,source_published_shift_id,label_ids,label_names)
   values(ps.id,w,sid,ps.location_id,ps.employee_id,ps.job_id,ps.shift_type_id,ps.scheduled_date,ps.start_time,ps.end_time,ps.time_basis,ps.time_snapshot,ps.time_timezone,ps.unpaid_break_minutes,ps.id,ps.label_ids,ps.label_names);
  else
   update public.schedule_edit_session_shifts set location_id=ps.location_id,employee_id=ps.employee_id,job_id=ps.job_id,shift_type_id=ps.shift_type_id,
    scheduled_date=ps.scheduled_date,start_time=ps.start_time,end_time=ps.end_time,time_basis=ps.time_basis,time_snapshot=ps.time_snapshot,time_timezone=ps.time_timezone,
    unpaid_break_minutes=ps.unpaid_break_minutes,source_published_shift_id=ps.id,pending_op_type=null,revision=revision+1,updated_at=now()
    where workspace_id=w and session_id=sid and id=row_id;
  end if;
 end loop;
 if jsonb_array_length(changes)>0 then
  update public.schedule_edit_sessions set revision=revision+1,dirty=true,last_heartbeat=now(),expires_at=now()+interval '4 minutes' where id=sid;
 end if;
 result:=public.get_schedule_edit_session_service(actor,w,sid);
 insert into public.shift_exchange_commands(workspace_id,actor_user_id,idempotency_key,command,result) values(w,actor,idempotency_key,command,result);
 return result;
end; $function$;

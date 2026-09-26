-- BL-158: a published shift keeps its tags. The Schedule quick editor saves a
-- shift's labels on the draft; publishing copied every other column but not
-- label_ids / label_names, so an "On call" shift went out untagged (on the
-- employee's week and on another location's ghost card). Both copies into
-- schedule_published_shifts now carry them: the draft's shifts, and the shifts a
-- department-scoped publish carries over from the previous publication.
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

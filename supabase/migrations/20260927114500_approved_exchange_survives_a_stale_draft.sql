-- BL-198: an approved shift change is never undone by publishing a draft
-- that does not carry it (user decision 2026-09-26, option a).
--
-- Before: the publish guard (shift_exchange_assert_draft) only looked at
-- drafts created before the change was approved and raised a bare PT409 the
-- pre-flight check never mentioned. A draft made after the approval (or saved
-- from a screen that missed it) published the old owner back: Ali's Tuesday,
-- given to Deniz in an approved swap, went back to Ali and nobody was told.
--
-- After: one rule, shift_exchange_draft_undoes. A shift changed by a
-- completed swap, cover or pickup after its location-week was last published
-- must reach the next publication exactly as approved (same person, place,
-- job, date, hours). A draft that has no such shift, whether it gives it back
-- to the old owner, to anybody else, changes its terms or leaves it out, gets
-- a hard 'shift_exchange_undone' finding in the pre-flight check; the publish
-- refuses it with 23514 like every other hard finding. Once a publication has
-- carried the change, later edits are ordinary edits again.
-- shift_exchange_assert_draft is gone; the publish asks the pre-flight check.

create function public.shift_exchange_draft_undoes(w uuid, draft uuid, locations uuid[], departments uuid[] default null, include_no_department boolean default true)
returns jsonb
language sql
stable
set search_path = ''
as $$
 select coalesce(jsonb_agg(jsonb_build_object(
   'id','shift_exchange_undone:'||x.shift_id,'code','shift_exchange_undone',
   'severity','hard','overrideable',false,'tier','blocker','introduced',true,
   'location_id',x.location_id,'location_name',x.location_name,
   'employee_id',x.to_id,'employee_name',x.to_name,
   'scheduled_date',x.scheduled_date,'start_time',to_char(x.start_time,'HH24:MI'),'end_time',to_char(x.end_time,'HH24:MI'),
   'shift_ids',coalesce(to_jsonb(x.draft_ids),'[]'::jsonb),
   'exchange_case_id',x.case_id,'exchange_kind',x.kind,
   'from_employee_id',x.from_id,'from_employee_name',x.from_name,
   'to_employee_id',x.to_id,'to_employee_name',x.to_name,
   'draft_employee_id',x.draft_employee_id,'draft_employee_name',x.draft_employee_name,
   'message',case when x.from_id is null
     then coalesce(x.to_name,'A teammate')||' picked up this open shift after the schedule was last published, and this draft does not have it. Publishing would undo it.'
     else 'This shift was '||case x.kind when 'swap' then 'swapped' else 'handed over' end||' from '||coalesce(x.from_name,'a teammate')
      ||' to '||coalesce(x.to_name,'a teammate')||' after the schedule was last published, and this draft does not have it. Publishing would undo it.' end)
  order by x.scheduled_date,x.start_time,x.shift_id),'[]'::jsonb)
 from (
  select distinct on (p.id) p.id shift_id,p.location_id,l.name location_name,p.scheduled_date,p.start_time,p.end_time,
   c.id case_id,c.kind,
   -- Who held it when the change was asked: the offered side's owner, or on
   -- a swap's requested side the teammate who gave it.
   nullif(case when coalesce(p.source_shift_id,p.id)=c.offered_source_id then c.offered_snapshot else c.requested_snapshot end->>'employee_id','')::uuid from_id,
   nullif(case when coalesce(p.source_shift_id,p.id)=c.offered_source_id then c.offered_snapshot else c.requested_snapshot end->>'employee_name','') from_name,
   p.employee_id to_id,nullif(concat_ws(' ',coalesce(nullif(e.preferred_name,''),e.first_name),e.last_name),'') to_name,
   own.ids draft_ids,own.employee_id draft_employee_id,own.employee_name draft_employee_name
  from public.shift_exchange_cases c
  join public.schedule_published_shifts p on p.workspace_id=w and coalesce(p.source_shift_id,p.id) in (c.offered_source_id,c.requested_source_id)
  join public.schedule_location_publications pub on pub.id=p.publication_id and pub.status='current'
  join public.schedule_drafts dr on dr.id=draft and dr.workspace_id=w
  join public.locations l on l.id=p.location_id and l.workspace_id=w
  left join public.employee_profiles e on e.id=p.employee_id and e.workspace_id=w
  -- The draft's copy of this shift: the same row, or else a row in the same
  -- slot (place, job, day, hours), e.g. a draft written after the change.
  left join lateral (
   select array[d.id] ids,d.employee_id,
    nullif(concat_ws(' ',coalesce(nullif(de.preferred_name,''),de.first_name),de.last_name),'') employee_name
   from public.schedule_draft_shifts d
   left join public.employee_profiles de on de.id=d.employee_id and de.workspace_id=w
   where d.workspace_id=w and d.draft_id=draft and (d.id in (p.id,p.source_shift_id)
    or (d.location_id,d.job_id,d.scheduled_date,d.start_time,d.end_time) is not distinct from (p.location_id,p.job_id,p.scheduled_date,p.start_time,p.end_time))
   order by d.id in (p.id,p.source_shift_id) desc,d.id limit 1
  ) own on true
  -- ponytail: transaction start times. An approval that began before a
  -- publish but waited for the workspace lock (both take it first thing)
  -- reads as earlier; the window is the few statements before the lock.
  where c.workspace_id=w and c.status='completed' and c.updated_at>pub.published_at
   and p.location_id=any(locations)
   and p.scheduled_date between dr.week_start and dr.week_start+6
   and public.schedule_shift_in_department_scope_service(p.job_id,departments,coalesce(include_no_department,true))
   and not exists (select 1 from public.schedule_draft_shifts d where d.workspace_id=w and d.draft_id=draft
    and public.shift_exchange_edit_matches(to_jsonb(d),to_jsonb(p)))
  order by p.id,c.updated_at desc
 ) x;
$$;
revoke all on function public.shift_exchange_draft_undoes(uuid,uuid,uuid[],uuid[],boolean) from public,anon,authenticated,service_role;

-- BL-186's pre-flight check, plus the approved shift changes the draft would undo.
create or replace function public.weekly_schedule_publication_preflight(payload jsonb, actor uuid, departments uuid[] DEFAULT NULL::uuid[], include_no_department boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare findings jsonb; signatures jsonb:='[]'; s record; a jsonb; prior jsonb; evidence jsonb; scope jsonb;
 unsigned jsonb; w uuid:=(payload->>'workspace_id')::uuid; message text; state text; tier text; warning boolean;
 ack_by uuid; ack_at timestamptz; ack_name text;
begin
 if payload->>'status'='past_week_closed' then return payload; end if;
 select coalesce(jsonb_agg(f),'[]') into findings from jsonb_array_elements(payload->'findings') f
  where f->>'code' not in ('availability','availability_unknown','availability_review_pending','time_source_unresolved','overlap','double_booking','time_off','closed_location','closed_day');
 -- Publishing is asked at each location the preview is for, once.
 perform app_private.authorize(actor,w,'schedule.publish',array[(x->>'location_id')::uuid])
  from jsonb_array_elements(coalesce(payload->'locations','[]'::jsonb)) x;
 scope:=jsonb_build_object('_publish_locations',(select jsonb_agg(x->'location_id') from jsonb_array_elements(payload->'locations') x),
  '_publish_departments',to_jsonb(departments),'_publish_no_department',coalesce(include_no_department,true));
 for s in select d.*,concat_ws(' ',coalesce(nullif(e.preferred_name,''),e.first_name),e.last_name) employee_name,l.name location_name
  from public.schedule_draft_shifts d left join public.employee_profiles e on e.id=d.employee_id and e.workspace_id=d.workspace_id
  join public.locations l on l.id=d.location_id and l.workspace_id=d.workspace_id
  where d.workspace_id=w and d.draft_id=(payload->>'draft_id')::uuid
   and d.location_id in (select (x->>'location_id')::uuid from jsonb_array_elements(payload->'locations') x)
   and public.schedule_shift_in_department_scope_service(d.job_id,departments,coalesce(include_no_department,true)) order by d.id loop
  state:=null; prior:=null;
  a:=public.assess_weekly_shift_availability(w,s.employee_id,to_jsonb(s)||scope);
  evidence:=public.schedule_availability_override(w,to_jsonb(s),a);
  -- A conflict accepted when this shift was last published stays accepted
  -- (BL-174). Availability is no conflict and is not part of it (BL-186).
  if a->>'operation'='warning_requires_override' then
   prior:=public.schedule_availability_prior_publication(w,to_jsonb(s));
   state:=case when evidence is not null or prior->'availability_snapshot'->'assessment'->>'fingerprint'=a->>'fingerprint'
    or exists(select 1 from public.schedule_publication_overrides o where o.workspace_id=w
     and o.publication_id=(prior->>'publication_id')::uuid and o.finding_id=a->>'fingerprint' and s.id=any(o.source_shift_ids)) then 'accepted' else 'new' end;
   if s.employee_id is null and exists(select 1 from public.audit_events ev where ev.workspace_id=w and ev.action='schedule.conflict_accepted'
     and ev.target_id=s.id::text and ev.metadata->'assessment'->>'fingerprint'=a->>'fingerprint') then state:='accepted'; end if;
  end if;
  signatures:=signatures||jsonb_build_array(jsonb_build_object('shift_id',s.id,'fingerprint',a->>'fingerprint',
   'availability_fingerprint',a->>'availability_fingerprint','override_id',evidence->>'id','retained_publication_id',prior->>'publication_id'));
  if a->>'operation'<>'allowed' then
   warning:=state is not null;
   select string_agg(r->>'message',' ' order by ord) into message from jsonb_array_elements(a->'reasons') with ordinality r(r,ord) where r->>'code'<>'availability';
   tier:=case when not warning then 'blocker' when state='new' and a->>'warning_policy'='confirm' then 'risk' else 'note' end;
   findings:=findings||jsonb_build_array(jsonb_build_object('id',a->>'fingerprint','code','schedule_conflict',
    'conflict_severity',coalesce(a->>'conflict_severity',case when a->>'warning_policy'='confirm' then 'confirm' else 'warn' end),
    'severity',case when warning then 'soft' else 'hard' end,'overrideable',warning,'tier',tier,'introduced',state is distinct from 'accepted',
    'location_id',s.location_id,'location_name',s.location_name,'employee_id',s.employee_id,'employee_name',nullif(s.employee_name,''),
    'scheduled_date',s.scheduled_date,'shift_ids',jsonb_build_array(s.id),'message',left(coalesce(message,'Review this assignment before publishing.'),500))
    ||case when warning then jsonb_build_object('availability_state',state,'warning_policy',a->>'warning_policy') else '{}'::jsonb end);
  end if;
  -- The availability warning: new until someone acknowledged this exact
  -- warning at a publish (same person, shift, hours and marks).
  if coalesce((a->>'has_availability_conflict')::boolean,false) then
   select o.actor_user_id,o.created_at,coalesce(nullif(p.display_name,''),'Manager') into ack_by,ack_at,ack_name
    from public.schedule_publication_overrides o left join public.user_profiles p on p.user_id=o.actor_user_id
    where o.workspace_id=w and o.finding_code='availability' and o.finding_id=a->>'availability_fingerprint'
    order by o.created_at desc limit 1;
   findings:=findings||jsonb_build_array(jsonb_build_object('id',a->>'availability_fingerprint','code','availability',
    'conflict_severity','warn','severity','soft','overrideable',true,'tier',case when ack_by is null then 'risk' else 'note' end,
    'introduced',ack_by is null,'availability_state',case when ack_by is null then 'new' else 'accepted' end,'warning_policy','confirm',
    'location_id',s.location_id,'location_name',s.location_name,'employee_id',s.employee_id,'employee_name',nullif(s.employee_name,''),
    'scheduled_date',s.scheduled_date,'shift_ids',jsonb_build_array(s.id),
    'message',left(coalesce(nullif(s.employee_name,''),'This person')||' shows as unavailable for this shift.',500))
    ||case when ack_by is null then '{}'::jsonb else jsonb_build_object('acknowledged_by_user_id',ack_by,'acknowledged_by_name',ack_name,'acknowledged_at',ack_at) end);
  end if;
 end loop;
 -- BL-198: a draft that would undo an approved shift change is a blocker.
 findings:=findings||public.shift_exchange_draft_undoes(w,(payload->>'draft_id')::uuid,
  array(select (x->>'location_id')::uuid from jsonb_array_elements(coalesce(payload->'locations','[]'::jsonb)) x),departments,include_no_department);
 unsigned:=(payload-'fingerprint'-'status')||jsonb_build_object('findings',findings,'availability_assessments',signatures,'department_ids',to_jsonb(departments),'include_no_department',coalesce(include_no_department,true));
 return unsigned||jsonb_build_object('status',case
  when exists(select 1 from jsonb_array_elements(findings) f where f->>'severity'='hard' and coalesce(f->>'tier','blocker')<>'note') then 'hard_blocked'
  when exists(select 1 from jsonb_array_elements(findings) f where coalesce(f->>'tier','blocker')<>'note' and (coalesce((f->>'introduced')::boolean,true) or not (f->>'overrideable')::boolean)) then 'override_required'
  else 'publish_ready' end,'fingerprint',encode(extensions.digest(convert_to(unsigned::text,'UTF8'),'sha256'),'hex'));
end; $function$;

-- BL-186's publish without its own exchange guard: the preview it runs under
-- the workspace lock carries the same rule as a hard finding (23514).
create or replace function public.publish_schedule_draft_service(actor_user_id uuid, target_workspace_id uuid, target_draft_id uuid, target_location_ids uuid[], target_department_ids uuid[], include_no_department boolean, expected_draft_revision integer, expected_fingerprint text, override_decisions jsonb DEFAULT '[]'::jsonb, target_notify_employee_ids uuid[] DEFAULT NULL::uuid[])
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
$function$;

drop function public.shift_exchange_assert_draft(uuid,uuid,uuid[],uuid[],boolean);

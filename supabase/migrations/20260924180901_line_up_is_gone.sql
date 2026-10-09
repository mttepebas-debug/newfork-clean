-- FOUNDATION-B 5.6: Line Up is gone.
--
-- Product decision (2026-09-23): Line Up is deleted now and designed again from
-- scratch later, as its own project, on the authorization core. What it did is
-- written down in docs/plan/research/lineup-2026-09-24.md for that redesign.
--
-- Nothing else loses behaviour:
-- * Schedule, Shift Hub and the availability checks keep the shift range
--   helper they borrowed from Line Up, now app_private.shift_time_range().
-- * Shift Hub keeps the workspace's minimum travel time between locations.
-- * An approved swap still rebases the open drafts; it no longer rewrites a
--   shared Line Up, and its consent fingerprint is the shift terms only.
-- * The notification relay and the "allowed" check lose their Line Up layer;
--   the Shift Hub layer underneath takes the public name back.
--
-- Hosted had no Line Up content on 2026-09-24 (only the 9 default sections and
-- the permission rows), so nothing is converted.

create function app_private.shift_time_range(d date, s time without time zone, e time without time zone, tz text)
 returns tstzrange
 language sql
 stable
 set search_path to ''
as $function$
  select tstzrange((d+s) at time zone tz,((d+case when e<=s then 1 else 0 end)+e) at time zone tz,'[)');
$function$;
revoke all on function app_private.shift_time_range(date, time without time zone, time without time zone, text) from public;

-- 1. Readers that stay lose their Line Up branches --------------------------------------
CREATE OR REPLACE FUNCTION app_private.role_default_permissions(role_class public.workspace_role)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(array_agg(key order by key), '{}'::text[]) from public.permissions where
 role_class in ('owner', 'admin')
 or (role_class = 'manager' and key in (
 'workspace.read','schedule.read','schedule.manage','schedule.availability.override','schedule.publish','schedule.templates.read','schedule.templates.manage','schedule.export',
 'schedule.time_off_requests.read','schedule.time_off_requests.manage','schedule.shift_change_requests.read','schedule.shift_change_requests.manage',
 'availability.read','availability.manage','employees.read','employees.manage','employees.archive','employee_onboarding.review','announcements.read','announcements.manage','important_dates.read','important_dates.manage',
 'notifications.read','notifications.read_own','notifications.preferences.write_own'))
 or (role_class = 'employee' and employee_eligible);
$function$;

CREATE OR REPLACE FUNCTION public.assess_weekly_shift_availability(w uuid, emp uuid, shift jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare loc uuid:=(shift->>'location_id')::uuid; day date:=coalesce(shift->>'scheduled_date',shift->>'date')::date;
 zone_name text; preference_zone text; basis text:=coalesce(shift->>'time_basis','explicit'); start_clock time; end_clock time;
 local_start timestamp; local_end timestamp; start_at timestamptz; end_at timestamptz; span tstzrange; day_span tstzrange;
 capacity jsonb; remaining tstzmultirange; unavailable tstzmultirange:='{}'; leave_ranges tstzmultirange:='{}';
 leave_evidence jsonb:='[]'; reasons jsonb:='[]'; settings public.workspace_scheduling_settings%rowtype;
 leave_row record; leave_span tstzrange; coverage text; operation text; fingerprint_payload jsonb;
 conflict_severity text; rule_severity text; rule jsonb; annotated jsonb:='[]';
 neighbor record; neighbor_span tstzrange; gap_minutes numeric; schedule_week date; schedule_locations uuid[];
 edit_id uuid:=nullif(shift->>'session_id','')::uuid; context_draft_id uuid:=nullif(shift->>'draft_id','')::uuid;
 exclude_id uuid:=coalesce(nullif(shift->>'_exclude_shift_id',''),shift->>'source_shift_id',shift->>'id')::uuid;
 -- BL-092: shifts this person gives up in the same operation (the other side
 -- of a swap) are not theirs any more when this one becomes theirs.
 given_up uuid[]:=array(select value::uuid from jsonb_array_elements_text(
  case when jsonb_typeof(shift->'_exclude_shift_ids')='array' then shift->'_exclude_shift_ids' else '[]'::jsonb end)
  where value is not null);
 missing_time boolean; invalid_clock boolean:=false; ambiguous_clock boolean:=false;
begin
 select l.timezone,coalesce(nullif(shift->>'time_timezone',''),nullif(shift->'time_snapshot'->>'timezone',''),l.timezone)
  into preference_zone,zone_name from public.locations l where l.workspace_id=w and l.id=loc;
 if day is null or not isfinite(day) or zone_name is null or preference_zone is null
  or not app_private.timezone_name_valid(zone_name)
  or not app_private.timezone_name_valid(preference_zone) then
  raise exception 'A valid location, date and timezone are required for availability assessment' using errcode='22023'; end if;
 select * into settings from public.workspace_scheduling_settings where workspace_id=w;
 if settings.workspace_id is null then raise exception 'Scheduling settings unavailable' using errcode='P0002'; end if;
 if basis not in ('explicit','type_default') then
  raise exception 'Unknown shift time source' using errcode='22023'; end if;
 if basis='type_default' then
  start_clock:=nullif(shift->'time_snapshot'->>'start_time','')::time;
  end_clock:=nullif(shift->'time_snapshot'->>'end_time','')::time;
  if (start_clock,end_clock) is distinct from (nullif(shift->>'start_time','')::time,nullif(shift->>'end_time','')::time) then
   raise exception 'Saved reference hours and their snapshot must agree' using errcode='22023'; end if;
 elsif basis='explicit' then
  start_clock:=nullif(shift->>'start_time','')::time; end_clock:=nullif(shift->>'end_time','')::time;
 end if;
 invalid_clock:=start_clock is not null and start_clock=end_clock;
 missing_time:=start_clock is null or end_clock is null or start_clock=end_clock;
 day_span:=tstzrange(day::timestamp at time zone zone_name,(day+1)::timestamp at time zone zone_name,'[)');
 if not missing_time then
  local_start:=day+start_clock;
  local_end:=day+end_clock+case when end_clock<start_clock then interval '1 day' else interval '0' end;
  start_at:=local_start at time zone zone_name; end_at:=local_end at time zone zone_name;
  invalid_clock:=(start_at at time zone zone_name)<>local_start or (end_at at time zone zone_name)<>local_end or end_at<=start_at;
  if not invalid_clock then
   span:=tstzrange(start_at,end_at,'[)');
   ambiguous_clock:=exists(select 1 from (values(start_at,local_start),(end_at,local_end)) endpoint(instant,wall)
    cross join (values(interval '-1 day'),(interval '1 day')) probe(delta)
    cross join lateral (select (endpoint.wall at time zone 'UTC')-make_interval(secs=>public.availability_utc_offset(endpoint.instant+probe.delta,zone_name)) alternate) alt
    where alt.alternate<>endpoint.instant and (alt.alternate at time zone zone_name)=endpoint.wall);
  end if;
 end if;
 -- Assignment snapshots locate the actual instants; recurring rules are always
 -- interpreted in the target location's current local timezone.
 capacity:=case when emp is null then jsonb_build_object('unavailable_intervals','[]'::jsonb,'employee_intervals','[]'::jsonb,'manager_intervals','[]'::jsonb)
  else public.weekly_preference_capacity(w,emp,coalesce(span,day_span),preference_zone) end;
 select coalesce(range_agg(tstzrange((x->>'start_at')::timestamptz,(x->>'end_at')::timestamptz,'[)')),'{}') into unavailable
  from jsonb_array_elements(capacity->'unavailable_intervals') x;
 for leave_row in select seg.id,seg.request_id,req.revision,approved_piece.span
  from public.schedule_time_off_segments seg
  join public.schedule_time_off_requests req on req.id=seg.request_id and req.workspace_id=seg.workspace_id
  cross join lateral unnest(public.time_off_effective_ranges(seg.id)) approved_piece(span)
  where req.workspace_id=w and req.employee_id=emp and req.request_type='time_off'
   and req.status in('approved','partially_approved') and seg.status='approved'
   and seg.segment_date between day-3 and day+3 order by seg.id,lower(approved_piece.span) loop
  leave_span:=leave_row.span*coalesce(span,day_span);
  if not isempty(leave_span) then
   leave_ranges:=leave_ranges+tstzmultirange(leave_span);
   leave_evidence:=leave_evidence||jsonb_build_array(jsonb_build_object('segment_id',leave_row.id,'request_id',leave_row.request_id,
    'request_revision',leave_row.revision,'intervals',public.availability_ranges_json(tstzmultirange(leave_span))));
  end if;
 end loop;
 remaining:=tstzmultirange(coalesce(span,day_span))-(unavailable+leave_ranges);
 coverage:=case when span is null then 'unknown' when isempty(remaining) then 'none' when remaining @> span then 'full' else 'partial' end;
 if not isempty(leave_ranges) then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','approved_time_off',
  'message','Approved time off overlaps this assignment. Resolve the leave or assignment before assigning.',
  'intervals',public.availability_ranges_json(leave_ranges),'definite',span is not null or leave_ranges @> day_span)); end if;
 if not isempty(unavailable) and span is not null then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','availability',
  'message','The assignment overlaps unavailable hours.','intervals',public.availability_ranges_json(unavailable),'definite',true)); end if;
 if missing_time then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','time_source_unresolved',
  'message','Confirm shift hours before assigning or publishing.','definite',false)); end if;
 if invalid_clock then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','invalid_local_time',
  'message','These hours do not exist on this date in the selected timezone. Choose valid hours.','definite',true)); end if;
 -- Required schedule references are hard constraints. Availability-only callers
 -- without a job descriptor retain their existing contract.
 if shift ? 'job_id' then
  if not exists(select 1 from public.locations where workspace_id=w and id=loc and archived_at is null)
   or not exists(select 1 from public.jobs where workspace_id=w and id=(shift->>'job_id')::uuid and archived_at is null)
   or (nullif(shift->>'shift_type_id','') is not null and not exists(select 1 from public.shift_types where workspace_id=w and id=(shift->>'shift_type_id')::uuid and archived_at is null)) then
   reasons:=reasons||jsonb_build_array(jsonb_build_object('code','invalid_reference','message','A location, job or shift type is no longer available.','definite',true));
  end if;
  if emp is not null then
   if not exists(select 1 from public.employee_profiles where workspace_id=w and id=emp and archived_at is null and not is_excluded_from_schedule and (start_date is null or start_date<=day)) then
    reasons:=reasons||jsonb_build_array(jsonb_build_object('code','employee_inactive','message','Employee is not active in Schedule.','definite',true));
   end if;
   if not exists(select 1 from public.employee_location_assignments where workspace_id=w and employee_id=emp and location_id=loc and ended_at is null)
    or not exists(select 1 from public.employee_job_assignments where workspace_id=w and employee_id=emp and job_id=(shift->>'job_id')::uuid and ended_at is null) then
    reasons:=reasons||jsonb_build_array(jsonb_build_object('code','assignment_missing','message','Employee needs an active location and job assignment.','definite',true));
   end if;
  end if;
  if exists(select 1 from public.schedule_closures c where c.workspace_id=w and c.location_id=loc
   and day between c.closed_date and coalesce(c.end_date,c.closed_date)
   and (c.is_all_day or (shift->>'shift_type_id')::uuid=any(c.shift_type_ids))) then
   reasons:=reasons||jsonb_build_array(jsonb_build_object('code','closed_location','message','Location or shift type is closed on this date.','definite',true));
  end if;
 end if;
 -- The edit session replaces its week; a saved draft replaces its week. Other
 -- current publications remain relevant across locations and week boundaries.
 select week_start,location_ids into schedule_week,schedule_locations from public.schedule_edit_sessions where workspace_id=w and id=edit_id;
 if schedule_week is null then select week_start,location_ids into schedule_week,schedule_locations from public.schedule_drafts where workspace_id=w and id=context_draft_id; end if;
 if span is not null and emp is not null and shift ? 'job_id' then
  for neighbor in
   select s.id,s.location_id,s.scheduled_date,s.start_time,s.end_time,s.time_basis,coalesce(s.time_timezone,l.timezone) zone
    from public.schedule_edit_session_shifts s join public.locations l on l.id=s.location_id and l.workspace_id=w
    where s.workspace_id=w and s.session_id=edit_id and s.employee_id=emp and s.pending_op_type is distinct from 'delete'
     and s.id is distinct from exclude_id and not s.id=any(given_up) and s.scheduled_date between day-2 and day+2
     and (not (shift ? '_publish_locations') or (s.location_id in (select value::uuid from jsonb_array_elements_text(shift->'_publish_locations'))
      and public.schedule_shift_in_department_scope_service(s.job_id,
       case when jsonb_typeof(shift->'_publish_departments')='array' then array(select value::uuid from jsonb_array_elements_text(shift->'_publish_departments')) end,
       coalesce((shift->>'_publish_no_department')::boolean,true))))
   union all
   select s.id,s.location_id,s.scheduled_date,s.start_time,s.end_time,s.time_basis,coalesce(s.time_timezone,l.timezone)
    from public.schedule_draft_shifts s join public.locations l on l.id=s.location_id and l.workspace_id=w
    where edit_id is null and s.workspace_id=w and s.draft_id=context_draft_id and s.employee_id=emp
     and s.id is distinct from exclude_id and not s.id=any(given_up) and s.scheduled_date between day-2 and day+2
     and (not (shift ? '_publish_locations') or (s.location_id in (select value::uuid from jsonb_array_elements_text(shift->'_publish_locations'))
      and public.schedule_shift_in_department_scope_service(s.job_id,
       case when jsonb_typeof(shift->'_publish_departments')='array' then array(select value::uuid from jsonb_array_elements_text(shift->'_publish_departments')) end,
       coalesce((shift->>'_publish_no_department')::boolean,true))))
   union all
   select s.id,s.location_id,s.scheduled_date,s.start_time,s.end_time,s.time_basis,coalesce(s.time_timezone,l.timezone)
    from public.schedule_published_shifts s join public.schedule_location_publications p on p.id=s.publication_id and p.status='current'
    join public.locations l on l.id=s.location_id and l.workspace_id=w
    where s.workspace_id=w and s.employee_id=emp and (shift ? '_publish_locations' or (s.id is distinct from exclude_id and s.source_shift_id is distinct from exclude_id
     and not s.id=any(given_up) and not coalesce(s.source_shift_id,s.id)=any(given_up)))
     and s.scheduled_date between day-2 and day+2
     and (schedule_week is null or s.scheduled_date not between schedule_week and schedule_week+6
      or not s.location_id = any(coalesce(schedule_locations, '{}'))
      or (shift ? '_publish_locations' and not (s.location_id in (select value::uuid from jsonb_array_elements_text(shift->'_publish_locations'))
       and public.schedule_shift_in_department_scope_service(s.job_id,
        case when jsonb_typeof(shift->'_publish_departments')='array' then array(select value::uuid from jsonb_array_elements_text(shift->'_publish_departments')) end,
        coalesce((shift->>'_publish_no_department')::boolean,true)))))
   order by 1
  loop
   neighbor_span:=app_private.shift_time_range(neighbor.scheduled_date,neighbor.start_time,neighbor.end_time,neighbor.zone);
   if span && neighbor_span then
    reasons:=reasons||jsonb_build_array(jsonb_build_object('code','time_overlap','message','Employee already has an overlapping shift.','definite',true,
     'intervals',public.availability_ranges_json(tstzmultirange(span*neighbor_span))));
   else
    gap_minutes:=extract(epoch from greatest(lower(span)-upper(neighbor_span),lower(neighbor_span)-upper(span)))/60;
    if neighbor.location_id<>loc and gap_minutes<settings.minimum_travel_minutes then
     reasons:=reasons||jsonb_build_array(jsonb_build_object('code','minimum_travel','message','There is not enough travel time between locations.','definite',true));
    end if;
    if gap_minutes<settings.minimum_rest_minutes then
     reasons:=reasons||jsonb_build_array(jsonb_build_object('code','minimum_rest','message','There is not enough rest time between shifts.','definite',true));
    end if;
   end if;
  end loop;
 end if;
 reasons:=reasons||app_private.document_shift_reasons(w,emp,day,coalesce(start_at,lower(day_span))); conflict_severity:='allow';
 for rule in select value from jsonb_array_elements(reasons) loop
  rule_severity:=case rule->>'code'
   when 'availability' then settings.conflict_rules->>'availability'
   when 'approved_time_off' then settings.conflict_rules->>'approved_time_off'
   when 'closed_location' then settings.conflict_rules->>'closed_location'
   when 'minimum_travel' then settings.conflict_rules->>'minimum_travel'
   when 'minimum_rest' then settings.conflict_rules->>'minimum_rest' when 'document_required' then settings.conflict_rules->>'document_required' when 'document_conditional_grace' then settings.conflict_rules->>'document_conditional_grace' when 'document_conditional_overdue' then settings.conflict_rules->>'document_conditional_overdue'
   when 'time_source_unresolved' then 'confirm'
   else 'block' end;
  if array_position(array['allow','warn','confirm','block'],rule_severity)>array_position(array['allow','warn','confirm','block'],conflict_severity) then conflict_severity:=rule_severity; end if;
  if rule_severity<>'allow' then annotated:=annotated||jsonb_build_array(rule||jsonb_build_object('severity',rule_severity)); end if;
 end loop;
 reasons:=annotated;
 operation:=case conflict_severity when 'block' then 'blocked' when 'allow' then 'allowed' else 'warning_requires_override' end;
 -- Revision counters, manager notes and unrelated weekdays/settings are not
 -- conflict identity. The adapters use warning_policy to decide warn/confirm.
 fingerprint_payload:=jsonb_build_object('workspace_id',w,'employee_id',emp,
  'assignment',jsonb_build_object('id',coalesce(shift->>'source_shift_id',shift->>'id'),'location_id',loc,'date',day),
  'intervals',public.availability_ranges_json(case when span is null then '{}'::tstzmultirange else tstzmultirange(span) end),
  'unavailable',public.availability_ranges_json(unavailable),'leave',public.availability_ranges_json(leave_ranges),
  'warning_policy',case when conflict_severity='confirm' then 'confirm' else 'warn' end,'operation',operation,
  'conflict_rules',settings.conflict_rules,'minimum_travel_minutes',settings.minimum_travel_minutes,'minimum_rest_minutes',settings.minimum_rest_minutes,'reasons',reasons);
 return jsonb_build_object('coverage',coverage,'operation',operation,'time_basis',basis,'timezone',zone_name,'preference_timezone',preference_zone,
  'assessment_scope',case when span is null then 'calendar_day' else 'shift_interval' end,
  'intervals',public.availability_ranges_json(case when span is null then '{}'::tstzmultirange else tstzmultirange(span) end),
  'available_intervals',case when span is null then '[]'::jsonb else public.availability_ranges_json(remaining) end,
  'unavailable_intervals',public.availability_ranges_json(unavailable+leave_ranges),
  'unknown_intervals',case when span is null then public.availability_ranges_json(tstzmultirange(day_span)) else '[]'::jsonb end,
  'employee_intervals',capacity->'employee_intervals','manager_intervals',capacity->'manager_intervals',
  'has_availability_conflict',span is not null and not isempty(unavailable),'conflict_severity',conflict_severity,
  'warning_policy',case when conflict_severity='confirm' then 'confirm' else 'warn' end,
  'leave',leave_evidence,'pending','[]'::jsonb,'type_restrictions','[]'::jsonb,'reasons',reasons,
  'policy_revision',settings.availability_preferences_revision,
  'fold_resolution',case when ambiguous_clock then 'post_transition_offset' else null end,
  'assessment_minutes',case when span is null then null else extract(epoch from upper(span)-lower(span))/60 end,
  'fingerprint',encode(extensions.digest(convert_to(fingerprint_payload::text,'UTF8'),'sha256'),'hex'));
end; $function$;

CREATE OR REPLACE FUNCTION public.preview_schedule_default_hours_service(actor uuid, w uuid, sid uuid, command jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare session public.schedule_edit_sessions%rowtype; shift record; proposed jsonb; before_a jsonb; after_a jsonb;
 rows jsonb:='[]'; evidence jsonb:='[]'; row_value jsonb; peers jsonb; before_count integer; after_count integer; unknown_count integer;
 original_span tstzrange; proposed_span tstzrange; reason text; note text; can_override boolean; fingerprint text;
 ids uuid[]; starts date; ends date; changed integer:=0; blocked integer:=0;
begin
 if jsonb_typeof(command) is distinct from 'object' or jsonb_typeof(command->'shift_ids') is distinct from 'array'
  or jsonb_array_length(command->'shift_ids') not between 1 and 200 then raise exception 'Choose 1 to 200 shifts to review' using errcode='22023'; end if;
 select array_agg(value::uuid order by value::uuid) into ids from jsonb_array_elements_text(command->'shift_ids');
 if cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise exception 'Choose each shift once' using errcode='22023'; end if;
 select * into session from public.schedule_edit_sessions where workspace_id=w and id=sid;
 if session.id is null or session.holder_user_id is distinct from actor then raise exception 'Edit session not found' using errcode='42501'; end if;
 if session.status<>'active' or session.expires_at<=now() or session.revision is distinct from (command->>'expected_session_revision')::integer then
  raise exception 'Schedule editing changed; reopen the review' using errcode='40001'; end if;
 starts:=(command->>'starts_on')::date; ends:=(command->>'ends_on')::date;
 if starts is null or ends is null or starts<session.week_start or ends>session.week_start+6 or ends<starts then
  raise exception 'Choose dates within this schedule week' using errcode='22023'; end if;
 if (select count(*) from public.schedule_edit_session_shifts s where s.workspace_id=w and s.session_id=sid and s.id=any(ids)
  and s.scheduled_date between starts and ends and coalesce(s.pending_op_type,'')<>'delete')<>cardinality(ids) then
  raise exception 'Selected shifts changed or are outside these dates' using errcode='40001'; end if;
 if exists(select 1 from public.schedule_edit_session_shifts s where s.workspace_id=w and s.session_id=sid and s.id=any(ids)
  and not public.schedule_actor_can_manage_service(actor,w,s.location_id)) then raise exception 'Schedule location access denied' using errcode='42501'; end if;
 for shift in select s.*,to_jsonb(s) payload,t.default_revision,t.default_start_time,t.default_end_time,t.archived_at type_archived,
  t.name type_name,l.name location_name,l.archived_at location_archived,j.archived_at job_archived,
  coalesce(nullif(concat_ws(' ',coalesce(nullif(e.preferred_name,''),e.first_name),e.last_name),''),'Open shift') employee_name,
  l.timezone location_timezone from public.schedule_edit_session_shifts s
  join public.locations l on l.id=s.location_id and l.workspace_id=w
  join public.jobs j on j.id=s.job_id and j.workspace_id=w
  left join public.shift_types t on t.id=s.shift_type_id and t.workspace_id=w
  left join public.employee_profiles e on e.id=s.employee_id and e.workspace_id=w
  where s.workspace_id=w and s.session_id=sid and s.id=any(ids) order by s.scheduled_date,s.location_id,s.id loop
  reason:=null; proposed:=null; before_a:=null; after_a:=null; note:=null; can_override:=false;
  original_span:=app_private.shift_time_range(shift.scheduled_date,shift.start_time,shift.end_time,coalesce(shift.time_timezone,shift.location_timezone));
  if shift.time_basis<>'type_default' then reason:='Only saved shift-type reference hours are included; explicit and unconfirmed hours stay unchanged';
  elsif shift.type_archived is not null or shift.default_revision is null then reason:='This shift type is archived or unavailable';
  elsif shift.default_start_time is null or shift.default_end_time is null then reason:='This shift type has no current default hours';
  elsif lower(original_span)<=now() then reason:='This shift has already started';
  elsif shift.time_snapshot->>'default_revision'=shift.default_revision::text and shift.time_snapshot->>'shift_type_id'=shift.shift_type_id::text then reason:='Already uses the current defaults';
  end if;
  if reason is null then
   proposed:=public.normalize_schedule_time_source(w,shift.payload||jsonb_build_object('time_snapshot',null),shift.payload);
   proposed_span:=app_private.shift_time_range(shift.scheduled_date,(proposed->>'start_time')::time,(proposed->>'end_time')::time,proposed->>'time_timezone');
   if lower(proposed_span)<=now() then reason:='The proposed start time is already in the past'; proposed:=null; end if;
  end if;
  if proposed is not null then
   changed:=changed+1;
   can_override:=public.schedule_actor_can_manage_service(actor,w,shift.location_id);
   if shift.employee_id is not null then
    before_a:=public.availability_impact_assessment(public.assess_weekly_shift_availability(w,shift.employee_id,shift.payload))||jsonb_build_object('can_override',can_override);
    
    after_a:=public.assess_weekly_shift_availability(w,shift.employee_id,proposed);
    after_a:=public.availability_impact_assessment(after_a)||jsonb_build_object('can_override',can_override,
     'warning_policy',after_a->'warning_policy','has_availability_conflict',after_a->'has_availability_conflict',
     'override_recorded',public.schedule_availability_override(w,proposed,after_a) is not null);
 
   end if;
   select x->>'note' into note from jsonb_array_elements(coalesce(command->'overrides','[]')) x where x->>'shift_id'=shift.id::text;
   if after_a->>'operation' in('blocked','verification_required') then reason:='Resolve availability or approved leave before applying these hours';
   
   elsif shift.location_archived is not null or shift.job_archived is not null then reason:='The location or job is archived';
   elsif shift.employee_id is not null and public.employee_has_hard_document_schedule_conflict_service(w,shift.employee_id,shift.scheduled_date) then reason:='Employee document requirements block this assignment';
   end if;
   if after_a->>'operation'='warning_requires_override' and reason is null then
    proposed:=proposed||jsonb_build_object('availability_assessment_fingerprint',public.assess_weekly_shift_availability(w,shift.employee_id,(proposed-'id'-'source_shift_id')||jsonb_build_object('_exclude_shift_id',shift.id,'session_id',sid))->>'fingerprint'); end if;
   if reason is not null then blocked:=blocked+1; end if;
  end if;
  rows:=rows||jsonb_build_array(jsonb_build_object('shift_id',shift.id,'shift_revision',shift.revision,'scheduled_date',shift.scheduled_date,
   'location_id',shift.location_id,'location_name',shift.location_name,'shift_type_name',coalesce(shift.type_name,'Unnamed shift'),'employee_name',shift.employee_name,
   'before',shift.payload,'after',proposed,'before_assessment',before_a,'after_assessment',after_a,'reason',reason,'will_change',proposed is not null,'can_apply',proposed is not null and reason is null,
   'current_default_revision',shift.default_revision));
 end loop;
 -- Compare the complete proposed selection together, including overnight and
 -- cross-location commitments. Hidden peer identities never leave this helper.
 select coalesce(jsonb_agg(payload order by source,id),'[]') into peers from (
  select 'edit' source,s.id,to_jsonb(s) payload from public.schedule_edit_session_shifts s
   where s.workspace_id=w and s.session_id=sid and coalesce(s.pending_op_type,'')<>'delete'
  union all
  select 'published',p.id,to_jsonb(p)||jsonb_build_object('id',coalesce(p.source_shift_id,p.id)) from public.schedule_published_shifts p
   join public.schedule_location_publications pub on pub.id=p.publication_id and pub.workspace_id=w and pub.status='current'
   where p.workspace_id=w and p.scheduled_date between starts-2 and ends+2 and p.employee_id is not null
    and not exists(select 1 from public.schedule_edit_session_shifts s where s.workspace_id=w and s.session_id=sid and s.id=coalesce(p.source_shift_id,p.id))
 ) candidates;
 for row_value in select value from jsonb_array_elements(rows) loop
  before_count:=0; after_count:=0; unknown_count:=0;
  if row_value->'after'<>'null'::jsonb and row_value->'before'->>'employee_id' is not null then
   select count(*) filter(where peer->>'time_basis' in('explicit','type_default') and peer->>'start_time' is not null and peer->>'end_time' is not null and peer->>'time_timezone' is not null and app_private.shift_time_range((peer->>'scheduled_date')::date,(peer->>'start_time')::time,(peer->>'end_time')::time,peer->>'time_timezone') &&
    app_private.shift_time_range((row_value->>'scheduled_date')::date,(row_value->'before'->>'start_time')::time,(row_value->'before'->>'end_time')::time,row_value->'before'->>'time_timezone')),
    count(*) filter(where peer->>'time_basis' in('explicit','type_default') and peer->>'start_time' is not null and peer->>'end_time' is not null and peer->>'time_timezone' is not null and app_private.shift_time_range((coalesce(nullif(r->'after','null'),peer)->>'scheduled_date')::date,(coalesce(nullif(r->'after','null'),peer)->>'start_time')::time,(coalesce(nullif(r->'after','null'),peer)->>'end_time')::time,coalesce(nullif(r->'after','null'),peer)->>'time_timezone') &&
    app_private.shift_time_range((row_value->>'scheduled_date')::date,(row_value->'after'->>'start_time')::time,(row_value->'after'->>'end_time')::time,row_value->'after'->>'time_timezone'))
    into before_count,after_count
   from jsonb_array_elements(peers) peer left join lateral(select value r from jsonb_array_elements(rows) where value->>'shift_id'=peer->>'id') replacement on true
   where peer->>'employee_id'=row_value->'before'->>'employee_id' and peer->>'id'<>row_value->>'shift_id';
   select count(*) into unknown_count from jsonb_array_elements(peers) peer
    where peer->>'employee_id'=row_value->'before'->>'employee_id' and peer->>'id'<>row_value->>'shift_id'
     and (peer->>'scheduled_date')::date between (row_value->>'scheduled_date')::date-2 and (row_value->>'scheduled_date')::date+2
     and (coalesce(peer->>'time_basis','') not in('explicit','type_default') or peer->>'start_time' is null or peer->>'end_time' is null or peer->>'time_timezone' is null);
  end if;
  evidence:=evidence||jsonb_build_array(row_value||jsonb_build_object('before_overlap_count',before_count,'after_overlap_count',after_count,'unconfirmed_peer_count',unknown_count));
 end loop;
 fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object('workspace',w,'actor',actor,'session',sid,'revision',session.revision,'command',command-'fingerprint'-'idempotency_key'-'acknowledge_reference_overlaps'-'confirm_availability','rows',evidence,'peers',peers)::text,'UTF8'),'sha256'),'hex');
 return jsonb_build_object('session_id',sid,'session_revision',session.revision,'starts_on',starts,'ends_on',ends,'fingerprint',fingerprint,'changed_count',changed,'blocked_count',blocked,'shifts',evidence);
end $function$;

CREATE OR REPLACE FUNCTION public.shift_exchange_shift(w uuid, source uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$

 select jsonb_build_object('id',s.id,'source_id',coalesce(s.source_shift_id,s.id),'location_id',s.location_id,'location_name',l.name,'timezone',coalesce(s.time_timezone,l.timezone),

 'requires_employee_access',true,'job_id',s.job_id,'job_name',coalesce(j.name,'Unassigned position'),'shift_type_id',s.shift_type_id,

 'unpaid_break_minutes',s.unpaid_break_minutes,'scheduled_date',s.scheduled_date,'date',s.scheduled_date,'time_basis',s.time_basis,'time_snapshot',s.time_snapshot,'time_timezone',s.time_timezone,'start_time',s.start_time,'end_time',s.end_time,

 'starts_at',lower(app_private.shift_time_range(s.scheduled_date,s.start_time,s.end_time,coalesce(s.time_timezone,l.timezone))),

 'ends_at',upper(app_private.shift_time_range(s.scheduled_date,s.start_time,s.end_time,coalesce(s.time_timezone,l.timezone))),

 'employee_id',s.employee_id,'employee_name',case when e.id is not null then coalesce(nullif(e.preferred_name,''),concat_ws(' ',e.first_name,e.last_name)) end)

 from public.schedule_published_shifts s join public.schedule_location_publications p on p.id=s.publication_id and p.status='current'

 join public.locations l on l.id=s.location_id left join public.jobs j on j.id=s.job_id left join public.employee_profiles e on e.id=s.employee_id

 where s.workspace_id=w and (s.id=source or coalesce(s.source_shift_id,s.id)=source) order by s.created_at desc limit 1;

$function$;

CREATE OR REPLACE FUNCTION public.weekly_assignment_candidate_check(w uuid, emp uuid, target jsonb, excluded uuid[] DEFAULT '{}'::uuid[], travel_minutes integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb; starts timestamptz; ends timestamptz; problems jsonb:='[]';
begin
 if nullif(target->>'start_time','') is null or nullif(target->>'end_time','') is null then
  return jsonb_build_object('employee_id',emp,'status','verification_required','reasons',jsonb_build_array('A manager must confirm the shift hours before a full-shift exchange'));
 end if;
 result:=public.weekly_assignment_candidate_base(w,emp,target,excluded,travel_minutes);
 select lower(r),upper(r) into starts,ends from (select app_private.shift_time_range((target->>'date')::date,(target->>'start_time')::time,(target->>'end_time')::time,coalesce(nullif(target->>'time_timezone',''),nullif(target->'time_snapshot'->>'timezone',''),l.timezone)) r from public.locations l where l.id=(target->>'location_id')::uuid and l.workspace_id=w) q;
 if coalesce((target->>'requires_employee_access')::boolean,false) and not exists(select 1 from public.employee_profiles e join public.workspace_memberships m on m.workspace_id=e.workspace_id and m.user_id=e.user_id and m.status='active' where e.workspace_id=w and e.id=emp) then problems:=problems||'"Active workspace access is required"'::jsonb; end if;
 if not exists(select 1 from public.employee_location_assignments a where a.workspace_id=w and a.employee_id=emp and a.location_id=(target->>'location_id')::uuid and a.assigned_at<=starts and (a.ended_at is null or a.ended_at>=ends)) then problems:=problems||'"Location assignment must cover the full shift"'::jsonb; end if;
 if not exists(select 1 from public.employee_job_assignments a where a.workspace_id=w and a.employee_id=emp and a.job_id=(target->>'job_id')::uuid and a.assigned_at<=starts and (a.ended_at is null or a.ended_at>=ends)) then problems:=problems||'"Position assignment must cover the full shift"'::jsonb; end if;
 if jsonb_array_length(problems)>0 then result:=result||jsonb_build_object('status','ineligible','reasons',case when result->>'status'='eligible' then problems else result->'reasons'||problems end); end if;
 return result;
end; $function$;

CREATE OR REPLACE FUNCTION public.weekly_preference_commitment_conflicts(w uuid, emp uuid, proposal jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare prior jsonb; commitment record; span tstzrange; zone_name text; location_name text; conflict_ranges tstzmultirange; previous tstzmultirange;
 fp text; results jsonb:='[]';
begin
 select preference into prior from public.employee_weekly_preferences where workspace_id=w and employee_id=emp;
 prior:=coalesce(prior,public.empty_weekly_preference('time_range'));
 for commitment in select * from public.weekly_preference_commitments(w,emp) where status='pending' order by kind,id loop
  select l.timezone,l.name into zone_name,location_name from public.locations l where l.workspace_id=w and l.id=(commitment.target->>'location_id')::uuid;
  if zone_name is null or nullif(commitment.target->>'start_time','') is null or nullif(commitment.target->>'end_time','') is null then
   raise exception 'Pending request hours could not be checked. Ask a manager to confirm them before saving.' using errcode='22023'; end if;
  span:=app_private.shift_time_range(coalesce(commitment.target->>'date',commitment.target->>'scheduled_date')::date,
   (commitment.target->>'start_time')::time,(commitment.target->>'end_time')::time,coalesce(nullif(commitment.target->>'time_timezone',''),zone_name));
  if span is null or isempty(span) then raise exception 'Pending request hours could not be checked' using errcode='22023'; end if;
  conflict_ranges:=public.weekly_preference_intersections(w,proposal,span,zone_name);
  previous:=public.weekly_preference_intersections(w,prior,span,zone_name);
  if isempty(conflict_ranges) or conflict_ranges=previous then continue; end if;
  fp:=encode(extensions.digest(convert_to(jsonb_build_array(commitment.kind,commitment.id,public.availability_ranges_json(conflict_ranges))::text,'UTF8'),'sha256'),'hex');
  if exists(select 1 from public.weekly_preference_commitment_decisions d where d.workspace_id=w and d.employee_id=emp and d.kind=commitment.kind and d.request_id=commitment.id and d.action='keep' and d.conflict_fingerprint=fp) then continue; end if;
  results:=results||jsonb_build_array(jsonb_build_object('kind',commitment.kind,'id',commitment.id,'fingerprint',fp,'request_revision',commitment.request_revision,
   'request_type',commitment.request_type,'location_name',location_name,'date',coalesce(commitment.target->>'date',commitment.target->>'scheduled_date'),
   'start_time',commitment.target->>'start_time','end_time',commitment.target->>'end_time','timezone',zone_name,'intervals',public.availability_ranges_json(conflict_ranges)));
 end loop;
 return results;
end; $function$;

CREATE OR REPLACE FUNCTION public.get_employee_hub_service(actor_user_id uuid, target_workspace_id uuid, target_from date, target_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare employee public.employee_profiles%rowtype; result jsonb;
begin
  if target_to < target_from or target_to > target_from + 62 then
    raise exception 'employee hub date range is invalid' using errcode = '22023';
  end if;
  employee := public.employee_hub_actor_service(actor_user_id, target_workspace_id);

  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'employee', jsonb_build_object(
      'id', employee.id,
      'display_name', concat_ws(' ', coalesce(nullif(employee.preferred_name,''),employee.first_name), employee.last_name)
    ),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object('id',location.id,'name',location.name) order by location.sort_order,location.name)
      from public.employee_location_assignments assignment
      join public.locations location on location.id=assignment.location_id and location.archived_at is null
      where assignment.employee_id=employee.id and assignment.ended_at is null
    ),'[]'::jsonb),
    'shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',shift.id,'location_id',shift.location_id,'location_name',location.name,'job_name',job.name,
        'scheduled_date',shift.scheduled_date,'time_basis',shift.time_basis,'time_snapshot',shift.time_snapshot,'time_timezone',shift.time_timezone,'start_time',to_char(shift.start_time,'HH24:MI'),
        'end_time',to_char(shift.end_time,'HH24:MI'),'note',shift.note,'employee_id',shift.employee_id
      ) order by shift.scheduled_date,shift.start_time)
      from public.schedule_published_shifts shift
      join public.schedule_location_publications publication on publication.id=shift.publication_id and publication.status='current'
      join public.locations location on location.id=shift.location_id
      join public.jobs job on job.id=shift.job_id
      where shift.workspace_id=target_workspace_id and shift.employee_id=employee.id
        and shift.scheduled_date between target_from and target_to
    ),'[]'::jsonb),
    'open_shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',shift.id,'location_id',shift.location_id,'location_name',location.name,'job_name',job.name,
        'scheduled_date',shift.scheduled_date,'time_basis',shift.time_basis,'time_snapshot',shift.time_snapshot,'time_timezone',shift.time_timezone,'start_time',to_char(shift.start_time,'HH24:MI'),
        'end_time',to_char(shift.end_time,'HH24:MI'),'note',shift.note,'employee_id',null
      ) order by shift.scheduled_date,shift.start_time)
      from public.schedule_published_shifts shift
      join public.schedule_location_publications publication on publication.id=shift.publication_id and publication.status='current'
      join public.locations location on location.id=shift.location_id
      join public.jobs job on job.id=shift.job_id
      where shift.workspace_id=target_workspace_id and shift.employee_id is null
        and shift.scheduled_date between target_from and target_to
        and exists(select 1 from public.employee_location_assignments assignment
          where assignment.employee_id=employee.id and assignment.location_id=shift.location_id and assignment.ended_at is null)
    ),'[]'::jsonb),
    'team_shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',shift.id,'location_id',shift.location_id,'location_name',location.name,'job_name',job.name,
        'scheduled_date',shift.scheduled_date,'time_basis',shift.time_basis,'time_snapshot',shift.time_snapshot,'time_timezone',shift.time_timezone,'start_time',to_char(shift.start_time,'HH24:MI'),
        'end_time',to_char(shift.end_time,'HH24:MI'),'note',shift.note,'employee_id',shift.employee_id,
        'employee_name',concat_ws(' ',coalesce(nullif(teammate.preferred_name,''),teammate.first_name),teammate.last_name)
      ) order by shift.scheduled_date,shift.start_time)
      from public.schedule_published_shifts shift
      join public.schedule_location_publications publication on publication.id=shift.publication_id and publication.status='current'
      join public.locations location on location.id=shift.location_id
      join public.jobs job on job.id=shift.job_id
      join public.employee_profiles teammate on teammate.id=shift.employee_id
      where shift.workspace_id=target_workspace_id and shift.employee_id<>employee.id
        and shift.scheduled_date between target_from and target_to
        and exists(select 1 from public.employee_location_assignments assignment
          where assignment.employee_id=employee.id and assignment.location_id=shift.location_id and assignment.ended_at is null)
    ),'[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(request_row order by request_row->>'created_at' desc) from (
        select jsonb_build_object(
          'id',request.id,'kind','time_off','request_type',request.request_type,'cancellation',public.time_off_cancellation_context(target_workspace_id,request.id),'periods',public.time_off_request_periods(request.id,target_workspace_id), 'decision_events',coalesce((select jsonb_agg(jsonb_build_object('id',ev.id,'action',ev.action,'note',ev.note,'created_at',ev.created_at,'revision',ev.metadata->'revision','released_assignments',public.time_off_event_released_assignments(get_employee_hub_service.actor_user_id,target_workspace_id,ev.id)) order by ev.created_at,ev.id)
  from public.schedule_time_off_events ev where ev.request_id=request.id and ev.workspace_id=target_workspace_id and ev.action in('approved','partially_approved','denied','returned_to_pending','revoked')),'[]'), 'status',request.status::text,
          'title',case when request.request_type='time_off_cancellation' then 'Cancel approved leave · ' else 'Time off · ' end||to_char(min(segment.segment_date),'Mon DD')||case when min(segment.segment_date)<>max(segment.segment_date) then '–'||to_char(max(segment.segment_date),'Mon DD') else '' end,
          'detail',coalesce(nullif(request.reason,''),'No note'),'revision',request.revision,'created_at',request.created_at,
          'can_cancel',request.status='pending'
        ) request_row
        from public.schedule_time_off_requests request
        join public.schedule_time_off_segments segment on segment.request_id=request.id
        where request.workspace_id=target_workspace_id and request.employee_id=employee.id
        group by request.id
      ) requests
    ),'[]'::jsonb),
    'availability', (
      select jsonb_build_object('timezone',version.timezone,'days',version.recurring_rules)
      from public.employee_schedule_availability_versions version
      where version.employee_id=employee.id and version.effective_at<=now()
      order by version.version_number desc limit 1
    ),
    'team', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',teammate.id,
        'display_name',concat_ws(' ',coalesce(nullif(teammate.preferred_name,''),teammate.first_name),teammate.last_name),
        'job_names',coalesce((select jsonb_agg(job.name order by job.sort_order,job.name) from public.employee_job_assignments assignment join public.jobs job on job.id=assignment.job_id where assignment.employee_id=teammate.id and assignment.ended_at is null),'[]'::jsonb),
        'location_names',coalesce((select jsonb_agg(location.name order by location.sort_order,location.name) from public.employee_location_assignments assignment join public.locations location on location.id=assignment.location_id where assignment.employee_id=teammate.id and assignment.ended_at is null),'[]'::jsonb)
      ) order by teammate.last_name,teammate.first_name)
      from public.employee_profiles teammate
      where teammate.workspace_id=target_workspace_id and teammate.archived_at is null and teammate.id<>employee.id
        and exists(select 1 from public.employee_location_assignments mine join public.employee_location_assignments theirs on theirs.location_id=mine.location_id and theirs.ended_at is null where mine.employee_id=employee.id and mine.ended_at is null and theirs.employee_id=teammate.id)
    ),'[]'::jsonb)
  ) into result;
  return result;
end; $function$;

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
$function$
;

CREATE OR REPLACE FUNCTION public.guard_schedule_assignment_availability()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s jsonb:=to_jsonb(new); prior jsonb; a jsonb; evidence jsonb; logical_id uuid; hydrated boolean:=false;
begin
 perform public.availability_lock_workspace(new.workspace_id);
 logical_id:=coalesce(s->>'source_shift_id',s->>'id')::uuid;
 s:=s||jsonb_build_object('id',logical_id);
 if tg_op='UPDATE' and public.schedule_availability_identity(to_jsonb(old))<>public.schedule_availability_identity(s) then
  update public.schedule_service_classifications c set revoked_at=now() where c.workspace_id=new.workspace_id and c.shift_id=logical_id
   and c.revoked_at is null and c.assignment_identity<>public.schedule_availability_identity(s);
 end if;
 
 if tg_op='UPDATE' and new.employee_id is null and old.employee_id is not null then
  update public.schedule_availability_overrides set revoked_at=now() where workspace_id=new.workspace_id and shift_id=logical_id and revoked_at is null;
 end if;
 if tg_op='UPDATE' and public.schedule_availability_identity(s)=public.schedule_availability_identity(to_jsonb(old)) then
  if tg_table_name='schedule_published_shifts' then new.availability_snapshot:=old.availability_snapshot; end if;
  return new;
 end if;
 prior:=public.schedule_availability_prior_publication(new.workspace_id,s,case when tg_table_name='schedule_published_shifts' and tg_op='INSERT' then (s->>'publication_id')::uuid end);
 if prior is not null then
  if tg_table_name='schedule_published_shifts' then
   new.availability_snapshot:=coalesce(nullif(prior->'availability_snapshot','null'),jsonb_build_object(
    'status','legacy_published','original_published_shift_id',prior->>'id','original_publication_id',prior->>'publication_id',
    'message','This existing responsibility predates availability snapshots. Historical availability is not reconstructed.'));
  end if;
  return new;
 end if;
 if tg_table_name<>'schedule_published_shifts' and tg_op='INSERT' then
  -- Acquiring/recovering a draft must remain possible when its old assessment
  -- has become stale. The assignment is retained for repair, not certified.
  select exists(select 1 from public.schedule_draft_shifts x where x.workspace_id=new.workspace_id and x.id=logical_id and public.schedule_availability_identity(to_jsonb(x))=public.schedule_availability_identity(s))
    or exists(select 1 from public.schedule_edit_session_shifts x where x.workspace_id=new.workspace_id and x.id=logical_id and public.schedule_availability_identity(to_jsonb(x))=public.schedule_availability_identity(s)) into hydrated;
  if hydrated then return new; end if;
 end if;
 if new.employee_id is null then
  if tg_table_name='schedule_published_shifts' then new.availability_snapshot:=jsonb_build_object('status','unassigned'); end if;
  return new;
 end if;

 if tg_table_name='schedule_published_shifts' and nullif(current_setting('newfork.schedule_publish_scope',true),'') is not null
  and (current_setting('newfork.schedule_publish_scope',true)::jsonb->>'workspace_id')::uuid=new.workspace_id
  and exists(select 1 from public.schedule_location_publications p where p.id=(s->>'publication_id')::uuid
   and p.source_draft_id=(current_setting('newfork.schedule_publish_scope',true)::jsonb->>'draft_id')::uuid) then
  s:=s||current_setting('newfork.schedule_publish_scope',true)::jsonb;
 end if;
 if nullif(current_setting('newfork.shift_exchange_scope',true),'') is not null
  and (current_setting('newfork.shift_exchange_scope',true)::jsonb->>'workspace_id')::uuid=new.workspace_id
  and current_setting('newfork.shift_exchange_scope',true)::jsonb->'shift_ids' ? logical_id::text then
  s:=s||jsonb_build_object('_exclude_shift_ids',current_setting('newfork.shift_exchange_scope',true)::jsonb->'shift_ids');
 end if;
 a:=public.assess_weekly_shift_availability(new.workspace_id,new.employee_id,s);
 evidence:=public.schedule_availability_override(new.workspace_id,s,a);
 if tg_table_name='schedule_published_shifts' and evidence is null then
  select to_jsonb(o) into evidence from public.schedule_publication_overrides o where o.workspace_id=new.workspace_id
   and o.publication_id=new.publication_id and o.finding_code in ('availability','schedule_conflict') and o.finding_id=a->>'fingerprint'
   and logical_id=any(o.source_shift_ids) and o.employee_id=new.employee_id and o.location_id=new.location_id
   and public.schedule_actor_can_publish_service(o.actor_user_id,new.workspace_id,new.location_id) limit 1;
 end if;
 if a->>'operation'='blocked' or (tg_table_name='schedule_published_shifts' and a->>'operation'='verification_required') then
  raise exception 'Resolve availability, shift hours or approved time off before this assignment' using errcode='23514',detail=a::text;
 end if;
 if a->>'operation'='warning_requires_override' and evidence is null then
  raise exception 'A current availability acceptance is required' using errcode='23514',detail=a::text;
 end if;
 if tg_table_name='schedule_published_shifts' then
  new.availability_snapshot:=jsonb_build_object('status','assessed','captured_at',now(),'assessment',a,'override',evidence);
 elsif tg_op='UPDATE' then
  update public.schedule_availability_overrides set revoked_at=now() where workspace_id=new.workspace_id and shift_id=logical_id
   and revoked_at is null and assessment_fingerprint<>a->>'fingerprint';
 end if;
 return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.process_notification_outbox_service(target_worker_id text, target_outbox_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb; item public.notification_outbox%rowtype; signalled jsonb;
begin
 result:=public.process_notification_outbox_before_signal(target_worker_id,target_outbox_id);
 select * into item from public.notification_outbox where id=target_outbox_id;
 if result->>'status'='processed' and item.subject_type='shift_exchange_cases' then
  -- One workspace signal per transaction, even for a large multi-candidate case.
  -- The content-free bus invalidates authenticated reads; it carries no inbox data.
  begin
   signalled:=coalesce(nullif(current_setting('app.exchange_inbox_signalled',true),''),'[]')::jsonb;
   if not signalled @> jsonb_build_array(item.workspace_id::text) then
    perform realtime.send(jsonb_build_object('workspace_id',item.workspace_id),'changed','shift-exchanges:'||item.workspace_id::text,false);
    perform set_config('app.exchange_inbox_signalled',(signalled||jsonb_build_array(item.workspace_id::text))::text,true);
   end if;
  exception when others then
   -- The existing poll/reconnect path remains available. A broadcast outage
   -- must not roll back a successfully projected inbox item.
   result:=result||jsonb_build_object('invalidation_deferred',true);
  end;
 end if;
 return result;
end; $function$;

CREATE OR REPLACE FUNCTION public.shift_exchange_fingerprint(w uuid, s jsonb, t jsonb)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select md5(jsonb_build_object('offered',public.shift_exchange_terms(s),'requested',public.shift_exchange_terms(t))::text);
$function$;

CREATE OR REPLACE FUNCTION public.shift_exchange_preview(actor uuid, w uuid, cid uuid, aid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.shift_exchange_cases%rowtype; a public.shift_exchange_applications%rowtype;
 s jsonb; t jsonb; r jsonb; g jsonb; problems text[]:='{}'; loc uuid; scoped boolean:=false; missing boolean:=false; fp text;
begin
 select * into c from public.shift_exchange_cases where workspace_id=w and id=cid;
 if c.id is null then raise exception 'Request not found' using errcode='P0002'; end if;
 s:=public.shift_exchange_shift(w,c.offered_source_id); t:=public.shift_exchange_shift(w,c.requested_source_id);
 for loc in select distinct x from unnest(array[(c.offered_snapshot->>'location_id')::uuid,(c.requested_snapshot->>'location_id')::uuid]) x where x is not null loop
  scoped:=scoped or public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.manage',loc);
 end loop;
 if not scoped then raise exception 'Manager scope required' using errcode='42501'; end if;
 select * into a from public.shift_exchange_applications where workspace_id=w and case_id=cid and id=aid;
 if a.id is null then raise exception 'Application not found' using errcode='P0002'; end if;
 if c.status<>'open' or a.status<>'pending_manager' then problems:=array_append(problems,'This request is no longer ready for approval'); end if;
 if s is null or (c.kind='swap' and t is null) then problems:=array_append(problems,'The published shift changed or was unpublished'); end if;
 fp:=public.shift_exchange_fingerprint(w,s,t);
 if fp is distinct from c.consent_fingerprint or fp is distinct from a.consent_fingerprint then problems:=array_append(problems,'Shift conditions changed. New employee consent is required'); end if;
 if c.expires_at<=clock_timestamp() or (s->>'starts_at')::timestamptz<=clock_timestamp() or (t->>'starts_at')::timestamptz<=clock_timestamp() then problems:=array_append(problems,'This shift has already started'); end if;
 if exists(select 1 from public.employee_profiles where workspace_id=w and user_id=actor and id in(c.owner_id,a.employee_id)) then problems:=array_append(problems,'A separate manager must approve your own exchange'); end if;
 if s is not null then r:=public.weekly_exchange_candidate_check(w,a.employee_id,s,array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null)); end if;
 if r is null then r:='{"status":"ineligible","reasons":["Published shift unavailable"]}'; end if;
 if r->>'status'<>'eligible' then problems:=array_append(problems,'The receiving employee is not eligible for the full shift'); end if;
 if c.kind='swap' and t is not null then
  g:=public.weekly_exchange_candidate_check(w,c.owner_id,t,array[(s->>'id')::uuid,(t->>'id')::uuid]::uuid[]);
  if g->>'status'<>'eligible' then problems:=array_append(problems,'The other employee is not eligible for the exchanged shift'); end if;
 end if;
 for loc in select distinct x from unnest(array[(s->>'location_id')::uuid,(t->>'location_id')::uuid]) x where x is not null loop
  if not public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.manage',loc)
   and not exists(select 1 from public.shift_exchange_votes v where v.case_id=cid and v.application_id=aid and v.location_id=loc and v.fingerprint=fp
   and public.schedule_actor_has_capability_service(v.actor_user_id,w,'schedule.shift_change_requests.manage',loc)
   and not exists(select 1 from public.employee_profiles e where e.workspace_id=w and e.user_id=v.actor_user_id and e.id in(c.owner_id,a.employee_id))) then missing:=true; end if;
 end loop;
 return jsonb_build_object('allowed',cardinality(problems)=0,'fingerprint',fp,'reasons',to_jsonb(problems),'receiver',r,'giver',g,'requires_other_manager',missing,
 'other_applications',(select count(*) from public.shift_exchange_applications where case_id=cid and id<>aid and status in('invited','pending_manager')));
end; $function$;

CREATE OR REPLACE FUNCTION public.shift_exchange_reconcile_batch(actor uuid, w uuid, changes jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare s jsonb;
begin
 for s in select * from jsonb_array_elements(changes) loop
  perform public.shift_exchange_rebase_drafts(w,s,(s->>'new_employee_id')::uuid);
 end loop;
end; $function$;

CREATE OR REPLACE FUNCTION public.weekly_assignment_candidate_base(w uuid, emp uuid, target jsonb, excluded uuid[] DEFAULT '{}'::uuid[], travel_minutes integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare loc uuid:=(target->>'location_id')::uuid; job uuid:=(target->>'job_id')::uuid;
  d date:=(target->>'date')::date; tz text; span tstzrange; assessment jsonb;
  available tstzmultirange; overlap tstzmultirange; free tstzmultirange; reasons text[]:=array[]::text[]; state text:='eligible';
begin
  travel_minutes:=greatest(coalesce(travel_minutes,0),coalesce((select minimum_travel_minutes
    from public.workspace_scheduling_settings where workspace_id=w),0));
  select coalesce(nullif(target->>'time_timezone',''),nullif(target->'time_snapshot'->>'timezone',''),timezone) into tz from public.locations where id=loc and workspace_id=w and archived_at is null;
  if tz is null then raise exception 'location not found'; end if;
  span:=app_private.shift_time_range(d,(target->>'start_time')::time,(target->>'end_time')::time,tz);
  if not exists(select 1 from public.employee_profiles p where p.id=emp and p.workspace_id=w and p.archived_at is null and not p.is_excluded_from_schedule
    and (p.start_date is null or p.start_date<=d)) then reasons:=array_append(reasons,'Employee is not active in Schedule'); end if;
  if not exists(select 1 from public.employee_location_assignments where employee_id=emp and workspace_id=w and location_id=loc and assigned_at<=lower(span) and (ended_at is null or ended_at>=upper(span))) then reasons:=array_append(reasons,'Not assigned to this location'); end if;
  if not exists(select 1 from public.employee_job_assignments where employee_id=emp and workspace_id=w and job_id=job and assigned_at<=lower(span) and (ended_at is null or ended_at>=upper(span))) then reasons:=array_append(reasons,'Not eligible for this position'); end if;
  if exists(select 1 from public.schedule_closures c where c.workspace_id=w and c.location_id=loc and c.closed_date=d and (c.is_all_day or (target->>'shift_type_id')::uuid=any(c.shift_type_ids))) then reasons:=array_append(reasons,'Location or service is closed'); end if;
  if public.employee_has_hard_document_schedule_conflict_service(w,emp,d) then reasons:=array_append(reasons,'Required document is expired'); end if;


  if exists(select 1 from public.employee_profiles where workspace_id=w and id=emp) then
    -- A candidate target names its day as date; the assessment reads scheduled_date.
    assessment:=public.assess_weekly_shift_availability(w,emp,target||jsonb_build_object('scheduled_date',d,'_exclude_shift_ids',to_jsonb(excluded)));
    -- Preferences never shorten the requested assignment. Hard blockers remain
    -- in status/reasons; the private assessment carries the separate warning.
    if assessment->>'operation' in ('allowed','warning_requires_override') then
      select coalesce(range_agg(tstzrange((r->>'start_at')::timestamptz,(r->>'end_at')::timestamptz,'[)')),'{}'::tstzmultirange)
        into free from jsonb_array_elements(assessment->'intervals') r;
    end if;
    state:=case assessment->>'operation'
      when 'blocked' then 'ineligible'
      when 'verification_required' then 'verification_required'
      else 'eligible' end;
    reasons:=reasons||array(select r->>'message' from jsonb_array_elements(assessment->'reasons') r
      where r->>'code'<>'availability');
  end if;
  select coalesce(range_agg(r),'{}'::tstzmultirange) into overlap from (
    select app_private.shift_time_range(s.scheduled_date,s.start_time,s.end_time,coalesce(s.time_timezone,l.timezone)) r
    from public.schedule_published_shifts s join public.schedule_location_publications p on p.id=s.publication_id and p.status='current'
    join public.locations l on l.id=s.location_id
    where s.workspace_id=w and s.employee_id=emp and not s.id=any(excluded)
      and s.scheduled_date between d-2 and d+2
  ) busy where r && span;
  if overlap && span then state:='ineligible'; reasons:=array_append(reasons,'Overlaps a published shift or approved time off'); end if;
  if travel_minutes>0 and exists(select 1 from (
    select app_private.shift_time_range(s.scheduled_date,s.start_time,s.end_time,coalesce(s.time_timezone,l.timezone)) r
    from public.schedule_published_shifts s
    join public.schedule_location_publications p on p.id=s.publication_id and p.status='current'
    join public.locations l on l.id=s.location_id
    where s.workspace_id=w and s.employee_id=emp and s.location_id<>loc
      and not s.id=any(excluded) and s.scheduled_date between d-2 and d+2
   ) busy where tstzrange(lower(r)-make_interval(mins=>travel_minutes),upper(r)+make_interval(mins=>travel_minutes),'[)') && span) then
    state:='ineligible';reasons:=array_append(reasons,format('At least %s minutes are required between locations',travel_minutes));
  end if;
  if cardinality(reasons)>0 and state='eligible' then state:='ineligible'; end if;
  if exists(select 1 from unnest(reasons) r where r in('Employee is not active in Schedule','Not assigned to this location','Not eligible for this position','Required document is expired','Location or service is closed')) then state:='ineligible'; end if;

  if cardinality(reasons)=0 then
    reasons:=case when coalesce((assessment->>'has_availability_conflict')::boolean,false)
      then array['Position and location match','No assignment blockers']
      else array['Position and location match','Available for the full interval','No conflicts'] end;
  end if;

  return jsonb_build_object('employee_id',emp,'status',state,'reasons',to_jsonb(reasons),'availability',assessment,
    'available_start',case when free is not null and not isempty(free) then (select lower(r)::text from unnest(free) r order by lower(r) limit 1) end,
    'available_end',case when free is not null and not isempty(free) then (select upper(r)::text from unnest(free) r order by lower(r) limit 1) end);
end; $function$;

CREATE OR REPLACE FUNCTION public.weekly_preference_commitments(w uuid, emp uuid, selected_kind text DEFAULT NULL::text, selected_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(kind text, id uuid, status text, request_revision text, request_type text, target jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select 'exchange_application',a.id,
  case when a.status='approved' then 'finalized' when a.status='pending_manager' and c.status='open' and c.expires_at>now() then 'pending' else 'resolved' end,
  md5(jsonb_build_array(c.revision,a.updated_at,a.status)::text),c.kind,
  coalesce(public.shift_exchange_shift(w,c.offered_source_id),c.offered_snapshot)
 from public.shift_exchange_applications a join public.shift_exchange_cases c on c.workspace_id=w and c.id=a.case_id
 where a.workspace_id=w and a.employee_id=emp and (selected_kind is null or selected_kind='exchange_application')
  and ((selected_id is null and a.status='pending_manager' and c.status='open' and c.expires_at>now()) or a.id=selected_id)
 union all
 select 'exchange_swap',c.id,case when c.status='completed' then 'finalized' when c.status='open' and c.expires_at>now() then 'pending' else 'resolved' end,
  c.revision::text,c.kind,coalesce(public.shift_exchange_shift(w,c.requested_source_id),c.requested_snapshot)
 from public.shift_exchange_cases c where c.workspace_id=w and c.owner_id=emp and c.kind='swap' and (selected_kind is null or selected_kind='exchange_swap')
  and ((selected_id is null and c.status='open' and c.expires_at>now()) or c.id=selected_id)
;
$function$;

CREATE OR REPLACE FUNCTION public.weekly_preferences_save_service(actor uuid, w uuid, command jsonb, request_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare emp uuid:=(command->>'employee_id')::uuid; source text:=command->>'source'; model jsonb; prior jsonb;
 old_command public.weekly_preference_commands%rowtype; required jsonb; choice jsonb; row_value jsonb; commitment record;
 event uuid:=gen_random_uuid(); kept integer:=0; cancelled integer:=0; resolved integer:=0; finalized jsonb:='[]'; result jsonb;
 c public.shift_exchange_cases%rowtype; a public.shift_exchange_applications%rowtype; recipients uuid[]; summary text; changed_days text;
begin
 if request_key is null then raise exception 'Idempotency key required' using errcode='22023'; end if;
 perform public.availability_lock_workspace(w);
 -- Authorize again before idempotent replay; never return a stored private read model.
 model:=public.weekly_preferences_read_service(actor,w,emp);
 if source is null or source not in ('employee','manager') or not coalesce((model->>case when source='employee' then 'can_edit_employee' else 'can_manage' end)::boolean,false) then raise exception 'Preference write access required' using errcode='42501'; end if;
 select * into old_command from public.weekly_preference_commands q where q.workspace_id=w and q.actor_user_id=actor and q.request_key=weekly_preferences_save_service.request_key;
 if old_command.request_key is not null then
  if old_command.command<>command then raise exception 'Idempotency key was used for another save' using errcode='22023'; end if;
  return old_command.result||jsonb_build_object('model',model);
 end if;
 model:=public.validate_weekly_preference_command(actor,w,command); prior:=model->source;
 if source='employee' then
  required:=public.weekly_preference_commitment_conflicts(w,emp,command->'preference');
  if exists(select 1 from jsonb_array_elements(coalesce(command->'decisions','[]')) d group by d->>'kind',d->>'id' having count(*)>1) then raise exception 'Choose each request once' using errcode='22023'; end if;
  for row_value in select value from jsonb_array_elements(required) loop
   if not exists(select 1 from jsonb_array_elements(coalesce(command->'decisions','[]')) d where d->>'kind'=row_value->>'kind' and d->>'id'=row_value->>'id' and d->>'fingerprint'=row_value->>'fingerprint' and d->>'action' in ('keep','cancel')) then
    raise exception 'Pending requests changed. Review each conflicting request before saving.' using errcode='PT409'; end if;
  end loop;
 end if;
 insert into public.weekly_preference_events(id,workspace_id,employee_id,source,actor_user_id,before_record,after_record,decisions)
  values(event,w,emp,source,actor,prior,'{}',coalesce(command->'decisions','[]'));
 for choice in select value from jsonb_array_elements(coalesce(command->'decisions','[]')) loop
  if choice->>'action' is null or choice->>'action' not in ('keep','cancel') then raise exception 'Choose keep or cancel' using errcode='22023'; end if;
  select * into commitment from public.weekly_preference_commitments(w,emp,choice->>'kind',(choice->>'id')::uuid);
  if not found then raise exception 'Request does not belong to this employee' using errcode='42501'; end if;
  if commitment.status='finalized' then finalized:=finalized||jsonb_build_array(jsonb_build_object('kind',commitment.kind,'id',commitment.id)); continue; end if;
  if commitment.status='resolved' then resolved:=resolved+1; continue; end if;
  select value into row_value from jsonb_array_elements(required) where value->>'kind'=choice->>'kind' and value->>'id'=choice->>'id' and value->>'fingerprint'=choice->>'fingerprint';
  if row_value is null then raise exception 'The request conflict changed. Review it again before saving.' using errcode='PT409'; end if;
  insert into public.weekly_preference_commitment_decisions(workspace_id,employee_id,kind,request_id,conflict_fingerprint,action,event_id)
   values(w,emp,commitment.kind,commitment.id,choice->>'fingerprint',choice->>'action',event)
   on conflict(workspace_id,employee_id,kind,request_id) do update set conflict_fingerprint=excluded.conflict_fingerprint,action=excluded.action,event_id=excluded.event_id;
  if choice->>'action'='keep' then kept:=kept+1; continue; end if;
  if commitment.kind='exchange_swap' then
   select * into c from public.shift_exchange_cases where workspace_id=w and id=commitment.id for update;
   update public.shift_exchange_cases set status='cancelled',revision=revision+1,updated_at=now() where id=c.id;
   update public.shift_exchange_applications set status='closed_case_cancelled',updated_at=now() where workspace_id=w and case_id=c.id and status in ('invited','pending_manager');
   delete from public.shift_exchange_votes where workspace_id=w and case_id=c.id;
   perform public.shift_exchange_emit(actor,w,c.id,null,'case_closed','Employee cancelled the swap after updating availability. No assignment changed.');
  else
   select * into a from public.shift_exchange_applications where workspace_id=w and id=commitment.id for update;
   select * into c from public.shift_exchange_cases where workspace_id=w and id=a.case_id for update;
   update public.shift_exchange_applications set status='withdrawn',updated_at=now() where id=a.id;
   update public.shift_exchange_cases set status=case when audience='direct' then 'cancelled' else status end,revision=revision+1,updated_at=now() where id=c.id;
   delete from public.shift_exchange_votes where workspace_id=w and case_id=c.id and application_id=a.id;
   perform public.shift_exchange_emit(actor,w,c.id,a.id,'application_withdrawn','Employee withdrew this request after updating availability. No assignment changed.');
  end if;
  cancelled:=cancelled+1;
 end loop;
 if source='employee' then
  insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by)
   values(w,emp,command->'preference',1,actor) on conflict(workspace_id,employee_id) do update set preference=excluded.preference,revision=employee_weekly_preferences.revision+1,updated_by=actor,updated_at=now();
  update public.employee_onboarding_requirements set status='completed',completed_at=now(),rejection_reason=null,updated_at=now() where workspace_id=w and employee_id=emp and kind='availability';
  update public.employee_onboarding_cases set revision=revision+1,updated_at=now() where workspace_id=w and employee_id=emp;
 else
  insert into public.manager_weekly_reminders(workspace_id,employee_id,preference,enabled,notes,revision,updated_by)
   values(w,emp,command->'preference',(command->>'enabled')::boolean,array(select jsonb_array_elements_text(command->'notes')),1,actor)
   on conflict(workspace_id,employee_id) do update set preference=excluded.preference,enabled=excluded.enabled,notes=excluded.notes,revision=manager_weekly_reminders.revision+1,updated_by=actor,updated_at=now();
 end if;
 model:=public.weekly_preferences_read_service(actor,w,emp);
 update public.weekly_preference_events set after_record=model->(command->>'source') where id=event;
 select string_agg((array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[(d->>'day')::integer+1],', ' order by (d->>'day')::integer) into changed_days
 from jsonb_array_elements(command->'preference'->'days') d
 where d is distinct from (select value from jsonb_array_elements(prior->'preference'->'days') where value->'day'=d->'day');
 summary:=case when source='manager' then 'Manager reminders updated.' else 'Weekly availability updated. '||case when changed_days is null then 'Week confirmed.' else 'Changed days: '||changed_days||'.' end end;
 insert into public.employee_events(workspace_id,employee_id,actor_user_id,action,summary) values(w,emp,actor,case when source='manager' then 'manager_reminders_updated' else 'weekly_availability_updated' end,summary);
 if source='employee' then
  select coalesce(array_agg(m.user_id),'{}') into recipients from public.workspace_memberships m where m.workspace_id=w and m.status='active' and m.user_id<>actor
   and (public.weekly_preference_manager_scope(m.user_id,w,emp,'employees.manage') or exists(select 1 from public.workspace_roles r where r.workspace_id=w and r.id=m.role_id and r.access_class in ('owner','admin')));
  perform public.enqueue_notification_outbox_service(w,event,'availability.weekly_updated',1,actor,'weekly_availability',emp::text,
   jsonb_build_object('recipient_user_ids',to_jsonb(recipients),'audience_contract','availability_scoped_recipients','category','request',
    'title','Availability updated','body',(model->>'employee_name')||': '||summary,'safe_preview','An employee updated weekly availability.',
    'action_url','/app/employees?employeeId='||emp::text||'&section=availability','employee_id',emp,'changed_days',changed_days,'group_key','weekly-availability:'||emp::text),now());
 end if;
 result:=jsonb_build_object('kept_count',kept,'cancelled_count',cancelled,'resolved_count',resolved,'finalized',finalized);
 insert into public.weekly_preference_commands(workspace_id,actor_user_id,request_key,command,result) values(w,actor,request_key,command,result);
 return result||jsonb_build_object('model',model);
end; $function$;

-- 2. The two wrappers Line Up put on the notification relay -----------------------------
drop function public.project_notification_inbox_service(uuid);
alter function public.project_notification_inbox_staffing_base(uuid) rename to project_notification_inbox_service;
grant execute on function public.project_notification_inbox_service(uuid) to service_role;
drop function public.shift_exchange_notification_allowed(uuid, uuid);
alter function public.shift_exchange_notification_allowed_staffing_base(uuid, uuid) rename to shift_exchange_notification_allowed;

-- Only Line Up called these.
drop function public.shift_exchange_person_scheduled(uuid, uuid, date, uuid, uuid);
drop function public.shift_exchange_reconcile_shared_base(uuid, uuid, jsonb, uuid);

-- 3. Permission keys, notification types, the offer kind -------------------------------
delete from app_private.role_permission_dependencies
where permission_key like 'schedule.lineup.%' or required_key like 'schedule.lineup.%';
delete from public.workspace_role_permissions where permission_key like 'schedule.lineup.%';
delete from public.permissions where key like 'schedule.lineup.%';

delete from public.notification_template_versions where type_key like 'schedule.staffing.%';
delete from public.notification_producer_registry where type_key like 'schedule.staffing.%';
delete from public.notification_catalog where type_key like 'schedule.staffing.%';

delete from public.weekly_preference_commitment_decisions where kind = 'lineup_offer';
alter table public.weekly_preference_commitment_decisions drop constraint weekly_preference_commitment_decisions_kind_check;
alter table public.weekly_preference_commitment_decisions add constraint weekly_preference_commitment_decisions_kind_check
  check (kind in ('exchange_application', 'exchange_swap', 'legacy_request'));

-- 4. Triggers on tables that stay, then every Line Up function, table and column -----------
drop trigger initialize_schedule_lineup_sections_trigger on public.workspaces;
drop trigger lineup_rebind_published_source on public.schedule_published_shifts;
drop trigger lineup_staffing_notification_insert on public.notifications;
drop trigger weekly_lineup_offer_publication_terms_changed on public.schedule_location_publications;
drop trigger weekly_lineup_offer_shift_terms_changed on public.schedule_published_shifts;

-- This one returns a lineup_proposals row, so it goes before the tables. The tables
-- take their own triggers with them; the trigger functions go after.
drop function public.weekly_lineup_accepted_offer(w uuid, op jsonb);
drop table public.lineup_notes, public.lineup_notification_outbox, public.lineup_operation_events,
  public.lineup_proposals, public.lineup_receipts, public.lineup_section_plans, public.schedule_lineup_briefs,
  public.schedule_lineup_entries, public.schedule_lineup_sections, public.schedule_lineup_snapshots,
  public.schedule_lineups;
alter table public.locations drop column lineup_operations_enabled;

drop function public.archive_schedule_lineup_section_service(actor_user_id uuid, target_workspace_id uuid, target_section_id uuid, target_expected_revision integer);
drop function public.bind_weekly_lineup_manual_offer_source();
drop function public.bind_weekly_lineup_offer_source();
drop function public.delete_schedule_lineup_entry_service(actor_user_id uuid, target_workspace_id uuid, target_entry_id uuid, target_expected_revision integer);
drop function public.deliver_lineup_notifications_service(actor uuid, w uuid, snapshot_ids uuid[]);
drop function public.flush_lineup_staffing_notifications_service(target_workspace_id uuid, target_proposal_id uuid, target_event_id uuid, target_batch_size integer);
drop function public.get_schedule_lineup_operations_base(actor_user_id uuid, target_workspace_id uuid, target_date date, target_location_ids uuid[], target_shift_type_ids uuid[]);
drop function public.get_schedule_lineup_service(actor_user_id uuid, target_workspace_id uuid, target_date date, target_location_ids uuid[], target_shift_type_ids uuid[]);
drop function public.initialize_schedule_lineup_sections_after_workspace_insert();
drop function public.lineup_assert_enabled(actor uuid, w uuid, locations uuid[], permission text);
drop function public.lineup_assign_segment(actor uuid, w uuid, source_id uuid, emp uuid, target jsonb);
drop function public.lineup_candidate_check(w uuid, emp uuid, target jsonb, excluded uuid[], travel_minutes integer);
drop function public.lineup_candidate_check_exchange_base(w uuid, emp uuid, target jsonb, excluded uuid[], travel_minutes integer);
drop function public.lineup_candidate_option(actor uuid, w uuid, emp uuid, target jsonb, excluded uuid[], need jsonb);
drop function public.lineup_clip_placements(segments jsonb, span tstzrange);
drop function public.lineup_copy_segment_placement(actor uuid, w uuid, original_entry jsonb, shift_id uuid, span tstzrange);
drop function public.lineup_day_publication(w uuid, loc uuid, day date);
drop function public.lineup_effective_travel_minutes(w uuid, requested integer);
drop function public.lineup_employee_assignment(e jsonb);
drop function public.lineup_employee_details(current_content jsonb, prior_content jsonb, prior_version integer, emp uuid);
drop function public.lineup_entry_day(w uuid, entry_id uuid);
drop function public.lineup_fill_coverage(actor uuid, w uuid, need jsonb, emp uuid, target jsonb);
drop function public.lineup_operation_model(actor uuid, w uuid, d date, op jsonb);
drop function public.lineup_operation_preview(actor uuid, w uuid, op jsonb);
drop function public.lineup_operations_service(actor_user_id uuid, target_workspace_id uuid, action text, payload jsonb);
drop function public.lineup_person_fingerprint(content jsonb, emp uuid);
drop function public.lineup_placements_service(actor uuid, w uuid, action text, payload jsonb);
drop function public.lineup_prepare_placement(w uuid, loc uuid, d date, tz text, before_entry jsonb, entry jsonb);
drop function public.lineup_project_entry(entry jsonb, tz text);
drop function public.lineup_proposals_service(actor_user_id uuid, target_workspace_id uuid, action text, payload jsonb);
drop function public.lineup_rebind_published_source();
drop function public.lineup_section_restriction(w uuid, section_id uuid, loc uuid, service_id uuid, job uuid);
drop function public.lineup_share_content(actor uuid, w uuid, d date, locations uuid[]);
drop function public.lineup_share_content_for_services(actor uuid, w uuid, d date, locations uuid[], services uuid[]);
drop function public.lineup_shift_range(d date, s time without time zone, e time without time zone, tz text);
drop function public.lineup_split_has_publications(w uuid, loc uuid, original tstzrange, part tstzrange, travel integer);
drop function public.lineup_staffing_broadcast();
drop function public.lineup_staffing_enqueue_notification(nid uuid);
drop function public.lineup_staffing_notification_allowed(oid uuid, recipient uuid);
drop function public.lineup_staffing_notification_insert();
drop function public.lineup_staffing_proposal_status();
drop function public.lineup_staffing_sync_notifications(w uuid);
drop function public.move_schedule_lineup_entry_service(actor_user_id uuid, target_workspace_id uuid, move jsonb);
drop function public.preview_schedule_lineup_scoped_share_service(actor_user_id uuid, target_workspace_id uuid, target_date date, target_location_ids uuid[], target_shift_type_ids uuid[]);
drop function public.preview_schedule_lineup_share_service(actor_user_id uuid, target_workspace_id uuid, target_date date, target_location_ids uuid[]);
drop function public.record_weekly_lineup_manager_assignment(actor uuid, w uuid, logical_id uuid, emp uuid, target jsonb);
drop function public.record_weekly_lineup_offer_assignment(actor uuid, w uuid, source_id uuid, logical_id uuid, emp uuid, target jsonb);
drop function public.record_weekly_lineup_retained_segment(actor uuid, w uuid, source_id uuid, logical_id uuid, piece tstzrange);
drop function public.refresh_weekly_lineup_offer_terms(w uuid, pid uuid);
drop function public.refresh_weekly_lineup_offer_terms_after_entry();
drop function public.refresh_weekly_lineup_offer_terms_after_publication();
drop function public.refresh_weekly_lineup_offers_for_actor(actor uuid, w uuid, employee uuid);
drop function public.require_weekly_lineup_offer_acceptance(actor uuid, w uuid, pid uuid, command jsonb);
drop function public.share_schedule_lineup_scoped_service(actor_user_id uuid, target_workspace_id uuid, target_date date, target_location_ids uuid[], expected_fingerprint text, target_shift_type_ids uuid[]);
drop function public.share_schedule_lineup_service(actor_user_id uuid, target_workspace_id uuid, target_date date, target_location_ids uuid[], expected_fingerprint text);
drop function public.shift_exchange_lineup_reconciliation_issue(w uuid, s jsonb);
drop function public.upsert_schedule_lineup_brief_service(actor_user_id uuid, target_workspace_id uuid, target_location_id uuid, target_date date, target_shift_type_id uuid, target_expected_revision integer, brief jsonb);
drop function public.upsert_schedule_lineup_entry_operations_base(actor_user_id uuid, target_workspace_id uuid, target_location_id uuid, target_date date, target_entry_id uuid, target_expected_revision integer, entry jsonb);
drop function public.upsert_schedule_lineup_entry_service(actor_user_id uuid, target_workspace_id uuid, target_location_id uuid, target_date date, target_entry_id uuid, target_expected_revision integer, entry jsonb);
drop function public.upsert_schedule_lineup_section_service(actor_user_id uuid, target_workspace_id uuid, target_section_id uuid, target_expected_revision integer, section jsonb);
drop function public.weekly_lineup_assignment_target(w uuid, emp uuid, target jsonb, preview jsonb, op jsonb);
drop function public.weekly_lineup_candidate_option(actor uuid, w uuid, emp uuid, target jsonb, excluded uuid[], need jsonb);
drop function public.weekly_lineup_entry_span(w uuid, entry jsonb, location jsonb, d date);
drop function public.weekly_lineup_manager_candidate(w uuid, emp uuid, target jsonb, excluded uuid[], travel integer);
drop function public.weekly_lineup_offer_candidate(w uuid, emp uuid, target jsonb, excluded uuid[], travel integer, op jsonb);
drop function public.weekly_lineup_offer_warning(w uuid, pid uuid);

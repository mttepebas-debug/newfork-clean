-- FOUNDATION-B 5.3b: employee availability has three levels, and a manager's
-- private reminder is always soft (user decision 2026-09-24, replacing the
-- two-option decision of 2026-09-23).
--
-- Settings > Conflict handling > Employee availability: Warn (the warning is
-- shown and the shift is written), Require confirmation (soft: the manager
-- chooses to cancel or place anyway, recorded) or Block (hard). "Allow", which
-- wrote without a word, is gone; the other rules already had these three.
-- The shared check reports the employee's own marks and the manager's reminder
-- as separate reasons: the first follows the setting, the second is always
-- "confirm". The grid gets the employee's own intervals so the browser can
-- tell the two apart before saving.

update public.workspace_scheduling_settings
set conflict_rules = jsonb_set(conflict_rules, '{availability}', '"warn"')
where conflict_rules ->> 'availability' = 'allow';
alter table public.workspace_scheduling_settings drop constraint scheduling_conflict_rules_valid;
alter table public.workspace_scheduling_settings add constraint scheduling_conflict_rules_valid CHECK (((jsonb_typeof(conflict_rules) = 'object'::text) AND (conflict_rules ?& ARRAY['availability'::text, 'approved_time_off'::text, 'closed_location'::text, 'minimum_travel'::text, 'minimum_rest'::text, 'document_required'::text, 'document_conditional_grace'::text, 'document_conditional_overdue'::text]) AND ((conflict_rules - ARRAY['availability'::text, 'approved_time_off'::text, 'closed_location'::text, 'minimum_travel'::text, 'minimum_rest'::text, 'document_required'::text, 'document_conditional_grace'::text, 'document_conditional_overdue'::text]) = '{}'::jsonb) AND ((conflict_rules ->> 'availability'::text) = ANY (ARRAY['warn'::text, 'confirm'::text, 'block'::text])) AND ((conflict_rules ->> 'approved_time_off'::text) = ANY (ARRAY['confirm'::text, 'block'::text])) AND ((conflict_rules ->> 'closed_location'::text) = ANY (ARRAY['warn'::text, 'confirm'::text, 'block'::text])) AND ((conflict_rules ->> 'minimum_travel'::text) = ANY (ARRAY['warn'::text, 'confirm'::text, 'block'::text])) AND ((conflict_rules ->> 'minimum_rest'::text) = ANY (ARRAY['warn'::text, 'confirm'::text, 'block'::text])) AND ((conflict_rules ->> 'document_required'::text) = ANY (ARRAY['warn'::text, 'confirm'::text, 'block'::text])) AND ((conflict_rules ->> 'document_conditional_grace'::text) = ANY (ARRAY['warn'::text, 'confirm'::text, 'block'::text])) AND ((conflict_rules ->> 'document_conditional_overdue'::text) = ANY (ARRAY['confirm'::text, 'block'::text])) AND (array_position(ARRAY['warn'::text, 'confirm'::text, 'block'::text], (conflict_rules ->> 'document_conditional_overdue'::text)) >= array_position(ARRAY['warn'::text, 'confirm'::text, 'block'::text], (conflict_rules ->> 'document_conditional_grace'::text)))));

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
 -- The employee's own marks follow the workspace setting; a manager's private
 -- reminder is always soft, whatever the setting (user decision 2026-09-24).
 if span is not null and jsonb_array_length(capacity->'employee_intervals')>0 then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','availability',
  'message','The assignment overlaps unavailable hours.','intervals',capacity->'employee_intervals','definite',true)); end if;
 if span is not null and jsonb_array_length(capacity->'manager_intervals')>0 then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','availability',
  'source','reminder','message','The assignment overlaps hours a manager noted as unavailable.','intervals',capacity->'manager_intervals','definite',true)); end if;
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
   when 'availability' then case when rule->>'source'='reminder' then 'confirm' else settings.conflict_rules->>'availability' end
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

CREATE OR REPLACE FUNCTION app_private.schedule_week_availability(target_workspace_id uuid, target_week_start date, target_employee_ids uuid[], target_location_ids uuid[], with_reminders boolean DEFAULT true)
 RETURNS TABLE(employee_id uuid, location_id uuid, unavailable tstzmultirange, leave tstzmultirange, projection jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with location_zone as (
  select l.id, l.name, l.timezone, app_private.timezone_name_valid(l.timezone) as zone_ok
  from public.locations l
  where l.workspace_id = target_workspace_id and l.id = any(target_location_ids)
), zone as (
  select distinct z.timezone as zone_name from location_zone z where z.zone_ok
), piece as (
  -- Two four-day pieces, as the offset helper is bounded to eight physical
  -- days and a fall-back week is eight days and an hour.
  select z.zone_name,
    tstzrange((target_week_start + o.offset_days)::timestamp at time zone z.zone_name,
              (target_week_start + o.offset_days + 4)::timestamp at time zone z.zone_name, '[)') as span
  from zone z cross join (values (0), (4)) o(offset_days)
), segment as (
  select p.zone_name, s.utc_span, s.offset_seconds
  from piece p cross join lateral public.availability_offset_segments(p.span, p.zone_name) s
), mark as (
  select e.employee_id, false as reminder, e.preference, public.weekly_preference_valid(e.preference) as valid
  from public.employee_weekly_preferences e
  where e.workspace_id = target_workspace_id and e.employee_id = any(target_employee_ids)
  union all
  select m.employee_id, true, m.preference, public.weekly_preference_valid(m.preference)
  from public.manager_weekly_reminders m
  where with_reminders and m.workspace_id = target_workspace_id and m.employee_id = any(target_employee_ids) and m.enabled
), mark_day as (
  select m.employee_id, m.reminder, m.valid, m.preference ->> 'input_mode' as input_mode, d.value as rule
  from mark m cross join lateral jsonb_array_elements(case when m.valid then m.preference -> 'days' else '[]'::jsonb end) d
), clock as (
  select md.employee_id, md.reminder, (md.rule ->> 'day')::integer as dow,
    time '00:00' as start_clock, time '24:00' as end_clock, true as ok
  from mark_day md
  where coalesce((md.rule ->> 'all_day')::boolean, false)
  union all
  select md.employee_id, md.reminder, (md.rule ->> 'day')::integer,
    (md.rule -> 'range' ->> 'start')::time, (md.rule -> 'range' ->> 'end')::time, true
  from mark_day md
  where not coalesce((md.rule ->> 'all_day')::boolean, false) and md.input_mode = 'time_range'
    and md.rule -> 'range' <> 'null'::jsonb
  union all
  select md.employee_id, md.reminder, (md.rule ->> 'day')::integer, hours.start_clock, hours.end_clock,
    hours.start_clock is not null and hours.end_clock is not null and hours.start_clock <> hours.end_clock
  from mark_day md
  cross join lateral jsonb_array_elements_text(md.rule -> 'shift_type_ids') selected(type_id)
  cross join lateral (
    select case when t.id is not null and t.archived_at is null and t.deleted_at is null then t.default_start_time else d.start_time end as start_clock,
           case when t.id is not null and t.archived_at is null and t.deleted_at is null then t.default_end_time else d.end_time end as end_clock
    from (select selected.type_id::uuid as id) chosen
    left join public.shift_types t on t.workspace_id = target_workspace_id and t.id = chosen.id
    left join public.weekly_preference_type_defaults d on d.workspace_id = target_workspace_id and d.shift_type_id = chosen.id
  ) hours
  where not coalesce((md.rule ->> 'all_day')::boolean, false) and md.input_mode = 'shift_type'
), broken as (
  -- A mark that cannot be read (invalid, or a shift type without hours) makes
  -- the employee's week unknown rather than partly drawn.
  select m.employee_id from mark m where not m.valid
  union
  select c.employee_id from clock c where not c.ok
), local_day as (
  select s.zone_name, s.utc_span, s.offset_seconds, day::date as local_date
  from segment s
  cross join lateral generate_series(
    (((lower(s.utc_span) at time zone 'UTC') + make_interval(secs => s.offset_seconds))::date - 1)::timestamp,
    (((upper(s.utc_span) at time zone 'UTC') + make_interval(secs => s.offset_seconds))::date)::timestamp,
    interval '1 day') day
), unavailable_piece as (
  select c.employee_id, c.reminder, ld.zone_name,
    tstzrange(((ld.local_date + c.start_clock) at time zone 'UTC') - make_interval(secs => ld.offset_seconds),
              ((ld.local_date + c.end_clock + case when c.end_clock < c.start_clock then interval '1 day' else interval '0' end) at time zone 'UTC')
                - make_interval(secs => ld.offset_seconds), '[)') * ld.utc_span as span
  from local_day ld
  join clock c on c.dow = extract(dow from ld.local_date)::integer and c.ok
), unavailable as (
  select u.employee_id, u.zone_name, range_agg(u.span) as spans,
    range_agg(u.span) filter (where not u.reminder) as own_spans
  from unavailable_piece u
  where not isempty(u.span)
  group by u.employee_id, u.zone_name
), leave_target as (
  select z.zone_name,
    tstzrange(target_week_start::timestamp at time zone z.zone_name, (target_week_start + 8)::timestamp at time zone z.zone_name, '[)') as span
  from zone z
), leave as (
  select req.employee_id, lt.zone_name, range_agg(piece.span * lt.span) as spans
  from leave_target lt
  join public.schedule_time_off_requests req
    on req.workspace_id = target_workspace_id and req.employee_id = any(target_employee_ids)
   and req.request_type = 'time_off' and req.status in ('approved', 'partially_approved')
  join public.schedule_time_off_segments seg
    on seg.request_id = req.id and seg.workspace_id = req.workspace_id and seg.status = 'approved'
   and seg.segment_date between target_week_start - 4 and target_week_start + 12
  cross join lateral unnest(public.time_off_effective_ranges(seg.id)) piece(span)
  where piece.span && lt.span
  group by req.employee_id, lt.zone_name
), clock_segments as (
  select s.zone_name,
    jsonb_agg(jsonb_build_object('start_at', lower(s.utc_span), 'end_at', upper(s.utc_span), 'offset_seconds', s.offset_seconds)
      order by lower(s.utc_span)) as segments
  from segment s
  group by s.zone_name
), day_span as (
  select z.zone_name, target_week_start + i as work_date,
    tstzrange((target_week_start + i)::timestamp at time zone z.zone_name, (target_week_start + i + 1)::timestamp at time zone z.zone_name, '[)') as span
  from zone z cross join generate_series(0, 6) i
), employee_zone as (
  -- Everything but the location's own name is the same for every location in
  -- a time zone, so it is built once per employee and zone.
  select e.employee_id, z.zone_name,
    coalesce(u.spans, '{}'::tstzmultirange) as unavailable,
    coalesce(lv.spans, '{}'::tstzmultirange) as leave,
    jsonb_build_object(
      'status', 'ready',
      'unavailable_intervals', public.availability_ranges_json(coalesce(u.spans, '{}'::tstzmultirange)),
      -- The employee's own marks alone: what is left over came from a manager's
      -- reminder, which is always soft.
      'employee_intervals', public.availability_ranges_json(coalesce(u.own_spans, '{}'::tstzmultirange)),
      'leave_intervals', public.availability_ranges_json(coalesce(lv.spans, '{}'::tstzmultirange)),
      'clock_segments', cs.segments,
      'days', (select jsonb_agg(jsonb_build_object(
                 'date', ds.work_date,
                 'has_unavailable', coalesce(u.spans, '{}'::tstzmultirange) && ds.span,
                 'all_day', coalesce(u.spans, '{}'::tstzmultirange) @> ds.span) order by ds.work_date)
               from day_span ds where ds.zone_name = z.zone_name)) as body
  from unnest(target_employee_ids) e(employee_id)
  cross join zone z
  left join unavailable u on u.employee_id = e.employee_id and u.zone_name = z.zone_name
  left join leave lv on lv.employee_id = e.employee_id and lv.zone_name = z.zone_name
  left join clock_segments cs on cs.zone_name = z.zone_name
  where not exists (select 1 from broken b where b.employee_id = e.employee_id)
)
select e.employee_id, lz.id, ez.unavailable, ez.leave,
  jsonb_build_object('location_id', lz.id, 'location_name', lz.name, 'timezone', lz.timezone, 'week_start', target_week_start)
  || coalesce(ez.body, jsonb_build_object('status', 'unknown', 'unavailable_intervals', '[]'::jsonb, 'employee_intervals', '[]'::jsonb, 'leave_intervals', '[]'::jsonb,
       'clock_segments', '[]'::jsonb, 'days', '[]'::jsonb))
from unnest(target_employee_ids) e(employee_id)
cross join location_zone lz
left join employee_zone ez on ez.employee_id = e.employee_id and ez.zone_name = lz.timezone and lz.zone_ok;
$function$;

-- One answer to "can this person take this shift" for swap, pickup and cover
-- (FB-6.4 A1). The five candidate checks folded into it are dropped below.
--   blockers          nobody may set these aside: location and job assignment,
--                     two shifts at once, closed location, inactive person,
--                     expired document, unresolved hours, approved time off
--                     the person did not agree to give up
--   acknowledgements  the person sets these aside themselves: their own
--                     approved time off (shortened at approval, BL-182) and
--                     their own availability mark (M6)
--   approval_flags    shown to the approving manager, never a blocker: travel
--                     and rest under Settings > Scheduling > Conflict handling
--                     whatever its severity (D7), availability set aside by
--                     consent (M6), the manager's own reminder note (M12)
-- ctx: operation (swap | release_pickup | open_pickup | cover_accept),
--      excluded (shift ids the person gives up in the same change),
--      consent (true while the person acts themselves, else the time-off
--      intervals they agreed to), with_assessment (the private assessment, for
--      the acceptance record only).
-- status, reasons and shortens_time_off keep the shape Shift Hub reads today.
create function app_private.eligibility(w uuid, emp uuid, shift jsonb, ctx jsonb default '{}')
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $$
declare
 op text:=ctx->>'operation';
 excluded uuid[]:=array(select value::uuid from jsonb_array_elements_text(
  case when jsonb_typeof(ctx->'excluded')='array' then ctx->'excluded' else '[]'::jsonb end) where value is not null);
 consent jsonb:=ctx->'consent';
 loc uuid:=(shift->>'location_id')::uuid; d date:=(shift->>'date')::date;
 tz text; span tstzrange; a jsonb; leave jsonb; settings public.workspace_scheduling_settings%rowtype;
 blockers jsonb:='[]'; acks jsonb:='[]'; flags jsonb:='[]'; shortens boolean:=false; r jsonb;
 travel numeric; rest numeric; gap numeric; n record;
begin
 if op is null or op not in ('swap','release_pickup','open_pickup','cover_accept') then
  raise exception 'Unknown exchange operation' using errcode='22023'; end if;
 if nullif(shift->>'start_time','') is null or nullif(shift->>'end_time','') is null then
  return jsonb_build_object('employee_id',emp,'operation',op,'eligible',false,'status','verification_required',
   'blockers',jsonb_build_array(jsonb_build_object('code','hours_unconfirmed','message','A manager must confirm the shift hours before a full-shift exchange')),
   'acknowledgements','[]'::jsonb,'approval_flags','[]'::jsonb,'approvals_required',jsonb_build_array(loc),'shortens_time_off',false,
   'reasons',jsonb_build_array('A manager must confirm the shift hours before a full-shift exchange'));
 end if;
 select coalesce(nullif(shift->>'time_timezone',''),nullif(shift->'time_snapshot'->>'timezone',''),l.timezone) into tz
  from public.locations l where l.id=loc and l.workspace_id=w and l.archived_at is null;
 if tz is null then raise exception 'location not found'; end if;
 select * into settings from public.workspace_scheduling_settings where workspace_id=w;
 span:=app_private.shift_time_range(d,(shift->>'start_time')::time,(shift->>'end_time')::time,tz);

 if not exists(select 1 from public.employee_profiles e join public.workspace_memberships m
  on m.workspace_id=e.workspace_id and m.user_id=e.user_id and m.status='active' where e.workspace_id=w and e.id=emp) then
  blockers:=blockers||jsonb_build_array(jsonb_build_object('code','workspace_access','message','Active workspace access is required')); end if;
 if not exists(select 1 from public.employee_location_assignments x where x.workspace_id=w and x.employee_id=emp and x.location_id=loc
  and x.assigned_at<=lower(span) and (x.ended_at is null or x.ended_at>=upper(span))) then
  blockers:=blockers||jsonb_build_array(jsonb_build_object('code','location_assignment','message','Not assigned to this location')); end if;
 if not exists(select 1 from public.employee_job_assignments x where x.workspace_id=w and x.employee_id=emp and x.job_id=(shift->>'job_id')::uuid
  and x.assigned_at<=lower(span) and (x.ended_at is null or x.ended_at>=upper(span))) then
  blockers:=blockers||jsonb_build_array(jsonb_build_object('code','job_assignment','message','Not eligible for this position')); end if;
 -- Documents stay as they are today (out of scope 2): an expired blocking document,
 -- and any document rule the conflict settings raise, below.
 if public.employee_has_hard_document_schedule_conflict_service(w,emp,d) then
  blockers:=blockers||jsonb_build_array(jsonb_build_object('code','document_expired','message','Required document is expired')); end if;

 -- The assessment reads the shift the way Schedule does; '_shift_exchange'
 -- keeps travel and rest out of it, they are flags here (D7).
 a:=public.assess_weekly_shift_availability(w,emp,shift||jsonb_build_object('scheduled_date',d,
  '_exclude_shift_ids',to_jsonb(excluded),'_shift_exchange',true));
 for r in select value from jsonb_array_elements(a->'reasons') loop
  if r->>'code' not in ('availability','note','approved_time_off') and not blockers @> jsonb_build_array(jsonb_build_object('code',r->>'code')) then
   blockers:=blockers||jsonb_build_array(jsonb_build_object('code',r->>'code','message',r->>'message')); end if;
 end loop;
 -- Approved time off: only the person's own consent sets it aside (BL-182), and
 -- only for the hours they agreed to; a cover search never passes consent (D1).
 leave:=public.time_off_leave_intervals(a);
 if jsonb_array_length(leave)>0 then
  if consent='true'::jsonb or (jsonb_typeof(consent)='array'
   and public.availability_json_ranges(consent) @> public.availability_json_ranges(leave)) then
   shortens:=true;
   acks:=acks||jsonb_build_array(jsonb_build_object('code','approved_time_off','intervals',leave));
  else
   blockers:=blockers||jsonb_build_array(jsonb_build_object('code','approved_time_off','message',
    (select x->>'message' from jsonb_array_elements(a->'reasons') x where x->>'code'='approved_time_off' limit 1)));
  end if;
 end if;
 if coalesce((a->>'has_availability_conflict')::boolean,false) and jsonb_array_length(coalesce(a->'employee_intervals','[]'))>0 then
  acks:=acks||jsonb_build_array(jsonb_build_object('code','availability','intervals',a->'employee_intervals'));
  flags:=flags||jsonb_build_array(jsonb_build_object('code','availability_consent'));
 end if;
 if jsonb_array_length(coalesce(a->'manager_intervals','[]'))>0 then
  flags:=flags||jsonb_build_array(jsonb_build_object('code','manager_note')); end if;

 -- Travel and rest, measured against the person's other published shifts (D7).
 for n in select p.location_id,app_private.shift_time_range(p.scheduled_date,p.start_time,p.end_time,coalesce(p.time_timezone,l.timezone)) r
  from public.schedule_published_shifts p join public.schedule_location_publications pub on pub.id=p.publication_id and pub.status='current'
  join public.locations l on l.id=p.location_id
  where p.workspace_id=w and p.employee_id=emp and p.scheduled_date between d-2 and d+2
   and not p.id=any(excluded) and not coalesce(p.source_shift_id,p.id)=any(excluded)
 loop
  if n.r && span then continue; end if;
  gap:=extract(epoch from greatest(lower(span)-upper(n.r),lower(n.r)-upper(span)))/60;
  if n.location_id<>loc and gap<settings.minimum_travel_minutes then travel:=least(coalesce(travel,gap),gap); end if;
  if gap<settings.minimum_rest_minutes then rest:=least(coalesce(rest,gap),gap); end if;
 end loop;
 if travel is not null then flags:=flags||jsonb_build_array(jsonb_build_object('code','minimum_travel',
  'gap_minutes',travel::integer,'rule_minutes',settings.minimum_travel_minutes)); end if;
 if rest is not null then flags:=flags||jsonb_build_array(jsonb_build_object('code','minimum_rest',
  'gap_minutes',rest::integer,'rule_minutes',settings.minimum_rest_minutes)); end if;

 return jsonb_build_object('employee_id',emp,'operation',op,'eligible',jsonb_array_length(blockers)=0,
  'status',case when jsonb_array_length(blockers)=0 then 'eligible' else 'ineligible' end,
  'blockers',blockers,'acknowledgements',acks,'approval_flags',flags,'approvals_required',jsonb_build_array(loc),
  'shortens_time_off',shortens,
  'reasons',case when jsonb_array_length(blockers)=0 then '["Position and location match","No assignment blockers"]'::jsonb
   else (select jsonb_agg(b->>'message') from jsonb_array_elements(blockers) b) end)
  ||case when coalesce((ctx->>'with_assessment')::boolean,false) then jsonb_build_object('assessment',a) else '{}'::jsonb end;
end;
$$;
revoke all on function app_private.eligibility(uuid,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;

-- D7: in a swap, pickup or cover, travel and rest are the approving manager's
-- flags (app_private.eligibility), never a conflict that stops the transfer.
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
 conflict_severity text; rule_severity text; rule jsonb; annotated jsonb:='[]'; availability_fingerprint text;
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
 -- Only the employee's own marks are unavailable hours; the note is not (M12).
 select coalesce(range_agg(tstzrange((x->>'start_at')::timestamptz,(x->>'end_at')::timestamptz,'[)')),'{}') into unavailable
  from jsonb_array_elements(capacity->'employee_intervals') x;
 for leave_row in select seg.id,seg.request_id,req.revision,approved_piece.span
  from public.schedule_time_off_segments seg
  join public.schedule_time_off_requests req on req.id=seg.request_id and req.workspace_id=seg.workspace_id
  cross join lateral unnest(public.time_off_effective_ranges(seg.id)) approved_piece(span)
  where req.workspace_id=w and req.employee_id=emp and req.request_type='time_off'
   and req.status = 'approved' and seg.status='approved'
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
 -- The employee's own mark is always only a warning (M8); a manager's note is
 -- a reminder shown while writing, nothing more (M12).
 if span is not null and jsonb_array_length(capacity->'employee_intervals')>0 then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','availability',
  'message','The assignment overlaps unavailable hours.','intervals',capacity->'employee_intervals','definite',true)); end if;
 if span is not null and jsonb_array_length(capacity->'manager_intervals')>0 then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','note',
  'message','The assignment overlaps hours a manager noted for this person.','intervals',capacity->'manager_intervals','definite',true)); end if;
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
   -- Excluded from Schedule keeps a person out of new shifts only (BL-218): a
   -- shift already published with them stays theirs through edits and republishing.
   if not exists(select 1 from public.employee_profiles where workspace_id=w and id=emp and archived_at is null and (start_date is null or start_date<=day)
     and (not is_excluded_from_schedule or exists(select 1 from public.schedule_published_shifts published
       where published.workspace_id=w and published.employee_id=emp
         and published.source_shift_id=coalesce(nullif(shift->>'source_shift_id',''),shift->>'id')::uuid))) then
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
   when 'availability' then 'warn'
   when 'note' then 'warn'
   when 'approved_time_off' then settings.conflict_rules->>'approved_time_off'
   -- K17: "confirm once" asks like "confirm"; its answer holds for the editing session.
   when 'closed_location' then case settings.conflict_rules->>'closed_location' when 'confirm_once' then 'confirm' else settings.conflict_rules->>'closed_location' end
   when 'minimum_travel' then case when shift ? '_shift_exchange' then 'allow' else settings.conflict_rules->>'minimum_travel' end
   when 'minimum_rest' then case when shift ? '_shift_exchange' then 'allow' else settings.conflict_rules->>'minimum_rest' end when 'document_required' then settings.conflict_rules->>'document_required' when 'document_conditional_grace' then settings.conflict_rules->>'document_conditional_grace' when 'document_conditional_overdue' then settings.conflict_rules->>'document_conditional_overdue'
   when 'time_source_unresolved' then 'confirm'
   else 'block' end;
  if rule->>'code' not in ('availability','note') and array_position(array['allow','warn','confirm','block'],rule_severity)>array_position(array['allow','warn','confirm','block'],conflict_severity) then conflict_severity:=rule_severity; end if;
  if rule_severity<>'allow' then annotated:=annotated||jsonb_build_array(rule||jsonb_build_object('severity',rule_severity)
   ||case when rule->>'code'='closed_location' and settings.conflict_rules->>'closed_location'='confirm_once'
    then jsonb_build_object('confirm_scope','edit_session') else '{}'::jsonb end); end if;
 end loop;
 reasons:=annotated;
 operation:=case conflict_severity when 'block' then 'blocked' when 'allow' then 'allowed' else 'warning_requires_override' end;
 -- Revision counters, manager notes and unrelated weekdays/settings are not
 -- conflict identity. The adapters use warning_policy to decide warn/confirm.
 -- Availability is not a conflict: it has its own fingerprint below, which
 -- changes with the person, the shift, its hours or the overlapping marks.
 if span is not null and not isempty(unavailable) then
  availability_fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object('workspace_id',w,'employee_id',emp,
   'assignment',coalesce(shift->>'source_shift_id',shift->>'id'),'location_id',loc,'date',day,
   'intervals',public.availability_ranges_json(tstzmultirange(span)),
   'employee_intervals',capacity->'employee_intervals')::text,'UTF8'),'sha256'),'hex');
 end if;
 fingerprint_payload:=jsonb_build_object('workspace_id',w,'employee_id',emp,
  'assignment',jsonb_build_object('id',coalesce(shift->>'source_shift_id',shift->>'id'),'location_id',loc,'date',day),
  'intervals',public.availability_ranges_json(case when span is null then '{}'::tstzmultirange else tstzmultirange(span) end),
  'leave',public.availability_ranges_json(leave_ranges),
  'warning_policy',case when conflict_severity='confirm' then 'confirm' else 'warn' end,'operation',operation,
  'conflict_rules',settings.conflict_rules,'minimum_travel_minutes',settings.minimum_travel_minutes,'minimum_rest_minutes',settings.minimum_rest_minutes,
  'reasons',(select coalesce(jsonb_agg(r),'[]') from jsonb_array_elements(reasons) r where r->>'code' not in ('availability','note')));
 return jsonb_build_object('coverage',coverage,'operation',operation,'time_basis',basis,'timezone',zone_name,'preference_timezone',preference_zone,
  'assessment_scope',case when span is null then 'calendar_day' else 'shift_interval' end,
  'intervals',public.availability_ranges_json(case when span is null then '{}'::tstzmultirange else tstzmultirange(span) end),
  'available_intervals',case when span is null then '[]'::jsonb else public.availability_ranges_json(remaining) end,
  'unavailable_intervals',public.availability_ranges_json(unavailable+leave_ranges),
  'unknown_intervals',case when span is null then public.availability_ranges_json(tstzmultirange(day_span)) else '[]'::jsonb end,
  'employee_intervals',capacity->'employee_intervals','manager_intervals',capacity->'manager_intervals',
  'has_availability_conflict',span is not null and not isempty(unavailable),'availability_fingerprint',availability_fingerprint,'conflict_severity',conflict_severity,
  'warning_policy',case when conflict_severity='confirm' then 'confirm' else 'warn' end,
  'leave',leave_evidence,'reasons',reasons,
  'policy_revision',settings.availability_preferences_revision,
  'fold_resolution',case when ambiguous_clock then 'post_transition_offset' else null end,
  'assessment_minutes',case when span is null then null else extract(epoch from upper(span)-lower(span))/60 end,
  'fingerprint',encode(extensions.digest(convert_to(fingerprint_payload::text,'UTF8'),'sha256'),'hex'));
end; $function$;
CREATE OR REPLACE FUNCTION public.guard_schedule_assignment_availability()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s jsonb:=to_jsonb(new); prior jsonb; a jsonb; evidence jsonb; logical_id uuid; hydrated boolean:=false; first_seen jsonb;
 -- Read once, empty as none: a pooled connection keeps a setting it once set
 -- locally as '' (BL-208).
 publish_scope jsonb:=nullif(current_setting('newfork.schedule_publish_scope',true),'')::jsonb;
 exchange_scope jsonb:=nullif(current_setting('newfork.shift_exchange_scope',true),'')::jsonb;
begin
 perform public.availability_lock_workspace(new.workspace_id);
 logical_id:=coalesce(s->>'source_shift_id',s->>'id')::uuid;
 s:=s||jsonb_build_object('id',logical_id);
 
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

 if tg_table_name='schedule_published_shifts' and publish_scope is not null
  and (publish_scope->>'workspace_id')::uuid=new.workspace_id
  and exists(select 1 from public.schedule_location_publications p where p.id=(s->>'publication_id')::uuid
   and p.source_draft_id=(publish_scope->>'draft_id')::uuid) then
  s:=s||publish_scope;
 end if;
 if exchange_scope is not null
  and (exchange_scope->>'workspace_id')::uuid=new.workspace_id
  and exchange_scope->'shift_ids' ? logical_id::text then
  s:=s||jsonb_build_object('_exclude_shift_ids',exchange_scope->'shift_ids','_shift_exchange',true);
 end if;
 a:=public.assess_weekly_shift_availability(new.workspace_id,new.employee_id,s);
 evidence:=public.schedule_availability_override(new.workspace_id,s,a);
 if tg_table_name='schedule_published_shifts' and evidence is null then
  select to_jsonb(o) into evidence from public.schedule_publication_overrides o where o.workspace_id=new.workspace_id
   and o.publication_id=new.publication_id and o.finding_code='schedule_conflict' and o.finding_id=a->>'fingerprint'
   and logical_id=any(o.source_shift_ids) and o.employee_id=new.employee_id and o.location_id=new.location_id
   and app_private.authz_reason(o.actor_user_id,new.workspace_id,'schedule.publish',array[new.location_id]) is null limit 1;
 end if;
 if a->>'operation'='blocked' or (tg_table_name='schedule_published_shifts' and a->>'operation'='verification_required') then
  raise exception 'Resolve shift hours or approved time off before this assignment' using errcode='23514',detail=a::text;
 end if;
 if a->>'operation'='warning_requires_override' and evidence is null then
  raise exception 'A current conflict acceptance is required' using errcode='23514',detail=a::text;
 end if;
 if tg_table_name='schedule_published_shifts' then
  -- What the shift's first publish with this person saw of their own marks
  -- (M11, D8): carried from the earliest earlier row, else this is the first.
  select x.availability_snapshot->'first' into first_seen from public.schedule_published_shifts x
   where x.workspace_id=new.workspace_id and x.employee_id=new.employee_id and coalesce(x.source_shift_id,x.id)=logical_id
    and x.id is distinct from new.id and x.availability_snapshot ? 'first'
   order by x.created_at, x.id limit 1;
  new.availability_snapshot:=jsonb_build_object('status','assessed','captured_at',now(),'assessment',a,'override',evidence,
   'first',coalesce(first_seen,jsonb_build_object('has_own_mark',coalesce((a->>'has_availability_conflict')::boolean,false),'captured_at',now())));
 elsif tg_op='UPDATE' then
  update public.schedule_availability_overrides set revoked_at=now() where workspace_id=new.workspace_id and shift_id=logical_id
   and revoked_at is null and assessment_fingerprint<>a->>'fingerprint';
 end if;
 return new;
end; $function$;
CREATE OR REPLACE FUNCTION public.weekly_exchange_employee_warning(w uuid, emp uuid, target jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a jsonb; leave jsonb;
begin
 a:=public.assess_weekly_shift_availability(w,emp,target||jsonb_build_object('scheduled_date',target->>'date','_shift_exchange',true));
 leave:=public.time_off_leave_intervals(a);
 -- Their own approved time off is asked about only when it is the one thing
 -- in the way (BL-182); anything else that blocks is not theirs to set aside.
 if a->>'operation'='verification_required' or (a->>'operation'='blocked' and (jsonb_array_length(leave)=0
  or exists(select 1 from jsonb_array_elements(a->'reasons') r where r->>'severity'='block' and r->>'code'<>'approved_time_off'))) then
  return null; end if;
 if jsonb_array_length(a->'employee_intervals')=0 and jsonb_array_length(leave)=0 then return null; end if;
 return jsonb_build_object('fingerprint',encode(extensions.digest(convert_to(jsonb_build_object(
  'workspace',w,'employee',emp,'source',target->>'source_id','location',target->>'location_id',
  'intervals',a->'intervals','conflicts',a->'employee_intervals','time_off',leave)::text,'UTF8'),'sha256'),'hex'),
  'time_off_intervals',leave);
end; $function$;

-- Every eligibility question below asks app_private.eligibility().
CREATE OR REPLACE FUNCTION public.record_weekly_exchange_acceptance(w uuid, cid uuid, aid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.shift_exchange_cases%rowtype; app public.shift_exchange_applications%rowtype;
 s jsonb; t jsonb; item record; a jsonb; e jsonb; actor uuid; normalized jsonb;
begin
 select * into c from public.shift_exchange_cases where workspace_id=w and id=cid;
 select * into app from public.shift_exchange_applications where workspace_id=w and case_id=cid and id=aid;
 s:=public.shift_exchange_shift(w,c.offered_source_id); t:=public.shift_exchange_shift(w,c.requested_source_id);
 if c.id is null or app.id is null or c.status<>'open' or app.status<>'pending_manager'
  or public.shift_exchange_fingerprint(w,s,t) is distinct from c.consent_fingerprint
  or app.consent_fingerprint is distinct from c.consent_fingerprint then
  raise exception 'Current employee acceptance is required' using errcode='PT409'; end if;
 for item in select s target,app.employee_id emp union all select t,c.owner_id where c.kind='swap' loop
  normalized:=item.target||jsonb_build_object('id',item.target->>'source_id','employee_id',item.emp);
  e:=app_private.eligibility(w,item.emp,normalized,jsonb_build_object('operation',case when c.kind in ('swap','open_pickup') then c.kind when c.audience='direct' then 'cover_accept' else 'release_pickup' end,
   'excluded',to_jsonb(array_remove(array[(s->>'source_id')::uuid,(t->>'source_id')::uuid],null)),'with_assessment',true));
  a:=e->'assessment';
  if not (e->>'eligible')::boolean then
   raise exception 'Resolve shift hours or approved time off before transfer' using errcode='23514'; end if;
  select user_id into actor from public.employee_profiles where workspace_id=w and id=item.emp;
  if actor is null then raise exception 'Employee acceptance identity unavailable' using errcode='42501'; end if;
  if a->>'operation'='warning_requires_override' then
   update public.schedule_availability_overrides set revoked_at=now()
    where workspace_id=w and shift_id=(item.target->>'source_id')::uuid and revoked_at is null;
   insert into public.schedule_availability_overrides(workspace_id,shift_id,employee_id,location_id,assessment_fingerprint,assessment,reason,actor_user_id)
   values(w,(item.target->>'source_id')::uuid,item.emp,(item.target->>'location_id')::uuid,a->>'fingerprint',
    a||jsonb_build_object('consent_source','shift_exchange','consent_case_id',cid,'consent_application_id',aid),
    'Employee voluntarily accepted this shift through Shift Hub.',actor);
  end if;
 end loop;
end; $function$;
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
 if s is not null then r:=app_private.eligibility(w,a.employee_id,s,jsonb_build_object('operation',case when c.kind in ('swap','open_pickup') then c.kind when c.audience='direct' then 'cover_accept' else 'release_pickup' end,'consent',a.time_off_consent,'excluded',to_jsonb(array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null)))); end if;
 if r is null then r:='{"status":"ineligible","reasons":["Published shift unavailable"]}'; end if;
 if r->>'status'<>'eligible' then problems:=array_append(problems,'The receiving employee is not eligible for the full shift'); end if;
 if c.kind='swap' and t is not null then
  g:=app_private.eligibility(w,c.owner_id,t,jsonb_build_object('operation','swap','consent',c.owner_time_off_consent,'excluded',jsonb_build_array(s->>'id',t->>'id')));
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
CREATE OR REPLACE FUNCTION public.shift_exchanges_candidates_service(actor uuid, w uuid, shift_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare emp public.employee_profiles%rowtype; s jsonb; t jsonb; e record; p record; checked jsonb; employees jsonb:='[]'; shifts jsonb:='[]';
begin
 emp:=public.employee_hub_actor_service(actor,w); s:=public.shift_exchange_shift(w,shift_id);
 if s is null or (s->>'employee_id')::uuid is distinct from emp.id then raise exception 'Only the owner can search for a replacement' using errcode='42501'; end if;
 for e in select id,coalesce(nullif(preferred_name,''),concat_ws(' ',first_name,last_name)) name from public.employee_profiles where workspace_id=w and archived_at is null and id<>emp.id order by first_name loop
  checked:=app_private.eligibility(w,e.id,s,'{"operation":"cover_accept"}')-'approval_flags';
  if checked->>'status'='eligible' then employees:=employees||jsonb_build_array(jsonb_build_object('id',e.id,'name',e.name,'eligibility',checked)); end if;
 end loop;
 for p in select x.id from public.schedule_published_shifts x join public.schedule_location_publications pub on pub.id=x.publication_id and pub.status='current'
  where x.workspace_id=w and x.employee_id is not null and x.employee_id<>emp.id and x.scheduled_date between current_date-1 and current_date+62 order by x.scheduled_date,x.start_time loop
  t:=public.shift_exchange_shift(w,p.id);
  if (t->>'starts_at')::timestamptz>clock_timestamp() and app_private.eligibility(w,emp.id,t,jsonb_build_object('operation','swap','consent',true,'excluded',jsonb_build_array(s->>'id',t->>'id')))->>'status'='eligible'
   and app_private.eligibility(w,(t->>'employee_id')::uuid,s,jsonb_build_object('operation','swap','excluded',jsonb_build_array(s->>'id',t->>'id')))->>'status'='eligible' then shifts:=shifts||jsonb_build_array(t||jsonb_build_object('availability_warning',public.weekly_exchange_employee_warning(w,emp.id,t))); end if;
 end loop;
 return jsonb_build_object('employees',employees,'shifts',shifts);
end; $function$;
CREATE OR REPLACE FUNCTION public.shift_exchanges_command_service(actor uuid, w uuid, command jsonb, idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare emp public.employee_profiles%rowtype; c public.shift_exchange_cases%rowtype; a public.shift_exchange_applications%rowtype;
 old_cmd public.shift_exchange_commands%rowtype; s jsonb; t jsonb; checked jsonb; result jsonb; fp text;
 action text:=command->>'action'; cid uuid:=(command->>'case_id')::uuid; aid uuid:=(command->>'application_id')::uuid;
 candidate uuid; loc uuid; other record; expires timestamptz; owns boolean; manager boolean; consent jsonb:='[]';
begin
 if idempotency_key is null then raise exception 'Idempotency key required'; end if;
 if not exists(select 1 from public.workspace_memberships where workspace_id=w and user_id=actor and status='active') then raise exception 'Active workspace access required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(w::text,921));
 select * into old_cmd from public.shift_exchange_commands q where q.workspace_id=w and q.actor_user_id=actor and q.idempotency_key=shift_exchanges_command_service.idempotency_key;
 if old_cmd.idempotency_key is not null then
  if old_cmd.command<>command then raise exception 'Idempotency key was used for another action' using errcode='22023'; end if;
  return old_cmd.result;
 end if;
 select * into emp from public.employee_profiles where workspace_id=w and user_id=actor and archived_at is null;
 if action in('create','apply') then
  if emp.id is null then raise exception 'Employee profile required' using errcode='42501'; end if;
  s:=public.shift_exchange_shift(w,(command->>'shift_id')::uuid);
  if s is null or (s->>'starts_at')::timestamptz<=clock_timestamp() then raise exception 'Choose an upcoming published shift' using errcode='PT409'; end if;
  if action='create' then
   if (s->>'employee_id')::uuid is distinct from emp.id then raise exception 'Only the current owner can offer this shift' using errcode='42501'; end if;
   if command->>'kind' not in('cover','swap') then raise exception 'Invalid exchange kind'; end if;
   if command->>'kind'='swap' then
    t:=public.shift_exchange_shift(w,(command->>'requested_shift_id')::uuid);
    if t is null or t->>'employee_id' is null or t->>'employee_id'=emp.id::text or (t->>'starts_at')::timestamptz<=clock_timestamp() then raise exception 'Choose an upcoming teammate shift'; end if;
    candidate:=(t->>'employee_id')::uuid;
    perform public.require_weekly_exchange_employee_warning(actor,w,emp.id,t,command);
    consent:=public.weekly_exchange_time_off_consent(w,emp.id,t);
    if app_private.eligibility(w,emp.id,t,jsonb_build_object('operation','swap','consent',consent,'excluded',jsonb_build_array(s->>'id',t->>'id')))->>'status'<>'eligible' then raise exception 'You are not eligible for the teammate shift'; end if;
   else candidate:=(command->>'employee_id')::uuid; end if;
   if candidate=emp.id then raise exception 'Choose a different teammate'; end if;
   if candidate is not null and app_private.eligibility(w,candidate,s,jsonb_build_object('operation',case when t is null then 'cover_accept' else 'swap' end,'excluded',to_jsonb(array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null))))->>'status'<>'eligible' then raise exception 'This teammate is not eligible for the full shift'; end if;
   for other in select x.id,public.shift_exchange_live_status(w,x.id) live_status from public.shift_exchange_cases x
    where x.workspace_id=w and x.status='open' and x.offered_source_id=(s->>'source_id')::uuid loop
    if other.live_status<>'open' then
     update public.shift_exchange_cases set status=other.live_status,revision=revision+1,updated_at=now() where id=other.id;
     update public.shift_exchange_applications set status=other.live_status,updated_at=now() where case_id=other.id and status in('invited','pending_manager');
     delete from public.shift_exchange_votes where case_id=other.id;
     perform public.shift_exchange_emit(actor,w,other.id,null,other.live_status,'This offer ended because the shift changed or started. Review the current schedule before making a new request.');
    end if;
   end loop;
   fp:=public.shift_exchange_fingerprint(w,s,t);
   expires:=least((s->>'starts_at')::timestamptz,(t->>'starts_at')::timestamptz);
   insert into public.shift_exchange_cases(workspace_id,kind,audience,offered_source_id,requested_source_id,owner_id,offered_snapshot,requested_snapshot,consent_fingerprint,expires_at,private_note,created_by,owner_time_off_consent)
   values(w,command->>'kind',case when candidate is null then 'eligible_pool' else 'direct' end,(s->>'source_id')::uuid,(t->>'source_id')::uuid,emp.id,s,t,fp,expires,coalesce(command->>'note',''),actor,consent) returning * into c;
   cid:=c.id;
   if candidate is not null then
    insert into public.shift_exchange_applications(workspace_id,case_id,employee_id,status,consent_fingerprint) values(w,cid,candidate,'invited',fp) returning id into aid;
   end if;
   perform public.shift_exchange_emit(actor,w,cid,aid,case when candidate is null then 'cover_opened' else 'peer_invited' end,'Cover or swap requested. The current owner remains responsible until manager approval.');
  else
   if (s->>'employee_id')::uuid=emp.id then raise exception 'You already own this shift'; end if;
   select * into c from public.shift_exchange_cases where workspace_id=w and offered_source_id=(s->>'source_id')::uuid and status='open' for update;
   if c.id is null then
    if s->>'employee_id' is not null then raise exception 'This shift has not been offered for cover'; end if;
    fp:=public.shift_exchange_fingerprint(w,s,null);
    insert into public.shift_exchange_cases(workspace_id,kind,offered_source_id,offered_snapshot,consent_fingerprint,expires_at,created_by)
    values(w,'open_pickup',(s->>'source_id')::uuid,s,fp,(s->>'starts_at')::timestamptz,actor) returning * into c;
   end if;
   if c.audience<>'eligible_pool' or c.kind='swap' or (cid is not null and cid<>c.id) then raise exception 'This offer is not available' using errcode='42501'; end if;
   if public.shift_exchange_fingerprint(w,s,null)<>c.consent_fingerprint then raise exception 'Shift conditions changed. The owner must renew this offer' using errcode='PT409'; end if;
   perform public.require_weekly_exchange_employee_warning(actor,w,emp.id,s,command);
   consent:=public.weekly_exchange_time_off_consent(w,emp.id,s);
   if app_private.eligibility(w,emp.id,s,jsonb_build_object('operation',case when c.kind='open_pickup' then 'open_pickup' else 'release_pickup' end,'consent',consent))->>'status'<>'eligible' then raise exception 'You are not eligible for the full shift'; end if;
   cid:=c.id;
   if exists(select 1 from public.shift_exchange_applications where case_id=cid and employee_id=emp.id and status='pending_manager') then raise exception 'You already have an active application'; end if;
   insert into public.shift_exchange_applications(workspace_id,case_id,employee_id,status,consent_fingerprint,time_off_consent) values(w,cid,emp.id,'pending_manager',c.consent_fingerprint,consent) returning id into aid;
   update public.shift_exchange_cases set revision=revision+1,updated_at=now() where id=cid returning * into c;
   perform public.shift_exchange_emit(actor,w,cid,aid,'application_submitted','A teammate requested this shift. The current owner remains responsible.');
  end if;
 else
  select * into c from public.shift_exchange_cases where id=cid and workspace_id=w for update;
  if c.id is null then raise exception 'Request not found' using errcode='P0002'; end if;
  s:=public.shift_exchange_shift(w,c.offered_source_id); t:=public.shift_exchange_shift(w,c.requested_source_id);
  owns:=c.owner_id=emp.id;
  manager:=public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.manage',(c.offered_snapshot->>'location_id')::uuid)
   or (c.kind='swap' and public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.manage',(c.requested_snapshot->>'location_id')::uuid));
  if not coalesce(owns,false) and not coalesce(manager,false) and not exists(select 1 from public.shift_exchange_applications where case_id=cid and employee_id=emp.id) then raise exception 'Request access denied' using errcode='42501'; end if;
  if c.status<>'open' or c.revision is distinct from (command->>'expected_revision')::integer then raise exception 'This request changed. Review the latest details' using errcode='PT409'; end if;
  if c.expires_at<=clock_timestamp() then
   update public.shift_exchange_cases set status='expired',revision=revision+1,updated_at=now() where id=cid returning * into c;
   update public.shift_exchange_applications set status='expired',updated_at=now() where case_id=cid and status in('invited','pending_manager');
   delete from public.shift_exchange_votes where case_id=cid;
   perform public.shift_exchange_emit(null,w,cid,null,'expired','The shift has started. The current owner remains responsible.');
  elsif public.shift_exchange_live_status(w,cid)='invalidated' then
   update public.shift_exchange_cases set status='invalidated',revision=revision+1,updated_at=now() where id=cid returning * into c;
   update public.shift_exchange_applications set status='invalidated',updated_at=now() where case_id=cid and status in('invited','pending_manager');
   delete from public.shift_exchange_votes where case_id=cid;
   perform public.shift_exchange_emit(actor,w,cid,null,'invalidated','Shift details changed. This offer ended without a transfer. Start a new request from the current schedule.');
  elsif action='close' then
   if not coalesce(owns,false) and not coalesce(manager,false) then raise exception 'Only the owner or a manager can close this search' using errcode='42501'; end if;
   if coalesce(length(trim(command->>'reason')),0)=0 then raise exception 'Choose a reason for closing this search'; end if;
   update public.shift_exchange_cases set status='cancelled',revision=revision+1,updated_at=now() where id=cid returning * into c;
   update public.shift_exchange_applications set status='closed_case_cancelled',reason=command->>'reason',updated_at=now() where case_id=cid and status in('invited','pending_manager');
   perform public.shift_exchange_emit(actor,w,cid,null,'case_closed',command->>'reason',coalesce(command->>'private_note',''));
  else
   select * into a from public.shift_exchange_applications where id=aid and case_id=cid and workspace_id=w for update;
   if a.id is null or a.status not in('invited','pending_manager') then raise exception 'This application is no longer active' using errcode='PT409'; end if;
   if action in('accept','decline','withdraw') then
    if a.employee_id is distinct from emp.id then raise exception 'Only the invited employee can respond' using errcode='42501'; end if;
    if action in('accept','decline') and a.status<>'invited' then raise exception 'This invitation already has a response'; end if;
    if action='accept' then
     if public.shift_exchange_fingerprint(w,s,t) is distinct from c.consent_fingerprint then raise exception 'Shift conditions changed. Ask for a new offer' using errcode='PT409'; end if;
     perform public.require_weekly_exchange_employee_warning(actor,w,emp.id,s,command);
     consent:=public.weekly_exchange_time_off_consent(w,emp.id,s);
     if app_private.eligibility(w,emp.id,s,jsonb_build_object('operation',case when c.kind in ('swap','open_pickup') then c.kind when c.audience='direct' then 'cover_accept' else 'release_pickup' end,'consent',consent,'excluded',to_jsonb(array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null))))->>'status'<>'eligible'
      or (c.kind='swap' and app_private.eligibility(w,c.owner_id,t,jsonb_build_object('operation','swap','consent',c.owner_time_off_consent,'excluded',jsonb_build_array(s->>'id',t->>'id')))->>'status'<>'eligible') then raise exception 'Both employees must be eligible for the full exchange'; end if;
    end if;
    update public.shift_exchange_applications set status=case action when 'accept' then 'pending_manager' when 'decline' then 'declined_by_employee' else 'withdrawn' end,
     time_off_consent=case when action='accept' then consent else time_off_consent end,updated_at=now() where id=aid;
    delete from public.shift_exchange_votes where case_id=cid and application_id=aid;
    if c.audience='direct' and action in('decline','withdraw') then update public.shift_exchange_cases set status='cancelled' where id=cid; end if;
    perform public.shift_exchange_emit(actor,w,cid,aid,case action when 'accept' then 'peer_accepted' when 'decline' then 'peer_declined' else 'application_withdrawn' end,
     case action when 'accept' then 'Accepted. Awaiting manager approval; the original owner remains responsible.' when 'decline' then 'The teammate declined. No assignment changed.' else case when c.audience='direct' then 'The employee withdrew consent. This request ended without a transfer.' else 'The application was withdrawn. Other candidates remain available.' end end);
   elsif action in('reject','approve') then
    if not coalesce(manager,false) then raise exception 'Manager scope required' using errcode='42501'; end if;
    if action='reject' then
     if coalesce(length(trim(command->>'reason')),0)=0 then raise exception 'Provide a reason visible to this employee'; end if;
     update public.shift_exchange_applications set status='rejected_by_manager',reason=command->>'reason',updated_at=now() where id=aid;
     delete from public.shift_exchange_votes where case_id=cid and application_id=aid;
     if c.audience='direct' then update public.shift_exchange_cases set status='cancelled' where id=cid; end if;
     perform public.shift_exchange_emit(actor,w,cid,aid,'application_rejected',command->>'reason',coalesce(command->>'private_note',''));
    else
     checked:=public.shift_exchange_preview(actor,w,cid,aid);
     if not (checked->>'allowed')::boolean then raise exception '%',checked->'reasons' using errcode='PT409'; end if;
     if command->>'fingerprint' is distinct from checked->>'fingerprint' then raise exception 'This approval preview changed. Review the latest details' using errcode='PT409'; end if;
     fp:=checked->>'fingerprint';
     for loc in select distinct x from unnest(array[(s->>'location_id')::uuid,(t->>'location_id')::uuid]) x where x is not null loop
      if public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.manage',loc) then
       insert into public.shift_exchange_votes(case_id,workspace_id,application_id,location_id,actor_user_id,fingerprint) values(cid,w,aid,loc,actor,fp)
       on conflict(case_id,location_id) do update set application_id=excluded.application_id,actor_user_id=excluded.actor_user_id,fingerprint=excluded.fingerprint,created_at=now();
      end if;
     end loop;
     if (checked->>'requires_other_manager')::boolean then
      perform public.shift_exchange_emit(actor,w,cid,aid,'scope_approved','One location approved. Awaiting the other manager; assignments are unchanged.');
     else
      perform 1 from public.schedule_published_shifts where id in((s->>'id')::uuid,(t->>'id')::uuid) order by id for update;
      -- Recheck after row locks as external Schedule writers may predate the shared workspace lock.
      checked:=public.shift_exchange_preview(actor,w,cid,aid);
      if not (checked->>'allowed')::boolean or checked->>'fingerprint'<>fp then raise exception 'Schedule changed during approval' using errcode='PT409'; end if;
      -- BL-182, KK-19: the approved time off each side agreed to give up ends
      -- now, at the manager's approval, never at the application.
      if (checked->'receiver'->>'shortens_time_off')::boolean then
       perform app_private.shorten_time_off(actor,w,a.employee_id,tstzmultirange(tstzrange((s->>'starts_at')::timestamptz,(s->>'ends_at')::timestamptz,'[)')),
        'Shortened for a shift they took through Shift Hub.',jsonb_build_object('source','shift_exchange','case_id',cid,'application_id',aid));
      end if;
      if c.kind='swap' and (checked->'giver'->>'shortens_time_off')::boolean then
       perform app_private.shorten_time_off(actor,w,c.owner_id,tstzmultirange(tstzrange((t->>'starts_at')::timestamptz,(t->>'ends_at')::timestamptz,'[)')),
        'Shortened for a shift they took through Shift Hub.',jsonb_build_object('source','shift_exchange','case_id',cid,'application_id',aid));
      end if;
      perform public.record_weekly_exchange_acceptance(w,cid,aid);
      -- BL-092: the two sides of a swap are one change for the assignment guard,
      -- in the publication and in the drafts reconciled after it.
      perform set_config('newfork.shift_exchange_scope',jsonb_build_object('workspace_id',w,'shift_ids',to_jsonb(array_remove(array[(s->>'source_id')::uuid,(t->>'source_id')::uuid],null)))::text,true);
      update public.schedule_published_shifts set employee_id=a.employee_id where id=(s->>'id')::uuid;
      if c.kind='swap' then update public.schedule_published_shifts set employee_id=c.owner_id where id=(t->>'id')::uuid; end if;
      perform public.shift_exchange_reconcile_batch(actor,w,jsonb_build_array(s||jsonb_build_object('new_employee_id',a.employee_id))||case when c.kind='swap' then jsonb_build_array(t||jsonb_build_object('new_employee_id',c.owner_id)) else '[]'::jsonb end);
      perform set_config('newfork.shift_exchange_scope','',true);
      
      update public.shift_exchange_applications set status='approved',updated_at=now() where id=aid;
      for other in select id from public.shift_exchange_applications where case_id=cid and id<>aid and status in('invited','pending_manager') loop
       update public.shift_exchange_applications set status='closed_other_selected',updated_at=now() where id=other.id;
       perform public.shift_exchange_emit(actor,w,cid,other.id,'other_selected','Another teammate was selected. Your schedule has not changed.');
      end loop;
      update public.shift_exchange_cases set status='completed' where id=cid;
      perform public.shift_exchange_emit(actor,w,cid,aid,'transfer_completed','Manager approved the transfer. The receiving employee is now responsible; the previous owner is released.',coalesce(command->>'private_note',''));
      for other in select x.id from public.shift_exchange_cases x where x.workspace_id=w and x.status='open' and x.id<>cid
       and (x.offered_source_id in(c.offered_source_id,c.requested_source_id) or x.requested_source_id in(c.offered_source_id,c.requested_source_id)) loop
       update public.shift_exchange_cases set status='invalidated',revision=revision+1,updated_at=now() where id=other.id;
       update public.shift_exchange_applications set status='invalidated',updated_at=now() where case_id=other.id and status in('invited','pending_manager');
       perform public.shift_exchange_emit(actor,w,other.id,null,'invalidated','An involved shift changed owner. Start a new request using the current schedule.');
      end loop;
     end if;
    end if;
   else raise exception 'Unknown exchange action'; end if;
   -- BL-228: when it was decided, not when its transaction began; an approval
   -- that waited for the workspace lock behind a publish is newer than it.
   update public.shift_exchange_cases set revision=revision+1,updated_at=clock_timestamp() where id=cid returning * into c;
  end if;
 end if;
 perform realtime.send(jsonb_build_object('workspace_id',w,'case_id',cid,'revision',c.revision),'changed','shift-exchanges:'||w::text,true);
 result:=jsonb_build_object('case_id',cid,'status',c.status,'revision',c.revision);
 insert into public.shift_exchange_commands(workspace_id,actor_user_id,idempotency_key,command,result) values(w,actor,idempotency_key,command,result);
 return result;
end; $function$;
CREATE OR REPLACE FUNCTION public.shift_exchange_draft_undoes(w uuid, draft uuid, locations uuid[], departments uuid[] DEFAULT NULL::uuid[], include_no_department boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
  -- The week's latest publication at that place, live or taken down (BL-230):
  -- taking a week down does not undo an approved change either.
  join public.schedule_location_publications pub on pub.id=p.publication_id
   and pub.version_number=(select max(latest.version_number) from public.schedule_location_publications latest
    where latest.location_id=pub.location_id and latest.week_start=pub.week_start)
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
  -- c.updated_at is when the change was decided (BL-228).
  where c.workspace_id=w and c.status='completed' and c.updated_at>pub.published_at
   and p.location_id=any(locations)
   and p.scheduled_date between dr.week_start and dr.week_start+6
   and public.schedule_shift_in_department_scope_service(p.job_id,departments,coalesce(include_no_department,true))
   and not exists (select 1 from public.schedule_draft_shifts d where d.workspace_id=w and d.draft_id=draft
    and public.shift_exchange_edit_matches(to_jsonb(d),to_jsonb(p)))
  order by p.id,c.updated_at desc
 ) x;
$function$;
CREATE OR REPLACE FUNCTION public.shift_exchanges_read_service(actor uuid, w uuid, manager_view boolean DEFAULT false, from_date date DEFAULT CURRENT_DATE, to_date date DEFAULT (CURRENT_DATE + 42), focused_case_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare emp public.employee_profiles%rowtype; c public.shift_exchange_cases%rowtype; s jsonb; t jsonb; allowed boolean; mine boolean;
 case_items jsonb[]:='{}'; opportunities jsonb:='[]'; own_shifts jsonb:='[]'; apps jsonb; hist jsonb; chk jsonb; shift_row record; stage text; live_status text; current_published boolean; requested_published boolean; published_cache jsonb:='{}'; source_key text;
 read_scope uuid[]:='{}'; manage_scope uuid[]:='{}';
begin
 if to_date<from_date or to_date>from_date+62 then raise exception 'Choose a date range up to 62 days'; end if;
 if not exists(select 1 from public.workspace_memberships where workspace_id=w and user_id=actor and status='active') then raise exception 'Active workspace access required' using errcode='42501'; end if;
 select * into emp from public.employee_profiles where workspace_id=w and user_id=actor and archived_at is null;
 if not manager_view and emp.id is null then raise exception 'Employee profile required' using errcode='42501'; end if;
 if manager_view then
  read_scope:=app_private.scope_set(actor,w,'exchange.read');
  -- Nowhere to read requests: asked with no location, the core says why; with
  -- no live location in the workspace there is nothing to read.
  if cardinality(read_scope)=0 and (app_private.authz_reason(actor,w,'exchange.read') is distinct from 'out_of_scope'
   or exists(select 1 from public.locations l where l.workspace_id=w and l.deleted_at is null)) then
   perform app_private.authorize(actor,w,'exchange.read');
  end if;
  manage_scope:=app_private.scope_set(actor,w,'exchange.approve');
 end if;
 for c in select * from public.shift_exchange_cases x where x.workspace_id=w and (x.status='open' or x.id=focused_case_id
  or (x.offered_snapshot->>'date')::date between from_date and to_date
  or (x.requested_snapshot->>'date')::date between from_date and to_date
  or exists(select 1 from public.schedule_published_shifts p
   join public.schedule_location_publications pub on pub.id=p.publication_id and pub.status='current'
   where p.workspace_id=w and coalesce(p.source_shift_id,p.id) in(x.offered_source_id,x.requested_source_id)
   and p.scheduled_date between from_date and to_date)) order by x.expires_at,x.created_at loop
  allowed:=manager_view and coalesce((c.offered_snapshot->>'location_id')::uuid=any(read_scope) or (c.kind='swap' and (c.requested_snapshot->>'location_id')::uuid=any(read_scope)),false);
  mine:=coalesce(c.owner_id=emp.id,false);
  if not allowed and not mine and not exists(select 1 from public.shift_exchange_applications where case_id=c.id and employee_id=emp.id) then continue; end if;
  -- Repeated historical requests refer to the same published source. Resolve
  -- each source once in this read only; no cache survives the function call.
  foreach source_key in array array_remove(array[c.offered_source_id::text,c.requested_source_id::text],null) loop
   if not published_cache ? source_key then
    published_cache:=published_cache||jsonb_build_object(source_key,public.shift_exchange_shift(w,source_key::uuid));
   end if;
  end loop;
  s:=nullif(published_cache->c.offered_source_id::text,'null'::jsonb);
  t:=nullif(published_cache->c.requested_source_id::text,'null'::jsonb);
  current_published:=s is not null;
  requested_published:=t is not null;
  s:=coalesce(s,c.offered_snapshot);
  t:=coalesce(t,c.requested_snapshot);
  -- The list follows the displayed dates on either side. A focused deep link
  -- bypasses only the range, never the actor checks above.
  if c.id is distinct from focused_case_id and not (
   coalesce((s->>'date')::date between from_date and to_date,false)
   or coalesce((t->>'date')::date between from_date and to_date,false)
  ) then continue; end if;
  live_status:=public.shift_exchange_live_status(w,c.id);
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'employee_id',a.employee_id,'employee_name',coalesce(nullif(e.preferred_name,''),concat_ws(' ',e.first_name,e.last_name)),
   'status',case when live_status in('expired','invalidated') and a.status in('invited','pending_manager') then live_status else a.status end,'created_at',a.created_at,'reason',case when allowed or a.employee_id=emp.id then a.reason else '' end,
   'eligibility',case when (allowed or a.employee_id=emp.id) and live_status='open' then (app_private.eligibility(w,a.employee_id,s,jsonb_build_object('operation',case when c.kind in ('swap','open_pickup') then c.kind when c.audience='direct' then 'cover_accept' else 'release_pickup' end,'consent',case when a.employee_id=emp.id and a.status='invited' then 'true'::jsonb else a.time_off_consent end,'excluded',to_jsonb(array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null))))-case when allowed then '{}'::text[] else array['approval_flags'] end) || case when a.employee_id=emp.id and a.status='invited' then jsonb_build_object('availability_warning',public.weekly_exchange_employee_warning(w,emp.id,s)) else '{}'::jsonb end end) order by a.created_at),'[]'::jsonb)
  into apps from public.shift_exchange_applications a join public.employee_profiles e on e.id=a.employee_id where a.case_id=c.id and (allowed or mine or a.employee_id=emp.id);
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'created_at',e.created_at,'message',e.message) order by e.created_at),'[]'::jsonb)
  into hist from public.shift_exchange_events e where e.case_id=c.id and (allowed or mine or e.application_id is null or exists(select 1 from public.shift_exchange_applications a where a.id=e.application_id and a.employee_id=emp.id));
  stage:=case when live_status<>'open' then 'closed'
   when exists(select 1 from public.shift_exchange_votes where case_id=c.id) then 'awaiting_other_manager'
   when exists(select 1 from public.shift_exchange_applications where case_id=c.id and status='pending_manager') then 'ready_for_manager'
   when exists(select 1 from public.shift_exchange_applications where case_id=c.id and status='invited') then 'awaiting_peer' else 'seeking_candidates' end;
  case_items:=array_append(case_items,jsonb_build_object('id',c.id,'kind',c.kind,'audience',c.audience,'status',live_status,'current_published',current_published,'requested_current_published',case when c.kind='swap' then requested_published else null end,
   'stage',stage,'revision',c.revision,'created_at',c.created_at,'expires_at',c.expires_at,'owner_id',c.owner_id,'owner_name',c.offered_snapshot->'employee_name',
   'shift',s,'requested_shift',t,'applications',apps,'candidate_count',(select count(*) from public.shift_exchange_applications where case_id=c.id and status in('invited','pending_manager') and live_status='open'),
   'can_manage',allowed and coalesce((c.offered_snapshot->>'location_id')::uuid=any(manage_scope) or (c.kind='swap' and (c.requested_snapshot->>'location_id')::uuid=any(manage_scope)),false),
   'is_owner',mine,'private_note',case when allowed or mine then c.private_note else '' end,'history',hist));
 end loop;
 if not manager_view then
  for shift_row in select p.id from public.schedule_published_shifts p join public.schedule_location_publications pub on pub.id=p.publication_id and pub.status='current'
   where p.workspace_id=w and p.scheduled_date between from_date and to_date order by p.scheduled_date,p.start_time loop
   s:=public.shift_exchange_shift(w,shift_row.id);
   if (s->>'starts_at')::timestamptz<=clock_timestamp() then continue; end if;
   if (s->>'employee_id')::uuid=emp.id then own_shifts:=own_shifts||jsonb_build_array(s); continue; end if;
   select * into c from public.shift_exchange_cases where workspace_id=w and offered_source_id=(s->>'source_id')::uuid and status='open' and expires_at>clock_timestamp() and audience='eligible_pool' and kind<>'swap';
   if s->>'employee_id' is not null and c.id is null then continue; end if;
   chk:=(app_private.eligibility(w,emp.id,s,jsonb_build_object('operation',case when c.id is null then 'open_pickup' else 'release_pickup' end,'consent',true))-'approval_flags')||jsonb_build_object('availability_warning',public.weekly_exchange_employee_warning(w,emp.id,s));
   if chk->>'status'='eligible' and (c.id is null or c.consent_fingerprint=public.shift_exchange_fingerprint(w,s,null)) then
    opportunities:=opportunities||jsonb_build_array(jsonb_build_object('case_id',c.id,'shift',s,'eligibility',chk));
   end if;
  end loop;
 end if;
 return jsonb_build_object('employee_id',emp.id,'cases',to_jsonb(case_items),'opportunities',opportunities,'own_shifts',own_shifts);
end; $function$;
CREATE OR REPLACE FUNCTION public.shift_exchange_notification_allowed(oid uuid, recipient uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare o public.notification_outbox%rowtype; c public.shift_exchange_cases%rowtype;
 e public.shift_exchange_events%rowtype; person uuid; offered jsonb; audience text;
begin
 select * into o from public.notification_outbox where id=oid;
 if o.id is null then return false; end if;
 if o.subject_type<>'shift_exchange_cases' then return true; end if;
 select * into c from public.shift_exchange_cases where workspace_id=o.workspace_id and id::text=o.subject_id;
 if c.id is null or not app_private.workspace_allows_interactive_access(o.workspace_id)
  or not exists(select 1 from public.workspace_memberships m where m.workspace_id=o.workspace_id and m.user_id=recipient and m.status='active') then return false; end if;
 select * into e from public.shift_exchange_events where workspace_id=o.workspace_id and case_id=c.id and id::text=o.payload->>'request_event_id';
 if e.id is null then return false; end if;
 select id into person from public.employee_profiles where workspace_id=o.workspace_id and user_id=recipient and archived_at is null;
 audience:=o.payload->>'audience_contract';
 if audience='schedule_request_reviewers' then
  return public.shift_exchange_live_status(o.workspace_id,c.id)='open'
   and exists(select 1 from public.shift_exchange_applications a where a.case_id=c.id and a.status='pending_manager')
   and (public.schedule_actor_has_capability_service(recipient,o.workspace_id,'schedule.shift_change_requests.manage',(c.offered_snapshot->>'location_id')::uuid)
    or (c.kind='swap' and public.schedule_actor_has_capability_service(recipient,o.workspace_id,'schedule.shift_change_requests.manage',(c.requested_snapshot->>'location_id')::uuid)))
   and (person is null or (person is distinct from c.owner_id and not exists(select 1 from public.shift_exchange_applications a where a.id=e.application_id and a.employee_id=person)));
 elsif audience='eligible_shift_cover_candidates' then
  if public.shift_exchange_live_status(o.workspace_id,c.id)<>'open' or person is null or person=c.owner_id then return false; end if;
  offered:=public.shift_exchange_shift(o.workspace_id,c.offered_source_id);
  return coalesce(app_private.eligibility(o.workspace_id,person,offered,'{"operation":"release_pickup"}')->>'status'='eligible',false);
 elsif audience='shift_change_participants' then
  if person is null or not (person is not distinct from c.owner_id or exists(select 1 from public.shift_exchange_applications a where a.case_id=c.id and a.employee_id=person and (e.application_id is null or a.id=e.application_id))) then return false; end if;

  if e.action='terms_changed' then
   return public.shift_exchange_live_status(o.workspace_id,c.id)='open' and
    (person=c.owner_id or exists(select 1 from public.shift_exchange_applications a
     where a.case_id=c.id and a.employee_id=person and a.status in ('invited','pending_manager')));
  end if;
  if e.action in('application_submitted','peer_accepted','scope_approved','peer_invited') then
   return public.shift_exchange_live_status(o.workspace_id,c.id)='open'
    and exists(select 1 from public.shift_exchange_applications a where a.id=e.application_id and a.status=case when e.action='peer_invited' then 'invited' else 'pending_manager' end);
  end if;
  return true;
 end if;
 return false;
end; $function$;
CREATE OR REPLACE FUNCTION public.shift_exchange_emit_notification_base(actor uuid, w uuid, cid uuid, aid uuid, act text, msg text, private_msg text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare eid uuid; loc uuid; recipients uuid[]; reviewers uuid[]; c public.shift_exchange_cases%rowtype; recipient uuid; body text; destination text; offered jsonb;
begin
 select * into c from public.shift_exchange_cases where id=cid and workspace_id=w;
 loc:=(c.offered_snapshot->>'location_id')::uuid;
 insert into public.shift_exchange_events(workspace_id,case_id,application_id,actor_user_id,action,message,private_note)
 values(w,cid,aid,actor,act,msg,private_msg) returning id into eid;
 select coalesce(array_agg(distinct e.user_id),'{}'::uuid[]) into recipients from public.employee_profiles e join public.workspace_memberships m on m.workspace_id=w and m.user_id=e.user_id and m.status='active'
 where e.workspace_id=w and e.archived_at is null and ((e.id=c.owner_id and act<>'other_selected') or exists(select 1 from public.shift_exchange_applications a where a.case_id=cid and a.employee_id=e.id and (aid is null or a.id=aid) and (act<>'terms_changed' or a.status in ('invited','pending_manager')))) and e.user_id is distinct from actor;
 foreach recipient in array recipients loop
  body:=case when act='transfer_completed' then
   case when c.kind='swap' then 'Your swap is approved. Your updated shifts are now your responsibility. Open your schedule to review both changes.'
    when exists(select 1 from public.employee_profiles e where e.id=c.owner_id and e.user_id=recipient) then 'Your cover is approved. You are no longer responsible for this shift.'
    else 'Your pickup is approved. This shift is now assigned to you and is your responsibility.' end else msg end;
  perform public.enqueue_notification_outbox_service(w,gen_random_uuid(),'requests.shift_change.status_changed',1,actor,'shift_exchange_cases',cid::text,
   jsonb_build_object('correlation_id',eid,'request_id',cid,'request_event_id',eid,'request_action',act,'location_id',loc,'location_ids',jsonb_build_array(loc),'recipient_user_ids',jsonb_build_array(recipient),
   'audience_contract','shift_change_participants','category','request','title',case when act='transfer_completed' then 'Shift change approved' when act='other_selected' then 'Another teammate was selected' when act='peer_invited' then 'A teammate needs your response' else 'Shift request updated' end,
   'body',body,'safe_preview','A shift request was updated.','action_url','/app/employee-hub/shift-hub?case='||cid::text||'&hub_view=requests','group_key','shift_exchange:'||cid::text),now());
 end loop;
 if act='cover_opened' then
  offered:=public.shift_exchange_shift(w,c.offered_source_id);
  select coalesce(array_agg(e.user_id),'{}'::uuid[]) into recipients from public.employee_profiles e
   join public.workspace_memberships m on m.workspace_id=w and m.user_id=e.user_id and m.status='active'
   where e.workspace_id=w and e.archived_at is null and e.id<>c.owner_id and app_private.eligibility(w,e.id,offered,'{"operation":"release_pickup"}')->>'status'='eligible';
  if cardinality(recipients)>0 then
   perform public.enqueue_notification_outbox_service(w,gen_random_uuid(),'requests.shift_change.status_changed',1,actor,'shift_exchange_cases',cid::text,
    jsonb_build_object('correlation_id',eid,'request_id',cid,'request_event_id',eid,'request_action',act,'location_id',loc,'location_ids',jsonb_build_array(loc),'recipient_user_ids',to_jsonb(recipients),
    'audience_contract','eligible_shift_cover_candidates','category','request','title','A shift is available for cover','body',(offered->>'location_name')||' · '||(offered->>'date')||' · '||(offered->>'start_time')||'–'||(offered->>'end_time')||'. Apply in Shift Hub; final assignment requires manager approval.',
    'safe_preview','A teammate is looking for cover.','action_url','/app/employee-hub/shift-hub?hub_view=available&q='||(offered->>'date'),'group_key','shift_exchange_available:'||cid::text),now());
  end if;
 end if;
 if act in('application_submitted','peer_accepted','scope_approved') or
  (act='terms_changed' and exists(select 1 from public.shift_exchange_applications where case_id=cid and status='pending_manager')) then
 select coalesce(array_agg(m.user_id),'{}'::uuid[]) into reviewers from public.workspace_memberships m where m.workspace_id=w and m.status='active'
 and (public.schedule_actor_has_capability_service(m.user_id,w,'schedule.shift_change_requests.manage',loc) or (c.kind='swap' and public.schedule_actor_has_capability_service(m.user_id,w,'schedule.shift_change_requests.manage',(c.requested_snapshot->>'location_id')::uuid)))
 and m.user_id is distinct from actor and not exists(select 1 from public.employee_profiles e where e.workspace_id=w and e.user_id=m.user_id and (e.id=c.owner_id or exists(select 1 from public.shift_exchange_applications a where a.case_id=cid and (a.id=aid or (act='terms_changed' and a.status='pending_manager')) and a.employee_id=e.id)));
 if cardinality(reviewers)>0 then
 perform public.enqueue_notification_outbox_service(w,gen_random_uuid(),'requests.shift_change.submitted',1,actor,'shift_exchange_cases',cid::text,
 jsonb_build_object('correlation_id',eid,'request_id',cid,'request_event_id',eid,'request_action',act,'location_ids',to_jsonb(array_remove(array[loc,(c.requested_snapshot->>'location_id')::uuid],null)),'recipient_user_ids',to_jsonb(reviewers),
 'audience_contract','schedule_request_reviewers','category','request','title','Shift change ready for review','body','A teammate is ready. Review the candidates before approving.',
 'safe_preview','A shift request needs review.','action_url','/app/schedule/requests?tab=shift-changes&case='||cid::text,'group_key','shift_exchange_review:'||cid::text),now());
 end if;
 end if;
end; $function$;

-- D6 (KARARLAR "Takas… uygunluk", P24): a manager changes the hours of a
-- shift under request. New hours that overlap another shift of somebody who
-- already accepted end that acceptance; otherwise the acceptance is kept and a
-- change notice goes out. A swap whose owner would overlap, or a direct offer
-- whose one acceptance ends, ends as a whole.
CREATE OR REPLACE FUNCTION public.refresh_weekly_exchange_terms(w uuid, cid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.shift_exchange_cases%rowtype; s jsonb; t jsonb; fp text; deadline timestamptz;
 event_action text; message text; prior_details jsonb; given_up jsonb; dropped uuid[]:='{}'; ended uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(w::text,921));
 select * into c from public.shift_exchange_cases where workspace_id=w and id=cid for update;
 -- Expired, invalidated and completed requests must never be revived.
 if c.id is null or c.status<>'open' or c.expires_at<=clock_timestamp() then return; end if;
 s:=public.shift_exchange_shift(w,c.offered_source_id); t:=public.shift_exchange_shift(w,c.requested_source_id);
 if not public.weekly_exchange_same_responsibility(c.offered_snapshot,s)
  or not public.weekly_exchange_same_responsibility(c.requested_snapshot,t) then return; end if;
 if public.shift_exchange_terms(c.offered_snapshot)=public.shift_exchange_terms(s)
  and public.shift_exchange_terms(c.requested_snapshot)=public.shift_exchange_terms(t) then return; end if;
 fp:=public.shift_exchange_fingerprint(w,s,t);
 if fp=c.consent_fingerprint then return; end if;
 deadline:=coalesce(least((s->>'starts_at')::timestamptz,(t->>'starts_at')::timestamptz),c.expires_at);
 event_action:=case when deadline<=clock_timestamp() then 'expired' else 'terms_changed' end;
 if event_action='terms_changed' then
  given_up:=to_jsonb(array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null));
  if c.kind='swap' and t is not null and app_private.eligibility(w,c.owner_id,t,
   jsonb_build_object('operation','swap','excluded',given_up))->'blockers' @> '[{"code":"time_overlap"}]' then
   event_action:='invalidated';
  else
   select coalesce(array_agg(a.id order by a.id),'{}') into dropped from public.shift_exchange_applications a
    where a.case_id=cid and a.workspace_id=w and a.status='pending_manager'
     and app_private.eligibility(w,a.employee_id,s,jsonb_build_object('operation',
      case when c.kind in ('swap','open_pickup') then c.kind when c.audience='direct' then 'cover_accept' else 'release_pickup' end,
      'excluded',given_up))->'blockers' @> '[{"code":"time_overlap"}]';
   if c.audience='direct' and cardinality(dropped)>0 then event_action:='invalidated'; dropped:='{}'; end if;
  end if;
 end if;
 prior_details:=jsonb_build_object('before',jsonb_build_object('offered',c.offered_snapshot,'requested',c.requested_snapshot,
  'consent_fingerprint',c.consent_fingerprint,'revision',c.revision),
  'after',jsonb_build_object('offered',s,'requested',t,'consent_fingerprint',fp,'revision',c.revision+1),
  'acceptance_retained',event_action='terms_changed','acceptances_ended',to_jsonb(dropped),'cause','published_assignment_changed');
 update public.shift_exchange_cases set offered_snapshot=s,requested_snapshot=t,consent_fingerprint=fp,
  expires_at=deadline,status=case when event_action in ('expired','invalidated') then event_action else status end,
  revision=revision+1,updated_at=now() where id=cid;
 update public.shift_exchange_applications set consent_fingerprint=fp,
  status=case when event_action in ('expired','invalidated') then event_action when id=any(dropped) then 'invalidated' else status end,updated_at=now()
  where case_id=cid and workspace_id=w and status in ('invited','pending_manager');
 -- Employee consent survives; a manager's old scoped review does not.
 delete from public.shift_exchange_votes where workspace_id=w and case_id=cid;
 message:=case when event_action='expired' then
  'The updated shift has already started. This request closed without a transfer. Check your current schedule.'
 when event_action='invalidated' then
  'The new shift hours overlap another shift. This request ended without a transfer. Start a new request from the current schedule.'
 else format('Shift details changed: %s, %s, %s-%s (%s).%s Existing acceptances remain valid; pending invitations still need a response. Final manager approval is required.',
  s->>'location_name',s->>'date',s->>'start_time',s->>'end_time',coalesce(s->>'time_timezone',s->>'timezone'),
  case when t is null then '' else format(' Swap shift: %s, %s, %s-%s (%s).',t->>'location_name',t->>'date',t->>'start_time',t->>'end_time',coalesce(t->>'time_timezone',t->>'timezone')) end) end;
 perform public.shift_exchange_emit(null,w,cid,null,event_action,message);
 -- emit is synchronous under the workspace lock; its newest event is ours.
 update public.shift_exchange_events set details=prior_details where id=(select id from public.shift_exchange_events
  where workspace_id=w and case_id=cid and action=event_action order by notification_sequence desc limit 1);
 foreach ended in array dropped loop
  perform public.shift_exchange_emit(null,w,cid,ended,'invalidated',
   'The new shift hours overlap another shift of the teammate who accepted. That acceptance ended; no assignment changed.');
 end loop;
 perform realtime.send(jsonb_build_object('workspace_id',w,'case_id',cid,'revision',c.revision+1),
  'changed','shift-exchanges:'||w::text,true);
end; $function$;

-- The old candidate checks retire in 20261008020500 (they go live once main CI is green).

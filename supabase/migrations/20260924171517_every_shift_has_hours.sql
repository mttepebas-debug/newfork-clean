-- FOUNDATION-B 5.4: every shift has hours.
--
-- Before: a shift's time source could also be 'unresolved' (a named shift type
-- with no hours yet, to be confirmed later) or 'legacy_unverified' (old rows
-- whose badge time was hidden; "hide time on badge" doubled as that marker).
-- Publishing, auto-fill, exports, Shift Hub and the availability checks each
-- carried a branch for them, and an equal start and end got three different
-- refusals.
--
-- After:
-- * only 'explicit' and 'type_default' exist, and every shift row has a start
--   and an end that differ (checked on published, draft, edit and template
--   shifts; no row in any of them was timeless, locally or hosted,
--   2026-09-24);
-- * "hide time on badge" is a display choice only;
-- * one message for equal hours, "Start and end time cannot be the same.",
--   and "Enter start and end time." when they are missing; a shift type
--   without default hours says so;
-- * the timeless branches go from publication preview, auto-fill, export
--   minutes, Shift Hub, the candidate and commitment checks and both
--   availability evaluators. Line Up keeps its own until 5.6 deletes it.


alter table public.schedule_published_shifts
  drop constraint schedule_published_shifts_time_basis_check,
  add constraint schedule_published_shifts_time_basis_check check (time_basis in ('explicit', 'type_default')),
  drop constraint schedule_published_shifts_time_source_range,
  add constraint schedule_published_shifts_time_source_range check (start_time is not null and end_time is not null and start_time <> end_time);

alter table public.schedule_draft_shifts
  drop constraint schedule_draft_shifts_time_basis_check,
  add constraint schedule_draft_shifts_time_basis_check check (time_basis in ('explicit', 'type_default')),
  drop constraint schedule_draft_shifts_time_source_range,
  add constraint schedule_draft_shifts_time_source_range check (start_time is not null and end_time is not null and start_time <> end_time);

alter table public.schedule_edit_session_shifts
  drop constraint schedule_edit_session_shifts_time_basis_check,
  add constraint schedule_edit_session_shifts_time_basis_check check (time_basis in ('explicit', 'type_default')),
  drop constraint schedule_edit_session_shifts_time_source_range,
  add constraint schedule_edit_session_shifts_time_source_range check (start_time is not null and end_time is not null and start_time <> end_time);

alter table public.schedule_template_shifts
  drop constraint schedule_template_shifts_time_basis_check,
  add constraint schedule_template_shifts_time_basis_check check (time_basis in ('explicit', 'type_default')),
  drop constraint schedule_template_shifts_time_source_range,
  add constraint schedule_template_shifts_time_source_range check (start_time is not null and end_time is not null and start_time <> end_time);

CREATE OR REPLACE FUNCTION public.check_schedule_time_source()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare normalized jsonb;
begin
  new.time_basis:=coalesce(new.time_basis,'explicit');
  normalized:=public.normalize_schedule_time_source(new.workspace_id,to_jsonb(new),case when tg_op='UPDATE' then to_jsonb(old) else null end,true);
  if (new.start_time,new.end_time) is distinct from
    (nullif(normalized->>'start_time','')::time,nullif(normalized->>'end_time','')::time) then
    raise exception 'The shift interval does not match its saved time source' using errcode='23514';
  end if;
  new.time_snapshot:=normalized->'time_snapshot'; new.time_timezone:=normalized->>'time_timezone';
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.normalize_schedule_time_source(w uuid, payload jsonb, previous jsonb DEFAULT NULL::jsonb, preserve_saved_timezone boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare basis text; snap jsonb; tz text; source_type uuid; source_revision integer; ver public.shift_type_time_versions%rowtype;
begin
  select timezone into tz from public.locations where id=(payload->>'location_id')::uuid and workspace_id=w;
  if tz is null then raise exception 'invalid shift location' using errcode='23503'; end if;
  if previous is not null and payload->>'location_id'=previous->>'location_id' then
    tz:=coalesce(nullif(previous->>'time_timezone',''),tz);
  elsif preserve_saved_timezone then
    tz:=coalesce(nullif(payload->>'time_timezone',''),tz);
  end if;
  if not app_private.timezone_name_valid(tz) then
    raise exception 'Invalid shift timezone' using errcode='22023';
  end if;
  basis:=payload->>'time_basis';
  if basis is null and previous is not null then
    if previous->>'time_basis'='type_default' and
      (nullif(payload->>'start_time','')::time,nullif(payload->>'end_time','')::time) is distinct from
      (nullif(previous->>'start_time','')::time,nullif(previous->>'end_time','')::time) then
      raise exception 'Refresh the schedule before changing reference hours' using errcode='40001';
    end if;
    basis:=previous->>'time_basis'; snap:=previous->'time_snapshot';
  else snap:=payload->'time_snapshot'; end if;
  basis:=coalesce(basis,'explicit');
  if basis not in ('explicit','type_default') then raise exception 'invalid shift time source' using errcode='22023'; end if;
  if basis='type_default' then
    if snap is null or snap='null'::jsonb then
      source_type:=(payload->>'shift_type_id')::uuid;
      select default_revision into source_revision from public.shift_types where id=source_type and workspace_id=w;
    else
      source_type:=(snap->>'shift_type_id')::uuid; source_revision:=(snap->>'default_revision')::integer;
    end if;
    select * into ver from public.shift_type_time_versions where workspace_id=w and shift_type_id=source_type and revision=source_revision;
    if ver.shift_type_id is null or ver.start_time is null or ver.end_time is null then
      raise exception 'This shift type has no default hours. Enter start and end time.' using errcode='23514';
    end if;
    if snap is not null and snap<>'null'::jsonb and
      ((snap->>'start_time')::time,(snap->>'end_time')::time) is distinct from (ver.start_time,ver.end_time) then
      raise exception 'Shift default hours changed; refresh the reference before saving' using errcode='40001';
    end if;
    if previous is not null and payload->>'location_id'=previous->>'location_id' then
      tz:=coalesce(nullif(previous->>'time_timezone',''),tz);
    end if;
    snap:=jsonb_build_object('shift_type_id',source_type,'default_revision',source_revision,
      'start_time',to_char(ver.start_time,'HH24:MI'),'end_time',to_char(ver.end_time,'HH24:MI'),'timezone',tz);
    payload:=payload||jsonb_build_object('start_time',to_char(ver.start_time,'HH24:MI'),'end_time',to_char(ver.end_time,'HH24:MI'));
  else
    if nullif(payload->>'start_time','') is null or nullif(payload->>'end_time','') is null then
      raise exception 'Enter start and end time.' using errcode='22023'; end if;
    if (payload->>'start_time')::time=(payload->>'end_time')::time then
      raise exception 'Start and end time cannot be the same.' using errcode='22023'; end if;
    snap:=null;
    if previous is not null and payload->>'location_id'=previous->>'location_id' then tz:=coalesce(nullif(previous->>'time_timezone',''),tz); end if;
  end if;
  return payload||jsonb_build_object('time_basis',basis,'time_snapshot',snap,'time_timezone',tz);
end; $function$;

CREATE OR REPLACE FUNCTION public.mutate_schedule_edit_shift_service_base(actor_user_id uuid, target_workspace_id uuid, target_session_id uuid, expected_session_revision integer, operation text, target_shift_id uuid, expected_shift_revision integer DEFAULT NULL::integer, shift_payload jsonb DEFAULT NULL::jsonb, request_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_session public.schedule_edit_sessions%rowtype;
  target_location_id uuid;
  target_employee_id uuid;
  target_job_id uuid;
  target_shift_type_id uuid;
  target_scheduled_date date;
  target_start_time time;
  target_end_time time;
  target_unpaid_break_minutes integer;
  target_hide_time_on_badge boolean;
  target_note text;
begin
 perform public.availability_lock_workspace(target_workspace_id);
  perform public.availability_lock_workspace(target_workspace_id);
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
  if operation not in ('create', 'update', 'delete') then
    raise exception 'invalid shift operation' using errcode = '22023';
  end if;

  if operation in ('create', 'update') then
    shift_payload := public.normalize_schedule_time_source(target_workspace_id,shift_payload,(select to_jsonb(s) from public.schedule_edit_session_shifts s where s.session_id=target_session_id and s.id=target_shift_id));
    target_location_id := (shift_payload->>'location_id')::uuid;
    target_employee_id := nullif(shift_payload->>'employee_id', '')::uuid;
    target_job_id := (shift_payload->>'job_id')::uuid;
    target_shift_type_id := nullif(shift_payload->>'shift_type_id', '')::uuid;
    target_scheduled_date := (shift_payload->>'scheduled_date')::date;
    target_start_time := nullif(shift_payload->>'start_time','')::time;
    target_end_time := nullif(shift_payload->>'end_time','')::time;
    target_unpaid_break_minutes := coalesce((shift_payload->>'unpaid_break_minutes')::integer, 0);
    target_hide_time_on_badge := coalesce((shift_payload->>'hide_time_on_badge')::boolean, false);
    target_note := coalesce(shift_payload->>'note', '');
    if target_start_time = target_end_time then
      raise exception 'Start and end time cannot be the same.' using errcode = '22023';
    end if;
    if char_length(target_note) > 500
      or target_unpaid_break_minutes not in (0, 15, 30, 45, 60)
      or target_scheduled_date not between target_session.week_start and target_session.week_start + 6 then
      raise exception 'invalid shift values' using errcode = '22023';
    end if;
    if not public.schedule_actor_can_manage_service(actor_user_id, target_workspace_id, target_location_id) then
      raise exception 'location scope denied' using errcode = '42501';
    end if;
    if not exists (select 1 from public.jobs job where job.id = target_job_id and job.workspace_id = target_workspace_id and job.archived_at is null)
      or not exists (select 1 from public.locations location where location.id = target_location_id and location.workspace_id = target_workspace_id and location.archived_at is null)
      or (target_shift_type_id is not null and not exists (select 1 from public.shift_types shift_type where shift_type.id = target_shift_type_id and shift_type.workspace_id = target_workspace_id and shift_type.archived_at is null))
      or (target_employee_id is not null and not exists (
        select 1 from public.employee_profiles employee
        join public.employee_location_assignments location_assignment
          on location_assignment.employee_id = employee.id and location_assignment.location_id = target_location_id and location_assignment.ended_at is null
        join public.employee_job_assignments job_assignment
          on job_assignment.employee_id = employee.id and job_assignment.job_id = target_job_id and job_assignment.ended_at is null
        where employee.id = target_employee_id and employee.workspace_id = target_workspace_id and employee.archived_at is null
      )) then
      raise exception 'invalid shift reference' using errcode = '23503';
    end if;
  end if;

  if operation = 'create' then
    if request_idempotency_key is not null and exists (
      select 1 from public.schedule_edit_session_shifts shift
      where shift.session_id = target_session_id and shift.idempotency_key = request_idempotency_key
    ) then
      return public.get_schedule_edit_session_service(actor_user_id, target_workspace_id, target_session_id);
    end if;
    target_shift_id:=coalesce(target_shift_id,gen_random_uuid());
    perform public.schedule_prepare_availability_assignment(actor_user_id,target_workspace_id,shift_payload||jsonb_build_object('id',target_shift_id,'session_id',target_session_id),null);
    insert into public.schedule_edit_session_shifts (id, workspace_id, session_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, idempotency_key) values (coalesce(target_shift_id, gen_random_uuid()), target_workspace_id, target_session_id, target_location_id, target_employee_id, target_job_id, target_shift_type_id, target_scheduled_date, target_start_time, target_end_time, shift_payload->>'time_basis', shift_payload->'time_snapshot', shift_payload->>'time_timezone', target_unpaid_break_minutes, target_hide_time_on_badge, target_note, request_idempotency_key);
  elsif operation = 'update' then
    perform public.schedule_prepare_availability_assignment(actor_user_id,target_workspace_id,shift_payload||jsonb_build_object('id',target_shift_id,'session_id',target_session_id),(select to_jsonb(s) from public.schedule_edit_session_shifts s where s.workspace_id=target_workspace_id and s.session_id=target_session_id and s.id=target_shift_id));
    update public.schedule_edit_session_shifts shift
    set location_id = target_location_id, employee_id = target_employee_id,
      job_id = target_job_id, shift_type_id = target_shift_type_id,
      scheduled_date = target_scheduled_date, start_time = target_start_time,
      end_time = target_end_time, time_basis=shift_payload->>'time_basis', time_snapshot=shift_payload->'time_snapshot', time_timezone=shift_payload->>'time_timezone', unpaid_break_minutes = target_unpaid_break_minutes, hide_time_on_badge = target_hide_time_on_badge, note = target_note,
      revision = revision + 1, updated_at = now()
    where shift.session_id = target_session_id and shift.id = target_shift_id
      and shift.revision = expected_shift_revision
      and public.schedule_actor_can_manage_service(actor_user_id, target_workspace_id, shift.location_id);
    if not found then
      raise exception 'shift revision stale' using errcode = '40001';
    end if;
  else
    update public.schedule_availability_overrides set revoked_at=now() where workspace_id=target_workspace_id and shift_id=target_shift_id and revoked_at is null;
    delete from public.schedule_edit_session_shifts shift
    where shift.session_id = target_session_id and shift.id = target_shift_id
      and shift.revision = expected_shift_revision
      and public.schedule_actor_can_manage_service(actor_user_id, target_workspace_id, shift.location_id);
    if not found then
      raise exception 'shift revision stale' using errcode = '40001';
    end if;
  end if;

  update public.schedule_edit_sessions
  set revision = revision + 1, dirty = true,
    last_heartbeat = now(), expires_at = now() + interval '4 minutes'
  where id = target_session_id;
  return public.get_schedule_edit_session_service(actor_user_id, target_workspace_id, target_session_id);
end;
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
   neighbor_span:=public.lineup_shift_range(neighbor.scheduled_date,neighbor.start_time,neighbor.end_time,neighbor.zone);
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

CREATE OR REPLACE FUNCTION public.assess_shift_availability_context(w uuid, emp uuid, shift jsonb, service_independent boolean, proposed jsonb, resolved_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare loc uuid:=(shift->>'location_id')::uuid; day date:=coalesce(shift->>'scheduled_date',shift->>'date')::date;
 zone_name text; basis text:=coalesce(shift->>'time_basis','explicit'); start_clock time; end_clock time;
 local_start timestamp; local_end timestamp; start_at timestamptz; end_at timestamptz; span tstzrange; day_span tstzrange;
 capacity public.availability_capacity_result; remaining tstzmultirange; unavailable tstzmultirange; unknown tstzmultirange;
 leave_ranges tstzmultirange:='{}'; leave_evidence jsonb:='[]'; pending jsonb:='[]'; reasons jsonb:='[]'; settings public.workspace_scheduling_settings%rowtype;
 leave_row record; leave_span tstzrange; leave_zone text; coverage text; operation text; fingerprint_payload jsonb; result jsonb;
 type_rules jsonb; matching_types jsonb; type_conflict boolean:=false; service_unknown boolean:=false; missing_time boolean:=false; invalid_clock boolean:=false; ambiguous_clock boolean:=false; definite_block boolean:=false;
begin
 select coalesce(nullif(shift->>'time_timezone',''),nullif(shift->'time_snapshot'->>'timezone',''),l.timezone) into zone_name
 from public.locations l where l.workspace_id=w and l.id=loc;
 if zone_name is null or day is null or not isfinite(day) or not app_private.timezone_name_valid(zone_name) then
  raise exception 'A valid location, date and timezone are required for availability assessment' using errcode='22023'; end if;
 if not exists(select 1 from public.employee_profiles e where e.workspace_id=w and e.id=emp) then raise exception 'Employee not found in this workspace' using errcode='42501'; end if;
 select * into settings from public.workspace_scheduling_settings where workspace_id=w;
 if settings.workspace_id is null then raise exception 'Scheduling settings unavailable' using errcode='P0002'; end if;
 if basis not in ('explicit','type_default') then raise exception 'Unknown shift time source' using errcode='22023'; end if;
 if basis='type_default' then
  start_clock:=nullif(shift->'time_snapshot'->>'start_time','')::time; end_clock:=nullif(shift->'time_snapshot'->>'end_time','')::time;
  if (start_clock,end_clock) is distinct from (nullif(shift->>'start_time','')::time,nullif(shift->>'end_time','')::time) then
   raise exception 'Saved reference hours and their snapshot must agree' using errcode='22023'; end if;
 elsif basis='explicit' then start_clock:=nullif(shift->>'start_time','')::time; end_clock:=nullif(shift->>'end_time','')::time;
 end if;
 missing_time:=start_clock is null or end_clock is null or start_clock=end_clock;
 day_span:=tstzrange(day::timestamp at time zone zone_name,(day+1)::timestamp at time zone zone_name,'[)');
 if not missing_time then
  local_start:=day+start_clock; local_end:=day+end_clock+case when end_clock<start_clock then interval '1 day' else interval '0' end;
  start_at:=local_start at time zone zone_name; end_at:=local_end at time zone zone_name;
  invalid_clock:=(start_at at time zone zone_name)<>local_start or (end_at at time zone zone_name)<>local_end or end_at<=start_at;
  if not invalid_clock then
   span:=tstzrange(start_at,end_at,'[)');
   -- PostgreSQL chooses the offset following an autumn fold. Report that choice
   -- explicitly; recurring availability itself covers both occurrences above.
   ambiguous_clock:=exists(select 1 from (values(start_at,local_start),(end_at,local_end)) endpoint(instant,wall)
    cross join (values(interval '-1 day'),(interval '1 day')) probe(delta)
    cross join lateral (select (endpoint.wall at time zone 'UTC')-make_interval(secs=>public.availability_utc_offset(endpoint.instant+probe.delta,zone_name)) alternate) alt
    where alt.alternate<>endpoint.instant and (alt.alternate at time zone zone_name)=endpoint.wall);
  end if;
 end if;
 capacity:=public.availability_capacity_for_span(w,emp,coalesce(span,day_span),proposed);

 for leave_row in select seg.*,approved_piece.span approved_span,req.revision request_revision,req.status request_status,req_loc.timezone location_timezone
  from public.schedule_time_off_segments seg join public.schedule_time_off_requests req on req.id=seg.request_id and req.workspace_id=seg.workspace_id
  join public.locations req_loc on req_loc.id=req.location_id and req_loc.workspace_id=w cross join lateral unnest(public.time_off_effective_ranges(seg.id)) approved_piece(span)
  where req.workspace_id=w and req.employee_id=emp and req.request_type='time_off' and req.status in('approved','partially_approved') and seg.status='approved'
   and seg.segment_date between day-3 and day+3 order by seg.id loop
  leave_zone:=coalesce(leave_row.time_timezone,leave_row.location_timezone);
  leave_span:=leave_row.approved_span;
  if leave_span && coalesce(span,day_span) then
   leave_ranges:=leave_ranges+tstzmultirange(leave_span*coalesce(span,day_span));
   leave_evidence:=leave_evidence||jsonb_build_array(jsonb_build_object('segment_id',leave_row.id,'request_id',leave_row.request_id,'request_revision',leave_row.request_revision,
    'timezone',leave_zone,'timezone_source',case when leave_row.starts_at is null then 'legacy_location' else 'snapshot' end,
    'intervals',public.availability_ranges_json(tstzmultirange(leave_span*coalesce(span,day_span)))));
  end if;
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('request_id',r.id,'revision',r.revision,'status',r.status,'capacity_notice_open',r.capacity_notice_open) order by r.id),'[]') into pending
 from public.availability_requests r where r.workspace_id=w and r.employee_id=emp and r.id is distinct from resolved_request
  and (r.status in ('pending_review','awaiting_employee','changes_requested') or r.capacity_notice_open)
  and not isempty(public.availability_proposal_applies(r.proposal,coalesce(span,day_span)));

 type_rules:=public.availability_shift_type_rules(w,emp,coalesce(span,day_span),proposed);
 select coalesce(jsonb_agg(x order by x->>'shift_type_id',x->>'start_at'),'[]') into matching_types
  from jsonb_array_elements(type_rules) x where shift->>'shift_type_id' is null or (x->>'shift_type_id')::uuid=(shift->>'shift_type_id')::uuid;
 type_conflict:=shift->>'shift_type_id' is not null and jsonb_array_length(matching_types)>0;
 service_unknown:=shift->>'shift_type_id' is null and jsonb_array_length(matching_types)>0 and not service_independent;
 if type_conflict then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','shift_type_restricted','definite',true,
  'message','The employee is unavailable for this shift type on an affected weekday, regardless of its hours.')); end if;
 if service_unknown then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','shift_service_unclassified','definite',false,
  'message','The employee has shift-type restrictions. Classify the service before assigning; matching hours alone do not identify a shift type.')); end if;
  remaining:=capacity.available-leave_ranges; unavailable:=capacity.unavailable+leave_ranges; unknown:=capacity.unknown-leave_ranges;
 if span is null then
  definite_block:=isempty(capacity.unknown) and isempty(capacity.available);
  coverage:=case when definite_block or leave_ranges @> day_span then 'none' else 'unknown' end;
 else coverage:=case when not isempty(unknown) then 'unknown' when isempty(remaining) then 'none' when remaining @> span then 'full' else 'partial' end; end if;
 if not isempty(leave_ranges) then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','approved_time_off','message','Approved time off overlaps this assignment. Resolve the leave or assignment before assigning.',
  'intervals',public.availability_ranges_json(leave_ranges),'definite',span is not null or leave_ranges @> day_span)); end if;
 if not isempty(capacity.unavailable) and (span is not null or definite_block) then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','availability','message',case when basis='type_default' then 'The saved reference hours overlap unavailable hours.' else 'The assignment overlaps unavailable hours.' end,
  'intervals',public.availability_ranges_json(capacity.unavailable),'definite',true)); end if;
 if missing_time then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','time_source_unresolved','message','Confirm shift hours before assigning or publishing.','definite',false)); end if;
 if invalid_clock then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','invalid_local_time','message','These hours do not exist on this date in the selected timezone. Choose valid hours.','definite',true)); end if;
 if not isempty(capacity.unknown) then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','availability_unknown','message','Availability has not been confirmed for the entire assignment.','intervals',public.availability_ranges_json(capacity.unknown),'definite',false)); end if;
 if jsonb_array_length(pending)>0 then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','availability_review_pending','message','Resolve the pending availability request or capacity notice before publishing.','definite',true)); end if;
 operation:=case
  when invalid_clock or (not isempty(leave_ranges) and (span is not null or leave_ranges @> day_span)) then 'blocked'
  when settings.availability_enforcement='hard' and type_conflict then 'blocked'   when settings.availability_enforcement='hard' and not isempty(capacity.unavailable) and (span is not null or definite_block) then 'blocked'
  when service_unknown then 'verification_required'   when missing_time or coverage='unknown' or jsonb_array_length(pending)>0 then 'verification_required'
  when type_conflict then 'warning_requires_override'   when not isempty(capacity.unavailable) then 'warning_requires_override'
  else 'allowed' end;
 fingerprint_payload:=jsonb_build_object('workspace_id',w,'employee_id',emp,'shift',jsonb_build_object('id',shift->>'id','location_id',loc,'job_id',shift->>'job_id',
  'shift_type_id',shift->>'shift_type_id','date',day,'time_basis',basis,'time_snapshot',shift->'time_snapshot','timezone',zone_name,'start',start_clock,'end',end_clock),
  'intervals',public.availability_ranges_json(case when span is null then '{}'::tstzmultirange else tstzmultirange(span) end),
  'sources',capacity.sources,'leave',leave_evidence,'pending',pending,'policy_revision',settings.availability_policy_revision);
 fingerprint_payload:=fingerprint_payload||case when jsonb_array_length(matching_types)>0 then jsonb_build_object('type_restrictions',matching_types) else '{}'::jsonb end;  fingerprint_payload:=fingerprint_payload||case when service_independent then '{"service_classification":"custom"}'::jsonb else '{}'::jsonb end;  result:=jsonb_build_object('type_restrictions',matching_types,'coverage',coverage,'operation',operation,'time_basis',basis,'timezone',zone_name,
  'assessment_scope',case when span is null then 'calendar_day' else 'shift_interval' end,
  'intervals',public.availability_ranges_json(case when span is null then '{}'::tstzmultirange else tstzmultirange(span) end),
  'available_intervals',case when span is null then '[]'::jsonb else public.availability_ranges_json(remaining) end,
  'unavailable_intervals',public.availability_ranges_json(unavailable),'unknown_intervals',public.availability_ranges_json(unknown),
  'sources',capacity.sources,'leave',leave_evidence,'pending',pending,'reasons',reasons,'policy_revision',settings.availability_policy_revision,
  'fold_resolution',case when ambiguous_clock then 'post_transition_offset' else null end,
  'assessment_minutes',case when span is null then null else extract(epoch from upper(span)-lower(span))/60 end,
  'fingerprint',encode(extensions.digest(convert_to(fingerprint_payload::text,'UTF8'),'sha256'),'hex'));
 return result;
end; $function$;

CREATE OR REPLACE FUNCTION public.preview_schedule_publication_before_availability_review_service(actor_user_id uuid, target_workspace_id uuid, target_draft_id uuid, target_location_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_draft public.schedule_drafts%rowtype;
  normalized_locations uuid[];
  location_payload jsonb;
  finding_payload jsonb;
  unsigned_payload jsonb;
  preview_fingerprint text;
  hard_count integer;
  soft_count integer;
begin
  select * into target_draft
  from public.schedule_drafts draft
  where draft.id = target_draft_id
    and draft.workspace_id = target_workspace_id
    and draft.archived_at is null;
  if target_draft.id is null then
    raise exception 'schedule draft not found' using errcode = 'P0002';
  end if;
  if target_draft.week_start < public.schedule_current_week_start_service(target_workspace_id) then
    return jsonb_build_object(
      'status', 'past_week_closed', 'workspace_id', target_workspace_id,
      'week_start', target_draft.week_start, 'draft_id', target_draft.id,
      'draft_revision', target_draft.revision, 'fingerprint', repeat('0', 64),
      'locations', '[]'::jsonb, 'findings', '[]'::jsonb
    );
  end if;

  select array_agg(distinct location_id order by location_id)
  into normalized_locations
  from unnest(target_location_ids) location_id;
  if coalesce(cardinality(normalized_locations), 0) = 0 then
    raise exception 'at least one publication location required' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(normalized_locations) location_id
    where not exists (
      select 1 from public.locations location
      where location.id = location_id and location.workspace_id = target_workspace_id
        and location.archived_at is null
    ) or not public.schedule_actor_can_publish_service(
      actor_user_id, target_workspace_id, location_id
    )
  ) then
    raise exception 'schedule publication scope denied' using errcode = '42501';
  end if;
  -- A draft publishes only the locations it covers; anything else would be
  -- replaced with nothing.
  if not normalized_locations <@ target_draft.location_ids then
    raise exception 'publication location is not in this draft' using errcode = '22023';
  end if;

  with selected_locations as (
    select location.id, location.name
    from public.locations location
    where location.id = any(normalized_locations)
  ), active as (
    select publication.*
    from public.schedule_location_publications publication
    where publication.workspace_id = target_workspace_id
      and publication.week_start = target_draft.week_start
      and publication.location_id = any(normalized_locations)
      and publication.status = 'current'
  ), current_shift as (
    select shift.*
    from public.schedule_published_shifts shift
    join active publication on publication.id = shift.publication_id
  ), next_shift as (
    select shift.*
    from public.schedule_draft_shifts shift
    where shift.draft_id = target_draft.id
      and shift.location_id = any(normalized_locations)
  ), comparison as (
    select location.id as location_id, location.name as location_name,
      publication.id as active_publication_id,
      publication.version_number as active_version,
      (select count(*) from current_shift shift where shift.location_id = location.id)::integer as current_shift_count,
      (select count(*) from next_shift shift where shift.location_id = location.id)::integer as next_shift_count,
      (select count(*) from next_shift next_row where next_row.location_id = location.id and not exists (
        select 1 from current_shift current_row where current_row.location_id = location.id and current_row.source_shift_id = next_row.id
      ))::integer as added,
      (select count(*) from current_shift current_row where current_row.location_id = location.id and not exists (
        select 1 from next_shift next_row where next_row.location_id = location.id and next_row.id = current_row.source_shift_id
      ))::integer as removed,
      (select count(*) from next_shift next_row join current_shift current_row
        on current_row.location_id = next_row.location_id and current_row.source_shift_id = next_row.id
        where next_row.location_id = location.id and (
          current_row.employee_id is distinct from next_row.employee_id
          or current_row.job_id is distinct from next_row.job_id
          or current_row.shift_type_id is distinct from next_row.shift_type_id
          or current_row.scheduled_date is distinct from next_row.scheduled_date
          or current_row.start_time is distinct from next_row.start_time
          or current_row.end_time is distinct from next_row.end_time
          or current_row.time_basis is distinct from next_row.time_basis
          or current_row.time_snapshot is distinct from next_row.time_snapshot
          or current_row.time_timezone is distinct from next_row.time_timezone
          or current_row.note is distinct from next_row.note
        ))::integer as updated,
      (select count(*) from next_shift next_row join current_shift current_row
        on current_row.location_id = next_row.location_id and current_row.source_shift_id = next_row.id
        where next_row.location_id = location.id and not (
          current_row.employee_id is distinct from next_row.employee_id
          or current_row.job_id is distinct from next_row.job_id
          or current_row.shift_type_id is distinct from next_row.shift_type_id
          or current_row.scheduled_date is distinct from next_row.scheduled_date
          or current_row.start_time is distinct from next_row.start_time
          or current_row.end_time is distinct from next_row.end_time
          or current_row.time_basis is distinct from next_row.time_basis
          or current_row.time_snapshot is distinct from next_row.time_snapshot
          or current_row.time_timezone is distinct from next_row.time_timezone
          or current_row.note is distinct from next_row.note
        ))::integer as unchanged,
      coalesce((
        select array_agg(distinct affected.employee_id order by affected.employee_id)
        from (
          select next_row.employee_id
          from next_shift next_row
          where next_row.location_id = location.id
            and next_row.employee_id is not null
            and not exists (
              select 1 from current_shift current_row
              where current_row.location_id = location.id
                and current_row.source_shift_id = next_row.id
            )
          union
          select next_row.employee_id
          from next_shift next_row
          join current_shift current_row
            on current_row.location_id = next_row.location_id
           and current_row.source_shift_id = next_row.id
          where next_row.location_id = location.id
            and next_row.employee_id is not null
            and (
              current_row.employee_id is distinct from next_row.employee_id
              or current_row.job_id is distinct from next_row.job_id
              or current_row.shift_type_id is distinct from next_row.shift_type_id
              or current_row.scheduled_date is distinct from next_row.scheduled_date
              or current_row.start_time is distinct from next_row.start_time
              or current_row.end_time is distinct from next_row.end_time
              or current_row.time_basis is distinct from next_row.time_basis
          or current_row.time_snapshot is distinct from next_row.time_snapshot
          or current_row.time_timezone is distinct from next_row.time_timezone
          or current_row.note is distinct from next_row.note
            )
          union
          select current_row.employee_id
          from current_shift current_row
          where current_row.location_id = location.id
            and current_row.employee_id is not null
            and not exists (
              select 1 from next_shift next_row
              where next_row.location_id = location.id
                and next_row.id = current_row.source_shift_id
            )
        ) affected
      ), '{}'::uuid[]) as affected_employee_ids
    from selected_locations location
    left join active publication on publication.location_id = location.id
  )
  select jsonb_agg(to_jsonb(comparison) order by location_name, location_id)
  into location_payload from comparison;

  with next_shift as (
    select shift.*,
      coalesce(nullif(employee.preferred_name, ''), employee.first_name) || ' ' || employee.last_name as employee_name,
      location.name as location_name,
      tsrange(
        shift.scheduled_date::timestamp + shift.start_time,
        shift.scheduled_date::timestamp + shift.end_time
          + case when shift.end_time <= shift.start_time then interval '1 day' else interval '0' end,
        '[)'
      ) as occupied
    from public.schedule_draft_shifts shift
    join public.locations location on location.id = shift.location_id
    left join public.employee_profiles employee on employee.id = shift.employee_id
    where shift.draft_id = target_draft.id and shift.location_id = any(normalized_locations)
  ), raw_findings as (
    select
      'overlap'::text as code, case when first.time_basis='explicit' and second.time_basis='explicit' then 'hard' else 'soft' end::text as severity, (first.time_basis='type_default' or second.time_basis='type_default') as overrideable,
      first.location_id, first.employee_id, first.scheduled_date,
      array[first.id, second.id]::uuid[] as shift_ids,
      first.employee_name || case when first.time_basis='type_default' or second.time_basis='type_default' then ' has overlapping reference hours on ' else ' has overlapping shifts on ' end || first.scheduled_date::text || '.' as message
    from next_shift first
    join next_shift second on second.employee_id = first.employee_id and second.id > first.id
      and first.employee_id is not null and first.time_basis in ('explicit','type_default') and second.time_basis in ('explicit','type_default') and first.occupied && second.occupied
    union all
    select
      'availability', 'soft', true, shift.location_id, shift.employee_id,
      shift.scheduled_date, array[shift.id]::uuid[],
      shift.employee_name || ' is unavailable on ' || shift.scheduled_date::text || '.'
    from next_shift shift
    where shift.employee_id is not null and exists (
      select 1
      from public.employee_schedule_availability_versions version,
        lateral jsonb_array_elements(version.recurring_rules) rule
      where version.employee_id = shift.employee_id
        and version.version_number = (
          select max(latest.version_number)
          from public.employee_schedule_availability_versions latest
          where latest.employee_id = shift.employee_id
        )
        and (rule->>'day')::integer = extract(dow from shift.scheduled_date)::integer
        and rule->>'mode' = 'unavailable'
    )
    union all
    select
      'closed_location', 'soft', true, shift.location_id, shift.employee_id,
      shift.scheduled_date, array[shift.id]::uuid[],
      shift.location_name || ' is closed on ' || shift.scheduled_date::text || '.'
    from next_shift shift
    where exists (
      select 1 from public.schedule_closures closure
      where closure.location_id = shift.location_id
        and closure.closed_date = shift.scheduled_date and closure.is_all_day
    )
  ), findings as (
    select encode(extensions.digest(convert_to(
      code || '|' || coalesce(employee_id::text, '') || '|' || scheduled_date::text || '|' || array_to_string(shift_ids, ','),
      'UTF8'), 'sha256'), 'hex') as id, *
    from raw_findings
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'code', code, 'severity', severity, 'overrideable', overrideable,
    'message', message, 'location_id', location_id, 'employee_id', employee_id,
    'scheduled_date', scheduled_date, 'shift_ids', to_jsonb(shift_ids)
  ) order by severity, code, scheduled_date, id), '[]'::jsonb),
  count(*) filter (where severity = 'hard')::integer,
  count(*) filter (where severity = 'soft')::integer
  into finding_payload, hard_count, soft_count
  from findings;

  unsigned_payload := jsonb_build_object(
    'workspace_id', target_workspace_id,
    'week_start', target_draft.week_start,
    'draft_id', target_draft.id,
    'draft_revision', target_draft.revision,
    'locations', coalesce(location_payload, '[]'::jsonb),
    'findings', finding_payload
  );
  preview_fingerprint := encode(extensions.digest(convert_to(unsigned_payload::text, 'UTF8'), 'sha256'), 'hex');
  return unsigned_payload || jsonb_build_object(
    'status', case when hard_count > 0 then 'hard_blocked'
      when soft_count > 0 then 'override_required' else 'publish_ready' end,
    'fingerprint', preview_fingerprint
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.preview_schedule_publication_before_availability_review_service(actor_user_id uuid, target_workspace_id uuid, target_draft_id uuid, target_location_ids uuid[], target_department_ids uuid[], include_no_department boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_draft public.schedule_drafts%rowtype;
  normalized_locations uuid[];
  normalized_departments uuid[];
  effective_include_no_department boolean := coalesce(include_no_department, true);
  location_payload jsonb;
  finding_payload jsonb;
  unsigned_payload jsonb;
  preview_fingerprint text;
  hard_count integer;
  soft_count integer;
begin
  select * into target_draft
  from public.schedule_drafts draft
  where draft.id = target_draft_id
    and draft.workspace_id = target_workspace_id
    and draft.archived_at is null;
  if target_draft.id is null then
    raise exception 'schedule draft not found' using errcode = 'P0002';
  end if;
  if target_draft.week_start < public.schedule_current_week_start_service(target_workspace_id) then
    return jsonb_build_object(
      'status', 'past_week_closed', 'workspace_id', target_workspace_id,
      'week_start', target_draft.week_start, 'draft_id', target_draft.id,
      'draft_revision', target_draft.revision, 'fingerprint', repeat('0', 64),
      'locations', '[]'::jsonb, 'findings', '[]'::jsonb
    );
  end if;

  select array_agg(distinct location_id order by location_id)
  into normalized_locations
  from unnest(target_location_ids) location_id;
  if coalesce(cardinality(normalized_locations), 0) = 0 then
    raise exception 'at least one publication location required' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(normalized_locations) location_id
    where not exists (
      select 1 from public.locations location
      where location.id = location_id and location.workspace_id = target_workspace_id
        and location.archived_at is null
    ) or not public.schedule_actor_can_publish_service(
      actor_user_id, target_workspace_id, location_id
    )
  ) then
    raise exception 'schedule publication scope denied' using errcode = '42501';
  end if;
  -- A draft publishes only the locations it covers; anything else would be
  -- replaced with nothing.
  if not normalized_locations <@ target_draft.location_ids then
    raise exception 'publication location is not in this draft' using errcode = '22023';
  end if;

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

  with selected_locations as (
    select location.id, location.name
    from public.locations location
    where location.id = any(normalized_locations)
  ), active as (
    select publication.*
    from public.schedule_location_publications publication
    where publication.workspace_id = target_workspace_id
      and publication.week_start = target_draft.week_start
      and publication.location_id = any(normalized_locations)
      and publication.status = 'current'
  ), current_shift as (
    select shift.*
    from public.schedule_published_shifts shift
    join active publication on publication.id = shift.publication_id
    where public.schedule_shift_in_department_scope_service(
      shift.job_id, normalized_departments, effective_include_no_department
    )
  ), next_shift as (
    select shift.*
    from public.schedule_draft_shifts shift
    where shift.draft_id = target_draft.id
      and shift.location_id = any(normalized_locations)
      and public.schedule_shift_in_department_scope_service(
        shift.job_id, normalized_departments, effective_include_no_department
      )
  ), comparison as (
    select location.id as location_id, location.name as location_name,
      publication.id as active_publication_id,
      publication.version_number as active_version,
      (select count(*) from current_shift shift where shift.location_id = location.id)::integer as current_shift_count,
      (select count(*) from next_shift shift where shift.location_id = location.id)::integer as next_shift_count,
      (select count(*) from next_shift next_row where next_row.location_id = location.id and not exists (
        select 1 from current_shift current_row where current_row.location_id = location.id and current_row.source_shift_id = next_row.id
      ))::integer as added,
      (select count(*) from current_shift current_row where current_row.location_id = location.id and not exists (
        select 1 from next_shift next_row where next_row.location_id = location.id and next_row.id = current_row.source_shift_id
      ))::integer as removed,
      (select count(*) from next_shift next_row join current_shift current_row
        on current_row.location_id = next_row.location_id and current_row.source_shift_id = next_row.id
        where next_row.location_id = location.id and (
          current_row.employee_id is distinct from next_row.employee_id
          or current_row.job_id is distinct from next_row.job_id
          or current_row.shift_type_id is distinct from next_row.shift_type_id
          or current_row.scheduled_date is distinct from next_row.scheduled_date
          or current_row.start_time is distinct from next_row.start_time
          or current_row.end_time is distinct from next_row.end_time
          or current_row.time_basis is distinct from next_row.time_basis
          or current_row.time_snapshot is distinct from next_row.time_snapshot
          or current_row.time_timezone is distinct from next_row.time_timezone
          or current_row.note is distinct from next_row.note
        ))::integer as updated,
      (select count(*) from next_shift next_row join current_shift current_row
        on current_row.location_id = next_row.location_id and current_row.source_shift_id = next_row.id
        where next_row.location_id = location.id and not (
          current_row.employee_id is distinct from next_row.employee_id
          or current_row.job_id is distinct from next_row.job_id
          or current_row.shift_type_id is distinct from next_row.shift_type_id
          or current_row.scheduled_date is distinct from next_row.scheduled_date
          or current_row.start_time is distinct from next_row.start_time
          or current_row.end_time is distinct from next_row.end_time
          or current_row.time_basis is distinct from next_row.time_basis
          or current_row.time_snapshot is distinct from next_row.time_snapshot
          or current_row.time_timezone is distinct from next_row.time_timezone
          or current_row.note is distinct from next_row.note
        ))::integer as unchanged,
      coalesce((
        select array_agg(distinct affected.employee_id order by affected.employee_id)
        from (
          select next_row.employee_id
          from next_shift next_row
          where next_row.location_id = location.id
            and next_row.employee_id is not null
            and not exists (
              select 1 from current_shift current_row
              where current_row.location_id = location.id
                and current_row.source_shift_id = next_row.id
            )
          union
          select next_row.employee_id
          from next_shift next_row
          join current_shift current_row
            on current_row.location_id = next_row.location_id
           and current_row.source_shift_id = next_row.id
          where next_row.location_id = location.id
            and next_row.employee_id is not null
            and (
              current_row.employee_id is distinct from next_row.employee_id
              or current_row.job_id is distinct from next_row.job_id
              or current_row.shift_type_id is distinct from next_row.shift_type_id
              or current_row.scheduled_date is distinct from next_row.scheduled_date
              or current_row.start_time is distinct from next_row.start_time
              or current_row.end_time is distinct from next_row.end_time
              or current_row.time_basis is distinct from next_row.time_basis
          or current_row.time_snapshot is distinct from next_row.time_snapshot
          or current_row.time_timezone is distinct from next_row.time_timezone
          or current_row.note is distinct from next_row.note
            )
          union
          select current_row.employee_id
          from current_shift current_row
          where current_row.location_id = location.id
            and current_row.employee_id is not null
            and not exists (
              select 1 from next_shift next_row
              where next_row.location_id = location.id
                and next_row.id = current_row.source_shift_id
            )
        ) affected
      ), '{}'::uuid[]) as affected_employee_ids
    from selected_locations location
    left join active publication on publication.location_id = location.id
  )
  select jsonb_agg(to_jsonb(comparison) order by location_name, location_id)
  into location_payload from comparison;

  with next_shift as (
    select shift.*,
      coalesce(nullif(employee.preferred_name, ''), employee.first_name) || ' ' || employee.last_name as employee_name,
      location.name as location_name,
      tsrange(
        shift.scheduled_date::timestamp + shift.start_time,
        shift.scheduled_date::timestamp + shift.end_time
          + case when shift.end_time <= shift.start_time then interval '1 day' else interval '0' end,
        '[)'
      ) as occupied
    from public.schedule_draft_shifts shift
    join public.locations location on location.id = shift.location_id
    left join public.employee_profiles employee on employee.id = shift.employee_id
    where shift.draft_id = target_draft.id
      and shift.location_id = any(normalized_locations)
      and public.schedule_shift_in_department_scope_service(
        shift.job_id, normalized_departments, effective_include_no_department
      )
  ), raw_findings as (
    select
      'overlap'::text as code, case when first.time_basis='explicit' and second.time_basis='explicit' then 'hard' else 'soft' end::text as severity, (first.time_basis='type_default' or second.time_basis='type_default') as overrideable,
      first.location_id, first.employee_id, first.scheduled_date,
      array[first.id, second.id]::uuid[] as shift_ids,
      first.employee_name || case when first.time_basis='type_default' or second.time_basis='type_default' then ' has overlapping reference hours on ' else ' has overlapping shifts on ' end || first.scheduled_date::text || '.' as message
    from next_shift first
    join next_shift second on second.employee_id = first.employee_id and second.id > first.id
      and first.employee_id is not null and first.time_basis in ('explicit','type_default') and second.time_basis in ('explicit','type_default') and first.occupied && second.occupied
    union all
    select
      'availability', 'soft', true, shift.location_id, shift.employee_id,
      shift.scheduled_date, array[shift.id]::uuid[],
      shift.employee_name || ' is unavailable on ' || shift.scheduled_date::text || '.'
    from next_shift shift
    where shift.employee_id is not null and exists (
      select 1
      from public.employee_schedule_availability_versions version,
        lateral jsonb_array_elements(version.recurring_rules) rule
      where version.employee_id = shift.employee_id
        and version.version_number = (
          select max(latest.version_number)
          from public.employee_schedule_availability_versions latest
          where latest.employee_id = shift.employee_id
        )
        and (rule->>'day')::integer = extract(dow from shift.scheduled_date)::integer
        and rule->>'mode' = 'unavailable'
    )
    union all
    select
      'closed_location', 'soft', true, shift.location_id, shift.employee_id,
      shift.scheduled_date, array[shift.id]::uuid[],
      shift.location_name || ' is closed on ' || shift.scheduled_date::text || '.'
    from next_shift shift
    where exists (
      select 1 from public.schedule_closures closure
      where closure.location_id = shift.location_id
        and closure.closed_date = shift.scheduled_date and closure.is_all_day
    )
  ), findings as (
    select encode(extensions.digest(convert_to(
      code || '|' || coalesce(employee_id::text, '') || '|' || scheduled_date::text || '|' || array_to_string(shift_ids, ','),
      'UTF8'), 'sha256'), 'hex') as id, *
    from raw_findings
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'code', code, 'severity', severity, 'overrideable', overrideable,
    'message', message, 'location_id', location_id, 'employee_id', employee_id,
    'scheduled_date', scheduled_date, 'shift_ids', to_jsonb(shift_ids)
  ) order by severity, code, scheduled_date, id), '[]'::jsonb),
  count(*) filter (where severity = 'hard')::integer,
  count(*) filter (where severity = 'soft')::integer
  into finding_payload, hard_count, soft_count
  from findings;

  unsigned_payload := jsonb_build_object(
    'workspace_id', target_workspace_id,
    'week_start', target_draft.week_start,
    'draft_id', target_draft.id,
    'draft_revision', target_draft.revision,
    'locations', coalesce(location_payload, '[]'::jsonb),
    'findings', finding_payload
  );
  preview_fingerprint := encode(extensions.digest(convert_to(unsigned_payload::text, 'UTF8'), 'sha256'), 'hex');
  return unsigned_payload || jsonb_build_object(
    'status', case when hard_count > 0 then 'hard_blocked'
      when soft_count > 0 then 'override_required' else 'publish_ready' end,
    'fingerprint', preview_fingerprint
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.schedule_availability_publication_preflight(payload jsonb, actor uuid, departments uuid[] DEFAULT NULL::uuid[], include_no_department boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare findings jsonb; signatures jsonb:='[]'; s record; a jsonb; prior jsonb; evidence jsonb;
 unsigned jsonb; w uuid:=(payload->>'workspace_id')::uuid; code text; soft boolean; message text;
begin
 if payload->>'status'='past_week_closed' then return payload; end if;
 select coalesce(jsonb_agg(f),'[]') into findings from jsonb_array_elements(payload->'findings') f
  where f->>'code'<>'availability';
 for s in select d.* from public.schedule_draft_shifts d where d.workspace_id=w and d.draft_id=(payload->>'draft_id')::uuid
  and d.employee_id is not null and d.location_id in (select (l->>'location_id')::uuid from jsonb_array_elements(payload->'locations') l)
  and public.schedule_shift_in_department_scope_service(d.job_id,departments,coalesce(include_no_department,true)) order by d.id loop
  prior:=public.schedule_availability_prior_publication(w,to_jsonb(s));
  if prior is not null then
   signatures:=signatures||jsonb_build_array(jsonb_build_object('shift_id',s.id,'retained_publication_id',prior->>'publication_id'));
   continue;
  end if;
  a:=public.assess_shift_availability(w,s.employee_id,to_jsonb(s));
  evidence:=public.schedule_availability_override(w,to_jsonb(s),a);
  signatures:=signatures||jsonb_build_array(jsonb_build_object('shift_id',s.id,'fingerprint',a->>'fingerprint','override_id',evidence->>'id'));
  if a->>'operation'='allowed' or (a->>'operation'='warning_requires_override' and evidence is not null) then continue; end if;
  soft:=a->>'operation'='warning_requires_override' and public.schedule_actor_has_capability_service(actor,w,'schedule.availability.override',s.location_id);
  code:=case when exists(select 1 from jsonb_array_elements(a->'reasons') r where r->>'code'='approved_time_off') then 'time_off'
    when a->>'coverage'='unknown' then 'availability_unknown' else 'availability' end;
  select string_agg(r->>'message',' ' order by ord) into message from jsonb_array_elements(a->'reasons') with ordinality r(r,ord);
  if a->>'operation'='warning_requires_override' and not soft then message:='A manager with availability override permission must review this assignment.'; end if;
  findings:=findings||jsonb_build_array(jsonb_build_object('id',a->>'fingerprint','code',code,'severity',case when soft then 'soft' else 'hard' end,
   'overrideable',soft,'location_id',s.location_id,'employee_id',s.employee_id,'scheduled_date',s.scheduled_date,'shift_ids',jsonb_build_array(s.id),
   'message',left(coalesce(message,'Resolve availability before publishing.'),500)));
 end loop;
 unsigned:=(payload-'fingerprint'-'status')||jsonb_build_object('findings',findings,'availability_assessments',signatures);
 return unsigned||jsonb_build_object('status',case when exists(select 1 from jsonb_array_elements(findings) f where f->>'severity'='hard') then 'hard_blocked'
  when jsonb_array_length(findings)>0 then 'override_required' else 'publish_ready' end,
  'fingerprint',encode(extensions.digest(convert_to(unsigned::text,'UTF8'),'sha256'),'hex'));
end; $function$;

CREATE OR REPLACE FUNCTION public.preview_schedule_export_service(actor_user_id uuid, target_workspace_id uuid, target_week_start date, source_type text, source_draft_id uuid, target_location_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare normalized uuid[]; source_revision integer; rows jsonb; locations jsonb; unsigned jsonb; workspace_name text;
begin
  if source_type not in ('published','draft') then raise exception 'invalid schedule export source' using errcode='22023'; end if;
  select array_agg(distinct id order by id) into normalized from unnest(target_location_ids) id;
  if coalesce(cardinality(normalized),0)=0 then raise exception 'schedule export location required' using errcode='22023'; end if;
  if not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.export')
    or exists(select 1 from unnest(normalized) id where not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.export',id)) then
    raise exception 'schedule export scope denied' using errcode='42501';
  end if;
  if source_type='draft' then
    select revision into source_revision from public.schedule_drafts d where d.id=source_draft_id and d.workspace_id=target_workspace_id and d.week_start=target_week_start and d.archived_at is null;
    if source_revision is null then raise exception 'schedule export draft not found' using errcode='P0002'; end if;
  elsif source_draft_id is not null then raise exception 'published export cannot specify draft' using errcode='22023'; end if;
  select name into workspace_name from public.workspaces where id=target_workspace_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name) order by l.sort_order,l.id),'[]'::jsonb) into locations
  from public.locations l where l.workspace_id=target_workspace_id and l.id=any(normalized);
  if jsonb_array_length(locations)<>cardinality(normalized) then raise exception 'schedule export location not found' using errcode='P0002'; end if;
  if source_type='draft' then
    select coalesce(jsonb_agg(jsonb_build_object('shift_id',s.id,'scheduled_date',s.scheduled_date,'location_name',l.name,
      'employee_name',case when s.employee_id is null then null else coalesce(nullif(e.preferred_name,''),e.first_name||' '||e.last_name) end,'job_name',j.name,'shift_type_name',st.name,
      'label_names',to_jsonb(coalesce(s.label_names,'{}'::text[])),
      'time_basis',s.time_basis,'time_snapshot',s.time_snapshot,'time_timezone',s.time_timezone,'start_time',to_char(s.start_time,'HH24:MI'),'end_time',to_char(s.end_time,'HH24:MI'),'crosses_midnight',s.crosses_midnight,'note',s.note,
      'scheduled_minutes',greatest(0,(case when s.end_time<=s.start_time then 1440 else 0 end+extract(epoch from(s.end_time-s.start_time))/60)::integer-coalesce(s.unpaid_break_minutes,0)))
      order by s.scheduled_date,l.sort_order,s.start_time,s.id),'[]'::jsonb) into rows
    from public.schedule_draft_shifts s join public.locations l on l.id=s.location_id join public.jobs j on j.id=s.job_id
    left join public.employee_profiles e on e.id=s.employee_id left join public.shift_types st on st.id=s.shift_type_id
    where s.draft_id=source_draft_id and s.location_id=any(normalized);
  else
    select coalesce(jsonb_agg(jsonb_build_object('shift_id',s.id,'scheduled_date',s.scheduled_date,'location_name',l.name,
      'employee_name',case when s.employee_id is null then null else coalesce(nullif(e.preferred_name,''),e.first_name||' '||e.last_name) end,'job_name',j.name,'shift_type_name',st.name,
      'label_names',to_jsonb(coalesce(s.label_names,'{}'::text[])),
      'time_basis',s.time_basis,'time_snapshot',s.time_snapshot,'time_timezone',s.time_timezone,'start_time',to_char(s.start_time,'HH24:MI'),'end_time',to_char(s.end_time,'HH24:MI'),'crosses_midnight',s.crosses_midnight,'note',s.note,
      'scheduled_minutes',greatest(0,(case when s.end_time<=s.start_time then 1440 else 0 end+extract(epoch from(s.end_time-s.start_time))/60)::integer-coalesce(s.unpaid_break_minutes,0)))
      order by s.scheduled_date,l.sort_order,s.start_time,s.id),'[]'::jsonb) into rows
    from public.schedule_published_shifts s join public.schedule_location_publications p on p.id=s.publication_id and p.status='current' and p.week_start=target_week_start
    join public.locations l on l.id=s.location_id join public.jobs j on j.id=s.job_id left join public.employee_profiles e on e.id=s.employee_id left join public.shift_types st on st.id=s.shift_type_id
    where s.workspace_id=target_workspace_id and s.location_id=any(normalized);
  end if;
  unsigned:=jsonb_build_object('workspace_id',target_workspace_id,'workspace_name',workspace_name,'week_start',target_week_start,
    'source',case when source_type='draft' then jsonb_build_object('type','draft','draft_id',source_draft_id) else jsonb_build_object('type','published') end,
    'source_revision',source_revision,'locations',locations,'rows',rows,'summary',jsonb_build_object('shift_count',jsonb_array_length(rows),
      'employee_count',(select count(distinct x->>'employee_name') from jsonb_array_elements(rows) x where x->>'employee_name' is not null),
      'scheduled_minutes',(select coalesce(sum((x->>'scheduled_minutes')::integer),0) from jsonb_array_elements(rows) x)));
  return unsigned||jsonb_build_object('status','export_ready','fingerprint',encode(extensions.digest(convert_to(unsigned::text,'UTF8'),'sha256'),'hex'));
end; $function$;

CREATE OR REPLACE FUNCTION public.preview_schedule_auto_fill_service(actor_user_id uuid, target_workspace_id uuid, target_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target_session public.schedule_edit_sessions%rowtype; open_shift record; candidate_payload jsonb; recommended uuid;
  proposals jsonb:='[]'::jsonb; unfilled jsonb:='[]'::jsonb; unsigned jsonb;
begin
  select * into target_session from public.schedule_edit_sessions s where s.id=target_session_id and s.workspace_id=target_workspace_id;
  if target_session.id is null or target_session.holder_user_id<>actor_user_id or not public.schedule_actor_can_manage_service(actor_user_id,target_workspace_id) then raise exception 'edit session not found' using errcode='P0002'; end if;
  if target_session.status<>'active' or target_session.expires_at<=now() then raise exception 'edit lease expired' using errcode='40001'; end if;
  for open_shift in select s.*,l.name location_name,j.name job_name from public.schedule_edit_session_shifts s
    join public.locations l on l.id=s.location_id join public.jobs j on j.id=s.job_id
    where s.session_id=target_session.id and s.employee_id is null order by s.scheduled_date,s.start_time,s.id loop
    with eligible as (
      select e.id employee_id,coalesce(nullif(e.preferred_name,''),e.first_name||' '||e.last_name) employee_name,ja.is_primary,
        coalesce((select sum(case when x.end_time<=x.start_time then 1440 else 0 end + extract(epoch from (x.end_time-x.start_time))/60)::integer
          from public.schedule_edit_session_shifts x where x.session_id=target_session.id and x.employee_id=e.id),0) scheduled_minutes
      from public.employee_profiles e
      join public.employee_location_assignments la on la.employee_id=e.id and la.workspace_id=e.workspace_id and la.location_id=open_shift.location_id and la.ended_at is null
      join public.employee_job_assignments ja on ja.employee_id=e.id and ja.workspace_id=e.workspace_id and ja.job_id=open_shift.job_id and ja.ended_at is null
      where e.workspace_id=target_workspace_id and e.archived_at is null
      and not exists(select 1 from public.schedule_edit_session_shifts x where x.session_id=target_session.id and x.employee_id=e.id
        and tsrange(x.scheduled_date+x.start_time,x.scheduled_date+x.end_time+case when x.end_time<=x.start_time then interval '1 day' else interval '0' end,'[)')
          && tsrange(open_shift.scheduled_date+open_shift.start_time,open_shift.scheduled_date+open_shift.end_time+case when open_shift.end_time<=open_shift.start_time then interval '1 day' else interval '0' end,'[)'))
      and (public.assess_weekly_shift_availability(target_workspace_id,e.id,to_jsonb(open_shift)||jsonb_build_object('employee_id',e.id))->>'operation')='allowed'
      and not exists(select 1 from jsonb_array_elements(proposals) p where (p->>'recommended_employee_id')::uuid=e.id
        and tsrange((p->>'scheduled_date')::date+(p->>'start_time')::time,(p->>'scheduled_date')::date+(p->>'end_time')::time+case when (p->>'end_time')::time<=(p->>'start_time')::time then interval '1 day' else interval '0' end,'[)')
          && tsrange(open_shift.scheduled_date+open_shift.start_time,open_shift.scheduled_date+open_shift.end_time+case when open_shift.end_time<=open_shift.start_time then interval '1 day' else interval '0' end,'[)'))
    ), ranked as (select *,min(scheduled_minutes) over() min_minutes from eligible)
    select coalesce(jsonb_agg(jsonb_build_object('employee_id',employee_id,'employee_name',employee_name,'scheduled_minutes',scheduled_minutes,
      'availability_fingerprint',public.assess_weekly_shift_availability(target_workspace_id,employee_id,to_jsonb(open_shift)||jsonb_build_object('employee_id',employee_id))->>'fingerprint','primary_job',is_primary,'reasons',to_jsonb(array_remove(array[case when scheduled_minutes=min_minutes then 'Fewest scheduled hours' end,case when is_primary then 'Primary job' end,'Available']::text[],null)))
      order by scheduled_minutes,is_primary desc,employee_id),'[]'::jsonb) into candidate_payload from ranked;
    if jsonb_array_length(candidate_payload)=0 then unfilled:=unfilled||jsonb_build_array(jsonb_build_object('shift_id',open_shift.id,'reason','No eligible employee'));
    else
      recommended:=(candidate_payload->0->>'employee_id')::uuid;
      proposals:=proposals||jsonb_build_array(jsonb_build_object('shift_id',open_shift.id,'location_name',open_shift.location_name,'job_name',open_shift.job_name,
        'scheduled_date',open_shift.scheduled_date,'time_basis',open_shift.time_basis,'time_snapshot',open_shift.time_snapshot,'time_timezone',open_shift.time_timezone,'start_time',to_char(open_shift.start_time,'HH24:MI'),'end_time',to_char(open_shift.end_time,'HH24:MI'),
        'recommended_employee_id',recommended,'candidates',candidate_payload));
    end if;
  end loop;
  unsigned:=jsonb_build_object('workspace_id',target_workspace_id,'session_id',target_session.id,'session_revision',target_session.revision,'proposals',proposals,'unfilled',unfilled);
  return unsigned||jsonb_build_object('status','review_ready','fingerprint',encode(extensions.digest(convert_to(unsigned::text,'UTF8'),'sha256'),'hex'));
end; $function$;

CREATE OR REPLACE FUNCTION public.shift_exchange_preview(actor uuid, w uuid, cid uuid, aid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.shift_exchange_cases%rowtype; a public.shift_exchange_applications%rowtype;
 s jsonb; t jsonb; r jsonb; g jsonb; problems text[]:='{}'; loc uuid; scoped boolean:=false; missing boolean:=false; fp text; reconciliation_issue text;
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
 -- Final approval invokes this same preview again inside its workspace lock.
 reconciliation_issue:=public.shift_exchange_lineup_reconciliation_issue(w,s);
 if reconciliation_issue is not null then problems:=array_append(problems,reconciliation_issue); end if;
 if c.kind='swap' then
  reconciliation_issue:=public.shift_exchange_lineup_reconciliation_issue(w,t);
  if reconciliation_issue is not null and not reconciliation_issue=any(problems) then
   problems:=array_append(problems,reconciliation_issue);
  end if;
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

CREATE OR REPLACE FUNCTION public.shift_exchanges_command_service(actor uuid, w uuid, command jsonb, idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare emp public.employee_profiles%rowtype; c public.shift_exchange_cases%rowtype; a public.shift_exchange_applications%rowtype;
 old_cmd public.shift_exchange_commands%rowtype; s jsonb; t jsonb; checked jsonb; result jsonb; fp text;
 action text:=command->>'action'; cid uuid:=(command->>'case_id')::uuid; aid uuid:=(command->>'application_id')::uuid;
 candidate uuid; loc uuid; other record; expires timestamptz; owns boolean; manager boolean;
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
    if public.weekly_exchange_candidate_check(w,emp.id,t,array[(s->>'id')::uuid,(t->>'id')::uuid])->>'status'<>'eligible' then raise exception 'You are not eligible for the teammate shift'; end if;
   else candidate:=(command->>'employee_id')::uuid; end if;
   if candidate=emp.id then raise exception 'Choose a different teammate'; end if;
   if candidate is not null and public.weekly_exchange_candidate_check(w,candidate,s,array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null))->>'status'<>'eligible' then raise exception 'This teammate is not eligible for the full shift'; end if;
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
   insert into public.shift_exchange_cases(workspace_id,kind,audience,offered_source_id,requested_source_id,owner_id,offered_snapshot,requested_snapshot,consent_fingerprint,expires_at,private_note,created_by)
   values(w,command->>'kind',case when candidate is null then 'eligible_pool' else 'direct' end,(s->>'source_id')::uuid,(t->>'source_id')::uuid,emp.id,s,t,fp,expires,coalesce(command->>'note',''),actor) returning * into c;
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
   if public.weekly_exchange_candidate_check(w,emp.id,s)->>'status'<>'eligible' then raise exception 'You are not eligible for the full shift'; end if;
   cid:=c.id;
   if exists(select 1 from public.shift_exchange_applications where case_id=cid and employee_id=emp.id and status='pending_manager') then raise exception 'You already have an active application'; end if;
   insert into public.shift_exchange_applications(workspace_id,case_id,employee_id,status,consent_fingerprint) values(w,cid,emp.id,'pending_manager',c.consent_fingerprint) returning id into aid;
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
     if public.weekly_exchange_candidate_check(w,emp.id,s,array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null))->>'status'<>'eligible'
      or (c.kind='swap' and public.weekly_exchange_candidate_check(w,c.owner_id,t,array[(s->>'id')::uuid,(t->>'id')::uuid])->>'status'<>'eligible') then raise exception 'Both employees must be eligible for the full exchange'; end if;
    end if;
    update public.shift_exchange_applications set status=case action when 'accept' then 'pending_manager' when 'decline' then 'declined_by_employee' else 'withdrawn' end,updated_at=now() where id=aid;
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
   update public.shift_exchange_cases set revision=revision+1,updated_at=now() where id=cid returning * into c;
  end if;
 end if;
 perform realtime.send(jsonb_build_object('workspace_id',w,'case_id',cid,'revision',c.revision),'changed','shift-exchanges:'||w::text,false);
 result:=jsonb_build_object('case_id',cid,'status',c.status,'revision',c.revision);
 insert into public.shift_exchange_commands(workspace_id,actor_user_id,idempotency_key,command,result) values(w,actor,idempotency_key,command,result);
 return result;
end; $function$;

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
 select lower(r),upper(r) into starts,ends from (select public.lineup_shift_range((target->>'date')::date,(target->>'start_time')::time,(target->>'end_time')::time,coalesce(nullif(target->>'time_timezone',''),nullif(target->'time_snapshot'->>'timezone',''),l.timezone)) r from public.locations l where l.id=(target->>'location_id')::uuid and l.workspace_id=w) q;
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
  span:=public.lineup_shift_range(coalesce(commitment.target->>'date',commitment.target->>'scheduled_date')::date,
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

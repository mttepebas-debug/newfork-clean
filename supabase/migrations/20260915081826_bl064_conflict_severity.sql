-- BL-064 extends the existing assessment; the same interval and fingerprint
-- contract remains authoritative for edit, paste and publication consumers.
alter table public.workspace_scheduling_settings
 add column conflict_rules jsonb not null default '{"availability":"confirm","approved_time_off":"block","closed_location":"confirm","minimum_travel":"confirm","minimum_rest":"confirm"}',
 add column conflict_rules_revision integer not null default 1 check(conflict_rules_revision>0),
 add column minimum_rest_minutes integer not null default 0 check(minimum_rest_minutes between 0 and 1440),
 add constraint scheduling_conflict_rules_valid check (
  jsonb_typeof(conflict_rules)='object'
  and conflict_rules ?& array['availability','approved_time_off','closed_location','minimum_travel','minimum_rest']
  and conflict_rules-array['availability','approved_time_off','closed_location','minimum_travel','minimum_rest']='{}'::jsonb
  and conflict_rules->>'availability' in ('allow','warn','confirm','block')
  and conflict_rules->>'approved_time_off' in ('confirm','block')
  and conflict_rules->>'closed_location' in ('warn','confirm','block')
  and conflict_rules->>'minimum_travel' in ('warn','confirm','block')
  and conflict_rules->>'minimum_rest' in ('warn','confirm','block')
 );
-- Preserve existing availability choices. New workspaces use confirmation.
update public.workspace_scheduling_settings set conflict_rules=jsonb_set(conflict_rules,'{availability}',to_jsonb(availability_warning_policy));
alter table public.workspace_scheduling_settings alter column availability_warning_policy set default 'confirm';

-- Compatibility for the existing weekly-preference command until all consumers
-- use the conflict catalog. One stored policy remains authoritative.
create function public.sync_schedule_conflict_rules() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then
  if new.availability_warning_policy='warn' then new.conflict_rules:=jsonb_set(new.conflict_rules,'{availability}','"warn"'); end if;
 elsif new.conflict_rules is distinct from old.conflict_rules then
  new.availability_warning_policy:=case when new.conflict_rules->>'availability'='confirm' then 'confirm' else 'warn' end;
 elsif new.availability_warning_policy is distinct from old.availability_warning_policy then
  new.conflict_rules:=jsonb_set(new.conflict_rules,'{availability}',to_jsonb(new.availability_warning_policy));
 end if;
 if tg_op='UPDATE' then
  new.conflict_rules_revision:=old.conflict_rules_revision+case when (new.conflict_rules,new.minimum_travel_minutes,new.minimum_rest_minutes)
   is distinct from (old.conflict_rules,old.minimum_travel_minutes,old.minimum_rest_minutes) then 1 else 0 end;
 end if;
 if exists(select 1 from jsonb_each(new.conflict_rules) rule where jsonb_typeof(rule.value)<>'string') then
  raise exception 'Conflict rules must contain valid actions' using errcode='22023';
 end if;
 return new;
end;
$$;
revoke all on function public.sync_schedule_conflict_rules() from public,anon,authenticated,service_role;
create trigger schedule_conflict_rules_sync before insert or update on public.workspace_scheduling_settings
 for each row execute function public.sync_schedule_conflict_rules();

-- Staged canonical evaluator. Schedule consumers switch together with the UI,
-- confirmation adapters and published-responsibility handling in a later step.
create or replace function public.assess_weekly_shift_availability(w uuid,emp uuid,shift jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare loc uuid:=(shift->>'location_id')::uuid; day date:=coalesce(shift->>'scheduled_date',shift->>'date')::date;
 zone_name text; preference_zone text; basis text:=coalesce(shift->>'time_basis','explicit'); start_clock time; end_clock time;
 local_start timestamp; local_end timestamp; start_at timestamptz; end_at timestamptz; span tstzrange; day_span tstzrange;
 capacity jsonb; remaining tstzmultirange; unavailable tstzmultirange:='{}'; leave_ranges tstzmultirange:='{}';
 leave_evidence jsonb:='[]'; reasons jsonb:='[]'; settings public.workspace_scheduling_settings%rowtype;
 leave_row record; leave_span tstzrange; coverage text; operation text; fingerprint_payload jsonb;
 conflict_severity text; rule_severity text; rule jsonb; annotated jsonb:='[]';
 neighbor record; neighbor_span tstzrange; gap_minutes numeric; schedule_week date;
 edit_id uuid:=nullif(shift->>'session_id','')::uuid; context_draft_id uuid:=nullif(shift->>'draft_id','')::uuid;
 exclude_id uuid:=coalesce(nullif(shift->>'_exclude_shift_id',''),shift->>'source_shift_id',shift->>'id')::uuid;
 missing_time boolean; invalid_clock boolean:=false; ambiguous_clock boolean:=false;
begin
 select l.timezone,coalesce(nullif(shift->>'time_timezone',''),nullif(shift->'time_snapshot'->>'timezone',''),l.timezone)
  into preference_zone,zone_name from public.locations l where l.workspace_id=w and l.id=loc;
 if day is null or not isfinite(day) or zone_name is null or preference_zone is null
  or not exists(select 1 from pg_timezone_names where name=zone_name)
  or not exists(select 1 from pg_timezone_names where name=preference_zone) then
  raise exception 'A valid location, date and timezone are required for availability assessment' using errcode='22023'; end if;
 select * into settings from public.workspace_scheduling_settings where workspace_id=w;
 if settings.workspace_id is null then raise exception 'Scheduling settings unavailable' using errcode='P0002'; end if;
 if basis not in ('explicit','type_default','unresolved','legacy_unverified') then
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
 missing_time:=start_clock is null or end_clock is null or start_clock=end_clock or basis in ('unresolved','legacy_unverified');
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
 select week_start into schedule_week from public.schedule_edit_sessions where workspace_id=w and id=edit_id;
 if schedule_week is null then select week_start into schedule_week from public.schedule_drafts where workspace_id=w and id=context_draft_id; end if;
 if span is not null and emp is not null and shift ? 'job_id' then
  for neighbor in
   select s.id,s.location_id,s.scheduled_date,s.start_time,s.end_time,s.time_basis,coalesce(s.time_timezone,l.timezone) zone
    from public.schedule_edit_session_shifts s join public.locations l on l.id=s.location_id and l.workspace_id=w
    where s.workspace_id=w and s.session_id=edit_id and s.employee_id=emp and s.pending_op_type is distinct from 'delete'
     and s.id is distinct from exclude_id and s.scheduled_date between day-2 and day+2
   union all
   select s.id,s.location_id,s.scheduled_date,s.start_time,s.end_time,s.time_basis,coalesce(s.time_timezone,l.timezone)
    from public.schedule_draft_shifts s join public.locations l on l.id=s.location_id and l.workspace_id=w
    where edit_id is null and s.workspace_id=w and s.draft_id=context_draft_id and s.employee_id=emp
     and s.id is distinct from exclude_id and s.scheduled_date between day-2 and day+2
   union all
   select s.id,s.location_id,s.scheduled_date,s.start_time,s.end_time,s.time_basis,coalesce(s.time_timezone,l.timezone)
    from public.schedule_published_shifts s join public.schedule_location_publications p on p.id=s.publication_id and p.status='current'
    join public.locations l on l.id=s.location_id and l.workspace_id=w
    where s.workspace_id=w and s.employee_id=emp and s.id is distinct from exclude_id and s.source_shift_id is distinct from exclude_id
     and s.scheduled_date between day-2 and day+2
     and (schedule_week is null or s.scheduled_date not between schedule_week and schedule_week+6)
   order by 1
  loop
   if neighbor.time_basis not in ('explicit','type_default') or neighbor.start_time is null or neighbor.end_time is null then
    reasons:=reasons||jsonb_build_array(jsonb_build_object('code','neighbor_time_unresolved','message','Another assignment has unresolved hours. Confirm the schedule.','definite',false));
    continue;
   end if;
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
 conflict_severity:='allow';
 for rule in select value from jsonb_array_elements(reasons) loop
  rule_severity:=case rule->>'code'
   when 'availability' then settings.conflict_rules->>'availability'
   when 'approved_time_off' then settings.conflict_rules->>'approved_time_off'
   when 'closed_location' then settings.conflict_rules->>'closed_location'
   when 'minimum_travel' then settings.conflict_rules->>'minimum_travel'
   when 'minimum_rest' then settings.conflict_rules->>'minimum_rest'
   when 'time_source_unresolved' then 'confirm'
   when 'neighbor_time_unresolved' then 'confirm'
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
end; $$;
revoke all on function public.assess_weekly_shift_availability(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

-- Preserve the existing command stack, lease checks, document adapter and audit.
do $patch$
declare body text;
begin
 body:=pg_get_functiondef('public.prepare_weekly_schedule_assignment(uuid,uuid,jsonb,jsonb)'::regprocedure);
 body:=replace(body,'if public.schedule_availability_prior_publication(w,s) is not null then return; end if;','');
 body:=replace(body,$old$if emp is null then
  update public.schedule_availability_overrides set revoked_at=now() where workspace_id=w and shift_id=logical_id and revoked_at is null;
  return;
 end if;$old$,'');
 body:=replace(body,$old$a:=public.assess_weekly_shift_availability(w,emp,s);$old$,
  $new$s:=s||jsonb_build_object('_exclude_shift_id',logical_id);
 a:=public.assess_weekly_shift_availability(w,emp,s);$new$);
 body:=replace(body,$old$raise exception 'Resolve shift hours or approved time off before saving' using errcode='23514',detail=a::text;$old$,
  $new$raise exception '%',coalesce((select string_agg(r->>'message',' ') from jsonb_array_elements(a->'reasons') r where r->>'severity'='block'),'Scheduling rules block this assignment') using errcode='23514',detail=a::text;$new$);
 body:=replace(body,'evidence:=public.schedule_availability_override(w,s,a);',
  $new$if emp is null then
   if a->>'operation'='warning_requires_override' and s->>'availability_assessment_fingerprint' is distinct from
    public.assess_weekly_shift_availability(w,emp,s-'id'-'source_shift_id')->>'fingerprint' then
    raise exception 'Review the current availability assessment before saving' using errcode='PT409';
   end if;
   if a->>'operation'='warning_requires_override' then
    insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata)
    values(w,actor,'schedule.conflict_accepted','shift',logical_id::text,jsonb_build_object('assessment',a));
   end if;
   return;
  end if;
  evidence:=public.schedule_availability_override(w,s,a);$new$);
 body:=replace(body,'Availability conflict confirmed by manager.','Schedule conflict confirmed by manager.');
 body:=replace(body,'Availability warning acknowledged (warn policy).','Schedule warning acknowledged (warn policy).');
 execute body;

 body:=pg_get_functiondef('public.assess_weekly_schedule_assignment_service(uuid,uuid,jsonb,uuid,uuid)'::regprocedure);
 body:=replace(body,'if not exists(select 1 from public.employee_location_assignments',
  $new$if nullif(shift->>'employee_id','') is not null and not exists(select 1 from public.employee_location_assignments$new$);
 body:=replace(body,$old$normalized:=public.normalize_schedule_time_source(w,shift,previous)-'id'-'source_shift_id';$old$,
  $new$normalized:=(public.normalize_schedule_time_source(w,shift,previous)-'id'-'source_shift_id')
   ||jsonb_build_object('session_id',target_session_id,'_exclude_shift_id',target_shift_id);$new$);
 body:=replace(body,$old$if target_shift_id is not null and public.schedule_availability_prior_publication(w,identified) is not null then$old$,
  $new$if target_shift_id is not null and a->>'conflict_severity'<>'block' and public.schedule_availability_prior_publication(w,identified) is not null then$new$);
 execute body;

 body:=pg_get_functiondef('public.mutate_schedule_edit_shift_service_base(uuid,uuid,uuid,integer,text,uuid,integer,jsonb,uuid)'::regprocedure);
 if position($anchor$shift_payload||jsonb_build_object('id',target_shift_id)$anchor$ in body)=0 then raise exception 'Mutation preparation context changed'; end if;
 body:=replace(body,$old$shift_payload||jsonb_build_object('id',target_shift_id)$old$,
  $new$shift_payload||jsonb_build_object('id',target_shift_id,'session_id',target_session_id)$new$);
 execute body;

 body:=pg_get_functiondef('public.get_schedule_read_model_service(uuid,uuid,date)'::regprocedure);
 if position('return jsonb_set(base' in body)=0 then raise exception 'Schedule read model return changed'; end if;
 body:=replace(body,'return jsonb_set(base', $new$base:=jsonb_set(base,'{settings}',coalesce(base->'settings','{}')||
   (select jsonb_build_object('conflict_rules',conflict_rules,'minimum_travel_minutes',minimum_travel_minutes,'minimum_rest_minutes',minimum_rest_minutes)
    from public.workspace_scheduling_settings where workspace_id=target_workspace_id));
  return jsonb_set(base$new$);
 execute body;
end;
$patch$;

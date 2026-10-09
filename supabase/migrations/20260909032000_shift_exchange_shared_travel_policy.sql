-- CLI generated; ordered after the existing forward migrations.
-- Existing availability input trigger already serializes settings with staffing
-- via workspace lock 921 and rejects unsafe row-first races with PT409.
alter table public.workspace_scheduling_settings
  add column minimum_travel_minutes integer not null default 0
  check (minimum_travel_minutes between 0 and 240);

create function public.lineup_effective_travel_minutes(w uuid, requested integer default 0)
returns integer language sql stable security definer set search_path='' as $$
 select greatest(coalesce(requested,0),coalesce((select minimum_travel_minutes
 from public.workspace_scheduling_settings where workspace_id=w),0));
$$;
revoke all on function public.lineup_effective_travel_minutes(uuid,integer) from public,anon,authenticated,service_role;

create function public.update_scheduling_settings_service(actor_user_id uuid,target_workspace_id uuid,settings jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous public.workspace_scheduling_settings; proposed public.workspace_scheduling_settings; saved public.workspace_scheduling_settings;
begin
 if not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'workspace.manage') then
  raise exception 'Scheduling settings access denied' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,921));
 select * into previous from public.workspace_scheduling_settings where workspace_id=target_workspace_id for update;
 if not found then raise exception 'Scheduling settings not found'; end if;
 -- Populate from the saved row: omitted optional fields never reset existing policy.
 select * into proposed from jsonb_populate_record(previous,settings);
 update public.workspace_scheduling_settings set
  week_start_day=proposed.week_start_day,schedule_deadline_day=proposed.schedule_deadline_day,
  conflict_policy=proposed.conflict_policy,availability_enforcement=proposed.availability_enforcement,
  time_format=proposed.time_format,availability_ownership=proposed.availability_ownership,
  availability_approval=proposed.availability_approval,availability_initial_review=proposed.availability_initial_review,
  availability_notice_days=proposed.availability_notice_days,minimum_travel_minutes=proposed.minimum_travel_minutes,
  updated_at=now()
 where workspace_id=target_workspace_id returning * into saved;
 -- Service-role requests have no auth.uid(); retain the authenticated API actor.
 if auth.uid() is null and (to_jsonb(previous)-'updated_at') is distinct from (to_jsonb(saved)-'updated_at') then
  insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata)
  values(target_workspace_id,actor_user_id,'scheduling.settings_updated','scheduling_settings',target_workspace_id::text,
   jsonb_build_object('before',to_jsonb(previous),'after',to_jsonb(saved)));
 end if;
 return to_jsonb(saved);
end; $$;
revoke all on function public.update_scheduling_settings_service(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.update_scheduling_settings_service(uuid,uuid,jsonb) to service_role;


CREATE OR REPLACE FUNCTION public.audit_scheduling_settings_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if row(
    new.week_start_day,
    new.schedule_deadline_day,
    new.conflict_policy,
    new.availability_enforcement,
    new.time_format,
    new.minimum_travel_minutes
  ) is distinct from row(
    old.week_start_day,
    old.schedule_deadline_day,
    old.conflict_policy,
    old.availability_enforcement,
    old.time_format,
    old.minimum_travel_minutes
  ) and (select auth.uid()) is not null then
    insert into public.audit_events (
      workspace_id,
      actor_user_id,
      action,
      target_type,
      target_id,
      metadata
    ) values (
      new.workspace_id,
      (select auth.uid()),
      'scheduling.settings_updated',
      'scheduling_settings',
      new.workspace_id::text,
      jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new))
    );
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.lineup_candidate_check_exchange_base(w uuid, emp uuid, target jsonb, excluded uuid[] DEFAULT '{}'::uuid[], travel_minutes integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare loc uuid:=(target->>'location_id')::uuid; job uuid:=(target->>'job_id')::uuid;
  d date:=(target->>'date')::date; tz text; span tstzrange; assessment jsonb;
  available tstzmultirange; overlap tstzmultirange; free tstzmultirange; reasons text[]:=array[]::text[]; state text:='eligible';
begin
  travel_minutes:=public.lineup_effective_travel_minutes(w,travel_minutes);
  select coalesce(nullif(target->>'time_timezone',''),timezone) into tz from public.locations where id=loc and workspace_id=w and archived_at is null;
  if tz is null then raise exception 'location not found'; end if;
  span:=public.lineup_shift_range(d,(target->>'start_time')::time,(target->>'end_time')::time,tz);
  if public.lineup_section_restriction(w,(target->>'section_id')::uuid,loc,(target->>'shift_type_id')::uuid,job) is not null then reasons:=array_append(reasons,public.lineup_section_restriction(w,(target->>'section_id')::uuid,loc,(target->>'shift_type_id')::uuid,job)); end if;
  if not exists(select 1 from public.employee_profiles p where p.id=emp and p.workspace_id=w and p.archived_at is null and not p.is_excluded_from_schedule
    and (p.start_date is null or p.start_date<=d)) then reasons:=array_append(reasons,'Employee is not active in Schedule'); end if;
  if not exists(select 1 from public.employee_location_assignments where employee_id=emp and workspace_id=w and location_id=loc and assigned_at<=lower(span) and (ended_at is null or ended_at>=upper(span))) then reasons:=array_append(reasons,'Not assigned to this location'); end if;
  if not exists(select 1 from public.employee_job_assignments where employee_id=emp and workspace_id=w and job_id=job and assigned_at<=lower(span) and (ended_at is null or ended_at>=upper(span))) then reasons:=array_append(reasons,'Not eligible for this position'); end if;
  if exists(select 1 from public.schedule_closures c where c.workspace_id=w and c.location_id=loc and c.closed_date=d and (c.is_all_day or (target->>'shift_type_id')::uuid=any(c.shift_type_ids))) then reasons:=array_append(reasons,'Location or service is closed'); end if;
  if public.employee_has_hard_document_schedule_conflict_service(w,emp,d) then reasons:=array_append(reasons,'Required document is expired'); end if;

  if exists(select 1 from public.employee_profiles where workspace_id=w and id=emp) then
    -- The Line Up descriptor contract uses date. A copied Schedule descriptor
    -- can still contain scheduled_date from before a preview date edit.
    assessment:=public.assess_shift_availability(w,emp,target||jsonb_build_object('scheduled_date',d));
    select coalesce(range_agg(tstzrange((r->>'start_at')::timestamptz,(r->>'end_at')::timestamptz,'[)')),'{}'::tstzmultirange)
      into free from jsonb_array_elements(assessment->'available_intervals') r;
    state:=case
      when exists(select 1 from jsonb_array_elements(assessment->'reasons') r where r->>'code' in ('approved_time_off','invalid_local_time')) then 'ineligible'
      when assessment->>'coverage'='none' then 'ineligible'
      when assessment->>'operation'='verification_required' or assessment->>'coverage'='unknown' then 'verification_required'
      when assessment->>'coverage'='partial' then 'partial'
      else 'eligible' end;
    reasons:=reasons||array(select r->>'message' from jsonb_array_elements(assessment->'reasons') r);
  end if;
  select coalesce(range_agg(r),'{}'::tstzmultirange) into overlap from (
    select public.lineup_shift_range(s.scheduled_date,s.start_time,s.end_time,coalesce(s.time_timezone,l.timezone)) r
    from public.schedule_published_shifts s join public.schedule_location_publications p on p.id=s.publication_id and p.status='current'
    join public.locations l on l.id=s.location_id
    where s.workspace_id=w and s.employee_id=emp and not s.id=any(excluded)
      and s.scheduled_date between d-2 and d+2
    union all
    select public.lineup_shift_range(ln.lineup_date,e.start_time,e.end_time,l.timezone)
    from public.schedule_lineup_entries e join public.schedule_lineups ln on ln.id=e.lineup_id join public.locations l on l.id=e.location_id
    where e.workspace_id=w and e.employee_id=emp and e.source_shift_id is null and not e.hidden and not e.call_off and not e.id=any(excluded) and e.start_time is not null and ln.lineup_date between d-2 and d+2

  ) busy where r && span;
  if overlap && span then state:='ineligible'; reasons:=array_append(reasons,'Overlaps a published shift, daily assignment or approved time off'); end if;
  if travel_minutes>0 and exists(select 1 from (
    select public.lineup_shift_range(s.scheduled_date,s.start_time,s.end_time,coalesce(s.time_timezone,l.timezone)) r
    from public.schedule_published_shifts s
    join public.schedule_location_publications p on p.id=s.publication_id and p.status='current'
    join public.locations l on l.id=s.location_id
    where s.workspace_id=w and s.employee_id=emp and s.location_id<>loc
      and not s.id=any(excluded) and s.scheduled_date between d-2 and d+2
    union all
    select public.lineup_shift_range(ln.lineup_date,e.start_time,e.end_time,l.timezone)
    from public.schedule_lineup_entries e join public.schedule_lineups ln on ln.id=e.lineup_id
    join public.locations l on l.id=e.location_id
    where e.workspace_id=w and e.employee_id=emp and e.location_id<>loc
      and e.source_shift_id is null and not e.hidden and not e.call_off and not e.id=any(excluded)
      and e.start_time is not null and ln.lineup_date between d-2 and d+2
   ) busy where tstzrange(lower(r)-make_interval(mins=>travel_minutes),upper(r)+make_interval(mins=>travel_minutes),'[)') && span) then
    state:='ineligible';reasons:=array_append(reasons,format('At least %s minutes are required between locations',travel_minutes));
  end if;
  if cardinality(reasons)>0 and state='eligible' then state:='ineligible'; end if;
  if exists(select 1 from unnest(reasons) r where r in('Employee is not active in Schedule','Not assigned to this location','Not eligible for this position','Required document is expired','Location or service is closed')) then state:='ineligible'; end if;
  if cardinality(reasons)=0 then reasons:=array['Position and location match','Available for the full interval','No conflicts']; end if;
  return jsonb_build_object('employee_id',emp,'status',state,'reasons',to_jsonb(reasons),
    'available_start',case when free is not null and not isempty(free) then (select lower(r)::text from unnest(free) r order by lower(r) limit 1) end,
    'available_end',case when free is not null and not isempty(free) then (select upper(r)::text from unnest(free) r order by lower(r) limit 1) end);
end; $function$;


CREATE OR REPLACE FUNCTION public.lineup_operation_preview(actor uuid, w uuid, op jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$

declare target jsonb:=op->'target'; d date:=(target->>'date')::date; destination uuid:=(target->>'location_id')::uuid;

  model jsonb; src jsonb; src_loc jsonb; other jsonb; other_loc jsonb; check1 jsonb; check2 jsonb; other_target jsonb;

  blocked text[]:=array[]::text[]; effects text[]:=array[]::text[]; exclude_ids uuid[]:=array[]::uuid[]; candidate uuid;

  span tstzrange; original tstzrange; fingerprint text; needs_approval boolean:=false; source_actor uuid:=actor;

begin
  -- Keep release unchanged. All assignment checks and move/swap residuals use
  -- the same effective value; the original command remains the idempotency input.
  if op->>'kind'<>'release' then
    op:=op||jsonb_build_object('travel_minutes',public.lineup_effective_travel_minutes(w,(op->>'travel_minutes')::integer));
  end if;

  model:=public.lineup_operation_model(actor,w,d,op);

  if not coalesce((select lineup_operations_enabled from public.locations where id=destination and workspace_id=w),false) then blocked:=array_append(blocked,'Line Up is read-only at the destination'); end if;

  if op->>'_proposal_id' is not null then select created_by into source_actor from public.lineup_proposals where id=(op->>'_proposal_id')::uuid; end if;

  if not public.schedule_actor_can_publish_service(case when op->>'_proposal_id' is not null and op->>'kind'='swap' then source_actor else actor end,w,destination) or not public.schedule_actor_has_capability_service(case when op->>'_proposal_id' is not null and op->>'kind'='swap' then source_actor else actor end,w,'schedule.lineup.manage',destination) then

    if op->>'kind' in ('move','swap') and op->>'_proposal_id' is null then needs_approval:=true; else raise exception 'Schedule publish and Line Up manage access denied'; end if;

  end if;

  if (target->>'start_time')::time=(target->>'end_time')::time then raise exception 'Start and end must differ'; end if;

  if not exists(select 1 from public.schedule_location_publications where workspace_id=w and location_id=destination and status='current' and d between week_start and week_start+6) then blocked:=array_append(blocked,'Publish the destination Schedule week before assigning staff'); end if;

  if op->>'kind' not in ('assign','replace','move','swap','release') or char_length(btrim(op->>'reason')) not between 1 and 500 then raise exception 'Valid operation and reason required'; end if;

  if not exists(select 1 from public.jobs where id=(target->>'job_id')::uuid and workspace_id=w and archived_at is null) or not exists(select 1 from public.shift_types where id=(target->>'shift_type_id')::uuid and workspace_id=w and archived_at is null) then raise exception 'Position or service not found'; end if;

  if public.lineup_section_restriction(w,(target->>'section_id')::uuid,destination,(target->>'shift_type_id')::uuid,(target->>'job_id')::uuid) is not null then blocked:=array_append(blocked,public.lineup_section_restriction(w,(target->>'section_id')::uuid,destination,(target->>'shift_type_id')::uuid,(target->>'job_id')::uuid)); end if;

  if coalesce((select p.closed from public.lineup_section_plans p where p.workspace_id=w and p.location_id=destination and p.date=d and p.section_id=(target->>'section_id')::uuid and (p.shift_type_id is null or p.shift_type_id=(target->>'shift_type_id')::uuid) order by p.shift_type_id nulls last limit 1),false) then blocked:=array_append(blocked,'This section is closed for the selected service'); end if;

  if target->>'section_id' is not null and not exists(select 1 from public.schedule_lineup_sections where id=(target->>'section_id')::uuid and workspace_id=w and archived_at is null) then raise exception 'Section not found'; end if;

  select l,e into src_loc,src from jsonb_array_elements(model->'locations') l cross join lateral jsonb_array_elements(l->'entries') e where e->>'id'=op->>'source_entry_id';

  if op->>'source_entry_id' is not null and (src is null or (src->>'orphaned')::boolean or (src->>'hidden')::boolean) then blocked:=array_append(blocked,'Source assignment changed or was removed'); end if;

  if src is not null then

    if not (select lineup_operations_enabled from public.locations where id=(src_loc->>'id')::uuid and workspace_id=w) then blocked:=array_append(blocked,'Line Up is read-only at the source'); end if;

    if coalesce((src->>'source_changed')::boolean,false) then blocked:=array_append(blocked,'Review the updated Schedule assignment before changing staffing'); end if;

    if not public.schedule_actor_can_publish_service(source_actor,w,(src_loc->>'id')::uuid) or not public.schedule_actor_has_capability_service(source_actor,w,'schedule.lineup.manage',(src_loc->>'id')::uuid) then raise exception 'Source Schedule publish access denied'; end if;

    exclude_ids:=array_append(exclude_ids,coalesce((src->>'source_shift_id')::uuid,(src->>'id')::uuid));

    original:=public.lineup_shift_range(coalesce(public.lineup_entry_day(w,(src->>'id')::uuid),d),(src->>'start_time')::time,(src->>'end_time')::time,src_loc->>'timezone');

    span:=public.lineup_shift_range(d,(target->>'start_time')::time,(target->>'end_time')::time,(select timezone from public.locations where id=destination));

    if not original @> span then blocked:=array_append(blocked,'The changed interval must fit within the original shift'); end if;

    if original @> span and not public.lineup_split_has_publications(w,(src_loc->>'id')::uuid,original,span,case when op->>'kind' in('move','swap') then coalesce((op->>'travel_minutes')::integer,0) else 0 end) then blocked:=array_append(blocked,'Publish the affected next Schedule week before splitting this overnight assignment'); end if;

    if op->>'kind' in ('move','swap') and src->>'employee_id' is null then blocked:=array_append(blocked,'Choose an assigned employee'); end if;

    if op->>'kind' in ('move','swap') and src->>'source_shift_id' is null then blocked:=array_append(blocked,'Legacy manual assignment requires Schedule reconciliation first'); end if;

    if op->>'kind'='move' and destination=(src_loc->>'id')::uuid then blocked:=array_append(blocked,'Choose another destination location'); end if;

    if op->>'kind' in ('replace','assign') and destination<>(src_loc->>'id')::uuid then blocked:=array_append(blocked,'Replacement stays in the source location'); end if;

    if lower(span)<now() and (span<>original or op->>'kind' in ('move','swap','replace','release')) then blocked:=array_append(blocked,'Past working time cannot be transferred; select a future handover interval'); end if;

  elsif op->>'kind'<>'assign' then blocked:=array_append(blocked,'A source assignment is required'); end if;

  if op->>'kind'='move' and op->>'target_entry_id' is not null then

    select l,e into other_loc,other from jsonb_array_elements(model->'locations') l cross join lateral jsonb_array_elements(l->'entries') e where e->>'id'=op->>'target_entry_id';

    if other is null or other_loc->>'id'<>target->>'location_id' or (other->>'hidden')::boolean or (other->>'orphaned')::boolean or coalesce((other->>'source_changed')::boolean,false) or (other->>'employee_id' is not null and not (other->>'call_off')::boolean and not coalesce((op->>'replace_target')::boolean,false)) then blocked:=array_append(blocked,'The destination coverage need is no longer open');

    elsif other->>'employee_id' is not null and other->>'source_shift_id' is null then blocked:=array_append(blocked,'Reconcile the legacy destination assignment in Schedule first');

    elsif other->>'job_id'<>target->>'job_id' or other->>'shift_type_id'<>target->>'shift_type_id' then blocked:=array_append(blocked,'Choose the position and service of the destination coverage need');

    elsif not public.lineup_shift_range(coalesce(public.lineup_entry_day(w,(other->>'id')::uuid),d),(other->>'start_time')::time,(other->>'end_time')::time,other_loc->>'timezone') @> span then blocked:=array_append(blocked,'The moved interval must fit inside the destination coverage need');

    else effects:=array_append(effects,case when other->>'employee_id' is not null and not (other->>'call_off')::boolean then 'Replaces '||(other->>'employee_name')||' at '||(other_loc->>'name')||' for the selected interval. Their unchanged hours are preserved.' else 'Fills the existing open need at '||(other_loc->>'name')||'. Its uncovered intervals remain open.' end); end if;

  end if;

  if op->>'kind'='swap' then

    select l,e into other_loc,other from jsonb_array_elements(model->'locations') l cross join lateral jsonb_array_elements(l->'entries') e where e->>'id'=op->>'target_entry_id';

    if op->>'target_entry_id' is null and destination<>(src_loc->>'id')::uuid then

      needs_approval:=true;effects:=array_append(effects,'The destination manager will choose the swap counterpart. Both employees must qualify before any assignment changes.');

    elsif other is null or other->>'employee_id' is null or other->>'source_shift_id' is null or (other->>'orphaned')::boolean or (other->>'hidden')::boolean or (other->>'call_off')::boolean then blocked:=array_append(blocked,'The other assignment is no longer available');

    elsif other_loc->>'id'=src_loc->>'id' or other->>'employee_id'=src->>'employee_id' then blocked:=array_append(blocked,'Choose a different employee at another location');

    else

      if not public.schedule_actor_can_publish_service(actor,w,(other_loc->>'id')::uuid) or not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',(other_loc->>'id')::uuid) then raise exception 'Both locations require Schedule publish and Line Up manage access'; end if;

      if destination<>(src_loc->>'id')::uuid then blocked:=array_append(blocked,'Choose the swap interval in the source location timezone'); end if;

      if not (select lineup_operations_enabled from public.locations where id=(other_loc->>'id')::uuid and workspace_id=w) then blocked:=array_append(blocked,'Line Up is read-only at the counterpart location'); end if;

      exclude_ids:=array_append(exclude_ids,(other->>'source_shift_id')::uuid);

      other_target:=jsonb_build_object('date',(lower(span) at time zone (other_loc->>'timezone'))::date,'location_id',other_loc->'id','job_id',other->'job_id','shift_type_id',other->'shift_type_id','start_time',to_char(lower(span) at time zone (other_loc->>'timezone'),'HH24:MI'),'end_time',to_char(upper(span) at time zone (other_loc->>'timezone'),'HH24:MI'));

      if not public.lineup_shift_range(coalesce(public.lineup_entry_day(w,(other->>'id')::uuid),d),(other->>'start_time')::time,(other->>'end_time')::time,other_loc->>'timezone') @> span then blocked:=array_append(blocked,'The swap interval must fit inside both assignments'); end if;

      if not public.lineup_split_has_publications(w,(other_loc->>'id')::uuid,public.lineup_shift_range(coalesce(public.lineup_entry_day(w,(other->>'id')::uuid),d),(other->>'start_time')::time,(other->>'end_time')::time,other_loc->>'timezone'),span,coalesce((op->>'travel_minutes')::integer,0)) then blocked:=array_append(blocked,'Publish the counterpart Schedule week before splitting this overnight assignment'); end if;

      check2:=public.lineup_candidate_check(w,(src->>'employee_id')::uuid,other_target,exclude_ids,(op->>'travel_minutes')::integer);

      if check2->>'status'<>'eligible' then blocked:=blocked||array(select jsonb_array_elements_text(check2->'reasons')); end if;



      effects:=array_append(effects,(src->>'employee_name')||' → '||(other_loc->>'name')||' · '||(other->>'job_name')||' · '||(other_target->>'date')||' '||(other_target->>'start_time')||'–'||(other_target->>'end_time')||' ('||(other_loc->>'timezone')||')');

    end if;

    candidate:=coalesce((other->>'employee_id')::uuid,(src->>'employee_id')::uuid);

  else candidate:=case when op->>'kind'='move' then (src->>'employee_id')::uuid else (op->>'employee_id')::uuid end; end if;

  if op->>'kind'='release' then

    if src->>'employee_id' is null or src->>'source_shift_id' is null then blocked:=array_append(blocked,'Choose a current Schedule assignment with an employee'); end if;

    if destination is distinct from (src_loc->>'id')::uuid or target->>'job_id' is distinct from src->>'job_id' or target->>'shift_type_id' is distinct from src->>'shift_type_id' then blocked:=array_append(blocked,'Removing an assignment keeps its location, position and service'); end if;

    if op->>'employee_id' is not null or op->>'target_entry_id' is not null or coalesce((op->>'travel_minutes')::integer,0)<>0 then blocked:=array_append(blocked,'Removal does not assign a replacement or reserve travel'); end if;

    effects:=array_append(effects,coalesce(src->>'employee_name','Employee')||' is removed for the selected interval. The same position remains open; earlier and later work stays assigned.');

  elsif candidate is null then blocked:=array_append(blocked,'Choose an employee');

  else

    check1:=public.lineup_candidate_check(w,candidate,target,exclude_ids,(op->>'travel_minutes')::integer);

    if check1->>'status'<>'eligible' then blocked:=blocked||array(select jsonb_array_elements_text(check1->'reasons')); end if;

  end if;

  if op->>'kind' in ('move','swap') and (op->>'travel_minutes')::integer>0 then effects:=array_append(effects,(op->>'travel_minutes')||' minutes of travel are reserved before and after the changed interval. Any resulting gaps remain open.'); end if;

  if op->>'kind'<>'release' then

  effects:=array_append(effects,coalesce((select coalesce(nullif(preferred_name,''),concat_ws(' ',first_name,last_name)) from public.employee_profiles where id=candidate),'Employee')||' → '||(select name from public.locations where id=destination)||' · '||d::text||' '||(target->>'start_time')||'–'||(target->>'end_time')||' ('||(select timezone from public.locations where id=destination)||')');

  end if;

  if op->>'kind'='move' then effects:=array_append(effects,'An open position remains at '||(src_loc->>'name')||' · '||to_char(lower(span) at time zone (src_loc->>'timezone'),'YYYY-MM-DD HH24:MI')||'–'||to_char(upper(span) at time zone (src_loc->>'timezone'),'HH24:MI')||' ('||(src_loc->>'timezone')||').'); end if;

  if needs_approval then effects:=array_append(effects,'Awaiting destination approval. No shifts change until the other location approves.'); end if;

  effects:=array_append(effects,'Schedule and Line Up update together. Previous working records stay unchanged. Share the updated plan for acknowledgement.');

  fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object('operation',op,'model',model,'candidate',check1,'other_candidate',check2)::text,'UTF8'),'sha256'),'hex');

  return jsonb_build_object('minimum_travel_minutes',public.lineup_effective_travel_minutes(w,0),'effective_travel_minutes',(op->>'travel_minutes')::integer,'fingerprint',fingerprint,'allowed',cardinality(blocked)=0,'requires_approval',needs_approval,'effects',to_jsonb(effects),'blockers',to_jsonb(blocked));

end; $function$;


CREATE OR REPLACE FUNCTION public.lineup_operations_service(actor_user_id uuid, target_workspace_id uuid, action text, payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$

declare w uuid:=target_workspace_id; actor uuid:=actor_user_id; d date; source_day date; other_day date; loc uuid; result jsonb; item jsonb; model jsonb;

  op jsonb; target jsonb; preview jsonb; src jsonb; other jsonb; src_loc jsonb; other_loc jsonb;

  emp public.employee_profiles%rowtype; note public.lineup_notes%rowtype; snap public.schedule_lineup_snapshots%rowtype;

  receipt public.lineup_receipts%rowtype; existing public.lineup_operation_events%rowtype;

  employee_id uuid; source_id uuid; saved_id uuid; sent integer;

  previous jsonb; operation_id uuid; excluded uuid[]:=array[]::uuid[]; locations uuid[]; swap_span tstzrange;

begin

  if action='guard' then

   if payload->>'entry_id' is not null then

    select location_id into loc from public.schedule_lineup_entries where workspace_id=w and id=(payload->>'entry_id')::uuid;

    if loc is null then select location_id into loc from public.schedule_published_shifts where workspace_id=w and id=(payload->>'entry_id')::uuid; end if;

    if loc is null then raise exception 'line-up entry not found'; end if;

    locations:=array[loc];

   elsif jsonb_typeof(payload->'location_ids')='array' then locations:=array(select value::uuid from jsonb_array_elements_text(payload->'location_ids')); end if;

   perform public.lineup_assert_enabled(actor,w,locations,coalesce(payload->>'permission','schedule.lineup.manage'));

   return '{"enabled":true}'::jsonb;

  end if;

  if action in ('note','section_plan') then

   loc:=case when action='note' then (payload->'note'->>'location_id')::uuid else (payload->>'location_id')::uuid end;

   perform public.lineup_assert_enabled(actor,w,case when loc is null then null else array[loc] end,'schedule.lineup.manage');

  end if;

  if action in ('placements_preview','placements_apply') then return public.lineup_placements_service(actor,w,action,payload); end if;

  if action in ('published','receipt') then

    emp:=public.employee_hub_actor_service(actor,w);

    if action='published' then

      if (payload->>'to')::date<(payload->>'from')::date or (payload->>'to')::date>(payload->>'from')::date+62 then raise exception 'Invalid date range'; end if;

      select coalesce(jsonb_agg(jsonb_build_object('snapshot_id',s.id,'location_id',s.location_id,'location_name',l.name,'timezone',l.timezone,'date',s.lineup_date,'version',s.version_number,'shared_at',s.shared_at,'viewed_at',r.viewed_at,'acknowledged_at',r.acknowledged_at,'source_current',exists(select 1 from public.schedule_location_publications cp where cp.workspace_id=w and cp.location_id=s.location_id and cp.status='current' and s.lineup_date between cp.week_start and cp.week_start+6),

        'entries',coalesce((select jsonb_agg(e) from jsonb_array_elements(s.content->'entries') e where e->>'employee_id'=emp.id::text),'[]'::jsonb),

        'notes',coalesce((select jsonb_agg(n) from jsonb_array_elements(coalesce(s.content->'notes','[]'::jsonb)) n where exists(select 1 from jsonb_array_elements(s.content->'entries') e where e->>'employee_id'=emp.id::text and (n->>'shift_type_id' is null or n->>'shift_type_id'=e->>'shift_type_id') and (n->>'section_id' is null or n->>'section_id'=e->>'section_id'))),'[]'::jsonb),

        'briefs',coalesce((select jsonb_agg(b) from jsonb_array_elements(coalesce(s.content->'briefs','[]'::jsonb)) b where exists(select 1 from jsonb_array_elements(s.content->'entries') e where e->>'employee_id'=emp.id::text and e->>'shift_type_id'=b->>'shift_type_id')),'[]'::jsonb)

      )||public.lineup_employee_details(s.content,prior.content,prior.version_number,emp.id) order by s.lineup_date,l.name),'[]'::jsonb) into result

      from public.schedule_lineup_snapshots s join public.lineup_receipts r on r.snapshot_id=s.id and r.employee_id=emp.id join public.locations l on l.id=s.location_id

      left join lateral (select old.content,old.version_number from public.schedule_lineup_snapshots old join public.lineup_receipts old_receipt on old_receipt.snapshot_id=old.id and old_receipt.employee_id=emp.id where old.workspace_id=w and old.location_id=s.location_id and old.lineup_date=s.lineup_date and old.version_number<s.version_number order by old.version_number desc limit 1) prior on true

      where s.workspace_id=w and s.lineup_date between (payload->>'from')::date and (payload->>'to')::date

        and not exists(select 1 from public.schedule_lineup_snapshots newer where newer.workspace_id=w and newer.location_id=s.location_id and newer.lineup_date=s.lineup_date and newer.version_number>s.version_number)

        and exists(select 1 from public.employee_location_assignments a where a.workspace_id=w and a.employee_id=emp.id and a.location_id=s.location_id and a.ended_at is null);

      return result;

    end if;

    select s.* into snap from public.schedule_lineup_snapshots s join public.lineup_receipts r on r.snapshot_id=s.id and r.employee_id=emp.id

    where s.id=(payload->>'snapshot_id')::uuid and s.workspace_id=w

      and exists(select 1 from public.employee_location_assignments a where a.employee_id=emp.id and a.workspace_id=w and a.location_id=s.location_id and a.ended_at is null);

    if snap.id is null then raise exception 'Shared Line Up access denied'; end if;

    if exists(select 1 from public.schedule_lineup_snapshots s where s.workspace_id=w and s.location_id=snap.location_id and s.lineup_date=snap.lineup_date and s.version_number>snap.version_number) then raise exception 'stale shared Line Up; open the latest version'; end if;

    if payload->>'action'='acknowledge' and not exists(select 1 from public.schedule_location_publications cp where cp.workspace_id=w and cp.location_id=snap.location_id and cp.status='current' and snap.lineup_date between cp.week_start and cp.week_start+6) then raise exception 'Schedule was unpublished; this snapshot is historical'; end if;

    if payload->>'action' not in ('view','acknowledge') then raise exception 'Invalid receipt action'; end if;

    update public.lineup_receipts set viewed_at=coalesce(viewed_at,now()),acknowledged_at=case when payload->>'action'='acknowledge' then coalesce(acknowledged_at,now()) else acknowledged_at end

    where snapshot_id=snap.id and lineup_receipts.employee_id=emp.id returning * into receipt;

    return to_jsonb(receipt);

  end if;

  if not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.read') then raise exception 'Line Up access denied'; end if;

  if action='shared_export' then

    d:=(payload->>'date')::date;loc:=(payload->>'location_id')::uuid;

    if not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.share',loc) then raise exception 'Shared export scope denied'; end if;

    select * into snap from public.schedule_lineup_snapshots where workspace_id=w and location_id=loc and lineup_date=d order by version_number desc limit 1;

    if snap.id is null then raise exception 'No shared version for this day'; end if;

    if snap.content->'catalogue' is null then raise exception 'Legacy share has no immutable export catalogue; its original snapshot remains in history'; end if;

    return (snap.content->'catalogue')||jsonb_build_object('locations',jsonb_build_array((snap.content-'catalogue')||jsonb_build_object('shared_at',snap.shared_at)));

  end if;

  if action='state' then

    d:=(payload->>'date')::date;loc:=(payload->>'location_id')::uuid;

    if not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.read',loc) then raise exception 'Line Up scope denied'; end if;

    select * into snap from public.schedule_lineup_snapshots where workspace_id=w and location_id=loc and lineup_date=d order by version_number desc limit 1;

    model:=public.get_schedule_lineup_service(actor,w,d,array[loc],null);

    return jsonb_build_object(

      'section_plans',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('lead_name',coalesce(nullif(e.preferred_name,''),concat_ws(' ',e.first_name,e.last_name)))) from public.lineup_section_plans p left join public.employee_profiles e on e.id=p.lead_employee_id where p.workspace_id=w and p.location_id=loc and p.date=d),'[]'::jsonb),

      'can_manage_sections',public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage') and not exists(select 1 from public.locations sl where sl.workspace_id=w and sl.archived_at is null and (not sl.lineup_operations_enabled or not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',sl.id))),

      'read_only',not (select lineup_operations_enabled from public.locations where id=loc and workspace_id=w),'server_time',now(),'source_current',exists(select 1 from public.schedule_location_publications cp where cp.workspace_id=w and cp.location_id=loc and cp.status='current' and d between cp.week_start and cp.week_start+6),

      'pending_notifications',(select count(*) from public.lineup_notification_outbox o join public.employee_profiles ep on ep.id=o.employee_id join public.workspace_memberships wm on wm.workspace_id=w and wm.user_id=ep.user_id and wm.status='active' where o.snapshot_id=snap.id and o.delivered_at is null),

      'unreachable_recipients',(select count(*) from public.lineup_notification_outbox o where o.snapshot_id=snap.id and o.delivered_at is null and not exists(select 1 from public.employee_profiles ep join public.workspace_memberships wm on wm.workspace_id=w and wm.user_id=ep.user_id and wm.status='active' where ep.id=o.employee_id)),

      'active_entry_ids',coalesce((select jsonb_agg(e->'id') from jsonb_array_elements(model->'locations'->0->'entries') e where public.lineup_shift_range(d,(e->>'start_time')::time,(e->>'end_time')::time,model->'locations'->0->>'timezone') @> now()),'[]'::jsonb),

      'notes',coalesce((select jsonb_agg(to_jsonb(n)-'workspace_id'-'updated_by'-'updated_at' order by n.pinned desc,n.id) from public.lineup_notes n where n.workspace_id=w and n.date=d and (n.location_id is null or n.location_id=loc) and (n.visibility='team' or public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',loc)) and (n.expires_at is null or n.expires_at>now())),'[]'::jsonb),

      'receipts',coalesce((select jsonb_agg(jsonb_build_object('employee_id',r.employee_id,'employee_name',coalesce(nullif(e.preferred_name,''),concat_ws(' ',e.first_name,e.last_name)),'snapshot_id',snap.id,'version',snap.version_number,'viewed_at',r.viewed_at,'acknowledged_at',r.acknowledged_at) order by e.first_name) from public.lineup_receipts r join public.employee_profiles e on e.id=r.employee_id where r.snapshot_id=snap.id),'[]'::jsonb),

      'events',coalesce((select jsonb_agg(jsonb_build_object('id',ev.id,'kind',ev.kind,'description',ev.description,'created_at',ev.created_at) order by ev.created_at desc) from public.lineup_operation_events ev where ev.workspace_id=w and (ev.date=d or ev.after_state->>'source_date'=d::text or ev.after_state->>'counterpart_date'=d::text) and loc=any(ev.location_ids)),'[]'::jsonb),

      'unpublished_changes',snap.id is null or exists(select 1 from jsonb_array_elements(model->'locations'->0->'entries') se where coalesce((se->>'source_changed')::boolean,false)) or case when public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.share',loc) and not exists(select 1 from jsonb_array_elements(model->'locations'->0->'entries') se where coalesce((se->>'source_changed')::boolean,false) and not (se->>'hidden')::boolean) then (select jsonb_build_object('entries',c->'entries','notes',c->'notes','briefs',c->'briefs') is distinct from jsonb_build_object('entries',snap.content->'entries','notes',snap.content->'notes','briefs',snap.content->'briefs') from (select public.lineup_share_content(actor,w,d,array[loc])->'locations'->0 c) current_content) else false end or (model->'locations'->0->>'revision')::integer is distinct from (snap.content->>'revision')::integer or exists(select 1 from public.lineup_section_plans sp where sp.workspace_id=w and sp.location_id=loc and sp.date=d and sp.updated_at>snap.shared_at) or exists(select 1 from public.lineup_notes n where n.workspace_id=w and n.date=d and (n.location_id is null or n.location_id=loc) and n.visibility='team' and n.updated_at>snap.shared_at));

  end if;

  if not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage') then raise exception 'Line Up manage access denied'; end if;

  if action='section_plan' then

    d:=(payload->>'date')::date;loc:=(payload->>'location_id')::uuid;

    if not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',loc) then raise exception 'Section setup scope denied'; end if;

    perform pg_advisory_xact_lock(hashtextextended(w::text,921));

    model:=public.get_schedule_lineup_service(actor,w,d,array[loc],null);

    if public.lineup_section_restriction(w,(payload->>'section_id')::uuid,loc,(payload->>'shift_type_id')::uuid,null) is not null then raise exception '%',public.lineup_section_restriction(w,(payload->>'section_id')::uuid,loc,(payload->>'shift_type_id')::uuid,null); end if;

    if (payload->>'closed')::boolean and exists(select 1 from jsonb_array_elements(model->'locations'->0->'entries') e where (case when jsonb_array_length(coalesce(e->'placement_segments','[]'::jsonb))>0 then exists(select 1 from jsonb_array_elements(e->'placement_segments') seg where seg->>'section_id'=payload->>'section_id') else e->>'section_id'=payload->>'section_id' end) and not (e->>'hidden')::boolean and not (e->>'orphaned')::boolean and (payload->>'shift_type_id' is null or e->>'shift_type_id'=payload->>'shift_type_id')) then raise exception 'Reassign this section before closing it'; end if;

    if payload->>'lead_employee_id' is not null and not exists(select 1 from jsonb_array_elements(model->'locations'->0->'entries') e where e->>'employee_id'=payload->>'lead_employee_id' and not (e->>'hidden')::boolean and not (e->>'call_off')::boolean and not (e->>'orphaned')::boolean and (payload->>'shift_type_id' is null or e->>'shift_type_id'=payload->>'shift_type_id')) then raise exception 'Section lead must be scheduled for this service'; end if;

    select to_jsonb(p) into previous from public.lineup_section_plans p where p.workspace_id=w and p.location_id=loc and p.date=d and p.section_id=(payload->>'section_id')::uuid and p.shift_type_id is not distinct from (payload->>'shift_type_id')::uuid for update;

    if (previous->>'revision')::integer is distinct from (payload->>'expected_revision')::integer then raise exception 'stale section setup'; end if;

    insert into public.lineup_section_plans(workspace_id,location_id,date,shift_type_id,section_id,closed,lead_employee_id,stations,updated_by)

    values(w,loc,d,(payload->>'shift_type_id')::uuid,(payload->>'section_id')::uuid,(payload->>'closed')::boolean,(payload->>'lead_employee_id')::uuid,payload->>'stations',actor)

    on conflict(workspace_id,location_id,date,shift_type_id,section_id) do update set closed=excluded.closed,lead_employee_id=excluded.lead_employee_id,stations=excluded.stations,revision=public.lineup_section_plans.revision+1,updated_by=actor,updated_at=now() returning to_jsonb(lineup_section_plans) into result;

    return result;

  end if;

  if action='remind_unacknowledged' then

    d:=(payload->>'date')::date;loc:=(payload->>'location_id')::uuid;

    perform public.lineup_assert_enabled(actor,w,array[loc],'schedule.lineup.share');

    perform pg_advisory_xact_lock(hashtextextended(w::text,921));

    select * into snap from public.schedule_lineup_snapshots where workspace_id=w and location_id=loc and lineup_date=d order by version_number desc limit 1;

    if snap.id is null or snap.id is distinct from (payload->>'snapshot_id')::uuid then raise exception 'stale acknowledgement list; open the latest shared version'; end if;

    if d<(now() at time zone (select timezone from public.locations where id=loc))::date or not exists(select 1 from public.schedule_location_publications cp where cp.workspace_id=w and cp.location_id=loc and cp.status='current' and d between cp.week_start and cp.week_start+6) then raise exception 'Reminders require a current plan for today or an upcoming day'; end if;

    perform 1 from public.lineup_receipts r where r.snapshot_id=snap.id and r.acknowledged_at is null order by r.employee_id for update;

    insert into public.notifications(workspace_id,recipient_user_id,category,title,body,action_url,source_type,source_id,event_key)

    select w,e.user_id,'schedule','Please read your updated Line Up','Your shared plan for '||d::text||' is waiting for your acknowledgement.','/app/employee-hub/lineup','lineup_snapshot',snap.id,'ack_reminder:'||to_char(now() at time zone 'UTC','YYYYMMDDHH24')

    from public.lineup_receipts r join public.employee_profiles e on e.id=r.employee_id and e.workspace_id=w

    join public.workspace_memberships m on m.workspace_id=w and m.user_id=e.user_id and m.status='active'

    where r.snapshot_id=snap.id and r.acknowledged_at is null and e.archived_at is null

      and exists(select 1 from public.employee_location_assignments a where a.workspace_id=w and a.employee_id=e.id and a.location_id=loc and a.ended_at is null)

      and not exists(select 1 from public.notifications n where n.workspace_id=w and n.source_type='lineup_snapshot' and n.source_id=snap.id and n.recipient_user_id=e.user_id and n.event_key like 'ack_reminder:%' and n.created_at>now()-interval '1 hour') on conflict do nothing;

    get diagnostics sent=row_count;

    return jsonb_build_object('sent',sent,'snapshot_id',snap.id);

  end if;

  if action='retry_notifications' then

    d:=(payload->>'date')::date;loc:=(payload->>'location_id')::uuid;

    if not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.share',loc) then raise exception 'Line Up notification scope denied'; end if;

    return jsonb_build_object('delivered',public.deliver_lineup_notifications_service(actor,w,array(select id from public.schedule_lineup_snapshots where workspace_id=w and location_id=loc and lineup_date=d)));

  end if;

  if action='note' then

    item:=payload->'note';loc:=(item->>'location_id')::uuid;d:=(item->>'date')::date;

    if loc is null and exists(select 1 from public.locations l where l.workspace_id=w and l.archived_at is null and not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',l.id)) then raise exception 'All-location notes require access to every location'; end if;

    if loc is not null and not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',loc) then raise exception 'Line Up note scope denied'; end if;

    perform pg_advisory_xact_lock(hashtextextended(w::text,921));

    if payload->>'note_id' is null then

      insert into public.lineup_notes(workspace_id,location_id,date,shift_type_id,section_id,category,content,visibility,pinned,expires_at,updated_by)

      values(w,loc,d,(item->>'shift_type_id')::uuid,(item->>'section_id')::uuid,item->>'category',item->>'content',item->>'visibility',(item->>'pinned')::boolean,(item->>'expires_at')::timestamptz,actor) returning * into note;

    else

      select * into note from public.lineup_notes where id=(payload->>'note_id')::uuid and workspace_id=w for update;

      if note.id is null or note.revision<>(payload->>'expected_revision')::integer then raise exception 'stale Line Up note'; end if;

      if note.location_id is null and exists(select 1 from public.locations l where l.workspace_id=w and l.archived_at is null and not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',l.id)) then raise exception 'Original note scope denied'; end if;

      if note.location_id is not null and not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',note.location_id) then raise exception 'Original note scope denied'; end if;

      update public.lineup_notes set location_id=loc,date=d,shift_type_id=(item->>'shift_type_id')::uuid,section_id=(item->>'section_id')::uuid,category=item->>'category',content=item->>'content',visibility=item->>'visibility',pinned=(item->>'pinned')::boolean,expires_at=(item->>'expires_at')::timestamptz,revision=revision+1,updated_by=actor,updated_at=now() where id=note.id returning * into note;

    end if;

    return to_jsonb(note);

  end if;

  if action='candidates' then

    target:=payload->'target';loc:=(target->>'location_id')::uuid;d:=(target->>'date')::date;

    if not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',loc) then raise exception 'Candidate scope denied'; end if;

    model:=public.lineup_operation_model(actor,w,d,jsonb_build_object('source_entry_id',payload->'source_entry_id'));

    select e into src from jsonb_array_elements(model->'locations') l cross join lateral jsonb_array_elements(l->'entries') e where e->>'id'=payload->>'source_entry_id';

    if src is not null then excluded:=array[coalesce((src->>'source_shift_id')::uuid,(src->>'id')::uuid)]; end if;

    select coalesce(jsonb_agg(c order by case c->>'status' when 'eligible' then 0 when 'partial' then 1 when 'movable' then 2 when 'verification_required' then 3 else 4 end,c->>'display_name'),'[]'::jsonb) into result from (

      select public.lineup_candidate_option(actor,w,e.id,target,excluded,src)||jsonb_build_object('display_name',coalesce(nullif(e.preferred_name,''),concat_ws(' ',e.first_name,e.last_name))) c

      from public.employee_profiles e where e.workspace_id=w and e.archived_at is null

        and exists(select 1 from public.employee_location_assignments a where a.employee_id=e.id and a.workspace_id=w and a.ended_at is null and public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',a.location_id))

    ) candidates;

    return result;

  end if;

  if action in ('preview','apply') then

    op:=payload->'operation';target:=op->'target';d:=(target->>'date')::date;loc:=(target->>'location_id')::uuid;

    source_day:=coalesce(public.lineup_entry_day(w,(op->>'source_entry_id')::uuid),d);other_day:=coalesce(public.lineup_entry_day(w,(op->>'target_entry_id')::uuid),d);

    if action='apply' then

      perform pg_advisory_xact_lock(hashtextextended(w::text,921));

      select * into existing from public.lineup_operation_events where workspace_id=w and idempotency_key=(payload->>'idempotency_key')::uuid;

      if existing.id is not null then

        if existing.actor_user_id<>actor or existing.after_state->'operation'<>op then raise exception 'Idempotency key already used for another operation'; end if;

        if exists(select 1 from unnest(existing.location_ids) id where not public.schedule_actor_can_publish_service(actor,w,id) or not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',id)) then raise exception 'Operation scope denied'; end if;

        return jsonb_build_object('status','applied','event_id',existing.id);

      end if;

      perform 1 from public.schedule_location_publications p where p.workspace_id=w and p.status='current' and p.week_start between least(d,source_day,other_day)-8 and greatest(d,source_day,other_day)+2 order by p.id for update;

      perform 1 from public.workspace_memberships m where m.workspace_id=w order by m.id for share;

      perform 1 from public.schedule_published_shifts s where s.workspace_id=w and s.scheduled_date between least(d,source_day,other_day)-2 and greatest(d,source_day,other_day)+2 order by s.id for update;

      perform 1 from public.employee_profiles e where e.workspace_id=w order by e.id for update;

    end if;

    preview:=public.lineup_operation_preview(actor,w,op);

    if action='preview' then return preview; end if;

    if preview->>'fingerprint'<>payload->>'fingerprint' then raise exception 'stale Line Up operation preview'; end if;

    if not (preview->>'allowed')::boolean then raise exception '%',preview->'blockers'; end if;

    if (preview->>'requires_approval')::boolean then raise exception 'Destination approval required; submit a transfer proposal'; end if;

    model:=public.lineup_operation_model(actor,w,d,op);



    select l,e into src_loc,src from jsonb_array_elements(model->'locations') l cross join lateral jsonb_array_elements(l->'entries') e where e->>'id'=op->>'source_entry_id';

    source_id:=(src->>'source_shift_id')::uuid;

    if op->>'kind'='swap' then

      select l,e into other_loc,other from jsonb_array_elements(model->'locations') l cross join lateral jsonb_array_elements(l->'entries') e where e->>'id'=op->>'target_entry_id';

      swap_span:=public.lineup_shift_range(d,(target->>'start_time')::time,(target->>'end_time')::time,src_loc->>'timezone');

      perform public.lineup_assign_segment(actor,w,(other->>'source_shift_id')::uuid,(src->>'employee_id')::uuid,

        jsonb_build_object('date',(lower(swap_span) at time zone (other_loc->>'timezone'))::date,'location_id',other_loc->'id','job_id',other->'job_id','shift_type_id',other->'shift_type_id','start_time',to_char(lower(swap_span) at time zone (other_loc->>'timezone'),'HH24:MI'),'end_time',to_char(upper(swap_span) at time zone (other_loc->>'timezone'),'HH24:MI'),'section_id',other->'section_id','station',other->'station','placement_segments',public.lineup_clip_placements(other->'placement_segments',swap_span),'travel_minutes',preview->'effective_travel_minutes'));

      employee_id:=(other->>'employee_id')::uuid;

    else employee_id:=case when op->>'kind'='move' then (src->>'employee_id')::uuid else (op->>'employee_id')::uuid end; end if;

    if op->>'kind'='release' then

      swap_span:=public.lineup_shift_range(d,(target->>'start_time')::time,(target->>'end_time')::time,src_loc->>'timezone');

      saved_id:=public.lineup_assign_segment(actor,w,source_id,null,target||jsonb_build_object('section_id',src->'section_id','station',src->'station','placement_segments',public.lineup_clip_placements(src->'placement_segments',swap_span),'travel_minutes',0));

    elsif op->>'kind'='move' and op->>'target_entry_id' is not null then

      select l,e into other_loc,other from jsonb_array_elements(model->'locations') l cross join lateral jsonb_array_elements(l->'entries') e where e->>'id'=op->>'target_entry_id';

      swap_span:=public.lineup_shift_range(d,(target->>'start_time')::time,(target->>'end_time')::time,other_loc->>'timezone');

      perform public.lineup_assign_segment(actor,w,source_id,null,jsonb_build_object('date',(lower(swap_span) at time zone (src_loc->>'timezone'))::date,'location_id',src_loc->'id','job_id',src->'job_id','shift_type_id',src->'shift_type_id','section_id',src->'section_id','station',src->'station','start_time',to_char(lower(swap_span) at time zone (src_loc->>'timezone'),'HH24:MI'),'end_time',to_char(upper(swap_span) at time zone (src_loc->>'timezone'),'HH24:MI'),'travel_minutes',preview->'effective_travel_minutes'));

      saved_id:=public.lineup_fill_coverage(actor,w,other,employee_id,target);

    else

      saved_id:=public.lineup_fill_coverage(actor,w,src,employee_id,target||jsonb_build_object('travel_minutes',case when op->>'kind' in ('move','swap') then (preview->>'effective_travel_minutes')::integer else 0 end));

    end if;

    locations:=array_remove(array[loc,(src_loc->>'id')::uuid,(other_loc->>'id')::uuid],null);

    update public.schedule_lineups set revision=revision+1,updated_at=now(),updated_by=actor where workspace_id=w and lineup_date in(d,source_day,other_day) and location_id=any(locations);

    insert into public.lineup_operation_events(workspace_id,actor_user_id,kind,date,location_ids,description,before_state,after_state,idempotency_key)

    values(w,actor,op->>'kind',d,locations,op->>'reason',jsonb_build_object('source',src,'other',other),jsonb_build_object('operation',op,'shift_id',saved_id,'source_date',source_day,'counterpart_date',other_day),(payload->>'idempotency_key')::uuid) returning id into operation_id;

    insert into public.notifications(workspace_id,recipient_user_id,category,title,body,action_url,source_type,source_id,event_key)

    select w,e.user_id,'schedule','Your assignment has changed','Your manager updated your work assignment for '||d::text||'. Open Schedule to review the change.','/app/employee-hub','lineup_operation',operation_id,'assignment_changed'

    from public.employee_profiles e join public.workspace_memberships m on m.workspace_id=w and m.user_id=e.user_id and m.status='active'

    where e.workspace_id=w and e.id in((select ps.employee_id from public.schedule_published_shifts ps where ps.id=saved_id),(src->>'employee_id')::uuid,(other->>'employee_id')::uuid) on conflict do nothing;

    insert into public.notifications(workspace_id,recipient_user_id,category,title,body,action_url,source_type,source_id,event_key)

    select w,m.user_id,'schedule','Line Up staffing updated','A staffing change for '||chosen.local_day::text||' is confirmed. Review the updated coverage and share the plan.','/app/schedule/lineup?date='||chosen.local_day::text||'&location='||chosen.id::text,'lineup_operation',operation_id,'manager_assignment_changed'

    from public.workspace_memberships m

    cross join lateral (

      select affected.id,(lower(public.lineup_shift_range(d,(target->>'start_time')::time,(target->>'end_time')::time,(select timezone from public.locations where id=loc))) at time zone affected.timezone)::date as local_day

      from public.locations affected where affected.workspace_id=w and affected.id=any(locations)

        and public.schedule_actor_can_publish_service(m.user_id,w,affected.id) and public.schedule_actor_has_capability_service(m.user_id,w,'schedule.lineup.manage',affected.id)

      order by (affected.id=loc) desc,affected.id limit 1

    ) chosen where m.workspace_id=w and m.status='active' and m.user_id<>actor on conflict do nothing;

    return jsonb_build_object('status','applied','event_id',operation_id,'shift_id',saved_id);

  end if;

  raise exception 'Unknown Line Up operation';

end; $function$;

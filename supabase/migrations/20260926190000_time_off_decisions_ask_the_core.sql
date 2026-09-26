-- BL-177: time-off decisions ask the authorization core, and the owner's own
-- requests are recorded approved.
--
-- A request goes one rank up and nobody decides their own; the owner's request
-- is recorded without approval (REUSE "Rütbe"): a manager decides an
-- employee's request at their location, never another manager's, an admin's
-- or the owner's; an admin decides a manager's, never another admin's or the
-- owner's; the owner decides an admin's. The decision functions asked the old
-- Schedule helper (permission + location) and checked "not your own" by hand,
-- so a manager could approve another manager's leave at the same location,
-- and an admin the owner's.
--
-- 1. app_private.authorize_time_off_decision() asks
--    app_private.authorize(actor, w, 'time_off.decide', target_locations =>
--    array[<request location>], target_person => <requester>).
--    time_off.decide is a place action with no_self and rank_below, so a no is
--    42501 with authz.rank (their own, or not ranked below), authz.out_of_scope
--    (another location) or authz.missing_permission. The one exception: the
--    owner approving their own request, which is how it is recorded (2).
--    decide_time_off_with_assignments_service (the entry point every decision
--    goes through: resolve_schedule_time_off_request_service and
--    resolve_time_off_period_decision_service are sql wrappers of it) and
--    preview_time_off_assignment_decision_service ask it first.
--    apply_time_off_period_decision, the shared decision step only postgres
--    can execute, is reached only through the entry point (directly or via
--    apply_time_off_cancellation_decision) and drops its own copy of the check.
-- 2. app_private.record_owner_time_off() approves the owner's own request the
--    moment it is filed, through the same entry point, so the history is the
--    same as any approval (submitted, then approved, both by the owner, no
--    note) and the owner's published shifts on those hours are released as an
--    approval releases them. Both ways of filing (a leave request and a
--    cancellation of approved leave) call it; for anyone else it does nothing.
-- 3. Pending requests the owner filed before this are approved the same way.
--
-- Signatures, grants and what each returns stay the same (a filing returns
-- status 'approved' and revision 2 for the owner); bodies are the live
-- definitions with only the lines named above changed.
-- supabase/tests/time_off_decisions_go_one_rank_up.test.sql.

create function app_private.authorize_time_off_decision(actor uuid, w uuid, requester uuid, place uuid, verb text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  -- The owner's own request is recorded approved (record_owner_time_off);
  -- time_off.decide refuses the owner only their own (rank), everyone else
  -- ranks below them.
  if verb = 'approve'
     and app_private.authz_reason(actor, w, 'workspace.setup') is null
     and app_private.authz_reason(actor, w, 'time_off.decide', array[place], requester) = 'rank' then
    return;
  end if;
  perform app_private.authorize(actor, w, 'time_off.decide', target_locations => array[place], target_person => requester);
end;
$$;

create function app_private.record_owner_time_off(actor uuid, w uuid, rid uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  r public.schedule_time_off_requests%rowtype;
  preview jsonb;
  result jsonb;
begin
  if app_private.authz_reason(actor, w, 'workspace.setup') is not null then
    return null;
  end if;
  -- Only the owner's own request; anybody else's is left as it is.
  select * into r from public.schedule_time_off_requests where id = rid and workspace_id = w
    and employee_id in (select e.id from public.employee_profiles e where e.workspace_id = w and e.user_id = actor);
  if r.id is null then
    return null;
  end if;
  if r.request_type = 'time_off' then
    preview := public.preview_time_off_assignment_decision_service(actor, w, rid, r.revision, 'approve', '[]');
    result := public.decide_time_off_with_assignments_service(actor, w, rid, r.revision, 'approve', '', '[]',
      gen_random_uuid(), preview ->> 'fingerprint',
      coalesce((select jsonb_agg(jsonb_build_object('shift_id', shift ->> 'id', 'action', 'release_entire_shift'))
                from jsonb_array_elements(preview -> 'affected_shifts') shift), '[]'));
  else
    result := public.decide_time_off_with_assignments_service(actor, w, rid, r.revision, 'approve', '', '[]',
      gen_random_uuid(), null, '[]');
  end if;
  return jsonb_build_object('status', result ->> 'status', 'request_id', rid, 'revision', (result ->> 'revision')::integer);
end;
$$;

revoke all on function app_private.authorize_time_off_decision(uuid, uuid, uuid, uuid, text) from public;
revoke all on function app_private.record_owner_time_off(uuid, uuid, uuid) from public;

create or replace function public.apply_time_off_period_decision(actor_user_id uuid, target_workspace_id uuid, target_request_id uuid, target_expected_revision integer, target_action text, target_note text DEFAULT ''::text, target_segment_decisions jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.schedule_time_off_requests%rowtype; s public.schedule_time_off_segments%rowtype; d jsonb; piece jsonb; pieces jsonb;
 decisions jsonb:=target_segment_decisions; original tstzrange; part tstzrange; covered tstzmultirange;
 a timestamptz; b timestamptz; zone_name text; next_status public.time_off_request_status; any_approved boolean:=false; any_denied boolean:=false;
begin
 perform public.availability_lock_workspace(target_workspace_id);
 select * into r from public.schedule_time_off_requests where id=target_request_id and workspace_id=target_workspace_id for update;
 if r.id is null then raise exception 'time off request not found' using errcode='P0002'; end if;
 -- Reached only through decide_time_off_with_assignments_service, which asked app_private.authorize_time_off_decision().
 if target_expected_revision is null or r.revision<>target_expected_revision then raise exception 'stale time off request' using errcode='40001'; end if;
 if char_length(btrim(coalesce(target_note,'')))>1000 then raise exception 'Manager note must be at most 1000 characters' using errcode='22023'; end if;
 if target_action in('approve','deny','partial_approve') then
  if r.status<>'pending' then raise exception 'time off request is not pending' using errcode='40001'; end if;
  if target_action in('approve','deny') then
   select jsonb_agg(jsonb_build_object('segment_id',id,'status',case target_action when 'approve' then 'approved' else 'denied' end)) into decisions
    from public.schedule_time_off_segments where request_id=r.id and workspace_id=target_workspace_id;
  end if;
  if jsonb_typeof(decisions) is distinct from 'array' then raise exception 'Every requested time-off segment needs exactly one decision' using errcode='22023'; end if;
  if jsonb_array_length(decisions)=0 or exists(select 1 from jsonb_array_elements(decisions) item where jsonb_typeof(item) is distinct from 'object' or item->>'segment_id' is null)
   then raise exception 'Every requested time-off segment needs exactly one valid decision' using errcode='22023'; end if;
  if (select count(distinct (item->>'segment_id')::uuid) from jsonb_array_elements(decisions) item)<>jsonb_array_length(decisions)
   or jsonb_array_length(decisions)<>(select count(*) from public.schedule_time_off_segments where request_id=r.id and workspace_id=target_workspace_id and status='pending')
   or exists(select 1 from jsonb_array_elements(decisions) item where not exists(select 1 from public.schedule_time_off_segments seg
    where seg.id=(item->>'segment_id')::uuid and seg.request_id=r.id and seg.workspace_id=target_workspace_id and seg.status='pending')) then
   raise exception 'Review each requested time-off segment once; duplicate or unrelated decisions are not allowed' using errcode='22023'; end if;
  for d in select value from jsonb_array_elements(decisions) loop
   select * into s from public.schedule_time_off_segments where id=(d->>'segment_id')::uuid;
   original:=public.time_off_period_span(s.id);
   select coalesce(s.time_timezone,l.timezone) into zone_name from public.locations l where l.id=r.location_id and l.workspace_id=target_workspace_id;
   if d ? 'pieces' then
    if s.starts_at is null then raise exception 'Review the original time zone before splitting an earlier request; submit a new hourly request' using errcode='22023'; end if;
    if d ? 'status' or jsonb_typeof(d->'pieces') is distinct from 'array' then raise exception 'Choose a whole-period decision or explicit pieces' using errcode='22023'; end if;
    pieces:=d->'pieces';
   else
    pieces:=jsonb_build_array(jsonb_build_object('starts_at',lower(original),'ends_at',upper(original),'status',d->>'status'));
   end if;
   if jsonb_array_length(pieces) not between 1 and 32 then raise exception 'Decide between 1 and 32 pieces for each requested period' using errcode='22023'; end if;
   covered:='{}';
   for piece in select value from jsonb_array_elements(pieces) loop
    if jsonb_typeof(piece) is distinct from 'object' or coalesce(piece->>'status','') not in('approved','denied')
     or coalesce(piece->>'starts_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' or coalesce(piece->>'ends_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then
     raise exception 'Each decision piece requires explicit instants and an approval or denial' using errcode='22023'; end if;
    a:=(piece->>'starts_at')::timestamptz; b:=(piece->>'ends_at')::timestamptz;
    if not isfinite(a) or not isfinite(b) or a>=b then raise exception 'Decision pieces must have a positive finite duration' using errcode='22023'; end if;
    part:=tstzrange(a,b,'[)');
    if not(original @> part) or covered && part then raise exception 'Decision pieces must cover the requested period without overlap or outside hours' using errcode='22023'; end if;
    covered:=covered+tstzmultirange(part);
    if r.request_type='time_off' and piece->>'status'='approved' and exists(select 1 from public.schedule_time_off_requests other_r join public.schedule_time_off_segments other_s on other_s.request_id=other_r.id and other_s.workspace_id=other_r.workspace_id
     where other_r.workspace_id=target_workspace_id and other_r.employee_id=r.employee_id and other_r.id<>r.id and other_r.request_type='time_off'
      and other_r.status in('pending','approved','partially_approved') and public.time_off_effective_ranges(other_s.id) && part) then
     raise exception 'Overlapping time-off conflict; resolve the other request before approval' using errcode='23514'; end if;
    insert into public.time_off_decision_pieces(workspace_id,request_id,segment_id,decision_revision,starts_at,ends_at,time_timezone,status)
     values(target_workspace_id,r.id,s.id,r.revision+1,a,b,zone_name,(piece->>'status')::public.time_off_segment_status);
    any_approved:=any_approved or piece->>'status'='approved'; any_denied:=any_denied or piece->>'status'='denied';
   end loop;
   if covered<>tstzmultirange(original) then raise exception 'Decision pieces must cover every requested instant without gaps' using errcode='22023'; end if;
   update public.schedule_time_off_segments set status=case when exists(select 1 from jsonb_array_elements(pieces) p where p->>'status'='approved')
    then 'approved'::public.time_off_segment_status else 'denied'::public.time_off_segment_status end where id=s.id;
  end loop;
  next_status:=case when any_approved and any_denied then 'partially_approved'::public.time_off_request_status when any_approved then 'approved'::public.time_off_request_status else 'denied'::public.time_off_request_status end;
 elsif target_action='return_to_pending' then
  if r.status='pending' then raise exception 'time off request transition is invalid' using errcode='40001'; end if;
  if exists(select 1 from public.schedule_time_off_segments own_s cross join public.schedule_time_off_requests other_r
   join public.schedule_time_off_segments other_s on other_s.request_id=other_r.id and other_s.workspace_id=other_r.workspace_id
   where own_s.request_id=r.id and own_s.workspace_id=target_workspace_id and other_r.workspace_id=target_workspace_id
    and other_r.employee_id=r.employee_id and other_r.id<>r.id and other_r.request_type='time_off' and other_r.status in('pending','approved','partially_approved')
    and public.time_off_effective_ranges(other_s.id) && public.time_off_period_span(own_s.id)) then
   raise exception 'Overlapping time-off conflict; resolve the other request before reopening this request' using errcode='23514'; end if;
  update public.schedule_time_off_segments set status='pending' where request_id=r.id and workspace_id=target_workspace_id; next_status:='pending';
 elsif target_action='revoke' then
  if r.status in('pending','revoked') then raise exception 'time off request transition is invalid' using errcode='40001'; end if;
  next_status:='revoked';
 else raise exception 'unsupported time off request action' using errcode='22023'; end if;
 update public.schedule_time_off_requests set status=next_status,revision=revision+1,updated_at=now() where id=r.id returning * into r;
 insert into public.schedule_time_off_events(workspace_id,request_id,action,actor_user_id,note,metadata)
  values(target_workspace_id,r.id,case target_action when 'return_to_pending' then 'returned_to_pending' when 'revoke' then 'revoked' else r.status::text end,
   actor_user_id,btrim(coalesce(target_note,'')),jsonb_build_object('revision',r.revision,'segments',decisions));
 return jsonb_build_object('status',r.status,'request_id',r.id,'revision',r.revision);
end $function$
;
create or replace function public.preview_time_off_assignment_decision_service(actor uuid, w uuid, rid uuid, expected_revision integer, action text, decisions jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.schedule_time_off_requests%rowtype; approved tstzmultirange; affected jsonb; visible_shifts jsonb:='[]'; s jsonb; restricted integer:=0; fp text;
begin
 select * into r from public.schedule_time_off_requests where id=rid and workspace_id=w;
 if r.id is null then raise exception 'time off request not found' using errcode='P0002'; end if;
 perform app_private.authorize_time_off_decision(actor,w,r.employee_id,r.location_id,action);
 if expected_revision is null or r.revision<>expected_revision or r.status<>'pending' then raise exception 'stale time off request' using errcode='40001'; end if;
 if action not in('approve','partial_approve') then raise exception 'Preview the approval decision before changing assignments' using errcode='22023'; end if;
 if r.request_type<>'time_off' then raise exception 'Cancellation does not change published assignments' using errcode='22023'; end if; approved:=public.time_off_proposed_approved_ranges(w,rid,action,decisions);
 affected:=public.time_off_assignment_impact(w,r.employee_id,approved);
 for s in select value from jsonb_array_elements(affected) loop
  if public.schedule_actor_can_publish_service(actor,w,(s->>'location_id')::uuid) then visible_shifts:=visible_shifts||jsonb_build_array(s);
  else restricted:=restricted+1; end if;
 end loop;
 fp:=encode(extensions.digest(convert_to(jsonb_build_object('request',rid,'revision',r.revision,'approved',public.availability_ranges_json(approved),'shifts',affected)::text,'UTF8'),'sha256'),'hex');
 return jsonb_build_object('request_id',rid,'revision',r.revision,'fingerprint',fp,'affected_shifts',visible_shifts,'restricted_count',restricted,
  'approved_intervals',public.availability_ranges_json(approved));
end $function$
;
create or replace function public.decide_time_off_with_assignments_service(actor uuid, w uuid, rid uuid, expected_revision integer, action text, note text, decisions jsonb, operation_id uuid, expected_impact text, dispositions jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.schedule_time_off_requests%rowtype; prior public.time_off_commands%rowtype; command jsonb; result jsonb; preview jsonb;
 affected jsonb:='[]'; s jsonb; changes jsonb:='[]'; other record; locked_id uuid;
begin
 perform public.availability_lock_workspace(w);
 select * into r from public.schedule_time_off_requests where id=rid and workspace_id=w for update;
 if r.id is null then raise exception 'time off request not found' using errcode='P0002'; end if;
 perform app_private.authorize_time_off_decision(actor,w,r.employee_id,r.location_id,action);
 if operation_id is null then raise exception 'A decision key is required' using errcode='22023'; end if;
 command:=jsonb_build_object('kind','assignment_decision','request_id',rid,'expected_revision',expected_revision,'action',action,'note',btrim(coalesce(note,'')),
  'decisions',decisions,'impact',expected_impact,'dispositions',dispositions);
 select * into prior from public.time_off_commands c where c.workspace_id=w and c.actor_user_id=actor and c.operation_id=decide_time_off_with_assignments_service.operation_id;
 if found then
  if prior.input->>'kind'='decision' and coalesce(dispositions,'[]'::jsonb)='[]'::jsonb and prior.input=jsonb_build_object('kind','decision','request_id',rid,
   'expected_revision',expected_revision,'action',action,'note',btrim(coalesce(note,'')),'decisions',decisions) then return prior.result; end if;
  if prior.input<>command then raise exception 'This decision key was used for a different decision' using errcode='40001'; end if;
  return prior.result;
 end if;
 if jsonb_typeof(dispositions) is distinct from 'array' then raise exception 'Review the published assignment decisions' using errcode='22023'; end if;
 
 if r.request_type='time_off_cancellation' then
  if expected_impact is not null or jsonb_array_length(dispositions)>0 then raise exception 'Cancellation cannot change published assignments' using errcode='22023'; end if;
  result:=public.apply_time_off_cancellation_decision(actor,w,rid,expected_revision,action,note,decisions);
  insert into public.time_off_commands(workspace_id,actor_user_id,operation_id,input,result) values(w,actor,operation_id,command,result);
  return result;
 end if;
 if action='return_to_pending' and exists(select 1 from public.time_off_cancellation_links cl join public.schedule_time_off_requests cr on cr.id=cl.request_id
  where cl.parent_request_id=rid and cr.status in('approved','partially_approved')) then raise exception 'Cancelled leave cannot be reopened; submit a new leave request' using errcode='22023'; end if;
 if action in('approve','partial_approve') then
  preview:=public.preview_time_off_assignment_decision_service(actor,w,rid,expected_revision,action,decisions);
  if (preview->>'restricted_count')::integer>0 then raise exception 'Published assignment scope denied; a manager with publishing access to every affected location must decide this request' using errcode='42501'; end if;
  affected:=preview->'affected_shifts';
  -- Lock the concrete current snapshots and recompute after any older writer.
  for locked_id in select ps.id from public.schedule_published_shifts ps where ps.workspace_id=w and ps.id in(select (x->>'id')::uuid from jsonb_array_elements(affected) x) order by ps.id for update loop null; end loop;
  preview:=public.preview_time_off_assignment_decision_service(actor,w,rid,expected_revision,action,decisions);
  if (preview->>'restricted_count')::integer>0 then raise exception 'Published assignment scope denied' using errcode='42501'; end if;
  affected:=preview->'affected_shifts';
  if (expected_impact is not null or jsonb_array_length(affected)>0) and expected_impact is distinct from preview->>'fingerprint' then
   raise exception 'Published assignment conflict: review the current affected shifts before approval' using errcode='40001'; end if;
  if jsonb_array_length(dispositions)<>jsonb_array_length(affected)
   or (select count(distinct (x->>'shift_id')::uuid) from jsonb_array_elements(dispositions) x)<>jsonb_array_length(dispositions)
   or exists(select 1 from jsonb_array_elements(dispositions) x where coalesce(x->>'action','')<>'release_entire_shift' or not exists(select 1 from jsonb_array_elements(affected) impacted where impacted->>'id'=((x->>'shift_id')::uuid)::text)) then
   raise exception 'Choose an explicit disposition for every affected published shift' using errcode='22023'; end if;
 elsif jsonb_array_length(dispositions)>0 then raise exception 'Only approval can change published assignments' using errcode='22023'; end if;
 result:=public.apply_time_off_period_decision(actor,w,rid,expected_revision,action,note,decisions);
 for other in select cr.id from public.time_off_cancellation_links cl join public.schedule_time_off_requests cr on cr.id=cl.request_id
  where cl.parent_request_id=rid and cr.status='pending' loop
  update public.schedule_time_off_requests set status='revoked',revision=revision+1,updated_at=now() where id=other.id;
  insert into public.schedule_time_off_events(workspace_id,request_id,action,actor_user_id,note,metadata)
   values(w,other.id,'revoked',actor,'Cancellation closed because the original leave changed. No shifts were reassigned.',jsonb_build_object('parent_request_id',rid));
 end loop;
 
 for s in select value from jsonb_array_elements(affected) loop
  insert into public.time_off_assignment_releases(workspace_id,request_id,decision_revision,published_shift_id,before_assignment,actor_user_id)
   values(w,rid,(result->>'revision')::integer,(s->>'id')::uuid,s,actor);
  update public.schedule_published_shifts set employee_id=null where workspace_id=w and id=(s->>'id')::uuid and employee_id=r.employee_id;
  if not found then raise exception 'Published assignment changed before release' using errcode='40001'; end if;
  changes:=changes||jsonb_build_array(s||jsonb_build_object('new_employee_id',null));
 end loop;
 if jsonb_array_length(changes)>0 then
  perform public.shift_exchange_reconcile_batch(actor,w,changes);
  for other in select c.id from public.shift_exchange_cases c where c.workspace_id=w and c.status='open'
   and exists(select 1 from jsonb_array_elements(changes) x where (x->>'source_id')::uuid in(c.offered_source_id,c.requested_source_id)) loop
   update public.shift_exchange_cases set status='invalidated',revision=revision+1,updated_at=now() where id=other.id;
   update public.shift_exchange_applications set status='invalidated',updated_at=now() where case_id=other.id and status in('invited','pending_manager');
   perform public.shift_exchange_emit(actor,w,other.id,null,'invalidated','An involved assignment was released with approved time off. Review the current schedule.');
  end loop;
  update public.schedule_time_off_events ev set metadata=ev.metadata||jsonb_build_object('released_assignments',changes)
   where ev.workspace_id=w and ev.request_id=rid and ev.metadata->>'revision'=result->>'revision' and ev.action in('approved','partially_approved');
  perform realtime.send(jsonb_build_object('workspace_id',w,'request_id',rid),'changed','shift-exchanges:'||w::text,true);
 end if;
 result:=result||jsonb_build_object('released_shift_count',jsonb_array_length(changes));
 insert into public.time_off_commands(workspace_id,actor_user_id,operation_id,input,result) values(w,actor,operation_id,command,result);
 return result;
end $function$
;
create or replace function public.submit_employee_time_off_periods_service(actor_user_id uuid, target_workspace_id uuid, target_location_id uuid, target_reason text, target_periods jsonb, target_operation_id uuid, target_expected_timezone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare employee public.employee_profiles%rowtype; zone_name text; command jsonb; prior public.time_off_commands%rowtype;
 period jsonb; resolved jsonb; periods jsonb:='[]'; span tstzrange; covered tstzmultirange:='{}'; request_id uuid; result jsonb;
begin
 perform public.availability_lock_workspace(target_workspace_id);
 employee:=public.employee_hub_actor_service(actor_user_id,target_workspace_id);
 if target_operation_id is null then raise exception 'A request key is required' using errcode='22023'; end if;
 command:=jsonb_build_object('location_id',target_location_id,'reason',btrim(coalesce(target_reason,'')),'periods',target_periods,'expected_timezone',target_expected_timezone);
 select * into prior from public.time_off_commands c where c.workspace_id=target_workspace_id and c.actor_user_id=submit_employee_time_off_periods_service.actor_user_id and c.operation_id=target_operation_id;
 if found then
  if prior.input<>command then raise exception 'This request key was used for different time-off hours' using errcode='40001'; end if;
  return prior.result;
 end if;
 if jsonb_typeof(target_periods) is distinct from 'array' then raise exception 'Enter the requested time-off periods' using errcode='22023'; end if;
 if jsonb_array_length(target_periods) not between 1 and 124 or char_length(btrim(coalesce(target_reason,'')))>1000 then raise exception 'Enter between 1 and 124 periods and a note of at most 1000 characters' using errcode='22023'; end if;
 select l.timezone into zone_name from public.locations l where l.id=target_location_id and l.workspace_id=target_workspace_id and l.archived_at is null
  and exists(select 1 from public.employee_location_assignments a where a.workspace_id=target_workspace_id and a.employee_id=employee.id and a.location_id=l.id and a.ended_at is null);
 if zone_name is null then raise exception 'employee location access denied' using errcode='42501'; end if;
 if target_expected_timezone is distinct from zone_name then raise exception 'The location time zone changed. Review the requested hours in the current time zone before submitting' using errcode='40001'; end if;
 for period in select value from jsonb_array_elements(target_periods) loop
  resolved:=public.time_off_resolve_period(period,zone_name);
  if (resolved->>'segment_date')::date<(now() at time zone zone_name)::date then raise exception 'Choose today or a future date in the location time zone' using errcode='22023'; end if;
  span:=tstzrange((resolved->>'starts_at')::timestamptz,(resolved->>'ends_at')::timestamptz,'[)');
  if covered && span then raise exception 'Requested time-off periods must not overlap or repeat' using errcode='22023'; end if;
  covered:=covered+tstzmultirange(span); periods:=periods||jsonb_build_array(resolved);
 end loop;
 if (select count(distinct p->>'segment_date') from jsonb_array_elements(periods) p)>31 then raise exception 'Request at most 31 calendar dates at a time' using errcode='22023'; end if;
 if exists(select 1 from public.schedule_time_off_requests r join public.schedule_time_off_segments s on s.request_id=r.id and s.workspace_id=r.workspace_id
  where r.workspace_id=target_workspace_id and r.employee_id=employee.id and r.request_type='time_off'
   and r.status in('pending','approved','partially_approved') and s.status in('pending','approved') and covered && public.time_off_effective_ranges(s.id)) then
  raise exception 'overlapping time off request exists' using errcode='23514'; end if;
 insert into public.schedule_time_off_requests(workspace_id,employee_id,location_id,reason,created_by,period_version)
  values(target_workspace_id,employee.id,target_location_id,btrim(coalesce(target_reason,'')),actor_user_id,2) returning id into request_id;
 insert into public.schedule_time_off_segments(workspace_id,request_id,segment_date,start_time,end_time,time_timezone,starts_at,ends_at,ends_next_day,fold_choices)
  select target_workspace_id,request_id,(p->>'segment_date')::date,(p->>'start_time')::time,(p->>'end_time')::time,p->>'time_timezone',
   (p->>'starts_at')::timestamptz,(p->>'ends_at')::timestamptz,(p->>'ends_next_day')::boolean,p->'fold_choices' from jsonb_array_elements(periods) p;
 insert into public.schedule_time_off_events(workspace_id,request_id,action,actor_user_id,metadata)
  values(target_workspace_id,request_id,'submitted',actor_user_id,jsonb_build_object('periods',periods,'operation_id',target_operation_id));
 result:=coalesce(app_private.record_owner_time_off(actor_user_id,target_workspace_id,request_id),jsonb_build_object('status','pending','request_id',request_id,'revision',1));
 insert into public.time_off_commands(workspace_id,actor_user_id,operation_id,input,result) values(target_workspace_id,actor_user_id,target_operation_id,command,result);
 return result;
end $function$
;
create or replace function public.submit_employee_time_off_cancellation_service(actor uuid, w uuid, parent_id uuid, expected_revision integer, reason text, periods jsonb, operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare employee public.employee_profiles%rowtype; parent public.schedule_time_off_requests%rowtype; original public.schedule_time_off_segments%rowtype;
 prior public.time_off_commands%rowtype; command jsonb; result jsonb; p jsonb; a timestamptz; b timestamptz; span tstzrange;
 covered tstzmultirange:='{}'; rid uuid:=gen_random_uuid(); sid uuid; zone_name text;
begin
 perform public.availability_lock_workspace(w);
 employee:=public.employee_hub_actor_service(actor,w);
 select * into parent from public.schedule_time_off_requests where id=parent_id and workspace_id=w and employee_id=employee.id for update;
 if parent.id is null then raise exception 'time off request not found' using errcode='P0002'; end if;
 if operation_id is null then raise exception 'A cancellation request key is required' using errcode='22023'; end if;
 command:=jsonb_build_object('kind','cancellation','parent',parent_id,'revision',expected_revision,'reason',btrim(coalesce(reason,'')),'periods',periods);
 select * into prior from public.time_off_commands c where c.workspace_id=w and c.actor_user_id=actor and c.operation_id=submit_employee_time_off_cancellation_service.operation_id;
 if found then
  if prior.input<>command then raise exception 'This request key was used for a different cancellation' using errcode='40001'; end if;
  return prior.result;
 end if;
 if expected_revision is null or parent.revision<>expected_revision or parent.request_type<>'time_off' or parent.status not in('approved','partially_approved') then
  raise exception 'stale approved leave; refresh before requesting cancellation' using errcode='40001'; end if;
 if exists(select 1 from public.time_off_cancellation_links cl join public.schedule_time_off_requests cr on cr.id=cl.request_id
  where cl.parent_request_id=parent.id and cr.status='pending') then raise exception 'A cancellation request is already pending for this leave' using errcode='23514'; end if;
 if jsonb_typeof(periods) is distinct from 'array' then raise exception 'Choose approved hours to cancel' using errcode='22023'; end if;
 if jsonb_array_length(periods) not between 1 and 124 or char_length(btrim(coalesce(reason,'')))>1000 then raise exception 'Choose up to 124 periods and a note of at most 1000 characters' using errcode='22023'; end if;
 insert into public.schedule_time_off_requests(id,workspace_id,employee_id,location_id,request_type,reason,created_by,period_version)
  values(rid,w,employee.id,parent.location_id,'time_off_cancellation',btrim(coalesce(reason,'')),actor,2);
 insert into public.time_off_cancellation_links values(rid,w,parent.id,parent.revision);
 for p in select value from jsonb_array_elements(periods) loop
  select * into original from public.schedule_time_off_segments where id=(p->>'segment_id')::uuid and workspace_id=w and request_id=parent.id;
  if original.id is null or original.time_timezone is null then raise exception 'Choose a snapshotted approved period from this leave' using errcode='22023'; end if;
  if coalesce(p->>'starts_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' or coalesce(p->>'ends_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then
   raise exception 'Cancellation needs exact start and end instants' using errcode='22023'; end if;
  a:=(p->>'starts_at')::timestamptz; b:=(p->>'ends_at')::timestamptz;
  if not isfinite(a) or not isfinite(b) or a>=b or a<=now() then raise exception 'Only future approved hours can be cancelled' using errcode='22023'; end if;
  span:=tstzrange(a,b,'[)');
  if not(public.time_off_effective_ranges(original.id) @> span) or covered && span then raise exception 'Cancellation must select approved hours without overlap' using errcode='22023'; end if;
  covered:=covered+tstzmultirange(span); zone_name:=original.time_timezone; sid:=gen_random_uuid();
  insert into public.schedule_time_off_segments(id,workspace_id,request_id,segment_date,start_time,end_time,time_timezone,starts_at,ends_at,ends_next_day)
   values(sid,w,rid,(a at time zone zone_name)::date,(a at time zone zone_name)::time,(b at time zone zone_name)::time,zone_name,a,b,
    (b at time zone zone_name)::date>(a at time zone zone_name)::date);
  insert into public.time_off_cancellation_periods values(sid,w,rid,original.id,parent.id);
 end loop;
 insert into public.schedule_time_off_events(workspace_id,request_id,action,actor_user_id,note,metadata)
  values(w,rid,'submitted',actor,btrim(coalesce(reason,'')),jsonb_build_object('parent_request_id',parent.id,'parent_revision',parent.revision,'operation_id',operation_id));
 result:=coalesce(app_private.record_owner_time_off(actor,w,rid),jsonb_build_object('status','pending','request_id',rid,'revision',1));
 insert into public.time_off_commands(workspace_id,actor_user_id,operation_id,input,result) values(w,actor,operation_id,command,result);
 return result;
end $function$
;

-- 3. The owner's requests still pending from before are recorded approved.
do $$
declare
  pending record;
begin
  for pending in
    select r.id, r.workspace_id, e.user_id
    from public.schedule_time_off_requests r
    join public.employee_profiles e on e.id = r.employee_id and e.workspace_id = r.workspace_id
    where r.status = 'pending' and e.user_id is not null
    order by r.created_at
  loop
    perform app_private.record_owner_time_off(pending.user_id, pending.workspace_id, pending.id);
  end loop;
end;
$$;

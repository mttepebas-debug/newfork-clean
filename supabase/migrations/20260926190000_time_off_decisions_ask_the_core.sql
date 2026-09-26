-- BL-177: time-off decisions ask the authorization core.
--
-- A request goes one rank up and nobody decides their own (REUSE "Rütbe"):
-- a manager decides an employee's request at their location, never another
-- manager's, an admin's or the owner's; an admin decides a manager's, never
-- another admin's or the owner's; the owner decides an admin's. Both decision
-- functions asked the old Schedule helper (permission + location) and checked
-- "not your own" by hand, so a manager could approve another manager's leave
-- at the same location, and an admin the owner's.
--
-- Both now ask app_private.authorize(actor, w, 'time_off.decide',
-- target_locations => array[<request location>], target_person => <requester>).
-- time_off.decide is a place action with no_self and rank_below, so a no is
-- 42501 with authz.rank (their own, or not ranked below), authz.out_of_scope
-- (another location) or authz.missing_permission. Every path goes through
-- them: approve / deny / revoke / reopen, partial (period) decisions,
-- cancellations and the assignment-aware entry point
-- (resolve_schedule_time_off_request_service and
-- resolve_time_off_period_decision_service are sql wrappers of
-- decide_time_off_with_assignments_service, which calls
-- apply_time_off_period_decision directly or through
-- apply_time_off_cancellation_decision). The entry point asks first, so a
-- refusal comes before any preview or idempotent replay; the shared decision
-- step keeps its own check. Signatures, grants and what each returns stay the
-- same; bodies are the live definitions with only the check lines changed.
-- supabase/tests/time_off_decisions_go_one_rank_up.test.sql.

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
 perform app_private.authorize(actor_user_id,target_workspace_id,'time_off.decide',target_locations=>array[r.location_id],target_person=>r.employee_id);
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
 perform app_private.authorize(actor,w,'time_off.decide',target_locations=>array[r.location_id],target_person=>r.employee_id);
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

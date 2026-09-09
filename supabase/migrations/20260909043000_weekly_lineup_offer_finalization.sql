-- Only accepted employee offers switch here. Direct staffing and transfer
-- commands retain their current adapter until their manager decision UI ships.
create function public.weekly_lineup_accepted_offer(w uuid,op jsonb) returns public.lineup_proposals
language plpgsql stable security definer set search_path='' as $$
declare p public.lineup_proposals%rowtype;
begin
 select * into p from public.lineup_proposals where workspace_id=w and id=(op->>'_weekly_offer_id')::uuid and kind='offer';
 if p.id is null or p.status<>'accepted' or p.expires_at<=now() or p.responded_at is null
  or op->>'kind' not in ('assign','replace')
  or (op-'_weekly_offer_id'-'travel_minutes') is distinct from (p.operation-'travel_minutes')
  or p.employee_id::text is distinct from op->>'employee_id' then
  raise exception 'Current acceptance for this offer is required' using errcode='PT409'; end if;
 if p.employee_acceptance is not null and (
  p.employee_acceptance->>'proposal_id' is distinct from p.id::text
  or p.employee_acceptance->>'employee_id' is distinct from p.employee_id::text
  or p.employee_acceptance->'target' is distinct from p.operation->'target'
  or not exists(select 1 from public.employee_profiles e where e.workspace_id=w and e.id=p.employee_id
    and e.user_id::text=p.employee_acceptance->>'actor_user_id')) then
  raise exception 'Offer acceptance no longer matches this assignment' using errcode='PT409'; end if;
 return p;
end; $$;

create function public.weekly_lineup_offer_candidate(w uuid,emp uuid,target jsonb,excluded uuid[],travel integer,op jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.lineup_proposals%rowtype; result jsonb;
begin
 if op->>'_weekly_offer_id' is null then return public.lineup_candidate_check(w,emp,target,excluded,travel); end if;
 p:=public.weekly_lineup_accepted_offer(w,op);
 if emp is distinct from p.employee_id or target is distinct from p.operation->'target' then
  raise exception 'Offer acceptance is not transferable' using errcode='PT409'; end if;
 result:=public.weekly_assignment_candidate_check(w,emp,target||'{"requires_employee_access":true}',excluded,travel);
 return jsonb_build_object('employee_id',emp,'status',result->'status','reasons',case when result->>'status'='eligible'
  then '["Employee offer acceptance retained"]'::jsonb else result->'reasons' end);
end; $$;

create function public.record_weekly_lineup_offer_assignment(actor uuid,w uuid,source_id uuid,logical_id uuid,emp uuid,target jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare p public.lineup_proposals%rowtype; a jsonb; s jsonb; employee_actor uuid;
begin
 if target->>'_weekly_offer_id' is null then return; end if;
 perform public.availability_lock_workspace(w);
 select * into p from public.lineup_proposals where workspace_id=w and id=(target->>'_weekly_offer_id')::uuid for update;
 p:=public.weekly_lineup_accepted_offer(w,p.operation||jsonb_build_object('_weekly_offer_id',p.id));
 if emp is distinct from p.employee_id or logical_id is null
  or (target-'_weekly_offer_id'-'travel_minutes') is distinct from p.operation->'target'
  or source_id is distinct from (p.source_state->>'source_shift_id')::uuid
  or (source_id is not null and not exists(select 1 from public.schedule_published_shifts s
    where s.workspace_id=w and s.id=source_id and coalesce(s.source_shift_id,s.id)=logical_id)) then
  raise exception 'Offer acceptance is not transferable to this shift' using errcode='PT409'; end if;
 if not public.schedule_actor_can_publish_service(actor,w,p.target_location_id)
  or not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',p.target_location_id) then
  raise exception 'Offer assignment access denied' using errcode='42501'; end if;
 select user_id into employee_actor from public.employee_profiles where workspace_id=w and id=emp;
 if employee_actor is null then raise exception 'Employee acceptance identity unavailable' using errcode='42501'; end if;
 s:=target||jsonb_build_object('id',logical_id,'employee_id',emp,'scheduled_date',target->>'date','time_basis','explicit',
  'time_timezone',(select timezone from public.locations where workspace_id=w and id=p.target_location_id));
 a:=public.assess_weekly_shift_availability(w,emp,s);
 if a->>'operation' in ('blocked','verification_required') then
  raise exception 'Resolve shift hours or approved time off before assignment' using errcode='23514'; end if;
 update public.schedule_availability_overrides set revoked_at=now() where workspace_id=w and shift_id=logical_id and revoked_at is null;
 if a->>'operation'='warning_requires_override' then
  insert into public.schedule_availability_overrides(workspace_id,shift_id,employee_id,location_id,assessment_fingerprint,assessment,reason,actor_user_id)
  values(w,logical_id,emp,p.target_location_id,a->>'fingerprint',a||jsonb_build_object('consent_source','lineup_offer','consent_proposal_id',p.id,
   'acceptance_provenance',case when p.employee_acceptance is null then 'legacy_accepted_status' else 'employee_response' end),
   'Employee offer acceptance retained for this assignment.',employee_actor);
 end if;
end; $$;

do $offer_finalization$
declare body text; anchor text;
begin
 body:=replace(pg_get_functiondef('public.lineup_proposals_service(uuid,uuid,text,jsonb)'::regprocedure),E'\r','');
 anchor:='      if src is distinct from p.source_state then raise exception ''stale offer assignment; review the latest coverage need''; end if;';
 if position(anchor in body)=0 then raise exception 'Offer source review boundary changed'; end if;
 body:=replace(body,anchor,anchor||E'\n      op:=op||jsonb_build_object(''_weekly_offer_id'',p.id);');
 execute body;

 body:=pg_get_functiondef('public.lineup_operation_preview(uuid,uuid,jsonb)'::regprocedure);
 anchor:='check1:=public.lineup_candidate_check(w,candidate,target,exclude_ids,(op->>''travel_minutes'')::integer);';
 if position(anchor in body)=0 then raise exception 'Line Up candidate preview boundary changed'; end if;
 body:=replace(body,anchor,'check1:=public.weekly_lineup_offer_candidate(w,candidate,target,exclude_ids,(op->>''travel_minutes'')::integer,op);');
 anchor:='  fingerprint:=encode(';
 if position(anchor in body)=0 then raise exception 'Line Up fingerprint boundary changed'; end if;
 body:=replace(body,anchor,E'  if op->>''_weekly_offer_id'' is not null then effects:=array_append(effects,''Employee offer acceptance retained. Weekly preferences stay unchanged.''); end if;\n'||anchor);
 execute body;

 body:=replace(pg_get_functiondef('public.lineup_operations_service(uuid,uuid,text,jsonb)'::regprocedure),E'\r','');
 anchor:='    if (preview->>''requires_approval'')::boolean then raise exception ''Destination approval required; submit a transfer proposal''; end if;';
 if position(anchor in body)=0 then raise exception 'Final Line Up scope check changed'; end if;
 body:=replace(body,anchor,anchor||E'\n    if op->>''_weekly_offer_id'' is not null then target:=target||jsonb_build_object(''_weekly_offer_id'',op->>''_weekly_offer_id''); end if;');
 execute body;

 body:=replace(pg_get_functiondef('public.lineup_assign_segment(uuid,uuid,uuid,uuid,jsonb)'::regprocedure),E'\r','');
 anchor:='  new_id uuid; source_line public.schedule_lineup_entries%rowtype;';
 if position(anchor in body)=0 then raise exception 'Line Up segment declarations changed'; end if;
 body:=replace(body,anchor,anchor||' new_logical_id uuid;');
 anchor:='    update public.schedule_published_shifts set employee_id=emp,publication_id=pub.id';
 if position(anchor in body)=0 then raise exception 'Line Up existing shift writer changed'; end if;
 body:=replace(body,anchor,E'    perform public.record_weekly_lineup_offer_assignment(actor,w,source_id,old.source_shift_id,emp,target);\n'||anchor);
 anchor:='    insert into public.schedule_published_shifts(workspace_id, location_id, publication_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, source_shift_id)';
 if position(anchor in body)=0 then raise exception 'Line Up new shift writer changed'; end if;
 body:=replace(body,anchor,E'    new_logical_id:=gen_random_uuid();\n    perform public.record_weekly_lineup_offer_assignment(actor,w,null,new_logical_id,emp,target);\n'||anchor);
 anchor:='d, (target->>''start_time'')::time, (target->>''end_time'')::time, ''explicit'', null, dest.timezone, gen_random_uuid()) returning * into saved;';
 if position(anchor in body)=0 then raise exception 'Line Up logical shift identity changed'; end if;
 body:=replace(body,anchor,'d, (target->>''start_time'')::time, (target->>''end_time'')::time, ''explicit'', null, dest.timezone, new_logical_id) returning * into saved;');
 execute body;
end; $offer_finalization$;

revoke all on function public.weekly_lineup_accepted_offer(uuid,jsonb),
 public.weekly_lineup_offer_candidate(uuid,uuid,jsonb,uuid[],integer,jsonb),
 public.record_weekly_lineup_offer_assignment(uuid,uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;

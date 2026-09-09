-- One operation decision covers both swap directions. Individual assignment
-- fingerprints are added only after the complete current preview is accepted.
create function public.weekly_lineup_assignment_target(w uuid,emp uuid,target jsonb,preview jsonb,op jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a jsonb;
begin
 if preview->'availability_warning'->>'fingerprint' is null or emp is null then return target; end if;
 a:=public.assess_weekly_shift_availability(w,emp,target);
 if a->>'operation' in ('blocked','verification_required') then
  raise exception 'Resolve shift hours or approved time off before assigning' using errcode='23514'; end if;
 if a->>'operation'='warning_requires_override' then
  return target||jsonb_build_object('_weekly_manager_fingerprint',a->>'fingerprint','_weekly_transfer_id',op->>'_proposal_id');
 end if;
 return target;
end; $$;

do $transfer_acceptance$
declare body text; anchor text;
begin
 body:=pg_get_functiondef('public.weekly_lineup_offer_candidate(uuid,uuid,jsonb,uuid[],integer,jsonb)'::regprocedure);
 anchor:='return public.lineup_candidate_check(w,emp,target,excluded,travel);';
 if position(anchor in body)=0 then raise exception 'Remaining Line Up candidate boundary changed'; end if;
 body:=replace(body,anchor,'return public.weekly_lineup_manager_candidate(w,emp,target,excluded,travel);');
 body:=replace(body,'  if op->>''kind'' in (''assign'',''replace'') then return public.weekly_lineup_manager_candidate(w,emp,target,excluded,travel); end if;','');
 execute body;

 body:=pg_get_functiondef('public.lineup_operation_preview(uuid,uuid,jsonb)'::regprocedure);
 anchor:='check2:=public.lineup_candidate_check(w,(src->>''employee_id'')::uuid,other_target,exclude_ids,(op->>''travel_minutes'')::integer);';
 if position(anchor in body)=0 then raise exception 'Swap counterpart assessment changed'; end if;
 body:=replace(body,anchor,'check2:=public.weekly_lineup_manager_candidate(w,(src->>''employee_id'')::uuid,other_target,exclude_ids,(op->>''travel_minutes'')::integer);');
 anchor:='''availability_warning'',check1->''availability_warning''';
 if position(anchor in body)=0 then raise exception 'Operation warning projection changed'; end if;
 body:=replace(body,anchor,$warning$
 'availability_warning',case when check1->'availability_warning'->>'fingerprint' is not null
  or check2->'availability_warning'->>'fingerprint' is not null then jsonb_build_object(
   'fingerprint',encode(extensions.digest(convert_to(jsonb_build_array(check1->'availability_warning',check2->'availability_warning')::text,'UTF8'),'sha256'),'hex'),
   'policy',case when check1->'availability_warning'->>'policy'='confirm' or check2->'availability_warning'->>'policy'='confirm' then 'confirm' else 'warn' end) else null end
$warning$);
 execute body;

 body:=replace(pg_get_functiondef('public.lineup_operations_service(uuid,uuid,text,jsonb)'::regprocedure),E'\r','');
 anchor:='      target:=target||jsonb_build_object(''_weekly_manager_fingerprint'',preview->''availability_warning''->>''fingerprint'');';
 if position(anchor in body)=0 then raise exception 'Direct assignment marker boundary changed'; end if;
 body:=replace(body,anchor,'');
 anchor:='      perform public.lineup_assign_segment(actor,w,(other->>''source_shift_id'')::uuid,(src->>''employee_id'')::uuid,';
 if position(anchor in body)=0 then raise exception 'First swap writer changed'; end if;
 body:=replace(body,anchor,anchor||E'\n public.weekly_lineup_assignment_target(w,(src->>''employee_id'')::uuid,');
 anchor:='''travel_minutes'',preview->''effective_travel_minutes''));';
 -- Only the first swap write uses this helper; the later move release stays unassigned.
 if position(anchor in body)=0 then raise exception 'Swap target descriptor changed'; end if;
 body:=overlay(body placing '''travel_minutes'',preview->''effective_travel_minutes''),preview,op));' from position(anchor in body) for length(anchor));
 anchor:='    else employee_id:=case when op->>''kind''=''move'' then (src->>''employee_id'')::uuid else (op->>''employee_id'')::uuid end; end if;';
 if position(anchor in body)=0 then raise exception 'Primary operation employee resolution changed'; end if;
 body:=replace(body,anchor,anchor||E'\n    target:=public.weekly_lineup_assignment_target(w,employee_id,target,preview,op);');
 execute body;

 body:=pg_get_functiondef('public.record_weekly_lineup_manager_assignment(uuid,uuid,uuid,uuid,jsonb)'::regprocedure);
 anchor:='declare a jsonb; normalized jsonb; identified jsonb; loc uuid:=(target->>''location_id'')::uuid;';
 if position(anchor in body)=0 then raise exception 'Assignment evidence declarations changed'; end if;
 body:=replace(body,anchor,anchor||' p public.lineup_proposals%rowtype; jointly_authorized boolean:=false;');
 anchor:=' if logical_id is null or not public.schedule_actor_can_publish_service(actor,w,loc)';
 if position(anchor in body)=0 then raise exception 'Assignment evidence authorization changed'; end if;
 body:=replace(body,anchor,$scope$
 if target->>'_weekly_transfer_id' is not null then
  select * into p from public.lineup_proposals where workspace_id=w and id=(target->>'_weekly_transfer_id')::uuid;
  jointly_authorized:=p.kind='transfer' and p.status='pending' and p.expires_at>now()
   and p.operation->>'kind'='swap' and loc=p.source_location_id
   and public.schedule_actor_can_publish_service(actor,w,p.target_location_id)
   and public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',p.target_location_id)
   and public.schedule_actor_can_publish_service(p.created_by,w,p.source_location_id)
   and public.schedule_actor_has_capability_service(p.created_by,w,'schedule.lineup.manage',p.source_location_id);
 end if;
 if logical_id is null or (not coalesce(jointly_authorized,false) and (not public.schedule_actor_can_publish_service(actor,w,loc)
$scope$);
 anchor:='or not public.schedule_actor_has_capability_service(actor,w,''schedule.lineup.manage'',loc) then';
 if position(anchor in body)=0 then raise exception 'Assignment evidence Line Up scope changed'; end if;
 body:=replace(body,anchor,'or not public.schedule_actor_has_capability_service(actor,w,''schedule.lineup.manage'',loc))) then');
 body:=replace(body,'normalized:=target-''_weekly_manager_fingerprint'';','normalized:=target-''_weekly_manager_fingerprint''-''_weekly_transfer_id'';');
 body:=replace(body,'a||jsonb_build_object(''consent_source'',''lineup_manager'')',
  'a||jsonb_build_object(''consent_source'',''lineup_manager'',''consent_proposal_id'',target->>''_weekly_transfer_id'')');
 execute body;

 body:=pg_get_functiondef('public.lineup_proposals_service(uuid,uuid,text,jsonb)'::regprocedure);
 anchor:='    if not (preview->>''allowed'')::boolean then raise exception ''%'',preview->''blockers''; end if;';
 if position(anchor in body)=0 then raise exception 'Proposal approval validation changed'; end if;
 body:=replace(body,anchor,anchor||$fresh$
    if action='proposal_action' and preview->'availability_warning'->>'fingerprint' is not null
     and payload->>'fingerprint' is distinct from preview->>'fingerprint' then
      raise exception 'stale approval preview; review both assignments again'; end if;
$fresh$);
 anchor:='''fingerprint'',preview->>''fingerprint'',''idempotency_key'',p.id)';
 if position(anchor in body)=0 then raise exception 'Proposal final apply envelope changed'; end if;
 body:=replace(body,anchor,'''fingerprint'',preview->>''fingerprint'',''idempotency_key'',p.id,''confirm_availability'',payload->''confirm_availability'')');
 execute body;
end; $transfer_acceptance$;

revoke all on function public.weekly_lineup_assignment_target(uuid,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;

create function public.weekly_lineup_manager_candidate(w uuid,emp uuid,target jsonb,excluded uuid[],travel integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; a jsonb;
begin
 result:=public.weekly_assignment_candidate_check(w,emp,target,excluded,travel);
 a:=result->'availability';
 if result->>'status'='eligible' and exists(
  select 1 from public.schedule_published_shifts s
  join public.schedule_location_publications p on p.id=s.publication_id and p.status='current'
  join public.locations l on l.id=s.location_id
  where s.workspace_id=w and s.id=any(excluded)
   and public.schedule_availability_identity(to_jsonb(s))=public.schedule_availability_identity(
    target||jsonb_build_object('id',coalesce(s.source_shift_id,s.id),'employee_id',emp,
      'scheduled_date',target->>'date','time_basis','explicit','time_timezone',l.timezone))) then
  a:=null;
  result:=result||jsonb_build_object('reasons','["Existing published responsibility retained"]'::jsonb);
 end if;
 return (result-'availability')||jsonb_build_object('availability_warning',case
  when result->>'status'='eligible' and a->>'operation'='warning_requires_override'
  then jsonb_build_object('fingerprint',a->>'fingerprint','policy',a->>'warning_policy') else null end);
end; $$;

create function public.record_weekly_lineup_manager_assignment(actor uuid,w uuid,logical_id uuid,emp uuid,target jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare a jsonb; normalized jsonb; identified jsonb; loc uuid:=(target->>'location_id')::uuid;
begin
 if target->>'_weekly_manager_fingerprint' is null then return; end if;
 perform public.availability_lock_workspace(w);
 if logical_id is null or not public.schedule_actor_can_publish_service(actor,w,loc)
  or not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',loc) then
  raise exception 'Line Up assignment access denied' using errcode='42501'; end if;
 normalized:=target-'_weekly_manager_fingerprint';
 a:=public.assess_weekly_shift_availability(w,emp,normalized);
 if a->>'fingerprint' is distinct from target->>'_weekly_manager_fingerprint' then
  raise exception 'Review the current availability conflict before assigning' using errcode='40001'; end if;
 if a->>'operation' in ('blocked','verification_required') then
  raise exception 'Resolve shift hours or approved time off before assigning' using errcode='23514'; end if;
 identified:=normalized||jsonb_build_object('id',logical_id,'employee_id',emp,'scheduled_date',target->>'date','time_basis','explicit',
  'time_timezone',(select timezone from public.locations where workspace_id=w and id=loc));
 a:=public.assess_weekly_shift_availability(w,emp,identified);
 update public.schedule_availability_overrides set revoked_at=now() where workspace_id=w and shift_id=logical_id and revoked_at is null;
 if a->>'operation'='warning_requires_override' then
  insert into public.schedule_availability_overrides(workspace_id,shift_id,employee_id,location_id,assessment_fingerprint,assessment,reason,actor_user_id)
  values(w,logical_id,emp,loc,a->>'fingerprint',a||jsonb_build_object('consent_source','lineup_manager'),
   case when a->>'warning_policy'='confirm' then 'Availability conflict confirmed by manager.' else 'Availability warning acknowledged (warn policy).' end,actor);
 end if;
end; $$;

do $direct_assignment$
declare body text; anchor text;
begin
 body:=pg_get_functiondef('public.weekly_lineup_offer_candidate(uuid,uuid,jsonb,uuid[],integer,jsonb)'::regprocedure);
 anchor:='if op->>''_weekly_offer_id'' is null then return public.lineup_candidate_check(w,emp,target,excluded,travel); end if;';
 if position(anchor in body)=0 then raise exception 'Offer/direct candidate boundary changed'; end if;
 body:=replace(body,anchor,$candidate$
 if op->>'_weekly_offer_id' is null then
  if op->>'kind' in ('assign','replace') then return public.weekly_lineup_manager_candidate(w,emp,target,excluded,travel); end if;
  return public.lineup_candidate_check(w,emp,target,excluded,travel);
 end if;
$candidate$);
 execute body;

 body:=pg_get_functiondef('public.lineup_candidate_option(uuid,uuid,uuid,jsonb,uuid[],jsonb)'::regprocedure);
 anchor:='public.lineup_candidate_check(w,emp,target,excluded)';
 if position(anchor in body)=0 then raise exception 'Candidate list boundary changed'; end if;
 execute replace(body,anchor,'public.weekly_lineup_manager_candidate(w,emp,target,excluded)');

 body:=pg_get_functiondef('public.lineup_operation_preview(uuid,uuid,jsonb)'::regprocedure);
 anchor:='''blockers'',to_jsonb(blocked))';
 if position(anchor in body)=0 then raise exception 'Line Up preview response changed'; end if;
 execute replace(body,anchor,'''blockers'',to_jsonb(blocked),''availability_warning'',check1->''availability_warning'')');

 body:=pg_get_functiondef('public.lineup_operations_service(uuid,uuid,text,jsonb)'::regprocedure);
 anchor:='    if (preview->>''requires_approval'')::boolean then raise exception ''Destination approval required; submit a transfer proposal''; end if;';
 if position(anchor in body)=0 then raise exception 'Direct assignment approval boundary changed'; end if;
 body:=replace(body,anchor,anchor||$decision$
    if preview->'availability_warning'->>'fingerprint' is not null then
      if preview->'availability_warning'->>'policy'='confirm' and not coalesce((payload->>'confirm_availability')::boolean,false) then
        raise exception 'Confirm the availability conflict before assigning' using errcode='22023'; end if;
      target:=target||jsonb_build_object('_weekly_manager_fingerprint',preview->'availability_warning'->>'fingerprint');
    end if;
$decision$);
 execute body;

 body:=pg_get_functiondef('public.record_weekly_lineup_offer_assignment(uuid,uuid,uuid,uuid,uuid,jsonb)'::regprocedure);
 anchor:='if target->>''_weekly_offer_id'' is null then return; end if;';
 if position(anchor in body)=0 then raise exception 'Line Up guarded writer dispatch changed'; end if;
 execute replace(body,anchor,'if target->>''_weekly_offer_id'' is null then perform public.record_weekly_lineup_manager_assignment(actor,w,logical_id,emp,target); return; end if;');
end; $direct_assignment$;

revoke all on function public.weekly_lineup_manager_candidate(uuid,uuid,jsonb,uuid[],integer),
 public.record_weekly_lineup_manager_assignment(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;

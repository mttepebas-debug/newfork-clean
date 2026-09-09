-- Staged manual-assignment adapter. Canonical consumers switch together after
-- publication, drop and employee-voluntary-acceptance adapters are ready.
create function public.prepare_weekly_schedule_assignment(actor uuid,w uuid,s jsonb,previous jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare a jsonb; preview jsonb; evidence jsonb; logical_id uuid:=coalesce(s->>'source_shift_id',s->>'id')::uuid;
 loc uuid:=(s->>'location_id')::uuid; emp uuid:=(s->>'employee_id')::uuid;
begin
 perform public.availability_lock_workspace(w);
 if logical_id is null or not public.schedule_actor_can_manage_service(actor,w,loc) then
  raise exception 'Schedule location access denied' using errcode='42501'; end if;
 if emp is not null and not exists(select 1 from public.employee_location_assignments
  where workspace_id=w and employee_id=emp and location_id=loc and ended_at is null) then
  raise exception 'Employee is not assigned to this location' using errcode='42501'; end if;
 if public.schedule_availability_prior_publication(w,s) is not null then return; end if;
 if emp is null then
  update public.schedule_availability_overrides set revoked_at=now() where workspace_id=w and shift_id=logical_id and revoked_at is null;
  return;
 end if;
 a:=public.assess_weekly_shift_availability(w,emp,s);
 if a->>'operation' in ('blocked','verification_required') then
  raise exception 'Resolve shift hours or approved time off before saving' using errcode='23514',detail=a::text;
 end if;
 evidence:=public.schedule_availability_override(w,s,a);
 -- Only an existing same-identity assignment can reuse its acceptance.
 if evidence is not null and previous is not null
  and coalesce(previous->>'source_shift_id',previous->>'id')=logical_id::text
  and previous->>'employee_id'=emp::text then return; end if;
 if a->>'operation'='warning_requires_override' then
  preview:=public.assess_weekly_shift_availability(w,emp,s-'id'-'source_shift_id');
  if s->>'availability_assessment_fingerprint' is distinct from preview->>'fingerprint' then
   raise exception 'Review the current availability assessment before saving' using errcode='40001'; end if;
 end if;
 update public.schedule_availability_overrides set revoked_at=now() where workspace_id=w and shift_id=logical_id and revoked_at is null;
 if a->>'operation'='warning_requires_override' then
  insert into public.schedule_availability_overrides(workspace_id,shift_id,employee_id,location_id,assessment_fingerprint,assessment,reason,actor_user_id)
  values(w,logical_id,emp,loc,a->>'fingerprint',a,
   case when a->>'warning_policy'='confirm' then 'Availability conflict confirmed by manager.' else 'Availability warning acknowledged (warn policy).' end,actor);
 end if;
end; $$;
revoke all on function public.prepare_weekly_schedule_assignment(uuid,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;

create function public.assess_weekly_schedule_assignment_service(actor uuid,w uuid,shift jsonb,target_shift_id uuid default null,target_session_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare previous jsonb; normalized jsonb; identified jsonb; a jsonb; current_a jsonb; loc uuid:=(shift->>'location_id')::uuid;
begin
 if not public.schedule_actor_can_manage_service(actor,w,loc) then raise exception 'Schedule location access denied' using errcode='42501'; end if;
 if target_session_id is not null then
  if not exists(select 1 from public.schedule_edit_sessions where workspace_id=w and id=target_session_id and holder_user_id=actor and status='active' and expires_at>now()) then
   raise exception 'Edit session not found or expired' using errcode='42501'; end if;
  select to_jsonb(s) into previous from public.schedule_edit_session_shifts s where workspace_id=w and session_id=target_session_id and id=target_shift_id;
  if target_shift_id is not null and previous is null then raise exception 'Shift no longer exists in this edit session' using errcode='P0002'; end if;
 end if;
 if not exists(select 1 from public.employee_location_assignments where workspace_id=w and employee_id=(shift->>'employee_id')::uuid and location_id=loc and ended_at is null) then
  raise exception 'Employee is not assigned to this location' using errcode='42501'; end if;
 normalized:=public.normalize_schedule_time_source(w,shift,previous)-'id'-'source_shift_id';
 a:=public.assess_weekly_shift_availability(w,(shift->>'employee_id')::uuid,normalized);
 identified:=normalized||jsonb_build_object('id',target_shift_id);
 if target_shift_id is not null and public.schedule_availability_prior_publication(w,identified) is not null then
  a:=a||jsonb_build_object('operation','allowed','reasons','[]'::jsonb,'responsibility_retained',true);
 elsif previous is not null and a->>'operation'='warning_requires_override' then
  current_a:=public.assess_weekly_shift_availability(w,(shift->>'employee_id')::uuid,identified);
  if public.schedule_availability_override(w,identified,current_a) is not null then
   a:=a||jsonb_build_object('override_recorded',true);
  end if;
 end if;
 return a||jsonb_build_object('can_override',true);
end; $$;
revoke all on function public.assess_weekly_schedule_assignment_service(uuid,uuid,jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.assess_weekly_schedule_assignment_service(uuid,uuid,jsonb,uuid,uuid) to service_role;

-- Exchange-only transition. Line Up keeps its existing command/consent adapter.
create function public.weekly_exchange_candidate_check(w uuid,emp uuid,target jsonb,excluded uuid[] default '{}') returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('status',r->>'status','reasons',case when r->>'status'='eligible'
  then '["Position and location match","No assignment blockers"]'::jsonb else r->'reasons' end)
 from (select public.weekly_assignment_candidate_check(w,emp,target,excluded) r) q;
$$;

-- Only the actor's own preference contributes to this token. Changing a
-- private manager reminder cannot expose that reminder through token changes.
create function public.weekly_exchange_employee_warning(w uuid,emp uuid,target jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a jsonb;
begin
 a:=public.assess_weekly_shift_availability(w,emp,target||jsonb_build_object('scheduled_date',target->>'date'));
 if a->>'operation' in ('blocked','verification_required') or jsonb_array_length(a->'employee_intervals')=0 then return null; end if;
 return jsonb_build_object('fingerprint',encode(extensions.digest(convert_to(jsonb_build_object(
  'workspace',w,'employee',emp,'source',target->>'source_id','location',target->>'location_id',
  'intervals',a->'intervals','conflicts',a->'employee_intervals')::text,'UTF8'),'sha256'),'hex'));
end; $$;

create function public.require_weekly_exchange_employee_warning(actor uuid,w uuid,emp uuid,target jsonb,command jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare warning jsonb;
begin
 if not exists(select 1 from public.employee_profiles e join public.workspace_memberships m
  on m.workspace_id=e.workspace_id and m.user_id=e.user_id and m.status='active'
  where e.workspace_id=w and e.id=emp and e.user_id=actor and e.archived_at is null) then
  raise exception 'Employee acceptance access denied' using errcode='42501'; end if;
 warning:=public.weekly_exchange_employee_warning(w,emp,target);
 if warning is not null and command->>'availability_fingerprint' is distinct from warning->>'fingerprint' then
  raise exception 'Your availability conflicts with this shift. Refresh the request and choose to continue anyway.' using errcode='PT409'; end if;
end; $$;

-- Called only after the final scoped preview and published-row locks, inside
-- the existing command transaction. A client cannot assert voluntary consent.
create function public.record_weekly_exchange_acceptance(w uuid,cid uuid,aid uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c public.shift_exchange_cases%rowtype; app public.shift_exchange_applications%rowtype;
 s jsonb; t jsonb; item record; a jsonb; actor uuid; normalized jsonb;
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
  a:=public.assess_weekly_shift_availability(w,item.emp,normalized);
  if a->>'operation' in ('blocked','verification_required') then
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
end; $$;

do $exchange_consumers$
declare f regprocedure; body text; anchor text;
begin
 -- No global Line Up substitution and no employee source rows in shared reads.
 foreach f in array array[
  'public.shift_exchanges_command_service(uuid,uuid,jsonb,uuid)'::regprocedure,
  'public.shift_exchanges_read_service(uuid,uuid,boolean,date,date,uuid)'::regprocedure,
  'public.shift_exchanges_candidates_service(uuid,uuid,uuid)'::regprocedure,
  'public.shift_exchange_preview(uuid,uuid,uuid,uuid)'::regprocedure,
  'public.shift_exchange_emit_notification_base(uuid,uuid,uuid,uuid,text,text,text)'::regprocedure,
  'public.shift_exchange_notification_allowed_staffing_base(uuid,uuid)'::regprocedure
 ] loop
  body:=pg_get_functiondef(f);
  if position('public.lineup_candidate_check(' in body)=0 then raise exception 'Exchange candidate call changed: %',f; end if;
  execute replace(body,'public.lineup_candidate_check(','public.weekly_exchange_candidate_check(');
 end loop;

 body:=pg_get_functiondef('public.shift_exchanges_command_service(uuid,uuid,jsonb,uuid)'::regprocedure);
 anchor:='    if public.weekly_exchange_candidate_check(w,emp.id,t,array[';
 if position(anchor in body)=0 then raise exception 'Swap acceptance boundary changed'; end if;
 body:=replace(body,anchor,E'    perform public.require_weekly_exchange_employee_warning(actor,w,emp.id,t,command);\n'||anchor);
 anchor:='   if public.weekly_exchange_candidate_check(w,emp.id,s)->>''status''<>''eligible''';
 if position(anchor in body)=0 then raise exception 'Pickup acceptance boundary changed'; end if;
 body:=replace(body,anchor,E'   perform public.require_weekly_exchange_employee_warning(actor,w,emp.id,s,command);\n'||anchor);
 anchor:='     if public.weekly_exchange_candidate_check(w,emp.id,s,array_remove(';
 if position(anchor in body)=0 then raise exception 'Invitation acceptance boundary changed'; end if;
 body:=replace(body,anchor,E'     perform public.require_weekly_exchange_employee_warning(actor,w,emp.id,s,command);\n'||anchor);
 anchor:='      update public.schedule_published_shifts set employee_id=a.employee_id';
 if position(anchor in body)=0 then raise exception 'Final transfer boundary changed'; end if;
 body:=replace(body,anchor,E'      perform public.record_weekly_exchange_acceptance(w,cid,aid);\n'||anchor);
 execute body;

 body:=pg_get_functiondef('public.shift_exchanges_read_service(uuid,uuid,boolean,date,date,uuid)'::regprocedure);
 anchor:='public.weekly_exchange_candidate_check(w,a.employee_id,s,array_remove(array[(s->>''id'')::uuid,(t->>''id'')::uuid],null))';
 if position(anchor in body)=0 then raise exception 'Application read boundary changed'; end if;
 body:=replace(body,anchor,anchor||' || case when a.employee_id=emp.id and a.status=''invited'' then jsonb_build_object(''availability_warning'',public.weekly_exchange_employee_warning(w,emp.id,s)) else ''{}''::jsonb end');
 anchor:='chk:=public.weekly_exchange_candidate_check(w,emp.id,s);';
 if position(anchor in body)=0 then raise exception 'Opportunity read boundary changed'; end if;
 body:=replace(body,anchor,'chk:=public.weekly_exchange_candidate_check(w,emp.id,s)||jsonb_build_object(''availability_warning'',public.weekly_exchange_employee_warning(w,emp.id,s));');
 execute body;

 body:=pg_get_functiondef('public.shift_exchanges_candidates_service(uuid,uuid,uuid)'::regprocedure);
 anchor:='shifts:=shifts||jsonb_build_array(t);';
 if position(anchor in body)=0 then raise exception 'Swap candidate read boundary changed'; end if;
 body:=replace(body,anchor,'shifts:=shifts||jsonb_build_array(t||jsonb_build_object(''availability_warning'',public.weekly_exchange_employee_warning(w,emp.id,t)));');
 execute body;
end; $exchange_consumers$;

revoke all on function public.weekly_exchange_candidate_check(uuid,uuid,jsonb,uuid[]),
 public.weekly_exchange_employee_warning(uuid,uuid,jsonb),
 public.require_weekly_exchange_employee_warning(uuid,uuid,uuid,jsonb,jsonb),
 public.record_weekly_exchange_acceptance(uuid,uuid,uuid) from public,anon,authenticated,service_role;

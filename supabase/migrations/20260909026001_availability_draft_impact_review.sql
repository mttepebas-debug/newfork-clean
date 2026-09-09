-- One evaluator serves current capacity and a read-only proposed-capacity
-- context. Resolving a reviewed request removes only its own pending notice.
do $context$ declare body text; anchor text; begin
 body:=pg_get_functiondef('public.assess_shift_availability_core(uuid,uuid,jsonb,boolean)'::regprocedure);
 anchor:='public.assess_shift_availability_core(w uuid, emp uuid, shift jsonb, service_independent boolean)';
 if position(anchor in body)=0 then raise exception 'Availability core signature changed'; end if;
 body:=replace(body,anchor,'public.assess_shift_availability_context(w uuid, emp uuid, shift jsonb, service_independent boolean, proposed jsonb, resolved_request uuid)');
 anchor:='public.availability_capacity_for_span(w,emp,coalesce(span,day_span))';
 if position(anchor in body)=0 then raise exception 'Availability capacity call changed'; end if;
 body:=replace(body,anchor,'public.availability_capacity_for_span(w,emp,coalesce(span,day_span),proposed)');
 anchor:='public.availability_shift_type_rules(w,emp,coalesce(span,day_span))';
 if position(anchor in body)=0 then raise exception 'Availability service rules changed'; end if;
 body:=replace(body,anchor,'public.availability_shift_type_rules(w,emp,coalesce(span,day_span),proposed)');
 anchor:='from public.availability_requests r where r.workspace_id=w and r.employee_id=emp';
 if position(anchor in body)=0 then raise exception 'Availability pending notices changed'; end if;
 body:=replace(body,anchor,anchor||' and r.id is distinct from resolved_request');
 execute body;
end $context$;
revoke all on function public.assess_shift_availability_context(uuid,uuid,jsonb,boolean,jsonb,uuid) from public,anon,authenticated,service_role;
create or replace function public.assess_shift_availability_core(w uuid,emp uuid,shift jsonb,service_independent boolean)
returns jsonb language sql stable security definer set search_path='' as $$
 select public.assess_shift_availability_context(w,emp,shift,service_independent,null,null);
$$;

create function public.availability_impact_assessment(a jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(key,value),'{}')||'{"can_override":false}'::jsonb from jsonb_each(a)
 where key=any(array['coverage','operation','time_basis','timezone','assessment_scope','intervals','available_intervals','unavailable_intervals','unknown_intervals',
  'reasons','fingerprint','policy_revision','fold_resolution','assessment_minutes','override_recorded']);
$$;
create function public.availability_impact_comparison(a jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('coverage',a->'coverage','operation',a->'operation','available',a->'available_intervals','unavailable',a->'unavailable_intervals','unknown',a->'unknown_intervals',
 'types',coalesce((select jsonb_agg(value order by value) from (select distinct jsonb_build_object('id',r->'shift_type_id','start_at',r->'start_at','end_at',r->'end_at') value from jsonb_array_elements(a->'type_restrictions') r) rules),'[]'));
$$;
revoke all on function public.availability_impact_assessment(jsonb),public.availability_impact_comparison(jsonb) from public,anon,authenticated,service_role;

create function public.preview_availability_draft_impact_service(actor uuid,w uuid,command jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare emp public.employee_profiles%rowtype; r public.availability_requests%rowtype; settings public.workspace_scheduling_settings%rowtype;
 current_revision integer; p jsonb; resolved_request uuid; s record; before_assessment jsonb; after_assessment jsonb; classification jsonb;
 before_state jsonb; after_state jsonb; evidence jsonb:='[]'; rows jsonb:='[]'; visible boolean; affected_count integer:=0; restricted_count integer:=0;
 blocking_count integer:=0; warning_count integer:=0; verification_count integer:=0; cleared_count integer:=0; fingerprint text;
begin
 if jsonb_typeof(command) is distinct from 'object' or command->>'action' is null or command->>'action' not in('submit','approve') then raise exception 'Choose an availability proposal or approval to review' using errcode='22023'; end if;
 select * into emp from public.employee_profiles where workspace_id=w and id=(command->>'employee_id')::uuid and archived_at is null;
 if emp.id is null or coalesce(emp.user_id=actor,false) or not public.availability_actor_scope(actor,w,emp.id,false) then
  raise exception 'Manager access to this employee is required to review draft shifts' using errcode='42501'; end if;
 select coalesce(max(version_number),0) into current_revision from public.employee_schedule_availability_versions where workspace_id=w and employee_id=emp.id;
 select * into settings from public.workspace_scheduling_settings where workspace_id=w;
 if (command->>'expected_revision')::integer is distinct from current_revision then raise exception 'Availability changed; refresh before reviewing draft shifts' using errcode='40001'; end if;
 if command->>'action'='approve' then
  select * into r from public.availability_requests where workspace_id=w and employee_id=emp.id and id=(command->>'request_id')::uuid;
  if r.id is null then raise exception 'Availability request not found' using errcode='P0002'; end if;
  if r.revision is distinct from (command->>'expected_request_revision')::integer or r.status<>'pending_review'
   or settings.availability_policy_revision is distinct from (command->>'policy_revision')::integer then
   raise exception 'This review changed; refresh the availability request' using errcode='40001'; end if;
  p:=r.proposal; resolved_request:=r.id;
 else
  p:=command->'proposal'; resolved_request:=(command->>'supersedes_request_id')::uuid;
  p:=p||jsonb_build_object('replace_version_ids',coalesce(command->'replace_version_ids','[]'));
 end if;
 perform public.validate_availability_week(p->>'timezone',p->'days');
 perform public.validate_availability_shift_types(w,p->'days');
 if p->>'effective_from' is null or not isfinite((p->>'effective_from')::date)
  or (p->>'effective_until' is not null and not isfinite((p->>'effective_until')::date))
  or (p->>'effective_until')::date<(p->>'effective_from')::date or (p->>'kind'='temporary' and p->>'effective_until' is null) then
  raise exception 'Choose valid availability dates' using errcode='22023'; end if;
 perform public.availability_validate_date_override_replacements(w,emp.id,p,coalesce(p->'replace_version_ids','[]'));
 if public.availability_period_locked(w,emp.id,(p->>'effective_from')::date,(p->>'effective_until')::date)
  or public.availability_date_overrides_locked(w,emp.id,public.availability_resolve_date_overrides(p)) then
  raise exception 'This period is published. Availability cannot change published responsibilities.' using errcode='23514'; end if;
 for s in with candidates as (
  select 'saved_draft'::text source,d.id container_id,shift.id shift_id,to_jsonb(shift) payload
   from public.schedule_draft_shifts shift join public.schedule_drafts d on d.id=shift.draft_id and d.workspace_id=shift.workspace_id
   where shift.workspace_id=w and shift.employee_id=emp.id and d.archived_at is null
    and shift.scheduled_date>=(p->>'effective_from')::date-3 and shift.scheduled_date<=coalesce((p->>'effective_until')::date+3,'infinity'::date)
  union all
  select 'active_edit',session.id,shift.id,to_jsonb(shift)
   from public.schedule_edit_session_shifts shift join public.schedule_edit_sessions session on session.id=shift.session_id and session.workspace_id=shift.workspace_id
   where shift.workspace_id=w and shift.employee_id=emp.id and session.status='active' and session.expires_at>now() and coalesce(shift.pending_op_type,'')<>'delete'
    and shift.scheduled_date>=(p->>'effective_from')::date-3 and shift.scheduled_date<=coalesce((p->>'effective_until')::date+3,'infinity'::date)
 ) select c.*,l.name location_name,j.name job_name,t.name shift_type_name from candidates c
 join public.locations l on l.workspace_id=w and l.id=(c.payload->>'location_id')::uuid
 left join public.jobs j on j.workspace_id=w and j.id=(c.payload->>'job_id')::uuid
 left join public.shift_types t on t.workspace_id=w and t.id=(c.payload->>'shift_type_id')::uuid
 order by c.payload->>'scheduled_date',c.payload->>'location_id',c.source,c.container_id,c.shift_id loop
  -- A draft copy cannot relinquish an already-published responsibility.
  if public.schedule_availability_prior_publication(w,s.payload) is not null then continue; end if;
  classification:=public.schedule_service_classification(w,emp.id,s.payload);
  before_assessment:=public.assess_shift_availability_context(w,emp.id,s.payload,classification is not null,null,resolved_request);
  after_assessment:=public.assess_shift_availability_context(w,emp.id,s.payload,classification is not null,p,resolved_request);
  if before_assessment->>'operation'='warning_requires_override' and public.schedule_availability_override(w,s.payload,before_assessment) is not null then
   before_assessment:=before_assessment||'{"operation":"allowed","reasons":[],"override_recorded":true}'::jsonb; end if;
  if after_assessment->>'operation'='warning_requires_override' and public.schedule_availability_override(w,s.payload,after_assessment) is not null then
   after_assessment:=after_assessment||'{"operation":"allowed","reasons":[],"override_recorded":true}'::jsonb; end if;
  before_state:=public.availability_impact_comparison(before_assessment); after_state:=public.availability_impact_comparison(after_assessment);
  if before_state=after_state then continue; end if;
  visible:=public.schedule_actor_has_capability_service(actor,w,'schedule.read',(s.payload->>'location_id')::uuid)
    and public.schedule_actor_has_capability_service(actor,w,'employees.read',(s.payload->>'location_id')::uuid);
  affected_count:=affected_count+1;
  blocking_count:=blocking_count+case when after_assessment->>'operation'='blocked' then 1 else 0 end;
  warning_count:=warning_count+case when after_assessment->>'operation'='warning_requires_override' then 1 else 0 end;
  verification_count:=verification_count+case when after_assessment->>'operation'='verification_required' then 1 else 0 end;
  cleared_count:=cleared_count+case when after_assessment->>'operation'='allowed' and before_assessment->>'operation'<>'allowed' then 1 else 0 end;
  evidence:=evidence||jsonb_build_array(jsonb_build_object('source',s.source,'container',s.container_id,'identity',public.schedule_availability_identity(s.payload),
    'before',before_state,'after',after_state,'visible',visible,'before_fingerprint',before_assessment->'fingerprint','after_fingerprint',after_assessment->'fingerprint'));
  if not visible then restricted_count:=restricted_count+1; continue; end if;
  rows:=rows||jsonb_build_array(jsonb_build_object('key',s.source||':'||s.container_id||':'||s.shift_id,'source',s.source,'shift_id',s.shift_id,
   'location_id',s.payload->'location_id','location_name',s.location_name,'job_name',coalesce(s.job_name,''),'shift_type_name',s.shift_type_name,
   'scheduled_date',s.payload->'scheduled_date','start_time',s.payload->'start_time','end_time',s.payload->'end_time',
   'before',public.availability_impact_assessment(before_assessment),'after',public.availability_impact_assessment(after_assessment)));
 end loop;
 fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object('actor',actor,'workspace',w,'employee',emp.id,'proposal',p,
  'resolved_request',resolved_request,'request_revision',r.revision,'revision',current_revision,'policy_revision',settings.availability_policy_revision,'evidence',evidence)::text,'UTF8'),'sha256'),'hex');
 return jsonb_build_object('employee_id',emp.id,'request_id',r.id,'revision',current_revision,'policy_revision',settings.availability_policy_revision,
  'fingerprint',fingerprint,'affected_count',affected_count,'restricted_count',restricted_count,'blocking_count',blocking_count,
  'warning_count',warning_count,'verification_count',verification_count,'cleared_count',cleared_count,'shifts',rows);
end $$;
revoke all on function public.preview_availability_draft_impact_service(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.preview_availability_draft_impact_service(uuid,uuid,jsonb) to service_role;

create table public.availability_draft_impact_reviews(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
 request_id uuid not null,actor_id uuid not null references auth.users(id),
 action text not null check(action in('submit','approve')),fingerprint text not null check(length(fingerprint)=64),
 reviewed_snapshot jsonb not null,created_at timestamptz not null default now(),
 foreign key(request_id,workspace_id) references public.availability_requests(id,workspace_id));
alter table public.availability_draft_impact_reviews enable row level security;
revoke all on public.availability_draft_impact_reviews from public,anon,authenticated,service_role;
create function public.guard_availability_draft_impact_review() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Draft impact review evidence is immutable' using errcode='23514'; end $$;
revoke all on function public.guard_availability_draft_impact_review() from public,anon,authenticated,service_role;
create trigger immutable_availability_draft_impact_review before update or delete on public.availability_draft_impact_reviews for each row execute function public.guard_availability_draft_impact_review();

-- Recompute after the command's workspace lock. Idempotent retries return their
-- earlier committed result before this check; no stale preview changes a shift.
do $guard$ declare body text; anchor text; begin
 body:=pg_get_functiondef('public.availability_command_service(uuid,uuid,jsonb,uuid)'::regprocedure);
 anchor:='action_name text:=command->>''action'';';
 if position(anchor in body)=0 then raise exception 'Availability command variables changed'; end if;
 body:=replace(body,anchor,'draft_impact jsonb; '||anchor);
 anchor:='  insert into public.availability_requests(workspace_id,employee_id,author_id,proposal,before_snapshot,base_revision,policy_revision,policy_snapshot,';
 if position(anchor in body)=0 then raise exception 'Availability submission boundary changed'; end if;
 body:=replace(body,anchor,$check$
  if not is_self then
   draft_impact:=public.preview_availability_draft_impact_service(actor,w,command);
   if ((draft_impact->>'affected_count')::integer>0 or command->>'impact_fingerprint' is not null) and command->>'impact_fingerprint' is distinct from draft_impact->>'fingerprint' then
    raise exception 'Draft shifts changed or have not been reviewed. Check the current draft impact before submitting.' using errcode='40001'; end if;
  end if;
 $check$||anchor);
 anchor:='if action_name=''approve'' then next_revision:=public.availability_activate(r,actor);';
 if position(anchor in body)=0 then raise exception 'Availability approval boundary changed'; end if;
 body:=replace(body,anchor,$check$if action_name='approve' then
    draft_impact:=public.preview_availability_draft_impact_service(actor,w,command);
    if ((draft_impact->>'affected_count')::integer>0 or command->>'impact_fingerprint' is not null) and command->>'impact_fingerprint' is distinct from draft_impact->>'fingerprint' then
     raise exception 'Draft shifts changed or have not been reviewed. Check the current draft impact before approving.' using errcode='40001'; end if;
    next_revision:=public.availability_activate(r,actor);$check$);
 anchor:=' perform public.availability_emit(r,actor,action_name);';
 if position(anchor in body)=0 then raise exception 'Availability command audit boundary changed'; end if;
 body:=replace(body,anchor,$check$
 if draft_impact is not null and command->>'impact_fingerprint' is not null then
  insert into public.availability_draft_impact_reviews(workspace_id,request_id,actor_id,action,fingerprint,reviewed_snapshot)
   values(w,r.id,actor,action_name,draft_impact->>'fingerprint',draft_impact);
 end if;
 $check$||anchor);
 execute body;
end $guard$;

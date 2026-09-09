-- Schedule writes use the same physical assessment as Line Up / Shift Hub.
-- Draft hydration retains repairable work; new assignments and publication are
-- checked under the workspace lock. Published responsibilities retain evidence.

insert into public.permissions(key,label,category,description,custom_grantable,sort_order)
values('schedule.availability.override','Override soft availability conflicts','Schedule',
 'Record a reason for one assignment outside confirmed availability in accessible locations. Hard conflicts and approved leave cannot be overridden.',true,44)
on conflict(key) do nothing;
insert into public.workspace_role_permissions(workspace_id,role_id,permission_key)
select workspace_id,id,'schedule.availability.override' from public.workspace_roles where system_key in ('owner','admin','manager')
on conflict do nothing;
do $roles$
declare body text;
begin
 body:=pg_get_functiondef('public.initialize_workspace_roles(uuid)'::regprocedure);
 if position('''schedule.manage'', ''schedule.publish''' in body)=0 then raise exception 'Role initializer changed'; end if;
 body:=replace(body,'''schedule.manage'', ''schedule.publish''', '''schedule.manage'', ''schedule.availability.override'', ''schedule.publish''');
 execute body;
end; $roles$;

create table public.schedule_availability_overrides (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 shift_id uuid not null, employee_id uuid not null, location_id uuid not null,
 assessment_fingerprint text not null check(length(assessment_fingerprint)=64), assessment jsonb not null,
 reason text not null check(length(btrim(reason)) between 10 and 500), actor_user_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(), revoked_at timestamptz,
 foreign key(employee_id,workspace_id) references public.employee_profiles(id,workspace_id),
 foreign key(location_id,workspace_id) references public.locations(id,workspace_id)
);
create unique index schedule_availability_override_active on public.schedule_availability_overrides(workspace_id,shift_id,assessment_fingerprint) where revoked_at is null;
alter table public.schedule_availability_overrides enable row level security;
revoke all on public.schedule_availability_overrides from public,anon,authenticated,service_role;
grant select on public.schedule_availability_overrides to service_role;
alter table public.schedule_published_shifts add column availability_snapshot jsonb;

create function public.schedule_availability_identity(s jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',coalesce(s->>'source_shift_id',s->>'id'),'employee_id',s->>'employee_id',
 'location_id',s->>'location_id','job_id',s->>'job_id','shift_type_id',s->>'shift_type_id',
 'scheduled_date',coalesce(s->>'scheduled_date',s->>'date'),'start_time',nullif(s->>'start_time','')::time,
 'end_time',nullif(s->>'end_time','')::time,'time_basis',s->>'time_basis','time_snapshot',s->'time_snapshot','time_timezone',s->>'time_timezone');
$$;
revoke all on function public.schedule_availability_identity(jsonb) from public,anon,authenticated,service_role;

-- Only the latest publication can retain an assignment. An old historical match
-- cannot revive an assignment removed/reassigned by a later publication.
create function public.schedule_availability_prior_publication(w uuid,s jsonb,exclude_publication uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(shift) from public.schedule_published_shifts shift
 join lateral (
  select p.id from public.schedule_location_publications p
  where p.workspace_id=w and p.location_id=(s->>'location_id')::uuid
   and (s->>'scheduled_date')::date between p.week_start and p.week_start+6
   and p.id is distinct from exclude_publication
   and (exclude_publication is null or p.version_number < (select version_number from public.schedule_location_publications where id=exclude_publication and workspace_id=w))
  order by p.version_number desc limit 1
 ) latest on latest.id=shift.publication_id
 where shift.workspace_id=w and public.schedule_availability_identity(to_jsonb(shift))=public.schedule_availability_identity(s)
 limit 1;
$$;
revoke all on function public.schedule_availability_prior_publication(uuid,jsonb,uuid) from public,anon,authenticated,service_role;

create function public.schedule_availability_override(w uuid,s jsonb,a jsonb) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(o) from public.schedule_availability_overrides o where o.workspace_id=w
  and o.shift_id=coalesce(s->>'source_shift_id',s->>'id')::uuid and o.employee_id=(s->>'employee_id')::uuid
  and o.location_id=(s->>'location_id')::uuid and o.assessment_fingerprint=a->>'fingerprint' and o.revoked_at is null limit 1;
$$;
revoke all on function public.schedule_availability_override(uuid,jsonb,jsonb) from public,anon,authenticated,service_role;

create function public.schedule_prepare_availability_assignment(actor uuid,w uuid,s jsonb,previous jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare a jsonb; preview jsonb; note text:=btrim(coalesce(s->>'conflict_override_note','')); same_assignment boolean;
begin
 perform public.availability_lock_workspace(w);
 same_assignment:=previous is not null and public.schedule_availability_identity(previous)=public.schedule_availability_identity(s);
 if same_assignment or public.schedule_availability_prior_publication(w,s) is not null then return; end if;
 -- Changing away and back must not revive a prior approval.
 update public.schedule_availability_overrides set revoked_at=now() where workspace_id=w and shift_id=(s->>'id')::uuid and revoked_at is null;
 if s->>'employee_id' is null then return; end if;
 a:=public.assess_shift_availability(w,(s->>'employee_id')::uuid,s);
 if a->>'operation'='blocked' then raise exception 'This assignment conflicts with hard availability or approved time off' using errcode='23514',detail=a::text; end if;
 if a->>'operation'<>'warning_requires_override' then return; end if;
 if not public.schedule_actor_has_capability_service(actor,w,'schedule.availability.override',(s->>'location_id')::uuid) then
  raise exception 'Soft availability override permission required for this location' using errcode='42501'; end if;
 preview:=public.assess_shift_availability(w,(s->>'employee_id')::uuid,s-'id');
 if s->>'availability_assessment_fingerprint' is distinct from preview->>'fingerprint' then
  raise exception 'Review the current availability assessment before overriding' using errcode='40001'; end if;
 if length(note) not between 10 and 500 then raise exception 'Explain this availability override in 10 to 500 characters' using errcode='22023'; end if;
 insert into public.schedule_availability_overrides(workspace_id,shift_id,employee_id,location_id,assessment_fingerprint,assessment,reason,actor_user_id)
 values(w,(s->>'id')::uuid,(s->>'employee_id')::uuid,(s->>'location_id')::uuid,a->>'fingerprint',a,note,actor);
end; $$;
revoke all on function public.schedule_prepare_availability_assignment(uuid,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;

create function public.guard_schedule_assignment_availability() returns trigger
language plpgsql security definer set search_path='' as $$
declare s jsonb:=to_jsonb(new); prior jsonb; a jsonb; evidence jsonb; logical_id uuid; hydrated boolean:=false;
begin
 perform public.availability_lock_workspace(new.workspace_id);
 logical_id:=coalesce(s->>'source_shift_id',s->>'id')::uuid;
 s:=s||jsonb_build_object('id',logical_id);
 if tg_op='UPDATE' and public.schedule_availability_identity(s)=public.schedule_availability_identity(to_jsonb(old)) then
  if tg_table_name='schedule_published_shifts' then new.availability_snapshot:=old.availability_snapshot; end if;
  return new;
 end if;
 prior:=public.schedule_availability_prior_publication(new.workspace_id,s,case when tg_table_name='schedule_published_shifts' then (s->>'publication_id')::uuid end);
 if prior is not null then
  if tg_table_name='schedule_published_shifts' then
   new.availability_snapshot:=coalesce(nullif(prior->'availability_snapshot','null'),jsonb_build_object(
    'status','legacy_published','original_published_shift_id',prior->>'id','original_publication_id',prior->>'publication_id',
    'message','This existing responsibility predates availability snapshots. Historical availability is not reconstructed.'));
  end if;
  return new;
 end if;
 if tg_table_name<>'schedule_published_shifts' and tg_op='INSERT' then
  -- Acquiring/recovering a draft must remain possible when its old assessment
  -- has become stale. The assignment is retained for repair, not certified.
  select exists(select 1 from public.schedule_draft_shifts x where x.workspace_id=new.workspace_id and x.id=logical_id and public.schedule_availability_identity(to_jsonb(x))=public.schedule_availability_identity(s))
    or exists(select 1 from public.schedule_edit_session_shifts x where x.workspace_id=new.workspace_id and x.id=logical_id and public.schedule_availability_identity(to_jsonb(x))=public.schedule_availability_identity(s)) into hydrated;
  if hydrated then return new; end if;
 end if;
 if new.employee_id is null then
  if tg_table_name='schedule_published_shifts' then new.availability_snapshot:=jsonb_build_object('status','unassigned'); end if;
  return new;
 end if;
 a:=public.assess_shift_availability(new.workspace_id,new.employee_id,s);
 evidence:=public.schedule_availability_override(new.workspace_id,s,a);
 if tg_table_name='schedule_published_shifts' and evidence is null then
  select to_jsonb(o) into evidence from public.schedule_publication_overrides o where o.workspace_id=new.workspace_id
   and o.publication_id=new.publication_id and o.finding_code='availability' and o.finding_id=a->>'fingerprint'
   and logical_id=any(o.source_shift_ids) and o.employee_id=new.employee_id and o.location_id=new.location_id
   and public.schedule_actor_has_capability_service(o.actor_user_id,new.workspace_id,'schedule.availability.override',new.location_id) limit 1;
 end if;
 if a->>'operation'='blocked' or (tg_table_name='schedule_published_shifts' and a->>'operation'='verification_required') then
  raise exception 'Resolve availability, shift hours or approved time off before this assignment' using errcode='23514',detail=a::text;
 end if;
 if a->>'operation'='warning_requires_override' and evidence is null then
  raise exception 'A current, scoped availability override with a reason is required' using errcode='23514',detail=a::text;
 end if;
 if tg_table_name='schedule_published_shifts' then
  new.availability_snapshot:=jsonb_build_object('status','assessed','captured_at',now(),'assessment',a,'override',evidence);
 elsif tg_op='UPDATE' then
  update public.schedule_availability_overrides set revoked_at=now() where workspace_id=new.workspace_id and shift_id=logical_id
   and revoked_at is null and assessment_fingerprint<>a->>'fingerprint';
 end if;
 return new;
end; $$;
revoke all on function public.guard_schedule_assignment_availability() from public,anon,authenticated,service_role;
create trigger zz_availability_assignment before insert or update on public.schedule_edit_session_shifts for each row execute function public.guard_schedule_assignment_availability();
create trigger zz_availability_assignment before insert or update on public.schedule_draft_shifts for each row execute function public.guard_schedule_assignment_availability();
create trigger zz_availability_assignment before insert or update on public.schedule_published_shifts for each row execute function public.guard_schedule_assignment_availability();

-- A scoped read gives the client the current physical decision, never authority
-- to grant an override. Commit recomputes it after acquiring the workspace lock.
create function public.assess_schedule_shift_service(actor uuid,w uuid,shift jsonb,target_shift_id uuid default null,target_session_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare previous jsonb; normalized jsonb; a jsonb; loc uuid:=(shift->>'location_id')::uuid;
begin
 if not public.schedule_actor_can_manage_service(actor,w,loc) then raise exception 'Schedule location access denied' using errcode='42501'; end if;
 if target_session_id is not null then
  if not exists(select 1 from public.schedule_edit_sessions where workspace_id=w and id=target_session_id and holder_user_id=actor and status='active' and expires_at>now()) then
   raise exception 'Edit session not found or expired' using errcode='42501'; end if;
  select to_jsonb(s) into previous from public.schedule_edit_session_shifts s where workspace_id=w and session_id=target_session_id and id=target_shift_id;
 end if;
 if not exists(select 1 from public.employee_location_assignments where workspace_id=w and employee_id=(shift->>'employee_id')::uuid and location_id=loc and ended_at is null) then
  raise exception 'Employee is not assigned to this location' using errcode='42501'; end if;
 normalized:=public.normalize_schedule_time_source(w,shift,previous);
 a:=public.assess_shift_availability(w,(shift->>'employee_id')::uuid,normalized-'id');
 if target_shift_id is not null and public.schedule_availability_prior_publication(w,normalized||jsonb_build_object('id',target_shift_id)) is not null then
  a:=a||jsonb_build_object('operation','allowed','reasons','[]'::jsonb,'responsibility_retained',true);
 end if;
 return a||jsonb_build_object('can_override',public.schedule_actor_has_capability_service(actor,w,'schedule.availability.override',loc));
end; $$;
revoke all on function public.assess_schedule_shift_service(uuid,uuid,jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.assess_schedule_shift_service(uuid,uuid,jsonb,uuid,uuid) to service_role;

-- Keep existing lease, reference, document, label and idempotency validation.
do $mutation$
declare body text; anchor text;
begin
 body:=replace(pg_get_functiondef('public.mutate_schedule_edit_shift_service_base(uuid,uuid,uuid,integer,text,uuid,integer,jsonb,uuid)'::regprocedure),E'\r\n',E'\n');
 body:=replace(body,E'begin\n  select * into target_session',E'begin\n  perform public.availability_lock_workspace(target_workspace_id);\n  select * into target_session');
 anchor:=E'    insert into public.schedule_edit_session_shifts (id,';
 if position(anchor in body)=0 then raise exception 'Shift mutation insert changed'; end if;
 body:=replace(body,anchor,E'    target_shift_id:=coalesce(target_shift_id,gen_random_uuid());\n    perform public.schedule_prepare_availability_assignment(actor_user_id,target_workspace_id,shift_payload||jsonb_build_object(''id'',target_shift_id),null);\n'||anchor);
 anchor:=E'  elsif operation = ''update'' then\n    update public.schedule_edit_session_shifts shift';
 if position(anchor in body)=0 then raise exception 'Shift mutation update changed'; end if;
 body:=replace(body,anchor,E'  elsif operation = ''update'' then\n    perform public.schedule_prepare_availability_assignment(actor_user_id,target_workspace_id,shift_payload||jsonb_build_object(''id'',target_shift_id),(select to_jsonb(s) from public.schedule_edit_session_shifts s where s.workspace_id=target_workspace_id and s.session_id=target_session_id and s.id=target_shift_id));\n    update public.schedule_edit_session_shifts shift');
 anchor:=E'  else\n    delete from public.schedule_edit_session_shifts shift';
 body:=replace(body,anchor,E'  else\n    update public.schedule_availability_overrides set revoked_at=now() where workspace_id=target_workspace_id and shift_id=target_shift_id and revoked_at is null;\n    delete from public.schedule_edit_session_shifts shift');
 execute body;
end; $mutation$;

create function public.schedule_availability_publication_preflight(payload jsonb,actor uuid,departments uuid[] default null,include_no_department boolean default true) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare findings jsonb; signatures jsonb:='[]'; s record; a jsonb; prior jsonb; evidence jsonb;
 unsigned jsonb; w uuid:=(payload->>'workspace_id')::uuid; code text; soft boolean; message text;
begin
 if payload->>'status'='past_week_closed' then return payload; end if;
 select coalesce(jsonb_agg(f),'[]') into findings from jsonb_array_elements(payload->'findings') f
  where f->>'code' not in ('availability','time_source_unresolved');
 for s in select d.* from public.schedule_draft_shifts d where d.workspace_id=w and d.draft_id=(payload->>'draft_id')::uuid
  and d.employee_id is not null and d.location_id in (select (l->>'location_id')::uuid from jsonb_array_elements(payload->'locations') l)
  and public.schedule_shift_in_department_scope_service(d.job_id,departments,coalesce(include_no_department,true)) order by d.id loop
  prior:=public.schedule_availability_prior_publication(w,to_jsonb(s));
  if prior is not null then
   signatures:=signatures||jsonb_build_array(jsonb_build_object('shift_id',s.id,'retained_publication_id',prior->>'publication_id'));
   continue;
  end if;
  a:=public.assess_shift_availability(w,s.employee_id,to_jsonb(s));
  evidence:=public.schedule_availability_override(w,to_jsonb(s),a);
  signatures:=signatures||jsonb_build_array(jsonb_build_object('shift_id',s.id,'fingerprint',a->>'fingerprint','override_id',evidence->>'id'));
  if a->>'operation'='allowed' or (a->>'operation'='warning_requires_override' and evidence is not null) then continue; end if;
  soft:=a->>'operation'='warning_requires_override' and public.schedule_actor_has_capability_service(actor,w,'schedule.availability.override',s.location_id);
  code:=case when exists(select 1 from jsonb_array_elements(a->'reasons') r where r->>'code'='approved_time_off') then 'time_off'
    when s.time_basis in ('unresolved','legacy_unverified') then 'time_source_unresolved'
    when a->>'coverage'='unknown' then 'availability_unknown' else 'availability' end;
  select string_agg(r->>'message',' ' order by ord) into message from jsonb_array_elements(a->'reasons') with ordinality r(r,ord);
  if a->>'operation'='warning_requires_override' and not soft then message:='A manager with availability override permission must review this assignment.'; end if;
  findings:=findings||jsonb_build_array(jsonb_build_object('id',a->>'fingerprint','code',code,'severity',case when soft then 'soft' else 'hard' end,
   'overrideable',soft,'location_id',s.location_id,'employee_id',s.employee_id,'scheduled_date',s.scheduled_date,'shift_ids',jsonb_build_array(s.id),
   'message',left(coalesce(message,'Resolve availability before publishing.'),500)));
 end loop;
 unsigned:=(payload-'fingerprint'-'status')||jsonb_build_object('findings',findings,'availability_assessments',signatures);
 return unsigned||jsonb_build_object('status',case when exists(select 1 from jsonb_array_elements(findings) f where f->>'severity'='hard') then 'hard_blocked'
  when jsonb_array_length(findings)>0 then 'override_required' else 'publish_ready' end,
  'fingerprint',encode(extensions.digest(convert_to(unsigned::text,'UTF8'),'sha256'),'hex'));
end; $$;
revoke all on function public.schedule_availability_publication_preflight(jsonb,uuid,uuid[],boolean) from public,anon,authenticated,service_role;

create or replace function public.preview_schedule_publication_service(actor_user_id uuid,target_workspace_id uuid,target_draft_id uuid,target_location_ids uuid[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select public.schedule_availability_publication_preflight(public.availability_publication_preflight(public.preview_schedule_publication_before_availability_review_service(actor_user_id,target_workspace_id,target_draft_id,target_location_ids)),actor_user_id);
$$;
create or replace function public.preview_schedule_publication_service(actor_user_id uuid,target_workspace_id uuid,target_draft_id uuid,target_location_ids uuid[],target_department_ids uuid[],include_no_department boolean) returns jsonb
language sql stable security definer set search_path='' as $$
 select public.schedule_availability_publication_preflight(public.availability_publication_preflight(public.preview_schedule_publication_before_availability_review_service(actor_user_id,target_workspace_id,target_draft_id,target_location_ids,target_department_ids,include_no_department)),actor_user_id,target_department_ids,include_no_department);
$$;

-- Register publication decisions before inserting assignments so even a direct
-- table writer must supply the exact validated decision. Everything rolls back
-- together if any assignment fails its final check.
do $publication$
declare sig regprocedure; body text; first_at integer; end_at integer; decision_loop text; insertion_at integer;
begin
 foreach sig in array array[
  'public.publish_schedule_draft_service_document_conflict_base(uuid,uuid,uuid,uuid[],uuid[],boolean,integer,text,jsonb)'::regprocedure,
  'public.publish_schedule_draft_service_label_base(uuid,uuid,uuid,uuid[],integer,text,jsonb)'::regprocedure
 ] loop
  body:=replace(pg_get_functiondef(sig),E'\r\n',E'\n');
  first_at:=position(E'    for finding in select value from jsonb_array_elements(preview->''findings'')' in body);
  end_at:=position(E'    end loop;\n  end loop;' in body);
  if first_at=0 or end_at<first_at then raise exception 'Publication decision loop changed: %',sig; end if;
  decision_loop:=substr(body,first_at,end_at-first_at+length(E'    end loop;\n'));
  body:=left(body,first_at-1)||substr(body,end_at+length(E'    end loop;\n'));
  insertion_at:=position(E'    if previous_publication_id is not null then\n      update public.schedule_location_publications\n      set superseded_by' in body);
  if insertion_at=0 then insertion_at:=position(E'    insert into public.schedule_published_shifts' in body); end if;
  if insertion_at=0 then raise exception 'Publication assignment insertion changed: %',sig; end if;
  body:=left(body,insertion_at-1)||decision_loop||substr(body,insertion_at);
  body:=replace(body,E'    if finding->>''severity'' <> ''soft'' then continue; end if;',E'    if finding->>''severity'' <> ''soft'' then continue; end if;\n    if finding->>''code''=''availability'' and not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,''schedule.availability.override'',(finding->>''location_id'')::uuid) then raise exception ''Availability override permission required'' using errcode=''42501''; end if;');
  execute body;
 end loop;
end; $publication$;

-- Auto-fill considers only fully confirmed capacity. It never manufactures a
-- soft override. The apply function re-runs this preview under the same lock.
do $autofill$
declare body text; first_at integer; end_at integer;
begin
 body:=replace(pg_get_functiondef('public.preview_schedule_auto_fill_service(uuid,uuid,uuid)'::regprocedure),E'\r\n',E'\n');
 first_at:=position('      and not exists(select 1 from public.employee_schedule_availability_versions' in body);
 end_at:=position('      and not exists(select 1 from jsonb_array_elements(proposals)' in body);
 if first_at=0 or end_at<first_at then raise exception 'Auto-fill availability filter changed'; end if;
 body:=left(body,first_at-1)||E'      and (public.assess_shift_availability(target_workspace_id,e.id,to_jsonb(open_shift)||jsonb_build_object(''employee_id'',e.id))->>''operation'')=''allowed''\n'||substr(body,end_at);
 -- Include assessment fingerprints so a policy/version change invalidates the
 -- recommendation even if the same candidates happen to remain eligible.
 body:=replace(body,'''primary_job'',is_primary,''reasons''',
  '''availability_fingerprint'',public.assess_shift_availability(target_workspace_id,employee_id,to_jsonb(open_shift)||jsonb_build_object(''employee_id'',employee_id))->>''fingerprint'',''primary_job'',is_primary,''reasons''');
 execute body;
end; $autofill$;

-- Shared lock order with Exchange: workspace assignment lock, then availability.
create or replace function public.availability_lock_workspace(w uuid) returns void language sql set search_path='' as $$
 select pg_advisory_xact_lock(hashtextextended(w::text,921));
 select pg_advisory_xact_lock(hashtextextended('availability-publication:'||w::text,0));
$$;
do $writer_locks$
declare fn record; body text;
begin
 for fn in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
  where n.nspname='public' and l.lanname='plpgsql' and 'target_workspace_id'=any(p.proargnames)
   and (p.prosrc ~* '(insert into|update|delete from) public.schedule_(edit_session_shifts|draft_shifts|published_shifts)'
    or p.proname in ('resolve_schedule_time_off_request_service','apply_schedule_auto_fill_service')) loop
  body:=pg_get_functiondef(fn.oid);
  body:=regexp_replace(body,'\mBEGIN\M',E'begin\n perform public.availability_lock_workspace(target_workspace_id);','i');
  execute body;
 end loop;
end; $writer_locks$;

-- Pending review findings are scope-level (possibly no shifts); use bounded IDs.
do $pending_id$
declare body text;
begin
 body:=pg_get_functiondef('public.availability_publication_preflight(jsonb)'::regprocedure);
 body:=replace(body,'''availability-review:''||r.id::text||'':''||(loc->>''location_id'')',
  'encode(extensions.digest(convert_to(''availability-review:''||r.id::text||'':''||(loc->>''location_id''),''UTF8''),''sha256''),''hex'')');
 execute body;
end; $pending_id$;

-- Raw leave / timezone / policy writers must not change evidence between final
-- assessment and commit. A row trigger must fail fast, because its statement
-- may already hold a row lock needed by a concurrent assignment operation.
create function public.guard_schedule_availability_input_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare workspaces uuid[]; w uuid;
begin
 if tg_op='INSERT' then workspaces:=array[new.workspace_id];
 elsif tg_op='DELETE' then workspaces:=array[old.workspace_id];
 else workspaces:=array[old.workspace_id,new.workspace_id]; end if;
 for w in select distinct x from unnest(workspaces) x where x is not null order by x loop
  if not pg_try_advisory_xact_lock(hashtextextended(w::text,921))
   or not pg_try_advisory_xact_lock(hashtextextended('availability-publication:'||w::text,0)) then
   raise exception 'The schedule is being updated. Your changes were not saved; review and retry.' using errcode='PT409';
  end if;
 end loop;
 if tg_op='DELETE' then return old; end if; return new;
end; $$;
revoke all on function public.guard_schedule_availability_input_write() from public,anon,authenticated,service_role;
create trigger a_availability_input_write before insert or update or delete on public.schedule_time_off_requests for each row execute function public.guard_schedule_availability_input_write();
create trigger a_availability_input_write before insert or update or delete on public.schedule_time_off_segments for each row execute function public.guard_schedule_availability_input_write();
create trigger a_availability_input_write before update on public.workspace_scheduling_settings for each row execute function public.guard_schedule_availability_input_write();
create trigger a_availability_input_write before update of timezone on public.locations for each row execute function public.guard_schedule_availability_input_write();

create function public.guard_schedule_availability_override_history() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' or (to_jsonb(new)-'revoked_at') is distinct from (to_jsonb(old)-'revoked_at') or old.revoked_at is not null or new.revoked_at is null then
  raise exception 'Availability override history is immutable' using errcode='23514'; end if;
 return new;
end; $$;
revoke all on function public.guard_schedule_availability_override_history() from public,anon,authenticated,service_role;
create trigger availability_override_history before update or delete on public.schedule_availability_overrides for each row execute function public.guard_schedule_availability_override_history();

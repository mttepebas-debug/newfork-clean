-- Explicit service-independent work is a manager decision for one assignment.
-- It changes only service semantics, never physical hours or approved leave.
create table public.schedule_service_classifications (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 shift_id uuid not null, employee_id uuid not null, location_id uuid not null,
 assignment_identity jsonb not null, reason text not null check(length(btrim(reason)) between 10 and 500),
 assessment_fingerprint text not null check(length(assessment_fingerprint)=64),
 actor_user_id uuid not null references auth.users(id), created_at timestamptz not null default now(), revoked_at timestamptz,
 foreign key(employee_id,workspace_id) references public.employee_profiles(id,workspace_id),
 foreign key(location_id,workspace_id) references public.locations(id,workspace_id)
);
create unique index schedule_service_classification_active on public.schedule_service_classifications(workspace_id,shift_id) where revoked_at is null;
alter table public.schedule_service_classifications enable row level security;
revoke all on public.schedule_service_classifications from public,anon,authenticated,service_role;

create function public.guard_schedule_service_classification_history() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if old.revoked_at is null and new.revoked_at is not null and to_jsonb(old)-'revoked_at'=to_jsonb(new)-'revoked_at' then return new; end if;
 end if;
 raise exception 'Service classification history is immutable' using errcode='23514';
end $$;
revoke all on function public.guard_schedule_service_classification_history() from public,anon,authenticated,service_role;
create trigger immutable_service_classification before update or delete on public.schedule_service_classifications for each row execute function public.guard_schedule_service_classification_history();

create function public.schedule_service_classification(w uuid,emp uuid,s jsonb) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('kind','custom','status','recorded','reason',c.reason,'recorded_at',c.created_at,'actor_user_id',c.actor_user_id)
 from public.schedule_service_classifications c where c.workspace_id=w and c.employee_id=emp
 and c.shift_id=coalesce(s->>'source_shift_id',s->>'id')::uuid and c.revoked_at is null
 and c.assignment_identity=public.schedule_availability_identity(s||jsonb_build_object('employee_id',emp))
 and s->>'shift_type_id' is null;
$$;
revoke all on function public.schedule_service_classification(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

-- The four-argument core is private. Public JSON never supplies its trusted
-- boolean; the ordinary resolver derives it only from stored scoped evidence.
do $core$ declare body text; anchor text; begin
 body:=pg_get_functiondef('public.assess_shift_availability(uuid,uuid,jsonb)'::regprocedure);
 body:=replace(body,'public.assess_shift_availability(w uuid, emp uuid, shift jsonb)',
  'public.assess_shift_availability_core(w uuid, emp uuid, shift jsonb, service_independent boolean)');
 if position('assess_shift_availability_core' in body)=0 then raise exception 'Assessment signature changed'; end if;
 anchor:='service_unknown:=shift->>''shift_type_id'' is null and jsonb_array_length(matching_types)>0;';
 if position(anchor in body)=0 then raise exception 'Service semantics changed'; end if;
 body:=replace(body,anchor,'service_unknown:=shift->>''shift_type_id'' is null and jsonb_array_length(matching_types)>0 and not service_independent;');
 anchor:=' result:=jsonb_build_object(''type_restrictions''';
 if position(anchor in body)=0 then raise exception 'Assessment evidence changed'; end if;
 body:=replace(body,anchor,' fingerprint_payload:=fingerprint_payload||case when service_independent then ''{"service_classification":"custom"}''::jsonb else ''{}''::jsonb end; '||anchor);
 execute body;
end $core$;
revoke all on function public.assess_shift_availability_core(uuid,uuid,jsonb,boolean) from public,anon,authenticated,service_role;

create or replace function public.assess_shift_availability(w uuid,emp uuid,shift jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare classification jsonb:=public.schedule_service_classification(w,emp,shift);
begin
 return public.assess_shift_availability_core(w,emp,shift,classification is not null)
  ||case when classification is null then '{}'::jsonb else jsonb_build_object('service_classification',classification) end;
end $$;

create function public.schedule_assess_availability_preview(w uuid,emp uuid,s jsonb) returns jsonb
language sql stable security definer set search_path='' as $$
 select public.assess_shift_availability_core(w,emp,s-'id',public.schedule_service_classification(w,emp,s) is not null);
$$;
revoke all on function public.schedule_assess_availability_preview(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create function public.schedule_prepare_service_classification(actor uuid,w uuid,s jsonb,previous jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare identity jsonb:=public.schedule_availability_identity(s); raw_assessment jsonb; note text:=btrim(s->>'service_classification_note');
begin
 perform public.availability_lock_workspace(w);
 if previous is not null and public.schedule_availability_identity(previous)<>identity then
  update public.schedule_service_classifications set revoked_at=now() where workspace_id=w
   and shift_id=(s->>'id')::uuid and revoked_at is null;
 end if;
 if note is null then return; end if;
 if not public.schedule_actor_can_manage_service(actor,w,(s->>'location_id')::uuid) then
  raise exception 'Schedule location access required to classify custom work' using errcode='42501'; end if;
 if s->>'employee_id' is null or s->>'shift_type_id' is not null or length(note) not between 10 and 500 then
  raise exception 'Classify an assigned unnamed shift and explain the work in 10 to 500 characters' using errcode='22023'; end if;
 raw_assessment:=public.assess_shift_availability_core(w,(s->>'employee_id')::uuid,s-'id',false);
 if raw_assessment->>'assessment_scope'<>'shift_interval' then raise exception 'Confirm shift hours before classifying custom work' using errcode='23514'; end if;
 if s->>'service_classification_fingerprint' is distinct from raw_assessment->>'fingerprint' then
  raise exception 'Review the current shift before classifying custom work' using errcode='40001'; end if;
 if exists(select 1 from public.schedule_service_classifications c where c.workspace_id=w and c.shift_id=(s->>'id')::uuid
  and c.revoked_at is null and c.assignment_identity=identity and c.reason=note) then return; end if;
 update public.schedule_service_classifications set revoked_at=now() where workspace_id=w and shift_id=(s->>'id')::uuid and revoked_at is null;
 insert into public.schedule_service_classifications(workspace_id,shift_id,employee_id,location_id,assignment_identity,reason,assessment_fingerprint,actor_user_id)
 values(w,(s->>'id')::uuid,(s->>'employee_id')::uuid,(s->>'location_id')::uuid,identity,note,raw_assessment->>'fingerprint',actor);
end $$;
revoke all on function public.schedule_prepare_service_classification(uuid,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;

do $prepare$ declare body text; anchor text; begin
 body:=pg_get_functiondef('public.schedule_prepare_availability_assignment(uuid,uuid,jsonb,jsonb)'::regprocedure);
 anchor:='perform public.availability_lock_workspace(w);';
 if position(anchor in body)=0 then raise exception 'Assignment preparation changed'; end if;
 body:=replace(body,anchor,anchor||' perform public.schedule_prepare_service_classification(actor,w,s,previous);');
 body:=replace(body,'if same_assignment or public.schedule_availability_prior_publication(w,s) is not null then return; end if;',
  'if (same_assignment and s->>''service_classification_note'' is null) or public.schedule_availability_prior_publication(w,s) is not null then return; end if;');
 anchor:='preview:=public.assess_shift_availability(w,(s->>''employee_id'')::uuid,s-''id'');';
 if position(anchor in body)=0 then raise exception 'Override preview changed'; end if;
 execute replace(body,anchor,'preview:=public.schedule_assess_availability_preview(w,(s->>''employee_id'')::uuid,s);');
end $prepare$;

-- Existing drafts may be classified without changing their clock fields. The
-- scoped read previews intent but never stores a decision or releases a shift.
do $preview$ declare body text; anchor text; begin
 body:=pg_get_functiondef('public.assess_schedule_shift_service(uuid,uuid,jsonb,uuid,uuid)'::regprocedure);
 body:=replace(body,'declare previous jsonb;','declare classification jsonb; raw_assessment jsonb; note text:=btrim(shift->>''service_classification_note''); previous jsonb;');
 anchor:='a:=public.assess_shift_availability(w,(shift->>''employee_id'')::uuid,normalized-''id'');';
 if position(anchor in body)=0 then raise exception 'Scoped assessment changed'; end if;
 body:=replace(body,anchor,$preview_body$
 classification:=public.schedule_service_classification(w,(shift->>'employee_id')::uuid,normalized||jsonb_build_object('id',target_shift_id));
 if note is not null then
  if shift->>'shift_type_id' is not null or length(note) not between 10 and 500 then
   raise exception 'Choose an unnamed shift and explain the custom work in 10 to 500 characters' using errcode='22023'; end if;
  raw_assessment:=public.assess_shift_availability_core(w,(shift->>'employee_id')::uuid,normalized-'id',false);
  if raw_assessment->>'assessment_scope'<>'shift_interval' then raise exception 'Confirm shift hours before classifying custom work' using errcode='23514'; end if;
  classification:=jsonb_build_object('kind','custom','status','preview','reason',note);
 end if;
 a:=public.assess_shift_availability_core(w,(shift->>'employee_id')::uuid,normalized-'id',classification is not null);
 if classification is not null then a:=a||jsonb_build_object('service_classification',classification); end if;
 if note is not null then a:=a||jsonb_build_object('service_classification_fingerprint',raw_assessment->>'fingerprint'); end if;
 $preview_body$);
 execute body;
end $preview$;

-- Non-editor writes cannot revive old classification by moving away and back.
do $guards$ declare body text; anchor text; begin
 body:=pg_get_functiondef('public.guard_schedule_assignment_availability()'::regprocedure);
 anchor:='s:=s||jsonb_build_object(''id'',logical_id);';
 if position(anchor in body)=0 then raise exception 'Assignment guard changed'; end if;
 execute replace(body,anchor,anchor||$guard_body$
 if tg_op='UPDATE' and public.schedule_availability_identity(to_jsonb(old))<>public.schedule_availability_identity(s) then
  update public.schedule_service_classifications c set revoked_at=now() where c.workspace_id=new.workspace_id and c.shift_id=logical_id
   and c.revoked_at is null and c.assignment_identity<>public.schedule_availability_identity(s);
 end if;
 $guard_body$);
 body:=pg_get_functiondef('public.revoke_removed_assignment_availability_override()'::regprocedure);
 anchor:=' return old;';
 if position(anchor in body)=0 then raise exception 'Assignment removal guard changed'; end if;
 execute replace(body,anchor,$remove_body$
 update public.schedule_service_classifications c set revoked_at=now() where c.workspace_id=old.workspace_id and c.shift_id=old.id and c.revoked_at is null
  and not exists(select 1 from public.schedule_edit_session_shifts s where s.workspace_id=c.workspace_id and s.id=c.shift_id and public.schedule_availability_identity(to_jsonb(s))=c.assignment_identity)
  and not exists(select 1 from public.schedule_draft_shifts s where s.workspace_id=c.workspace_id and s.id=c.shift_id and public.schedule_availability_identity(to_jsonb(s))=c.assignment_identity);
 $remove_body$||anchor);
 body:=pg_get_functiondef('public.bulk_delete_schedule_edit_shifts_service(uuid,uuid,uuid[])'::regprocedure);
 anchor:='  with draft_deletes as (';
 if position(anchor in body)=0 then raise exception 'Bulk deletion changed'; end if;
 execute replace(body,anchor,' update public.schedule_service_classifications set revoked_at=now() where workspace_id=target_workspace_id and shift_id=any(target_shift_ids) and revoked_at is null; '||anchor);
end $guards$;

do $read$ declare body text; anchor text; begin
 body:=pg_get_functiondef('public.schedule_availability_read_projection(uuid,uuid,jsonb)'::regprocedure);
 anchor:='''reasons'',''fingerprint'',''policy_revision''';
 if position(anchor in body)=0 then raise exception 'Public assessment projection changed'; end if;
 execute replace(body,anchor,'''service_classification'',''reasons'',''fingerprint'',''policy_revision''');
end $read$;

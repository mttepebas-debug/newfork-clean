alter table public.employee_onboarding_cases add column final_approval_required boolean;
update public.employee_onboarding_cases set final_approval_required=public.employee_onboarding_final_approval_required(workspace_id);
alter table public.employee_onboarding_cases alter column final_approval_required set not null;
create function app_private.snapshot_onboarding_final_approval() returns trigger language plpgsql security definer set search_path='' as $$
begin new.final_approval_required:=public.employee_onboarding_final_approval_required(new.workspace_id); return new; end;
$$;
revoke all on function app_private.snapshot_onboarding_final_approval() from public,anon,authenticated,service_role;
create trigger snapshot_onboarding_final_approval before insert on public.employee_onboarding_cases for each row execute function app_private.snapshot_onboarding_final_approval();

create function app_private.document_activation_blocked(r public.employee_onboarding_requirements)
returns boolean language sql stable security definer set search_path='' as $$
 select r.kind='document' and not r.lifecycle_exempt and r.lifecycle_closed_at is null and r.status<>'superseded'
  and app_private.document_obligation_state(r,now())<>'completed'
  and (r.lifecycle_settings->>'mode'='required' or
   (r.lifecycle_settings->>'mode'='conditional' and (app_private.document_initial_action_missing(r) or exists(select 1 from public.employee_document_submissions s where s.id=r.submitted_document_id and s.state in ('pending_review','rejected')))));
$$;
revoke all on function app_private.document_activation_blocked(public.employee_onboarding_requirements) from public,anon,authenticated,service_role;
do $$
declare body text; proc regprocedure;
begin
 body:=pg_get_functiondef('public.activate_employee_onboarding_case_service(uuid,uuid,text)'::regprocedure);
 body:=replace(body,'app_private.document_initial_action_missing(r)','app_private.document_activation_blocked(r)');
 execute body;
 body:=pg_get_functiondef('public.submit_employee_onboarding_service(uuid,integer)'::regprocedure);
 body:=replace(body,'public.employee_onboarding_final_approval_required(target_case.workspace_id)','target_case.final_approval_required');
 body:=replace(body,'if not target_case.final_approval_required','if not exists(select 1 from public.employee_onboarding_requirements r where r.case_id=target_case.id and app_private.document_activation_blocked(r)) and not target_case.final_approval_required');
 execute body;
 body:=pg_get_functiondef('app_private.document_sync_onboarding(uuid,uuid)'::regprocedure);
 body:=replace(body,'public.employee_onboarding_final_approval_required(c.workspace_id)','c.final_approval_required');
 body:=replace(body,'app_private.document_initial_action_missing(q)','app_private.document_activation_blocked(q)');
 body:=replace(body,'update public.employee_onboarding_cases set revision=revision+1,updated_at=now() where id=c.id;',
  'if r.kind=''document'' and r.lifecycle_settings->>''mode'' in (''required'',''conditional'') and r.status=''rejected'' and app_private.document_obligation_state(r,now())<>''completed'' then c.status:=''changes_requested''; end if; update public.employee_onboarding_cases set status=c.status,revision=revision+1,updated_at=now() where id=c.id;');
 execute body;
 body:=pg_get_functiondef('app_private.document_reconcile_employee(uuid,uuid)'::regprocedure);
 body:=replace(body,'if r.id is not null then changed:=true;',
  'if r.id is not null then if m.status=''pending_activation'' and r.required then update public.employee_onboarding_cases set status=''changes_requested'',revision=revision+1,updated_at=now() where id=r.case_id and status=''submitted''; end if; changed:=true;');
 execute body;
end;
$$;

-- Evidence stays in the existing immutable acknowledgement envelope.
create function public.acknowledge_document_lifecycle_service(actor_user_id uuid,target_workspace_id uuid,target_requirement_id uuid,expected_revision integer,signer_name text,expected_content_digest text,authenticated_timestamp timestamptz,request_idempotency_key uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare r public.employee_onboarding_requirements%rowtype; c public.employee_onboarding_cases%rowtype; evidence public.employee_acknowledgement_envelopes%rowtype; employee_name text;
begin
 select c0.* into c from public.employee_onboarding_cases c0 join public.employee_onboarding_requirements q on q.case_id=c0.id
 where q.id=target_requirement_id and q.workspace_id=target_workspace_id and q.lifecycle_user_id=actor_user_id for update of c0;
 select * into r from public.employee_onboarding_requirements where id=target_requirement_id and workspace_id=target_workspace_id for update;
 if c.id is null or r.kind<>'acknowledgement' or r.lifecycle_user_id is distinct from actor_user_id
  or not app_private.document_actor_can_read(actor_user_id,r.workspace_id,r.employee_id,r.lifecycle_user_id)
 then raise exception 'policy unavailable' using errcode='P0002'; end if;
 select * into evidence from public.employee_acknowledgement_envelopes where workspace_id=target_workspace_id and idempotency_key=request_idempotency_key;
 if evidence.id is not null then
  if evidence.requirement_id<>r.id or evidence.user_id<>actor_user_id or evidence.content_digest is distinct from expected_content_digest or evidence.typed_name is distinct from btrim(signer_name)
  then raise exception 'acknowledgement request changed' using errcode='PT409'; end if;
  return r.lifecycle_revision;
 end if;
 if r.lifecycle_revision<>expected_revision then raise exception 'policy changed; refresh required' using errcode='PT409'; end if;
 if r.lifecycle_closed_at is not null or r.lifecycle_exempt or r.status='superseded' then raise exception 'policy request is closed' using errcode='22023'; end if;
 select concat_ws(' ',first_name,last_name) into employee_name from public.employee_profiles where id=r.employee_id and workspace_id=r.workspace_id;
 if expected_content_digest is null or r.source_snapshot->>'content_digest' is distinct from expected_content_digest
  or signer_name is null or lower(regexp_replace(btrim(signer_name),'\s+',' ','g'))<>lower(regexp_replace(btrim(employee_name),'\s+',' ','g'))
  or request_idempotency_key is null or authenticated_timestamp is null or authenticated_timestamp<now()-interval '30 minutes' or authenticated_timestamp>now()+interval '1 minute'
 then raise exception 'current content, matching full name and recent sign-in required' using errcode='22023'; end if;
 if exists(select 1 from public.employee_acknowledgement_envelopes where requirement_id=r.id) then raise exception 'policy already acknowledged; refresh required' using errcode='PT409'; end if;
 insert into public.employee_acknowledgement_envelopes(workspace_id,employee_id,case_id,requirement_id,template_version_id,content_digest,intent_statement,typed_name,user_id,membership_id,authenticated_at,idempotency_key)
 values(r.workspace_id,r.employee_id,r.case_id,r.id,r.source_id,expected_content_digest,r.source_snapshot->>'intent_statement',btrim(signer_name),actor_user_id,c.membership_id,authenticated_timestamp,request_idempotency_key);
 update public.employee_onboarding_requirements set status='completed',completed_at=now(),deadline_at=null,paused_remaining_seconds=null,document_suspended_at=null,
  rejection_reason=null,lifecycle_revision=lifecycle_revision+1,updated_at=now() where id=r.id returning lifecycle_revision into expected_revision;
 perform app_private.document_audit(r,actor_user_id,'document.policy_acknowledged',jsonb_build_object('content_digest',expected_content_digest,'evidence_schema_version','acknowledgement:v1','revision',expected_revision));
 perform app_private.document_sync_onboarding(r.id,actor_user_id);
 return expected_revision;
end;
$$;
revoke all on function public.acknowledge_document_lifecycle_service(uuid,uuid,uuid,integer,text,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.acknowledge_document_lifecycle_service(uuid,uuid,uuid,integer,text,text,timestamptz,uuid) to service_role;

create or replace function public.acknowledge_employee_requirement_service(target_user_id uuid,target_requirement_id uuid,signer_name text,expected_content_digest text,authenticated_timestamp timestamptz,request_idempotency_key uuid,expected_revision integer)
returns integer language plpgsql security definer set search_path='' as $$
declare c public.employee_onboarding_cases%rowtype; r public.employee_onboarding_requirements%rowtype;
begin
 select c0.* into c from public.employee_onboarding_cases c0 join public.employee_onboarding_requirements q on q.case_id=c0.id where q.id=target_requirement_id and q.lifecycle_user_id=target_user_id for update of c0;
 if c.id is null or c.revision<>expected_revision then raise exception 'onboarding changed; refresh required' using errcode='PT409'; end if;
 select * into r from public.employee_onboarding_requirements where id=target_requirement_id;
 perform public.acknowledge_document_lifecycle_service(target_user_id,r.workspace_id,r.id,r.lifecycle_revision,signer_name,expected_content_digest,authenticated_timestamp,request_idempotency_key);
 return (select revision from public.employee_onboarding_cases where id=c.id);
end;
$$;

-- Start over has been removed from the product; it must not delete retained
-- document or signature history through an old client.
create or replace function public.reset_employee_onboarding_service(target_user_id uuid,expected_revision integer)
returns integer language plpgsql security definer set search_path='' as $$
begin raise exception 'Continue your existing onboarding to update its documents' using errcode='22023'; end;
$$;
do $$
declare body text; anchor text;
begin
 body:=pg_get_functiondef('public.get_employee_document_lifecycle_service(uuid,uuid,uuid,boolean)'::regprocedure);
 anchor:='''history'',history,';
 if strpos(body,anchor)=0 then raise exception 'policy detail anchor changed'; end if;
 body:=replace(body,anchor,'''history'',history,''policy'',case when r.kind=''acknowledgement'' then jsonb_build_object(''content_text'',r.source_snapshot->>''content_text'',''content_digest'',r.source_snapshot->>''content_digest'',''intent_statement'',r.source_snapshot->>''intent_statement'',''evidence'',(select jsonb_build_object(''typed_name'',a.typed_name,''executed_at'',a.executed_at,''content_digest'',a.content_digest,''intent_statement'',a.intent_statement) from public.employee_acknowledgement_envelopes a where a.requirement_id=r.id and (not self_only or a.user_id=actor_user_id))) end,');
 execute body;
end;
$$;

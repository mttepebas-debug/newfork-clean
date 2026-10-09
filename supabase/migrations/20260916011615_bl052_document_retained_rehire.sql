-- Reinvitation creates current obligations without deleting private history.
alter table public.employee_onboarding_requirements add column lifecycle_retired_at timestamptz;
-- Replace both legacy identities: an unconditional constraint would still
-- suppress the fresh assignment in ON CONFLICT despite the partial index.
alter table public.employee_onboarding_requirements drop constraint employee_onboarding_requirements_case_id_kind_source_id_key;
drop index public.employee_onboarding_requirements_source_unique;
create unique index employee_onboarding_requirements_source_unique on public.employee_onboarding_requirements(case_id,kind,source_id) nulls not distinct where lifecycle_retired_at is null;

create or replace function app_private.reset_employee_onboarding_for_rehire(target_workspace_id uuid,target_employee_id uuid,target_membership_id uuid,actor_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare c public.employee_onboarding_cases%rowtype;
begin
 select * into c from public.employee_onboarding_cases where workspace_id=target_workspace_id and employee_id=target_employee_id for update;
 if c.id is null then return; end if;
 update public.employee_onboarding_requirements set lifecycle_retired_at=now(),lifecycle_closed_at=now(),lifecycle_close_reason='New account onboarding',
  status='superseded',required=false,blocks_activation=false,deadline_at=null,paused_remaining_seconds=null,document_suspended_at=null,lifecycle_revision=lifecycle_revision+1,updated_at=now()
 where case_id=c.id and lifecycle_retired_at is null;
 delete from public.employee_sensitive_identifiers where workspace_id=target_workspace_id and employee_id=target_employee_id;
 delete from public.employee_private_profiles where workspace_id=target_workspace_id and employee_id=target_employee_id;
 update public.employee_onboarding_cases set membership_id=target_membership_id,status='in_progress',submitted_at=null,approved_at=null,approved_by=null,
  final_approval_required=public.employee_onboarding_final_approval_required(target_workspace_id),revision=revision+1,updated_at=now() where id=c.id;
 insert into public.onboarding_events(workspace_id,employee_id,case_id,actor_user_id,action,target_type,target_id)
 values(target_workspace_id,target_employee_id,c.id,actor_user_id,'onboarding.rehire_started','onboarding_case',c.id::text);
end;
$$;
do $$
declare body text; proc regprocedure;
begin
 body:=pg_get_functiondef('public.initialize_employee_onboarding_service(uuid,uuid)'::regprocedure);
 body:=replace(body,'on conflict (case_id, kind, source_id)','on conflict (case_id, kind, source_id) where lifecycle_retired_at is null');
 body:=replace(body,'where case_id = onboarding_case_id','where case_id = onboarding_case_id and lifecycle_retired_at is null');
 body:=replace(body,'where requirement.case_id = onboarding_case_id','where requirement.case_id = onboarding_case_id and requirement.lifecycle_retired_at is null');
 execute body;
 body:=pg_get_functiondef('app_private.document_reconcile_employee(uuid,uuid)'::regprocedure);
 body:=replace(body,'on conflict(case_id,kind,source_id)','on conflict(case_id,kind,source_id) where lifecycle_retired_at is null');
 body:=replace(body,'and kind=''document'' order by id','and kind=''document'' and lifecycle_retired_at is null order by id');
 body:=replace(body,'and q.kind=''document'' and q.source_id=dt.id','and q.kind=''document'' and q.lifecycle_retired_at is null and q.source_id=dt.id');
 execute body;
 body:=pg_get_functiondef('public.preview_document_definition_apply_service(uuid,uuid,uuid)'::regprocedure);
 body:=replace(body,'r.kind=''document''','r.kind=''document'' and r.lifecycle_retired_at is null');
 execute body;
 foreach proc in array array['public.get_employee_onboarding_service(uuid)'::regprocedure,'public.get_employee_onboarding_review_service(uuid,uuid,uuid)'::regprocedure] loop
  body:=pg_get_functiondef(proc);
  body:=replace(body,'requirement.status <> ''superseded''','requirement.status <> ''superseded'' and requirement.lifecycle_retired_at is null');
  execute body;
 end loop;
 body:=pg_get_functiondef('public.guard_weekly_onboarding_requirement()'::regprocedure);
 body:=replace(body,'if new.kind <> ''availability''','if new.lifecycle_retired_at is not null or new.kind <> ''availability''');
 execute body;
 body:=pg_get_functiondef('public.sync_weekly_onboarding_requirements(uuid)'::regprocedure);
 body:=replace(body,'r.kind=''availability''','r.kind=''availability'' and r.lifecycle_retired_at is null');
 execute body;
end;
$$;

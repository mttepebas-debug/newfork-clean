alter table public.signature_template_versions add column lifecycle_settings jsonb;
alter table public.signature_template_versions add column lifecycle_revision integer not null default 1;
grant select(lifecycle_settings,lifecycle_revision) on public.signature_template_versions to authenticated;
alter table public.employee_onboarding_requirements add column lifecycle_assignment_disabled boolean not null default false;

create function app_private.policy_lifecycle_settings(v public.signature_template_versions)
returns jsonb language sql immutable set search_path='' as $$
 select coalesce(v.lifecycle_settings,jsonb_build_object('mode',case when v.required_at_onboarding then 'required' else 'optional' end,'target',jsonb_build_object('operator','and','location_ids','[]'::jsonb,'department_ids','[]'::jsonb,'job_ids','[]'::jsonb,'employee_ids','[]'::jsonb),'assignment_scope','future_onboarding','period_days',null,'suspend_on_overdue',false,'extra_fields','[]'::jsonb));
$$;
create view app_private.lifecycle_definition as
 select d.id,d.workspace_id,'document'::text as kind,d.title,d.description,d.requires_review,d.sort_order,d.archived_at,d.lifecycle_revision,d.lifecycle_settings,
  app_private.document_definition_snapshot(d) as snapshot,true as current_version from public.document_types d
 union all
 select v.id,v.workspace_id,'acknowledgement',v.title,v.summary,false,200+v.version_number,t.archived_at,v.lifecycle_revision,app_private.policy_lifecycle_settings(v),
  jsonb_build_object('template_version_id',v.id,'content_text',v.content_text,'content_digest',v.content_digest,'intent_statement',v.intent_statement,'locale',v.locale,'effective_date',v.effective_date,'retention_policy_id',v.retention_policy_id),
  not exists(select 1 from public.signature_template_versions newer where newer.template_id=v.template_id and newer.status='published' and newer.version_number>v.version_number)
 from public.signature_template_versions v join public.signature_templates t on t.id=v.template_id and t.workspace_id=v.workspace_id where v.status='published';
revoke all on app_private.lifecycle_definition from public,anon,authenticated,service_role;
revoke all on function app_private.policy_lifecycle_settings(public.signature_template_versions) from public,anon,authenticated,service_role;

create function public.save_policy_lifecycle_service(actor_user_id uuid,target_workspace_id uuid,target_template_id uuid,policy_payload jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare settings jsonb:=policy_payload->'lifecycle_settings'; saved_id uuid; period integer; prior_revision integer;
begin
 if not public.service_actor_has_permission(actor_user_id,target_workspace_id,'signature_templates.manage') then raise exception 'policy management access required' using errcode='42501'; end if;
 if settings is null or settings->>'mode' is null or settings->>'mode' not in ('optional','required')
  or settings->>'assignment_scope' is null or settings->>'assignment_scope' not in ('future_onboarding','all_active') or jsonb_typeof(settings->'target') is distinct from 'object'
 then raise exception 'valid policy assignment settings required' using errcode='22023'; end if;
 perform app_private.assert_document_definition_target(actor_user_id,target_workspace_id,settings->'target');
 period:=(settings->>'period_days')::integer;
 if (period is not null and period not between 1 and 3650) or (coalesce((settings->>'suspend_on_overdue')::boolean,false) and (settings->>'mode'='optional' or period is null))
 then raise exception 'valid policy delivery period required' using errcode='22023'; end if;
 if target_template_id is not null then
  perform 1 from public.signature_templates where id=target_template_id and workspace_id=target_workspace_id for update;
  select lifecycle_revision into prior_revision from public.signature_template_versions where template_id=target_template_id and workspace_id=target_workspace_id and status='draft' for update;
  if prior_revision is not null and prior_revision is distinct from (policy_payload->>'lifecycle_revision')::integer then raise exception 'policy draft changed; refresh required' using errcode='PT409'; end if;
 end if;
 saved_id:=public.save_signature_template_draft_service(actor_user_id,target_workspace_id,target_template_id,
  policy_payload->>'title',policy_payload->>'summary',policy_payload->>'content_text',policy_payload->>'intent_statement',policy_payload->>'locale',
  (policy_payload->>'effective_date')::date,settings->>'mode'='required',settings->>'mode'='required',(policy_payload->>'retention_policy_id')::uuid);
 update public.signature_template_versions set lifecycle_settings=settings,lifecycle_revision=coalesce(prior_revision,0)+1 where template_id=saved_id and status='draft';
 return saved_id;
end;
$$;
revoke all on function public.save_policy_lifecycle_service(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_policy_lifecycle_service(uuid,uuid,uuid,jsonb) to service_role;

-- The already-tested Preview/Apply path now consumes either a document
-- definition or an immutable published policy version; no second state engine.
do $$
declare body text;
begin
 body:=pg_get_functiondef('public.document_definition_target_options_service(uuid,uuid)'::regprocedure);
 body:=replace(body,'if not public.service_actor_has_permission(actor_user_id,target_workspace_id,''documents.manage'')','if not (public.service_actor_has_permission(actor_user_id,target_workspace_id,''documents.manage'') or public.service_actor_has_permission(actor_user_id,target_workspace_id,''signature_templates.manage''))');
 execute body;
 body:=pg_get_functiondef('public.preview_document_definition_apply_service(uuid,uuid,uuid)'::regprocedure);
 body:=replace(body,'public.preview_document_definition_apply_service(actor_user_id uuid, target_workspace_id uuid, target_document_type_id uuid)','app_private.preview_lifecycle_definition(actor_user_id uuid, target_workspace_id uuid, target_document_type_id uuid, target_kind text)');
 body:=replace(body,'public.document_types%rowtype','app_private.lifecycle_definition%rowtype');
 body:=replace(body,'''documents.manage''','case when target_kind=''acknowledgement'' then ''signature_templates.manage'' else ''documents.manage'' end');
 body:=replace(body,'from public.document_types where id=target_document_type_id and workspace_id=target_workspace_id','from app_private.lifecycle_definition where id=target_document_type_id and workspace_id=target_workspace_id and kind=target_kind');
 body:=replace(body,'r.kind=''document''','r.kind::text=target_kind');
 body:=replace(body,'app_private.document_definition_snapshot(d)','d.snapshot');
 execute body;
 body:=pg_get_functiondef('public.apply_document_definition_service(uuid,uuid,uuid,integer,text,text)'::regprocedure);
 body:=replace(body,'public.apply_document_definition_service(actor_user_id uuid, target_workspace_id uuid, target_document_type_id uuid, expected_revision integer, expected_preview_token text, apply_reason text)','app_private.apply_lifecycle_definition(actor_user_id uuid, target_workspace_id uuid, target_document_type_id uuid, expected_revision integer, expected_preview_token text, apply_reason text, target_kind text)');
 body:=replace(body,'public.document_types%rowtype','app_private.lifecycle_definition%rowtype');
 body:=replace(body,'''documents.manage''','case when target_kind=''acknowledgement'' then ''signature_templates.manage'' else ''documents.manage'' end');
 body:=replace(body,'select * into d from public.document_types where id=target_document_type_id and workspace_id=target_workspace_id for update;',
  'if target_kind=''acknowledgement'' then perform 1 from public.signature_template_versions where id=target_document_type_id and workspace_id=target_workspace_id for update; else perform 1 from public.document_types where id=target_document_type_id and workspace_id=target_workspace_id for update; end if; select * into d from app_private.lifecycle_definition where id=target_document_type_id and workspace_id=target_workspace_id and kind=target_kind;');
 body:=replace(body,'public.preview_document_definition_apply_service(actor_user_id,target_workspace_id,d.id)','app_private.preview_lifecycle_definition(actor_user_id,target_workspace_id,d.id,target_kind)');
 body:=replace(body,'case_id,''document'',d.id','case_id,target_kind::public.employee_onboarding_requirement_kind,d.id');
 body:=replace(body,'app_private.document_definition_snapshot(d)','d.snapshot');
 body:=replace(body,'lifecycle_closed_at=case when item->>''action''=''remove''','lifecycle_assignment_disabled=d.archived_at is not null,lifecycle_closed_at=case when item->>''action''=''remove''');
 body:=replace(body,'  applied:=applied+1;','  if member.status=''pending_activation'' and r.required and item->>''action'' in (''assign'',''reopen'') then update public.employee_onboarding_cases set status=''changes_requested'',revision=revision+1,updated_at=now() where id=r.case_id and status=''submitted''; end if; perform app_private.document_sync_onboarding(r.id,actor_user_id); applied:=applied+1;');
 execute body;
 body:=pg_get_functiondef('app_private.snapshot_document_lifecycle_requirement()'::regprocedure);
 body:=replace(body,' if new.lifecycle_settings is null then',' if new.lifecycle_settings is null and new.kind=''acknowledgement'' then select app_private.policy_lifecycle_settings(v) into new.lifecycle_settings from public.signature_template_versions v where v.id=new.source_id and v.workspace_id=new.workspace_id; end if; if new.lifecycle_settings is null then');
 body:=replace(body,'if new.kind=''document'' then','if new.kind in (''document'',''acknowledgement'') then');
 execute body;
 body:=pg_get_functiondef('app_private.document_reconcile_employee(uuid,uuid)'::regprocedure);
 body:=replace(body,'d public.document_types%rowtype','d app_private.lifecycle_definition%rowtype');
 body:=replace(body,'kind=''document''','kind in (''document'',''acknowledgement'')');
 body:=replace(body,'if r.lifecycle_exempt then','if r.lifecycle_exempt or r.lifecycle_assignment_disabled then');
 body:=replace(body,'and exists(select 1 from public.document_types where id=r.source_id and workspace_id=w and archived_at is null)','');
 body:=replace(body,'from public.document_types dt where dt.workspace_id=w and dt.archived_at is null','from app_private.lifecycle_definition dt where dt.workspace_id=w and dt.archived_at is null and dt.current_version');
 body:=replace(body,'q.kind in (''document'',''acknowledgement'') and q.lifecycle_retired_at is null and q.source_id=dt.id','q.kind::text=dt.kind and q.lifecycle_retired_at is null and q.source_id=dt.id');
 body:=replace(body,'values(w,e,c,''document'',d.id','values(w,e,c,d.kind::public.employee_onboarding_requirement_kind,d.id');
 body:=replace(body,'app_private.document_definition_snapshot(d)','d.snapshot');
 execute body;
 body:=pg_get_functiondef('public.initialize_employee_onboarding_service(uuid,uuid)'::regprocedure);
 body:=replace(body,'and version.required_at_onboarding','and membership.status=''pending_activation'' and app_private.document_target_matches(employee.workspace_id,employee.id,app_private.policy_lifecycle_settings(version)->''target'')');
 execute body;
end;
$$;
revoke all on function app_private.preview_lifecycle_definition(uuid,uuid,uuid,text),app_private.apply_lifecycle_definition(uuid,uuid,uuid,integer,text,text,text) from public,anon,authenticated,service_role;

create or replace function public.preview_document_definition_apply_service(actor_user_id uuid,target_workspace_id uuid,target_document_type_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select app_private.preview_lifecycle_definition(actor_user_id,target_workspace_id,target_document_type_id,'document');
$$;
create or replace function public.apply_document_definition_service(actor_user_id uuid,target_workspace_id uuid,target_document_type_id uuid,expected_revision integer,expected_preview_token text,apply_reason text)
returns jsonb language sql security definer set search_path='' as $$
 select app_private.apply_lifecycle_definition(actor_user_id,target_workspace_id,target_document_type_id,expected_revision,expected_preview_token,apply_reason,'document');
$$;
create function public.preview_policy_definition_apply_service(actor_user_id uuid,target_workspace_id uuid,target_version_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select app_private.preview_lifecycle_definition(actor_user_id,target_workspace_id,target_version_id,'acknowledgement');
$$;
create function public.apply_policy_definition_service(actor_user_id uuid,target_workspace_id uuid,target_version_id uuid,expected_revision integer,expected_preview_token text,apply_reason text)
returns jsonb language sql security definer set search_path='' as $$
 select app_private.apply_lifecycle_definition(actor_user_id,target_workspace_id,target_version_id,expected_revision,expected_preview_token,apply_reason,'acknowledgement');
$$;
revoke all on function public.preview_policy_definition_apply_service(uuid,uuid,uuid),public.apply_policy_definition_service(uuid,uuid,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.preview_policy_definition_apply_service(uuid,uuid,uuid),public.apply_policy_definition_service(uuid,uuid,uuid,integer,text,text) to service_role;

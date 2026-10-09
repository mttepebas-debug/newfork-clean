-- One lifecycle for onboarding and permanent Account Documents.
create function app_private.document_initial_action_missing(r public.employee_onboarding_requirements)
returns boolean language sql stable security definer set search_path='' as $$
 select r.kind='document' and r.lifecycle_settings->>'mode'='conditional'
  and not r.lifecycle_exempt and r.lifecycle_closed_at is null and r.status<>'superseded'
  and app_private.document_obligation_state(r,now())<>'completed'
  and not exists(select 1 from public.employee_document_submissions s where s.id=r.submitted_document_id and s.state in ('accepted','pending_review'))
  and (nullif(btrim(r.conditional_reason),'') is null or exists(select 1 from public.employee_document_submissions s where s.requirement_id=r.id and s.state='rejected'));
$$;
revoke all on function app_private.document_initial_action_missing(public.employee_onboarding_requirements) from public,anon,authenticated,service_role;

-- Caller locks case before requirement, matching existing onboarding commands.
create function app_private.document_sync_onboarding(target_requirement_id uuid,actor uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r public.employee_onboarding_requirements%rowtype; c public.employee_onboarding_cases%rowtype;
begin
 select * into r from public.employee_onboarding_requirements where id=target_requirement_id;
 update public.employee_documents f set review_status=case
  when sf.decision='discard' then 'superseded'::public.employee_document_review_status
  when s.id=r.approved_document_id and s.state='accepted' then 'accepted'::public.employee_document_review_status
  when s.id=r.submitted_document_id and s.state='pending_review' then 'awaiting_review'::public.employee_document_review_status
  when s.id=r.submitted_document_id and s.state='rejected' then 'rejected'::public.employee_document_review_status
  else 'superseded'::public.employee_document_review_status end, expiry_date=s.expiry_date
 from public.employee_document_submission_files sf join public.employee_document_submissions s on s.id=sf.submission_id
 where sf.file_id=f.id and s.requirement_id=r.id;
 if app_private.document_obligation_state(r,now())='completed' then
  update public.employee_onboarding_requirements set status='completed' where id=r.id and status<>'completed';
 end if;
 select c0.* into c from public.employee_onboarding_cases c0 join public.workspace_memberships m on m.id=c0.membership_id
 where c0.id=r.case_id and m.status='pending_activation' for update of c0;
 if c.id is null then return; end if;
 update public.employee_onboarding_cases set revision=revision+1,updated_at=now() where id=c.id;
 if c.status='submitted' and not public.employee_onboarding_final_approval_required(c.workspace_id)
  and not exists(select 1 from public.employee_onboarding_requirements q where q.case_id=c.id and
   (app_private.document_initial_action_missing(q) or (q.required and q.blocks_activation and q.status<>'completed' and
    (q.kind<>'document' or (not q.lifecycle_exempt and q.lifecycle_closed_at is null and q.status<>'superseded'))))) then
  perform public.activate_employee_onboarding_case_service(c.id,coalesce(actor,r.lifecycle_user_id),'employee.auto_activated');
 end if;
end;
$$;
revoke all on function app_private.document_sync_onboarding(uuid,uuid) from public,anon,authenticated,service_role;

create function public.defer_initial_employee_document_service(actor_user_id uuid,target_requirement_id uuid,expected_revision integer,deferral_reason text)
returns integer language plpgsql security definer set search_path='' as $$
declare r public.employee_onboarding_requirements%rowtype;
begin
 perform 1 from public.employee_onboarding_cases c join public.employee_onboarding_requirements q on q.case_id=c.id
 where q.id=target_requirement_id and q.lifecycle_user_id=actor_user_id for update of c;
 select * into r from public.employee_onboarding_requirements where id=target_requirement_id for update;
 if r.id is null or r.lifecycle_user_id is distinct from actor_user_id or not app_private.document_actor_can_read(actor_user_id,r.workspace_id,r.employee_id,r.lifecycle_user_id)
 then raise exception 'document unavailable' using errcode='P0002'; end if;
 if r.lifecycle_revision<>expected_revision then raise exception 'document changed; refresh required' using errcode='PT409'; end if;
 if r.kind<>'document' or r.lifecycle_settings->>'mode'<>'conditional' or r.lifecycle_closed_at is not null or r.lifecycle_exempt
  or r.submitted_document_id is not null or exists(select 1 from public.employee_document_submissions s where s.requirement_id=r.id and s.state<>'draft')
  or not exists(select 1 from public.employee_onboarding_cases c join public.workspace_memberships m on m.id=c.membership_id where c.id=r.case_id and m.status='pending_activation')
 then raise exception 'only an initial conditional document can be deferred' using errcode='22023'; end if;
 if nullif(btrim(deferral_reason),'') is null or char_length(deferral_reason)>500 then raise exception 'a short reason is required' using errcode='22023'; end if;
 update public.employee_onboarding_requirements set conditional_reason=btrim(deferral_reason),lifecycle_revision=lifecycle_revision+1,updated_at=now()
 where id=r.id returning lifecycle_revision into expected_revision;
 perform app_private.document_audit(r,actor_user_id,'document.initial_deferred',jsonb_build_object('reason',btrim(deferral_reason),'revision',expected_revision));
 perform app_private.document_sync_onboarding(r.id,actor_user_id);
 return expected_revision;
end;
$$;
revoke all on function public.defer_initial_employee_document_service(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.defer_initial_employee_document_service(uuid,uuid,integer,text) to service_role;

-- Stale clients cannot supersede approvals or bypass explicit submission.
create or replace function public.confirm_employee_document_service(target_user_id uuid,target_requirement_id uuid,storage_object_path text,upload_filename text,upload_media_type text,upload_size_bytes bigint,upload_expiry_date date,expected_revision integer)
returns integer language plpgsql security definer set search_path='' as $$
begin raise exception 'Document upload changed; refresh and use Submit document' using errcode='PT409'; end;
$$;
revoke all on function public.confirm_employee_document_service(uuid,uuid,text,text,text,bigint,date,integer) from public,anon,authenticated;
grant execute on function public.confirm_employee_document_service(uuid,uuid,text,text,text,bigint,date,integer) to service_role;

do $$
declare proc regprocedure; body text; anchor text;
begin
 foreach proc in array array[
  'public.submit_employee_document_lifecycle_service(uuid,uuid,integer,uuid,date,jsonb)'::regprocedure,
  'public.review_employee_document_lifecycle_service(uuid,uuid,uuid,integer,uuid,text,text,text,jsonb)'::regprocedure
 ] loop
  body:=pg_get_functiondef(proc);
  anchor:='begin' || chr(10) || ' select * into r';
  if strpos(body,anchor)=0 then raise exception 'document lock anchor changed'; end if;
  body:=replace(body,anchor,'begin' || chr(10) || ' perform 1 from public.employee_onboarding_cases c join public.employee_onboarding_requirements q on q.case_id=c.id where q.id=target_requirement_id and app_private.document_actor_can_read(actor_user_id,q.workspace_id,q.employee_id,q.lifecycle_user_id) for update of c;' || chr(10) || ' select * into r');
  body:=replace(body,' return expected_revision;',' perform app_private.document_sync_onboarding(r.id,actor_user_id); return expected_revision;');
  execute body;
 end loop;
 foreach proc in array array[
  'public.activate_employee_onboarding_case_service(uuid,uuid,text)'::regprocedure,
  'public.submit_employee_onboarding_service(uuid,integer)'::regprocedure
 ] loop
  body:=pg_get_functiondef(proc);
  anchor:='  if exists (';
  if strpos(body,anchor)=0 then raise exception 'onboarding requirement gate anchor changed'; end if;
  body:=overlay(body placing '  if exists(select 1 from public.employee_onboarding_requirements r where r.case_id=target_case.id and app_private.document_initial_action_missing(r)) then raise exception ''Submit conditional documents or give an initial reason'' using errcode=''23514''; end if;' || chr(10) from strpos(body,anchor) for 0);
  body:=replace(body,'and required','and (kind<>''document'' or (not lifecycle_exempt and lifecycle_closed_at is null and status<>''superseded'')) and required');
  execute body;
 end loop;
 body:=pg_get_functiondef('public.review_employee_onboarding_service(uuid,uuid,uuid,text,uuid,text,integer,boolean)'::regprocedure);
 anchor:=' return public.review_employee_onboarding_before_availability_service';
 if strpos(body,anchor)=0 then raise exception 'legacy review adapter anchor changed'; end if;
 body:=replace(body,anchor,' if exists(select 1 from public.employee_onboarding_requirements r where r.id=target_requirement_id and r.kind=''document'') then raise exception ''Review the submitted document version in Documents'' using errcode=''PT409''; end if;' || chr(10) || anchor);
 execute body;
 body:=pg_get_functiondef('public.get_employee_onboarding_service(uuid)'::regprocedure);
 if strpos(body,'and requirement.required')=0 then raise exception 'onboarding navigation anchor changed'; end if;
 body:=replace(body,'and requirement.required','and (requirement.required or app_private.document_initial_action_missing(requirement))');
 body:=replace(body,'''required'', requirement.required','''required'', requirement.required,''document_mode'',requirement.lifecycle_settings->>''mode'', ''conditional_reason'',requirement.conditional_reason');
 body:=replace(body,'where requirement.required)','where requirement.required or (requirement.kind=''document'' and requirement.lifecycle_settings->>''mode''=''conditional''))');
 body:=replace(body,'where requirement.required and requirement.status in (''completed'', ''awaiting_review'')','where (requirement.required and requirement.status in (''completed'', ''awaiting_review'')) or (requirement.kind=''document'' and requirement.lifecycle_settings->>''mode''=''conditional'' and not app_private.document_initial_action_missing(requirement))');
 body:=replace(body,'and requirement.status <> ''superseded''','and requirement.status <> ''superseded'' and (requirement.kind<>''document'' or (not requirement.lifecycle_exempt and requirement.lifecycle_closed_at is null))');
 execute body;
 body:=pg_get_functiondef('public.get_employee_document_lifecycle_service(uuid,uuid,uuid,boolean)'::regprocedure);
 anchor:='''history'',history,';
 if strpos(body,anchor)=0 then raise exception 'document detail anchor changed'; end if;
 body:=replace(body,anchor,'''history'',history,''initial_deferral'',jsonb_build_object(''reason'',r.conditional_reason,''allowed'',self_only and r.kind=''document'' and r.lifecycle_settings->>''mode''=''conditional'' and r.submitted_document_id is null and not r.lifecycle_exempt and r.lifecycle_closed_at is null and not exists(select 1 from public.employee_document_submissions s where s.requirement_id=r.id and s.state<>''draft'') and exists(select 1 from public.employee_onboarding_cases c join public.workspace_memberships m on m.id=c.membership_id where c.id=r.case_id and m.status=''pending_activation'')),');
 execute body;
end;
$$;

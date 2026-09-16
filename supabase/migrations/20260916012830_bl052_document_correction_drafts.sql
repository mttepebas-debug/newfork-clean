-- Copy references and metadata into a correction draft; reviewed versions stay intact.
do $$
declare body text; anchor text;
begin
 body:=pg_get_functiondef('public.review_employee_document_lifecycle_service(uuid,uuid,uuid,integer,uuid,text,text,text,jsonb)'::regprocedure);
 body:=replace(body,'suspended timestamptz;','suspended timestamptz; correction_draft uuid;');
 anchor:=' perform app_private.document_sync_onboarding(r.id,actor_user_id);';
 if strpos(body,anchor)=0 then raise exception 'review synchronization anchor changed'; end if;
 body:=replace(body,anchor,$patch$
 if review_decision='reject' and exists(select 1 from public.employee_document_submission_files where submission_id=s.id and decision='keep')
  and not exists(select 1 from public.employee_document_submissions where requirement_id=r.id and state='draft') then
  insert into public.employee_document_submissions(workspace_id,employee_id,requirement_id,user_id,version,state,expiry_date,metadata)
  select r.workspace_id,r.employee_id,r.id,r.lifecycle_user_id,coalesce(max(version),0)+1,'draft',s.expiry_date,s.metadata from public.employee_document_submissions where requirement_id=r.id returning id into correction_draft;
  insert into public.employee_document_submission_files(submission_id,file_id,requirement_id,workspace_id,employee_id,decision,note)
  select correction_draft,file_id,requirement_id,workspace_id,employee_id,'keep',note from public.employee_document_submission_files where submission_id=s.id and decision='keep';
 end if;
 perform app_private.document_sync_onboarding(r.id,actor_user_id);$patch$);
 execute body;
end;
$$;

create function public.remove_employee_document_draft_file_service(actor_user_id uuid,target_workspace_id uuid,target_requirement_id uuid,expected_revision integer,target_submission_id uuid,target_file_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare r public.employee_onboarding_requirements%rowtype;
begin
 select * into r from public.employee_onboarding_requirements where id=target_requirement_id and workspace_id=target_workspace_id and kind='document' for update;
 if r.id is null or r.lifecycle_user_id is distinct from actor_user_id or not app_private.document_actor_can_read(actor_user_id,r.workspace_id,r.employee_id,r.lifecycle_user_id)
 then raise exception 'document unavailable' using errcode='P0002'; end if;
 if r.lifecycle_revision<>expected_revision then raise exception 'document changed; refresh required' using errcode='PT409'; end if;
 if r.lifecycle_closed_at is not null or r.lifecycle_exempt or r.lifecycle_retired_at is not null then raise exception 'document request is closed' using errcode='22023'; end if;
 if not exists(select 1 from public.employee_document_submissions where id=target_submission_id and requirement_id=r.id and user_id=actor_user_id and state='draft') then raise exception 'draft unavailable' using errcode='PT409'; end if;
 delete from public.employee_document_submission_files where submission_id=target_submission_id and file_id=target_file_id and requirement_id=r.id;
 if not found then raise exception 'draft file unavailable' using errcode='P0002'; end if;
 update public.employee_onboarding_requirements set lifecycle_revision=lifecycle_revision+1,updated_at=now() where id=r.id returning lifecycle_revision into expected_revision;
 perform app_private.document_audit(r,actor_user_id,'document.draft_file_removed',jsonb_build_object('submission_id',target_submission_id,'file_id',target_file_id,'revision',expected_revision));
 return expected_revision;
end;
$$;
revoke all on function public.remove_employee_document_draft_file_service(uuid,uuid,uuid,integer,uuid,uuid) from public,anon,authenticated;
grant execute on function public.remove_employee_document_draft_file_service(uuid,uuid,uuid,integer,uuid,uuid) to service_role;

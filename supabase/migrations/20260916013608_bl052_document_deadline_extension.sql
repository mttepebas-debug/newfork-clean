create function public.extend_employee_document_deadline_service(actor_user_id uuid,target_workspace_id uuid,target_requirement_id uuid,expected_revision integer,additional_days integer,extension_reason text)
returns integer language plpgsql security definer set search_path='' as $$
declare r public.employee_onboarding_requirements%rowtype; revised_deadline timestamptz;
begin
 perform 1 from public.employee_onboarding_cases c join public.employee_onboarding_requirements q on q.case_id=c.id where q.id=target_requirement_id and q.workspace_id=target_workspace_id for update of c;
 select * into r from public.employee_onboarding_requirements where id=target_requirement_id and workspace_id=target_workspace_id and kind in ('document','acknowledgement') for update;
 if r.id is null or not public.service_actor_has_permission(actor_user_id,target_workspace_id,'employee_documents.review') or not public.service_actor_can_access_employee(actor_user_id,target_workspace_id,r.employee_id) or not app_private.workspace_allows_interactive_access(target_workspace_id)
 then raise exception 'document review access required' using errcode='42501'; end if;
 if r.lifecycle_revision<>expected_revision then raise exception 'document changed; refresh required' using errcode='PT409'; end if;
 if additional_days is null or additional_days not between 1 and 3650 or nullif(btrim(extension_reason),'') is null or char_length(extension_reason)>500 then raise exception 'extension days and reason required' using errcode='22023'; end if;
 if r.deadline_at is null or r.deadline_at<=now() or r.lifecycle_exempt or r.lifecycle_closed_at is not null or r.lifecycle_retired_at is not null
  or r.lifecycle_settings->>'mode'='optional' or r.document_suspended_at is not null or app_private.document_actor_blocked(r.lifecycle_user_id,r.workspace_id)
  or app_private.document_obligation_state(r,now())='completed'
  or exists(select 1 from public.employee_document_submissions where id=r.submitted_document_id and state='pending_review')
 then raise exception 'only an active deadline before suspension can be extended' using errcode='22023'; end if;
 revised_deadline:=r.deadline_at+additional_days*interval '24 hours';
 update public.employee_onboarding_requirements set deadline_at=revised_deadline,lifecycle_revision=lifecycle_revision+1,updated_at=now() where id=r.id returning lifecycle_revision into expected_revision;
 perform app_private.document_audit(r,actor_user_id,'document.deadline_extended',jsonb_build_object('reason',btrim(extension_reason),'previous_deadline',r.deadline_at,'new_deadline',revised_deadline,'additional_days',additional_days,'revision',expected_revision));
 return expected_revision;
end;
$$;
revoke all on function public.extend_employee_document_deadline_service(uuid,uuid,uuid,integer,integer,text) from public,anon,authenticated;
grant execute on function public.extend_employee_document_deadline_service(uuid,uuid,uuid,integer,integer,text) to service_role;

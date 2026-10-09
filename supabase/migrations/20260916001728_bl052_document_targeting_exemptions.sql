-- User decision: jobs are organization-wide employee attributes and apply at
-- every assigned location. Preserve the department-to-job relationship.
create function app_private.document_target_matches(w uuid,e uuid,target jsonb)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare loc jsonb:=coalesce(target->'location_ids','[]'); dep jsonb:=coalesce(target->'department_ids','[]'); job jsonb:=coalesce(target->'job_ids','[]'); loc_ok boolean; job_ok boolean;
begin
 if coalesce(target->'employee_ids','[]') ? e::text then return true; end if;
 if jsonb_array_length(loc)+jsonb_array_length(dep)+jsonb_array_length(job)=0 then return true; end if;
 loc_ok:=exists(select 1 from public.employee_location_assignments a where a.workspace_id=w and a.employee_id=e and a.ended_at is null and loc ? a.location_id::text);
 if coalesce(target->>'operator','and')='or' then
  return loc_ok or exists(select 1 from public.employee_job_assignments a join public.jobs j on j.id=a.job_id and j.workspace_id=a.workspace_id
   where a.workspace_id=w and a.employee_id=e and a.ended_at is null and j.archived_at is null and (job ? j.id::text or dep ? j.department_id::text));
 end if;
 job_ok:=exists(select 1 from public.employee_job_assignments a join public.jobs j on j.id=a.job_id and j.workspace_id=a.workspace_id
  where a.workspace_id=w and a.employee_id=e and a.ended_at is null and j.archived_at is null
   and (jsonb_array_length(job)=0 or job ? j.id::text) and (jsonb_array_length(dep)=0 or dep ? j.department_id::text));
 return (jsonb_array_length(loc)=0 or loc_ok) and ((jsonb_array_length(job)=0 and jsonb_array_length(dep)=0) or job_ok);
end;
$$;
revoke all on function app_private.document_target_matches(uuid,uuid,jsonb) from public,anon,authenticated;

create function public.set_employee_document_exemption_service(actor_user_id uuid,target_workspace_id uuid,target_requirement_id uuid,expected_revision integer,make_exempt boolean,exemption_reason text)
returns integer language plpgsql security definer set search_path='' as $$
declare r public.employee_onboarding_requirements%rowtype; next_deadline timestamptz; matching boolean; valid_approved boolean;
begin
 select * into r from public.employee_onboarding_requirements where id=target_requirement_id and workspace_id=target_workspace_id and kind='document' for update;
 if r.id is null or not public.service_actor_has_permission(actor_user_id,target_workspace_id,'employee_documents.review')
  or not public.service_actor_can_access_employee(actor_user_id,target_workspace_id,r.employee_id)
  or not app_private.workspace_allows_interactive_access(target_workspace_id) then raise exception 'document exemption unavailable' using errcode='42501'; end if;
 if expected_revision is null or r.lifecycle_revision<>expected_revision then raise exception 'document changed; refresh required' using errcode='PT409'; end if;
 if make_exempt is null or nullif(btrim(exemption_reason),'') is null or char_length(exemption_reason)>500 then raise exception 'exemption reason required' using errcode='22023'; end if;
 if r.lifecycle_exempt=make_exempt then return r.lifecycle_revision; end if;
 matching:=app_private.document_target_matches(r.workspace_id,r.employee_id,r.lifecycle_settings->'target');
 -- Ignore exemption/closure while checking a retained approved version.
 r.lifecycle_exempt:=false; r.lifecycle_closed_at:=null;
 if r.status='superseded' then r.status:='not_started'; end if;
 valid_approved:=app_private.document_obligation_state(r,now())='completed';
 if not make_exempt and matching and not valid_approved and r.lifecycle_settings->>'mode'<>'optional' and r.lifecycle_settings->>'period_days' is not null then
  next_deadline:=now()+(r.lifecycle_settings->>'period_days')::integer*interval '24 hours';
 end if;
 update public.employee_onboarding_requirements set lifecycle_exempt=make_exempt,
  lifecycle_closed_at=case when make_exempt or matching then null else coalesce(lifecycle_closed_at,now()) end,
  lifecycle_close_reason=btrim(exemption_reason),deadline_at=next_deadline,paused_remaining_seconds=null,document_suspended_at=null,
  lifecycle_revision=lifecycle_revision+1,updated_at=now() where id=r.id returning lifecycle_revision into expected_revision;
 perform app_private.document_audit(r,actor_user_id,case when make_exempt then 'document.exempted' else 'document.exemption_removed' end,
  jsonb_build_object('reason',btrim(exemption_reason),'revision',expected_revision,'old_deadline',r.deadline_at,'new_deadline',next_deadline,'matching',matching,'valid_approved',valid_approved));
 return expected_revision;
end;
$$;
revoke all on function public.set_employee_document_exemption_service(uuid,uuid,uuid,integer,boolean,text) from public,anon,authenticated;
grant execute on function public.set_employee_document_exemption_service(uuid,uuid,uuid,integer,boolean,text) to service_role;

-- Extend the canonical initializer in place with a checked anchor. Profile,
-- invitation, availability and activation behavior remains in that initializer.
do $$
declare body text;
begin
 body:=pg_get_functiondef('public.initialize_employee_onboarding_service(uuid,uuid)'::regprocedure);
 if strpos(body,'and document.required_at_onboarding')=0 then raise exception 'document initialization anchor changed'; end if;
 body:=replace(body,'and document.required_at_onboarding','and app_private.document_target_matches(employee.workspace_id,employee.id,document.lifecycle_settings->''target'')');
 execute body;
end;
$$;

-- One matcher serves saved assignments and the read-only proposed assignment preview.
create function app_private.document_target_matches_assignments(w uuid,e uuid,target jsonb,location_ids uuid[],job_ids uuid[])
returns boolean language plpgsql stable security definer set search_path='' as $$
declare loc jsonb:=coalesce(target->'location_ids','[]'); dep jsonb:=coalesce(target->'department_ids','[]'); job jsonb:=coalesce(target->'job_ids','[]'); loc_ok boolean; job_ok boolean;
begin
 if coalesce(target->'employee_ids','[]') ? e::text then return true; end if;
 if jsonb_array_length(loc)+jsonb_array_length(dep)+jsonb_array_length(job)=0 then return true; end if;
 loc_ok:=exists(select 1 from public.locations l where l.workspace_id=w and l.id=any(location_ids) and l.archived_at is null and loc ? l.id::text);
 if coalesce(target->>'operator','and')='or' then
  return loc_ok or exists(select 1 from public.jobs j where j.workspace_id=w and j.id=any(job_ids) and j.archived_at is null and (job ? j.id::text or dep ? j.department_id::text));
 end if;
 job_ok:=exists(select 1 from public.jobs j where j.workspace_id=w and j.id=any(job_ids) and j.archived_at is null and (jsonb_array_length(job)=0 or job ? j.id::text) and (jsonb_array_length(dep)=0 or dep ? j.department_id::text));
 return (jsonb_array_length(loc)=0 or loc_ok) and ((jsonb_array_length(job)=0 and jsonb_array_length(dep)=0) or job_ok);
end;
$$;
create or replace function app_private.document_target_matches(w uuid,e uuid,target jsonb)
returns boolean language sql stable security definer set search_path='' as $$
 select app_private.document_target_matches_assignments(w,e,target,
  array(select location_id from public.employee_location_assignments where workspace_id=w and employee_id=e and ended_at is null),
  array(select job_id from public.employee_job_assignments where workspace_id=w and employee_id=e and ended_at is null));
$$;
revoke all on function app_private.document_target_matches_assignments(uuid,uuid,jsonb,uuid[],uuid[]) from public,anon,authenticated,service_role;

create function public.preview_employee_document_assignments_service(actor_user_id uuid,target_workspace_id uuid,target_employee_id uuid,proposed_location_ids uuid[],proposed_job_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.employee_onboarding_requirements%rowtype; d app_private.lifecycle_definition%rowtype; p public.employee_profiles%rowtype; m public.workspace_memberships%rowtype;
 result jsonb:='[]'; matching boolean; action text; readable boolean; approved boolean; next_deadline timestamptz;
begin
 if not public.service_actor_has_permission(actor_user_id,target_workspace_id,'employees.manage') or not public.service_actor_can_access_employee(actor_user_id,target_workspace_id,target_employee_id)
 then raise exception 'employee management access required' using errcode='42501'; end if;
 select * into p from public.employee_profiles where id=target_employee_id and workspace_id=target_workspace_id;
 if p.id is null then raise exception 'employee unavailable' using errcode='P0002'; end if;
 if proposed_location_ids is null or proposed_job_ids is null or cardinality(proposed_location_ids)>100 or cardinality(proposed_job_ids)>100
  or exists(select 1 from unnest(proposed_location_ids) proposed(id) where proposed.id is null or not exists(select 1 from public.locations l where l.id=proposed.id and l.workspace_id=target_workspace_id and l.archived_at is null) or not exists(select 1 from public.workspace_memberships am where am.workspace_id=target_workspace_id and am.user_id=actor_user_id and am.status='active' and (am.all_locations or exists(select 1 from public.membership_location_scopes scope where scope.membership_id=am.id and scope.workspace_id=target_workspace_id and scope.location_id=proposed.id))))
  or exists(select 1 from unnest(proposed_job_ids) proposed(id) where proposed.id is null or not exists(select 1 from public.jobs j where j.id=proposed.id and j.workspace_id=target_workspace_id and j.archived_at is null))
 then raise exception 'valid scoped assignments required' using errcode='42501'; end if;
 select * into m from public.workspace_memberships where workspace_id=target_workspace_id and user_id=p.user_id;
 if p.archived_at is not null or m.id is null or m.status not in ('active','pending_activation') then return result; end if;
 readable:=public.service_actor_has_permission(actor_user_id,target_workspace_id,'employee_documents.read');
 for r in select * from public.employee_onboarding_requirements where workspace_id=target_workspace_id and employee_id=target_employee_id and kind in ('document','acknowledgement') and lifecycle_retired_at is null and source_id is not null and not lifecycle_exempt and not lifecycle_assignment_disabled loop
  matching:=app_private.document_target_matches_assignments(target_workspace_id,target_employee_id,r.lifecycle_settings->'target',proposed_location_ids,proposed_job_ids);
  action:=case when not matching and r.lifecycle_closed_at is null then 'remove' when matching and (r.lifecycle_closed_at is not null or r.status='superseded') then 'reopen' end;
  if action is null then continue; end if;
  next_deadline:=null;
  if action='reopen' then
   r.lifecycle_closed_at:=null; if r.status='superseded' then r.status:='not_started'; end if;
   approved:=app_private.document_obligation_state(r,now())='completed';
   if not approved and m.status='active' and r.lifecycle_settings->>'mode'<>'optional' then next_deadline:=now()+(r.lifecycle_settings->>'period_days')::integer*interval '24 hours'; end if;
  end if;
  result:=result||jsonb_build_array(jsonb_build_object('title',case when readable then r.title else 'Document requirement' end,'action',action,'deadline_at',next_deadline,'period_days',(r.lifecycle_settings->>'period_days')::integer,'clears_block',action='remove' and app_private.document_obligation_blocked(r,now())));
 end loop;
 for d in select * from app_private.lifecycle_definition q where q.workspace_id=target_workspace_id and q.archived_at is null and q.current_version
  and (m.status='pending_activation' or q.lifecycle_settings->>'assignment_scope'='all_active')
  and app_private.document_target_matches_assignments(target_workspace_id,target_employee_id,q.lifecycle_settings->'target',proposed_location_ids,proposed_job_ids)
  and not exists(select 1 from public.employee_onboarding_requirements existing_req where existing_req.workspace_id=target_workspace_id and existing_req.employee_id=target_employee_id and existing_req.kind::text=q.kind and existing_req.source_id=q.id and existing_req.lifecycle_retired_at is null) loop
  next_deadline:=case when m.status='active' and d.lifecycle_settings->>'mode'<>'optional' then now()+(d.lifecycle_settings->>'period_days')::integer*interval '24 hours' end;
  result:=result||jsonb_build_array(jsonb_build_object('title',case when readable then d.title else 'Document requirement' end,'action','assign','deadline_at',next_deadline,'period_days',(d.lifecycle_settings->>'period_days')::integer,'clears_block',false));
 end loop;
 return result;
end;
$$;
revoke all on function public.preview_employee_document_assignments_service(uuid,uuid,uuid,uuid[],uuid[]) from public,anon,authenticated;
grant execute on function public.preview_employee_document_assignments_service(uuid,uuid,uuid,uuid[],uuid[]) to service_role;

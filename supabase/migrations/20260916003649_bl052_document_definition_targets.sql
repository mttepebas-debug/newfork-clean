-- Definition selectors expose only the caller's location/employee scope.
create function public.document_definition_target_options_service(actor_user_id uuid,target_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.service_actor_has_permission(actor_user_id,target_workspace_id,'documents.manage') then raise exception 'document management access required' using errcode='42501'; end if;
 select jsonb_build_object(
  'locations',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name) order by l.name) from public.locations l where l.workspace_id=target_workspace_id and l.archived_at is null
   and exists(select 1 from public.workspace_memberships m where m.workspace_id=l.workspace_id and m.user_id=actor_user_id and m.status='active'
    and (m.all_locations or exists(select 1 from public.membership_location_scopes s where s.membership_id=m.id and s.workspace_id=m.workspace_id and s.location_id=l.id)))),'[]'),
  'departments',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.name) order by d.name) from public.departments d where d.workspace_id=target_workspace_id and d.archived_at is null),'[]'),
  'jobs',coalesce((select jsonb_agg(jsonb_build_object('id',j.id,'name',j.name,'department_id',j.department_id) order by j.name) from public.jobs j where j.workspace_id=target_workspace_id and j.archived_at is null),'[]'),
  'employees',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'name',concat_ws(' ',e.first_name,e.last_name)) order by e.first_name,e.last_name) from public.employee_profiles e where e.workspace_id=target_workspace_id and e.archived_at is null and public.service_actor_can_access_employee(actor_user_id,target_workspace_id,e.id)),'[]')
 ) into result;
 return result;
end;
$$;
revoke all on function public.document_definition_target_options_service(uuid,uuid) from public,anon,authenticated;
grant execute on function public.document_definition_target_options_service(uuid,uuid) to service_role;

-- Validate target selections through the same scoped options used by the editor.
create function app_private.assert_document_definition_target(actor uuid,w uuid,target jsonb)
returns void language plpgsql stable security definer set search_path='' as $$
declare options jsonb; pair text[]; selected jsonb;
begin
 options:=public.document_definition_target_options_service(actor,w);
 if coalesce(target->>'operator','and') not in ('and','or') then raise exception 'valid target operator required' using errcode='22023'; end if;
 foreach pair slice 1 in array array[['location_ids','locations'],['department_ids','departments'],['job_ids','jobs'],['employee_ids','employees']] loop
  if jsonb_typeof(coalesce(target->pair[1],'[]'))<>'array' then raise exception 'valid target selection required' using errcode='22023'; end if;
  for selected in select value from jsonb_array_elements(coalesce(target->pair[1],'[]')) loop
   if not exists(select 1 from jsonb_array_elements(options->pair[2]) o where o->'id'=selected) then raise exception 'document target access denied' using errcode='42501'; end if;
  end loop;
 end loop;
end;
$$;
revoke all on function app_private.assert_document_definition_target(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
do $$
declare body text;
begin
 body:=pg_get_functiondef('public.save_document_type_lifecycle_service(uuid,uuid,uuid,integer,jsonb)'::regprocedure);
 if strpos(body,'period:=(settings')=0 then raise exception 'document settings anchor changed'; end if;
 body:=replace(body,'period:=(settings','perform app_private.assert_document_definition_target(actor_user_id,target_workspace_id,settings->''target''); period:=(settings');
 execute body;
end;
$$;

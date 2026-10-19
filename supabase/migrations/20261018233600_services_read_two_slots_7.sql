-- ROL-CIFT 1.4, services_read_two_slots part 7 of 7: the same migration as part 1 describes, split at
-- statement boundaries so each part goes live in one piece. Runs after part 6.

-- Settings > Roles reads the editor's class from the core.
CREATE OR REPLACE FUNCTION "public"."save_workspace_role_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_role_id" "uuid", "role_name" "text", "role_description" "text", "role_access_class" "public"."workspace_role", "permission_keys" "text"[], "expected_updated_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare target public.workspace_roles; saved uuid; normalized text[]; actor_class public.workspace_role;
begin
 -- Serialize role editors, including concurrent actor-grant changes.
 perform pg_advisory_xact_lock(hashtextextended('roles:'||target_workspace_id::text,0));
 perform app_private.authorize(actor_user_id,target_workspace_id,'settings.roles.write');
 if not app_private.can_edit_role(actor_user_id,target_workspace_id,target_role_id) then raise exception 'role management access denied' using errcode='42501',hint=case when target_role_id is not null and not exists(select 1 from public.workspace_roles r where r.id=target_role_id and r.workspace_id=target_workspace_id) then 'authz.out_of_scope' else 'authz.rank' end; end if;
 -- The editor's class, from the core (ROL-CIFT: the management slot's, else employee).
 actor_class := (app_private.actor(actor_user_id,target_workspace_id)).class;
 if target_role_id is not null then
  select * into target from public.workspace_roles where id=target_role_id and workspace_id=target_workspace_id for update;
  if expected_updated_at is null or expected_updated_at<>target.updated_at then raise exception 'Role changed since you opened it. Reload before saving.' using errcode='PT409',hint='role.changed'; end if;
  if role_access_class<>target.access_class then raise exception 'Existing role experience cannot change' using errcode='22023'; end if;
 elsif role_access_class not in ('manager','employee') then raise exception 'Custom roles require a manager or employee experience' using errcode='42501'; end if;
 if role_name is null or char_length(btrim(role_name)) not between 1 and 64 or char_length(coalesce(role_description,''))>240 then raise exception 'Valid role details required' using errcode='22023'; end if;
 select coalesce(array_agg(distinct key order by key),'{}'::text[]) into normalized from unnest(coalesce(permission_keys,'{}'::text[])) key;
 if not 'workspace.read'=any(normalized) then raise exception 'Basic account access required' using errcode='22023'; end if;
 if exists(select 1 from unnest(normalized) k left join public.permissions p on p.key=k where p.key is null) then raise exception 'Unknown permission' using errcode='22023'; end if;
 if role_access_class<>'admin' and exists(select 1 from public.permissions p where p.key=any(normalized) and not p.custom_grantable) then raise exception 'Permission is not eligible for a lower role' using errcode='42501', hint='authz.rank'; end if;
 if role_access_class<>'admin' and normalized && array['roles.manage','workspace.manage'] then raise exception 'Protected management access denied' using errcode='42501'; end if;
 if role_access_class='employee' and exists(select 1 from unnest(normalized) k where k not in (select p.key from public.permissions p where p.employee_eligible)) then raise exception 'Employee roles are limited to personal access' using errcode='42501'; end if;
 -- Admin delegation cannot manufacture permissions it does not itself hold.
 if actor_class='admin' and exists(select 1 from unnest(normalized) k where not k = any ((select (app_private.actor(actor_user_id,target_workspace_id)).permissions)::text[])) then raise exception 'Cannot grant access beyond your own permissions' using errcode='42501',hint='authz.missing_permission'; end if;
 if exists(select 1 from app_private.role_permission_dependencies d where d.permission_key=any(normalized) and not d.required_key=any(normalized)) then raise exception 'Permission set requires dependent read access' using errcode='22023'; end if;
 if target_role_id is null then
  insert into public.workspace_roles(workspace_id,name,description,access_class,sort_order,created_by) values(target_workspace_id,btrim(role_name),btrim(coalesce(role_description,'')),role_access_class,100,actor_user_id) returning id into saved;
 else
  saved:=target_role_id;
  update public.workspace_roles set name=case when system_key is null then btrim(role_name) else name end,description=case when system_key is null then btrim(coalesce(role_description,'')) else description end,updated_at=clock_timestamp() where id=saved;
 end if;
 delete from public.workspace_role_permissions where role_id=saved;
 insert into public.workspace_role_permissions(workspace_id,role_id,permission_key) select target_workspace_id,saved,unnest(normalized);
 insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata) values(target_workspace_id,actor_user_id,case when target_role_id is null then 'role.created' else 'role.updated' end,'workspace_role',saved::text,jsonb_build_object('permissions',normalized));
 return saved;
end; $$;

-- Nobody reads or writes management information about themselves (design §4.6): the Manager note and a
-- manager's write of somebody's week are about others, now that a manager who works holds them too.
update app_private.authz_actions set no_self = true
where key in ('availability.team_write', 'availability.note_read');

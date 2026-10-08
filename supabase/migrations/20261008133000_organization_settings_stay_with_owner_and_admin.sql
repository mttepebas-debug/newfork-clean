-- GUVENLIK-A GA-2 (BL-178). The organization-wide Edit permissions and roles.read
-- stay with the owner and admin roles: KARARLAR K14 S2 and "Manager tipi rollere
-- organizasyon ayarı yazma izni verilemez". The organization reads stay grantable
-- (K14 S1). Settings > Roles stops offering them on manager roles
-- (packages/shared/src/role-permissions.ts).

-- A manager or employee role that holds one loses it, and so does any grant left
-- without the read it needs (employee_access.manage needs roles.read). Measured
-- 2026-10-08: 0 rows locally and hosted.
delete from public.workspace_role_permissions rp
using public.workspace_roles r
where r.id = rp.role_id
  and r.access_class in ('manager', 'employee')
  and rp.permission_key in (
    'settings.general.manage', 'settings.locations.manage', 'settings.jobs.manage',
    'settings.shift_catalog.manage', 'settings.schedule_rules.manage', 'documents.manage',
    'notifications.settings.write', 'schedule.conflict_rules.manage', 'roles.read');

do $$
begin
  loop
    delete from public.workspace_role_permissions rp
    using public.workspace_roles r, app_private.role_permission_dependencies d
    where r.id = rp.role_id
      and r.access_class in ('manager', 'employee')
      and d.permission_key = rp.permission_key
      and not exists (
        select 1 from public.workspace_role_permissions needed
        where needed.role_id = rp.role_id and needed.permission_key = d.required_key);
    exit when not found;
  end loop;
end $$;

update public.permissions
set custom_grantable = false
where key in (
  'settings.general.manage', 'settings.locations.manage', 'settings.jobs.manage',
  'settings.shift_catalog.manage', 'settings.schedule_rules.manage', 'documents.manage',
  'notifications.settings.write', 'schedule.conflict_rules.manage', 'roles.read');

-- The save no longer lets a role keep a permission it already carries
-- (CLAUDE.md §2.A.5), and the refusal names its reason (authz.rank).
CREATE OR REPLACE FUNCTION "public"."save_workspace_role_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_role_id" "uuid", "role_name" "text", "role_description" "text", "role_access_class" "public"."workspace_role", "permission_keys" "text"[], "expected_updated_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare target public.workspace_roles; saved uuid; normalized text[]; actor_class public.workspace_role;
begin
 -- Serialize role editors, including concurrent actor-grant changes.
 perform pg_advisory_xact_lock(hashtextextended('roles:'||target_workspace_id::text,0));
 if not app_private.can_edit_role(actor_user_id,target_workspace_id,target_role_id) then raise exception 'role management access denied' using errcode='42501'; end if;
 select role into actor_class from public.workspace_memberships where user_id=actor_user_id and workspace_id=target_workspace_id and status='active';
 if target_role_id is not null then
  select * into target from public.workspace_roles where id=target_role_id and workspace_id=target_workspace_id for update;
  if expected_updated_at is null or expected_updated_at<>target.updated_at then raise exception 'Role changed since you opened it. Reload before saving.' using errcode='PT409'; end if;
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
 if actor_class='admin' and exists(select 1 from unnest(normalized) k where not public.service_actor_has_permission(actor_user_id,target_workspace_id,k)) then raise exception 'Cannot grant access beyond your own permissions' using errcode='42501'; end if;
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

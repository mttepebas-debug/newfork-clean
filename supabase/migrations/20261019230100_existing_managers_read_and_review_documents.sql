-- BL-560: the built-in manager role of every existing workspace gets what a new one starts with
-- (previous migration). Only the role a workspace was given (system_key = 'manager'); a role an owner
-- made stays as it was. Adds rows, removes none.
-- A built-in manager an owner took employees.read off is left alone: employee_documents.read needs it
-- (enforce_role_permission_dependencies), and one such role would undo the whole insert.
-- A role that got the rows moves its updated_at, so a Settings > Roles tab opened before this asks to
-- reload instead of saving the role back without them.
with granted as (
  insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
  select r.workspace_id, r.id, p.key
  from public.workspace_roles r
  join public.permissions p on p.key in ('employee_documents.read', 'employee_documents.review')
  where r.system_key = 'manager'
    and exists (
      select 1 from public.workspace_role_permissions g
      where g.role_id = r.id and g.permission_key = 'employees.read'
    )
  on conflict do nothing
  returning role_id
)
update public.workspace_roles r
set updated_at = clock_timestamp()
where r.id in (select role_id from granted);

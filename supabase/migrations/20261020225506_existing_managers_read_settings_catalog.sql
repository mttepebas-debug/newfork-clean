-- BL-680: the built-in manager role of every existing workspace gets the Settings catalog reads a new
-- one starts with (previous migration). Only the role a workspace was given (system_key = 'manager');
-- a role an owner made stays as it was. Adds rows, removes none. The four reads need no other right
-- (app_private.role_permission_dependencies), so no role is skipped.
-- A role that got rows moves its updated_at, so a Settings > Roles tab opened before this asks to
-- reload instead of saving the role back without them (as BL-560).
with granted as (
  insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
  select r.workspace_id, r.id, p.key
  from public.workspace_roles r
  join public.permissions p on p.key in
    ('settings.jobs.read', 'settings.shift_catalog.read', 'settings.schedule_rules.read', 'documents.read')
  where r.system_key = 'manager'
  on conflict do nothing
  returning role_id
)
update public.workspace_roles r
set updated_at = clock_timestamp()
where r.id in (select role_id from granted);

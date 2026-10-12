-- BL-176 (the rest; Mert 2026-10-12): Settings > Locations is for owners and
-- admins only. No manager opens it, with a location or without one (Remote).
-- Today only the owner and admin roles hold settings.locations.read, locally and
-- hosted, but Settings > Roles could still put "Locations: View" on a custom
-- manager role. Like the organization Edits (20261008133054, K14 S2) it is not
-- grantable to a custom role any more; save_workspace_role_service refuses it
-- with authz.rank and Settings > Roles stops offering it
-- (packages/shared/src/role-permissions.ts reads custom_grantable).
--
-- Nothing is deleted: a manager or employee role that holds it stops the
-- migration instead (measured 2026-10-12: none).

do $guard$
declare
  holding integer;
begin
  select count(*) into holding
  from public.workspace_role_permissions grant_row
  join public.workspace_roles role on role.id = grant_row.role_id
  where role.access_class in ('manager', 'employee')
    and grant_row.permission_key = 'settings.locations.read';
  if holding > 0 then
    raise exception 'BL-176: % manager or employee role(s) hold settings.locations.read; ask before it is taken off', holding;
  end if;
end
$guard$;

update public.permissions
set custom_grantable = false
where key = 'settings.locations.read';

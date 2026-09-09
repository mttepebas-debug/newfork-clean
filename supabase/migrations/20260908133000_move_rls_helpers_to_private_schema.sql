-- Keep RLS helper names stable for existing policies, but move their
-- SECURITY DEFINER bodies out of the exposed public API schema.
create schema if not exists app_private;

revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated, service_role;

create or replace function app_private.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  );
$$;

create or replace function app_private.workspace_role_for(target_workspace_id uuid)
returns public.workspace_role
language sql
stable
security definer
set search_path = ''
as $$
  select membership.role
  from public.workspace_memberships membership
  where membership.workspace_id = target_workspace_id
    and membership.user_id = (select auth.uid())
    and membership.status = 'active'
  limit 1;
$$;

create or replace function app_private.workspace_has_permission(
  target_workspace_id uuid,
  target_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_memberships membership
    join public.workspace_role_permissions grant_row
      on grant_row.workspace_id = membership.workspace_id
     and grant_row.role_id = membership.role_id
    where membership.workspace_id = target_workspace_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and grant_row.permission_key = target_permission
  );
$$;

create or replace function app_private.can_manage_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.workspace_has_permission(target_workspace_id, 'workspace.manage');
$$;

create or replace function app_private.can_access_location(
  target_workspace_id uuid,
  target_location_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and (
        membership.all_locations
        or exists (
          select 1
          from public.membership_location_scopes scope
          where scope.membership_id = membership.id
            and scope.workspace_id = target_workspace_id
            and scope.location_id = target_location_id
        )
      )
  );
$$;

create or replace function app_private.can_access_employee(
  target_workspace_id uuid,
  target_employee_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and (
        membership.all_locations
        or exists (
          select 1
          from public.employee_location_assignments assignment
          join public.membership_location_scopes scope
            on scope.membership_id = membership.id
           and scope.workspace_id = membership.workspace_id
           and scope.location_id = assignment.location_id
          where assignment.employee_id = target_employee_id
            and assignment.workspace_id = target_workspace_id
            and assignment.ended_at is null
        )
      )
  );
$$;

revoke all on function app_private.is_workspace_member(uuid)
from public, anon;
revoke all on function app_private.workspace_role_for(uuid)
from public, anon;
revoke all on function app_private.workspace_has_permission(uuid, text)
from public, anon;
revoke all on function app_private.can_manage_workspace(uuid)
from public, anon;
revoke all on function app_private.can_access_location(uuid, uuid)
from public, anon;
revoke all on function app_private.can_access_employee(uuid, uuid)
from public, anon;

grant execute on function app_private.is_workspace_member(uuid)
to authenticated, service_role;
grant execute on function app_private.workspace_role_for(uuid)
to authenticated, service_role;
grant execute on function app_private.workspace_has_permission(uuid, text)
to authenticated, service_role;
grant execute on function app_private.can_manage_workspace(uuid)
to authenticated, service_role;
grant execute on function app_private.can_access_location(uuid, uuid)
to authenticated, service_role;
grant execute on function app_private.can_access_employee(uuid, uuid)
to authenticated, service_role;

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.is_workspace_member(target_workspace_id);
$$;

create or replace function public.workspace_role_for(target_workspace_id uuid)
returns public.workspace_role
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.workspace_role_for(target_workspace_id);
$$;

create or replace function public.workspace_has_permission(
  target_workspace_id uuid,
  target_permission text
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.workspace_has_permission(target_workspace_id, target_permission);
$$;

create or replace function public.can_manage_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.can_manage_workspace(target_workspace_id);
$$;

create or replace function public.can_access_location(
  target_workspace_id uuid,
  target_location_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.can_access_location(target_workspace_id, target_location_id);
$$;

create or replace function public.can_access_employee(
  target_workspace_id uuid,
  target_employee_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.can_access_employee(target_workspace_id, target_employee_id);
$$;

revoke all on function public.is_workspace_member(uuid)
from public, anon;
revoke all on function public.workspace_role_for(uuid)
from public, anon;
revoke all on function public.workspace_has_permission(uuid, text)
from public, anon;
revoke all on function public.can_manage_workspace(uuid)
from public, anon;
revoke all on function public.can_access_location(uuid, uuid)
from public, anon;
revoke all on function public.can_access_employee(uuid, uuid)
from public, anon;

grant execute on function public.is_workspace_member(uuid)
to authenticated, service_role;
grant execute on function public.workspace_role_for(uuid)
to authenticated, service_role;
grant execute on function public.workspace_has_permission(uuid, text)
to authenticated, service_role;
grant execute on function public.can_manage_workspace(uuid)
to authenticated, service_role;
grant execute on function public.can_access_location(uuid, uuid)
to authenticated, service_role;
grant execute on function public.can_access_employee(uuid, uuid)
to authenticated, service_role;

create or replace function public.resolve_active_workspace()
returns table (
  user_id uuid,
  workspace_id uuid,
  workspace_name text,
  workspace_logo_storage_path text,
  workspace_logo_file_name text,
  workspace_logo_updated_at timestamptz,
  schedule_logo_scale numeric,
  schedule_logo_offset_x numeric,
  schedule_logo_offset_y numeric,
  membership_id uuid,
  workspace_role public.workspace_role,
  membership_role_id uuid,
  membership_role_name text,
  permission_keys text[],
  all_locations boolean,
  onboarding_status public.onboarding_status,
  onboarding_current_step smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  with active_memberships as (
    select
      membership.*,
      count(*) over () as active_count
    from public.workspace_memberships membership
    where membership.user_id = (select auth.uid())
      and membership.status = 'active'
  )
  select
    membership.user_id,
    workspace.id,
    workspace.name,
    workspace.logo_storage_path,
    workspace.logo_file_name,
    workspace.logo_updated_at,
    workspace.schedule_logo_scale,
    workspace.schedule_logo_offset_x,
    workspace.schedule_logo_offset_y,
    membership.id,
    role.access_class,
    membership.role_id,
    role.name,
    coalesce(
      array_agg(grant_row.permission_key order by permission.sort_order)
        filter (where grant_row.permission_key is not null),
      '{}'::text[]
    ),
    membership.all_locations,
    coalesce(onboarding.status, 'complete'::public.onboarding_status),
    coalesce(onboarding.current_step, 2::smallint)
  from active_memberships membership
  join public.workspaces workspace on workspace.id = membership.workspace_id
  join public.workspace_roles role on role.id = membership.role_id and role.workspace_id = membership.workspace_id
  left join public.workspace_role_permissions grant_row on grant_row.role_id = role.id
  left join public.permissions permission on permission.key = grant_row.permission_key
  left join public.user_workspace_preferences preference on preference.user_id = membership.user_id
  left join public.workspace_onboarding onboarding on onboarding.workspace_id = workspace.id
  where membership.active_count = 1
    or workspace.id = preference.active_workspace_id
  group by
    membership.user_id,
    workspace.id,
    workspace.name,
    workspace.logo_storage_path,
    workspace.logo_file_name,
    workspace.logo_updated_at,
    workspace.schedule_logo_scale,
    workspace.schedule_logo_offset_x,
    workspace.schedule_logo_offset_y,
    membership.id,
    role.access_class,
    membership.role_id,
    role.name,
    membership.all_locations,
    onboarding.status,
    onboarding.current_step,
    preference.active_workspace_id,
    membership.active_count,
    membership.created_at
  order by
    (workspace.id = preference.active_workspace_id) desc,
    membership.created_at asc
  limit 1;
$$;

revoke execute on function public.resolve_active_workspace()
from public, anon, authenticated;

-- JOIN-009: an account is global and a workspace keeps its own record of the
-- person, and nothing on screen said so. Someone editing their account name had
-- no way to learn that a workspace files them under a different one, or which.
--
-- This reads only the account's own rows, so it needs no permission beyond
-- being that account.
create or replace function public.list_my_workspace_identities_service(actor_user_id uuid)
returns table(
  workspace_id uuid,
  workspace_name text,
  workspace_role public.workspace_role,
  employee_name text,
  employee_code text
)
language sql
security definer
set search_path to ''
as $function$
  select
    workspace.id,
    workspace.name,
    membership.role,
    nullif(btrim(coalesce(employee.first_name, '') || ' ' || coalesce(employee.last_name, '')), ''),
    employee.employee_code
  from public.workspace_memberships membership
  join public.workspaces workspace on workspace.id = membership.workspace_id
  left join public.employee_profiles employee
    on employee.workspace_id = membership.workspace_id
   and employee.user_id = membership.user_id
   and employee.archived_at is null
  where membership.user_id = actor_user_id
    and membership.status in (
      'active'::public.membership_status,
      'pending_activation'::public.membership_status
    )
    and workspace.lifecycle_status <> 'deleted'::public.workspace_lifecycle_status
  order by workspace.name;
$function$;

revoke all on function public.list_my_workspace_identities_service(uuid) from public, anon, authenticated;
grant execute on function public.list_my_workspace_identities_service(uuid) to service_role;

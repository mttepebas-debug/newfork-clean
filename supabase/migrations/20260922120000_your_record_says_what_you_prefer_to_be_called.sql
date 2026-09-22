-- The person edits their preferred name where they edit the rest of their own
-- record, so the read has to carry it. A return type cannot be widened in
-- place, so the function is dropped and rebuilt, and its grants given back.

drop function if exists public.list_own_employment_records_service(uuid);

create function public.list_own_employment_records_service(actor_user_id uuid)
returns table (
  workspace_id uuid,
  workspace_name text,
  employee_id uuid,
  preferred_name text,
  phone text,
  emergency_contact_name text,
  emergency_contact_relationship text,
  emergency_contact_phone text,
  emergency_contact_email text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    employee.workspace_id,
    workspace.name,
    employee.id,
    coalesce(employee.preferred_name, ''),
    private_profile.phone,
    coalesce(private_profile.emergency_contact_name, ''),
    coalesce(private_profile.emergency_contact_relationship, ''),
    coalesce(private_profile.emergency_contact_phone, ''),
    coalesce(private_profile.emergency_contact_email, '')
  from public.employee_profiles employee
  join public.workspaces workspace on workspace.id = employee.workspace_id
  join public.workspace_memberships membership
    on membership.workspace_id = employee.workspace_id
   and membership.user_id = employee.user_id
  left join public.employee_private_profiles private_profile
    on private_profile.employee_id = employee.id
  where employee.user_id = actor_user_id
    and employee.archived_at is null
    and membership.status in (
      'active'::public.membership_status,
      'pending_activation'::public.membership_status
    )
    and workspace.lifecycle_status <> 'deleted'
  order by workspace.name;
$$;

revoke all on function public.list_own_employment_records_service(uuid)
  from public, anon, authenticated;
grant execute on function public.list_own_employment_records_service(uuid)
  to service_role;

create or replace function public.can_access_employee(
  target_workspace_id uuid,
  target_employee_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select membership.id, membership.all_locations, role.access_class
    from public.workspace_memberships membership
    join public.workspace_roles role
      on role.id = membership.role_id
     and role.workspace_id = membership.workspace_id
    where membership.workspace_id = target_workspace_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
    limit 1
  ),
  target_employee as (
    select employee.id, target_role.access_class
    from public.employee_profiles employee
    left join public.workspace_memberships target_membership
      on target_membership.workspace_id = employee.workspace_id
     and target_membership.user_id = employee.user_id
    left join public.workspace_roles target_role
      on target_role.id = target_membership.role_id
     and target_role.workspace_id = target_membership.workspace_id
    where employee.workspace_id = target_workspace_id
      and employee.id = target_employee_id
  )
  select exists (
    select 1
    from actor
    cross join target_employee
    where actor.access_class in ('owner', 'admin')
       or (
        actor.access_class = 'manager'
        and coalesce(target_employee.access_class, 'employee'::public.workspace_role) = 'employee'::public.workspace_role
        and (
          actor.all_locations
          or exists (
            select 1
            from public.employee_location_assignments assignment
            join public.membership_location_scopes scope
              on scope.membership_id = actor.id
             and scope.workspace_id = target_workspace_id
             and scope.location_id = assignment.location_id
            where assignment.employee_id = target_employee_id
              and assignment.workspace_id = target_workspace_id
              and assignment.ended_at is null
          )
        )
      )
  );
$$;

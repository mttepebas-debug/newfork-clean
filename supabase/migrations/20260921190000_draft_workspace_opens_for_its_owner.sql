-- A draft workspace is closed to everyone, including the owner whose setup
-- wizard writes locations, departments and jobs straight from the browser:
-- `is_workspace_member` and its two scoped siblings each carried their own copy
-- of the lifecycle test, and none of them knew about setup. So an owner adding
-- a job in step three got "new row violates row-level security policy" from the
-- select that PostgREST runs for the returned row.
--
-- One place decides now, and it names the one account a draft is open to.
create or replace function app_private.workspace_open_to_actor(
  target_workspace_id uuid,
  actor_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select app_private.workspace_allows_interactive_access(target_workspace_id)
    or exists (
      select 1
      from public.workspaces workspace
      join public.workspace_memberships membership
        on membership.workspace_id = workspace.id
      where workspace.id = target_workspace_id
        and workspace.lifecycle_status = 'draft'
        and membership.user_id = actor_user_id
        and membership.status = 'active'
        and membership.role = 'owner'
    );
$function$;

revoke all on function app_private.workspace_open_to_actor(uuid, uuid) from public, anon, authenticated;

create or replace function app_private.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select not app_private.document_actor_blocked((select auth.uid()), target_workspace_id) and exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and app_private.workspace_open_to_actor(target_workspace_id, (select auth.uid()))
  );
$function$;

create or replace function app_private.can_access_location(
  target_workspace_id uuid,
  target_location_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select not app_private.document_actor_blocked((select auth.uid()), target_workspace_id) and exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and app_private.workspace_open_to_actor(target_workspace_id, (select auth.uid()))
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
$function$;

create or replace function app_private.can_access_employee(
  target_workspace_id uuid,
  target_employee_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and app_private.workspace_open_to_actor(target_workspace_id, (select auth.uid()))
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
$function$;

-- Two more carried their own copy of the same test. The role lookup is the one
-- `workspace_onboarding_update_owner` reads, so without this an owner cannot
-- write their own setup row through RLS at all — only the service path, which
-- is definer-rights and never asked.
create or replace function app_private.workspace_role_for(target_workspace_id uuid)
returns public.workspace_role
language sql
stable
security definer
set search_path to ''
as $function$
  select membership.role
  from public.workspace_memberships membership
  where membership.workspace_id = target_workspace_id
    and membership.user_id = (select auth.uid())
    and membership.status = 'active'
    and not app_private.document_actor_blocked((select auth.uid()), target_workspace_id)
    and app_private.workspace_open_to_actor(target_workspace_id, (select auth.uid()))
  limit 1;
$function$;

-- Deliberately not changed: app_private.user_has_active_organization_access.
-- It decides whether an account may be deleted, and the blocker list the screen
-- shows alongside it counts only active and closing workspaces. Teaching one of
-- them about drafts and not the other refuses the deletion without naming a
-- reason, so a draft keeps counting as nowhere to work for both.

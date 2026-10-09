-- "Everyone loses access to this workspace the moment you close it" is true and
-- says nothing about the size of it. The account's workspace list carried no
-- count, so the screen could not put a number on what closing costs.
--
-- Two counts travel with each row now: how many other people hold access, and
-- how many invitations are still waiting for an answer. The reader is left out
-- of the first on purpose. They know about themselves; the weight of the
-- decision is what happens to everybody else.
--
-- A return type cannot be widened in place, so both functions are dropped and
-- rebuilt. Dropping takes their grants with it, which is why they are given
-- back below; supabase/tests/public_roles_reach_no_table_directly fails if that
-- is ever forgotten.

drop function if exists public.list_my_workspaces_service(uuid);
drop function if exists public.list_my_workspaces();

CREATE FUNCTION public.list_my_workspaces()
 RETURNS TABLE(workspace_id uuid, workspace_name text, workspace_role workspace_role, membership_status membership_status, is_active boolean, onboarding_status onboarding_status, onboarding_current_step smallint, workspace_lifecycle_status workspace_lifecycle_status, closure_effective_at timestamp with time zone, last_used_at timestamp with time zone, access_removed boolean, pending_ownership_transfer_id uuid, pending_ownership_transfer_role text, pending_ownership_transfer_expires_at timestamp with time zone, other_member_count integer, pending_invitation_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    workspace.id,
    workspace.name,
    membership.role,
    membership.status,
    coalesce(workspace.id = preference.active_workspace_id, false)
      and membership.status = 'active'
      and (
        workspace.lifecycle_status = 'active'
        or (
          workspace.lifecycle_status = 'closure_scheduled'
          and workspace.closure_effective_at > now()
        )
      ),
    coalesce(onboarding.status, 'complete'::public.onboarding_status),
    coalesce(onboarding.current_step, 2::smallint),
    workspace.lifecycle_status,
    workspace.closure_effective_at,
    membership.last_used_at,
    exists (
      select 1
      from public.employee_access_snapshots snapshot
      where snapshot.membership_id = membership.id
        and snapshot.restored_at is null
    ),
    transfer.id,
    case
      when transfer.id is null then null
      when transfer.target_user_id = (select auth.uid()) then 'target'
      else 'initiator'
    end,
    transfer.expires_at,
    -- Everybody else who would lose access, and everybody who has been asked
    -- and not answered. The reader is not counted: they know about themselves,
    -- and what the closing screen has to say is what it costs other people.
    (
      select count(*)
      from public.workspace_memberships other
      where other.workspace_id = workspace.id
        and other.user_id <> membership.user_id
        and other.status in ('active', 'pending_activation')
        and not exists (
          select 1
          from public.employee_profiles employee
          where employee.workspace_id = other.workspace_id
            and employee.user_id = other.user_id
            and employee.archived_at is not null
        )
    )::integer,
    (
      select count(*)
      from public.employee_invitations invitation
      where invitation.workspace_id = workspace.id
        and invitation.status = 'pending'
        and invitation.expires_at > now()
    )::integer
  from public.workspace_memberships membership
  join public.workspaces workspace on workspace.id = membership.workspace_id
  left join public.user_workspace_preferences preference on preference.user_id = membership.user_id
  left join public.workspace_onboarding onboarding on onboarding.workspace_id = workspace.id
  left join lateral (
    select pending_transfer.id,
           pending_transfer.target_user_id,
           pending_transfer.expires_at
    from public.workspace_ownership_transfers pending_transfer
    where pending_transfer.workspace_id = workspace.id
      and pending_transfer.status = 'pending'
      -- Keep expired requests visible to their sender so they can be cancelled.
      and (pending_transfer.expires_at > now() or pending_transfer.initiated_by = membership.user_id)
      and (
        pending_transfer.initiated_by = membership.user_id
        or pending_transfer.target_user_id = membership.user_id
      )
    order by pending_transfer.created_at desc
    limit 1
  ) transfer on true
  where membership.user_id = (select auth.uid())
    and not exists (
      select 1
      from public.employee_profiles employee
      where employee.workspace_id = membership.workspace_id
        and employee.user_id = membership.user_id
        and employee.archived_at is not null
    )
  order by
    (membership.status = 'active') desc,
    (coalesce(workspace.id = preference.active_workspace_id, false) and membership.status = 'active') desc,
    workspace.name asc;
$function$;

CREATE FUNCTION public.list_my_workspaces_service(actor_user_id uuid)
 RETURNS TABLE(workspace_id uuid, workspace_name text, workspace_role workspace_role, membership_status membership_status, is_active boolean, onboarding_status onboarding_status, onboarding_current_step smallint, workspace_lifecycle_status workspace_lifecycle_status, closure_effective_at timestamp with time zone, last_used_at timestamp with time zone, access_removed boolean, pending_ownership_transfer_id uuid, pending_ownership_transfer_role text, pending_ownership_transfer_expires_at timestamp with time zone, other_member_count integer, pending_invitation_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  return query select * from public.list_my_workspaces();
end;
$function$;

revoke all on function public.list_my_workspaces()
  from public, anon, authenticated;

revoke all on function public.list_my_workspaces_service(uuid)
  from public, anon, authenticated;
grant execute on function public.list_my_workspaces_service(uuid)
  to service_role;

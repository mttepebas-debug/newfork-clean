-- JOIN-005: the switcher opens on the workspace the account used last, so the
-- list has to carry when each one was last opened. The column was added with
-- the lifecycle work; nothing filled it in or read it back until now.
drop function if exists public.list_my_workspaces();

CREATE OR REPLACE FUNCTION public.list_my_workspaces()
 RETURNS TABLE(workspace_id uuid, workspace_name text, workspace_role workspace_role, membership_status membership_status, is_active boolean, onboarding_status onboarding_status, onboarding_current_step smallint, workspace_lifecycle_status workspace_lifecycle_status, closure_effective_at timestamp with time zone, last_used_at timestamp with time zone, pending_ownership_transfer_id uuid, pending_ownership_transfer_role text, pending_ownership_transfer_expires_at timestamp with time zone)
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
    transfer.id,
    case
      when transfer.id is null then null
      when transfer.target_user_id = (select auth.uid()) then 'target'
      else 'initiator'
    end,
    transfer.expires_at
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
    and workspace.lifecycle_status <> 'deleted'
    and (
      workspace.lifecycle_status <> 'closure_scheduled'
      or workspace.closure_effective_at > now()
    )
    and not (
      membership.status = 'suspended'::public.membership_status
      and exists (
        select 1
        from public.employee_access_snapshots snapshot
        where snapshot.membership_id = membership.id
          and snapshot.restored_at is null
      )
    )
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
$function$

;

-- The service wrapper repeats the column list, so it has to learn the new one.
drop function if exists public.list_my_workspaces_service(uuid);
create function public.list_my_workspaces_service(actor_user_id uuid)
returns table(
  workspace_id uuid,
  workspace_name text,
  workspace_role public.workspace_role,
  membership_status public.membership_status,
  is_active boolean,
  onboarding_status public.onboarding_status,
  onboarding_current_step smallint,
  workspace_lifecycle_status public.workspace_lifecycle_status,
  closure_effective_at timestamptz,
  last_used_at timestamptz,
  pending_ownership_transfer_id uuid,
  pending_ownership_transfer_role text,
  pending_ownership_transfer_expires_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  return query select * from public.list_my_workspaces();
end;
$function$;

revoke all on function public.list_my_workspaces_service(uuid) from public, anon, authenticated;
grant execute on function public.list_my_workspaces_service(uuid) to service_role;

-- Opening a workspace is what "last used" means. The write is skipped while the
-- stamp is fresh, so reading a page a hundred times does not write a hundred
-- times; the switcher only needs the order, not the minute.
create or replace function public.touch_workspace_membership_service(
  actor_user_id uuid,
  target_workspace_id uuid
)
returns void
language sql
security definer
set search_path to ''
as $function$
  update public.workspace_memberships
  set last_used_at = now()
  where user_id = actor_user_id
    and workspace_id = target_workspace_id
    and status in ('active'::public.membership_status, 'pending_activation'::public.membership_status)
    and (last_used_at is null or last_used_at < now() - interval '5 minutes');
$function$;

revoke all on function public.touch_workspace_membership_service(uuid, uuid) from public, anon, authenticated;
grant execute on function public.touch_workspace_membership_service(uuid, uuid) to service_role;

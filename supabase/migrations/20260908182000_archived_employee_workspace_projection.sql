drop function if exists public.list_my_workspaces_service(uuid);
drop function if exists public.list_my_workspaces();

create function public.list_my_workspaces()
returns table (
  workspace_id uuid,
  workspace_name text,
  workspace_role public.workspace_role,
  membership_status public.membership_status,
  is_active boolean,
  onboarding_status public.onboarding_status,
  onboarding_current_step smallint,
  workspace_lifecycle_status public.workspace_lifecycle_status,
  closure_effective_at timestamptz,
  pending_ownership_transfer_id uuid,
  pending_ownership_transfer_role text,
  pending_ownership_transfer_expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
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
      and pending_transfer.expires_at > now()
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
$$;

create function public.list_my_workspaces_service(actor_user_id uuid)
returns table (
  workspace_id uuid,
  workspace_name text,
  workspace_role public.workspace_role,
  membership_status public.membership_status,
  is_active boolean,
  onboarding_status public.onboarding_status,
  onboarding_current_step smallint,
  workspace_lifecycle_status public.workspace_lifecycle_status,
  closure_effective_at timestamptz,
  pending_ownership_transfer_id uuid,
  pending_ownership_transfer_role text,
  pending_ownership_transfer_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);

  return query
  select *
  from public.list_my_workspaces();
end;
$$;

revoke execute on function public.list_my_workspaces()
from public, anon, authenticated;

revoke all on function public.list_my_workspaces_service(uuid)
from public, anon, authenticated;

grant execute on function public.list_my_workspaces_service(uuid)
to service_role;

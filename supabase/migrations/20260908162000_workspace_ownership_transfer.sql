do $$
begin
  create type public.workspace_ownership_transfer_status as enum (
    'pending',
    'accepted',
    'rejected',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.workspace_ownership_transfers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  initiated_by uuid not null references auth.users(id),
  target_user_id uuid not null references auth.users(id),
  previous_owner_membership_id uuid not null,
  target_membership_id uuid not null,
  status public.workspace_ownership_transfer_status not null default 'pending',
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (previous_owner_membership_id, workspace_id)
    references public.workspace_memberships(id, workspace_id) on delete restrict,
  foreign key (target_membership_id, workspace_id)
    references public.workspace_memberships(id, workspace_id) on delete restrict,
  check (initiated_by <> target_user_id),
  check (
    (status = 'pending' and accepted_at is null and rejected_at is null and cancelled_at is null)
    or (status = 'accepted' and accepted_at is not null)
    or (status = 'rejected' and rejected_at is not null)
    or (status = 'cancelled' and cancelled_at is not null)
  )
);

alter table public.workspace_ownership_transfers
  add column if not exists cancelled_by uuid references auth.users(id);

create unique index if not exists workspace_ownership_one_pending_idx
  on public.workspace_ownership_transfers (workspace_id)
  where status = 'pending';

alter table public.workspace_ownership_transfers enable row level security;

drop policy if exists workspace_ownership_transfers_select_participant
on public.workspace_ownership_transfers;

create policy workspace_ownership_transfers_select_participant
on public.workspace_ownership_transfers for select to authenticated
using (
  (select public.workspace_role_for(workspace_id)) in ('owner', 'admin')
  or initiated_by = (select auth.uid())
  or target_user_id = (select auth.uid())
);

revoke all on public.workspace_ownership_transfers from anon, authenticated;
grant select on public.workspace_ownership_transfers to authenticated;
grant all on public.workspace_ownership_transfers to service_role;

create or replace function public.block_closure_when_ownership_transfer_pending()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('scheduled', 'completed')
    and exists (
      select 1
      from public.workspace_ownership_transfers transfer
      where transfer.workspace_id = new.workspace_id
        and transfer.status = 'pending'
    ) then
    raise exception 'pending ownership transfer must be resolved before workspace closure'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists block_closure_when_ownership_transfer_pending_trigger
on public.workspace_closure_requests;

create trigger block_closure_when_ownership_transfer_pending_trigger
before insert or update of status on public.workspace_closure_requests
for each row execute function public.block_closure_when_ownership_transfer_pending();

create or replace function public.initiate_workspace_ownership_transfer_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace_row public.workspaces%rowtype;
  actor_membership public.workspace_memberships%rowtype;
  target_membership public.workspace_memberships%rowtype;
  actor_access public.workspace_role;
  target_access public.workspace_role;
  target_email_verified boolean;
  target_onboarding_blocked boolean;
  transfer_id uuid;
begin
  if actor_user_id is null or target_user_id is null then
    raise exception 'valid actor and target required' using errcode = '42501';
  end if;
  if actor_user_id = target_user_id then
    raise exception 'ownership transfer target must be another account' using errcode = '23514';
  end if;

  select * into workspace_row
  from public.workspaces
  where id = target_workspace_id
  for update;

  if workspace_row.id is null or workspace_row.lifecycle_status <> 'active' then
    raise exception 'workspace not found' using errcode = '02000';
  end if;

  select membership.* into actor_membership
  from public.workspace_memberships membership
  where membership.workspace_id = target_workspace_id
    and membership.user_id = actor_user_id
    and membership.status = 'active'
  limit 1;

  select coalesce(role.access_class, membership.role) into actor_access
  from public.workspace_memberships membership
  left join public.workspace_roles role
    on role.id = membership.role_id
   and role.workspace_id = membership.workspace_id
  where membership.workspace_id = target_workspace_id
    and membership.user_id = actor_user_id
    and membership.status = 'active'
  limit 1;

  if actor_membership.id is null or actor_access is distinct from 'owner'::public.workspace_role then
    raise exception 'workspace owner access required' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.workspace_ownership_transfers transfer
    where transfer.workspace_id = target_workspace_id
      and transfer.status = 'pending'
  ) then
    raise exception 'pending ownership transfer already exists' using errcode = '23505';
  end if;

  select membership.* into target_membership
  from public.workspace_memberships membership
  where membership.workspace_id = target_workspace_id
    and membership.user_id = target_user_id
    and membership.status = 'active'
  limit 1
  for update;

  select coalesce(role.access_class, membership.role) into target_access
  from public.workspace_memberships membership
  left join public.workspace_roles role
    on role.id = membership.role_id
   and role.workspace_id = membership.workspace_id
  where membership.workspace_id = target_workspace_id
    and membership.user_id = target_user_id
    and membership.status = 'active'
  limit 1;

  if target_membership.id is null or target_access is distinct from 'admin'::public.workspace_role then
    raise exception 'ownership transfer target must be an active admin' using errcode = '23514';
  end if;

  select exists (
    select 1
    from auth.users target_user
    where target_user.id = target_user_id
      and target_user.email_confirmed_at is not null
  ) into target_email_verified;
  if not target_email_verified then
    raise exception 'ownership transfer target must have a verified email' using errcode = '23514';
  end if;

  select exists (
    select 1
    from public.employee_onboarding_cases onboarding
    where onboarding.workspace_id = target_workspace_id
      and onboarding.membership_id = target_membership.id
      and onboarding.status <> 'approved'
  ) into target_onboarding_blocked;
  if target_onboarding_blocked then
    raise exception 'ownership transfer target must have completed onboarding' using errcode = '23514';
  end if;

  insert into public.workspace_ownership_transfers (
    workspace_id,
    initiated_by,
    target_user_id,
    previous_owner_membership_id,
    target_membership_id
  )
  values (
    target_workspace_id,
    actor_user_id,
    target_user_id,
    actor_membership.id,
    target_membership.id
  )
  returning id into transfer_id;

  insert into public.audit_events (
    workspace_id,
    actor_user_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    target_workspace_id,
    actor_user_id,
    'workspace.ownership_transfer.initiated',
    'workspace_ownership_transfer',
    transfer_id::text,
    jsonb_build_object('target_user_id', target_user_id)
  );

  return jsonb_build_object(
    'status', 'pending',
    'transfer_id', transfer_id,
    'workspace_id', target_workspace_id,
    'target_user_id', target_user_id
  );
end;
$$;

create or replace function public.respond_workspace_ownership_transfer_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  transfer_id uuid,
  transfer_action text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  transfer_row public.workspace_ownership_transfers%rowtype;
  owner_role_id uuid;
  admin_role_id uuid;
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;
  if transfer_action not in ('accept', 'reject') then
    raise exception 'valid ownership transfer action required' using errcode = '22023';
  end if;

  select * into transfer_row
  from public.workspace_ownership_transfers transfer
  where transfer.id = transfer_id
    and transfer.workspace_id = target_workspace_id
  for update;

  if transfer_row.id is null or transfer_row.status <> 'pending' then
    raise exception 'pending ownership transfer not found' using errcode = '02000';
  end if;
  if transfer_row.target_user_id <> actor_user_id then
    raise exception 'ownership transfer target access required' using errcode = '42501';
  end if;
  if transfer_row.expires_at <= now() then
    update public.workspace_ownership_transfers
    set status = 'cancelled',
        cancelled_at = now(),
        cancelled_by = actor_user_id,
        updated_at = now()
    where id = transfer_row.id;
    raise exception 'ownership transfer has expired' using errcode = '23514';
  end if;

  if transfer_action = 'reject' then
    update public.workspace_ownership_transfers
    set status = 'rejected',
        rejected_at = now(),
        updated_at = now()
    where id = transfer_row.id;

    insert into public.audit_events (
      workspace_id,
      actor_user_id,
      action,
      target_type,
      target_id
    )
    values (
      target_workspace_id,
      actor_user_id,
      'workspace.ownership_transfer.rejected',
      'workspace_ownership_transfer',
      transfer_id::text
    );

    return jsonb_build_object(
      'status', 'rejected',
      'transfer_id', transfer_id,
      'workspace_id', target_workspace_id
    );
  end if;

  select id into owner_role_id
  from public.workspace_roles
  where workspace_id = target_workspace_id
    and system_key = 'owner';

  select id into admin_role_id
  from public.workspace_roles
  where workspace_id = target_workspace_id
    and system_key = 'admin';

  if owner_role_id is null or admin_role_id is null then
    raise exception 'system owner and admin roles are required' using errcode = 'P0002';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  perform set_config('app.owner_transfer', 'on', true);

  update public.workspace_memberships
  set role_id = owner_role_id,
      role = 'owner',
      all_locations = true,
      updated_at = now()
  where id = transfer_row.target_membership_id
    and workspace_id = target_workspace_id
    and status = 'active';

  update public.workspace_memberships
  set role_id = admin_role_id,
      role = 'admin',
      all_locations = true,
      updated_at = now()
  where id = transfer_row.previous_owner_membership_id
    and workspace_id = target_workspace_id
    and status = 'active';

  update public.workspace_ownership_transfers
  set status = 'accepted',
      accepted_at = now(),
      updated_at = now()
  where id = transfer_row.id;

  insert into public.audit_events (
    workspace_id,
    actor_user_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    target_workspace_id,
    actor_user_id,
    'workspace.ownership_transfer.accepted',
    'workspace_ownership_transfer',
    transfer_id::text,
    jsonb_build_object(
      'previous_owner_membership_id', transfer_row.previous_owner_membership_id,
      'target_membership_id', transfer_row.target_membership_id
    )
  );

  insert into public.audit_events (
    workspace_id,
    actor_user_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    target_workspace_id,
    actor_user_id,
    'billing.payment_method.detach_required_after_owner_transfer',
    'workspace',
    target_workspace_id::text,
    jsonb_build_object('previous_owner_user_id', transfer_row.initiated_by)
  );

  return jsonb_build_object(
    'status', 'accepted',
    'transfer_id', transfer_id,
    'workspace_id', target_workspace_id
  );
end;
$$;

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

revoke all on function public.block_closure_when_ownership_transfer_pending()
from public, anon, authenticated;

revoke execute on function public.list_my_workspaces()
from public, anon, authenticated;

revoke all on function public.list_my_workspaces_service(uuid)
from public, anon, authenticated;

revoke all on function public.initiate_workspace_ownership_transfer_service(uuid, uuid, uuid)
from public, anon, authenticated;

revoke all on function public.respond_workspace_ownership_transfer_service(uuid, uuid, uuid, text)
from public, anon, authenticated;

grant execute on function public.initiate_workspace_ownership_transfer_service(uuid, uuid, uuid)
to service_role;

grant execute on function public.respond_workspace_ownership_transfer_service(uuid, uuid, uuid, text)
to service_role;

grant execute on function public.list_my_workspaces_service(uuid)
to service_role;

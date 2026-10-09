do $$
begin
  if not exists (
    select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'workspace_entitlement_status'
  ) then
    create type public.workspace_entitlement_status as enum (
      'trialing',
      'active',
      'past_due',
      'soft_locked',
      'cancelled',
      'expired'
    );
  end if;

  if not exists (
    select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'workspace_entitlement_provider'
  ) then
    create type public.workspace_entitlement_provider as enum (
      'internal',
      'stripe'
    );
  end if;
end $$;

create table if not exists public.workspace_entitlements (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  status public.workspace_entitlement_status not null default 'trialing',
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null,
  current_period_started_at timestamptz not null default now(),
  current_period_ends_at timestamptz not null,
  billing_owner_user_id uuid not null references auth.users(id) on delete restrict,
  provider public.workspace_entitlement_provider not null default 'internal',
  provider_customer_id text,
  provider_subscription_id text,
  payment_method_required_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text check (
    cancellation_reason is null or char_length(cancellation_reason) <= 500
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_customer_id),
  unique (provider, provider_subscription_id),
  check (trial_ends_at > trial_started_at),
  check (current_period_ends_at > current_period_started_at)
);

alter table public.workspace_entitlements enable row level security;

create policy workspace_entitlements_select_owner_admin
  on public.workspace_entitlements
  for select to authenticated
  using (public.workspace_has_permission(workspace_id, 'workspace.manage'));

revoke all on public.workspace_entitlements from public, anon, authenticated;
grant select on public.workspace_entitlements to authenticated;

create or replace function public.cancel_workspace_entitlement_on_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lifecycle_status = 'deleted'::public.workspace_lifecycle_status
     and old.lifecycle_status is distinct from new.lifecycle_status then
    update public.workspace_entitlements
    set status = 'cancelled'::public.workspace_entitlement_status,
        cancelled_at = coalesce(cancelled_at, now()),
        cancellation_reason = coalesce(cancellation_reason, 'workspace_closed_immediate'),
        updated_at = now()
    where workspace_id = new.id
      and status <> 'cancelled'::public.workspace_entitlement_status;
  end if;
  return new;
end;
$$;

drop trigger if exists cancel_workspace_entitlement_on_delete_trigger
on public.workspaces;

create trigger cancel_workspace_entitlement_on_delete_trigger
after update of lifecycle_status on public.workspaces
for each row
execute function public.cancel_workspace_entitlement_on_delete();

create or replace function public.sync_workspace_entitlement_billing_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'owner'::public.workspace_role
     and new.status = 'active'::public.membership_status
     and (
       old.role is distinct from new.role
       or old.status is distinct from new.status
     ) then
    update public.workspace_entitlements
    set billing_owner_user_id = new.user_id,
        payment_method_required_at = case
          when billing_owner_user_id is distinct from new.user_id then now()
          else payment_method_required_at
        end,
        updated_at = now()
    where workspace_id = new.workspace_id
      and billing_owner_user_id is distinct from new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_workspace_entitlement_billing_owner_trigger
on public.workspace_memberships;

create trigger sync_workspace_entitlement_billing_owner_trigger
after update of role, status on public.workspace_memberships
for each row
execute function public.sync_workspace_entitlement_billing_owner();

drop trigger if exists block_entitlement_billing_owner_when_ownership_transfer_pending_trigger
on public.workspace_entitlements;

create trigger block_entitlement_billing_owner_when_ownership_transfer_pending_trigger
before update of billing_owner_user_id, provider_customer_id, provider_subscription_id, payment_method_required_at
on public.workspace_entitlements
for each row execute function public.block_entitlement_billing_owner_when_ownership_transfer_pending();

create or replace function public.update_owner_onboarding(
  target_workspace_id uuid,
  workspace_name text,
  next_step smallint,
  mark_complete boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  current_status public.onboarding_status;
  completed_timestamp timestamptz;
begin
  if actor_id is null or public.workspace_role_for(target_workspace_id) <> 'owner' then
    raise exception 'owner access required' using errcode = '42501';
  end if;
  if char_length(btrim(workspace_name)) not between 1 and 120 then
    raise exception 'workspace name must be between 1 and 120 characters' using errcode = '22023';
  end if;
  if next_step not between 1 and 4 then
    raise exception 'invalid onboarding step' using errcode = '22023';
  end if;

  select onboarding.status
  into current_status
  from public.workspace_onboarding onboarding
  where onboarding.workspace_id = target_workspace_id
  for update;

  if current_status is null then
    raise exception 'workspace onboarding was not found' using errcode = 'P0002';
  end if;

  if current_status = 'complete'::public.onboarding_status then
    if mark_complete then
      return;
    end if;
    raise exception 'completed owner onboarding cannot be changed' using errcode = '22023';
  end if;

  if mark_complete and not exists (
    select 1
    from public.locations location
    where location.workspace_id = target_workspace_id
      and location.archived_at is null
  ) then
    raise exception 'at least one active location is required to complete owner onboarding' using errcode = '23514';
  end if;

  if mark_complete and not exists (
    select 1
    from public.departments department
    where department.workspace_id = target_workspace_id
      and department.archived_at is null
  ) then
    raise exception 'at least one active department is required to complete owner onboarding' using errcode = '23514';
  end if;

  if mark_complete and not exists (
    select 1
    from public.jobs job
    where job.workspace_id = target_workspace_id
      and job.archived_at is null
  ) then
    raise exception 'at least one active job is required to complete owner onboarding' using errcode = '23514';
  end if;

  completed_timestamp := now();

  update public.workspaces
  set name = btrim(workspace_name), updated_at = completed_timestamp
  where id = target_workspace_id;

  update public.workspace_onboarding
  set
    status = case
      when mark_complete then 'complete'::public.onboarding_status
      else 'incomplete'::public.onboarding_status
    end,
    current_step = next_step,
    completed_at = case when mark_complete then completed_timestamp else null end,
    updated_by = actor_id,
    updated_at = completed_timestamp
  where workspace_id = target_workspace_id;

  if mark_complete then
    insert into public.workspace_entitlements (
      workspace_id,
      status,
      trial_started_at,
      trial_ends_at,
      current_period_started_at,
      current_period_ends_at,
      billing_owner_user_id,
      provider,
      created_at,
      updated_at
    ) values (
      target_workspace_id,
      'trialing'::public.workspace_entitlement_status,
      completed_timestamp,
      completed_timestamp + interval '14 days',
      completed_timestamp,
      completed_timestamp + interval '14 days',
      actor_id,
      'internal'::public.workspace_entitlement_provider,
      completed_timestamp,
      completed_timestamp
    )
    on conflict (workspace_id) do nothing;
  end if;

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    target_workspace_id,
    actor_id,
    case when mark_complete then 'workspace.onboarding_completed' else 'workspace.onboarding_saved' end,
    'workspace',
    target_workspace_id::text,
    jsonb_build_object('step', next_step)
  );
end;
$$;

create or replace function public.update_owner_onboarding_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  workspace_name text,
  next_step smallint,
  mark_complete boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status public.onboarding_status;
  completed_timestamp timestamptz;
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = actor_user_id
      and membership.role = 'owner'
      and membership.status = 'active'
  ) then
    raise exception 'owner access required' using errcode = '42501';
  end if;
  if char_length(btrim(workspace_name)) not between 1 and 120 then
    raise exception 'workspace name must be between 1 and 120 characters' using errcode = '22023';
  end if;
  if next_step not between 1 and 4 then
    raise exception 'invalid onboarding step' using errcode = '22023';
  end if;

  select onboarding.status
  into current_status
  from public.workspace_onboarding onboarding
  where onboarding.workspace_id = target_workspace_id
  for update;

  if current_status is null then
    raise exception 'workspace onboarding was not found' using errcode = 'P0002';
  end if;

  if current_status = 'complete'::public.onboarding_status then
    if mark_complete then
      return;
    end if;
    raise exception 'completed owner onboarding cannot be changed' using errcode = '22023';
  end if;

  if mark_complete and not exists (
    select 1
    from public.locations location
    where location.workspace_id = target_workspace_id
      and location.archived_at is null
  ) then
    raise exception 'at least one active location is required to complete owner onboarding' using errcode = '23514';
  end if;

  if mark_complete and not exists (
    select 1
    from public.departments department
    where department.workspace_id = target_workspace_id
      and department.archived_at is null
  ) then
    raise exception 'at least one active department is required to complete owner onboarding' using errcode = '23514';
  end if;

  if mark_complete and not exists (
    select 1
    from public.jobs job
    where job.workspace_id = target_workspace_id
      and job.archived_at is null
  ) then
    raise exception 'at least one active job is required to complete owner onboarding' using errcode = '23514';
  end if;

  completed_timestamp := now();

  update public.workspaces
  set name = btrim(workspace_name), updated_at = completed_timestamp
  where id = target_workspace_id;

  update public.workspace_onboarding
  set
    status = case
      when mark_complete then 'complete'::public.onboarding_status
      else 'incomplete'::public.onboarding_status
    end,
    current_step = next_step,
    completed_at = case when mark_complete then completed_timestamp else null end,
    updated_by = actor_user_id,
    updated_at = completed_timestamp
  where workspace_id = target_workspace_id;

  if mark_complete then
    insert into public.workspace_entitlements (
      workspace_id,
      status,
      trial_started_at,
      trial_ends_at,
      current_period_started_at,
      current_period_ends_at,
      billing_owner_user_id,
      provider,
      created_at,
      updated_at
    ) values (
      target_workspace_id,
      'trialing'::public.workspace_entitlement_status,
      completed_timestamp,
      completed_timestamp + interval '14 days',
      completed_timestamp,
      completed_timestamp + interval '14 days',
      actor_user_id,
      'internal'::public.workspace_entitlement_provider,
      completed_timestamp,
      completed_timestamp
    )
    on conflict (workspace_id) do nothing;
  end if;

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    target_workspace_id,
    actor_user_id,
    case when mark_complete then 'workspace.onboarding_completed' else 'workspace.onboarding_saved' end,
    'workspace',
    target_workspace_id::text,
    jsonb_build_object('step', next_step)
  );
end;
$$;

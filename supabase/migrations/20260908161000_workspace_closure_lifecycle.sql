do $$
begin
  create type public.workspace_lifecycle_status as enum ('active', 'closure_scheduled', 'deleted');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.workspace_closure_mode as enum ('scheduled_end_period', 'immediate');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.workspace_closure_request_status as enum ('scheduled', 'cancelled', 'completed');
exception when duplicate_object then null;
end $$;

alter table public.workspaces
  add column if not exists lifecycle_status public.workspace_lifecycle_status not null default 'active',
  add column if not exists closure_scheduled_at timestamptz,
  add column if not exists closure_effective_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid references auth.users(id);

alter table public.workspaces
  drop constraint if exists workspaces_closure_lifecycle_consistency;

alter table public.workspaces
  add constraint workspaces_closure_lifecycle_consistency
  check (
    (
      lifecycle_status = 'active'
      and closure_scheduled_at is null
      and closure_effective_at is null
      and closed_at is null
      and closed_by is null
    )
    or (
      lifecycle_status = 'closure_scheduled'
      and closure_scheduled_at is not null
      and closure_effective_at is not null
      and closed_at is null
      and closed_by is null
    )
    or (
      lifecycle_status = 'deleted'
      and closed_at is not null
      and closed_by is not null
    )
  );

create table if not exists public.workspace_closure_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  mode public.workspace_closure_mode not null,
  status public.workspace_closure_request_status not null,
  effective_at timestamptz,
  acknowledged_at timestamptz not null default now(),
  typed_workspace_name text,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  check (
    (status = 'scheduled' and mode = 'scheduled_end_period' and effective_at is not null and cancelled_at is null and completed_at is null)
    or (status = 'cancelled' and cancelled_at is not null and cancelled_by is not null)
    or (status = 'completed' and completed_at is not null)
  )
);

create unique index if not exists workspace_closure_one_scheduled_idx
  on public.workspace_closure_requests (workspace_id)
  where status = 'scheduled';

alter table public.workspace_closure_requests enable row level security;

drop policy if exists workspace_closure_requests_select_owner_admin
on public.workspace_closure_requests;

create policy workspace_closure_requests_select_owner_admin
on public.workspace_closure_requests for select to authenticated
using ((select public.workspace_role_for(workspace_id)) in ('owner', 'admin'));

revoke all on public.workspace_closure_requests from anon, authenticated;
grant select on public.workspace_closure_requests to authenticated;
grant all on public.workspace_closure_requests to service_role;

create or replace function app_private.workspace_allows_interactive_access(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspaces workspace
    where workspace.id = target_workspace_id
      and (
        workspace.lifecycle_status = 'active'
        or (
          workspace.lifecycle_status = 'closure_scheduled'
          and workspace.closure_effective_at > now()
        )
      )
  );
$$;

create or replace function app_private.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_memberships membership
    join public.workspaces workspace on workspace.id = membership.workspace_id
    where membership.workspace_id = target_workspace_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and (
        workspace.lifecycle_status = 'active'
        or (
          workspace.lifecycle_status = 'closure_scheduled'
          and workspace.closure_effective_at > now()
        )
      )
  );
$$;

create or replace function app_private.workspace_role_for(target_workspace_id uuid)
returns public.workspace_role
language sql
stable
security definer
set search_path = ''
as $$
  select membership.role
  from public.workspace_memberships membership
  join public.workspaces workspace on workspace.id = membership.workspace_id
  where membership.workspace_id = target_workspace_id
    and membership.user_id = (select auth.uid())
    and membership.status = 'active'
    and (
      workspace.lifecycle_status = 'active'
      or (
        workspace.lifecycle_status = 'closure_scheduled'
        and workspace.closure_effective_at > now()
      )
    )
  limit 1;
$$;

create or replace function app_private.workspace_has_permission(
  target_workspace_id uuid,
  target_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_memberships membership
    join public.workspaces workspace on workspace.id = membership.workspace_id
    join public.workspace_role_permissions grant_row
      on grant_row.workspace_id = membership.workspace_id
     and grant_row.role_id = membership.role_id
    where membership.workspace_id = target_workspace_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and (
        workspace.lifecycle_status = 'active'
        or (
          workspace.lifecycle_status = 'closure_scheduled'
          and workspace.closure_effective_at > now()
        )
      )
      and grant_row.permission_key = target_permission
  );
$$;

create or replace function app_private.can_access_location(
  target_workspace_id uuid,
  target_location_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_memberships membership
    join public.workspaces workspace on workspace.id = membership.workspace_id
    where membership.workspace_id = target_workspace_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and (
        workspace.lifecycle_status = 'active'
        or (
          workspace.lifecycle_status = 'closure_scheduled'
          and workspace.closure_effective_at > now()
        )
      )
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
$$;

create or replace function app_private.can_access_employee(
  target_workspace_id uuid,
  target_employee_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_memberships membership
    join public.workspaces workspace on workspace.id = membership.workspace_id
    where membership.workspace_id = target_workspace_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and (
        workspace.lifecycle_status = 'active'
        or (
          workspace.lifecycle_status = 'closure_scheduled'
          and workspace.closure_effective_at > now()
        )
      )
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
$$;

create or replace function public.prevent_last_workspace_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace_state public.workspace_lifecycle_status;
  transfer_bypass boolean := coalesce(current_setting('app.owner_transfer', true), '') = 'on';
begin
  if old.role <> 'owner' or old.status <> 'active' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select lifecycle_status into workspace_state
  from public.workspaces
  where id = old.workspace_id;

  if workspace_state = 'deleted' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'UPDATE' and new.role = 'owner' and new.status = 'active' then
    return new;
  end if;

  if not exists (
    select 1
    from public.workspace_memberships other
    where other.workspace_id = old.workspace_id
      and other.id <> old.id
      and other.role = 'owner'
      and other.status = 'active'
  ) then
    raise exception 'workspace must retain an active owner' using errcode = '23514';
  end if;

  if not transfer_bypass then
    raise exception 'owner role can only be changed through ownership transfer'
      using errcode = '23514';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.enforce_membership_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role public.workspace_role;
  bootstrap_allowed boolean;
begin
  if coalesce(current_setting('app.workspace_closure', true), '') = 'on' then
    return new;
  end if;

  if actor_id is null then return new; end if;

  if tg_op = 'INSERT' then
    select exists (
      select 1
      from public.workspaces workspace
      where workspace.id = new.workspace_id
        and workspace.created_by = actor_id
        and new.user_id = actor_id
        and new.role = 'owner'
        and not exists (
          select 1 from public.workspace_memberships existing
          where existing.workspace_id = new.workspace_id
        )
    ) into bootstrap_allowed;
    if bootstrap_allowed then return new; end if;
  end if;

  actor_role := public.workspace_role_for(new.workspace_id);
  if actor_role = 'owner' then return new; end if;
  if actor_role = 'admin' and new.role in ('manager', 'employee') then
    if tg_op = 'INSERT' or old.role in ('manager', 'employee') then return new; end if;
  end if;

  raise exception 'membership role change is not permitted' using errcode = '42501';
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
  closure_effective_at timestamptz
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
    workspace.closure_effective_at
  from public.workspace_memberships membership
  join public.workspaces workspace on workspace.id = membership.workspace_id
  left join public.user_workspace_preferences preference on preference.user_id = membership.user_id
  left join public.workspace_onboarding onboarding on onboarding.workspace_id = workspace.id
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
  closure_effective_at timestamptz
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
    join public.workspaces workspace on workspace.id = membership.workspace_id
    where membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and (
        workspace.lifecycle_status = 'active'
        or (
          workspace.lifecycle_status = 'closure_scheduled'
          and workspace.closure_effective_at > now()
        )
      )
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

create or replace function public.enforce_active_workspace_preference_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.workspace_memberships membership
    join public.workspaces workspace on workspace.id = membership.workspace_id
    where membership.user_id = new.user_id
      and membership.workspace_id = new.active_workspace_id
      and membership.status = 'active'
      and (
        workspace.lifecycle_status = 'active'
        or (
          workspace.lifecycle_status = 'closure_scheduled'
          and workspace.closure_effective_at > now()
        )
      )
  ) then
    raise exception 'active workspace preference requires active membership'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.request_workspace_closure_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  closure_mode text,
  typed_workspace_name text default null,
  acknowledged boolean default false,
  target_effective_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace_row public.workspaces%rowtype;
  actor_role public.workspace_role;
  request_id uuid;
  effective_at timestamptz;
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;
  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  if not acknowledged then
    raise exception 'workspace closure requires explicit acknowledgement' using errcode = '23514';
  end if;
  if closure_mode not in ('scheduled_end_period', 'immediate') then
    raise exception 'valid workspace closure mode required' using errcode = '22023';
  end if;

  select * into workspace_row
  from public.workspaces
  where id = target_workspace_id
  for update;

  if workspace_row.id is null or workspace_row.lifecycle_status = 'deleted' then
    raise exception 'workspace not found' using errcode = '02000';
  end if;

  select coalesce(role.access_class, membership.role) into actor_role
  from public.workspace_memberships membership
  left join public.workspace_roles role
    on role.id = membership.role_id
   and role.workspace_id = membership.workspace_id
  where membership.workspace_id = target_workspace_id
    and membership.user_id = actor_user_id
    and membership.status = 'active'
  limit 1;

  if actor_role is distinct from 'owner'::public.workspace_role then
    raise exception 'workspace owner access required' using errcode = '42501';
  end if;

  if closure_mode = 'immediate' then
    if typed_workspace_name is distinct from workspace_row.name then
      raise exception 'workspace name confirmation does not match' using errcode = '23514';
    end if;

    update public.workspace_closure_requests
    set status = 'cancelled',
        cancelled_at = now(),
        cancelled_by = actor_user_id,
        updated_at = now()
    where workspace_id = target_workspace_id
      and status = 'scheduled';

    insert into public.workspace_closure_requests (
      workspace_id,
      requested_by,
      mode,
      status,
      typed_workspace_name,
      effective_at,
      completed_at,
      metadata
    )
    values (
      target_workspace_id,
      actor_user_id,
      'immediate',
      'completed',
      typed_workspace_name,
      now(),
      now(),
      jsonb_build_object('unrecoverable_by_user', true)
    )
    returning id into request_id;

    update public.workspaces
    set lifecycle_status = 'deleted',
        closure_scheduled_at = null,
        closure_effective_at = now(),
        closed_at = now(),
        closed_by = actor_user_id,
        updated_at = now()
    where id = target_workspace_id;

    perform set_config('app.workspace_closure', 'on', true);

    update public.workspace_memberships
    set status = 'suspended',
        updated_at = now()
    where workspace_id = target_workspace_id
      and status <> 'suspended';

    update public.employee_invitations
    set status = 'revoked',
        revoked_at = coalesce(revoked_at, now()),
        updated_at = now()
    where workspace_id = target_workspace_id
      and status = 'pending';

    delete from public.user_workspace_preferences
    where active_workspace_id = target_workspace_id;

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
      'workspace.closure.completed_immediate',
      'workspace',
      target_workspace_id::text,
      jsonb_build_object('closure_request_id', request_id)
    );

    return jsonb_build_object(
      'status', 'deleted',
      'workspace_id', target_workspace_id,
      'closure_request_id', request_id
    );
  end if;

  effective_at := coalesce(target_effective_at, now() + interval '14 days');
  if effective_at <= now() then
    raise exception 'scheduled workspace closure requires a future effective time'
      using errcode = '23514';
  end if;

  update public.workspace_closure_requests
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = actor_user_id,
      updated_at = now()
  where workspace_id = target_workspace_id
    and status = 'scheduled';

  insert into public.workspace_closure_requests (
    workspace_id,
    requested_by,
    mode,
    status,
    effective_at
  )
  values (
    target_workspace_id,
    actor_user_id,
    'scheduled_end_period',
    'scheduled',
    effective_at
  )
  returning id into request_id;

  update public.workspaces
  set lifecycle_status = 'closure_scheduled',
      closure_scheduled_at = now(),
      closure_effective_at = effective_at,
      closed_at = null,
      closed_by = null,
      updated_at = now()
  where id = target_workspace_id;

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
    'workspace.closure.scheduled',
    'workspace',
    target_workspace_id::text,
    jsonb_build_object('closure_request_id', request_id, 'effective_at', effective_at)
  );

  return jsonb_build_object(
    'status', 'scheduled',
    'workspace_id', target_workspace_id,
    'closure_request_id', request_id,
    'effective_at', effective_at
  );
end;
$$;

create or replace function public.cancel_workspace_closure_service(
  actor_user_id uuid,
  target_workspace_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace_row public.workspaces%rowtype;
  actor_role public.workspace_role;
  request_id uuid;
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;
  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);

  select * into workspace_row
  from public.workspaces
  where id = target_workspace_id
  for update;

  if workspace_row.id is null or workspace_row.lifecycle_status = 'deleted' then
    raise exception 'workspace not found' using errcode = '02000';
  end if;

  select coalesce(role.access_class, membership.role) into actor_role
  from public.workspace_memberships membership
  left join public.workspace_roles role
    on role.id = membership.role_id
   and role.workspace_id = membership.workspace_id
  where membership.workspace_id = target_workspace_id
    and membership.user_id = actor_user_id
    and membership.status = 'active'
  limit 1;

  if actor_role is distinct from 'owner'::public.workspace_role then
    raise exception 'workspace owner access required' using errcode = '42501';
  end if;

  if workspace_row.lifecycle_status <> 'closure_scheduled' then
    raise exception 'workspace closure is not scheduled' using errcode = '23514';
  end if;

  update public.workspace_closure_requests
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = actor_user_id,
      updated_at = now()
  where workspace_id = target_workspace_id
    and status = 'scheduled'
  returning id into request_id;

  update public.workspaces
  set lifecycle_status = 'active',
      closure_scheduled_at = null,
      closure_effective_at = null,
      closed_at = null,
      closed_by = null,
      updated_at = now()
  where id = target_workspace_id;

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
    'workspace.closure.cancelled',
    'workspace',
    target_workspace_id::text,
    jsonb_build_object('closure_request_id', request_id)
  );

  return jsonb_build_object(
    'status', 'cancelled',
    'workspace_id', target_workspace_id,
    'closure_request_id', request_id
  );
end;
$$;

revoke all on function app_private.workspace_allows_interactive_access(uuid)
from public, anon;
grant execute on function app_private.workspace_allows_interactive_access(uuid)
to authenticated, service_role;

revoke execute on function public.list_my_workspaces()
from public, anon, authenticated;

revoke all on function public.list_my_workspaces_service(uuid)
from public, anon, authenticated;

revoke execute on function public.resolve_active_workspace()
from public, anon, authenticated;

revoke all on function public.request_workspace_closure_service(uuid, uuid, text, text, boolean, timestamptz)
from public, anon, authenticated;

revoke all on function public.cancel_workspace_closure_service(uuid, uuid)
from public, anon, authenticated;

grant execute on function public.list_my_workspaces_service(uuid)
to service_role;

grant execute on function public.request_workspace_closure_service(uuid, uuid, text, text, boolean, timestamptz)
to service_role;

grant execute on function public.cancel_workspace_closure_service(uuid, uuid)
to service_role;

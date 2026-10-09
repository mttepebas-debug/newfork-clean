alter table public.workspace_onboarding
  add column if not exists revision integer not null default 1;

alter table public.workspace_onboarding
  drop constraint if exists workspace_onboarding_revision_check;

alter table public.workspace_onboarding
  add constraint workspace_onboarding_revision_check check (revision >= 1);

create or replace function app_private.apply_owner_onboarding_update(
  actor_user_id uuid,
  target_workspace_id uuid,
  workspace_name text,
  next_step smallint,
  mark_complete boolean default false,
  expected_revision integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status public.onboarding_status;
  current_revision integer;
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

  select onboarding.status, onboarding.revision
  into current_status, current_revision
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

  if expected_revision is not null and current_revision <> expected_revision then
    raise exception 'owner onboarding revision conflict' using errcode = '40001';
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
    revision = revision + 1,
    updated_by = actor_user_id,
    updated_at = completed_timestamp
  where workspace_id = target_workspace_id;

  if mark_complete then
    perform app_private.ensure_owner_employee_profile(target_workspace_id, actor_user_id);

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
    jsonb_build_object(
      'step', next_step,
      'previous_revision', current_revision,
      'revision', current_revision + 1
    )
  );
end;
$$;

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
begin
  perform app_private.apply_owner_onboarding_update(
    (select auth.uid()),
    target_workspace_id,
    workspace_name,
    next_step,
    mark_complete,
    null
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
begin
  perform app_private.apply_owner_onboarding_update(
    actor_user_id,
    target_workspace_id,
    workspace_name,
    next_step,
    mark_complete,
    null
  );
end;
$$;

create or replace function public.update_owner_onboarding_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  workspace_name text,
  next_step smallint,
  mark_complete boolean,
  expected_revision integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.apply_owner_onboarding_update(
    actor_user_id,
    target_workspace_id,
    workspace_name,
    next_step,
    mark_complete,
    expected_revision
  );
end;
$$;

drop function public.resolve_workspace_context_service(uuid, uuid);
drop function public.resolve_active_workspace_service(uuid);
drop function public.resolve_active_workspace();

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
  onboarding_current_step smallint,
  onboarding_revision integer
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
    where membership.user_id = (select auth.uid())
      and membership.status = 'active'
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
    coalesce(onboarding.current_step, 2::smallint),
    coalesce(onboarding.revision, 1)
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
    onboarding.revision,
    preference.active_workspace_id,
    membership.active_count,
    membership.created_at
  order by
    (workspace.id = preference.active_workspace_id) desc,
    membership.created_at asc
  limit 1;
$$;

create or replace function public.resolve_workspace_context_service(
  actor_user_id uuid,
  target_workspace_id uuid default null
)
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
  onboarding_current_step smallint,
  onboarding_revision integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  if target_workspace_id is null then
    perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
    return query select * from public.resolve_active_workspace();
    return;
  end if;

  perform set_config('app.allow_incomplete_workspace_context', 'on', true);

  return query
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
    coalesce(onboarding.current_step, 2::smallint),
    coalesce(onboarding.revision, 1)
  from public.workspace_memberships membership
  join public.workspaces workspace
    on workspace.id = membership.workspace_id
  join public.workspace_roles role
    on role.id = membership.role_id
   and role.workspace_id = membership.workspace_id
  left join public.workspace_role_permissions grant_row
    on grant_row.role_id = role.id
  left join public.permissions permission
    on permission.key = grant_row.permission_key
  left join public.workspace_onboarding onboarding
    on onboarding.workspace_id = workspace.id
  where membership.user_id = actor_user_id
    and membership.workspace_id = target_workspace_id
    and membership.status = 'active'
    and app_private.workspace_allows_interactive_access(workspace.id)
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
    onboarding.revision
  limit 1;
end;
$$;

create or replace function public.resolve_active_workspace_service(actor_user_id uuid)
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
  onboarding_current_step smallint,
  onboarding_revision integer
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
  from public.resolve_active_workspace();
end;
$$;

revoke all on function app_private.apply_owner_onboarding_update(uuid, uuid, text, smallint, boolean, integer)
from public, anon, authenticated;
revoke all on function public.update_owner_onboarding(uuid, text, smallint, boolean)
from public, anon;
revoke all on function public.update_owner_onboarding_service(uuid, uuid, text, smallint, boolean)
from public, anon, authenticated;
revoke all on function public.update_owner_onboarding_service(uuid, uuid, text, smallint, boolean, integer)
from public, anon, authenticated;
revoke all on function public.resolve_active_workspace()
from public, anon;
revoke all on function public.resolve_active_workspace_service(uuid)
from public, anon, authenticated;
revoke all on function public.resolve_workspace_context_service(uuid, uuid)
from public, anon, authenticated;

grant execute on function public.update_owner_onboarding(uuid, text, smallint, boolean)
to authenticated;
grant execute on function public.update_owner_onboarding_service(uuid, uuid, text, smallint, boolean)
to service_role;
grant execute on function public.update_owner_onboarding_service(uuid, uuid, text, smallint, boolean, integer)
to service_role;
grant execute on function public.resolve_active_workspace()
to authenticated;
grant execute on function public.resolve_active_workspace_service(uuid)
to service_role;
grant execute on function public.resolve_workspace_context_service(uuid, uuid)
to service_role;

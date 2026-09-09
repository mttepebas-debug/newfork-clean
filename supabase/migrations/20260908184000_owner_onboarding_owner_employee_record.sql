create or replace function app_private.ensure_owner_employee_profile(
  target_workspace_id uuid,
  owner_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_employee_id uuid;
  next_code bigint;
  owner_email text;
  raw_name text;
  first_token text;
  owner_first_name text;
  owner_last_name text;
begin
  select employee.id
  into existing_employee_id
  from public.employee_profiles employee
  where employee.workspace_id = target_workspace_id
    and employee.user_id = owner_user_id
    and employee.archived_at is null
  limit 1;

  if existing_employee_id is not null then
    return existing_employee_id;
  end if;

  if not exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = owner_user_id
      and membership.role = 'owner'::public.workspace_role
      and membership.status = 'active'::public.membership_status
  ) then
    raise exception 'active owner membership required' using errcode = '42501';
  end if;

  select btrim(coalesce(
    nullif(profile.display_name, ''),
    nullif(auth_user.raw_user_meta_data->>'display_name', ''),
    nullif(auth_user.raw_user_meta_data->>'full_name', ''),
    nullif(split_part(lower(auth_user.email), '@', 1), ''),
    'Workspace Owner'
  ))
  into raw_name
  from auth.users auth_user
  left join public.user_profiles profile
    on profile.user_id = auth_user.id
  where auth_user.id = owner_user_id;

  select lower(email)
  into owner_email
  from auth.users
  where id = owner_user_id;

  raw_name := coalesce(nullif(raw_name, ''), nullif(split_part(owner_email, '@', 1), ''), 'Workspace Owner');
  first_token := split_part(raw_name, ' ', 1);
  owner_first_name := left(coalesce(nullif(first_token, ''), 'Workspace'), 80);
  owner_last_name := left(coalesce(nullif(btrim(substr(raw_name, char_length(first_token) + 1)), ''), 'Owner'), 80);

  select coalesce(max(substring(employee.employee_code from 3)::bigint), 0) + 1
  into next_code
  from public.employee_profiles employee
  where employee.workspace_id = target_workspace_id
    and employee.employee_code ~ '^E-[0-9]+$';

  insert into public.workspace_employee_counters (workspace_id, next_value)
  values (target_workspace_id, next_code + 1)
  on conflict (workspace_id) do update
  set next_value = greatest(public.workspace_employee_counters.next_value + 1, excluded.next_value)
  returning next_value - 1 into next_code;

  insert into public.employee_profiles (
    workspace_id,
    user_id,
    employee_code,
    first_name,
    last_name,
    preferred_name,
    invitation_email,
    internal_note,
    is_remote,
    is_excluded_from_schedule,
    created_by
  ) values (
    target_workspace_id,
    owner_user_id,
    'E-' || lpad(next_code::text, 4, '0'),
    owner_first_name,
    owner_last_name,
    '',
    owner_email,
    'Owner account record created by owner onboarding.',
    false,
    true,
    owner_user_id
  )
  returning id into existing_employee_id;

  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
  values (
    target_workspace_id,
    existing_employee_id,
    owner_user_id,
    'employee.owner_record_created',
    'Owner employee record created by owner onboarding'
  );

  return existing_employee_id;
end;
$$;

create or replace function public.prevent_owner_employee_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.archived_at is not null
    and old.archived_at is distinct from new.archived_at
    and old.user_id is not null
    and exists (
      select 1
      from public.workspace_memberships membership
      where membership.workspace_id = old.workspace_id
        and membership.user_id = old.user_id
        and membership.role = 'owner'::public.workspace_role
    ) then
    raise exception 'owner employee record cannot be archived through ordinary lifecycle'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_owner_employee_archive_trigger
on public.employee_profiles;

create trigger prevent_owner_employee_archive_trigger
before update of archived_at on public.employee_profiles
for each row
execute function public.prevent_owner_employee_archive();

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
    perform app_private.ensure_owner_employee_profile(target_workspace_id, actor_id);

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
    jsonb_build_object('step', next_step)
  );
end;
$$;

do $$
declare
  completed_owner record;
begin
  for completed_owner in
    select membership.workspace_id, membership.user_id
    from public.workspace_memberships membership
    join public.workspace_onboarding onboarding
      on onboarding.workspace_id = membership.workspace_id
    where membership.role = 'owner'::public.workspace_role
      and membership.status = 'active'::public.membership_status
      and onboarding.status = 'complete'::public.onboarding_status
      and not exists (
        select 1
        from public.employee_profiles employee
        where employee.workspace_id = membership.workspace_id
          and employee.user_id = membership.user_id
          and employee.archived_at is null
      )
  loop
    perform app_private.ensure_owner_employee_profile(
      completed_owner.workspace_id,
      completed_owner.user_id
    );
  end loop;
end;
$$;

revoke all on function app_private.ensure_owner_employee_profile(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.prevent_owner_employee_archive()
from public, anon, authenticated;
revoke all on function public.update_owner_onboarding(uuid, text, smallint, boolean)
from public, anon;
revoke all on function public.update_owner_onboarding_service(uuid, uuid, text, smallint, boolean)
from public, anon, authenticated;

grant execute on function public.update_owner_onboarding(uuid, text, smallint, boolean)
to authenticated;
grant execute on function public.update_owner_onboarding_service(uuid, uuid, text, smallint, boolean)
to service_role;

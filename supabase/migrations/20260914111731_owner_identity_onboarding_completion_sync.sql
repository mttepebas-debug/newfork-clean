-- Owner onboarding is the one boundary that projects the global account name
-- into the workspace-local owner employee legal name. Later Account edits stay
-- independent because this private function is only called during completion.
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
  existing_name_changed boolean := false;
begin
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

  select
    lower(auth_user.email),
    btrim(coalesce(
      nullif(profile.display_name, ''),
      nullif(auth_user.raw_user_meta_data->>'display_name', ''),
      nullif(auth_user.raw_user_meta_data->>'full_name', ''),
      nullif(split_part(lower(auth_user.email), '@', 1), ''),
      'Workspace Owner'
    ))
  into owner_email, raw_name
  from auth.users auth_user
  left join public.user_profiles profile
    on profile.user_id = auth_user.id
  where auth_user.id = owner_user_id;

  raw_name := coalesce(
    nullif(raw_name, ''),
    nullif(split_part(owner_email, '@', 1), ''),
    'Workspace Owner'
  );
  first_token := split_part(raw_name, ' ', 1);
  owner_first_name := left(coalesce(nullif(first_token, ''), 'Workspace'), 80);
  owner_last_name := left(
    coalesce(
      nullif(btrim(substr(raw_name, char_length(first_token) + 1)), ''),
      'Owner'
    ),
    80
  );

  select employee.id
  into existing_employee_id
  from public.employee_profiles employee
  where employee.workspace_id = target_workspace_id
    and employee.user_id = owner_user_id
    and employee.archived_at is null
  order by employee.created_at
  limit 1
  for update;

  if existing_employee_id is not null then
    update public.employee_profiles employee
    set first_name = owner_first_name,
        last_name = owner_last_name,
        revision = employee.revision + 1,
        updated_at = now()
    where employee.id = existing_employee_id
      and (employee.first_name, employee.last_name)
        is distinct from (owner_first_name, owner_last_name);
    existing_name_changed := found;

    if existing_name_changed then
      insert into public.employee_events (
        workspace_id,
        employee_id,
        actor_user_id,
        action,
        summary
      ) values (
        target_workspace_id,
        existing_employee_id,
        owner_user_id,
        'employee.owner_identity_synced',
        'Owner legal name synchronized at owner onboarding completion'
      );
    end if;

    return existing_employee_id;
  end if;

  select coalesce(max(substring(employee.employee_code from 3)::bigint), 0) + 1
  into next_code
  from public.employee_profiles employee
  where employee.workspace_id = target_workspace_id
    and employee.employee_code ~ '^E-[0-9]+$';

  insert into public.workspace_employee_counters (workspace_id, next_value)
  values (target_workspace_id, next_code + 1)
  on conflict (workspace_id) do update
  set next_value = greatest(
    public.workspace_employee_counters.next_value + 1,
    excluded.next_value
  )
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

  insert into public.employee_events (
    workspace_id,
    employee_id,
    actor_user_id,
    action,
    summary
  ) values (
    target_workspace_id,
    existing_employee_id,
    owner_user_id,
    'employee.owner_record_created',
    'Owner employee record created by owner onboarding'
  );

  return existing_employee_id;
end;
$$;

revoke all on function app_private.ensure_owner_employee_profile(uuid, uuid)
from public, anon, authenticated;

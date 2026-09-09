-- Empty scopes mean no managed locations, not workspace-wide access.
alter table public.employee_invitations drop constraint if exists employee_invitations_check;

create or replace function public.can_access_employee(
  target_workspace_id uuid,
  target_employee_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select membership.id, membership.all_locations, role.access_class
    from public.workspace_memberships membership
    join public.workspace_roles role
      on role.id = membership.role_id
     and role.workspace_id = membership.workspace_id
    where membership.workspace_id = target_workspace_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
    limit 1
  ),
  target_employee as (
    select employee.id, target_role.access_class
    from public.employee_profiles employee
    left join public.workspace_memberships target_membership
      on target_membership.workspace_id = employee.workspace_id
     and target_membership.user_id = employee.user_id
    left join public.workspace_roles target_role
      on target_role.id = target_membership.role_id
     and target_role.workspace_id = target_membership.workspace_id
    where employee.workspace_id = target_workspace_id
      and employee.id = target_employee_id
  )
  select exists (
    select 1
    from actor
    cross join target_employee
    where actor.access_class in ('owner', 'admin')
       or (
        actor.access_class = 'manager'
        and coalesce(target_employee.access_class, 'employee'::public.workspace_role) = 'employee'::public.workspace_role
        and (
          actor.all_locations
          or exists (
            select 1 from public.employee_profiles own_draft
            where own_draft.id = target_employee_id and own_draft.workspace_id = target_workspace_id
              and own_draft.created_by = (select auth.uid()) and own_draft.user_id is null
              and (own_draft.is_remote or own_draft.is_excluded_from_schedule)
              and not exists (
                select 1 from public.employee_location_assignments a
                where a.employee_id = own_draft.id and a.ended_at is null
              )
          )
          or exists (
            select 1
            from public.employee_location_assignments assignment
            join public.membership_location_scopes scope
              on scope.membership_id = actor.id
             and scope.workspace_id = target_workspace_id
             and scope.location_id = assignment.location_id
            where assignment.employee_id = target_employee_id
              and assignment.workspace_id = target_workspace_id
              and assignment.ended_at is null
          )
        )
      )
  );
$$;

create or replace function public.can_manage_employee_record(
  target_workspace_id uuid,
  target_employee_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select membership.id, membership.all_locations, role.access_class
    from public.workspace_memberships membership
    join public.workspace_roles role
      on role.id = membership.role_id
     and role.workspace_id = membership.workspace_id
    where membership.workspace_id = target_workspace_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
    limit 1
  ),
  target_employee as (
    select employee.id, coalesce(target_role.access_class, 'employee'::public.workspace_role) as access_class
    from public.employee_profiles employee
    left join public.workspace_memberships target_membership
      on target_membership.workspace_id = employee.workspace_id
     and target_membership.user_id = employee.user_id
    left join public.workspace_roles target_role
      on target_role.id = target_membership.role_id
     and target_role.workspace_id = target_membership.workspace_id
    where employee.workspace_id = target_workspace_id
      and employee.id = target_employee_id
  )
  select exists (
    select 1
    from actor
    cross join target_employee
    where (
      actor.access_class = 'owner'
      and target_employee.access_class <> 'owner'
    )
    or (
      actor.access_class = 'admin'
      and target_employee.access_class in ('manager', 'employee')
    )
    or (
      actor.access_class = 'manager'
      and target_employee.access_class = 'employee'
      and (
        actor.all_locations
        or exists (
            select 1 from public.employee_profiles own_draft
            where own_draft.id = target_employee_id and own_draft.workspace_id = target_workspace_id
              and own_draft.created_by = (select auth.uid()) and own_draft.user_id is null
              and (own_draft.is_remote or own_draft.is_excluded_from_schedule)
              and not exists (
                select 1 from public.employee_location_assignments a
                where a.employee_id = own_draft.id and a.ended_at is null
              )
          )
          or exists (
          select 1
          from public.employee_location_assignments assignment
          join public.membership_location_scopes scope
            on scope.membership_id = actor.id
           and scope.workspace_id = target_workspace_id
           and scope.location_id = assignment.location_id
          where assignment.employee_id = target_employee_id
            and assignment.workspace_id = target_workspace_id
            and assignment.ended_at is null
        )
      )
    )
  );
$$;


create or replace function public.prepare_employee_invitation_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid,
  employee_email text,
  target_role_id uuid,
  invitation_token_hash text,
  invitation_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_id uuid;
  actor_role public.workspace_role;
  invite_role public.workspace_roles%rowtype;
  assigned_location_ids uuid[];
begin
  if not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'employee_access.manage') then
    raise exception 'employee access management required' using errcode = '42501';
  end if;
  if employee_email <> lower(btrim(employee_email)) or employee_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'valid normalized invitation email required' using errcode = '22023';
  end if;
  if invitation_token_hash !~ '^[0-9a-f]{64}$' or invitation_expires_at <= now() then
    raise exception 'valid invitation token and expiry required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.employee_profiles employee
    where employee.id = target_employee_id
      and employee.workspace_id = target_workspace_id
      and employee.archived_at is null
      and employee.user_id is null
  ) then
    raise exception 'invitable employee not found' using errcode = 'P0002';
  end if;

  if target_role_id is null then
    select * into invite_role from public.workspace_roles
    where workspace_id = target_workspace_id and system_key = 'employee';
  else
    select * into invite_role from public.workspace_roles
    where workspace_id = target_workspace_id and id = target_role_id;
  end if;
  if invite_role.id is null then
    raise exception 'invitation role is unavailable' using errcode = '22023';
  end if;
  if invite_role.access_class = 'owner' then
    raise exception 'owner role cannot be assigned by invitation' using errcode = '42501';
  end if;
  select role into actor_role
  from public.workspace_memberships
  where user_id = actor_user_id
    and workspace_id = target_workspace_id
    and status = 'active';
  if actor_role <> 'owner' and invite_role.access_class = 'admin' then
    raise exception 'admin role assignment requires owner access' using errcode = '42501';
  end if;

  if actor_role not in ('owner', 'admin') and invite_role.access_class <> 'employee' then
    raise exception 'role assignment access denied' using errcode = '42501';
  end if;
  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  if not public.can_manage_employee_record(target_workspace_id, target_employee_id)
    then
    raise exception 'employee access denied' using errcode = '42501';
  end if;

  select coalesce(array_agg(location_id order by location_id), '{}') into assigned_location_ids
  from public.employee_location_assignments
  where employee_id = target_employee_id and ended_at is null;
  if cardinality(assigned_location_ids) = 0 and not exists (
    select 1 from public.employee_profiles where id = target_employee_id
      and workspace_id = target_workspace_id and (is_remote or is_excluded_from_schedule)
  ) then
    raise exception 'employee requires a location before invitation' using errcode = '22023';
  end if;

  update public.employee_invitations
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where employee_id = target_employee_id and status = 'pending';
  insert into public.employee_invitations (
    workspace_id, employee_id, email, role_id, all_locations, location_ids,
    token_hash, expires_at, created_by, delivery_status
  ) values (
    target_workspace_id, target_employee_id, employee_email, invite_role.id,
    invite_role.access_class in ('admin', 'employee'),
    case when invite_role.access_class in ('admin', 'employee') then '{}'::uuid[] else assigned_location_ids end, invitation_token_hash, invitation_expires_at,
    actor_user_id, 'pending'
  ) returning id into invitation_id;
  update public.employee_profiles
  set invitation_email = employee_email, revision = revision + 1, updated_at = now()
  where id = target_employee_id;
  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
  values (target_workspace_id, target_employee_id, actor_user_id, 'employee.invited', 'Employee invitation prepared');
  return invitation_id;
end;
$$;

-- A command is private recovery state, never a client-readable invitation token store.
create table if not exists public.employee_create_commands (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  command_id uuid not null,
  input_hash text not null,
  employee_id uuid not null references public.employee_profiles(id) on delete cascade,
  invitation_id uuid references public.employee_invitations(id) on delete set null,
  invitation_token text,
  created_at timestamptz not null default now(),
  primary key (workspace_id, actor_user_id, command_id)
);
alter table public.employee_create_commands enable row level security;
revoke all on public.employee_create_commands from public, anon, authenticated, service_role;

create or replace function public.create_employee_command_service(
  actor_user_id uuid, target_workspace_id uuid, command_id uuid,
  employee_input jsonb, invite_role_id uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  stored public.employee_create_commands%rowtype;
  invite public.employee_invitations%rowtype;
  fingerprint text;
  saved_id uuid;
  prepared_id uuid;
  secret_token text;
begin
  if actor_user_id is null or command_id is null
    or not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'employees.manage') then
    raise exception 'employee management access required' using errcode = '42501';
  end if;
  if invite_role_id is not null and not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'employee_access.manage') then
    raise exception 'employee access required' using errcode = '42501';
  end if;
  fingerprint := encode(extensions.digest(jsonb_build_object('employee', employee_input, 'role', invite_role_id)::text, 'sha256'), 'hex');
  -- Serializes retries before creating anything, including concurrent requests.
  perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text || actor_user_id::text || command_id::text, 0));
  select * into stored from public.employee_create_commands c
    where c.workspace_id = target_workspace_id and c.actor_user_id = create_employee_command_service.actor_user_id
      and c.command_id = create_employee_command_service.command_id;
  if found then
    if stored.input_hash <> fingerprint then
      raise exception 'idempotency key belongs to different employee details' using errcode = '40001';
    end if;
    if invite_role_id is not null and not exists (
      select 1 from public.workspace_roles role
      join public.workspace_memberships actor on actor.workspace_id = role.workspace_id
      where role.id = invite_role_id and role.workspace_id = target_workspace_id
        and actor.user_id = actor_user_id and actor.status = 'active'
        and role.access_class <> 'owner'
        and (actor.role = 'owner' or (actor.role = 'admin' and role.access_class <> 'admin')
          or (actor.role = 'manager' and role.access_class = 'employee'))
    ) then
      raise exception 'role assignment access denied' using errcode = '42501';
    end if;
  else
    if coalesce(employee_input->>'invitation_email', '') <> ''
      and (employee_input->>'invitation_email') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      raise exception 'valid invitation email required' using errcode = '22023';
    end if;
    saved_id := public.save_employee_service(
      actor_user_id, target_workspace_id, null,
      employee_input->>'first_name', employee_input->>'last_name', '',
      employee_input->>'invitation_email', nullif(employee_input->>'start_date', '')::date,
      employee_input->>'internal_note',
      array(select jsonb_array_elements_text(employee_input->'location_ids'))::uuid[],
      (employee_input->>'primary_location_id')::uuid,
      array(select jsonb_array_elements_text(employee_input->'job_ids'))::uuid[],
      (employee_input->>'primary_job_id')::uuid,
      coalesce((employee_input->>'is_remote')::boolean, false),
      coalesce((employee_input->>'is_excluded_from_schedule')::boolean, false), null
    );
    if invite_role_id is not null then
      secret_token := encode(extensions.gen_random_bytes(32), 'hex');
      prepared_id := public.prepare_employee_invitation_service(
        actor_user_id, target_workspace_id, saved_id, lower(btrim(employee_input->>'invitation_email')),
        invite_role_id, encode(extensions.digest(secret_token, 'sha256'), 'hex'), now() + interval '7 days'
      );
    end if;
    insert into public.employee_create_commands
      (workspace_id, actor_user_id, command_id, input_hash, employee_id, invitation_id, invitation_token)
      values (target_workspace_id, actor_user_id, command_id, fingerprint, saved_id, prepared_id, secret_token)
      returning * into stored;
  end if;
  if stored.invitation_id is not null then
    select * into invite from public.employee_invitations where id = stored.invitation_id;
  end if;
  return jsonb_build_object(
    'id', stored.employee_id, 'invitation_id', stored.invitation_id,
    'token', case when invite.status = 'pending' and invite.expires_at > now() then stored.invitation_token else null end,
    'delivery_status', invite.delivery_status
  );
end;
$$;
revoke all on function public.create_employee_command_service(uuid, uuid, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.create_employee_command_service(uuid, uuid, uuid, jsonb, uuid) to service_role;
revoke all on function public.prepare_employee_invitation_service(uuid, uuid, uuid, text, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.prepare_employee_invitation_service(uuid, uuid, uuid, text, uuid, text, timestamptz) to service_role;
notify pgrst, 'reload schema';

-- FB-6.2.5 (BL-242): adding and inviting somebody asks the authorization core.
--
-- A manager adds and invites an employee where they manage (M2); employee
-- access management is no longer asked (matrix gap manager-cannot-invite).
-- The role an invitation hands out ranks below whoever hands it out, and the
-- owner's is nobody's: one rule, app_private.can_invite_with_role, which the
-- create command, the invitation and the Employees drawer's role picker read.
-- Copying, retrying, keeping the token of, marking and taking back an
-- invitation are for whoever could have sent it. The invitation services that
-- wrote the JWT subject to reuse can_manage_employee_record now ask the core.
-- The owner's setup services ask it too (workspace.setup): the list and the
-- mark read the role off the membership, so somebody with none passed.

-- 1. The one role rule ------------------------------------------------------------

-- Whoever may add people somewhere hands out a role below their own rank.
-- Where they may add people is the core's employee.create over the places they
-- reach (every location for the owner and admins, none for a manager who
-- works and manages nowhere).
create or replace function app_private.can_invite_with_role(actor_user_id uuid, target_workspace_id uuid, target_role_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select app_private.authz_rank(role.access_class) < app_private.authz_rank(state.class)
      and app_private.authz_reason(actor_user_id, target_workspace_id, 'employee.create', state.manages) is null
    from app_private.actor(actor_user_id, target_workspace_id) state
    join public.workspace_roles role on role.workspace_id = state.workspace_id
    where role.id = target_role_id
  ), false)
$$;
revoke all on function app_private.can_invite_with_role(uuid, uuid, uuid) from public;

-- 2. Adding somebody ----------------------------------------------------------------

create or replace function public.create_employee_command_service(actor_user_id uuid, target_workspace_id uuid, command_id uuid, employee_input jsonb, invite_role_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored public.employee_create_commands%rowtype;
  invite public.employee_invitations%rowtype;
  fingerprint text;
  saved_id uuid;
  prepared_id uuid;
  secret_token text;
begin
  -- Asked where the record will work, retries included: a manager only where
  -- they manage, never nowhere.
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.create',
    array(select jsonb_array_elements_text(coalesce(employee_input -> 'location_ids', '[]'::jsonb)))::uuid[]);
  if command_id is null then
    raise exception 'command id required' using errcode = '22023';
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
    -- A retry hands the token out again: only while the role is still theirs to give.
    if invite_role_id is not null
      and not app_private.can_invite_with_role(actor_user_id, target_workspace_id, invite_role_id) then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.rank', detail = 'employee.invite';
    end if;
  else
    if coalesce(employee_input->>'invitation_email', '') <> ''
      and (employee_input->>'invitation_email') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      raise exception 'valid invitation email required' using errcode = '22023';
    end if;
    saved_id := public.save_employee_service(
      actor_user_id, target_workspace_id, null,
      employee_input->>'first_name',
      coalesce(employee_input->>'middle_name', ''),
      employee_input->>'last_name', '',
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

-- 3. Inviting ---------------------------------------------------------------------

create or replace function public.prepare_employee_invitation_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid, employee_email text, target_role_id uuid, invitation_token_hash text, invitation_expires_at timestamp with time zone)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_id uuid;
  invite_role public.workspace_roles%rowtype;
  assigned_location_ids uuid[];
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.invite', target_person => target_employee_id);
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
  if not app_private.can_invite_with_role(actor_user_id, target_workspace_id, invite_role.id) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.rank', detail = 'employee.invite';
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

-- 4. After an invitation is sent ------------------------------------------------------

create or replace function public.load_employee_invitation_link_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_row public.employee_invitations%rowtype;
  recovered_token text;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.invite', target_person => target_employee_id);

  select * into invitation_row
  from public.employee_invitations
  where workspace_id = target_workspace_id
    and employee_id = target_employee_id
    and status = 'pending'
  order by created_at desc
  limit 1;
  -- Handing the link on is handing out its role.
  if invitation_row.id is not null
     and not app_private.can_invite_with_role(actor_user_id, target_workspace_id, invitation_row.role_id) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.rank', detail = 'employee.invite';
  end if;
  if invitation_row.id is null or invitation_row.expires_at <= now() then
    raise exception 'open invitation not found' using errcode = 'P0002';
  end if;

  select token into recovered_token
  from public.employee_invitation_delivery_secrets
  where invitation_id = invitation_row.id
    and workspace_id = invitation_row.workspace_id;
  if recovered_token is null then
    raise exception 'invitation link is unavailable; use Resend' using errcode = 'P0002';
  end if;

  insert into public.employee_events (
    workspace_id, employee_id, actor_user_id, action, summary
  ) values (
    target_workspace_id,
    target_employee_id,
    actor_user_id,
    'employee.invitation_link_copied',
    'Invitation link copied'
  );

  return jsonb_build_object(
    'token', recovered_token,
    'expires_at', invitation_row.expires_at
  );
end;
$$;

create or replace function public.load_employee_invitation_retry_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_row public.employee_invitations%rowtype;
  recovered_token text;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.invite', target_person => target_employee_id);

  select * into invitation_row
  from public.employee_invitations
  where workspace_id = target_workspace_id
    and employee_id = target_employee_id
    and status = 'pending'
  order by created_at desc
  limit 1
  for update;
  if invitation_row.id is not null
     and not app_private.can_invite_with_role(actor_user_id, target_workspace_id, invitation_row.role_id) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.rank', detail = 'employee.invite';
  end if;
  if invitation_row.id is null or invitation_row.delivery_status <> 'failed' then
    raise exception 'failed invitation not found' using errcode = 'P0002';
  end if;
  if invitation_row.expires_at <= now() then
    raise exception 'invitation expired; use Resend' using errcode = '22023';
  end if;

  select token into recovered_token
  from public.employee_invitation_delivery_secrets
  where invitation_id = invitation_row.id
    and workspace_id = invitation_row.workspace_id;
  if recovered_token is null then
    raise exception 'original invitation link is unavailable; use Resend'
      using errcode = 'P0002';
  end if;
  if invitation_row.token_hash <>
    encode(extensions.digest(recovered_token, 'sha256'), 'hex') then
    raise exception 'stored invitation token does not match'
      using errcode = '22023';
  end if;

  update public.employee_invitations
  set resend_count = resend_count + 1,
      updated_at = now()
  where id = invitation_row.id;

  insert into public.employee_events (
    workspace_id,
    employee_id,
    actor_user_id,
    action,
    summary
  ) values (
    target_workspace_id,
    target_employee_id,
    actor_user_id,
    'employee.invitation_delivery_retry_started',
    'Employee invitation delivery retry started'
  );

  return jsonb_build_object(
    'id', invitation_row.id,
    'email', invitation_row.email,
    'token', recovered_token,
    'expires_at', invitation_row.expires_at
  );
end;
$$;

-- An invitation known by its id is asked about its person: an unknown id is
-- nobody's, so it gets the out-of-scope answer.
create or replace function public.store_employee_invitation_delivery_secret_service(actor_user_id uuid, target_workspace_id uuid, target_invitation_id uuid, invitation_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_row public.employee_invitations%rowtype;
begin
  select * into invitation_row
  from public.employee_invitations
  where id = target_invitation_id
    and workspace_id = target_workspace_id
  for update;
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.invite', target_person => invitation_row.employee_id);
  if not app_private.can_invite_with_role(actor_user_id, target_workspace_id, invitation_row.role_id) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.rank', detail = 'employee.invite';
  end if;
  if invitation_token is null
    or char_length(invitation_token) not between 32 and 256 then
    raise exception 'valid invitation token required' using errcode = '22023';
  end if;
  if invitation_row.status <> 'pending' or invitation_row.expires_at <= now() then
    raise exception 'active invitation not found' using errcode = 'P0002';
  end if;
  if invitation_row.token_hash <>
    encode(extensions.digest(invitation_token, 'sha256'), 'hex') then
    raise exception 'invitation token does not match' using errcode = '22023';
  end if;

  insert into public.employee_invitation_delivery_secrets (
    invitation_id,
    workspace_id,
    token
  ) values (
    invitation_row.id,
    invitation_row.workspace_id,
    invitation_token
  )
  on conflict (invitation_id) do update
  set token = excluded.token,
      updated_at = now();
end;
$$;

create or replace function public.mark_employee_invitation_delivery_service(actor_user_id uuid, target_workspace_id uuid, target_invitation_id uuid, delivery_result text, delivery_failure_message text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_row public.employee_invitations%rowtype;
begin
  select * into invitation_row
  from public.employee_invitations
  where id = target_invitation_id
    and workspace_id = target_workspace_id
  for update;
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.invite', target_person => invitation_row.employee_id);
  if not app_private.can_invite_with_role(actor_user_id, target_workspace_id, invitation_row.role_id) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.rank', detail = 'employee.invite';
  end if;
  if delivery_result not in ('sent', 'failed') then
    raise exception 'valid invitation delivery result required' using errcode = '22023';
  end if;
  if invitation_row.status <> 'pending' then
    raise exception 'pending invitation not found' using errcode = 'P0002';
  end if;

  update public.employee_invitations
  set delivery_status = delivery_result,
      delivery_attempted_at = now(),
      delivery_failed_at = case when delivery_result = 'failed' then now() else null end,
      delivery_error = case
        when delivery_result = 'failed' then left(coalesce(delivery_failure_message, 'Invitation delivery failed'), 500)
        else null
      end,
      sent_at = case when delivery_result = 'sent' then now() else sent_at end,
      updated_at = now()
  where id = invitation_row.id;

  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
  values (
    target_workspace_id,
    invitation_row.employee_id,
    actor_user_id,
    case when delivery_result = 'failed' then 'employee.invitation_delivery_failed' else 'employee.invitation_delivery_sent' end,
    case when delivery_result = 'failed' then 'Employee invitation delivery failed' else 'Employee invitation delivered' end
  );
end;
$$;

create or replace function public.revoke_employee_invitation_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_row public.employee_invitations%rowtype;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.invite', target_person => target_employee_id);
  select * into invitation_row
  from public.employee_invitations
  where employee_id = target_employee_id and workspace_id = target_workspace_id and status = 'pending'
  order by created_at desc
  limit 1
  for update;
  if invitation_row.id is null then
    raise exception 'pending invitation not found' using errcode = 'P0002';
  end if;
  if not app_private.can_invite_with_role(actor_user_id, target_workspace_id, invitation_row.role_id) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.rank', detail = 'employee.invite';
  end if;
  update public.employee_invitations
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where employee_id = target_employee_id and workspace_id = target_workspace_id and status = 'pending';
  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
  values (target_workspace_id, target_employee_id, actor_user_id, 'employee.invitation_revoked', 'Employee invitation revoked');
end;
$$;

-- 5. The owner's setup --------------------------------------------------------------

create or replace function public.reset_owner_onboarding_service(actor_user_id uuid, target_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  onboarding_status public.onboarding_status;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'workspace.setup');

  select onboarding.status
  into onboarding_status
  from public.workspace_onboarding onboarding
  where onboarding.workspace_id = target_workspace_id
  for update;

  if onboarding_status is null then
    raise exception 'workspace onboarding was not found' using errcode = 'P0002';
  end if;
  if onboarding_status = 'complete'::public.onboarding_status then
    raise exception 'completed owner onboarding cannot be reset' using errcode = '22023';
  end if;

  delete from public.employee_profiles
  where workspace_id = target_workspace_id
    and user_id is null;

  delete from public.jobs
  where workspace_id = target_workspace_id;

  delete from public.departments
  where workspace_id = target_workspace_id;

  delete from public.locations
  where workspace_id = target_workspace_id;

  update public.workspace_onboarding
  set status = 'incomplete'::public.onboarding_status,
      current_step = 1,
      completed_at = null,
      updated_by = actor_user_id,
      updated_at = now()
  where workspace_id = target_workspace_id;

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id
  ) values (
    target_workspace_id,
    actor_user_id,
    'workspace.onboarding_reset',
    'workspace',
    target_workspace_id::text
  );
end;
$$;

create or replace function public.queue_owner_onboarding_invitation_intent_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid, employee_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  onboarding_status public.onboarding_status;
  normalized_email text := lower(btrim(employee_email));
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'workspace.setup');

  select onboarding.status
  into onboarding_status
  from public.workspace_onboarding onboarding
  where onboarding.workspace_id = target_workspace_id;

  if onboarding_status is null then
    raise exception 'workspace onboarding was not found' using errcode = 'P0002';
  end if;
  if onboarding_status = 'complete'::public.onboarding_status then
    raise exception 'completed owner onboarding cannot queue invitations' using errcode = '22023';
  end if;
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'valid invitation email required' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.employee_profiles employee
    where employee.workspace_id = target_workspace_id
      and employee.id = target_employee_id
      and employee.archived_at is null
      and employee.user_id is null
  ) then
    raise exception 'invitable employee not found' using errcode = 'P0002';
  end if;

  insert into public.owner_onboarding_invitation_intents (
    workspace_id,
    employee_id,
    email,
    created_by,
    updated_at,
    dispatched_at,
    dispatch_error
  ) values (
    target_workspace_id,
    target_employee_id,
    normalized_email,
    actor_user_id,
    now(),
    null,
    null
  )
  on conflict (workspace_id, employee_id)
  do update set
    email = excluded.email,
    updated_at = now(),
    dispatched_at = null,
    dispatch_error = null;
end;
$$;

create or replace function public.list_owner_onboarding_invitation_intents_service(actor_user_id uuid, target_workspace_id uuid)
returns table(employee_id uuid, email text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  onboarding_status public.onboarding_status;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'workspace.setup');

  select onboarding.status
  into onboarding_status
  from public.workspace_onboarding onboarding
  where onboarding.workspace_id = target_workspace_id;

  if onboarding_status is null then
    raise exception 'workspace onboarding was not found' using errcode = 'P0002';
  end if;
  if onboarding_status <> 'complete'::public.onboarding_status then
    raise exception 'owner onboarding must be complete' using errcode = '22023';
  end if;

  return query
  select intent.employee_id, intent.email
  from public.owner_onboarding_invitation_intents intent
  join public.employee_profiles employee
    on employee.workspace_id = intent.workspace_id
   and employee.id = intent.employee_id
  where intent.workspace_id = target_workspace_id
    and intent.dispatched_at is null
    and employee.archived_at is null
    and employee.user_id is null
    and not exists (
      select 1
      from public.employee_invitations invitation
      where invitation.workspace_id = intent.workspace_id
        and invitation.employee_id = intent.employee_id
        and invitation.status in ('pending', 'accepted')
    )
  order by intent.created_at, intent.employee_id;
end;
$$;

create or replace function public.mark_owner_onboarding_invitation_intent_dispatched_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid, dispatch_failure_message text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'workspace.setup');

  update public.owner_onboarding_invitation_intents
  set dispatched_at = now(),
      dispatch_error = nullif(left(coalesce(dispatch_failure_message, ''), 500), ''),
      updated_at = now()
  where workspace_id = target_workspace_id
    and employee_id = target_employee_id;

  if not found then
    raise exception 'owner onboarding invitation intent not found' using errcode = 'P0002';
  end if;
end;
$$;

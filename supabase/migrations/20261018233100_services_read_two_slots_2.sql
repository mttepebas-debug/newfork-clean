-- ROL-CIFT 1.4, services_read_two_slots part 2 of 7: the same migration as part 1 describes, split at
-- statement boundaries so each part goes live in one piece. Runs after part 1.

CREATE OR REPLACE FUNCTION "public"."cancel_workspace_closure_service"("actor_user_id" "uuid", "target_workspace_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  workspace_row public.workspaces%rowtype;
  actor_role public.workspace_role;
  request_id uuid;
  effective_at timestamptz;
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501', hint = 'actor.required';
  end if;
  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);

  select * into workspace_row
  from public.workspaces
  where id = target_workspace_id
  for update;

  if workspace_row.id is null or workspace_row.lifecycle_status = 'deleted' then
    raise exception 'workspace not found' using errcode = '02000', hint = 'workspace.not_found';
  end if;

  -- The core says who the actor is here (ROL-CIFT 1.4).
  select state.class into actor_role
  from app_private.actor(actor_user_id, target_workspace_id) state
  where state.status = 'active';

  if actor_role is distinct from 'owner'::public.workspace_role then
    raise exception 'workspace owner access required' using errcode = '42501', hint = 'workspace.owner_required';
  end if;

  if workspace_row.lifecycle_status <> 'closure_scheduled' then
    raise exception 'workspace closure is not scheduled' using errcode = '23514', hint = 'workspace.closure.not_scheduled';
  end if;

  update public.workspace_closure_requests r
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = actor_user_id,
      updated_at = now()
  where r.workspace_id = target_workspace_id
    and r.status = 'scheduled'
  returning r.id, r.effective_at into request_id, effective_at;

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

  perform app_private.notify_workspace_closing(target_workspace_id, actor_user_id, request_id, effective_at, true);

  return jsonb_build_object(
    'status', 'cancelled',
    'workspace_id', target_workspace_id,
    'closure_request_id', request_id
  );
end;
$$;

CREATE OR REPLACE FUNCTION "public"."initiate_workspace_ownership_transfer_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  workspace_row public.workspaces%rowtype;
  actor_membership public.workspace_memberships%rowtype;
  target_membership public.workspace_memberships%rowtype;
  target_access public.workspace_role;
  target_email_verified boolean;
  target_onboarding_blocked boolean;
  transfer_id uuid;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'workspace.transfer_ownership');

  if actor_user_id is null or target_user_id is null then
    raise exception 'valid actor and target required' using errcode = '42501', hint = 'actor.required';
  end if;
  if actor_user_id = target_user_id then
    raise exception 'ownership transfer target must be another account' using errcode = '23514', hint = 'transfer.target_is_self';
  end if;

  select * into workspace_row
  from public.workspaces
  where id = target_workspace_id
  for update;

  if workspace_row.id is null or workspace_row.lifecycle_status <> 'active' then
    raise exception 'workspace not found' using errcode = '02000', hint = 'workspace.not_found';
  end if;

  select membership.* into actor_membership
  from public.workspace_memberships membership
  where membership.workspace_id = target_workspace_id
    and membership.user_id = actor_user_id
    and membership.status = 'active'
  limit 1;

  if exists (
    select 1
    from public.workspace_ownership_transfers transfer
    where transfer.workspace_id = target_workspace_id
      and transfer.status = 'pending'
  ) then
    raise exception 'pending ownership transfer already exists' using errcode = '23505', hint = 'transfer.already_pending';
  end if;

  select membership.* into target_membership
  from public.workspace_memberships membership
  where membership.workspace_id = target_workspace_id
    and membership.user_id = target_user_id
    and membership.status = 'active'
  limit 1
  for update;

  -- The core says who the target is here (ROL-CIFT 1.4).
  select state.class into target_access
  from app_private.actor(target_user_id, target_workspace_id) state
  where state.status = 'active';

  if target_membership.id is null or target_access is distinct from 'admin'::public.workspace_role then
    raise exception 'ownership transfer target must be an active admin' using errcode = '23514', hint = 'transfer.target_not_admin';
  end if;

  select exists (
    select 1
    from auth.users target_user
    where target_user.id = target_user_id
      and target_user.email_confirmed_at is not null
  ) into target_email_verified;
  if not target_email_verified then
    raise exception 'ownership transfer target must have a verified email' using errcode = '23514', hint = 'transfer.target_email_unverified';
  end if;

  select exists (
    select 1
    from public.employee_onboarding_cases onboarding
    where onboarding.workspace_id = target_workspace_id
      and onboarding.membership_id = target_membership.id
      and onboarding.status <> 'approved'
  ) into target_onboarding_blocked;
  if target_onboarding_blocked then
    raise exception 'ownership transfer target must have completed onboarding' using errcode = '23514', hint = 'transfer.target_onboarding_incomplete';
  end if;

  -- The owner's legal name is required (BL-080), so ownership only goes to
  -- somebody whose legal name is already on file here.
  if not exists (
    select 1
    from public.employee_profiles employee
    join public.employee_private_profiles private_profile
      on private_profile.employee_id = employee.id
    where employee.workspace_id = target_workspace_id
      and employee.user_id = target_user_id
      and employee.archived_at is null
  ) then
    raise exception 'the new owner has no legal name on file yet' using errcode = '23514', hint = 'transfer.target_legal_name_missing';
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

  -- The admin it names is asked (ownership_tell).
  perform app_private.ownership_tell((select t from public.workspace_ownership_transfers t where t.id = transfer_id),
    'initiated', actor_user_id);

  return jsonb_build_object(
    'status', 'pending',
    'transfer_id', transfer_id,
    'workspace_id', target_workspace_id,
    'target_user_id', target_user_id
  );
end;
$$;

CREATE OR REPLACE FUNCTION "public"."request_workspace_closure_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "closure_mode" "text", "typed_workspace_name" "text" DEFAULT NULL::"text", "acknowledged" boolean DEFAULT false, "target_effective_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  workspace_row public.workspaces%rowtype;
  actor_role public.workspace_role;
  request_id uuid;
  effective_at timestamptz;
  revocation jsonb;
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501', hint = 'actor.required';
  end if;
  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  if not acknowledged then
    raise exception 'workspace closure requires explicit acknowledgement' using errcode = '23514', hint = 'workspace.closure.acknowledgement_required';
  end if;
  if closure_mode not in ('scheduled_end_period', 'immediate') then
    raise exception 'valid workspace closure mode required' using errcode = '22023', hint = 'workspace.closure.mode_invalid';
  end if;

  select * into workspace_row
  from public.workspaces
  where id = target_workspace_id
  for update;

  if workspace_row.id is null or workspace_row.lifecycle_status = 'deleted' then
    raise exception 'workspace not found' using errcode = '02000', hint = 'workspace.not_found';
  end if;

  -- The core says who the actor is here (ROL-CIFT 1.4).
  select state.class into actor_role
  from app_private.actor(actor_user_id, target_workspace_id) state
  where state.status = 'active';

  if actor_role is distinct from 'owner'::public.workspace_role then
    raise exception 'workspace owner access required' using errcode = '42501', hint = 'workspace.owner_required';
  end if;

  if closure_mode = 'immediate' then
    if typed_workspace_name is distinct from workspace_row.name then
      raise exception 'workspace name confirmation does not match' using errcode = '23514', hint = 'workspace.closure.name_mismatch';
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

    revocation := app_private.finish_workspace_closure(
      target_workspace_id, actor_user_id, request_id, now(), 'immediate'
    );

    return jsonb_build_object(
      'status', 'deleted',
      'workspace_id', target_workspace_id,
      'closure_request_id', request_id,
      'runtime_revocation', revocation
    );
  end if;

  effective_at := coalesce(target_effective_at, now() + app_private.default_closure_period());
  if effective_at <= now() then
    raise exception 'scheduled workspace closure requires a future effective time'
      using errcode = '23514', hint = 'workspace.closure.effective_at_past';
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

  perform app_private.notify_workspace_closing(target_workspace_id, actor_user_id, request_id, effective_at, false);

  return jsonb_build_object(
    'status', 'scheduled',
    'workspace_id', target_workspace_id,
    'closure_request_id', request_id,
    'effective_at', effective_at
  );
end;
$$;

CREATE OR REPLACE FUNCTION "public"."cancel_workspace_ownership_transfer_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "transfer_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare transfer_row public.workspace_ownership_transfers%rowtype;
begin
  -- Same workspace -> transfer lock order as initiate/accept, to serialize races.
  perform 1 from public.workspaces where id = target_workspace_id for update;
  -- The core says who owns (ROL-CIFT 1.4): the active owner.
  if actor_user_id is null or not exists (
    select 1 from app_private.actor(actor_user_id, target_workspace_id) s
    where s.status = 'active' and s.class = 'owner'
  ) then raise exception 'workspace owner access required' using errcode = '42501', hint = 'workspace.owner_required'; end if;
  select * into transfer_row from public.workspace_ownership_transfers t
    where t.id = transfer_id and t.workspace_id = target_workspace_id for update;
  if transfer_row.id is null or transfer_row.status <> 'pending' then
    raise exception 'pending ownership transfer not found' using errcode = '02000', hint = 'transfer.not_found';
  end if;
  if transfer_row.initiated_by <> actor_user_id then
    raise exception 'ownership transfer initiator access required' using errcode = '42501', hint = 'transfer.initiator_required';
  end if;
  update public.workspace_ownership_transfers set status = 'cancelled', cancelled_at = now(),
    cancelled_by = actor_user_id, updated_at = now() where id = transfer_row.id;
  insert into public.audit_events(workspace_id, actor_user_id, action, target_type, target_id)
    values(target_workspace_id, actor_user_id, 'workspace.ownership_transfer.cancelled', 'workspace_ownership_transfer', transfer_row.id::text);
  perform app_private.ownership_tell(transfer_row, 'cancelled', actor_user_id);
  return jsonb_build_object('status', 'cancelled', 'transfer_id', transfer_row.id, 'workspace_id', target_workspace_id);
end; $$;

CREATE OR REPLACE FUNCTION "public"."create_owner_workspace_service"("actor_user_id" "uuid", "workspace_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;
  -- Serialize create attempts for one account, preserving incomplete-draft reuse.
  perform 1 from auth.users where id = actor_user_id for update;
  if not found then raise exception 'authentication required' using errcode = '42501'; end if;
  -- Same email match and expiry filter as list_pending_employee_invitations_for_account_service.
  -- The core says who owns (ROL-CIFT 1.4).
  if not exists (
    select 1 from public.workspace_memberships m
    where m.user_id = actor_user_id and m.status = 'active'
      and (app_private.actor(actor_user_id, m.workspace_id)).class = 'owner'
  ) and exists (
    select 1
    from public.employee_invitations invitation
    join auth.users user_row on user_row.id = actor_user_id
    where invitation.email = lower(user_row.email)
      and invitation.status = 'pending'
      and invitation.expires_at > now()
      and not exists (
        select 1 from public.workspace_memberships membership
        where membership.workspace_id = invitation.workspace_id
          and membership.user_id = actor_user_id
      )
  ) then
    raise exception 'pending invitation must be resolved first' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.workspace_memberships m
    where m.user_id = actor_user_id and m.status = 'active'
      and app_private.workspace_allows_interactive_access(m.workspace_id)
  ) and not exists (
    select 1 from public.workspace_memberships m
    where m.user_id = actor_user_id and m.status = 'active'
      and (app_private.actor(actor_user_id, m.workspace_id)).class = 'owner'
      and app_private.workspace_allows_interactive_access(m.workspace_id)
  ) then
    raise exception 'workspace owner access required' using errcode = '42501';
  end if;
  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  return public.create_owner_workspace(workspace_name);
end; $$;

CREATE OR REPLACE FUNCTION "public"."search_workspace_ownership_candidates_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "search_text" "text") RETURNS TABLE("userId" "uuid", "name" "text", "email" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if actor_user_id is null or not app_private.workspace_allows_interactive_access(target_workspace_id)
    -- The core says who owns, and below who is an admin (ROL-CIFT 1.4).
    or not exists (
      select 1 from app_private.actor(actor_user_id, target_workspace_id) s
      where s.status = 'active' and s.class = 'owner'
    ) then raise exception 'workspace owner access required' using errcode = '42501', hint = 'workspace.owner_required'; end if;
  if search_text is null or char_length(btrim(search_text)) not between 2 and 80 then
    raise exception 'search must contain 2 to 80 characters' using errcode = '22023', hint = 'search.length_invalid';
  end if;
  return query
    select m.user_id, coalesce(nullif(concat_ws(' ', coalesce(nullif(e.preferred_name, ''), e.first_name), e.last_name), ''), p.display_name, u.email)::text, u.email::text
    from public.workspace_memberships m
    join auth.users u on u.id = m.user_id and u.email_confirmed_at is not null
    left join public.employee_profiles e on e.workspace_id = m.workspace_id and e.user_id = m.user_id and e.archived_at is null
    left join public.user_profiles p on p.user_id = m.user_id
    where m.workspace_id = target_workspace_id and m.status = 'active'
      and m.user_id <> actor_user_id
      -- The admin role first, then the core's word for each one left.
      and m.role_id = (select r.id from public.workspace_roles r where r.workspace_id = target_workspace_id and r.system_key = 'admin')
      and (app_private.actor(m.user_id, target_workspace_id)).class = 'admin'
      -- Active legacy memberships without an onboarding case are already complete.
      and not exists (select 1 from public.employee_onboarding_cases c
        where c.workspace_id = target_workspace_id and c.membership_id = m.id and c.status <> 'approved')
      -- A legal name on file, or the transfer would be refused (BL-080).
      and exists (select 1 from public.employee_private_profiles private_profile
        where private_profile.employee_id = e.id)
      -- Literal substring matching: '%' and '_' cannot enumerate the directory.
      and position(lower(btrim(search_text)) in lower(concat_ws(' ', e.first_name, e.last_name, e.preferred_name, p.display_name, u.email))) > 0
    order by 2, m.user_id limit 10;
end; $$;

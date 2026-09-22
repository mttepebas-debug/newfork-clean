-- Every sentence these functions raise is English prose, and by the time it
-- reaches a screen it is the only thing left to match on. The account screens
-- key their wording off those exact strings, and the API picks the HTTP status
-- with `message.includes(...)`. Reword one raise and the screen quietly falls
-- back to a generic line while the status turns 400.
--
-- So each raise now carries a machine key in `hint`. The message stays exactly
-- as it was; the key is what anything downstream is allowed to read. Bodies are
-- otherwise the live definitions, unchanged.


CREATE OR REPLACE FUNCTION public.block_closure_when_ownership_transfer_pending()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.status in ('scheduled', 'completed')
    and exists (
      select 1
      from public.workspace_ownership_transfers transfer
      where transfer.workspace_id = new.workspace_id
        and transfer.status = 'pending'
    ) then
    raise exception 'pending ownership transfer must be resolved before workspace closure'
      using errcode = '23514', hint = 'workspace.closure.transfer_pending';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.request_workspace_closure_service(actor_user_id uuid, target_workspace_id uuid, closure_mode text, typed_workspace_name text DEFAULT NULL::text, acknowledged boolean DEFAULT false, target_effective_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  workspace_row public.workspaces%rowtype;
  actor_role public.workspace_role;
  request_id uuid;
  effective_at timestamptz;
  edit_sessions_expired integer := 0;
  kiosk_devices_revoked integer := 0;
  kiosk_enrollments_expired integer := 0;
  kiosk_action_sessions_revoked integer := 0;
  kiosk_credentials_deactivated integer := 0;
  notification_jobs_suppressed integer := 0;
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

    update public.schedule_edit_sessions
    set status = 'expired',
        closed_at = coalesce(closed_at, now()),
        expires_at = now()
    where workspace_id = target_workspace_id
      and status = 'active';
    get diagnostics edit_sessions_expired = row_count;

    update public.kiosk_action_sessions
    set revoked_at = now()
    where workspace_id = target_workspace_id
      and consumed_at is null
      and revoked_at is null;
    get diagnostics kiosk_action_sessions_revoked = row_count;

    update public.kiosk_devices
    set status = 'revoked',
        revoked_at = now(),
        revoked_by = actor_user_id
    where workspace_id = target_workspace_id
      and status = 'active';
    get diagnostics kiosk_devices_revoked = row_count;

    update public.kiosk_enrollment_codes
    set status = 'expired',
        expires_at = least(expires_at, now())
    where workspace_id = target_workspace_id
      and status = 'pending';
    get diagnostics kiosk_enrollments_expired = row_count;

    update public.employee_kiosk_credentials
    set active = false,
        updated_by = actor_user_id,
        updated_at = now()
    where workspace_id = target_workspace_id
      and active;
    get diagnostics kiosk_credentials_deactivated = row_count;

    update public.notification_outbox
    set status = 'processed',
        lease_owner = null,
        lease_expires_at = null,
        last_error = 'suppressed because workspace was closed immediately'
    where workspace_id = target_workspace_id
      and status in ('pending', 'retry', 'leased');
    get diagnostics notification_jobs_suppressed = row_count;

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
      jsonb_build_object(
        'closure_request_id', request_id,
        'runtime_revocation', jsonb_build_object(
          'schedule_edit_sessions_expired', edit_sessions_expired,
          'kiosk_devices_revoked', kiosk_devices_revoked,
          'kiosk_enrollments_expired', kiosk_enrollments_expired,
          'kiosk_action_sessions_revoked', kiosk_action_sessions_revoked,
          'kiosk_credentials_deactivated', kiosk_credentials_deactivated,
          'notification_jobs_suppressed', notification_jobs_suppressed
        )
      )
    );

    return jsonb_build_object(
      'status', 'deleted',
      'workspace_id', target_workspace_id,
      'closure_request_id', request_id,
      'runtime_revocation', jsonb_build_object(
        'schedule_edit_sessions_expired', edit_sessions_expired,
        'kiosk_devices_revoked', kiosk_devices_revoked,
        'kiosk_enrollments_expired', kiosk_enrollments_expired,
        'kiosk_action_sessions_revoked', kiosk_action_sessions_revoked,
        'kiosk_credentials_deactivated', kiosk_credentials_deactivated,
        'notification_jobs_suppressed', notification_jobs_suppressed
      )
    );
  end if;

  effective_at := coalesce(target_effective_at, now() + interval '14 days');
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

  return jsonb_build_object(
    'status', 'scheduled',
    'workspace_id', target_workspace_id,
    'closure_request_id', request_id,
    'effective_at', effective_at
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_workspace_closure_service(actor_user_id uuid, target_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  workspace_row public.workspaces%rowtype;
  actor_role public.workspace_role;
  request_id uuid;
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
    raise exception 'workspace owner access required' using errcode = '42501', hint = 'workspace.owner_required';
  end if;

  if workspace_row.lifecycle_status <> 'closure_scheduled' then
    raise exception 'workspace closure is not scheduled' using errcode = '23514', hint = 'workspace.closure.not_scheduled';
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
$function$;

CREATE OR REPLACE FUNCTION public.initiate_workspace_ownership_transfer_service(actor_user_id uuid, target_workspace_id uuid, target_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    raise exception 'workspace owner access required' using errcode = '42501', hint = 'workspace.owner_required';
  end if;

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
$function$;

CREATE OR REPLACE FUNCTION public.respond_workspace_ownership_transfer_service(actor_user_id uuid, target_workspace_id uuid, transfer_id uuid, transfer_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  transfer_row public.workspace_ownership_transfers%rowtype;
  owner_role_id uuid;
  admin_role_id uuid;
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501', hint = 'actor.required';
  end if;
  if transfer_action not in ('accept', 'reject') then
    raise exception 'valid ownership transfer action required' using errcode = '22023', hint = 'transfer.action_invalid';
  end if;

  perform 1 from public.workspaces where id = target_workspace_id for update;

  select * into transfer_row
  from public.workspace_ownership_transfers transfer
  where transfer.id = transfer_id
    and transfer.workspace_id = target_workspace_id
  for update;

  if transfer_row.id is null or transfer_row.status <> 'pending' then
    raise exception 'pending ownership transfer not found' using errcode = '02000', hint = 'transfer.not_found';
  end if;
  if transfer_row.target_user_id <> actor_user_id then
    raise exception 'ownership transfer target access required' using errcode = '42501', hint = 'transfer.target_required';
  end if;
  if transfer_row.expires_at <= now() then
    update public.workspace_ownership_transfers
    set status = 'cancelled',
        cancelled_at = now(),
        cancelled_by = actor_user_id,
        updated_at = now()
    where id = transfer_row.id;
    raise exception 'ownership transfer has expired' using errcode = '23514', hint = 'transfer.expired';
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

  if not app_private.workspace_allows_interactive_access(target_workspace_id) or not exists (
    select 1 from public.workspace_memberships m
    left join public.workspace_roles r on r.id = m.role_id and r.workspace_id = m.workspace_id
    join auth.users u on u.id = m.user_id and u.email_confirmed_at is not null
    where m.id = transfer_row.target_membership_id and m.workspace_id = target_workspace_id
      and m.user_id = actor_user_id and m.status = 'active' and coalesce(r.access_class, m.role) = 'admin'
      and not exists (select 1 from public.employee_onboarding_cases c
        where c.membership_id = m.id and c.workspace_id = m.workspace_id and c.status <> 'approved')
  ) or not exists (
    select 1 from public.workspace_memberships m
    left join public.workspace_roles r on r.id = m.role_id and r.workspace_id = m.workspace_id
    where m.id = transfer_row.previous_owner_membership_id and m.workspace_id = target_workspace_id
      and m.user_id = transfer_row.initiated_by and m.status = 'active' and coalesce(r.access_class, m.role) = 'owner'
  ) then raise exception 'ownership transfer participants are no longer eligible' using errcode = '42501', hint = 'transfer.participants_ineligible'; end if;

  select id into owner_role_id
  from public.workspace_roles
  where workspace_id = target_workspace_id
    and system_key = 'owner';

  select id into admin_role_id
  from public.workspace_roles
  where workspace_id = target_workspace_id
    and system_key = 'admin';

  if owner_role_id is null or admin_role_id is null then
    raise exception 'system owner and admin roles are required' using errcode = 'P0002', hint = 'workspace.roles_missing';
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
$function$;

CREATE OR REPLACE FUNCTION public.cancel_workspace_ownership_transfer_service(actor_user_id uuid, target_workspace_id uuid, transfer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare transfer_row public.workspace_ownership_transfers%rowtype;
begin
  -- Same workspace -> transfer lock order as initiate/accept, to serialize races.
  perform 1 from public.workspaces where id = target_workspace_id for update;
  if actor_user_id is null or not exists (
    select 1 from public.workspace_memberships m
    left join public.workspace_roles r on r.id = m.role_id and r.workspace_id = m.workspace_id
    where m.workspace_id = target_workspace_id and m.user_id = actor_user_id
      and m.status = 'active' and coalesce(r.access_class, m.role) = 'owner'
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
  return jsonb_build_object('status', 'cancelled', 'transfer_id', transfer_row.id, 'workspace_id', target_workspace_id);
end; $function$;

CREATE OR REPLACE FUNCTION public.search_workspace_ownership_candidates_service(actor_user_id uuid, target_workspace_id uuid, search_text text)
 RETURNS TABLE("userId" uuid, name text, email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if actor_user_id is null or not app_private.workspace_allows_interactive_access(target_workspace_id)
    or not exists (
      select 1 from public.workspace_memberships m
      left join public.workspace_roles r on r.id = m.role_id and r.workspace_id = m.workspace_id
      where m.workspace_id = target_workspace_id and m.user_id = actor_user_id
        and m.status = 'active' and coalesce(r.access_class, m.role) = 'owner'
    ) then raise exception 'workspace owner access required' using errcode = '42501', hint = 'workspace.owner_required'; end if;
  if search_text is null or char_length(btrim(search_text)) not between 2 and 80 then
    raise exception 'search must contain 2 to 80 characters' using errcode = '22023', hint = 'search.length_invalid';
  end if;
  return query
    select m.user_id, coalesce(nullif(concat_ws(' ', coalesce(nullif(e.preferred_name, ''), e.first_name), e.last_name), ''), p.display_name, u.email)::text, u.email::text
    from public.workspace_memberships m
    join auth.users u on u.id = m.user_id and u.email_confirmed_at is not null
    left join public.workspace_roles r on r.id = m.role_id and r.workspace_id = m.workspace_id
    left join public.employee_profiles e on e.workspace_id = m.workspace_id and e.user_id = m.user_id and e.archived_at is null
    left join public.user_profiles p on p.user_id = m.user_id
    where m.workspace_id = target_workspace_id and m.status = 'active'
      and m.user_id <> actor_user_id and coalesce(r.access_class, m.role) = 'admin'
      -- Active legacy memberships without an onboarding case are already complete.
      and not exists (select 1 from public.employee_onboarding_cases c
        where c.workspace_id = target_workspace_id and c.membership_id = m.id and c.status <> 'approved')
      -- Literal substring matching: '%' and '_' cannot enumerate the directory.
      and position(lower(btrim(search_text)) in lower(concat_ws(' ', e.first_name, e.last_name, e.preferred_name, p.display_name, u.email))) > 0
    order by 2, m.user_id limit 10;
end; $function$;

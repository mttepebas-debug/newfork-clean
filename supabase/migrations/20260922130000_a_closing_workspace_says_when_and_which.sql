-- Two things the closing screens could not say.
--
-- The date: request_workspace_closure_service works out when a scheduled
-- closure takes effect and nothing else knows the rule, so the panel could only
-- promise "the closure date" and show the real one afterwards. The period has
-- one definition now, and the workspace list carries the date it produces, so
-- the screen can say it before anybody commits to anything.
--
-- The transfer: the trigger that blocks a closure knows exactly which transfer
-- is in the way and said only that one was. It names it now, in `detail`, which
-- travels beside the machine key the same way.

create function app_private.default_closure_period()
returns interval
language sql
immutable
as $$ select interval '14 days' $$;

comment on function app_private.default_closure_period() is
  'How long a scheduled closure waits when nobody names a date. One definition, read by the service that applies it and by the list that shows it.';

revoke all on function app_private.default_closure_period()
  from public, anon, authenticated;

create or replace function public.block_closure_when_ownership_transfer_pending()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  blocking_transfer uuid;
begin
  if new.status in ('scheduled', 'completed') then
    select transfer.id into blocking_transfer
    from public.workspace_ownership_transfers transfer
    where transfer.workspace_id = new.workspace_id
      and transfer.status = 'pending'
    order by transfer.created_at
    limit 1;

    if blocking_transfer is not null then
      -- The screen can offer to cancel that one rather than describe where to
      -- find it.
      raise exception 'pending ownership transfer must be resolved before workspace closure'
        using errcode = '23514',
              hint = 'workspace.closure.transfer_pending',
              detail = blocking_transfer::text;
    end if;
  end if;

  return new;
end;
$function$;

-- The period is read from its one definition now, rather than spelled again.
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

  return jsonb_build_object(
    'status', 'scheduled',
    'workspace_id', target_workspace_id,
    'closure_request_id', request_id,
    'effective_at', effective_at
  );
end;
$function$;

-- And the list carries the date that definition produces.
drop function if exists public.list_my_workspaces_service(uuid);
drop function if exists public.list_my_workspaces();

CREATE FUNCTION public.list_my_workspaces()
 RETURNS TABLE(workspace_id uuid, workspace_name text, workspace_role workspace_role, membership_status membership_status, is_active boolean, onboarding_status onboarding_status, onboarding_current_step smallint, workspace_lifecycle_status workspace_lifecycle_status, closure_effective_at timestamp with time zone, last_used_at timestamp with time zone, access_removed boolean, pending_ownership_transfer_id uuid, pending_ownership_transfer_role text, pending_ownership_transfer_expires_at timestamp with time zone, other_member_count integer, pending_invitation_count integer, default_closure_effective_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    membership.last_used_at,
    exists (
      select 1
      from public.employee_access_snapshots snapshot
      where snapshot.membership_id = membership.id
        and snapshot.restored_at is null
    ),
    transfer.id,
    case
      when transfer.id is null then null
      when transfer.target_user_id = (select auth.uid()) then 'target'
      else 'initiator'
    end,
    transfer.expires_at,
    -- Everybody else who would lose access, and everybody who has been asked
    -- and not answered. The reader is not counted: they know about themselves,
    -- and what the closing screen has to say is what it costs other people.
    (
      select count(*)
      from public.workspace_memberships other
      where other.workspace_id = workspace.id
        and other.user_id <> membership.user_id
        and other.status in ('active', 'pending_activation')
        and not exists (
          select 1
          from public.employee_profiles employee
          where employee.workspace_id = other.workspace_id
            and employee.user_id = other.user_id
            and employee.archived_at is not null
        )
    )::integer,
    (
      select count(*)
      from public.employee_invitations invitation
      where invitation.workspace_id = workspace.id
        and invitation.status = 'pending'
        and invitation.expires_at > now()
    )::integer,
    -- What a scheduled closure would land on if nobody names a date, so the
    -- panel can say it before anybody commits to anything.
    now() + app_private.default_closure_period()
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
      -- Keep expired requests visible to their sender so they can be cancelled.
      and (pending_transfer.expires_at > now() or pending_transfer.initiated_by = membership.user_id)
      and (
        pending_transfer.initiated_by = membership.user_id
        or pending_transfer.target_user_id = membership.user_id
      )
    order by pending_transfer.created_at desc
    limit 1
  ) transfer on true
  where membership.user_id = (select auth.uid())
    and not exists (
      select 1
      from public.employee_profiles employee
      where employee.workspace_id = membership.workspace_id
        and employee.user_id = membership.user_id
        and employee.archived_at is not null
    )
  order by
    (membership.status = 'active') desc,
    (coalesce(workspace.id = preference.active_workspace_id, false) and membership.status = 'active') desc,
    workspace.name asc;
$function$;

CREATE FUNCTION public.list_my_workspaces_service(actor_user_id uuid)
 RETURNS TABLE(workspace_id uuid, workspace_name text, workspace_role workspace_role, membership_status membership_status, is_active boolean, onboarding_status onboarding_status, onboarding_current_step smallint, workspace_lifecycle_status workspace_lifecycle_status, closure_effective_at timestamp with time zone, last_used_at timestamp with time zone, access_removed boolean, pending_ownership_transfer_id uuid, pending_ownership_transfer_role text, pending_ownership_transfer_expires_at timestamp with time zone, other_member_count integer, pending_invitation_count integer, default_closure_effective_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  return query select * from public.list_my_workspaces();
end;
$function$;

revoke all on function public.list_my_workspaces()
  from public, anon, authenticated;
revoke all on function public.list_my_workspaces_service(uuid)
  from public, anon, authenticated;
grant execute on function public.list_my_workspaces_service(uuid)
  to service_role;

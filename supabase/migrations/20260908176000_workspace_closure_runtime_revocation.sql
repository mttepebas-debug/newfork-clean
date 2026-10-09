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
  edit_sessions_expired integer := 0;
  kiosk_devices_revoked integer := 0;
  kiosk_enrollments_expired integer := 0;
  kiosk_action_sessions_revoked integer := 0;
  kiosk_credentials_deactivated integer := 0;
  notification_jobs_suppressed integer := 0;
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

revoke all on function public.request_workspace_closure_service(uuid, uuid, text, text, boolean, timestamptz)
from public, anon, authenticated;
grant execute on function public.request_workspace_closure_service(uuid, uuid, text, text, boolean, timestamptz)
to service_role;

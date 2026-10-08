-- "Close later" finishes on its date (GUVENLIK-A GA-4, BL-906).
-- Account > Workspaces > "Close later" only marked a workspace closure_scheduled.
-- The core stopped opening it at its date, but nothing ever closed it: its
-- memberships stayed active, so an admin could still add catalog rows and edit
-- locations from the browser, and its data was never queued for removal (the
-- purge trigger waits for 'deleted', which only "Close now" wrote).
--   1. What "Close now" does to finish a closure moves into one function both
--      paths call (no twin).
--   2. app_private.complete_due_workspace_closures() finishes every scheduled
--      closure whose date has passed, closed at the date it promised, by the
--      owner who scheduled it.
--   3. pg_cron runs it every five minutes, like the time-off sweep. A closure
--      that fails stays scheduled for the next run and does not hold the
--      others back.

create or replace function app_private.finish_workspace_closure(
  target_workspace_id uuid,
  closing_actor uuid,
  closure_request uuid,
  closed_at_time timestamptz,
  closure_mode text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  edit_sessions_expired integer := 0;
  notification_jobs_suppressed integer := 0;
  revocation jsonb;
begin
  update public.workspaces
  set lifecycle_status = 'deleted',
      closure_scheduled_at = null,
      closure_effective_at = closed_at_time,
      closed_at = closed_at_time,
      closed_by = closing_actor,
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

  update public.notification_outbox
  set status = 'processed',
      lease_owner = null,
      lease_expires_at = null,
      last_error = case closure_mode
        when 'immediate' then 'suppressed because workspace was closed immediately'
        else 'suppressed because workspace was closed on its date'
      end
  where workspace_id = target_workspace_id
    and status in ('pending', 'retry', 'leased');
  get diagnostics notification_jobs_suppressed = row_count;

  delete from public.user_workspace_preferences
  where active_workspace_id = target_workspace_id;

  revocation := jsonb_build_object(
    'schedule_edit_sessions_expired', edit_sessions_expired,
    'notification_jobs_suppressed', notification_jobs_suppressed
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
    closing_actor,
    case closure_mode
      when 'immediate' then 'workspace.closure.completed_immediate'
      else 'workspace.closure.completed_scheduled'
    end,
    'workspace',
    target_workspace_id::text,
    jsonb_build_object('closure_request_id', closure_request, 'runtime_revocation', revocation)
  );

  return revocation;
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

  return jsonb_build_object(
    'status', 'scheduled',
    'workspace_id', target_workspace_id,
    'closure_request_id', request_id,
    'effective_at', effective_at
  );
end;
$$;

create or replace function app_private.complete_due_workspace_closures()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  due record;
  scheduled_request public.workspace_closure_requests%rowtype;
  completed integer := 0;
begin
  for due in
    select workspace.id, workspace.closure_effective_at, workspace.created_by
    from public.workspaces workspace
    where workspace.lifecycle_status = 'closure_scheduled'
      and workspace.closure_effective_at <= now()
    order by workspace.closure_effective_at
    for update skip locked
  loop
    -- One workspace's failure undoes only its own closure and stays scheduled
    -- for the next run; the others still close (as time_off_sweep does).
    begin
      select * into scheduled_request
      from public.workspace_closure_requests request
      where request.workspace_id = due.id
        and request.status = 'scheduled'
      order by request.created_at desc
      limit 1
      for update;

      update public.workspace_closure_requests
      set status = 'completed',
          completed_at = now(),
          updated_at = now()
      where id = scheduled_request.id;

      perform app_private.finish_workspace_closure(
        due.id, coalesce(scheduled_request.requested_by, due.created_by), scheduled_request.id,
        due.closure_effective_at, 'scheduled'
      );
      completed := completed + 1;
    exception when others then
      raise warning 'workspace-closures: workspace % failed: % %', due.id, sqlstate, sqlerrm;
    end;
  end loop;

  return completed;
end;
$$;

revoke all on function app_private.finish_workspace_closure(uuid, uuid, uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function app_private.complete_due_workspace_closures() from public, anon, authenticated;

select cron.schedule('workspace-closures', '*/5 * * * *', 'select app_private.complete_due_workspace_closures()');

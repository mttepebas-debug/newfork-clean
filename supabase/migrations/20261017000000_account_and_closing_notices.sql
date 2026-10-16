-- BILDIRIM-U1 (KARARLAR S-123, S-95; docs/plan/research/BILDIRIM-URETICILER.md §2.8): the account and the
-- workspace write their own notices into the new core (part 4, first slice).
--   * account: a password change, signing out everywhere else, a sign-in email change asked for or
--     cancelled. A password change signs the other sessions out in the same go: that is one notice, the
--     password's, not two (S-95);
--   * workspace: a closing scheduled or cancelled tells every member but the owner who did it.
-- Each producer calls app_private.notify in the domain work's own transaction (S-91). Not here: an email
-- change that completes (no event records it today), the old address's copy of the email change notice
-- (the core sends to a person, not an address), an immediate closing (not in the plan's list).

-- Account -----------------------------------------------------------------------------------------------

create function app_private.notify_account_security(target_user uuid, target_event text, target_audit_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  kind text;
  heading text;
  said text;
begin
  case target_event
    when 'account.password_changed' then
      kind := 'account.password_changed';
      heading := 'Your password was changed';
      said := 'Your other devices were signed out. If this wasn''t you, reset your password now.';
    when 'account.sessions_revoked' then
      -- A password change signs the other sessions out right after it: its own notice says so.
      if exists (
        select 1 from app_private.security_audit_events e
        where e.actor_user_id = target_user and e.event_type = 'account.password_changed'
          and e.occurred_at >= now() - interval '2 minutes'
      ) then
        return 0;
      end if;
      kind := 'account.signed_out_elsewhere';
      heading := 'You signed out everywhere else';
      said := 'Your other devices were signed out. If this wasn''t you, change your password now.';
    when 'account.email_change_requested' then
      kind := 'account.sign_in_email_changed';
      heading := 'A sign-in email change was asked for';
      said := 'Confirm it from the link sent to the new address. If this wasn''t you, cancel it on the Security page.';
    when 'account.email_change_cancelled' then
      kind := 'account.sign_in_email_changed';
      heading := 'Your sign-in email change was cancelled';
      said := 'You still sign in with the same email.';
    else
      return 0;
  end case;
  return app_private.notify(
    kind, null, array[target_user], 'security:' || target_audit_id::text, heading, said, '/account/security',
    target_user, 'account', target_user
  );
end;
$$;

revoke all on function app_private.notify_account_security(uuid, text, uuid) from public;

create or replace function public.record_account_security_event_service(actor_user_id uuid, target_event text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  audit_id uuid;
begin
 if target_event is null or target_event not in ('account.email_change_requested','account.password_changed','account.sessions_revoked') then
  raise exception 'unsupported account security event' using errcode='22023';
 end if;
 if actor_user_id is null or not exists(select 1 from auth.users u where u.id=actor_user_id and u.deleted_at is null) then
  raise exception 'account session required' using errcode='42501', hint='authz.not_active';
 end if;
 audit_id := app_private.record_security_audit_event_service(actor_user_id,null,target_event,'account.security','auth_user',actor_user_id::text,'{}');
 perform app_private.notify_account_security(actor_user_id, target_event, audit_id);
 return audit_id;
end; $$;

create or replace function public.cancel_account_email_change_service(actor_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  pending_email text;
  audit_id uuid;
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  select nullif(email_change,'') into pending_email from auth.users where id=actor_user_id for update;
  if not found then raise exception 'account not found' using errcode='P0002'; end if;
  if pending_email is null then return jsonb_build_object('status','cancelled'); end if;

  update auth.users auth_user
  set email_change = '',
      email_change_token_current = '',
      email_change_token_new = '',
      email_change_sent_at = null,
      email_change_confirm_status = 0,
      updated_at = now()
  where auth_user.id = actor_user_id
;

  if not found then
    raise exception 'account not found' using errcode = 'P0002';
  end if;

  delete from auth.one_time_tokens token
  where token.user_id = actor_user_id
    and token.token_type in (
      'email_change_token_current'::auth.one_time_token_type,
      'email_change_token_new'::auth.one_time_token_type
    );

  audit_id := app_private.record_security_audit_event_service(
    actor_user_id, null, 'account.email_change_cancelled', 'account.security',
    'auth_user', actor_user_id::text, '{}'::jsonb
  );
  perform app_private.notify_account_security(actor_user_id, 'account.email_change_cancelled', audit_id);

  return jsonb_build_object('status', 'cancelled');
end;
$$;

-- Workspace closing -------------------------------------------------------------------------------------

-- Every member hears it; the core leaves out the owner who did it and anybody no longer a member. The
-- date is the workspace's first location's: a workspace has no time zone of its own.
create function app_private.notify_workspace_closing(
  target_workspace uuid, target_actor uuid, target_request uuid, target_effective_at timestamptz, target_cancelled boolean
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  place_name text;
  zone text;
begin
  if target_request is null then
    return 0;
  end if;
  select w.name into place_name from public.workspaces w where w.id = target_workspace;
  select l.timezone into zone from public.locations l
  where l.workspace_id = target_workspace order by l.archived_at nulls first, l.created_at, l.id limit 1;
  return app_private.notify(
    'workspace.closure_scheduled',
    target_workspace,
    array(select m.user_id from public.workspace_memberships m where m.workspace_id = target_workspace),
    'closure:' || target_request::text || case when target_cancelled then ':cancelled' else ':scheduled' end,
    place_name || case when target_cancelled then ' is no longer closing' else ' is closing' end,
    case when target_cancelled then 'The owner cancelled the closing. Everything stays as it is.'
         else format('It closes on %s. Save anything you need before then.',
                     to_char(target_effective_at at time zone coalesce(zone, 'UTC'), 'FMMon FMDD, YYYY')) end,
    '/account/workspaces',
    target_actor,
    'workspace_closure',
    target_request,
    jsonb_build_object('closure_request_id', target_request, 'effective_at', target_effective_at,
                       'cancelled', target_cancelled)
  );
end;
$$;

revoke all on function app_private.notify_workspace_closing(uuid, uuid, uuid, timestamptz, boolean) from public;

create or replace function public.request_workspace_closure_service(actor_user_id uuid, target_workspace_id uuid, closure_mode text, typed_workspace_name text default null::text, acknowledged boolean default false, target_effective_at timestamp with time zone default null::timestamp with time zone)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
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

  perform app_private.notify_workspace_closing(target_workspace_id, actor_user_id, request_id, effective_at, false);

  return jsonb_build_object(
    'status', 'scheduled',
    'workspace_id', target_workspace_id,
    'closure_request_id', request_id,
    'effective_at', effective_at
  );
end;
$$;

create or replace function public.cancel_workspace_closure_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
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

-- BL-055 Account security and deletion lifecycle. This migration deliberately
-- keeps the original deletion columns and RPCs intact so already-pending rows
-- retain their original 14-day restore deadline.

alter table public.account_deletion_requests
  add column if not exists recovery_token_digest text,
  add column if not exists recovery_token_rotated_at timestamptz,
  add column if not exists recovery_email_sent_at timestamptz,
  add column if not exists reminder_7d_sent_at timestamptz,
  add column if not exists reminder_24h_sent_at timestamptz,
  add column if not exists finalization_started_at timestamptz,
  add column if not exists anonymized_at timestamptz;

alter table public.account_deletion_requests
  drop constraint if exists account_deletion_requests_recovery_token_digest_check;

alter table public.account_deletion_requests
  add constraint account_deletion_requests_recovery_token_digest_check
  check (
    recovery_token_digest is null
    or recovery_token_digest ~ '^[a-f0-9]{64}$'
  );

create index if not exists account_deletion_requests_recovery_token_idx
  on public.account_deletion_requests (recovery_token_digest)
  where status = 'pending' and recovery_token_digest is not null;

create index if not exists account_deletion_requests_pending_deadline_idx
  on public.account_deletion_requests (restore_until, requested_at, id)
  where status = 'pending';

insert into public.notification_catalog (
  type_key, schema_version, category, severity, sensitivity,
  supported_channels, default_cadence, audience_contract,
  action_route_contract, dedupe_policy, retention_class, template_key,
  lifecycle, mandatory_in_app
)
values (
  'security.account_invitation_cancelled', 1, 'security', 'warning', 'confidential',
  array['in_app'], 'immediate', 'workspace_employee_access_managers',
  '{"route":"/app/employees","allowed_query_keys":[]}',
  '{"strategy":"keep_first","scope":"event_recipient","key_fields":["event_id","recipient_user_id"]}',
  'sensitive_30d', 'security.account_invitation_cancelled.v1', 'active', true
)
on conflict (type_key, schema_version) do update
set lifecycle = 'active', mandatory_in_app = true;

create or replace function public.get_account_deletion_blockers_service(
  actor_user_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with blocker_rows as (
    select
      'active_membership'::text as kind,
      membership.workspace_id,
      workspace.name as workspace_name,
      role.name as role_name,
      (role.system_key = 'owner') as is_owner,
      null::uuid as transfer_id,
      null::text as transfer_direction
    from public.workspace_memberships membership
    join public.workspaces workspace on workspace.id = membership.workspace_id
    join public.workspace_roles role on role.id = membership.role_id
    where membership.user_id = actor_user_id
      and membership.status = 'active'
      and (
        workspace.lifecycle_status = 'active'
        or (
          workspace.lifecycle_status = 'closure_scheduled'
          and workspace.closure_effective_at > now()
        )
      )

    union all

    select
      'pending_ownership_transfer'::text,
      transfer.workspace_id,
      workspace.name,
      null::text,
      false,
      transfer.id,
      case
        when transfer.initiated_by = actor_user_id then 'outgoing'
        else 'incoming'
      end
    from public.workspace_ownership_transfers transfer
    join public.workspaces workspace on workspace.id = transfer.workspace_id
    where transfer.status = 'pending'
      and (
        transfer.initiated_by = actor_user_id
        or transfer.target_user_id = actor_user_id
      )
  )
  select coalesce(
    jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'kind', kind,
        'workspace_id', workspace_id,
        'workspace_name', workspace_name,
        'role_name', role_name,
        'is_owner', is_owner,
        'transfer_id', transfer_id,
        'transfer_direction', transfer_direction
      ))
      order by workspace_name, kind, transfer_id
    ),
    '[]'::jsonb
  )
  from blocker_rows;
$$;

-- Supabase Auth does not currently expose a public cancel-email-change API.
-- This private service mirrors GoTrue's token clearing contract and is pinned
-- by local integration tests. It is callable only with the service role.
create or replace function public.cancel_account_email_change_service(
  actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending_email text;
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  update auth.users auth_user
  set email_change = '',
      email_change_token_current = '',
      email_change_token_new = '',
      email_change_sent_at = null,
      email_change_confirm_status = 0,
      updated_at = now()
  where auth_user.id = actor_user_id
  returning nullif(auth_user.email_change, '') into pending_email;

  if not found then
    raise exception 'account not found' using errcode = 'P0002';
  end if;

  delete from auth.one_time_tokens token
  where token.user_id = actor_user_id
    and token.token_type in (
      'email_change_token_current'::auth.one_time_token_type,
      'email_change_token_new'::auth.one_time_token_type
    );

  perform app_private.record_security_audit_event_service(
    actor_user_id, null, 'account.email_change_cancelled', 'account.security',
    'auth_user', actor_user_id::text, '{}'::jsonb
  );

  return jsonb_build_object('status', 'cancelled');
end;
$$;

create or replace function public.request_account_deletion_v2_service(
  actor_user_id uuid,
  recovery_token_digest text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_email text;
  blockers jsonb;
  existing_request public.account_deletion_requests%rowtype;
  created_request public.account_deletion_requests%rowtype;
  cancelled_workspace_id uuid;
  manager_user_ids uuid[];
  notification_event_id uuid;
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;
  if recovery_token_digest is null
    or recovery_token_digest !~ '^[a-f0-9]{64}$' then
    raise exception 'valid recovery token digest required' using errcode = '22023';
  end if;

  select lower(btrim(auth_user.email)) into actor_email
  from auth.users auth_user
  where auth_user.id = actor_user_id;
  if actor_email is null then
    raise exception 'account not found' using errcode = 'P0002';
  end if;

  blockers := public.get_account_deletion_blockers_service(actor_user_id);
  if jsonb_array_length(blockers) > 0 then
    raise exception 'account deletion blocked: %', blockers::text
      using errcode = '23514';
  end if;

  select * into existing_request
  from public.account_deletion_requests request
  where request.user_id = actor_user_id
    and request.status = 'pending'
  order by request.requested_at desc
  limit 1
  for update;

  if existing_request.id is not null then
    update public.account_deletion_requests
    set recovery_token_digest = request_account_deletion_v2_service.recovery_token_digest,
        recovery_token_rotated_at = now(),
        updated_at = now()
    where id = existing_request.id
    returning * into existing_request;

    return jsonb_build_object(
      'status', existing_request.status,
      'request_id', existing_request.id,
      'email', actor_email,
      'restore_until', existing_request.restore_until
    );
  end if;

  for cancelled_workspace_id in
    with cancelled as (
      update public.employee_invitations invitation
      set status = 'revoked'::public.employee_invitation_status,
          revoked_at = now(),
          updated_at = now()
      where invitation.email = actor_email
        and invitation.status = 'pending'::public.employee_invitation_status
      returning invitation.workspace_id
    )
    select distinct workspace_id from cancelled
  loop
    select coalesce(array_agg(distinct membership.user_id), '{}'::uuid[])
    into manager_user_ids
    from public.workspace_memberships membership
    join public.workspace_role_permissions permission
      on permission.workspace_id = membership.workspace_id
     and permission.role_id = membership.role_id
     and permission.permission_key = 'employee_access.manage'
    where membership.workspace_id = cancelled_workspace_id
      and membership.status = 'active';

    if cardinality(manager_user_ids) > 0 then
      notification_event_id := gen_random_uuid();
      perform public.enqueue_notification_outbox_service(
        cancelled_workspace_id,
        notification_event_id,
        'security.account_invitation_cancelled',
        1,
        null,
        'account_deletion_request',
        actor_user_id::text,
        jsonb_build_object(
          'recipient_user_ids', to_jsonb(manager_user_ids),
          'title', 'Pending invitation cancelled',
          'body', 'A pending employee invitation was cancelled because the recipient requested account deletion.',
          'safe_preview', 'A pending employee invitation was cancelled.',
          'action_url', '/app/employees',
          'audience_contract', 'producer_recipient_snapshot'
        ),
        now()
      );
    end if;
  end loop;

  delete from public.user_workspace_preferences
  where user_id = actor_user_id;

  insert into public.account_deletion_requests (
    user_id, typed_email, acknowledged, recovery_token_digest,
    recovery_token_rotated_at
  ) values (
    actor_user_id, actor_email, true, recovery_token_digest, now()
  )
  returning * into created_request;

  perform app_private.record_security_audit_event_service(
    actor_user_id, null, 'account.deletion_requested', 'account.security',
    'account_deletion_request', created_request.id::text,
    jsonb_build_object('restore_until', created_request.restore_until)
  );

  return jsonb_build_object(
    'status', created_request.status,
    'request_id', created_request.id,
    'email', actor_email,
    'restore_until', created_request.restore_until
  );
end;
$$;

create or replace function public.rotate_account_deletion_recovery_token_service(
  target_request_id uuid,
  recovery_token_digest text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_request public.account_deletion_requests%rowtype;
  target_email text;
begin
  if recovery_token_digest is null
    or recovery_token_digest !~ '^[a-f0-9]{64}$' then
    raise exception 'valid recovery token digest required' using errcode = '22023';
  end if;

  select * into target_request
  from public.account_deletion_requests request
  where request.id = target_request_id
    and request.status = 'pending'
    and request.restore_until > now()
  for update;
  if target_request.id is null then
    raise exception 'restorable account deletion request not found' using errcode = 'P0002';
  end if;

  select lower(btrim(auth_user.email)) into target_email
  from auth.users auth_user
  where auth_user.id = target_request.user_id;
  if target_email is null then
    raise exception 'account not found' using errcode = 'P0002';
  end if;

  update public.account_deletion_requests
  set recovery_token_digest = rotate_account_deletion_recovery_token_service.recovery_token_digest,
      recovery_token_rotated_at = now(),
      updated_at = now()
  where id = target_request.id;

  return jsonb_build_object(
    'request_id', target_request.id,
    'user_id', target_request.user_id,
    'email', target_email,
    'restore_until', target_request.restore_until
  );
end;
$$;

create or replace function public.prepare_account_deletion_recovery_resend_service(
  account_email text,
  recovery_token_digest text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_request public.account_deletion_requests%rowtype;
  normalized_email text := lower(btrim(coalesce(account_email, '')));
begin
  if recovery_token_digest is null
    or recovery_token_digest !~ '^[a-f0-9]{64}$' then
    raise exception 'valid recovery token digest required' using errcode = '22023';
  end if;

  select request.* into target_request
  from public.account_deletion_requests request
  join auth.users auth_user on auth_user.id = request.user_id
  where request.status = 'pending'
    and request.restore_until > now()
    and lower(btrim(auth_user.email)) = normalized_email
  order by request.requested_at desc
  limit 1
  for update of request;

  if target_request.id is null then
    return null;
  end if;

  update public.account_deletion_requests
  set recovery_token_digest = prepare_account_deletion_recovery_resend_service.recovery_token_digest,
      recovery_token_rotated_at = now(),
      updated_at = now()
  where id = target_request.id;

  return jsonb_build_object(
    'request_id', target_request.id,
    'user_id', target_request.user_id,
    'email', normalized_email,
    'restore_until', target_request.restore_until
  );
end;
$$;

create or replace function public.mark_account_deletion_email_sent_service(
  target_request_id uuid,
  delivery_kind text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if delivery_kind not in ('initial', 'day_7', 'last_24h', 'resend') then
    raise exception 'valid account deletion delivery kind required' using errcode = '22023';
  end if;

  update public.account_deletion_requests
  set recovery_email_sent_at = case
        when delivery_kind in ('initial', 'resend') then now()
        else recovery_email_sent_at
      end,
      reminder_7d_sent_at = case
        when delivery_kind = 'day_7' then now()
        else reminder_7d_sent_at
      end,
      reminder_24h_sent_at = case
        when delivery_kind = 'last_24h' then now()
        else reminder_24h_sent_at
      end,
      updated_at = now()
  where id = target_request_id
    and status = 'pending';

  if not found then
    raise exception 'pending account deletion request not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.restore_account_deletion_by_token_service(
  recovery_token_digest text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  restored_request public.account_deletion_requests%rowtype;
begin
  if recovery_token_digest is null
    or recovery_token_digest !~ '^[a-f0-9]{64}$' then
    raise exception 'valid recovery token required' using errcode = '22023';
  end if;

  update public.account_deletion_requests
  set status = 'restored',
      restored_at = now(),
      recovery_token_digest = null,
      updated_at = now()
  where id = (
    select request.id
    from public.account_deletion_requests request
    where request.recovery_token_digest = restore_account_deletion_by_token_service.recovery_token_digest
      and request.status = 'pending'
      and request.restore_until > now()
    order by request.requested_at desc
    limit 1
    for update
  )
  returning * into restored_request;

  if restored_request.id is null then
    raise exception 'valid recovery token required' using errcode = 'P0002';
  end if;

  perform app_private.record_security_audit_event_service(
    restored_request.user_id, null, 'account.deletion_restored', 'account.security',
    'account_deletion_request', restored_request.id::text, '{}'::jsonb
  );

  return jsonb_build_object(
    'status', restored_request.status,
    'request_id', restored_request.id,
    'user_id', restored_request.user_id,
    'restored_at', restored_request.restored_at
  );
end;
$$;

create or replace function public.list_account_deletion_work_service(
  target_now timestamptz,
  target_batch_size integer default 20
)
returns table (
  request_id uuid,
  user_id uuid,
  email text,
  restore_until timestamptz,
  action text
)
language sql
security definer
set search_path = ''
as $$
  select
    request.id,
    request.user_id,
    lower(btrim(auth_user.email)),
    request.restore_until,
    case
      when request.restore_until <= target_now then 'finalize'
      when request.restore_until <= target_now + interval '24 hours'
        and request.reminder_24h_sent_at is null then 'last_24h'
      when request.requested_at <= target_now - interval '7 days'
        and request.reminder_7d_sent_at is null then 'day_7'
      else null
    end
  from public.account_deletion_requests request
  join auth.users auth_user on auth_user.id = request.user_id
  where request.status = 'pending'
    and (
      request.restore_until <= target_now
      or (
        request.restore_until <= target_now + interval '24 hours'
        and request.reminder_24h_sent_at is null
      )
      or (
        request.requested_at <= target_now - interval '7 days'
        and request.reminder_7d_sent_at is null
      )
    )
  order by request.restore_until, request.requested_at, request.id
  limit greatest(1, least(coalesce(target_batch_size, 20), 100));
$$;

create or replace function public.finalize_account_deletion_service(
  target_request_id uuid,
  target_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_request public.account_deletion_requests%rowtype;
begin
  select * into target_request
  from public.account_deletion_requests request
  where request.id = target_request_id
    and request.status = 'pending'
  for update;
  if target_request.id is null then
    return jsonb_build_object('status', 'completed', 'idempotent', true);
  end if;
  if target_request.restore_until > target_now then
    raise exception 'account deletion restore window remains open' using errcode = '23514';
  end if;

  update public.account_deletion_requests
  set finalization_started_at = coalesce(finalization_started_at, now()),
      updated_at = now()
  where id = target_request.id;

  delete from public.user_workspace_preferences where user_id = target_request.user_id;
  delete from public.user_preferences where user_id = target_request.user_id;
  delete from public.user_profiles where user_id = target_request.user_id;

  update public.account_deletion_requests
  set status = 'completed',
      typed_email = '<deleted>',
      recovery_token_digest = null,
      completed_at = now(),
      anonymized_at = now(),
      updated_at = now()
  where id = target_request.id;

  perform app_private.record_security_audit_event_service(
    target_request.user_id, null, 'account.deletion_finalized', 'account.security',
    'account_deletion_request', target_request.id::text, '{}'::jsonb
  );

  return jsonb_build_object('status', 'completed', 'idempotent', false);
end;
$$;

revoke all on function public.get_account_deletion_blockers_service(uuid)
from public, anon, authenticated;
revoke all on function public.cancel_account_email_change_service(uuid)
from public, anon, authenticated;
revoke all on function public.request_account_deletion_v2_service(uuid, text)
from public, anon, authenticated;
revoke all on function public.rotate_account_deletion_recovery_token_service(uuid, text)
from public, anon, authenticated;
revoke all on function public.prepare_account_deletion_recovery_resend_service(text, text)
from public, anon, authenticated;
revoke all on function public.mark_account_deletion_email_sent_service(uuid, text)
from public, anon, authenticated;
revoke all on function public.restore_account_deletion_by_token_service(text)
from public, anon, authenticated;
revoke all on function public.list_account_deletion_work_service(timestamptz, integer)
from public, anon, authenticated;
revoke all on function public.finalize_account_deletion_service(uuid, timestamptz)
from public, anon, authenticated;

grant execute on function public.get_account_deletion_blockers_service(uuid)
to service_role;
grant execute on function public.cancel_account_email_change_service(uuid)
to service_role;
grant execute on function public.request_account_deletion_v2_service(uuid, text)
to service_role;
grant execute on function public.rotate_account_deletion_recovery_token_service(uuid, text)
to service_role;
grant execute on function public.prepare_account_deletion_recovery_resend_service(text, text)
to service_role;
grant execute on function public.mark_account_deletion_email_sent_service(uuid, text)
to service_role;
grant execute on function public.restore_account_deletion_by_token_service(text)
to service_role;
grant execute on function public.list_account_deletion_work_service(timestamptz, integer)
to service_role;
grant execute on function public.finalize_account_deletion_service(uuid, timestamptz)
to service_role;

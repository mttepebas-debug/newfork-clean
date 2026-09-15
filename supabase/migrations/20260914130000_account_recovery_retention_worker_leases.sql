-- BL-055 recovery retention and atomically leased deletion work.
create or replace function public.request_account_deletion_service(
  actor_user_id uuid,
  typed_email text,
  acknowledged boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_email text;
  existing_request public.account_deletion_requests%rowtype;
  created_request public.account_deletion_requests%rowtype;
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;
  if not acknowledged then
    raise exception 'account deletion acknowledgement required' using errcode = '23514';
  end if;

  select lower(btrim(email)) into actor_email
  from auth.users
  where id = actor_user_id;
  if actor_email is null then
    raise exception 'account not found' using errcode = '02000';
  end if;
  if lower(btrim(coalesce(typed_email, ''))) <> actor_email then
    raise exception 'account email confirmation is required' using errcode = '23514';
  end if;
  if app_private.user_has_pending_ownership_transfer(actor_user_id) then
    raise exception 'pending ownership transfer must be resolved before account deletion' using errcode = '23514';
  end if;
  if app_private.user_has_active_organization_access(actor_user_id) then
    raise exception 'account has active organization access' using errcode = '23514';
  end if;

  select * into existing_request
  from public.account_deletion_requests request
  where request.user_id = actor_user_id
    and request.status = 'pending'
  order by request.requested_at desc
  limit 1;

  if existing_request.id is not null then
    return jsonb_build_object(
      'status', existing_request.status,
      'request_id', existing_request.id,
      'restore_until', existing_request.restore_until
    );
  end if;

insert into public.account_deletion_requests (
    user_id,
    typed_email,
    acknowledged
  )
  values (
    actor_user_id,
    btrim(typed_email),
    acknowledged
  )
  returning * into created_request;

  return jsonb_build_object(
    'status', created_request.status,
    'request_id', created_request.id,
    'restore_until', created_request.restore_until
  );
end;
$$;
alter table public.account_deletion_requests
  add column if not exists work_lease_id uuid,
  add column if not exists work_lease_until timestamptz;

create table if not exists public.account_deletion_deliveries (
  request_id uuid not null references public.account_deletion_requests(id) on delete cascade,
  delivery_kind text not null check (delivery_kind in ('day_7','last_24h')),
  token_digest text not null check (token_digest ~ '^[a-f0-9]{64}$'),
  primary key (request_id, delivery_kind)
);
alter table public.account_deletion_deliveries enable row level security;
revoke all on public.account_deletion_deliveries from public, anon, authenticated;
grant all on public.account_deletion_deliveries to service_role;

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
    where (request.recovery_token_digest = restore_account_deletion_by_token_service.recovery_token_digest
      or exists (select 1 from public.account_deletion_deliveries delivery
        where delivery.request_id = request.id
          and delivery.token_digest = restore_account_deletion_by_token_service.recovery_token_digest))
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

  delete from public.account_deletion_deliveries where request_id = target_request.id;
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

create or replace function public.claim_account_deletion_work_service(target_batch_size integer default 20)
returns table(request_id uuid, user_id uuid, email text, restore_until timestamptz, action text, lease_id uuid)
language sql security definer set search_path = ''
as $$
  with candidates as (
    select request.id,
      case when request.restore_until <= now() then 'finalize'
        when request.restore_until <= now() + interval '24 hours' and request.reminder_24h_sent_at is null then 'last_24h'
        else 'day_7' end as action
    from public.account_deletion_requests request
    where request.status = 'pending'
      and (request.work_lease_until is null or request.work_lease_until <= now())
      and (request.restore_until <= now()
        or (request.restore_until <= now() + interval '24 hours' and request.reminder_24h_sent_at is null)
        or (request.restore_until > now() + interval '24 hours'
          and request.requested_at <= now() - interval '7 days' and request.reminder_7d_sent_at is null))
    order by request.restore_until, request.id
    limit greatest(1, least(coalesce(target_batch_size, 20), 100))
    for update skip locked
  ), claimed as (
    update public.account_deletion_requests request
    set work_lease_id = gen_random_uuid(), work_lease_until = now() + interval '10 minutes'
    from candidates where request.id = candidates.id
    returning request.*, candidates.action
  )
  select claimed.id, claimed.user_id, lower(btrim(auth_user.email)), claimed.restore_until,
    claimed.action, claimed.work_lease_id
  from claimed join auth.users auth_user on auth_user.id = claimed.user_id;
$$;

create or replace function public.prepare_account_deletion_delivery_service(
  target_request_id uuid, target_lease_id uuid, delivery_kind text, recovery_token_digest text
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare request public.account_deletion_requests%rowtype;
begin
  select * into request from public.account_deletion_requests
  where id = target_request_id and status = 'pending'
    and work_lease_id = target_lease_id and work_lease_until > now()
    and restore_until > now() for update;
  if request.id is null then raise exception 'account deletion lease unavailable'; end if;
  insert into public.account_deletion_deliveries(request_id, delivery_kind, token_digest)
  values (request.id, delivery_kind, recovery_token_digest)
  on conflict on constraint account_deletion_deliveries_pkey do nothing;
  if not exists (select 1 from public.account_deletion_deliveries d
    where d.request_id = request.id and d.delivery_kind = prepare_account_deletion_delivery_service.delivery_kind
      and d.token_digest = recovery_token_digest) then
    raise exception 'account deletion delivery token changed';
  end if;
  return jsonb_build_object('email', request.typed_email, 'restore_until', request.restore_until);
end;
$$;

create or replace function public.complete_account_deletion_work_service(
  target_request_id uuid, target_lease_id uuid, delivery_kind text
) returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.account_deletion_requests where id = target_request_id
    and work_lease_id = target_lease_id and work_lease_until > now() for update;
  if not found then raise exception 'account deletion lease unavailable'; end if;
  if delivery_kind != 'finalize' then
    perform public.mark_account_deletion_email_sent_service(target_request_id, delivery_kind);
  end if;
  update public.account_deletion_requests set work_lease_id = null, work_lease_until = null
  where id = target_request_id and work_lease_id = target_lease_id;
end;
$$;

revoke all on function public.claim_account_deletion_work_service(integer) from public, anon, authenticated;
revoke all on function public.prepare_account_deletion_delivery_service(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.complete_account_deletion_work_service(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.claim_account_deletion_work_service(integer) to service_role;
grant execute on function public.prepare_account_deletion_delivery_service(uuid,uuid,text,text) to service_role;
grant execute on function public.complete_account_deletion_work_service(uuid,uuid,text) to service_role;
create or replace function public.renew_account_deletion_work_service(target_request_id uuid, target_lease_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  update public.account_deletion_requests set work_lease_until = now() + interval '10 minutes'
  where id = target_request_id and status = 'pending' and work_lease_id = target_lease_id and work_lease_until > now();
  if not found then raise exception 'account deletion lease unavailable'; end if;
end;
$$;
create or replace function public.finalize_claimed_account_deletion_service(target_request_id uuid, target_lease_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  perform public.renew_account_deletion_work_service(target_request_id, target_lease_id);
  return public.finalize_account_deletion_service(target_request_id, now());
end;
$$;
revoke all on function public.renew_account_deletion_work_service(uuid,uuid) from public, anon, authenticated;
revoke all on function public.finalize_claimed_account_deletion_service(uuid,uuid) from public, anon, authenticated;
grant execute on function public.renew_account_deletion_work_service(uuid,uuid) to service_role;
grant execute on function public.finalize_claimed_account_deletion_service(uuid,uuid) to service_role;

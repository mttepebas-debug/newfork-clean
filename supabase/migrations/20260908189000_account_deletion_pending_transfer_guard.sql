create or replace function app_private.user_has_pending_ownership_transfer(
  actor_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_ownership_transfers transfer
    where transfer.status = 'pending'
      and (
        transfer.initiated_by = actor_user_id
        or transfer.target_user_id = actor_user_id
      )
  );
$$;

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

  delete from public.user_workspace_preferences
  where user_id = actor_user_id;

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

revoke all on function app_private.user_has_pending_ownership_transfer(uuid)
from public, anon, authenticated;

revoke all on function public.request_account_deletion_service(uuid, text, boolean)
from public, anon, authenticated;

grant execute on function public.request_account_deletion_service(uuid, text, boolean)
to service_role;

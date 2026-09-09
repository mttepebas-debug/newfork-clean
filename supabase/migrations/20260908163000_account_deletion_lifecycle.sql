create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'restored', 'completed')),
  typed_email text not null,
  acknowledged boolean not null default false,
  requested_at timestamptz not null default now(),
  restore_until timestamptz not null default (now() + interval '14 days'),
  restored_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'pending' and restored_at is null and completed_at is null)
    or (status = 'restored' and restored_at is not null and completed_at is null)
    or (status = 'completed' and completed_at is not null)
  )
);

create unique index if not exists account_deletion_requests_one_pending
on public.account_deletion_requests(user_id)
where status = 'pending';

alter table public.account_deletion_requests enable row level security;

drop policy if exists "account_deletion_requests_no_direct_access"
on public.account_deletion_requests;

create policy "account_deletion_requests_no_direct_access"
on public.account_deletion_requests
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create or replace function app_private.user_has_active_organization_access(
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
    from public.workspace_memberships membership
    join public.workspaces workspace on workspace.id = membership.workspace_id
    where membership.user_id = actor_user_id
      and membership.status = 'active'
      and (
        workspace.lifecycle_status = 'active'
        or (
          workspace.lifecycle_status = 'closure_scheduled'
          and workspace.closure_effective_at > now()
        )
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

create or replace function public.restore_account_deletion_request_service(
  actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  restored_request public.account_deletion_requests%rowtype;
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  update public.account_deletion_requests
  set status = 'restored',
      restored_at = now(),
      updated_at = now()
  where id = (
    select request.id
    from public.account_deletion_requests request
    where request.user_id = actor_user_id
      and request.status = 'pending'
      and request.restore_until > now()
    order by request.requested_at desc
    limit 1
  )
  returning * into restored_request;

  if restored_request.id is null then
    raise exception 'restorable account deletion request not found' using errcode = '02000';
  end if;

  return jsonb_build_object(
    'status', restored_request.status,
    'request_id', restored_request.id,
    'restored_at', restored_request.restored_at
  );
end;
$$;

revoke all on table public.account_deletion_requests
from public, anon, authenticated;

revoke all on function app_private.user_has_active_organization_access(uuid)
from public, anon, authenticated;

revoke all on function public.request_account_deletion_service(uuid, text, boolean)
from public, anon, authenticated;

revoke all on function public.restore_account_deletion_request_service(uuid)
from public, anon, authenticated;

grant execute on function public.request_account_deletion_service(uuid, text, boolean)
to service_role;

grant execute on function public.restore_account_deletion_request_service(uuid)
to service_role;

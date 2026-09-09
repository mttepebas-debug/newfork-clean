-- Recoverable delivery state is private to service-role RPCs. Client-facing
-- invitation rows continue to expose only the one-way token hash.
create table public.employee_invitation_delivery_secrets (
  invitation_id uuid primary key,
  workspace_id uuid not null,
  token text not null check (char_length(token) between 32 and 256),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (invitation_id, workspace_id)
    references public.employee_invitations(id, workspace_id) on delete cascade
);

alter table public.employee_invitation_delivery_secrets enable row level security;
revoke all on public.employee_invitation_delivery_secrets
from public, anon, authenticated, service_role;

-- Preserve retry support for invitations prepared by the idempotent create
-- command before this migration was applied.
insert into public.employee_invitation_delivery_secrets (
  invitation_id,
  workspace_id,
  token
)
select
  command.invitation_id,
  command.workspace_id,
  command.invitation_token
from public.employee_create_commands command
join public.employee_invitations invitation
  on invitation.id = command.invitation_id
  and invitation.workspace_id = command.workspace_id
where command.invitation_id is not null
  and command.invitation_token is not null
  and invitation.status = 'pending'
  and invitation.expires_at > now()
on conflict (invitation_id) do nothing;

create function public.store_employee_invitation_delivery_secret_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_invitation_id uuid,
  invitation_token text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_row public.employee_invitations%rowtype;
begin
  if not public.service_actor_has_permission(
    actor_user_id,
    target_workspace_id,
    'employee_access.manage'
  ) then
    raise exception 'employee access management required' using errcode = '42501';
  end if;
  if invitation_token is null
    or char_length(invitation_token) not between 32 and 256 then
    raise exception 'valid invitation token required' using errcode = '22023';
  end if;

  select * into invitation_row
  from public.employee_invitations
  where id = target_invitation_id
    and workspace_id = target_workspace_id
    and status = 'pending'
    and expires_at > now()
  for update;
  if invitation_row.id is null then
    raise exception 'active invitation not found' using errcode = 'P0002';
  end if;
  if invitation_row.token_hash <>
    encode(extensions.digest(invitation_token, 'sha256'), 'hex') then
    raise exception 'invitation token does not match' using errcode = '22023';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  if not public.can_manage_employee_record(
    target_workspace_id,
    invitation_row.employee_id
  ) then
    raise exception 'employee access denied' using errcode = '42501';
  end if;

  insert into public.employee_invitation_delivery_secrets (
    invitation_id,
    workspace_id,
    token
  ) values (
    invitation_row.id,
    invitation_row.workspace_id,
    invitation_token
  )
  on conflict (invitation_id) do update
  set token = excluded.token,
      updated_at = now();
end;
$$;

create function public.load_employee_invitation_retry_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_row public.employee_invitations%rowtype;
  recovered_token text;
begin
  if not public.service_actor_has_permission(
    actor_user_id,
    target_workspace_id,
    'employee_access.manage'
  ) then
    raise exception 'employee access management required' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  if not public.can_manage_employee_record(
    target_workspace_id,
    target_employee_id
  ) then
    raise exception 'employee access denied' using errcode = '42501';
  end if;

  select * into invitation_row
  from public.employee_invitations
  where workspace_id = target_workspace_id
    and employee_id = target_employee_id
    and status = 'pending'
    and delivery_status = 'failed'
  order by created_at desc
  limit 1
  for update;
  if invitation_row.id is null then
    raise exception 'failed invitation not found' using errcode = 'P0002';
  end if;
  if invitation_row.expires_at <= now() then
    raise exception 'invitation expired; use Resend' using errcode = '22023';
  end if;

  select token into recovered_token
  from public.employee_invitation_delivery_secrets
  where invitation_id = invitation_row.id
    and workspace_id = invitation_row.workspace_id;
  if recovered_token is null then
    raise exception 'original invitation link is unavailable; use Resend'
      using errcode = 'P0002';
  end if;
  if invitation_row.token_hash <>
    encode(extensions.digest(recovered_token, 'sha256'), 'hex') then
    raise exception 'stored invitation token does not match'
      using errcode = '22023';
  end if;

  update public.employee_invitations
  set resend_count = resend_count + 1,
      updated_at = now()
  where id = invitation_row.id;

  insert into public.employee_events (
    workspace_id,
    employee_id,
    actor_user_id,
    action,
    summary
  ) values (
    target_workspace_id,
    target_employee_id,
    actor_user_id,
    'employee.invitation_delivery_retry_started',
    'Employee invitation delivery retry started'
  );

  return jsonb_build_object(
    'id', invitation_row.id,
    'email', invitation_row.email,
    'token', recovered_token,
    'expires_at', invitation_row.expires_at
  );
end;
$$;

create function public.delete_employee_invitation_delivery_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'pending' and new.status <> 'pending' then
    delete from public.employee_invitation_delivery_secrets
    where invitation_id = new.id;
  end if;
  return new;
end;
$$;

create trigger employee_invitation_delivery_secret_cleanup
after update of status on public.employee_invitations
for each row
when (old.status = 'pending' and new.status <> 'pending')
execute function public.delete_employee_invitation_delivery_secret();

revoke all on function public.store_employee_invitation_delivery_secret_service(
  uuid, uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.load_employee_invitation_retry_service(
  uuid, uuid, uuid
) from public, anon, authenticated;
revoke all on function public.delete_employee_invitation_delivery_secret()
from public, anon, authenticated;

grant execute on function public.store_employee_invitation_delivery_secret_service(
  uuid, uuid, uuid, text
) to service_role;
grant execute on function public.load_employee_invitation_retry_service(
  uuid, uuid, uuid
) to service_role;

notify pgrst, 'reload schema';

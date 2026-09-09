create table if not exists public.owner_onboarding_invitation_intents (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  employee_id uuid not null,
  email text not null check (
    email = lower(btrim(email))
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  dispatched_at timestamptz,
  dispatch_error text check (
    dispatch_error is null or char_length(dispatch_error) <= 500
  ),
  primary key (workspace_id, employee_id),
  foreign key (employee_id, workspace_id)
    references public.employee_profiles(id, workspace_id) on delete cascade
);

alter table public.owner_onboarding_invitation_intents enable row level security;

create policy owner_onboarding_invitation_intents_no_direct_access
  on public.owner_onboarding_invitation_intents
  for all to authenticated
  using (false)
  with check (false);

revoke all on public.owner_onboarding_invitation_intents from public, anon, authenticated;

create or replace function public.queue_owner_onboarding_invitation_intent_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid,
  employee_email text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.workspace_role;
  onboarding_status public.onboarding_status;
  normalized_email text := lower(btrim(employee_email));
begin
  select membership.role
  into actor_role
  from public.workspace_memberships membership
  where membership.workspace_id = target_workspace_id
    and membership.user_id = actor_user_id
    and membership.status = 'active';

  if actor_role <> 'owner' then
    raise exception 'owner access required' using errcode = '42501';
  end if;

  select onboarding.status
  into onboarding_status
  from public.workspace_onboarding onboarding
  where onboarding.workspace_id = target_workspace_id;

  if onboarding_status is null then
    raise exception 'workspace onboarding was not found' using errcode = 'P0002';
  end if;
  if onboarding_status = 'complete'::public.onboarding_status then
    raise exception 'completed owner onboarding cannot queue invitations' using errcode = '22023';
  end if;
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'valid invitation email required' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.employee_profiles employee
    where employee.workspace_id = target_workspace_id
      and employee.id = target_employee_id
      and employee.archived_at is null
      and employee.user_id is null
  ) then
    raise exception 'invitable employee not found' using errcode = 'P0002';
  end if;

  insert into public.owner_onboarding_invitation_intents (
    workspace_id,
    employee_id,
    email,
    created_by,
    updated_at,
    dispatched_at,
    dispatch_error
  ) values (
    target_workspace_id,
    target_employee_id,
    normalized_email,
    actor_user_id,
    now(),
    null,
    null
  )
  on conflict (workspace_id, employee_id)
  do update set
    email = excluded.email,
    updated_at = now(),
    dispatched_at = null,
    dispatch_error = null;
end;
$$;

create or replace function public.list_owner_onboarding_invitation_intents_service(
  actor_user_id uuid,
  target_workspace_id uuid
)
returns table(employee_id uuid, email text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.workspace_role;
  onboarding_status public.onboarding_status;
begin
  select membership.role
  into actor_role
  from public.workspace_memberships membership
  where membership.workspace_id = target_workspace_id
    and membership.user_id = actor_user_id
    and membership.status = 'active';

  if actor_role <> 'owner' then
    raise exception 'owner access required' using errcode = '42501';
  end if;

  select onboarding.status
  into onboarding_status
  from public.workspace_onboarding onboarding
  where onboarding.workspace_id = target_workspace_id;

  if onboarding_status is null then
    raise exception 'workspace onboarding was not found' using errcode = 'P0002';
  end if;
  if onboarding_status <> 'complete'::public.onboarding_status then
    raise exception 'owner onboarding must be complete' using errcode = '22023';
  end if;

  return query
  select intent.employee_id, intent.email
  from public.owner_onboarding_invitation_intents intent
  join public.employee_profiles employee
    on employee.workspace_id = intent.workspace_id
   and employee.id = intent.employee_id
  where intent.workspace_id = target_workspace_id
    and intent.dispatched_at is null
    and employee.archived_at is null
    and employee.user_id is null
    and not exists (
      select 1
      from public.employee_invitations invitation
      where invitation.workspace_id = intent.workspace_id
        and invitation.employee_id = intent.employee_id
        and invitation.status in ('pending', 'accepted')
    )
  order by intent.created_at, intent.employee_id;
end;
$$;

create or replace function public.mark_owner_onboarding_invitation_intent_dispatched_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid,
  dispatch_failure_message text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.workspace_role;
begin
  select membership.role
  into actor_role
  from public.workspace_memberships membership
  where membership.workspace_id = target_workspace_id
    and membership.user_id = actor_user_id
    and membership.status = 'active';

  if actor_role <> 'owner' then
    raise exception 'owner access required' using errcode = '42501';
  end if;

  update public.owner_onboarding_invitation_intents
  set dispatched_at = now(),
      dispatch_error = nullif(left(coalesce(dispatch_failure_message, ''), 500), ''),
      updated_at = now()
  where workspace_id = target_workspace_id
    and employee_id = target_employee_id;

  if not found then
    raise exception 'owner onboarding invitation intent not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.queue_owner_onboarding_invitation_intent_service(uuid, uuid, uuid, text)
from public, anon, authenticated;
revoke all on function public.list_owner_onboarding_invitation_intents_service(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.mark_owner_onboarding_invitation_intent_dispatched_service(uuid, uuid, uuid, text)
from public, anon, authenticated;

grant execute on function public.queue_owner_onboarding_invitation_intent_service(uuid, uuid, uuid, text)
to service_role;
grant execute on function public.list_owner_onboarding_invitation_intents_service(uuid, uuid)
to service_role;
grant execute on function public.mark_owner_onboarding_invitation_intent_dispatched_service(uuid, uuid, uuid, text)
to service_role;

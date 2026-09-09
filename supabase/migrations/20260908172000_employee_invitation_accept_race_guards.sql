create or replace function public.accept_employee_invitation_service(
  target_user_id uuid,
  invitation_token_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.employee_invitations%rowtype;
  employee_role public.workspace_roles%rowtype;
  normalized_user_email text;
  membership_id uuid;
begin
  select * into invitation
  from public.employee_invitations
  where token_hash = invitation_token_hash and status = 'pending'
  for update;
  if invitation.id is null or invitation.expires_at <= now() then
    if invitation.id is not null then
      update public.employee_invitations
      set status = 'expired', updated_at = now()
      where id = invitation.id;
    end if;
    raise exception 'active invitation not found' using errcode = 'P0002';
  end if;

  select lower(email) into normalized_user_email
  from auth.users
  where id = target_user_id;
  if normalized_user_email is null or normalized_user_email <> invitation.email then
    raise exception 'invitation email does not match authenticated account' using errcode = '42501';
  end if;

  select * into employee_role
  from public.workspace_roles
  where id = invitation.role_id and workspace_id = invitation.workspace_id;
  if employee_role.id is null then
    raise exception 'invitation role is unavailable' using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.workspace_memberships
    where workspace_id = invitation.workspace_id
      and user_id = target_user_id
  ) then
    raise exception 'workspace membership already exists' using errcode = '23505';
  end if;

  update public.employee_profiles
  set user_id = target_user_id,
      revision = revision + 1,
      updated_at = now()
  where id = invitation.employee_id
    and workspace_id = invitation.workspace_id
    and user_id is null
    and archived_at is null;
  if not found then
    raise exception 'invitable employee is unavailable' using errcode = 'P0002';
  end if;

  insert into public.workspace_memberships (
    workspace_id, user_id, role, role_id, status, all_locations
  ) values (
    invitation.workspace_id,
    target_user_id,
    employee_role.access_class,
    invitation.role_id,
    'pending_activation',
    invitation.all_locations
  )
  returning id into membership_id;

  insert into public.membership_location_scopes (
    membership_id, workspace_id, location_id
  )
  select membership_id, invitation.workspace_id, selected.location_id
  from unnest(invitation.location_ids) selected(location_id)
  join public.locations location
    on location.id = selected.location_id
   and location.workspace_id = invitation.workspace_id
   and location.archived_at is null;

  update public.employee_invitations
  set status = 'accepted', accepted_at = now(), updated_at = now()
  where id = invitation.id;

  insert into public.employee_events (
    workspace_id, employee_id, actor_user_id, action, summary
  )
  values (
    invitation.workspace_id,
    invitation.employee_id,
    target_user_id,
    'employee.invitation_accepted',
    'Employee invitation accepted; activation pending'
  );

  perform public.initialize_employee_onboarding_service(
    target_user_id,
    invitation.workspace_id
  );
  return invitation.workspace_id;
end;
$$;

revoke all on function public.accept_employee_invitation_service(uuid, text)
from public, anon, authenticated;

grant execute on function public.accept_employee_invitation_service(uuid, text)
to service_role;

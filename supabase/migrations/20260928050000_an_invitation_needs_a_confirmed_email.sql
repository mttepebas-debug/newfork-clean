-- SEC-003 (user, 2026-09-28).
--
-- BL-269: account deletion goes one way, with the password
-- (request_account_deletion_v2_service, restore_account_deletion_by_token_service).
-- The old way asked only for the typed email; it goes, with nothing calling it
-- here. (The API stops calling it in the same branch.)
drop function public.request_account_deletion_service(uuid, text, boolean);
drop function public.restore_account_deletion_request_service(uuid);

-- BL-274 (S2 (a)): an invitation is accepted only by an account whose email
-- address is confirmed, as an ownership transfer already asks. Both ways of
-- accepting (the emailed link, accept_employee_invitation_service, and
-- Account > Workspaces, accept_employee_invitation_by_id_service) come here.
-- Somebody who signs up with another person's address without reaching their
-- inbox is not yet an active account: 42501 authz.not_active.
CREATE OR REPLACE FUNCTION app_private.accept_employee_invitation_for_user(target_user_id uuid, target_invitation_id uuid, invitation_token_hash text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  invitation public.employee_invitations%rowtype;
  employee_role public.workspace_roles%rowtype;
  normalized_user_email text;
  email_confirmed boolean;
  membership public.workspace_memberships%rowtype;
  accepted_membership_id uuid;
begin
  if target_invitation_id is null and invitation_token_hash is null then
    raise exception 'active invitation not found' using errcode = 'P0002';
  end if;

  select *
  into invitation
  from public.employee_invitations
  where status = 'pending'
    and (
      (target_invitation_id is not null and id = target_invitation_id)
      or (invitation_token_hash is not null and token_hash = invitation_token_hash)
    )
  for update;

  if invitation.id is null or invitation.expires_at <= now() then
    if invitation.id is not null then
      update public.employee_invitations
      set status = 'expired'::public.employee_invitation_status,
          updated_at = now()
      where id = invitation.id;
    end if;
    raise exception 'active invitation not found' using errcode = 'P0002';
  end if;

  select lower(email), email_confirmed_at is not null
  into normalized_user_email, email_confirmed
  from auth.users
  where id = target_user_id;

  if normalized_user_email is null or normalized_user_email <> invitation.email then
    raise exception 'invitation email does not match authenticated account' using errcode = '42501';
  end if;
  if not email_confirmed then
    raise exception 'the account email address is not confirmed' using errcode = '42501', hint = 'authz.not_active';
  end if;

  select *
  into employee_role
  from public.workspace_roles
  where id = invitation.role_id
    and workspace_id = invitation.workspace_id;

  if employee_role.id is null then
    raise exception 'invitation role is unavailable' using errcode = '22023';
  end if;

  select *
  into membership
  from public.workspace_memberships
  where workspace_id = invitation.workspace_id
    and user_id = target_user_id
  for update;

  if membership.id is not null
    and membership.status <> 'suspended'::public.membership_status then
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

  perform set_config('app.employee_invitation_accept', 'on', true);

  if membership.id is not null then
    update public.workspace_memberships
    set role = employee_role.access_class::public.workspace_role,
        role_id = invitation.role_id,
        status = 'pending_activation'::public.membership_status,
        all_locations = invitation.all_locations,
        updated_at = now()
    where id = membership.id
    returning id into accepted_membership_id;
  else
    insert into public.workspace_memberships (
      workspace_id, user_id, role, role_id, status, all_locations
    ) values (
      invitation.workspace_id,
      target_user_id,
      employee_role.access_class::public.workspace_role,
      invitation.role_id,
      'pending_activation'::public.membership_status,
      invitation.all_locations
    )
    returning id into accepted_membership_id;
  end if;

  perform app_private.reset_employee_onboarding_for_rehire(
    invitation.workspace_id,
    invitation.employee_id,
    accepted_membership_id,
    target_user_id
  );

  update public.employee_invitations
  set status = 'accepted'::public.employee_invitation_status,
      accepted_at = now(),
      updated_at = now()
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

  perform public.initialize_employee_onboarding_service(target_user_id, invitation.workspace_id);
  return invitation.workspace_id;
end;
$function$

;

-- The same holds for seeing an invitation and saying no to it (O-2, user
-- 2026-09-28): an unconfirmed account does not see the invitations to its
-- address in Account > Workspaces, does not count them, and cannot decline
-- them, so the invitation stays open for whoever really holds the address.
CREATE OR REPLACE FUNCTION public.list_pending_employee_invitations_for_account_service(actor_user_id uuid)
 RETURNS TABLE(invitation_id uuid, workspace_id uuid, workspace_name text, email text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  normalized_email text;
  email_confirmed boolean;
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  select lower(user_row.email), user_row.email_confirmed_at is not null
  into normalized_email, email_confirmed
  from auth.users user_row
  where user_row.id = actor_user_id;

  if normalized_email is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;
  if not email_confirmed then
    return;
  end if;

  return query
  select
    invitation.id,
    invitation.workspace_id,
    workspace.name,
    invitation.email,
    invitation.expires_at
  from public.employee_invitations invitation
  join public.workspaces workspace on workspace.id = invitation.workspace_id
  where invitation.email = normalized_email
    and invitation.status = 'pending'
    and invitation.expires_at > now()
    and not exists (
      select 1
      from public.workspace_memberships membership
      where membership.workspace_id = invitation.workspace_id
        and membership.user_id = actor_user_id
    )
  order by invitation.expires_at asc, workspace.name asc;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.decline_employee_invitation_service(target_user_id uuid, target_invitation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  invitation public.employee_invitations%rowtype;
  normalized_user_email text;
  email_confirmed boolean;
begin
  select * into invitation from public.employee_invitations
  where id = target_invitation_id and status = 'pending'
  for update;
  if invitation.id is null or invitation.expires_at <= now() then
    if invitation.id is not null then
      update public.employee_invitations
      set status = 'expired', updated_at = now()
      where id = invitation.id;
    end if;
    raise exception 'active invitation not found' using errcode = 'P0002';
  end if;

  select lower(email), email_confirmed_at is not null into normalized_user_email, email_confirmed
  from auth.users where id = target_user_id;
  if normalized_user_email is null or normalized_user_email <> invitation.email then
    raise exception 'invitation email does not match authenticated account' using errcode = '42501';
  end if;
  if not email_confirmed then
    raise exception 'the account email address is not confirmed' using errcode = '42501', hint = 'authz.not_active';
  end if;

  update public.employee_invitations
  set status = 'declined', declined_at = now(), updated_at = now()
  where id = invitation.id;

  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
  values (invitation.workspace_id, invitation.employee_id, target_user_id, 'employee.invitation_declined', 'Employee invitation declined by invitee');
end;
$function$

;

CREATE OR REPLACE FUNCTION public.count_account_attention_service(actor_user_id uuid)
 RETURNS TABLE(documents integer, workspaces integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    (
      -- Everything still theirs to act on. The states left out are the ones
      -- where acting is not possible: finished, with a reviewer, or closed.
      select count(*)
      from public.employee_onboarding_requirements requirement
      join public.employee_profiles employee
        on employee.id = requirement.employee_id
      join public.workspaces workspace
        on workspace.id = requirement.workspace_id
      where employee.user_id = actor_user_id
        and employee.archived_at is null
        and requirement.lifecycle_retired_at is null
        and workspace.lifecycle_status <> 'deleted'
        and app_private.document_obligation_state(requirement, now()) not in (
          'completed', 'pending_review', 'exempt', 'removed', 'paused'
        )
    )::integer,
    (
      -- Somebody asked and is waiting: an invitation addressed to this account,
      -- or an ownership transfer sent to it.
      (
        select count(*)
        from public.employee_invitations invitation
        join auth.users account on account.id = actor_user_id
        where invitation.status = 'pending'
          and invitation.expires_at > now()
          and lower(invitation.email) = lower(account.email)
          and account.email_confirmed_at is not null
      )
      + (
        select count(*)
        from public.workspace_ownership_transfers transfer
        where transfer.status = 'pending'
          and transfer.expires_at > now()
          and transfer.target_user_id = actor_user_id
      )
    )::integer;
$function$

;

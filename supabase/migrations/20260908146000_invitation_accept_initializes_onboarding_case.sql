create or replace function public.initialize_employee_onboarding_service(
  target_user_id uuid,
  target_workspace_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  employee public.employee_profiles%rowtype;
  membership public.workspace_memberships%rowtype;
  onboarding_case_id uuid;
begin
  select profile.* into employee
  from public.employee_profiles profile
  join public.workspace_memberships candidate
    on candidate.workspace_id = profile.workspace_id and candidate.user_id = profile.user_id
  where profile.user_id = target_user_id
    and profile.archived_at is null
    and candidate.status in ('pending_activation', 'active')
    and (target_workspace_id is null or profile.workspace_id = target_workspace_id)
  order by candidate.created_at
  limit 1;
  if employee.id is null then
    raise exception 'employee onboarding is unavailable' using errcode = 'P0002';
  end if;
  select * into membership from public.workspace_memberships
  where workspace_id = employee.workspace_id and user_id = target_user_id
    and status in ('pending_activation', 'active')
  order by created_at limit 1;

  insert into public.employee_onboarding_cases (workspace_id, employee_id, membership_id)
  values (employee.workspace_id, employee.id, membership.id)
  on conflict (employee_id) do update set updated_at = public.employee_onboarding_cases.updated_at
  returning id into onboarding_case_id;

  insert into public.employee_onboarding_requirements (
    workspace_id, case_id, employee_id, kind, title, description,
    required, blocks_activation, requires_review, sort_order, source_snapshot
  ) values
    (employee.workspace_id, onboarding_case_id, employee.id, 'profile', 'Profile and privacy', 'Private contact, identity, and teammate visibility choices.', true, true, false, 10, '{}'::jsonb),
    (employee.workspace_id, onboarding_case_id, employee.id, 'availability', 'Availability', 'Confirmed recurring weekly availability.', false, false, false, 500, '{}'::jsonb)
  on conflict (case_id, kind, source_id) do nothing;

  insert into public.employee_onboarding_requirements (
    workspace_id, case_id, employee_id, kind, source_id, title, description,
    required, blocks_activation, requires_review, sort_order, source_snapshot
  )
  select employee.workspace_id, onboarding_case_id, employee.id, 'document', document.id,
    document.title, document.description, true,
    true, document.requires_review,
    100 + document.sort_order,
    jsonb_build_object(
      'document_type_id', document.id,
      'accepted_formats', document.accepted_formats,
      'tracks_expiry', document.tracks_expiry,
      'requires_review', document.requires_review
    )
  from public.document_types document
  where document.workspace_id = employee.workspace_id
    and document.required_at_onboarding and document.archived_at is null
  on conflict (case_id, kind, source_id) do nothing;

  insert into public.employee_onboarding_requirements (
    workspace_id, case_id, employee_id, kind, source_id, title, description,
    required, blocks_activation, requires_review, sort_order, source_snapshot
  )
  select employee.workspace_id, onboarding_case_id, employee.id, 'acknowledgement', version.id,
    version.title, version.summary, version.required_at_onboarding,
    version.blocks_activation, false, 300 + version.version_number,
    jsonb_build_object(
      'template_version_id', version.id,
      'content_text', version.content_text,
      'content_digest', version.content_digest,
      'intent_statement', version.intent_statement,
      'locale', version.locale,
      'effective_date', version.effective_date,
      'retention_policy_id', version.retention_policy_id
    )
  from public.signature_template_versions version
  join public.signature_templates template on template.id = version.template_id
  where version.workspace_id = employee.workspace_id
    and version.status = 'published'
    and version.execution_class = 'acknowledgement'
    and version.required_at_onboarding
    and template.archived_at is null
    and not exists (
      select 1 from public.signature_template_versions newer
      where newer.template_id = version.template_id and newer.status = 'published'
        and newer.version_number > version.version_number
    )
  on conflict (case_id, kind, source_id) do nothing;

  if not exists (select 1 from public.onboarding_events event where event.case_id = onboarding_case_id and event.action = 'onboarding.started') then
    insert into public.onboarding_events (
      workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id
    ) values (
      employee.workspace_id, employee.id, onboarding_case_id, target_user_id,
      'onboarding.started', 'onboarding_case', onboarding_case_id::text
    );
  end if;
  return onboarding_case_id;
end;
$$;

create or replace function public.initialize_employee_onboarding_service(target_user_id uuid)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.initialize_employee_onboarding_service(target_user_id, null::uuid);
$$;

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
  select * into invitation from public.employee_invitations
  where token_hash = invitation_token_hash and status = 'pending'
  for update;
  if invitation.id is null or invitation.expires_at <= now() then
    if invitation.id is not null then
      update public.employee_invitations set status = 'expired', updated_at = now() where id = invitation.id;
    end if;
    raise exception 'active invitation not found' using errcode = 'P0002';
  end if;
  select lower(email) into normalized_user_email from auth.users where id = target_user_id;
  if normalized_user_email is null or normalized_user_email <> invitation.email then
    raise exception 'invitation email does not match authenticated account' using errcode = '42501';
  end if;
  select * into employee_role
  from public.workspace_roles
  where id = invitation.role_id and workspace_id = invitation.workspace_id;
  if employee_role.id is null then raise exception 'invitation role is unavailable' using errcode = '22023'; end if;
  update public.employee_profiles
  set user_id = target_user_id, revision = revision + 1, updated_at = now()
  where id = invitation.employee_id and workspace_id = invitation.workspace_id and user_id is null and archived_at is null;
  if not found then raise exception 'invitable employee is unavailable' using errcode = 'P0002'; end if;
  insert into public.workspace_memberships (workspace_id, user_id, role, role_id, status, all_locations)
  values (invitation.workspace_id, target_user_id, employee_role.access_class, invitation.role_id, 'pending_activation', invitation.all_locations)
  returning id into membership_id;
  insert into public.membership_location_scopes (membership_id, workspace_id, location_id)
  select membership_id, invitation.workspace_id, selected.location_id
  from unnest(invitation.location_ids) selected(location_id)
  join public.locations location on location.id = selected.location_id
   and location.workspace_id = invitation.workspace_id and location.archived_at is null;
  update public.employee_invitations set status = 'accepted', accepted_at = now(), updated_at = now() where id = invitation.id;
  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
  values (invitation.workspace_id, invitation.employee_id, target_user_id, 'employee.invitation_accepted', 'Employee invitation accepted; activation pending');
  perform public.initialize_employee_onboarding_service(target_user_id, invitation.workspace_id);
  return invitation.workspace_id;
end;
$$;

create or replace function public.accept_employee_invitation_by_id_service(
  target_user_id uuid,
  target_invitation_id uuid
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
  select * into invitation from public.employee_invitations
  where id = target_invitation_id and status = 'pending'
  for update;
  if invitation.id is null or invitation.expires_at <= now() then
    if invitation.id is not null then
      update public.employee_invitations set status = 'expired', updated_at = now() where id = invitation.id;
    end if;
    raise exception 'active invitation not found' using errcode = 'P0002';
  end if;
  select lower(email) into normalized_user_email from auth.users where id = target_user_id;
  if normalized_user_email is null or normalized_user_email <> invitation.email then
    raise exception 'invitation email does not match authenticated account' using errcode = '42501';
  end if;
  select * into employee_role
  from public.workspace_roles
  where id = invitation.role_id and workspace_id = invitation.workspace_id;
  if employee_role.id is null then raise exception 'invitation role is unavailable' using errcode = '22023'; end if;
  if exists (
    select 1
    from public.workspace_memberships
    where workspace_id = invitation.workspace_id and user_id = target_user_id
  ) then
    raise exception 'workspace membership already exists' using errcode = '23505';
  end if;
  update public.employee_profiles
  set user_id = target_user_id, revision = revision + 1, updated_at = now()
  where id = invitation.employee_id and workspace_id = invitation.workspace_id and user_id is null and archived_at is null;
  if not found then raise exception 'invitable employee is unavailable' using errcode = 'P0002'; end if;
  insert into public.workspace_memberships (workspace_id, user_id, role, role_id, status, all_locations)
  values (invitation.workspace_id, target_user_id, employee_role.access_class, invitation.role_id, 'pending_activation', invitation.all_locations)
  returning id into membership_id;
  insert into public.membership_location_scopes (membership_id, workspace_id, location_id)
  select membership_id, invitation.workspace_id, selected.location_id
  from unnest(invitation.location_ids) selected(location_id)
  join public.locations location on location.id = selected.location_id
   and location.workspace_id = invitation.workspace_id and location.archived_at is null;
  update public.employee_invitations set status = 'accepted', accepted_at = now(), updated_at = now() where id = invitation.id;
  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
  values (invitation.workspace_id, invitation.employee_id, target_user_id, 'employee.invitation_accepted', 'Employee invitation accepted; activation pending');
  perform public.initialize_employee_onboarding_service(target_user_id, invitation.workspace_id);
  return invitation.workspace_id;
end;
$$;

revoke all on function public.initialize_employee_onboarding_service(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.initialize_employee_onboarding_service(uuid)
from public, anon, authenticated;
revoke all on function public.accept_employee_invitation_service(uuid, text)
from public, anon, authenticated;
revoke all on function public.accept_employee_invitation_by_id_service(uuid, uuid)
from public, anon, authenticated;

grant execute on function public.initialize_employee_onboarding_service(uuid, uuid)
to service_role;
grant execute on function public.initialize_employee_onboarding_service(uuid)
to service_role;
grant execute on function public.accept_employee_invitation_service(uuid, text)
to service_role;
grant execute on function public.accept_employee_invitation_by_id_service(uuid, uuid)
to service_role;

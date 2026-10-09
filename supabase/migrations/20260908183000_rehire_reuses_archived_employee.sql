create or replace function app_private.reset_employee_onboarding_for_rehire(
  target_workspace_id uuid,
  target_employee_id uuid,
  target_membership_id uuid,
  actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_case public.employee_onboarding_cases%rowtype;
begin
  select *
  into target_case
  from public.employee_onboarding_cases
  where workspace_id = target_workspace_id
    and employee_id = target_employee_id
  for update;

  if target_case.id is null then
    return;
  end if;

  delete from public.employee_acknowledgement_envelopes
  where case_id = target_case.id;

  delete from public.employee_availability_versions
  where case_id = target_case.id;

  delete from public.employee_documents
  where requirement_id in (
    select id
    from public.employee_onboarding_requirements
    where case_id = target_case.id
  );

  delete from public.employee_sensitive_identifiers
  where workspace_id = target_workspace_id
    and employee_id = target_employee_id;

  delete from public.employee_private_profiles
  where workspace_id = target_workspace_id
    and employee_id = target_employee_id;

  delete from public.employee_onboarding_requirements
  where case_id = target_case.id;

  update public.employee_onboarding_cases
  set membership_id = target_membership_id,
      status = 'in_progress'::public.employee_onboarding_case_status,
      submitted_at = null,
      approved_at = null,
      approved_by = null,
      revision = revision + 1,
      updated_at = now()
  where id = target_case.id;

  insert into public.onboarding_events (
    workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id
  ) values (
    target_workspace_id, target_employee_id, target_case.id, actor_user_id,
    'onboarding.rehire_started', 'onboarding_case', target_case.id::text
  );
end;
$$;

create or replace function public.set_employee_archived(
  target_workspace_id uuid,
  target_employee_id uuid,
  should_archive boolean,
  restore_access boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  employee_user_id uuid;
  member public.workspace_memberships%rowtype;
  snapshot public.employee_access_snapshots%rowtype;
begin
  if actor_id is null or not public.workspace_has_permission(target_workspace_id, 'employees.archive') then
    raise exception 'employee archive access required' using errcode = '42501';
  end if;

  select user_id
  into employee_user_id
  from public.employee_profiles
  where id = target_employee_id
    and workspace_id = target_workspace_id
    and public.can_access_employee(target_workspace_id, id)
  for update;

  if not found then
    raise exception 'employee not found' using errcode = 'P0002';
  end if;

  if employee_user_id = actor_id then
    raise exception 'self archive is not permitted' using errcode = '42501';
  end if;

  select *
  into member
  from public.workspace_memberships
  where workspace_id = target_workspace_id
    and user_id = employee_user_id;

  if should_archive and member.id is not null and member.status in ('active', 'pending_activation') then
    if not public.workspace_has_permission(target_workspace_id, 'employee_access.manage') then
      raise exception 'linked employee archive requires access management' using errcode = '42501';
    end if;

    insert into public.employee_access_snapshots (
      workspace_id, employee_id, membership_id, role_id, all_locations, location_ids, captured_by
    )
    select target_workspace_id, target_employee_id, member.id, member.role_id, member.all_locations,
      coalesce(array_agg(scope.location_id) filter (where scope.location_id is not null), '{}'), actor_id
    from public.membership_location_scopes scope
    where scope.membership_id = member.id;

    update public.workspace_memberships
    set status = 'suspended'::public.membership_status,
        updated_at = now()
    where id = member.id;
  end if;

  update public.employee_profiles
  set archived_at = case when should_archive then now() else null end,
      archived_by = case when should_archive then actor_id else null end,
      user_id = case
        when not should_archive and not restore_access and employee_user_id is not null then null
        else user_id
      end,
      revision = revision + 1,
      updated_at = now()
  where id = target_employee_id;

  if not should_archive and restore_access then
    if not public.workspace_has_permission(target_workspace_id, 'employee_access.manage') then
      raise exception 'access restoration permission required' using errcode = '42501';
    end if;

    select *
    into snapshot
    from public.employee_access_snapshots
    where employee_id = target_employee_id
      and restored_at is null
    order by captured_at desc
    limit 1
    for update;

    if snapshot.id is null then
      raise exception 'restorable access snapshot not found' using errcode = 'P0002';
    end if;

    if not exists (
      select 1
      from public.workspace_roles
      where id = snapshot.role_id
        and workspace_id = target_workspace_id
    ) then
      raise exception 'snapshotted role is no longer available' using errcode = '22023';
    end if;

    update public.workspace_memberships
    set role_id = snapshot.role_id,
        all_locations = snapshot.all_locations,
        status = 'active'::public.membership_status,
        updated_at = now()
    where id = snapshot.membership_id;

    delete from public.membership_location_scopes
    where membership_id = snapshot.membership_id;

    insert into public.membership_location_scopes (membership_id, workspace_id, location_id)
    select snapshot.membership_id, target_workspace_id, restored_scope.location_id
    from unnest(snapshot.location_ids) as restored_scope(location_id)
    join public.locations location
      on location.id = restored_scope.location_id
     and location.workspace_id = target_workspace_id
     and location.archived_at is null;

    update public.employee_access_snapshots
    set restored_at = now()
    where id = snapshot.id;
  end if;

  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
  values (
    target_workspace_id,
    target_employee_id,
    actor_id,
    case when should_archive then 'employee.archived' else 'employee.restored' end,
    case
      when should_archive then 'Employee archived and linked access suspended'
      when restore_access then 'Employee record and access restored'
      else 'Employee record restored for rehire'
    end
  );
end;
$$;

revoke all on function public.set_employee_archived(uuid, uuid, boolean, boolean)
from public, anon;
grant execute on function public.set_employee_archived(uuid, uuid, boolean, boolean)
to authenticated;

create or replace function public.enforce_membership_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role public.workspace_role;
  bootstrap_allowed boolean;
begin
  if coalesce(current_setting('app.workspace_closure', true), '') = 'on' then
    return new;
  end if;

  if coalesce(current_setting('app.employee_invitation_accept', true), '') = 'on' then
    if tg_op = 'INSERT'
      and new.status = 'pending_activation'::public.membership_status
      and new.role <> 'owner'::public.workspace_role then
      return new;
    end if;

    if tg_op = 'UPDATE'
      and old.workspace_id = new.workspace_id
      and old.user_id = new.user_id
      and old.status = 'suspended'::public.membership_status
      and new.status = 'pending_activation'::public.membership_status
      and new.role <> 'owner'::public.workspace_role then
      return new;
    end if;
  end if;

  if actor_id is null then return new; end if;

  if tg_op = 'INSERT' then
    select exists (
      select 1
      from public.workspaces workspace
      where workspace.id = new.workspace_id
        and workspace.created_by = actor_id
        and new.user_id = actor_id
        and new.role = 'owner'
        and not exists (
          select 1 from public.workspace_memberships existing
          where existing.workspace_id = new.workspace_id
        )
    ) into bootstrap_allowed;
    if bootstrap_allowed then return new; end if;
  end if;

  actor_role := public.workspace_role_for(new.workspace_id);
  if actor_role = 'owner' then return new; end if;
  if actor_role = 'admin' and new.role in ('manager', 'employee') then
    if tg_op = 'INSERT' or old.role in ('manager', 'employee') then return new; end if;
  end if;

  raise exception 'membership role change is not permitted' using errcode = '42501';
end;
$$;

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
  should_snapshot_requirements boolean;
begin
  select profile.*
  into employee
  from public.employee_profiles profile
  join public.workspace_memberships candidate
    on candidate.workspace_id = profile.workspace_id
   and candidate.user_id = profile.user_id
  where profile.user_id = target_user_id
    and profile.archived_at is null
    and candidate.status in ('pending_activation', 'active')
    and (target_workspace_id is null or profile.workspace_id = target_workspace_id)
  order by candidate.created_at
  limit 1;

  if employee.id is null then
    raise exception 'employee onboarding is unavailable' using errcode = 'P0002';
  end if;

  select *
  into membership
  from public.workspace_memberships
  where workspace_id = employee.workspace_id
    and user_id = target_user_id
    and status in ('pending_activation', 'active')
  order by created_at
  limit 1;

  insert into public.employee_onboarding_cases (workspace_id, employee_id, membership_id)
  values (employee.workspace_id, employee.id, membership.id)
  on conflict (employee_id) do update
    set membership_id = excluded.membership_id,
        updated_at = public.employee_onboarding_cases.updated_at
  returning id into onboarding_case_id;

  should_snapshot_requirements := not exists (
    select 1
    from public.employee_onboarding_requirements requirement
    where requirement.case_id = onboarding_case_id
  );

  if should_snapshot_requirements then
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
      and document.required_at_onboarding
      and document.archived_at is null
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
        select 1
        from public.signature_template_versions newer
        where newer.template_id = version.template_id
          and newer.status = 'published'
          and newer.version_number > version.version_number
      )
    on conflict (case_id, kind, source_id) do nothing;
  end if;

  if not exists (
    select 1
    from public.onboarding_events event
    where event.case_id = onboarding_case_id
      and event.action in ('onboarding.started', 'onboarding.rehire_started')
  ) then
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

create or replace function app_private.accept_employee_invitation_for_user(
  target_user_id uuid,
  target_invitation_id uuid,
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

  select lower(email)
  into normalized_user_email
  from auth.users
  where id = target_user_id;

  if normalized_user_email is null or normalized_user_email <> invitation.email then
    raise exception 'invitation email does not match authenticated account' using errcode = '42501';
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

    delete from public.membership_location_scopes
    where membership_id = accepted_membership_id;
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

  insert into public.membership_location_scopes (
    membership_id, workspace_id, location_id
  )
  select accepted_membership_id, invitation.workspace_id, selected.location_id
  from unnest(invitation.location_ids) selected(location_id)
  join public.locations location
    on location.id = selected.location_id
   and location.workspace_id = invitation.workspace_id
   and location.archived_at is null;

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
$$;

create or replace function public.accept_employee_invitation_service(
  target_user_id uuid,
  invitation_token_hash text
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select app_private.accept_employee_invitation_for_user(
    target_user_id,
    null::uuid,
    invitation_token_hash
  );
$$;

create or replace function public.accept_employee_invitation_by_id_service(
  target_user_id uuid,
  target_invitation_id uuid
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select app_private.accept_employee_invitation_for_user(
    target_user_id,
    target_invitation_id,
    null::text
  );
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

create or replace function public.list_my_workspaces()
returns table (
  workspace_id uuid,
  workspace_name text,
  workspace_role public.workspace_role,
  membership_status public.membership_status,
  is_active boolean,
  onboarding_status public.onboarding_status,
  onboarding_current_step smallint,
  workspace_lifecycle_status public.workspace_lifecycle_status,
  closure_effective_at timestamptz,
  pending_ownership_transfer_id uuid,
  pending_ownership_transfer_role text,
  pending_ownership_transfer_expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    workspace.id,
    workspace.name,
    membership.role,
    membership.status,
    coalesce(workspace.id = preference.active_workspace_id, false)
      and membership.status = 'active'
      and (
        workspace.lifecycle_status = 'active'
        or (
          workspace.lifecycle_status = 'closure_scheduled'
          and workspace.closure_effective_at > now()
        )
      ),
    coalesce(onboarding.status, 'complete'::public.onboarding_status),
    coalesce(onboarding.current_step, 2::smallint),
    workspace.lifecycle_status,
    workspace.closure_effective_at,
    transfer.id,
    case
      when transfer.id is null then null
      when transfer.target_user_id = (select auth.uid()) then 'target'
      else 'initiator'
    end,
    transfer.expires_at
  from public.workspace_memberships membership
  join public.workspaces workspace on workspace.id = membership.workspace_id
  left join public.user_workspace_preferences preference on preference.user_id = membership.user_id
  left join public.workspace_onboarding onboarding on onboarding.workspace_id = workspace.id
  left join lateral (
    select pending_transfer.id,
           pending_transfer.target_user_id,
           pending_transfer.expires_at
    from public.workspace_ownership_transfers pending_transfer
    where pending_transfer.workspace_id = workspace.id
      and pending_transfer.status = 'pending'
      and pending_transfer.expires_at > now()
      and (
        pending_transfer.initiated_by = membership.user_id
        or pending_transfer.target_user_id = membership.user_id
      )
    order by pending_transfer.created_at desc
    limit 1
  ) transfer on true
  where membership.user_id = (select auth.uid())
    and workspace.lifecycle_status <> 'deleted'
    and (
      workspace.lifecycle_status <> 'closure_scheduled'
      or workspace.closure_effective_at > now()
    )
    and not (
      membership.status = 'suspended'::public.membership_status
      and exists (
        select 1
        from public.employee_access_snapshots snapshot
        where snapshot.membership_id = membership.id
          and snapshot.restored_at is null
      )
    )
    and not exists (
      select 1
      from public.employee_profiles employee
      where employee.workspace_id = membership.workspace_id
        and employee.user_id = membership.user_id
        and employee.archived_at is not null
    )
  order by
    (membership.status = 'active') desc,
    (coalesce(workspace.id = preference.active_workspace_id, false) and membership.status = 'active') desc,
    workspace.name asc;
$$;

create or replace function public.list_my_workspaces_service(actor_user_id uuid)
returns table (
  workspace_id uuid,
  workspace_name text,
  workspace_role public.workspace_role,
  membership_status public.membership_status,
  is_active boolean,
  onboarding_status public.onboarding_status,
  onboarding_current_step smallint,
  workspace_lifecycle_status public.workspace_lifecycle_status,
  closure_effective_at timestamptz,
  pending_ownership_transfer_id uuid,
  pending_ownership_transfer_role text,
  pending_ownership_transfer_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  return query select * from public.list_my_workspaces();
end;
$$;

revoke all on function public.list_my_workspaces() from public, anon;
revoke all on function public.list_my_workspaces_service(uuid) from public, anon, authenticated;
grant execute on function public.list_my_workspaces_service(uuid) to service_role;

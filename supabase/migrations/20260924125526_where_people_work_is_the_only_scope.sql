-- FOUNDATION-B stage 4b: where people work is the only scope.
--
-- membership_location_scopes was a table kept in step with employee location
-- assignments by three deferred triggers, and written again by invitation
-- acceptance and by archive/restore. It drifted: rows stayed behind after an
-- assignment ended or a manager was demoted (4 such rows in the local
-- database). It is now a view of the assignments themselves: a member's
-- locations are where they work, the rule app_private.actor() uses. Its
-- readers keep reading it until their domain moves to the authorization core
-- (stage 6). Only the server reads it.

drop trigger bl051_sync_assignment_scope on public.employee_location_assignments;
drop trigger bl051_sync_employee_scope on public.employee_profiles;
drop trigger bl051_sync_membership_scope on public.workspace_memberships;
drop function app_private.sync_role_location_scope_trigger();
drop function app_private.sync_manager_location_scope(uuid, uuid);

-- Accepting an invitation and restoring an archived person no longer write
-- scope rows: the assignments already say where they work.
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
$function$;

CREATE OR REPLACE FUNCTION public.set_employee_archived(target_workspace_id uuid, target_employee_id uuid, should_archive boolean, restore_access boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    and public.can_manage_employee_record(target_workspace_id, id)
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
$function$;

-- Publishing a document froze the scope rows while it measured who is
-- affected; it now freezes the assignments they come from.
CREATE OR REPLACE FUNCTION public.set_document_publication_service(actor_user_id uuid, target_workspace_id uuid, target_document_type_id uuid, expected_revision integer, expected_publication_revision integer, expected_preview_token text, publish_reason text, target_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.document_types%rowtype; preview jsonb; core_preview jsonb; result jsonb; r public.employee_onboarding_requirements%rowtype;
begin
 if not public.service_actor_has_permission(actor_user_id,target_workspace_id,'documents.manage') then raise exception 'document management access required' using errcode='42501'; end if;
 if target_status is null or target_status not in ('draft','published') or nullif(btrim(publish_reason),'') is null or char_length(publish_reason)>500 then raise exception 'Valid publication status and reason required' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,52001));
 select * into d from public.document_types where id=target_document_type_id and workspace_id=target_workspace_id for update;
 if d.id is null then raise exception 'document type not found' using errcode='P0002'; end if;
 if d.lifecycle_revision is distinct from expected_revision or d.publication_revision is distinct from expected_publication_revision or d.publication_status=target_status then raise exception 'Document publication changed; refresh required' using errcode='PT409'; end if;
 -- Assignment mutations use this same tenant advisory lock. Lock cases before requirements, as Submit/review do.
 perform 1 from public.employee_profiles where workspace_id=target_workspace_id order by id for update;
 perform 1 from public.employee_onboarding_cases where workspace_id=target_workspace_id order by id for update;
 perform 1 from public.employee_onboarding_requirements where workspace_id=target_workspace_id and source_id=d.id and kind='document' order by id for update;
 perform 1 from public.departments where workspace_id=target_workspace_id order by id for share;
 perform 1 from public.employee_location_assignments where workspace_id=target_workspace_id order by id for share;
 preview:=public.preview_document_publication_service(actor_user_id,target_workspace_id,d.id);
 if preview->>'preview_token' is distinct from expected_preview_token then raise exception 'Document publication impact changed; refresh preview' using errcode='PT409'; end if;
 if target_status='published' then
  update public.document_types set publication_status='published',publication_revision=publication_revision+1,published_at=now() where id=d.id;
  core_preview:=app_private.preview_lifecycle_definition(actor_user_id,target_workspace_id,d.id,'document');
  result:=app_private.apply_lifecycle_definition(actor_user_id,target_workspace_id,d.id,d.lifecycle_revision,core_preview->>'preview_token',publish_reason,'document');
  update public.employee_onboarding_requirements set publication_paused_at=null,lifecycle_revision=lifecycle_revision+1 where workspace_id=target_workspace_id and source_id=d.id and kind='document' and publication_paused_at is not null and (lifecycle_exempt or lifecycle_closed_at is not null or lifecycle_retired_at is not null or lifecycle_assignment_disabled or status='superseded');
 else
  update public.document_types set publication_status='draft',publication_revision=publication_revision+1 where id=d.id;
  for r in update public.employee_onboarding_requirements set publication_paused_at=now(),deadline_at=null,document_suspended_at=null,lifecycle_revision=lifecycle_revision+1,updated_at=now()
   where workspace_id=target_workspace_id and source_id=d.id and kind='document' and lifecycle_retired_at is null and lifecycle_closed_at is null and not lifecycle_exempt and not lifecycle_assignment_disabled returning * loop
   perform app_private.document_audit(r,actor_user_id,'document.publication_paused',jsonb_build_object('reason',btrim(publish_reason),'publication_revision',d.publication_revision+1));
  end loop;
  update public.notification_outbox set payload=jsonb_set(payload,'{body}',to_jsonb('You have outstanding document requests. Open Documents for details.'::text)) where workspace_id=target_workspace_id and type_key='people.documents.missing' and status in ('pending','retry');
  result:=jsonb_build_object('paused',jsonb_array_length(preview->'employees'));
 end if;
 insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata)
 values(target_workspace_id,actor_user_id,case when target_status='published' then 'document_type.published' else 'document_type.unpublished' end,'document_type',d.id::text,jsonb_build_object('reason',btrim(publish_reason),'definition_revision',d.lifecycle_revision,'publication_revision',d.publication_revision+1,'impact',preview->'employees'));
 return result||jsonb_build_object('publication_status',target_status,'publication_revision',d.publication_revision+1);
end;
$function$;

drop table public.membership_location_scopes;

create view public.membership_location_scopes
with (security_invoker = true)
as
select membership.id as membership_id,
  membership.workspace_id,
  assignment.location_id,
  min(assignment.assigned_at) as created_at
from public.workspace_memberships membership
join public.employee_profiles profile
  on profile.workspace_id = membership.workspace_id
 and profile.user_id = membership.user_id
 and profile.archived_at is null
join public.employee_location_assignments assignment
  on assignment.employee_id = profile.id
 and assignment.workspace_id = profile.workspace_id
 and assignment.ended_at is null
group by membership.id, membership.workspace_id, assignment.location_id;

comment on view public.membership_location_scopes is
  'Where each member works: their active location assignments. Derived, never written; readers move to app_private.scope_set() in stage 6.';

revoke all on public.membership_location_scopes from public, anon, authenticated;
grant select on public.membership_location_scopes to service_role;

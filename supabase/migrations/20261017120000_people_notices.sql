-- BILDIRIM-U4a (KARARLAR S-123, S-127; docs/plan/research/BILDIRIM-URETICILER.md §2.5): people write their own
-- notices into the new core (part 4, the people slice: invitations, onboarding, preferred name).
--   * an invitation accepted (people.joined), declined, or dropped because its invitee's account is going
--     (people.invitation_cancelled, never saying why): whoever sent it while the core says they still may
--     invite that person (employee.invite), otherwise who may now (S-127); never the invitee;
--   * an onboarding sent in waits for who may act on it now: whoever may approve a changed legal name
--     (onboarding.legal_name) while one waits, and whoever may review onboarding (onboarding.review) when the
--     workspace asks for a final approval. Documents waiting for review are the Documents notice's
--     (documents.review_needed). A change asked tells the person with what to change; sent again, their card
--     closes; let in, the person hears it and every card on the onboarding closes;
--   * a preferred name waiting for an answer tells the domain's own deciders (whoever the core lets decide
--     it); asked again or cleared, the old ask's cards close; the first answer closes them all and tells the
--     person.
-- Every notice is guarded: one that fails is logged, and the people work stands.

-- A person's name as the workspace shows it.
create function app_private.people_name(target_employee uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select btrim(coalesce(nullif(e.preferred_name, ''), e.first_name) || ' ' || e.last_name)
  from public.employee_profiles e where e.id = target_employee
$$;

revoke all on function app_private.people_name(uuid) from public;

-- app_private.notify, guarded: the people work outlives a notice that fails (domain_work_outlives_notifications).
create function app_private.people_tell(target_type text, target_workspace uuid, target_recipients uuid[],
  target_event_key text, target_title text, target_body text, target_url text, target_actor uuid,
  target_subject_type text, target_subject_id uuid, target_data jsonb default '{}')
returns integer
language plpgsql
set search_path = ''
as $$
begin
  return app_private.notify(target_type, target_workspace, target_recipients, target_event_key, target_title, target_body,
    target_url, target_actor, target_subject_type, target_subject_id, target_data);
exception when others then
  raise warning 'people_tell: % notice % skipped: % (%)', target_type, target_event_key, sqlerrm, sqlstate;
  return 0;
end;
$$;

revoke all on function app_private.people_tell(text, uuid, uuid[], text, text, text, text, uuid, text, uuid, jsonb) from public;

-- An invitation's outcome (joined, invitation_declined, invitation_cancelled) to whoever sent it while the
-- core says they still may invite that person; otherwise to who may now, so it is never silent (S-127).
create function app_private.people_tell_invitation(invitation public.employee_invitations, kind text, actor uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  name text;
  theirs boolean;
begin
  name := app_private.people_name(invitation.employee_id);
  theirs := app_private.authz_reason(invitation.created_by, invitation.workspace_id, 'employee.invite', null,
    invitation.employee_id) is null;
  return app_private.people_tell('people.' || kind, invitation.workspace_id,
    case when theirs then array[invitation.created_by]
         else app_private.notify_holders(invitation.workspace_id, 'employee.invite', null, invitation.employee_id) end,
    'invite:' || invitation.id::text || ':' || kind,
    case kind
      when 'joined' then name || ' accepted ' || case when theirs then 'your' else 'an' end || ' invitation'
      when 'invitation_declined' then name || ' declined ' || case when theirs then 'your' else 'an' end || ' invitation'
      else case when theirs then 'Your' else 'An' end || ' invitation to ' || name || ' was cancelled' end,
    case kind
      when 'joined' then 'They are finishing their onboarding.'
      when 'invitation_cancelled' then 'They can no longer accept it.' end,
    '/app/employees?employeeId=' || invitation.employee_id::text, actor, 'employee', invitation.employee_id,
    jsonb_build_object('invitation_id', invitation.id, 'employee_id', invitation.employee_id));
exception when others then
  raise warning 'people_tell_invitation: % notice for % skipped: % (%)', kind, invitation.id, sqlerrm, sqlstate;
  return 0;
end;
$$;

revoke all on function app_private.people_tell_invitation(public.employee_invitations, text, uuid) from public;

-- Who may act on an onboarding sent in, now: a changed legal name waiting (onboarding.legal_name), and a
-- final approval when the workspace asks for one (onboarding.review). Documents are the Documents notice's.
create function app_private.onboarding_reviewers(target_case public.employee_onboarding_cases)
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(distinct who order by who), '{}') from (
    select unnest(app_private.notify_holders(target_case.workspace_id, 'onboarding.legal_name', null, target_case.employee_id)) who
    where exists (select 1 from public.employee_onboarding_requirements r
                  where r.case_id = target_case.id and r.kind = 'profile' and r.requires_review
                    and r.status <> 'completed'::public.employee_onboarding_requirement_status)
    union
    select unnest(app_private.notify_holders(target_case.workspace_id, 'onboarding.review', null, target_case.employee_id))
    where public.employee_onboarding_final_approval_required(target_case.workspace_id)
  ) reviewers
$$;

revoke all on function app_private.onboarding_reviewers(public.employee_onboarding_cases) from public;

-- The person behind an onboarding.
create function app_private.onboarding_person(target_case public.employee_onboarding_cases)
returns uuid
language sql
stable
set search_path = ''
as $$
  select e.user_id from public.employee_profiles e
  where e.id = target_case.employee_id and e.workspace_id = target_case.workspace_id
$$;

revoke all on function app_private.onboarding_person(public.employee_onboarding_cases) from public;

CREATE OR REPLACE FUNCTION "app_private"."accept_employee_invitation_for_user"("target_user_id" "uuid", "target_invitation_id" "uuid", "invitation_token_hash" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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

  perform app_private.initialize_employee_onboarding(target_user_id, invitation.workspace_id);
  -- Whoever sent it hears the person joined (people_tell_invitation, S-127).
  perform app_private.people_tell_invitation(invitation, 'joined', target_user_id);
  return invitation.workspace_id;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."decline_employee_invitation_service"("target_user_id" "uuid", "target_invitation_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
  perform app_private.people_tell_invitation(invitation, 'invitation_declined', target_user_id);
end;
$$;

CREATE OR REPLACE FUNCTION "public"."request_account_deletion_v2_service"("actor_user_id" "uuid", "recovery_token_digest" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  actor_email text;
  blockers jsonb;
  existing_request public.account_deletion_requests%rowtype;
  created_request public.account_deletion_requests%rowtype;
  dropped public.employee_invitations%rowtype;
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

  -- Each invitation it drops tells whoever sent it, never why (the account is the invitee's own).
  for dropped in
    update public.employee_invitations invitation
    set status = 'revoked'::public.employee_invitation_status,
        revoked_at = now(),
        updated_at = now()
    where invitation.email = actor_email
      and invitation.status = 'pending'::public.employee_invitation_status
    returning invitation.*
  loop
    perform app_private.people_tell_invitation(dropped, 'invitation_cancelled', actor_user_id);
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
$_$;

CREATE OR REPLACE FUNCTION "public"."submit_employee_onboarding_service"("target_user_id" "uuid", "expected_revision" integer, "target_workspace_id" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  target_case public.employee_onboarding_cases%rowtype;
begin
 perform app_private.authorize(target_user_id, app_private.onboarding_self_workspace(target_user_id, target_workspace_id, true), 'onboarding.self');
  select onboarding.* into target_case
  from public.employee_onboarding_cases onboarding
  where onboarding.id = app_private.employee_onboarding_case_id(target_user_id, target_workspace_id)
  for update;

  if target_case.id is null or target_case.revision <> expected_revision then
    raise exception 'onboarding changed; refresh required' using errcode = 'PT409', hint = 'onboarding.changed';
  end if;
  if exists(select 1 from public.employee_onboarding_requirements r where r.case_id=target_case.id and app_private.document_initial_action_missing(r)) then raise exception 'Submit conditional documents or give an initial reason' using errcode='23514'; end if;
  if exists (
    select 1
    from public.employee_onboarding_requirements
    where case_id = target_case.id
      and (kind<>'document' or (not lifecycle_exempt and lifecycle_closed_at is null and status<>'superseded')) and required
      and status not in (
        'completed'::public.employee_onboarding_requirement_status,
        'awaiting_review'::public.employee_onboarding_requirement_status
      )
  ) then
    raise exception 'required onboarding items remain incomplete' using errcode = '23514';
  end if;

  update public.employee_onboarding_cases
  set status = 'submitted'::public.employee_onboarding_case_status,
      submitted_at = now(),
      revision = revision + 1,
      updated_at = now()
  where id = target_case.id
  returning * into target_case;

  insert into public.onboarding_events (workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id)
  values (
    target_case.workspace_id,
    target_case.employee_id,
    target_case.id,
    target_user_id,
    'onboarding.submitted',
    'onboarding_case',
    target_case.id::text
  );
  -- Sent again: the person's "needs a change" card is done.
  perform app_private.notification_resolve(target_case.workspace_id, 'onboarding_case', target_case.id, 'resubmitted',
    target_user_id);

  if not exists(select 1 from public.employee_onboarding_requirements r where r.case_id=target_case.id and app_private.document_activation_blocked(r)) and not target_case.final_approval_required
    and not exists (
      select 1
      from public.employee_onboarding_requirements
      where case_id = target_case.id
        and (kind<>'document' or (not lifecycle_exempt and lifecycle_closed_at is null and status<>'superseded')) and required
        and blocks_activation
        and status <> 'completed'::public.employee_onboarding_requirement_status
    ) then
    return app_private.activate_employee_onboarding_case(
      target_case.id,
      target_user_id,
      'employee.auto_activated'
    );
  end if;

  -- It waits: who may act on it now is told (onboarding_reviewers).
  perform app_private.people_tell('people.onboarding_review_needed', target_case.workspace_id,
    app_private.onboarding_reviewers(target_case),
    'onboarding:' || target_case.id::text || ':submitted:' || target_case.revision::text,
    app_private.people_name(target_case.employee_id) || '''s onboarding is ready for review', null,
    '/app/employees?employeeId=' || target_case.employee_id::text, target_user_id, 'onboarding_case', target_case.id,
    jsonb_build_object('employee_id', target_case.employee_id));
  return target_case.revision;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."review_employee_onboarding_before_availability_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_employee_id" "uuid", "review_action" "text", "target_requirement_id" "uuid", "review_reason" "text", "expected_revision" integer, "production_ready" boolean) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  target_case public.employee_onboarding_cases%rowtype;
  requirement public.employee_onboarding_requirements%rowtype;
  private_profile public.employee_private_profiles%rowtype;
  target_employee_user_id uuid;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'onboarding.review', target_person => target_employee_id);

  select onboarding.* into target_case
  from public.employee_onboarding_cases onboarding
  where onboarding.workspace_id = target_workspace_id
    and onboarding.employee_id = target_employee_id
  for update of onboarding;
  if target_case.id is null or target_case.revision <> expected_revision then raise exception 'onboarding changed; refresh required' using errcode = 'PT409', hint = 'onboarding.changed'; end if;
  select employee.user_id into target_employee_user_id
  from public.employee_profiles employee
  where employee.id = target_employee_id
    and employee.workspace_id = target_workspace_id;
  if review_action in ('accept_requirement', 'reject_requirement') then
    select * into requirement from public.employee_onboarding_requirements
    where id = target_requirement_id and case_id = target_case.id for update;
    if requirement.id is null or not requirement.requires_review then raise exception 'reviewable requirement unavailable' using errcode = 'P0002'; end if;
    if requirement.kind = 'document'::public.employee_onboarding_requirement_kind then
      perform app_private.authorize(actor_user_id, target_workspace_id, 'documents.review', target_person => target_employee_id);
    end if;
    -- A legal name is approved by an owner or an admin only (FB-6.6 S1).
    if requirement.kind = 'profile'::public.employee_onboarding_requirement_kind then
      perform app_private.authorize(actor_user_id, target_workspace_id, 'onboarding.legal_name', target_person => target_employee_id);
    end if;
    if review_action = 'reject_requirement' and char_length(btrim(coalesce(review_reason, ''))) not between 1 and 500 then
      raise exception 'specific correction reason required' using errcode = '22023';
    end if;
    update public.employee_onboarding_requirements set
      status = case
        when review_action = 'accept_requirement' then 'completed'::public.employee_onboarding_requirement_status
        else 'rejected'::public.employee_onboarding_requirement_status
      end,
      rejection_reason = case when review_action = 'reject_requirement' then btrim(review_reason) else null end,
      reviewed_by = actor_user_id,
      reviewed_at = now(),
      completed_at = case when review_action = 'accept_requirement' then now() else null end,
      updated_at = now()
    where id = requirement.id;
    if requirement.kind = 'document'::public.employee_onboarding_requirement_kind then
      update public.employee_documents set
        review_status = case
          when review_action = 'accept_requirement' then 'accepted'::public.employee_document_review_status
          else 'rejected'::public.employee_document_review_status
        end,
        rejection_reason = case when review_action = 'reject_requirement' then btrim(review_reason) else null end,
        reviewed_by = actor_user_id, reviewed_at = now()
      where requirement_id = requirement.id and review_status = 'awaiting_review'::public.employee_document_review_status;
    end if;
    if requirement.kind = 'profile'::public.employee_onboarding_requirement_kind and review_action = 'accept_requirement' then
      select * into private_profile
      from public.employee_private_profiles
      where employee_id = target_employee_id;
      if private_profile.employee_id is null then
        raise exception 'private profile unavailable' using errcode = 'P0002';
      end if;
      update public.employee_profiles set
        first_name = private_profile.legal_first_name,
        last_name = private_profile.legal_last_name,
        revision = revision + 1,
        updated_at = now()
      where id = target_employee_id;
      insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
      values (target_workspace_id, target_employee_id, actor_user_id,
        'employee.legal_name_approved', 'Employee legal name change approved from onboarding');
    end if;
    if review_action = 'reject_requirement' then
      update public.employee_onboarding_cases set status = 'changes_requested'::public.employee_onboarding_case_status, revision = revision + 1,
        updated_at = now() where id = target_case.id returning revision into expected_revision;
      -- Back with the person: the reviewers' cards close, and the person hears what to change.
      perform app_private.notification_resolve(target_workspace_id, 'onboarding_case', target_case.id, 'changes_requested',
        actor_user_id);
      perform app_private.people_tell('people.onboarding_change_requested', target_workspace_id,
        array[target_employee_user_id],
        'onboarding:' || target_case.id::text || ':changes:' || expected_revision::text,
        'Your onboarding needs a change', btrim(review_reason),
        '/onboarding?workspace=' || target_workspace_id::text, actor_user_id, 'onboarding_case', target_case.id,
        jsonb_build_object('requirement_id', requirement.id));
    else
      update public.employee_onboarding_cases set revision = revision + 1, updated_at = now()
      where id = target_case.id returning revision into expected_revision;
      if target_case.status = 'submitted'::public.employee_onboarding_case_status
        and not public.employee_onboarding_final_approval_required(target_workspace_id)
        and not exists (
          select 1
          from public.employee_onboarding_requirements
          where case_id = target_case.id
            and required
            and blocks_activation
            and status <> 'completed'::public.employee_onboarding_requirement_status
        ) then
        expected_revision := app_private.activate_employee_onboarding_case(
          target_case.id,
          actor_user_id,
          'employee.auto_activated_after_review'
        );
      end if;
    end if;
  elsif review_action = 'activate' then
    if target_case.status <> 'submitted'::public.employee_onboarding_case_status then raise exception 'submitted onboarding required' using errcode = '23514'; end if;
    if not production_ready then raise exception 'sensitive infrastructure readiness required' using errcode = '55000'; end if;
    if exists (select 1 from public.employee_onboarding_requirements
      where case_id = target_case.id and required and blocks_activation and status <> 'completed'::public.employee_onboarding_requirement_status) then
      raise exception 'activation-blocking requirements remain' using errcode = '23514';
    end if;
    expected_revision := app_private.activate_employee_onboarding_case(
      target_case.id,
      actor_user_id,
      'employee.activated'
    );
  else
    raise exception 'unsupported onboarding review action' using errcode = '22023';
  end if;
  insert into public.onboarding_events (workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id, metadata)
  values (target_workspace_id, target_employee_id, target_case.id, actor_user_id,
    'onboarding.' || review_action, 'onboarding_case', target_case.id::text,
    jsonb_build_object('requirement_id', target_requirement_id, 'reason_present', nullif(btrim(coalesce(review_reason, '')), '') is not null));
  return expected_revision;
end;
$$;

CREATE OR REPLACE FUNCTION "app_private"."activate_employee_onboarding_case"("target_case_id" "uuid", "actor_user_id" "uuid", "event_action" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  target_case public.employee_onboarding_cases%rowtype;
  next_revision integer;
begin
  select * into target_case
  from public.employee_onboarding_cases
  where id = target_case_id
  for update;

  if target_case.id is null then
    raise exception 'onboarding case unavailable' using errcode = 'P0002';
  end if;
  if exists(select 1 from public.employee_onboarding_requirements r where r.case_id=target_case.id and app_private.document_activation_blocked(r)) then raise exception 'Submit conditional documents or give an initial reason' using errcode='23514'; end if;
  if exists (
    select 1
    from public.employee_onboarding_requirements
    where case_id = target_case.id
      and (kind<>'document' or (publication_paused_at is null and not lifecycle_exempt and lifecycle_closed_at is null and status<>'superseded')) and required
      and blocks_activation
      and status <> 'completed'::public.employee_onboarding_requirement_status
  ) then
    raise exception 'activation-blocking requirements remain' using errcode = '23514';
  end if;

  perform set_config('app.membership_change', target_case.membership_id::text, true);
  update public.workspace_memberships
  set status = 'active', updated_at = now()
  where id = target_case.membership_id and status = 'pending_activation';
  if not found then
    raise exception 'pending membership unavailable' using errcode = '23514';
  end if;

  update public.employee_onboarding_cases
  set status = 'approved'::public.employee_onboarding_case_status,
      approved_by = actor_user_id,
      approved_at = now(),
      revision = revision + 1,
      updated_at = now()
  where id = target_case.id
  returning revision into next_revision;

  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
  values (
    target_case.workspace_id,
    target_case.employee_id,
    actor_user_id,
    event_action,
    'Employee onboarding approved and workspace access activated'
  );

  -- Every card on it closes; the person hears they are in (not when they let themselves in).
  perform app_private.notification_resolve(target_case.workspace_id, 'onboarding_case', target_case.id, 'approved',
    actor_user_id);
  perform app_private.people_tell('people.onboarding_completed', target_case.workspace_id,
    array[app_private.onboarding_person(target_case)],
    'onboarding:' || target_case.id::text || ':completed',
    'Your onboarding is complete', 'You can use ' || (select w.name from public.workspaces w where w.id = target_case.workspace_id) || ' now.',
    '/app', actor_user_id, 'onboarding_case', target_case.id, '{}'::jsonb);
  return next_revision;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."request_employee_preferred_name_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_employee_id" "uuid", "preferred_name" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  employee_row public.employee_profiles%rowtype;
  approval text;
  cleaned text := btrim(coalesce(preferred_name, ''));
  deciders uuid[];
  replaced uuid[];
  asked uuid;
begin
  -- Only on one's own record; somebody else's and an unknown one get the same
  -- answer (authz.out_of_scope).
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.request_preferred_name',
    target_person => target_employee_id);
  select * into employee_row
  from public.employee_profiles
  where id = target_employee_id
    and workspace_id = target_workspace_id
    and archived_at is null;

  if employee_row.id is null then
    raise exception 'employee not found'
      using errcode = 'P0002', hint = 'employee.not_found';
  end if;
  if char_length(cleaned) > 80 then
    raise exception 'a preferred name is at most 80 characters'
      using errcode = '22023', hint = 'employee.preferred_name.too_long';
  end if;

  -- Clearing it is always the person's own business; there is nothing for a
  -- manager to answer about a name that will not be shown.
  if cleaned = '' then
    with gone as (
      update public.employee_preferred_name_requests
      set status = 'rejected', decided_by = actor_user_id, decided_at = now()
      where employee_id = target_employee_id and status = 'pending'
      returning id
    )
    select coalesce(array_agg(gone.id), '{}') into replaced from gone;
    perform app_private.notification_resolve(target_workspace_id, 'preferred_name_request', r, 'closed', actor_user_id)
    from unnest(replaced) r;
    update public.employee_profiles set preferred_name = '', updated_at = now()
    where id = target_employee_id;
    return 'cleared';
  end if;

  approval := coalesce(
    (select preferred_name_approval from public.employee_name_settings
     where workspace_id = target_workspace_id),
    'auto'
  );

  -- Whoever the core lets decide this person's preferred name.
  -- ponytail: one core call per active member; a workspace is tens of people.
  select coalesce(array_agg(member.user_id order by member.user_id), '{}')
  into deciders
  from public.workspace_memberships member
  where member.workspace_id = target_workspace_id
    and member.status = 'active'
    and app_private.authz_reason(member.user_id, target_workspace_id,
      'employee.decide_preferred_name', null, target_employee_id) is null;

  -- Nobody ranks above the owner: with nobody to answer it, a request does
  -- not wait (KK-17).
  if cardinality(deciders) = 0 then
    approval := 'auto';
  end if;

  -- Whatever was waiting is replaced: the latest answer is the one asked for.
  with gone as (
    update public.employee_preferred_name_requests
    set status = 'rejected', decided_by = actor_user_id, decided_at = now()
    where employee_id = target_employee_id and status = 'pending'
    returning id
  )
  select coalesce(array_agg(gone.id), '{}') into replaced from gone;
  -- The earlier ask's cards close: the latest is the one waiting.
  perform app_private.notification_resolve(target_workspace_id, 'preferred_name_request', r, 'closed', actor_user_id)
  from unnest(replaced) r;

  insert into public.employee_preferred_name_requests (
    workspace_id, employee_id, requested_name, status, requested_by,
    decided_by, decided_at
  )
  values (
    target_workspace_id, target_employee_id, cleaned,
    case when approval = 'auto' then 'approved' else 'pending' end,
    actor_user_id,
    case when approval = 'auto' then actor_user_id end,
    case when approval = 'auto' then now() end
  )
  returning id into asked;

  -- Waiting: the deciders the domain found above are told.
  if approval <> 'auto' then
    perform app_private.people_tell('people.preferred_name_requested', target_workspace_id, deciders,
      'preferred_name:' || asked::text,
      app_private.people_name(target_employee_id) || ' asked to be called ' || cleaned, null,
      '/app/employees?employeeId=' || target_employee_id::text, actor_user_id, 'preferred_name_request', asked,
      jsonb_build_object('employee_id', target_employee_id, 'requested_name', cleaned));
  end if;

  if approval = 'auto' then
    update public.employee_profiles
    set preferred_name = cleaned, updated_at = now()
    where id = target_employee_id;
  end if;

  return case when approval = 'auto' then 'published' else 'waiting' end;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."decide_employee_preferred_name_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_request_id" "uuid", "approve" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  request_row public.employee_preferred_name_requests%rowtype;
  asker uuid;
begin
  select request.employee_id into asker
  from public.employee_preferred_name_requests request
  where request.id = target_request_id
    and request.workspace_id = target_workspace_id;
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.decide_preferred_name', target_person => asker);

  select * into request_row
  from public.employee_preferred_name_requests
  where id = target_request_id
    and workspace_id = target_workspace_id
    and status = 'pending'
  for update;

  if request_row.id is null then
    raise exception 'that request is no longer waiting for an answer'
      using errcode = 'P0002', hint = 'employee.preferred_name.not_pending';
  end if;

  update public.employee_preferred_name_requests
  set status = case when approve then 'approved' else 'rejected' end,
      decided_by = actor_user_id,
      decided_at = now()
  where id = request_row.id;

  if approve then
    update public.employee_profiles
    set preferred_name = request_row.requested_name, updated_at = now()
    where id = request_row.employee_id
      and workspace_id = target_workspace_id;
  end if;

  -- The first answer closes every decider's card and tells the person.
  perform app_private.notification_resolve(target_workspace_id, 'preferred_name_request', request_row.id,
    case when approve then 'approved' else 'declined' end, actor_user_id);
  perform app_private.people_tell('people.preferred_name_decided', target_workspace_id,
    array(select e.user_id from public.employee_profiles e where e.id = request_row.employee_id and e.workspace_id = target_workspace_id),
    'preferred_name:' || request_row.id::text || ':decided',
    case when approve then 'You''ll be called ' || request_row.requested_name
         else 'Your preferred name "' || request_row.requested_name || '" wasn''t approved' end, null,
    '/account/profile', actor_user_id, 'preferred_name_request', request_row.id,
    jsonb_build_object('outcome', case when approve then 'approved' else 'declined' end));
end;
$$;

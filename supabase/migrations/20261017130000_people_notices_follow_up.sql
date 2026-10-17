-- BILDIRIM-U4a follow-up (KARARLAR S-127, S-131; review of 20261017120000_people_notices.sql):
--   1. A final approval is read from one source, the case's own flag (final_approval_required), at sending in,
--      for who is told, and at review alike. The review read the workspace's setting instead: turned on while
--      somebody onboarded, it kept them out after the last approval while nobody was told.
--   2. Changes asked twice before the person sends again: both "needs a change" cards stay open until they do.
--      The person's cards have a subject of their own (onboarding_changes), so asking again closes only the
--      reviewers' cards (onboarding_case).
--   3. S-131 (Mert, 2026-10-17): a preferred name always waits for the people the core lets decide it; the
--      "Auto approve / Manager approval" setting is gone with its table, its read and write and their two
--      actions. With nobody above to decide (the owner's own) it still takes effect at once, and clearing it is
--      still the person's own business. A refusal is silent: only an approval is told.

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
      select * into target_case from public.employee_onboarding_cases where id = target_case.id;
      perform app_private.onboarding_tell(target_case, 'changes', actor_user_id, review_reason);
    else
      update public.employee_onboarding_cases set revision = revision + 1, updated_at = now()
      where id = target_case.id returning revision into expected_revision;
      if target_case.status = 'submitted'::public.employee_onboarding_case_status
        and not target_case.final_approval_required
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
      -- Not let in yet: the cards close once nothing in it is left for their holders (onboarding_tell).
      select * into target_case from public.employee_onboarding_cases where id = target_case.id;
      if target_case.status <> 'approved'::public.employee_onboarding_case_status then
        perform app_private.onboarding_tell(target_case, 'reviewed', actor_user_id);
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

CREATE OR REPLACE FUNCTION "app_private"."onboarding_tell"("target_case" "public"."employee_onboarding_cases", "event" "text", "actor" "uuid", "reason" "text" DEFAULT NULL::"text") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if event = 'submitted' then
    perform app_private.notification_resolve(target_case.workspace_id, 'onboarding_changes', target_case.id, 'resubmitted', actor);
    perform app_private.notification_resolve(target_case.workspace_id, 'onboarding_case', target_case.id, 'resubmitted', actor);
    return app_private.people_tell('people.onboarding_review_needed', target_case.workspace_id,
      app_private.onboarding_reviewers(target_case),
      'onboarding:' || target_case.id::text || ':submitted:' || target_case.revision::text,
      app_private.people_name(target_case.employee_id) || '''s onboarding is ready for review', null,
      '/app/employees?employeeId=' || target_case.employee_id::text, actor, 'onboarding_case', target_case.id,
      jsonb_build_object('employee_id', target_case.employee_id));
  elsif event = 'changes' then
    perform app_private.notification_resolve(target_case.workspace_id, 'onboarding_case', target_case.id, 'changes_requested', actor);
    return app_private.people_tell('people.onboarding_change_requested', target_case.workspace_id,
      array[app_private.onboarding_person(target_case)],
      'onboarding:' || target_case.id::text || ':changes:' || target_case.revision::text,
      'Your onboarding needs a change', btrim(reason),
      '/onboarding?workspace=' || target_case.workspace_id::text, actor, 'onboarding_changes', target_case.id, '{}'::jsonb);
  elsif event = 'reviewed' then
    if cardinality(app_private.onboarding_reviewers(target_case)) = 0 then
      return app_private.notification_resolve(target_case.workspace_id, 'onboarding_case', target_case.id, 'approved', actor);
    end if;
    return 0;
  elsif event = 'completed' then
    perform app_private.notification_resolve(target_case.workspace_id, 'onboarding_changes', target_case.id, 'approved', actor);
    perform app_private.notification_resolve(target_case.workspace_id, 'onboarding_case', target_case.id, 'approved', actor);
    return app_private.people_tell('people.onboarding_completed', target_case.workspace_id,
      array[app_private.onboarding_person(target_case)],
      'onboarding:' || target_case.id::text || ':completed',
      'Your onboarding is complete',
      'You can use ' || (select w.name from public.workspaces w where w.id = target_case.workspace_id) || ' now.',
      '/app', actor, 'onboarding_case', target_case.id, '{}'::jsonb);
  end if;
  return 0;
exception when others then
  raise warning 'onboarding_tell: % notices for % skipped: % (%)', event, target_case.id, sqlerrm, sqlstate;
  return 0;
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
    -- The earlier ask's cards close (preferred_name_tell_asked).
    perform app_private.preferred_name_tell_asked(target_workspace_id, target_employee_id, replaced, null, null, '{}', actor_user_id);
    update public.employee_profiles set preferred_name = '', updated_at = now()
    where id = target_employee_id;
    return 'cleared';
  end if;

  -- S-131: it waits for an answer; no setting lets it through.
  approval := 'manager';

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

  -- The earlier ask's cards close; waiting, the deciders the domain found above are told.
  perform app_private.preferred_name_tell_asked(target_workspace_id, target_employee_id, replaced,
    case when approval <> 'auto' then asked end, cleaned, deciders, actor_user_id);

  if approval = 'auto' then
    update public.employee_profiles
    set preferred_name = cleaned, updated_at = now()
    where id = target_employee_id;
  end if;

  return case when approval = 'auto' then 'published' else 'waiting' end;
end;
$$;

CREATE OR REPLACE FUNCTION "app_private"."preferred_name_tell_answered"("request" "public"."employee_preferred_name_requests", "approve" boolean, "actor" "uuid") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  perform app_private.notification_resolve(request.workspace_id, 'preferred_name_request', request.id,
    case when approve then 'approved' else 'declined' end, actor);
  -- S-131: a refusal is silent; only an approval is told.
  if not approve then
    return 0;
  end if;
  return app_private.people_tell('people.preferred_name_decided', request.workspace_id,
    array(select e.user_id from public.employee_profiles e where e.id = request.employee_id and e.workspace_id = request.workspace_id),
    'preferred_name:' || request.id::text || ':decided',
    'You''ll be called ' || request.requested_name, null,
    '/account/profile', actor, 'preferred_name_request', request.id,
    jsonb_build_object('outcome', 'approved'));
exception when others then
  raise warning 'preferred_name_tell_answered: notices for % skipped: % (%)', request.id, sqlerrm, sqlstate;
  return 0;
end;
$$;

update public.notification_types set description = 'Your preferred name was approved'
where key = 'people.preferred_name_decided';

-- 3c. The setting that let a preferred name through, gone end to end (retired_objects_stay_gone).
drop function public.get_employee_name_settings_service(uuid, uuid);
drop function public.set_employee_name_settings_service(uuid, uuid, text);
drop table public.employee_name_settings;
delete from app_private.authz_actions where key in ('settings.people', 'settings.people.read');

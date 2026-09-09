create or replace function public.service_actor_can_access_employee(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select membership.id, membership.all_locations, role.access_class
    from public.workspace_memberships membership
    join public.workspace_roles role
      on role.id = membership.role_id
     and role.workspace_id = membership.workspace_id
    where membership.workspace_id = target_workspace_id
      and membership.user_id = actor_user_id
      and membership.status = 'active'
    limit 1
  ),
  target_employee as (
    select employee.id, target_role.access_class
    from public.employee_profiles employee
    left join public.workspace_memberships target_membership
      on target_membership.workspace_id = employee.workspace_id
     and target_membership.user_id = employee.user_id
    left join public.workspace_roles target_role
      on target_role.id = target_membership.role_id
     and target_role.workspace_id = target_membership.workspace_id
    where employee.workspace_id = target_workspace_id
      and employee.id = target_employee_id
      and employee.archived_at is null
  )
  select exists (
    select 1
    from actor
    cross join target_employee
    where actor.access_class in ('owner', 'admin')
       or (
        actor.access_class = 'manager'
        and coalesce(target_employee.access_class, 'employee'::public.workspace_role) = 'employee'::public.workspace_role
        and (
          actor.all_locations
          or exists (
            select 1
            from public.employee_location_assignments assignment
            join public.membership_location_scopes scope
              on scope.membership_id = actor.id
             and scope.workspace_id = target_workspace_id
             and scope.location_id = assignment.location_id
            where assignment.employee_id = target_employee_id
              and assignment.workspace_id = target_workspace_id
              and assignment.ended_at is null
          )
        )
      )
  );
$$;

create or replace function public.get_employee_onboarding_review_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare target_case public.employee_onboarding_cases%rowtype; requirement_rows jsonb; total_count integer; completed_count integer;
begin
  if not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'employee_onboarding.review') then
    raise exception 'employee onboarding review required' using errcode = '42501';
  end if;
  if not public.service_actor_can_access_employee(actor_user_id, target_workspace_id, target_employee_id) then
    raise exception 'onboarding case unavailable' using errcode = 'P0002';
  end if;
  select * into target_case from public.employee_onboarding_cases
  where workspace_id = target_workspace_id and employee_id = target_employee_id;
  if target_case.id is null then raise exception 'onboarding case unavailable' using errcode = 'P0002'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', requirement.id, 'kind', requirement.kind, 'title', requirement.title,
    'description', requirement.description, 'status', requirement.status,
    'required', requirement.required, 'blocks_activation', requirement.blocks_activation,
    'requires_review', requirement.requires_review, 'sort_order', requirement.sort_order,
    'source_id', requirement.source_id,
    'accepted_formats', coalesce(requirement.source_snapshot->'accepted_formats', '[]'::jsonb),
    'content_text', null, 'content_digest', requirement.source_snapshot->>'content_digest',
    'intent_statement', null, 'rejection_reason', requirement.rejection_reason
  ) order by requirement.sort_order), '[]'::jsonb),
  count(*) filter (where requirement.required),
  count(*) filter (where requirement.required and requirement.status = 'completed')
  into requirement_rows, total_count, completed_count
  from public.employee_onboarding_requirements requirement
  where requirement.case_id = target_case.id and requirement.status <> 'superseded';
  return jsonb_build_object(
    'case_id', target_case.id, 'employee_id', target_case.employee_id,
    'case_status', target_case.status, 'revision', target_case.revision,
    'submitted_at', target_case.submitted_at,
    'progress_completed', completed_count, 'progress_total', total_count,
    'ssn_present', false,
    'requirements', requirement_rows
  );
end;
$$;

create or replace function public.review_employee_onboarding_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid,
  review_action text,
  target_requirement_id uuid,
  review_reason text,
  expected_revision integer,
  production_ready boolean
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_case public.employee_onboarding_cases%rowtype;
  requirement public.employee_onboarding_requirements%rowtype;
  private_profile public.employee_private_profiles%rowtype;
  actor_system_key text;
  target_employee_user_id uuid;
begin
  if not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'employee_onboarding.review') then
    raise exception 'employee onboarding review required' using errcode = '42501';
  end if;
  if not public.service_actor_can_access_employee(actor_user_id, target_workspace_id, target_employee_id) then
    raise exception 'onboarding case unavailable' using errcode = 'P0002';
  end if;
  select role.system_key into actor_system_key
  from public.workspace_memberships membership
  join public.workspace_roles role on role.id = membership.role_id
  where membership.workspace_id = target_workspace_id
    and membership.user_id = actor_user_id
    and membership.status = 'active'
  order by membership.created_at
  limit 1;

  select onboarding.* into target_case
  from public.employee_onboarding_cases onboarding
  where onboarding.workspace_id = target_workspace_id
    and onboarding.employee_id = target_employee_id
  for update of onboarding;
  if target_case.id is null or target_case.revision <> expected_revision then raise exception 'onboarding changed; refresh required' using errcode = '40001'; end if;
  select employee.user_id into target_employee_user_id
  from public.employee_profiles employee
  where employee.id = target_employee_id
    and employee.workspace_id = target_workspace_id;
  if review_action in ('accept_requirement', 'reject_requirement') then
    select * into requirement from public.employee_onboarding_requirements
    where id = target_requirement_id and case_id = target_case.id for update;
    if requirement.id is null or not requirement.requires_review then raise exception 'reviewable requirement unavailable' using errcode = 'P0002'; end if;
    if requirement.kind = 'document'::public.employee_onboarding_requirement_kind and not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'employee_documents.review') then
      raise exception 'employee document review required' using errcode = '42501';
    end if;
    if requirement.kind = 'profile'::public.employee_onboarding_requirement_kind and actor_system_key not in ('owner', 'admin') then
      raise exception 'owner or admin approval required for legal name changes' using errcode = '42501';
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
        expected_revision := public.activate_employee_onboarding_case_service(
          target_case.id,
          actor_user_id,
          'employee.auto_activated_after_review'
        );
      end if;
    end if;
  elsif review_action = 'activate' then
    if target_employee_user_id = actor_user_id then raise exception 'submitter cannot activate own onboarding' using errcode = '42501'; end if;
    if target_case.status <> 'submitted'::public.employee_onboarding_case_status then raise exception 'submitted onboarding required' using errcode = '23514'; end if;
    if not production_ready then raise exception 'sensitive infrastructure readiness required' using errcode = '55000'; end if;
    if exists (select 1 from public.employee_onboarding_requirements
      where case_id = target_case.id and required and blocks_activation and status <> 'completed'::public.employee_onboarding_requirement_status) then
      raise exception 'activation-blocking requirements remain' using errcode = '23514';
    end if;
    expected_revision := public.activate_employee_onboarding_case_service(
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

create or replace function public.get_employee_document_path_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid,
  target_requirement_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare document_path text;
begin
  if not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'employee_documents.review') then
    raise exception 'employee document review required' using errcode = '42501';
  end if;
  if not public.service_actor_can_access_employee(actor_user_id, target_workspace_id, target_employee_id) then
    raise exception 'employee document unavailable' using errcode = 'P0002';
  end if;
  select document.object_path into document_path
  from public.employee_documents document
  join public.employee_onboarding_requirements requirement
    on requirement.id = document.requirement_id
  where document.workspace_id = target_workspace_id
    and document.employee_id = target_employee_id
    and document.requirement_id = target_requirement_id
    and requirement.kind = 'document'
    and document.review_status <> 'superseded'
  order by document.version_number desc
  limit 1;
  if document_path is null then
    raise exception 'employee document unavailable' using errcode = 'P0002';
  end if;
  return document_path;
end;
$$;

revoke all on function public.service_actor_can_access_employee(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_employee_onboarding_review_service(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.review_employee_onboarding_service(uuid, uuid, uuid, text, uuid, text, integer, boolean) from public, anon, authenticated;
revoke all on function public.get_employee_document_path_service(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.service_actor_can_access_employee(uuid, uuid, uuid) to service_role;
grant execute on function public.get_employee_onboarding_review_service(uuid, uuid, uuid) to service_role;
grant execute on function public.review_employee_onboarding_service(uuid, uuid, uuid, text, uuid, text, integer, boolean) to service_role;
grant execute on function public.get_employee_document_path_service(uuid, uuid, uuid, uuid) to service_role;

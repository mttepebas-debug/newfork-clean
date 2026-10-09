create table if not exists public.employee_onboarding_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  final_approval_required boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table public.employee_onboarding_settings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'employee_onboarding_settings'
      and policyname = 'employee_onboarding_settings_select_member'
  ) then
    create policy employee_onboarding_settings_select_member
    on public.employee_onboarding_settings for select to authenticated
    using ((select public.is_workspace_member(workspace_id)));
  end if;
end
$$;

revoke all on public.employee_onboarding_settings from anon;
grant select on public.employee_onboarding_settings to authenticated;

create or replace function public.employee_onboarding_final_approval_required(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select setting.final_approval_required
    from public.employee_onboarding_settings setting
    where setting.workspace_id = target_workspace_id
  ), false);
$$;

create or replace function public.initialize_employee_onboarding_service(target_user_id uuid)
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
  select profile.* into employee
  from public.employee_profiles profile
  join public.workspace_memberships candidate
    on candidate.workspace_id = profile.workspace_id and candidate.user_id = profile.user_id
  where profile.user_id = target_user_id
    and profile.archived_at is null
    and candidate.status in ('pending_activation', 'active')
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
  end if;

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

create or replace function public.activate_employee_onboarding_case_service(
  target_case_id uuid,
  actor_user_id uuid,
  event_action text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_case public.employee_onboarding_cases%rowtype;
  next_revision integer;
  previous_actor text;
  membership_activated boolean;
begin
  select * into target_case
  from public.employee_onboarding_cases
  where id = target_case_id
  for update;

  if target_case.id is null then
    raise exception 'onboarding case unavailable' using errcode = 'P0002';
  end if;
  if exists (
    select 1
    from public.employee_onboarding_requirements
    where case_id = target_case.id
      and required
      and blocks_activation
      and status <> 'completed'::public.employee_onboarding_requirement_status
  ) then
    raise exception 'activation-blocking requirements remain' using errcode = '23514';
  end if;

  previous_actor := current_setting('request.jwt.claim.sub', true);
  perform set_config('request.jwt.claim.sub', '', true);
  update public.workspace_memberships
  set status = 'active', updated_at = now()
  where id = target_case.membership_id and status = 'pending_activation';
  membership_activated := found;
  perform set_config('request.jwt.claim.sub', coalesce(previous_actor, ''), true);

  if not membership_activated then
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

  return next_revision;
end;
$$;

create or replace function public.submit_employee_onboarding_service(
  target_user_id uuid,
  expected_revision integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_case public.employee_onboarding_cases%rowtype;
begin
  select onboarding.* into target_case
  from public.employee_onboarding_cases onboarding
  join public.employee_profiles employee on employee.id = onboarding.employee_id
  where employee.user_id = target_user_id
  for update of onboarding;

  if target_case.id is null or target_case.revision <> expected_revision then
    raise exception 'onboarding changed; refresh required' using errcode = '40001';
  end if;
  if exists (
    select 1
    from public.employee_onboarding_requirements
    where case_id = target_case.id
      and required
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

  if not public.employee_onboarding_final_approval_required(target_case.workspace_id)
    and not exists (
      select 1
      from public.employee_onboarding_requirements
      where case_id = target_case.id
        and required
        and blocks_activation
        and status <> 'completed'::public.employee_onboarding_requirement_status
    ) then
    return public.activate_employee_onboarding_case_service(
      target_case.id,
      target_user_id,
      'employee.auto_activated'
    );
  end if;

  return target_case.revision;
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

revoke all on function public.employee_onboarding_final_approval_required(uuid) from public, anon, authenticated;
revoke all on function public.activate_employee_onboarding_case_service(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.employee_onboarding_final_approval_required(uuid) to service_role;
grant execute on function public.activate_employee_onboarding_case_service(uuid, uuid, text) to service_role;

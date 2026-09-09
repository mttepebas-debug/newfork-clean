create or replace function public.employee_has_hard_document_schedule_conflict_service(
  target_workspace_id uuid,
  target_employee_id uuid,
  target_scheduled_date date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with active_document_requirements as (
    select distinct on (requirement.source_id)
      requirement.id as requirement_id
    from public.employee_onboarding_requirements requirement
    join public.document_types document_type
      on document_type.id = requirement.source_id
     and document_type.workspace_id = requirement.workspace_id
    where requirement.workspace_id = target_workspace_id
      and requirement.employee_id = target_employee_id
      and requirement.kind = 'document'::public.employee_onboarding_requirement_kind
      and requirement.status <> 'superseded'::public.employee_onboarding_requirement_status
      and document_type.archived_at is null
      and document_type.required_at_onboarding
      and document_type.tracks_expiry
      and document_type.expiry_schedule_impact = 'block'
    order by requirement.source_id, requirement.created_at desc, requirement.id
  ),
  latest_accepted_documents as (
    select distinct on (document.requirement_id)
      document.requirement_id,
      document.expiry_date
    from public.employee_documents document
    join active_document_requirements requirement
      on requirement.requirement_id = document.requirement_id
    where document.workspace_id = target_workspace_id
      and document.employee_id = target_employee_id
      and document.review_status = 'accepted'::public.employee_document_review_status
    order by document.requirement_id, document.version_number desc, document.id
  )
  select exists (
    select 1
    from latest_accepted_documents document
    where document.expiry_date is not null
      and document.expiry_date < target_scheduled_date
  );
$$;

create or replace function public.schedule_draft_has_hard_document_conflicts_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_draft_id uuid,
  target_week_start date,
  target_location_ids uuid[],
  target_department_ids uuid[] default null,
  include_no_department boolean default true
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_locations uuid[];
  normalized_departments uuid[];
  effective_include_no_department boolean := coalesce(include_no_department, true);
begin
  if not public.schedule_actor_has_capability_service(
    actor_user_id,
    target_workspace_id,
    'schedule.publish'
  ) then
    raise exception 'schedule publication scope denied' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct location_id order by location_id), '{}'::uuid[])
  into normalized_locations
  from unnest(coalesce(target_location_ids, '{}'::uuid[])) location_id;

  if cardinality(normalized_locations) = 0 then
    return false;
  end if;

  if target_department_ids is not null then
    select coalesce(array_agg(distinct department.id order by department.id), '{}'::uuid[])
    into normalized_departments
    from public.departments department
    join unnest(target_department_ids) requested(id)
      on requested.id = department.id
    where department.workspace_id = target_workspace_id
      and department.archived_at is null;
  end if;

  return exists (
    select 1
    from public.schedule_drafts draft
    join public.schedule_draft_shifts shift
      on shift.draft_id = draft.id
     and shift.workspace_id = draft.workspace_id
    where draft.id = target_draft_id
      and draft.workspace_id = target_workspace_id
      and draft.week_start = target_week_start
      and draft.archived_at is null
      and shift.employee_id is not null
      and shift.location_id = any(normalized_locations)
      and public.schedule_shift_in_department_scope_service(
        shift.job_id,
        normalized_departments,
        effective_include_no_department
      )
      and public.employee_has_hard_document_schedule_conflict_service(
        target_workspace_id,
        shift.employee_id,
        shift.scheduled_date
      )
  );
end;
$$;

alter function public.mutate_schedule_edit_shift_service(
  uuid, uuid, uuid, integer, text, uuid, integer, jsonb, uuid
) rename to mutate_schedule_edit_shift_service_document_conflict_base;

create function public.mutate_schedule_edit_shift_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_session_id uuid,
  expected_session_revision integer,
  operation text,
  target_shift_id uuid,
  expected_shift_revision integer default null,
  shift_payload jsonb default null,
  request_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  mutated_shift record;
begin
  result := public.mutate_schedule_edit_shift_service_document_conflict_base(
    actor_user_id,
    target_workspace_id,
    target_session_id,
    expected_session_revision,
    operation,
    target_shift_id,
    expected_shift_revision,
    shift_payload,
    request_idempotency_key
  );

  if operation in ('create', 'update') then
    select shift.employee_id, shift.scheduled_date
    into mutated_shift
    from public.schedule_edit_session_shifts shift
    where shift.workspace_id = target_workspace_id
      and shift.session_id = target_session_id
      and shift.id = target_shift_id
    limit 1;

    if mutated_shift.employee_id is not null
      and public.employee_has_hard_document_schedule_conflict_service(
        target_workspace_id,
        mutated_shift.employee_id,
        mutated_shift.scheduled_date
      ) then
      raise exception 'employee document hard conflict' using errcode = '23514';
    end if;
  end if;

  return result;
end;
$$;

alter function public.publish_schedule_draft_service(
  uuid, uuid, uuid, uuid[], integer, text, jsonb
) rename to publish_schedule_draft_service_document_conflict_legacy_base;

create function public.publish_schedule_draft_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_draft_id uuid,
  target_location_ids uuid[],
  expected_draft_revision integer,
  expected_fingerprint text,
  override_decisions jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  result := public.publish_schedule_draft_service_document_conflict_legacy_base(
    actor_user_id,
    target_workspace_id,
    target_draft_id,
    target_location_ids,
    expected_draft_revision,
    expected_fingerprint,
    override_decisions
  );

  if result->>'status' = 'published'
    and public.schedule_draft_has_hard_document_conflicts_service(
      actor_user_id,
      target_workspace_id,
      target_draft_id,
      (result->>'week_start')::date,
      target_location_ids,
      null,
      true
    ) then
    raise exception 'schedule has hard document blockers' using errcode = '23514';
  end if;

  return result;
end;
$$;

alter function public.publish_schedule_draft_service(
  uuid, uuid, uuid, uuid[], uuid[], boolean, integer, text, jsonb
) rename to publish_schedule_draft_service_document_conflict_base;

create function public.publish_schedule_draft_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_draft_id uuid,
  target_location_ids uuid[],
  target_department_ids uuid[],
  include_no_department boolean,
  expected_draft_revision integer,
  expected_fingerprint text,
  override_decisions jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  result := public.publish_schedule_draft_service_document_conflict_base(
    actor_user_id,
    target_workspace_id,
    target_draft_id,
    target_location_ids,
    target_department_ids,
    include_no_department,
    expected_draft_revision,
    expected_fingerprint,
    override_decisions
  );

  if result->>'status' = 'published'
    and public.schedule_draft_has_hard_document_conflicts_service(
      actor_user_id,
      target_workspace_id,
      target_draft_id,
      (result->>'week_start')::date,
      target_location_ids,
      target_department_ids,
      include_no_department
    ) then
    raise exception 'schedule has hard document blockers' using errcode = '23514';
  end if;

  return result;
end;
$$;

revoke all on function public.employee_has_hard_document_schedule_conflict_service(uuid, uuid, date)
from public, anon, authenticated;
revoke all on function public.schedule_draft_has_hard_document_conflicts_service(uuid, uuid, uuid, date, uuid[], uuid[], boolean)
from public, anon, authenticated;
revoke all on function public.mutate_schedule_edit_shift_service(uuid, uuid, uuid, integer, text, uuid, integer, jsonb, uuid)
from public, anon, authenticated;
revoke all on function public.publish_schedule_draft_service(uuid, uuid, uuid, uuid[], integer, text, jsonb)
from public, anon, authenticated;
revoke all on function public.publish_schedule_draft_service(uuid, uuid, uuid, uuid[], uuid[], boolean, integer, text, jsonb)
from public, anon, authenticated;

grant execute on function public.mutate_schedule_edit_shift_service(uuid, uuid, uuid, integer, text, uuid, integer, jsonb, uuid)
to service_role;
grant execute on function public.publish_schedule_draft_service(uuid, uuid, uuid, uuid[], integer, text, jsonb)
to service_role;
grant execute on function public.publish_schedule_draft_service(uuid, uuid, uuid, uuid[], uuid[], boolean, integer, text, jsonb)
to service_role;

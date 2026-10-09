create or replace function public.list_schedule_draft_document_conflicts_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_draft_id uuid,
  target_week_start date,
  target_location_ids uuid[],
  target_department_ids uuid[] default null,
  include_no_department boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  draft_week date;
  conflicts jsonb := '[]'::jsonb;
  fingerprint text := 'none';
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

  if exists (
    select 1
    from unnest(coalesce(target_location_ids, '{}'::uuid[])) requested(location_id)
    where not public.schedule_actor_has_capability_service(
      actor_user_id,
      target_workspace_id,
      'schedule.publish',
      requested.location_id
    )
  ) then
    raise exception 'schedule publication scope denied' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct location.id order by location.id), '{}'::uuid[])
  into normalized_locations
  from public.locations location
  join unnest(coalesce(target_location_ids, '{}'::uuid[])) requested(location_id)
    on requested.location_id = location.id
  where location.workspace_id = target_workspace_id
    and location.archived_at is null;

  if cardinality(normalized_locations) = 0 then
    return jsonb_build_object(
      'status', 'ok',
      'conflicts', conflicts,
      'fingerprint', fingerprint
    );
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

  select draft.week_start
  into draft_week
  from public.schedule_drafts draft
  where draft.id = target_draft_id
    and draft.workspace_id = target_workspace_id
    and draft.archived_at is null
  limit 1;

  if draft_week is null or draft_week <> target_week_start then
    return jsonb_build_object(
      'status', 'ok',
      'conflicts', conflicts,
      'fingerprint', fingerprint
    );
  end if;

  with candidate_shifts as (
    select
      shift.id,
      shift.location_id,
      location.name as location_name,
      shift.employee_id,
      trim(employee.first_name || ' ' || employee.last_name) as employee_name,
      shift.scheduled_date,
      to_char(shift.start_time, 'HH24:MI') as start_time,
      to_char(shift.end_time, 'HH24:MI') as end_time
    from public.schedule_draft_shifts shift
    join public.locations location
      on location.id = shift.location_id
     and location.workspace_id = shift.workspace_id
    join public.employee_profiles employee
      on employee.id = shift.employee_id
     and employee.workspace_id = shift.workspace_id
     and employee.archived_at is null
    where shift.workspace_id = target_workspace_id
      and shift.draft_id = target_draft_id
      and shift.employee_id is not null
      and shift.location_id = any(normalized_locations)
      and public.schedule_shift_in_department_scope_service(
        shift.job_id,
        normalized_departments,
        effective_include_no_department
      )
      and shift.scheduled_date >= target_week_start
      and shift.scheduled_date < target_week_start + 7
  ),
  active_document_requirements as (
    select distinct on (requirement.employee_id, requirement.source_id)
      requirement.employee_id,
      requirement.id as requirement_id,
      requirement.source_id as document_type_id,
      requirement.title as document_title
    from public.employee_onboarding_requirements requirement
    join public.document_types document_type
      on document_type.id = requirement.source_id
     and document_type.workspace_id = requirement.workspace_id
    where requirement.workspace_id = target_workspace_id
      and requirement.kind = 'document'::public.employee_onboarding_requirement_kind
      and requirement.status <> 'superseded'::public.employee_onboarding_requirement_status
      and document_type.archived_at is null
      and document_type.tracks_expiry
      and document_type.expiry_schedule_impact in ('warn', 'block')
    order by requirement.employee_id, requirement.source_id, requirement.created_at desc, requirement.id
  ),
  latest_accepted_documents as (
    select distinct on (document.workspace_id, document.requirement_id)
      document.*
    from public.employee_documents document
    where document.workspace_id = target_workspace_id
      and document.review_status = 'accepted'::public.employee_document_review_status
    order by document.workspace_id, document.requirement_id, document.version_number desc
  ),
  latest_pending_documents as (
    select distinct on (document.workspace_id, document.requirement_id)
      document.*
    from public.employee_documents document
    where document.workspace_id = target_workspace_id
      and document.review_status = 'awaiting_review'::public.employee_document_review_status
    order by document.workspace_id, document.requirement_id, document.version_number desc
  ),
  violation_rows as (
    select
      document_type.expiry_schedule_impact,
      document_type.expiry_policy_version,
      requirement.requirement_id,
      requirement.document_type_id,
      requirement.document_title,
      accepted.id as document_id,
      accepted.expiry_date,
      pending.id as pending_document_id,
      shift.id as shift_id,
      shift.location_id,
      shift.location_name,
      shift.employee_id,
      shift.employee_name,
      shift.scheduled_date,
      shift.start_time,
      shift.end_time
    from candidate_shifts shift
    join active_document_requirements requirement
      on requirement.employee_id = shift.employee_id
    join public.document_types document_type
      on document_type.id = requirement.document_type_id
     and document_type.workspace_id = target_workspace_id
    join latest_accepted_documents accepted
      on accepted.requirement_id = requirement.requirement_id
    left join latest_pending_documents pending
      on pending.requirement_id = requirement.requirement_id
    where accepted.expiry_date is not null
      and accepted.expiry_date < shift.scheduled_date
  ),
  conflict_rows as (
    select
      jsonb_build_object(
        'kind', 'document_expiry',
        'employee_id', employee_id,
        'employee_name', employee_name,
        'shift_id', shift_id,
        'location_id', location_id,
        'location_name', location_name,
        'date', scheduled_date,
        'start_time', start_time,
        'end_time', end_time,
        'document_type_id', document_type_id,
        'requirement_id', requirement_id,
        'document_id', document_id,
        'document_title', document_title,
        'expiry_date', expiry_date,
        'expiry_policy_version', expiry_policy_version,
        'pending_document_id', pending_document_id,
        'review_action', case when pending_document_id is null then null else 'review_document' end,
        'severity', case
          when expiry_schedule_impact = 'block' then 'hard'
          else 'soft'
        end,
        'overrideable', expiry_schedule_impact = 'warn',
        'warning_text', case
          when expiry_schedule_impact = 'block'
            then document_title || ' is expired and blocks scheduling.'
          else document_title || ' is expired.'
        end,
        'conflict_fingerprint', 'pending'
      ) as conflict,
      concat_ws(
        '|',
        employee_id,
        shift_id,
        document_type_id,
        requirement_id,
        document_id,
        pending_document_id,
        expiry_schedule_impact,
        expiry_policy_version,
        scheduled_date,
        expiry_date
      ) as conflict_key
    from violation_rows
    order by scheduled_date, start_time, shift_id, document_type_id
  )
  select coalesce(jsonb_agg(conflict), '[]'::jsonb),
         coalesce(
           encode(
             extensions.digest(
               convert_to(string_agg(conflict_key, E'\n' order by conflict_key), 'UTF8'),
               'sha256'
             ),
             'hex'
           ),
           'none'
         )
  into conflicts, fingerprint
  from conflict_rows;

  if fingerprint <> 'none' then
    conflicts := (
      select jsonb_agg(conflict - 'conflict_fingerprint' || jsonb_build_object(
        'conflict_fingerprint',
        fingerprint
      ))
      from jsonb_array_elements(conflicts) conflict
    );
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'conflicts', conflicts,
    'fingerprint', fingerprint
  );
end;
$$;

revoke all on function public.list_schedule_draft_document_conflicts_service(
  uuid,
  uuid,
  uuid,
  date,
  uuid[],
  uuid[],
  boolean
) from public, anon, authenticated;

grant execute on function public.list_schedule_draft_document_conflicts_service(
  uuid,
  uuid,
  uuid,
  date,
  uuid[],
  uuid[],
  boolean
) to service_role;

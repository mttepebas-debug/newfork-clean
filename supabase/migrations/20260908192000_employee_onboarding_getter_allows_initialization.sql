create or replace function public.get_employee_onboarding_service(target_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target_case public.employee_onboarding_cases%rowtype;
  employee public.employee_profiles%rowtype;
  membership public.workspace_memberships%rowtype;
  profile jsonb;
  availability jsonb;
  requirements jsonb;
  completed_count integer;
  total_count integer;
  first_path text;
begin
  perform public.initialize_employee_onboarding_service(target_user_id);
  select onboarding.* into target_case
  from public.employee_onboarding_cases onboarding
  join public.employee_profiles candidate on candidate.id = onboarding.employee_id
  where candidate.user_id = target_user_id
  order by onboarding.created_at limit 1;
  select * into employee from public.employee_profiles where id = target_case.employee_id;
  select * into membership from public.workspace_memberships where id = target_case.membership_id;

  select to_jsonb(private_profile) - 'created_at' - 'updated_at' - 'employee_id' - 'workspace_id'
  into profile from public.employee_private_profiles private_profile
  where private_profile.employee_id = employee.id;
  profile := coalesce(
    profile,
    jsonb_build_object(
      'legal_first_name', employee.first_name,
      'legal_last_name', employee.last_name
    )
  );

  select jsonb_build_object('timezone', version.timezone, 'days', version.recurring_rules)
  into availability from public.employee_availability_versions version
  where version.case_id = target_case.id order by version.version_number desc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', requirement.id,
    'kind', requirement.kind,
    'title', requirement.title,
    'description', requirement.description,
    'status', requirement.status,
    'required', requirement.required,
    'blocks_activation', requirement.blocks_activation,
    'requires_review', requirement.requires_review,
    'sort_order', requirement.sort_order,
    'source_id', requirement.source_id,
    'accepted_formats', coalesce(requirement.source_snapshot->'accepted_formats', '[]'::jsonb),
    'content_text', requirement.source_snapshot->>'content_text',
    'content_digest', requirement.source_snapshot->>'content_digest',
    'intent_statement', requirement.source_snapshot->>'intent_statement',
    'rejection_reason', requirement.rejection_reason
  ) order by requirement.sort_order, requirement.id), '[]'::jsonb),
  count(*) filter (where requirement.required),
  count(*) filter (where requirement.required and requirement.status in ('completed', 'awaiting_review'))
  into requirements, total_count, completed_count
  from public.employee_onboarding_requirements requirement
  where requirement.case_id = target_case.id and requirement.status <> 'superseded';

  select case requirement.kind
    when 'profile' then '/welcome/profile'
    when 'ssn' then '/welcome/review'
    when 'document' then '/welcome/documents/' || requirement.id
    when 'acknowledgement' then '/welcome/acknowledgements/' || requirement.id
    when 'availability' then '/welcome/availability'
  end into first_path
  from public.employee_onboarding_requirements requirement
  where requirement.case_id = target_case.id
    and requirement.required
    and requirement.status in ('not_started', 'in_progress', 'rejected', 'manual_follow_up')
  order by case when requirement.status = 'rejected' then 0 else 1 end,
    requirement.sort_order, requirement.id
  limit 1;
  first_path := coalesce(first_path,
    case when target_case.status = 'approved' then '/app/employee-hub' else '/welcome/review' end);

  return jsonb_build_object(
    'case_id', target_case.id,
    'workspace_id', target_case.workspace_id,
    'workspace_name', (select name from public.workspaces where id = target_case.workspace_id),
    'employee_id', employee.id,
    'employee_name', concat_ws(' ', employee.first_name, employee.last_name),
    'membership_id', membership.id,
    'membership_status', membership.status,
    'case_status', target_case.status,
    'revision', target_case.revision,
    'progress_completed', completed_count,
    'progress_total', total_count,
    'first_actionable_path', first_path,
    'ssn_status', jsonb_build_object(
      'present', false,
      'last_four', null
    ),
    'profile', profile,
    'availability', availability,
    'assignments', jsonb_build_object(
      'locations', coalesce((select jsonb_agg(location.name order by assignment.is_primary desc, location.name)
        from public.employee_location_assignments assignment join public.locations location on location.id = assignment.location_id
        where assignment.employee_id = employee.id and assignment.ended_at is null), '[]'::jsonb),
      'jobs', coalesce((select jsonb_agg(job.name order by assignment.is_primary desc, job.name)
        from public.employee_job_assignments assignment join public.jobs job on job.id = assignment.job_id
        where assignment.employee_id = employee.id and assignment.ended_at is null), '[]'::jsonb)
    ),
    'requirements', requirements
  );
end;
$$;

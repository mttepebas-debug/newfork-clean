-- FB-6.6, nf-guvenlik round 1, two low findings.
--   #3 the onboarding review counts only the rows its reader sees: a document
--      waiting for review that the reader may not decide on is neither listed
--      nor counted in progress_total / progress_completed (S2; a count is
--      information too).
--   #4 one's own onboarding read asks the core about the workspace of the case
--      it reads (by_case), as save, submit and leave do.

create or replace function public.get_employee_onboarding_review_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target_case public.employee_onboarding_cases%rowtype; requirement_rows jsonb; total_count integer; completed_count integer;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'onboarding.review', target_person => target_employee_id);
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
  where requirement.case_id = target_case.id and requirement.status <> 'superseded' and requirement.lifecycle_retired_at is null
    -- a row the reader may not see is not counted either (S2)
    and (requirement.kind <> 'document' or app_private.document_row_readable(actor_user_id, requirement));
  return jsonb_build_object(
    'case_id', target_case.id, 'employee_id', target_case.employee_id,
    'case_status', target_case.status, 'revision', target_case.revision,
    'submitted_at', target_case.submitted_at,
    'progress_completed', completed_count, 'progress_total', total_count,
    'ssn_present', false,
    'requirements', requirement_rows
  );
end;
$function$;

create or replace function public.get_employee_onboarding_service(target_user_id uuid, target_workspace_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_case public.employee_onboarding_cases%rowtype;
  employee public.employee_profiles%rowtype;
  membership public.workspace_memberships%rowtype;
  profile jsonb;
  requirements jsonb;
  completed_count integer;
  total_count integer;
  first_path text;
begin
 perform app_private.authorize(target_user_id, app_private.onboarding_self_workspace(target_user_id, target_workspace_id, true), 'onboarding.self');
  perform app_private.initialize_employee_onboarding(target_user_id, target_workspace_id);
  select onboarding.* into target_case
  from public.employee_onboarding_cases onboarding
  where onboarding.id = app_private.employee_onboarding_case_id(target_user_id, target_workspace_id);
  if target_case.id is null then
    raise exception 'employee onboarding is unavailable' using errcode = 'P0002';
  end if;
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


  select coalesce(jsonb_agg(jsonb_build_object(
    'id', requirement.id,
    'kind', requirement.kind,
    'title', requirement.title,
    'description', requirement.description,
    'status', requirement.status,
    'required', requirement.required,'document_mode',requirement.lifecycle_settings->>'mode', 'conditional_reason',requirement.conditional_reason,
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
  count(*) filter (where requirement.required or (requirement.kind='document' and requirement.lifecycle_settings->>'mode'='conditional')),
  count(*) filter (where (requirement.required and requirement.status in ('completed', 'awaiting_review')) or (requirement.kind='document' and requirement.lifecycle_settings->>'mode'='conditional' and not app_private.document_initial_action_missing(requirement)))
  into requirements, total_count, completed_count
  from public.employee_onboarding_requirements requirement
  where requirement.case_id = target_case.id and requirement.status <> 'superseded' and requirement.lifecycle_retired_at is null and (requirement.kind<>'document' or (not requirement.lifecycle_exempt and requirement.lifecycle_closed_at is null));

  select case requirement.kind
    when 'profile' then '/welcome/profile'
    when 'ssn' then '/welcome/review'
    when 'document' then '/welcome/documents/' || requirement.id
    when 'acknowledgement' then '/welcome/acknowledgements/' || requirement.id
    when 'availability' then '/welcome/availability'
  end into first_path
  from public.employee_onboarding_requirements requirement
  where requirement.case_id = target_case.id
    and (requirement.required or app_private.document_initial_action_missing(requirement))
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
    'assignments', jsonb_build_object(
      'locations', coalesce((select jsonb_agg(location.name order by assignment.is_primary desc, location.name)
        from public.employee_location_assignments assignment join public.locations location on location.id = assignment.location_id
        where assignment.employee_id = employee.id and assignment.ended_at is null), '[]'::jsonb),
      'jobs', coalesce((select jsonb_agg(job.name order by assignment.is_primary desc, lower(job.name), job.id)
        from public.employee_job_assignments assignment join public.jobs job on job.id = assignment.job_id
        where assignment.employee_id = employee.id and assignment.ended_at is null), '[]'::jsonb)
    ),
    'requirements', requirements
  );
end;
$function$;

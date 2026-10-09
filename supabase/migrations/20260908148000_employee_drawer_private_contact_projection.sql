create or replace function public.get_employee_detail(target_workspace_id uuid, target_employee_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when employee.id is null then null else jsonb_build_object(
    'id', employee.id, 'workspace_id', employee.workspace_id,
    'employee_code', employee.employee_code, 'first_name', employee.first_name,
    'last_name', employee.last_name, 'preferred_name', employee.preferred_name,
    'display_name', concat_ws(' ', employee.first_name, employee.last_name),
    'invitation_email', employee.invitation_email, 'start_date', employee.start_date,
    'primary_location_id', primary_location.location_id, 'primary_location_name', location.name,
    'location_count', (select count(*) from public.employee_location_assignments a where a.employee_id = employee.id and a.ended_at is null),
    'primary_job_id', primary_job.job_id, 'primary_job_name', job.name,
    'job_count', (select count(*) from public.employee_job_assignments a where a.employee_id = employee.id and a.ended_at is null),
    'role_name', role.name,
    'display_status', case when employee.archived_at is not null then 'archived' when membership.status = 'active' then 'active' when membership.status = 'pending_activation' then 'onboarding' when invitation.status = 'pending' and invitation.expires_at > now() then 'invited' else 'not_invited' end,
    'archived_at', employee.archived_at, 'revision', employee.revision,
    'user_id', employee.user_id, 'internal_note', employee.internal_note,
    'private_contact', case when private_profile.employee_id is null then null else jsonb_build_object(
      'phone', private_profile.phone,
      'date_of_birth', private_profile.date_of_birth,
      'emergency_contact_name', private_profile.emergency_contact_name,
      'emergency_contact_phone', private_profile.emergency_contact_phone,
      'share_phone_with_teammates', private_profile.share_phone_with_teammates,
      'share_email_with_teammates', private_profile.share_email_with_teammates
    ) end,
    'locations', coalesce((select jsonb_agg(jsonb_build_object('id', a.location_id, 'name', l.name, 'primary', a.is_primary, 'archived', l.archived_at is not null) order by a.is_primary desc, l.name) from public.employee_location_assignments a join public.locations l on l.id = a.location_id where a.employee_id = employee.id and a.ended_at is null), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(jsonb_build_object('id', a.job_id, 'name', j.name, 'primary', a.is_primary, 'archived', j.archived_at is not null) order by a.is_primary desc, j.name) from public.employee_job_assignments a join public.jobs j on j.id = a.job_id where a.employee_id = employee.id and a.ended_at is null), '[]'::jsonb),
    'invitation', case when invitation.id is null then null else jsonb_build_object('id', invitation.id, 'email', invitation.email, 'role_id', invitation.role_id, 'status', invitation.status, 'expires_at', invitation.expires_at, 'sent_at', invitation.sent_at) end,
    'onboarding', jsonb_build_object('status', case when membership.status = 'pending_activation' then 'in_progress' when invitation.status = 'pending' then 'invited' else 'not_requested' end, 'required_documents', (select count(*) from public.document_types d where d.workspace_id = employee.workspace_id and d.required_at_onboarding and d.archived_at is null), 'completed_documents', 0),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', event.id, 'action', event.action, 'occurred_at', event.occurred_at, 'actor_user_id', event.actor_user_id, 'summary', event.summary) order by event.occurred_at desc) from (select * from public.employee_events where employee_id = employee.id order by occurred_at desc limit 50) event), '[]'::jsonb)
  ) end
  from public.employee_profiles employee
  left join public.employee_private_profiles private_profile on private_profile.employee_id = employee.id
  left join public.employee_location_assignments primary_location on primary_location.employee_id = employee.id and primary_location.ended_at is null and primary_location.is_primary
  left join public.locations location on location.id = primary_location.location_id
  left join public.employee_job_assignments primary_job on primary_job.employee_id = employee.id and primary_job.ended_at is null and primary_job.is_primary
  left join public.jobs job on job.id = primary_job.job_id
  left join public.workspace_memberships membership on membership.workspace_id = employee.workspace_id and membership.user_id = employee.user_id
  left join public.workspace_roles role on role.id = membership.role_id
  left join lateral (select * from public.employee_invitations i where i.employee_id = employee.id order by i.created_at desc limit 1) invitation on true
  where employee.id = target_employee_id and employee.workspace_id = target_workspace_id
    and public.workspace_has_permission(target_workspace_id, 'employees.read')
    and public.can_access_employee(target_workspace_id, employee.id);
$$;

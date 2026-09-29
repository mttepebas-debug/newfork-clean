-- BL-218 .3 (code review): Employees > the list's Job column and its sort
-- read primary_job_name, which was only the stored primary job. Since .3b
-- somebody whose only job is under Management is an ordinary record with no
-- stored primary, and the list showed them as "Unassigned" while Schedule
-- placed them under Manager. A Management job is primary by its department
-- (REUSE), so the list names the job a person works as the Schedule places
-- the row: the stored primary job; failing that the first Management job in
-- the catalog's order; then the first job (an archived job is only named as a
-- stored primary, as before).
-- Example: Ayse only manages: the list says Manager. Emre is Remote and cooks
-- with no primary: Cook.
-- primary_job_id stays the stored primary (or null).

CREATE OR REPLACE FUNCTION public.list_employees(target_workspace_id uuid, include_archived boolean DEFAULT false, search_text text DEFAULT ''::text, status_filter text DEFAULT 'all'::text, page_limit integer DEFAULT 100, page_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, workspace_id uuid, employee_code text, first_name text, last_name text, preferred_name text, display_name text, invitation_email text, start_date date, primary_location_id uuid, primary_location_name text, location_count bigint, primary_job_id uuid, primary_job_name text, job_count bigint, role_name text, display_status text, archived_at timestamp with time zone, revision integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with directory as (
    select employee.id, employee.workspace_id, employee.employee_code,
      employee.first_name, employee.last_name, employee.preferred_name,
      concat_ws(' ', coalesce(nullif(employee.preferred_name, ''), employee.first_name), employee.last_name) as display_name,
      employee.invitation_email, employee.start_date,
      primary_location.location_id as primary_location_id,
      location.name as primary_location_name,
      (select count(*) from public.employee_location_assignments a where a.employee_id = employee.id and a.ended_at is null) as location_count,
      primary_job.job_id as primary_job_id, listed_job.name as primary_job_name,
      (select count(*) from public.employee_job_assignments a where a.employee_id = employee.id and a.ended_at is null) as job_count,
      role.name as role_name,
      case
        when employee.archived_at is not null then 'archived'
        when membership.status = 'active' then 'active'
        when onboarding.status in ('submitted', 'changes_requested') then 'needs_attention'
        when membership.status = 'pending_activation' then 'onboarding'
        when invitation.status = 'pending' and invitation.expires_at > now() then 'invited'
        else 'not_invited'
      end as display_status,
      employee.archived_at, employee.revision
    from public.employee_profiles employee
    left join public.employee_location_assignments primary_location on primary_location.employee_id = employee.id and primary_location.ended_at is null and primary_location.is_primary
    left join public.locations location on location.id = primary_location.location_id
    left join public.employee_job_assignments primary_job on primary_job.employee_id = employee.id and primary_job.ended_at is null and primary_job.is_primary
    -- The job the list names: the stored primary; failing that the first
    -- Management job in the catalog's order, then the first job.
    left join lateral (
      select job.name
      from public.employee_job_assignments assignment
      join public.jobs job on job.id = assignment.job_id
      left join public.departments department on department.id = job.department_id
      where assignment.employee_id = employee.id and assignment.ended_at is null
        and (assignment.is_primary or job.archived_at is null)
      order by assignment.is_primary desc, coalesce(department.system_key = 'management', false) desc,
        job.sort_order, job.name, job.id
      limit 1
    ) listed_job on true
    left join public.workspace_memberships membership on membership.workspace_id = employee.workspace_id and membership.user_id = employee.user_id
    left join public.workspace_roles role on role.id = membership.role_id
    left join public.employee_onboarding_cases onboarding on onboarding.employee_id = employee.id
    left join lateral (
      select candidate.status, candidate.expires_at
      from public.employee_invitations candidate
      where candidate.employee_id = employee.id
      order by candidate.created_at desc limit 1
    ) invitation on true
    where employee.workspace_id = target_workspace_id
      and public.workspace_has_permission(target_workspace_id, 'employees.read')
      and public.can_access_employee(target_workspace_id, employee.id)
      and (include_archived = (employee.archived_at is not null))
  )
  select * from directory
  where (
      btrim(search_text) = ''
      or concat_ws(
        ' ',
        first_name,
        last_name,
        preferred_name,
        employee_code,
        invitation_email,
        primary_location_name,
        primary_job_name
      ) ilike '%' || btrim(search_text) || '%'
    )
    and (status_filter = 'all' or display_status = status_filter)
  order by lower(display_name), id
  limit least(greatest(page_limit, 1), 200)
  offset greatest(page_offset, 0);
$function$;

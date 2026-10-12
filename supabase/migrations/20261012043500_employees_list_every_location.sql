-- BL-436 / BL-428 (EKRAN-03 K6, G3): a row of the Employees list names every
-- location the person works at, not only the primary one with a count. The
-- screen's location filter now means "works here" and its location cell names
-- the first location ("Kadikoy +1" for the owner, who works everywhere with no
-- primary, instead of "Unassigned +1").
-- Who is listed does not change: the same core check per row (M2, a manager
-- lists the people working at their own locations); a manager already read the
-- names of all of a listed person's locations (BL-417).
--   locations: [{id, name, primary}], the primary first, then A to Z (BL-475).
--   It replaces primary_location_id, primary_location_name and location_count.
-- Search matches any of the person's location names, not only the primary's.
-- The return type changes, so the function is dropped and made again with the
-- same arguments and grants.

drop function public.list_employees_service(uuid, uuid, boolean, text, text, integer, integer);

CREATE FUNCTION public.list_employees_service(actor_user_id uuid, target_workspace_id uuid, include_archived boolean DEFAULT false, search_text text DEFAULT ''::text, status_filter text DEFAULT 'all'::text, page_limit integer DEFAULT 100, page_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, workspace_id uuid, employee_code text, first_name text, last_name text, preferred_name text, display_name text, invitation_email text, start_date date, locations jsonb, primary_job_id uuid, primary_job_name text, job_count bigint, role_name text, display_status text, archived_at timestamp with time zone, revision integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me app_private.actor_state := app_private.actor(actor_user_id, target_workspace_id);
  rule_row app_private.authz_actions;
  reason text;
begin
  select * into rule_row from app_private.authz_actions action where action.key = 'employee.list';
  if not found then
    raise exception 'core action employee.list is missing' using errcode = '22023';
  end if;
  -- May they list anybody at all; who, is answered row by row.
  reason := app_private.authz_check(me, rule_row, null, null, null);
  if reason is not null and reason <> 'out_of_scope' then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || reason, detail = 'employee.list';
  end if;

  return query
  with directory as (
    select employee.id, employee.workspace_id, employee.employee_code,
      employee.first_name, employee.last_name, employee.preferred_name,
      concat_ws(' ', coalesce(nullif(employee.preferred_name, ''), employee.first_name), employee.last_name) as display_name,
      employee.invitation_email, employee.start_date,
      -- Every location they work at, the primary first, then A to Z (BL-436).
      coalesce((
        select jsonb_agg(jsonb_build_object('id', place.id, 'name', place.name, 'primary', assignment.is_primary)
          order by assignment.is_primary desc, lower(place.name), place.id)
        from public.employee_location_assignments assignment
        join public.locations place on place.id = assignment.location_id
        where assignment.employee_id = employee.id and assignment.ended_at is null
      ), '[]'::jsonb) as locations,
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
    left join public.employee_job_assignments primary_job on primary_job.employee_id = employee.id and primary_job.ended_at is null and primary_job.is_primary
    -- The job the list names: the stored primary; failing that the Owner job
    -- (the owner's, never stored as primary), then the first job in the
    -- catalog's order (A to Z, BL-475).
    left join lateral (
      select job.name
      from public.employee_job_assignments assignment
      join public.jobs job on job.id = assignment.job_id
      where assignment.employee_id = employee.id and assignment.ended_at is null
        and (assignment.is_primary or job.archived_at is null)
      order by assignment.is_primary desc, coalesce(job.system_key = 'owner', false) desc,
        lower(job.name), job.id
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
      and (include_archived = (employee.archived_at is not null))
      and app_private.authz_check(me, rule_row, null, employee.id, null) is null
  )
  select * from directory
  where (
      btrim(search_text) = ''
      or concat_ws(
        ' ',
        directory.first_name,
        directory.last_name,
        directory.preferred_name,
        directory.employee_code,
        directory.invitation_email,
        (select string_agg(place ->> 'name', ' ') from jsonb_array_elements(directory.locations) place),
        directory.primary_job_name
      ) ilike '%' || btrim(search_text) || '%'
    )
    and (status_filter = 'all' or directory.display_status = status_filter)
  order by lower(directory.display_name), directory.id
  limit least(greatest(page_limit, 1), 200)
  offset greatest(page_offset, 0);
end;
$function$;
revoke all on function public.list_employees_service(uuid, uuid, boolean, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.list_employees_service(uuid, uuid, boolean, text, text, integer, integer) to service_role;

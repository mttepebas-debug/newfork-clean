-- ROL-CIFT 3.3, part 4 of 4 of one_decision_chain: its own piece, as the read's columns change;
-- runs after part 3.
-- KARARLAR S-179: Employees -> the Access column names the app a person reaches: Employee, Management,
-- Management + Employee or No access (no account). The list read the one role the membership held
-- (coalesce of the two slots), so a dual-role person showed only their management role; it now
-- answers the two slots apart (management_access, employee_access) instead of role_name. The rank
-- (Owner, Admin, Manager) stays in the drawer's Access section. RETURNS TABLE changes, so the
-- function is dropped and made again with the same arguments, owner and grants.

drop function public.list_employees_service(uuid, uuid, boolean, text, text, integer, integer);

CREATE FUNCTION "public"."list_employees_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "include_archived" boolean DEFAULT false, "search_text" "text" DEFAULT ''::"text", "status_filter" "text" DEFAULT 'all'::"text", "page_limit" integer DEFAULT 100, "page_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "workspace_id" "uuid", "employee_code" "text", "first_name" "text", "last_name" "text", "preferred_name" "text", "display_name" "text", "invitation_email" "text", "start_date" "date", "locations" "jsonb", "primary_job_id" "uuid", "primary_job_name" "text", "job_count" bigint, "management_access" boolean, "employee_access" boolean, "display_status" "text", "archived_at" timestamp with time zone, "revision" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
      primary_job.job_id as primary_job_id, app_private.listed_job_name(employee.id) as primary_job_name,
      (select count(*) from public.employee_job_assignments a where a.employee_id = employee.id and a.ended_at is null) as job_count,
      -- The two access slots apart (KARARLAR S-179): which app the person reaches, not a rank.
      membership.role_id is not null as management_access,
      -- No membership (not joined yet, no account) reaches neither app: No access.
      membership.employee_role_id is not null as employee_access,
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
    left join public.workspace_memberships membership on membership.workspace_id = employee.workspace_id and membership.user_id = employee.user_id
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
$$;

revoke all on function public.list_employees_service(uuid, uuid, boolean, text, text, integer, integer) from public;
grant all on function public.list_employees_service(uuid, uuid, boolean, text, text, integer, integer) to service_role;

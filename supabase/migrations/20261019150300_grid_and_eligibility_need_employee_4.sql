-- ROL-CIFT 2.1, part 4 of 4 of grid_and_eligibility_need_employee: split at statement boundaries to go live in pieces;
-- runs after part 3.

CREATE OR REPLACE FUNCTION "app_private"."place_single_role"("target_membership" "uuid", "chosen_role" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  member public.workspace_memberships;
  chosen_class public.workspace_role;
  profile_id uuid;
  works boolean;
  asked text := current_setting('app.membership_change', true);
begin
  select * into member from public.workspace_memberships m where m.id = target_membership;
  select r.access_class into chosen_class from public.workspace_roles r
  where r.id = chosen_role and r.workspace_id = member.workspace_id;
  if member.id is null or chosen_class is null then
    raise exception 'role must belong to the workspace' using errcode = '23503';
  end if;
  -- Nobody becomes the owner this way (an invitation reopening a suspended account, a role change, a
  -- restored access): only an ownership transfer makes an owner, as the membership guard says.
  if chosen_class = 'owner' and member.role_id is distinct from chosen_role then
    raise exception 'membership change is not permitted' using errcode = '42501', hint = 'authz.missing_permission';
  end if;
  select p.id into profile_id from public.employee_profiles p
  where p.workspace_id = member.workspace_id and p.user_id = member.user_id and p.archived_at is null;
  works := chosen_class = 'employee' or exists (
    select 1 from public.employee_job_assignments a
    join public.jobs j on j.id = a.job_id and j.deleted_at is null
    left join public.departments d on d.id = j.department_id
    where a.employee_id = profile_id and a.ended_at is null and d.system_key is distinct from 'management');

  perform set_config('app.membership_change', member.id::text, true);
  update public.workspace_memberships
  set role_id = case when chosen_class = 'employee' then null else chosen_role end,
      -- ROL-CIFT 2.1 (KARARLAR S-167): a management role is added beside the employee access, never
      -- in its place: whoever holds it keeps it. Without it, they get it when they work a job outside
      -- Management. Giving the employee access up is its own step (slice 4).
      employee_role_id = case
        when chosen_class = 'employee' then chosen_role
        when member.employee_role_id is not null then member.employee_role_id
        when works then (
          select r.id from public.workspace_roles r where r.workspace_id = member.workspace_id and r.system_key = 'employee')
      end,
      updated_at = now()
  where id = member.id;

  perform app_private.manages_follow_works(member.id);

  if chosen_class <> 'employee' then
    insert into public.membership_management_jobs (workspace_id, membership_id, job_id)
    select member.workspace_id, member.id, a.job_id
    from public.employee_job_assignments a
    join public.jobs j on j.id = a.job_id and j.archived_at is null and j.deleted_at is null
    join public.departments d on d.id = j.department_id and d.system_key = 'management'
    where a.employee_id = profile_id and a.ended_at is null
      and (j.system_key is null or chosen_class = 'owner')
    on conflict (membership_id, job_id) do nothing;
    if not exists (select 1 from public.membership_management_jobs x where x.membership_id = member.id) then
      insert into public.membership_management_jobs (workspace_id, membership_id, job_id)
      select member.workspace_id, member.id, j.id
      from public.jobs j
      join public.departments d on d.id = j.department_id and d.system_key = 'management'
      where j.workspace_id = member.workspace_id and j.archived_at is null and j.deleted_at is null
        and (j.system_key is null or chosen_class = 'owner')
      order by case
        when chosen_class = 'owner' and j.system_key = 'owner' then 0
        when lower(j.name) = 'manager' then 1
        when lower(j.name) = 'general manager' then 2
        else 3 end, lower(j.name)
      limit 1;
    end if;
  end if;
  perform set_config('app.membership_change', coalesce(asked, ''), true);
end;
$$;

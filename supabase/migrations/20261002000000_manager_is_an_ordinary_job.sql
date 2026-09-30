-- EMP-001 C1: Manager is an ordinary job, and only the Owner job is special.
--
-- Setup now makes a Manager job under Management next to Owner. Manager has no
-- system key: it is renamed, archived, deleted and chosen as a primary job like
-- any job. "A job under Management is primary by its department" (BL-218) and
-- "somebody with only Management jobs saves with no primary job" (BL-218 .3b)
-- are undone; the one job never stored as primary is Owner.
--
--   1. Setup makes Manager once, with Management.
--   2. The assignment rule refuses a primary mark on the Owner job only.
--   3. A job moved under Management keeps its primary mark (trigger dropped).
--   4. Save: not the owner, not Remote, not excluded -> a location, a primary
--      location, a job and a primary job.
--   5. Settings > Jobs: the first job given is the primary one, Manager too;
--      a primary mark that loses its job falls to any next job but Owner.
--   6. Employees list names the stored primary, else Owner, else the first job.
--   7. Setup counts jobs outside Management (K2).
--   8. The Management helper has no caller left.
--   9. Workspaces already set up get their Manager job.

-- 1. Setup makes Manager once, with Management ---------------------------------------

create or replace function app_private.ensure_management_and_owner(target_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  made_management uuid;
begin
  insert into public.departments (workspace_id, name, system_key)
  values (target_workspace_id, 'Management', 'management')
  on conflict (workspace_id, system_key) where system_key is not null do nothing
  returning id into made_management;
  -- Manager is made with Management and never again: it is an ordinary job, so
  -- an owner who deletes it does not get it back on the next setup save. A job
  -- of that name already there is left alone.
  if made_management is not null then
    insert into public.jobs (workspace_id, name, department_id)
    values (target_workspace_id, 'Manager', made_management)
    on conflict (workspace_id, lower(name)) where archived_at is null do nothing;
  end if;
  insert into public.jobs (workspace_id, name, department_id, system_key)
  select target_workspace_id, 'Owner', department.id, 'owner'
  from public.departments department
  where department.workspace_id = target_workspace_id and department.system_key = 'management'
  on conflict (workspace_id, system_key) where system_key is not null do nothing;
end;
$function$;

-- 2. Only the Owner job is never primary ---------------------------------------------

CREATE OR REPLACE FUNCTION app_private.keep_job_assignment_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.ended_at is not null then
    -- The owner keeps the Owner job (S1 a); a change of ownership moves the
    -- membership first, so the old owner's assignment ends as anyone's.
    if tg_op = 'UPDATE' and old.ended_at is null
       and exists (select 1 from public.jobs job where job.id = new.job_id and job.system_key = 'owner')
       and app_private.employee_record_is_workspace_owner(new.workspace_id, new.employee_id) then
      raise exception 'The owner keeps the Owner job'
        using errcode = '23514', hint = 'employee.owner_job';
    end if;
    return new;
  end if;
  if exists (select 1 from public.jobs job where job.id = new.job_id and job.system_key = 'owner')
     and not app_private.employee_record_is_workspace_owner(new.workspace_id, new.employee_id) then
    raise exception 'Only the workspace owner works the Owner job'
      using errcode = '42501', hint = 'authz.owner_only';
  end if;
  -- Every job can be somebody's primary job but Owner (EMP-001 S2).
  if new.is_primary
     and exists (select 1 from public.jobs job where job.id = new.job_id and job.system_key = 'owner') then
    raise exception 'The Owner job is never marked primary'
      using errcode = '23514', hint = 'employee.management_primary';
  end if;
  return new;
end;
$function$;

-- 3. A job moved under Management keeps its primary mark -----------------------------

drop trigger jobs_under_management_are_primary on public.jobs;
drop function app_private.management_jobs_are_primary_by_department();

-- 4. Save asks everybody but the owner, Remote and excluded for a primary job -------

CREATE OR REPLACE FUNCTION public.save_employee_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid, employee_first_name text, employee_middle_name text, employee_last_name text, employee_preferred_name text, employee_invitation_email text, employee_start_date date, employee_internal_note text, location_ids uuid[], primary_location_id uuid, job_ids uuid[], primary_job_id uuid, employee_is_remote boolean, employee_is_excluded_from_schedule boolean, expected_revision integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  saved_id uuid := target_employee_id;
  reachable uuid[];
  current_revision integer;
  next_code bigint;
  assignment_optional boolean := coalesce(employee_is_remote, false) or coalesce(employee_is_excluded_from_schedule, false);
begin
  -- A new record is asked where it will work (a manager only where they
  -- manage, never nowhere); an existing one, whose it is.
  if target_employee_id is null then
    perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.create',
      coalesce(location_ids, '{}'::uuid[]));
  else
    perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.save',
      target_person => target_employee_id);
  end if;

  if char_length(btrim(employee_first_name)) not between 1 and 80 or char_length(btrim(employee_last_name)) not between 1 and 80 then
    raise exception 'employee first and last name are required' using errcode = '22023';
  end if;
  -- Somebody not Remote nor excluded from Schedule needs a location, a primary
  -- location, a job and a primary job; any job can be the primary one, under
  -- Management too (EMP-001 S2). The owner's record needs none of it: the owner
  -- may work anywhere, and their Owner job is never primary.
  if not assignment_optional and not app_private.employee_record_is_workspace_owner(target_workspace_id, target_employee_id) then
    if cardinality(coalesce(location_ids, '{}'::uuid[])) = 0 or primary_location_id is null then
      raise exception 'employee requires a location and job unless remote or excluded from schedule'
        using errcode = '22023', hint = 'employee.location_required';
    end if;
    if cardinality(coalesce(job_ids, '{}'::uuid[])) = 0 then
      raise exception 'employee requires a location and job unless remote or excluded from schedule'
        using errcode = '22023', hint = 'employee.job_required';
    end if;
    if primary_job_id is null then
      raise exception 'employee requires a primary job unless remote or excluded from schedule'
        using errcode = '22023', hint = 'employee.primary_job_required';
    end if;
  end if;
  if primary_location_id is not null and not primary_location_id = any(coalesce(location_ids, '{}'::uuid[])) then
    raise exception 'primary location must be assigned' using errcode = '22023';
  end if;
  if primary_job_id is not null and not primary_job_id = any(coalesce(job_ids, '{}'::uuid[])) then
    raise exception 'primary job must be assigned' using errcode = '22023';
  end if;

  -- A location added or taken away is one the actor reaches; an unknown or
  -- archived one reads the same.
  reachable := app_private.scope_set(actor_user_id, target_workspace_id, 'employee.save');
  if exists (
      select 1 from unnest(coalesce(location_ids, '{}'::uuid[])) selected(location_id)
      left join public.locations location
        on location.id = selected.location_id and location.workspace_id = target_workspace_id and location.archived_at is null
      where location.id is null
         or (not selected.location_id = any (reachable) and not exists (
           select 1 from public.employee_location_assignments existing
           where existing.employee_id = target_employee_id and existing.location_id = selected.location_id
             and existing.ended_at is null))
    )
    or exists (
      select 1 from public.employee_location_assignments existing
      where existing.employee_id = target_employee_id and existing.ended_at is null
        and not existing.location_id = any (coalesce(location_ids, '{}'::uuid[]))
        and not existing.location_id = any (reachable)
    ) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'employee.save';
  end if;
  if exists (select 1 from unnest(coalesce(job_ids, '{}'::uuid[])) selected(job_id) left join public.jobs j on j.id = selected.job_id and j.workspace_id = target_workspace_id and j.archived_at is null where j.id is null) then
    raise exception 'invalid employee job' using errcode = '22023';
  end if;

  if saved_id is null then
    insert into public.workspace_employee_counters (workspace_id, next_value)
    values (target_workspace_id, 1)
    on conflict (workspace_id) do nothing;

    update public.workspace_employee_counters counter
    set next_value = greatest(
      counter.next_value,
      coalesce((
        select max(substring(employee.employee_code from 3)::bigint) + 1
        from public.employee_profiles employee
        where employee.workspace_id = target_workspace_id
          and employee.employee_code ~ '^E-[0-9]{4,}$'
      ), 1)
    ) + 1
    where counter.workspace_id = target_workspace_id
    returning counter.next_value - 1 into next_code;

    insert into public.employee_profiles (
      workspace_id, employee_code, first_name, middle_name, last_name, preferred_name,
      invitation_email, start_date, internal_note, is_remote,
      is_excluded_from_schedule, created_by
    )
    values (
      target_workspace_id, 'E-' || lpad(next_code::text, 4, '0'),
      btrim(employee_first_name), left(btrim(coalesce(employee_middle_name, '')), 80), btrim(employee_last_name),
      '',
      nullif(lower(btrim(employee_invitation_email)), ''),
      employee_start_date, btrim(coalesce(employee_internal_note, '')),
      coalesce(employee_is_remote, false),
      coalesce(employee_is_excluded_from_schedule, false),
      actor_user_id
    )
    returning id into saved_id;
    insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
    values (target_workspace_id, saved_id, actor_user_id, 'employee.created', 'Employee record created');
  else
    select revision into current_revision from public.employee_profiles
    where id = saved_id and workspace_id = target_workspace_id and archived_at is null
    for update;
    if current_revision is null then raise exception 'employee not found' using errcode = 'P0002'; end if;
    if expected_revision is null or expected_revision <> current_revision then raise exception 'employee revision conflict' using errcode = '40001'; end if;
    -- The preferred name is not the drawer's: it changes by request and answer.
    update public.employee_profiles set
      first_name = btrim(employee_first_name),
      middle_name = left(btrim(coalesce(employee_middle_name, '')), 80),
      last_name = btrim(employee_last_name),
      invitation_email = nullif(lower(btrim(employee_invitation_email)), ''),
      start_date = employee_start_date,
      internal_note = btrim(coalesce(employee_internal_note, '')),
      is_remote = coalesce(employee_is_remote, false),
      is_excluded_from_schedule = coalesce(employee_is_excluded_from_schedule, false),
      revision = revision + 1,
      updated_at = now()
    where id = saved_id;
    insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
    values (target_workspace_id, saved_id, actor_user_id, 'employee.updated', 'Employee profile and assignments updated');
  end if;

  -- Only what changed is written (BL-218): a kept assignment keeps its row, so
  -- the rules on the assignment tables (the owner stays at every location, the
  -- Owner job stays the owner's) judge a real removal, not every save. The
  -- primary flag is cleared before it is set, one row at a time for the index.
  update public.employee_location_assignments set ended_at = now(), is_primary = false
  where employee_id = saved_id and ended_at is null
    and not location_id = any(coalesce(location_ids, '{}'::uuid[]));
  update public.employee_location_assignments set is_primary = false
  where employee_id = saved_id and ended_at is null and is_primary
    and location_id is distinct from primary_location_id;
  insert into public.employee_location_assignments (workspace_id, employee_id, location_id, is_primary, created_by)
  select distinct target_workspace_id, saved_id, selected.location_id, false, actor_user_id
  from unnest(coalesce(location_ids, '{}'::uuid[])) selected(location_id)
  where not exists (select 1 from public.employee_location_assignments existing
    where existing.employee_id = saved_id and existing.location_id = selected.location_id and existing.ended_at is null);
  update public.employee_location_assignments set is_primary = true
  where employee_id = saved_id and ended_at is null and not is_primary and location_id = primary_location_id;

  update public.employee_job_assignments set ended_at = now(), is_primary = false
  where employee_id = saved_id and ended_at is null
    and not job_id = any(coalesce(job_ids, '{}'::uuid[]));
  update public.employee_job_assignments set is_primary = false
  where employee_id = saved_id and ended_at is null and is_primary
    and job_id is distinct from primary_job_id;
  insert into public.employee_job_assignments (workspace_id, employee_id, job_id, is_primary, created_by)
  select distinct target_workspace_id, saved_id, selected.job_id, false, actor_user_id
  from unnest(coalesce(job_ids, '{}'::uuid[])) selected(job_id)
  where not exists (select 1 from public.employee_job_assignments existing
    where existing.employee_id = saved_id and existing.job_id = selected.job_id and existing.ended_at is null);
  update public.employee_job_assignments set is_primary = true
  where employee_id = saved_id and ended_at is null and not is_primary and job_id = primary_job_id;

  -- K4: excluded from the Schedule needs no location, except a manager, who
  -- manages only where they are assigned.
  perform app_private.keep_manager_at_a_location(target_workspace_id, saved_id);
  return saved_id;
end;
$function$;

-- 5. Settings > Jobs: giving, taking away and deleting a job -------------------------

CREATE OR REPLACE FUNCTION public.update_job_assignments_service(actor_user_id uuid, target_workspace_id uuid, target_job_id uuid, assignment_changes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare item jsonb; employee public.employee_profiles; target public.jobs; existing public.employee_job_assignments;
  actual boolean; desired boolean; changed integer:=0; unchanged integer:=0; replacement uuid;
  me app_private.actor_state := app_private.actor(actor_user_id, target_workspace_id);
  save_rule app_private.authz_actions; reason text;
begin
  select * into save_rule from app_private.authz_actions r where r.key = 'employee.save';
  -- May they change anybody's jobs at all; whose, is asked person by person.
  reason := app_private.authz_check(me, save_rule, null, null, null);
  if reason is not null and reason <> 'out_of_scope' then
    raise exception 'Not allowed' using errcode='42501', hint='authz.' || reason, detail='employee.save'; end if;
  select * into target from public.jobs where id=target_job_id and workspace_id=target_workspace_id for update;
  if target.id is null then raise exception 'Job not found' using errcode='P0002'; end if;
  if target.deleted_at is not null then raise exception 'This job was deleted and is no longer available' using errcode='P0002'; end if;
  if target.archived_at is not null then raise exception 'Restore this job before changing assignments' using errcode='22023'; end if;
  if jsonb_typeof(assignment_changes) is distinct from 'array' then
    raise exception 'Valid assignment changes required' using errcode='22023'; end if;
  if jsonb_array_length(assignment_changes) not between 1 and 10000 then
    raise exception 'Choose between 1 and 10000 employees' using errcode='22023'; end if;
  if (select count(*)<>count(distinct value->>'employee_id') from jsonb_array_elements(assignment_changes)) then
    raise exception 'An employee may only appear once in a batch' using errcode='22023'; end if;
  -- Ask, lock and validate the entire batch before applying any change.
  for item in select value from jsonb_array_elements(assignment_changes) order by value->>'employee_id' loop
    if jsonb_typeof(item->'employee_id') is distinct from 'string'
      or jsonb_typeof(item->'assigned') is distinct from 'boolean'
      or jsonb_typeof(item->'expected_revision') is distinct from 'number'
      or (item->>'expected_revision') !~ '^[1-9][0-9]*$' then
      raise exception 'Valid employee assignment required' using errcode='22023'; end if;
    -- Somebody unknown gets the answer somebody out of reach gets.
    reason := app_private.authz_check(me, save_rule, null, (item->>'employee_id')::uuid, null);
    if reason is not null then
      raise exception 'Not allowed' using errcode='42501', hint='authz.' || reason, detail='employee.save'; end if;
    select * into employee from public.employee_profiles e
    where e.id=(item->>'employee_id')::uuid and e.workspace_id=target_workspace_id for update;
    if employee.archived_at is not null then raise exception 'An employee was archived. Reload the employee list.' using errcode='PT409'; end if;
    select exists(select 1 from public.employee_job_assignments a where a.employee_id=employee.id
      and a.job_id=target_job_id and a.ended_at is null) into actual;
    if actual<>(item->>'assigned')::boolean and employee.revision<>(item->>'expected_revision')::integer then
      raise exception 'Employee % changed. Reload employees and review your pending changes.',employee.employee_code using errcode='PT409';
    end if;
  end loop;
  for item in select value from jsonb_array_elements(assignment_changes) order by value->>'employee_id' loop
    select * into existing from public.employee_job_assignments a where a.employee_id=(item->>'employee_id')::uuid
      and a.job_id=target_job_id and a.ended_at is null;
    desired:=(item->>'assigned')::boolean;
    if (existing.id is not null)=desired then unchanged:=unchanged+1; continue; end if;
    if desired then
      insert into public.employee_job_assignments(workspace_id,employee_id,job_id,is_primary,created_by)
      values(target_workspace_id,(item->>'employee_id')::uuid,target_job_id,
        target.system_key is distinct from 'owner'
        and not exists(select 1 from public.employee_job_assignments a where a.employee_id=(item->>'employee_id')::uuid
          and a.ended_at is null and a.is_primary),actor_user_id);
    else
      update public.employee_job_assignments set ended_at=now() where id=existing.id;
      if existing.is_primary then
        select a.id into replacement from public.employee_job_assignments a join public.jobs j on j.id=a.job_id
        where a.employee_id=existing.employee_id and a.ended_at is null and j.system_key is distinct from 'owner'
        order by (j.archived_at is not null),j.sort_order,lower(j.name),j.id limit 1;
        if replacement is not null then update public.employee_job_assignments set is_primary=true where id=replacement; end if;
      end if;
    end if;
    update public.employee_profiles set revision=revision+1,updated_at=now()
    where id=(item->>'employee_id')::uuid and workspace_id=target_workspace_id;
    insert into public.employee_events(workspace_id,employee_id,actor_user_id,action,summary)
    values(target_workspace_id,(item->>'employee_id')::uuid,actor_user_id,
      case when desired then 'job.assigned' else 'job.unassigned' end,
      case when desired then 'Assigned to ' else 'Removed from ' end||target.name);
    changed:=changed+1;
  end loop;
  return jsonb_build_object('changed_count',changed,'unchanged_count',unchanged);
end; $function$;

CREATE OR REPLACE FUNCTION public.delete_job_with_assignments_service(actor_user_id uuid, target_workspace_id uuid, target_job_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target public.jobs; a public.employee_job_assignments; replacement uuid; removed integer:=0;
  me app_private.actor_state; save_rule app_private.authz_actions; reason text;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.jobs.write');
  select * into target from public.jobs where id=target_job_id and workspace_id=target_workspace_id for update;
  if not found then raise exception 'Job not found' using errcode='P0002'; end if;
  if target.deleted_at is not null then return jsonb_build_object('removed_count',0); end if;
  if target.system_key is not null then
    raise exception 'Management and Owner are kept; rename them instead' using errcode='23514', hint='catalog.system_record'; end if;
  -- Taking a job off somebody changes their record: everyone on it must be
  -- somebody the actor may save.
  me := app_private.actor(actor_user_id, target_workspace_id);
  select * into save_rule from app_private.authz_actions r where r.key = 'employee.save';
  select min(app_private.authz_check(me, save_rule, null, employee.id, null)) into reason
  from public.employee_profiles employee
  where employee.workspace_id=target_workspace_id and exists(select 1 from public.employee_job_assignments assignment
    where assignment.employee_id=employee.id and assignment.job_id=target_job_id and assignment.ended_at is null);
  if reason is not null then
    raise exception 'This job is assigned to an employee you cannot manage. Ask an authorized administrator to delete it.'
      using errcode='42501', hint='authz.' || reason, detail='employee.save'; end if;
  perform 1 from public.employee_profiles employee
  where employee.workspace_id=target_workspace_id and exists(select 1 from public.employee_job_assignments assignment
    where assignment.employee_id=employee.id and assignment.job_id=target_job_id and assignment.ended_at is null)
  order by employee.id for update;
  for a in select * from public.employee_job_assignments where workspace_id=target_workspace_id and job_id=target_job_id and ended_at is null order by employee_id loop
    update public.employee_job_assignments set ended_at=now() where id=a.id;
    if a.is_primary then
      select other.id into replacement from public.employee_job_assignments other join public.jobs j on j.id=other.job_id
        where other.employee_id=a.employee_id and other.ended_at is null and j.system_key is distinct from 'owner'
        order by (j.archived_at is not null),j.sort_order,lower(j.name),j.id limit 1;
      if replacement is not null then update public.employee_job_assignments set is_primary=true where id=replacement; end if;
    end if;
    update public.employee_profiles set revision=revision+1,updated_at=now() where id=a.employee_id;
    insert into public.employee_events(workspace_id,employee_id,actor_user_id,action,summary)
      values(target_workspace_id,a.employee_id,actor_user_id,'job.unassigned','Removed from deleted job '||target.name);
    removed:=removed+1;
  end loop;
  update public.jobs set deleted_at=now(),archived_at=coalesce(archived_at,now()),updated_at=now() where id=target_job_id;
  return jsonb_build_object('removed_count',removed);
end; $function$;

-- 6. Employees list: the job it names -------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_employees_service(actor_user_id uuid, target_workspace_id uuid, include_archived boolean DEFAULT false, search_text text DEFAULT ''::text, status_filter text DEFAULT 'all'::text, page_limit integer DEFAULT 100, page_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, workspace_id uuid, employee_code text, first_name text, last_name text, preferred_name text, display_name text, invitation_email text, start_date date, primary_location_id uuid, primary_location_name text, location_count bigint, primary_job_id uuid, primary_job_name text, job_count bigint, role_name text, display_status text, archived_at timestamp with time zone, revision integer)
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
    -- The job the list names: the stored primary; failing that the Owner job
    -- (the owner's, never stored as primary), then the first job in the
    -- catalog's order.
    left join lateral (
      select job.name
      from public.employee_job_assignments assignment
      join public.jobs job on job.id = assignment.job_id
      where assignment.employee_id = employee.id and assignment.ended_at is null
        and (assignment.is_primary or job.archived_at is null)
      order by assignment.is_primary desc, coalesce(job.system_key = 'owner', false) desc,
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
        directory.primary_location_name,
        directory.primary_job_name
      ) ilike '%' || btrim(search_text) || '%'
    )
    and (status_filter = 'all' or directory.display_status = status_filter)
  order by lower(directory.display_name), directory.id
  limit least(greatest(page_limit, 1), 200)
  offset greatest(page_offset, 0);
end;
$function$;

-- 7. Setup counts jobs outside Management (K2) ---------------------------------------

CREATE OR REPLACE FUNCTION app_private.apply_owner_onboarding_update(actor_user_id uuid, target_workspace_id uuid, workspace_name text, next_step smallint, mark_complete boolean DEFAULT false, expected_revision integer DEFAULT NULL::integer, owner_first_name text DEFAULT NULL::text, owner_middle_name text DEFAULT NULL::text, owner_last_name text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  owner_employee_id uuid;
  current_status public.onboarding_status;
  current_revision integer;
  completed_timestamp timestamptz;
  names_given boolean := coalesce(btrim(owner_first_name), '') <> ''
    or coalesce(btrim(owner_middle_name), '') <> ''
    or coalesce(btrim(owner_last_name), '') <> '';
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = actor_user_id
      and membership.role = 'owner'
      and membership.status = 'active'
  ) then
    raise exception 'owner access required' using errcode = '42501';
  end if;
  if char_length(btrim(workspace_name)) not between 1 and 120 then
    raise exception 'workspace name must be between 1 and 120 characters' using errcode = '22023';
  end if;
  if next_step not between 1 and 4 then
    raise exception 'invalid onboarding step' using errcode = '22023';
  end if;

  select onboarding.status, onboarding.revision
  into current_status, current_revision
  from public.workspace_onboarding onboarding
  where onboarding.workspace_id = target_workspace_id
  for update;

  if current_status is null then
    raise exception 'workspace onboarding was not found' using errcode = 'P0002';
  end if;

  if current_status = 'complete'::public.onboarding_status then
    if mark_complete then
      return;
    end if;
    raise exception 'completed owner onboarding cannot be changed' using errcode = '22023';
  end if;

  if expected_revision is not null and current_revision <> expected_revision then
    raise exception 'owner onboarding revision conflict' using errcode = '40001';
  end if;

  if mark_complete and not exists (
    select 1
    from public.locations location
    where location.workspace_id = target_workspace_id
      and location.archived_at is null
  ) then
    raise exception 'at least one active location is required to complete owner onboarding' using errcode = '23514';
  end if;

  if mark_complete and not exists (
    select 1
    from public.departments department
    where department.workspace_id = target_workspace_id
      and department.archived_at is null
      and department.system_key is null
  ) then
    raise exception 'at least one department of your own is required to complete owner onboarding' using errcode = '23514';
  end if;

  if mark_complete and not exists (
    select 1
    from public.jobs job
    left join public.departments department on department.id = job.department_id
    where job.workspace_id = target_workspace_id
      and job.archived_at is null
      and department.system_key is distinct from 'management'
  ) then
    raise exception 'at least one job outside Management is required to complete owner onboarding' using errcode = '23514';
  end if;

  completed_timestamp := now();

  update public.workspaces
  set name = btrim(workspace_name), updated_at = completed_timestamp
  where id = target_workspace_id;

  update public.workspace_onboarding
  set
    status = case
      when mark_complete then 'complete'::public.onboarding_status
      else 'incomplete'::public.onboarding_status
    end,
    current_step = next_step,
    completed_at = case when mark_complete then completed_timestamp else null end,
    revision = revision + 1,
    updated_by = actor_user_id,
    updated_at = completed_timestamp
  where workspace_id = target_workspace_id;

  -- No names sent and none on file: the first step has not been answered.
  if not names_given and not exists (
    select 1
    from public.employee_profiles employee
    join public.employee_private_profiles private_profile
      on private_profile.employee_id = employee.id
    where employee.workspace_id = target_workspace_id
      and employee.user_id = actor_user_id
      and employee.archived_at is null
  ) then
    raise exception 'the owner''s legal name is required' using errcode = '23514';
  end if;

  -- The owner is a member from the first step, so their record exists from the
  -- first step too. Waiting for completion meant the team list did not contain
  -- the one person who was certainly on the team.
  owner_employee_id := app_private.ensure_owner_employee_profile(
    target_workspace_id,
    actor_user_id,
    owner_first_name,
    owner_middle_name,
    owner_last_name
  );

  if names_given then
    perform app_private.write_owner_legal_name(
      target_workspace_id, owner_employee_id,
      owner_first_name, owner_middle_name, owner_last_name
    );
  end if;

  -- Management, Owner and Manager exist from the first save, so the setup steps
  -- and Settings show them; nothing under Management counts as the owner's own
  -- department and job (K2).
  perform app_private.ensure_management_and_owner(target_workspace_id);

  -- Locations come into existence during setup, so this runs on every save and
  -- picks up whatever was added since the last one.
  perform app_private.open_owner_record_to_everything(
    target_workspace_id,
    owner_employee_id,
    actor_user_id
  );

  if mark_complete then

    insert into public.workspace_entitlements (
      workspace_id,
      status,
      trial_started_at,
      trial_ends_at,
      current_period_started_at,
      current_period_ends_at,
      billing_owner_user_id,
      provider,
      created_at,
      updated_at
    ) values (
      target_workspace_id,
      'trialing'::public.workspace_entitlement_status,
      completed_timestamp,
      completed_timestamp + interval '14 days',
      completed_timestamp,
      completed_timestamp + interval '14 days',
      actor_user_id,
      'internal'::public.workspace_entitlement_provider,
      completed_timestamp,
      completed_timestamp
    )
    on conflict (workspace_id) do nothing;
  end if;

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    target_workspace_id,
    actor_user_id,
    case when mark_complete then 'workspace.onboarding_completed' else 'workspace.onboarding_saved' end,
    'workspace',
    target_workspace_id::text,
    jsonb_build_object(
      'step', next_step,
      'previous_revision', current_revision,
      'revision', current_revision + 1
    )
  );
end;
$function$;

-- 8. The Management helper has no caller left ----------------------------------------

drop function app_private.is_management_job(uuid);

-- 9. Workspaces already set up get their Manager job ---------------------------------
-- Once, as a new workspace does; a job of that name already there is left alone.

insert into public.jobs (workspace_id, name, department_id)
select department.workspace_id, 'Manager', department.id
from public.departments department
where department.system_key = 'management'
on conflict (workspace_id, lower(name)) where archived_at is null do nothing;

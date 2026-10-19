-- AVATAR-IKON 2.1: a job's Lineup icons, suggested by the database, and the five job-writing services
-- asking the authorization core.
--
-- public.jobs.lineup_icons is the job's list of archive drawings (app_private.lineup_art keys, in order,
-- at most 24, no repeats). It has no default: a job opened without a list reaches the trigger with NULL
-- and is born with app_private.suggest_lineup_art(name), whoever opens it (the job services, the owner's
-- setup in app_private.ensure_management_and_owner, a browser insert through PostgREST, seed.sql). An
-- explicit '{}' stays empty. The name is read only at birth: renaming a job keeps its list.
-- The browser may insert a job (with a list, which the trigger checks) but never update the list: no
-- column grant, so it changes only through update_job_details_and_assignments_service.
--
-- The five job-writing services stop writing request.jwt.claim.sub and asking workspace_has_permission:
-- job details ask app_private.authorize(..., 'settings.jobs.write'); assignments alone ask the
-- employee.save gate update_job_assignments_service asks, in its "may they change anyone's jobs at all"
-- form, then person by person inside that service.

alter table public.jobs add column lineup_icons text[];

comment on column public.jobs.lineup_icons is
  'The job''s Lineup drawings (app_private.lineup_art keys, in order, at most 24, no repeats; AVATAR-IKON). Suggested from the name when a job is opened without a list (trigger jobs_lineup_icons); changed only by update_job_details_and_assignments_service.';

-- Runs as its owner: the browser inserts jobs directly, and the archive and its two functions are not
-- the browser's to read or call.
create function app_private.jobs_lineup_icons()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.lineup_icons is null then
    new.lineup_icons := app_private.suggest_lineup_art(new.name);
  end if;
  if not app_private.lineup_art_keys_valid(new.lineup_icons) or cardinality(new.lineup_icons) > 24 then
    raise exception 'Choose up to 24 different drawings from the archive'
      using errcode = '22023', hint = 'job.lineup_icons_invalid';
  end if;
  return new;
end;
$$;

alter function app_private.jobs_lineup_icons() owner to postgres;
revoke all on function app_private.jobs_lineup_icons() from public;

create trigger jobs_lineup_icons
before insert or update of lineup_icons on public.jobs
for each row execute function app_private.jobs_lineup_icons();

-- Every job there is today gets the suggestion for its name.
update public.jobs set lineup_icons = app_private.suggest_lineup_art(name);
set constraints public.document_assignment_changed immediate;
alter table public.jobs alter column lineup_icons set not null;

create or replace function public.create_department_jobs_service(actor_user_id uuid, target_workspace_id uuid, target_department_id uuid, jobs_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare dep public.departments; item jsonb; job public.jobs; result jsonb:='[]';
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.jobs.write');
  if jsonb_typeof(jobs_input) is distinct from 'array' then
    raise exception 'Jobs must be an array' using errcode='22023'; end if;
  if jsonb_array_length(jobs_input) not between 1 and 500 then
    raise exception 'Provide between 1 and 500 jobs' using errcode='22023'; end if;
  perform 1 from public.workspaces where id=target_workspace_id for update;
  select * into dep from public.departments where id=target_department_id and workspace_id=target_workspace_id for update;
  if not found then raise exception 'Department not found' using errcode='P0002'; end if;
  if dep.archived_at is not null then raise exception 'Restore the department before adding jobs' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(jobs_input) loop
    if jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'name') is distinct from 'string'
      or jsonb_typeof(item->'color') is distinct from 'string' then
      raise exception 'Valid job name and color required' using errcode='22023'; end if;
    insert into public.jobs(workspace_id,department_id,name,color)
      values(target_workspace_id,dep.id,btrim(item->>'name'),item->>'color') returning * into job;
    result:=result||jsonb_build_array(to_jsonb(job));
  end loop;
  return result;
exception when unique_violation then
  raise exception 'A job with that name already exists. Names must be unique in this organization.' using errcode='23505';
end; $$;

create or replace function public.create_department_with_jobs_service(actor_user_id uuid, target_workspace_id uuid, department_input jsonb, jobs_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare dep public.departments; item jsonb; result_jobs jsonb;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.jobs.write');
  if jsonb_typeof(department_input) is distinct from 'object'
    or jsonb_typeof(department_input->'name') is distinct from 'string'
    or jsonb_typeof(department_input->'color') is distinct from 'string'
    or jsonb_typeof(jobs_input) is distinct from 'array' then
    raise exception 'Valid department and jobs required' using errcode='22023';
  end if;
  if jsonb_array_length(jobs_input)>500 then raise exception 'Too many jobs' using errcode='22023'; end if;
  -- Serialize organization creation order without modifying existing definitions.
  perform 1 from public.workspaces where id=target_workspace_id for update;
  insert into public.departments(workspace_id,name,color)
  values(target_workspace_id,btrim(department_input->>'name'),department_input->>'color')
  returning * into dep;
  for item in select value from jsonb_array_elements(jobs_input) loop
    if jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'name') is distinct from 'string'
      or jsonb_typeof(item->'color') is distinct from 'string' then
      raise exception 'Valid job name and color required' using errcode='22023';
    end if;
    insert into public.jobs(workspace_id,department_id,name,color)
    values(target_workspace_id,dep.id,btrim(item->>'name'),item->>'color');
  end loop;
  select coalesce(jsonb_agg(to_jsonb(j) order by lower(j.name),j.id),'[]') into result_jobs
  from public.jobs j where j.workspace_id=target_workspace_id and j.department_id=dep.id;
  return jsonb_build_object('department',to_jsonb(dep),'jobs',result_jobs);
exception when unique_violation then
  raise exception 'A department or job with that name already exists. Names must be unique in this organization.' using errcode='23505';
end; $$;

-- job_input.lineup_icons: the job's drawings; left out, the trigger suggests them from the name.
create or replace function public.create_job_with_assignments_service(actor_user_id uuid, target_workspace_id uuid, job_input jsonb, assignment_changes jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $_$
declare
  target public.jobs;
  department public.departments;
  selected_department_id uuid;
  result jsonb := '{"changed_count":0,"unchanged_count":0}'::jsonb;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.jobs.write');
  if jsonb_typeof(job_input) is distinct from 'object'
    or jsonb_typeof(job_input->'name') is distinct from 'string'
    or char_length(btrim(job_input->>'name')) not between 1 and 100
    or jsonb_typeof(job_input->'color') is distinct from 'string'
    or (job_input->>'color') !~ '^#[0-9a-fA-F]{6}$'
    or not (job_input ? 'department_id')
    or jsonb_typeof(job_input->'department_id') not in ('string', 'null') then
    raise exception 'Valid job name, color and department required' using errcode = '22023';
  end if;
  if job_input ? 'lineup_icons' and jsonb_typeof(job_input->'lineup_icons') is distinct from 'array' then
    raise exception 'Choose up to 24 different drawings from the archive' using errcode = '22023', hint = 'job.lineup_icons_invalid';
  end if;
  if jsonb_typeof(assignment_changes) is distinct from 'array'
    or jsonb_array_length(assignment_changes) > 10000 then
    raise exception 'Choose at most 10000 employees' using errcode = '22023';
  end if;

  selected_department_id := (job_input->>'department_id')::uuid;
  if selected_department_id is not null then
    select * into department from public.departments d
      where d.id = selected_department_id and d.workspace_id = target_workspace_id for share;
    if department.id is null or department.archived_at is not null or department.deleted_at is not null then
      raise exception 'Choose an active department in this workspace' using errcode = '22023';
    end if;
  end if;

  perform 1 from public.workspaces where id = target_workspace_id for update;

  begin
    insert into public.jobs(workspace_id, department_id, name, color, lineup_icons)
    values(
      target_workspace_id,
      selected_department_id,
      btrim(job_input->>'name'),
      job_input->>'color',
      case when job_input ? 'lineup_icons'
        then array(select icon.key from jsonb_array_elements_text(job_input->'lineup_icons') with ordinality as icon(key, n) order by icon.n) end
    )
    returning * into target;
  exception when unique_violation then
    raise exception 'This job name already exists. Choose a unique name.' using errcode = '23505';
  end;

  if jsonb_array_length(assignment_changes) > 0 then
    result := public.update_job_assignments_service(
      actor_user_id, target_workspace_id, target.id, assignment_changes
    );
  end if;

  return result || jsonb_build_object('job', to_jsonb(target));
end;
$_$;

create or replace function public.update_department_with_jobs_service(actor_user_id uuid, target_workspace_id uuid, target_department_id uuid, department_input jsonb, jobs_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare dep public.departments; added jsonb:='[]';
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.jobs.write');
  if jsonb_typeof(department_input->'name') is distinct from 'string' or jsonb_typeof(department_input->'color') is distinct from 'string'
    or jsonb_typeof(jobs_input) is distinct from 'array' then raise exception 'Valid department and jobs required' using errcode='22023'; end if;
  perform 1 from public.workspaces where id=target_workspace_id for update;
  update public.departments set name=btrim(department_input->>'name'),color=department_input->>'color',updated_at=now()
    where id=target_department_id and workspace_id=target_workspace_id returning * into dep;
  if not found then raise exception 'Department not found' using errcode='P0002'; end if;
  if jsonb_array_length(jobs_input)>0 then
    added:=public.create_department_jobs_service(actor_user_id,target_workspace_id,target_department_id,jobs_input);
  end if;
  return jsonb_build_object('department',to_jsonb(dep),'jobs',added);
exception when unique_violation then raise exception 'A department or job with that name already exists.' using errcode='23505';
end; $$;

-- The job's details are {name, color, department_id, lineup_icons}; expected_job carries the same four,
-- as the drawer read them. job_input without lineup_icons keeps the job's list.
create or replace function public.update_job_details_and_assignments_service(actor_user_id uuid, target_workspace_id uuid, target_job_id uuid, job_input jsonb default null::jsonb, expected_job jsonb default null::jsonb, assignment_changes jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $_$
declare
  target public.jobs;
  department public.departments;
  desired jsonb;
  actual jsonb;
  selected_department_id uuid;
  result jsonb := '{"changed_count":0,"unchanged_count":0}'::jsonb;
  me app_private.actor_state;
  save_rule app_private.authz_actions;
  reason text;
begin
  if job_input is not null then
    perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.jobs.write');
  else
    -- Assignments alone: may they change anybody's jobs at all; whose, update_job_assignments_service
    -- asks person by person.
    me := app_private.actor(actor_user_id, target_workspace_id);
    select * into save_rule from app_private.authz_actions r where r.key = 'employee.save';
    reason := app_private.authz_check(me, save_rule, null, null, null);
    if reason is not null and reason <> 'out_of_scope' then
      raise exception 'Not allowed' using errcode='42501', hint='authz.' || reason, detail='employee.save'; end if;
  end if;
  if jsonb_typeof(assignment_changes) is distinct from 'array' then
    raise exception 'Valid assignment changes required' using errcode = '22023';
  end if;
  if jsonb_array_length(assignment_changes) > 10000
    or (job_input is null and jsonb_array_length(assignment_changes) = 0) then
    raise exception 'Choose at least one change and at most 10000 employees' using errcode = '22023';
  end if;
  if (job_input is null) <> (expected_job is null) then
    raise exception 'Job details require their original values' using errcode = '22023';
  end if;

  select * into target from public.jobs
    where id = target_job_id and workspace_id = target_workspace_id for update;
  if target.id is null or target.deleted_at is not null then
    raise exception 'This job is no longer available' using errcode = 'P0002';
  end if;

  if job_input is not null then
    if jsonb_typeof(job_input) is distinct from 'object'
      or jsonb_typeof(expected_job) is distinct from 'object'
      or jsonb_typeof(job_input->'name') is distinct from 'string'
      or char_length(btrim(job_input->>'name')) not between 1 and 100
      or jsonb_typeof(job_input->'color') is distinct from 'string'
      or (job_input->>'color') !~ '^#[0-9a-fA-F]{6}$'
      or not (job_input ? 'department_id')
      or jsonb_typeof(job_input->'department_id') not in ('string', 'null') then
      raise exception 'Valid job name, color and department required' using errcode = '22023';
    end if;
    if job_input ? 'lineup_icons' and jsonb_typeof(job_input->'lineup_icons') is distinct from 'array' then
      raise exception 'Choose up to 24 different drawings from the archive' using errcode = '22023', hint = 'job.lineup_icons_invalid';
    end if;
    selected_department_id := (job_input->>'department_id')::uuid;
    desired := jsonb_build_object(
      'name', btrim(job_input->>'name'), 'color', job_input->>'color', 'department_id', selected_department_id,
      'lineup_icons', coalesce(job_input->'lineup_icons', to_jsonb(target.lineup_icons))
    );
    actual := jsonb_build_object(
      'name', target.name, 'color', target.color, 'department_id', target.department_id,
      'lineup_icons', to_jsonb(target.lineup_icons)
    );
    -- A successful request can be retried with the same original values.
    if desired is distinct from actual then
      if expected_job is distinct from actual then
        raise exception 'Job details changed. Reload the latest job and review your draft.' using errcode = 'PT409', hint = 'job.changed';
      end if;
      if selected_department_id is not null and selected_department_id is distinct from target.department_id then
        select * into department from public.departments d
          where d.id = selected_department_id and d.workspace_id = target_workspace_id for share;
        if department.id is null or department.archived_at is not null or department.deleted_at is not null then
          raise exception 'Choose an active department in this workspace' using errcode = '22023';
        end if;
      end if;
      begin
        update public.jobs set
          name = desired->>'name', color = desired->>'color',
          department_id = selected_department_id,
          lineup_icons = array(select icon.key from jsonb_array_elements_text(desired->'lineup_icons') with ordinality as icon(key, n) order by icon.n),
          updated_at = now()
          where id = target_job_id and workspace_id = target_workspace_id
          returning * into target;
      exception when unique_violation then
        raise exception 'This job name already exists. Choose a unique name.' using errcode = '23505';
      end;
    end if;
  end if;

  if jsonb_array_length(assignment_changes) > 0 then
    result := public.update_job_assignments_service(
      actor_user_id, target_workspace_id, target_job_id, assignment_changes
    );
  end if;
  return result || jsonb_build_object('job', to_jsonb(target));
end;
$_$;

create or replace function public.read_settings_jobs_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.jobs.read');
  return jsonb_build_object(
    'departments', (
      select coalesce(jsonb_agg(to_jsonb(d) order by lower(d.name), d.id), '[]'::jsonb)
      from (
        select department.id, department.workspace_id, department.name, department.color,
          department.archived_at, department.system_key
        from public.departments department
        where department.workspace_id = target_workspace_id and department.deleted_at is null
      ) d),
    'jobs', (
      select coalesce(jsonb_agg(to_jsonb(j) order by lower(j.name), j.id), '[]'::jsonb)
      from (
        select job.id, job.workspace_id, job.department_id, job.name, job.color, job.archived_at,
          job.system_key, job.lineup_icons
        from public.jobs job
        where job.workspace_id = target_workspace_id and job.deleted_at is null
      ) j)
  );
end;
$$;

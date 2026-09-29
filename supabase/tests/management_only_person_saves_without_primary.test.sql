begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- BL-218 .3b. A job under Management is primary by its department and is
-- never stored as primary. So somebody whose only jobs are under Management
-- is saved with no primary job; they still need at least one location (and a
-- primary location), as everybody not Remote or excluded from Schedule does.
-- A primary job is asked for only when the person has a job outside
-- Management. Remote and "Exclude from schedule" keep their exemption
-- (user decision 2026-09-28).
-- Example: Ayse is given Manager in Settings > Jobs and loses Cook. Saved
-- from the Employees drawer with Kadikoy and no primary job, she is kept;
-- with no location she is refused.

select tests.world('mp');
select tests.as_browser(tests.user('mp:owner'), format(
  $sql$insert into public.jobs (id, workspace_id, name, department_id)
       values (%L, %L, 'Manager', (select id from public.departments where workspace_id = %L and system_key = 'management'))$sql$,
  tests.remember('mp:job:manager', gen_random_uuid()), tests.id('mp'), tests.id('mp')));

-- The SQLSTATE and hint a statement is refused with, or 'allowed'.
create function pg_temp.refusal(statement text) returns text
language plpgsql as $$
declare
  state text;
  hint text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics state = returned_sqlstate, hint = pg_exception_hint;
  return state || coalesce(' ' || nullif(hint, ''), '');
end;
$$;
-- Ayse's record saved from the drawer by the owner.
create function pg_temp.save(locs text[], primary_loc text, jobs text[], primary_job text, remote boolean default false) returns text
language sql as $$
  select pg_temp.refusal(format(
    'select public.save_employee_service(%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %s)',
    tests.user('mp:owner'), tests.id('mp'), e.id, e.first_name, e.middle_name, e.last_name, e.preferred_name,
    e.invitation_email, e.start_date, e.internal_note,
    array(select tests.id('mp:' || l) from unnest(locs) l), case when primary_loc is null then null else tests.id('mp:' || primary_loc) end,
    array(select tests.id('mp:job:' || j) from unnest(jobs) j), case when primary_job is null then null else tests.id('mp:job:' || primary_job) end,
    remote, e.is_excluded_from_schedule, e.revision
  ))
  from public.employee_profiles e where e.id = tests.id('mp:ayse')
$$;
-- What Ayse works now: job names (* = stored primary) @ location names.
create function pg_temp.ayse() returns text language sql as $$
  select coalesce((select string_agg(j.name || case when a.is_primary then '*' else '' end, ',' order by j.name)
      from public.employee_job_assignments a join public.jobs j on j.id = a.job_id
      where a.employee_id = tests.id('mp:ayse') and a.ended_at is null), '-')
    || '@' ||
    coalesce((select string_agg(l.name, ',' order by l.name)
      from public.employee_location_assignments a join public.locations l on l.id = a.location_id
      where a.employee_id = tests.id('mp:ayse') and a.ended_at is null), '-')
$$;

-- Ayse cooks at Kadikoy, is given Manager in Settings > Jobs, then Cook is taken away.
select tests.person('mp', 'ayse', 'employee', array['K'], array['cook']);
create function pg_temp.assign(job text, assigned boolean) returns void language sql as $$
  select public.update_job_assignments_service(tests.user('mp:owner'), tests.id('mp'), tests.id('mp:job:' || job),
    jsonb_build_array(jsonb_build_object('employee_id', tests.id('mp:ayse'), 'assigned', assigned,
      'expected_revision', (select revision from public.employee_profiles where id = tests.id('mp:ayse')))))::text
$$;
select pg_temp.assign('manager', true);
select pg_temp.assign('cook', false);

-- 1. Only Management jobs: no primary job, a location still needed --------------------

select is(pg_temp.save(array['K'], 'K', array['manager'], null), 'allowed',
  'only Manager, at Kadikoy, no primary job: the drawer saves her');
select is(pg_temp.ayse(), 'Manager@Kadikoy', 'and she works Manager at Kadikoy, nothing stored as primary');
select is(pg_temp.save(array[]::text[], null, array['manager'], null), '22023 employee.location_required',
  'with no location she is refused');
select is(pg_temp.save(array['K'], null, array['manager'], null), '22023 employee.location_required',
  'nor without a primary location');
select is(pg_temp.save(array['K'], 'K', array['manager'], 'manager'), '23514 employee.management_primary',
  'Manager is still never stored as primary');
select is(pg_temp.save(array['K'], 'K', array[]::text[], null), '22023 employee.job_required',
  'with no job at all she is refused');

-- 2. A job outside Management still needs a primary ----------------------------------

select is(pg_temp.save(array['K'], 'K', array['manager', 'server'], null), '22023 employee.primary_job_required',
  'Manager and Server with no primary job: refused, Server must be primary');
select is(pg_temp.save(array['K'], 'K', array['manager', 'server'], 'server'), 'allowed',
  'Manager and Server with Server primary: saved');
select is(pg_temp.ayse(), 'Manager,Server*@Kadikoy', 'Server is her stored primary; Manager is primary by its department');

-- 3. Remote keeps its exemption --------------------------------------------------------

select is(pg_temp.save(array[]::text[], null, array['manager'], null, true), 'allowed',
  'Remote with only Manager saves with no location and no primary job');

-- 4. Add employee follows the same rule --------------------------------------------------

select is(pg_temp.refusal(format(
  'select public.create_employee_command_service(%L, %L, %L, %L::jsonb, null)',
  tests.user('mp:owner'), tests.id('mp'), gen_random_uuid(),
  jsonb_build_object(
    'first_name', 'Bora', 'middle_name', '', 'last_name', 'Person', 'preferred_name', '',
    'invitation_email', '', 'start_date', '', 'internal_note', '',
    'location_ids', jsonb_build_array(tests.id('mp:K')), 'primary_location_id', tests.id('mp:K'),
    'job_ids', jsonb_build_array(tests.id('mp:job:manager')), 'primary_job_id', null,
    'is_remote', false, 'is_excluded_from_schedule', false, 'expected_revision', null)
)), 'allowed', 'Add employee with only Manager, a location and no primary job creates the record');

-- 5. The rule sits in the database ------------------------------------------------------

-- Another workspace's Management job is not a Management job here: saving with
-- it is refused as a made-up job is, so the answer says nothing about it.
select tests.world('mq');
create function pg_temp.save_job_ids(jobs uuid[]) returns text language sql as $$
  select pg_temp.refusal(format(
    'select public.save_employee_service(%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, null, false, false, %s)',
    tests.user('mp:owner'), tests.id('mp'), e.id, e.first_name, e.middle_name, e.last_name, e.preferred_name,
    e.invitation_email, e.start_date, e.internal_note,
    array[tests.id('mp:K')], tests.id('mp:K'), jobs, e.revision
  ))
  from public.employee_profiles e where e.id = tests.id('mp:ayse')
$$;
select is(
  pg_temp.save_job_ids(array[(select id from public.jobs where workspace_id = tests.id('mq') and system_key = 'owner')]),
  pg_temp.save_job_ids(array[gen_random_uuid()]),
  'another workspace''s Owner job (under its Management) is refused like a made-up job');

select matches(pg_temp.refusal(format(
  'select tests.as_browser(%L, %L)', tests.user('mp:owner'),
  format('insert into public.employee_location_assignments (workspace_id, employee_id, location_id, created_by) values (%L, %L, %L, %L)',
    tests.id('mp'), tests.id('mp:ayse'), tests.id('mp:K'), tests.user('mp:owner')))),
  '^42501', 'the browser cannot write an assignment around the save');

select * from finish();
rollback;

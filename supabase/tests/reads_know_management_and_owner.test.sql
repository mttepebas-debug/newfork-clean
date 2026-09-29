begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- BL-218 .3a. Management can be renamed, so the screens cannot find it by its
-- name: the Schedule read and the Employees drawer's references say which
-- department is Management and which job is Owner (system_key). The Schedule
-- read's primary_job_id is the job a person was actually given as primary,
-- or null: a job under Management is primary by its department and never
-- stored as primary, so it never comes back here either.
-- Example: the owner works Owner and Cook and chose no primary; Schedule reads
-- no primary job for them, not whichever job id sorts first.

select tests.world('mk');
create function pg_temp.management() returns uuid language sql as $$
  select d.id from public.departments d where d.workspace_id = tests.id('mk') and d.system_key = 'management'
$$;
create function pg_temp.owner_job() returns uuid language sql as $$
  select j.id from public.jobs j where j.workspace_id = tests.id('mk') and j.system_key = 'owner'
$$;
-- A second Management job and a Kitchen job, as the owner adds them in Settings > Jobs.
select tests.as_browser(tests.user('mk:owner'), format(
  $sql$insert into public.jobs (id, workspace_id, name, department_id) values (%L, %L, 'Manager', %L), (%L, %L, 'Host', %L)$sql$,
  tests.remember('mk:job:manager', gen_random_uuid()), tests.id('mk'), pg_temp.management(),
  tests.remember('mk:job:host', gen_random_uuid()), tests.id('mk'), tests.id('mk:kitchen')));
-- An archived and a deleted department: the drawer lists departments as it
-- lists jobs, the archived one included, the deleted one not.
insert into public.departments (id, workspace_id, name, archived_at)
values (tests.remember('mk:bar', gen_random_uuid()), tests.id('mk'), 'Bar', now()),
       (tests.remember('mk:gone', gen_random_uuid()), tests.id('mk'), 'Gone', now());
update public.departments set deleted_at = now() where id = tests.id('mk:gone');

-- The owner saving their own record the way the drawer does: jobs replaced,
-- one primary or none (only the owner's record may save without one).
create function pg_temp.owner_saves_jobs(jobs uuid[], primary_job uuid) returns void
language sql as $$
  select public.save_employee_service(
    tests.user('mk:owner'), tests.id('mk'), e.id, e.first_name, e.middle_name, e.last_name, e.preferred_name,
    e.invitation_email, e.start_date, e.internal_note,
    array[tests.id('mk:K'), tests.id('mk:B')], tests.id('mk:K'), jobs, primary_job,
    e.is_remote, e.is_excluded_from_schedule, e.revision)::text
  from public.employee_profiles e where e.id = tests.id('mk:owner')
$$;
-- A job given or taken away in Settings > Jobs.
create function pg_temp.assign(person text, job text, assigned boolean) returns void
language sql as $$
  select public.update_job_assignments_service(
    tests.user('mk:owner'), tests.id('mk'), tests.id('mk:job:' || job),
    jsonb_build_array(jsonb_build_object(
      'employee_id', tests.id(person), 'assigned', assigned,
      'expected_revision', (select revision from public.employee_profiles where id = tests.id(person))
    )))::text
$$;
create function pg_temp.grid() returns jsonb language sql as $$
  select public.get_schedule_read_model_service(tests.user('mk:owner'), tests.id('mk'), tests.week(0))
$$;
create function pg_temp.primary_of(person text) returns uuid language sql as $$
  select (e ->> 'primary_job_id')::uuid from jsonb_array_elements(pg_temp.grid() -> 'employees') e
  where (e ->> 'id')::uuid = tests.id(person)
$$;
create function pg_temp.keys(value jsonb) returns text[] language sql as $$
  select array_agg(k order by k) from jsonb_object_keys(value) k
$$;
create function pg_temp.keyed(list jsonb) returns text[] language sql as $$
  select coalesce(array_agg((x ->> 'name') || '=' || coalesce(x ->> 'system_key', 'null') order by x ->> 'name'), '{}')
  from jsonb_array_elements(list) x
$$;
create function pg_temp.references() returns jsonb language sql as $$
  select public.read_employee_references_service(tests.user('mk:owner'), tests.id('mk'))
$$;

-- 1. The Schedule read names Management and Owner by key ------------------------------

select is(pg_temp.keys(pg_temp.grid() -> 'departments' -> 0), array['color', 'id', 'name', 'sort_order', 'system_key'],
  'a Schedule department carries its system key');
select is(pg_temp.keys(pg_temp.grid() -> 'jobs' -> 0), array['color', 'department_id', 'id', 'name', 'sort_order', 'system_key'],
  'a Schedule job carries its system key');
select is(pg_temp.keyed(pg_temp.grid() -> 'departments'), array['Kitchen=null', 'Management=management'],
  'Schedule knows which department is Management');
select is(pg_temp.keyed(pg_temp.grid() -> 'jobs'), array['Cook=null', 'Host=null', 'Manager=null', 'Owner=owner', 'Server=null'],
  'and which job is Owner');
update public.departments set name = 'Leadership' where id = pg_temp.management();
select is(pg_temp.keyed(pg_temp.grid() -> 'departments'), array['Kitchen=null', 'Leadership=management'],
  'renamed to Leadership, it is still Management');

-- 2. The primary job is the one given as primary, or none ----------------------------

select is(pg_temp.primary_of('mk:owner'), null::uuid,
  'the owner who works only the Owner job has no primary job');
select pg_temp.owner_saves_jobs(array[pg_temp.owner_job(), tests.id('mk:job:cook')], null);
select is(pg_temp.primary_of('mk:owner'), null::uuid,
  'nor once they also cook without choosing a primary');
select pg_temp.owner_saves_jobs(array[pg_temp.owner_job(), tests.id('mk:job:cook')], tests.id('mk:job:cook'));
select is(pg_temp.primary_of('mk:owner'), tests.id('mk:job:cook'),
  'once they choose Cook, Cook is their primary job');

select tests.person('mk', 'bora', 'employee', array['K'], array['cook', 'manager']);
select is(pg_temp.primary_of('mk:bora'), tests.id('mk:job:cook'),
  'somebody who cooks (primary) and manages: Cook is the primary job');
-- Cemre cooks, is given Manager in Settings > Jobs, then Cook is taken away.
select tests.person('mk', 'cemre', 'employee', array['K'], array['cook']);
select pg_temp.assign('mk:cemre', 'manager', true);
select pg_temp.assign('mk:cemre', 'cook', false);
select is(pg_temp.primary_of('mk:cemre'), null::uuid,
  'somebody who only manages has no primary job');
-- Deniz hosts (primary) and cooks; then Host moves under Management.
select tests.person('mk', 'deniz', 'employee', array['K'], array['host', 'cook']);
select tests.as_browser(tests.user('mk:owner'), format(
  'update public.jobs set department_id = %L where id = %L', pg_temp.management(), tests.id('mk:job:host')));
select is(pg_temp.primary_of('mk:deniz'), null::uuid,
  'once their primary job moves under Management, they have no primary job, not Cook by id order');
select is(
  (select count(*)::integer from jsonb_array_elements(pg_temp.grid() -> 'employees') e
   join public.jobs j on j.id = (e ->> 'primary_job_id')::uuid
   where j.department_id = pg_temp.management()),
  0, 'no primary job the Schedule reads is a Management job');

-- 3. The drawer's references carry each job's department and the departments --------

-- The answer's and a job's keys are checked in employee_references_ask_the_core.
select is(pg_temp.keys(pg_temp.references() -> 'departments' -> 0), array['archived_at', 'id', 'name', 'system_key'],
  'a department carries what the grouped Jobs picker shows');
select is(pg_temp.keyed(pg_temp.references() -> 'departments'), array['Bar=null', 'Kitchen=null', 'Leadership=management'],
  'the departments: Management by key, the archived one included, the deleted one not');
select is(pg_temp.keyed(pg_temp.references() -> 'jobs'), array['Cook=null', 'Host=null', 'Manager=null', 'Owner=owner', 'Server=null'],
  'the drawer knows which job is Owner');
select is(
  (select array_agg((x ->> 'name') || '@' || coalesce(d.name, 'none') order by x ->> 'name')
   from jsonb_array_elements(pg_temp.references() -> 'jobs') x
   left join public.departments d on d.id = (x ->> 'department_id')::uuid),
  array['Cook@Kitchen', 'Host@Leadership', 'Manager@Leadership', 'Owner@Leadership', 'Server@Kitchen'],
  'each job says which department it sits under');
select is(
  (select count(*)::integer from jsonb_array_elements(pg_temp.references() -> 'jobs') x
   where (x ->> 'department_id')::uuid is not null
     and not exists (select 1 from jsonb_array_elements(pg_temp.references() -> 'departments') d
       where d ->> 'id' = x ->> 'department_id')),
  0, 'every job''s department is in the list, so the picker can group every job');
select tests.person('mk', 'ayse', 'manager', array['K'], array['cook']);
select is(
  pg_temp.keyed(public.read_employee_references_service(tests.user('mk:ayse'), tests.id('mk')) -> 'departments'),
  array['Bar=null', 'Kitchen=null', 'Leadership=management'],
  'a manager reads the same departments: they belong to no location');

select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

-- BL-218 .3a. Management can be renamed, so the screens cannot find it by its
-- name: the Schedule read and the Employees drawer's references say which
-- department is Management and which job is Owner (system_key). The Schedule
-- read's primary_job_id is the job a person was actually given as primary,
-- or null. Any job can be that job but Owner (EMP-001): a job under Management
-- is a job like any other. The team board an employee reads (Employee Hub)
-- follows the same rule.
-- Example: the owner works Owner and Cook and chose no primary; Schedule reads
-- no primary job for them, not whichever job id sorts first.

select tests.world('mk');
create function pg_temp.management() returns uuid language sql as $$
  select d.id from public.departments d where d.workspace_id = tests.id('mk') and d.system_key = 'management'
$$;
create function pg_temp.owner_job() returns uuid language sql as $$
  select j.id from public.jobs j where j.workspace_id = tests.id('mk') and j.system_key = 'owner'
$$;
-- Setup made General Manager and Assistant Manager under Management (mk:job:general manager; ROL-CIFT). A Kitchen job and a job
-- with no department, as the owner adds them in Settings > Jobs.
select tests.as_browser(tests.user('mk:owner'), format(
  $sql$insert into public.jobs (id, workspace_id, name, department_id)
       values (%L, %L, 'Host', %L), (%L, %L, 'Dishwasher', null)$sql$,
  tests.remember('mk:job:host', gen_random_uuid()), tests.id('mk'), tests.id('mk:kitchen'),
  tests.remember('mk:job:dishwasher', gen_random_uuid()), tests.id('mk')));
-- Another workspace with its own Kitchen, Management, Cook, Owner...
select tests.world('mx');
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
-- How many departments and jobs of the other workspace (mx) an answer lists.
create function pg_temp.from_mx(answer jsonb) returns integer language sql as $$
  select (select count(*)::integer from jsonb_array_elements(answer -> 'departments') x
      join public.departments d on d.id = (x ->> 'id')::uuid where d.workspace_id = tests.id('mx'))
    + (select count(*)::integer from jsonb_array_elements(answer -> 'jobs') x
      join public.jobs j on j.id = (x ->> 'id')::uuid where j.workspace_id = tests.id('mx'))
$$;
create function pg_temp.dishwasher(answer jsonb) returns jsonb language sql as $$
  select x -> 'department_id' from jsonb_array_elements(answer -> 'jobs') x where x ->> 'name' = 'Dishwasher'
$$;

-- 1. The Schedule read names Management and Owner by key ------------------------------

select is(pg_temp.keys(pg_temp.grid() -> 'departments' -> 0), array['color', 'id', 'name', 'system_key'],
  'a Schedule department carries its system key');
select is(pg_temp.keys(pg_temp.grid() -> 'jobs' -> 0), array['color', 'department_id', 'id', 'name', 'system_key'],
  'a Schedule job carries its system key');
select is(pg_temp.keyed(pg_temp.grid() -> 'departments'), array['Kitchen=null', 'Management=management'],
  'Schedule knows which department is Management');
select is(pg_temp.keyed(pg_temp.grid() -> 'jobs'), array['Assistant Manager=null', 'Cook=null', 'Dishwasher=null', 'General Manager=null', 'Host=null', 'Owner=owner', 'Server=null'],
  'and which job is Owner');
select is(pg_temp.dishwasher(pg_temp.grid()), 'null'::jsonb, 'a job with no department reads as such');
select is(pg_temp.from_mx(pg_temp.grid()), 0,
  'no department or job of another workspace reaches the Schedule read, though it has its own Kitchen and Management');
update public.departments set name = 'Leadership' where id = pg_temp.management();
select is(pg_temp.keyed(pg_temp.grid() -> 'departments'), array['Kitchen=null', 'Leadership=management'],
  'renamed to Leadership, it is still Management');

-- 2. The primary job is the one given as primary, or none ----------------------------

select is(pg_temp.primary_of('mk:owner'), null::uuid,
  'the owner who works only the Owner job has no primary job');
-- The owner cooks too: on the grid with the employee access (ROL-CIFT 2.1).
select tests.employee_slot('mk', 'owner');
select pg_temp.owner_saves_jobs(array[pg_temp.owner_job(), tests.id('mk:job:cook')], null);
select is(pg_temp.primary_of('mk:owner'), null::uuid,
  'nor once they also cook without choosing a primary');
select pg_temp.owner_saves_jobs(array[pg_temp.owner_job(), tests.id('mk:job:cook')], tests.id('mk:job:cook'));
select is(pg_temp.primary_of('mk:owner'), tests.id('mk:job:cook'),
  'once they choose Cook, Cook is their primary job');

select tests.person('mk', 'bora', 'employee', array['K'], array['cook', 'general manager']);
select is(pg_temp.primary_of('mk:bora'), tests.id('mk:job:cook'),
  'somebody who cooks (primary) and manages: Cook is the primary job');
-- Cemre cooks, is given Manager in Settings > Jobs, then Cook is taken away.
select tests.person('mk', 'cemre', 'employee', array['K'], array['cook']);
select pg_temp.assign('mk:cemre', 'general manager', true);
select pg_temp.assign('mk:cemre', 'cook', false);
select is(pg_temp.primary_of('mk:cemre'), tests.id('mk:job:general manager'),
  'somebody left with Manager alone has Manager as their primary job');
-- Deniz hosts (primary) and cooks; then Host moves under Management.
select tests.person('mk', 'deniz', 'employee', array['K'], array['host', 'cook']);
select tests.as_browser(tests.user('mk:owner'), format(
  'update public.jobs set department_id = %L where id = %L', pg_temp.management(), tests.id('mk:job:host')));
select is(pg_temp.primary_of('mk:deniz'), tests.id('mk:job:host'),
  'a primary job moved under Management is still their primary job');
select is(
  (select count(*)::integer from jsonb_array_elements(pg_temp.grid() -> 'employees') e
   join public.jobs j on j.id = (e ->> 'primary_job_id')::uuid
   where j.system_key = 'owner'),
  0, 'no primary job the Schedule reads is the Owner job');

-- The team board an employee reads (Employee Hub > Schedule) says the same.
create function pg_temp.primaries(answer jsonb, among uuid[]) returns text[] language sql as $$
  select array_agg((e ->> 'display_name') || ':' || coalesce(j.name, 'none') order by e ->> 'display_name')
  from jsonb_array_elements(answer -> 'employees') e
  left join public.jobs j on j.id = (e ->> 'primary_job_id')::uuid
  where (e ->> 'id')::uuid = any (among)
$$;
create temp table mk_board as
  select public.get_employee_schedule_board_service(tests.user('mk:bora'), tests.id('mk'), tests.week(0)) as answer;
select is(
  pg_temp.primaries((select answer from mk_board), array[tests.id('mk:deniz'), tests.id('mk:cemre')]),
  array['Cemre Person:General Manager', 'Deniz Person:Host'],
  'on the team board Cemre and Deniz have the same primary jobs');
select is(
  pg_temp.primaries((select answer from mk_board),
    array(select (e ->> 'id')::uuid from mk_board, jsonb_array_elements(answer -> 'employees') e)),
  pg_temp.primaries(pg_temp.grid(),
    array(select (e ->> 'id')::uuid from mk_board, jsonb_array_elements(answer -> 'employees') e)),
  'everybody on the team board has the primary job the manager''s Schedule reads');
select is(pg_temp.keys((select answer from mk_board) -> 'departments' -> 0), array['color', 'id', 'name', 'system_key'],
  'a team board department carries its system key');
select is(pg_temp.keys((select answer from mk_board) -> 'jobs' -> 0), array['color', 'department_id', 'id', 'name', 'system_key'],
  'a team board job carries its system key');
select is(
  pg_temp.keyed((select answer from mk_board) -> 'departments') || pg_temp.keyed((select answer from mk_board) -> 'jobs'),
  pg_temp.keyed(pg_temp.grid() -> 'departments') || pg_temp.keyed(pg_temp.grid() -> 'jobs'),
  'the team board names Management and Owner as the Schedule does');
select ok(
  (select bool_and(p.prosrc like '%app_private.schedule_departments_and_jobs(%'
      and p.prosrc like '%app_private.stored_primary_job(%'
      and p.prosrc not like '%is_primary%')
   from pg_proc p
   where p.oid in ('public.get_schedule_read_model_service(uuid,uuid,date)'::regprocedure,
                   'public.get_employee_schedule_board_service(uuid,uuid,date)'::regprocedure)),
  'the grid and the team board read Management, Owner and the stored primary from one place');

-- Employees > the list's Job column: the stored primary job; failing that the
-- Owner job (the owner's, never stored as primary), then the first job in the
-- catalog's order, whatever its department (as the Schedule places the row).
-- Emre is Remote, washes dishes and manages, and has no primary: a record saved before every record
-- needed one (DAVET-ERISIM). ponytail: saved with Dishwasher primary, the mark then taken off by hand.
select tests.person('mk', 'emre', 'employee', null, null);
select public.save_employee_service(
  tests.user('mk:owner'), tests.id('mk'), e.id, e.first_name, e.middle_name, e.last_name, e.preferred_name,
  e.invitation_email, e.start_date, e.internal_note, array[tests.id('mk:K')], tests.id('mk:K'),
  array[tests.id('mk:job:dishwasher'), tests.id('mk:job:general manager')], tests.id('mk:job:dishwasher'), true, false, e.revision)
from public.employee_profiles e where e.id = tests.id('mk:emre');
update public.employee_job_assignments set is_primary = false where employee_id = tests.id('mk:emre');
create function pg_temp.listed_job(w text, person text) returns text language sql as $$
  select l.primary_job_name
  from public.list_employees_service(tests.user(w || ':owner'), tests.id(w), false, '', 'all', 200, 0) l
  where l.id = tests.id(person)
$$;
select is(pg_temp.listed_job('mk', 'mk:cemre'), 'General Manager', 'the list shows Manager for somebody whose primary job it is');
select is(pg_temp.listed_job('mk', 'mk:bora'), 'Cook', 'and Cook for somebody who cooks (primary) and manages');
select is(pg_temp.listed_job('mk', 'mk:deniz'), 'Host', 'and Host, her primary job, though it now sits under Management');
select is(pg_temp.listed_job('mk', 'mk:emre'), 'Dishwasher',
  'and the first job, Dishwasher, for somebody with no primary job: a Management job does not go first');
select is(pg_temp.listed_job('mx', 'mx:owner'), 'Owner', 'and Owner for an owner who works only the Owner job');
-- The other owner also cooks and chose no primary.
select public.save_employee_service(
  tests.user('mx:owner'), tests.id('mx'), e.id, e.first_name, e.middle_name, e.last_name, e.preferred_name,
  e.invitation_email, e.start_date, e.internal_note, array[tests.id('mx:K'), tests.id('mx:B')], tests.id('mx:K'),
  array[(select j.id from public.jobs j where j.workspace_id = tests.id('mx') and j.system_key = 'owner'), tests.id('mx:job:cook')],
  null, e.is_remote, e.is_excluded_from_schedule, e.revision)
from public.employee_profiles e where e.id = tests.id('mx:owner');
select is(pg_temp.listed_job('mx', 'mx:owner'), 'Owner', 'and still Owner once they also cook without choosing a primary');

-- 3. The drawer's references carry each job's department and the departments --------

-- The answer's and a job's keys are checked in employee_references_ask_the_core.
select is(pg_temp.keys(pg_temp.references() -> 'departments' -> 0), array['archived_at', 'id', 'name', 'system_key'],
  'a department carries what the grouped Jobs picker shows');
select is(pg_temp.keyed(pg_temp.references() -> 'departments'), array['Bar=null', 'Kitchen=null', 'Leadership=management'],
  'the departments: Management by key, the archived one included, the deleted one not');
select is(pg_temp.keyed(pg_temp.references() -> 'jobs'), array['Assistant Manager=null', 'Cook=null', 'Dishwasher=null', 'General Manager=null', 'Host=null', 'Owner=owner', 'Server=null'],
  'the drawer knows which job is Owner');
select is(
  (select array_agg((x ->> 'name') || '@' || coalesce(d.name, 'none') order by x ->> 'name')
   from jsonb_array_elements(pg_temp.references() -> 'jobs') x
   left join public.departments d on d.id = (x ->> 'department_id')::uuid),
  array['Assistant Manager@Leadership', 'Cook@Kitchen', 'Dishwasher@none', 'General Manager@Leadership', 'Host@Leadership', 'Owner@Leadership', 'Server@Kitchen'],
  'each job says which department it sits under');
select is(pg_temp.dishwasher(pg_temp.references()), 'null'::jsonb, 'a job with no department reads as such in the drawer');
select is(pg_temp.from_mx(pg_temp.references()), 0,
  'no department or job of another workspace reaches the drawer''s references');
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

begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- BL-475 (user decisions 2026-09-30: "A to Z, no more ordering by hand";
-- "departments too, Management with no privilege"). Departments and jobs come
-- in name order everywhere: lower(name), then id. Nobody orders them by hand.
-- When a job has to be chosen for a person (a new primary job, the job the
-- Employees list names) the same order decides.
-- Example: Settings > Jobs lists "bakery, Kitchen, Management" and Kitchen's
-- jobs "bartender, Cook, Line Cook, prep cook, Server, Zest", whatever order
-- the owner added them in.

select tests.world('az');
-- Setup made Management first, the world Kitchen second; the owner adds a
-- department last, in lower case.
select public.create_department_with_jobs_service(tests.user('az:owner'), tests.id('az'),
  '{"name": "bakery", "color": "#3C7A68"}'::jsonb, '[]'::jsonb)::text;
-- The owner adds four more Kitchen jobs, the last letter first.
select public.create_department_jobs_service(tests.user('az:owner'), tests.id('az'), tests.id('az:kitchen'),
  '[{"name": "Zest", "color": "#D39A36"}, {"name": "prep cook", "color": "#D39A36"},
    {"name": "Line Cook", "color": "#D39A36"}, {"name": "bartender", "color": "#D39A36"}]'::jsonb)::text;
insert into tests.ids (label, id)
select 'az:job:' || split_part(lower(j.name), ' ', 1), j.id from public.jobs j
where j.workspace_id = tests.id('az') and j.name in ('Zest', 'prep cook', 'Line Cook', 'bartender')
on conflict (label) do update set id = excluded.id;

-- Ann works Zest (primary), bartender and Server; Bob works Cook; Carl works
-- Line Cook (primary), Server and prep cook. All at Kadikoy.
select tests.person('az', 'ann', 'employee', array['K'], array['zest', 'bartender', 'server']);
select tests.person('az', 'bob', 'employee', array['K'], array['cook']);
select tests.person('az', 'carl', 'employee', array['K'], array['line', 'server', 'prep']);

create function pg_temp.names(list jsonb) returns text[] language sql as $$
  select coalesce(array_agg(coalesce(x ->> 'name', x #>> '{}') order by n), '{}')
  from jsonb_array_elements(list) with ordinality t(x, n)
$$;
create function pg_temp.primary_of(person text) returns text language sql as $$
  select j.name from public.employee_job_assignments a join public.jobs j on j.id = a.job_id
  where a.employee_id = tests.id(person) and a.ended_at is null and a.is_primary
$$;
create function pg_temp.jobs_a_to_z() returns text[] language sql as $$
  select array['Assistant Manager', 'bartender', 'Cook', 'General Manager', 'Line Cook', 'Owner', 'prep cook', 'Server', 'Zest']
$$;
create function pg_temp.departments_a_to_z() returns text[] language sql as $$
  select array['bakery', 'Kitchen', 'Management']
$$;
create function pg_temp.settings() returns jsonb language sql as $$
  select public.read_settings_jobs_service(tests.user('az:owner'), tests.id('az'))
$$;
create function pg_temp.grid() returns jsonb language sql as $$
  select public.get_schedule_read_model_service(tests.user('az:owner'), tests.id('az'), tests.week(0))
$$;
create function pg_temp.board() returns jsonb language sql as $$
  select public.get_employee_schedule_board_service(tests.user('az:ann'), tests.id('az'), tests.week(0))
$$;
create function pg_temp.references() returns jsonb language sql as $$
  select public.read_employee_references_service(tests.user('az:owner'), tests.id('az'))
$$;
create function pg_temp.announcements() returns jsonb language sql as $$
  select public.get_announcements_service(tests.user('az:owner'), tests.id('az'))
$$;
create function pg_temp.documents() returns jsonb language sql as $$
  select public.document_definition_target_options_service(tests.user('az:owner'), tests.id('az'))
$$;

-- 1. Every read that lists the catalog lists departments and jobs A to Z -------------

select is(pg_temp.names(pg_temp.settings() -> 'departments'), pg_temp.departments_a_to_z(),
  'Settings > Jobs lists departments A to Z, Management with no privilege');
select is(pg_temp.names(pg_temp.settings() -> 'jobs'), pg_temp.jobs_a_to_z(), 'Settings > Jobs lists jobs A to Z');
select is(pg_temp.names(pg_temp.grid() -> 'departments'), pg_temp.departments_a_to_z(),
  'the Schedule read lists departments A to Z');
select is(pg_temp.names(pg_temp.grid() -> 'jobs'), pg_temp.jobs_a_to_z(), 'the Schedule read lists jobs A to Z');
select is(pg_temp.names(pg_temp.board() -> 'departments'), pg_temp.departments_a_to_z(),
  'the team board an employee reads lists departments A to Z');
select is(pg_temp.names(pg_temp.board() -> 'jobs'), pg_temp.jobs_a_to_z(),
  'the team board an employee reads lists jobs A to Z');
select is(pg_temp.names(pg_temp.references() -> 'departments'), pg_temp.departments_a_to_z(),
  'the Employees drawer lists departments A to Z');
select is(pg_temp.names(pg_temp.references() -> 'jobs'), pg_temp.jobs_a_to_z(),
  'the Employees drawer''s job picker lists jobs A to Z');
select is(pg_temp.names(pg_temp.announcements() -> 'departments'), pg_temp.departments_a_to_z(),
  'the announcement audience picker lists departments A to Z');
select is(pg_temp.names(pg_temp.announcements() -> 'jobs'), pg_temp.jobs_a_to_z(),
  'the announcement audience picker lists jobs A to Z');
select is(pg_temp.names(pg_temp.documents() -> 'departments'), pg_temp.departments_a_to_z(),
  'the document audience picker lists departments A to Z');
select is(pg_temp.names(pg_temp.documents() -> 'jobs'), pg_temp.jobs_a_to_z(),
  'the document audience picker lists jobs A to Z');

-- 2. A person's own jobs: the primary one first, then A to Z ------------------------

select is(pg_temp.names(public.get_employee_detail_service(tests.user('az:owner'), tests.id('az'), tests.id('az:ann')) -> 'jobs'),
  array['Zest', 'bartender', 'Server'], 'the Employees drawer shows Ann''s primary job, then the rest A to Z');
select is(pg_temp.names((select t -> 'job_names' from jsonb_array_elements(
    public.get_employee_hub_service(tests.user('az:bob'), tests.id('az'), tests.week(0), tests.week(0) + 6) -> 'team') t
    where (t ->> 'id')::uuid = tests.id('az:ann'))),
  array['bartender', 'Server', 'Zest'], 'Bob''s team page names Ann''s jobs A to Z');

-- 3. Nobody puts departments or jobs in order by hand any more ----------------------

-- BL-496 (FB-6.3.7): the unused position column is gone from both tables.
select hasnt_column('public', 'departments', 'sort_order', 'a department has no position column');
select hasnt_column('public', 'jobs', 'sort_order', 'nor does a job');
select hasnt_function('public', 'reorder_organization_entities_service', 'the reorder command is gone');
select hasnt_function('public', 'reorder_organization_entities', 'and the function behind it');

-- 4. A new department and its jobs take their A-to-Z place --------------------------

select is(pg_temp.names(public.create_department_with_jobs_service(tests.user('az:owner'), tests.id('az'),
    '{"name": "Bar", "color": "#3C7A68"}'::jsonb,
    '[{"name": "Spritz", "color": "#4478A8"}, {"name": "aperitivo", "color": "#4478A8"}]'::jsonb) -> 'jobs'),
  array['aperitivo', 'Spritz'], 'a department made with its jobs answers them A to Z');
select is(pg_temp.names(pg_temp.settings() -> 'departments'), array['bakery', 'Bar', 'Kitchen', 'Management'],
  'the new department takes its A-to-Z place');

-- 5. When a primary job has to be chosen, A to Z chooses it -------------------------

select public.update_job_assignments_service(tests.user('az:owner'), tests.id('az'), tests.id('az:job:zest'),
  jsonb_build_array(jsonb_build_object('employee_id', tests.id('az:ann'), 'assigned', false,
    'expected_revision', (select revision from public.employee_profiles where id = tests.id('az:ann')))))::text;
select is(pg_temp.primary_of('az:ann'), 'bartender',
  'Ann taken off Zest in Settings > Jobs: her new primary job is the first of the rest A to Z');
select public.delete_job_with_assignments_service(tests.user('az:owner'), tests.id('az'), tests.id('az:job:line'))::text;
select is(pg_temp.primary_of('az:carl'), 'prep cook',
  'Line Cook deleted: Carl''s new primary job is the first of the rest A to Z');

-- 6. The Employees list names the first job A to Z when none is primary -------------
-- Dana is not in Schedule and has two jobs and no primary: a record saved before every record needed
-- one (DAVET-ERISIM). ponytail: saved with Zest primary, the mark then taken off by hand.

select tests.person('az', 'dana', 'employee', array['K'], array['zest']);
select public.save_employee_service(
  tests.user('az:owner'), tests.id('az'), e.id, e.first_name, e.middle_name, e.last_name, e.preferred_name,
  e.invitation_email, e.start_date, e.internal_note, array[tests.id('az:K')], tests.id('az:K'),
  array[tests.id('az:job:zest'), tests.id('az:job:bartender')], tests.id('az:job:zest'), false, true, e.revision)::text
from public.employee_profiles e where e.id = tests.id('az:dana');
update public.employee_job_assignments set is_primary = false where employee_id = tests.id('az:dana');
select is((select l.primary_job_name from public.list_employees_service(tests.user('az:owner'), tests.id('az'),
    false, 'Dana', 'all', 50, 0) l where l.id = tests.id('az:dana')),
  'bartender', 'the Employees list names Dana''s first job A to Z');
select is(pg_temp.primary_of('az:dana'), null, 'and she has no primary job stored');

select * from finish();
rollback;

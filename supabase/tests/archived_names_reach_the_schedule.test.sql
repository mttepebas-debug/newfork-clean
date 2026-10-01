begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- G8b, BL-254 (K8, user decision 2026-09-28). A job or shift type archived
-- after its shifts were published keeps its name on those shifts: the Schedule
-- read and the team board an employee reads name it in referenced_jobs /
-- referenced_shift_types, and a ghost shift carries it. The pickers (jobs,
-- shift_types) still leave it out. A deleted job or type is named nowhere.
-- Example: Line Cook is archived on Wednesday; Monday's published Line Cook
-- shift still reads "Line Cook" on the grid, the export and the conflict panel,
-- but nobody can pick Line Cook for a new shift.

select tests.world('ar');
select public.create_department_jobs_service(tests.user('ar:owner'), tests.id('ar'), tests.id('ar:kitchen'),
  '[{"name": "Line Cook", "color": "#D39A36"}, {"name": "Prep", "color": "#D39A36"}]'::jsonb)::text;
insert into tests.ids (label, id)
select 'ar:job:' || lower(replace(j.name, ' ', '')), j.id from public.jobs j
where j.workspace_id = tests.id('ar') and j.name in ('Line Cook', 'Prep')
on conflict (label) do update set id = excluded.id;

-- Ann works Line Cook at both places; Bob works Prep and Cook at both; Mina
-- manages Kadikoy only, so what happens at Besiktas reaches her as ghosts.
select tests.person('ar', 'ann', 'employee', array['K', 'B'], array['linecook']);
select tests.person('ar', 'bob', 'employee', array['K', 'B'], array['prep', 'cook']);
select tests.person('ar', 'mina', 'manager', array['K'], array['cook']);

select tests.publish_week('ar', 1, '[
  {"label": "ann_k", "person": "ann", "loc": "K", "job": "linecook", "day": 0, "start": "09:00", "end": "13:00"},
  {"label": "ann_b", "person": "ann", "loc": "B", "job": "linecook", "day": 1, "start": "09:00", "end": "13:00"},
  {"label": "bob_b", "person": "bob", "loc": "B", "job": "prep", "day": 2, "start": "09:00", "end": "13:00"},
  {"label": "bob_k", "person": "bob", "loc": "K", "job": "cook", "day": 3, "start": "09:00", "end": "13:00"}
]'::jsonb)::text;

-- Two shift types: Brunch on Ann's shifts, Gone on Bob's Besiktas shift.
insert into public.shift_types (id, workspace_id, name, default_start_time, default_end_time) values
  (tests.remember('ar:type:brunch', gen_random_uuid()), tests.id('ar'), 'Brunch', '09:00', '13:00'),
  (tests.remember('ar:type:gone', gen_random_uuid()), tests.id('ar'), 'Gone', '09:00', '13:00');
-- ponytail: tests.add_shift sends no shift type; the published rows take theirs here.
update public.schedule_published_shifts set shift_type_id = tests.id('ar:type:brunch')
where id in (tests.id('ar:shift:ann_k'), tests.id('ar:shift:ann_b'));
update public.schedule_published_shifts set shift_type_id = tests.id('ar:type:gone')
where id = tests.id('ar:shift:bob_b');

-- After publishing: the owner archives Line Cook and Brunch in Settings, deletes
-- Prep, and Gone is deleted too.
select tests.as_browser(tests.user('ar:owner'), format(
  'update public.jobs set archived_at = now() where id = %L', tests.id('ar:job:linecook')));
update public.shift_types set archived_at = now() where id = tests.id('ar:type:brunch');
select public.delete_job_with_assignments_service(tests.user('ar:owner'), tests.id('ar'), tests.id('ar:job:prep'))::text;
update public.shift_types set archived_at = now(), deleted_at = now() where id = tests.id('ar:type:gone');

create function pg_temp.grid(person text, n integer) returns jsonb language sql as $$
  select public.get_schedule_read_model_service(tests.user(person), tests.id('ar'), tests.week(n))
$$;
create function pg_temp.board(n integer) returns jsonb language sql as $$
  select public.get_employee_schedule_board_service(tests.user('ar:ann'), tests.id('ar'), tests.week(n))
$$;
create function pg_temp.names(list jsonb) returns text[] language sql as $$
  select coalesce(array_agg(x ->> 'name' order by x ->> 'name'), '{}') from jsonb_array_elements(list) x
$$;
create function pg_temp.ghost(shift text) returns jsonb language sql as $$
  select g from jsonb_array_elements(pg_temp.grid('ar:mina', 1) -> 'ghost_shifts') g
  where (g ->> 'id')::uuid = tests.id('ar:shift:' || shift)
$$;
create function pg_temp.line_cook() returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('id', tests.id('ar:job:linecook'), 'name', 'Line Cook'))
$$;
create function pg_temp.brunch() returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('id', tests.id('ar:type:brunch'), 'name', 'Brunch'))
$$;

-- 1. The Schedule read names what the week's shifts point at ------------------------

select is(pg_temp.grid('ar:owner', 1) -> 'referenced_jobs', pg_temp.line_cook(),
  'the Schedule read names the archived Line Cook, not the live Cook nor the deleted Prep');
select ok(not ('Line Cook' = any (pg_temp.names(pg_temp.grid('ar:owner', 1) -> 'jobs'))),
  'the job picker still leaves Line Cook out');
select is(pg_temp.grid('ar:owner', 1) -> 'referenced_shift_types', pg_temp.brunch(),
  'the Schedule read names the archived Brunch, not the deleted Gone');
select ok(not ('Brunch' = any (pg_temp.names(pg_temp.grid('ar:owner', 1) -> 'shift_types'))),
  'the shift type picker still leaves Brunch out');

-- 2. A ghost shift carries the archived name, never a deleted one -------------------

select is(pg_temp.ghost('ann_b') ->> 'job_name', 'Line Cook',
  'Mina sees Ann''s Besiktas shift as a ghost named Line Cook');
select is(pg_temp.ghost('ann_b') ->> 'shift_type_name', 'Brunch', 'and Brunch');
select ok(pg_temp.ghost('bob_b') is not null, 'Bob''s Besiktas shift on the deleted Prep still reaches Mina as a ghost');
select is(pg_temp.ghost('bob_b') ->> 'job_name', null, 'but carries no job name');
select is(pg_temp.ghost('bob_b') ->> 'shift_type_name', null, 'nor a deleted shift type''s name');
select is(pg_temp.grid('ar:mina', 1) -> 'referenced_jobs', pg_temp.line_cook(),
  'Mina''s read names Line Cook for her own shift and the ghost');

-- 3. The team board an employee reads names them the same way ----------------------

select is(pg_temp.board(1) -> 'referenced_jobs', pg_temp.line_cook(), 'Ann''s team board names Line Cook');
select ok(not ('Line Cook' = any (pg_temp.names(pg_temp.board(1) -> 'jobs'))),
  'and its job list still leaves it out');
select is(pg_temp.board(1) -> 'referenced_shift_types', pg_temp.brunch(), 'Ann''s team board names Brunch');

-- 4. A week with nothing archived answers empty lists, never a missing key ----------

select is(pg_temp.grid('ar:owner', 2) -> 'referenced_jobs', '[]'::jsonb, 'an empty week names no archived job');
select is(pg_temp.grid('ar:owner', 2) -> 'referenced_shift_types', '[]'::jsonb, 'nor an archived shift type');
select is((pg_temp.board(2) -> 'referenced_jobs') || (pg_temp.board(2) -> 'referenced_shift_types'), '[]'::jsonb,
  'the team board answers both lists empty too');

select * from finish();
rollback;

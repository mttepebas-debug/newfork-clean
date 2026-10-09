begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- EMP-001 (user decisions 2026-09-30: item 6, S1, K4). A manager manages the
-- locations they are assigned to and nothing else. One who manages a location
-- without taking shifts there is assigned to it and excluded from the
-- Schedule. So a manager always keeps a location, excluded or not: with none
-- they would manage nothing. An excluded employee and a Remote person need none.
--
-- Derya manages Besiktas and is excluded. Can manages Kadikoy and Besiktas and
-- takes shifts; Melis manages Kadikoy and takes shifts. Mert is an excluded
-- employee at Kadikoy.

select tests.world('e');
select tests.person('e', 'zeynep', 'admin', array['K'], array['server']);
select tests.person('e', 'derya', 'manager', array['B'], array['cook']);
select tests.excluded('e', 'derya');
select tests.person('e', 'can', 'manager', array['K', 'B'], array['cook']);
select tests.person('e', 'melis', 'manager', array['K'], array['cook']);
select tests.person('e', 'mert', 'employee', array['K'], array['cook']);
select tests.excluded('e', 'mert');
select tests.person('e', 'emre', 'employee', array['K'], array['cook']);
select tests.person('e', 'veli', 'employee', array['B'], array['cook']);

create function pg_temp.refusal(statement text) returns text language plpgsql as $$
declare
  code text;
  reason text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics code = returned_sqlstate, reason = pg_exception_hint;
  return code || ' ' || coalesce(reason, '');
end;
$$;
create function pg_temp.reads(actor text, person text) returns text language sql as $$
  select pg_temp.refusal(format('select public.get_employee_detail_service(%L, %L, %L)',
    tests.user('e:' || actor), tests.id('e'), tests.id('e:' || person)))
$$;
-- Saves the record as it is, at the given locations and with the two flags.
create function pg_temp.save_as(actor text, person text, locs text[], remote boolean, excluded boolean)
returns text language sql as $$
  select pg_temp.refusal(format($f$select public.save_employee_service(%L, %L, e.id, e.first_name, e.middle_name,
      e.last_name, e.preferred_name, e.invitation_email, e.start_date, e.internal_note, %L::uuid[], %L::uuid,
      array(select j.job_id from public.employee_job_assignments j where j.employee_id = e.id and j.ended_at is null),
      (select j.job_id from public.employee_job_assignments j where j.employee_id = e.id and j.ended_at is null and j.is_primary),
      %L, %L, e.revision) from public.employee_profiles e where e.id = %L$f$,
    tests.user('e:' || actor), tests.id('e'),
    array(select tests.id('e:' || l) from unnest(locs) l),
    (select tests.id('e:' || locs[1]) where cardinality(locs) > 0),
    remote, excluded, tests.id('e:' || person)))
$$;
create function pg_temp.works_at(person text) returns text[] language sql as $$
  select coalesce(array_agg(case a.location_id when tests.id('e:K') then 'K' when tests.id('e:B') then 'B' end order by 1), '{}')
  from public.employee_location_assignments a
  where a.employee_id = tests.id('e:' || person) and a.ended_at is null
$$;

-- 1. Nothing of "manages without working there" is left -------------------------------
-- The names are split so this file does not name what it says is gone.

select is(
  (select count(*)::integer from pg_proc p
   where p.pronamespace in ('public'::regnamespace, 'app_private'::regnamespace, 'tests'::regnamespace)
     and p.prosrc ~ ('membership_managed' || '_locations|manages_without' || '_working|set_managed' || '_locations')),
  0, 'no function reads or writes what was removed');

-- 2. A manager reaches where they are assigned, excluded or not -----------------------

select is(app_private.scope_set(tests.user('e:derya'), tests.id('e'), 'schedule.edit'), array[tests.id('e:B')],
  'an excluded manager reaches the location they are assigned to');
select is(
  app_private.scope_set(tests.user('e:can'), tests.id('e'), 'schedule.edit'),
  array(select l from unnest(array[tests.id('e:K'), tests.id('e:B')]) l order by l),
  'a manager assigned to two locations reaches both');
select is(pg_temp.reads('derya', 'veli'), 'allowed', 'the excluded manager reads somebody at her location');
select is(pg_temp.reads('derya', 'emre'), '42501 authz.out_of_scope',
  'and nobody at a location she is not assigned to');
select is(pg_temp.reads('can', 'emre'), 'allowed', 'the manager of two locations reads somebody at the first');
select is(pg_temp.reads('can', 'veli'), 'allowed', 'and at the second');
select is(pg_temp.reads('can', 'derya'), 'allowed',
  'an excluded manager is there for the other manager of her location (M2)');

-- 3. On the Schedule ------------------------------------------------------------------
-- The grid opens a row for whoever has a shift that week; the read tells the
-- screen who is excluded, and nobody excluded is given a new shift.

create function pg_temp.open_edit(n integer) returns uuid language sql as $$
  select (public.acquire_schedule_edit_session_service(
    tests.user('e:owner'), tests.id('e'), tests.week(n), 'blank'::public.schedule_edit_source, null
  ) -> 'session' ->> 'id')::uuid
$$;
create temporary table edit on commit drop as select pg_temp.open_edit(1) as session;
create function pg_temp.add(person text, loc text, day integer) returns text language sql as $$
  select split_part(pg_temp.refusal(format(
    'select tests.add_shift(%L, %L, %L, 1, %L::jsonb)',
    tests.user('e:owner'), 'e', (select session from edit),
    jsonb_build_object('person', person, 'loc', loc, 'job', 'cook', 'day', day, 'start', '09:00', 'end', '13:00')
  )), ' ', 1)
$$;

select is(
  (select (e ->> 'is_excluded_from_schedule')::boolean
   from jsonb_array_elements(public.get_schedule_read_model_service(tests.user('e:owner'), tests.id('e'), tests.week(1)) -> 'employees') e
   where (e ->> 'id')::uuid = tests.id('e:derya')),
  true, 'the Schedule read says the excluded manager is excluded');
select is(pg_temp.add('derya', 'B', 2), '23514',
  'an excluded manager gets no shift at the location she manages, so she opens no row there');
select is(pg_temp.add('can', 'K', 2), 'allowed', 'a manager who takes shifts gets one at their first location');
select is(pg_temp.add('can', 'B', 4), 'allowed', 'and one at their second');

-- 4. K4: a manager keeps a location ---------------------------------------------------
-- Every manager who is not Remote, excluded from the Schedule or not (user
-- decision 2026-09-30). On saving the record the rule only ever speaks for an
-- excluded manager: anybody neither Remote nor excluded is asked for a location
-- by the older rule first.

select is(pg_temp.save_as('owner', 'derya', '{}', false, true), '22023 employee.manager_location_required',
  'an excluded manager is not saved with no location');
select throws_ok(
  format($f$select public.save_employee_service(%L, %L, e.id, e.first_name, e.middle_name, e.last_name,
      e.preferred_name, e.invitation_email, e.start_date, e.internal_note, '{}'::uuid[], null, '{}'::uuid[], null,
      false, true, e.revision) from public.employee_profiles e where e.id = %L$f$,
    tests.user('e:owner'), tests.id('e'), tests.id('e:derya')),
  '22023', 'a manager needs a location to manage',
  'and the refusal says it in words');
select is(pg_temp.works_at('derya'), array['B'], 'her location is as it was');
select is(pg_temp.save_as('owner', 'derya', array['B'], false, true), 'allowed',
  'with her location she is saved');
select is(pg_temp.save_as('owner', 'mert', '{}', false, true), 'allowed',
  'an excluded employee is saved with no location, as before');
select is(pg_temp.save_as('owner', 'emre', '{}', true, false), 'allowed',
  'a Remote person is saved with no location, as before');
select is(pg_temp.save_as('owner', 'emre', '{}', false, false), '22023 employee.location_required',
  'somebody neither Remote nor excluded still needs one');
select is(pg_temp.save_as('owner', 'melis', '{}', false, false), '22023 employee.location_required',
  'a manager who takes shifts included: the older rule answers first');

-- "Remove from <location>" does not take a manager's last location.
create function pg_temp.remove(person text, loc text) returns text language sql as $$
  select pg_temp.refusal(format('select public.remove_employee_from_location_service(%L, %L, %L, %L)',
    tests.user('e:zeynep'), tests.id('e'), tests.id('e:' || person), tests.id('e:' || loc)))
$$;
select is(pg_temp.remove('derya', 'B'), '22023 employee.manager_location_required',
  'an admin does not take an excluded manager off their only location');
select is(pg_temp.works_at('derya'), array['B'], 'she still works there');
select is(pg_temp.remove('melis', 'K'), '22023 employee.manager_location_required',
  'nor a manager who takes shifts: excluded or not, a manager keeps a location');
select is(pg_temp.works_at('melis'), array['K'], 'she still works there too');
select is(pg_temp.remove('veli', 'B'), 'allowed',
  'an employee is taken off their only location, as before: the record stays');

-- Nobody without a location is made a manager, excluded or not.
create function pg_temp.role_as(person text, role_key text) returns text language sql as $$
  select pg_temp.refusal(format('select public.update_employee_membership_role_service(%L, %L, %L, %L)',
    tests.user('e:owner'), tests.id('e'), tests.id('e:' || person),
    (select r.id from public.workspace_roles r where r.workspace_id = tests.id('e') and r.system_key::text = role_key)))
$$;
create function pg_temp.role_of(person text) returns text language sql as $$
  select r.system_key::text from public.workspace_memberships m join public.workspace_roles r on r.id = m.role_id
  where m.workspace_id = tests.id('e') and m.user_id = tests.user('e:' || person)
$$;
select is(pg_temp.role_as('mert', 'manager'), '22023 employee.manager_location_required',
  'an excluded employee with no location is not made a manager');
select is(pg_temp.role_of('mert'), 'employee', 'their role is as it was');
select is(pg_temp.role_as('veli', 'manager'), '22023 employee.manager_location_required',
  'nor an employee who takes shifts and was taken off their only location');
select is(pg_temp.role_of('veli'), 'employee', 'their role is as it was too');
select is(pg_temp.save_as('owner', 'mert', array['K'], false, true), 'allowed', 'once they are assigned to a location');
select is(pg_temp.role_as('mert', 'manager'), 'allowed', 'they are made a manager');
-- Emre was saved Remote above, with no location.
select is(pg_temp.role_as('emre', 'manager'), 'allowed', 'a Remote person is made a manager with no location');

-- Nor invited as one. Nil is excluded and was never given a location; Oya takes
-- shifts and was taken off her only one.
select tests.remember('e:nil', public.save_employee_service(
  tests.user('e:owner'), tests.id('e'), null, 'Nil', '', 'Person', '', 'nil.e@world.test', null, '',
  '{}'::uuid[], null, '{}'::uuid[], null, false, true, null));
select tests.remember('e:oya', public.save_employee_service(
  tests.user('e:owner'), tests.id('e'), null, 'Oya', '', 'Person', '', 'oya.e@world.test', null, '',
  array[tests.id('e:K')], tests.id('e:K'), array[tests.id('e:job:cook')], tests.id('e:job:cook'), false, false, null));
select is(pg_temp.remove('oya', 'K'), 'allowed', 'somebody not yet invited is taken off their only location');
select tests.remember('e:rana', public.save_employee_service(
  tests.user('e:owner'), tests.id('e'), null, 'Rana', '', 'Person', '', 'rana.e@world.test', null, '',
  '{}'::uuid[], null, '{}'::uuid[], null, true, false, null));
create function pg_temp.invite(person text, role_key text) returns text language sql as $$
  select pg_temp.refusal(format('select public.prepare_employee_invitation_service(%L, %L, %L, %L, %L, %L, %L)',
    tests.user('e:owner'), tests.id('e'), tests.id('e:' || person), person || '.e@world.test',
    (select r.id from public.workspace_roles r where r.workspace_id = tests.id('e') and r.system_key::text = role_key),
    md5(person) || md5(role_key), now() + interval '7 days'))
$$;
select is(pg_temp.invite('nil', 'manager'), '22023 employee.manager_location_required',
  'an excluded person with no location is not invited as a manager');
select is(pg_temp.invite('nil', 'employee'), 'allowed', 'and is invited as an employee');
select is(pg_temp.invite('oya', 'manager'), '22023 employee.manager_location_required',
  'nor is somebody who takes shifts and has no location');
select is(pg_temp.invite('rana', 'manager'), 'allowed', 'a Remote person is invited as a manager with no location');

select * from finish();
rollback;

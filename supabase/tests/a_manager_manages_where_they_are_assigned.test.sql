begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- EMP-001 (user decisions 2026-09-30: item 6, S1, K4). A manager manages the
-- locations they are given to manage, and a manager always has one: with none
-- they would manage nothing. One who manages a location without taking shifts
-- there is assigned to it and excluded from the Schedule. An excluded employee
-- and a Remote person need no location to work at.
-- DAVET-ERISIM (ROL-CIFT 6.3): Manages is set apart from Works at, by the
-- invitation and by the access change; a change to where somebody works leaves
-- what they manage as it was, so K4 is asked where Manages is set.
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

-- 1. Nothing of the old "manages without working there" is left -----------------------
-- The names are split so this file does not name what it says is gone. KARARLAR S-167 brings Manages
-- back apart from Works at, in the two-slot model's own table (membership_managed_locations), so that
-- table is not searched for; the old command and helper stay gone. The invitation gives Manages its
-- first rows (here where they are assigned); from then on it no longer follows Works at (slice 6.3).

select is(
  (select count(*)::integer from pg_proc p
   where p.pronamespace in ('public'::regnamespace, 'app_private'::regnamespace, 'tests'::regnamespace)
     and p.prosrc ~ ('manages_without' || '_working|set_managed' || '_locations')),
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

-- 4. K4: a manager keeps a location to manage ----------------------------------------
-- Every manager, Remote and excluded from the Schedule included (user decision
-- 2026-09-30; DAVET-ERISIM: every invitation or access change that makes a
-- manager names where they manage). Saving the record or taking somebody off a
-- location changes where they work, not what they manage.

create function pg_temp.manages(person text) returns text[] language sql as $$
  select coalesce(array_agg(case m.location_id when tests.id('e:K') then 'K' when tests.id('e:B') then 'B' end order by 1), '{}')
  from public.membership_managed_locations m
  join public.workspace_memberships member on member.id = m.membership_id
  where member.workspace_id = tests.id('e') and member.user_id = tests.user('e:' || person)
$$;

-- DAVET-ERISIM (Mert 2026-10-20): Remote and Exclude from schedule no longer lift the location rule.
select is(pg_temp.save_as('owner', 'derya', '{}', false, true), '22023 employee.location_required',
  'an excluded manager is not saved with no location to work at');
select is(pg_temp.save_as('owner', 'mert', '{}', false, true), '22023 employee.location_required',
  'nor is an excluded employee');
select is(pg_temp.save_as('owner', 'emre', '{}', true, false), '22023 employee.location_required',
  'nor a Remote person');
-- ponytail: a record saved before the rule can work nowhere; Derya and Emre are made such records by hand.
delete from public.employee_location_assignments where employee_id in (tests.id('e:derya'), tests.id('e:emre'));
select is(pg_temp.manages('derya'), array['B'], 'working nowhere, she still manages the one she managed');
select is(app_private.scope_set(tests.user('e:derya'), tests.id('e'), 'schedule.edit'), array[tests.id('e:B')],
  'so she still reaches it');
select is(pg_temp.works_at('derya'), '{}'::text[], 'though she works nowhere now');
select is(pg_temp.save_as('owner', 'derya', array['B'], false, true), 'allowed',
  'with her location back she is saved');
select is(pg_temp.save_as('owner', 'emre', '{}', false, false), '22023 employee.location_required',
  'somebody neither Remote nor excluded needs one too');
select is(pg_temp.save_as('owner', 'melis', '{}', false, false), '22023 employee.location_required',
  'a manager who takes shifts included: the older rule answers first');

-- "Remove from <location>" takes where they work, not what they manage.
create function pg_temp.remove(person text, loc text) returns text language sql as $$
  select pg_temp.refusal(format('select public.remove_employee_from_location_service(%L, %L, %L, %L)',
    tests.user('e:zeynep'), tests.id('e'), tests.id('e:' || person), tests.id('e:' || loc)))
$$;
select is(pg_temp.remove('derya', 'B'), 'allowed',
  'an admin takes an excluded manager off the location she works at');
select is(pg_temp.manages('derya'), array['B'], 'she still manages it');
select is(pg_temp.remove('melis', 'K'), 'allowed',
  'and a manager who takes shifts off theirs');
select is(pg_temp.manages('melis'), array['K'], 'who still manages it too');
select is(pg_temp.remove('veli', 'B'), 'allowed',
  'an employee is taken off their only location, as before: the record stays');

-- Nobody is made a manager with nowhere to manage, excluded, Remote or not.
-- The access change keeps the employee slot they hold.
create function pg_temp.access_as(person text, role_key text, places text[]) returns text language sql as $$
  select pg_temp.refusal(format('select public.change_employee_access_service(%L, %L, %L, %L, %L, %L::uuid[], null, null)',
    tests.user('e:owner'), tests.id('e'), tests.id('e:' || person),
    (select m.employee_role_id from public.workspace_memberships m
     where m.workspace_id = tests.id('e') and m.user_id = tests.user('e:' || person)),
    (select r.id from public.workspace_roles r where r.workspace_id = tests.id('e') and r.system_key::text = role_key),
    array(select tests.id('e:' || l) from unnest(places) l)))
$$;
create function pg_temp.role_of(person text) returns text language sql as $$
  select r.system_key::text from public.workspace_memberships m join public.workspace_roles r on r.id = coalesce(m.role_id, m.employee_role_id)
  where m.workspace_id = tests.id('e') and m.user_id = tests.user('e:' || person)
$$;
select is(pg_temp.access_as('mert', 'manager', '{}'), '22023 access.manages_required',
  'an excluded employee is not made a manager with nowhere to manage');
select is(pg_temp.role_of('mert'), 'employee', 'their role is as it was');
select is(pg_temp.access_as('veli', 'manager', '{}'), '22023 access.manages_required',
  'nor an employee who takes shifts and was taken off their only location');
select is(pg_temp.role_of('veli'), 'employee', 'their role is as it was too');
select is(pg_temp.access_as('mert', 'manager', array['K']), 'allowed',
  'given a location to manage they are made a manager');
select is(pg_temp.manages('mert'), array['K'], 'and manage it');
-- Emre was left Remote above, with no location.
select is(pg_temp.access_as('emre', 'manager', '{}'), '22023 access.manages_required',
  'a Remote person is not made a manager with nowhere to manage either');
select is(pg_temp.access_as('emre', 'manager', array['B']), 'allowed',
  'and is made one with a location to manage, working nowhere');

-- Nor invited as one. Nil is excluded and works at Kadikoy; Oya takes shifts and was
-- taken off her only location; Rana is Remote and works at Kadikoy (DAVET-ERISIM: both need one).
select tests.remember('e:nil', public.save_employee_service(
  tests.user('e:owner'), tests.id('e'), null, 'Nil', '', 'Person', '', 'nil.e@world.test', null, '',
  array[tests.id('e:K')], tests.id('e:K'), array[tests.id('e:job:cook')], tests.id('e:job:cook'), false, true, null));
select tests.remember('e:oya', public.save_employee_service(
  tests.user('e:owner'), tests.id('e'), null, 'Oya', '', 'Person', '', 'oya.e@world.test', null, '',
  array[tests.id('e:K')], tests.id('e:K'), array[tests.id('e:job:cook')], tests.id('e:job:cook'), false, false, null));
select is(pg_temp.remove('oya', 'K'), 'allowed', 'somebody not yet invited is taken off their only location');
select tests.remember('e:rana', public.save_employee_service(
  tests.user('e:owner'), tests.id('e'), null, 'Rana', '', 'Person', '', 'rana.e@world.test', null, '',
  array[tests.id('e:K')], tests.id('e:K'), array[tests.id('e:job:cook')], tests.id('e:job:cook'), true, false, null));
-- An employee role goes in the employee slot, a manager role in the management one with its Manages.
create function pg_temp.invite(person text, role_key text, places text[]) returns text language sql as $$
  select pg_temp.refusal(format('select public.prepare_employee_invitation_service(%L, %L, %L, %L, %L, %L, %L::uuid[], %L, %L)',
    tests.user('e:owner'), tests.id('e'), tests.id('e:' || person), person || '.e@world.test',
    (select r.id from public.workspace_roles r where r.workspace_id = tests.id('e') and r.system_key::text = role_key
       and r.access_class = 'employee'),
    (select r.id from public.workspace_roles r where r.workspace_id = tests.id('e') and r.system_key::text = role_key
       and r.access_class <> 'employee'),
    array(select tests.id('e:' || l) from unnest(places) l),
    md5(person) || md5(role_key || array_to_string(places, ',')), now() + interval '7 days'))
$$;
select is(pg_temp.invite('nil', 'manager', '{}'), '22023 access.manages_required',
  'an excluded person is not invited as a manager with nowhere to manage');
select is(pg_temp.invite('nil', 'manager', array['B']), 'allowed',
  'and is with a location to manage, assigned there or not');
select is(pg_temp.invite('nil', 'employee', '{}'), 'allowed', 'and is invited as an employee');
select is(pg_temp.invite('oya', 'manager', array['K']), '22023 ',
  'somebody who takes shifts and has no location is not invited at all: they need a location to work at');
select is(pg_temp.invite('rana', 'manager', '{}'), '22023 access.manages_required',
  'a Remote person is not invited as a manager with nowhere to manage');
select is(pg_temp.invite('rana', 'manager', array['B']), 'allowed',
  'and is with a location to manage, working elsewhere');

select * from finish();
rollback;

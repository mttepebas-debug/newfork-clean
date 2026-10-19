begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- ROL-CIFT slice 6.4 (design §4.10, KARARLAR S-166): somebody who only manages finishes setup with no
-- Availability step; somebody who works shifts too gets it. Neither is asked for time off in setup.
-- Giving the employee access later adds the step to an open onboarding; giving it up takes it away
-- (app_private.availability_follows_role).

select tests.world('mo');
select tests.person('mo', 'mona', 'manager', array['K'], array['general manager'], 'onboarding');
select tests.person('mo', 'dora', 'manager', array['K'], array['cook'], 'onboarding');

create function pg_temp.steps(person text) returns text[] language sql as $$
  select coalesce(array_agg(distinct r.kind::text order by r.kind::text), '{}')
  from public.employee_onboarding_requirements r
  join public.employee_onboarding_cases c on c.id = r.case_id
  where c.employee_id = tests.id('mo:' || person) and c.status <> 'cancelled' and r.lifecycle_retired_at is null
$$;

select ok(not app_private.has_employee_access(tests.id('mo'), tests.user('mo:mona')), 'Mona only manages');
select ok(not 'availability' = any (pg_temp.steps('mona')), 'her setup has no Availability step');
select ok('availability' = any (pg_temp.steps('dora')), 'Dora, who works shifts too, has it');
select ok(not exists (select 1 from unnest(pg_temp.steps('mona') || pg_temp.steps('dora')) k where k ilike '%time_off%'),
  'nobody is asked for time off in setup');

-- The step follows the employee access while the setup is open.
select tests.employee_slot('mo', 'mona');
select ok('availability' = any (pg_temp.steps('mona')), 'given the employee access, Mona''s setup gains the step');
select tests.no_employee_slot('mo', 'mona');
select ok(not 'availability' = any (pg_temp.steps('mona')), 'and loses it with the access');

select * from finish();
rollback;

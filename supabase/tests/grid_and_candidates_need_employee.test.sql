begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- ROL-CIFT 2.1 (KARARLAR S-164 ... S-169; design §4.4): only somebody with the
-- employee access is scheduled. Mona only manages Kadikoy: she is on no grid, no
-- exchange lists her, a shift is not hers to take, and she does not hear about
-- open shifts. Dora manages Kadikoy and works there too: she is everywhere Mona
-- is not. Pia is invited and has no account yet: she is on the grid as today.

select tests.world('ge');
select tests.person('ge', 'mona', 'manager', array['K'], array['cook']);
select tests.no_employee_slot('ge', 'mona');
select tests.person('ge', 'dora', 'manager', array['K'], array['cook']);
select tests.person('ge', 'emre', 'employee', array['K'], array['cook']);
select tests.person('ge', 'pia', 'employee', array['K'], array['cook'], 'pending');

select tests.publish_week('ge', 1, '[
  {"label": "emre-k", "person": "emre", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}
]');

create function pg_temp.on_grid(person text) returns boolean
language sql
as $$
  select exists (
    select 1
    from jsonb_array_elements(public.get_schedule_read_model_service(
      tests.user('ge:owner'), tests.id('ge'), tests.week(1)) -> 'employees') e
    where e ->> 'id' = tests.id('ge:' || person)::text)
$$;
create function pg_temp.candidate(person text) returns boolean
language sql
as $$
  select exists (
    select 1
    from jsonb_array_elements(public.shift_exchanges_candidates_service(
      tests.user('ge:emre'), tests.id('ge'), tests.id('ge:shift:emre-k')) -> 'employees') e
    where e ->> 'id' = tests.id('ge:' || person)::text)
$$;
create function pg_temp.take(person text) returns jsonb
language sql
as $$
  select app_private.eligibility(tests.id('ge'), tests.id('ge:' || person),
    public.shift_exchange_shift(tests.id('ge'), tests.id('ge:shift:emre-k')), '{"operation": "cover_accept"}')
$$;
create function pg_temp.hears_open_shifts(person text) returns boolean
language sql
as $$
  select exists (
    select 1
    from jsonb_array_elements(public.get_notification_preferences_service(
      tests.user('ge:' || person), tests.id('ge')) -> 'topics') t
    where t ->> 'key' = 'open_shifts')
$$;

-- The grid
select is(pg_temp.on_grid('mona'), false, 'Mona, who only manages, is not on the Kadikoy grid');
select is(pg_temp.on_grid('dora'), true, 'Dora, who manages and works at Kadikoy, is on it');
select is(pg_temp.on_grid('pia'), true, 'Pia, invited with no account yet, is on it as today');

-- Exchanges
select is(pg_temp.candidate('mona'), false, 'Emre''s cover search does not list Mona');
select is(pg_temp.candidate('dora'), true, 'it lists Dora');

-- A shift is not hers to take
select is(pg_temp.take('mona') ->> 'status', 'ineligible', 'a shift is not Mona''s to take');
select ok(pg_temp.take('mona') -> 'blockers' @> '[{"code": "no_employee_access"}]'::jsonb,
  'because she has no employee access');
select is(pg_temp.take('dora') ->> 'status', 'eligible', 'Dora may take it');
select ok(not (pg_temp.take('dora') -> 'blockers' @> '[{"code": "no_employee_access"}]'::jsonb),
  'and no employee access blocker is said about her');

-- Open shifts are heard by whoever may apply for them (exchange.apply_own)
select is(pg_temp.hears_open_shifts('mona'), false, 'Mona does not hear about open shifts');
select is(pg_temp.hears_open_shifts('dora'), true, 'Dora does');

-- The Employees drawer reads the record's two access slots (Exclude from schedule, 2.2)
select is(public.get_employee_detail_service(tests.user('ge:owner'), tests.id('ge'), tests.id('ge:mona')) -> 'access',
  '{"employee": false, "management": "manager"}'::jsonb, 'Mona''s record says she only manages');
select is(public.get_employee_detail_service(tests.user('ge:owner'), tests.id('ge'), tests.id('ge:dora')) -> 'access',
  '{"employee": true, "management": "manager"}'::jsonb, 'Dora''s record says she manages and works');

select * from finish();
rollback;

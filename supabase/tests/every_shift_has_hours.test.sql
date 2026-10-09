begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- FOUNDATION-B 5.4: every shift has hours. A shift without hours or with the
-- same start and end is refused with one message each; the timeless states
-- are gone; "hide time on badge" is a display choice only.

select tests.world('hh');
select tests.person('hh', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('hh', 'emre', 'employee', array['K'], array['cook']);

create temporary table hh (key text primary key, value uuid);
insert into hh values ('session', (public.acquire_schedule_edit_session_service(
  tests.user('hh:ayse'), tests.id('hh'), tests.week(1), 'blank', null) -> 'session' ->> 'id')::uuid);

create function pg_temp.shift(start_time text, end_time text, extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object(
    'location_id', tests.id('hh:K'), 'employee_id', tests.id('hh:emre'), 'job_id', tests.id('hh:job:cook'),
    'scheduled_date', tests.week(1) + 1, 'time_basis', 'explicit',
    'start_time', start_time, 'end_time', end_time, 'time_timezone', 'Europe/Istanbul', 'note', '') || extra
$$;
create function pg_temp.create(payload jsonb) returns jsonb language sql as $$
  select public.mutate_schedule_edit_shift_service(
    tests.user('hh:ayse'), tests.id('hh'), (select value from hh where key = 'session'),
    (select e.revision from public.schedule_edit_sessions e where e.id = (select value from hh where key = 'session')),
    'create', gen_random_uuid(), null, payload, gen_random_uuid())
$$;

select throws_ok($$select pg_temp.create(pg_temp.shift('09:00', '09:00'))$$,
  '22023', 'Start and end time cannot be the same.', 'the same start and end is refused with one message');
select throws_ok($$select pg_temp.create(pg_temp.shift(null, null))$$,
  '22023', 'Enter start and end time.', 'a shift without hours is refused');
select throws_ok($$select pg_temp.create(pg_temp.shift(null, null, '{"time_basis": "unresolved"}'))$$,
  '22023', 'invalid shift time source', 'a shift cannot wait for its hours any more');

select lives_ok($$select tests.add_shift(tests.user('hh:ayse'), 'hh', (select value from hh where key = 'session'), 1,
  '{"person": "emre", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"}')$$,
  'a shift with hours saves');
select lives_ok($$select pg_temp.create(pg_temp.shift('16:00', '20:00', '{"hide_time_on_badge": true}') - 'time_basis')$$,
  'a shift can hide its time on the badge without naming where its hours come from');
select is(
  (select array_agg(distinct time_basis) from public.schedule_edit_session_shifts
   where session_id = (select value from hh where key = 'session')),
  array['explicit'],
  'hiding the time on the badge does not change where the hours come from'
);

select * from finish();
rollback;

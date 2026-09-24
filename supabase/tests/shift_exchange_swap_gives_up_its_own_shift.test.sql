begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- BL-092: in a swap each person gives up the shift they hold for the one they
-- take, so the shift they give up never counts as overlapping the one they
-- take. Ali and Deniz both work at Kadikoy and Besiktas; they swap two shifts
-- at the same time on the same day, and each location's manager approves its
-- side. A shift somebody keeps still counts.

select tests.world('bx');
select tests.person('bx', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('bx', 'mehmet', 'manager', array['B'], array['cook']);
select tests.person('bx', 'ali', 'employee', array['K', 'B'], array['cook']);
select tests.person('bx', 'deniz', 'employee', array['K', 'B'], array['cook']);
select tests.publish_week('bx', 1, '[
  {"label": "ali-k", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"},
  {"label": "deniz-b", "person": "deniz", "loc": "B", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"},
  {"label": "ali-k2", "person": "ali", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "13:00"},
  {"label": "ali-k2-late", "person": "ali", "loc": "K", "job": "cook", "day": 2, "start": "16:00", "end": "20:00"},
  {"label": "deniz-b2", "person": "deniz", "loc": "B", "job": "cook", "day": 2, "start": "14:00", "end": "18:00"}
]');

create temporary table bx (key text primary key, value jsonb);
create function pg_temp.command(person text, command jsonb) returns jsonb language sql as $$
  select public.shift_exchanges_command_service(tests.user('bx:' || person), tests.id('bx'), command, gen_random_uuid())
$$;
create function pg_temp.case_id() returns uuid language sql as $$
  select (value ->> 'case_id')::uuid from bx where key = 'created'
$$;
create function pg_temp.application_id() returns uuid language sql as $$
  select a.id from public.shift_exchange_applications a where a.case_id = pg_temp.case_id()
$$;
create function pg_temp.revision() returns integer language sql as $$
  select c.revision from public.shift_exchange_cases c where c.id = pg_temp.case_id()
$$;
create function pg_temp.approve(person text) returns jsonb language sql as $$
  select pg_temp.command(person, jsonb_build_object(
    'action', 'approve', 'case_id', pg_temp.case_id(), 'application_id', pg_temp.application_id(),
    'expected_revision', pg_temp.revision(),
    'fingerprint', public.shift_exchange_preview(
      tests.user('bx:' || person), tests.id('bx'), pg_temp.case_id(), pg_temp.application_id()) ->> 'fingerprint'))
$$;
create function pg_temp.holder(label text) returns uuid language sql as $$
  select employee_id from public.schedule_published_shifts where id = tests.id('bx:shift:' || label)
$$;

-- Same time, two locations: each gives up exactly the shift the other takes.
insert into bx values ('created', pg_temp.command('ali', jsonb_build_object(
  'action', 'create', 'kind', 'swap',
  'shift_id', tests.id('bx:shift:ali-k'), 'requested_shift_id', tests.id('bx:shift:deniz-b'))));
select tests.settle();
select is((select value ->> 'status' from bx where key = 'created'), 'open',
  'Ali offers his Kadikoy shift for Deniz''s Besiktas shift at the same time');

insert into bx values ('accepted', pg_temp.command('deniz', jsonb_build_object(
  'action', 'accept', 'case_id', pg_temp.case_id(), 'application_id', pg_temp.application_id(),
  'expected_revision', pg_temp.revision())));
select tests.settle();
select is(
  (select status from public.shift_exchange_applications where id = pg_temp.application_id()),
  'pending_manager',
  'Deniz accepts: the Kadikoy shift she takes does not clash with the Besiktas shift she gives up'
);

select is(
  public.shift_exchange_preview(tests.user('bx:ayse'), tests.id('bx'), pg_temp.case_id(), pg_temp.application_id()) ->> 'allowed',
  'true',
  'the Kadikoy manager may approve it'
);
insert into bx values ('ayse', pg_temp.approve('ayse'));
select tests.settle();
select is(pg_temp.holder('ali-k'), tests.id('bx:ali'), 'one location''s approval changes nobody''s shifts yet');

insert into bx values ('mehmet', pg_temp.approve('mehmet'));
select tests.settle();
select is((select status from public.shift_exchange_cases where id = pg_temp.case_id()), 'completed',
  'the Besiktas manager''s approval completes the swap');
select is(pg_temp.holder('ali-k'), tests.id('bx:deniz'), 'Deniz now works the Kadikoy shift');
select is(pg_temp.holder('deniz-b'), tests.id('bx:ali'), 'Ali now works the Besiktas shift');

-- A shift somebody keeps still counts: Ali would give up his morning but keep
-- his evening shift, and Deniz's afternoon shift overlaps that evening.
select throws_ok(
  format($$select pg_temp.command('ali', jsonb_build_object('action', 'create', 'kind', 'swap',
    'shift_id', %L::uuid, 'requested_shift_id', %L::uuid))$$,
    tests.id('bx:shift:ali-k2'), tests.id('bx:shift:deniz-b2')),
  'P0001', 'You are not eligible for the teammate shift',
  'a swap is refused when the shift taken overlaps a shift the person keeps'
);

select * from finish();
rollback;

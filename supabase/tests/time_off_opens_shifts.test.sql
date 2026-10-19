begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- BL-183, FB-6.3.7: approved time off leaves the shifts in it open. The owner's
-- own waits for a decision like anybody's (KARARLAR S-169): here the admin
-- decides it. An employee's request waits for its reviewers too.

select tests.world('ot');
-- The owner works here too (ROL-CIFT: the employee side needs the employee slot).
select tests.employee_slot('ot', 'owner');
select tests.person('ot', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('ot', 'mert', 'manager', array['K'], array['cook']);
select tests.person('ot', 'can', 'manager', array['B'], array['cook']);
select tests.person('ot', 'zeynep', 'admin', array['K'], array['cook']);
select tests.person('ot', 'ali', 'employee', array['K'], array['cook']);
-- Olcay (the owner) works four shifts on Wednesday at Kadikoy and one on
-- Thursday at Besiktas.
-- The owner works the Owner job only until somebody assigns another (BL-218).
insert into public.employee_job_assignments (workspace_id, employee_id, job_id, created_by)
values (tests.id('ot'), tests.id('ot:owner'), tests.id('ot:job:cook'), tests.user('ot:owner'));
select tests.publish_week('ot', 1, '[
  {"label": "olcay-k1", "person": "owner", "loc": "K", "job": "cook", "day": 2, "start": "07:00", "end": "09:00"},
  {"label": "olcay-k", "person": "owner", "loc": "K", "job": "cook", "day": 2, "start": "10:00", "end": "16:00"},
  {"label": "olcay-k3", "person": "owner", "loc": "K", "job": "cook", "day": 2, "start": "17:00", "end": "19:00"},
  {"label": "olcay-k4", "person": "owner", "loc": "K", "job": "cook", "day": 2, "start": "20:00", "end": "22:00"},
  {"label": "olcay-b", "person": "owner", "loc": "B", "job": "cook", "day": 3, "start": "10:00", "end": "16:00"}
]');

create function pg_temp.status(request uuid) returns text language sql as $$
  select r.status::text from public.schedule_time_off_requests r where r.id = request
$$;
create function pg_temp.admin_approves(request uuid) returns text language sql as $$
  select public.decide_time_off_service(tests.user('ot:zeynep'), tests.id('ot'), request, 'approve', '',
    app_private.time_off_impact(tests.id('ot'), request) ->> 'fingerprint') ->> 'status'
$$;

-- 1. Olcay takes Wednesday off (tests.leave asks for the Wednesday of the week).
select tests.leave('ot', 'owner', 1);
select is(pg_temp.status(tests.id('ot:owner:time_off')), 'pending', 'the owner''s time off waits for a decision');
select is(pg_temp.admin_approves(tests.id('ot:owner:time_off')), 'approved', 'the admin approves it');
select is((select employee_id from public.schedule_published_shifts where id = tests.id('ot:shift:olcay-k')), null::uuid,
  'the Wednesday Kadikoy shift is left open');
select is((select count(*)::integer from public.schedule_published_shifts
  where id in (tests.id('ot:shift:olcay-k1'), tests.id('ot:shift:olcay-k3'), tests.id('ot:shift:olcay-k4')) and employee_id is null), 3,
  'and so are his three other Wednesday shifts');
select is((select employee_id from public.schedule_published_shifts where id = tests.id('ot:shift:olcay-b')), tests.id('ot:owner'),
  'his Thursday at Besiktas stays his');

-- The record of the shifts an approval opened is kept as it was and is private.
select throws_ok($$update public.time_off_assignment_releases set before_assignment = '{}' where request_id = tests.id('ot:owner:time_off')$$,
  '55000', null, 'the record of an opened shift cannot be rewritten');
select throws_ok($$delete from public.time_off_assignment_releases where request_id = tests.id('ot:owner:time_off')$$,
  '55000', null, 'nor erased');
set local role authenticated;
select throws_ok($$select * from public.time_off_assignment_releases$$, '42501', null, 'and a signed-in browser cannot read it');
reset role;

-- 2. Time off that leaves no shift open is decided the same way.
select tests.leave('ot', 'owner', 2);
-- ponytail: one transaction has one now(), so tests.leave may remember the
-- first request; the week-2 one is found by its day.
select tests.remember('ot:owner:time_off:2', (select s.request_id from public.schedule_time_off_segments s
  where s.workspace_id = tests.id('ot') and s.segment_date = tests.week(2) + 2));
select is(pg_temp.status(tests.id('ot:owner:time_off:2')), 'pending', 'the owner''s time off with no shift in it waits too');
select is(pg_temp.admin_approves(tests.id('ot:owner:time_off:2')), 'approved', 'and is approved the same way');

-- 3. An employee's request still waits for review.
select tests.leave('ot', 'ali', 1);
select is(pg_temp.status(tests.id('ot:ali:time_off')), 'pending', 'Ali''s time-off request waits for review');

select * from finish();
rollback;

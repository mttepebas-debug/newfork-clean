begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

-- Time off rebuild D6 (KARARLAR S-239 (2)): no setting, no automatic decline. app_private.time_off_requests_sweep()
-- runs every five minutes (pg_cron job time-off-requests):
--   * a request still waiting a day before it starts reminds whoever may answer it, once (time_off.decision_reminder,
--     S-169's order); not one asked in its last day, not one already answered, never a cancellation;
--   * a request still waiting when it starts expires: the employee hears it was not answered in time and the cards
--     still waiting close;
--   * a cancellation still waiting when the time off is over expires; the time off stays as it is.
-- Each request on its own: one that fails is rolled back alone and kept in
-- app_private.time_off_request_sweep_failures (BL-507); a pass stops at its count or its time (BL-506).
--
-- World tw: Kadikoy (K) and Besiktas (B), both Istanbul. Besiktas has no manager.
--   mk - manager at K                   ad - admin
--   ali, cem, dor, eve, fay, gus, hal, ivy, jon, kim - employees at K
--   bea - employee at B

select tests.world('tw');
select tests.person('tw', 'mk', 'manager', array['K'], array['general manager']);
select tests.person('tw', 'ad', 'admin', array['K'], array['general manager']);
select tests.person('tw', 'bea', 'employee', array['B'], array['cook']);
select tests.person('tw', 'ali', 'employee', array['K'], array['cook']);
select tests.person('tw', 'cem', 'employee', array['K'], array['cook']);
select tests.person('tw', 'dor', 'employee', array['K'], array['cook']);
select tests.person('tw', 'eve', 'employee', array['K'], array['cook']);
select tests.person('tw', 'fay', 'employee', array['K'], array['cook']);
select tests.person('tw', 'gus', 'employee', array['K'], array['cook']);
select tests.person('tw', 'hal', 'employee', array['K'], array['cook']);
select tests.person('tw', 'ivy', 'employee', array['K'], array['cook']);
select tests.person('tw', 'jon', 'employee', array['K'], array['cook']);
select tests.person('tw', 'kim', 'employee', array['K'], array['cook']);
select tests.person('tw', 'lia', 'employee', array['K'], array['cook']);
select tests.settle();
create temporary table checked_notices as select n.id from public.person_notifications n where n.workspace_id = tests.id('tw');

create temporary table fixture (key text primary key, value uuid);
create function pg_temp.ask(person text, first_day date, last_day date)
returns uuid
language sql
as $$
  select (public.ask_time_off_service(tests.user('tw:' || person), tests.id('tw'), 'vacation', first_day, last_day, true,
    null, null, 'Family visit', 'Europe/Istanbul', gen_random_uuid()) ->> 'id')::uuid
$$;
create function pg_temp.req(label text) returns public.time_off_requests language sql as $$
  select r from public.time_off_requests r where r.id = (select value from fixture where key = label)
$$;
create function pg_temp.approve(person text, label text) returns jsonb language sql as $$
  select public.answer_time_off_service(tests.user('tw:' || person), tests.id('tw'), (select value from fixture where key = label),
    'approve', null, (pg_temp.req(label)).revision,
    app_private.time_off_shifts_print(app_private.time_off_shifts_at_stake(pg_temp.req(label))))
$$;
-- The employee asks to cancel the time off under `label`; gives back the cancellation's own id.
create function pg_temp.ask_cancel(person text, label text) returns uuid language plpgsql as $$
begin
  perform public.ask_time_off_cancellation_service(tests.user('tw:' || person), tests.id('tw'), (select value from fixture where key = label),
    'Plans changed', (pg_temp.req(label)).revision, gen_random_uuid());
  return (select c.id from public.time_off_requests c where c.kind = 'cancel' and c.status = 'pending'
          and c.cancels_id = (select value from fixture where key = label));
end;
$$;
-- ponytail: nothing in the product moves the clock and now() is fixed in a transaction; a request is moved
-- by hand to start `starts_in` from now, `hours` long, asked `asked_ago` ago. Time off that was approved keeps
-- all of it, and a cancellation is moved with the time off it cancels.
create function pg_temp.place(label text, starts_in interval, asked_ago interval, hours interval default interval '24 hours')
returns void
language sql
as $$
  update public.time_off_requests r
  set starts_at = now() + starts_in, ends_at = now() + starts_in + hours, created_at = now() - asked_ago,
      effective = case when isempty(r.effective) then r.effective
        else tstzmultirange(tstzrange(now() + starts_in, now() + starts_in + hours, '[)')) end
  where r.id = (select value from fixture where key = label) or r.cancels_id = (select value from fixture where key = label)
$$;
-- Who got a notice of this type about this request, by label, sorted.
create function pg_temp.told(notice text, request_label text)
returns text[]
language sql
as $$
  select coalesce(array_agg(i.label order by i.label), '{}')
  from public.person_notifications n
  join tests.ids i on i.id = n.user_id and i.label like 'tw:%:user'
  where n.type_key = told.notice and n.subject_type = 'time_off'
    and n.subject_id = (select f.value from fixture f where f.key = told.request_label)
$$;
-- How the cards asking about this request closed.
create function pg_temp.closed(request_label text) returns text[] language sql as $$
  select coalesce(array_agg(distinct coalesce(n.resolution, 'open') order by coalesce(n.resolution, 'open')), '{}')
  from public.person_notifications n
  join public.notification_types t on t.key = n.type_key and t.needs_action
  where n.subject_type = 'time_off' and n.subject_id = (select f.value from fixture f where f.key = closed.request_label)
$$;
-- A request, or the cancellation of the time off under `request_label`, as the employee's own list reads it.
create function pg_temp.my_status(person text, request_label text) returns text language sql as $$
  select x ->> 'status' from jsonb_array_elements(public.my_time_off_service(tests.user('tw:' || person), tests.id('tw')) -> 'requests') x
  where (x ->> 'id')::uuid = (select f.value from fixture f where f.key = my_status.request_label)
$$;
create function pg_temp.my_cancellation(person text, request_label text) returns text language sql as $$
  select x #>> '{cancellation,status}'
  from jsonb_array_elements(public.my_time_off_service(tests.user('tw:' || person), tests.id('tw')) -> 'requests') x
  where (x ->> 'id')::uuid = (select f.value from fixture f where f.key = my_cancellation.request_label)
$$;

-- The requests. Asked for days far ahead, then moved by hand.
--   ali (K) and bea (B): start in 20 hours, asked three days ago: both are reminded of.
--   cem: starts in 20 hours, asked 2 hours ago: asked in its last day, nobody is reminded.
--   dor: starts in three days: not yet.
--   eve: starts in 20 hours, already declined.
--   fay: started an hour ago, still waiting: it expires.
insert into fixture values
  ('ali', pg_temp.ask('ali', tests.week(0) + 1, tests.week(0) + 1)),
  ('bea', pg_temp.ask('bea', tests.week(0) + 1, tests.week(0) + 1)),
  ('cem', pg_temp.ask('cem', tests.week(0) + 1, tests.week(0) + 1)),
  ('dor', pg_temp.ask('dor', tests.week(0) + 1, tests.week(0) + 1)),
  ('eve', pg_temp.ask('eve', tests.week(0) + 1, tests.week(0) + 1)),
  ('fay', pg_temp.ask('fay', tests.week(0) + 1, tests.week(0) + 1));
select public.answer_time_off_service(tests.user('tw:mk'), tests.id('tw'), (select value from fixture where key = 'eve'),
  'decline', 'We are short that day', 1, app_private.time_off_shifts_print(app_private.time_off_shifts_at_stake(pg_temp.req('eve'))));
select pg_temp.place('ali', interval '20 hours', interval '3 days');
select pg_temp.place('bea', interval '20 hours', interval '3 days');
select pg_temp.place('cem', interval '20 hours', interval '2 hours');
select pg_temp.place('dor', interval '3 days', interval '3 days');
select pg_temp.place('eve', interval '20 hours', interval '3 days');
select pg_temp.place('fay', interval '-1 hour', interval '3 days');

-- Cancellations.
--   gus: approved time off that ended an hour ago, its cancellation still waiting: the cancellation expires.
--   hal: approved time off starting in 20 hours, its cancellation asked three days ago: never reminded of.
insert into fixture values
  ('gus', pg_temp.ask('gus', tests.week(0) + 2, tests.week(0) + 2)),
  ('hal', pg_temp.ask('hal', tests.week(0) + 2, tests.week(0) + 2));
select pg_temp.approve('mk', 'gus');
select pg_temp.approve('mk', 'hal');
insert into fixture values ('gus:cancel', pg_temp.ask_cancel('gus', 'gus')), ('hal:cancel', pg_temp.ask_cancel('hal', 'hal'));
select pg_temp.place('gus', interval '-25 hours', interval '3 days');
select pg_temp.place('hal', interval '20 hours', interval '3 days');

-- Before the sweep, what has started already reads as expired (D2–D4).
select is(array[pg_temp.my_status('fay', 'fay'), pg_temp.my_cancellation('gus', 'gus')], array['expired', 'expired'],
  'before the sweep, the employee reads a started request and a cancellation of time off that ended as expired');

-- 1. One pass.
select ok(app_private.time_off_requests_sweep() >= 4, 'a pass reminds and expires');

-- 2. The reminder: once, to whoever may answer, in S-169's order.
select is(pg_temp.told('time_off.decision_reminder', 'ali'), array['tw:mk:user'], 'Kadikoy''s manager is reminded of Ali''s request');
select is(pg_temp.told('time_off.decision_reminder', 'bea'), array['tw:ad:user'],
  'Besiktas has no manager: the admin is reminded of Bea''s request');
select is(
  (select row(n.title, n.body, n.url, (n.data ->> 'request_id')::uuid, n.actor_user_id is null)::text from public.person_notifications n
   where n.type_key = 'time_off.decision_reminder' and n.subject_type = 'time_off'
     and n.subject_id = (select value from fixture where key = 'ali')),
  row('Ali P.''s time off still waits',
    app_private.time_off_days_label(pg_temp.req('ali')) || ' · Decide before it starts',
    '/app/schedule/requests?type=time_off&request=' || (select value from fixture where key = 'ali'),
    (select value from fixture where key = 'ali'), true)::text,
  'the reminder names the request and opens it in Requests → Time off');
select is((select array[(r.reminded_at = now())::text, r.revision::text, r.status] from public.time_off_requests r
           where r.id = (select value from fixture where key = 'ali')),
  array['true', '1', 'pending'], 'the reminder is written on the request; its revision stays, so an answer in hand still holds');
select is(pg_temp.told('time_off.decision_reminder', 'cem'), '{}'::text[], 'a request asked in its last day is not reminded of');
select is((pg_temp.req('cem')).reminded_at, null, 'and nothing is written on it');
select is(pg_temp.told('time_off.decision_reminder', 'dor'), '{}'::text[], 'a request starting in three days is not reminded of yet');
select is(pg_temp.told('time_off.decision_reminder', 'eve'), '{}'::text[], 'an answered request is not reminded of');
select is(pg_temp.told('time_off.decision_reminder', 'hal:cancel'), '{}'::text[], 'a cancellation is never reminded of');
select is((pg_temp.req('hal:cancel')).reminded_at, null, 'and nothing is written on it');

-- Once: the next pass, an hour later, sends nothing again and leaves the first reminder's time.
-- ponytail: the reminder is moved an hour back by hand (now() is fixed in a transaction).
update public.time_off_requests set reminded_at = now() - interval '1 hour'
where id in (select value from fixture where key in ('ali', 'bea'));
select app_private.time_off_requests_sweep();
select is(
  (select count(*)::integer from public.person_notifications n
   where n.type_key = 'time_off.decision_reminder' and n.subject_id in (select value from fixture where key in ('ali', 'bea'))),
  2, 'the next pass reminds nobody again');
select is((pg_temp.req('ali')).reminded_at, now() - interval '1 hour', 'and the first reminder''s time stays');

-- An answer closes the reminder's card. The request's card closed when the reminder came (S-247: one open card per
-- decider per request) and keeps saying so.
select pg_temp.approve('mk', 'ali');
select is(
  (select array_agg(replace(n.type_key, 'time_off.', '') || ' ' || coalesce(n.resolution, 'open') order by n.type_key)
   from public.person_notifications n
   where n.subject_type = 'time_off' and n.subject_id = (select value from fixture where key = 'ali')
     and n.type_key in ('time_off.requested', 'time_off.decision_reminder')),
  array['decision_reminder approved', 'requested superseded'],
  'the answer closes the reminder''s card; the request''s card, superseded by the reminder, stays superseded');

-- 3. Expired: a request still waiting when it starts.
select is(
  (select row(r.status, r.revision, isempty(r.effective), r.ended_at = r.starts_at, r.ended_by is null, r.reminded_at is null)::text
   from public.time_off_requests r where r.id = (select value from fixture where key = 'fay')),
  row('expired', 2, true, true, true, true)::text,
  'a request still waiting at its start is written as expired, at its start, by nobody; it was never reminded of');
select is(pg_temp.told('time_off.decided', 'fay'), array['tw:fay:user'], 'the employee hears it');
select is(
  (select row(n.title, n.body, n.url, n.data ->> 'outcome', n.actor_user_id is null)::text from public.person_notifications n
   where n.type_key = 'time_off.decided' and n.subject_id = (select value from fixture where key = 'fay')),
  row('Your time off ' || app_private.time_off_days_label(pg_temp.req('fay')) || ' wasn''t answered in time',
    'Nobody answered it before it started.', '/app/employee-hub/my-availability?section=time-off', 'expired', true)::text,
  'that nobody answered it in time, with the outcome the old system used');
select is(pg_temp.closed('fay'), array['expired'], 'the cards still waiting for an answer close as expired');
select is(pg_temp.my_status('fay', 'fay'), 'expired', 'the employee''s list reads the same after the sweep');
select is(
  (select count(*)::integer from app_private.leave_spans(tests.id('tw'), array[tests.id('tw:fay')],
     tstzrange(now() - interval '2 days', now() + interval '2 days'))),
  0, 'it is no time off and no request waiting');

-- 4. Expired: a cancellation still waiting when the time off is over. The time off stays.
select is(
  (select row(c.status, c.revision, c.ended_at = c.ends_at, c.ended_by is null)::text
   from public.time_off_requests c where c.id = (select value from fixture where key = 'gus:cancel')),
  row('expired', 2, true, true)::text, 'a cancellation still waiting when the time off is over expires');
select is(
  (select row(r.status, r.effective = tstzmultirange(tstzrange(r.starts_at, r.ends_at, '[)')))::text
   from public.time_off_requests r where r.id = (select value from fixture where key = 'gus')),
  row('approved', true)::text, 'the time off stays approved, all of it');
select is(pg_temp.closed('gus:cancel'), array['expired'], 'the cancellation''s cards close as expired');
select is(pg_temp.told('time_off.decided', 'gus:cancel'), '{}'::text[], 'and nobody is told: the time off is over');
select is(pg_temp.my_cancellation('gus', 'gus'), 'expired', 'the employee''s list reads it the same after the sweep');
select is((pg_temp.req('hal:cancel')).status, 'pending', 'a cancellation of time off that has not ended still waits');

-- 5. A request that fails is rolled back alone and kept; the others go on.
-- ponytail: Jon's request is broken by hand (a zone that does not exist) so its notice fails.
insert into fixture values
  ('jon', pg_temp.ask('jon', tests.week(0) + 3, tests.week(0) + 3)),
  ('kim', pg_temp.ask('kim', tests.week(0) + 3, tests.week(0) + 3));
select pg_temp.place('jon', interval '-2 hours', interval '3 days');
select pg_temp.place('kim', interval '-1 hour', interval '3 days');
update public.time_off_requests set time_timezone = 'Nowhere/Zone' where id = (select value from fixture where key = 'jon');
select app_private.time_off_requests_sweep();
select is(array[(pg_temp.req('jon')).status, (pg_temp.req('kim')).status], array['pending', 'expired'],
  'a request that fails stays as it was; the one after it expires');
select is(
  (select row(f.workspace_id = tests.id('tw'), f.attempts, f.sqlstate, f.message <> '')::text
   from app_private.time_off_request_sweep_failures f where f.request_id = (select value from fixture where key = 'jon')),
  row(true, 1, '22023', true)::text, 'the failure is kept with its error');
select is(pg_temp.closed('jon'), array['open'], 'nothing of it was written: its cards still wait');
select app_private.time_off_requests_sweep();
select is((select f.attempts from app_private.time_off_request_sweep_failures f where f.request_id = (select value from fixture where key = 'jon')),
  2, 'the next pass tries again and counts it');
-- A request that keeps failing goes to the back of the line (nf-guvenlik, D7): due earlier than Lia's, Jon's would
-- otherwise come first in every pass, and enough broken ones would fill every pass.
insert into fixture values ('lia', pg_temp.ask('lia', tests.week(0) + 3, tests.week(0) + 3));
select pg_temp.place('lia', interval '-30 minutes', interval '3 days');
select is(app_private.time_off_requests_sweep(1), 1, 'a pass of one handles the next request, not the broken one again');
select is(array[(pg_temp.req('jon')).status, (pg_temp.req('lia')).status], array['pending', 'expired'],
  'Lia''s request expires though Jon''s, broken, was due first');
update public.time_off_requests set time_timezone = 'Europe/Istanbul' where id = (select value from fixture where key = 'jon');
select app_private.time_off_requests_sweep();
select is((pg_temp.req('jon')).status, 'expired', 'mended, it expires');
select is((select count(*)::integer from app_private.time_off_request_sweep_failures f
           where f.request_id = (select value from fixture where key = 'jon')), 0, 'and its failure is cleared');

-- 6. A pass stops at its count and at its time, the earliest first; the rest wait for the next.
-- 120 requests of Dor's, each an hour long and an hour apart, all started and waiting.
-- ponytail: inserted by hand: asking keeps one person's requests apart, and they would need 120 people.
insert into public.time_off_requests (workspace_id, employee_id, starts_at, ends_at, all_day, time_timezone, kind_of_leave,
  created_by, client_key, created_at)
select tests.id('tw'), tests.id('tw:dor'), now() - (i || ' hours')::interval - interval '10 days',
  now() - (i || ' hours')::interval - interval '10 days' + interval '30 minutes', false, 'Europe/Istanbul', 'other',
  tests.user('tw:dor'), gen_random_uuid(), now() - interval '20 days'
from generate_series(1, 120) i;
select is(app_private.time_off_requests_sweep(5), 5, 'a pass of five handles five');
select is((select count(*)::integer from public.time_off_requests r
           where r.employee_id = tests.id('tw:dor') and r.status = 'expired'
             and r.starts_at <= (select min(q.starts_at) from public.time_off_requests q where q.employee_id = tests.id('tw:dor') and q.status = 'pending')),
  5, 'the earliest first');
select is(app_private.time_off_requests_sweep(500, interval '0 seconds'), 1, 'a pass out of time stops after the request in hand');
create temporary table measured (ms numeric);
do $$
declare
  t timestamptz := clock_timestamp();
begin
  perform app_private.time_off_requests_sweep();
  insert into measured values (extract(epoch from clock_timestamp() - t) * 1000);
end;
$$;
select diag('114 expired in ' || round((select ms from measured)) || ' ms');
select is((select count(*)::integer from public.time_off_requests r where r.employee_id = tests.id('tw:dor') and r.status = 'pending'
           and r.starts_at <= now()), 0, 'the next pass takes the rest');
select ok((select ms from measured) < 6000, 'one pass of 114 requests takes less than six seconds');

-- 7. The job and who reaches it.
select is((select row(j.schedule, j.command, j.active)::text from cron.job j where j.jobname = 'time-off-requests'),
  row('*/5 * * * *', 'select app_private.time_off_requests_sweep()', true)::text, 'the sweep runs every five minutes');
select ok(not has_function_privilege('authenticated', 'app_private.time_off_requests_sweep(integer, interval)', 'execute')
  and not has_function_privilege('anon', 'app_private.time_off_requests_sweep(integer, interval)', 'execute'),
  'nobody signed in runs the sweep');
set local role authenticated;
select throws_ok($$select * from app_private.time_off_request_sweep_failures$$, '42501', null, 'nor reads its failures');
reset role;

-- The new notices are in their recipients' choices (BILDIRIM-12).
select is(tests.unlisted_notices(tests.id('tw'), array(select id from checked_notices)), '{}'::text[],
  'every notice is one its recipient can choose');

select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- FB-6.3 (user decisions 2026-09-30, KARARLAR "İzin"): time off belongs to the
-- person who asks. The managers of every location they work at vote; one
-- approval per location settles it, one denial closes it, a manager of two
-- locations votes for both, an admin or the owner decides alone. Requests follow
-- one decision chain (S-164, S-169). An approval stands on the published shifts it would open at
-- the voter's locations when it was given; when those change, the vote no
-- longer counts. The last approval opens every published shift of the leave
-- that has not started; drafts are left alone. Revoke cuts what has not
-- started yet; a cancellation is voted on like a request.

select tests.world('tv');
-- The owner works here too (ROL-CIFT: the employee side needs the employee slot).
select tests.employee_slot('tv', 'owner');
-- A third location nobody manages.
select tests.as_browser(tests.user('tv:owner'), format(
  $sql$insert into public.locations (id, workspace_id, name, short_name, street_address, city, region, postal_code, timezone)
       values (%L, %L, 'Moda', 'MDA', '3 Moda Cd', 'Istanbul', 'Istanbul', '34710', 'Europe/Istanbul')$sql$,
  tests.remember('tv:M', gen_random_uuid()), tests.id('tv')));
select tests.person('tv', 'zeynep', 'admin', array['K'], array['cook']);
select tests.person('tv', 'kaan', 'admin', array['B'], array['cook']);
select tests.person('tv', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('tv', 'derya', 'manager', array['K'], array['cook']);
select tests.person('tv', 'mehmet', 'manager', array['B'], array['cook']);
select tests.person('tv', 'can', 'manager', array['K', 'B'], array['cook']);
select tests.person('tv', 'ali', 'employee', array['K', 'B'], array['cook', 'server']);
select tests.person('tv', 'emre', 'employee', array['K'], array['cook']);
select tests.person('tv', 'veli', 'employee', array['B'], array['server']);
select tests.person('tv', 'lale', 'employee', null, null);
select tests.person('tv', 'mert', 'employee', array['K', 'M'], array['cook']);

create function pg_temp.refusal(q text) returns text language plpgsql as $$
declare h text;
begin
  execute q;
  return 'allowed';
exception when others then
  get stacked diagnostics h = pg_exception_hint;
  return sqlstate || coalesce(' ' || nullif(h, ''), '');
end $$;
create function pg_temp.fingerprint(rid uuid) returns text language sql as $$
  select app_private.time_off_impact(tests.id('tv'), rid) ->> 'fingerprint'
$$;
create function pg_temp.decide(who text, rid uuid, verdict text, note text default '') returns jsonb language sql as $$
  select public.decide_time_off_service(tests.user('tv:' || who), tests.id('tv'), rid, verdict, note, pg_temp.fingerprint(rid))
$$;
create function pg_temp.status(rid uuid) returns text language sql as $$
  select r.status::text from public.schedule_time_off_requests r where r.id = rid
$$;
create function pg_temp.state(rid uuid) returns jsonb language sql as $$
  select app_private.time_off_state(tests.id('tv'), rid)
$$;
-- The locations still waiting for an approval, by short name.
create function pg_temp.waiting(rid uuid) returns text[] language sql as $$
  select coalesce(array_agg(l.short_name order by l.short_name), '{}')
  from jsonb_array_elements(pg_temp.state(rid) -> 'locations') x
  join public.locations l on l.id = (x ->> 'id')::uuid
  where x -> 'approved_by' = 'null'::jsonb or not x ? 'approved_by'
$$;
create function pg_temp.users(variadic who text[]) returns uuid[] language sql as $$
  select array(select tests.user('tv:' || x) from unnest(who) x order by 1)
$$;

-- 1. Sending -------------------------------------------------------------------

select tests.remember('tv:ali:1', tests.leave('tv', 'ali', 1));
select is(pg_temp.status(tests.id('tv:ali:1')), 'pending', 'it waits for a decision');
select is(
  (select array_agg(l.short_name order by l.short_name) from public.time_off_required_locations x
   join public.locations l on l.id = x.location_id where x.request_id = tests.id('tv:ali:1')),
  array['BJK', 'KDK'], 'Kadikoy and Besiktas, where Ali works, decide it');
select is(
  (select r.decide_by from public.schedule_time_off_requests r where r.id = tests.id('tv:ali:1')),
  ((tests.week(1) + 2)::timestamp at time zone 'Europe/Istanbul') - interval '24 hours',
  'it must be decided 24 hours before it starts');

select is(pg_temp.refusal(format($$select public.submit_time_off_service(%L, %L,
    jsonb_build_array(jsonb_build_object('segment_date', %L::date), jsonb_build_object('segment_date', %L::date)),
    '', 'Europe/Istanbul', gen_random_uuid())$$,
    tests.user('tv:ali'), tests.id('tv'), tests.week(2) + 2, tests.week(2) + 4)),
  '22023', 'a request is one run of days in a row');
select is(pg_temp.refusal(format($$select public.submit_time_off_service(%L, %L,
    jsonb_build_array(jsonb_build_object('segment_date', (now() at time zone 'Europe/Istanbul')::date)),
    '', 'Europe/Istanbul', gen_random_uuid())$$,
    tests.user('tv:ali'), tests.id('tv'))),
  '22023', 'time off that has already started (today, from midnight) cannot be asked for');
select is(pg_temp.refusal(format($$select public.submit_time_off_service(%L, %L,
    jsonb_build_array(jsonb_build_object('segment_date', %L::date)), '', 'America/New_York', gen_random_uuid())$$,
    tests.user('tv:ali'), tests.id('tv'), tests.week(2) + 2)),
  'PT409 time_off.timezone_changed', 'hours are asked in the primary location''s time zone');
select is(pg_temp.refusal(format($$select public.submit_time_off_service(%L, %L,
    jsonb_build_array(jsonb_build_object('segment_date', %L::date)), '', 'Europe/Istanbul', gen_random_uuid())$$,
    tests.user('tv:ali'), tests.id('tv'), tests.week(1) + 2)),
  '23514', 'nor over time off already asked for');

-- Lale works nowhere: only an admin or the owner can decide.
select tests.remember('tv:lale:1', tests.leave('tv', 'lale', 1));
select is((pg_temp.state(tests.id('tv:lale:1')) ->> 'fallback')::boolean, true,
  'a request with no location is for an admin or the owner');
select is(pg_temp.refusal(format($$select pg_temp.decide('ayse', %L, 'approve')$$, tests.id('tv:lale:1'))),
  '42501 authz.out_of_scope', 'a manager cannot decide it');
select is((pg_temp.decide('zeynep', tests.id('tv:lale:1'), 'approve') ->> 'status'), 'approved',
  'an admin approves it alone');

-- Mert works at Kadikoy and at Moda, which has no manager: Moda drops out.
select tests.remember('tv:mert:1', tests.leave('tv', 'mert', 1));
select is(pg_temp.waiting(tests.id('tv:mert:1')), array['KDK'],
  'a location with no manager who may decide drops out');
select is((pg_temp.decide('ayse', tests.id('tv:mert:1'), 'approve') ->> 'status'), 'approved',
  'so Kadikoy''s approval settles it');

-- 2. Voting --------------------------------------------------------------------

select tests.remember('tv:emre:1', tests.leave('tv', 'emre', 1));
select is(pg_temp.decide('ayse', tests.id('tv:emre:1'), 'approve') - 'revision' - 'request_id',
  jsonb_build_object('status', 'approved', 'final', true, 'alone', false, 'remaining', 0),
  'at one location one manager''s approval is final');

select tests.remember('tv:emre:2', tests.leave('tv', 'emre', 2));
select is((pg_temp.decide('derya', tests.id('tv:emre:2'), 'deny', 'Only 11-12 works') ->> 'status'), 'denied',
  'any manager of the location may answer; one denial is final');
select is((select e.note from public.schedule_time_off_events e where e.request_id = tests.id('tv:emre:2') and e.action = 'denied'),
  'Only 11-12 works', 'the note says what could be approved');

select is(pg_temp.decide('ayse', tests.id('tv:ali:1'), 'approve') - 'revision' - 'request_id',
  jsonb_build_object('status', 'pending', 'final', false, 'alone', false, 'remaining', 1),
  'at two locations Kadikoy''s approval is not enough');
select is(pg_temp.waiting(tests.id('tv:ali:1')), array['BJK'], 'Besiktas is still to answer');
select is((pg_temp.decide('mehmet', tests.id('tv:ali:1'), 'approve') ->> 'status'), 'approved',
  'Besiktas''s approval settles it');

select tests.remember('tv:ali:2', tests.leave('tv', 'ali', 2));
select is((pg_temp.decide('can', tests.id('tv:ali:2'), 'approve') ->> 'status'), 'approved',
  'a manager of both locations settles it with one vote');

select tests.remember('tv:ali:3', tests.leave('tv', 'ali', 3));
select pg_temp.decide('ayse', tests.id('tv:ali:3'), 'approve');
select is((pg_temp.decide('mehmet', tests.id('tv:ali:3'), 'deny') ->> 'status'), 'denied',
  'one denial closes it after an approval elsewhere');

select tests.remember('tv:ali:4', tests.leave('tv', 'ali', 4));
select pg_temp.decide('ayse', tests.id('tv:ali:4'), 'approve');
select is((pg_temp.decide('ayse', tests.id('tv:ali:4'), 'deny') ->> 'status'), 'denied',
  'a vote may change while the request is open; turning to a denial closes it');
select is(pg_temp.refusal(format($$select pg_temp.decide('mehmet', %L, 'approve')$$, tests.id('tv:ali:4'))),
  'PT409 time_off.changed', 'a closed request takes no more votes');

select tests.remember('tv:ali:5', tests.leave('tv', 'ali', 5));
select is(pg_temp.decide('zeynep', tests.id('tv:ali:5'), 'approve') - 'revision' - 'request_id',
  jsonb_build_object('status', 'approved', 'final', true, 'alone', true, 'remaining', 0),
  'an admin decides alone, at once');
select tests.remember('tv:ali:6', tests.leave('tv', 'ali', 6));
select is((pg_temp.decide('owner', tests.id('tv:ali:6'), 'deny', 'Inventory week') ->> 'status'), 'denied',
  'so does the owner, a denial too');

-- The decision chain (KARARLAR S-164, S-169): a manager's request goes to the other
-- managers of their locations, rank not counted; an admin and the owner decide alone
-- at every step, a peer admin's too; nobody decides their own.
select tests.remember('tv:ayse:1', tests.leave('tv', 'ayse', 1));
select is(pg_temp.refusal(format($$select pg_temp.decide('ayse', %L, 'approve')$$, tests.id('tv:ayse:1'))),
  '42501 authz.rank', 'not to herself');
select is((pg_temp.decide('can', tests.id('tv:ayse:1'), 'approve') ->> 'status'), 'approved',
  'Can, Kadikoy''s other manager, decides it');
select tests.remember('tv:zeynep:1', tests.leave('tv', 'zeynep', 1));
select is(pg_temp.refusal(format($$select pg_temp.decide('zeynep', %L, 'approve')$$, tests.id('tv:zeynep:1'))),
  '42501 authz.rank', 'an admin''s request is not for herself');
select is((pg_temp.decide('kaan', tests.id('tv:zeynep:1'), 'approve') ->> 'status'), 'approved',
  'another admin decides it alone');
select tests.remember('tv:emre:3', tests.leave('tv', 'emre', 3));
select is(pg_temp.refusal(format($$select pg_temp.decide('emre', %L, 'approve')$$, tests.id('tv:emre:3'))),
  '42501 authz.missing_permission', 'an employee decides nothing, their own request included');
select is(pg_temp.refusal(format($$select pg_temp.decide('mehmet', %L, 'approve')$$, tests.id('tv:emre:3'))),
  '42501 authz.out_of_scope', 'a manager of another location cannot vote');
select is(pg_temp.refusal(format($$select public.decide_time_off_service(%L, %L, gen_random_uuid(), 'approve', '', null)$$,
    tests.user('tv:ayse'), tests.id('tv'))),
  '42501 authz.out_of_scope', 'a request that does not exist is answered like one out of reach');

select tests.remember('tv:owner:1', tests.leave('tv', 'owner', 1));
select is(pg_temp.status(tests.id('tv:owner:1')), 'pending', 'the owner''s own time off waits like anybody''s');

-- 3. What an approval does to the schedule ------------------------------------

-- Ali works Wednesday of week 10 at both locations; a draft shift too.
select tests.publish_week('tv', 10, '[
  {"label": "ali-k", "person": "ali", "loc": "K", "job": "cook",   "day": 2, "start": "09:00", "end": "13:00"},
  {"label": "ali-b", "person": "ali", "loc": "B", "job": "server", "day": 2, "start": "15:00", "end": "19:00"}
]');
select tests.remember('tv:ali:10', tests.leave('tv', 'ali', 10));
select is(
  (select jsonb_object_agg(l.short_name, jsonb_array_length(x.value -> 'shifts'))
   from jsonb_each(app_private.time_off_impact(tests.id('tv'), tests.id('tv:ali:10')) -> 'locations') x
   join public.locations l on l.id = x.key::uuid),
  '{"KDK": 1, "BJK": 1}'::jsonb, 'the request shows the published shift it would open at each location');
select is(pg_temp.refusal(format($$select public.decide_time_off_service(%L, %L, %L, 'approve', '', 'stale')$$,
    tests.user('tv:ayse'), tests.id('tv'), tests.id('tv:ali:10'))),
  'PT409 time_off.changed', 'an approval given on another picture of the shifts is refused');
select pg_temp.decide('ayse', tests.id('tv:ali:10'), 'approve');
-- The same week published again, unchanged.
select tests.publish_week('tv', 10, '[
  {"label": "ali-k", "person": "ali", "loc": "K", "job": "cook",   "day": 2, "start": "09:00", "end": "13:00"},
  {"label": "ali-b", "person": "ali", "loc": "B", "job": "server", "day": 2, "start": "15:00", "end": "19:00"}
]');
select is(pg_temp.waiting(tests.id('tv:ali:10')), array['BJK'], 'publishing the same shifts again keeps Ayse''s vote');
-- A new Kadikoy shift on that day.
select tests.publish_week('tv', 10, '[
  {"label": "ali-k", "person": "ali", "loc": "K", "job": "cook",   "day": 2, "start": "09:00", "end": "13:00"},
  {"label": "ali-k2", "person": "ali", "loc": "K", "job": "cook",  "day": 2, "start": "20:00", "end": "22:00"},
  {"label": "ali-b", "person": "ali", "loc": "B", "job": "server", "day": 2, "start": "15:00", "end": "19:00"}
]');
select is(pg_temp.waiting(tests.id('tv:ali:10')), array['BJK', 'KDK'],
  'a new shift at Kadikoy that day: Ayse''s vote no longer counts');
select is(
  (select (v ->> 'stale')::boolean from jsonb_array_elements(pg_temp.state(tests.id('tv:ali:10')) -> 'votes') v
   where (v ->> 'voter')::uuid = tests.user('tv:ayse')),
  true, 'it shows as waiting for her to look again');
-- A draft of the same week, with Ali on Wednesday.
create temporary table edit_session (id uuid);
insert into edit_session
select (public.acquire_schedule_edit_session_service(tests.user('tv:owner'), tests.id('tv'), tests.week(10), 'blank', null) -> 'session' ->> 'id')::uuid;
select tests.add_shift(tests.user('tv:owner'), 'tv', (select id from edit_session), 10,
  '{"person": "ali", "loc": "K", "job": "cook", "day": 2, "start": "06:00", "end": "08:00"}');
select tests.remember('tv:draft:ali', (select s.id from public.schedule_edit_session_shifts s
  where s.session_id = (select id from edit_session) and s.employee_id = tests.id('tv:ali')));
select pg_temp.decide('ayse', tests.id('tv:ali:10'), 'approve');
select is((pg_temp.decide('mehmet', tests.id('tv:ali:10'), 'approve') ->> 'status'), 'approved',
  'Ayse looks again and approves; Besiktas settles it');
select is(
  (select array_agg(p.employee_id is null order by p.start_time) from public.schedule_published_shifts p
   where p.id in (tests.id('tv:shift:ali-k'), tests.id('tv:shift:ali-k2'), tests.id('tv:shift:ali-b'))),
  array[true, true, true], 'every published shift of the day is open now, at both locations');
select is((select s.employee_id from public.schedule_edit_session_shifts s where s.id = tests.id('tv:draft:ali')), tests.id('tv:ali'),
  'a shift still being drafted is left alone');

-- A shift that has already started stays with its person. Ali asks for the
-- next hours of today while a Kadikoy shift of his is running.
-- ponytail: one transaction has one now(); a published shift is moved onto
-- today by hand to reach a running one.
select tests.publish_week('tv', 11, '[
  {"label": "ali-now", "person": "ali", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "13:00"}
]');
update public.schedule_published_shifts
set scheduled_date = ((now() - interval '1 hour') at time zone 'Europe/Istanbul')::date,
    start_time = date_trunc('minute', (now() - interval '1 hour') at time zone 'Europe/Istanbul')::time,
    end_time = date_trunc('minute', (now() + interval '3 hours') at time zone 'Europe/Istanbul')::time
where id = tests.id('tv:shift:ali-now');
select tests.remember('tv:ali:now', (public.submit_time_off_service(tests.user('tv:ali'), tests.id('tv'),
  (select jsonb_build_array(jsonb_build_object(
     'segment_date', (s at time zone 'Europe/Istanbul')::date,
     'start_time', to_char(s at time zone 'Europe/Istanbul', 'HH24:MI'),
     'end_time', to_char((s + interval '2 hours') at time zone 'Europe/Istanbul', 'HH24:MI'),
     'ends_next_day', ((s + interval '2 hours') at time zone 'Europe/Istanbul')::date > (s at time zone 'Europe/Istanbul')::date))
   from (select date_trunc('minute', now() + interval '1 hour') s) x),
  'Dentist', 'Europe/Istanbul', gen_random_uuid()) ->> 'request_id')::uuid);
select is(
  (select r.decide_by from public.schedule_time_off_requests r where r.id = tests.id('tv:ali:now')),
  date_trunc('minute', now() + interval '1 hour'),
  'sent inside the lead time, it can be decided until it starts');
select is((pg_temp.decide('zeynep', tests.id('tv:ali:now'), 'approve') ->> 'status'), 'approved', 'an admin approves it');
select is((select p.employee_id from public.schedule_published_shifts p where p.id = tests.id('tv:shift:ali-now')), tests.id('tv:ali'),
  'the running shift is not opened');

-- 4. Revoke --------------------------------------------------------------------

select is(pg_temp.refusal(format($$select public.revoke_time_off_service(%L, %L, %L, %s, '  ')$$,
    tests.user('tv:derya'), tests.id('tv'), tests.id('tv:emre:1'),
    (select r.revision from public.schedule_time_off_requests r where r.id = tests.id('tv:emre:1')))),
  '22023', 'revoking needs a reason');
select is(pg_temp.refusal(format($$select public.revoke_time_off_service(%L, %L, %L, %s, 'Short staffed')$$,
    tests.user('tv:mehmet'), tests.id('tv'), tests.id('tv:emre:1'),
    (select r.revision from public.schedule_time_off_requests r where r.id = tests.id('tv:emre:1')))),
  '42501 authz.out_of_scope', 'a manager of another location cannot revoke it');
-- Emre asks to cancel part of it; the revoke closes that request.
select tests.remember('tv:emre:1:cancel', (public.request_time_off_cancellation_service(tests.user('tv:emre'), tests.id('tv'),
  tests.id('tv:emre:1'), (select r.revision from public.schedule_time_off_requests r where r.id = tests.id('tv:emre:1')),
  (select jsonb_agg(jsonb_build_object('segment_id', s.id, 'starts_at', s.starts_at, 'ends_at', s.starts_at + interval '4 hours'))
   from public.schedule_time_off_segments s where s.request_id = tests.id('tv:emre:1')),
  'Plans changed', gen_random_uuid()) ->> 'request_id')::uuid);
select is((public.revoke_time_off_service(tests.user('tv:derya'), tests.id('tv'), tests.id('tv:emre:1'),
    (select r.revision from public.schedule_time_off_requests r where r.id = tests.id('tv:emre:1')), 'Short staffed') ->> 'status'),
  'revoked', 'any Kadikoy manager revokes it alone, with a reason');
select is((select e.note from public.schedule_time_off_events e where e.request_id = tests.id('tv:emre:1') and e.action = 'revoked'),
  'Short staffed', 'the reason is kept');
select is(pg_temp.status(tests.id('tv:emre:1:cancel')), 'revoked', 'the cancellation waiting on it closes');

-- Revoking time off already under way keeps what was taken.
select tests.remember('tv:emre:4', tests.leave('tv', 'emre', 4));
select pg_temp.decide('ayse', tests.id('tv:emre:4'), 'approve');
-- ponytail: one transaction has one now(); the approved day is moved by hand
-- so that it started two hours ago.
alter table public.schedule_time_off_segments disable trigger b_time_off_requested_period;
update public.schedule_time_off_segments set starts_at = now() - interval '2 hours', ends_at = now() + interval '10 hours'
where request_id = tests.id('tv:emre:4');
alter table public.schedule_time_off_segments enable trigger b_time_off_requested_period;
select public.revoke_time_off_service(tests.user('tv:ayse'), tests.id('tv'), tests.id('tv:emre:4'),
  (select r.revision from public.schedule_time_off_requests r where r.id = tests.id('tv:emre:4')), 'Needed back');
select is(
  (select public.time_off_effective_ranges(s.id) from public.schedule_time_off_segments s where s.request_id = tests.id('tv:emre:4')),
  tstzmultirange(tstzrange(now() - interval '2 hours', now(), '[)')),
  'only the part not yet started is taken back; the two hours taken stay on record');
select is(
  (select (e.metadata ->> 'taken_until')::timestamptz from public.schedule_time_off_events e
   where e.request_id = tests.id('tv:emre:4') and e.action = 'revoked'),
  now(), 'the record says until when it was taken');

-- 5. Cancelling approved time off: voted on like a request ---------------------

select tests.remember('tv:ali:7', tests.leave('tv', 'ali', 7));
select pg_temp.decide('zeynep', tests.id('tv:ali:7'), 'approve');
select tests.remember('tv:ali:7:cancel', (public.request_time_off_cancellation_service(tests.user('tv:ali'), tests.id('tv'),
  tests.id('tv:ali:7'), (select r.revision from public.schedule_time_off_requests r where r.id = tests.id('tv:ali:7')),
  (select jsonb_agg(jsonb_build_object('segment_id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at))
   from public.schedule_time_off_segments s where s.request_id = tests.id('tv:ali:7')),
  'Plans changed', gen_random_uuid()) ->> 'request_id')::uuid);
select is(pg_temp.waiting(tests.id('tv:ali:7:cancel')), array['BJK', 'KDK'], 'both locations decide the cancellation');
select is(pg_temp.status(tests.id('tv:ali:7')), 'approved', 'while it waits, the time off stands');
select pg_temp.decide('ayse', tests.id('tv:ali:7:cancel'), 'approve');
select is(pg_temp.status(tests.id('tv:ali:7:cancel')), 'pending', 'Kadikoy''s approval is not enough');
select is((pg_temp.decide('mehmet', tests.id('tv:ali:7:cancel'), 'approve') ->> 'status'), 'approved', 'Besiktas settles it');
select is(pg_temp.status(tests.id('tv:ali:7')), 'revoked', 'all of it is cancelled');

-- 6. Withdrawing a request that waits ------------------------------------------

select tests.remember('tv:emre:5', tests.leave('tv', 'emre', 5));
select public.employee_request_action_service(tests.user('tv:emre'), tests.id('tv'), tests.id('tv:emre:5'), 'time_off', 'cancel',
  (select r.revision from public.schedule_time_off_requests r where r.id = tests.id('tv:emre:5')));
select is(pg_temp.status(tests.id('tv:emre:5')), 'revoked', 'a withdrawn request is closed');
select is((select x ->> 'display_status' from jsonb_array_elements(public.get_employee_hub_service(tests.user('tv:emre'), tests.id('tv'),
    tests.week(5), tests.week(5) + 6) -> 'requests') x where (x ->> 'id')::uuid = tests.id('tv:emre:5')),
  'Withdrawn', 'Emre reads it as withdrawn, not revoked by a manager');
select throws_ok(format($$select public.decide_time_off_service(%L, %L, %L, 'approve', '', %L)$$, tests.user('tv:ayse'), tests.id('tv'),
    tests.id('tv:emre:5'), pg_temp.fingerprint(tests.id('tv:emre:5'))),
  'PT409', null, 'a vote arriving after the withdrawal is turned back');

-- 7. What each side reads ------------------------------------------------------

select tests.remember('tv:ali:8', tests.leave('tv', 'ali', 8));
select pg_temp.decide('ayse', tests.id('tv:ali:8'), 'approve');
create function pg_temp.queue_row(who text, rid uuid) returns jsonb language sql as $$
  select x from jsonb_array_elements(public.get_schedule_requests_service(tests.user('tv:' || who), tests.id('tv'), 'needs_review')
    -> 'time_off_requests') x where (x ->> 'id')::uuid = rid
$$;
select is(
  (select jsonb_build_object('remaining', p -> 'remaining', 'fallback', p -> 'fallback', 'can_vote', p -> 'can_vote',
     'can_decide_alone', p -> 'can_decide_alone', 'my_vote', p -> 'my_vote', 'locations', jsonb_array_length(p -> 'locations'))
   from (select pg_temp.queue_row('mehmet', tests.id('tv:ali:8')) -> 'progress' p) x),
  '{"remaining": 1, "fallback": false, "can_vote": true, "can_decide_alone": false, "my_vote": null, "locations": 2}'::jsonb,
  'Mehmet sees one location left, his to answer');
select is(
  (select p -> 'my_approval_finalizes' from (select pg_temp.queue_row('mehmet', tests.id('tv:ali:8')) -> 'progress' p) x),
  'true'::jsonb, 'and that his approval would settle it');
select is((pg_temp.queue_row('ayse', tests.id('tv:ali:8')) -> 'progress' ->> 'my_vote'), 'approve',
  'Ayse sees her own vote');
select is((pg_temp.queue_row('zeynep', tests.id('tv:ali:8')) -> 'progress' ->> 'can_decide_alone')::boolean, true,
  'an admin sees she may decide alone');
select is(pg_temp.refusal(format($$select pg_temp.queue_row('emre', %L)$$, tests.id('tv:ali:8'))),
  '42501 authz.missing_permission', 'an employee does not open the queue');
select is(
  (select x ->> 'status' from jsonb_array_elements(public.get_employee_hub_service(tests.user('tv:ali'), tests.id('tv'),
     current_date, current_date + 62) -> 'requests') x where (x ->> 'id')::uuid = tests.id('tv:ali:8')),
  'pending', 'Ali sees only that it is pending');
select ok(
  (select not (x ? 'progress') and not (x ? 'votes') from jsonb_array_elements(public.get_employee_hub_service(tests.user('tv:ali'), tests.id('tv'),
     current_date, current_date + 62) -> 'requests') x where (x ->> 'id')::uuid = tests.id('tv:ali:8')),
  'and nothing of who voted');

-- 8. Somebody restricted by a missing document ---------------------------------

-- A document everybody must hand in; Bora's and Hande's deadlines passed.
-- ponytail: nothing in the product moves the clock; the deadlines are set by hand.
select tests.world('tr');
-- The owner works here too (ROL-CIFT: the employee side needs the employee slot).
select tests.employee_slot('tr', 'owner');
select tests.person('tr', 'hande', 'manager', array['K'], array['cook']);
select tests.person('tr', 'bora', 'employee', array['K'], array['cook']);
select tests.person('tr', 'cem', 'employee', array['K'], array['cook']);
select tests.person('tr', 'nur', 'manager', array['B'], array['cook']);
select tests.person('tr', 'dila', 'employee', array['K', 'B'], array['cook']);
select tests.remember('tr:cem:1', tests.leave('tr', 'cem', 1));
create temporary table required_document (id uuid, preview jsonb);
insert into required_document (id)
select public.save_document_type_lifecycle_service(tests.user('tr:owner'), tests.id('tr'), null, null, jsonb_build_object(
  'title', 'Food handler card', 'description', 'Card', 'requires_review', true, 'accepted_formats', array['pdf'],
  'tracks_expiry', false, 'expiry_warning_days', 30,
  'lifecycle_settings', jsonb_build_object('mode', 'conditional', 'assignment_scope', 'all_active',
    'target', jsonb_build_object('operator', 'and', 'location_ids', '[]'::jsonb, 'department_ids', '[]'::jsonb,
      'job_ids', '[]'::jsonb, 'employee_ids', '[]'::jsonb),
    'period_days', 7, 'suspend_on_overdue', true, 'extra_fields', '[]'::jsonb)));
update required_document set preview = public.preview_document_publication_service(tests.user('tr:owner'), tests.id('tr'), id);
select public.set_document_publication_service(tests.user('tr:owner'), tests.id('tr'), id,
  (preview ->> 'revision')::integer, (preview ->> 'publication_revision')::integer, preview ->> 'preview_token', 'Publish', 'published')
from required_document;
select tests.settle();
update public.employee_onboarding_requirements
set lifecycle_exempt = false, deadline_at = now() - interval '1 day'
where source_id = (select id from required_document) and lifecycle_user_id in (tests.user('tr:bora'), tests.user('tr:hande'));
select is(pg_temp.refusal($$select tests.leave('tr', 'bora', 1)$$), '42501 authz.document_blocked',
  'somebody restricted by a missing document cannot ask for time off');
select is(pg_temp.refusal(format($$select public.decide_time_off_service(%L, %L, %L, 'approve', '', %L)$$,
    tests.user('tr:hande'), tests.id('tr'), tests.id('tr:cem:1'),
    app_private.time_off_impact(tests.id('tr'), tests.id('tr:cem:1')) ->> 'fingerprint')),
  '42501 authz.document_blocked', 'nor vote on one');
-- The owner is never held back by a document (user decision 2026-10-01): the
-- owner's copy is overdue too, yet the owner reads the queue and decides.
update public.employee_onboarding_requirements
set lifecycle_exempt = false, deadline_at = now() - interval '1 day'
where source_id = (select id from required_document) and lifecycle_user_id = tests.user('tr:owner');
select ok(app_private.document_actor_blocked(tests.user('tr:owner'), tests.id('tr')), 'the owner misses the document too');
select is(
  (select jsonb_build_object('alone', x -> 'progress' -> 'can_decide_alone', 'seen', x -> 'progress' -> 'impact' ? 'fingerprint')
   from jsonb_array_elements(public.get_schedule_requests_service(tests.user('tr:owner'), tests.id('tr'), 'needs_review') -> 'time_off_requests') x
   where (x ->> 'id')::uuid = tests.id('tr:cem:1')),
  '{"alone": true, "seen": true}'::jsonb, 'the owner still reads the queue, may decide alone and sees the shifts it would open');
select is((public.decide_time_off_service(tests.user('tr:owner'), tests.id('tr'), tests.id('tr:cem:1'), 'approve', '',
    app_private.time_off_impact(tests.id('tr'), tests.id('tr:cem:1')) ->> 'fingerprint') ->> 'status'), 'approved', 'and decides it');

-- A passing restriction does not drop a location (user decision 2026-10-01):
-- Hande, Kadikoy's only manager, misses a document. Cem's request keeps
-- Kadikoy, goes to an admin and the owner, and Hande votes once it is in.
select tests.remember('tr:cem:2', tests.leave('tr', 'cem', 2));
select is(
  (select array_agg(l.short_name) from public.time_off_required_locations x join public.locations l on l.id = x.location_id
   where x.request_id = tests.id('tr:cem:2')),
  array['KDK'], 'a manager held back by a missing document does not drop Kadikoy');
select app_private.time_off_sweep();
select app_private.time_off_sweep();
select is((select r.status::text from public.schedule_time_off_requests r where r.id = tests.id('tr:cem:2')), 'pending',
  'so nothing settles it on its own');
select is((app_private.time_off_state(tests.id('tr'), tests.id('tr:cem:2')) ->> 'fallback')::boolean, false, 'Kadikoy still counts');
update public.employee_onboarding_requirements set deadline_at = now() + interval '7 days'
where source_id = (select id from required_document) and lifecycle_user_id = tests.user('tr:hande');
select is((public.decide_time_off_service(tests.user('tr:hande'), tests.id('tr'), tests.id('tr:cem:2'), 'approve', '',
    app_private.time_off_impact(tests.id('tr'), tests.id('tr:cem:2')) ->> 'fingerprint') ->> 'status'), 'approved',
  'once her document is in, Hande votes and settles it');

-- 9. A closed workspace --------------------------------------------------------

select tests.remember('tv:emre:6', tests.leave('tv', 'emre', 6));
update public.workspaces set lifecycle_status = 'suspended' where id = tests.id('tv');
select is(pg_temp.refusal($$select tests.leave('tv', 'emre', 9)$$), '42501 authz.workspace_closed',
  'nobody asks for time off in a closed workspace');
select is(pg_temp.refusal(format($$select pg_temp.decide('ayse', %L, 'approve')$$, tests.id('tv:emre:6'))),
  '42501 authz.workspace_closed', 'nor decides it');

select * from finish();
rollback;

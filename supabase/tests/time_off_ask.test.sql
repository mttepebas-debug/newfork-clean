begin;
create extension if not exists pgtap with schema extensions;
select plan(59);

-- Time off rebuild D2 (KARARLAR S-239): an employee asks for time off and takes back a request that waits.
-- One table, public.time_off_requests; three entry points: ask_time_off_service, withdraw_time_off_service,
-- my_time_off_service. One range per request, in the time zone of the person's primary location: All day
-- runs from the first day's local midnight to the midnight after the last day; with hours, the first day's
-- clock to the last day's (24:00 is the next midnight). A clock the zone skips is refused; a clock it repeats
-- is its first time. Refused: a start that has passed (All day today has started), more than 31 days, and
-- hours that touch time off the person already has or asked for, in the old tables or the new one
-- (app_private.leave_spans). The new table's requests join leave_spans: what is approved as `effective`,
-- what waits as the hours asked, while it has not started.
--
-- World ta: Kadikoy (Istanbul, UTC+3 all year) and Besiktas, moved to Los Angeles for the clock tests.
--   ann, bob, cid, dan, eve - employees at Kadikoy
--   lax - an employee at Besiktas (Los Angeles)
--   rem - an employee with no location
--   mo  - a manager with no employee access (S-166: no time off of their own)
-- World tb's owner is nobody in ta.

select tests.world('ta');
select tests.world('tb');
select tests.person('ta', 'ann', 'employee', array['K'], array['cook']);
select tests.person('ta', 'bob', 'employee', array['K'], array['cook']);
select tests.person('ta', 'cid', 'employee', array['K'], array['cook']);
select tests.person('ta', 'dan', 'employee', array['K'], array['cook']);
select tests.person('ta', 'eve', 'employee', array['K'], array['cook']);
select tests.person('ta', 'lax', 'employee', array['B'], array['cook']);
select tests.person('ta', 'rem', 'employee', array[]::text[], array['cook']);
select tests.person('ta', 'mo', 'manager', array['K'], array['general manager']);
update public.locations set timezone = 'America/Los_Angeles' where id = tests.id('ta:B');

create temporary table fixture (key text primary key, value uuid);
-- Kadikoy's today, and one key reused below.
create temporary table clock as select (now() at time zone 'Europe/Istanbul')::date as today;
insert into fixture values ('key:ann', gen_random_uuid());

create function pg_temp.ask(person text, kind text, first_day date, last_day date, all_day boolean,
  from_clock time default null, to_clock time default null, note text default null,
  zone text default 'Europe/Istanbul', key uuid default gen_random_uuid())
returns jsonb
language sql
as $$
  select public.ask_time_off_service(tests.user('ta:' || person), tests.id('ta'), kind, first_day, last_day, all_day,
    from_clock, to_clock, note, zone, key)
$$;
-- What a call says when it refuses: its SQLSTATE and hint, or 'ok'.
create function pg_temp.refusal(statement text)
returns text
language plpgsql
as $$
declare state text; why text;
begin
  execute statement;
  return 'ok';
exception when others then
  get stacked diagnostics state = returned_sqlstate, why = pg_exception_hint;
  return state || ' ' || coalesce(why, '');
end;
$$;
create function pg_temp.today() returns date language sql as $$ select today from clock $$;
create function pg_temp.at(day date, clock text, zone text default 'Europe/Istanbul')
returns timestamptz
language sql
as $$ select (day + clock::time) at time zone zone $$;

-- 1. All day: Ann asks for three days of vacation ten days from now.
insert into fixture
select 'ann:first', (pg_temp.ask('ann', 'vacation', pg_temp.today() + 10, pg_temp.today() + 12, true,
  note => '  My sister''s wedding  ', key => (select value from fixture where key = 'key:ann')) ->> 'id')::uuid;
select is(
  (select row(r.kind, r.status, r.kind_of_leave, r.all_day, r.time_timezone, r.note, r.revision, r.employee_id, r.created_by,
    r.starts_at, r.ends_at, isempty(r.effective))::text
   from public.time_off_requests r where r.id = (select value from fixture where key = 'ann:first')),
  row('leave', 'pending', 'vacation', true, 'Europe/Istanbul', 'My sister''s wedding', 1, tests.id('ta:ann'), tests.user('ta:ann'),
    pg_temp.at(pg_temp.today() + 10, '00:00'), pg_temp.at(pg_temp.today() + 13, '00:00'), true)::text,
  'All day runs from the first day''s local midnight to the midnight after the last day, waiting, the note trimmed'
);
select is(
  pg_temp.ask('ann', 'vacation', pg_temp.today() + 10, pg_temp.today() + 12, true,
    note => '  My sister''s wedding  ', key => (select value from fixture where key = 'key:ann')) ->> 'id',
  (select value::text from fixture where key = 'ann:first'),
  'the same request key gives back the same request'
);
select is((select count(*)::integer from public.time_off_requests where employee_id = tests.id('ta:ann')), 1,
  'and adds nothing');
select is(
  pg_temp.refusal(format($$select pg_temp.ask('ann', 'sick', pg_temp.today() + 10, pg_temp.today() + 12, true, key => %L)$$,
    (select value from fixture where key = 'key:ann'))),
  'PT409 time_off.key_reused',
  'a request key used for other hours is refused'
);
select is(
  pg_temp.refusal($$select public.ask_time_off_service(tests.user('ta:bob'), tests.id('ta'), 'vacation', pg_temp.today() + 30,
    pg_temp.today() + 30, true, null, null, null, 'Europe/Istanbul', (select value from fixture where key = 'key:ann'))$$),
  'PT409 time_off.key_reused',
  'somebody else''s request key is refused, and their request is not shown'
);

-- 2. Overlap, in the new table and the old ones.
select is(
  pg_temp.refusal($$select pg_temp.ask('ann', 'personal', pg_temp.today() + 12, pg_temp.today() + 14, true)$$),
  'PT409 time_off.overlap',
  'days that touch a request waiting for an answer are refused'
);
select is(
  pg_temp.ask('ann', 'personal', pg_temp.today() + 13, pg_temp.today() + 13, true) ->> 'status',
  'pending',
  'the day after it is free'
);
select is(
  pg_temp.refusal($$select pg_temp.ask('ann', 'personal', pg_temp.today() + 12, pg_temp.today() + 12, false, '23:00', '24:00')$$),
  'PT409 time_off.overlap',
  'the last hour of an all-day request is part of it'
);
-- Cid asked the old way (tests.leave: the Wednesday of tests.week(0)); Bob has approved time off the old way.
select tests.leave('ta', 'cid', 0, 1);
select tests.approved_leave(tests.id('ta'), tests.id('ta:bob'), tests.user('ta:owner'), tests.id('ta:K'), pg_temp.today() + 20);
select is(
  pg_temp.refusal($$select pg_temp.ask('cid', 'vacation', tests.week(0) + 2, tests.week(0) + 2, false, '09:00', '10:00')$$),
  'PT409 time_off.overlap',
  'hours inside a request waiting in the old tables are refused'
);
select is(
  pg_temp.refusal($$select pg_temp.ask('bob', 'vacation', pg_temp.today() + 19, pg_temp.today() + 21, true)$$),
  'PT409 time_off.overlap',
  'days that touch approved time off in the old tables are refused'
);
select is(
  pg_temp.ask('bob', 'vacation', pg_temp.today() + 21, pg_temp.today() + 22, true) ->> 'status',
  'pending',
  'the days after approved time off are free'
);

-- 3. Started, too long, out of order.
select is(
  pg_temp.refusal($$select pg_temp.ask('dan', 'sick', pg_temp.today(), pg_temp.today(), true)$$),
  '22023 time_off.started',
  'All day today has already started'
);
select is(
  pg_temp.refusal($$select pg_temp.ask('dan', 'sick', pg_temp.today() - 1, pg_temp.today() + 1, true)$$),
  '22023 time_off.started',
  'a first day that has passed is refused'
);
select is(
  pg_temp.refusal($$select pg_temp.ask('dan', 'sick', pg_temp.today() - 1, pg_temp.today() - 1, false, '10:00', '11:00')$$),
  '22023 time_off.started',
  'hours that have passed are refused'
);
select is(
  pg_temp.refusal($$select pg_temp.ask('dan', 'vacation', pg_temp.today() + 40, pg_temp.today() + 71, true)$$),
  '22023 time_off.too_long',
  '32 days are refused'
);
select is(
  pg_temp.ask('dan', 'vacation', pg_temp.today() + 40, pg_temp.today() + 70, true) ->> 'status',
  'pending',
  '31 days are asked'
);
select is(
  pg_temp.refusal($$select pg_temp.ask('eve', 'vacation', pg_temp.today() + 40, pg_temp.today() + 71, false, '09:00', '09:01')$$),
  '22023 time_off.too_long',
  'with hours, a minute over 31 days is refused'
);
select is(
  pg_temp.refusal($$select pg_temp.ask('eve', 'personal', pg_temp.today() + 5, pg_temp.today() + 5, false, '15:00', '10:00')$$),
  '22023 time_off.order',
  'an end before the start is refused'
);
select is(
  pg_temp.refusal($$select pg_temp.ask('eve', 'personal', pg_temp.today() + 5, pg_temp.today() + 4, true)$$),
  '22023 time_off.order',
  'a last day before the first is refused'
);
select is(
  pg_temp.refusal($$select pg_temp.ask('eve', 'personal', pg_temp.today() + 5, pg_temp.today() + 5, false, '10:00', null)$$),
  '22023 time_off.invalid',
  'hours need both clocks'
);
select is(
  pg_temp.refusal($$select pg_temp.ask('eve', 'holiday', pg_temp.today() + 5, pg_temp.today() + 5, true)$$),
  '22023 time_off.invalid',
  'the type is one of the four'
);
select is(
  pg_temp.refusal($$select pg_temp.ask('eve', 'personal', pg_temp.today() + 5, pg_temp.today() + 5, true, note => repeat('x', 1001))$$),
  '22023 time_off.invalid',
  'a note is at most 1000 characters'
);
select is(
  pg_temp.refusal($$select pg_temp.ask('eve', 'personal', pg_temp.today() + 5, pg_temp.today() + 5, true, key => null)$$),
  '22023 time_off.invalid',
  'a request key is required'
);

-- 4. Clocks: 24:00, and the days a zone skips or repeats an hour.
insert into fixture select 'clock:1', (pg_temp.ask('eve', 'personal', pg_temp.today() + 6, pg_temp.today() + 6, false, '18:00', '24:00') ->> 'id')::uuid;
select is(
  (select row(r.starts_at, r.ends_at)::text from public.time_off_requests r
   where r.id = (select value from fixture where key = 'clock:1')),
  row(pg_temp.at(pg_temp.today() + 6, '18:00'), pg_temp.at(pg_temp.today() + 7, '00:00'))::text,
  '24:00 is the next midnight'
);
select is(
  pg_temp.refusal($$select pg_temp.ask('lax', 'personal', '2030-03-10', '2030-03-10', false, '02:30', '04:00', zone => 'America/Los_Angeles')$$),
  '22023 time_off.no_such_time',
  'a clock the zone skips (2:30 AM when daylight saving time starts) is refused'
);
insert into fixture select 'clock:2', (pg_temp.ask('lax', 'personal', '2030-11-03', '2030-11-03', false, '01:30', '03:00', zone => 'America/Los_Angeles') ->> 'id')::uuid;
select is(
  (select r.starts_at from public.time_off_requests r
   where r.id = (select value from fixture where key = 'clock:2')),
  '2030-11-03 01:30:00-07'::timestamptz,
  'a clock the zone repeats (1:30 AM when daylight saving time ends) is its first time'
);
insert into fixture select 'clock:3', (pg_temp.ask('lax', 'vacation', '2030-03-09', '2030-03-10', true, zone => 'America/Los_Angeles') ->> 'id')::uuid;
select is(
  (select r.ends_at - r.starts_at from public.time_off_requests r
   where r.id = (select value from fixture where key = 'clock:3')),
  interval '47 hours',
  'All day over the night the clock goes forward is local midnight to local midnight'
);
select is(
  pg_temp.refusal($$select pg_temp.ask('lax', 'vacation', pg_temp.today() + 50, pg_temp.today() + 50, true, zone => 'Europe/Istanbul')$$),
  'PT409 time_off.timezone_changed',
  'a form drawn in another time zone is sent back'
);
select is(
  pg_temp.refusal($$select pg_temp.ask('rem', 'vacation', pg_temp.today() + 50, pg_temp.today() + 50, true)$$),
  '55000 time_off.no_location',
  'somebody with no location cannot ask'
);

-- 5. Who may ask.
select is(
  pg_temp.refusal($$select pg_temp.ask('mo', 'vacation', pg_temp.today() + 50, pg_temp.today() + 50, true)$$),
  '42501 authz.rank',
  'a management access alone has no time off of its own (S-166)'
);
select is(
  pg_temp.refusal($$select public.ask_time_off_service(tests.user('tb:owner'), tests.id('ta'), 'vacation', pg_temp.today() + 50,
    pg_temp.today() + 50, true, null, null, null, 'Europe/Istanbul', gen_random_uuid())$$),
  '42501 authz.not_member',
  'somebody from another workspace is not a member'
);
select is(
  pg_temp.refusal($$select public.my_time_off_service(tests.user('tb:owner'), tests.id('ta'))$$),
  '42501 authz.not_member',
  'nor can they read anybody''s time off'
);
select is(
  pg_temp.refusal($$select public.my_time_off_service(tests.user('ta:mo'), tests.id('ta'))$$),
  '42501 authz.rank',
  'a management access alone has no list of its own'
);

-- 6. leave_spans reads the new table.
select is(
  (select array_agg(row(l.request_id, l.segment_id, l.revision, l.span, l.pending, l.zone)::text)
   from app_private.leave_spans(tests.id('ta'), array[tests.id('ta:ann')], tstzrange(pg_temp.at(pg_temp.today() + 9, '00:00'), pg_temp.at(pg_temp.today() + 11, '00:00'))) l),
  array[row((select value from fixture where key = 'ann:first'), (select value from fixture where key = 'ann:first'), 1,
    tstzrange(pg_temp.at(pg_temp.today() + 10, '00:00'), pg_temp.at(pg_temp.today() + 13, '00:00')), true, 'Europe/Istanbul')::text],
  'a request waiting for an answer reads as the hours asked, pending, its id as the piece'
);
-- Approved, then the last day taken back (what D3 and D4 will write).
update public.time_off_requests
set status = 'approved', revision = 2,
    effective = tstzmultirange(tstzrange(pg_temp.at(pg_temp.today() + 10, '00:00'), pg_temp.at(pg_temp.today() + 12, '00:00')))
where id = (select value from fixture where key = 'ann:first');
select is(
  (select array_agg(row(l.span, l.pending, l.revision)::text)
   from app_private.leave_spans(tests.id('ta'), array[tests.id('ta:ann')], '(,)'::tstzrange) l
   where l.request_id = (select value from fixture where key = 'ann:first')),
  array[row(tstzrange(pg_temp.at(pg_temp.today() + 10, '00:00'), pg_temp.at(pg_temp.today() + 12, '00:00')), false, 2)::text],
  'approved time off reads as what is left of it'
);
select is(
  pg_temp.refusal($$select pg_temp.ask('ann', 'other', pg_temp.today() + 12, pg_temp.today() + 12, false, '10:00', '11:00')$$),
  'ok',
  'the hours given back are free again'
);
update public.time_off_requests set status = 'revoked', ended_at = now(),
    effective = tstzmultirange(tstzrange(pg_temp.at(pg_temp.today() + 10, '00:00'), pg_temp.at(pg_temp.today() + 11, '00:00')))
where id = (select value from fixture where key = 'ann:first');
select is(
  (select array_agg(l.span::text)
   from app_private.leave_spans(tests.id('ta'), array[tests.id('ta:ann')], '(,)'::tstzrange) l
   where l.request_id = (select value from fixture where key = 'ann:first')),
  array[tstzrange(pg_temp.at(pg_temp.today() + 10, '00:00'), pg_temp.at(pg_temp.today() + 11, '00:00'))::text],
  'revoked time off keeps the part that was taken'
);
select is(
  (select count(*)::integer
   from app_private.leave_spans(tests.id('ta'), array[tests.id('ta:ann')], '(,)'::tstzrange) l
   where l.request_id = (select value from fixture where key = 'ann:first')
     and l.span && tstzrange(pg_temp.at(pg_temp.today() + 11, '00:00'), pg_temp.at(pg_temp.today() + 12, '00:00'))),
  0,
  'and nothing after it'
);
select is(
  pg_temp.refusal($$update public.time_off_requests set status = 'pending', effective = tstzmultirange(tstzrange(starts_at, ends_at))
    where id = (select value from fixture where key = 'ann:first')$$),
  '23514 ',
  'a request waiting for an answer has no effective time off'
);
select is(
  pg_temp.refusal($$update public.time_off_requests set effective = tstzmultirange(tstzrange(starts_at - interval '1 hour', ends_at))
    where id = (select value from fixture where key = 'ann:first')$$),
  '23514 ',
  'effective time off stays inside the hours asked'
);

-- 7. Withdraw.
insert into fixture
select 'eve:w', (pg_temp.ask('eve', 'sick', pg_temp.today() + 8, pg_temp.today() + 8, true) ->> 'id')::uuid;
select is(
  pg_temp.refusal($$select public.withdraw_time_off_service(tests.user('ta:bob'), tests.id('ta'), (select value from fixture where key = 'eve:w'), 1)$$),
  '42501 authz.out_of_scope',
  'nobody withdraws somebody else''s request'
);
select is(
  pg_temp.refusal($$select public.withdraw_time_off_service(tests.user('tb:owner'), tests.id('ta'), (select value from fixture where key = 'eve:w'), 1)$$),
  '42501 authz.not_member',
  'nor does somebody from another workspace'
);
select is(
  pg_temp.refusal($$select public.withdraw_time_off_service(tests.user('ta:eve'), tests.id('ta'), gen_random_uuid(), 1)$$),
  'P0002 time_off.not_found',
  'a request that is not there is not found'
);
select is(
  pg_temp.refusal($$select public.withdraw_time_off_service(tests.user('ta:eve'), tests.id('ta'), (select value from fixture where key = 'eve:w'), 7)$$),
  'PT409 time_off.changed',
  'a request that changed since it was read is sent back'
);
create temporary table withdrawn as
select public.withdraw_time_off_service(tests.user('ta:eve'), tests.id('ta'), (select value from fixture where key = 'eve:w'), 1) x;
select is(
  (select row(w.x ->> 'status', (w.x ->> 'revision')::integer, r.status, r.ended_by, r.ended_at is not null)::text
   from withdrawn w, public.time_off_requests r where r.id = (select value from fixture where key = 'eve:w')),
  row('withdrawn', 2, 'withdrawn', tests.user('ta:eve'), true)::text,
  'Eve withdraws her request'
);
select is(
  pg_temp.refusal($$select public.withdraw_time_off_service(tests.user('ta:eve'), tests.id('ta'), (select value from fixture where key = 'eve:w'), 2)$$),
  'PT409 time_off.not_pending',
  'only a request waiting for an answer can be withdrawn'
);
select is(
  (select count(*)::integer from app_private.leave_spans(tests.id('ta'), array[tests.id('ta:eve')], '(,)'::tstzrange) l
   where l.request_id = (select value from fixture where key = 'eve:w')),
  0,
  'a withdrawn request is no time off'
);
select is(
  pg_temp.ask('eve', 'sick', pg_temp.today() + 8, pg_temp.today() + 8, true) ->> 'status',
  'pending',
  'and its days can be asked again'
);

-- 8. My time off: one's own requests; a request whose start passed with no answer reads as expired.
update public.time_off_requests set starts_at = now() - interval '1 hour', ends_at = now() + interval '1 hour', all_day = false
where employee_id = tests.id('ta:dan') and status = 'pending';
select is(
  (select array_agg(x ->> 'status' order by x ->> 'starts_at')
   from jsonb_array_elements(public.my_time_off_service(tests.user('ta:dan'), tests.id('ta')) -> 'requests') x),
  array['expired'],
  'a request whose start passed with no answer reads as expired'
);
select is(
  (select count(*)::integer from app_private.leave_spans(tests.id('ta'), array[tests.id('ta:dan')], '(,)'::tstzrange)),
  0,
  'and is no longer waiting in leave_spans'
);
select is(
  (select row(m ->> 'time_zone', m ->> 'today', m -> 'location_names', jsonb_array_length(m -> 'requests'))::text
   from public.my_time_off_service(tests.user('ta:ann'), tests.id('ta')) m),
  row('Europe/Istanbul', pg_temp.today()::text, '["Kadikoy"]'::jsonb, 3)::text,
  'Ann reads her zone, her today, where her answer comes from and her three requests'
);
select is(
  (select jsonb_object_keys_sorted
   from (select array_agg(k order by k) jsonb_object_keys_sorted
         from jsonb_object_keys((public.my_time_off_service(tests.user('ta:ann'), tests.id('ta')) -> 'requests') -> 0) k) s),
  -- D4 added cancellation, cancels_id, ended_by_name and used_until; D5 added_by_name.
  array['added_by_name', 'all_day', 'cancellation', 'cancels_id', 'created_at', 'decided_at', 'decided_by_name', 'decision_note', 'end_date',
    'end_time', 'ended_at', 'ended_by_name', 'ended_note', 'ends_at', 'id', 'kind', 'kind_of_leave', 'note', 'revision',
    'start_date', 'start_time', 'starts_at', 'status', 'time_timezone', 'used_until'],
  'each request says what the screen shows'
);
select is(
  (select row(x ->> 'start_date', x ->> 'end_date', x ->> 'start_time', x ->> 'end_time')::text
   from jsonb_array_elements(public.my_time_off_service(tests.user('ta:eve'), tests.id('ta')) -> 'requests') x
   where (x ->> 'start_date')::date = pg_temp.today() + 6),
  row((pg_temp.today() + 6)::text, (pg_temp.today() + 6)::text, '18:00', '24:00')::text,
  'hours ending at midnight read back as 24:00 on their day'
);
select is(
  (select row(x ->> 'start_date', x ->> 'end_date', x ->> 'start_time')::text
   from jsonb_array_elements(public.my_time_off_service(tests.user('ta:bob'), tests.id('ta')) -> 'requests') x),
  row((pg_temp.today() + 21)::text, (pg_temp.today() + 22)::text, null)::text,
  'All day reads back as its first and last day, and Bob reads only his own'
);

-- 9. Closing the employee side withdraws what waits in the new table too.
select pg_temp.ask('cid', 'personal', pg_temp.today() + 3, pg_temp.today() + 3, true);
select is(
  (app_private.employee_side_impact(tests.id('ta'), tests.id('ta:cid')) ->> 'time_off_withdrawn')::integer,
  2,
  'the impact counts the old and the new request waiting'
);
select app_private.close_employee_side(tests.id('ta'), tests.id('ta:cid'), tests.user('ta:owner'), 'access_dropped');
select is(
  (select array_agg(row(r.status, r.ended_by, r.ended_note)::text) from public.time_off_requests r where r.employee_id = tests.id('ta:cid')),
  array[row('withdrawn', tests.user('ta:owner'), 'This person no longer works shifts here.')::text],
  'closing the employee side withdraws the new request, saying why'
);

-- 10. The doors.
select is(
  (select array_agg(row(p.proname, p.prosecdef, has_function_privilege('authenticated', p.oid, 'execute'),
     has_function_privilege('service_role', p.oid, 'execute'))::text order by p.proname)
   from pg_proc p where p.pronamespace = 'public'::regnamespace
     and p.proname in ('ask_time_off_service', 'withdraw_time_off_service', 'my_time_off_service')),
  array[row('ask_time_off_service', true, false, true)::text, row('my_time_off_service', true, false, true)::text,
    row('withdraw_time_off_service', true, false, true)::text],
  'the three services run as definer, for the API only'
);
select is(
  (select row(c.relrowsecurity, has_table_privilege('authenticated', c.oid, 'select'), has_table_privilege('anon', c.oid, 'select'),
     (select count(*)::integer from pg_policy p where p.polrelid = c.oid))::text
   from pg_class c where c.oid = 'public.time_off_requests'::regclass),
  row(true, false, false, 0)::text,
  'the table is closed to the browser: row level security on, no policy, no grant'
);
select is(
  (select count(*)::integer from pg_trigger t where t.tgrelid = 'public.time_off_requests'::regclass and not t.tgisinternal),
  0,
  'no trigger on the table (no workspace lock, BL-791)'
);

select * from finish();
rollback;

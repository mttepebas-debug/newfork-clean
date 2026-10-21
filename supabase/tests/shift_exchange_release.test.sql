begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- TAKAS-RELEASE (Mert, 2026-10-13/14, the shift change plan; first slice chosen
-- 2026-10-17): a release puts one's own shift in the open pool. Only a release
-- reaches the pool from a teammate: a published shift nobody holds stays the manager's to fill unless the
-- publish offered it (open_shift_offer.test.sql, Mert 2026-10-20).
-- Every request closes 4 hours before the shift (the earlier one in a swap) and
-- none opens after that. A teammate who says "Not for me" stops seeing the card;
-- nobody else learns it. The owner takes a release back without a reason, and a
-- manager declines without one.

select tests.world('rl');
select tests.person('rl', 'rachel', 'manager', array['K'], array['cook']);
select tests.person('rl', 'maria', 'employee', array['K'], array['cook']);
select tests.person('rl', 'jake', 'employee', array['K'], array['cook']);
select tests.person('rl', 'leo', 'employee', array['K'], array['cook']);
select tests.person('rl', 'berk', 'employee', array['B'], array['cook']);
-- Mira manages Besiktas only.
select tests.person('rl', 'mira', 'manager', array['B'], array['cook']);
select tests.publish_week('rl', 1, '[
  {"label": "maria-mon", "person": "maria", "loc": "K", "job": "cook", "day": 0, "start": "16:00", "end": "22:00"},
  {"label": "maria-tue", "person": "maria", "loc": "K", "job": "cook", "day": 1, "start": "16:00", "end": "22:00"},
  {"label": "maria-wed", "person": "maria", "loc": "K", "job": "cook", "day": 2, "start": "16:00", "end": "22:00"},
  {"label": "maria-thu", "person": "maria", "loc": "K", "job": "cook", "day": 3, "start": "16:00", "end": "22:00"},
  {"label": "jake-fri", "person": "jake", "loc": "K", "job": "cook", "day": 4, "start": "10:00", "end": "15:00"},
  {"label": "open-sat", "loc": "K", "job": "cook", "day": 5, "start": "09:00", "end": "15:00"},
  {"label": "maria-sun", "person": "maria", "loc": "K", "job": "cook", "day": 6, "start": "09:00", "end": "15:00"}
]');
select tests.publish_week('rl', 2, '[
  {"label": "maria-mon2", "person": "maria", "loc": "K", "job": "cook", "day": 0, "start": "16:00", "end": "22:00"},
  {"label": "maria-tue2", "person": "maria", "loc": "K", "job": "cook", "day": 1, "start": "16:00", "end": "22:00"},
  {"label": "maria-wed2", "person": "maria", "loc": "K", "job": "cook", "day": 2, "start": "16:00", "end": "22:00"},
  {"label": "jake-thu2", "person": "jake", "loc": "K", "job": "cook", "day": 3, "start": "16:00", "end": "22:00"}
]');

create function pg_temp.command(who text, command jsonb) returns jsonb language sql as $$
  select public.shift_exchanges_command_service(tests.user('rl:' || who), tests.id('rl'), command, gen_random_uuid())
$$;
create function pg_temp.shift(label text) returns jsonb language sql as $$
  select public.shift_exchange_shift(tests.id('rl'), tests.id('rl:shift:' || label))
$$;
create function pg_temp.release(label text, note text default '') returns uuid language sql as $$
  select tests.remember('rl:case:' || label, (pg_temp.command('maria', jsonb_build_object('action', 'create', 'kind', 'cover',
    'shift_id', tests.id('rl:shift:' || label), 'teammate_note', note)) ->> 'case_id')::uuid)
$$;
create function pg_temp.revision(target uuid) returns integer language sql as $$
  select revision from public.shift_exchange_cases where id = target
$$;
-- Shift Hub -> Available Shifts as the person reads it.
create function pg_temp.offered(who text, label text) returns boolean language sql as $$
  select exists(select 1 from jsonb_array_elements(public.shift_exchanges_read_service(tests.user('rl:' || who), tests.id('rl'), false,
    tests.week(1), tests.week(1) + 6) -> 'opportunities') o where o -> 'shift' ->> 'source_id' = (pg_temp.shift(label) ->> 'source_id'))
$$;
-- The case's applications as the person reads them (Shift Hub, or Requests for a manager).
create function pg_temp.applicants(who text, manager_view boolean, target uuid) returns text[] language sql as $$
  select coalesce(array_agg(a ->> 'employee_name' order by a ->> 'employee_name'), '{}')
  from jsonb_array_elements(public.shift_exchanges_read_service(tests.user('rl:' || who), tests.id('rl'), manager_view,
    tests.week(1), tests.week(1) + 6, target) -> 'cases') c, jsonb_array_elements(c -> 'applications') a
  where c ->> 'id' = target::text
$$;
grant execute on all functions in schema pg_temp to public;

-- A release closes 4 hours before the shift ------------------------------------------
select pg_temp.release('maria-mon', ' Family dinner came up. Section 4 is usually busy, thanks! ');
select tests.settle();
select is((select expires_at from public.shift_exchange_cases where id = tests.id('rl:case:maria-mon')),
  (pg_temp.shift('maria-mon') ->> 'starts_at')::timestamptz - interval '4 hours',
  'Maria''s release of Monday 4:00 PM closes at 12:00 PM, 4 hours before the shift');

-- A swap closes 4 hours before the earlier of its two shifts.
select tests.remember('rl:case:swap', (pg_temp.command('maria', jsonb_build_object('action', 'create', 'kind', 'swap',
  'shift_id', tests.id('rl:shift:maria-sun'), 'requested_shift_id', tests.id('rl:shift:jake-fri'))) ->> 'case_id')::uuid);
select is((select expires_at from public.shift_exchange_cases where id = tests.id('rl:case:swap')),
  (pg_temp.shift('jake-fri') ->> 'starts_at')::timestamptz - interval '4 hours',
  'a swap of Sunday for Friday closes 4 hours before Friday''s shift');

-- Only a release reaches the pool -----------------------------------------------------
select ok(pg_temp.offered('jake', 'maria-mon'), 'Jake finds Maria''s released Monday in Available Shifts');
select ok(pg_temp.offered('leo', 'maria-mon'), 'and so does Leo');
select is((select o ->> 'note' from jsonb_array_elements(public.shift_exchanges_read_service(tests.user('rl:jake'), tests.id('rl'), false,
  tests.week(1), tests.week(1) + 6) -> 'opportunities') o where o ->> 'case_id' = tests.id('rl:case:maria-mon')::text),
  'Family dinner came up. Section 4 is usually busy, thanks!', 'Jake reads Maria''s note for teammates on the card');
select is((select private_note from public.shift_exchange_cases where id = tests.id('rl:case:maria-mon')), '',
  'the note for the manager stays empty');
select throws_ok($$ select pg_temp.release('maria-thu', repeat('x', 201)) $$, '23514', null, 'a note for teammates holds 200 characters');
select ok(not pg_temp.offered('jake', 'open-sat'), 'Saturday''s shift nobody holds is not in Jake''s Available Shifts');
select throws_ok($$ select pg_temp.command('jake', jsonb_build_object('action', 'apply', 'shift_id', tests.id('rl:shift:open-sat'))) $$,
  'P0001', 'This shift has not been released', 'nor can Jake ask for it');
select throws_ok($$ insert into public.shift_exchange_cases(workspace_id, kind, offered_source_id, owner_id, offered_snapshot,
  consent_fingerprint, expires_at, created_by) values (tests.id('rl'), 'open_pickup', tests.id('rl:shift:open-sat'), tests.id('rl:maria'),
  '{}', '', now() + interval '1 day', tests.user('rl:owner')) $$, '23514', null, 'an open pickup is no longer a kind of request');
select throws_ok($$ insert into public.shift_exchange_cases(workspace_id, kind, offered_source_id, offered_snapshot, consent_fingerprint,
  expires_at, created_by) values (tests.id('rl'), 'cover', tests.id('rl:shift:open-sat'), '{}', '', now() + interval '1 day',
  tests.user('rl:owner')) $$, '23514', null, 'and a request nobody owns is only one a publish offered');

-- Not for me ---------------------------------------------------------------------------
select pg_temp.command('jake', jsonb_build_object('action', 'pass', 'shift_id', tests.id('rl:shift:maria-mon'),
  'case_id', tests.id('rl:case:maria-mon')));
select tests.settle();
select ok(not pg_temp.offered('jake', 'maria-mon'), 'after "Not for me" Jake no longer finds Maria''s Monday');
select ok(pg_temp.offered('leo', 'maria-mon'), 'Leo still does');
select lives_ok($$ select pg_temp.command('jake', jsonb_build_object('action', 'pass', 'shift_id', tests.id('rl:shift:maria-mon'),
  'case_id', tests.id('rl:case:maria-mon'))) $$, 'saying it twice changes nothing');
select is((select count(*)::integer from public.shift_exchange_applications where case_id = tests.id('rl:case:maria-mon')
  and employee_id = tests.id('rl:jake')), 1, 'Jake''s "Not for me" is kept once');
select is((select revision from public.shift_exchange_cases where id = tests.id('rl:case:maria-mon')), 1,
  'a "Not for me" does not change the request Maria may take back');

select pg_temp.command('leo', jsonb_build_object('action', 'apply', 'shift_id', tests.id('rl:shift:maria-mon'),
  'case_id', tests.id('rl:case:maria-mon')));
select tests.settle();
select is(pg_temp.applicants('maria', false, tests.id('rl:case:maria-mon')), array[(select coalesce(nullif(preferred_name, ''),
  concat_ws(' ', first_name, last_name)) from public.employee_profiles where id = tests.id('rl:leo'))],
  'Maria reads who wants her shift: Leo, not who passed');
select is(pg_temp.applicants('rachel', true, tests.id('rl:case:maria-mon')), pg_temp.applicants('maria', false, tests.id('rl:case:maria-mon')),
  'Rachel''s Requests lists the same people');
select is((select c ->> 'teammate_note' from jsonb_array_elements(public.shift_exchanges_read_service(tests.user('rl:rachel'), tests.id('rl'),
  true, tests.week(1), tests.week(1) + 6) -> 'cases') c where c ->> 'id' = tests.id('rl:case:maria-mon')::text),
  'Family dinner came up. Section 4 is usually busy, thanks!', 'and reads Maria''s note for teammates');

-- A manager declines without a reason ---------------------------------------------------
select lives_ok($$ select pg_temp.command('rachel', jsonb_build_object('action', 'reject', 'case_id', tests.id('rl:case:maria-mon'),
  'application_id', (select id from public.shift_exchange_applications where case_id = tests.id('rl:case:maria-mon')
    and employee_id = tests.id('rl:leo')), 'expected_revision', pg_temp.revision(tests.id('rl:case:maria-mon')))) $$,
  'Rachel declines Leo without writing a reason');
select is((select status || ':' || reason from public.shift_exchange_applications where case_id = tests.id('rl:case:maria-mon')
  and employee_id = tests.id('rl:leo')), 'rejected_by_manager:', 'Leo''s request is declined with no reason');

-- Take back ----------------------------------------------------------------------------
select lives_ok($$ select pg_temp.command('maria', jsonb_build_object('action', 'close', 'case_id', tests.id('rl:case:maria-mon'),
  'expected_revision', pg_temp.revision(tests.id('rl:case:maria-mon')))) $$, 'Maria takes her shift back without a reason');
select is((select status from public.shift_exchange_cases where id = tests.id('rl:case:maria-mon')), 'cancelled',
  'her release is closed');
select ok(not pg_temp.offered('leo', 'maria-mon'), 'and Monday leaves Leo''s Available Shifts');

-- Nothing opens in the last 4 hours ---------------------------------------------------------
-- Tuesday's shift is moved to start in 2 hours, in the location's own clock.
update public.schedule_published_shifts s
set scheduled_date = (now() at time zone l.timezone + interval '2 hours')::date,
    start_time = (date_trunc('minute', now() at time zone l.timezone) + interval '2 hours')::time,
    end_time = (date_trunc('minute', now() at time zone l.timezone) + interval '6 hours')::time,
    time_timezone = null
from public.locations l
where l.id = s.location_id and s.id = tests.id('rl:shift:maria-tue');
select throws_ok($$ select pg_temp.release('maria-tue') $$, 'PT409', 'Too close to the shift. Talk to your manager.',
  'Maria cannot release a shift that starts in 2 hours');

-- A request past its 4-hour mark takes no new asks.
select pg_temp.release('maria-wed');
update public.shift_exchange_cases set expires_at = now() - interval '1 minute' where id = tests.id('rl:case:maria-wed');
select ok(not pg_temp.offered('leo', 'maria-wed'), 'Wednesday leaves Available Shifts at its 4-hour mark');
select throws_ok($$ select pg_temp.command('leo', jsonb_build_object('action', 'apply', 'shift_id', tests.id('rl:shift:maria-wed'),
  'case_id', tests.id('rl:case:maria-wed'))) $$, 'PT409', 'This request closed 4 hours before the shift',
  'and Leo can no longer ask for it');

-- A pass only on a release one may take (review O1, Y2) -------------------------------
create function pg_temp.pass(who text, label text, target uuid) returns jsonb language sql as $$
  select pg_temp.command(who, jsonb_build_object('action', 'pass', 'shift_id', tests.id('rl:shift:' || label), 'case_id', target))
$$;
grant execute on all functions in schema pg_temp to public;
select tests.remember('rl:case:direct', (pg_temp.command('maria', jsonb_build_object('action', 'create', 'kind', 'cover',
  'shift_id', tests.id('rl:shift:maria-mon2'), 'employee_id', tests.id('rl:leo'), 'teammate_note', 'Should not stick')) ->> 'case_id')::uuid);
select is((select teammate_note from public.shift_exchange_cases where id = tests.id('rl:case:direct')), '',
  'a cover asked of one teammate keeps no note for teammates');
select throws_ok($$ select pg_temp.pass('jake', 'maria-mon2', tests.id('rl:case:direct')) $$, '42501', 'This offer is not available',
  'nobody passes on a cover asked of one teammate');
select throws_ok($$ select pg_temp.pass('leo', 'maria-sun', tests.id('rl:case:swap')) $$, '42501', 'This offer is not available',
  'nor on a swap');
select pg_temp.release('maria-tue2');
select throws_ok($$ select pg_temp.pass('maria', 'maria-tue2', tests.id('rl:case:maria-tue2')) $$, 'P0001', 'You already own this shift',
  'Maria cannot pass on her own release');
select throws_ok($$ select pg_temp.pass('jake', 'maria-tue2', tests.id('rl:case:direct')) $$, '42501', 'This offer is not available',
  'a pass names the request of that shift');
select throws_ok($$ select pg_temp.pass('berk', 'maria-tue2', tests.id('rl:case:maria-tue2')) $$, '42501', 'This offer is not available',
  'Berk, who cannot work at Kadikoy, cannot pass on its release: he never sees the card');
update public.shift_exchange_cases set expires_at = now() - interval '1 minute' where id = tests.id('rl:case:maria-wed');
select throws_ok($$ select pg_temp.pass('jake', 'maria-wed', tests.id('rl:case:maria-wed')) $$, 'PT409', 'This request closed 4 hours before the shift',
  'nor on a release past its 4-hour mark');

select throws_ok($$ select pg_temp.pass('mira', 'maria-tue2', tests.id('rl:case:maria-tue2')) $$, '42501', 'This offer is not available',
  'nor can Mira, who manages Besiktas only');

-- A pass is no request of one's own: not in the command gate, not in the closed list.
-- (Written by hand here: the service no longer lets Mira pass on a Kadikoy release.)
insert into public.shift_exchange_applications (workspace_id, case_id, employee_id, status, consent_fingerprint)
select workspace_id, id, tests.id('rl:mira'), 'declined_by_employee', consent_fingerprint
from public.shift_exchange_cases where id = tests.id('rl:case:maria-tue2');
select throws_ok($$ select pg_temp.command('mira', jsonb_build_object('action', 'withdraw', 'case_id', tests.id('rl:case:maria-tue2'),
  'application_id', (select id from public.shift_exchange_applications where case_id = tests.id('rl:case:maria-tue2')
    and employee_id = tests.id('rl:mira')), 'expected_revision', pg_temp.revision(tests.id('rl:case:maria-tue2')))) $$,
  '42501', 'Request access denied', 'a pass gives Mira no way into Maria''s request');
select pg_temp.command('leo', jsonb_build_object('action', 'apply', 'shift_id', tests.id('rl:shift:maria-tue2'),
  'case_id', tests.id('rl:case:maria-tue2')));
select pg_temp.command('maria', jsonb_build_object('action', 'close', 'case_id', tests.id('rl:case:maria-tue2'),
  'expected_revision', pg_temp.revision(tests.id('rl:case:maria-tue2'))));
select ok(not exists(select 1 from jsonb_array_elements(public.get_schedule_requests_closed_service(tests.user('rl:mira'), tests.id('rl'),
  array['cover'], null, '', 1, 100) -> 'rows') r where r ->> 'id' = tests.id('rl:case:maria-tue2')::text),
  'Mira, who manages Besiktas, does not find the Kadikoy release she passed on in Requests -> Closed');
select ok(exists(select 1 from jsonb_array_elements(public.get_schedule_requests_closed_service(tests.user('rl:rachel'), tests.id('rl'),
  array['cover'], null, '', 1, 100) -> 'rows') r where r ->> 'id' = tests.id('rl:case:maria-tue2')::text),
  'Rachel, who manages Kadikoy, does');

-- A manager's preview names the 4-hour mark, not a start (review, low).
select pg_temp.release('maria-wed2');
select pg_temp.command('leo', jsonb_build_object('action', 'apply', 'shift_id', tests.id('rl:shift:maria-wed2'),
  'case_id', tests.id('rl:case:maria-wed2')));
update public.shift_exchange_cases set expires_at = now() - interval '1 minute' where id = tests.id('rl:case:maria-wed2');
select ok(public.shift_exchange_preview(tests.user('rl:rachel'), tests.id('rl'), tests.id('rl:case:maria-wed2'),
  (select id from public.shift_exchange_applications where case_id = tests.id('rl:case:maria-wed2') and employee_id = tests.id('rl:leo')))
  -> 'reasons' ? 'This request closed 4 hours before the shift', 'a request past its mark says it closed 4 hours before the shift');

select * from finish();
rollback;

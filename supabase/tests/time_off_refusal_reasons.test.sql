begin;
-- BL-1043: a time-off write refused with PT409 says which kind of refusal in
-- its hint, the machine key the API passes on as `reason`. "This request
-- changed meanwhile, look again" and a standing "this cannot happen" (a request
-- key reused for other hours, a deadline gone by) shared the one code and no
-- key, so every screen read any 409 as "changed".
create extension if not exists pgtap with schema extensions;
select no_plan();

create function pg_temp.refusal(statement text) returns text language plpgsql as $$
declare state text; key text;
begin
 execute statement;
 return 'no refusal';
exception when others then
 get stacked diagnostics state = returned_sqlstate, key = pg_exception_hint;
 return state || ' ' || coalesce(nullif(key, ''), '(no hint)');
end;
$$;

-- Every PT409 these functions raise carries one of the known keys.
create temp table refusal_functions as
select p.oid, n.nspname || '.' || p.proname fn
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname || '.' || p.proname = any(array[
 'app_private.time_off_finalize', 'app_private.time_off_release_shifts', 'public.decide_time_off_service',
 'public.employee_request_action_service', 'public.request_time_off_cancellation_service', 'public.revoke_time_off_service',
 'public.shorten_time_off_service', 'public.submit_time_off_service']);
create temp table refusal_raises as
select fn, m[1] statement
from refusal_functions, regexp_matches(pg_get_functiondef(oid), $re$(raise\s+exception\s+'(?:[^']|'')*'[^;]*;)$re$, 'gi') m
where m[1] ~* 'PT409';
select is((select count(distinct fn)::int from refusal_functions), 8, 'every listed time-off function exists');
select is((select count(*)::int from refusal_raises), 14, 'the 14 time-off PT409 refusals are found in the function bodies');
select is((select coalesce(array_agg(distinct fn order by fn), '{}') from refusal_raises where statement !~* 'hint'), '{}'::text[],
 'no time-off PT409 is raised without a reason key');
select is((select coalesce(array_agg(distinct key order by key), '{}') from (select (regexp_match(statement, $re$hint\s*=\s*'([^']*)'$re$, 'i'))[1] key from refusal_raises) k
 where key is null or key not in ('time_off.changed', 'time_off.not_decided_in_time', 'time_off.request_reused', 'time_off.timezone_changed')),
 '{}'::text[], 'every key is one the screens know');

-- The refusals themselves, in a test world: Ali asks, Mia decides.
select tests.world('tor');
select tests.person('tor', 'mia', 'manager', array['K'], array['cook']);
select tests.person('tor', 'ali', 'employee', array['K'], array['cook']);
create temp table ask as select gen_random_uuid() key,
 jsonb_build_array(jsonb_build_object('segment_date', tests.week(1) + 2)) periods;
create function pg_temp.submit(periods jsonb, zone text) returns jsonb language sql as $$
 select public.submit_time_off_service(tests.user('tor:ali'), tests.id('tor'), periods, 'Family visit', zone, (select key from ask))
$$;
select tests.remember('tor:ali:time_off', (pg_temp.submit((select periods from ask), 'Europe/Istanbul') ->> 'request_id')::uuid);
select tests.settle();

-- Submit.
select is(pg_temp.refusal($$select pg_temp.submit(jsonb_build_array(jsonb_build_object('segment_date', tests.week(1) + 3)), 'Europe/Istanbul')$$),
 'PT409 time_off.request_reused', 'a request key sent again with other hours is a standing no, not a change');
select is(pg_temp.refusal(format($$select public.submit_time_off_service(%L, %L, %L, '', 'America/New_York', gen_random_uuid())$$,
   tests.user('tor:ali'), tests.id('tor'), jsonb_build_array(jsonb_build_object('segment_date', tests.week(2) + 2)))),
 'PT409 time_off.timezone_changed', 'hours drawn in another zone than the location''s say the zone changed');

-- Decide.
create function pg_temp.decide(rid uuid, fingerprint text) returns jsonb language sql as $$
 select public.decide_time_off_service(tests.user('tor:mia'), tests.id('tor'), rid, 'approve', '', fingerprint)
$$;
create function pg_temp.fingerprint(rid uuid) returns text language sql as $$
 select app_private.time_off_impact(tests.id('tor'), rid) ->> 'fingerprint'
$$;
select is(pg_temp.refusal(format($$select pg_temp.decide(%L, 'an old picture')$$, tests.id('tor:ali:time_off'))),
 'PT409 time_off.changed', 'a decision on an old picture of the shifts says the request changed');
select is(pg_temp.refusal(format($$select public.employee_request_action_service(%L, %L, %L, 'time_off', 'cancel', 99)$$,
   tests.user('tor:ali'), tests.id('tor'), tests.id('tor:ali:time_off'))),
 'PT409 time_off.changed', 'withdrawing an old revision of the request says it changed');
savepoint late;
update public.schedule_time_off_requests set decide_by = now() - interval '1 minute' where id = tests.id('tor:ali:time_off');
select is(pg_temp.refusal(format($$select pg_temp.decide(%L, %L)$$, tests.id('tor:ali:time_off'), pg_temp.fingerprint(tests.id('tor:ali:time_off')))),
 'PT409 time_off.not_decided_in_time', 'a decision after the deadline says it was not decided in time');
rollback to savepoint late;
select pg_temp.decide(tests.id('tor:ali:time_off'), pg_temp.fingerprint(tests.id('tor:ali:time_off')));
select tests.settle();
select is(pg_temp.refusal(format($$select pg_temp.decide(%L, %L)$$, tests.id('tor:ali:time_off'), pg_temp.fingerprint(tests.id('tor:ali:time_off')))),
 'PT409 time_off.changed', 'a decision on a request already closed says it changed');

-- Approved leave: revoke, shorten, ask to cancel, on an old revision.
create temp table leave as
select r.revision - 1 old_revision, r.revision, jsonb_build_array(jsonb_build_object('segment_id', s.id,
  'starts_at', to_jsonb((tests.week(1) + 2 + time '10:00') at time zone s.time_timezone),
  'ends_at', to_jsonb((tests.week(1) + 2 + time '14:00') at time zone s.time_timezone))) periods
from public.schedule_time_off_requests r join public.schedule_time_off_segments s on s.request_id = r.id
where r.id = tests.id('tor:ali:time_off');
select is(pg_temp.refusal(format($$select public.revoke_time_off_service(%L, %L, %L, %s, 'Short staffed')$$,
   tests.user('tor:mia'), tests.id('tor'), tests.id('tor:ali:time_off'), (select old_revision from leave))),
 'PT409 time_off.changed', 'revoking an old revision says the time off changed');
select is(pg_temp.refusal(format($$select public.shorten_time_off_service(%L, %L, %L, %s, %L, '', gen_random_uuid())$$,
   tests.user('tor:mia'), tests.id('tor'), tests.id('tor:ali:time_off'), (select old_revision from leave), (select periods from leave))),
 'PT409 time_off.changed', 'shortening an old revision says the time off changed');
select is(pg_temp.refusal(format($$select public.request_time_off_cancellation_service(%L, %L, %L, %s, %L, '', gen_random_uuid())$$,
   tests.user('tor:ali'), tests.id('tor'), tests.id('tor:ali:time_off'), (select old_revision from leave), (select periods from leave))),
 'PT409 time_off.changed', 'asking to cancel an old revision says the time off changed');
create temp table cancel as select gen_random_uuid() key;
select public.request_time_off_cancellation_service(tests.user('tor:ali'), tests.id('tor'), tests.id('tor:ali:time_off'),
 (select revision from leave), (select periods from leave), 'Plans changed', (select key from cancel));
select is(pg_temp.refusal(format($$select public.request_time_off_cancellation_service(%L, %L, %L, %s, %L, 'Other plans', %L)$$,
   tests.user('tor:ali'), tests.id('tor'), tests.id('tor:ali:time_off'), (select revision from leave), (select periods from leave), (select key from cancel))),
 'PT409 time_off.request_reused', 'a cancellation key sent again with another note is a standing no');

select * from finish();
rollback;

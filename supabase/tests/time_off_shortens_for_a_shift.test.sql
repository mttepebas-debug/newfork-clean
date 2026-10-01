begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

-- BL-182 + BL-127 (KARARLAR "Takas ... uygunluk", KK-19): approved time off
-- is a hard stop for a manager's own scheduling, but its hours can be given
-- back in one way only: a system-written, already approved cancellation piece.
-- * An employee may take a shift inside their own approved time off through
--   Shift Hub after agreeing to shorten it; the leave shortens when the
--   manager approves the transfer, not before (a rejected application burns
--   nothing). Whoever approved the leave hears about it.
-- * A manager who could decide the leave may shorten it (shorten_time_off_service);
--   the employee and whoever approved the leave hear about it.
-- * Cover searches still never show someone on approved leave, and leave the
--   employee never agreed to still blocks.

select tests.world('sto');
select tests.person('sto', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('sto', 'mert', 'manager', array['K'], array['cook']);
select tests.person('sto', 'can', 'manager', array['B'], array['cook']);
select tests.person('sto', 'ali', 'employee', array['K'], array['cook']);
select tests.person('sto', 'emre', 'employee', array['K'], array['cook']);
select tests.publish_week('sto', 1, '[
  {"label": "emre-wed", "person": "emre", "loc": "K", "job": "cook", "day": 2, "start": "10:00", "end": "14:00"},
  {"label": "emre-wed-late", "person": "emre", "loc": "K", "job": "cook", "day": 2, "start": "16:00", "end": "18:00"}
]');
-- Every test world draft is left open (builder trap 4); nothing here counts drafts.

-- Ali takes Wednesday of week 1 off; Mert approves it.
select tests.leave('sto', 'ali', 1);
select public.decide_time_off_service(tests.user('sto:mert'), tests.id('sto'), tests.id('sto:ali:time_off'), 'approve', '',
  app_private.time_off_impact(tests.id('sto'), tests.id('sto:ali:time_off')) ->> 'fingerprint');
select tests.settle();

create function pg_temp.leave(request uuid) returns tstzmultirange language sql as $$
  select coalesce(range_agg(p.span), '{}') from public.schedule_time_off_segments s
  cross join lateral unnest(public.time_off_effective_ranges(s.id)) p(span) where s.request_id = $1
$$;
create function pg_temp.span(label text) returns tstzrange language sql as $$
  select tstzrange((x ->> 'starts_at')::timestamptz, (x ->> 'ends_at')::timestamptz, '[)')
  from (select public.shift_exchange_shift(tests.id('sto'), tests.id('sto:shift:' || label)) x) q
$$;
create function pg_temp.opportunity(label text) returns jsonb language sql as $$
  select o -> 'eligibility' from jsonb_array_elements(public.shift_exchanges_read_service(tests.user('sto:ali'), tests.id('sto'), false,
    tests.week(1), tests.week(1) + 6) -> 'opportunities') o
  where o -> 'shift' ->> 'id' = tests.id('sto:shift:' || label)::text
$$;
create function pg_temp.command(person text, command jsonb) returns jsonb language sql as $$
  select public.shift_exchanges_command_service(tests.user('sto:' || person), tests.id('sto'), command, gen_random_uuid())
$$;
create function pg_temp.outbox(request uuid, type_key text) returns setof public.notification_outbox language sql as $$
  select * from public.notification_outbox o
  where o.workspace_id = tests.id('sto') and o.type_key = $2
    and (o.subject_id = $1::text or o.payload ->> 'request_id' = $1::text)
$$;
create function pg_temp.recipients(request uuid) returns uuid[] language sql as $$
  select array(select distinct r::uuid from pg_temp.outbox($1, 'requests.time_off.shortened') o
    cross join lateral jsonb_array_elements_text(o.payload -> 'recipient_user_ids') r order by 1)
$$;

-- The core's "no": its code and its authz.* reason (hint).
create function pg_temp.refusal(statement text) returns text language plpgsql as $$
declare code text; reason text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics code = returned_sqlstate, reason = pg_exception_hint;
  return concat_ws(' ', code, nullif(reason, ''));
end;
$$;

select ok(pg_temp.leave(tests.id('sto:ali:time_off')) @> pg_temp.span('emre-wed'), 'Ali''s approved Wednesday covers Emre''s shift');

-- 1. Emre looks for cover: Ali is on approved leave and is not offered.
select ok(not exists (select 1 from jsonb_array_elements(public.shift_exchanges_candidates_service(tests.user('sto:emre'), tests.id('sto'),
    tests.id('sto:shift:emre-wed')) -> 'employees') e where e ->> 'id' = tests.id('sto:ali')::text),
  'a cover search never lists someone on approved leave');
select ok(public.weekly_exchange_candidate_check(tests.id('sto'), tests.id('sto:ali'),
    public.shift_exchange_shift(tests.id('sto'), tests.id('sto:shift:emre-wed'))) ->> 'status' = 'ineligible',
  'without Ali''s own agreement his leave still blocks the shift');
select tests.remember('sto:case', (pg_temp.command('emre', jsonb_build_object('action', 'create', 'kind', 'cover',
  'shift_id', tests.id('sto:shift:emre-wed'))) ->> 'case_id')::uuid);
select tests.settle();

-- 2. Ali sees the open shift, with the question that his time off shortens.
select is(pg_temp.opportunity('emre-wed') ->> 'status', 'eligible', 'Ali may take the shift inside his own leave');
select is(pg_temp.opportunity('emre-wed') ->> 'shortens_time_off', 'true', 'and is told it shortens his time off');
select ok(jsonb_array_length(pg_temp.opportunity('emre-wed') -> 'availability_warning' -> 'time_off_intervals') > 0,
  'the question names the hours of time off it gives back');
select throws_ok($$select pg_temp.command('ali', jsonb_build_object('action', 'apply', 'shift_id', tests.id('sto:shift:emre-wed'),
  'case_id', tests.id('sto:case')))$$, 'PT409', null, 'applying without agreeing is refused');
select tests.settle();

-- 3. Ali agrees and applies; nothing shortens yet.
select pg_temp.command('ali', jsonb_build_object('action', 'apply', 'shift_id', tests.id('sto:shift:emre-wed'), 'case_id', tests.id('sto:case'),
  'availability_fingerprint', pg_temp.opportunity('emre-wed') -> 'availability_warning' ->> 'fingerprint'));
select tests.settle();
select tests.remember('sto:application', (select a.id from public.shift_exchange_applications a
  where a.case_id = tests.id('sto:case') and a.employee_id = tests.id('sto:ali') and a.status = 'pending_manager'));
select isnt(tests.id('sto:application'), null, 'Ali''s application waits for a manager');
select ok(pg_temp.leave(tests.id('sto:ali:time_off')) @> pg_temp.span('emre-wed'), 'applying alone does not shorten the leave');

-- 4. Ayse rejects it: the leave is untouched.
select pg_temp.command('ayse', jsonb_build_object('action', 'reject', 'case_id', tests.id('sto:case'), 'application_id', tests.id('sto:application'),
  'expected_revision', (select c.revision from public.shift_exchange_cases c where c.id = tests.id('sto:case')), 'reason', 'Staying off'));
select tests.settle();
select ok(pg_temp.leave(tests.id('sto:ali:time_off')) @> pg_temp.span('emre-wed'), 'a rejected application burns no time off');
select is((select count(*)::integer from public.time_off_cancellation_links l where l.parent_request_id = tests.id('sto:ali:time_off')), 0,
  'and writes no cancellation');

-- 5. Ali applies again; Ayse approves; the leave shortens at that moment.
select pg_temp.command('ali', jsonb_build_object('action', 'apply', 'shift_id', tests.id('sto:shift:emre-wed'), 'case_id', tests.id('sto:case'),
  'availability_fingerprint', pg_temp.opportunity('emre-wed') -> 'availability_warning' ->> 'fingerprint'));
select tests.settle();
select tests.remember('sto:application', (select a.id from public.shift_exchange_applications a
  where a.case_id = tests.id('sto:case') and a.employee_id = tests.id('sto:ali') and a.status = 'pending_manager'));
select is(public.shift_exchange_preview(tests.user('sto:ayse'), tests.id('sto'), tests.id('sto:case'), tests.id('sto:application')) ->> 'allowed',
  'true', 'the manager may approve it');
select is(public.shift_exchange_preview(tests.user('sto:ayse'), tests.id('sto'), tests.id('sto:case'), tests.id('sto:application'))
  -> 'receiver' ->> 'shortens_time_off', 'true', 'and is told it shortens Ali''s time off');
select is(pg_temp.command('ayse', jsonb_build_object('action', 'approve', 'case_id', tests.id('sto:case'), 'application_id', tests.id('sto:application'),
  'expected_revision', (select c.revision from public.shift_exchange_cases c where c.id = tests.id('sto:case')),
  'fingerprint', public.shift_exchange_preview(tests.user('sto:ayse'), tests.id('sto'), tests.id('sto:case'), tests.id('sto:application')) ->> 'fingerprint'))
  ->> 'status', 'completed', 'the approval goes through');
select tests.settle();
select is((select employee_id from public.schedule_published_shifts where id = tests.id('sto:shift:emre-wed')), tests.id('sto:ali'),
  'Ali works the shift');
select ok(not (pg_temp.leave(tests.id('sto:ali:time_off')) && pg_temp.span('emre-wed')), 'his time off no longer covers those hours');
select ok(pg_temp.leave(tests.id('sto:ali:time_off')) @> pg_temp.span('emre-wed-late'), 'the rest of his day off stays');
select is((select status::text from public.schedule_time_off_requests where id = tests.id('sto:ali:time_off')), 'approved',
  'the leave stays approved; the hours given back read off it (FB-6.3)');
select ok(public.weekly_exchange_candidate_check(tests.id('sto'), tests.id('sto:ali'),
    public.shift_exchange_shift(tests.id('sto'), tests.id('sto:shift:emre-wed-late'))) ->> 'status' = 'ineligible',
  'and still blocks the later shift he did not agree to');

-- 6. Mert, who approved the leave, hears; nobody is asked to review anything.
select is(pg_temp.recipients(tests.id('sto:ali:time_off')), array[tests.user('sto:mert')], 'the shortening tells Mert, who approved the leave');
select is((select count(*)::integer from public.notification_outbox o join public.time_off_cancellation_links l
    on o.payload ->> 'request_id' = l.request_id::text
  where l.parent_request_id = tests.id('sto:ali:time_off') and o.type_key like 'requests.time_off.%'), 0,
  'the system cancellation asks nobody for review and sends no status notice');
select is((select count(*)::integer from jsonb_array_elements(public.reconcile_notification_platform_service() -> 'deterministic_domain_events_without_outbox') m
   where m ->> 'workspace_id' = tests.id('sto')::text), 0, 'the notification check counts nothing missing');

-- 7. The manager's way (BL-127): whoever could decide the leave shortens it.
select tests.leave('sto', 'ali', 2);
select tests.remember('sto:ali:time_off:2', (select s.request_id from public.schedule_time_off_segments s
  where s.workspace_id = tests.id('sto') and s.segment_date = tests.week(2) + 2 and s.request_id in
   (select r.id from public.schedule_time_off_requests r where r.employee_id = tests.id('sto:ali') and r.request_type = 'time_off')));
select public.decide_time_off_service(tests.user('sto:mert'), tests.id('sto'), tests.id('sto:ali:time_off:2'), 'approve', '',
  app_private.time_off_impact(tests.id('sto'), tests.id('sto:ali:time_off:2')) ->> 'fingerprint');
select tests.settle();
create temp table cut as select jsonb_build_array(jsonb_build_object('segment_id', s.id,
  'starts_at', to_jsonb((tests.week(2) + 2 + time '10:00') at time zone s.time_timezone),
  'ends_at', to_jsonb((tests.week(2) + 2 + time '14:00') at time zone s.time_timezone))) periods,
  tstzrange((tests.week(2) + 2 + time '10:00') at time zone s.time_timezone, (tests.week(2) + 2 + time '14:00') at time zone s.time_timezone, '[)') span,
  gen_random_uuid() key, r.revision rev
  from public.schedule_time_off_segments s join public.schedule_time_off_requests r on r.id = s.request_id
  where s.request_id = tests.id('sto:ali:time_off:2');
create function pg_temp.shorten(person text, periods jsonb, key uuid default gen_random_uuid()) returns jsonb language sql as $$
  select public.shorten_time_off_service(tests.user('sto:' || person), tests.id('sto'), tests.id('sto:ali:time_off:2'),
    (select rev from cut), periods, 'Covering a sick call', key)
$$;
select is(pg_temp.refusal($$select pg_temp.shorten('ali', (select periods from cut))$$), '42501 authz.missing_permission', 'Ali cannot shorten his own leave this way');
select is(pg_temp.refusal($$select pg_temp.shorten('emre', (select periods from cut))$$), '42501 authz.missing_permission', 'another employee cannot');
select is(pg_temp.refusal($$select pg_temp.shorten('can', (select periods from cut))$$), '42501 authz.out_of_scope', 'a manager who does not manage Ali cannot');
-- Ayse's own approved leave (the owner approved it): she cannot shorten it herself.
select tests.leave('sto', 'ayse', 3);
select tests.remember('sto:ayse:time_off:3', (select s.request_id from public.schedule_time_off_segments s
  join public.schedule_time_off_requests r on r.id = s.request_id
  where r.employee_id = tests.id('sto:ayse') and r.request_type = 'time_off' and s.segment_date = tests.week(3) + 2));
select public.decide_time_off_service(tests.user('sto:owner'), tests.id('sto'), tests.id('sto:ayse:time_off:3'), 'approve', '',
  app_private.time_off_impact(tests.id('sto'), tests.id('sto:ayse:time_off:3')) ->> 'fingerprint');
select tests.settle();
select is(pg_temp.refusal(format($$select public.shorten_time_off_service(%L, %L, %L, %s, %L, '', gen_random_uuid())$$,
    tests.user('sto:ayse'), tests.id('sto'), tests.id('sto:ayse:time_off:3'),
    (select r.revision from public.schedule_time_off_requests r where r.id = tests.id('sto:ayse:time_off:3')),
    (select jsonb_build_array(jsonb_build_object('segment_id', s.id,
      'starts_at', to_jsonb((tests.week(3) + 2 + time '10:00') at time zone s.time_timezone),
      'ends_at', to_jsonb((tests.week(3) + 2 + time '14:00') at time zone s.time_timezone)))
     from public.schedule_time_off_segments s where s.request_id = tests.id('sto:ayse:time_off:3')))),
  '42501 authz.rank', 'a manager cannot shorten her own approved time off');
select throws_ok($$select pg_temp.shorten('ayse', jsonb_build_array((select periods from cut) -> 0 || jsonb_build_object('ends_at',
    to_jsonb(upper((select span from cut)) + interval '1 day'))))$$, '22023', null, 'only approved hours can be given back');
select ok(pg_temp.leave(tests.id('sto:ali:time_off:2')) @> (select span from cut), 'refused attempts change nothing');
select pg_temp.shorten('ayse', (select periods from cut), (select key from cut));
select tests.settle();
select ok(not (pg_temp.leave(tests.id('sto:ali:time_off:2')) && (select span from cut)), 'Ayse gives back 10:00-14:00 of Ali''s leave');
select is(pg_temp.shorten('ayse', (select periods from cut), (select key from cut)) ->> 'request_id', tests.id('sto:ali:time_off:2')::text,
  'a retry of the same command answers the same');
select is(pg_temp.recipients(tests.id('sto:ali:time_off:2')), array(select x from unnest(array[tests.user('sto:ali'), tests.user('sto:mert')]) x order by 1),
  'Ali and Mert, who approved the leave, hear about it; Ayse does not');
-- Ali's notice reaches his notification list.
update public.notification_outbox set status = 'leased', lease_owner = 'g9b-test', lease_expires_at = now() + interval '1 minute'
where id in (select o.id from pg_temp.outbox(tests.id('sto:ali:time_off:2'), 'requests.time_off.shortened') o);
select public.process_notification_outbox_service('g9b-test', o.id)
from pg_temp.outbox(tests.id('sto:ali:time_off:2'), 'requests.time_off.shortened') o;
select is((select count(*)::integer from public.notifications n where n.workspace_id = tests.id('sto')
    and n.recipient_user_id = tests.user('sto:ali') and n.title = 'Your time off was shortened'),
  1, 'Ali finds "Your time off was shortened" in his notifications');

select * from finish();
rollback;

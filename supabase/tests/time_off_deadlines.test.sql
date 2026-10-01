begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- FB-6.3 (user decisions 2026-09-30, KARARLAR "İzin", "Süre"): a request must
-- be decided by its start minus the workspace's lead time (24 hours unless an
-- owner or admin changes it on Settings > Scheduling; a change only touches
-- new requests). Twelve hours before that, the managers of the locations that
-- have not approved yet are reminded once. If nobody decides in time the
-- system turns it down; a cancellation not decided in time is turned down and
-- the time off stands. Every five minutes a job does this, makes votes on
-- changed shifts count as not given, and tells an admin or the owner once
-- when only they can decide.
-- ponytail: one transaction has one now(); deadlines are moved by hand.

select tests.world('td');
select tests.person('td', 'zeynep', 'admin', array['K'], array['cook']);
select tests.person('td', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('td', 'mehmet', 'manager', array['B'], array['cook']);
select tests.person('td', 'ali', 'employee', array['K', 'B'], array['cook']);
select tests.person('td', 'emre', 'employee', array['K'], array['cook']);

create function pg_temp.refusal(q text) returns text language plpgsql as $$
declare h text;
begin
  execute q;
  return 'allowed';
exception when others then
  get stacked diagnostics h = pg_exception_hint;
  return sqlstate || coalesce(' ' || nullif(h, ''), '');
end $$;
create function pg_temp.decide(who text, rid uuid, verdict text) returns jsonb language sql as $$
  select public.decide_time_off_service(tests.user('td:' || who), tests.id('td'), rid, verdict, '',
    app_private.time_off_impact(tests.id('td'), rid) ->> 'fingerprint')
$$;
create function pg_temp.status(rid uuid) returns text language sql as $$
  select r.status::text from public.schedule_time_off_requests r where r.id = rid
$$;
create function pg_temp.due(rid uuid, at timestamptz, sent timestamptz default null) returns void language sql as $$
  update public.schedule_time_off_requests set decide_by = at, created_at = coalesce(sent, created_at) where id = rid
$$;
create function pg_temp.told(rid uuid, type_key text) returns uuid[] language sql as $$
  select coalesce(array_agg(r.u order by r.u), '{}')
  from public.notification_outbox o
  cross join lateral (select jsonb_array_elements_text(o.payload -> 'recipient_user_ids')::uuid u) r
  where o.workspace_id = tests.id('td') and o.type_key = $2
    and (o.subject_id = $1::text or o.payload ->> 'request_id' = $1::text)
$$;
create function pg_temp.users(variadic who text[]) returns uuid[] language sql as $$
  select array(select tests.user('td:' || x) from unnest(who) x order by 1)
$$;

-- 1. The lead time ---------------------------------------------------------------

select tests.remember('td:emre:1', tests.leave('td', 'emre', 1));
select is((select s.time_off_lead_hours from public.workspace_scheduling_settings s where s.workspace_id = tests.id('td')), 24,
  'a workspace starts with 24 hours');
select public.update_scheduling_settings_service(tests.user('td:zeynep'), tests.id('td'), '{"time_off_lead_hours": 48}');
select tests.remember('td:emre:2', tests.leave('td', 'emre', 2));
select is(
  (select r.decide_by from public.schedule_time_off_requests r where r.id = tests.id('td:emre:2')),
  ((tests.week(2) + 2)::timestamp at time zone 'Europe/Istanbul') - interval '48 hours',
  'an admin sets 48 hours: a new request must be decided 48 hours before it starts');
select is(
  (select r.decide_by from public.schedule_time_off_requests r where r.id = tests.id('td:emre:1')),
  ((tests.week(1) + 2)::timestamp at time zone 'Europe/Istanbul') - interval '24 hours',
  'a request already sent keeps its deadline');
select public.update_scheduling_settings_service(tests.user('td:owner'), tests.id('td'), '{"time_off_lead_hours": 0}');
select tests.remember('td:emre:3', tests.leave('td', 'emre', 3));
select is(
  (select r.decide_by from public.schedule_time_off_requests r where r.id = tests.id('td:emre:3')),
  (tests.week(3) + 2)::timestamp at time zone 'Europe/Istanbul',
  'with no lead time it may be decided until it starts');
select is(pg_temp.refusal(format($$select public.update_scheduling_settings_service(%L, %L, '{"time_off_lead_hours": 721}')$$,
    tests.user('td:owner'), tests.id('td'))),
  '22023', 'at most 720 hours');
select is(pg_temp.refusal(format($$select public.update_scheduling_settings_service(%L, %L, '{"time_off_lead_hours": 12}')$$,
    tests.user('td:ayse'), tests.id('td'))),
  '42501 authz.out_of_scope', 'a manager does not set it');
select public.update_scheduling_settings_service(tests.user('td:owner'), tests.id('td'), '{"time_off_lead_hours": 24}');

-- 2. Not decided in time -----------------------------------------------------

select pg_temp.due(tests.id('td:emre:1'), now() - interval '1 minute');
select is(pg_temp.refusal(format($$select pg_temp.decide('ayse', %L, 'approve')$$, tests.id('td:emre:1'))),
  '40001', 'after the deadline nobody can decide it, even before the job has run');
select is(pg_temp.status(tests.id('td:emre:1')), 'pending', 'it is still open until the job runs');
select app_private.time_off_sweep();
select is(pg_temp.status(tests.id('td:emre:1')), 'denied', 'the job turns it down');
select is(
  (select jsonb_build_object('actor', e.actor_user_id, 'note', e.note) from public.schedule_time_off_events e
   where e.request_id = tests.id('td:emre:1') and e.action = 'expired'),
  jsonb_build_object('actor', null, 'note', 'Not decided in time'), 'as the system, saying it was not decided in time');
select is(pg_temp.told(tests.id('td:emre:1'), 'requests.time_off.status_changed'), pg_temp.users('emre'),
  'Emre hears it');
select is(pg_temp.told(tests.id('td:emre:1'), 'requests.time_off.decided'), pg_temp.users('ayse'),
  'and so do the managers who did not decide');

-- A cancellation not decided in time is turned down; the time off stands.
select tests.remember('td:ali:4', tests.leave('td', 'ali', 4));
select pg_temp.decide('zeynep', tests.id('td:ali:4'), 'approve');
select tests.remember('td:ali:4:cancel', (public.request_time_off_cancellation_service(tests.user('td:ali'), tests.id('td'),
  tests.id('td:ali:4'), (select r.revision from public.schedule_time_off_requests r where r.id = tests.id('td:ali:4')),
  (select jsonb_agg(jsonb_build_object('segment_id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at))
   from public.schedule_time_off_segments s where s.request_id = tests.id('td:ali:4')),
  'Plans changed', gen_random_uuid()) ->> 'request_id')::uuid);
select pg_temp.due(tests.id('td:ali:4:cancel'), now() - interval '1 minute');
select app_private.time_off_sweep();
select is(pg_temp.status(tests.id('td:ali:4:cancel')), 'denied', 'a cancellation not decided in time is turned down');
select is(pg_temp.status(tests.id('td:ali:4')), 'approved', 'and the time off stands');

-- 3. One reminder, twelve hours before ---------------------------------------

select tests.remember('td:emre:5', tests.leave('td', 'emre', 5));
select pg_temp.due(tests.id('td:emre:5'), now() + interval '6 hours', now() - interval '2 days');
select app_private.time_off_sweep();
select app_private.time_off_sweep();
select is(pg_temp.told(tests.id('td:emre:5'), 'requests.time_off.reminder'), pg_temp.users('ayse'),
  'twelve hours before the deadline the managers are reminded, once');

select tests.remember('td:ali:6', tests.leave('td', 'ali', 6));
select pg_temp.decide('ayse', tests.id('td:ali:6'), 'approve');
select pg_temp.due(tests.id('td:ali:6'), now() + interval '6 hours', now() - interval '2 days');
select app_private.time_off_sweep();
select is(pg_temp.told(tests.id('td:ali:6'), 'requests.time_off.reminder'), pg_temp.users('mehmet'),
  'only where nobody has approved yet');

select tests.remember('td:emre:7', tests.leave('td', 'emre', 7));
select pg_temp.due(tests.id('td:emre:7'), now() + interval '6 hours');
select app_private.time_off_sweep();
select is(pg_temp.told(tests.id('td:emre:7'), 'requests.time_off.reminder'), '{}'::uuid[],
  'a request sent inside those twelve hours gets no reminder');

-- 4. A vote on shifts that changed is let go, and its manager told once --------

select tests.publish_week('td', 8, '[
  {"label": "ali-k", "person": "ali", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "13:00"}
]');
select tests.remember('td:ali:8', tests.leave('td', 'ali', 8));
select pg_temp.decide('ayse', tests.id('td:ali:8'), 'approve');
select tests.publish_week('td', 8, '[
  {"label": "ali-k", "person": "ali", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "13:00"},
  {"label": "ali-k2", "person": "ali", "loc": "K", "job": "cook", "day": 2, "start": "15:00", "end": "19:00"}
]');
select app_private.time_off_sweep();
select app_private.time_off_sweep();
select is((select count(*)::integer from public.time_off_votes v where v.request_id = tests.id('td:ali:8')), 0,
  'the job lets the vote go');
select is(pg_temp.told(tests.id('td:ali:8'), 'requests.time_off.review_again'), pg_temp.users('ayse'),
  'and asks Ayse, once, to look again');

-- 5. When only an admin or the owner can decide -------------------------------

select tests.remember('td:emre:9', tests.leave('td', 'emre', 9));
select tests.stops_working_at((select m.id from public.workspace_memberships m
  where m.workspace_id = tests.id('td') and m.user_id = tests.user('td:ayse')), tests.id('td:K'));
select app_private.time_off_sweep();
select app_private.time_off_sweep();
select is(
  (select count(*)::integer from public.notification_outbox o
   where o.workspace_id = tests.id('td') and o.payload ->> 'request_id' = tests.id('td:emre:9')::text
     and o.payload ->> 'audience_contract' = 'time_off_fallback_deciders'),
  1, 'Kadikoy lost its manager: the admins and the owner are told once');
select is(
  (select array(select jsonb_array_elements_text(o.payload -> 'recipient_user_ids')::uuid order by 1)
   from public.notification_outbox o
   where o.workspace_id = tests.id('td') and o.payload ->> 'request_id' = tests.id('td:emre:9')::text
     and o.payload ->> 'audience_contract' = 'time_off_fallback_deciders'),
  pg_temp.users('owner', 'zeynep'), 'it goes to them');

-- 6. The job ---------------------------------------------------------------------

select is(
  (select jsonb_build_object('schedule', j.schedule, 'command', j.command) from cron.job j where j.jobname = 'time-off-deadlines'),
  '{"schedule": "*/5 * * * *", "command": "select app_private.time_off_sweep()"}'::jsonb,
  'the job runs every five minutes');

select * from finish();
rollback;

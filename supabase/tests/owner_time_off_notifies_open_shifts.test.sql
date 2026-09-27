begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- BL-183: the owner's time off is recorded without review, so nobody is asked
-- to review it. The managers of each location where it left a shift open hear
-- which shifts are open, once; admins, other locations' managers and the owner
-- do not. An employee's request still asks the reviewers as before.

select tests.world('ot');
select tests.person('ot', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('ot', 'mert', 'manager', array['K'], array['cook']);
select tests.person('ot', 'can', 'manager', array['B'], array['cook']);
select tests.person('ot', 'zeynep', 'admin', array['K'], array['cook']);
select tests.person('ot', 'ali', 'employee', array['K'], array['cook']);
-- Olcay (the owner) works Wednesday at Kadikoy and Thursday at Besiktas.
select tests.publish_week('ot', 1, '[
  {"label": "olcay-k", "person": "owner", "loc": "K", "job": "cook", "day": 2, "start": "10:00", "end": "16:00"},
  {"label": "olcay-b", "person": "owner", "loc": "B", "job": "cook", "day": 3, "start": "10:00", "end": "16:00"}
]');

create function pg_temp.outbox(request uuid, type_key text) returns setof public.notification_outbox language sql as $$
  select * from public.notification_outbox o
  where o.workspace_id = tests.id('ot') and o.type_key = $2
    and (o.subject_id = $1::text or o.payload ->> 'request_id' = $1::text)
$$;

-- 1. Olcay takes Wednesday off (tests.time_off asks for the Wednesday of the week).
select tests.time_off('ot', 'owner', 1);
select is((select count(*)::integer from pg_temp.outbox(tests.id('ot:owner:time_off'), 'requests.time_off.submitted')), 0,
  'nobody is asked to review the owner''s time off');
select is((select employee_id from public.schedule_published_shifts where id = tests.id('ot:shift:olcay-k')), null::uuid,
  'the Wednesday Kadikoy shift is left open');
select is((select count(*)::integer from pg_temp.outbox(tests.id('ot:owner:time_off'), 'schedule.owner_time_off.shifts_opened')), 1,
  'one notice says which shifts are open');
select is(
  (select array(select jsonb_array_elements_text(o.payload -> 'recipient_user_ids')::uuid order by 1)
   from pg_temp.outbox(tests.id('ot:owner:time_off'), 'schedule.owner_time_off.shifts_opened') o),
  array(select x from unnest(array[tests.user('ot:ayse'), tests.user('ot:mert')]) x order by 1),
  'it goes to both Kadikoy managers only: not the Besiktas manager, an admin or the owner');
select ok(
  (select o.payload ->> 'body' ~ (to_char(tests.week(1) + 2, 'Dy Mon FMDD') || '.*10:00.*Kadikoy')
   from pg_temp.outbox(tests.id('ot:owner:time_off'), 'schedule.owner_time_off.shifts_opened') o),
  'the notice names the shift: day, hours and location');
select is(
  (select o.payload ->> 'action_url' from pg_temp.outbox(tests.id('ot:owner:time_off'), 'schedule.owner_time_off.shifts_opened') o),
  '/app/schedule?date=' || (tests.week(1) + 2)::text, 'and opens that week''s Schedule');

-- The notice reaches Ayse's notification list.
update public.notification_outbox set status = 'leased', lease_owner = 'bl183-test', lease_expires_at = now() + interval '1 minute'
where id = (select o.id from pg_temp.outbox(tests.id('ot:owner:time_off'), 'schedule.owner_time_off.shifts_opened') o);
select public.process_notification_outbox_service('bl183-test', o.id)
from pg_temp.outbox(tests.id('ot:owner:time_off'), 'schedule.owner_time_off.shifts_opened') o;
select is(
  (select count(*)::integer from public.notifications n where n.workspace_id = tests.id('ot')
    and n.recipient_user_id = tests.user('ot:ayse') and n.title like 'Olcay is off%'),
  1, 'Ayse finds it in her notifications');

-- 2. Time off that leaves no shift open tells nobody anything.
select tests.time_off('ot', 'owner', 2);
-- ponytail: one transaction has one now(), so tests.time_off may remember the
-- first request; the week-2 one is found by its day.
select tests.remember('ot:owner:time_off:2', (select s.request_id from public.schedule_time_off_segments s
  where s.workspace_id = tests.id('ot') and s.segment_date = tests.week(2) + 2));
select is(
  (select count(*)::integer from public.notification_outbox o where o.workspace_id = tests.id('ot')
    and (o.subject_id = tests.id('ot:owner:time_off:2')::text or o.payload ->> 'request_id' = tests.id('ot:owner:time_off:2')::text)
    and o.type_key in ('requests.time_off.submitted', 'schedule.owner_time_off.shifts_opened')),
  0, 'the owner''s time off with no shift in it sends nothing');

-- 3. An employee's request still asks the reviewers.
select tests.time_off('ot', 'ali', 1);
select is((select count(*)::integer from pg_temp.outbox(tests.id('ot:ali:time_off'), 'requests.time_off.submitted')), 1,
  'Ali''s time-off request still asks for review');
select is((select count(*)::integer from pg_temp.outbox(tests.id('ot:ali:time_off'), 'schedule.owner_time_off.shifts_opened')), 0,
  'and is no owner notice');

-- 4. The notification health check agrees.
select is(
  (select count(*)::integer from jsonb_array_elements(public.reconcile_notification_platform_service() -> 'deterministic_domain_events_without_outbox') m
   where m ->> 'workspace_id' = tests.id('ot')::text),
  0, 'the notification check does not count the owner''s time off as a missing review notice');
select ok(
  (select not exists (select 1 from jsonb_array_elements((r -> 'active_catalog_without_producer') || (r -> 'active_catalog_without_template')) x
    where x ->> 'type_key' = 'schedule.owner_time_off.shifts_opened')
   from (select public.reconcile_notification_platform_service() r) q),
  'the open-shifts notice has its producer and template registered');

select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- Notification panel, slice 2 (KARARLAR S-247 (3)): a Schedule card closes for every person who got it when its
-- work is over; the row stays, it says how it ended and who ended it; each person's read state is their own,
-- and whoever did the work has read their own card.
--   (a) "Shifts need people" (schedule.shifts_unassigned): once every shift on it still without anyone is on a
--       day that has passed at its location (that location's time zone), the card closes 'expired', by nobody,
--       when app_private.unassigned_cards_settle runs; a shift given or removed runs it for its own cards. A
--       card whose shifts were all given still closes 'closed'; one with a shift still to come stays open.
--   (b) "Scheduled email stopped" (schedule.export_email_stopped): turned back on or sent to other addresses, it
--       closes 'fixed'; deleted, 'removed'; by whoever did it. A rename while it is off leaves it open.

select tests.world('ns');
-- Line Islands (UTC+14) and Pago Pago (UTC-11) are 25 hours apart: Pago Pago's today has always passed in
-- the Line Islands, at any hour the suite runs.
select tests.as_browser(tests.user('ns:owner'), format(
  $sql$insert into public.locations (id, workspace_id, name, short_name, street_address, city, region, postal_code, timezone)
       values (%L, %L, 'Line Islands', 'LIN', '1 Main Rd', 'Kiritimati', 'Line Islands', '96701', 'Pacific/Kiritimati'),
              (%L, %L, 'Pago Pago', 'PPG', '2 Harbor Rd', 'Pago Pago', 'American Samoa', '96799', 'Pacific/Pago_Pago')$sql$,
  tests.remember('ns:E', gen_random_uuid()), tests.id('ns'), tests.remember('ns:W', gen_random_uuid()), tests.id('ns')));
select tests.person('ns', 'ali', 'manager', array['K', 'E', 'W'], array['cook']);
select tests.person('ns', 'ayse', 'manager', array['K', 'E', 'W'], array['cook']);
select tests.person('ns', 'emre', 'employee', array['K', 'E', 'W'], array['cook']);
select tests.person('ns', 'deniz', 'employee', array['K'], array['cook']);

create temp table who as select label, tests.user(label) uid
from unnest(array['ns:owner', 'ns:ali', 'ns:ayse', 'ns:emre', 'ns:deniz']) label;
-- Every row of one card, one line per person: how it ended, by whom and when, and that person's own read
-- and seen. now() is fixed inside the test's transaction: "now" is this transaction, "before" earlier.
create function pg_temp.card_rows(type_key text, subject uuid) returns text[] language sql stable as $$
  select coalesce(array_agg(coalesce(w.label, 'somebody else') || ' ' || coalesce(n.resolution, 'open')
    || case when n.resolved_at is null then '' else ' by ' || coalesce(rb.label, case when n.resolved_by is null
         then 'nobody' else 'somebody else' end) || case when n.resolved_at = now() then ' now' else ' before' end end
    || ' · ' || case when n.read_at is null then 'unread' when n.read_at = now() then 'read now' else 'read before' end
    || ' · ' || case when n.seen_at is null then 'unseen' when n.seen_at = now() then 'seen now' else 'seen before' end
    order by w.label collate "C"), '{}')
  from public.person_notifications n
  left join who w on w.uid = n.user_id
  left join who rb on rb.uid = n.resolved_by
  where n.type_key = card_rows.type_key and n.subject_id = subject and n.workspace_id = tests.id('ns')
$$;
-- ponytail: read an hour ago, as the panel's mark-read writes it (read and seen); now() cannot move.
create function pg_temp.read_before(person text, type_key text, subject uuid) returns void language sql as $$
  update public.person_notifications n set read_at = now() - interval '1 hour', seen_at = now() - interval '1 hour'
  where n.user_id = tests.user('ns:' || person) and n.type_key = read_before.type_key and n.subject_id = subject
$$;

-- (a) Shifts need people ------------------------------------------------------------------------------------

select tests.publish_week('ns', 1, $$[
  {"label": "e_mon", "person": "emre", "loc": "E", "job": "cook", "day": 0, "start": "09:00", "end": "15:00"},
  {"label": "w_tue", "person": "emre", "loc": "W", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"},
  {"label": "k_wed", "person": "emre", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"},
  {"label": "k_thu", "person": "emre", "loc": "K", "job": "cook", "day": 3, "start": "09:00", "end": "15:00"}
]$$::jsonb);
-- Emre leaves all three places: each place's shifts are left without anyone, one card each, to Ali and Ayse.
select public.remove_employee_from_location_service(tests.user('ns:owner'), tests.id('ns'), tests.id('ns:emre'), tests.id('ns:E'));
select public.remove_employee_from_location_service(tests.user('ns:owner'), tests.id('ns'), tests.id('ns:emre'), tests.id('ns:W'));
select public.remove_employee_from_location_service(tests.user('ns:owner'), tests.id('ns'), tests.id('ns:emre'), tests.id('ns:K'));
select tests.settle();
create temp table cards as
select loc, (select distinct n.subject_id from public.person_notifications n
             where n.type_key = 'schedule.shifts_unassigned' and n.workspace_id = tests.id('ns')
               and n.data ->> 'location_id' = tests.id('ns:' || loc)::text) id
from unnest(array['E', 'W', 'K']) loc;
create function pg_temp.card(loc text) returns uuid language sql stable as $$
  select c.id from cards c where c.loc = card.loc
$$;
select is(
  (select array_agg(c.loc || ': ' || array_to_string(pg_temp.card_rows('schedule.shifts_unassigned', c.id), ', ') order by c.loc)
   from cards c),
  array['E: ns:ali open · unread · unseen, ns:ayse open · unread · unseen',
        'K: ns:ali open · unread · unseen, ns:ayse open · unread · unseen',
        'W: ns:ali open · unread · unseen, ns:ayse open · unread · unseen'],
  '(a) Emre gone from three places: one open card per place, to Ali and Ayse');

-- ponytail: the days pass by moving the shifts, since now() cannot move. The Line Islands' Monday and the
-- Pago Pago one both become Pago Pago's today: over at the Line Islands, still today at Pago Pago. Kadikoy's
-- Wednesday is three days ago; its Thursday is still two years out.
update public.schedule_published_shifts set scheduled_date = (now() at time zone 'Pacific/Pago_Pago')::date
where id in (tests.id('ns:shift:e_mon'), tests.id('ns:shift:w_tue'));
update public.schedule_published_shifts set scheduled_date = current_date - 3 where id = tests.id('ns:shift:k_wed');
select pg_temp.read_before('ayse', 'schedule.shifts_unassigned', pg_temp.card('E'));

select is(app_private.unassigned_cards_settle(tests.id('ns')), 2,
  '(a) settled: the Line Islands card closes, for both who got it');
select is(pg_temp.card_rows('schedule.shifts_unassigned', pg_temp.card('E')),
  array['ns:ali expired by nobody now · unread · unseen', 'ns:ayse expired by nobody now · read before · seen before'],
  '(a) its only shift''s day is over at the Line Islands: expired, by nobody; Ali''s stays unread, Ayse''s read stays hers');
select is(pg_temp.card_rows('schedule.shifts_unassigned', pg_temp.card('W')),
  array['ns:ali open · unread · unseen', 'ns:ayse open · unread · unseen'],
  '(a) the same date is today at Pago Pago: still open');
select is(pg_temp.card_rows('schedule.shifts_unassigned', pg_temp.card('K')),
  array['ns:ali open · unread · unseen', 'ns:ayse open · unread · unseen'],
  '(a) Kadikoy''s Thursday is still to come: open, though its Wednesday is over');

-- ponytail: given straight on the published row, as an approved pickup or cover does; the trigger settles
-- the cards that name that shift.
update public.schedule_published_shifts set employee_id = tests.id('ns:deniz') where id = tests.id('ns:shift:k_thu');
select is(pg_temp.card_rows('schedule.shifts_unassigned', pg_temp.card('K')),
  array['ns:ali expired by nobody now · unread · unseen', 'ns:ayse expired by nobody now · unread · unseen'],
  '(a) Thursday given to Deniz, only the Wednesday that is over left without anyone: expired');
update public.schedule_published_shifts set employee_id = tests.id('ns:ali') where id = tests.id('ns:shift:w_tue');
select is(pg_temp.card_rows('schedule.shifts_unassigned', pg_temp.card('W')),
  array['ns:ali closed by nobody now · unread · unseen', 'ns:ayse closed by nobody now · unread · unseen'],
  '(a) Pago Pago''s shift given to Ali: closed, as before');
select is(app_private.unassigned_cards_settle(tests.id('ns')), 0, '(a) settled again: nothing left to close');

-- (b) Scheduled email stopped -------------------------------------------------------------------------------

select public.create_schedule_export_preset_service(tests.user('ns:owner'), tests.id('ns'), 'Weekly', '{}'::jsonb);
-- ponytail: stored as it is; there is no builder helper for scheduled exports.
create function pg_temp.rule(person text, rule_name text) returns uuid language sql as $$
  insert into public.scheduled_schedule_exports
    (workspace_id, preset_id, name, recipients, location_ids, day_of_week, send_hour, created_by, updated_by)
  values (tests.id('ns'), (select p.id from public.schedule_export_presets p where p.workspace_id = tests.id('ns')),
    rule_name, '["books@example.test"]'::jsonb, array[tests.id('ns:K')], 1, 9,
    tests.user('ns:' || person), tests.user('ns:' || person))
  returning id
$$;
-- ponytail: now() is fixed inside the transaction; a week passes by moving the last failure back.
create function pg_temp.fail_a_week(rule uuid) returns void language sql as $$
  update public.scheduled_schedule_exports set last_failed_at = last_failed_at - interval '7 days' where id = rule;
  select public.record_schedule_export_schedule_failure_service(tests.id('ns'), rule, 'Not delivered');
$$;
-- Ayse's, for Kadikoy's kitchen: she may export there, so she alone is told. Deniz's two: Deniz may not
-- export, so whoever may at Kadikoy is told (the owner, Ali and Ayse).
create temp table rules as
select 'on' what, pg_temp.rule('ayse', 'Kitchen week') id
union all select 'to', pg_temp.rule('deniz', 'Deniz kitchen week')
union all select 'del', pg_temp.rule('deniz', 'Deniz old week');
create function pg_temp.rule_id(what text) returns uuid language sql stable as $$
  select r.id from rules r where r.what = rule_id.what
$$;
select pg_temp.fail_a_week(id) from rules;
select pg_temp.fail_a_week(id) from rules;
select pg_temp.fail_a_week(id) from rules;
select is(
  (select array_agg(r.what || ': ' || array_to_string(pg_temp.card_rows('schedule.export_email_stopped', r.id), ', ') order by r.what)
   from rules r),
  array['del: ns:ali open · unread · unseen, ns:ayse open · unread · unseen, ns:owner open · unread · unseen',
        'on: ns:ayse open · unread · unseen',
        'to: ns:ali open · unread · unseen, ns:ayse open · unread · unseen, ns:owner open · unread · unseen'],
  '(b) three failures stop all three: Ayse hears of hers, whoever may export at Kadikoy of Deniz''s two');

select public.update_schedule_export_schedule_service(tests.user('ns:ayse'), tests.id('ns'), pg_temp.rule_id('on'),
  '{"name": "Kitchen week, Kadikoy"}'::jsonb);
select tests.settle();
select is(pg_temp.card_rows('schedule.export_email_stopped', pg_temp.rule_id('on')),
  array['ns:ayse open · unread · unseen'], '(b) renamed while it is still off: still open');
select public.update_schedule_export_schedule_service(tests.user('ns:ayse'), tests.id('ns'), pg_temp.rule_id('on'),
  '{"enabled": true}'::jsonb);
select tests.settle();
select is(pg_temp.card_rows('schedule.export_email_stopped', pg_temp.rule_id('on')),
  array['ns:ayse fixed by ns:ayse now · read now · seen now'],
  '(b) Ayse turns hers back on: fixed, by her, and her own card is read');

select pg_temp.read_before('ayse', 'schedule.export_email_stopped', pg_temp.rule_id('to'));
select public.update_schedule_export_schedule_service(tests.user('ns:owner'), tests.id('ns'), pg_temp.rule_id('to'),
  '{"recipients": ["chef@example.test"]}'::jsonb);
select tests.settle();
select is(pg_temp.card_rows('schedule.export_email_stopped', pg_temp.rule_id('to')),
  array['ns:ali fixed by ns:owner now · unread · unseen', 'ns:ayse fixed by ns:owner now · read before · seen before',
        'ns:owner fixed by ns:owner now · read now · seen now'],
  '(b) the owner sends Deniz''s to another address: fixed for all three, by the owner; only the owner''s own is read now');
select is((select s.enabled from public.scheduled_schedule_exports s where s.id = pg_temp.rule_id('to')), false,
  '(b) and the email itself stays off until somebody turns it on');

select public.delete_schedule_export_schedule_service(tests.user('ns:ali'), tests.id('ns'), pg_temp.rule_id('del'));
select tests.settle();
select is(pg_temp.card_rows('schedule.export_email_stopped', pg_temp.rule_id('del')),
  array['ns:ali removed by ns:ali now · read now · seen now', 'ns:ayse removed by ns:ali now · unread · unseen',
        'ns:owner removed by ns:ali now · unread · unseen'],
  '(b) Ali deletes Deniz''s other one: removed for all three, by Ali, the rows kept; only Ali''s own is read');
select is((select count(*)::integer from public.scheduled_schedule_exports s where s.id = pg_temp.rule_id('del')), 0,
  '(b) the email itself is gone');

select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- FOUNDATION-B 5.3a: one week of availability for many employees at once,
-- from their weekly marks and the manager's private reminders, in the shape the
-- Schedule grid draws; and the time off impact list reads the shifts' own hours.

select tests.world('wa');
select tests.person('wa', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('wa', 'ali', 'employee', array['K', 'B'], array['cook']);
select tests.person('wa', 'emre', 'employee', array['K'], array['cook']);
select tests.person('wa', 'veli', 'employee', array['K'], array['cook']);

-- Besiktas keeps daylight saving time here, to see the spring-forward gap.
update public.locations set timezone = 'America/Los_Angeles' where id = tests.id('wa:B');

create function pg_temp.mark(preference jsonb, day integer, change jsonb) returns jsonb language sql as $$
  select jsonb_set(preference, array['days', day::text], (preference -> 'days' -> day) || change)
$$;

-- Ali cannot work Monday evenings, Wednesdays, or early Sunday; his manager
-- also keeps a private note about Friday mornings. Emre cannot work Tuesday
-- 11:00-15:00; Veli Thursday 07:00-09:00. Availability is hours only.
insert into public.employee_weekly_preferences (workspace_id, employee_id, preference, revision, updated_by)
values
  (tests.id('wa'), tests.id('wa:ali'),
   pg_temp.mark(pg_temp.mark(pg_temp.mark(public.empty_weekly_preference(),
     1, '{"ranges": [{"start": "18:00", "end": "22:00"}]}'),
     3, '{"all_day": true}'),
     0, '{"ranges": [{"start": "01:30", "end": "03:30"}]}'),
   1, tests.user('wa:ali')),
  (tests.id('wa'), tests.id('wa:emre'),
   pg_temp.mark(public.empty_weekly_preference(), 2, '{"ranges": [{"start": "11:00", "end": "15:00"}]}'),
   1, tests.user('wa:emre')),
  (tests.id('wa'), tests.id('wa:veli'),
   pg_temp.mark(public.empty_weekly_preference(), 4, '{"ranges": [{"start": "07:00", "end": "09:00"}]}'),
   1, tests.user('wa:veli'));
insert into public.manager_weekly_reminders (workspace_id, employee_id, preference, enabled, revision, updated_by)
values (tests.id('wa'), tests.id('wa:ali'),
  pg_temp.mark(public.empty_weekly_preference(), 5, '{"ranges": [{"start": "09:00", "end": "12:00"}]}'),
  true, 1, tests.user('wa:ayse'));

create function pg_temp.week(week_start date, people text[], locs text[], reminders boolean default true)
returns table(person text, loc text, projection jsonb) language sql as $$
  select p.label, l.label, a.projection
  from app_private.schedule_week_availability(tests.id('wa'), week_start,
    array(select tests.id('wa:' || x) from unnest(people) x), array(select tests.id('wa:' || x) from unnest(locs) x), reminders) a
  join (select x as label, tests.id('wa:' || x) as id from unnest(people) x) p on p.id = a.employee_id
  join (select x as label, tests.id('wa:' || x) as id from unnest(locs) x) l on l.id = a.location_id
$$;
create function pg_temp.one(week_start date, person text, loc text, reminders boolean default true) returns jsonb language sql as $$
  select w.projection from pg_temp.week(week_start, array[person], array[loc], reminders) w
$$;

select is(pg_temp.one('2030-03-04', 'ali', 'K') ->> 'status', 'ready', 'a week of readable marks is ready');
select ok(pg_temp.one('2030-03-04', 'ali', 'K') -> 'unavailable_intervals'
  @> '[{"start_at": "2030-03-04T15:00:00.000000Z", "end_at": "2030-03-04T19:00:00.000000Z"}]',
  'Monday 18:00-22:00 in Istanbul is 15:00-19:00 UTC');
select is(pg_temp.one('2030-03-04', 'ali', 'K') -> 'days' -> 0, '{"date": "2030-03-04", "has_unavailable": true, "all_day": false}',
  'Monday is marked, not all day');
select is(pg_temp.one('2030-03-04', 'ali', 'K') -> 'days' -> 2 ->> 'all_day', 'true', 'an all-day mark covers the whole local day');
select is(pg_temp.one('2030-03-04', 'ali', 'K') -> 'days' -> 4 ->> 'has_unavailable', 'false', 'the manager''s note is no unavailable hour (M12)');
select is(pg_temp.one('2030-03-04', 'ali', 'K', false) -> 'days' -> 4 ->> 'has_unavailable', 'false',
  'the employee''s own view leaves the manager''s reminder out');
select ok(pg_temp.one('2030-03-04', 'ali', 'K') -> 'note_intervals' @> '[{"start_at": "2030-03-08T06:00:00.000000Z", "end_at": "2030-03-08T09:00:00.000000Z"}]'
  and not (pg_temp.one('2030-03-04', 'ali', 'K') -> 'unavailable_intervals' @> '[{"start_at": "2030-03-08T06:00:00.000000Z", "end_at": "2030-03-08T09:00:00.000000Z"}]'),
  'the note''s hours travel apart from the unavailable hours');
select ok(pg_temp.one('2030-03-04', 'ali', 'B') -> 'unavailable_intervals'
  @> '[{"start_at": "2030-03-10T09:30:00.000000Z", "end_at": "2030-03-10T10:30:00.000000Z"}]',
  'Sunday 01:30-03:30 across the spring-forward gap is one real hour');
select is(array(select (s ->> 'offset_seconds')::integer from jsonb_array_elements(pg_temp.one('2030-03-04', 'ali', 'B') -> 'clock_segments') s),
  array[-28800, -28800, -25200], 'the clock changes once in that week');
select ok(pg_temp.one('2030-03-04', 'emre', 'K') -> 'unavailable_intervals'
  @> '[{"start_at": "2030-03-05T08:00:00.000000Z", "end_at": "2030-03-05T12:00:00.000000Z"}]',
  'Tuesday 11:00-15:00 in Istanbul is 08:00-12:00 UTC');
select ok(pg_temp.one('2030-03-04', 'veli', 'K') -> 'unavailable_intervals'
  @> '[{"start_at": "2030-03-07T04:00:00.000000Z", "end_at": "2030-03-07T06:00:00.000000Z"}]',
  'Thursday 07:00-09:00 in Istanbul is 04:00-06:00 UTC');
select is(
  (select jsonb_agg(w.projection order by w.person, w.loc) from pg_temp.week('2030-03-04', array['ali', 'emre', 'veli'], array['K', 'B']) w),
  (select jsonb_agg(pg_temp.one('2030-03-04', p, l) order by p, l) from unnest(array['ali', 'emre', 'veli']) p cross join unnest(array['K', 'B']) l),
  'many employees at once give the same answer as one at a time'
);

-- Approved leave is part of the week; the time off impact list uses each
-- published shift's own hours.
select tests.publish_week('wa', 1, '[{"label": "wed", "person": "emre", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"}]');
select is(
  (select jsonb_agg(jsonb_build_object('id', s ->> 'id', 'time_unknown', s -> 'time_unknown', 'starts_at', s -> 'starts_at'))
   from jsonb_array_elements(public.time_off_assignment_impact(tests.id('wa'), tests.id('wa:emre'),
     tstzmultirange(tstzrange((tests.week(1) + 2)::timestamp at time zone 'Europe/Istanbul', (tests.week(1) + 3)::timestamp at time zone 'Europe/Istanbul')))) s),
  jsonb_build_array(jsonb_build_object('id', tests.id('wa:shift:wed')::text, 'time_unknown', false,
    'starts_at', to_jsonb((tests.week(1) + 2 + time '09:00') at time zone 'Europe/Istanbul'))),
  'leave that day reaches the published shift, with its own hours'
);
select is(public.time_off_assignment_impact(tests.id('wa'), tests.id('wa:emre'),
    tstzmultirange(tstzrange((tests.week(1) + 2 + time '15:00') at time zone 'Europe/Istanbul', (tests.week(1) + 3)::timestamp at time zone 'Europe/Istanbul'))),
  '[]'::jsonb, 'leave after the shift ends does not');

select tests.leave('wa', 'emre', 2);
select public.answer_time_off_service(tests.user('wa:owner'), tests.id('wa'), r.id, 'approve', null, r.revision,
  app_private.time_off_shifts_print(app_private.time_off_shifts_at_stake(r)))
from public.time_off_requests r where r.id = tests.id('wa:emre:time_off');
select ok(pg_temp.one(tests.week(2), 'emre', 'K') -> 'leave_intervals'
  @> public.availability_ranges_json(tstzmultirange(tstzrange((tests.week(2) + 2)::timestamp at time zone 'Europe/Istanbul', (tests.week(2) + 3)::timestamp at time zone 'Europe/Istanbul'))),
  'approved leave is part of the week');

select * from finish();
rollback;

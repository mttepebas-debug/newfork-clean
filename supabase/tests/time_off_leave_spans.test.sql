begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- Time off rebuild D1a (KARARLAR S-239): app_private.leave_spans is the one place that says when a person
-- is away. Approved time off reads as what is left of it today (a revoke, a cancellation or a shortening
-- takes its hours out); a request waiting for a decision reads as the hours asked, marked pending.
-- Lineup's Add Staff list read the requested days straight from the table and kept calling a revoked or
-- shortened time off "Time off"; it reads leave_spans now. Home's Coming up drew a shortened time off at
-- its first length; it reads what is left.
--
-- Kadikoy (Istanbul, UTC+3 all year). The Monday of tests.week(0):
--   Fay  - a whole day off, approved.
--   Gil  - a whole day off, approved, then the Lunch hours (9 AM - 3 PM) given back.
--   Ray  - a whole day off, approved, then revoked before it began.
--   Pia  - the Wednesday asked for, waiting for a decision.
--   Hal  - three days off from three days from now, the last one given back (Coming up).

select tests.world('ls');
select tests.person('ls', 'fay', 'employee', array['K'], array['cook']);
select tests.person('ls', 'gil', 'employee', array['K'], array['cook']);
select tests.person('ls', 'ray', 'employee', array['K'], array['cook']);
select tests.person('ls', 'pia', 'employee', array['K'], array['cook']);
select tests.person('ls', 'hal', 'employee', array['K'], array['cook']);

insert into public.shift_types (id, workspace_id, name, color, default_start_time, default_end_time)
values (tests.remember('ls:type:lunch', gen_random_uuid()), tests.id('ls'), 'Lunch', '#1F9D74', '09:00', '15:00');

create temporary table fixture (key text primary key, value uuid);

-- Days off in one request, whole days in Kadikoy's zone, approved (tests.approved_leave, several days).
create function pg_temp.days_off(person text, first_day date, days integer)
returns uuid
language plpgsql
as $$
declare
  rid uuid := gen_random_uuid();
  d date;
  resolved jsonb;
begin
  insert into public.schedule_time_off_requests (id, workspace_id, employee_id, created_by)
  values (rid, tests.id('ls'), tests.id('ls:' || person), tests.user('ls:owner'));
  for d in select first_day + i from generate_series(0, days - 1) i loop
    resolved := public.time_off_resolve_period(jsonb_build_object('segment_date', d), 'Europe/Istanbul');
    insert into public.schedule_time_off_segments (workspace_id, request_id, segment_date, time_timezone, starts_at, ends_at)
    values (tests.id('ls'), rid, d, 'Europe/Istanbul', (resolved ->> 'starts_at')::timestamptz, (resolved ->> 'ends_at')::timestamptz);
  end loop;
  update public.schedule_time_off_segments set status = 'approved' where request_id = rid;
  update public.schedule_time_off_requests set status = 'approved', revision = revision + 1 where id = rid;
  return rid;
end;
$$;
create function pg_temp.at(day date, clock text)
returns timestamptz
language sql
as $$
  select (day + clock::time) at time zone 'Europe/Istanbul'
$$;
create function pg_temp.spans(person text, win tstzrange)
returns text
language sql
as $$
  select coalesce(string_agg(
      to_char(lower(l.span) at time zone 'Europe/Istanbul', 'Dy HH24:MI') || '-'
        || to_char(upper(l.span) at time zone 'Europe/Istanbul', 'Dy HH24:MI')
        || case when l.pending then ' pending' else '' end, ', ' order by lower(l.span)), 'none')
  from app_private.leave_spans(tests.id('ls'), array[tests.id('ls:' || person)], win) l
$$;
create function pg_temp.lunch_why(day date, person text)
returns jsonb
language sql
as $$
  select c -> 'why' from jsonb_array_elements(public.get_lineup_candidates_service(tests.user('ls:owner'), tests.id('ls'),
      jsonb_build_object('location_id', tests.id('ls:K'), 'service_date', day, 'shift_type_id', tests.id('ls:type:lunch'),
        'department_id', tests.id('ls:kitchen'))) -> 'candidates') c
  where c ->> 'employee_id' = tests.id('ls:' || person)::text
$$;

insert into fixture values
  ('fay', tests.approved_leave(tests.id('ls'), tests.id('ls:fay'), tests.user('ls:owner'), tests.id('ls:K'), tests.week(0))),
  ('gil', tests.approved_leave(tests.id('ls'), tests.id('ls:gil'), tests.user('ls:owner'), tests.id('ls:K'), tests.week(0))),
  ('ray', tests.approved_leave(tests.id('ls'), tests.id('ls:ray'), tests.user('ls:owner'), tests.id('ls:K'), tests.week(0))),
  ('pia', tests.leave('ls', 'pia', 0, 1)),
  ('hal', pg_temp.days_off('hal', current_date + 3, 3));

select app_private.shorten_time_off(tests.user('ls:owner'), tests.id('ls'), tests.id('ls:gil'),
  tstzmultirange(tstzrange(pg_temp.at(tests.week(0), '09:00'), pg_temp.at(tests.week(0), '15:00'), '[)')), 'Lunch back', '{}'::jsonb);
select public.revoke_time_off_service(tests.user('ls:owner'), tests.id('ls'), (select value from fixture where key = 'ray'),
  (select r.revision from public.schedule_time_off_requests r where r.id = (select value from fixture where key = 'ray')), 'Plans changed');
select app_private.shorten_time_off(tests.user('ls:owner'), tests.id('ls'), tests.id('ls:hal'),
  tstzmultirange(tstzrange((current_date + 5)::timestamp at time zone 'Europe/Istanbul',
    (current_date + 6)::timestamp at time zone 'Europe/Istanbul', '[)')), 'Back a day early', '{}'::jsonb);

create temporary table week_window as
select tstzrange(pg_temp.at(tests.week(0), '00:00'), pg_temp.at(tests.week(0) + 7, '00:00'), '[)') as win;

-- 1. leave_spans: what each kind of time off reads as.
select is(pg_temp.spans('fay', (select win from week_window)), 'Mon 00:00-Tue 00:00', 'approved time off reads as the whole day');
select is((select l.request_id from app_private.leave_spans(tests.id('ls'), array[tests.id('ls:fay')], (select win from week_window)) l),
  (select value from fixture where key = 'fay'), 'and names its request');
select is(pg_temp.spans('gil', (select win from week_window)), 'Mon 00:00-Mon 09:00, Mon 15:00-Tue 00:00',
  'shortened time off reads as what is left of it');
select is(pg_temp.spans('ray', (select win from week_window)), 'none', 'revoked time off reads as nothing');
select is(pg_temp.spans('pia', (select win from week_window)), 'Wed 00:00-Thu 00:00 pending', 'a request waiting for a decision reads as the hours asked, pending');
select is(pg_temp.spans('fay', tstzrange(pg_temp.at(tests.week(0) + 1, '00:00'), pg_temp.at(tests.week(0) + 7, '00:00'), '[)')), 'none',
  'time off outside the window is not read');
select is(pg_temp.spans('gil', tstzrange(pg_temp.at(tests.week(0), '10:00'), pg_temp.at(tests.week(0), '14:00'), '[)')), 'none',
  'a window inside the hours given back reads nothing');
select is((select count(*)::integer from app_private.leave_spans(tests.id('ls'),
    array[tests.id('ls:fay'), tests.id('ls:gil'), tests.id('ls:ray'), tests.id('ls:pia')], (select win from week_window))),
  4, 'several people in one read: Fay one, Gil two, Pia one');
select is((select count(*)::integer from app_private.leave_spans(tests.id('ls'), array[tests.id('ls:fay')], null)), 0,
  'no window reads nothing');
select is((select count(*)::integer from app_private.leave_spans(tests.id('ls'), array[tests.id('ls:fay')], '(,)'::tstzrange)), 1,
  'an open window reads all of it');
select is((select count(*)::integer from app_private.leave_spans(tests.world('lx'), array[tests.id('ls:fay')], '(,)'::tstzrange)), 0,
  'another workspace reads none of it');

-- 2. Lineup's Add Staff list: only time off that is still there is "Time off".
select is(pg_temp.lunch_why(tests.week(0), 'fay'), '{"reason": "time_off"}'::jsonb, 'Lineup: approved time off is time off');
select isnt(pg_temp.lunch_why(tests.week(0), 'ray'), '{"reason": "time_off"}'::jsonb, 'Lineup: revoked time off is not time off');
select isnt(pg_temp.lunch_why(tests.week(0), 'gil'), '{"reason": "time_off"}'::jsonb,
  'Lineup: time off given back for these hours is not time off');
select isnt(pg_temp.lunch_why(tests.week(0) + 2, 'pia'), '{"reason": "time_off"}'::jsonb,
  'Lineup: time off waiting for a decision is not time off yet');

-- 3. Home's Coming up: the days left.
select is((select c ->> 'first_date' || ' - ' || (c ->> 'last_date') from jsonb_array_elements(
    public.get_manager_home_service(tests.user('ls:owner'), tests.id('ls')) -> 'coming_up') c
  where c ->> 'kind' = 'time_off' and c ->> 'id' = (select value from fixture where key = 'hal')::text),
  (current_date + 3) || ' - ' || (current_date + 4), 'Home: a shortened time off comes up with the days left');
select is((select count(*)::integer from jsonb_array_elements(
    public.get_manager_home_service(tests.user('ls:owner'), tests.id('ls')) -> 'coming_up') c
  where c ->> 'kind' = 'time_off'), 1, 'Home: only Hal''s time off is in the next fourteen days');

select * from finish();
rollback;

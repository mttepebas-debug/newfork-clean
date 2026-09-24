begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- FOUNDATION-B 5.3b (user decision 2026-09-24): employee availability has
-- three levels, Warn / Require confirmation (soft) / Block (hard), and a
-- manager's private reminder is always soft, whatever the setting.

select tests.world('tl');
select tests.person('tl', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('tl', 'ali', 'employee', array['K'], array['cook']);

create function pg_temp.mark(preference jsonb, day integer, change jsonb) returns jsonb language sql as $$
  select jsonb_set(preference, array['days', day::text], (preference -> 'days' -> day) || change)
$$;
-- Ali marked Monday evenings; his manager noted Friday mornings.
insert into public.employee_weekly_preferences (workspace_id, employee_id, preference, revision, updated_by)
values (tests.id('tl'), tests.id('tl:ali'),
  pg_temp.mark(public.empty_weekly_preference('time_range'), 1, '{"range": {"start": "18:00", "end": "22:00"}}'),
  1, tests.user('tl:ali'));
insert into public.manager_weekly_reminders (workspace_id, employee_id, preference, enabled, revision, updated_by)
values (tests.id('tl'), tests.id('tl:ali'),
  pg_temp.mark(pg_temp.mark(public.empty_weekly_preference('time_range'),
    5, '{"range": {"start": "09:00", "end": "12:00"}}'), 1, '{"range": {"start": "20:00", "end": "23:00"}}'),
  true, 1, tests.user('tl:ayse'));

create function pg_temp.set_level(level text) returns void language sql as $$
  update public.workspace_scheduling_settings set conflict_rules = jsonb_set(conflict_rules, '{availability}', to_jsonb(level))
  where workspace_id = tests.id('tl')
$$;
-- day: 0 = Monday of the week.
create function pg_temp.check(day integer, start_time text, end_time text) returns jsonb language sql as $$
  select public.assess_weekly_shift_availability(tests.id('tl'), tests.id('tl:ali'), jsonb_build_object(
    'location_id', tests.id('tl:K'), 'job_id', tests.id('tl:job:cook'), 'scheduled_date', tests.week(1) + day,
    'time_basis', 'explicit', 'start_time', start_time, 'end_time', end_time, 'time_timezone', 'Europe/Istanbul'))
$$;
create function pg_temp.level(assessment jsonb) returns text language sql as $$
  select case assessment ->> 'operation' when 'blocked' then 'block' when 'allowed' then 'allow' else assessment ->> 'warning_policy' end
$$;

select throws_ok($$select pg_temp.set_level('allow')$$, '23514', null, 'availability cannot be set to write without a word');

select pg_temp.set_level('block');
select is(pg_temp.level(pg_temp.check(0, '18:00', '20:00')), 'block', 'Block stops a shift in the employee''s own marked hours');
select is(pg_temp.level(pg_temp.check(4, '09:00', '11:00')), 'confirm', 'a manager''s reminder only asks for confirmation, even under Block');
select is(pg_temp.level(pg_temp.check(0, '19:00', '21:00')), 'block', 'when both overlap, the employee''s own mark decides');
select is(
  (select jsonb_agg(jsonb_build_object('source', r -> 'source', 'severity', r -> 'severity') order by r ->> 'source' nulls first)
   from jsonb_array_elements(pg_temp.check(0, '19:00', '21:00') -> 'reasons') r where r ->> 'code' = 'availability'),
  '[{"source": null, "severity": "block"}, {"source": "reminder", "severity": "confirm"}]'::jsonb,
  'the two are separate reasons, each with its own level');

select pg_temp.set_level('warn');
select is(pg_temp.level(pg_temp.check(0, '18:00', '20:00')), 'warn', 'Warn shows the warning and lets the shift be written');
select is(pg_temp.level(pg_temp.check(4, '09:00', '11:00')), 'confirm', 'a manager''s reminder still asks for confirmation under Warn');

select pg_temp.set_level('confirm');
select is(pg_temp.level(pg_temp.check(0, '18:00', '20:00')), 'confirm', 'Require confirmation asks the manager to cancel or place anyway');
select is(pg_temp.level(pg_temp.check(2, '09:00', '11:00')), 'allow', 'free hours raise nothing');

select * from finish();
rollback;

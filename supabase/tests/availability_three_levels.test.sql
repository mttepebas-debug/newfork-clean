begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

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

-- Switching to Block reaches only new assignments (user decision 2026-09-24):
-- a shift published before the switch stays publishable, even after an
-- unpublish; a draft's earlier "place anyway" does not survive the switch.
create function pg_temp.monday_evening() returns jsonb language sql as $$
  select '[{"label": "mon", "loc": "K", "person": "ali", "job": "cook", "day": 0, "start": "18:00", "end": "20:00"}]'::jsonb
$$;
create temp table tl_run as select
  tests.publish_week('tl', 2, pg_temp.monday_evening()) published,
  (public.acquire_schedule_edit_session_service(tests.user('tl:owner'), tests.id('tl'), tests.week(3), 'blank', null) -> 'session' ->> 'id')::uuid session,
  null::uuid draft, null::jsonb preview;
select tests.add_shift(tests.user('tl:owner'), 'tl', session, 3, pg_temp.monday_evening() -> 0) from tl_run;
update tl_run set draft = (public.save_schedule_edit_session_service(tests.user('tl:owner'), tests.id('tl'), session,
  (select e.revision from public.schedule_edit_sessions e where e.id = session), 'three levels', null, null) ->> 'id')::uuid;
create function pg_temp.preview(draft uuid) returns jsonb language sql as $$
  select public.preview_schedule_publication_service(tests.user('tl:owner'), tests.id('tl'), draft, array[tests.id('tl:K')], null, true)
$$;
update tl_run set preview = pg_temp.preview(draft);
select is(preview ->> 'status', 'publish_ready', 'a placed-anyway shift is ready to publish under Require confirmation') from tl_run;

select pg_temp.set_level('block');
select is(pg_temp.preview(published) ->> 'status', 'publish_ready', 'a shift published before Block stays publishable') from tl_run;
select is(pg_temp.preview(draft) ->> 'status', 'hard_blocked', 'Block stops a draft''s earlier "place anyway"') from tl_run;
select throws_ok($$select public.publish_schedule_draft_service(tests.user('tl:owner'), tests.id('tl'), r.draft, array[tests.id('tl:K')], null, true,
  d.revision, r.preview ->> 'fingerprint', '[]') from tl_run r join public.schedule_drafts d on d.id = r.draft$$,
  'PT409', null, 'a preview taken before the switch cannot publish');
select lives_ok($$select public.unpublish_schedule_service(tests.user('tl:owner'), tests.id('tl'), tests.week(2), array[tests.id('tl:K')],
  public.preview_schedule_unpublication_service(tests.user('tl:owner'), tests.id('tl'), tests.week(2), array[tests.id('tl:K')]) ->> 'fingerprint')$$,
  'the week can be unpublished');
select is(pg_temp.preview(published) ->> 'status', 'publish_ready', 'and republished unchanged under Block') from tl_run;

create temp table tl_block as select
  (public.acquire_schedule_edit_session_service(tests.user('tl:owner'), tests.id('tl'), tests.week(4), 'blank', null) -> 'session' ->> 'id')::uuid session;
select throws_ok($$select tests.add_shift(tests.user('tl:owner'), 'tl', session, 4, pg_temp.monday_evening() -> 0) from tl_block$$,
  '23514', null, 'Block stops the command that writes a new shift');
select throws_ok($$insert into public.schedule_edit_session_shifts (id, workspace_id, session_id, location_id, employee_id, job_id,
    scheduled_date, start_time, end_time, time_basis, time_timezone)
  select gen_random_uuid(), tests.id('tl'), session, tests.id('tl:K'), tests.id('tl:ali'), tests.id('tl:job:cook'),
    tests.week(4), '18:00', '20:00', 'explicit', 'Europe/Istanbul' from tl_block$$,
  '23514', null, 'and a direct write of it');

select * from finish();
rollback;

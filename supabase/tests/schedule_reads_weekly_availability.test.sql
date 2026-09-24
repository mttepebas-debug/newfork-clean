begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- FOUNDATION-B 5.3a: the Schedule grid, Edit mode and Employee Hub -> Schedule
-- draw availability from the weekly marks. A published shift keeps what was
-- accepted when it was published; a shift being edited is checked against
-- today's marks; an employee sees only their own marks, never the manager's
-- private reminder.

select tests.world('wr');
select tests.person('wr', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('wr', 'ali', 'employee', array['K', 'B'], array['cook']);

create function pg_temp.mark(preference jsonb, day integer, change jsonb) returns jsonb language sql as $$
  select jsonb_set(preference, array['days', day::text], (preference -> 'days' -> day) || change)
$$;
-- Ali cannot work Monday evenings; his manager notes Friday mornings.
insert into public.employee_weekly_preferences (workspace_id, employee_id, preference, revision, updated_by)
values (tests.id('wr'), tests.id('wr:ali'),
  pg_temp.mark(public.empty_weekly_preference('time_range'), 1, '{"range": {"start": "18:00", "end": "22:00"}}'),
  1, tests.user('wr:ali'));
insert into public.manager_weekly_reminders (workspace_id, employee_id, preference, enabled, revision, updated_by)
values (tests.id('wr'), tests.id('wr:ali'),
  pg_temp.mark(public.empty_weekly_preference('time_range'), 5, '{"range": {"start": "09:00", "end": "12:00"}}'),
  true, 1, tests.user('wr:ayse'));

select tests.publish_week('wr', 1, '[{"label": "thu", "person": "ali", "loc": "K", "job": "cook", "day": 3, "start": "09:00", "end": "15:00"}]');

create function pg_temp.ali(model jsonb) returns jsonb language sql as $$
  select e from jsonb_array_elements(model -> 'employees') e where e ->> 'id' = tests.id('wr:ali')::text
$$;
-- The grid names a published shift by its row, Edit mode by the shift it stands for.
create function pg_temp.codes(model jsonb, shift uuid) returns jsonb language sql as $$
  select s -> 'warning_codes' from jsonb_array_elements(model -> 'shifts') s
  where s ->> 'id' in (shift::text, (select p.source_shift_id::text from public.schedule_published_shifts p where p.id = shift))
$$;
create function pg_temp.grid() returns jsonb language sql as $$
  select public.get_schedule_read_model_service(tests.user('wr:ayse'), tests.id('wr'), tests.week(1))
$$;

select ok(not (pg_temp.ali(pg_temp.grid()) ?| array['availability', 'availability_versions']), 'the old availability fields are gone');
select is((select jsonb_agg(p ->> 'location_id') from jsonb_array_elements(pg_temp.ali(pg_temp.grid()) -> 'weekly_availability') p),
  jsonb_build_array(tests.id('wr:K')::text), 'a Kadikoy manager sees Ali''s Kadikoy week only');
select is(pg_temp.ali(pg_temp.grid()) -> 'weekly_availability' -> 0 -> 'days' -> 4 ->> 'has_unavailable', 'true',
  'the manager sees the private reminder in the grid');
select ok(not coalesce(pg_temp.codes(pg_temp.grid(), tests.id('wr:shift:thu')) ? 'availability', false),
  'published work accepted without a conflict shows no warning');

-- What was accepted at publishing stays: a conflict recorded then keeps
-- showing, whatever the marks say today.
set local session_replication_role = replica;
update public.schedule_published_shifts
set availability_snapshot = jsonb_build_object('status', 'assessed', 'captured_at', now(),
  'assessment', jsonb_build_object('has_availability_conflict', true,
    'employee_intervals', '[{"start_at": "2000-01-01T00:00:00.000000Z", "end_at": "2000-01-01T01:00:00.000000Z"}]'::jsonb))
where id = tests.id('wr:shift:thu');
set local session_replication_role = origin;
select ok(pg_temp.codes(pg_temp.grid(), tests.id('wr:shift:thu')) ? 'availability',
  'published work accepted with a conflict keeps showing it');

-- Edit mode: unchanged published work keeps its snapshot, a new shift is
-- checked against today's marks. Warn lets the conflicting shift be written.
update public.workspace_scheduling_settings set conflict_rules = jsonb_set(conflict_rules, '{availability}', '"warn"')
where workspace_id = tests.id('wr');
create temp table wr_edit (key text primary key, value uuid);
insert into wr_edit values ('session', (public.acquire_schedule_edit_session_service(
  tests.user('wr:ayse'), tests.id('wr'), tests.week(1), 'published', null) -> 'session' ->> 'id')::uuid);
insert into wr_edit values
  ('monday', tests.add_shift(tests.user('wr:ayse'), 'wr', (select value from wr_edit where key = 'session'), 1,
    '{"person": "ali", "loc": "K", "job": "cook", "day": 0, "start": "19:00", "end": "21:00"}')),
  ('tuesday', tests.add_shift(tests.user('wr:ayse'), 'wr', (select value from wr_edit where key = 'session'), 1,
    '{"person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "12:00"}'));
create function pg_temp.edit() returns jsonb language sql as $$
  select public.get_schedule_edit_session_service(tests.user('wr:ayse'), tests.id('wr'), (select value from wr_edit where key = 'session'))
$$;
select ok(pg_temp.codes(pg_temp.edit(), (select value from wr_edit where key = 'monday')) ? 'availability',
  'a new shift over a marked evening is flagged in Edit mode');
select ok(not (pg_temp.codes(pg_temp.edit(), (select value from wr_edit where key = 'tuesday')) ? 'availability'),
  'a new shift on a free morning is not');
select ok(pg_temp.codes(pg_temp.edit(), tests.id('wr:shift:thu')) ? 'availability',
  'unchanged published work keeps what it was accepted with');

-- Employee Hub -> Schedule: Ali's own marks, never the manager's note.
create function pg_temp.board() returns jsonb language sql as $$
  select public.get_employee_schedule_board_service(tests.user('wr:ali'), tests.id('wr'), tests.week(1))
$$;
select is((select jsonb_agg(p -> 'days' -> 0 ->> 'has_unavailable' order by p ->> 'location_id') || jsonb_agg(p -> 'days' -> 4 ->> 'has_unavailable' order by p ->> 'location_id')
   from jsonb_array_elements(pg_temp.ali(pg_temp.board()) -> 'weekly_availability') p),
  '["true", "true", "false", "false"]'::jsonb, 'Ali sees his Monday evening at both locations and no trace of the Friday note');
select ok(not exists (select 1 from jsonb_array_elements(pg_temp.board() -> 'employees') e
  where e ->> 'id' <> tests.id('wr:ali')::text and e ? 'weekly_availability'), 'he sees nobody else''s availability');

select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- FOUNDATION-B 5.3a: the Schedule grid, Edit mode and Employee Hub -> Schedule
-- draw availability from the weekly marks. Every shift, published or being
-- edited, is checked against today's marks (BL-186: a mark is a warning, not
-- an acceptance kept from publishing); an employee sees only their own marks,
-- never the manager's private reminder.

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
  'a published shift in free hours shows no warning');

-- Ali marks Thursday morning after the week went out (BL-184): the published
-- shift shows it.
update public.employee_weekly_preferences set preference = pg_temp.mark(preference, 4, '{"range": {"start": "10:00", "end": "11:00"}}')
where employee_id = tests.id('wr:ali');
select ok(pg_temp.codes(pg_temp.grid(), tests.id('wr:shift:thu')) ? 'availability',
  'a mark made after publishing shows on the published shift');

-- Edit mode: every shift is checked against today's marks, and a shift over
-- a marked evening is written (a warning, never a block).
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
  'unchanged published work shows today''s mark too');

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

begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

-- BL-238: a Schedule week is "this week" or "past" by the clock of the places
-- it is for, never by the server's UTC date. Sunday 20:00 in Los Angeles is
-- already Monday 03:00 UTC: Mina, planning on Sunday evening, was told the
-- week she was looking at was past and could not change it.
-- Rules: KARARLAR S-01 (the location's time zone; a week reaching several
-- places is past only once all of them have left it), "Geçmiş hafta kilidi",
-- K11 (an important date's past lock is the same line).

select tests.world('tz');
select tests.person('tz', 'mina', 'manager', array['K', 'B'], array['cook']);
select tests.new_user('tz:stranger', 'Sam Stranger');
-- Kadikoy keeps Los Angeles time; Besiktas stays in Istanbul.
update public.locations set timezone = 'America/Los_Angeles' where id = tests.id('tz:K');

create function pg_temp.k() returns uuid[] language sql as $$ select array[tests.id('tz:K')] $$;
create function pg_temp.b() returns uuid[] language sql as $$ select array[tests.id('tz:B')] $$;
-- The week a set of places is in at a fixed instant, and right now.
create function pg_temp.at(places uuid[], instant timestamptz default '2026-10-12 03:00:00+00')
returns date language sql as $$
  select app_private.schedule_week_start_at(tests.id('tz'), places, instant)
$$;
create function pg_temp.now(places uuid[] default null) returns date language sql as $$
  select public.schedule_current_week_start_service(tests.id('tz'), places)
$$;
-- A refusal's JSON, or null when the statement went through.
create function pg_temp.refusal(statement text) returns jsonb language plpgsql as $$
begin
  execute statement;
  return null;
exception when sqlstate 'P0001' then
  return sqlerrm::jsonb;
end;
$$;
create function pg_temp.try(statement text) returns text language plpgsql as $$
declare state text; hint text;
begin
  execute statement;
  return 'ok';
exception when others then
  get stacked diagnostics state = returned_sqlstate, hint = pg_exception_hint;
  return state || ' ' || coalesce(hint, '');
end;
$$;

-- 1. The line at one instant: Sunday 2026-10-11 20:00 in Los Angeles ----------

select is(pg_temp.at(pg_temp.k()), '2026-10-05'::date,
  'Sunday 20:00 in Los Angeles is still the week of Oct 5 there, though UTC is already on Monday');
select is(pg_temp.at(pg_temp.b()), '2026-10-12'::date,
  'the same instant is Monday 06:00 in Istanbul: its week began Oct 12');
select is(pg_temp.at(pg_temp.k() || pg_temp.b()), '2026-10-05'::date,
  'a week reaching both places is past only once both have left it');
select is(pg_temp.at(null), '2026-10-05'::date,
  'no place named is every live location of the workspace');
select is(pg_temp.at('{}'), '2026-10-05'::date,
  'an empty list of places is the whole workspace too');
select is(pg_temp.at(array[gen_random_uuid()]), '2026-10-05'::date,
  'a place that is not this workspace''s has no clock here: the whole workspace answers');

update public.locations set archived_at = now() where id = tests.id('tz:K');
select is(pg_temp.at(null), '2026-10-12'::date,
  'an archived location no longer holds the workspace''s week open');
update public.locations set archived_at = null where id = tests.id('tz:K');

update public.workspace_scheduling_settings set week_start_day = 'sunday' where workspace_id = tests.id('tz');
select is(pg_temp.at(pg_temp.k()), '2026-10-11'::date,
  'a Sunday week: Sunday evening in Los Angeles is the week that began that morning');
select is(pg_temp.at(pg_temp.k(), '2026-10-11 06:00:00+00'), '2026-10-04'::date,
  'a Sunday week: Saturday 23:00 in Los Angeles is still the week of Oct 4');
select is(pg_temp.at(pg_temp.b(), '2026-10-11 06:00:00+00'), '2026-10-11'::date,
  'a Sunday week: the same instant is Sunday 09:00 in Istanbul, its new week');
update public.workspace_scheduling_settings set week_start_day = 'monday' where workspace_id = tests.id('tz');

select is(pg_temp.now(pg_temp.k()), pg_temp.at(pg_temp.k(), now()),
  'the Schedule''s "this week" for Kadikoy is Kadikoy''s week right now');
select is(pg_temp.now(), pg_temp.at(null, now()),
  'the Schedule''s "this week" for the workspace is its westernmost live place''s week right now');

-- 2. The Schedule asks for the places of its work -----------------------------

-- Kadikoy's week, and its number for tests.add_shift.
create function pg_temp.kw() returns date language sql as $$ select public.schedule_current_week_start_service(tests.id('tz'), array[tests.id('tz:K')]) $$;
create function pg_temp.kn() returns integer language sql as $$ select (pg_temp.kw() - tests.week(0)) / 7 $$;
create function pg_temp.open(source text, draft uuid default null) returns uuid language sql as $$
  select (public.acquire_schedule_edit_session_service(tests.user('tz:mina'), tests.id('tz'), pg_temp.kw(),
    source::public.schedule_edit_source, draft, pg_temp.k() || pg_temp.b()) -> 'session' ->> 'id')::uuid
$$;
create function pg_temp.save(session uuid) returns jsonb language sql as $$
  select pg_temp.refusal(format($q$select public.save_schedule_edit_session_service(%L, %L, %L, %s, %L, null, null, true)$q$,
    tests.user('tz:mina'), tests.id('tz'), session,
    (select s.revision from public.schedule_edit_sessions s where s.id = session), 'week ' || gen_random_uuid()))
$$;
create function pg_temp.findings(refusal jsonb) returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_array(f ->> 'location_name', f ->> 'op_type') order by f ->> 'location_name', f ->> 'op_type'), '[]')
  from jsonb_array_elements(refusal -> 'past_edits') f
$$;
create function pg_temp.at_b(session uuid) returns uuid language sql as $$
  select s.id from public.schedule_edit_session_shifts s where s.session_id = session and s.location_id = tests.id('tz:B')
$$;
-- Besiktas' clock: a week ahead, or back on Los Angeles time while a test
-- changes a shift there (a shift's checks want a named zone).
create function pg_temp.b_zone(zone text) returns void language sql as $$
  update public.locations set timezone = zone where id = tests.id('tz:B')
$$;

-- Shifts are made while both places keep Los Angeles time (a shift's zone must
-- be a named one): Kadikoy's week published at both places, and a new edit of
-- it with a new shift at each place.
update public.locations set timezone = 'America/Los_Angeles' where id = tests.id('tz:B');
select tests.publish_week('tz', pg_temp.kn(), '[{"label": "k2", "person": "mina", "loc": "K", "job": "cook", "day": 6, "start": "22:00", "end": "22:15"},
  {"label": "b2", "person": "mina", "loc": "B", "job": "cook", "day": 6, "start": "22:30", "end": "22:45"}]');
select tests.remember('tz:session:blank', pg_temp.open('blank'));
select tests.add_shift(tests.user('tz:mina'), 'tz', tests.id('tz:session:blank'), pg_temp.kn(),
  '{"person": "mina", "loc": "K", "job": "cook", "day": 6, "start": "23:00", "end": "23:10"}');
select tests.add_shift(tests.user('tz:mina'), 'tz', tests.id('tz:session:blank'), pg_temp.kn(),
  '{"person": "mina", "loc": "B", "job": "cook", "day": 6, "start": "23:20", "end": "23:30"}');

-- From here on Besiktas runs at least a week ahead of Kadikoy at every instant
-- (a zone 167 hours east of UTC), so a line drawn from the wrong places shows.
update public.locations set timezone = '<+167>-167' where id = tests.id('tz:B');
select cmp_ok(pg_temp.now(pg_temp.b()), '>=', pg_temp.now(pg_temp.k()) + 7,
  'Besiktas has left the week Kadikoy is in');

select is(
  pg_temp.refusal(format($$select public.acquire_schedule_edit_session_service(%L, %L, %L, 'blank', null, %L)$$,
    tests.user('tz:mina'), tests.id('tz'), pg_temp.kw(), pg_temp.b())) ->> 'current_week_start',
  pg_temp.now(pg_temp.b())::text,
  'opening Kadikoy''s week at Besiktas alone is refused: Besiktas has left it');
select is(
  pg_temp.try(format($$select public.acquire_schedule_edit_session_service(%L, %L, %L, 'blank', null, %L)$$,
    tests.user('tz:stranger'), tests.id('tz'), pg_temp.kw() - 7, pg_temp.k())),
  '42501 authz.not_member',
  'someone who is not in the workspace hears "no" before anything about the week');

-- The lock is per place. A new shift at Besiktas is refused, by name.
select is(pg_temp.findings(pg_temp.save(tests.id('tz:session:blank'))), '[["Besiktas", "create"]]'::jsonb,
  'saving refuses the new shift at Besiktas, which has left the week, and names it');
-- Once every place has left the week, the whole week is past.
update public.schedule_edit_sessions set week_start = pg_temp.kw() - 7 where id = tests.id('tz:session:blank');
select is(pg_temp.save(tests.id('tz:session:blank')) ->> 'current_week_start', pg_temp.kw()::text,
  'a week both places have left is refused at the westernmost place''s line');
update public.schedule_edit_sessions set status = 'discarded' where id = tests.id('tz:session:blank');

-- An edit of the published week: Besiktas' published shift rides along
-- untouched while Kadikoy changes; changing or removing it is refused.
select tests.remember('tz:session:pub', pg_temp.open('published'));
select ok(tests.id('tz:session:pub') is not null and pg_temp.at_b(tests.id('tz:session:pub')) is not null,
  'while Kadikoy is still in the week, the published week opens at both places');
update public.schedule_edit_session_shifts set start_time = '22:05', pending_op_type = 'update', revision = revision + 1
where session_id = tests.id('tz:session:pub') and location_id = tests.id('tz:K');
select is(pg_temp.save(tests.id('tz:session:pub')), null,
  'Kadikoy''s change saves, with Besiktas'' published shift untouched beside it');
select tests.remember('tz:draft:saved', (select d.id from public.schedule_drafts d
  where d.workspace_id = tests.id('tz') and d.week_start = pg_temp.kw() and d.created_by = tests.user('tz:mina') and d.archived_at is null
  order by d.created_at desc limit 1));

select tests.remember('tz:session:pub2', pg_temp.open('published'));
select pg_temp.b_zone('America/Los_Angeles');
update public.schedule_edit_session_shifts set start_time = '22:35', pending_op_type = 'update', revision = revision + 1
where id = pg_temp.at_b(tests.id('tz:session:pub2'));
select pg_temp.b_zone('<+167>-167');
select is(pg_temp.findings(pg_temp.save(tests.id('tz:session:pub2'))), '[["Besiktas", "update"]]'::jsonb,
  'changing Besiktas'' published shift is refused');
select pg_temp.b_zone('America/Los_Angeles');
update public.schedule_edit_session_shifts set start_time = '22:30', pending_op_type = 'delete'
where id = pg_temp.at_b(tests.id('tz:session:pub2'));
select pg_temp.b_zone('<+167>-167');
select is(pg_temp.findings(pg_temp.save(tests.id('tz:session:pub2'))), '[["Besiktas", "delete"]]'::jsonb,
  'and so is removing it');
update public.schedule_edit_sessions set status = 'discarded' where id = tests.id('tz:session:pub2');

-- An edit of the saved draft: its Besiktas shift rides along untouched;
-- changing or taking it out is refused.
select tests.remember('tz:session:draft', pg_temp.open('draft', tests.id('tz:draft:saved')));
select ok(pg_temp.at_b(tests.id('tz:session:draft')) is not null, 'the draft opens with its Besiktas shift');
select is(pg_temp.save(tests.id('tz:session:draft')), null,
  'the draft saves again with its Besiktas shift untouched');
select tests.remember('tz:session:draft2', pg_temp.open('draft', tests.id('tz:draft:saved')));
select pg_temp.b_zone('America/Los_Angeles');
update public.schedule_edit_session_shifts set start_time = '22:35', revision = revision + 1
where id = pg_temp.at_b(tests.id('tz:session:draft2'));
select pg_temp.b_zone('<+167>-167');
select is(pg_temp.findings(pg_temp.save(tests.id('tz:session:draft2'))), '[["Besiktas", "update"]]'::jsonb,
  'changing the draft''s Besiktas shift is refused');
select pg_temp.b_zone('America/Los_Angeles');
delete from public.schedule_edit_session_shifts where id = pg_temp.at_b(tests.id('tz:session:draft2'));
select pg_temp.b_zone('<+167>-167');
select is(pg_temp.findings(pg_temp.save(tests.id('tz:session:draft2'))), '[["Besiktas", "delete"]]'::jsonb,
  'and so is taking it out of the draft');
update public.schedule_edit_sessions set status = 'discarded' where id = tests.id('tz:session:draft2');

-- Publishing: each place up to its own line.
insert into public.schedule_drafts (id, workspace_id, week_start, name, revision, created_by, updated_by, location_ids) values
  (tests.remember('tz:draft:now', gen_random_uuid()), tests.id('tz'), pg_temp.kw(), 'This week', 1,
   tests.user('tz:owner'), tests.user('tz:owner'), pg_temp.k() || pg_temp.b());
select isnt(
  public.preview_schedule_publication_service(tests.user('tz:owner'), tests.id('tz'), tests.id('tz:draft:now'), pg_temp.k()) ->> 'status',
  'past_week_closed',
  'Kadikoy''s current week can be published at Kadikoy');
select is(
  public.preview_schedule_publication_service(tests.user('tz:owner'), tests.id('tz'), tests.id('tz:draft:now'), pg_temp.b()) ->> 'status',
  'past_week_closed',
  'the same week is closed at Besiktas');
select is(
  public.preview_schedule_publication_service(tests.user('tz:owner'), tests.id('tz'), tests.id('tz:draft:now'), pg_temp.k() || pg_temp.b()) ->> 'status',
  'past_week_closed',
  'and closed for a publish that reaches Besiktas too');

-- Unpublishing: the week published at both places above.
select is(
  public.preview_schedule_unpublication_service(tests.user('tz:owner'), tests.id('tz'), pg_temp.kw(), pg_temp.k()) ->> 'status',
  'unpublish_ready',
  'Kadikoy''s published week can be unpublished at Kadikoy');
select is(
  public.preview_schedule_unpublication_service(tests.user('tz:owner'), tests.id('tz'), pg_temp.kw(), pg_temp.b()) ->> 'status',
  'past_week_closed',
  'not at Besiktas, which has left it');

-- 3. Important dates draw the same line, by their own places (K11) -----------

insert into public.important_dates (id, workspace_id, location_id, location_ids, starts_on, ends_on, title, type, created_by) values
  (tests.remember('tz:date:before', gen_random_uuid()), tests.id('tz'), tests.id('tz:K'), pg_temp.k(),
   pg_temp.kw() - 1, pg_temp.kw() - 1, 'Inventory', 'event', tests.user('tz:owner')),
  (tests.remember('tz:date:on', gen_random_uuid()), tests.id('tz'), tests.id('tz:K'), pg_temp.k(),
   pg_temp.kw(), pg_temp.kw(), 'Staff lunch', 'event', tests.user('tz:owner')),
  (tests.remember('tz:date:b', gen_random_uuid()), tests.id('tz'), tests.id('tz:B'), pg_temp.b(),
   pg_temp.now(pg_temp.b()) - 1, pg_temp.now(pg_temp.b()) - 1, 'Deep clean', 'event', tests.user('tz:owner'));
create temp table tz_dates as
  select value as d from jsonb_array_elements(
    public.read_settings_important_dates_service(tests.user('tz:owner'), tests.id('tz')) -> 'dates');
select is(
  public.read_settings_important_dates_service(tests.user('tz:owner'), tests.id('tz')) ->> 'locked_before',
  pg_temp.now()::text,
  'Settings > Important dates reads the workspace''s line');
select is((select (d ->> 'is_past')::boolean from tz_dates where d ->> 'id' = tests.id('tz:date:before')::text), true,
  'a Kadikoy date that ended the day before Kadikoy''s week is past');
select is((select (d ->> 'can_edit')::boolean from tz_dates where d ->> 'id' = tests.id('tz:date:before')::text), false,
  'and read-only');
select is((select (d ->> 'is_past')::boolean from tz_dates where d ->> 'id' = tests.id('tz:date:on')::text), false,
  'a Kadikoy date on the first day of Kadikoy''s week is not');
select is((select (d ->> 'is_past')::boolean from tz_dates where d ->> 'id' = tests.id('tz:date:b')::text), true,
  'a Besiktas date that ended the day before Besiktas'' week is past, though Kadikoy is still before it');
select is(
  pg_temp.try(format($$select public.set_important_date_state_service(%L, %L, %L, 'unpublish')$$,
    tests.user('tz:owner'), tests.id('tz'), tests.id('tz:date:before'))),
  'P0001 important_date.past',
  'unpublishing the past Kadikoy date is refused');
select is(
  pg_temp.try(format($$select public.set_important_date_state_service(%L, %L, %L, 'unpublish')$$,
    tests.user('tz:owner'), tests.id('tz'), tests.id('tz:date:b'))),
  'P0001 important_date.past',
  'and the past Besiktas one');
select is(
  pg_temp.try(format($$select public.set_important_date_state_service(%L, %L, %L, 'unpublish')$$,
    tests.user('tz:owner'), tests.id('tz'), tests.id('tz:date:on'))),
  'ok',
  'unpublishing the one on Kadikoy''s line goes through');

-- A Besiktas date that runs across Besiktas' line moves to Kadikoy: the days
-- already past at Besiktas stay there; at Kadikoy, still days before, the
-- date keeps them all.
insert into public.important_dates (id, workspace_id, location_id, location_ids, starts_on, ends_on, title, type, created_by) values
  (tests.remember('tz:date:move', gen_random_uuid()), tests.id('tz'), tests.id('tz:B'), pg_temp.b(),
   pg_temp.now(pg_temp.b()) - 2, pg_temp.now(pg_temp.b()) + 2, 'Patio works', 'event', tests.user('tz:owner'));
select is(
  pg_temp.try(format($$select public.save_important_date_service(%L, %L, %L, 'Patio works', 'event', %L, %L, 'none', '', true, %L, %s)$$,
    tests.user('tz:owner'), tests.id('tz'), tests.id('tz:date:move'), pg_temp.now(pg_temp.b()) - 2, pg_temp.now(pg_temp.b()) + 2,
    pg_temp.k(), (select revision from public.important_dates where id = tests.id('tz:date:move')))),
  'ok', 'a date running across Besiktas'' line moves to Kadikoy');
select is(
  (select array_agg(array[d.starts_on, d.ends_on] order by d.starts_on) from public.important_dates d
   where d.workspace_id = tests.id('tz') and d.title = 'Patio works' and d.location_ids = pg_temp.b()),
  array[array[pg_temp.now(pg_temp.b()) - 2, pg_temp.now(pg_temp.b()) - 1]],
  'its days already past at Besiktas stay at Besiktas');
select is(
  (select array[d.starts_on, d.ends_on] from public.important_dates d where d.id = tests.id('tz:date:move') and d.location_ids = pg_temp.k()),
  array[pg_temp.now(pg_temp.b()) - 2, pg_temp.now(pg_temp.b()) + 2],
  'the date itself goes on at Kadikoy with all its days, none of them past there');

-- A closed day lands on each place from that place's own line.
select is(
  (select jsonb_agg(day order by day ->> 'location_id', day ->> 'closed_date') from jsonb_array_elements(
    app_private.important_date_closure_impact(tests.id('tz'), null::public.important_dates, 'closed_day',
      pg_temp.now(pg_temp.b()) - 1, pg_temp.now(pg_temp.b()), 'none', pg_temp.k() || pg_temp.b()) -> 'days') day
   where day ->> 'location_id' = tests.id('tz:B')::text),
  jsonb_build_array(jsonb_build_object('location_id', tests.id('tz:B'), 'closed_date', pg_temp.now(pg_temp.b()))),
  'a closed day on both places reaches Besiktas only from its own week on');

select * from finish();
rollback;

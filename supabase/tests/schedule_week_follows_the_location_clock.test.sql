begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

-- BL-238: a Schedule week is "this week" or "past" by the clock of the places
-- it is for, never by the server's UTC date. Sunday 20:00 in Los Angeles is
-- already Monday 03:00 UTC: Mina, planning on Sunday evening, was told the
-- week she was looking at was past and could not change it.
-- Rules: KARARLAR S-01 (the location's time zone; a week reaching several
-- places is past only once all of them have left it), "Geçmiş hafta kilidi",
-- EKRAN-08 (a post is Past by the clock of its own places).

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
select pg_temp.b_zone('America/Los_Angeles');
update public.schedule_edit_session_shifts set location_id = tests.id('tz:K'), pending_op_type = 'update', revision = revision + 1
where id = pg_temp.at_b(tests.id('tz:session:pub2'));
select pg_temp.b_zone('<+167>-167');
select is(pg_temp.findings(pg_temp.save(tests.id('tz:session:pub2'))), '[["Besiktas", "update"]]'::jsonb,
  'and so is moving it to Kadikoy, whose week is still open');
-- A copy put back by a shift-exchange recovery keeps the published row's own id.
update public.schedule_edit_session_shifts shift set source_published_shift_id = published.id
from public.schedule_published_shifts published
where shift.session_id = tests.id('tz:session:pub2') and published.source_shift_id = shift.source_published_shift_id
  and published.location_id = tests.id('tz:B');
select is(pg_temp.findings(pg_temp.save(tests.id('tz:session:pub2'))), '[["Besiktas", "update"]]'::jsonb,
  'and so is moving a copy a shift-exchange recovery put back');
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
update public.schedule_edit_session_shifts set start_time = '22:30', location_id = tests.id('tz:K'), revision = revision + 1
where id = pg_temp.at_b(tests.id('tz:session:draft2'));
select pg_temp.b_zone('<+167>-167');
select is(pg_temp.findings(pg_temp.save(tests.id('tz:session:draft2'))), '[["Besiktas", "update"]]'::jsonb,
  'and so is moving it to Kadikoy');
select pg_temp.b_zone('America/Los_Angeles');
delete from public.schedule_edit_session_shifts where session_id = tests.id('tz:session:draft2') and id = (
  select d.id from public.schedule_draft_shifts d where d.draft_id = tests.id('tz:draft:saved') and d.location_id = tests.id('tz:B'));
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

-- 3. A post is Past by the clock of its own places (Z1, Z4; EKRAN-08) -----------
-- Kadikoy keeps Los Angeles time, Besiktas Istanbul's again.

update public.locations set timezone = 'Europe/Istanbul' where id = tests.id('tz:B');
create function pg_temp.span(first_day date, last_day date, rows jsonb, event_from time default null,
  event_until time default null) returns text language sql as $$
  select s.starts_at at time zone 'UTC' || ' - ' || s.ends_at at time zone 'UTC'
  from app_private.announcement_span(tests.id('tz'), first_day, last_day, event_from, event_until, 'UTC', rows) s
$$;
create function pg_temp.row_at(place uuid, day text default 'open', opens text default null, closes text default null)
returns jsonb language sql as $$
  select jsonb_build_object('location_id', place, 'day', day, 'opens', opens, 'closes', closes)
$$;
select is(pg_temp.span('2026-10-11', '2026-10-11', jsonb_build_array(pg_temp.row_at(tests.id('tz:K')))),
  '2026-10-11 07:00:00 - 2026-10-12 07:00:00', 'a Kadikoy post on Oct 11 runs from Kadikoy''s midnight to the next');
select is(pg_temp.span('2026-10-11', '2026-10-11', jsonb_build_array(pg_temp.row_at(tests.id('tz:K')), pg_temp.row_at(tests.id('tz:B')))),
  '2026-10-10 21:00:00 - 2026-10-12 07:00:00',
  'at both places it starts with Besiktas'' midnight and is over only once Kadikoy has left the day too');
select is(pg_temp.span('2026-10-11', '2026-10-11', jsonb_build_array(pg_temp.row_at(tests.id('tz:B'), 'short', '18:00', '02:00'))),
  '2026-10-10 21:00:00 - 2026-10-11 23:00:00', 'short hours that close at 2:00 AM run to 2:00 AM the next day');
select is(pg_temp.span('2026-10-11', '2026-10-11', jsonb_build_array(pg_temp.row_at(tests.id('tz:K'))), '09:00', '11:00'),
  '2026-10-11 16:00:00 - 2026-10-11 18:00:00', 'an event time is the place''s own clock');
select is(pg_temp.span('2026-10-11', '2026-10-11', jsonb_build_array(pg_temp.row_at(tests.id('tz:K'), 'closed')), '09:00', '11:00'),
  '2026-10-11 07:00:00 - 2026-10-12 07:00:00', 'a change in hours takes the whole day, whatever the event time says');
select is(pg_temp.span('2026-10-11', '2026-10-12', '[]'), '2026-10-11 00:00:00 - 2026-10-13 00:00:00',
  'a post for no place keeps its own clock');

create function pg_temp.post(title text, place uuid, last_day date) returns uuid language plpgsql as $$
declare made uuid;
begin
  insert into public.announcements (workspace_id, title, body, status, starts_on, ends_on, time_zone, created_by, updated_by,
    published_by, published_at)
  values (tests.id('tz'), title, '', 'published', last_day - 1, last_day, 'UTC', tests.user('tz:owner'), tests.user('tz:owner'),
    tests.user('tz:owner'), now() - interval '3 days')
  returning id into made;
  insert into public.announcement_locations (workspace_id, announcement_id, location_id, day) values (tests.id('tz'), made, place, 'open');
  return made;
end;
$$;
create function pg_temp.shown(id uuid) returns text language sql as $$
  select a ->> 'display_status' from jsonb_array_elements(public.get_announcements_service(tests.user('tz:owner'), tests.id('tz'))
    -> 'announcements') a where (a ->> 'id')::uuid = id
$$;
select tests.remember('tz:ann:k-yesterday', pg_temp.post('Inventory', tests.id('tz:K'), (now() at time zone 'America/Los_Angeles')::date - 1));
select tests.remember('tz:ann:k-today', pg_temp.post('Staff lunch', tests.id('tz:K'), (now() at time zone 'America/Los_Angeles')::date));
select tests.remember('tz:ann:b-yesterday', pg_temp.post('Deep clean', tests.id('tz:B'), (now() at time zone 'Europe/Istanbul')::date - 1));
select is(pg_temp.shown(tests.id('tz:ann:k-yesterday')), 'past', 'a Kadikoy post that ended on Kadikoy''s yesterday is Past');
select is(pg_temp.shown(tests.id('tz:ann:k-today')), 'published', 'one that ends on Kadikoy''s today is still out');
select is(pg_temp.shown(tests.id('tz:ann:b-yesterday')), 'past', 'a Besiktas post that ended on Besiktas'' yesterday is Past');
select is(
  pg_temp.try(format($$select public.set_announcement_state_service(%L, %L, %L, 1, 'unpublish')$$,
    tests.user('tz:owner'), tests.id('tz'), tests.id('tz:ann:k-yesterday'))),
  'PT409 announcement.read_only', 'unpublishing the past Kadikoy post is refused: a past post can only be archived');
select is(
  pg_temp.try(format($$select public.set_announcement_state_service(%L, %L, %L, 1, 'unpublish')$$,
    tests.user('tz:owner'), tests.id('tz'), tests.id('tz:ann:k-today'))),
  'ok', 'unpublishing the one still on at Kadikoy goes through');

select * from finish();
rollback;

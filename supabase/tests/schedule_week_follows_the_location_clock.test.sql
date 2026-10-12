begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

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
select is(pg_temp.at(array[gen_random_uuid()]), '2026-10-12'::date,
  'a place that is not this workspace''s has no clock here: the UTC date answers');

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

-- 2. The Schedule asks for the places of the edit -------------------------------

select is(
  pg_temp.refusal(format($$select public.acquire_schedule_edit_session_service(%L, %L, %L, 'blank', null, %L)$$,
    tests.user('tz:mina'), tests.id('tz'), pg_temp.now(pg_temp.k()) - 7, pg_temp.k())) ->> 'current_week_start',
  pg_temp.now(pg_temp.k())::text,
  'opening a past week of Kadikoy is refused with Kadikoy''s own week as the line');
select ok(
  public.acquire_schedule_edit_session_service(tests.user('tz:mina'), tests.id('tz'), pg_temp.now(pg_temp.k()), 'blank', null, pg_temp.k())
    -> 'session' ->> 'id' is not null,
  'Kadikoy''s own week opens for editing whatever the UTC date');
select tests.remember('tz:session:k', (select s.id from public.schedule_edit_sessions s
  where s.workspace_id = tests.id('tz') and s.holder_user_id = tests.user('tz:mina') and s.status = 'active'));
select is(
  pg_temp.try(format($$select public.acquire_schedule_edit_session_service(%L, %L, %L, 'blank', null, %L)$$,
    tests.user('tz:stranger'), tests.id('tz'), pg_temp.now(pg_temp.k()) - 7, pg_temp.k())),
  '42501 authz.not_member',
  'someone who is not in the workspace hears "no" before anything about the week');

-- The edit's week goes past (a test can not wait for Sunday): saving says so,
-- with the line of the edit's own places.
update public.schedule_edit_sessions set week_start = pg_temp.now(pg_temp.k()) - 7 where id = tests.id('tz:session:k');
select is(
  pg_temp.refusal(format($$select public.save_schedule_edit_session_service(%L, %L, %L, %s, 'late', null, null)$$,
    tests.user('tz:mina'), tests.id('tz'), tests.id('tz:session:k'),
    (select s.revision from public.schedule_edit_sessions s where s.id = tests.id('tz:session:k')))) ->> 'current_week_start',
  pg_temp.now(pg_temp.k())::text,
  'saving an edit of Kadikoy''s past week is refused with Kadikoy''s line');
update public.schedule_edit_sessions set status = 'discarded' where id = tests.id('tz:session:k');

-- Publishing: a draft of Kadikoy's week is open, one a week earlier is closed.
insert into public.schedule_drafts (id, workspace_id, week_start, name, revision, created_by, updated_by, location_ids) values
  (tests.remember('tz:draft:now', gen_random_uuid()), tests.id('tz'), pg_temp.now(pg_temp.k()), 'This week', 1,
   tests.user('tz:owner'), tests.user('tz:owner'), pg_temp.k()),
  (tests.remember('tz:draft:past', gen_random_uuid()), tests.id('tz'), pg_temp.now(pg_temp.k()) - 7, 'Last week', 1,
   tests.user('tz:owner'), tests.user('tz:owner'), pg_temp.k());
select isnt(
  public.preview_schedule_publication_service(tests.user('tz:owner'), tests.id('tz'), tests.id('tz:draft:now'), pg_temp.k()) ->> 'status',
  'past_week_closed',
  'a draft of Kadikoy''s current week can be published');
select is(
  public.preview_schedule_publication_service(tests.user('tz:owner'), tests.id('tz'), tests.id('tz:draft:past'), pg_temp.k()) ->> 'status',
  'past_week_closed',
  'a draft of the week before is closed');

-- Unpublishing: Kadikoy's published week, read at its own line and a week on.
select tests.publish_week('tz', 1, '[{"label": "k1", "person": "mina", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}]');
create temp table tz_published as
  select p.week_start from public.schedule_location_publications p
  where p.workspace_id = tests.id('tz') and p.location_id = tests.id('tz:K') and p.status = 'current';
select is(
  public.preview_schedule_unpublication_service(tests.user('tz:owner'), tests.id('tz'), (select week_start from tz_published), pg_temp.k()) ->> 'status',
  'unpublish_ready',
  'a published week ahead of Kadikoy''s line can be unpublished');
update public.schedule_location_publications set week_start = pg_temp.now(pg_temp.k()) - 7
where workspace_id = tests.id('tz') and location_id = tests.id('tz:K') and status = 'current';
select is(
  public.preview_schedule_unpublication_service(tests.user('tz:owner'), tests.id('tz'), pg_temp.now(pg_temp.k()) - 7, pg_temp.k()) ->> 'status',
  'past_week_closed',
  'a published week before Kadikoy''s line can not be unpublished');

-- 3. Important dates draw the same line, by their own places (K11) -----------

insert into public.important_dates (id, workspace_id, location_id, location_ids, starts_on, ends_on, title, type, created_by) values
  (tests.remember('tz:date:before', gen_random_uuid()), tests.id('tz'), tests.id('tz:K'), pg_temp.k(),
   pg_temp.now(pg_temp.k()) - 1, pg_temp.now(pg_temp.k()) - 1, 'Inventory', 'event', tests.user('tz:owner')),
  (tests.remember('tz:date:on', gen_random_uuid()), tests.id('tz'), tests.id('tz:K'), pg_temp.k(),
   pg_temp.now(pg_temp.k()), pg_temp.now(pg_temp.k()), 'Staff lunch', 'event', tests.user('tz:owner'));
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
select is(
  pg_temp.try(format($$select public.set_important_date_state_service(%L, %L, %L, 'unpublish')$$,
    tests.user('tz:owner'), tests.id('tz'), tests.id('tz:date:before'))),
  'P0001 important_date.past',
  'unpublishing the past Kadikoy date is refused');
select is(
  pg_temp.try(format($$select public.set_important_date_state_service(%L, %L, %L, 'unpublish')$$,
    tests.user('tz:owner'), tests.id('tz'), tests.id('tz:date:on'))),
  'ok',
  'unpublishing the one on Kadikoy''s line goes through');

select * from finish();
rollback;

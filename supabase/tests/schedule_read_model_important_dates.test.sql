begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- B-7 / BL-701 (EKRAN-01 DB-4), EKRAN-08 one record: the Schedule's dates come
-- from the read model, scoped and dated there, not filtered by the API. A post
-- with "Show on Schedule" shows on the week it touches, once per checked
-- location the reader reaches; a post for no location (only for people added
-- by hand) is on the week of whoever it is out to or may change it. Drafts,
-- unpublished and archived posts, and posts not on the Schedule, stay off the
-- grid; a scheduled one shows to the manager before it is out. A yearly post's
-- next year is its own post, so an old year shows only on its own days. The
-- employee's board shows only what is out to them.
--
-- Kadikoy (K) and Besiktas (B); Ayse manages Kadikoy only; Ali works there.

select tests.world('id');
select tests.person('id', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('id', 'ali', 'employee', array['K'], array['cook']);

-- ponytail: posts straight into the tables; saving one is the drawer's own
-- tests' job (closed_days_reach_the_shifts, announcements_and_dates_*).
create function pg_temp.post(title text, locs jsonb, starts date, ends date, extra jsonb default '{}') returns void
language plpgsql as $$
declare made uuid;
begin
  insert into public.announcements (workspace_id, title, body, status, starts_on, ends_on, on_schedule, time_zone,
    created_by, updated_by, archived_at, publish_at, published_at, event_from, event_until, recurrence)
  values (tests.id('id'), title, '', coalesce(extra ->> 'status', 'published')::public.announcement_status, starts, ends,
    coalesce((extra ->> 'on_schedule')::boolean, true), 'America/Los_Angeles', tests.user('id:owner'), tests.user('id:owner'),
    (extra ->> 'archived_at')::timestamptz, (extra ->> 'publish_at')::timestamptz,
    case when coalesce(extra ->> 'status', 'published') = 'published' then now() end,
    (extra ->> 'event_from')::time, (extra ->> 'event_until')::time, coalesce(extra ->> 'recurrence', 'none'))
  returning id into made;
  insert into public.announcement_locations (workspace_id, announcement_id, location_id, day, opens, closes)
  select tests.id('id'), made, tests.id('id:' || l.key), coalesce(l.value ->> 'day', 'open'),
    (l.value ->> 'opens')::time, (l.value ->> 'closes')::time
  from jsonb_each(locs) l;
  insert into public.announcement_people (workspace_id, announcement_id, user_id)
  select tests.id('id'), made, tests.user('id:' || who) from jsonb_array_elements_text(coalesce(extra -> 'people', '[]')) who;
end;
$$;
create function pg_temp.seen(who text) returns table (title text, location text) language sql as $$
  select d ->> 'title', coalesce((select split_part(r.label, ':', 2) from tests.ids r where r.id::text = d ->> 'location_id'), '-')
  from jsonb_array_elements(public.get_schedule_read_model_service(tests.user('id:' || who), tests.id('id'), tests.week(1))
    -> 'important_dates') d
  order by 1, 2
$$;
create function pg_temp.board(who text) returns table (title text, location text) language sql as $$
  select d ->> 'title', coalesce((select split_part(r.label, ':', 2) from tests.ids r where r.id::text = d ->> 'location_id'), '-')
  from jsonb_array_elements(public.get_employee_schedule_board_service(tests.user('id:' || who), tests.id('id'), tests.week(1))
    -> 'important_dates') d
  order by 1, 2
$$;

select pg_temp.post('Both', '{"K": {}, "B": {}}', tests.week(1) + 2, tests.week(1) + 2);
select pg_temp.post('Ali only', '{}', tests.week(1), tests.week(1) + 1, '{"people": ["ali"]}');
select pg_temp.post('Ayse only', '{}', tests.week(1), tests.week(1), '{"people": ["ayse"]}');
select pg_temp.post('Besiktas', '{"B": {}}', tests.week(1) + 3, tests.week(1) + 3);
select pg_temp.post('Spans in', '{"K": {}}', tests.week(1) - 3, tests.week(1));
select pg_temp.post('No end', '{"K": {}}', tests.week(1) + 1, null);
select pg_temp.post('Next week', '{"K": {}}', tests.week(2), tests.week(2));
select pg_temp.post('Coming', '{"K": {"day": "closed"}}', tests.week(1) + 5, tests.week(1) + 5,
  jsonb_build_object('status', 'scheduled', 'publish_at', tests.week(1)));
select pg_temp.post('Draft', '{"K": {}}', tests.week(1), tests.week(1), '{"status": "draft"}');
select pg_temp.post('Unpublished', '{"K": {}}', tests.week(1), tests.week(1), '{"status": "unpublished"}');
select pg_temp.post('Archived', '{"K": {}}', tests.week(1), tests.week(1), jsonb_build_object('archived_at', now()));
select pg_temp.post('Not on the Schedule', '{"K": {}}', tests.week(1), tests.week(1), '{"on_schedule": false}');
select pg_temp.post('Last year', '{"K": {}}', (tests.week(1) + 4 - interval '1 year')::date, (tests.week(1) + 4 - interval '1 year')::date,
  '{"recurrence": "date"}');

select results_eq($$select * from pg_temp.seen('owner')$$,
  $$values ('Ali only', '-'), ('Ayse only', '-'), ('Besiktas', 'B'), ('Both', 'B'), ('Both', 'K'), ('Coming', 'K'), ('No end', 'K'),
    ('Spans in', 'K')$$,
  'the owner sees each post once per location, the one for no location once, one reaching into the week, a scheduled one');
select results_eq($$select * from pg_temp.seen('ayse')$$,
  $$values ('Ayse only', '-'), ('Both', 'K'), ('Coming', 'K'), ('No end', 'K'), ('Spans in', 'K')$$,
  'Ayse sees Kadikoy''s rows and the one sent to her; never Besiktas''s, nor the owner''s note only for Ali');
select is((select d - 'id' - 'publish_at' from jsonb_array_elements(public.get_schedule_read_model_service(tests.user('id:ayse'),
    tests.id('id'), tests.week(1)) -> 'important_dates') d where d ->> 'title' = 'Both'),
  jsonb_build_object('location_id', tests.id('id:K'), 'title', 'Both', 'category', 'general', 'category_other', null,
    'starts_on', tests.week(1) + 2, 'ends_on', tests.week(1) + 2, 'status', 'published', 'day', 'open',
    'opens', null, 'closes', null, 'event_from', null, 'event_until', null),
  'a row says where, what kind, when, whether it is out, and what the day does there');
select is((select jsonb_build_object('status', d ->> 'status', 'day', d ->> 'day', 'publish_at', (d ->> 'publish_at')::timestamptz)
    from jsonb_array_elements(public.get_schedule_read_model_service(tests.user('id:ayse'), tests.id('id'), tests.week(1))
      -> 'important_dates') d where d ->> 'title' = 'Coming'),
  jsonb_build_object('status', 'scheduled', 'day', 'closed', 'publish_at', tests.week(1)::timestamptz),
  'the scheduled one says it is coming, when it goes out, and that Kadikoy is closed');

select results_eq($$select * from pg_temp.board('ali')$$,
  $$values ('Ali only', '-'), ('Both', 'K'), ('No end', 'K'), ('Spans in', 'K')$$,
  'Ali''s board shows what is out to him: Kadikoy''s posts and the one he was added to by hand; nothing scheduled, '
  'nothing of Besiktas''s, not one for someone else');

select * from finish();
rollback;

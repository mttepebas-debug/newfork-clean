begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- B-7 / BL-701 (EKRAN-01 DB-4): the Schedule's important dates come from the
-- read model, scoped and dated there, not filtered by the API. A date shows on
-- the week it touches, once per location the reader reaches; a date for no
-- location is everyone's. Unpublished and archived dates stay off the grid; every
-- published date is on it (EKRAN-08: the drawer has no "flag" switch). An
-- annual date repeats.
--
-- Kadikoy (K) and Besiktas (B); Ayse manages Kadikoy only.

select tests.world('id');
select tests.person('id', 'ayse', 'manager', array['K'], array['cook']);

create function pg_temp.date(title text, locs text[], starts date, ends date, extra jsonb default '{}') returns void language sql as $$
  insert into public.important_dates (workspace_id, location_ids, title, starts_on, ends_on, recurrence, status, archived_at)
  values (tests.id('id'), array(select tests.id('id:' || l) from unnest(locs) l), title, starts, ends,
    coalesce(extra ->> 'recurrence', 'none')::public.important_date_recurrence, coalesce(extra ->> 'status', 'published'),
    (extra ->> 'archived_at')::timestamptz)
$$;
create function pg_temp.seen(who text) returns table (title text, location text) language sql as $$
  select d ->> 'title', coalesce((select split_part(r.label, ':', 2) from tests.ids r where r.id::text = d ->> 'location_id'), '-')
  from jsonb_array_elements(public.get_schedule_read_model_service(tests.user('id:' || who), tests.id('id'), tests.week(1))
    -> 'important_dates') d
  order by 1, 2
$$;

select pg_temp.date('Both', array['K', 'B'], tests.week(1) + 2, tests.week(1) + 2);
select pg_temp.date('Everyone', '{}', tests.week(1), tests.week(1) + 1);
select pg_temp.date('Besiktas', array['B'], tests.week(1) + 3, tests.week(1) + 3);
select pg_temp.date('Spans in', array['K'], tests.week(1) - 3, tests.week(1));
select pg_temp.date('Next week', array['K'], tests.week(2), tests.week(2));
select pg_temp.date('Unpublished', array['K'], tests.week(1), tests.week(1), '{"status": "unpublished"}');
select pg_temp.date('Archived', array['K'], tests.week(1), tests.week(1), jsonb_build_object('archived_at', now()));
select pg_temp.date('Annual', array['K'], (tests.week(1) + 4 - interval '2 years')::date, (tests.week(1) + 4 - interval '2 years')::date,
  '{"recurrence": "annual"}');
select pg_temp.date('Annual later', array['K'], (tests.week(1) + 4 + interval '1 year')::date, (tests.week(1) + 4 + interval '1 year')::date,
  '{"recurrence": "annual"}');

select results_eq($$select * from pg_temp.seen('owner')$$,
  $$values ('Annual', 'K'), ('Besiktas', 'B'), ('Both', 'B'), ('Both', 'K'), ('Everyone', '-'), ('Spans in', 'K')$$,
  'the owner sees each date once per location, the shared one once, a date reaching into the week, an annual one two years on');
select results_eq($$select * from pg_temp.seen('ayse')$$,
  $$values ('Annual', 'K'), ('Both', 'K'), ('Everyone', '-'), ('Spans in', 'K')$$,
  'Ayse sees Kadikoy''s rows and the shared date, never Besiktas''s');
select is((select d - 'id' from jsonb_array_elements(public.get_schedule_read_model_service(tests.user('id:ayse'), tests.id('id'), tests.week(1))
    -> 'important_dates') d where d ->> 'title' = 'Both'),
  jsonb_build_object('location_id', tests.id('id:K'), 'title', 'Both', 'type', 'event', 'starts_on', tests.week(1) + 2,
    'ends_on', tests.week(1) + 2, 'recurrence', 'none'),
  'a row says where, what kind, when and whether it repeats');

select * from finish();
rollback;

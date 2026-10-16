begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- BILDIRIM-12: a person's list pages by (created_at, id), newest first. Two notices written to one person in
-- one transaction share their time; a page break between them loses neither. The next page starts after
-- the last row's time and id, both given or neither.

select tests.world('fp');
select tests.person('fp', 'ali', 'employee', array['K'], array['cook']);

-- One transaction: now() is the same for all three.
select app_private.notify('schedule.published', tests.id('fp'), array[tests.user('fp:ali')], 'fp:' || n, 'Notice ' || n)
from generate_series(1, 3) n;

create function pg_temp.page(before_at timestamptz, before_id uuid) returns jsonb language sql as $$
  select public.get_notification_feed_service(tests.user('fp:ali'), tests.id('fp'), 'all', before_at, before_id, 1)
$$;
create temp table pages (n integer, page jsonb);
insert into pages values (1, pg_temp.page(null, null));
insert into pages select 2, pg_temp.page((page -> 'items' -> 0 ->> 'created_at')::timestamptz, (page -> 'items' -> 0 ->> 'id')::uuid)
from pages where n = 1;
insert into pages select 3, pg_temp.page((page -> 'items' -> 0 ->> 'created_at')::timestamptz, (page -> 'items' -> 0 ->> 'id')::uuid)
from pages where n = 2;

select is((select count(distinct n.created_at)::integer from public.person_notifications n where n.user_id = tests.user('fp:ali')), 1,
  'the three notices share their time');
select is(
  (select array_agg(page -> 'items' -> 0 ->> 'title' order by n) from pages),
  (select array_agg(n.title order by n.id desc) from public.person_notifications n where n.user_id = tests.user('fp:ali')),
  'page size 1: three pages, each notice once, newest id first');
select is((select array_agg((page ->> 'has_more')::boolean order by n) from pages), array[true, true, false],
  'and the last page says there is no more');
select is(jsonb_array_length(pg_temp.page((select (page -> 'items' -> 0 ->> 'created_at')::timestamptz from pages where n = 3),
  (select (page -> 'items' -> 0 ->> 'id')::uuid from pages where n = 3)) -> 'items'), 0, 'after the last: nothing');
select throws_ok(format($$select pg_temp.page(%L, null)$$, now()), '22023', null, 'a time without an id is no page');
select throws_ok(format($$select pg_temp.page(null, %L)$$, gen_random_uuid()), '22023', null, 'nor an id without a time');

select * from finish();
rollback;

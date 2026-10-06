begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- EKRAN-02 A0 (R2-03): Requests → Time off shows 50 requests a page and
-- "Older" asks for the next page with the cursor the first page returned.
-- Ali has 51 waiting requests; Ayşe (his manager) must see all 51 across
-- "Newest" and "Older", none twice, also when two requests were sent in the
-- same instant and the page edge falls between them.
select tests.world('pg');
select tests.person('pg', 'mgr', 'manager', array['K'], array['cook']);
select tests.person('pg', 'ali', 'employee', array['K'], array['cook']);
select tests.leave('pg', 'ali', n) from generate_series(1, 51) n;

create temp table pg_pages(label text primary key, model jsonb);

-- Distinct send times: newest first is the order the list shows.
with sent as (
  select r.id, row_number() over (order by r.id) k
  from public.schedule_time_off_requests r where r.workspace_id = tests.id('pg')
)
update public.schedule_time_off_requests r set created_at = now() - k * interval '1 minute'
from sent where sent.id = r.id;

insert into pg_pages values ('newest', public.get_schedule_requests_service(tests.user('pg:mgr'), tests.id('pg')));
insert into pg_pages select 'older', public.get_schedule_requests_service(tests.user('pg:mgr'), tests.id('pg'),
  'needs_review', null, '', (model->>'time_off_next_cursor')::timestamptz) from pg_pages where label = 'newest';

select is((select count(distinct x->>'id')::integer from pg_pages, jsonb_array_elements(model->'time_off_requests') x), 51,
  'Newest + Older show all 51 waiting requests');
select is((select count(*)::integer from pg_pages, jsonb_array_elements(model->'time_off_requests') x), 51,
  'no request shows on both pages');
select is((select model->'time_off_next_cursor' from pg_pages where label = 'older'), 'null'::jsonb,
  'the last page offers no Older');

-- Same instant across the page edge: requests 49, 50 and 51 (newest first)
-- were sent together.
with sent as (
  select r.id, row_number() over (order by r.created_at desc, r.id) k
  from public.schedule_time_off_requests r where r.workspace_id = tests.id('pg')
)
update public.schedule_time_off_requests r set created_at = (select min(created_at) from public.schedule_time_off_requests where workspace_id = tests.id('pg'))
from sent where sent.id = r.id and sent.k between 49 and 51;

truncate pg_pages;
insert into pg_pages values ('newest', public.get_schedule_requests_service(tests.user('pg:mgr'), tests.id('pg')));
insert into pg_pages select 'older', public.get_schedule_requests_service(tests.user('pg:mgr'), tests.id('pg'),
  'needs_review', null, '', (model->>'time_off_next_cursor')::timestamptz) from pg_pages where label = 'newest'
  and model->>'time_off_next_cursor' is not null;

select is((select count(distinct x->>'id')::integer from pg_pages, jsonb_array_elements(model->'time_off_requests') x), 51,
  'requests sent in the same instant are not lost at the page edge');
select is((select count(*)::integer from pg_pages, jsonb_array_elements(model->'time_off_requests') x), 51,
  'requests sent in the same instant show once');

-- Every request sent in one instant: one page, nothing lost.
update public.schedule_time_off_requests set created_at = now() where workspace_id = tests.id('pg');
select is(jsonb_array_length(public.get_schedule_requests_service(tests.user('pg:mgr'), tests.id('pg'))->'time_off_requests'), 51,
  'a page never splits requests sent in the same instant');

select * from finish();
rollback;

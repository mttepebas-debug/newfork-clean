begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- BL-102: pg_timezone_names reads every zone file from disk on each call
-- (~33 ms), so zone names are checked with app_private.timezone_name_valid(),
-- which looks in a snapshot table first.

-- The helper accepts exactly what pg_timezone_names lists.
select is(
  (select count(*)::integer from pg_catalog.pg_timezone_names where not app_private.timezone_name_valid(name)),
  0,
  'every name pg_timezone_names lists is accepted'
);
select is(app_private.timezone_name_valid('PST'), false, 'an abbreviation is refused');
select is(app_private.timezone_name_valid('UTC+3'), false, 'a POSIX offset is refused');
select is(app_private.timezone_name_valid('not a zone'), false, 'free text is refused');
select is(app_private.timezone_name_valid(null), false, 'a missing zone is refused, not unknown');

-- A zone that newer tzdata adds after the snapshot still passes, through the catalog.
delete from app_private.timezone_names where name = 'Europe/Istanbul';
select ok(app_private.timezone_name_valid('Europe/Istanbul'), 'a zone missing from the snapshot still passes');

-- Only these functions may scan pg_timezone_names: the helper's own fallback,
-- and one FOUNDATION-B entry point that changes with that work (terminate_employee
-- moved to the helper in stage 5.2). Anything else calls the helper; a function
-- rewritten from its pre-BL-102 text fails here.
create temporary table allowed_scanner (name text primary key);
insert into allowed_scanner values
  ('app_private.timezone_name_valid'),
  ('public.set_employee_document_timezone_service');
create temporary table scanner as
select n.nspname || '.' || p.proname as name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'app_private') and p.prosrc like '%pg_timezone_names%';

select is(
  array(select name from scanner where name not in (select name from allowed_scanner) order by 1),
  '{}'::text[],
  'no other function scans pg_timezone_names; call app_private.timezone_name_valid()'
);
select is(
  array(select name from allowed_scanner where name not in (select name from scanner) order by 1),
  '{}'::text[],
  'every allowed function still scans pg_timezone_names; remove the ones that stopped from this list'
);

select * from finish();
rollback;

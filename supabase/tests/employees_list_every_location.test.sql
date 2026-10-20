begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- BL-436 / BL-428 (EKRAN-03 K6, G3): a row of the Employees list names every
-- location the person works at, the primary first, then A to Z; the screen
-- filters on "works here", not on the primary only, and the location cell
-- names the first of them. Who is listed does not change: a manager still
-- lists only the people working at their own locations (M2), and sees the
-- names of all of their locations (KARARLAR "Kişinin bütün lokasyon adları
-- görünür", BL-417).
-- Example: Ali works at Besiktas (primary) and at Kadikoy; the owner works at
-- both; Rana is remote. Ayse manages Kadikoy, Mehmet
-- Besiktas.

select tests.world('el');
select tests.person('el', 'ali', 'employee', array['B', 'K'], array['cook']);
select tests.person('el', 'emre', 'employee', array['B'], array['cook']);
select tests.person('el', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('el', 'mehmet', 'manager', array['B'], array['cook']);
select tests.person('el', 'rana', 'employee', '{}', array['cook']);

-- One list row's locations as "Name*" (primary) or "Name", in the row's order.
create function pg_temp.places(reader text, person text) returns text[] language sql as $$
  select array(
    select (place ->> 'name') || case when (place ->> 'primary')::boolean then '*' else '' end
    from public.list_employees_service(tests.user('el:' || reader), tests.id('el'), false, '', 'all', 200, 0) row,
      jsonb_array_elements(row.locations) with ordinality as listed(place, n)
    where row.id = tests.id('el:' || person)
    order by n
  )
$$;
-- Whom a reader's list holds, by label, among the world's people.
create function pg_temp.listed(reader text, search text default '') returns text[] language sql as $$
  select coalesce(array_agg(person order by person), '{}')
  from unnest(array['owner', 'ali', 'emre', 'ayse', 'mehmet', 'rana']) person
  where exists (
    select 1 from public.list_employees_service(tests.user('el:' || reader), tests.id('el'), false, search, 'all', 200, 0) row
    where row.id = tests.id('el:' || person))
$$;

-- 1. A location's shape (the row's columns: employee_drawer_reads) -------------

select is(
  (select array(select k from jsonb_object_keys(row.locations -> 0) k order by k)
   from public.list_employees_service(tests.user('el:owner'), tests.id('el'), false, '', 'all', 200, 0) row
   where row.id = tests.id('el:ali')),
  array['id', 'name', 'primary'],
  'each location says its id, its name and whether it is the primary one');

-- 2. Every location, the primary first --------------------------------------------------

select is(pg_temp.places('owner', 'ali'), array['Besiktas*', 'Kadikoy'],
  'Ali''s row names Besiktas, his primary, then Kadikoy, where he also works');
select is(
  (select row.locations -> 0 ->> 'id'
   from public.list_employees_service(tests.user('el:owner'), tests.id('el'), false, '', 'all', 200, 0) row
   where row.id = tests.id('el:ali')),
  tests.id('el:B')::text,
  'the location carries its id, so the screen can filter on it');
-- DAVET-ERISIM: setup files the owner with the first location as primary (Besiktas: both made at once, A to Z).
select is(pg_temp.places('owner', 'owner'), array['Besiktas*', 'Kadikoy'],
  'the owner set up today works at every location, the first one primary');
-- ponytail: an owner of a workspace set up before has no primary; one is made by hand.
update public.employee_location_assignments set is_primary = false where employee_id = tests.id('el:owner');
select is(pg_temp.places('owner', 'owner'), array['Besiktas', 'Kadikoy'],
  'an owner with no primary works at both, A to Z (BL-428: no "Unassigned +1")');
select is(pg_temp.places('owner', 'emre'), array['Besiktas*'], 'one location, the primary one');
select is(pg_temp.places('owner', 'rana'), '{}'::text[], 'a remote person has an empty list, never null');

-- 3. Who is listed does not change -----------------------------------------------------

select is(pg_temp.listed('ayse'), array['ali', 'ayse', 'owner'],
  'the Kadikoy manager lists only who works at Kadikoy: Ali by his second location, the owner, herself');
select is(pg_temp.listed('mehmet'), array['ali', 'emre', 'mehmet', 'owner'],
  'the Besiktas manager lists only who works at Besiktas');
select is(pg_temp.places('ayse', 'ali'), array['Besiktas*', 'Kadikoy'],
  'the Kadikoy manager reads the name of Ali''s Besiktas too (BL-417), not Besiktas'' people');
select is(pg_temp.listed('owner'), array['ali', 'ayse', 'emre', 'mehmet', 'owner', 'rana'],
  'the owner lists everybody');

-- 4. Search finds a person by any of their locations -----------------------------------

select is(pg_temp.listed('owner', 'Kadikoy'), array['ali', 'ayse', 'owner'],
  'searching Kadikoy finds Ali by his second location, and the owner');
select is(pg_temp.listed('mehmet', 'Kadikoy'), array['ali', 'owner'],
  'the Besiktas manager''s search stays inside whom he may list');

-- 5. The refusals are unchanged ---------------------------------------------------------

select throws_ok(
  format('select * from public.list_employees_service(%L, %L)', tests.user('el:emre'), tests.id('el')),
  '42501', null, 'an employee still may not list the team');

-- 6. Ended and archived ----------------------------------------------------------------
-- Last, as they change the world. A location they were taken off is gone from
-- the row; an archived one stays, as it stays on the drawer's list until the
-- person is taken off it.

update public.employee_location_assignments set ended_at = now()
where employee_id = tests.id('el:ali') and location_id = tests.id('el:K');
select is(pg_temp.places('owner', 'ali'), array['Besiktas*'], 'a location Ali was taken off leaves his row');
update public.locations set archived_at = now() where id = tests.id('el:B');
select is(pg_temp.places('owner', 'emre'), array['Besiktas*'], 'an archived location stays on the row while he is on it');

select * from finish();
rollback;

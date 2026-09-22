begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- Two things guard every table here, and neither is visible from the table
-- itself. The Data API roles hold no privileges at all, and row level security
-- is on with no policy, which denies every row. Access happens somewhere else:
-- `service_role` carries BYPASSRLS, and the SECURITY DEFINER functions run as
-- the owner and check permission in their own first lines.
--
-- That arrangement is invisible, so it is easy to undo by accident. Granting a
-- table to `authenticated` without writing a policy makes the app read an empty
-- list with no error; granting it and turning RLS off opens the table to
-- everybody holding an anon key. These assertions name the table that did it.

-- Nothing is readable by an unauthenticated request. There is no public data in
-- this product: every read belongs to somebody's workspace.
select is(
  (select string_agg(space.nspname || '.' || entity.relname, ', ' order by entity.relname)
   from pg_class entity
   join pg_namespace space on space.oid = entity.relnamespace
   where entity.relkind = 'r'
     and space.nspname in ('public', 'app_private')
     and has_table_privilege('anon', entity.oid, 'SELECT')),
  null,
  'no table is readable by an anonymous request'
);

-- A grant with row level security switched off is the one combination that
-- really opens a table. The others fail closed.
select is(
  (select string_agg(space.nspname || '.' || entity.relname, ', ' order by entity.relname)
   from pg_class entity
   join pg_namespace space on space.oid = entity.relnamespace
   where entity.relkind = 'r'
     and space.nspname in ('public', 'app_private')
     and has_table_privilege('authenticated', entity.oid, 'SELECT')
     and not entity.relrowsecurity),
  null,
  'no table a signed-in request can read has row level security switched off'
);

-- A grant with row level security on but no policy fails closed instead, and
-- reads as an empty list rather than an error. Nothing should rely on that.
select is(
  (select string_agg(space.nspname || '.' || entity.relname, ', ' order by entity.relname)
   from pg_class entity
   join pg_namespace space on space.oid = entity.relnamespace
   where entity.relkind = 'r'
     and space.nspname in ('public', 'app_private')
     and entity.relrowsecurity
     and not exists (select 1 from pg_policy policy where policy.polrelid = entity.oid)
     and (
       has_table_privilege('authenticated', entity.oid, 'SELECT')
       or has_table_privilege('authenticated', entity.oid, 'INSERT')
       or has_table_privilege('authenticated', entity.oid, 'UPDATE')
       or has_table_privilege('authenticated', entity.oid, 'DELETE')
     )),
  null,
  'no table is granted to a signed-in request and then left without a policy'
);

-- The other half of the arrangement: a SECURITY DEFINER function runs as the
-- owner, so it must not be reachable without signing in. This is the check that
-- caught list_my_workspaces() and save_employee() after a drop and recreate
-- took their grants away and PUBLIC got them back.
select is(
  (select string_agg(routine.proname, ', ' order by routine.proname)
   from pg_proc routine
   join pg_namespace space on space.oid = routine.pronamespace
   where space.nspname = 'public'
     and routine.prosecdef
     and routine.proacl is null),
  null,
  'no definer function in the API schema is left executable by everybody'
);

select * from finish();
rollback;

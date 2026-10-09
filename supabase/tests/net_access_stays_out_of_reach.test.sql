begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- pg_net gives the database the ability to make outbound HTTP calls, and
-- Supabase installs it with the door wide open: the `net` schema is owned by
-- `supabase_admin`, PUBLIC holds USAGE on it, and its functions carry no ACL at
-- all, which means PUBLIC may execute them. `anon` is a member of PUBLIC.
--
-- We cannot close that door. A revoke run as `postgres` answers
-- `WARNING: no privileges could be revoked` and changes nothing, because only
-- the grantor may revoke and the grantor is `supabase_admin`. Reinstalling the
-- extension does not help either: the event trigger `issue_pg_net_access` hands
-- the grants straight back. Dropping the extension is not open to us either --
-- app_private.dispatch_cron_endpoint uses it to call our own cron endpoints.
--
-- What we do control is whether anything on our side can be used to reach it.
-- PostgREST serves `public` and `graphql_public` and nothing else, so today
-- there is no route: nobody holding an anon key can name `net.http_post`. The
-- realistic way that changes is somebody writing a convenient wrapper -- "post
-- this to that URL" -- in a schema the API serves, or granting one of ours to
-- the Data API roles. Either would turn a loose grant we cannot fix into a
-- reachable one.
--
-- These assertions look only at functions we own. Supabase's own
-- extensions.grant_pg_net_access is theirs and is not ours to judge.

-- The corridor itself: nothing the API serves may mention pg_net.
select is(
  (select string_agg(space.nspname || '.' || routine.proname, ', ' order by routine.proname)
   from pg_proc routine
   join pg_namespace space on space.oid = routine.pronamespace
   join pg_language lang on lang.oid = routine.prolang
   where space.nspname in ('public', 'graphql_public')
     and routine.proowner = 'postgres'::regrole
     and routine.prokind = 'f'
     and lang.lanname not in ('internal', 'c')
     and pg_get_functiondef(routine.oid) ilike '%net.http%'),
  null,
  'no function the Data API serves reaches pg_net'
);

-- And the other way in: one of ours, in any schema, handed to a Data API role.
select is(
  (select string_agg(space.nspname || '.' || routine.proname, ', ' order by routine.proname)
   from pg_proc routine
   join pg_namespace space on space.oid = routine.pronamespace
   join pg_language lang on lang.oid = routine.prolang
   where space.nspname not in ('net', 'extensions', 'pg_catalog', 'information_schema')
     and routine.proowner = 'postgres'::regrole
     and routine.prokind = 'f'
     and lang.lanname not in ('internal', 'c')
     and pg_get_functiondef(routine.oid) ilike '%net.http%'
     and has_function_privilege('anon', routine.oid, 'EXECUTE')),
  null,
  'no function of ours that reaches pg_net is executable by an anonymous request'
);

select is(
  (select string_agg(space.nspname || '.' || routine.proname, ', ' order by routine.proname)
   from pg_proc routine
   join pg_namespace space on space.oid = routine.pronamespace
   join pg_language lang on lang.oid = routine.prolang
   where space.nspname not in ('net', 'extensions', 'pg_catalog', 'information_schema')
     and routine.proowner = 'postgres'::regrole
     and routine.prokind = 'f'
     and lang.lanname not in ('internal', 'c')
     and pg_get_functiondef(routine.oid) ilike '%net.http%'
     and has_function_privilege('authenticated', routine.oid, 'EXECUTE')),
  null,
  'nor by a signed-in one'
);

-- The one legitimate user of pg_net, named so the exception is written down
-- rather than left to be rediscovered. pg_cron calls it as `postgres`.
select is(
  (select coalesce(routine.proacl::text, 'granted to everybody')
   from pg_proc routine
   join pg_namespace space on space.oid = routine.pronamespace
   where space.nspname = 'app_private' and routine.proname = 'dispatch_cron_endpoint'),
  '{postgres=X/postgres}',
  'the cron dispatcher is the only thing that calls out, and only postgres may run it'
);

select * from finish();
rollback;

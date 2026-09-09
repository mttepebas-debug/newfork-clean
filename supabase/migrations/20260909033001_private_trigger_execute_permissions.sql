-- Fresh provider bootstraps can grant authenticated EXECUTE through their
-- default privileges. These internal trigger functions are never client RPCs.
-- Revoke their inherited/explicit client grants regardless of bootstrap state;
-- retain owners, service-role grants, trigger attachments and function bodies.
do $private_triggers$
declare target regprocedure;
begin
 for target in
  select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef and p.prorettype='pg_catalog.trigger'::regtype
  order by p.oid
 loop
  execute format('revoke execute on function %s from public, anon, authenticated',target);
 end loop;
end $private_triggers$;

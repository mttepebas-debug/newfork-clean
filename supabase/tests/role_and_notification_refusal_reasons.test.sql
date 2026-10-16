begin;
-- BL-1049: a role or notification settings write refused with PT409 says which
-- kind of refusal in its hint (the method of BL-1028). The notification policy
-- screen read "stale" out of the English sentence, and the role editor and the
-- personal preferences had nothing to tell "changed meanwhile" from "in use".
-- The notification settings and preferences went with the old notification
-- system (BILDIRIM-06); the role refusals stay.
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

create function pg_temp.refusal(statement text) returns text language plpgsql as $$
declare state text; key text;
begin
 execute statement;
 return 'no refusal';
exception when others then
 get stacked diagnostics state=returned_sqlstate, key=pg_exception_hint;
 return state||' '||coalesce(nullif(key,''),'(no hint)');
end;
$$;

-- Every PT409 these functions raise carries one of the known keys.
create temp table refusal_functions as
select p.oid, n.nspname||'.'||p.proname fn
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname||'.'||p.proname = any(array[
 'public.save_workspace_role_service','public.delete_workspace_role_service']);
create temp table refusal_raises as
select fn, m[1] statement
from refusal_functions, regexp_matches(pg_get_functiondef(oid), $re$(raise\s+exception\s+'(?:[^']|'')*'[^;]*;)$re$, 'gi') m
where m[1] ~* 'PT409';
select is((select count(distinct fn)::int from refusal_functions),2,'both role functions exist');
select is((select count(*)::int from refusal_raises),2,'the two PT409 refusals are found in the function bodies');
select is((select coalesce(array_agg(distinct fn order by fn),'{}') from refusal_raises where statement !~* 'hint'),'{}'::text[],
 'no role PT409 is raised without a reason key');
select is((select coalesce(array_agg(distinct key order by key),'{}') from (select (regexp_match(statement,$re$hint\s*=\s*'([^']*)'$re$,'i'))[1] key from refusal_raises) k
 where key is null or key not in ('role.changed','role.in_use')),'{}'::text[],
 'every key is one the screens know');

-- The refusals themselves, in a test world.
select tests.world('rn');
select tests.role('rn', 'floor lead', 'manager', array(
  select rp.permission_key from public.workspace_role_permissions rp join public.workspace_roles r on r.id = rp.role_id
  where r.workspace_id = tests.id('rn') and r.system_key = 'manager'));
select tests.role('rn', 'unused', 'manager', array['workspace.read']);
select tests.person('rn', 'ali', 'floor lead', array['K'], array['cook']);
create temp table ids as select
 tests.user('rn:owner') owner_user, tests.user('rn:ali') ali_user, tests.id('rn') workspace,
 tests.id('rn:role:floor lead') lead_role, tests.id('rn:role:unused') unused_role;

-- Roles: somebody saved the role after it was opened; a role still held.
select is(pg_temp.refusal(format(
 'select public.save_workspace_role_service(%L,%L,%L,''unused'',''Renamed meanwhile'',''manager'',array[''workspace.read''],%L)',
 owner_user, workspace, unused_role, timestamptz '2000-01-01')),
 'PT409 role.changed', 'a role saved by somebody else meanwhile says role.changed') from ids;
select is(pg_temp.refusal(format(
 'select public.save_workspace_role_service(%L,%L,%L,''unused'',''Current'',''manager'',array[''workspace.read''],%L)',
 owner_user, workspace, unused_role, (select updated_at from public.workspace_roles where id = unused_role))),
 'no refusal', 'the same save with the role''s current version goes through') from ids;
select is(pg_temp.refusal(format('select public.delete_workspace_role_service(%L,%L,%L)', owner_user, workspace, lead_role)),
 'PT409 role.in_use', 'deleting a role a person still holds says role.in_use') from ids;
select is(pg_temp.refusal(format('select public.delete_workspace_role_service(%L,%L,%L)', owner_user, workspace, unused_role)),
 'no refusal', 'a role nobody holds is deleted') from ids;

select * from finish();
rollback;

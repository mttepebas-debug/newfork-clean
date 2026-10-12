begin;
-- BL-1047: an announcement write refused with PT409 says which kind of refusal
-- in its hint (the method of BL-1028). "Someone changed it since you opened
-- it" and "an archived announcement cannot be edited" used to share the one
-- code and no key, so the editor showed the database's own words.
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
 'public.publish_announcement_service','public.save_announcement_audience_service','public.set_announcement_state_service']);
create temp table refusal_raises as
select fn, m[1] statement
from refusal_functions, regexp_matches(pg_get_functiondef(oid), $re$(raise\s+exception\s+'(?:[^']|'')*'[^;]*;)$re$, 'gi') m
where m[1] ~* 'PT409';
select is((select count(distinct fn)::int from refusal_functions),3,'every listed announcement function exists');
select is((select count(*)::int from refusal_raises),4,'the four announcement PT409 refusals are found in the function bodies');
select is((select coalesce(array_agg(distinct fn order by fn),'{}') from refusal_raises where statement !~* 'hint'),'{}'::text[],
 'no announcement PT409 is raised without a reason key');
select is((select coalesce(array_agg(distinct key order by key),'{}') from (select (regexp_match(statement,$re$hint\s*=\s*'([^']*)'$re$,'i'))[1] key from refusal_raises) k
 where key is null or key not in ('announcement.changed','announcement.archived')),'{}'::text[],'every key is one the editor knows');

-- The seed workspace's owner writes one draft and the editor's revision goes stale.
create temp table announcement_state as
select (public.save_announcement_audience_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',null,null,
 'Refusal keys','Body','general',array['employee'],array[]::uuid[],null,null,null,'{}'::uuid[],'{}'::uuid[])->>'announcement_id')::uuid announcement_id;
select is((select revision from public.announcements where id=(select announcement_id from announcement_state)),1,'the draft starts at revision 1');

select is(pg_temp.refusal($$select public.save_announcement_audience_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
 (select announcement_id from announcement_state),0,'Refusal keys','Edited elsewhere','general',array['employee'],array[]::uuid[],null,null,null,'{}'::uuid[],'{}'::uuid[])$$),
 'PT409 announcement.changed','a save over a newer revision says the announcement changed');
select is(pg_temp.refusal($$select public.publish_announcement_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select announcement_id from announcement_state),0)$$),
 'PT409 announcement.changed','a publish over a newer revision says the announcement changed');
select is(pg_temp.refusal($$select public.set_announcement_state_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select announcement_id from announcement_state),0,'archive')$$),
 'PT409 announcement.changed','an archive over a newer revision says the announcement changed');
select is(pg_temp.refusal($$select public.set_announcement_state_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select announcement_id from announcement_state),1,'unpublish')$$),
 'PT409 announcement.changed','unpublishing a draft nobody published says the announcement changed');

-- Archived at its current revision, an edit is a standing no, not a reload.
select is((public.set_announcement_state_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select announcement_id from announcement_state),1,'archive')->>'revision')::integer,
 2,'the owner archives the draft');
select is(pg_temp.refusal($$select public.save_announcement_audience_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
 (select announcement_id from announcement_state),2,'Refusal keys','Too late','general',array['employee'],array[]::uuid[],null,null,null,'{}'::uuid[],'{}'::uuid[])$$),
 'PT409 announcement.archived','an archived announcement cannot be edited, and says so');
select is(pg_temp.refusal($$select public.publish_announcement_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select announcement_id from announcement_state),2)$$),
 'PT409 announcement.changed','publishing an archived announcement says it changed: the editor offered Publish on a version that was not archived');
select is((select body from public.announcements where id=(select announcement_id from announcement_state)),'Body','no refused write changed the announcement');

select * from finish();
rollback;

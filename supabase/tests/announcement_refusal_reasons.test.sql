begin;
-- BL-1047: an announcement write refused with PT409 says which kind of refusal
-- in its hint (the method of BL-1028). "Someone changed it since you opened
-- it" and "this post can't change anymore" (archived or past, EKRAN-08) are
-- two keys, so the drawer never shows the database's own words.
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
 'public.preview_announcement_service','public.save_announcement_service','public.set_announcement_state_service',
 'app_private.announcement_apply','app_private.announcement_bring_back']);
create temp table refusal_raises as
select fn, m[1] statement
from refusal_functions, regexp_matches(pg_get_functiondef(oid), $re$(raise\s+exception\s+'(?:[^']|'')*'[^;]*;)$re$, 'gi') m
where m[1] ~* 'PT409';
select is((select count(distinct fn)::int from refusal_functions),5,'every listed announcement function exists');
-- Fifteen since Remind's "Everyone acknowledged." went with the old notifications (BILDIRIM-06).
select is((select count(*)::int from refusal_raises),15,'the fifteen announcement PT409 refusals are found in the function bodies');
select is((select coalesce(array_agg(distinct fn order by fn),'{}') from refusal_raises where statement !~* 'hint'),'{}'::text[],
 'no announcement PT409 is raised without a reason key');
select is((select coalesce(array_agg(distinct key order by key),'{}') from (select (regexp_match(statement,$re$hint\s*=\s*'([^']*)'$re$,'i'))[1] key from refusal_raises) k
 where key is null or key not in ('announcement.changed','announcement.read_only','announcement.shifts_changed','announcement.shift_tied',
   'announcement.shift_conflict','announcement.bring_back_changed','announcement.bring_back_conflict')),'{}'::text[],'every key is one the drawer knows');

-- The seed workspace's owner writes one draft and the drawer's revision goes stale.
create temp table announcement_state as
select (public.save_announcement_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',null,null,
 '{"title": "Refusal keys", "body": "Body"}','draft')->>'announcement_id')::uuid announcement_id;
select is((select revision from public.announcements where id=(select announcement_id from announcement_state)),1,'the draft starts at revision 1');

select is(pg_temp.refusal($$select public.save_announcement_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
 (select announcement_id from announcement_state),0,'{"title": "Refusal keys", "body": "Edited elsewhere"}','draft')$$),
 'PT409 announcement.changed','a save over a newer revision says the post changed');
select is(pg_temp.refusal($$select public.save_announcement_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
 (select announcement_id from announcement_state),0,'{"title": "Refusal keys", "body": "Body"}','publish')$$),
 'PT409 announcement.changed','a publish over a newer revision says the post changed');
select is(pg_temp.refusal($$select public.set_announcement_state_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select announcement_id from announcement_state),0,'archive')$$),
 'PT409 announcement.changed','an archive over a newer revision says the post changed');
select is(pg_temp.refusal($$select public.set_announcement_state_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select announcement_id from announcement_state),1,'unpublish')$$),
 'PT409 announcement.changed','unpublishing a draft nobody published says the post changed');
select is(pg_temp.refusal($$select public.save_announcement_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
 (select announcement_id from announcement_state),1,'{"title": "Refusal keys", "body": "Body"}','save')$$),
 'PT409 announcement.changed','Save is for a published post: on a draft the drawer offered it on a version that was published');

-- Archived at its current revision, a change is a standing no, not a reload.
select is((public.set_announcement_state_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select announcement_id from announcement_state),1,'archive')->>'revision')::integer,
 2,'the owner archives the draft');
select is(pg_temp.refusal($$select public.save_announcement_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
 (select announcement_id from announcement_state),2,'{"title": "Refusal keys", "body": "Too late"}','draft')$$),
 'PT409 announcement.read_only','an archived post cannot be edited, and says so');
select is(pg_temp.refusal($$select public.save_announcement_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
 (select announcement_id from announcement_state),2,'{"title": "Refusal keys", "body": "Body"}','publish')$$),
 'PT409 announcement.read_only','nor published');
select is(pg_temp.refusal($$select public.set_announcement_state_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select announcement_id from announcement_state),2,'archive')$$),
 'PT409 announcement.read_only','nor archived again');
select is(pg_temp.refusal($$select public.preview_announcement_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select announcement_id from announcement_state),'{}')$$),
 'PT409 announcement.read_only','and its drawer has nothing to check');
select is(pg_temp.refusal($$select public.set_announcement_state_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select announcement_id from announcement_state),2,'restore')$$),
 '22023 announcement.invalid','there is no Restore');
select is((select body from public.announcements where id=(select announcement_id from announcement_state)),'Body','no refused write changed the post');

select * from finish();
rollback;

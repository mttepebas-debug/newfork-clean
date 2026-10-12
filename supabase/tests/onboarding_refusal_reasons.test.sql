begin;
-- BL-1046: an onboarding write refused with PT409 says which kind of refusal
-- in its hint, the way documents and availability do (BL-1028). The welcome
-- steps, the manager's review and the owner's setup used to show the
-- database's own sentence ("onboarding changed; refresh required", "owner
-- onboarding revision conflict"), with nothing for a screen to read.
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
 'app_private.apply_owner_onboarding_update','public.leave_employee_onboarding_service',
 'public.review_employee_onboarding_before_availability_service','public.review_employee_onboarding_service',
 'public.save_employee_onboarding_profile_service','public.submit_employee_onboarding_service']);
create temp table refusal_raises as
select fn, m[1] statement
from refusal_functions, regexp_matches(pg_get_functiondef(oid), $re$(raise\s+exception\s+'(?:[^']|'')*'[^;]*;)$re$, 'gi') m
where m[1] ~* 'PT409';
select is((select count(distinct fn)::int from refusal_functions),6,'every listed onboarding function exists');
select is((select count(*)::int from refusal_raises),6,'the six onboarding PT409 refusals are found in the function bodies');
select is((select coalesce(array_agg(distinct fn order by fn),'{}') from refusal_raises where statement !~* 'hint'),'{}'::text[],
 'no onboarding PT409 is raised without a reason key');
select is((select coalesce(array_agg(distinct key order by key),'{}') from (select (regexp_match(statement,$re$hint\s*=\s*'([^']*)'$re$,'i'))[1] key from refusal_raises) k
 where key is null or key not in ('onboarding.changed','onboarding.review_in_documents','workspace.onboarding_changed')),'{}'::text[],
 'every key is one the screens know');

-- The employee's own steps and the manager's review, in the test world.
select tests.world('rk');
select tests.person('rk','ali','employee',status=>'onboarding');
create temp table ids as select tests.user('rk:ali') ali_user, tests.user('rk:owner') owner_user, tests.id('rk') workspace, tests.id('rk:ali') ali,
 (select c.revision from public.employee_onboarding_cases c where c.employee_id=tests.id('rk:ali')) revision;
grant select on ids to public;
create temp table profile as select jsonb_build_object(
 'legal_first_name','Ali','legal_last_name','Person','phone',tests.phone('rk:ali'),
 'emergency_contact_name','Contact','emergency_contact_relationship','Friend','emergency_contact_phone','+14155550100') payload;
grant select on profile to public;

select is(pg_temp.refusal(format('select public.save_employee_onboarding_profile_service(%L,%L::jsonb,%s,%L)',
 (select ali_user from ids),(select payload from profile),(select revision from ids)+5,(select workspace from ids))),
 'PT409 onboarding.changed','a profile saved over a newer onboarding: changed meanwhile');
select is(pg_temp.refusal(format('select public.submit_employee_onboarding_service(%L,%s,%L)',
 (select ali_user from ids),(select revision from ids)+5,(select workspace from ids))),
 'PT409 onboarding.changed','onboarding sent from an old copy: changed meanwhile');
select is(pg_temp.refusal(format('select public.leave_employee_onboarding_service(%L,%s,%L)',
 (select ali_user from ids),(select revision from ids)+5,(select workspace from ids))),
 'PT409 onboarding.changed','onboarding declined from an old copy: changed meanwhile');
select is(pg_temp.refusal(format('select public.review_employee_onboarding_service(%L,%L,%L,%L,null,%L,%s,false)',
 (select owner_user from ids),(select workspace from ids),(select ali from ids),'activate','',(select revision from ids)+5)),
 'PT409 onboarding.changed','a review sent from an old copy: changed meanwhile');
-- The same profile at the current revision goes through: the refusal above was the revision.
select is(pg_temp.refusal(format('select public.save_employee_onboarding_profile_service(%L,%L::jsonb,%s,%L)',
 (select ali_user from ids),(select payload from profile),(select revision from ids),(select workspace from ids))),
 'no refusal','the same profile at the current revision is saved');

-- A document is reviewed in Documents, never from the onboarding review.
insert into public.employee_onboarding_requirements(id,workspace_id,employee_id,case_id,kind,title,required,blocks_activation,requires_review,sort_order,source_snapshot)
select 'a1046000-0000-4000-8000-000000000001',workspace,ali,(select c.id from public.employee_onboarding_cases c where c.employee_id=ids.ali),
 'document','Food handler card',true,false,true,99,'{"accepted_formats":["pdf"]}'
from ids;
select is((select count(*)::int from public.employee_onboarding_requirements where id='a1046000-0000-4000-8000-000000000001'),1,
 'the document requirement is there to be refused');
select is(pg_temp.refusal(format('select public.review_employee_onboarding_service(%L,%L,%L,%L,%L,%L,%s,false)',
 (select owner_user from ids),(select workspace from ids),(select ali from ids),'accept_requirement','a1046000-0000-4000-8000-000000000001','',
 (select c.revision from public.employee_onboarding_cases c where c.employee_id=(select ali from ids)))),
 'PT409 onboarding.review_in_documents','a document accepted from the onboarding review: standing refusal, nothing to reload');

-- The owner's setup, saved from a tab that fell behind.
select tests.new_user('rk2:owner','Setup Owner');
create temp table setup as select tests.user('rk2:owner') owner_user,
 public.create_owner_workspace_service(tests.user('rk2:owner'),'Setup Test') workspace;
grant select on setup to public;
select is(pg_temp.refusal(format('select public.update_owner_onboarding_service(%L,%L,%L,2::smallint,false,%s,%L,null,%L)',
 (select owner_user from setup),(select workspace from setup),'Setup Test',
 (select o.revision from public.workspace_onboarding o where o.workspace_id=(select workspace from setup))+5,'Setup','Owner')),
 'PT409 workspace.onboarding_changed','setup saved over a newer one: changed meanwhile');
select is(pg_temp.refusal(format('select public.update_owner_onboarding_service(%L,%L,%L,2::smallint,false,%s,%L,null,%L)',
 (select owner_user from setup),(select workspace from setup),'Setup Test',
 (select o.revision from public.workspace_onboarding o where o.workspace_id=(select workspace from setup)),'Setup','Owner')),
 'no refusal','the same setup at the current revision is saved');

select * from finish();
rollback;

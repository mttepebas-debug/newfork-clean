begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table wp_fixture as select
 'ad410000-0000-4000-8000-000000000001'::uuid w,
 'ad410000-0000-4000-8000-000000000002'::uuid owner_id,
 'ad410000-0000-4000-8000-000000000003'::uuid actor,
 'ad410000-0000-4000-8000-000000000004'::uuid emp,
 'ad410000-0000-4000-8000-000000000005'::uuid manager,
 'ad410000-0000-4000-8000-000000000006'::uuid loc,
 'ad410000-0000-4000-8000-000000000007'::uuid other_loc,
 'ad410000-0000-4000-8000-000000000008'::uuid dinner,
 'ad410000-0000-4000-8000-000000000009'::uuid hidden_type,
 public.empty_weekly_preference() p;
insert into auth.users(id,email) select owner_id,'weekly-owner@example.test' from wp_fixture
 union all select actor,'weekly-employee@example.test' from wp_fixture
 union all select manager,'weekly-manager@example.test' from wp_fixture;
insert into public.workspaces(id,name,created_by) select w,'Weekly preferences test',owner_id from wp_fixture;
insert into public.workspace_memberships(workspace_id,user_id,role,all_locations)
 select w,owner_id,'owner'::public.workspace_role,true from wp_fixture
 union all select w,actor,'employee'::public.workspace_role,false from wp_fixture
 union all select w,manager,'manager'::public.workspace_role,false from wp_fixture;
insert into public.workspace_scheduling_settings(workspace_id) select w from wp_fixture on conflict do nothing;
insert into public.locations(short_name, id,workspace_id,name,street_address,city,region,postal_code,timezone)
 select 'T00066', loc,w,'West','1 Test Street','Test City','CA','90001','America/Los_Angeles' from wp_fixture
 union all select 'T00067', other_loc,w,'East','2 Test Street','Test City','NY','10001','America/New_York' from wp_fixture;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
 select emp,w,actor,'E-993417','Weekly','Tester',owner_id from wp_fixture;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
 select w,emp,loc,owner_id from wp_fixture union all select w,emp,other_loc,owner_id from wp_fixture;
select tests.works_at(m.id, f.loc) from wp_fixture f join public.workspace_memberships m on m.workspace_id=f.w and m.user_id in(f.actor,f.manager);
insert into public.shift_types(id,workspace_id,name,color,default_start_time,default_end_time)
 select dinner,w,'Dinner','#256b56','17:00'::time,'23:00'::time from wp_fixture
 union all select hidden_type,w,'Private fallback','#256b56','09:00'::time,'12:00'::time from wp_fixture;


create temp table wp_command(command jsonb,result jsonb,request_key uuid default gen_random_uuid());
insert into wp_command(command) select jsonb_build_object('employee_id',emp,'source','employee','expected_revision',0,'settings_revision',0,'preference',p) from wp_fixture;
select lives_ok($$update wp_command set result=public.weekly_preferences_save_service(actor,w,command,request_key) from wp_fixture$$,'explicit all-available declaration saves immediately');
select is(result->'model'->'employee'->>'submitted','true','submission recorded without approval') from wp_command;
select is(result->'model'->'employee'->>'revision','1','initial revision advanced') from wp_command;
select lives_ok($$select public.weekly_preferences_save_service(actor,w,command,request_key) from wp_fixture,wp_command$$,'same-key retry succeeds');
select is((select count(*) from public.weekly_preference_events where workspace_id=(select w from wp_fixture)),1::bigint,'retry does not duplicate audit');
select throws_ok($$select public.weekly_preferences_save_service(actor,w,command,gen_random_uuid()) from wp_fixture,wp_command$$,'PT409',null,'stale new command rejected');
select throws_ok($$select public.weekly_preferences_save_service(manager,w,command,gen_random_uuid()) from wp_fixture,wp_command$$,'42501',null,'manager cannot write employee declaration');
select throws_ok($$select public.weekly_preferences_save_service(actor,w,command||'{"expected_revision":5}',request_key) from wp_fixture,wp_command$$,'22023',null,'reused key cannot carry a different command');
update wp_command set command=jsonb_build_object('employee_id',emp,'source','manager','expected_revision',0,'settings_revision',0,'preference',p,'enabled',true,'notes',jsonb_build_array('','Private manager note','','','','','')),request_key=gen_random_uuid() from wp_fixture;
select lives_ok($$update wp_command set result=public.weekly_preferences_save_service(manager,w,command,request_key) from wp_fixture$$,'scoped manager saves separate reminders');
select is(public.weekly_preferences_read_service(actor,w)->'manager','null'::jsonb,'employee never receives reminders') from wp_fixture;
select throws_ok($$select public.weekly_preferences_save_service(actor,w,command,gen_random_uuid()) from wp_fixture,wp_command$$,'42501',null,'employee cannot save manager reminder');
update wp_command set command=command||jsonb_build_object('expected_revision',1,'copy_employee_revision',1),request_key=gen_random_uuid();
select lives_ok($$update wp_command set result=public.weekly_preferences_save_service(manager,w,command,request_key) from wp_fixture$$,'exact employee copy allowed');
select is(result->'model'->'manager'->'preference',(select p from wp_fixture),'copy saves the employee week') from wp_command;
select is(result->'model'->'manager'->'notes'->>1,'Private manager note','copy retains manager notes') from wp_command;
select throws_ok($$select public.weekly_preferences_save_service(manager,w,command||'{"expected_revision":2,"copy_employee_revision":99}',gen_random_uuid()) from wp_fixture,wp_command$$,'PT409',null,'stale employee copy rejected');
-- A mode change converts every saved week in the same transaction (AVAIL-001), so a
-- saved week is always in the current mode: no cross-mode copy or clear confirmation (BL-086).
select ok(pg_get_functiondef('public.validate_weekly_preference_command(uuid,uuid,jsonb)'::regprocedure) not like '%confirm_clear%','no clear confirmation for a mode change');
select ok(pg_get_functiondef('public.validate_weekly_preference_command(uuid,uuid,jsonb)'::regprocedure) not like '%and not copied and not%','a copy follows the current entry mode like any save');

-- M5 (Mert 2026-10-04): saving a week never asks about pending requests and
-- never changes one; the employee withdraws one in Shift Hub if they want to.
update public.locations set timezone='UTC' where workspace_id=(select w from wp_fixture);
create temp table wp_requests as select i,gen_random_uuid() cid,gen_random_uuid() aid,gen_random_uuid() source_id from generate_series(1,5) i;
insert into public.shift_exchange_cases(id,workspace_id,kind,owner_id,offered_source_id,requested_source_id,offered_snapshot,requested_snapshot,consent_fingerprint,expires_at,created_by)
select r.cid,f.w,case when r.i=4 then 'swap' when r.i=5 then 'cover' else 'open_pickup' end,case when r.i in(4,5) then f.emp else null end,r.source_id,
 case when r.i=4 then gen_random_uuid() else null end,
 jsonb_build_object('location_id',f.loc,'location_name','West','date','2035-01-15','start_time','09:00','end_time','17:00','time_basis','explicit','time_timezone','UTC'),
 case when r.i=4 then jsonb_build_object('location_id',f.loc,'date','2035-01-16','start_time','09:00','end_time','17:00','time_basis','explicit','time_timezone','UTC') else null end,
 'test-consent','2035-01-15 09:00Z',f.actor from wp_requests r,wp_fixture f;
insert into public.shift_exchange_applications(id,workspace_id,case_id,employee_id,status,consent_fingerprint)
 select r.aid,f.w,r.cid,f.emp,'pending_manager','test-consent' from wp_requests r,wp_fixture f where r.i in(1,2,3);
update wp_fixture set p=jsonb_set(jsonb_set(p,'{days,1,ranges}','[{"start":"10:00","end":"12:00"}]'),'{days,2,ranges}','[{"start":"10:00","end":"12:00"}]');
update wp_command set command=jsonb_build_object('employee_id',emp,'source','employee','expected_revision',1,'settings_revision',0,'preference',p),request_key=gen_random_uuid() from wp_fixture;
select lives_ok($$update wp_command set result=public.weekly_preferences_save_service(actor,w,command,request_key) from wp_fixture$$,'the week saves with requests pending; nothing is asked');
select is((select count(*) from public.shift_exchange_applications where workspace_id=(select w from wp_fixture) and status='pending_manager'),3::bigint,'every pending application stays as it was');
select is((select count(*) from public.shift_exchange_cases where workspace_id=(select w from wp_fixture) and status='open'),5::bigint,'every case stays open');
select is(result->'model'->'employee'->>'revision','2','the new week applies at once') from wp_command;
select is(result-'model','{}'::jsonb,'the answer reports no kept or cancelled requests') from wp_command;
select is((select count(*) from public.weekly_preference_events where workspace_id=(select w from wp_fixture)),4::bigint,'one history row per saved week');

-- One range a day (Mert, 2026-10-16): a save with two is refused, nothing changes.
select throws_ok($$select public.weekly_preferences_save_service(f.actor,f.w,jsonb_build_object('employee_id',f.emp,'source','employee',
 'expected_revision',(m.model->'employee'->>'revision')::integer,'settings_revision',(m.model->'settings'->>'revision')::integer,
 'preference',jsonb_set(public.empty_weekly_preference(),'{days,1,ranges}','[{"start":"09:00","end":"11:00"},{"start":"17:00","end":"19:00"}]')),gen_random_uuid())
 from wp_fixture f cross join lateral (select public.weekly_preferences_read_service(f.actor,f.w) model) m$$,'22023','Check the weekly unavailable hours','two ranges on a day are refused');
select is((select revision from public.employee_weekly_preferences where employee_id=(select emp from wp_fixture)),2,'the refused save left the week as it was');
-- The no comes from the core: 42501 with its authz.* hint (CLAUDE.md §9).
create function pg_temp.refusal(q text) returns text language plpgsql as $$
declare h text; begin execute q; return 'no refusal'; exception when others then get stacked diagnostics h = pg_exception_hint; return sqlstate||' '||coalesce(h,''); end $$;
select is(pg_temp.refusal(format('select public.weekly_preferences_read_service(%L,%L,%L)',gen_random_uuid(),w,emp)),'42501 authz.not_member','somebody outside the workspace hears not a member') from wp_fixture;
select is(pg_temp.refusal(format('select public.weekly_preferences_read_service(%L,%L,%L)',owner_id,w,gen_random_uuid())),'42501 authz.out_of_scope','an unknown person is out of scope') from wp_fixture;
select is(pg_temp.refusal(format('select public.weekly_preferences_save_service(%L,%L,%L,%L)',manager,w,c.command,gen_random_uuid())),'42501 authz.rank','a manager never writes an employee''s own week') from wp_fixture,wp_command c;
select is(pg_temp.refusal(format('select public.weekly_preference_settings_save_service(%L,%L,%L,%L)',actor,w,'{}',gen_random_uuid())),'42501 authz.missing_permission','an employee does not change the entry mode') from wp_fixture;
select is(pg_temp.refusal(format('select public.weekly_preference_settings_read_service(%L,%L)',gen_random_uuid(),w)),'42501 authz.not_member','nor reads it from outside') from wp_fixture;
-- Still finishing onboarding, the employee writes their own week: the onboarding
-- step writes the same record (M2, M13).
update public.workspace_memberships set status='pending_activation' where user_id=(select actor from wp_fixture);
select is(public.weekly_preferences_read_service(actor,w)->>'can_edit_employee','true','an employee still onboarding may write their own week') from wp_fixture;
update public.workspace_memberships set status='active' where user_id=(select actor from wp_fixture);
select ok(not has_function_privilege('authenticated','public.weekly_preferences_save_service(uuid,uuid,jsonb,uuid)','execute'),'client cannot impersonate save actor');
select ok(not has_table_privilege('authenticated','public.weekly_preference_events','select'),'private before/after audit unavailable to direct employee reads');
select * from finish();
rollback;

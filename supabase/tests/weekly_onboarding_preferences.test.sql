begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table wo_fixture as select
 'ad437000-0000-4000-8000-000000000001'::uuid w,
 'ad437000-0000-4000-8000-000000000002'::uuid owner_id,
 'ad437000-0000-4000-8000-000000000003'::uuid actor,
 'ad437000-0000-4000-8000-000000000004'::uuid emp;
insert into auth.users(id,email) select owner_id,'weekly-onboarding-owner@example.test' from wo_fixture
 union all select actor,'weekly-onboarding-employee@example.test' from wo_fixture;
insert into public.workspaces(id,name,created_by) select w,'Weekly onboarding test',owner_id from wo_fixture;
insert into public.workspace_memberships (workspace_id, user_id, status, role_id, employee_role_id)
select legacy.workspace_id::uuid, legacy.user_id::uuid, legacy.status::text::public.membership_status, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (select w,owner_id,'owner'::public.workspace_role,true,'active'::public.membership_status from wo_fixture
 union all select w,actor,'employee'::public.workspace_role,false,'pending_activation'::public.membership_status from wo_fixture) as legacy(workspace_id, user_id, role, all_locations, status);
insert into public.workspace_scheduling_settings(workspace_id) select w from wo_fixture on conflict do nothing;
-- This workspace lets people in when they finish (KATILIM-ONAY, S-231: a workspace waits for approval unless it turns that off).
insert into public.employee_onboarding_settings(workspace_id,final_approval_required,updated_by) select w,false,owner_id from wo_fixture;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
 select emp,w,actor,'E-993437','Weekly','Onboarding',owner_id from wo_fixture;
select lives_ok($$select public.initialize_employee_onboarding_service(actor) from wo_fixture$$,'pending employee initializes with weekly requirement');
create temp table wo_case as select c.id,c.revision from public.employee_onboarding_cases c,wo_fixture f where c.employee_id=f.emp;
select ok((select not required and not blocks_activation and not requires_review from public.employee_onboarding_requirements r,wo_case c where r.case_id=c.id and kind='availability'),'availability starts optional under default settings');
select is((select count(*) from public.employee_weekly_preferences p,wo_fixture f where p.employee_id=f.emp),0::bigint,'initialization does not invent a declaration');
select ok(not (public.get_employee_onboarding_service(actor) ? 'availability'),'getter no longer carries the old availability field') from wo_fixture;
select lives_ok($$update public.workspace_scheduling_settings set availability_onboarding_required=true where workspace_id=(select w from wo_fixture)$$,'required setting updates existing pending cases');
select ok((select required and blocks_activation and not requires_review and status='not_started' from public.employee_onboarding_requirements r,wo_case c where r.case_id=c.id and kind='availability'),'required declaration blocks activation without manager review');
select is((select c.revision from public.employee_onboarding_cases c,wo_case f where c.id=f.id),2,'policy change advances onboarding revision');
update public.employee_onboarding_requirements set status='completed' where case_id=(select id from wo_case) and kind='profile';
select is(public.get_employee_onboarding_service(actor)->>'first_actionable_path','/welcome/availability','server routes to the required declaration') from wo_fixture;
select throws_ok($$select public.submit_employee_onboarding_service(actor,1) from wo_fixture$$,'PT409',null,'old onboarding revision cannot submit after policy change');
select throws_ok($$select public.submit_employee_onboarding_service(actor,2) from wo_fixture$$,'23514',null,'required unsubmitted week cannot be bypassed');
select throws_ok($$select public.review_employee_onboarding_service(owner_id,w,emp,'accept_requirement',
 (select id from public.employee_onboarding_requirements where case_id=(select id from wo_case) and kind='availability'),null,2,true) from wo_fixture$$,
 '22023',null,'manager cannot manufacture an employee declaration');

create temp table wo_save as select gen_random_uuid() key,jsonb_build_object(
 'employee_id',emp,'source','employee','expected_revision',0,'settings_revision',1,'preference',public.empty_weekly_preference()) command from wo_fixture;
select lives_ok($$select public.weekly_preferences_save_service(actor,w,command,key) from wo_fixture,wo_save$$,'pending employee confirms fully available week');
select ok((select status='completed' and completed_at is not null and not requires_review from public.employee_onboarding_requirements where case_id=(select id from wo_case) and kind='availability'),'weekly save completes onboarding requirement immediately');
select is((select status::text from public.employee_onboarding_requirements where case_id=(select id from wo_case) and kind='profile'),'completed','unrelated profile status stays intact');
select lives_ok($$select public.weekly_preferences_save_service(actor,w,command,key) from wo_fixture,wo_save$$,'onboarding save is retryable');
select is((select revision from public.employee_onboarding_cases where id=(select id from wo_case)),3,'retry does not advance onboarding twice');
select is(public.get_employee_onboarding_service(actor)->>'first_actionable_path','/welcome/review','confirmed week advances to final onboarding review') from wo_fixture;
select lives_ok($$select public.submit_employee_onboarding_service(actor,3) from wo_fixture$$,'completed required week allows normal auto-activation');
select is((select status::text from public.employee_onboarding_cases where id=(select id from wo_case)),'approved','onboarding activates without availability approval');
create temp table wo_approved as select c.revision,r.required from public.employee_onboarding_cases c
 join public.employee_onboarding_requirements r on r.case_id=c.id and r.kind='availability' where c.id=(select id from wo_case);
update public.workspace_scheduling_settings set availability_onboarding_required=false where workspace_id=(select w from wo_fixture);
select is((select revision from public.employee_onboarding_cases where id=(select id from wo_case)),(select revision from wo_approved),'settings do not reopen approved onboarding');
select ok((select required from public.employee_onboarding_requirements where case_id=(select id from wo_case) and kind='availability'),'approved requirement history remains unchanged');
select ok(not has_function_privilege('authenticated','public.sync_weekly_onboarding_requirements(uuid)','EXECUTE'),'client cannot call requirement synchronization');
select ok(not has_function_privilege('service_role','public.guard_weekly_onboarding_requirement()','EXECUTE'),'trigger helper is not a service endpoint');
update public.workspace_scheduling_settings set availability_onboarding_required=true where workspace_id=(select w from wo_fixture);
insert into auth.users(id,email) values('ad437000-0000-4000-8000-000000000005','weekly-onboarding-second@example.test');
insert into public.workspace_memberships (workspace_id, user_id, status, role_id, employee_role_id)
select legacy.workspace_id::uuid, legacy.user_id::uuid, legacy.status::text::public.membership_status, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (select w,'ad437000-0000-4000-8000-000000000005','employee','pending_activation' from wo_fixture) as legacy(workspace_id, user_id, role, status);
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
 select 'ad437000-0000-4000-8000-000000000006',w,'ad437000-0000-4000-8000-000000000005','E-993438','Next','Employee',owner_id from wo_fixture;
select lives_ok($$select public.initialize_employee_onboarding_service('ad437000-0000-4000-8000-000000000005')$$,'new onboarding initializes under the required policy');
select ok((select required and blocks_activation and not requires_review from public.employee_onboarding_requirements where employee_id='ad437000-0000-4000-8000-000000000006' and kind='availability'),'new cases inherit current required policy');
update public.workspace_scheduling_settings set availability_onboarding_required=false where workspace_id=(select w from wo_fixture);
select ok((select not required and not blocks_activation and status='not_started' from public.employee_onboarding_requirements where employee_id='ad437000-0000-4000-8000-000000000006' and kind='availability'),'turning policy off makes a pending declaration optional without marking it complete');
select is((select count(*) from public.employee_weekly_preferences where employee_id='ad437000-0000-4000-8000-000000000006'),0::bigint,'optional transition does not create preferences');
select * from finish();
rollback;

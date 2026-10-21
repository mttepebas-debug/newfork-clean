begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('15200000-0000-4000-8000-00000000000'||n)::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','bl052-'||n||'@example.test','','{}','{}',now(),now() from generate_series(1,3) n;
insert into public.workspaces(id,name,created_by) values('25200000-0000-4000-8000-000000000001','BL052 test','15200000-0000-4000-8000-000000000001');
insert into public.workspace_memberships (id, workspace_id, user_id, status, role_id, employee_role_id)
select legacy.id::uuid, legacy.workspace_id::uuid, legacy.user_id::uuid, legacy.status::text::public.membership_status, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values
 ('35200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000001','owner','active',true),
 ('35200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000002','employee','active',true)) as legacy(id, workspace_id, user_id, role, status, all_locations);
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,preferred_name,invitation_email,created_by)
values('45200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000002','E-0001','Document','Employee','','bl052-2@example.test','15200000-0000-4000-8000-000000000001');
-- This workspace lets people in when they finish (KATILIM-ONAY, S-231: a workspace waits for approval unless it turns that off).
insert into public.employee_onboarding_settings(workspace_id,final_approval_required,updated_by) values('25200000-0000-4000-8000-000000000001',false,'15200000-0000-4000-8000-000000000001');
insert into public.employee_onboarding_cases(id,workspace_id,employee_id,membership_id)
values('55200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001','35200000-0000-4000-8000-000000000002');
insert into public.employee_onboarding_requirements(id,workspace_id,employee_id,case_id,kind,title,required,blocks_activation,requires_review,sort_order,source_snapshot,lifecycle_user_id,lifecycle_settings,deadline_at)
values('65200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001','55200000-0000-4000-8000-000000000001','document','Certification',true,false,true,1,
 '{"accepted_formats":["pdf"],"tracks_expiry":true,"timezone":"America/Los_Angeles"}','15200000-0000-4000-8000-000000000002',
 '{"mode":"conditional","target":{"location_ids":[],"department_ids":[],"job_ids":[],"employee_ids":[]},"assignment_scope":"all_active","period_days":7,"suspend_on_overdue":true,"extra_fields":[]}',now()+interval '7 days');

insert into public.locations(id,workspace_id,name,short_name,street_address,city,region,postal_code,country_code,timezone) values
 ('85200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','West','WEST','1 Road','City','CA','90012','US','America/Los_Angeles'),
 ('85200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001','East','EAST','2 Road','City','NY','10001','US','America/New_York');
insert into public.departments(id,workspace_id,name) values('95200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','Kitchen');
insert into public.jobs(id,workspace_id,department_id,name) values
 ('a5200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','95200000-0000-4000-8000-000000000001','Cook'),
 ('a5200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001',null,'Host');
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,is_primary,created_by)
select '25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001',id,id='85200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000001' from public.locations where workspace_id='25200000-0000-4000-8000-000000000001';
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,created_by)
select '25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001',id,'15200000-0000-4000-8000-000000000001' from public.jobs where workspace_id='25200000-0000-4000-8000-000000000001';


update public.workspace_memberships set status='pending_activation' where id='35200000-0000-4000-8000-000000000002';
update public.employee_onboarding_requirements set deadline_at=null where id='65200000-0000-4000-8000-000000000001';
create function pg_temp.req() returns public.employee_onboarding_requirements language sql as $$select r from public.employee_onboarding_requirements r where id='65200000-0000-4000-8000-000000000001'$$;
create function pg_temp.case_revision() returns integer language sql as $$select revision from public.employee_onboarding_cases where id='55200000-0000-4000-8000-000000000001'$$;
create function pg_temp.submit_case() returns integer language sql as $$select public.submit_employee_onboarding_service('15200000-0000-4000-8000-000000000002',pg_temp.case_revision())$$;
create function pg_temp.defer() returns integer language sql as $$select public.defer_initial_employee_document_service('15200000-0000-4000-8000-000000000002',(pg_temp.req()).id,(pg_temp.req()).lifecycle_revision,'Waiting for certification')$$;
create function pg_temp.upload(n integer) returns integer language sql as $$select public.save_employee_document_draft_file_service('15200000-0000-4000-8000-000000000002',(pg_temp.req()).id,(pg_temp.req()).lifecycle_revision,'25200000-0000-4000-8000-000000000001/45200000-0000-4000-8000-000000000001/65200000-0000-4000-8000-000000000001/'||('75200000-0000-4000-8000-00000000000'||n)||'.pdf','certificate.pdf','application/pdf',100)$$;
create function pg_temp.submit_file() returns integer language sql as $$select public.submit_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000002',(pg_temp.req()).id,(pg_temp.req()).lifecycle_revision,(select id from public.employee_document_submissions where requirement_id=(pg_temp.req()).id and state='draft'),current_date+365,'{}')$$;
create function pg_temp.review(decision text) returns integer language sql as $$select public.review_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000001',(pg_temp.req()).workspace_id,(pg_temp.req()).id,(pg_temp.req()).lifecycle_revision,(pg_temp.req()).submitted_document_id,decision,'Review reason','full',(select jsonb_agg(jsonb_build_object('id',file_id,'decision','keep')) from public.employee_document_submission_files where submission_id=(pg_temp.req()).submitted_document_id))$$;
select ok(app_private.document_initial_action_missing(pg_temp.req()),'conditional onboarding needs an initial action');
select throws_ok($$select pg_temp.submit_case()$$,'23514',null,'onboarding submit cannot skip conditional action');
select throws_ok($$select app_private.activate_employee_onboarding_case('55200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000001','employee.activated')$$,'23514',null,'manual activation cannot skip conditional action');
select is(public.get_employee_onboarding_service('15200000-0000-4000-8000-000000000002')->>'first_actionable_path','/welcome/documents/65200000-0000-4000-8000-000000000001','conditional missing document is actionable in onboarding');
select lives_ok($$select pg_temp.defer()$$,'initial reason is accepted');
select ok((pg_temp.req()).deadline_at is null,'initial reason does not start grace before activation');
select ok(not app_private.document_initial_action_missing(pg_temp.req()),'saved initial reason satisfies only initial action');
select lives_ok($$select pg_temp.submit_case()$$,'conditional reason permits onboarding completion');
select is((select status::text from public.workspace_memberships where id='35200000-0000-4000-8000-000000000002'),'active','conditional reason activates without blocking required review');
select is((pg_temp.req()).deadline_at,now()+interval '7 days','activation starts configured grace');
select throws_ok($$select pg_temp.defer()$$,'22023',null,'active employee cannot reuse onboarding deferral');
-- Separate required-document flow using the same isolated fixture.
update public.workspace_memberships set status='pending_activation' where id='35200000-0000-4000-8000-000000000002';
update public.employee_onboarding_cases set status='in_progress',approved_at=null,approved_by=null where id='55200000-0000-4000-8000-000000000001';
update public.employee_onboarding_requirements set required=true,blocks_activation=true,conditional_reason=null,deadline_at=null,lifecycle_settings=jsonb_set(lifecycle_settings,'{mode}','"required"') where id=(pg_temp.req()).id;
create temp table before_upload as select pg_temp.case_revision() revision;
select lives_ok($$select pg_temp.upload(1)$$,'new onboarding upload saves only draft');
select is(pg_temp.case_revision(),(select revision from before_upload),'draft does not alter onboarding completion revision');
select throws_ok($$select pg_temp.submit_case()$$,'23514',null,'draft cannot satisfy a required document');
select lives_ok($$select pg_temp.submit_file()$$,'explicit Submit starts required review');
select ok(pg_temp.case_revision()>(select revision from before_upload),'real document submit advances onboarding revision');
select lives_ok($$select pg_temp.submit_case()$$,'pending document permits case submission');
select is((select status::text from public.workspace_memberships where id='35200000-0000-4000-8000-000000000002'),'pending_activation','required review blocks activation');
select lives_ok($$select pg_temp.review('reject')$$,'manager rejects submitted version');
select throws_ok($$select pg_temp.defer()$$,'22023',null,'rejection cannot be bypassed by a new reason');
select lives_ok($$select pg_temp.upload(2);select pg_temp.submit_file();select pg_temp.review('approve')$$,'replacement approval completes the document');
select is((select status::text from public.workspace_memberships where id='35200000-0000-4000-8000-000000000002'),'pending_activation','rejected onboarding still requires case re-Submit after replacement approval');
select lives_ok($$select pg_temp.submit_case()$$,'case re-Submit confirms corrected onboarding');
select is((select status::text from public.workspace_memberships where id='35200000-0000-4000-8000-000000000002'),'active','final required approval activates pending employee');
select is((select count(*)::integer from public.employee_documents where requirement_id='65200000-0000-4000-8000-000000000001' and review_status='accepted'),1,'legacy file projection reflects only accepted retained version');
-- First Conditional upload must wait for review, unlike an initial deferral.
update public.workspace_memberships set status='pending_activation' where id='35200000-0000-4000-8000-000000000002';
update public.employee_onboarding_cases set status='in_progress',approved_at=null,approved_by=null,submitted_at=null,final_approval_required=false where id='55200000-0000-4000-8000-000000000001';
update public.employee_onboarding_requirements set required=false,blocks_activation=false,status='not_started',approved_document_id=null,submitted_document_id=null,conditional_reason=null,deadline_at=null,lifecycle_settings=jsonb_set(lifecycle_settings,'{mode}','"conditional"') where id=(pg_temp.req()).id;
select lives_ok($$select pg_temp.upload(3);select pg_temp.submit_file();select pg_temp.submit_case()$$,'initial Conditional upload permits case submission');
select is((select status::text from public.workspace_memberships where id='35200000-0000-4000-8000-000000000002'),'pending_activation','Conditional pending review prevents activation');
select throws_ok($$select pg_temp.defer()$$,'22023',null,'submitted Conditional upload cannot switch to a deferral');
select lives_ok($$select pg_temp.review('reject')$$,'Conditional first submission can be rejected');
select throws_ok($$select pg_temp.defer()$$,'22023',null,'rejected Conditional upload cannot switch to a deferral');
select lives_ok($$select pg_temp.upload(4);select pg_temp.submit_file();select pg_temp.submit_case()$$,'Conditional correction requires another case Submit');
update public.employee_onboarding_cases set final_approval_required=true where id='55200000-0000-4000-8000-000000000001';
select lives_ok($$select pg_temp.review('approve')$$,'Conditional replacement review succeeds');
select is((select status::text from public.workspace_memberships where id='35200000-0000-4000-8000-000000000002'),'pending_activation','case final-approval snapshot still blocks automatic activation');
select lives_ok($$select app_private.activate_employee_onboarding_case('55200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000001','employee.activated')$$,'explicit final approval activates the completed case');
select * from finish();rollback;

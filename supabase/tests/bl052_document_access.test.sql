begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('15200000-0000-4000-8000-00000000000'||n)::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','bl052-'||n||'@example.test','','{}','{}',now(),now() from generate_series(1,3) n;
insert into public.workspaces(id,name,created_by) values('25200000-0000-4000-8000-000000000001','BL052 test','15200000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(id,workspace_id,user_id,role,status,all_locations) values
 ('35200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000001','owner','active',true),
 ('35200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000002','employee','active',true);
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,preferred_name,invitation_email,created_by)
values('45200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000002','E-0001','Document','Employee','','bl052-2@example.test','15200000-0000-4000-8000-000000000001');
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

update public.employee_onboarding_requirements set deadline_at=now()-interval '1 day' where id='65200000-0000-4000-8000-000000000001';
select is(public.get_employee_document_access_service('15200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001')->>'restricted','true','overdue requirement restricts organization at request time');
select ok(not public.service_actor_has_permission('15200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001','schedule.read'),'normal service permission is denied');
set local role authenticated;
select set_config('request.jwt.claim.sub','15200000-0000-4000-8000-000000000002',true);
select ok(not app_private.is_workspace_member('25200000-0000-4000-8000-000000000001'),'normal RLS membership helper denies restricted organization');
select is((select count(*)::integer from public.locations where workspace_id='25200000-0000-4000-8000-000000000001'),0,'actual location RLS rows are hidden while restricted');
select ok(not app_private.can_access_location('25200000-0000-4000-8000-000000000001','85200000-0000-4000-8000-000000000001'),'normal RLS location helper denies restricted organization');
reset role;
select set_config('request.jwt.claim.sub','',true);
select lives_ok($$select public.get_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001','65200000-0000-4000-8000-000000000001',true)$$,'restricted employee retains own document completion access');
insert into public.workspaces(id,name,created_by) values('25200000-0000-4000-8000-000000000002','Other organization','15200000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,status) values('25200000-0000-4000-8000-000000000002','15200000-0000-4000-8000-000000000002','employee','active');
select ok(public.service_actor_has_permission('15200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000002','schedule.read'),'other organization permissions remain available');
select is(public.get_employee_document_access_service('15200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000002')->>'restricted','false','restriction is scoped to one organization');
insert into public.employee_onboarding_requirements(workspace_id,employee_id,case_id,kind,source_id,title,required,blocks_activation,requires_review,sort_order,lifecycle_settings)
select workspace_id,employee_id,case_id,kind,'65200000-0000-4000-8000-000000000099'::uuid,'Second blocker',required,blocks_activation,requires_review,2,lifecycle_settings from public.employee_onboarding_requirements where id='65200000-0000-4000-8000-000000000001';
update public.employee_onboarding_requirements set deadline_at=now()-interval '1 day' where title='Second blocker';
select public.set_employee_document_exemption_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','65200000-0000-4000-8000-000000000001',1,true,'Exception');
select is(public.get_employee_document_access_service('15200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001')->>'restricted','true','resolving one of multiple blockers does not reopen access');
update public.employee_onboarding_requirements set lifecycle_exempt=true where title='Second blocker';
select is(public.get_employee_document_access_service('15200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001')->>'restricted','false','access returns after every blocker resolves');
select is((select status::text from public.workspace_memberships where id='35200000-0000-4000-8000-000000000002'),'active','restriction never changes membership');
select * from finish();rollback;

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

set constraints all immediate;
create temp table definition_test(id uuid);
insert into definition_test select public.save_document_type_lifecycle_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',null,null,'{"title":"Safety","description":"Document","requires_review":true,"accepted_formats":["pdf"],"tracks_expiry":false,"expiry_warning_days":30,"lifecycle_settings":{"mode":"conditional","assignment_scope":"all_active","target":{"operator":"and","location_ids":["85200000-0000-4000-8000-000000000002"],"department_ids":[],"job_ids":["a5200000-0000-4000-8000-000000000001"],"employee_ids":[]},"period_days":7,"suspend_on_overdue":true,"extra_fields":[]}}');
-- A requirement is only created against a published definition, so it is
-- published before anybody is matched to it.
update public.document_types set publication_status='published' where id=(select id from definition_test);
select is((select count(*)::integer from public.employee_onboarding_requirements where source_id=(select id from definition_test)),0,'definition save does not apply to existing employees');
update public.employee_job_assignments set ended_at=now() where job_id='a5200000-0000-4000-8000-000000000001';
select is((select count(*)::integer from public.employee_onboarding_requirements where source_id=(select id from definition_test)),0,'unmatched employee gets no assignment');
update public.employee_job_assignments set ended_at=null where job_id='a5200000-0000-4000-8000-000000000001';
create temp table dynamic_req as select id from public.employee_onboarding_requirements where source_id=(select id from definition_test);
select is((select count(*)::integer from dynamic_req),1,'matching job at the second location creates one obligation');
select is((select deadline_at from public.employee_onboarding_requirements where id=(select id from dynamic_req)),now()+interval '7 days','new active assignment starts full configured period');
-- Changed the way the app changes a published definition: back to draft,
-- edited, published again.
update public.document_types set publication_status='draft' where id=(select id from definition_test);
update public.document_types set lifecycle_settings=jsonb_set(lifecycle_settings,'{period_days}','21') where id=(select id from definition_test);
update public.document_types set publication_status='published' where id=(select id from definition_test);
update public.employee_profiles set first_name='Renamed' where id='45200000-0000-4000-8000-000000000001';
select is((select lifecycle_settings->>'period_days' from public.employee_onboarding_requirements where id=(select id from dynamic_req)),'7','unrelated employee edit preserves assigned definition snapshot');
update public.employee_onboarding_requirements set deadline_at=now()-interval '1 day',document_suspended_at=now() where id=(select id from dynamic_req);
update public.employee_job_assignments set ended_at=now() where job_id='a5200000-0000-4000-8000-000000000001';
select ok((select lifecycle_closed_at is not null and deadline_at is null and document_suspended_at is null from public.employee_onboarding_requirements where id=(select id from dynamic_req)),'target exit clears only its countdown and blocker');
update public.employee_job_assignments set ended_at=null where job_id='a5200000-0000-4000-8000-000000000001';
select is((select deadline_at from public.employee_onboarding_requirements where id=(select id from dynamic_req)),now()+interval '7 days','reentry uses retained snapshot full period');
select is((select count(*)::integer from public.employee_onboarding_requirements where source_id=(select id from definition_test)),1,'reentry retains obligation identity');
select public.set_employee_document_exemption_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',(select id from dynamic_req),(select lifecycle_revision from public.employee_onboarding_requirements where id=(select id from dynamic_req)),true,'Permanent exemption');
update public.employee_job_assignments set ended_at=now() where job_id='a5200000-0000-4000-8000-000000000001';
update public.employee_job_assignments set ended_at=null where job_id='a5200000-0000-4000-8000-000000000001';
select ok((select lifecycle_exempt and deadline_at is null from public.employee_onboarding_requirements where id=(select id from dynamic_req)),'exemption survives target exit and reentry');
select is((select count(*)::integer from public.onboarding_events where target_id=(select id::text from dynamic_req) and action='document.assignment_created'),1,'repeated target changes do not duplicate initial assignment');
select * from finish();rollback;

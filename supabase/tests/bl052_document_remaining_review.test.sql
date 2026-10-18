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

insert into public.employee_documents(id,workspace_id,employee_id,requirement_id,version_number,object_path,original_filename,media_type,size_bytes,review_status,expiry_date,uploaded_by)
select ('b5200000-0000-4000-8000-00000000000'||n)::uuid,'25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001','65200000-0000-4000-8000-000000000001',n,'25200000-0000-4000-8000-000000000001/45200000-0000-4000-8000-000000000001/65200000-0000-4000-8000-000000000001/b5200000-0000-4000-8000-00000000000'||n||'.pdf','certificate.pdf','application/pdf',100,'superseded',current_date+30,'15200000-0000-4000-8000-000000000002' from generate_series(1,2)n;
insert into public.employee_document_submissions(id,workspace_id,employee_id,requirement_id,user_id,version,state,expiry_date,submitted_at)
select ('c5200000-0000-4000-8000-00000000000'||n)::uuid,'25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001','65200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000002',n,case n when 1 then 'accepted' else 'pending_review' end,current_date+30,now() from generate_series(1,2)n;
insert into public.employee_document_submission_files(submission_id,file_id,requirement_id,workspace_id,employee_id)
select ('c5200000-0000-4000-8000-00000000000'||n)::uuid,('b5200000-0000-4000-8000-00000000000'||n)::uuid,'65200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001' from generate_series(1,2)n;
update public.employee_onboarding_requirements set approved_document_id='c5200000-0000-4000-8000-000000000001',submitted_document_id='c5200000-0000-4000-8000-000000000002',paused_remaining_seconds=129600 where id='65200000-0000-4000-8000-000000000001';
select is((select app_private.document_obligation_json(r)->>'status' from public.employee_onboarding_requirements r where id='65200000-0000-4000-8000-000000000001'),'pending_review','renewal is visible in review queue despite a valid prior version');
select is((select app_private.document_obligation_state(r,now()) from public.employee_onboarding_requirements r where id='65200000-0000-4000-8000-000000000001'),'completed','review queue visibility does not revoke valid prior eligibility');
-- Daylight Home (CALISAN-HOME-GUNISIGI): the list says when the approved version runs out.
select is((select app_private.document_obligation_json(r)->>'expiry_date' from public.employee_onboarding_requirements r where id='65200000-0000-4000-8000-000000000001'),
  (select expiry_date::text from public.employee_document_submissions where id='c5200000-0000-4000-8000-000000000001'),'an obligation says when its approved version expires');
select lives_ok($$select public.review_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','65200000-0000-4000-8000-000000000001',1,'c5200000-0000-4000-8000-000000000002','reject','Needs correction','remaining','[{"id":"b5200000-0000-4000-8000-000000000002","decision":"keep"}]')$$,'reviewer may grant the actually paused remaining interval');
select is((select deadline_at from public.employee_onboarding_requirements where id='65200000-0000-4000-8000-000000000001'),now()+interval '36 hours','remaining correction uses the original seconds, not full configured days');
update public.employee_document_submissions set state='pending_review' where id='c5200000-0000-4000-8000-000000000002';
update public.employee_onboarding_requirements set paused_remaining_seconds=0 where id='65200000-0000-4000-8000-000000000001';
select throws_ok($$select public.review_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','65200000-0000-4000-8000-000000000001',2,'c5200000-0000-4000-8000-000000000002','reject','Needs correction','remaining','[{"id":"b5200000-0000-4000-8000-000000000002","decision":"keep"}]')$$,'22023','no correction time remains','server refuses an exhausted remaining interval');
select is((select state from public.employee_document_submissions where id='c5200000-0000-4000-8000-000000000002'),'pending_review','invalid correction attempt does not partially reject the submission');
-- Daylight Home (CALISAN-HOME-VERI): "expires soon" is the manager's to-do rule, read from the type.
insert into public.document_types(id,workspace_id,title,tracks_expiry,expiry_warning_days,publication_status,published_at,created_by) values
 ('d5200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','Certification',true,30,'published',now(),'15200000-0000-4000-8000-000000000001'),
 ('d5200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001','Certification (10 days)',true,10,'published',now(),'15200000-0000-4000-8000-000000000001'),
 ('d5200000-0000-4000-8000-000000000003','25200000-0000-4000-8000-000000000001','Certification (untracked)',false,30,'published',now(),'15200000-0000-4000-8000-000000000001');
update public.employee_onboarding_requirements set source_id='d5200000-0000-4000-8000-000000000001' where id='65200000-0000-4000-8000-000000000001';
select is((select (app_private.document_obligation_json(r)->>'expiring_soon')::boolean from public.employee_onboarding_requirements r where id='65200000-0000-4000-8000-000000000001'),true,'an approved version within its type''s warning days expires soon');
select is((select (o->>'expiry_date') from jsonb_array_elements(public.list_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',false)) o where o->>'id'='65200000-0000-4000-8000-000000000001'),
  (current_date+30)::text,'the manager''s list says the same expiry');
update public.employee_onboarding_requirements set source_id='d5200000-0000-4000-8000-000000000002' where id='65200000-0000-4000-8000-000000000001';
select is((select (app_private.document_obligation_json(r)->>'expiring_soon')::boolean from public.employee_onboarding_requirements r where id='65200000-0000-4000-8000-000000000001'),false,'outside the warning days it does not');
update public.employee_onboarding_requirements set source_id='d5200000-0000-4000-8000-000000000003' where id='65200000-0000-4000-8000-000000000001';
select is((select (app_private.document_obligation_json(r)->>'expiring_soon')::boolean from public.employee_onboarding_requirements r where id='65200000-0000-4000-8000-000000000001'),false,'a type that does not track expiry never expires soon');
update public.employee_onboarding_requirements set approved_document_id=null where id='65200000-0000-4000-8000-000000000001';
select is((select app_private.document_obligation_json(r)->'expiry_date' from public.employee_onboarding_requirements r where id='65200000-0000-4000-8000-000000000001'),'null'::jsonb,'without an approved version there is no expiry');
select * from finish();rollback;

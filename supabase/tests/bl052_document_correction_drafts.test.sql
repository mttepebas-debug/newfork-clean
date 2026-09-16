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


update public.workspace_memberships set status='pending_activation' where id='35200000-0000-4000-8000-000000000002';
update public.employee_onboarding_requirements set deadline_at=null where id='65200000-0000-4000-8000-000000000001';
create function pg_temp.req() returns public.employee_onboarding_requirements language sql as $$select r from public.employee_onboarding_requirements r where id='65200000-0000-4000-8000-000000000001'$$;
create function pg_temp.case_revision() returns integer language sql as $$select revision from public.employee_onboarding_cases where id='55200000-0000-4000-8000-000000000001'$$;
create function pg_temp.submit_case() returns integer language sql as $$select public.submit_employee_onboarding_service('15200000-0000-4000-8000-000000000002',pg_temp.case_revision())$$;
create function pg_temp.defer() returns integer language sql as $$select public.defer_initial_employee_document_service('15200000-0000-4000-8000-000000000002',(pg_temp.req()).id,(pg_temp.req()).lifecycle_revision,'Waiting for certification')$$;
create function pg_temp.upload(n integer) returns integer language sql as $$select public.save_employee_document_draft_file_service('15200000-0000-4000-8000-000000000002',(pg_temp.req()).id,(pg_temp.req()).lifecycle_revision,'25200000-0000-4000-8000-000000000001/45200000-0000-4000-8000-000000000001/65200000-0000-4000-8000-000000000001/'||('75200000-0000-4000-8000-00000000000'||n)||'.pdf','certificate.pdf','application/pdf',100)$$;
create function pg_temp.submit_file() returns integer language sql as $$select public.submit_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000002',(pg_temp.req()).id,(pg_temp.req()).lifecycle_revision,(select id from public.employee_document_submissions where requirement_id=(pg_temp.req()).id and state='draft'),current_date+365,'{}')$$;
create function pg_temp.review(decision text) returns integer language sql as $$select public.review_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000001',(pg_temp.req()).workspace_id,(pg_temp.req()).id,(pg_temp.req()).lifecycle_revision,(pg_temp.req()).submitted_document_id,decision,'Review reason','full',(select jsonb_agg(jsonb_build_object('id',file_id,'decision','keep')) from public.employee_document_submission_files where submission_id=(pg_temp.req()).submitted_document_id))$$;

select pg_temp.upload(1); select pg_temp.upload(2); select pg_temp.submit_file();
create temp table original as select submitted_document_id id from public.employee_onboarding_requirements where id=(pg_temp.req()).id;
select public.review_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000001',(pg_temp.req()).workspace_id,(pg_temp.req()).id,(pg_temp.req()).lifecycle_revision,(pg_temp.req()).submitted_document_id,'reject','Replace unreadable file','full',(select jsonb_agg(jsonb_build_object('id',file_id,'decision',case when n=1 then 'keep' else 'discard' end)) from (select file_id,row_number() over(order by file_id) n from public.employee_document_submission_files where submission_id=(pg_temp.req()).submitted_document_id) f));
select is((select count(*)::integer from public.employee_document_submissions where requirement_id=(pg_temp.req()).id and state='draft'),1,'reject creates one correction draft');
select is((select count(*)::integer from public.employee_document_submission_files f join public.employee_document_submissions s on s.id=f.submission_id where s.requirement_id=(pg_temp.req()).id and s.state='draft'),1,'correction draft contains only kept file references');
select is((select expiry_date from public.employee_document_submissions where requirement_id=(pg_temp.req()).id and state='draft'),current_date+365,'correction draft prefills submitted expiry');
select is((select count(*)::integer from public.employee_document_submission_files where submission_id=(select id from original)),2,'reviewed historical version keeps both file decisions');
select is((pg_temp.req()).deadline_at,now()+interval '7 days','correction draft does not pause restarted deadline');
select public.remove_employee_document_draft_file_service('15200000-0000-4000-8000-000000000002',(pg_temp.req()).workspace_id,(pg_temp.req()).id,(pg_temp.req()).lifecycle_revision,(select id from public.employee_document_submissions where requirement_id=(pg_temp.req()).id and state='draft'),(select f.file_id from public.employee_document_submission_files f join public.employee_document_submissions s on s.id=f.submission_id where s.requirement_id=(pg_temp.req()).id and s.state='draft'));
select is((select count(*)::integer from public.employee_document_submission_files where submission_id=(select id from original)),2,'removing correction file preserves previous reviewed reference');
select throws_ok($$select pg_temp.submit_file()$$,'22023',null,'empty correction draft cannot be submitted');
select pg_temp.upload(3);select pg_temp.submit_file();
update public.employee_onboarding_requirements set lifecycle_settings=jsonb_set(lifecycle_settings,'{mode}','"optional"'),required=false,blocks_activation=false where id=(pg_temp.req()).id;
select public.review_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000001',(pg_temp.req()).workspace_id,(pg_temp.req()).id,(pg_temp.req()).lifecycle_revision,(pg_temp.req()).submitted_document_id,'reject','Discard all','full',(select jsonb_agg(jsonb_build_object('id',file_id,'decision','discard')) from public.employee_document_submission_files where submission_id=(pg_temp.req()).submitted_document_id));
select is((select count(*)::integer from public.employee_document_submissions where requirement_id=(pg_temp.req()).id and state='draft'),0,'all Discard leaves no mandatory correction draft');
select lives_ok($$select pg_temp.submit_case()$$,'optional discarded documents can be skipped');
select * from finish();rollback;

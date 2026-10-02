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

select is(public.save_employee_document_draft_file_service('15200000-0000-4000-8000-000000000002','65200000-0000-4000-8000-000000000001',1,
 '25200000-0000-4000-8000-000000000001/45200000-0000-4000-8000-000000000001/65200000-0000-4000-8000-000000000001/75200000-0000-4000-8000-000000000001.pdf','one.pdf','application/pdf',100),2,'draft increments lifecycle revision');
select ok((select paused_remaining_seconds is null and submitted_document_id is null from public.employee_onboarding_requirements where id='65200000-0000-4000-8000-000000000001'),'draft does not pause clock or replace submitted version');
select is(public.submit_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000002','65200000-0000-4000-8000-000000000001',2,
 (select id from public.employee_document_submissions where requirement_id='65200000-0000-4000-8000-000000000001' and state='draft'),current_date+30,'{}'),3,'real submit starts review');
select ok((select paused_remaining_seconds>0 from public.employee_onboarding_requirements where id='65200000-0000-4000-8000-000000000001'),'submit preserves remaining time');
select is(public.review_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','65200000-0000-4000-8000-000000000001',3,
 (select submitted_document_id from public.employee_onboarding_requirements where id='65200000-0000-4000-8000-000000000001'),'approve','','full',
 (select jsonb_agg(jsonb_build_object('id',file_id,'decision','keep')) from public.employee_document_submission_files)),4,'owner approves current version');
select ok((select approved_document_id is not null from public.employee_onboarding_requirements where id='65200000-0000-4000-8000-000000000001'),'approval is separately retained');

select is(public.save_employee_document_draft_file_service('15200000-0000-4000-8000-000000000002','65200000-0000-4000-8000-000000000001',4,
 '25200000-0000-4000-8000-000000000001/45200000-0000-4000-8000-000000000001/65200000-0000-4000-8000-000000000001/75200000-0000-4000-8000-000000000002.pdf','renewal.pdf','application/pdf',100),5,'renewal draft created');
select is((select app_private.document_obligation_state(r,now()) from public.employee_onboarding_requirements r where id='65200000-0000-4000-8000-000000000001'),'completed','valid old approval survives renewal draft');
select is(public.submit_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000002','65200000-0000-4000-8000-000000000001',5,
 (select id from public.employee_document_submissions where requirement_id='65200000-0000-4000-8000-000000000001' and state='draft'),current_date+60,'{}'),6,'renewal submits independently');
select is((select app_private.document_obligation_state(r,now()) from public.employee_onboarding_requirements r where id='65200000-0000-4000-8000-000000000001'),'completed','valid old approval survives pending renewal');
select throws_ok($$select public.review_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','65200000-0000-4000-8000-000000000001',4,
 (select approved_document_id from public.employee_onboarding_requirements where id='65200000-0000-4000-8000-000000000001'),'approve','','full','[]')$$,'PT409','document changed; refresh required','stale review cannot decide the old version');
select is(public.review_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','65200000-0000-4000-8000-000000000001',6,
 (select submitted_document_id from public.employee_onboarding_requirements where id='65200000-0000-4000-8000-000000000001'),'reject','Unreadable','full',
 (select jsonb_agg(jsonb_build_object('id',file_id,'decision','keep')) from public.employee_document_submission_files where submission_id=(select submitted_document_id from public.employee_onboarding_requirements where id='65200000-0000-4000-8000-000000000001'))),7,'reject renewal with full correction period');
select is((select app_private.document_obligation_state(r,now()) from public.employee_onboarding_requirements r where id='65200000-0000-4000-8000-000000000001'),'completed','valid old approval survives rejection');
select ok((select deadline_at=now()+interval '168 hours' from public.employee_onboarding_requirements where id='65200000-0000-4000-8000-000000000001'),'full correction uses server decision instant');
select ok((select metadata ? 'old_deadline' and metadata ? 'new_deadline' and metadata->>'correction_period'='full' from public.onboarding_events where action='document.reject'),'rejection deadline and choice are audited');

-- Controlled timestamps exercise pending-expiry and pre-existing suspension.
update public.employee_document_submissions set state='pending_review' where id=(select submitted_document_id from public.employee_onboarding_requirements where id='65200000-0000-4000-8000-000000000001');
update public.employee_document_submissions set expiry_date=(now() at time zone 'America/Los_Angeles')::date-1 where id=(select approved_document_id from public.employee_onboarding_requirements where id='65200000-0000-4000-8000-000000000001');
select is((select app_private.document_obligation_state(r,now()) from public.employee_onboarding_requirements r where id='65200000-0000-4000-8000-000000000001'),'pending_review','expired old approval leaves pending-review obligation');
select is((select app_private.document_obligation_blocked(r,now()) from public.employee_onboarding_requirements r where id='65200000-0000-4000-8000-000000000001'),false,'timely pending renewal preserves access after old expiry');
update public.employee_onboarding_requirements set document_suspended_at=now()-interval '1 day' where id='65200000-0000-4000-8000-000000000001';
select is(public.review_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','65200000-0000-4000-8000-000000000001',7,
 (select submitted_document_id from public.employee_onboarding_requirements where id='65200000-0000-4000-8000-000000000001'),'reject','Replace file','full',
 (select jsonb_agg(jsonb_build_object('id',file_id,'decision','keep')) from public.employee_document_submission_files where submission_id=(select submitted_document_id from public.employee_onboarding_requirements where id='65200000-0000-4000-8000-000000000001'))),8,'previously suspended renewal can be rejected');
select is((select app_private.document_obligation_blocked(r,now()) from public.employee_onboarding_requirements r where id='65200000-0000-4000-8000-000000000001'),true,'new correction deadline does not reopen prior suspension');
update public.employee_onboarding_requirements set lifecycle_settings=jsonb_set(lifecycle_settings,'{mode}','"optional"') where id='65200000-0000-4000-8000-000000000001';
select is((select app_private.document_obligation_blocked(r,now()) from public.employee_onboarding_requirements r where id='65200000-0000-4000-8000-000000000001'),false,'optional never restricts access');

select throws_ok($$select public.get_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000003','25200000-0000-4000-8000-000000000001','65200000-0000-4000-8000-000000000001',true)$$,'42501','Not allowed','unlinked account cannot read private history');
select ok(not has_table_privilege('authenticated','public.employee_document_submissions','SELECT'),'authenticated cannot directly bypass document RPC scope');
select ok(not has_function_privilege('authenticated','public.review_employee_document_lifecycle_service(uuid,uuid,uuid,integer,uuid,text,text,text,jsonb)','EXECUTE'),'authenticated cannot forge a service actor');
select ok((select relrowsecurity from pg_class where oid='public.employee_document_submission_files'::regclass),'file membership has RLS');
select is((select count(*)::integer from public.employee_documents where workspace_id='25200000-0000-4000-8000-000000000001'),2,'renewal rejection does not delete file history');
set local role authenticated;
select set_config('request.jwt.claim.sub','15200000-0000-4000-8000-000000000002',true);
select throws_ok($$select * from public.employee_document_submissions$$,'42501',null,'authenticated direct SELECT cannot bypass private API');
select throws_ok($$select public.review_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','65200000-0000-4000-8000-000000000001',8,null,'approve','','full','[]')$$,'42501',null,'authenticated caller cannot invoke privileged review RPC');
set local role service_role;
select lives_ok($$select public.get_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001','65200000-0000-4000-8000-000000000001',true)$$,'service RPC permits own retained document history');
select throws_ok($$select public.get_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000003','25200000-0000-4000-8000-000000000001','65200000-0000-4000-8000-000000000001',true)$$,'42501','Not allowed','service RPC denies wrong actor without relying on RLS bypass');
select throws_ok($$insert into public.employee_document_submission_files(submission_id,file_id,requirement_id,workspace_id,employee_id)
 select s.id,f.file_id,s.requirement_id,'25200000-0000-4000-8000-000000000099',s.employee_id
 from public.employee_document_submissions s cross join public.employee_document_submission_files f where s.id<>f.submission_id limit 1$$,'23503',null,'composite submission/file references reject forged tenant');
reset role;
-- Independent global job / location targeting: no invented paired assignment.
select ok(app_private.document_target_matches('25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001','{"operator":"and","location_ids":["85200000-0000-4000-8000-000000000002"],"job_ids":["a5200000-0000-4000-8000-000000000001"]}'),'global cook job matches employee at either assigned location');
select ok(not app_private.document_target_matches('25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001','{"operator":"and","department_ids":["95200000-0000-4000-8000-000000000001"],"job_ids":["a5200000-0000-4000-8000-000000000002"]}'),'AND department and job must match the same job');
select ok(not app_private.document_target_matches('25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001','{"operator":"or","location_ids":["85200000-0000-4000-8000-000000000099"]}'),'OR ignores empty groups instead of matching everyone');
select ok(app_private.document_target_matches('25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001','{"operator":"or"}'),'no target groups means all employees');
select ok(app_private.document_target_matches('25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001','{"operator":"and","location_ids":["85200000-0000-4000-8000-000000000099"],"employee_ids":["45200000-0000-4000-8000-000000000001"]}'),'named people add to otherwise unmatched groups');
-- Exemption clears only this obligation, preserves version history, and retries safely.
update public.employee_onboarding_requirements set lifecycle_settings=jsonb_set(lifecycle_settings,'{mode}','"conditional"'),document_suspended_at=now()-interval '1 day' where id='65200000-0000-4000-8000-000000000001';
select lives_ok($$select public.set_employee_document_exemption_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','65200000-0000-4000-8000-000000000001',(select lifecycle_revision from public.employee_onboarding_requirements where id='65200000-0000-4000-8000-000000000001'),true,'Not needed for this employee')$$,'reviewer can exempt with a reason');
select is((select app_private.document_obligation_state(r,now()) from public.employee_onboarding_requirements r where id='65200000-0000-4000-8000-000000000001'),'exempt','exempt status is persistent');
select ok((select deadline_at is null and document_suspended_at is null and not app_private.document_obligation_blocked(r,now()) from public.employee_onboarding_requirements r where id='65200000-0000-4000-8000-000000000001'),'exemption removes its countdown and blocker');
select is((select count(*)::integer from public.employee_documents where workspace_id='25200000-0000-4000-8000-000000000001'),2,'exemption preserves every file');
select lives_ok($$select public.set_employee_document_exemption_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','65200000-0000-4000-8000-000000000001',(select lifecycle_revision from public.employee_onboarding_requirements where id='65200000-0000-4000-8000-000000000001'),true,'Not needed for this employee')$$,'same-state retry is a no-op');
select is((select count(*)::integer from public.onboarding_events where workspace_id='25200000-0000-4000-8000-000000000001' and action='document.exempted'),1,'same-state retry adds no audit event');
select lives_ok($$select public.set_employee_document_exemption_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','65200000-0000-4000-8000-000000000001',(select lifecycle_revision from public.employee_onboarding_requirements where id='65200000-0000-4000-8000-000000000001'),false,'Needed again')$$,'reviewer can remove exemption');
select is((select deadline_at from public.employee_onboarding_requirements where id='65200000-0000-4000-8000-000000000001'),now()+interval '7 days','removing exemption restores exactly the full configured period');
select throws_ok($$select public.set_employee_document_exemption_service('15200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001','65200000-0000-4000-8000-000000000001',1,true,'Self exemption')$$,'42501',null,'employee cannot exempt self');
select throws_ok($$select public.set_employee_document_exemption_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','65200000-0000-4000-8000-000000000001',1,true,'Stale')$$,'PT409','document changed; refresh required','stale exemption cannot overwrite new state');
select * from finish();
rollback;

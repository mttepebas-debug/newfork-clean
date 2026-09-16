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
create temp table policy_ids(retention uuid, template uuid, version uuid, requirement uuid);
insert into policy_ids(retention) select public.save_signature_retention_policy_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',null,'Policy evidence','employment_end',1095,'Workspace','Internal policy');
select public.approve_signature_retention_policy_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',(select retention from policy_ids));
update policy_ids set template=public.save_policy_lifecycle_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',null,jsonb_build_object('title','Safety policy','summary','Read this policy','content_text','Always follow the safety policy.','intent_statement','I have read this policy.','locale','en-US','effective_date','2026-09-15','retention_policy_id',retention,'lifecycle_settings','{"mode":"required","target":{"operator":"and","location_ids":[],"department_ids":[],"job_ids":[],"employee_ids":[]},"assignment_scope":"all_active","period_days":3,"suspend_on_overdue":true,"extra_fields":[]}'::jsonb));
select public.publish_signature_template_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',(select template from policy_ids));
update policy_ids set version=(select id from public.signature_template_versions where template_id=policy_ids.template and status='published');
select is((select count(*)::integer from public.employee_onboarding_requirements where kind='acknowledgement'),0,'publishing does not silently apply a policy to existing employees');
create temp table impact as select public.preview_policy_definition_apply_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',(select version from policy_ids)) data;
select is((select data->'employees'->0->>'action' from impact),'assign','policy uses the shared scoped impact preview');
select is(public.apply_policy_definition_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',(select version from policy_ids),(select (data->>'revision')::integer from impact),(select data->>'preview_token' from impact),'Assign published policy')->>'applied','1','explicit Apply creates one published policy assignment');
update policy_ids set requirement=(select id from public.employee_onboarding_requirements where source_id=policy_ids.version);
select is((select deadline_at from public.employee_onboarding_requirements where id=(select requirement from policy_ids)),now()+interval '3 days','policy active assignment starts configured deadline');
select throws_ok($$update public.signature_template_versions set content_text='Changed' where id=(select version from policy_ids)$$,'55000',null,'published policy content remains immutable');
create function pg_temp.ack(name text,digest text,auth_at timestamptz,request_id uuid) returns integer language sql as $$ select public.acknowledge_document_lifecycle_service('15200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001',(select requirement from policy_ids),(select lifecycle_revision from public.employee_onboarding_requirements where id=(select requirement from policy_ids)),name,digest,auth_at,request_id) $$;
select throws_ok($$select pg_temp.ack('Wrong Name',(select content_digest from public.signature_template_versions where id=(select version from policy_ids)),now(),'75200000-0000-4000-8000-000000000001')$$,'22023',null,'incorrect full name cannot acknowledge');
select throws_ok($$select pg_temp.ack('Document Employee',repeat('0',64),now(),'75200000-0000-4000-8000-000000000001')$$,'22023',null,'changed content digest cannot acknowledge');
select throws_ok($$select pg_temp.ack('Document Employee',(select content_digest from public.signature_template_versions where id=(select version from policy_ids)),now()-interval '31 minutes','75200000-0000-4000-8000-000000000001')$$,'22023',null,'stale authentication cannot acknowledge');
update public.employee_onboarding_requirements set deadline_at=now()-interval '1 second' where id=(select requirement from policy_ids);
select ok(app_private.document_actor_blocked('15200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001'),'overdue required policy can restrict workspace');
select lives_ok($$select pg_temp.ack('document   EMPLOYEE',(select content_digest from public.signature_template_versions where id=(select version from policy_ids)),now(),'75200000-0000-4000-8000-000000000001')$$,'restricted employee acknowledges with whitespace/case normalization');
select ok(not app_private.document_actor_blocked('15200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001'),'valid policy acknowledgement resolves its blocker without general Submit');
select lives_ok($$select pg_temp.ack('document   EMPLOYEE',(select content_digest from public.signature_template_versions where id=(select version from policy_ids)),now(),'75200000-0000-4000-8000-000000000001')$$,'same acknowledgement idempotency retry is safe');
select is((select count(*)::integer from public.employee_acknowledgement_envelopes),1,'retry does not duplicate signature evidence');
select is(public.get_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001',(select requirement from policy_ids),true)->'policy'->'evidence'->>'typed_name','document   EMPLOYEE','account detail preserves name exactly as signed');
select public.save_employee_document_draft_file_service('15200000-0000-4000-8000-000000000002','65200000-0000-4000-8000-000000000001',1,'25200000-0000-4000-8000-000000000001/45200000-0000-4000-8000-000000000001/65200000-0000-4000-8000-000000000001/75200000-0000-4000-8000-000000000002.pdf','prior.pdf','application/pdf',100);
set constraints all deferred;
update public.workspace_memberships set status='suspended' where id='35200000-0000-4000-8000-000000000002';
update public.employee_profiles set user_id='15200000-0000-4000-8000-000000000003' where id='45200000-0000-4000-8000-000000000001';
insert into public.workspace_memberships(id,workspace_id,user_id,role,status) values('35200000-0000-4000-8000-000000000003','25200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000003','employee','pending_activation');
select lives_ok($$select app_private.reset_employee_onboarding_for_rehire('25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001','35200000-0000-4000-8000-000000000003','15200000-0000-4000-8000-000000000001');select public.initialize_employee_onboarding_service('15200000-0000-4000-8000-000000000003','25200000-0000-4000-8000-000000000001')$$,'canonical rehire reset retains history and permits fresh onboarding initialization');
set constraints all immediate;
select is((select count(*)::integer from public.employee_documents),1,'rehire preserves old document file');
select is((select count(*)::integer from public.employee_acknowledgement_envelopes),1,'rehire preserves old acknowledgement envelope');
select is((select count(*)::integer from public.employee_onboarding_requirements where source_id=(select version from policy_ids) and lifecycle_retired_at is null),1,'new account receives one fresh assignment for the same policy version');
select is((select status::text from public.employee_onboarding_requirements where source_id=(select version from policy_ids) and lifecycle_retired_at is null),'not_started','old acknowledgement does not satisfy the new account');
select ok((select bool_and(lifecycle_closed_at is not null and not required and not blocks_activation and deadline_at is null) from public.employee_onboarding_requirements where lifecycle_retired_at is not null),'retired requirements cannot block or run countdowns');
select throws_ok($$select public.get_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000003','25200000-0000-4000-8000-000000000001',(select requirement from policy_ids),true)$$,'P0002',null,'new account cannot see the previous account signature');
select throws_ok($$select public.get_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001',(select requirement from policy_ids),true)$$,'P0002',null,'old unlinked account cannot see organization history');
select lives_ok($$select public.get_employee_document_lifecycle_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',(select requirement from policy_ids),false)$$,'scoped reviewer can inspect retained history');
select * from finish();rollback;

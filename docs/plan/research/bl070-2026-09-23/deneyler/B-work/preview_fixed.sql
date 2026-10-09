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
update public.document_types set publication_status='published',published_at=now() where id=(select id from definition_test);

create function pg_temp.preview(l uuid[],j uuid[]) returns jsonb language sql as $$select public.preview_employee_document_assignments_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001',l,j)$$;
select is(pg_temp.preview(array['85200000-0000-4000-8000-000000000002'::uuid],array['a5200000-0000-4000-8000-000000000001'::uuid])->0->>'action','assign','preview evaluates independent location and global job inputs');
select is((select count(*)::integer from public.employee_onboarding_requirements where source_id=(select id from definition_test)),0,'preview does not mutate obligations');
select is(jsonb_array_length(pg_temp.preview(array['85200000-0000-4000-8000-000000000001'::uuid],array['a5200000-0000-4000-8000-000000000001'::uuid])),0,'AND requires selected location as well as global job');
select throws_ok($$select pg_temp.preview(array['85200000-0000-4000-8000-000000000099'::uuid],'{}')$$,'42501',null,'forged or cross-tenant assignment ids are rejected');
select app_private.document_reconcile_employee('25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001');
update public.employee_onboarding_requirements set deadline_at=now()-interval '1 second' where source_id=(select id from definition_test);
select is(pg_temp.preview(array['85200000-0000-4000-8000-000000000001'::uuid],array['a5200000-0000-4000-8000-000000000001'::uuid])->0->>'action','remove','target exit preview shows closing obligation');
select is(pg_temp.preview(array['85200000-0000-4000-8000-000000000001'::uuid],array['a5200000-0000-4000-8000-000000000001'::uuid])->0->>'clears_block','true','target exit preview shows clearing its access blocker');
set constraints all deferred;
delete from public.workspace_role_permissions where role_id=(select role_id from public.workspace_memberships where user_id='15200000-0000-4000-8000-000000000001') and permission_key in ('employee_documents.read','employee_documents.review');
set constraints all immediate;
select is(pg_temp.preview(array['85200000-0000-4000-8000-000000000001'::uuid],array['a5200000-0000-4000-8000-000000000001'::uuid])->0->>'title','Document requirement','employee manager without document-read receives no private document title');
update public.employee_onboarding_requirements set lifecycle_exempt=true where source_id=(select id from definition_test);
select is(jsonb_array_length(pg_temp.preview(array['85200000-0000-4000-8000-000000000001'::uuid],array['a5200000-0000-4000-8000-000000000001'::uuid])),0,'exemption wins over assignment preview');
select throws_ok($$select public.preview_employee_document_assignments_service('15200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001','{}','{}')$$,'42501',null,'self employee cannot inspect manager assignment impact');
select * from finish();rollback;

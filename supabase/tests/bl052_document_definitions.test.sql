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

select is(jsonb_array_length(public.document_definition_target_options_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001')->'locations'),2,'owner sees active location choices');
select is(jsonb_array_length(public.document_definition_target_options_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001')->'employees'),1,'owner sees employee choice');
select throws_ok($$select public.document_definition_target_options_service('15200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001')$$,'42501','Not allowed','employee cannot enumerate manager selectors');
select throws_ok($$select app_private.assert_document_definition_target('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','{"location_ids":["85200000-0000-4000-8000-000000000099"]}')$$,'42501','document target access denied','forged location selection denied');
select throws_ok($$select app_private.assert_document_definition_target('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','{"job_ids":["a5200000-0000-4000-8000-000000000099"]}')$$,'42501','document target access denied','forged job selection denied');
create temp table definition_test(id uuid);
insert into definition_test select public.save_document_type_lifecycle_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',null,null,'{"title":"Safety","description":"Document","requires_review":true,"accepted_formats":["pdf"],"tracks_expiry":false,"expiry_warning_days":30,"lifecycle_settings":{"mode":"conditional","assignment_scope":"all_active","target":{"operator":"and","location_ids":[],"department_ids":[],"job_ids":[],"employee_ids":[]},"period_days":7,"suspend_on_overdue":false,"extra_fields":[]}}');
select is((select lifecycle_revision from public.document_types where id=(select id from definition_test)),1,'new definition revision is one');
-- A definition reaches people only once it is published (D6); publishing assigns it.
create temp table publication_preview(preview jsonb);
insert into publication_preview select public.preview_document_publication_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',id) from definition_test;
select public.set_document_publication_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',d.id,(p.preview->>'revision')::int,(p.preview->>'publication_revision')::int,p.preview->>'preview_token','Publish','published') from definition_test d, publication_preview p;
select is((select lifecycle_settings->>'mode' from public.employee_onboarding_requirements where source_id=(select id from definition_test)),'conditional','requirement copies definition lifecycle');
select is((select deadline_at from public.employee_onboarding_requirements where source_id=(select id from definition_test)),now()+interval '7 days','active assignment starts defined deadline');
select ok((select not required and not blocks_activation from public.employee_onboarding_requirements where source_id=(select id from definition_test)),'conditional snapshot does not masquerade as required activation blocker');
-- A published definition is edited after it is unpublished; unpublishing pauses
-- what it asked of people.
delete from publication_preview;
insert into publication_preview select public.preview_document_publication_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',id) from definition_test;
select public.set_document_publication_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',d.id,(p.preview->>'revision')::int,(p.preview->>'publication_revision')::int,p.preview->>'preview_token','Edit','draft') from definition_test d, publication_preview p;
select is((select deadline_at from public.employee_onboarding_requirements where source_id=(select id from definition_test)),null,'an unpublished definition holds no running deadline');
select lives_ok($$select public.save_document_type_lifecycle_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',(select id from definition_test),1,jsonb_set(to_jsonb(d),'{lifecycle_settings,period_days}','14')) from public.document_types d where id=(select id from definition_test)$$,'definition revision can be edited');
select is((select lifecycle_revision from public.document_types where id=(select id from definition_test)),2,'one save moves the definition one revision');
select is((select lifecycle_settings->>'period_days' from public.employee_onboarding_requirements where source_id=(select id from definition_test)),'7','editing definition does not mutate assigned snapshot');
select throws_ok($$select public.save_document_type_lifecycle_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',(select id from definition_test),1,to_jsonb(d)) from public.document_types d where id=(select id from definition_test)$$,'PT409','document type changed; refresh required','stale definition edit is rejected');
select * from finish(); rollback;

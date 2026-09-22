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

create temp table definition_test(id uuid);
insert into definition_test select public.save_document_type_lifecycle_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',null,null,'{"title":"Safety","description":"Document","requires_review":true,"accepted_formats":["pdf"],"tracks_expiry":false,"expiry_warning_days":30,"lifecycle_settings":{"mode":"conditional","assignment_scope":"all_active","target":{"operator":"and","location_ids":[],"department_ids":[],"job_ids":[],"employee_ids":[]},"period_days":7,"suspend_on_overdue":false,"extra_fields":[]}}');
-- A document definition is applied to people only once it is published; a
-- draft has no one to reach. It is saved as a draft above, so it is
-- published before anything is attached to it.
update public.document_types set publication_status='published' where id=(select id from definition_test);
insert into public.employee_onboarding_requirements(id,workspace_id,employee_id,case_id,kind,source_id,title,required,blocks_activation,requires_review,sort_order,source_snapshot)
select '65200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001','55200000-0000-4000-8000-000000000001','document',id,'Safety',true,true,true,2,'{}' from definition_test;

-- A published definition is changed the way the app changes it: taken back
-- to draft, edited, published again. Publishing moves the revision on, so the
-- apply calls below read the revision as it stands rather than assume 2.
update public.document_types set publication_status='draft' where id=(select id from definition_test);
update public.document_types set lifecycle_settings=jsonb_set(lifecycle_settings,'{period_days}','14'),lifecycle_revision=2 where id=(select id from definition_test);
update public.document_types set publication_status='published' where id=(select id from definition_test);
create temp table impact_test as select public.preview_document_definition_apply_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',(select id from definition_test)) as data;
select is((select data->'employees'->0->>'action' from impact_test),'update','preview identifies an existing snapshot update');
select is((select data->'employees'->0->>'deadline_action' from impact_test),'restart','changed period is explicitly previewed as restart');
select is(public.apply_document_definition_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',(select id from definition_test),(select lifecycle_revision from public.document_types where id=(select id from definition_test)),(select data->>'preview_token' from impact_test),'Update delivery period')->>'applied','1','explicit apply updates exactly one scoped assignment');
select is((select lifecycle_settings->>'period_days' from public.employee_onboarding_requirements where id='65200000-0000-4000-8000-000000000002'),'14','explicit apply replaces old snapshot');
select is((select deadline_at from public.employee_onboarding_requirements where id='65200000-0000-4000-8000-000000000002'),now()+interval '14 days','previewed deadline restart is applied');
select throws_ok($$select public.apply_document_definition_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',(select id from definition_test),(select lifecycle_revision from public.document_types where id=(select id from definition_test)),(select data->>'preview_token' from impact_test),'Retry old preview')$$,'PT409','document impact changed; refresh preview','stale impact cannot be replayed after assignment changes');
select is(public.preview_document_definition_apply_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',(select id from definition_test))->'employees'->0->>'action','unchanged','fresh preview recognizes an already-applied definition');
select is((select count(*)::integer from public.onboarding_events where action='document.definition_applied'),1,'stale retry does not duplicate application audit');
update public.document_types set archived_at=now(),lifecycle_revision=3 where id=(select id from definition_test);
select is(public.preview_document_definition_apply_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',(select id from definition_test))->'employees'->0->>'action','remove','archived definition previews obligation removal');
select public.set_employee_document_exemption_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','65200000-0000-4000-8000-000000000002',2,true,'Persistent exception');
select is(public.preview_document_definition_apply_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',(select id from definition_test))->'employees'->0->>'action','exempt','explicit apply preserves exemption across definition changes');
select * from finish();rollback;

begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
-- BL-821: archiving a published document type does what Unpublish does. Mert archives the
-- published "Alcohol server permit": server Ali stops being asked and is no longer restricted,
-- and Bora, who joins the next day, is not asked either. Restore brings it back as a draft.
-- Schema-only replay supplies its own minimal synthetic permission catalog.
insert into public.permissions(key,label,category,description) select p,p,'People',p from unnest(array['documents.read','documents.manage','employee_documents.read','employee_documents.review','employees.read','employees.update']) p on conflict do nothing;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('18210000-0000-4000-8000-00000000000'||n)::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','bl821-'||n||'@example.test','','{}','{}',now(),now() from generate_series(1,3) n;
insert into public.workspaces(id,name,created_by) values('28210000-0000-4000-8000-000000000001','BL821 test','18210000-0000-4000-8000-000000000001');
insert into public.workspace_memberships (id, workspace_id, user_id, status, role_id, employee_role_id)
select m.id::uuid, m.workspace_id::uuid, m.user_id::uuid, 'active'::public.membership_status,
 (case when m.role <> 'employee' then (select r.id from public.workspace_roles r where r.workspace_id = m.workspace_id::uuid and r.system_key::text = m.role) end),
 (case when m.role = 'employee' then (select r.id from public.workspace_roles r where r.workspace_id = m.workspace_id::uuid and r.system_key = 'employee') end)
from (values
 ('38210000-0000-4000-8000-000000000001','28210000-0000-4000-8000-000000000001','18210000-0000-4000-8000-000000000001','owner'),
 ('38210000-0000-4000-8000-000000000002','28210000-0000-4000-8000-000000000001','18210000-0000-4000-8000-000000000002','employee')) as m(id, workspace_id, user_id, role);
insert into public.workspace_role_permissions(workspace_id,role_id,permission_key) select r.workspace_id,r.id,p.key from public.workspace_roles r cross join public.permissions p where r.workspace_id='28210000-0000-4000-8000-000000000001' and r.system_key='owner' on conflict do nothing;
insert into public.locations(id,workspace_id,name,short_name,street_address,city,region,postal_code,country_code,timezone) values
 ('88210000-0000-4000-8000-000000000001','28210000-0000-4000-8000-000000000001','West','WEST','1 Road','City','CA','90012','US','America/Los_Angeles');
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,preferred_name,invitation_email,created_by)
values('48210000-0000-4000-8000-000000000001','28210000-0000-4000-8000-000000000001','18210000-0000-4000-8000-000000000002','E-0001','Ali','Server','','bl821-2@example.test','18210000-0000-4000-8000-000000000001');
insert into public.employee_onboarding_cases(id,workspace_id,employee_id,membership_id)
values('58210000-0000-4000-8000-000000000001','28210000-0000-4000-8000-000000000001','48210000-0000-4000-8000-000000000001','38210000-0000-4000-8000-000000000002');
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,is_primary,created_by)
values('28210000-0000-4000-8000-000000000001','48210000-0000-4000-8000-000000000001','88210000-0000-4000-8000-000000000001',true,'18210000-0000-4000-8000-000000000001');

create temp table archive_test(id uuid, preview jsonb);
insert into archive_test(id) select public.save_document_type_lifecycle_service('18210000-0000-4000-8000-000000000001','28210000-0000-4000-8000-000000000001',null,null,'{"title":"Alcohol server permit","description":"Document","requires_review":true,"accepted_formats":["pdf"],"tracks_expiry":false,"expiry_warning_days":30,"lifecycle_settings":{"mode":"conditional","assignment_scope":"future_onboarding","target":{"operator":"and","location_ids":[],"department_ids":[],"job_ids":[],"employee_ids":[]},"period_days":7,"suspend_on_overdue":true,"extra_fields":[]}}');
set constraints all immediate;
update archive_test set preview=public.preview_document_publication_service('18210000-0000-4000-8000-000000000001','28210000-0000-4000-8000-000000000001',id);
select public.set_document_publication_service('18210000-0000-4000-8000-000000000001','28210000-0000-4000-8000-000000000001',id,(preview->>'revision')::int,(preview->>'publication_revision')::int,preview->>'preview_token','Publish','published') from archive_test;
select is((select count(*)::int from public.employee_onboarding_requirements where source_id=(select id from archive_test) and employee_id='48210000-0000-4000-8000-000000000001'),1,'publishing asks Ali for the permit');

-- Ali's permit is overdue, so he is restricted (ponytail: the deadline is moved into the past by hand).
update public.employee_onboarding_requirements set deadline_at=now()-interval '1 day',document_suspended_at=now() where source_id=(select id from archive_test);
select ok(app_private.document_actor_blocked('18210000-0000-4000-8000-000000000002','28210000-0000-4000-8000-000000000001'),'before archiving, the overdue permit restricts Ali');

select lives_ok($$select public.set_document_type_archived_service('18210000-0000-4000-8000-000000000001','28210000-0000-4000-8000-000000000001',(select id from archive_test),true)$$,'Mert archives the published permit');
select ok((select archived_at is not null from public.document_types where id=(select id from archive_test)),'the permit is archived');
select is((select publication_status from public.document_types where id=(select id from archive_test)),'draft','archiving takes the permit out of publication');
select is((select app_private.document_obligation_state(r,now()) from public.employee_onboarding_requirements r where source_id=(select id from archive_test)),'paused','Ali is no longer asked for the permit');
select ok((select deadline_at is null and document_suspended_at is null from public.employee_onboarding_requirements where source_id=(select id from archive_test)),'Ali has no running deadline or suspension');
select ok(not app_private.document_actor_blocked('18210000-0000-4000-8000-000000000002','28210000-0000-4000-8000-000000000001'),'archiving lifts Ali''s restriction');
select is((select count(*)::int from public.audit_events where workspace_id='28210000-0000-4000-8000-000000000001' and target_id=(select id::text from archive_test) and action='document_type.unpublished' and metadata->>'reason'='Archived'),1,'the audit trail says the archive unpublished the permit');
select is((select count(*)::int from public.audit_events where workspace_id='28210000-0000-4000-8000-000000000001' and target_id=(select id::text from archive_test) and action='document_type.archived'),1,'the archive itself is audited once');

-- Bora joins the next day: the archived permit is not asked of him.
insert into public.workspace_memberships (id, workspace_id, user_id, status, role_id, employee_role_id)
values('38210000-0000-4000-8000-000000000003','28210000-0000-4000-8000-000000000001','18210000-0000-4000-8000-000000000003','active',null,(select r.id from public.workspace_roles r where r.workspace_id='28210000-0000-4000-8000-000000000001' and r.system_key='employee'));
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,preferred_name,invitation_email,created_by)
values('48210000-0000-4000-8000-000000000002','28210000-0000-4000-8000-000000000001','18210000-0000-4000-8000-000000000003','E-0002','Bora','Host','','bl821-3@example.test','18210000-0000-4000-8000-000000000001');
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,is_primary,created_by)
values('28210000-0000-4000-8000-000000000001','48210000-0000-4000-8000-000000000002','88210000-0000-4000-8000-000000000001',true,'18210000-0000-4000-8000-000000000001');
select app_private.document_reconcile_employee('28210000-0000-4000-8000-000000000001','48210000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.employee_onboarding_requirements where source_id=(select id from archive_test) and employee_id='48210000-0000-4000-8000-000000000002'),0,'Bora is not asked for the archived permit');

-- Restore brings the permit back as a draft; nobody is asked until it is published again.
select lives_ok($$select public.set_document_type_archived_service('18210000-0000-4000-8000-000000000001','28210000-0000-4000-8000-000000000001',(select id from archive_test),false)$$,'Mert restores the permit');
select ok((select archived_at is null and publication_status='draft' from public.document_types where id=(select id from archive_test)),'the restored permit is a draft');
select is((select app_private.document_obligation_state(r,now()) from public.employee_onboarding_requirements r where source_id=(select id from archive_test) and employee_id='48210000-0000-4000-8000-000000000001'),'paused','restoring does not ask Ali again');

-- Archiving a draft changes no publication.
select lives_ok($$select public.set_document_type_archived_service('18210000-0000-4000-8000-000000000001','28210000-0000-4000-8000-000000000001',(select id from archive_test),true)$$,'Mert archives the draft permit');
select is((select count(*)::int from public.audit_events where workspace_id='28210000-0000-4000-8000-000000000001' and target_id=(select id::text from archive_test) and action='document_type.unpublished'),1,'archiving a draft unpublishes nothing');

-- A document type is never archived and published at once.
select throws_ok($$update public.document_types set publication_status='published' where id=(select id from archive_test)$$,'23514',null,'an archived document type cannot be published behind the service');

-- A published document whose target job was archived later can still be unpublished and archived:
-- Mert asks bartenders for a "Bartender card", then archives the Bartender job (review finding).
insert into public.jobs(id,workspace_id,department_id,name) values('a8210000-0000-4000-8000-000000000001','28210000-0000-4000-8000-000000000001',null,'Bartender');
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,created_by)
values('28210000-0000-4000-8000-000000000001','48210000-0000-4000-8000-000000000001','a8210000-0000-4000-8000-000000000001','18210000-0000-4000-8000-000000000001');
create temp table bartender_test(id uuid, preview jsonb);
insert into bartender_test(id) select public.save_document_type_lifecycle_service('18210000-0000-4000-8000-000000000001','28210000-0000-4000-8000-000000000001',null,null,'{"title":"Bartender card","description":"Document","requires_review":true,"accepted_formats":["pdf"],"tracks_expiry":false,"expiry_warning_days":30,"lifecycle_settings":{"mode":"conditional","assignment_scope":"future_onboarding","target":{"operator":"and","location_ids":[],"department_ids":[],"job_ids":["a8210000-0000-4000-8000-000000000001"],"employee_ids":[]},"period_days":7,"suspend_on_overdue":true,"extra_fields":[]}}');
update bartender_test set preview=public.preview_document_publication_service('18210000-0000-4000-8000-000000000001','28210000-0000-4000-8000-000000000001',id);
select public.set_document_publication_service('18210000-0000-4000-8000-000000000001','28210000-0000-4000-8000-000000000001',id,(preview->>'revision')::int,(preview->>'publication_revision')::int,preview->>'preview_token','Publish','published') from bartender_test;
select is((select count(*)::int from public.employee_onboarding_requirements where source_id=(select id from bartender_test) and lifecycle_closed_at is null),1,'Ali, a bartender, is asked for the Bartender card');
update public.jobs set archived_at=now() where id='a8210000-0000-4000-8000-000000000001';
select lives_ok($$select public.preview_document_publication_service('18210000-0000-4000-8000-000000000001','28210000-0000-4000-8000-000000000001',(select id from bartender_test))$$,'the Unpublish preview still opens after the target job is archived');
select lives_ok($$select public.set_document_type_archived_service('18210000-0000-4000-8000-000000000001','28210000-0000-4000-8000-000000000001',(select id from bartender_test),true)$$,'Mert archives the Bartender card after archiving the job');
select is((select publication_status from public.document_types where id=(select id from bartender_test)),'draft','the archived Bartender card is out of publication');
select throws_ok($$select public.preview_document_publication_service('18210000-0000-4000-8000-000000000001','28210000-0000-4000-8000-000000000001',(select id from bartender_test))$$,'PT409',null,'the archived card cannot be previewed for publishing');
select lives_ok($$select public.set_document_type_archived_service('18210000-0000-4000-8000-000000000001','28210000-0000-4000-8000-000000000001',(select id from bartender_test),false)$$,'Mert restores the card');
select throws_ok($$select public.preview_document_publication_service('18210000-0000-4000-8000-000000000001','28210000-0000-4000-8000-000000000001',(select id from bartender_test))$$,'42501',null,'publishing it again still refuses a target job that is archived');

select * from finish();
rollback;

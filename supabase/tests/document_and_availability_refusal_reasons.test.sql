begin;
-- BL-1028: a document or availability write refused with PT409 says which kind
-- of refusal in its hint. "Someone changed it meanwhile, reload" and a
-- standing "this cannot happen" used to share the one code and no key, so a
-- screen could only guess (the document drawer reloaded to find out).
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

create function pg_temp.refusal(statement text) returns text language plpgsql as $$
declare state text; key text;
begin
 execute statement;
 return 'no refusal';
exception when others then
 get stacked diagnostics state=returned_sqlstate, key=pg_exception_hint;
 return state||' '||coalesce(nullif(key,''),'(no hint)');
end;
$$;

-- Every PT409 these functions raise carries one of the known keys.
create temp table refusal_functions as
select p.oid, n.nspname||'.'||p.proname fn
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname||'.'||p.proname = any(array[
 'app_private.apply_lifecycle_definition','app_private.assert_document_published','app_private.guard_document_definition_edit','app_private.set_document_exemption',
 'public.acknowledge_document_lifecycle_service','public.defer_initial_employee_document_service','public.extend_employee_document_deadline_service',
 'public.preview_document_publication_service','public.remove_employee_document_draft_file_service','public.review_employee_document_lifecycle_service',
 'public.save_document_type_lifecycle_service','public.save_employee_document_draft_file_service','public.save_policy_lifecycle_service',
 'public.set_document_publication_service','public.set_employee_document_timezone_service','public.submit_employee_document_lifecycle_service',
 'public.withdraw_document_acknowledgement_service',
 'public.validate_weekly_preference_command','public.weekly_preference_settings_save_service','public.guard_schedule_availability_input_write']);
create temp table refusal_raises as
select fn, m[1] statement
from refusal_functions, regexp_matches(pg_get_functiondef(oid), $re$(raise\s+exception\s+'(?:[^']|'')*'[^;]*;)$re$, 'gi') m
where m[1] ~* 'PT409';
select is((select count(distinct fn)::int from refusal_functions),20,'every listed document and availability function exists');
select ok((select count(*)>=30 from refusal_raises),'the PT409 refusals are found in the function bodies');
select is((select coalesce(array_agg(distinct fn order by fn),'{}') from refusal_raises where statement !~* 'hint'),'{}'::text[],
 'no document or availability PT409 is raised without a reason key');
select is((select coalesce(array_agg(distinct key order by key),'{}') from (select (regexp_match(statement,$re$hint\s*=\s*'([^']*)'$re$,'i'))[1] key from refusal_raises) k
 where key is null or key not in ('document.changed','document.paused','document.published_locked','document.archived','document.acknowledgement_request_reused',
  'employee.revision_conflict','availability.changed','schedule.busy')),'{}'::text[],'every key is one the screens know');

-- Documents: the fixture of document_publication.test.sql.
-- Schema-only replay supplies its own minimal synthetic permission catalog.
insert into public.permissions(key,label,category,description) select p,p,'People',p from unnest(array['documents.read','documents.manage','employee_documents.read','employee_documents.review','employees.read','employees.update']) p on conflict do nothing;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('15200000-0000-4000-8000-00000000000'||n)::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','bl052-'||n||'@example.test','','{}','{}',now(),now() from generate_series(1,5) n;
insert into public.workspaces(id,name,created_by) values('25200000-0000-4000-8000-000000000001','BL052 test','15200000-0000-4000-8000-000000000001');
insert into public.workspace_memberships (id, workspace_id, user_id, status, role_id, employee_role_id)
select legacy.id::uuid, legacy.workspace_id::uuid, legacy.user_id::uuid, legacy.status::text::public.membership_status, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values
 ('35200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000001','owner','active',true),
 ('35200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000002','employee','active',true)) as legacy(id, workspace_id, user_id, role, status, all_locations);
insert into public.workspace_role_permissions(workspace_id,role_id,permission_key) select r.workspace_id,r.id,p.key from public.workspace_roles r cross join public.permissions p where r.workspace_id='25200000-0000-4000-8000-000000000001' and r.system_key='owner' on conflict do nothing;
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


create temp table publication_test(id uuid, preview jsonb);
insert into publication_test(id) select public.save_document_type_lifecycle_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',null,null,'{"title":"Publication safety","description":"Document","requires_review":true,"accepted_formats":["pdf"],"tracks_expiry":false,"expiry_warning_days":30,"lifecycle_settings":{"mode":"conditional","assignment_scope":"future_onboarding","target":{"operator":"and","location_ids":[],"department_ids":[],"job_ids":[],"employee_ids":[]},"period_days":7,"suspend_on_overdue":true,"extra_fields":[]}}');
select is(pg_temp.refusal($$select public.save_document_type_lifecycle_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',(select id from publication_test),99,(select to_jsonb(d)-'id' from public.document_types d where id=(select id from publication_test)))$$),
 'PT409 document.changed','a document type saved over a newer one: changed meanwhile');
update publication_test set preview=public.preview_document_publication_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',id);
select is(pg_temp.refusal($$select public.set_document_publication_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',(select id from publication_test),(select (preview->>'revision')::int from publication_test),1,'stale','Publish','published')$$),
 'PT409 document.changed','a publish from an old preview: changed meanwhile');
select public.set_document_publication_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',id,(preview->>'revision')::int,(preview->>'publication_revision')::int,preview->>'preview_token','Publish','published') from publication_test;
select is(pg_temp.refusal($$update public.document_types set title='Bypass' where id=(select id from publication_test)$$),
 'PT409 document.published_locked','a published document''s content cannot be edited: standing refusal');

create temp table employee_copy as select id, lifecycle_revision from public.employee_onboarding_requirements where source_id=(select id from publication_test) and employee_id='45200000-0000-4000-8000-000000000001';
select is((select count(*)::int from employee_copy),1,'publishing asked the employee for the document');
select is(pg_temp.refusal($$select public.save_employee_document_draft_file_service('15200000-0000-4000-8000-000000000002',(select id from employee_copy),(select lifecycle_revision from employee_copy)+5,
 '25200000-0000-4000-8000-000000000001/45200000-0000-4000-8000-000000000001/'||(select id from employee_copy)||'/75200000-0000-4000-8000-000000000021.pdf','one.pdf','application/pdf',100)$$),
 'PT409 document.changed','an upload against an old revision: changed meanwhile');

update publication_test set preview=public.preview_document_publication_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',id);
select public.set_document_publication_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',id,(preview->>'revision')::int,(preview->>'publication_revision')::int,preview->>'preview_token','Unpublish','draft') from publication_test;
select is(pg_temp.refusal($$select public.save_employee_document_draft_file_service('15200000-0000-4000-8000-000000000002',r.id,r.lifecycle_revision,
 '25200000-0000-4000-8000-000000000001/45200000-0000-4000-8000-000000000001/'||r.id||'/75200000-0000-4000-8000-000000000022.pdf','one.pdf','application/pdf',100)
 from public.employee_onboarding_requirements r where r.id=(select id from employee_copy)$$),
 'PT409 document.paused','an upload to an unpublished document: standing refusal, nothing to reload');

update public.document_types set archived_at=now() where id=(select id from publication_test);
select is(pg_temp.refusal($$select public.preview_document_publication_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001',(select id from publication_test))$$),
 'PT409 document.archived','an archived document cannot be published: standing refusal');

select is(pg_temp.refusal($$select public.set_employee_document_timezone_service('15200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','65200000-0000-4000-8000-000000000001',
 (select revision from public.employee_profiles where id='45200000-0000-4000-8000-000000000001')+1,'America/Denver')$$),
 'PT409 employee.revision_conflict','a time zone saved over a newer person record: the person changed meanwhile');

-- Availability: the fixture of weekly_preferences_commands.test.sql.
create temp table wp_fixture as select
 'ad410000-0000-4000-8000-000000000001'::uuid w,
 'ad410000-0000-4000-8000-000000000002'::uuid owner_id,
 'ad410000-0000-4000-8000-000000000003'::uuid actor,
 'ad410000-0000-4000-8000-000000000004'::uuid emp,
 'ad410000-0000-4000-8000-000000000005'::uuid manager,
 'ad410000-0000-4000-8000-000000000006'::uuid loc,
 'ad410000-0000-4000-8000-000000000007'::uuid other_loc,
 'ad410000-0000-4000-8000-000000000008'::uuid dinner,
 'ad410000-0000-4000-8000-000000000009'::uuid hidden_type,
 public.empty_weekly_preference() p;
insert into auth.users(id,email) select owner_id,'weekly-owner@example.test' from wp_fixture
 union all select actor,'weekly-employee@example.test' from wp_fixture
 union all select manager,'weekly-manager@example.test' from wp_fixture;
insert into public.workspaces(id,name,created_by) select w,'Weekly preferences test',owner_id from wp_fixture;
insert into public.workspace_memberships (workspace_id, user_id, role_id, employee_role_id)
select legacy.workspace_id::uuid, legacy.user_id::uuid, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (select w,owner_id,'owner'::public.workspace_role,true from wp_fixture
 union all select w,actor,'employee'::public.workspace_role,false from wp_fixture
 union all select w,manager,'manager'::public.workspace_role,false from wp_fixture) as legacy(workspace_id, user_id, role, all_locations);
insert into public.workspace_scheduling_settings(workspace_id) select w from wp_fixture on conflict do nothing;
insert into public.locations(short_name, id,workspace_id,name,street_address,city,region,postal_code,timezone)
 select 'T00066', loc,w,'West','1 Test Street','Test City','CA','90001','America/Los_Angeles' from wp_fixture
 union all select 'T00067', other_loc,w,'East','2 Test Street','Test City','NY','10001','America/New_York' from wp_fixture;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
 select emp,w,actor,'E-993417','Weekly','Tester',owner_id from wp_fixture;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
 select w,emp,loc,owner_id from wp_fixture union all select w,emp,other_loc,owner_id from wp_fixture;
select tests.works_at(m.id, f.loc) from wp_fixture f join public.workspace_memberships m on m.workspace_id=f.w and m.user_id in(f.actor,f.manager);
insert into public.shift_types(id,workspace_id,name,color,default_start_time,default_end_time)
 select dinner,w,'Dinner','#256b56','17:00'::time,'23:00'::time from wp_fixture
 union all select hidden_type,w,'Private fallback','#256b56','09:00'::time,'12:00'::time from wp_fixture;


create temp table wp_command(command jsonb,result jsonb,request_key uuid default gen_random_uuid());
select is(pg_temp.refusal($$select public.weekly_preferences_save_service(actor,w,jsonb_build_object('employee_id',emp,'source','employee','expected_revision',3,'settings_revision',0,'preference',p),gen_random_uuid()) from wp_fixture$$),
 'PT409 availability.changed','a week saved over a newer one: changed meanwhile');
select is(pg_temp.refusal($$select public.weekly_preferences_save_service(actor,w,jsonb_build_object('employee_id',emp,'source','employee','expected_revision',0,'settings_revision',7,'preference',p),gen_random_uuid()) from wp_fixture$$),
 'PT409 availability.changed','a week saved under old availability settings: changed meanwhile');
select is(pg_temp.refusal($$select public.weekly_preference_settings_save_service(owner_id,w,'{"onboarding_required":false,"expected_revision":4}',gen_random_uuid()) from wp_fixture$$),
 'PT409 availability.changed','availability settings saved over newer ones: changed meanwhile');

select * from finish();
rollback;

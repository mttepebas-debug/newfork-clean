begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table f as select
 'b1640000-0000-4000-8000-000000000001'::uuid w,
 'b1640000-0000-4000-8000-000000000002'::uuid actor,
 'b1640000-0000-4000-8000-000000000003'::uuid loc,
 'b1640000-0000-4000-8000-000000000004'::uuid job,
 'b1640000-0000-4000-8000-000000000005'::uuid emp,
 'b1640000-0000-4000-8000-000000000006'::uuid typ,
 'b1640000-0000-4000-8000-000000000007'::uuid shift;
insert into auth.users(id,email) select actor,'bl064@example.test' from f;
insert into public.workspaces(id,name,created_by) select w,'BL064 SQL fixture',actor from f;
insert into public.workspace_memberships (workspace_id, user_id, role_id, employee_role_id)
select legacy.workspace_id::uuid, legacy.user_id::uuid, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (select w,actor,'owner',true from f) as legacy(workspace_id, user_id, role, all_locations);
insert into public.locations(short_name, id,workspace_id,name,street_address,city,region,postal_code,timezone)
 select 'T00007', loc,w,'Test','1 Test','Test','CA','90001','America/Los_Angeles' from f;
insert into public.jobs(id,workspace_id,name) select job,w,'Test' from f;
insert into public.shift_types(id,workspace_id,name,default_start_time,default_end_time) select typ,w,'Test','09:00','17:00' from f;
insert into public.employee_profiles(id,workspace_id,employee_code,first_name,last_name,created_by)
 select emp,w,'E-993064','BL064','Tester',actor from f;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by) select w,emp,loc,actor from f;
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,is_primary,created_by) select w,emp,job,true,actor from f;
create temp table editor as select (public.acquire_schedule_edit_session_service(actor,w,'2035-01-15','blank',null)->'session'->>'id')::uuid id from f;
create function pg_temp.shift(changes jsonb default '{}') returns jsonb language sql stable as $$
 select jsonb_build_object('id',shift,'session_id',(select id from editor),'location_id',loc,'employee_id',emp,'job_id',job,'shift_type_id',typ,
  'scheduled_date','2035-01-15','time_basis','explicit','start_time','09:00','end_time','17:00','time_timezone','America/Los_Angeles')||changes from f;
$$;
create function pg_temp.assess(changes jsonb default '{}') returns jsonb language sql stable as $$
 select public.assess_weekly_shift_availability(w,emp,pg_temp.shift(changes)) from f;
$$;

insert into auth.users(id,email) values('b1520000-0000-4000-8000-000000000099','document-conflict@example.test');
update public.employee_profiles set user_id='b1520000-0000-4000-8000-000000000099' where id=(select emp from f);
insert into public.workspace_memberships (workspace_id, user_id, status, role_id, employee_role_id)
select legacy.workspace_id::uuid, legacy.user_id::uuid, legacy.status::text::public.membership_status, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (select w,'b1520000-0000-4000-8000-000000000099','employee','active' from f) as legacy(workspace_id, user_id, role, status);
insert into public.employee_onboarding_cases(id,workspace_id,employee_id,membership_id) select 'b1520000-0000-4000-8000-000000000001',w,emp,m.id from f join public.workspace_memberships m on m.workspace_id=f.w and m.user_id='b1520000-0000-4000-8000-000000000099';
insert into public.employee_onboarding_requirements(id,workspace_id,employee_id,case_id,kind,title,required,blocks_activation,requires_review,sort_order,lifecycle_settings)
select 'b1520000-0000-4000-8000-000000000002',w,emp,'b1520000-0000-4000-8000-000000000001','document','Certification',false,false,true,1,'{"mode":"optional","target":{"location_ids":[],"job_ids":[],"department_ids":[],"employee_ids":[]},"assignment_scope":"all_active","period_days":7,"suspend_on_overdue":false,"extra_fields":[]}' from f;
select is(pg_temp.assess()->>'conflict_severity','allow','optional missing document adds no conflict');
update public.employee_onboarding_requirements set lifecycle_settings=jsonb_set(lifecycle_settings,'{mode}','"required"') where id='b1520000-0000-4000-8000-000000000002';
select is(pg_temp.assess()->>'conflict_severity','confirm','required missing document defaults to central confirmation');
select is(pg_temp.assess()->'reasons'->0->>'code','document_required','canonical assessment carries required document reason');
update public.workspace_scheduling_settings set conflict_rules=jsonb_set(conflict_rules,'{document_required}','"warn"') where workspace_id=(select w from f);
select is(pg_temp.assess()->>'conflict_severity','warn','required document central warning is respected');
update public.workspace_scheduling_settings set conflict_rules=jsonb_set(conflict_rules,'{document_required}','"block"') where workspace_id=(select w from f);
select is(pg_temp.assess()->>'conflict_severity','block','required document central block is respected');
select throws_ok($$select public.prepare_weekly_schedule_assignment(actor,w,pg_temp.shift(),null) from f$$,'23514',null,'assignment command enforces document block without UI');
insert into public.employee_document_submissions(id,workspace_id,employee_id,requirement_id,user_id,version,state,expiry_date,submitted_at)
select 'b1520000-0000-4000-8000-000000000003',w,emp,'b1520000-0000-4000-8000-000000000002','b1520000-0000-4000-8000-000000000099',1,'accepted','2035-01-15',now() from f;
update public.employee_onboarding_requirements set approved_document_id='b1520000-0000-4000-8000-000000000003' where id='b1520000-0000-4000-8000-000000000002';
select is(pg_temp.assess()->>'conflict_severity','allow','approved document stays valid through target shift scheduled date');
select is(pg_temp.assess('{"scheduled_date":"2035-01-16"}')->>'conflict_severity','block','following shift date evaluates expiry even though server today differs');
update public.employee_onboarding_requirements set approved_document_id=null,lifecycle_settings=jsonb_set(lifecycle_settings,'{mode}','"conditional"'),deadline_at='2035-01-15T18:00:00Z' where id='b1520000-0000-4000-8000-000000000002';
select is(pg_temp.assess()->>'conflict_severity','warn','conditional grace at target shift start uses warning floor');
select is(pg_temp.assess('{"start_time":"10:00"}')->>'conflict_severity','confirm','exact UTC grace boundary becomes confirmation');
select throws_ok($$update public.workspace_scheduling_settings set conflict_rules=jsonb_set(conflict_rules,'{document_conditional_overdue}','"warn"') where workspace_id=(select w from f)$$,'23514',null,'server rejects overdue severity below confirmation');
select throws_ok($$update public.workspace_scheduling_settings set conflict_rules=jsonb_set(conflict_rules,'{document_conditional_grace}','"block"') where workspace_id=(select w from f)$$,'23514',null,'server rejects overdue severity softer than grace');
update public.employee_onboarding_requirements set lifecycle_exempt=true where id='b1520000-0000-4000-8000-000000000002';
select is(pg_temp.assess('{"start_time":"10:00"}')->>'conflict_severity','allow','exemption removes document conflict without other rule changes');
update public.workspace_scheduling_settings set conflict_rules='{"approved_time_off":"block","closed_location":"confirm","minimum_travel":"confirm","minimum_rest":"confirm"}' where workspace_id=(select w from f);
select is((select conflict_rules->>'document_required' from public.workspace_scheduling_settings where workspace_id=(select w from f)),'block','legacy partial rules preserve current document choices');
-- The actual publication command must revalidate the same canonical document policy.
create temp table pub as select (public.save_schedule_edit_session_service(f.actor,f.w,e.id,e.revision,'Document publish proof',null,null)->>'id')::uuid draft, null::jsonb preview
 from f join public.schedule_edit_sessions e on e.id=(select id from editor);
insert into public.schedule_draft_shifts(id,workspace_id,draft_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
 select shift,w,(select draft from pub),loc,emp,job,typ,'2035-01-15','09:00','17:00','explicit','America/Los_Angeles' from f;
create function pg_temp.preflight() returns jsonb language sql as $$
 select public.preview_schedule_publication_service(actor,w,draft,array[loc],null,true) from f,pub;
$$;
create function pg_temp.publish() returns jsonb language sql as $$
 select public.publish_schedule_draft_service(actor,w,draft,array[loc],null,true,d.revision,p.preview->>'fingerprint',
  (select coalesce(jsonb_agg(jsonb_build_object('finding_id',finding->>'id')),'[]') from jsonb_array_elements(p.preview->'findings') finding where finding->>'severity'='soft'))
 from f,pub p join public.schedule_drafts d on d.id=p.draft;
$$;
update public.employee_onboarding_requirements set lifecycle_exempt=false,lifecycle_settings=jsonb_set(lifecycle_settings,'{mode}','"required"') where id='b1520000-0000-4000-8000-000000000002';
update public.workspace_scheduling_settings set conflict_rules=jsonb_set(conflict_rules,'{document_required}','"confirm"') where workspace_id=(select w from f);
update pub set preview=pg_temp.preflight();
select is((select preview->>'status' from pub),'override_required','required missing document reaches publication confirmation');
select is(pg_temp.publish()->>'status','published','manager confirmation publishes through canonical document finding');
update public.workspace_scheduling_settings set conflict_rules=jsonb_set(conflict_rules,'{document_required}','"block"') where workspace_id=(select w from f);
update pub set preview=pg_temp.preflight();
select is((select preview->>'status' from pub),'hard_blocked','new hard document policy invalidates prior publication acceptance');
select throws_ok($$select pg_temp.publish()$$,'23514',null,'publication cannot bypass newly blocking document');
update public.employee_onboarding_requirements set approved_document_id='b1520000-0000-4000-8000-000000000003' where id='b1520000-0000-4000-8000-000000000002';
update pub set preview=pg_temp.preflight();
select is((select preview->>'status' from pub),'publish_ready','valid approved document clears publication blocker');
select is(pg_temp.publish()->>'status','published','resolved document publishes successfully');
select * from finish();rollback;

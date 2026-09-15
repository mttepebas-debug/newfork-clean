begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table wp_fixture as select
 'ad421000-0000-4000-8000-000000000001'::uuid w,
 'ad421000-0000-4000-8000-000000000002'::uuid owner_id,
 'ad421000-0000-4000-8000-000000000003'::uuid actor,
 'ad421000-0000-4000-8000-000000000004'::uuid emp,
 'ad421000-0000-4000-8000-000000000005'::uuid manager,
 'ad421000-0000-4000-8000-000000000006'::uuid loc,
 'ad421000-0000-4000-8000-000000000007'::uuid other_loc,
 'ad421000-0000-4000-8000-000000000008'::uuid shift_id;
insert into auth.users(id,email) select owner_id,'weekly-owner@example.test' from wp_fixture
 union all select actor,'weekly-employee@example.test' from wp_fixture
 union all select manager,'weekly-manager@example.test' from wp_fixture;
insert into public.workspaces(id,name,created_by) select w,'Weekly acceptance test',owner_id from wp_fixture;
insert into public.workspace_memberships(workspace_id,user_id,role,all_locations)
 select w,owner_id,'owner'::public.workspace_role,true from wp_fixture
 union all select w,actor,'employee'::public.workspace_role,false from wp_fixture
 union all select w,manager,'manager'::public.workspace_role,false from wp_fixture;
insert into public.workspace_scheduling_settings(workspace_id) select w from wp_fixture on conflict do nothing;
update public.workspace_scheduling_settings set availability_warning_policy='warn' where workspace_id=(select w from wp_fixture);
insert into public.locations(id,workspace_id,name,street_address,city,region,postal_code,timezone)
 select loc,w,'West','1 Test Street','Test City','CA','90001','America/Los_Angeles' from wp_fixture
 union all select other_loc,w,'East','2 Test Street','Test City','NY','10001','America/New_York' from wp_fixture;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
 select emp,w,actor,'E-993421','Weekly','Tester',owner_id from wp_fixture;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
 select w,emp,loc,owner_id from wp_fixture union all select w,emp,other_loc,owner_id from wp_fixture;
insert into public.membership_location_scopes(workspace_id,membership_id,location_id)
 select f.w,m.id,f.loc from wp_fixture f join public.workspace_memberships m on m.workspace_id=f.w and m.user_id in(f.actor,f.manager);
insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by)
 select w,emp,jsonb_set(public.empty_weekly_preference('time_range'),'{days,1,range}','{"start":"18:00","end":"20:00"}'),1,actor from wp_fixture;
-- A normal scheduling manager no longer needs the legacy override capability.
delete from public.workspace_role_permissions where workspace_id=(select w from wp_fixture) and permission_key='schedule.availability.override';
create function pg_temp.assignment(changes jsonb default '{}') returns jsonb language sql stable as $$
 select jsonb_build_object('id',shift_id,'employee_id',emp,'location_id',loc,'scheduled_date','2035-01-15',
  'time_basis','explicit','start_time','18:00','end_time','20:00','time_timezone','America/Los_Angeles')||changes from wp_fixture;
$$;
create function pg_temp.preview(changes jsonb default '{}') returns jsonb language sql stable as $$
 select public.assess_weekly_schedule_assignment_service(manager,w,pg_temp.assignment(changes)) from wp_fixture;
$$;
create function pg_temp.accept(changes jsonb default '{}',previous jsonb default null) returns void language sql as $$
 select public.prepare_weekly_schedule_assignment(manager,w,pg_temp.assignment(changes),previous) from wp_fixture;
$$;
select is(pg_temp.preview()->>'warning_policy','warn','preview reads current warning policy');
select is(pg_temp.preview()->>'can_override','true','scheduling manager does not need obsolete override permission');
select throws_ok($$select public.assess_weekly_schedule_assignment_service(actor,w,pg_temp.assignment()) from wp_fixture$$,'42501',null,'employee cannot inspect manager assessment');
select throws_ok($$select pg_temp.preview(jsonb_build_object('location_id',other_loc)) from wp_fixture$$,'42501',null,'manager assessment enforces target location scope');
select throws_ok($$select public.assess_weekly_schedule_assignment_service(manager,w,pg_temp.assignment(),shift_id,gen_random_uuid()) from wp_fixture$$,'42501',null,'expired or foreign edit session is rejected');
select throws_ok($$select pg_temp.accept()$$,'PT409',null,'warn policy still requires a fresh checked fingerprint');
create temp table checked as select pg_temp.assignment(jsonb_build_object('availability_assessment_fingerprint',pg_temp.preview()->>'fingerprint')) s;
select lives_ok($$select pg_temp.accept((select s from checked))$$,'warn acceptance needs no reason');
select is((select count(*) from public.schedule_availability_overrides where workspace_id=(select w from wp_fixture) and revoked_at is null),1::bigint,'one current acceptance is stored');
select is((select reason from public.schedule_availability_overrides where workspace_id=(select w from wp_fixture) and revoked_at is null),'Schedule warning acknowledged (warn policy).','system action is recorded without inventing an employee explanation');
select is((select actor_user_id from public.schedule_availability_overrides where workspace_id=(select w from wp_fixture) and revoked_at is null),(select manager from wp_fixture),'acceptance records the actual manager');
insert into public.jobs(id,workspace_id,name) select 'ad421000-0000-4000-8000-000000000011',w,'Server' from wp_fixture;
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,is_primary,created_by)
 select w,emp,'ad421000-0000-4000-8000-000000000011',true,owner_id from wp_fixture;
create temp table editor_session as select (public.acquire_schedule_edit_session_service(manager,w,'2035-01-15','blank',null)->'session'->>'id')::uuid id from wp_fixture;
insert into public.schedule_edit_session_shifts(id,workspace_id,session_id,location_id,employee_id,job_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
 select shift_id,w,(select id from editor_session),loc,emp,'ad421000-0000-4000-8000-000000000011','2035-01-15','18:00','20:00','explicit','America/Los_Angeles' from wp_fixture;
create function pg_temp.editor_assess(changes jsonb default '{}') returns jsonb language sql stable as $$
 select public.assess_weekly_schedule_assignment_service(manager,w,pg_temp.assignment(changes),shift_id,(select id from editor_session)) from wp_fixture;
$$;
select is(pg_temp.editor_assess()->>'override_recorded','true','editor receives stored same-assignment acceptance');
select is(pg_temp.editor_assess('{"note":"Only a note changed"}')->>'override_recorded','true','editor note change retains acceptance');
select ok(pg_temp.editor_assess('{"start_time":"19:00"}')->>'override_recorded' is null,'changed hours do not inherit the editor acceptance');
select throws_ok($$select public.assess_weekly_schedule_assignment_service(manager,w,pg_temp.assignment(),gen_random_uuid(),(select id from editor_session)) from wp_fixture$$,'P0002',null,'deleted edit-session target cannot silently become a new assignment');
select lives_ok($$select pg_temp.accept('{"notes":"Changed shift note"}',pg_temp.assignment())$$,'same effective conflict reuses acceptance without a new fingerprint');
select is((select count(*) from public.schedule_availability_overrides where workspace_id=(select w from wp_fixture)),1::bigint,'unchanged conflict does not append duplicate history');
select throws_ok($$select pg_temp.accept('{"id":"ad421000-0000-4000-8000-000000000009"}',pg_temp.assignment())$$,'PT409',null,'acceptance cannot transfer to another shift');
select throws_ok($$select public.prepare_weekly_schedule_assignment(actor,w,pg_temp.assignment(),pg_temp.assignment()) from wp_fixture$$,'42501',null,'employee cannot reuse a manager acceptance');
update public.employee_weekly_preferences set preference=jsonb_set(preference,'{days,2,all_day}','true'),revision=revision+1 where workspace_id=(select w from wp_fixture);
select lives_ok($$select pg_temp.accept('{}',pg_temp.assignment())$$,'unrelated weekday change retains acceptance');
update public.employee_weekly_preferences set preference=jsonb_set(preference,'{days,1,range}','{"start":"19:00","end":"20:00"}'),revision=revision+1 where workspace_id=(select w from wp_fixture);
select throws_ok($$select pg_temp.accept((select s from checked),pg_temp.assignment())$$,'PT409',null,'changed physical conflict requires a fresh decision');
select is((select count(*) from public.schedule_availability_overrides where workspace_id=(select w from wp_fixture) and revoked_at is null),1::bigint,'failed decision does not revoke prior history');
select lives_ok($$select pg_temp.accept(jsonb_build_object('availability_assessment_fingerprint',pg_temp.preview()->>'fingerprint'),pg_temp.assignment())$$,'fresh conflict assessment can be accepted');
select is((select count(*) from public.schedule_availability_overrides where workspace_id=(select w from wp_fixture) and revoked_at is not null),1::bigint,'superseded acceptance remains as revoked history');
update public.workspace_scheduling_settings set availability_warning_policy='confirm' where workspace_id=(select w from wp_fixture);
select throws_ok($$select pg_temp.accept('{}',pg_temp.assignment())$$,'PT409',null,'warn to confirm invalidates previous acceptance');
select lives_ok($$select pg_temp.accept(jsonb_build_object('availability_assessment_fingerprint',pg_temp.preview()->>'fingerprint'),pg_temp.assignment())$$,'confirmation does not need a written reason');
select is((select reason from public.schedule_availability_overrides where workspace_id=(select w from wp_fixture) and revoked_at is null),'Schedule conflict confirmed by manager.','confirmation is distinguished from warn acknowledgement');
select lives_ok($$select pg_temp.accept('{"start_time":"12:00","end_time":"14:00"}',pg_temp.assignment())$$,'moving to available hours needs no decision');
select is((select count(*) from public.schedule_availability_overrides where workspace_id=(select w from wp_fixture) and revoked_at is null),0::bigint,'moving away revokes prior acceptance');
select throws_ok($$select pg_temp.accept('{}',pg_temp.assignment('{"start_time":"12:00","end_time":"14:00"}'))$$,'PT409',null,'moving back cannot revive revoked acceptance');
select throws_ok($$select pg_temp.accept('{"time_basis":"unresolved","start_time":null,"end_time":null}')$$,'PT409',null,'unresolved hours require the current confirmation');
insert into public.schedule_time_off_requests(id,workspace_id,employee_id,location_id,status,created_by)
 select 'ad421000-0000-4000-8000-000000000010',w,emp,loc,'approved',actor from wp_fixture;
insert into public.schedule_time_off_segments(workspace_id,request_id,segment_date,start_time,end_time,status)
 select w,'ad421000-0000-4000-8000-000000000010','2035-01-15','18:00','19:00','approved' from wp_fixture;
select throws_ok($$select pg_temp.accept(jsonb_build_object('availability_assessment_fingerprint',pg_temp.preview()->>'fingerprint'))$$,'23514',null,'approved leave is not overrideable');
select ok(not has_function_privilege('authenticated','public.prepare_weekly_schedule_assignment(uuid,uuid,jsonb,jsonb)','execute'),'clients cannot write acceptance evidence');
select ok(not has_function_privilege('service_role','public.prepare_weekly_schedule_assignment(uuid,uuid,jsonb,jsonb)','execute'),'raw preparer is internal, not an impersonation RPC');
select ok(not has_function_privilege('authenticated','public.assess_weekly_schedule_assignment_service(uuid,uuid,jsonb,uuid,uuid)','execute'),'employee has no raw assessment RPC');
-- Publication reads use the same staged assessment and retained acceptance.
update public.schedule_time_off_requests set status='pending' where workspace_id=(select w from wp_fixture);
insert into public.schedule_drafts(id,workspace_id,week_start,name,created_by,updated_by)
 select 'ad421000-0000-4000-8000-000000000013',w,'2035-01-15','Weekly preflight',manager,manager from wp_fixture;
insert into public.schedule_draft_shifts(id,workspace_id,draft_id,location_id,employee_id,job_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
 select shift_id,w,'ad421000-0000-4000-8000-000000000013',loc,emp,'ad421000-0000-4000-8000-000000000011','2035-01-15','18:00','20:00','explicit','America/Los_Angeles' from wp_fixture;
create function pg_temp.publication(changes jsonb default '{}',departments uuid[] default null,include_no_department boolean default true) returns jsonb language sql stable as $$
 select public.weekly_schedule_publication_preflight(jsonb_build_object('status','publish_ready','workspace_id',w,'draft_id','ad421000-0000-4000-8000-000000000013',
  'findings','[]'::jsonb,'locations',jsonb_build_array(jsonb_build_object('location_id',loc)))||changes,manager,departments,include_no_department) from wp_fixture;
$$;
select is(pg_temp.publication()->'findings'->0->>'availability_state','new','preflight identifies a new conflict');
select is(pg_temp.publication()->'findings'->0->>'tier','risk','new confirm conflict is a risk, not a hard blocker');
select is(pg_temp.publication()->'findings'->0->>'employee_name','Weekly Tester','preflight identifies the employee');
select is(pg_temp.publication()->>'status','override_required','new confirm conflicts need a bulk decision');
select is(jsonb_array_length(pg_temp.publication('{}','{}',false)->'findings'),0,'preflight respects department scope');
select lives_ok($$select pg_temp.accept(jsonb_build_object('availability_assessment_fingerprint',pg_temp.preview()->>'fingerprint'),pg_temp.assignment())$$,'acceptance can be recorded for the unchanged draft');
select is(pg_temp.publication()->'findings'->0->>'availability_state','accepted','preflight keeps previously accepted conflicts in their own group');
select is(pg_temp.publication()->>'status','publish_ready','previously accepted conflict needs no new decision');
update public.workspace_scheduling_settings set availability_warning_policy='warn' where workspace_id=(select w from wp_fixture);
select is(pg_temp.publication()->'findings'->0->>'availability_state','new','changed warning policy invalidates the prior context');
select is(pg_temp.publication()->>'status','publish_ready','warn mode has no additional confirmation gate');
select is(pg_temp.publication()->'findings'->0->>'tier','note','warn-only conflict is informational');
select is(jsonb_array_length(pg_temp.publication('{"findings":[{"code":"availability_review_pending"},{"code":"availability_unknown"}]}')->'findings'),1,'obsolete review and unknown-baseline findings are replaced');
create temp table preflight_fingerprint as select pg_temp.publication()->>'fingerprint' fp;
update public.employee_weekly_preferences set preference=jsonb_set(preference,'{days,1,range}','{"start":"18:00","end":"20:00"}') where workspace_id=(select w from wp_fixture);
select isnt(pg_temp.publication()->>'fingerprint',(select fp from preflight_fingerprint),'physical conflict changes invalidate publication preview');
update public.schedule_time_off_requests set status='approved' where workspace_id=(select w from wp_fixture);
select is(pg_temp.publication()->'findings'->0->>'conflict_severity','block','approved leave takes priority over the preference conflict');
select is(pg_temp.publication()->>'status','hard_blocked','approved leave still blocks publication');
select ok(pg_temp.publication()->'findings'->0->>'availability_state' is null,'real blocker cannot masquerade as an accepted weekly warning');

insert into public.manager_weekly_reminders(workspace_id,employee_id,preference,revision,updated_by)
 select w,emp,public.empty_weekly_preference('time_range'),1,manager from wp_fixture;
create temp table visibility_snapshot as select jsonb_build_object('captured_at',clock_timestamp(),'assessment',jsonb_build_object(
 'has_availability_conflict',true,'employee_intervals','[]'::jsonb,'manager_intervals',jsonb_build_array(jsonb_build_object('start_at','2035-01-16T02:00:00Z','end_at','2035-01-16T03:00:00Z')))) s;
select ok((select public.weekly_published_availability_visible(w,emp,s) from wp_fixture cross join visibility_snapshot),'enabled reminder can show its original publication warning');
update public.manager_weekly_reminders set enabled=false where workspace_id=(select w from wp_fixture);
select ok(not (select public.weekly_published_availability_visible(w,emp,s) from wp_fixture cross join visibility_snapshot),'off hides the original manager warning');
create temp table disabled_stamp as select last_disabled_at stamp from public.manager_weekly_reminders where workspace_id=(select w from wp_fixture);
update public.manager_weekly_reminders set enabled=true,last_disabled_at=null where workspace_id=(select w from wp_fixture);
select is((select last_disabled_at from public.manager_weekly_reminders where workspace_id=(select w from wp_fixture)),(select stamp from disabled_stamp),'enable cannot clear the suppression timestamp');
select ok(not (select public.weekly_published_availability_visible(w,emp,s) from wp_fixture cross join visibility_snapshot),'re-enabling does not backfill an old publication warning');
select ok((select public.weekly_published_availability_visible(w,emp,jsonb_set(s,'{captured_at}',to_jsonb(clock_timestamp()))) from wp_fixture cross join visibility_snapshot),'a later publication may capture the enabled reminder');
select ok((select public.weekly_published_availability_visible(w,emp,jsonb_set(s,'{assessment,employee_intervals}',s->'assessment'->'manager_intervals')) from wp_fixture cross join visibility_snapshot),'manager suppression never hides the original employee warning');
select ok(not has_function_privilege('authenticated','public.weekly_schedule_publication_preflight(jsonb,uuid,uuid[],boolean)','execute'),'raw publication reader is not exposed to employees');
select * from finish();
rollback;

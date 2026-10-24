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
insert into public.workspace_memberships (workspace_id, user_id, role_id, employee_role_id)
select legacy.workspace_id::uuid, legacy.user_id::uuid, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (select w,owner_id,'owner'::public.workspace_role,true from wp_fixture
 union all select w,actor,'employee'::public.workspace_role,false from wp_fixture
 union all select w,manager,'manager'::public.workspace_role,false from wp_fixture) as legacy(workspace_id, user_id, role, all_locations);
insert into public.workspace_scheduling_settings(workspace_id) select w from wp_fixture on conflict do nothing;
insert into public.locations(short_name, id,workspace_id,name,street_address,city,region,postal_code,timezone)
 select 'T00068', loc,w,'West','1 Test Street','Test City','CA','90001','America/Los_Angeles' from wp_fixture
 union all select 'T00069', other_loc,w,'East','2 Test Street','Test City','NY','10001','America/New_York' from wp_fixture;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
 select emp,w,actor,'E-993421','Weekly','Tester',owner_id from wp_fixture;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
 select w,emp,loc,owner_id from wp_fixture union all select w,emp,other_loc,owner_id from wp_fixture;
select tests.works_at(m.id, f.loc) from wp_fixture f join public.workspace_memberships m on m.workspace_id=f.w and m.user_id in(f.actor,f.manager);
insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by)
 select w,emp,jsonb_set(public.empty_weekly_preference(),'{days,1,ranges}','[{"start":"18:00","end":"20:00"}]'),1,actor from wp_fixture;
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
-- BL-186: a mark is a preference; writing into it is allowed and asks nothing.
select is(pg_temp.preview()->>'operation','allowed','a marked evening is allowed');
select is(pg_temp.preview()->>'has_availability_conflict','true','and carries the warning');
select is(pg_temp.preview()->>'can_override','true','a scheduling manager can place anyway');
select throws_ok($$select public.assess_weekly_schedule_assignment_service(actor,w,pg_temp.assignment()) from wp_fixture$$,'42501',null,'employee cannot inspect manager assessment');
select throws_ok($$select pg_temp.preview(jsonb_build_object('location_id',other_loc)) from wp_fixture$$,'42501',null,'manager assessment enforces target location scope');
select throws_ok($$select public.assess_weekly_schedule_assignment_service(manager,w,pg_temp.assignment(),shift_id,gen_random_uuid()) from wp_fixture$$,'42501',null,'expired or foreign edit session is rejected');
select lives_ok($$select pg_temp.accept()$$,'writing it needs no checked fingerprint');
select is((select count(*) from public.schedule_availability_overrides where workspace_id=(select w from wp_fixture)),0::bigint,'and records no acceptance');
insert into public.jobs(id,workspace_id,name) select 'ad421000-0000-4000-8000-000000000011',w,'Server' from wp_fixture;
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,is_primary,created_by)
 select w,emp,'ad421000-0000-4000-8000-000000000011',true,owner_id from wp_fixture;
create temp table editor_session as select (public.acquire_schedule_edit_session_service(manager,w,'2035-01-15','blank',null)->'session'->>'id')::uuid id from wp_fixture;
insert into public.schedule_edit_session_shifts(id,workspace_id,session_id,location_id,employee_id,job_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
 select shift_id,w,(select id from editor_session),loc,emp,'ad421000-0000-4000-8000-000000000011','2035-01-15','18:00','20:00','explicit','America/Los_Angeles' from wp_fixture;
create function pg_temp.editor_assess(changes jsonb default '{}') returns jsonb language sql stable as $$
 select public.assess_weekly_schedule_assignment_service(manager,w,pg_temp.assignment(changes),shift_id,(select id from editor_session)) from wp_fixture;
$$;
select is(pg_temp.editor_assess()->>'has_availability_conflict','true','the editor shows the warning on the same assignment');
select is(pg_temp.editor_assess('{"start_time":"12:00","end_time":"14:00"}')->>'has_availability_conflict','false','moving it to free hours clears the warning');
select throws_ok($$select public.assess_weekly_schedule_assignment_service(manager,w,pg_temp.assignment(),gen_random_uuid(),(select id from editor_session)) from wp_fixture$$,'P0002',null,'deleted edit-session target cannot silently become a new assignment');
select throws_ok($$select public.prepare_weekly_schedule_assignment(actor,w,pg_temp.assignment(),pg_temp.assignment()) from wp_fixture$$,'42501',null,'employee cannot reuse a manager acceptance');
select tests.approved_leave(w,emp,actor,loc,'2035-01-15','18:00','19:00','ad421000-0000-4000-8000-000000000010') from wp_fixture;
select throws_ok($$select pg_temp.accept(jsonb_build_object('availability_assessment_fingerprint',pg_temp.preview()->>'fingerprint'))$$,'23514',null,'approved leave is not overrideable');
select ok(not has_function_privilege('authenticated','public.prepare_weekly_schedule_assignment(uuid,uuid,jsonb,jsonb)','execute'),'clients cannot write acceptance evidence');
select ok(not has_function_privilege('service_role','public.prepare_weekly_schedule_assignment(uuid,uuid,jsonb,jsonb)','execute'),'raw preparer is internal, not an impersonation RPC');
select ok(not has_function_privilege('authenticated','public.assess_weekly_schedule_assignment_service(uuid,uuid,jsonb,uuid,uuid)','execute'),'employee has no raw assessment RPC');
-- Publication reads use the same staged assessment and retained acceptance.
-- The leave is out of the way while they do: declined (a pending one is a note, FB-6.3).
update public.time_off_requests set status='declined',effective='{}' where workspace_id=(select w from wp_fixture);
insert into public.schedule_drafts(id,workspace_id,week_start,name,created_by,updated_by)
 select 'ad421000-0000-4000-8000-000000000013',w,'2035-01-15','Weekly preflight',manager,manager from wp_fixture;
insert into public.schedule_draft_shifts(id,workspace_id,draft_id,location_id,employee_id,job_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
 select shift_id,w,'ad421000-0000-4000-8000-000000000013',loc,emp,'ad421000-0000-4000-8000-000000000011','2035-01-15','18:00','20:00','explicit','America/Los_Angeles' from wp_fixture;
create function pg_temp.publication(changes jsonb default '{}',departments uuid[] default null,include_no_department boolean default true) returns jsonb language sql stable as $$
 select public.weekly_schedule_publication_preflight(jsonb_build_object('status','publish_ready','workspace_id',w,'draft_id','ad421000-0000-4000-8000-000000000013',
  'findings','[]'::jsonb,'locations',jsonb_build_array(jsonb_build_object('location_id',loc)))||changes,manager,departments,include_no_department) from wp_fixture;
$$;
select is(pg_temp.publication()->'findings'->0->>'code','availability','Publish lists the mark as an availability warning');
select is(pg_temp.publication()->'findings'->0->>'tier','note','the mark is listed for a last look and asks nothing (M9)');
select is(pg_temp.publication()->'findings'->0->>'employee_name','Weekly Tester','preflight identifies the employee');
select is(pg_temp.publication()->>'status','publish_ready','so the week is ready to publish');
select is(jsonb_array_length(pg_temp.publication('{}','{}',false)->'findings'),0,'preflight respects department scope');
select is(pg_temp.publication()->'findings'->0->>'message','Weekly Tester shows as unavailable for this shift.','the warning says where the person stands');
select is(jsonb_array_length(pg_temp.publication('{"findings":[{"code":"availability_review_pending"},{"code":"availability_unknown"}]}')->'findings'),1,'obsolete review and unknown-baseline findings are replaced');
create temp table preflight_fingerprint as select pg_temp.publication()->>'fingerprint' fp;
update public.employee_weekly_preferences set preference=jsonb_set(preference,'{days,1,ranges}','[{"start":"19:00","end":"20:00"}]') where workspace_id=(select w from wp_fixture);
select isnt(pg_temp.publication()->>'fingerprint',(select fp from preflight_fingerprint),'physical conflict changes invalidate publication preview');
update public.time_off_requests set status='approved',effective=tstzmultirange(tstzrange(starts_at,ends_at,'[)'))
 where workspace_id=(select w from wp_fixture);
select is(pg_temp.publication()->'findings'->0->>'conflict_severity','block','approved leave takes priority over the preference conflict');
select is(pg_temp.publication()->>'status','hard_blocked','approved leave still blocks publication');
select ok(pg_temp.publication()->'findings'->0->>'availability_state' is null,'real blocker cannot masquerade as an accepted weekly warning');

-- Require confirmation still guards the other rules (BL-186 keeps the
-- acceptance for them): a closed day, closed_location = confirm.
select tests.closed_day(w, array[loc]::uuid[], ('2035-01-17')::date, ('2035-01-17')::date, owner_id, 'ad421000-0000-4000-8000-000000000021'::uuid) from wp_fixture;
create function pg_temp.closed(changes jsonb default '{}') returns jsonb language sql stable as $$
 select jsonb_build_object('id','ad421000-0000-4000-8000-000000000020','scheduled_date','2035-01-17','job_id','ad421000-0000-4000-8000-000000000011')||changes
$$;
create function pg_temp.checked(changes jsonb) returns jsonb language sql stable as $$
 select changes||jsonb_build_object('availability_assessment_fingerprint',pg_temp.preview(changes)->>'fingerprint')
$$;
create function pg_temp.accepted_now() returns bigint language sql stable as $$
 select count(*) from public.schedule_availability_overrides where workspace_id=(select w from wp_fixture) and revoked_at is null
$$;
select is(pg_temp.preview(pg_temp.closed())->>'operation','warning_requires_override','a closed day asks for confirmation');
select throws_ok($$select pg_temp.accept(pg_temp.closed())$$,'PT409',null,'a closed-day assignment requires a fresh checked fingerprint');
select lives_ok($$select pg_temp.accept(pg_temp.checked(pg_temp.closed()))$$,'confirming it needs no written reason');
select is(pg_temp.accepted_now(),1::bigint,'one current acceptance is stored');
select is((select actor_user_id from public.schedule_availability_overrides where workspace_id=(select w from wp_fixture) and revoked_at is null),(select manager from wp_fixture),'acceptance records the actual manager');
select throws_ok($$select pg_temp.accept(pg_temp.closed('{"id":"ad421000-0000-4000-8000-000000000009"}'),pg_temp.assignment(pg_temp.closed()))$$,'PT409',null,'acceptance cannot transfer to another shift');
select throws_ok($$select pg_temp.accept(pg_temp.checked(pg_temp.closed())||'{"start_time":"19:00"}',pg_temp.assignment(pg_temp.closed()))$$,'PT409',null,'changed physical conflict requires a fresh decision');
select is(pg_temp.accepted_now(),1::bigint,'failed decision does not revoke prior history');
select lives_ok($$select pg_temp.accept(pg_temp.closed('{"scheduled_date":"2035-01-18"}'),pg_temp.assignment(pg_temp.closed()))$$,'moving to an open day needs no decision');
select is(pg_temp.accepted_now(),0::bigint,'moving away revokes prior acceptance');
select throws_ok($$select pg_temp.accept(pg_temp.closed(),pg_temp.assignment(pg_temp.closed('{"scheduled_date":"2035-01-18"}')))$$,'PT409',null,'moving back cannot revive revoked acceptance');
-- Accepted again, the assigned shift goes into the draft; Publish keeps the acceptance.
select lives_ok($$select pg_temp.accept(pg_temp.checked(pg_temp.closed()))$$,'a fresh confirmation is accepted');
insert into public.schedule_draft_shifts(id,workspace_id,draft_id,location_id,employee_id,job_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
 select 'ad421000-0000-4000-8000-000000000020',w,'ad421000-0000-4000-8000-000000000013',loc,emp,'ad421000-0000-4000-8000-000000000011','2035-01-17','18:00','20:00','explicit','America/Los_Angeles' from wp_fixture;
select is((select f->>'availability_state' from jsonb_array_elements(pg_temp.publication()->'findings') f
 where f->'shift_ids'->>0='ad421000-0000-4000-8000-000000000020' and f->>'code'='schedule_conflict'),'accepted','preflight keeps the previously accepted conflict of an assigned shift');
select ok(not has_function_privilege('authenticated','public.weekly_schedule_publication_preflight(jsonb,uuid,uuid[],boolean)','execute'),'raw publication reader is not exposed to employees');
select * from finish();
rollback;

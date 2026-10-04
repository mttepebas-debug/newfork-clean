begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table ws as select
 'ad426000-0000-4000-8000-000000000001'::uuid w,
 'ad426000-0000-4000-8000-000000000002'::uuid owner_id,
 'ad426000-0000-4000-8000-000000000003'::uuid employee_user,
 'ad426000-0000-4000-8000-000000000004'::uuid emp,
 'ad426000-0000-4000-8000-000000000006'::uuid loc,
 'ad426000-0000-4000-8000-000000000007'::uuid other_loc,
 'ad426000-0000-4000-8000-000000000008'::uuid shift_type,
 'ad426000-0000-4000-8000-000000000009'::uuid job;
insert into auth.users(id,email) select owner_id,'weekly-candidate-owner@example.test' from ws
 union all select employee_user,'weekly-candidate-employee@example.test' from ws;
insert into public.workspaces(id,name,created_by) select w,'Weekly candidates',owner_id from ws;
insert into public.workspace_memberships(workspace_id,user_id,role,all_locations)
 select w,owner_id,'owner'::public.workspace_role,true from ws
 union all select w,employee_user,'employee'::public.workspace_role,false from ws;
insert into public.workspace_scheduling_settings(workspace_id) select w from ws on conflict do nothing;
insert into public.locations(short_name, id,workspace_id,name,street_address,city,region,postal_code,timezone)
 select 'T00048', loc,w,'West','1 Test Street','Test City','CA','90001','America/Los_Angeles' from ws
 union all select 'T00049', other_loc,w,'East','2 Test Street','Test City','NY','10001','America/New_York' from ws;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
 select emp,w,employee_user,'E-993426','Weekly','Candidate',owner_id from ws;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,assigned_at,created_by)
 select w,emp,loc,'2020-01-01'::timestamptz,owner_id from ws union all select w,emp,other_loc,'2020-01-01'::timestamptz,owner_id from ws;
insert into public.jobs(id,workspace_id,name) select job,w,'Server' from ws;
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,assigned_at,is_primary,created_by)
 select w,emp,job,'2020-01-01',true,owner_id from ws;
insert into public.shift_types(id,workspace_id,name,default_start_time,default_end_time)
 select shift_type,w,'Dinner','18:00','20:00' from ws;
create function pg_temp.target(changes jsonb default '{}') returns jsonb language sql stable as $$
 select jsonb_build_object('location_id',loc,'job_id',job,'shift_type_id',shift_type,'date','2035-01-15',
  'start_time','18:00','end_time','22:00','time_basis','explicit')||changes from ws;
$$;
create function pg_temp.candidate(changes jsonb default '{}',excluded uuid[] default '{}',travel integer default 0) returns jsonb language sql stable as $$
 select public.weekly_assignment_candidate_check(w,emp,pg_temp.target(changes),excluded,travel) from ws;
$$;
select is(pg_temp.candidate()->>'status','eligible','no declared preference is eligible');
select is(pg_temp.candidate()->'availability'->>'operation','allowed','empty week is verified, not unknown');
select is(pg_temp.candidate('{"start_time":null}')->>'status','verification_required','missing start requires verification');
select is(pg_temp.candidate('{"end_time":"18:00"}')->>'status','ineligible','equal endpoints are refused');

-- Insert actual work while preferences are empty; later preferences never remove it.
insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
 select 'ad426000-0000-4000-8000-000000000010',w,loc,'2035-01-15',1,owner_id from ws;
insert into public.schedule_published_shifts(id,source_shift_id,workspace_id,location_id,publication_id,employee_id,job_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
 select 'ad426000-0000-4000-8000-000000000011','ad426000-0000-4000-8000-000000000012',w,loc,
  'ad426000-0000-4000-8000-000000000010',emp,job,'2035-01-15','09:00','12:00','explicit','America/Los_Angeles' from ws;
insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by)
 select w,emp,jsonb_set(public.empty_weekly_preference('time_range'),'{days,1,ranges}','[{"start":"18:00","end":"20:00"}]'),1,employee_user from ws;
select is(pg_temp.candidate()->>'status','eligible','partial preference conflict does not make a candidate ineligible');
select is(pg_temp.candidate()->'availability'->>'coverage','partial','partial warning remains separate');
select is((pg_temp.candidate()->>'available_start')::timestamptz,'2035-01-16 02:00Z'::timestamptz,'partial conflict keeps original start');
select is((pg_temp.candidate()->>'available_end')::timestamptz,'2035-01-16 06:00Z'::timestamptz,'partial conflict keeps original end');
select ok(not (pg_temp.candidate()->'reasons' ? 'Available for the full interval'),'a warning does not falsely claim full availability');
select is(pg_temp.candidate('{"scheduled_date":"2035-01-16"}')->'availability'->>'coverage','partial','the candidate date wins over a copied scheduled_date');
select is(pg_temp.candidate('{"start_time":"20:00"}')->'availability'->>'has_availability_conflict','false','touching endpoints have no conflict');
select is(pg_temp.candidate('{"time_timezone":"America/New_York"}')->'availability'->>'coverage','partial','actual saved timezone is compared with current target location rules');
update public.employee_weekly_preferences set preference=jsonb_set(public.empty_weekly_preference('time_range'),'{days,1,all_day}','true') where workspace_id=(select w from ws);
select is(pg_temp.candidate()->>'status','eligible','an all-day mark keeps the person selectable');
select is(pg_temp.candidate()->'availability'->>'coverage','none','full preference conflict is retained as warning evidence');
select ok((pg_temp.candidate()->'availability'->>'has_availability_conflict')::boolean and pg_temp.candidate()->'availability'->>'operation'='allowed','the mark is a warning on an allowed assignment (BL-186)');
select is((pg_temp.candidate()->>'available_end')::timestamptz,'2035-01-16 06:00Z'::timestamptz,'all-day conflict never shortens responsibility');

-- Real blockers and full-span employment checks are still authoritative.
select is(pg_temp.candidate('{"start_time":"10:00","end_time":"11:00"}')->>'status','ineligible','published shift overlap remains blocking');
select is(pg_temp.candidate('{"start_time":"10:00","end_time":"11:00"}',array['ad426000-0000-4000-8000-000000000011'::uuid])->>'status','eligible','explicitly excluded source is not counted twice');
update public.workspace_scheduling_settings set minimum_travel_minutes=30 where workspace_id=(select w from ws);
select is(pg_temp.candidate(jsonb_build_object('location_id',other_loc,'start_time','15:15','end_time','16:00'))->>'status','ineligible','travel gap uses physical instants across timezones') from ws;
select is(pg_temp.candidate(jsonb_build_object('location_id',other_loc,'start_time','15:30','end_time','16:00'))->>'status','eligible','exact travel boundary remains eligible') from ws;
select is(pg_temp.candidate('{"start_time":"12:00","end_time":"13:00"}')->>'status','eligible','same-location adjacent work needs no travel');
select is(pg_temp.candidate(jsonb_build_object('location_id',other_loc,'start_time','15:30','end_time','16:00'),'{}',60)->>'status','ineligible','a larger operation travel minimum is preserved') from ws;
select is(pg_temp.candidate('{"start_time":"13:00","end_time":"14:00","time_snapshot":{"timezone":"America/New_York"}}')->>'status','ineligible','snapshot timezone fallback is used by overlap checks too');

update public.employee_location_assignments set ended_at='2035-01-16 03:00Z' where workspace_id=(select w from ws) and location_id=(select loc from ws);
select is(pg_temp.candidate()->>'status','ineligible','location employment must cover the full requested duration');
update public.employee_location_assignments set ended_at=null where workspace_id=(select w from ws);
update public.employee_job_assignments set ended_at='2035-01-16 03:00Z' where workspace_id=(select w from ws);
select is(pg_temp.candidate()->>'status','ineligible','job employment must cover the full requested duration');
update public.employee_job_assignments set ended_at=null where workspace_id=(select w from ws);
update public.workspace_memberships set status='suspended' where workspace_id=(select w from ws) and user_id=(select employee_user from ws);
select is(pg_temp.candidate('{"requires_employee_access":true}')->>'status','ineligible','employee offers still require active workspace access');
update public.workspace_memberships set status='active' where workspace_id=(select w from ws);
update public.employee_profiles set is_excluded_from_schedule=true where workspace_id=(select w from ws);
select is(pg_temp.candidate()->>'status','ineligible','excluded employee remains ineligible');
update public.employee_profiles set is_excluded_from_schedule=false where workspace_id=(select w from ws);
insert into public.important_dates (id, workspace_id, location_id, location_ids, starts_on, ends_on, title, type, created_by)
 select 'ad426000-0000-4000-8000-000000000015', w, loc, array[loc]::uuid[], ('2035-01-15')::date, ('2035-01-15')::date, 'Closed', 'closed_day', owner_id from ws;
select is(pg_temp.candidate()->>'status','ineligible','location closure is not an availability override');
delete from public.important_dates where id='ad426000-0000-4000-8000-000000000015';
select tests.approved_leave(w,emp,employee_user,other_loc,'2035-01-15','21:00','22:00','ad426000-0000-4000-8000-000000000016') from ws;
select is(pg_temp.candidate()->>'status','ineligible','approved leave remains a blocker even with preferences');
select ok((pg_temp.candidate()->'reasons'->>0) like 'Approved time off%','leave blocker is explained separately');
select is(pg_temp.candidate()->>'available_start',null::text,'blocked leave is not presented as shortened assignable hours');
update public.schedule_time_off_requests set status='pending' where id='ad426000-0000-4000-8000-000000000016';
select is(pg_temp.candidate()->>'status','eligible','pending leave does not become approved leave');

update public.employee_weekly_preferences set preference=public.empty_weekly_preference('time_range') where workspace_id=(select w from ws);
insert into public.manager_weekly_reminders(workspace_id,employee_id,preference,enabled,notes,revision,updated_by)
 select w,emp,jsonb_set(public.empty_weekly_preference('time_range'),'{days,1,all_day}','true'),true,
  array['','Private manager note','','','','',''],1,owner_id from ws;
select is(pg_temp.candidate()->>'status','eligible','manager-only reminder never becomes an assignment blocker');
select is(pg_temp.candidate()->'availability'->'employee_intervals','[]'::jsonb,'manager conflict does not become an employee preference');
select ok(jsonb_array_length(pg_temp.candidate()->'availability'->'manager_intervals')>0,'private adapter preserves sources for actor-specific projection');
select ok(pg_temp.candidate()::text not like '%Private manager note%','even the private assessment omits manager notes');
update public.manager_weekly_reminders set enabled=false where workspace_id=(select w from ws);
select is(pg_temp.candidate()->'availability'->>'has_availability_conflict','false','disabled reminders no longer warn');
update public.employee_weekly_preferences set preference=jsonb_set(public.empty_weekly_preference('shift_type'),'{days,1,shift_type_ids}',jsonb_build_array((select shift_type from ws))) where workspace_id=(select w from ws);
select is(pg_temp.candidate('{"shift_type_id":null}')->'availability'->>'has_availability_conflict','true','actual hours overlap a preference regardless of assignment type identity');
update public.shift_types set default_start_time='22:00',default_end_time='02:00' where id=(select shift_type from ws);
select is(pg_temp.candidate()->'availability'->>'has_availability_conflict','false','current type defaults take effect immediately');
select is(pg_temp.candidate('{"date":"2035-01-16","start_time":"01:00","end_time":"03:00"}')->>'status','eligible','overnight type remains a soft conflict the next day');
select is(pg_temp.candidate('{"date":"2035-01-16","start_time":"01:00","end_time":"03:00"}')->'availability'->>'coverage','partial','overnight next-day warning is not lost');
update public.shift_types set archived_at=now() where id=(select shift_type from ws);
select is(pg_temp.candidate('{"date":"2035-01-16","start_time":"01:00","end_time":"03:00"}')->'availability'->>'coverage','partial','archived type keeps last valid default');
select throws_ok($$select pg_temp.candidate('{"time_basis":"type_default","time_snapshot":{"start_time":"17:00","end_time":"22:00"}}')$$,'22023',null,'inconsistent time snapshot is a technical error');
select is(pg_temp.candidate('{"date":"2035-03-11","start_time":"02:30","end_time":"04:00"}')->>'status','ineligible','nonexistent DST clock time remains blocked');
select is((pg_temp.candidate('{"date":"2035-11-04","start_time":"00:30","end_time":"02:30"}')->'availability'->>'assessment_minutes')::numeric,180::numeric,'fall-back interval keeps its real elapsed duration');
select throws_ok($$select pg_temp.candidate('{"location_id":"ad426000-0000-4000-8000-000000000099"}')$$,'P0001',null,'unknown location fails instead of becoming available');
select ok(not has_function_privilege('anon','public.weekly_assignment_candidate_check(uuid,uuid,jsonb,uuid[],integer)','EXECUTE'),'anonymous cannot inspect private candidates');
select ok(not has_function_privilege('authenticated','public.weekly_assignment_candidate_check(uuid,uuid,jsonb,uuid[],integer)','EXECUTE'),'employee cannot inspect manager rules through candidate helper');
select ok(not has_function_privilege('service_role','public.weekly_assignment_candidate_check(uuid,uuid,jsonb,uuid[],integer)','EXECUTE'),'no public RPC exposes the unprojected assessment');
select ok(not has_function_privilege('authenticated','public.weekly_assignment_candidate_base(uuid,uuid,jsonb,uuid[],integer)','EXECUTE'),'inner helper is private too');
select * from finish();
rollback;

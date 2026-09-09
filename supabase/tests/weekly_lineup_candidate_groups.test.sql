begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table ws as select
 'ad432000-0000-4000-8000-000000000001'::uuid w,
 'ad432000-0000-4000-8000-000000000002'::uuid manager,
 'ad432000-0000-4000-8000-000000000003'::uuid limited_manager,
 'ad432000-0000-4000-8000-000000000004'::uuid emp,
 'ad432000-0000-4000-8000-000000000005'::uuid other_emp,
 'ad432000-0000-4000-8000-000000000006'::uuid loc,
 'ad432000-0000-4000-8000-000000000007'::uuid other_loc,
 'ad432000-0000-4000-8000-000000000008'::uuid job,
 'ad432000-0000-4000-8000-000000000009'::uuid service;
insert into auth.users(id,email) select manager,'group-owner@example.test' from ws
 union all select limited_manager,'group-manager@example.test' from ws;
insert into public.workspaces(id,name,created_by) select w,'Weekly Line Up candidate groups',manager from ws;
insert into public.workspace_memberships(workspace_id,user_id,role,all_locations)
 select w,manager,'owner'::public.workspace_role,true from ws
 union all select w,limited_manager,'manager'::public.workspace_role,false from ws;
insert into public.workspace_scheduling_settings(workspace_id) select w from ws on conflict do nothing;
insert into public.locations(id,workspace_id,name,street_address,city,region,postal_code,timezone,lineup_operations_enabled)
 select loc,w,'West','1 Test Street','Test City','CA','90001','America/Los_Angeles',true from ws
 union all select other_loc,w,'Private East name','2 Test Street','Test City','NY','10001','America/New_York',true from ws;
insert into public.membership_location_scopes(membership_id,workspace_id,location_id)
 select m.id,w,loc from ws join public.workspace_memberships m on m.workspace_id=w and m.user_id=limited_manager;
insert into public.jobs(id,workspace_id,name) select job,w,'Server' from ws;
insert into public.shift_types(id,workspace_id,name,default_start_time,default_end_time)
 select service,w,'Dinner','18:00','22:00' from ws;
insert into public.employee_profiles(id,workspace_id,employee_code,first_name,last_name,created_by)
 select emp,w,'E-9934321','Group','Employee',manager from ws
 union all select other_emp,w,'E-9934322','Outside','Scope',manager from ws;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,assigned_at,created_by)
 select w,emp,loc,'2020-01-01'::timestamptz,manager from ws
 union all select w,emp,other_loc,'2020-01-01'::timestamptz,manager from ws
 union all select w,other_emp,other_loc,'2020-01-01'::timestamptz,manager from ws;
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,assigned_at,is_primary,created_by)
 select w,e.id,job,'2020-01-01',true,manager from ws cross join lateral unnest(array[emp,other_emp]) e(id);
insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
 select 'ad432000-0000-4000-8000-000000000010'::uuid,w,loc,'2035-01-15'::date,1,manager from ws
 union all select 'ad432000-0000-4000-8000-000000000011'::uuid,w,other_loc,'2035-01-15'::date,1,manager from ws;
insert into public.schedule_published_shifts(id,source_shift_id,workspace_id,location_id,publication_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
 select 'ad432000-0000-4000-8000-000000000020','ad432000-0000-4000-8000-000000000030',w,loc,
  'ad432000-0000-4000-8000-000000000010',emp,job,service,'2035-01-15','09:00','12:00','explicit','America/Los_Angeles' from ws;
create function pg_temp.target(changes jsonb default '{}') returns jsonb language sql stable as $$
 select jsonb_build_object('date','2035-01-15','location_id',loc,'job_id',job,'shift_type_id',service,
  'start_time','18:00','end_time','22:00','section_id',null,'station','')||changes from ws;
$$;
create function pg_temp.candidates(changes jsonb default '{}',limited boolean default false) returns jsonb language sql as $$
 select public.lineup_operations_service(case when limited then limited_manager else manager end,w,'candidates',
  jsonb_build_object('target',pg_temp.target(changes))) from ws;
$$;
create function pg_temp.candidate(changes jsonb default '{}',limited boolean default false) returns jsonb language sql as $$
 select c from jsonb_array_elements(pg_temp.candidates(changes,limited)) c,ws where c->>'employee_id'=emp::text;
$$;
select is(pg_temp.candidate()->>'display_group','eligible','published earlier work with no conflict is Eligible');
select is(pg_temp.candidate()->>'status','eligible','display grouping does not alter assignment eligibility');
select is(pg_temp.candidate('{"date":"2035-01-17"}')->>'display_group','day_off','no published work on target calendar day is Day off');
select is(pg_temp.candidate('{"start_time":"10:00","end_time":"11:00"}')->>'display_group','working_here','overlapping current work is Working here');
select is(pg_temp.candidate('{"start_time":"10:00","end_time":"11:00"}')->'context_labels','["Working here as Server"]'::jsonb,'working-here job label uses actual published position');
select is(pg_temp.candidate('{"start_time":"10:00","end_time":"11:00"}')->>'status','ineligible','published overlap still blocks selection');
select is(pg_temp.candidate('{"start_time":"12:00","end_time":"13:00"}')->>'display_group','eligible','touching half-open endpoints are not Working here');

-- The display includes an existing source, while eligibility may exclude it for editing.
select is(public.weekly_lineup_candidate_option(manager,w,emp,pg_temp.target('{"start_time":"09:00","end_time":"12:00"}'),
 array['ad432000-0000-4000-8000-000000000020'::uuid],null)->>'display_group','working_here','excluded editing source remains visible as published work') from ws;
insert into public.schedule_published_shifts(id,source_shift_id,workspace_id,location_id,publication_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
 select 'ad432000-0000-4000-8000-000000000021','ad432000-0000-4000-8000-000000000031',w,other_loc,
  'ad432000-0000-4000-8000-000000000011',emp,job,service,'2035-01-15','13:00','15:00','explicit','America/New_York' from ws;
select is(pg_temp.candidate('{"start_time":"10:00","end_time":"11:00"}')->>'display_group','working_elsewhere','physical overlap elsewhere wins over working here');
select is(pg_temp.candidate('{"start_time":"10:00","end_time":"11:00"}')->'context_labels','["Working here as Server"]'::jsonb,'simultaneous local responsibility remains an additional label');
select is(pg_temp.candidate('{"start_time":"10:00","end_time":"11:00"}')->>'status','ineligible','multiple simultaneous responsibilities remain a real conflict');
select is(jsonb_array_length(pg_temp.candidates('{"start_time":"10:00","end_time":"11:00"}',true)),1,'location-scoped search does not gain employees outside its scope');
select ok(pg_temp.candidate('{"start_time":"10:00","end_time":"11:00"}',true)::text not like '%Private East name%','foreign location name is not disclosed');
select is(pg_temp.candidate('{"start_time":"10:00","end_time":"11:00"}',true)->>'display_group','working_elsewhere','scoped manager still sees the generic busy classification');

update public.employee_job_assignments set ended_at='2035-01-15 18:30Z' where workspace_id=(select w from ws) and employee_id=(select emp from ws);
select is(pg_temp.candidate('{"start_time":"10:00","end_time":"11:00"}')->>'display_group','missing_job','job assignment must cover the entire interval and outranks working groups');
update public.employee_location_assignments set ended_at='2035-01-15 18:30Z' where workspace_id=(select w from ws) and employee_id=(select emp from ws) and location_id=(select loc from ws);
select is(pg_temp.candidate('{"start_time":"10:00","end_time":"11:00"}')->>'display_group','missing_location','missing location outranks missing job and both working groups');
select ok(pg_temp.candidate('{"start_time":"10:00","end_time":"11:00"}')->'context_labels' @> '["Not assigned to this job","Working somewhere else","Working here as Server"]'::jsonb,'other applicable states remain labels on one row');
select is((select count(*)::integer from jsonb_array_elements(pg_temp.candidates()) c,ws where c->>'employee_id'=emp::text),1,'a candidate occurs exactly once despite multiple states');
update public.employee_job_assignments set ended_at=null where workspace_id=(select w from ws);
update public.employee_location_assignments set ended_at=null where workspace_id=(select w from ws);

insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by)
 select w,emp,jsonb_build_object('input_mode','time_range','days',(select jsonb_agg(jsonb_build_object('day',n,'all_day',true,'range',null,'shift_type_ids','[]'::jsonb)) from generate_series(0,6) n)),1,manager from ws;
select is(pg_temp.candidate()->>'display_group','not_suitable','availability-only conflict on a working day is Not suitable');
select is(pg_temp.candidate()->>'status','eligible','availability-only conflict stays selectable');
select is(pg_temp.candidate()->>'has_availability_conflict','true','manager list has an explicit availability marker');
select is(pg_temp.candidate('{"date":"2035-01-17"}')->>'display_group','day_off','Day off outranks unavailable');
select is(pg_temp.candidate('{"date":"2035-01-17"}')->>'has_availability_conflict','true','Day off retains its availability badge');
select is(pg_temp.candidate('{"start_time":"10:00","end_time":"11:00"}')->>'has_availability_conflict','true','real overlap does not erase the additional preference badge');
select ok(not (pg_temp.candidate() ? 'availability'),'raw private assessment is never exposed');
update public.employee_weekly_preferences set preference=public.empty_weekly_preference('time_range') where workspace_id=(select w from ws);
insert into public.manager_weekly_reminders(workspace_id,employee_id,preference,enabled,notes,revision,updated_by)
 select w,emp,jsonb_set(public.empty_weekly_preference('time_range'),'{days,1,all_day}','true'),true,
  array['','Private reminder note','','','','',''],1,manager from ws;
select is(pg_temp.candidate()->>'display_group','not_suitable','enabled manager reminder participates in the display');
select ok(pg_temp.candidates()::text not like '%Private reminder note%','manager note is not added to candidate labels');
update public.manager_weekly_reminders set enabled=false where workspace_id=(select w from ws);
select is(pg_temp.candidate()->>'display_group','eligible','disabled manager reminders do not classify a candidate as unsuitable');

insert into public.schedule_time_off_requests(id,workspace_id,employee_id,location_id,status,created_by)
 select 'ad432000-0000-4000-8000-000000000040',w,emp,loc,'approved',manager from ws;
insert into public.schedule_time_off_segments(workspace_id,request_id,segment_date,start_time,end_time,status)
 select w,'ad432000-0000-4000-8000-000000000040','2035-01-17','18:00','22:00','approved' from ws;
select is(pg_temp.candidate('{"date":"2035-01-17"}')->>'display_group','day_off','display priority does not collapse approved leave into preferences');
select is(pg_temp.candidate('{"date":"2035-01-17"}')->>'status','ineligible','Day off with approved leave remains unselectable');
select is(pg_temp.candidate('{"date":"2035-01-17"}')->>'has_availability_conflict','false','approved leave alone is not an availability badge');
select is(pg_temp.candidate('{"start_time":"18:00","end_time":"18:00"}')->>'display_group','not_suitable','unresolved duration is not inferred as Day off');

insert into public.schedule_published_shifts(id,source_shift_id,workspace_id,location_id,publication_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
 select 'ad432000-0000-4000-8000-000000000022','ad432000-0000-4000-8000-000000000032',w,other_loc,
  'ad432000-0000-4000-8000-000000000011',emp,job,service,'2035-01-15','23:00','04:00','explicit','America/New_York' from ws;
select is(pg_temp.candidate('{"date":"2035-01-16","start_time":"00:00","end_time":"01:00"}')->>'display_group','working_elsewhere','overnight prior-date work is matched using physical instants');
select is(pg_temp.candidate('{"date":"2035-01-16","start_time":"02:00","end_time":"03:00"}')->>'display_group','eligible','overnight work intersects the target calendar day, so it is not Day off');
update public.locations set timezone='Pacific/Honolulu' where id=(select other_loc from ws);
select is(pg_temp.candidate('{"date":"2035-01-16","start_time":"00:00","end_time":"01:00"}')->>'display_group','working_elsewhere','published saved timezone wins over a changed location timezone');
update public.schedule_location_publications set status='superseded' where workspace_id=(select w from ws);
select is(pg_temp.candidate()->>'display_group','day_off','historical publications do not count as current work');

select throws_ok($$select public.lineup_operations_service(limited_manager,w,'candidates',jsonb_build_object('target',pg_temp.target(jsonb_build_object('location_id',other_loc)))) from ws$$,'P0001',null,'target location authorization is unchanged');
select ok(not has_function_privilege('anon','public.weekly_lineup_candidate_option(uuid,uuid,uuid,jsonb,uuid[],jsonb)','EXECUTE'),'anonymous cannot call the projection helper');
select ok(not has_function_privilege('authenticated','public.weekly_lineup_candidate_option(uuid,uuid,uuid,jsonb,uuid[],jsonb)','EXECUTE'),'authenticated clients cannot bypass the scoped search');
select ok(not has_function_privilege('service_role','public.weekly_lineup_candidate_option(uuid,uuid,uuid,jsonb,uuid[],jsonb)','EXECUTE'),'the helper is not a direct service RPC');
select * from finish();
rollback;

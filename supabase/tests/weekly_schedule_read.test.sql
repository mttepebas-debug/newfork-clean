begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table ws as select
 'ad425000-0000-4000-8000-000000000001'::uuid w,
 'ad425000-0000-4000-8000-000000000002'::uuid owner_id,
 'ad425000-0000-4000-8000-000000000003'::uuid employee_user,
 'ad425000-0000-4000-8000-000000000004'::uuid emp,
 'ad425000-0000-4000-8000-000000000005'::uuid manager,
 'ad425000-0000-4000-8000-000000000006'::uuid loc,
 'ad425000-0000-4000-8000-000000000007'::uuid other_loc,
 'ad425000-0000-4000-8000-000000000008'::uuid shift_type,
 'ad425000-0000-4000-8000-000000000009'::uuid job;
insert into auth.users(id,email) select owner_id,'weekly-read-owner@example.test' from ws
 union all select employee_user,'weekly-read-employee@example.test' from ws
 union all select manager,'weekly-read-manager@example.test' from ws;
insert into public.workspaces(id,name,created_by) select w,'Weekly read',owner_id from ws;
insert into public.workspace_memberships(workspace_id,user_id,role,all_locations)
 select w,owner_id,'owner'::public.workspace_role,true from ws
 union all select w,employee_user,'employee'::public.workspace_role,false from ws
 union all select w,manager,'manager'::public.workspace_role,false from ws;
insert into public.workspace_scheduling_settings(workspace_id) select w from ws on conflict do nothing;
insert into public.locations(short_name, id,workspace_id,name,street_address,city,region,postal_code,timezone)
 select 'T00074', loc,w,'West','1 Test Street','Test City','CA','90001','America/Los_Angeles' from ws
 union all select 'T00075', other_loc,w,'East','2 Test Street','Test City','NY','10001','America/New_York' from ws;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
 select emp,w,employee_user,'E-993425','Weekly','Read',owner_id from ws;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
 select w,emp,loc,owner_id from ws union all select w,emp,other_loc,owner_id from ws;
insert into public.membership_location_scopes(workspace_id,membership_id,location_id)
 select f.w,m.id,f.loc from ws f join public.workspace_memberships m on m.workspace_id=f.w and m.user_id in(f.employee_user,f.manager);
insert into public.jobs(id,workspace_id,name) select job,w,'Server' from ws;
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,is_primary,created_by)
 select w,emp,job,true,owner_id from ws;
create function pg_temp.read_model(actor uuid default null) returns jsonb language sql as $$
 select public.get_schedule_read_model_availability_v2_service(coalesce(actor,manager),w,'2035-01-15') from ws;
$$;
create function pg_temp.project(first_date date default '2035-01-15',location uuid default null) returns jsonb language sql as $$
 select public.weekly_schedule_location_projection(w,emp,coalesce(location,loc),first_date) from ws;
$$;
select is(pg_temp.project()->>'status','ready','no preference is a verified empty week');
select is(pg_temp.project()->'unavailable_intervals','[]'::jsonb,'unmarked hours are available');
select is(jsonb_array_length(pg_temp.project()->'days'),7,'projection summarizes exactly seven days');
select is((pg_temp.project()->'clock_segments'->0->>'offset_seconds')::integer,-28800,'clock offset comes from the database timezone');
select ok(not ((pg_temp.read_model()->'employees'->0) ? 'availability_versions'),'canonical read no longer returns dated preference versions');
select is(pg_temp.read_model()->'employees'->0->'availability','null'::jsonb,'old day field is not populated');
select is(jsonb_array_length(pg_temp.read_model()->'employees'->0->'weekly_availability'),1,'manager receives only their authorized location projection');
select throws_ok($$select pg_temp.read_model(employee_user) from ws$$,'42501',null,'employee cannot read shared manager preference projections');
select is(jsonb_array_length(pg_temp.read_model(owner_id)->'employees'->0->'weekly_availability'),2,'owner sees both authorized locations') from ws;
insert into public.manager_weekly_reminders(workspace_id,employee_id,enabled,preference,notes,revision,updated_by)
 select w,emp,true,jsonb_set(public.empty_weekly_preference('time_range'),'{days,1,range}','{"start":"18:00","end":"20:00"}'),
  array['private-note','','','','','',''],1,manager from ws;
select ok((pg_temp.project()->'days'->0->>'has_unavailable')::boolean,'enabled manager interval marks the matching day');
select ok(not (pg_temp.read_model()::text like '%private-note%'),'Schedule read does not expose manager notes');
select ok(not ((pg_temp.read_model()->'employees'->0->'weekly_availability'->0) ? 'manager_intervals'),'Schedule projection does not disclose source identity');
select is((pg_temp.project()->'unavailable_intervals'->0->>'start_at')::timestamptz,'2035-01-16 02:00Z'::timestamptz,'West rules use West timezone');
select is((pg_temp.project('2035-01-15',other_loc)->'unavailable_intervals'->0->>'start_at')::timestamptz,'2035-01-15 23:00Z'::timestamptz,'same recurring rule uses target East timezone') from ws;
update public.manager_weekly_reminders set enabled=false where workspace_id=(select w from ws);
select is(pg_temp.project()->'unavailable_intervals','[]'::jsonb,'disabled reminders disappear without deleting them');
insert into public.shift_types(id,workspace_id,name,default_start_time,default_end_time) select shift_type,w,'Night','22:00','02:00' from ws;
insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by)
 select w,emp,jsonb_set(public.empty_weekly_preference('shift_type'),'{days,1,shift_type_ids}',jsonb_build_array(shift_type)),1,employee_user from ws;
select ok((pg_temp.project()->'days'->0->>'has_unavailable')::boolean and (pg_temp.project()->'days'->1->>'has_unavailable')::boolean,'overnight default marks both affected dates');
update public.shift_types set default_start_time='19:00',default_end_time='21:00' where id=(select shift_type from ws);
select is((pg_temp.project()->'unavailable_intervals'->0->>'start_at')::timestamptz,'2035-01-16 03:00Z'::timestamptz,'current default changes the next read');
update public.shift_types set archived_at=now() where id=(select shift_type from ws);
select is((pg_temp.project()->'unavailable_intervals'->0->>'start_at')::timestamptz,'2035-01-16 03:00Z'::timestamptz,'archived type retains last valid default');
insert into public.schedule_time_off_requests(id,workspace_id,employee_id,location_id,status,created_by)
 select 'ad425000-0000-4000-8000-000000000010',w,emp,loc,'approved',employee_user from ws;
insert into public.schedule_time_off_segments(workspace_id,request_id,segment_date,start_time,end_time,status)
 select w,'ad425000-0000-4000-8000-000000000010','2035-01-15','12:00','14:00','approved' from ws;
select is(jsonb_array_length(pg_temp.project()->'leave_intervals'),1,'approved leave has separate blocking intervals');
select is(jsonb_array_length(pg_temp.project()->'unavailable_intervals'),2,'leave does not become a preference interval in the eight-day projection');
select is((select count(distinct x->>'offset_seconds') from jsonb_array_elements(pg_temp.project('2035-11-04')->'clock_segments') x),2::bigint,'fall-back week contains both clock offsets');
update public.employee_weekly_preferences set preference=public.empty_weekly_preference('time_range') where workspace_id=(select w from ws);
update public.manager_weekly_reminders set enabled=true,preference=jsonb_set(public.empty_weekly_preference('time_range'),'{days,1,all_day}','true') where workspace_id=(select w from ws);
select ok((pg_temp.project()->'days'->0->>'all_day')::boolean,'all-day projection is explicit');
delete from public.membership_location_scopes where workspace_id=(select w from ws) and membership_id=(select id from public.workspace_memberships where workspace_id=(select w from ws) and user_id=(select manager from ws));
select is(jsonb_array_length(coalesce(pg_temp.read_model()->'employees'->0->'weekly_availability','[]')),0,'revoked location scope removes preference projection');
select ok(not has_function_privilege('authenticated','public.weekly_schedule_location_projection(uuid,uuid,uuid,date)','EXECUTE'),'raw projection helper is private');
select * from finish();
rollback;

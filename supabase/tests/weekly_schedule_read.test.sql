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
select tests.works_at(m.id, f.loc) from ws f join public.workspace_memberships m on m.workspace_id=f.w and m.user_id in(f.employee_user,f.manager);
insert into public.jobs(id,workspace_id,name) select job,w,'Server' from ws;
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,is_primary,created_by)
 select w,emp,job,true,owner_id from ws;
create function pg_temp.read_model(actor uuid default null) returns jsonb language sql as $$
 select public.get_schedule_read_model_service(coalesce(actor,manager),w,'2035-01-15') from ws;
$$;
-- The employee under test, found by id: the manager works at West too, so they
-- are on the schedule as well.
create function pg_temp.the_employee(model jsonb) returns jsonb language sql as $$
 select e from jsonb_array_elements(model->'employees') e, ws where e->>'id'=ws.emp::text;
$$;
create function pg_temp.project(first_date date default '2035-01-15',location uuid default null) returns jsonb language sql as $$
 select s.projection from ws, app_private.schedule_week_availability(w,first_date,array[emp],array[coalesce(location,loc)]) s;
$$;
select is(pg_temp.project()->>'status','ready','no preference is a verified empty week');
select is(pg_temp.project()->'unavailable_intervals','[]'::jsonb,'unmarked hours are available');
select is(jsonb_array_length(pg_temp.project()->'days'),7,'projection summarizes exactly seven days');
select is((pg_temp.project()->'clock_segments'->0->>'offset_seconds')::integer,-28800,'clock offset comes from the database timezone');
select ok(not ((pg_temp.the_employee(pg_temp.read_model())) ? 'availability_versions'),'canonical read no longer returns dated preference versions');
select ok(not ((pg_temp.the_employee(pg_temp.read_model())) ? 'availability'),'the old day field is gone');
select is(jsonb_array_length(pg_temp.the_employee(pg_temp.read_model())->'weekly_availability'),1,'manager receives only their authorized location projection');
select throws_ok($$select pg_temp.read_model(employee_user) from ws$$,'42501',null,'employee cannot read shared manager preference projections');
select is(jsonb_array_length(pg_temp.the_employee(pg_temp.read_model(owner_id))->'weekly_availability'),2,'owner sees both authorized locations') from ws;
insert into public.manager_weekly_reminders(workspace_id,employee_id,enabled,preference,notes,revision,updated_by)
 select w,emp,true,jsonb_set(public.empty_weekly_preference('time_range'),'{days,1,range}','{"start":"18:00","end":"20:00"}'),
  array['private-note','','','','','',''],1,manager from ws;
select ok((pg_temp.project()->'days'->0->>'has_unavailable')::boolean,'enabled manager interval marks the matching day');
select ok(not (pg_temp.read_model()::text like '%private-note%'),'Schedule read does not expose manager notes');
select ok(not ((pg_temp.the_employee(pg_temp.read_model())->'weekly_availability'->0) ? 'manager_intervals'),'Schedule projection does not disclose source identity');
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
select tests.approved_leave(w,emp,employee_user,loc,'2035-01-15','12:00','14:00','ad425000-0000-4000-8000-000000000010') from ws;
select is(jsonb_array_length(pg_temp.project()->'leave_intervals'),1,'approved leave has separate blocking intervals');
select is(jsonb_array_length(pg_temp.project()->'unavailable_intervals'),2,'leave does not become a preference interval in the eight-day projection');
select is((select count(distinct x->>'offset_seconds') from jsonb_array_elements(pg_temp.project('2035-11-04')->'clock_segments') x),2::bigint,'fall-back week contains both clock offsets');
update public.employee_weekly_preferences set preference=public.empty_weekly_preference('time_range') where workspace_id=(select w from ws);
update public.manager_weekly_reminders set enabled=true,preference=jsonb_set(public.empty_weekly_preference('time_range'),'{days,1,all_day}','true') where workspace_id=(select w from ws);
select ok((pg_temp.project()->'days'->0->>'all_day')::boolean,'all-day projection is explicit');
select tests.stops_working_at((select id from public.workspace_memberships where workspace_id=(select w from ws) and user_id=(select manager from ws)));
-- With no location left the manager reads no week at all (FB-6.1 .4: the core
-- refuses a manager out of reach instead of returning an empty grid).
select throws_ok($$select pg_temp.read_model()$$,'42501','Not allowed','revoked location scope removes preference projection');
-- BL-160: the message alone is the same for every authz.* reason; check the
-- reason itself (an empty scope is refused as out of scope, not, say, missing
-- a permission it actually has).
create function pg_temp.said(statement text) returns text
language plpgsql as $$
declare code text; reason text; what text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics code = returned_sqlstate, reason = pg_exception_hint, what = pg_exception_detail;
  return concat_ws(' ', code, nullif(reason, ''), nullif(what, ''));
end;
$$;
select is(pg_temp.said($$select pg_temp.read_model()$$),
  '42501 authz.out_of_scope schedule.read', 'a revoked location scope is refused as out of scope, not some other reason');
select ok(not has_function_privilege('authenticated','app_private.schedule_week_availability(uuid,date,uuid[],uuid[],boolean)','EXECUTE'),'raw projection helper is private');
select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table sx_av as select
 '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'::uuid w,
 'ad110000-0000-4000-8000-000000000001'::uuid emp,
 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'::uuid actor,
 (select jsonb_agg(jsonb_build_object('day',d,'mode','unrestricted','windows','[]'::jsonb)) from generate_series(0,6)d) all_hours,
 (select jsonb_agg(jsonb_build_object('day',d,'mode','unavailable','windows','[]'::jsonb)) from generate_series(0,6)d) no_hours,
 '{"location_id":"11000000-0000-4000-8000-000000000001","job_id":"13000000-0000-4000-8000-000000000001","shift_type_id":"14000000-0000-4000-8000-000000000001","date":"2030-01-08","start_time":"09:00","end_time":"17:00","time_basis":"explicit","time_timezone":"America/Los_Angeles"}'::jsonb target;
insert into public.employee_profiles(id,workspace_id,employee_code,first_name,last_name,created_by)
select emp,w,'E-993191','Shared','Availability',actor from sx_av;
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,created_by)
select w,emp,(target->>'job_id')::uuid,actor from sx_av;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
select w,emp,(target->>'location_id')::uuid,actor from sx_av;
insert into public.employee_schedule_availability_versions(id,workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from,effective_until,kind)
select 'ad110000-0000-4000-8000-000000000002',w,emp,1,'America/Los_Angeles',all_hours,'manager',actor,'2029-01-01',null,'weekly' from sx_av;
insert into public.employee_schedule_availability_versions(id,workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from,effective_until,kind)
select 'ad110000-0000-4000-8000-000000000003',w,emp,2,'America/Los_Angeles',no_hours,'manager',actor,'2030-01-08','2030-01-08','temporary' from sx_av;
-- A later weekly record does not explicitly replace the temporary exception.
insert into public.employee_schedule_availability_versions(id,workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from,effective_until,kind)
select 'ad110000-0000-4000-8000-000000000004',w,emp,3,'America/Los_Angeles',all_hours,'manager',actor,'2029-01-01',null,'weekly' from sx_av;
select is(public.assess_shift_availability(w,emp,target)->>'coverage','none','AT19 canonical temporary exception survives a later weekly record') from sx_av;
update public.workspace_scheduling_settings set availability_enforcement='soft' where workspace_id=(select w from sx_av);
select is(public.assess_shift_availability(w,emp,target)->>'operation','warning_requires_override','AT19 Schedule soft policy exposes its override requirement') from sx_av;
select * from finish();
rollback;

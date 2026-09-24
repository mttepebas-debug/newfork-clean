begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create function pg_temp.w() returns uuid language sql as $$select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'::uuid$$;
create function pg_temp.manager() returns uuid language sql as $$select 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'::uuid$$;
create function pg_temp.actor(n integer) returns uuid language sql as $$select ('98000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.emp(n integer) returns uuid language sql as $$select ('98090000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.actor(n),'00000000-0000-0000-0000-000000000000','authenticated','authenticated','exchange-'||n||'@example.test','','{}','{}',now(),now() from generate_series(1,6)n;
insert into public.workspace_memberships(workspace_id,user_id,role,status,all_locations)
select pg_temp.w(),pg_temp.actor(n),'employee','active',true from generate_series(1,4)n;
-- Fresh actors do not depend on shared seed employees remaining active.
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,preferred_name,created_by)
select pg_temp.emp(n),pg_temp.w(),pg_temp.actor(n),'E-'||(9900+n)::text,'Employee',n::text,'',pg_temp.manager() from generate_series(1,4)n;
insert into public.locations(short_name, id,workspace_id,name,street_address,city,region,postal_code,country_code,timezone)
select 'T00040-' || n::text, ('980a0000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,pg_temp.w(),'Publication QA '||n,'1 Test St','Test City','CA','94000','US','America/Los_Angeles' from generate_series(1,2)n;
insert into public.jobs(id,workspace_id,name) values('980b0000-0000-4000-8000-000000000001',pg_temp.w(),'Publication QA job');
insert into public.shift_types(id,workspace_id,name,default_start_time,default_end_time) values('980c0000-0000-4000-8000-000000000001',pg_temp.w(),'Publication QA service','09:00','17:00');
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
select pg_temp.w(),pg_temp.emp(n),l.id,pg_temp.manager() from generate_series(1,4)n cross join public.locations l where l.workspace_id=pg_temp.w() and l.id in('980a0000-0000-4000-8000-000000000001','980a0000-0000-4000-8000-000000000002')
and not exists(select 1 from public.employee_location_assignments a where a.employee_id=pg_temp.emp(n) and a.location_id=l.id and ended_at is null);
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,created_by)
select pg_temp.w(),pg_temp.emp(n),'980b0000-0000-4000-8000-000000000001',pg_temp.manager() from generate_series(1,4)n
where not exists(select 1 from public.employee_job_assignments where employee_id=pg_temp.emp(n) and job_id='980b0000-0000-4000-8000-000000000001' and ended_at is null);
insert into public.employee_schedule_availability_versions(workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from,effective_until)
select pg_temp.w(),pg_temp.emp(n),coalesce((select max(version_number) from public.employee_schedule_availability_versions where employee_id=pg_temp.emp(n)),0)+1,'America/Los_Angeles',
(select jsonb_agg(jsonb_build_object('day',d,'mode','unrestricted','windows','[]'::jsonb)) from generate_series(0,6)d),'manager',pg_temp.manager(),'2030-01-07','2030-01-20' from generate_series(1,4)n;
insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
values('98010000-0000-4000-8000-000000000001',pg_temp.w(),'980a0000-0000-4000-8000-000000000001','2030-01-07',1,pg_temp.manager());
insert into public.schedule_published_shifts(id,workspace_id,location_id,publication_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id)
select ('98020000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,pg_temp.w(),'980a0000-0000-4000-8000-000000000001','98010000-0000-4000-8000-000000000001',case n when 4 then null when 3 then pg_temp.emp(2) else pg_temp.emp(1) end,'980b0000-0000-4000-8000-000000000001','980c0000-0000-4000-8000-000000000001','2030-01-07'::date+n-1,'09:00','17:00',gen_random_uuid() from generate_series(1,4)n;
create function pg_temp.shift(n integer) returns uuid language sql as $$select ('98020000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create temp table sx_state(cid uuid, aid uuid, result jsonb, preview jsonb);
insert into sx_state values(null,null,null,null);


create function pg_temp.read_case(actor uuid) returns jsonb language sql as $$
 select value from jsonb_array_elements(public.shift_exchanges_read_service(actor,pg_temp.w(),false,'2030-01-07','2030-01-20',(select cid from sx_state))->'cases') where value->>'id'=(select cid::text from sx_state);
$$;
update sx_state set result=public.shift_exchanges_command_service(pg_temp.actor(1),pg_temp.w(),jsonb_build_object('action','create','kind','swap','shift_id',pg_temp.shift(1),'requested_shift_id',pg_temp.shift(3)),gen_random_uuid());
update sx_state set cid=(result->>'case_id')::uuid;
select is(pg_temp.read_case(pg_temp.actor(1))->>'current_published','true','source has a current publication');
select is(pg_temp.read_case(pg_temp.actor(1))->>'requested_current_published','true','counterpart has a current publication');
select is(pg_temp.read_case(pg_temp.actor(2))->>'requested_current_published','true','recipient sees the same current counterpart flag');
select ok(pg_temp.read_case(pg_temp.actor(4)) is null,'an unrelated employee cannot reveal a case by its notification link');
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(1)),pg_temp.emp(1),'reading details does not transfer the source');
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(3)),pg_temp.emp(2),'reading details does not transfer the counterpart');
delete from public.schedule_published_shifts where id=pg_temp.shift(3);
select is(pg_temp.read_case(pg_temp.actor(1))->>'current_published','true','source remains current when counterpart publication is removed');
select is(pg_temp.read_case(pg_temp.actor(1))->>'requested_current_published','false','removed counterpart is explicitly historical');
select ok(pg_temp.read_case(pg_temp.actor(1))->'requested_shift' is not null,'historical shift facts remain available without claiming publication');
delete from public.schedule_published_shifts where id=pg_temp.shift(1);
select is(pg_temp.read_case(pg_temp.actor(1))->>'current_published','false','removed source is explicitly historical too');
update sx_state set result=public.shift_exchanges_command_service(pg_temp.actor(1),pg_temp.w(),jsonb_build_object('action','create','kind','cover','shift_id',pg_temp.shift(2)),gen_random_uuid());
update sx_state set cid=(result->>'case_id')::uuid;
select is(pg_temp.read_case(pg_temp.actor(1))->'requested_current_published','null'::jsonb,'cover has no fabricated second publication');
select ok(not has_function_privilege('authenticated','public.shift_exchanges_read_service(uuid,uuid,boolean,date,date,uuid)','execute'),'reader retains service-only privilege');
select * from finish();
rollback;

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
select 'T00039-' || n::text, ('980a0000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,pg_temp.w(),'Publication QA '||n,'1 Test St','Test City','CA','94000','US','America/Los_Angeles' from generate_series(1,2)n;
insert into public.jobs(id,workspace_id,name) values('980b0000-0000-4000-8000-000000000001',pg_temp.w(),'Publication QA job');
insert into public.shift_types(id,workspace_id,name,default_start_time,default_end_time) values('980c0000-0000-4000-8000-000000000001',pg_temp.w(),'Publication QA service','09:00','17:00');
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
select pg_temp.w(),pg_temp.emp(n),l.id,pg_temp.manager() from generate_series(1,4)n cross join public.locations l where l.workspace_id=pg_temp.w() and l.id in('980a0000-0000-4000-8000-000000000001','980a0000-0000-4000-8000-000000000002')
and not exists(select 1 from public.employee_location_assignments a where a.employee_id=pg_temp.emp(n) and a.location_id=l.id and ended_at is null);
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,created_by)
select pg_temp.w(),pg_temp.emp(n),'980b0000-0000-4000-8000-000000000001',pg_temp.manager() from generate_series(1,4)n
where not exists(select 1 from public.employee_job_assignments where employee_id=pg_temp.emp(n) and job_id='980b0000-0000-4000-8000-000000000001' and ended_at is null);
insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
values('98010000-0000-4000-8000-000000000001',pg_temp.w(),'980a0000-0000-4000-8000-000000000001','2030-01-07',1,pg_temp.manager());
insert into public.schedule_published_shifts(id,workspace_id,location_id,publication_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id)
select ('98020000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,pg_temp.w(),'980a0000-0000-4000-8000-000000000001','98010000-0000-4000-8000-000000000001',case n when 4 then null when 3 then pg_temp.emp(2) else pg_temp.emp(1) end,'980b0000-0000-4000-8000-000000000001','980c0000-0000-4000-8000-000000000001','2030-01-07'::date+n-1,'09:00','17:00',gen_random_uuid() from generate_series(1,4)n;
create function pg_temp.shift(n integer) returns uuid language sql as $$select ('98020000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create temp table sx_state(cid uuid, aid uuid, result jsonb, preview jsonb);
insert into sx_state values(null,null,null,null);



create function pg_temp.r(actor uuid, manager_view boolean, d date, focused uuid default null) returns jsonb language sql as $$
 select public.shift_exchanges_read_service(actor,pg_temp.w(),manager_view,d,d,focused)->'cases';
$$;
create function pg_temp.has_case(items jsonb) returns boolean language sql as $$
 select exists(select 1 from jsonb_array_elements(items) where value->>'id'=(select cid::text from sx_state));
$$;
update sx_state set result=public.shift_exchanges_command_service(pg_temp.actor(1),pg_temp.w(),jsonb_build_object('action','create','kind','swap','shift_id',pg_temp.shift(1),'requested_shift_id',pg_temp.shift(3)),gen_random_uuid());
update sx_state set cid=(result->>'case_id')::uuid;
select is(pg_temp.r(pg_temp.actor(4),false,'2030-01-07'),'[]'::jsonb,'an empty authorized case collection stays a JSON array');
select ok(pg_temp.has_case(pg_temp.r(pg_temp.actor(1),false,'2030-01-07')),'source date includes the open swap');
select ok(pg_temp.has_case(pg_temp.r(pg_temp.actor(2),false,'2030-01-09')),'return date includes the open swap');
select ok(not pg_temp.has_case(pg_temp.r(pg_temp.actor(1),false,'2030-02-01')),'open swap outside both dates is absent');
select ok(pg_temp.has_case(pg_temp.r(pg_temp.actor(1),false,'2030-02-01',(select cid from sx_state))),'authorized focused detail survives range exclusion');
select ok(not pg_temp.has_case(pg_temp.r(pg_temp.actor(4),false,'2030-02-01',(select cid from sx_state))),'focused detail cannot bypass employee participation');
update sx_state set result=public.shift_exchanges_command_service(pg_temp.actor(1),pg_temp.w(),jsonb_build_object('action','close','case_id',cid,'expected_revision',1,'reason','Owner no longer needs the swap'),gen_random_uuid());
select ok(pg_temp.has_case(pg_temp.r(pg_temp.actor(2),false,'2030-01-09')),'closed swap can be found using only the return date');
select ok(pg_temp.has_case(pg_temp.r(pg_temp.manager(),true,'2030-01-09')),'manager finds closed swap by return date');
select ok(not pg_temp.has_case(pg_temp.r(pg_temp.actor(4),false,'2030-01-09')),'return-date search does not expose unrelated requests');
-- Published conditions can change after closure. Filter and display must agree.
update public.schedule_published_shifts set scheduled_date='2030-01-11' where id=pg_temp.shift(3);
select ok(pg_temp.has_case(pg_temp.r(pg_temp.actor(2),false,'2030-01-11')),'moved current return date includes retained closed case');
select ok(not pg_temp.has_case(pg_temp.r(pg_temp.actor(2),false,'2030-01-09')),'old snapshot date does not override current displayed date');
delete from public.schedule_published_shifts where id=pg_temp.shift(3);
select ok(pg_temp.has_case(pg_temp.r(pg_temp.actor(2),false,'2030-01-09')),'unpublished counterpart uses its retained historical date');
select is((select value->>'requested_current_published' from jsonb_array_elements(pg_temp.r(pg_temp.actor(2),false,'2030-01-09')) where value->>'id'=(select cid::text from sx_state)),'false','source cache does not survive a later read after unpublish');
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(1)),pg_temp.emp(1),'reads and owner cancellation do not transfer the source');
select ok(not has_function_privilege('authenticated','public.shift_exchanges_read_service(uuid,uuid,boolean,date,date,uuid)','execute'),'service-only reader remains unavailable to authenticated');
-- A mixed history preserves order, nullable fields and array shape.
update sx_state set result=public.shift_exchanges_command_service(pg_temp.actor(1),pg_temp.w(),jsonb_build_object('action','create','kind','cover','shift_id',pg_temp.shift(2)),gen_random_uuid());
create temp table mixed_read as select public.shift_exchanges_read_service(pg_temp.actor(1),pg_temp.w(),false,'2030-01-07','2030-01-09',null) model;
select is((select jsonb_array_length(model->'cases') from mixed_read),2,'two accessible requests remain in the collection');
select is((select model->'cases'->0->>'kind' from mixed_read),'swap','the earlier closed swap retains first position');
select is((select model->'cases'->1->>'kind' from mixed_read),'cover','the later cover follows the closed swap');
select is((select model->'cases'->1->'requested_shift' from mixed_read),'null'::jsonb,'cover preserves a null counterpart rather than a nested array');
select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table ws as select
 'ad424000-0000-4000-8000-000000000001'::uuid w,
 'ad424000-0000-4000-8000-000000000002'::uuid owner_id,
 'ad424000-0000-4000-8000-000000000003'::uuid employee_user,
 'ad424000-0000-4000-8000-000000000004'::uuid emp,
 'ad424000-0000-4000-8000-000000000005'::uuid manager,
 'ad424000-0000-4000-8000-000000000006'::uuid loc,
 'ad424000-0000-4000-8000-000000000007'::uuid other_loc,
 'ad424000-0000-4000-8000-000000000008'::uuid request_key,
 'ad424000-0000-4000-8000-000000000009'::uuid job,
 null::uuid session, null::jsonb payload, null::jsonb batch, null::integer original_revision;
insert into auth.users(id,email) select owner_id,'weekly-batch-owner@example.test' from ws
 union all select employee_user,'weekly-batch-employee@example.test' from ws
 union all select manager,'weekly-batch-manager@example.test' from ws;
insert into public.workspaces(id,name,created_by) select w,'Weekly batch',owner_id from ws;
insert into public.workspace_memberships(workspace_id,user_id,role,all_locations)
 select w,owner_id,'owner'::public.workspace_role,true from ws
 union all select w,employee_user,'employee'::public.workspace_role,false from ws
 union all select w,manager,'manager'::public.workspace_role,false from ws;
insert into public.workspace_scheduling_settings(workspace_id) select w from ws on conflict do nothing;
insert into public.locations(short_name, id,workspace_id,name,street_address,city,region,postal_code,timezone)
 select 'T00070', loc,w,'West','1 Test Street','Test City','CA','90001','America/Los_Angeles' from ws
 union all select 'T00071', other_loc,w,'East','2 Test Street','Test City','NY','10001','America/New_York' from ws;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
 select emp,w,employee_user,'E-993424','Weekly','Batch',owner_id from ws;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
 select w,emp,loc,owner_id from ws;
select tests.works_at(m.id, f.loc) from ws f join public.workspace_memberships m on m.workspace_id=f.w and m.user_id in(f.employee_user,f.manager);
insert into public.jobs(id,workspace_id,name) select job,w,'Server' from ws;
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,is_primary,created_by)
 select w,emp,job,true,owner_id from ws;
update ws set session=(public.acquire_schedule_edit_session_service(manager,w,'2035-01-15','blank',null)->'session'->>'id')::uuid;
update ws s set original_revision=e.revision from public.schedule_edit_sessions e where e.id=s.session;
update ws set payload=jsonb_build_object('location_id',loc,'employee_id',emp,'job_id',job,'scheduled_date','2035-01-15',
 'time_basis','explicit','start_time','18:00','end_time','20:00','time_timezone','America/Los_Angeles','note','');
-- Two conflicting days, both closed (Require confirmation): Monday (the 15th)
-- for the batch's own valid acceptance below, Friday (the 19th) for the O1
-- fix's second, independent conflict. Availability is only a warning since
-- BL-186, so a closure carries the acceptance these checks are about.
insert into public.important_dates (id, workspace_id, location_id, location_ids, starts_on, ends_on, title, type, created_by)
 select gen_random_uuid(), w, loc, array[loc]::uuid[], (d)::date, (d)::date, 'Closed', 'closed_day', owner_id from ws cross join unnest(array['2035-01-15'::date,'2035-01-19'::date]) d;
update ws set payload=payload||jsonb_build_object('availability_assessment_fingerprint',public.assess_schedule_shift_service(manager,w,payload,null,session)->>'fingerprint');
update ws set batch=jsonb_build_array(payload,payload||'{"scheduled_date":"2035-01-16"}');
create function pg_temp.create_batch(p jsonb default null,k uuid default null) returns jsonb language sql as $$
 select public.create_schedule_shifts_batch_service(manager,w,session,original_revision,coalesce(p,batch),coalesce(k,request_key)) from ws;
$$;
-- The first item is payload as built above: Monday, a real conflict, and a
-- fingerprint that actually matches, so it commits on its own merits AND
-- records a genuine acceptance. The later, second item is a *different*
-- conflicting day (Friday, its own closure) with a fingerprint that can
-- never match, so only ITS staleness is under test, and the whole batch,
-- including the first item's already-written acceptance, must still roll
-- back together (nf-guvenlik O1, 2026-09-26).
select throws_ok($$select pg_temp.create_batch(jsonb_build_array(payload,payload||'{"scheduled_date":"2035-01-19","availability_assessment_fingerprint":"stale"}')) from ws$$,'PT409',null,'later stale assessment rolls the whole command back');
select is((select count(*) from public.schedule_edit_session_shifts where workspace_id=(select w from ws)),0::bigint,'no first shift remains after later failure');
select is((select count(*) from public.schedule_availability_overrides where workspace_id=(select w from ws)),0::bigint,'first acceptance also rolls back');
select is((select revision from public.schedule_edit_sessions where id=(select session from ws)),(select original_revision from ws),'failed batch does not advance the session');
select is((select count(*) from public.schedule_shift_batch_commands where workspace_id=(select w from ws)),0::bigint,'failed command leaves no receipt');
select throws_ok($$select pg_temp.create_batch(jsonb_build_array(payload,payload||jsonb_build_object('location_id',other_loc))) from ws$$,'42501',null,'one out-of-scope location rejects the batch');
select throws_ok($$select public.create_schedule_shifts_batch_service(employee_user,w,session,original_revision,batch,request_key) from ws$$,'42501',null,'employee cannot use the manager command');
select throws_ok($$select public.create_schedule_shifts_batch_service(manager,other_loc,session,original_revision,batch,request_key) from ws$$,'42501',null,'cross-workspace session is inaccessible');
select throws_ok($$select pg_temp.create_batch('[]')$$,'22023',null,'empty batch rejected');
select throws_ok($$select pg_temp.create_batch('{}')$$,'22023',null,'non-array rejected');
select throws_ok($$select pg_temp.create_batch('[null]')$$,'22023',null,'null item rejected');
select throws_ok($$select pg_temp.create_batch((select jsonb_agg(payload) from ws,generate_series(1,201)))$$,'22023',null,'oversized batch rejected');
select tests.approved_leave(w,emp,employee_user,loc,'2035-01-16','12:00','14:00','ad424000-0000-4000-8000-000000000010') from ws;
select throws_ok($$select pg_temp.create_batch(jsonb_build_array(payload,payload||'{"scheduled_date":"2035-01-16","start_time":"12:00","end_time":"14:00"}')) from ws$$,'23514',null,'later approved leave cannot be overridden by batch');
select is((select count(*) from public.schedule_edit_session_shifts where workspace_id=(select w from ws)),0::bigint,'approved-leave failure also leaves no earlier assignment');
select lives_ok($$select pg_temp.create_batch()$$,'valid warn batch commits all assignments once');
select is((select count(*) from public.schedule_edit_session_shifts where workspace_id=(select w from ws)),2::bigint,'both assignments created');
select is((select count(*) from public.schedule_availability_overrides where workspace_id=(select w from ws)),1::bigint,'only the shift on the closed day has acceptance');
select lives_ok($$select pg_temp.create_batch()$$,'exact retry succeeds despite original stale session revision');
select is((select count(*) from public.schedule_edit_session_shifts where workspace_id=(select w from ws)),2::bigint,'retry creates no duplicate');
select throws_ok($$select pg_temp.create_batch(jsonb_build_array(payload)) from ws$$,'40001',null,'same key with changed body is rejected');
select throws_ok($$select pg_temp.create_batch(null,gen_random_uuid())$$,'40001',null,'new command cannot reuse a stale revision');
select public.mutate_schedule_edit_shift_service(s.manager,s.w,s.session,e.revision,'create',gen_random_uuid(),null,s.payload||'{"scheduled_date":"2035-01-17"}',gen_random_uuid())->>'revision'
 from ws s join public.schedule_edit_sessions e on e.id=s.session;
select is((pg_temp.create_batch()->>'revision')::integer,(select revision from public.schedule_edit_sessions where id=(select session from ws)),'retry returns current state instead of overwriting later edits');
insert into public.important_dates (id, workspace_id, location_id, location_ids, starts_on, ends_on, title, type, created_by)
 select gen_random_uuid(), w, loc, array[loc]::uuid[], ('2035-01-18')::date, ('2035-01-18')::date, 'Closed', 'closed_day', owner_id from ws;
update ws s set original_revision=e.revision,request_key=gen_random_uuid(),payload=payload||'{"scheduled_date":"2035-01-18"}' from public.schedule_edit_sessions e where e.id=s.session;
select throws_ok($$select pg_temp.create_batch(jsonb_build_array(payload)) from ws$$,'PT409',null,'confirm policy cannot use an earlier conflict fingerprint');
update ws set payload=payload||jsonb_build_object('availability_assessment_fingerprint',public.assess_schedule_shift_service(manager,w,payload,null,session)->>'fingerprint');
update ws set batch=jsonb_build_array(payload);
select lives_ok($$select pg_temp.create_batch()$$,'fresh confirmed assignment needs no written reason');
select is((select reason from public.schedule_availability_overrides where workspace_id=(select w from ws) and assessment->>'warning_policy'='confirm' limit 1),'Schedule conflict confirmed by manager.','batch retains the canonical acceptance audit');
select tests.stops_working_at((select id from public.workspace_memberships where workspace_id=(select w from ws) and user_id=(select manager from ws)));
select throws_ok($$select pg_temp.create_batch()$$,'42501',null,'retry rechecks current location scope');
select ok(not has_function_privilege('authenticated','public.create_schedule_shifts_batch_service(uuid,uuid,uuid,integer,jsonb,uuid)','EXECUTE'),'browser role cannot execute privileged batch directly');
select ok(not has_table_privilege('authenticated','public.schedule_shift_batch_commands','SELECT'),'receipt is private');
select * from finish();
rollback;

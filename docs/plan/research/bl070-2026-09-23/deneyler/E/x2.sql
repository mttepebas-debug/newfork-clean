begin;
\i /tmp/fixture.sql
select 'X2 owner read model shifts', jsonb_array_length(public.get_schedule_read_model_service(owner_id,w,week)->'shifts'), (select string_agg(distinct x->>'location_id',',') from jsonb_array_elements(public.get_schedule_read_model_service(owner_id,w,week)->'shifts') x) from fx;
select 'X2 mgr read model keys', (select string_agg(k,',') from jsonb_object_keys(public.get_schedule_read_model_service(mgr_user,w,week)) k) from fx;
select 'X2 mgr read model employees', (select string_agg(x->>'first_name'||' locs='||coalesce(x->>'location_ids',''),' | ') from jsonb_array_elements(public.get_schedule_read_model_service(mgr_user,w,week)->'employees') x) from fx;
-- owner blank session
update fx set session=(public.acquire_schedule_edit_session_service(owner_id,w,week,'blank',null)->'session'->>'id')::uuid;
select 'X2 owner blank session assess', a->>'operation', a->'reasons' from (select public.assess_schedule_shift_service(owner_id,w,jsonb_build_object('location_id',kad,'employee_id',ali,'job_id',job,'scheduled_date',week,'time_basis','explicit','start_time','13:00','end_time','15:00'),null,session) a from fx) q;
select public.discard_schedule_edit_session_service(owner_id,w,session) from fx;
update fx set session=(public.acquire_schedule_edit_session_service(owner_id,w,week,'published',null)->'session'->>'id')::uuid;
select 'X2 owner published session shifts', count(*) from public.schedule_edit_session_shifts where session_id=(select session from fx);
select 'X2 owner published-session assess', a->>'operation', a->'reasons' from (select public.assess_schedule_shift_service(owner_id,w,jsonb_build_object('location_id',kad,'employee_id',ali,'job_id',job,'scheduled_date',week,'time_basis','explicit','start_time','13:00','end_time','15:00'),null,session) a from fx) q;
select public.discard_schedule_edit_session_service(owner_id,w,session) from fx;
-- manager 'published' session: sees only Kadikoy
update fx set session=(public.acquire_schedule_edit_session_service(mgr_user,w,week,'published',null)->'session'->>'id')::uuid;
select 'X2 mgr published session shifts', count(*) from public.schedule_edit_session_shifts where session_id=(select session from fx);
-- concurrent: second manager (Besiktas) tries to open same week
select 'X2 mgr2 acquire same week while mgr holds', public.acquire_schedule_edit_session_service(mgr2_user,w,week,'blank',null)->>'status' from fx;
-- travel
update public.workspace_scheduling_settings set minimum_travel_minutes=60 where workspace_id=(select w from fx);
select 'X2 travel 30min gap other location same week (mgr)', a->>'operation', a->'reasons' from (select public.assess_schedule_shift_service(mgr_user,w,jsonb_build_object('location_id',kad,'employee_id',ali,'job_id',job,'scheduled_date',week,'time_basis','explicit','start_time','16:30','end_time','20:00'),null,session) a from fx) q;
select 'X2 travel 30min gap other location NEXT week published (mgr, session week)', 1;
rollback;

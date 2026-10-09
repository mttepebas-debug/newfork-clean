begin;
\i /tmp/fixture.sql
create temp table o as select app_private.ensure_owner_employee_profile(w,owner_id,'Oya','Owner') emp from fx;
select app_private.open_owner_record_to_everything(w,(select emp from o),owner_id) from fx;
select 'owner emp locs', (select count(*) from public.employee_location_assignments a where a.employee_id=(select emp from o) and ended_at is null), 'jobs', (select count(*) from public.employee_job_assignments a where a.employee_id=(select emp from o) and ended_at is null);
update fx set session=(public.acquire_schedule_edit_session_service(owner_id,w,week,'blank',null)->'session'->>'id')::uuid;
select 'X6 owner self at Besiktas', (public.mutate_schedule_edit_shift_service(f.owner_id,f.w,f.session,e.revision,'create',gen_random_uuid(),null,
  jsonb_build_object('location_id',f.bes,'employee_id',(select emp from o),'job_id',f.job,'scheduled_date',f.week+1,'time_basis','explicit','start_time','09:00','end_time','12:00'),gen_random_uuid()))->>'revision'
 from fx f join public.schedule_edit_sessions e on e.id=f.session;
select 'X6 manager sees owner record in read model?', exists(select 1 from jsonb_array_elements(public.get_schedule_read_model_service(mgr_user,w,week)->'employees') x where x->>'id'=(select emp::text from o)) from fx;
rollback;

begin;
\i /tmp/fixture.sql
select 'scopes', (select string_agg(l.name,',') from public.membership_location_scopes s join public.workspace_memberships m on m.id=s.membership_id join public.locations l on l.id=s.location_id where m.user_id=(select mgr_user from fx));
update fx set session=(public.acquire_schedule_edit_session_service(mgr_user,w,week,'blank',null)->'session'->>'id')::uuid;
select 'X1 assess Ali Kadikoy Mon 13-15 (Besiktas published 12-16)', a->>'operation', a->'reasons' from (select public.assess_schedule_shift_service(mgr_user,w,jsonb_build_object('location_id',kad,'employee_id',ali,'job_id',job,'scheduled_date',week,'time_basis','explicit','start_time','13:00','end_time','15:00'),null,session) a from fx) q;
select 'X1 mutate create', (public.mutate_schedule_edit_shift_service(f.mgr_user,f.w,f.session,e.revision,'create',gen_random_uuid(),null,
  jsonb_build_object('location_id',f.kad,'employee_id',f.ali,'job_id',f.job,'scheduled_date',f.week,'time_basis','explicit','start_time','13:00','end_time','15:00'),gen_random_uuid()))->>'revision'
 from fx f join public.schedule_edit_sessions e on e.id=f.session;
select 'session shifts', count(*) from public.schedule_edit_session_shifts where session_id=(select session from fx);
-- read model visibility
select 'X1 manager read model shift locations', (select string_agg(distinct x->>'location_id',',') from jsonb_array_elements(public.get_schedule_read_model_service(mgr_user,w,week)->'shifts') x), kad, bes from fx;
-- save to draft and preview publication for Kadikoy
create temp table d as select (public.save_schedule_edit_session_service(f.mgr_user,f.w,f.session,e.revision,'X1 draft',null,null)->>'id')::uuid draft from fx f join public.schedule_edit_sessions e on e.id=f.session;
select 'X1 preview Kadikoy', p->>'status', jsonb_pretty(p->'findings') from (select public.preview_schedule_publication_service(mgr_user,w,(select draft from d),array[kad]) p from fx) q;
rollback;

begin;
\i /tmp/fixture.sql
insert into public.shift_types(id,workspace_id,name,color,default_start_time,default_end_time)
 select 'e0000000-0000-4000-8000-0000000000c1',w,'Lunch','#123456','11:00','15:00' from fx;
update fx set session=(public.acquire_schedule_edit_session_service(mgr_user,w,week,'blank',null)->'session'->>'id')::uuid;
create temp table p as select jsonb_build_object('location_id',kad,'employee_id',ali,'job_id',job,'shift_type_id','e0000000-0000-4000-8000-0000000000c1','scheduled_date',week+3,'time_basis','unresolved','start_time','','end_time','') j from fx;
select 'X5 assess unresolved assigned', a->>'operation', a->>'conflict_severity', a->'reasons' from (select public.assess_schedule_shift_service(mgr_user,w,(select j from p),null,session) a from fx) q;
select 'X5 mutate without fingerprint', (public.mutate_schedule_edit_shift_service(f.mgr_user,f.w,f.session,e.revision,'create',gen_random_uuid(),null,(select j from p),gen_random_uuid()))->>'revision' from fx f join public.schedule_edit_sessions e on e.id=f.session;
rollback;
begin;
\i /tmp/fixture.sql
insert into public.shift_types(id,workspace_id,name,color,default_start_time,default_end_time)
 select 'e0000000-0000-4000-8000-0000000000c1',w,'Lunch','#123456','11:00','15:00' from fx;
update fx set session=(public.acquire_schedule_edit_session_service(mgr_user,w,week,'blank',null)->'session'->>'id')::uuid;
create temp table p as select jsonb_build_object('location_id',kad,'employee_id',ali,'job_id',job,'shift_type_id','e0000000-0000-4000-8000-0000000000c1','scheduled_date',week+3,'time_basis','unresolved','start_time','','end_time','') j from fx;
select 'X5 mutate WITH fingerprint (Place shift)', (public.mutate_schedule_edit_shift_service(f.mgr_user,f.w,f.session,e.revision,'create',gen_random_uuid(),null,
  (select j from p)||jsonb_build_object('availability_assessment_fingerprint',public.assess_schedule_shift_service(f.mgr_user,f.w,(select j from p),null,f.session)->>'fingerprint'),gen_random_uuid()))->>'revision'
 from fx f join public.schedule_edit_sessions e on e.id=f.session;
create temp table d as select (public.save_schedule_edit_session_service(f.mgr_user,f.w,f.session,e.revision,'X5 draft',null,null)->>'id')::uuid draft from fx f join public.schedule_edit_sessions e on e.id=f.session;
create temp table pv as select public.preview_schedule_publication_service(mgr_user,w,(select draft from d),array[kad]) p from fx;
select 'X5 preview', p->>'status', jsonb_pretty(p->'findings') from pv;
select 'X5 publish', public.publish_schedule_draft_service(f.mgr_user,f.w,(select draft from d),array[f.kad],dr.revision,(select p->>'fingerprint' from pv),'[]')->>'status' from fx f join public.schedule_drafts dr on dr.id=(select draft from d);
rollback;

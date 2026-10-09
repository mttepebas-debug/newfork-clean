begin;
\i /tmp/fixture.sql
update fx set session=(public.acquire_schedule_edit_session_service(mgr_user,w,week,'published',null)->'session'->>'id')::uuid;
select 'mutate', (public.mutate_schedule_edit_shift_service(f.mgr_user,f.w,f.session,e.revision,'create',gen_random_uuid(),null,
  jsonb_build_object('location_id',f.kad,'employee_id',f.ali,'job_id',f.job,'scheduled_date',f.week+2,'time_basis','explicit','start_time','09:00','end_time','12:00'),gen_random_uuid()))->>'revision'
 from fx f join public.schedule_edit_sessions e on e.id=f.session;
create temp table d as select (public.save_schedule_edit_session_service(f.mgr_user,f.w,f.session,e.revision,'Kadikoy manager draft',null,null)->>'id')::uuid draft from fx f join public.schedule_edit_sessions e on e.id=f.session;
select 'draft shifts by location', l.name, count(*) from public.schedule_draft_shifts s join public.locations l on l.id=s.location_id where s.draft_id=(select draft from d) group by l.name;
create temp table pv as select public.preview_schedule_publication_service(owner_id,w,(select draft from d),array[kad,bes]) p from fx;
select 'owner preview both', p->>'status', jsonb_pretty(p->'locations') from pv;
select 'owner publish both', public.publish_schedule_draft_service(f.owner_id,f.w,(select draft from d),array[f.kad,f.bes],dr.revision,(select p->>'fingerprint' from pv),'[]')->>'status' from fx f join public.schedule_drafts dr on dr.id=(select draft from d);
select 'Besiktas current shifts after', count(*) from public.schedule_published_shifts s join public.schedule_location_publications p on p.id=s.publication_id and p.status='current' where p.location_id=(select bes from fx);
rollback;

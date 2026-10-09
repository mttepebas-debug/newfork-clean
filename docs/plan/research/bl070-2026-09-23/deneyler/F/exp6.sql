select pg_temp.pub(ayse,bes,5,'18:00','22:00',7) from fx;
insert into public.schedule_time_off_requests(id,workspace_id,employee_id,location_id,reason,created_by)
 select 'f7a00000-0000-4000-8000-000000000901',w,ayse,kad,'Family',ayse_u from fx;
insert into public.schedule_time_off_segments(workspace_id,request_id,segment_date) select w,'f7a00000-0000-4000-8000-000000000901',d0+5 from fx;
select 'T1 MK (Kadikoy) queue count', jsonb_array_length(public.get_schedule_requests_service(mk_u,w)->'time_off_requests') from fx;
select 'T1 MB (Besiktas) queue count', jsonb_array_length(public.get_schedule_requests_service(mb_u,w)->'time_off_requests') from fx;
select 'T2 MK approve preview', p->>'restricted_count', jsonb_array_length(p->'affected_shifts') from fx, lateral (select public.preview_time_off_assignment_decision_service(mk_u,w,'f7a00000-0000-4000-8000-000000000901',1,'approve','[]') p) q;
select 'T2 MK approve', pg_temp.try(format($q$select public.decide_time_off_with_assignments_service(%L,%L,'f7a00000-0000-4000-8000-000000000901',1,'approve','ok','[]',gen_random_uuid(),null,'[]')->>'status'$q$,mk_u,w)) from fx;
select 'T3 owner preview', p->>'restricted_count', jsonb_array_length(p->'affected_shifts') from fx, lateral (select public.preview_time_off_assignment_decision_service(owner_u,w,'f7a00000-0000-4000-8000-000000000901',1,'approve','[]') p) q;
-- without Besiktas shift
delete from public.schedule_published_shifts where id=pg_temp.sid(7);
select 'T4 MK approve when no Besiktas shift published yet', pg_temp.try(format($q$select public.decide_time_off_with_assignments_service(%L,%L,'f7a00000-0000-4000-8000-000000000901',1,'approve','ok','[]',gen_random_uuid(),null,'[]')->>'status'$q$,mk_u,w)) from fx;
select 'T5 Besiktas assessment for Ayse that evening', a->>'operation', a->'reasons'->0->>'code' from fx, lateral (select public.assess_weekly_shift_availability(w,ayse,jsonb_build_object('location_id',bes,'job_id',server,'scheduled_date',d0+5,'start_time','18:00','end_time','22:00','time_basis','explicit')) a) q;
update public.workspace_scheduling_settings set conflict_rules=conflict_rules||'{"approved_time_off":"confirm"}' where workspace_id=(select w from fx);
select 'T6 same with approved_time_off=confirm', a->>'operation' from fx, lateral (select public.assess_weekly_shift_availability(w,ayse,jsonb_build_object('location_id',bes,'job_id',server,'scheduled_date',d0+5,'start_time','18:00','end_time','22:00','time_basis','explicit')) a) q;

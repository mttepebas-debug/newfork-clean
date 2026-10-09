begin;
\i /tmp/fixture.sql
update fx set session=(public.acquire_schedule_edit_session_service(mgr_user,w,week,'blank',null)->'session'->>'id')::uuid;
create function pg_temp.pl(emp uuid, d date, s text, e text, loc uuid default null) returns jsonb language sql as $$
 select jsonb_build_object('location_id',coalesce(loc,f.kad),'employee_id',emp,'job_id',f.job,'scheduled_date',d,'time_basis','explicit','start_time',s,'end_time',e) from fx f $$;
create function pg_temp.mk(p jsonb) returns text language plpgsql as $$ declare r text; begin
 select (public.mutate_schedule_edit_shift_service(f.mgr_user,f.w,f.session,e.revision,'create',gen_random_uuid(),null,
   p||jsonb_build_object('availability_assessment_fingerprint',public.assess_schedule_shift_service(f.mgr_user,f.w,p,null,f.session)->>'fingerprint'),gen_random_uuid()))->>'revision'
   into r from fx f join public.schedule_edit_sessions e on e.id=f.session; return 'ok rev '||r;
 exception when others then return 'ERR '||sqlstate||' '||sqlerrm; end $$;
-- (a) manager schedules own employee record
select 'X4a mgr self', pg_temp.mk(pg_temp.pl(mgr_emp,week,'09:00','12:00')) from fx;
-- (c) approved time off, default block
insert into public.schedule_time_off_requests(id,workspace_id,employee_id,location_id,status,created_by)
 select 'e0000000-0000-4000-8000-0000000000f1',w,ali,kad,'approved',ali_user from fx;
insert into public.schedule_time_off_segments(workspace_id,request_id,segment_date,start_time,end_time,status)
 select w,'e0000000-0000-4000-8000-0000000000f1',week+1,'00:00','23:59','approved' from fx;
select 'X4c approved leave default rules', public.assess_schedule_shift_service(mgr_user,w,pg_temp.pl(ali,week+1,'10:00','14:00'),null,session)->>'operation' from fx;
select 'X4c approved leave default mutate', pg_temp.mk(pg_temp.pl(ali,week+1,'10:00','14:00')) from fx;
update public.workspace_scheduling_settings set conflict_rules=jsonb_set(conflict_rules,'{approved_time_off}','"confirm"') where workspace_id=(select w from fx);
select 'X4c approved leave rule=confirm assess', public.assess_schedule_shift_service(mgr_user,w,pg_temp.pl(ali,week+1,'10:00','14:00'),null,session)->>'operation' from fx;
select 'X4c approved leave rule=confirm mutate', pg_temp.mk(pg_temp.pl(ali,week+1,'10:00','14:00')) from fx;
select 'X4c shift on approved leave in session', count(*) from public.schedule_edit_session_shifts where session_id=(select session from fx) and scheduled_date=(select week+1 from fx);
-- (d) availability block
insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by)
 select w,ali,jsonb_set(public.empty_weekly_preference('time_range'),'{days,3,all_day}','true'),1,ali_user from fx;
select 'X4d weekday of week+2', extract(dow from (select week+2 from fx));
select 'X4d availability default (confirm) assess', public.assess_schedule_shift_service(mgr_user,w,pg_temp.pl(ali,week+2,'10:00','14:00'),null,session)->>'operation' from fx;
update public.workspace_scheduling_settings set conflict_rules=jsonb_set(conflict_rules,'{availability}','"block"') where workspace_id=(select w from fx);
select 'X4d availability=block assess', public.assess_schedule_shift_service(mgr_user,w,pg_temp.pl(ali,week+2,'10:00','14:00'),null,session)->>'operation' from fx;
select 'X4d availability=block mutate', pg_temp.mk(pg_temp.pl(ali,week+2,'10:00','14:00')) from fx;
select 'X4d settings after', availability_warning_policy, conflict_rules->>'availability', availability_enforcement from public.workspace_scheduling_settings where workspace_id=(select w from fx);
update public.workspace_scheduling_settings set conflict_rules=jsonb_set(conflict_rules,'{availability}','"allow"') where workspace_id=(select w from fx);
select 'X4d availability=allow assess', public.assess_schedule_shift_service(mgr_user,w,pg_temp.pl(ali,week+2,'10:00','14:00'),null,session)->>'operation' from fx;
rollback;

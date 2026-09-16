begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table ws as select
 'ad433000-0000-4000-8000-000000000001'::uuid w,
 'ad433000-0000-4000-8000-000000000002'::uuid owner_id,
 'ad433000-0000-4000-8000-000000000003'::uuid source_manager,
 'ad433000-0000-4000-8000-000000000004'::uuid destination_manager,
 'ad433000-0000-4000-8000-000000000005'::uuid emp,
 'ad433000-0000-4000-8000-000000000006'::uuid other_emp,
 'ad433000-0000-4000-8000-000000000007'::uuid loc,
 'ad433000-0000-4000-8000-000000000008'::uuid other_loc,
 'ad433000-0000-4000-8000-000000000009'::uuid job,
 'ad433000-0000-4000-8000-000000000010'::uuid service,
 date_trunc('week',current_date)::date+14 start_day;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$
 select ('ad433000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid;
$$;
insert into auth.users(id,email) select owner_id,'transfer-owner@example.test' from ws
 union all select source_manager,'transfer-source@example.test' from ws
 union all select destination_manager,'transfer-destination@example.test' from ws;
insert into public.workspaces(id,name,created_by) select w,'Weekly Line Up transfers',owner_id from ws;
insert into public.workspace_memberships(workspace_id,user_id,role,all_locations)
 select w,owner_id,'owner'::public.workspace_role,true from ws
 union all select w,source_manager,'manager'::public.workspace_role,false from ws
 union all select w,destination_manager,'manager'::public.workspace_role,false from ws;
insert into public.workspace_scheduling_settings(workspace_id,availability_warning_policy) select w,'confirm' from ws on conflict(workspace_id) do update set availability_warning_policy='confirm';
insert into public.locations(short_name, id,workspace_id,name,street_address,city,region,postal_code,timezone,lineup_operations_enabled)
 select 'T00062', loc,w,'Source','1 Test Street','Test City','CA','90001','UTC',true from ws
 union all select 'T00063', other_loc,w,'Destination','2 Test Street','Test City','CA','90001','UTC',true from ws;
insert into public.membership_location_scopes(membership_id,workspace_id,location_id)
 select m.id,w,case when m.user_id=source_manager then loc else other_loc end
 from ws join public.workspace_memberships m on m.workspace_id=w and m.user_id in(source_manager,destination_manager);
insert into public.jobs(id,workspace_id,name) select job,w,'Server' from ws;
insert into public.shift_types(id,workspace_id,name,default_start_time,default_end_time) select service,w,'Day','10:00','18:00' from ws;
insert into public.employee_profiles(id,workspace_id,employee_code,first_name,last_name,created_by)
 select emp,w,'E-9934331','Source','Employee',owner_id from ws
 union all select other_emp,w,'E-9934332','Destination','Employee',owner_id from ws;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
 select w,e.id,l.id,owner_id from ws cross join lateral unnest(array[emp,other_emp]) e(id) cross join lateral unnest(array[loc,other_loc]) l(id);
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,is_primary,created_by)
 select w,e.id,job,true,owner_id from ws cross join lateral unnest(array[emp,other_emp]) e(id);
insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
 select pg_temp.id(1),w,loc,start_day,1,owner_id from ws
 union all select pg_temp.id(2),w,other_loc,start_day,1,owner_id from ws;
insert into public.schedule_published_shifts(id,source_shift_id,workspace_id,location_id,publication_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
 select pg_temp.id(10+n),pg_temp.id(30+n),w,loc,pg_temp.id(1),emp,job,service,start_day+n-1,'10:00'::time,'18:00'::time,'explicit','UTC' from ws,generate_series(1,6) n
 union all select pg_temp.id(20+n),pg_temp.id(40+n),w,other_loc,pg_temp.id(2),other_emp,job,service,start_day+n-1,'10:00'::time,'18:00'::time,'explicit','UTC' from ws,generate_series(1,6) n;
create function pg_temp.unavailable() returns jsonb language sql as $$
 select jsonb_build_object('input_mode','time_range','days',jsonb_agg(jsonb_build_object('day',n,'all_day',true,'range',null,'shift_type_ids','[]'::jsonb))) from generate_series(0,6) n;
$$;
insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by)
 select w,e.id,pg_temp.unavailable(),1,owner_id from ws cross join lateral unnest(array[emp,other_emp]) e(id);
create temp table cases(n integer,op jsonb,preview jsonb,result jsonb,pid uuid,key uuid default gen_random_uuid());
insert into cases(n,op) select n,jsonb_build_object('kind',case when n in(1,3,6) then 'move' else 'swap' end,
 'source_entry_id',pg_temp.id(10+n),'target_entry_id',case when n in(2,5) then pg_temp.id(20+n) end,
 'employee_id',emp,'travel_minutes',0,'reason','Review full responsibility transfer',
 'target',jsonb_build_object('date',start_day+n-1,'location_id',case when n in(2,5) then loc else other_loc end,
 'job_id',job,'shift_type_id',service,'start_time','10:00','end_time','18:00','section_id',null,'station','')) from ws,generate_series(1,6) n;
create function pg_temp.review(n integer) returns jsonb language sql as $$
 select public.lineup_operation_preview(owner_id,w,op) from ws,cases where cases.n=$1;
$$;
create function pg_temp.apply(n integer,confirmed boolean default false) returns jsonb language sql as $$
 select public.lineup_operations_service(owner_id,w,'apply',jsonb_build_object('operation',op,'fingerprint',preview->>'fingerprint','idempotency_key',key,'confirm_availability',confirmed)) from ws,cases where cases.n=$1;
$$;
update cases set preview=pg_temp.review(n) where n in(1,2);
select is(preview->>'allowed','true','availability alone does not block a full location move') from cases where n=1;
select is(preview->'availability_warning'->>'policy','confirm','move uses the organization confirmation policy') from cases where n=1;
select throws_ok($$select pg_temp.apply(1)$$,'22023',null,'direct move requires one explicit availability decision');
select is(preview->>'allowed','true','both weekly swap directions remain eligible') from cases where n=2;
select throws_ok($$select pg_temp.apply(2)$$,'22023',null,'both swap warnings require one operation decision');
update cases set result=pg_temp.apply(n,true) where n=1;
select is(result->>'status','applied','confirmed full move succeeds') from cases where n=1;
select is((select location_id from public.schedule_published_shifts where id=pg_temp.id(11)),other_loc,'move writes the actual published destination') from ws;
select is((select count(*)::integer from public.schedule_published_shifts where workspace_id=w and location_id=loc and scheduled_date=start_day and employee_id is null),1,'move leaves an open source need') from ws;
select is((select actor_user_id from public.schedule_availability_overrides where workspace_id=w and shift_id=pg_temp.id(31) and revoked_at is null),owner_id,'move acceptance records the actual manager') from ws;
select is(pg_temp.apply(1,true)->>'event_id',result->>'event_id','retry reuses the original event') from cases where n=1;
insert into public.schedule_time_off_requests(id,workspace_id,employee_id,location_id,status,created_by)
 select pg_temp.id(91),w,emp,other_loc,'approved',owner_id from ws;
insert into public.schedule_time_off_segments(workspace_id,request_id,segment_date,start_time,end_time,status)
 select w,pg_temp.id(91),start_day+1,'10:00','18:00','approved' from ws;
update cases set preview=pg_temp.review(n) where n=2;
select is(preview->>'allowed','false','approved leave on the second swap leg blocks the whole operation') from cases where n=2;
select throws_ok($$select pg_temp.apply(2,true)$$,'P0001',null,'one confirmation cannot bypass a counterpart blocker');
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.id(12)),emp,'blocked counterpart leaves the source unchanged') from ws;
delete from public.schedule_time_off_requests where workspace_id=(select w from ws) and id=pg_temp.id(91);
update cases set preview=pg_temp.review(n),result=null where n=2;
update cases set result=pg_temp.apply(n,true) where n=2;
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.id(12)),other_emp,'swap assigns counterpart at source') from ws;
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.id(22)),emp,'swap assigns source employee at destination') from ws;
select is((select count(*)::integer from public.schedule_availability_overrides where workspace_id=w and shift_id in(pg_temp.id(32),pg_temp.id(42)) and revoked_at is null),2,'both changed assignments receive individual acceptance evidence') from ws;

-- Two independently scoped managers finalize transfers without impersonating each other.
update cases set preview=(select public.lineup_operation_preview(source_manager,w,op) from ws) where n in(3,4);
select is(preview->>'requires_approval','true','source-only manager still needs destination approval') from cases where n=3;
update cases set pid=(select public.lineup_proposals_service(source_manager,w,'propose',jsonb_build_object('kind','transfer','operation',op,'fingerprint',preview->>'fingerprint','idempotency_key',key))->>'id' from ws)::uuid where n in(3,4);
select is((select count(*)::integer from public.lineup_proposals where workspace_id=w and status='pending'),2,'sending transfers needs no additional availability decision') from ws;
update cases set preview=(select public.lineup_proposals_service(destination_manager,w,'proposal_action',jsonb_build_object('id',pid,'response','preview','target_entry_id',case when n=4 then pg_temp.id(24) end)) from ws) where n in(3,4);
select is(preview->>'allowed','true','destination manager reviews both scoped swap directions') from cases where n=4;
select throws_ok($$select public.lineup_proposals_service(destination_manager,w,'proposal_action',jsonb_build_object('id',pid,'response','confirm','target_entry_id',pg_temp.id(24),'confirm_availability',true)) from ws,cases where n=4$$,'P0001',null,'a true flag without the reviewed fingerprint cannot approve transfer warnings');
select throws_ok($$select public.lineup_proposals_service(destination_manager,w,'proposal_action',jsonb_build_object('id',pid,'response','confirm','target_entry_id',pg_temp.id(24),'fingerprint',preview->>'fingerprint')) from ws,cases where n=4$$,'22023',null,'transfer finalization forwards and enforces the explicit decision');
update public.workspace_memberships set status='suspended' where workspace_id=(select w from ws) and user_id=(select source_manager from ws);
select throws_ok($$select public.lineup_proposals_service(destination_manager,w,'proposal_action',jsonb_build_object('id',pid,'response','confirm','target_entry_id',pg_temp.id(24),'fingerprint',preview->>'fingerprint','confirm_availability',true)) from ws,cases where n=4$$,'P0001',null,'revoked source authority cannot be reused by the destination manager');
select is((select status from public.lineup_proposals where id=(select pid from cases where n=4)),'pending','failed scope recheck leaves the transfer unconfirmed');
update public.workspace_memberships set status='active' where workspace_id=(select w from ws) and user_id=(select source_manager from ws);
update cases set result=(select public.lineup_proposals_service(destination_manager,w,'proposal_action',jsonb_build_object('id',pid,'response','confirm','target_entry_id',case when n=4 then pg_temp.id(24) end,'fingerprint',preview->>'fingerprint','confirm_availability',true)) from ws) where n in(3,4);
select is(result->>'status','applied','jointly authorized transfer is applied') from cases where n in(3,4);
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.id(14)),other_emp,'scoped swap writes the source assignment atomically') from ws;
select is((select count(*)::integer from public.schedule_availability_overrides where workspace_id=w and shift_id in(pg_temp.id(34),pg_temp.id(44)) and revoked_at is null and actor_user_id=destination_manager),2,'actual approving manager is recorded for both jointly authorized legs') from ws;
select is((select count(*)::integer from public.schedule_availability_overrides o,cases c where c.n=4 and o.workspace_id=(select w from ws) and o.shift_id in(pg_temp.id(34),pg_temp.id(44)) and o.assessment->>'consent_proposal_id'=c.pid::text),2,'joint acceptance remains bound to its transfer proposal');

-- A warning only on the second swap leg still reaches the one operation decision.
update public.employee_weekly_preferences set preference=public.empty_weekly_preference('time_range') where workspace_id=(select w from ws) and employee_id=(select other_emp from ws);
update cases set preview=pg_temp.review(n) where n=5;
select is(preview->'availability_warning'->>'policy','confirm','second-leg-only conflict is not dropped') from cases where n=5;
update public.employee_weekly_preferences set preference=public.empty_weekly_preference('time_range') where workspace_id=(select w from ws);
select throws_ok($$select pg_temp.apply(5,true)$$,'P0001',null,'changed counterpart availability invalidates the whole operation preview');
insert into public.manager_weekly_reminders(workspace_id,employee_id,preference,enabled,notes,revision,updated_by)
 select w,emp,pg_temp.unavailable(),true,array['Private note','','','','','',''],1,owner_id from ws;
update public.workspace_scheduling_settings set availability_warning_policy='warn' where workspace_id=(select w from ws);
update cases set preview=pg_temp.review(n) where n=5;
select is(preview->'availability_warning'->>'policy','warn','second-leg manager-only reminder uses current warn policy') from cases where n=5;
select ok(preview::text not like '%Private note%' and preview::text not like '%employee_intervals%','operation projection omits private reminder content') from cases where n=5;
create function pg_temp.fail_notifications() returns trigger language plpgsql as $$ begin raise exception 'test transfer notification failure'; end; $$;
create trigger fail_transfer_notifications before insert on public.notifications for each row execute function pg_temp.fail_notifications();
select throws_ok($$select pg_temp.apply(5)$$,'P0001','test transfer notification failure','notification failure rolls back both swap writes');
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.id(15)),emp,'failed swap restores source employee') from ws;
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.id(25)),other_emp,'failed swap restores destination employee') from ws;
select is((select count(*)::integer from public.schedule_availability_overrides where workspace_id=w and shift_id in(pg_temp.id(35),pg_temp.id(45))),0,'failed swap leaves no new acceptance evidence') from ws;
drop trigger fail_transfer_notifications on public.notifications;
update cases set result=pg_temp.apply(n) where n=5;
select is(result->>'status','applied','warn-only swap succeeds without an explicit decision flag') from cases where n=5;

insert into public.schedule_time_off_requests(id,workspace_id,employee_id,location_id,status,created_by)
 select pg_temp.id(90),w,emp,other_loc,'approved',owner_id from ws;
insert into public.schedule_time_off_segments(workspace_id,request_id,segment_date,start_time,end_time,status)
 select w,pg_temp.id(90),start_day+5,'10:00','18:00','approved' from ws;
update cases set preview=pg_temp.review(n) where n=6;
select is(preview->>'allowed','false','approved leave remains a real transfer blocker') from cases where n=6;
select throws_ok($$select pg_temp.apply(6,true)$$,'P0001',null,'availability confirmation cannot override approved leave');
select ok(not has_function_privilege('authenticated','public.weekly_lineup_assignment_target(uuid,uuid,jsonb,jsonb,jsonb)','EXECUTE'),'clients cannot mint internal assignment markers');
select ok(not has_function_privilege('service_role','public.weekly_lineup_assignment_target(uuid,uuid,jsonb,jsonb,jsonb)','EXECUTE'),'the internal assignment helper is not a direct RPC');
select * from finish();
rollback;

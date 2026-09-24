begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table ws as select
 'ad434000-0000-4000-8000-000000000001'::uuid w,
 'ad434000-0000-4000-8000-000000000002'::uuid owner_id,
 'ad434000-0000-4000-8000-000000000003'::uuid source_manager,
 'ad434000-0000-4000-8000-000000000004'::uuid destination_manager,
 'ad434000-0000-4000-8000-000000000005'::uuid emp,
 'ad434000-0000-4000-8000-000000000006'::uuid other_emp,
 'ad434000-0000-4000-8000-000000000007'::uuid loc,
 'ad434000-0000-4000-8000-000000000008'::uuid other_loc,
 'ad434000-0000-4000-8000-000000000009'::uuid job,
 'ad434000-0000-4000-8000-000000000010'::uuid service,
 '2035-07-09'::date start_day;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$
 select ('ad434000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid;
$$;
insert into auth.users(id,email) select owner_id,'segments-owner@example.test' from ws
 union all select source_manager,'segments-source@example.test' from ws
 union all select destination_manager,'segments-destination@example.test' from ws;
insert into public.workspaces(id,name,created_by) select w,'Weekly retained segments',owner_id from ws;
insert into public.workspace_memberships(workspace_id,user_id,role,all_locations)
 select w,owner_id,'owner'::public.workspace_role,true from ws
 union all select w,source_manager,'manager'::public.workspace_role,false from ws
 union all select w,destination_manager,'manager'::public.workspace_role,false from ws;
insert into public.workspace_scheduling_settings(workspace_id,availability_warning_policy) select w,'confirm' from ws on conflict(workspace_id) do update set availability_warning_policy='confirm';
insert into public.locations(short_name, id,workspace_id,name,street_address,city,region,postal_code,timezone,lineup_operations_enabled)
 select 'T00060', loc,w,'Source','1 Test Street','Test City','CA','90001','UTC',true from ws
 union all select 'T00061', other_loc,w,'Destination','2 Test Street','Test City','CA','90001','UTC',true from ws;
select tests.works_at(m.id, case when m.user_id=source_manager then loc else other_loc end) from ws
 join public.workspace_memberships m on m.workspace_id=w and m.user_id in(source_manager,destination_manager);
insert into public.jobs(id,workspace_id,name) select job,w,'Server' from ws;
insert into public.shift_types(id,workspace_id,name,default_start_time,default_end_time) select service,w,'Day','10:00','18:00' from ws;
insert into public.employee_profiles(id,workspace_id,employee_code,first_name,last_name,created_by)
 select emp,w,'E-9934341','Original','Employee',owner_id from ws
 union all select other_emp,w,'E-9934342','Incoming','Employee',owner_id from ws;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
 select w,e.id,l.id,owner_id from ws cross join lateral unnest(array[emp,other_emp]) e(id) cross join lateral unnest(array[loc,other_loc]) l(id);
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,is_primary,created_by)
 select w,e.id,job,true,owner_id from ws cross join lateral unnest(array[emp,other_emp]) e(id);
insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
 select pg_temp.id(n),w,case when n%2=1 then loc else other_loc end,start_day+case when n<=2 then 0 else 7 end,1,owner_id from ws,generate_series(1,4) n;
create temp table cases(n integer,source_date date,op jsonb,preview jsonb,result jsonb,pid uuid,key uuid default gen_random_uuid());
insert into cases(n,source_date) select n,start_day+case when n=6 then 6 else n-1 end from ws,generate_series(1,9) n;
insert into public.schedule_published_shifts(id,source_shift_id,workspace_id,location_id,publication_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
 select pg_temp.id(10+n),pg_temp.id(30+n),w,loc,case when source_date<start_day+7 then pg_temp.id(1) else pg_temp.id(3) end,emp,job,service,source_date,
  case when n=6 then '22:00'::time else '10:00'::time end,case when n=6 then '06:00'::time else '18:00'::time end,
  'explicit',case when n=7 then 'America/New_York' else 'UTC' end from ws,cases;
insert into public.schedule_published_shifts(id,source_shift_id,workspace_id,location_id,publication_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
 select pg_temp.id(20+n),pg_temp.id(40+n),w,other_loc,pg_temp.id(2),case when n=3 then null else other_emp end,job,service,source_date,'10:00','18:00','explicit','UTC' from ws,cases where n in(2,3,4);
create temp table originals as select id,availability_snapshot from public.schedule_published_shifts where workspace_id=(select w from ws);
insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by)
 select w,e.id,jsonb_build_object('input_mode','time_range','days',(select jsonb_agg(jsonb_build_object('day',n,'all_day',true,'range',null,'shift_type_ids','[]'::jsonb)) from generate_series(0,6) n)),1,owner_id from ws cross join lateral unnest(array[emp,other_emp]) e(id);
update cases c set op=jsonb_build_object('kind',case when n in(2,4) then 'swap' when n in(3,7) then 'move' when n in(5,6) then 'release' else 'replace' end,
 'source_entry_id',pg_temp.id(10+n),'target_entry_id',case when n in(2,3) then pg_temp.id(20+n) end,
 'employee_id',case when n in(5,6) then null when n in(3,7) then emp else other_emp end,
 'travel_minutes',case when n=2 then 30 else 0 end,'reason','Preserve unchanged working hours',
 'target',jsonb_build_object('date',source_date+case when n=6 then 1 else 0 end,'location_id',case when n in(3,4,7) then other_loc else loc end,
 'job_id',job,'shift_type_id',service,'start_time',case when n=6 then '00:00' when n=7 then '17:00' else '12:00' end,
 'end_time',case when n=6 then '02:00' when n=7 then '19:00' else '14:00' end,'section_id',null,'station','')) from ws;
create function pg_temp.review(n integer) returns jsonb language sql as $$
 select public.lineup_operation_preview(owner_id,w,op) from ws,cases where cases.n=$1;
$$;
create function pg_temp.apply(n integer,confirmed boolean default false) returns jsonb language sql as $$
 select public.lineup_operations_service(owner_id,w,'apply',jsonb_build_object('operation',op,'fingerprint',preview->>'fingerprint','idempotency_key',key,'confirm_availability',confirmed)) from ws,cases where cases.n=$1;
$$;
update cases set preview=pg_temp.review(n) where n in(1,2,3,5,6,7,8);
select is(preview->>'allowed','true','partial operation has an eligible requested interval') from cases where n in(1,2,3,5,6,7,8);
select throws_ok($$select pg_temp.apply(1)$$,'22023',null,'new replacement still requires its own warning decision');
select is(public.lineup_operation_preview(owner_id,w,op||jsonb_build_object('kind','replace','employee_id',other_emp,
 'target',(op->'target')||jsonb_build_object('location_id',loc)))->>'allowed','false',
 'same-location clock rebasing is blocked before the shared normalizer can reinterpret requested hours') from ws,cases where n=7;
do $$ declare i integer; begin foreach i in array array[1,2,3,5,6,7] loop
 update cases set preview=pg_temp.review(n) where n=i;
 update cases set result=pg_temp.apply(n,true) where n=i;
end loop; end; $$;
select is(result->>'status','applied','partial command succeeds without another decision for retained hours') from cases where n in(1,2,3,5,6,7);
select is((select count(*)::integer from public.schedule_published_shifts where workspace_id=w and employee_id=emp and scheduled_date=start_day and start_time in('10:00','14:00')),2,'replacement preserves both original employee portions') from ws;
select is((select count(*)::integer from public.schedule_published_shifts s where s.workspace_id=w and s.scheduled_date=start_day+1 and s.employee_id is not null and s.start_time in('10:00','14:30')),4,'partial swap retains four unchanged assigned portions') from ws;
select is((select count(*)::integer from public.schedule_published_shifts where workspace_id=w and scheduled_date=start_day+1 and employee_id is null),4,'partial swap keeps its four travel gaps open') from ws;
select is((select count(*)::integer from public.schedule_published_shifts where workspace_id=w and scheduled_date=start_day+2 and location_id=loc and employee_id=emp),2,'moving into a coverage need preserves the original source portions') from ws;
select is((select count(*)::integer from public.schedule_published_shifts where workspace_id=w and scheduled_date=start_day+2 and location_id=other_loc and employee_id is null),2,'destination uncovered portions remain open') from ws;
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.id(15)),null::uuid,'partial release leaves the requested interval unassigned');
select is((select count(*)::integer from public.schedule_published_shifts where workspace_id=w and employee_id=emp and scheduled_date=start_day+4),2,'partial release keeps both old assigned portions without a warning decision') from ws;
select is((select count(*)::integer from public.schedule_published_shifts where workspace_id=w and employee_id=emp and scheduled_date=start_day+7 and start_time='02:00' and end_time='06:00'),1,'overnight remainder is written to the next published week') from ws;
select is((select range_agg(public.lineup_shift_range(scheduled_date,start_time,end_time,time_timezone))::text from public.schedule_published_shifts where workspace_id=w and location_id=loc and employee_id=emp and scheduled_date=start_day+6),
 tstzmultirange(tstzrange((start_day+6+'14:00'::time) at time zone 'UTC',(start_day+6+'17:00'::time) at time zone 'UTC','[)'),tstzrange((start_day+6+'19:00'::time) at time zone 'UTC',(start_day+6+'22:00'::time) at time zone 'UTC','[)'),tstzrange((start_day+6+'22:00'::time) at time zone 'UTC',(start_day+7)::timestamp at time zone 'UTC','[)'))::text,
 'saved New York clock evidence and overnight work preserve their exact physical hours') from ws;
select ok(not exists(select 1 from public.schedule_published_shifts s join originals o on o.id=(s.availability_snapshot->'retained_from'->>'published_shift_id')::uuid
 where s.workspace_id=(select w from ws) and s.availability_snapshot-'retained_from' is distinct from o.availability_snapshot),
 'retained pieces keep the original snapshot, not newly reconstructed availability');
select ok(not exists(select 1 from public.schedule_availability_overrides where workspace_id=(select w from ws)
 and assessment->>'consent_source'='lineup_retained_segment' and assessment ? 'employee_intervals'),'retained lineage does not fabricate a new employee preference decision');

update cases set preview=(select public.lineup_operation_preview(source_manager,w,op) from ws) where n=4;
update cases set pid=(select public.lineup_proposals_service(source_manager,w,'propose',jsonb_build_object('kind','transfer','operation',op,'fingerprint',preview->>'fingerprint','idempotency_key',key))->>'id' from ws)::uuid where n=4;
update cases set preview=(select public.lineup_proposals_service(destination_manager,w,'proposal_action',jsonb_build_object('id',pid,'response','preview','target_entry_id',pg_temp.id(24))) from ws) where n=4;
update cases set result=(select public.lineup_proposals_service(destination_manager,w,'proposal_action',jsonb_build_object('id',pid,'response','confirm','target_entry_id',pg_temp.id(24),'fingerprint',preview->>'fingerprint','confirm_availability',true)) from ws) where n=4;
select is(result->>'status','applied','two scoped managers can finalize a partial swap while preserving both source histories') from cases where n=4;

create function pg_temp.fail_notifications() returns trigger language plpgsql as $$ begin raise exception 'test retained notification failure'; end; $$;
create trigger fail_retained_notifications before insert on public.notifications for each row execute function pg_temp.fail_notifications();
update cases set preview=pg_temp.review(n) where n=8;
select throws_ok($$select pg_temp.apply(8,true)$$,'P0001','test retained notification failure','late failure rolls back fragments and incoming assignment');
select is((select count(*)::integer from public.schedule_published_shifts where workspace_id=w and scheduled_date=start_day+7),3,'rollback leaves the original day-eight source and prior overnight open/assigned portions') from ws;
select is((select count(*)::integer from public.schedule_availability_overrides where workspace_id=w and assessment->>'original_published_shift_id'=pg_temp.id(18)::text),0,'rollback removes retained-lineage evidence too') from ws;
drop trigger fail_retained_notifications on public.notifications;

-- A retained record is bound to the exact generated identity, not a general override.
select public.record_weekly_lineup_retained_segment(owner_id,w,pg_temp.id(19),pg_temp.id(99),tstzrange((start_day+8+'10:00'::time) at time zone 'UTC',(start_day+8+'12:00'::time) at time zone 'UTC','[)')) from ws;
create function pg_temp.insert_piece(employee uuid,ends time,logical uuid default pg_temp.id(99),snapshot jsonb default null) returns void language sql as $$
 insert into public.schedule_published_shifts(source_shift_id,workspace_id,location_id,publication_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,time_basis,time_timezone,availability_snapshot)
 select logical,w,loc,pg_temp.id(3),employee,job,service,start_day+8,'10:00',ends,'explicit','UTC',snapshot from ws;
$$;
select throws_ok($$select pg_temp.insert_piece(other_emp,'12:00') from ws$$,'23514',null,'retained lineage cannot authorize another employee');
select throws_ok($$select pg_temp.insert_piece(emp,'13:00') from ws$$,'23514',null,'retained lineage cannot authorize longer hours');
select throws_ok($$select pg_temp.insert_piece(emp,'12:00',pg_temp.id(98)) from ws$$,'23514',null,'retained lineage cannot move to another logical shift');
select throws_ok($$select pg_temp.insert_piece(emp,'12:00',pg_temp.id(98),jsonb_build_object('retained_from',jsonb_build_object('published_shift_id',pg_temp.id(19)))) from ws$$,'23514',null,'a supplied snapshot marker cannot manufacture retained evidence');
select lives_ok($$select pg_temp.insert_piece(emp,'12:00') from ws$$,'the exact retained piece uses its server-recorded lineage');
select throws_ok($$update public.schedule_published_shifts set end_time='13:00' where workspace_id=(select w from ws) and source_shift_id=pg_temp.id(99)$$,'23514',null,'later extension cannot reuse retained insertion evidence');
select throws_ok($$select public.record_weekly_lineup_retained_segment(owner_id,w,pg_temp.id(19),pg_temp.id(97),tstzrange((start_day+8+'09:00'::time) at time zone 'UTC',(start_day+8+'12:00'::time) at time zone 'UTC','[)')) from ws$$,'23514',null,'lineage writer rejects a fragment outside its source responsibility');
select throws_ok($$select public.record_weekly_lineup_retained_segment(owner_id,gen_random_uuid(),pg_temp.id(19),pg_temp.id(97),'[2035-07-17 10:00Z,2035-07-17 12:00Z)'::tstzrange) from ws$$,'23514',null,'lineage writer cannot borrow a source from another workspace');
select ok(not has_function_privilege('authenticated','public.record_weekly_lineup_retained_segment(uuid,uuid,uuid,uuid,tstzrange)','EXECUTE'),'employees cannot mint retained-lineage evidence');
select ok(not has_function_privilege('service_role','public.record_weekly_lineup_retained_segment(uuid,uuid,uuid,uuid,tstzrange)','EXECUTE'),'lineage writer is not a direct service RPC');

insert into public.schedule_time_off_requests(id,workspace_id,employee_id,location_id,status,created_by)
 select pg_temp.id(90),w,other_emp,loc,'approved',owner_id from ws;
insert into public.schedule_time_off_segments(workspace_id,request_id,segment_date,start_time,end_time,status)
 select w,pg_temp.id(90),start_day+8,'12:00','14:00','approved' from ws;
select is(pg_temp.review(9)->>'allowed','false','retained source portions do not bypass approved leave for the incoming assignment');

update public.locations set timezone='America/Los_Angeles' where id=(select other_loc from ws);
select throws_ok($$select public.lineup_split_has_publications(w,other_loc,'[2035-11-04 07:30Z,2035-11-04 11:00Z)'::tstzrange,'[2035-11-04 09:15Z,2035-11-04 10:00Z)'::tstzrange,30) from ws$$,'23514','Choose split boundaries that preserve the exact local times','a DST travel boundary that cannot round-trip fails instead of shifting retained work');
select * from finish();
rollback;

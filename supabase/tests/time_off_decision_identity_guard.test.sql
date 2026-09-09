begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table td_state as select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'::uuid w,
 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'::uuid actor,'11000000-0000-4000-8000-000000000001'::uuid loc,
 'af960000-0000-4000-8000-000000000001'::uuid emp,'af970000-0000-4000-8000-000000000001'::uuid request,
 'af980000-0000-4000-8000-000000000001'::uuid first_segment,'af980000-0000-4000-8000-000000000002'::uuid second_segment;
insert into public.employee_profiles(id,workspace_id,employee_code,first_name,last_name,created_by)
select emp,w,'E-993690','Timeoff','Decision',actor from td_state;
insert into public.schedule_time_off_requests(id,workspace_id,employee_id,location_id,reason,created_by)
select request,w,emp,loc,'Partial decision test',actor from td_state
union all select 'af970000-0000-4000-8000-000000000002',w,emp,loc,'Another request',actor from td_state;
insert into public.schedule_time_off_segments(id,workspace_id,request_id,segment_date,start_time,end_time)
select first_segment,w,request,current_date+3000,'10:00'::time,'14:00'::time from td_state
union all select second_segment,w,request,current_date+3001,null,null from td_state
union all select 'af980000-0000-4000-8000-000000000003',w,'af970000-0000-4000-8000-000000000002',current_date+3002,null,null from td_state;
create function pg_temp.td_decide(decisions jsonb) returns jsonb language sql as $$
 select public.resolve_schedule_time_off_request_service(actor,w,request,1,'partial_approve','Manager explained the approved periods.',decisions) from td_state;
$$;
select throws_ok($$select pg_temp.td_decide(jsonb_build_array(jsonb_build_object('segment_id',first_segment,'status','approved'),jsonb_build_object('segment_id',first_segment,'status','approved'))) from td_state$$,'22023',null,'repeating one ID cannot stand in for an omitted period');
select throws_ok($$select pg_temp.td_decide(jsonb_build_array(jsonb_build_object('segment_id',first_segment,'status','approved'),jsonb_build_object('segment_id',upper(first_segment::text),'status','denied'))) from td_state$$,'22023',null,'UUID spelling and contradictory statuses cannot bypass uniqueness');
select is((select revision from public.schedule_time_off_requests where id=(select request from td_state)),1,'rejected duplicate leaves the request revision unchanged');
select is((select count(*)::integer from public.schedule_time_off_segments where request_id=(select request from td_state) and status='pending'),2,'rejected duplicate does not update any requested period');
select is((select count(*)::integer from public.schedule_time_off_events where request_id=(select request from td_state)),0,'rejected decision leaves no false audit event');
select throws_ok($$select pg_temp.td_decide(jsonb_build_array(jsonb_build_object('segment_id',first_segment,'status','approved'))) from td_state$$,'22023',null,'missing period is rejected');
select throws_ok($$select pg_temp.td_decide(jsonb_build_array(jsonb_build_object('segment_id',first_segment,'status','approved'),jsonb_build_object('segment_id','af980000-0000-4000-8000-000000000003','status','denied'))) from td_state$$,'22023',null,'a period from another request cannot replace the missing period');
select throws_ok($$select pg_temp.td_decide('{}')$$,'22023',null,'decision payload must be an array');
select throws_ok($$select pg_temp.td_decide('[{}]')$$,'22023',null,'each decision must identify its period and outcome');
select throws_ok($$select pg_temp.td_decide(jsonb_build_array(jsonb_build_object('segment_id',first_segment,'status','pending'),jsonb_build_object('segment_id',second_segment,'status','denied'))) from td_state$$,'22023',null,'a decision cannot leave a requested period pending');
select is(pg_temp.td_decide(jsonb_build_array(jsonb_build_object('segment_id',first_segment,'status','approved'),jsonb_build_object('segment_id',second_segment,'status','denied')))->>'status','partially_approved','one valid decision per period produces a partial result') from td_state;
select is((select status::text from public.schedule_time_off_segments where id=(select first_segment from td_state)),'approved','requested hours are approved');
select is((select status::text from public.schedule_time_off_segments where id=(select second_segment from td_state)),'denied','the other requested day is denied');
select is((select count(*)::integer from public.schedule_time_off_events where request_id=(select request from td_state)),1,'successful atomic decision has one audit event');
select throws_ok($$select public.resolve_schedule_time_off_request_service(actor,w,request,1,'return_to_pending') from td_state$$,'40001','stale time off request','existing revision protection remains intact');
select * from finish();
rollback;

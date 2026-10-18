begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- FB-6.3.7: a request names no location. Its hours are read in the time zone of
-- the person's primary location (New York here) and frozen; the request is one
-- run of days in a row; a decision is the whole request.
create temp table tp_state as select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'::uuid w,
 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'::uuid manager,
 'af990000-0000-4000-8000-000000000001'::uuid actor,
 'af990000-0000-4000-8000-000000000002'::uuid emp,
 'af990000-0000-4000-8000-000000000003'::uuid loc,
 'af990000-0000-4000-8000-000000000004'::uuid other_loc,
 'af990000-0000-4000-8000-000000000005'::uuid op,
 null::uuid request,null::uuid segment,null::jsonb result;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select actor,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','timeoff-periods@example.test','','{}','{}',now(),now() from tp_state;
insert into public.workspace_memberships (workspace_id, user_id, status, role_id, employee_role_id)
select legacy.workspace_id::uuid, legacy.user_id::uuid, legacy.status::text::public.membership_status, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (select w,actor,'employee','active',true from tp_state) as legacy(workspace_id, user_id, role, status, all_locations);
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
select emp,w,actor,'E-994800','Period','Tester',manager from tp_state;
insert into public.locations(short_name, id,workspace_id,name,timezone,street_address,city,region,postal_code)
select 'T00046', loc,w,'Time off New York','America/New_York','1 Test St','New York','NY','10001' from tp_state
union all select 'T00047', other_loc,w,'Time off UTC','UTC','2 Test St','New York','NY','10001' from tp_state;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,is_primary,created_by)
select w,emp,loc,true,manager from tp_state union all select w,emp,other_loc,false,manager from tp_state;
create function pg_temp.tp_period(d date,s text default null,e text default null,n boolean default false) returns jsonb language sql as $$
 select jsonb_build_object('segment_date',d,'start_time',s,'end_time',e,'ends_next_day',n);
$$;
-- The form sends the time zone it showed: the primary location's, as it is now.
create function pg_temp.tp_submit(p jsonb,operation uuid default gen_random_uuid(),zone text default null) returns jsonb language sql as $$
 select public.submit_time_off_service(actor,w,p,'Requested hours',
  coalesce(zone,(select timezone from public.locations where id=loc)),operation) from tp_state;
$$;
create function pg_temp.tp_decide(rid uuid,verdict text) returns jsonb language sql as $$
 select public.decide_time_off_service(manager,w,rid,verdict,'',app_private.time_off_impact(w,rid)->>'fingerprint') from tp_state;
$$;

select throws_ok($$select pg_temp.tp_submit('{}')$$,'22023',null,'periods must be an array');
select throws_ok($$select pg_temp.tp_submit('[]')$$,'22023',null,'empty requests are rejected');
select throws_ok($$select pg_temp.tp_submit(jsonb_build_array(pg_temp.tp_period('2035-01-15','09:00',null)))$$,'22023',null,'half a clock range is rejected');
select throws_ok($$select pg_temp.tp_submit(jsonb_build_array(pg_temp.tp_period('2035-01-15','17:00','09:00')))$$,'22023',null,'overnight must be explicitly selected');
select throws_ok($$select pg_temp.tp_submit(jsonb_build_array(pg_temp.tp_period('2035-01-15','09:00','17:00',true)))$$,'22023',null,'one period cannot silently run more than a calendar day');
select throws_ok($$select pg_temp.tp_submit(jsonb_build_array(pg_temp.tp_period('2035-01-15','09:00','12:00'),pg_temp.tp_period('2035-01-15','11:00','13:00')))$$,'22023',null,'overlapping original pieces are rejected');
select throws_ok($$select pg_temp.tp_submit(jsonb_build_array(pg_temp.tp_period('2035-01-15'),pg_temp.tp_period('2035-01-15')))$$,'22023',null,'duplicate full days are rejected');
select throws_ok($$select pg_temp.tp_submit(jsonb_build_array(pg_temp.tp_period(current_date-2)))$$,'22023',null,'past dates are checked in the location time zone');
select throws_ok($$select pg_temp.tp_submit(jsonb_build_array(pg_temp.tp_period('2035-01-15')),gen_random_uuid(),'UTC')$$,'PT409',null,'hours shown in another time zone than the primary location''s are refused');

update tp_state set result=pg_temp.tp_submit(jsonb_build_array(pg_temp.tp_period('2035-01-15','09:00','12:00')),op);
update tp_state set request=(result->>'request_id')::uuid;
update tp_state set segment=(select id from public.schedule_time_off_segments where request_id=tp_state.request);
select is(result->>'status','pending','hourly request is pending before a manager decision') from tp_state;
select is((select starts_at from public.schedule_time_off_segments where id=(select segment from tp_state)),'2035-01-15 14:00Z'::timestamptz,'original start is saved as a physical instant');
select is((select ends_at from public.schedule_time_off_segments where id=(select segment from tp_state)),'2035-01-15 17:00Z'::timestamptz,'original end is saved as a physical instant');
select is((select time_timezone from public.schedule_time_off_segments where id=(select segment from tp_state)),'America/New_York','the primary location''s time zone is snapshotted');
select is(pg_temp.tp_submit(jsonb_build_array(pg_temp.tp_period('2035-01-15','09:00','12:00')),op),result,'uncertain network retries return the same result') from tp_state;
select is((select count(*)::int from public.schedule_time_off_events where request_id=(select request from tp_state)),1,'retry emits no duplicate request event');
select throws_ok($$select pg_temp.tp_submit(jsonb_build_array(pg_temp.tp_period('2035-01-15','09:00','13:00')),op) from tp_state$$,'PT409',null,'a request key cannot be reused for changed hours');
select throws_ok($$select pg_temp.tp_submit(jsonb_build_array(pg_temp.tp_period('2035-01-15','11:00','12:00'))) from tp_state$$,'23514','overlapping time off request exists','overlapping a waiting request is refused');
select lives_ok($$select pg_temp.tp_submit(jsonb_build_array(pg_temp.tp_period('2035-01-15','12:00','13:00'))) from tp_state$$,'23514 is not raised for touching half-open boundaries');
select throws_ok($$update public.schedule_time_off_segments set start_time='10:00' where id=(select segment from tp_state)$$,'55000',null,'a decision cannot rewrite original requested clocks');
select throws_ok($$delete from public.schedule_time_off_segments where id=(select segment from tp_state)$$,'55000',null,'original periods cannot be deleted');
select throws_ok($$update public.schedule_time_off_requests set reason='Changed original' where id=(select request from tp_state)$$,'55000',null,'original request identity and note are retained');
select throws_ok($$update public.schedule_time_off_segments set starts_at='2035-01-15 15:00Z' where id=(select segment from tp_state)$$,'55000',null,'physical snapshots cannot be rewritten');

select lives_ok($$select pg_temp.tp_decide(request,'approve') from tp_state$$,'approving the request keeps the original snapshot');
update public.locations set timezone='UTC' where id=(select loc from tp_state);
select throws_ok($$select pg_temp.tp_submit(jsonb_build_array(pg_temp.tp_period('2035-01-16','09:00','12:00')),gen_random_uuid(),'America/New_York') from tp_state$$,'PT409',null,'a changed location time zone cannot silently reinterpret a new request');
select is(pg_temp.tp_submit(jsonb_build_array(pg_temp.tp_period('2035-01-15','09:00','12:00')),op,'America/New_York'),result,'replaying an accepted command remains safe after a location edit') from tp_state;
select is(public.time_off_period_span(segment),tstzrange('2035-01-15 14:00Z','2035-01-15 17:00Z','[)'),'later location edits cannot move saved leave') from tp_state;
select is(public.assess_weekly_shift_availability(w,emp,jsonb_build_object('location_id',other_loc,'scheduled_date','2035-01-15','time_basis','explicit','time_timezone','UTC','start_time','15:00','end_time','16:00'))->>'operation','blocked','canonical assessment blocks the snapshotted interval across locations') from tp_state;
select is(jsonb_array_length(public.assess_weekly_shift_availability(w,emp,jsonb_build_object('location_id',other_loc,'scheduled_date','2035-01-15','time_basis','explicit','time_timezone','UTC','start_time','09:00','end_time','10:00'))->'leave'),0,'canonical leave does not slide to changed location wall clocks') from tp_state;
select is(public.time_off_request_periods(request,w)->0->>'time_timezone','America/New_York','read projection retains the original time zone') from tp_state;
select is((select item->'periods'->0->>'time_timezone' from tp_state t cross join lateral jsonb_array_elements(public.get_employee_hub_service(t.actor,t.w,'2035-01-01','2035-01-31')->'requests') item where item->>'id'=t.request::text),'America/New_York','employee reads the same original period');
select is((select item->'segments'->0->>'time_timezone' from tp_state t cross join lateral jsonb_array_elements(public.get_schedule_requests_service(t.manager,t.w,'closed')->'time_off_requests') item where item->>'id'=t.request::text),'America/New_York','manager reads the same original period');

select lives_ok($$select pg_temp.tp_submit(jsonb_build_array(pg_temp.tp_period('2035-01-18','23:00','02:00',true)))$$,'explicit overnight request is supported');
select lives_ok($$select pg_temp.tp_submit(jsonb_build_array(pg_temp.tp_period('2035-01-20','10:00','10:00',true)))$$,'equal clocks are valid only with an explicit next-day end');
select lives_ok($$select pg_temp.tp_submit(jsonb_build_array(pg_temp.tp_period('2035-01-23','20:00','24:00')))$$,'end-of-day 24:00 retains its calendar boundary');
select throws_ok($$select public.time_off_resolve_period(pg_temp.tp_period('2026-03-08','02:30','04:00'),'America/New_York')$$,'22023',null,'nonexistent spring-forward clocks fail closed');
select throws_ok($$select public.time_off_resolve_period(pg_temp.tp_period('2026-11-01','01:30','03:00'),'America/New_York')$$,'22023',null,'a repeated clock requires an explicit occurrence');
select is(public.time_off_resolve_period(pg_temp.tp_period('2026-11-01','01:30','03:00')||'{"start_fold":"earlier"}','America/New_York')->>'starts_at','2026-11-01T05:30:00+00:00','first occurrence resolves to its own UTC instant');
select is(public.time_off_resolve_period(pg_temp.tp_period('2026-11-01','01:30','03:00')||'{"start_fold":"later"}','America/New_York')->>'starts_at','2026-11-01T06:30:00+00:00','second occurrence resolves to a different UTC instant');
select is((extract(epoch from ((public.time_off_resolve_period(pg_temp.tp_period('2026-03-08'),'America/New_York')->>'ends_at')::timestamptz-(public.time_off_resolve_period(pg_temp.tp_period('2026-03-08'),'America/New_York')->>'starts_at')::timestamptz))/3600)::int,23,'spring full day is 23 physical hours');
select is((extract(epoch from ((public.time_off_resolve_period(pg_temp.tp_period('2026-11-01'),'America/New_York')->>'ends_at')::timestamptz-(public.time_off_resolve_period(pg_temp.tp_period('2026-11-01'),'America/New_York')->>'starts_at')::timestamptz))/3600)::int,25,'fall full day includes both repeated clock occurrences');

-- An approved day still holds its hours; a denied day frees them.
select pg_temp.tp_decide((pg_temp.tp_submit(jsonb_build_array(pg_temp.tp_period('2035-02-01')))->>'request_id')::uuid,'approve');
select pg_temp.tp_decide((pg_temp.tp_submit(jsonb_build_array(pg_temp.tp_period('2035-02-02')))->>'request_id')::uuid,'deny');
select lives_ok($$select pg_temp.tp_submit(jsonb_build_array(pg_temp.tp_period('2035-02-02','10:00','12:00')))$$,'denied leave does not prevent a new request');
select throws_ok($$select pg_temp.tp_submit(jsonb_build_array(pg_temp.tp_period('2035-02-01','10:00','12:00')))$$,'23514','overlapping time off request exists','approved leave still prevents a duplicate request');

-- One request is one run of days in a row; each day may still be a full day,
-- hours, or an overnight piece.
select throws_ok($$select pg_temp.tp_submit(jsonb_build_array(pg_temp.tp_period('2035-04-01'),pg_temp.tp_period('2035-04-03')))$$,'22023',null,'a request that skips a date is refused');
update tp_state set result=pg_temp.tp_submit(jsonb_build_array(pg_temp.tp_period('2035-04-01'),pg_temp.tp_period('2035-04-02','10:00','14:00'),pg_temp.tp_period('2035-04-03','23:00','02:00',true)));
update tp_state set request=(result->>'request_id')::uuid;
select is((select count(*)::integer from public.schedule_time_off_segments where request_id=(select request from tp_state)),3,'mixed per-date request stores its three requested pieces');
select is((select start_time::text||'/'||end_time::text from public.schedule_time_off_segments where request_id=(select request from tp_state) and segment_date='2035-04-02'),'10:00:00/14:00:00','custom hours are not replaced by another date or default hours');
select is((select public.time_off_period_span(id) from public.schedule_time_off_segments where request_id=(select request from tp_state) and segment_date='2035-04-03'),tstzrange('2035-04-03 23:00Z','2035-04-04 02:00Z','[)'),'per-date overnight keeps the following-day physical boundary');
select lives_ok($$select pg_temp.tp_decide(request,'deny') from tp_state$$,'the manager declines the whole request');
select is((select p->>'start_time' from tp_state,jsonb_array_elements(public.time_off_request_periods(request,w)) p where p->>'segment_date'='2035-04-02'),'10:00:00','a declined request retains its originally requested hours');

set local role authenticated;
select throws_ok($$select * from public.time_off_commands$$,'42501',null,'idempotency results are private');
select throws_ok($$select public.submit_time_off_service(null,null,'[]','',null,gen_random_uuid())$$,'42501',null,'employee cannot forge service actor arguments directly');
reset role;
select ok(not has_function_privilege('service_role','public.time_off_request_periods(uuid,uuid)','execute'),'private read helper cannot be used to bypass scoped read services');
select * from finish();
rollback;

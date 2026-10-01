begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table tc as select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'::uuid w,
 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'::uuid manager,'af9c0000-0000-4000-8000-000000000001'::uuid actor,
 'af9c0000-0000-4000-8000-000000000002'::uuid emp,'af9c0000-0000-4000-8000-000000000003'::uuid loc,
 gen_random_uuid() op,null::uuid parent,null::uuid segment,null::uuid cancellation,null::jsonb periods,null::jsonb result,null::jsonb original,
 (select jsonb_agg(to_jsonb(ps) order by ps.id) from public.schedule_published_shifts ps) published;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select actor,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','timeoff-cancel@example.test','','{}','{}',now(),now() from tc;
insert into public.workspace_memberships(workspace_id,user_id,role,status,all_locations) select w,actor,'employee','active',true from tc;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
select emp,w,actor,'E-994900','Cancel','Tester',manager from tc;
insert into public.locations(short_name, id,workspace_id,name,timezone,street_address,city,region,postal_code)
select 'T00042', loc,w,'Cancellation New York','America/New_York','1 Test St','New York','NY','10001' from tc;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by) select w,emp,loc,manager from tc;
-- A second employee at the same place, owned by this test rather than the seed:
-- somebody else's leave is refused the same way wherever the suite runs.
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('af9c0000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','timeoff-cancel-other@example.test','','{}','{}',now(),now());
insert into public.workspace_memberships(workspace_id,user_id,role,status,all_locations) select w,'af9c0000-0000-4000-8000-000000000004','employee','active',true from tc;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
select 'af9c0000-0000-4000-8000-000000000005',w,'af9c0000-0000-4000-8000-000000000004','E-994901','Other','Tester',manager from tc;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by) select w,'af9c0000-0000-4000-8000-000000000005',loc,manager from tc;
-- What a call answers: 'allowed', or the error code and its authz hint.
create function pg_temp.refusal(q text) returns text language plpgsql as $$
declare h text;
begin
  execute q;
  return 'allowed';
exception when others then
  get stacked diagnostics h = pg_exception_hint;
  return sqlstate || coalesce(' ' || nullif(h, ''), '');
end $$;
create function pg_temp.tc_new(d date,s text,e text) returns uuid language plpgsql as $$
declare t tc%rowtype; result jsonb; begin select * into t from tc;
 result:=public.submit_time_off_service(t.actor,t.w,jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('segment_date',d,'start_time',s,'end_time',e))),'Original leave',(select timezone from public.locations where id=t.loc),gen_random_uuid());
 perform public.decide_time_off_service(t.manager,t.w,(result->>'request_id')::uuid,'approve','',app_private.time_off_impact(t.w,(result->>'request_id')::uuid)->>'fingerprint');
 return (result->>'request_id')::uuid; end $$;
create function pg_temp.tc_cancel(p jsonb default null,key uuid default gen_random_uuid()) returns jsonb language sql as $$
 select public.request_time_off_cancellation_service(actor,w,parent,(select revision from public.schedule_time_off_requests where id=tc.parent),coalesce(p,periods),'Plans changed',key) from tc;
$$;
create function pg_temp.tc_decide(action text) returns jsonb language sql as $$
 select public.decide_time_off_service(manager,w,cancellation,action,'Cancellation reviewed',app_private.time_off_impact(w,cancellation)->>'fingerprint') from tc;
$$;
update tc set parent=pg_temp.tc_new('2035-01-15','09:00','17:00');
update tc set segment=(select id from public.schedule_time_off_segments where request_id=tc.parent);
update tc set original=(select to_jsonb(s) from public.schedule_time_off_segments s where id=tc.segment),periods=jsonb_build_array(jsonb_build_object('segment_id',segment,'starts_at','2035-01-15T15:00:00Z','ends_at','2035-01-15T19:00:00Z'));
select throws_ok($$select public.employee_request_action_service(actor,w,parent,'time_off','cancel',2) from tc$$,'40001',null,'old cancel action cannot remove approved leave');
-- The seeded owner is filed as an employee (BL-080), so this call now reaches the
-- request lookup and answers P0002 like any employee naming somebody else's
-- leave; the no-contract answer for that is 42501 + authz.out_of_scope.
select throws_ok($$select public.request_time_off_cancellation_service(manager,w,parent,2,periods,'',op) from tc$$,'42501',null,'manager cannot submit a cancellation as another employee');
select is(pg_temp.refusal($$select public.request_time_off_cancellation_service('af9c0000-0000-4000-8000-000000000004',w,parent,2,periods,'',op) from tc$$),'42501 authz.out_of_scope','another employee cannot cancel somebody else''s leave');
select throws_ok($$select public.request_time_off_cancellation_service(actor,gen_random_uuid(),parent,2,periods,'',op) from tc$$,'42501',null,'workspace ownership is enforced');
select throws_ok($$select public.request_time_off_cancellation_service(actor,w,parent,1,periods,'',op) from tc$$,'40001',null,'cancellation requires current parent revision');
select throws_ok($$select pg_temp.tc_cancel('[]')$$,'22023',null,'empty cancellation rejected');
select throws_ok($$select pg_temp.tc_cancel(jsonb_build_array(jsonb_build_object('segment_id',gen_random_uuid(),'starts_at','2035-01-15T15:00:00Z','ends_at','2035-01-15T19:00:00Z')))$$,'22023',null,'unrelated parent segment rejected');
select throws_ok($$select pg_temp.tc_cancel(jsonb_set(periods,'{0,ends_at}','"2035-01-15T23:00:00Z"')) from tc$$,'22023',null,'cancellation cannot include unapproved hours');
select throws_ok($$select pg_temp.tc_cancel(periods||periods) from tc$$,'22023',null,'duplicate cancellation periods rejected');
select is((select count(*)::int from public.time_off_cancellation_links where workspace_id=(select w from tc)),0,'failed submission leaves no orphan cancellation');
update tc set result=pg_temp.tc_cancel(periods,op);
update tc set cancellation=(result->>'request_id')::uuid;
select is(result->>'status','pending','cancellation waits for manager review') from tc;
select is((select payload->>'title' from public.notification_outbox where subject_id=(select cancellation::text from tc) and type_key='requests.time_off.submitted'),'Leave cancellation requested','reviewer notification distinguishes cancellation from new leave');
select is(public.time_off_effective_ranges(segment),'{["2035-01-15 14:00Z","2035-01-15 22:00Z")}'::tstzmultirange,'pending cancellation leaves all approved leave effective') from tc;
select is((select revision from public.schedule_time_off_requests where id=(select parent from tc)),2,'requesting cancellation does not revise the approved decision');
select is(pg_temp.tc_cancel(periods,op),result,'identical submit retry returns original cancellation') from tc;
select throws_ok($$select pg_temp.tc_cancel(jsonb_set(periods,'{0,ends_at}','"2035-01-15T18:00:00Z"'),op) from tc$$,'40001',null,'operation key cannot change requested cancellation');
select throws_ok($$select pg_temp.tc_cancel()$$,'23514',null,'only one cancellation can be pending for a leave request');
select is(public.time_off_cancellation_context(w,parent)->>'pending_request_id',cancellation::text,'read model links parent to its pending cancellation') from tc;
select is(public.time_off_cancellation_context(w,cancellation)->>'parent_request_id',parent::text,'read model identifies original approved leave') from tc;
select is(public.time_off_cancellation_context(w,parent)->>'can_request','false','UI cannot submit a second pending cancellation') from tc;
select is(jsonb_array_length(public.assess_weekly_shift_availability(w,emp,jsonb_build_object('location_id',loc,'scheduled_date','2035-01-15','time_basis','explicit','time_timezone','UTC','start_time','16:00','end_time','18:00'))->'leave'),1,'pending cancellation still blocks conflicting scheduling') from tc;
select throws_ok($$select public.decide_time_off_service(actor,w,cancellation,'approve','',null) from tc$$,'42501',null,'employee cannot approve their cancellation');
savepoint withdrawn;
select lives_ok($$select public.employee_request_action_service(actor,w,cancellation,'time_off','cancel',1) from tc$$,'employee can withdraw a pending cancellation');
select is(public.time_off_effective_ranges(segment),'{["2035-01-15 14:00Z","2035-01-15 22:00Z")}'::tstzmultirange,'withdrawal preserves approved leave') from tc;
select is(public.time_off_cancellation_context(w,parent)->>'can_request','true','withdrawal permits a fresh cancellation') from tc;
rollback to savepoint withdrawn;
savepoint denied;
select lives_ok($$select pg_temp.tc_decide('deny')$$,'manager can decline cancellation');
select is(public.time_off_effective_ranges(segment),'{["2035-01-15 14:00Z","2035-01-15 22:00Z")}'::tstzmultirange,'declined cancellation preserves approved leave') from tc;
select is((select revision from public.schedule_time_off_requests where id=(select parent from tc)),2,'declining cancellation does not change parent revision');
rollback to savepoint denied;
savepoint revoked_parent;
select lives_ok($$select public.revoke_time_off_service(manager,w,parent,2,'Leave revoked') from tc$$,'manager can revoke original leave while cancellation is pending');
select is((select status::text from public.schedule_time_off_requests where id=(select cancellation from tc)),'revoked','parent revoke closes obsolete pending cancellation');
select throws_ok($$select pg_temp.tc_decide('approve')$$,'40001',null,'obsolete cancellation cannot apply after original leave changes');
rollback to savepoint revoked_parent;
-- Location settings changing later cannot reinterpret the snapshotted hours.
update public.locations set timezone='UTC' where id=(select loc from tc);
-- FB-6.3.7: a cancellation is decided whole (no partial decision).
update tc set result=pg_temp.tc_decide('approve');
select is(result->>'status','approved','the manager approves the cancellation') from tc;
select is((select payload->>'action_url' from public.notification_outbox where subject_id=(select cancellation::text from tc) and type_key='requests.time_off.status_changed'),'/app/employee-hub/my-availability#request-'||cancellation::text,'employee notification targets the reviewed cancellation') from tc;
select is(public.time_off_effective_ranges(segment),'{["2035-01-15 14:00Z","2035-01-15 15:00Z"),["2035-01-15 19:00Z","2035-01-15 22:00Z")}'::tstzmultirange,'only the cancelled hours are removed from leave') from tc;
select is((select to_jsonb(s) from public.schedule_time_off_segments s where id=(select segment from tc)),original,'original requested period and status remain immutable') from tc;
select is((select revision from public.schedule_time_off_requests where id=(select parent from tc)),3,'accepted cancellation revises parent to reject stale decisions');
select is((public.time_off_request_periods(parent,w)->0->'cancelled_intervals'->0->>'start_at')::timestamptz,'2035-01-15T15:00:00Z'::timestamptz,'read model exposes exact cancelled hours') from tc;
select is(jsonb_array_length(public.time_off_request_periods(parent,w)->0->'effective_intervals'),2,'read model exposes both remaining approved pieces') from tc;
select is(jsonb_array_length(public.assess_weekly_shift_availability(w,emp,jsonb_build_object('location_id',loc,'scheduled_date','2035-01-15','time_basis','explicit','time_timezone','UTC','start_time','16:00','end_time','18:00'))->'leave'),0,'accepted cancellation removes the hard leave conflict only for cancelled hours') from tc;
select is(jsonb_array_length(public.assess_weekly_shift_availability(w,emp,jsonb_build_object('location_id',loc,'scheduled_date','2035-01-15','time_basis','explicit','time_timezone','UTC','start_time','19:00','end_time','20:00'))->'leave'),1,'hours outside the cancellation remain leave') from tc;
savepoint later_request;
select lives_ok($$select public.submit_time_off_service(actor,w,'[{"segment_date":"2035-01-15","start_time":"16:00","end_time":"18:00"}]','New request after cancellation','UTC',gen_random_uuid()) from tc$$,'cancelled hours can be requested again without resurrecting the old leave');
rollback to savepoint later_request;
select is(pg_temp.refusal($$select public.revoke_time_off_service(manager,w,cancellation,2,'Reverse it') from tc$$),'42501 authz.out_of_scope','a completed cancellation is not leave that can be revoked');
select throws_ok($$select public.revoke_time_off_service(manager,w,parent,2,'Stale screen') from tc$$,'40001',null,'stale parent manager decision rejected');
select throws_ok($$update public.time_off_cancellation_links set parent_revision=1 where request_id=(select cancellation from tc)$$,'55000',null,'cancellation origin cannot be changed');
select throws_ok($$delete from public.time_off_cancellation_periods where request_id=(select cancellation from tc)$$,'55000',null,'cancellation period history cannot be erased');
select is((select jsonb_agg(to_jsonb(ps) order by ps.id) from public.schedule_published_shifts ps),published,'cancellation does not reassign any published shift') from tc;
select is((select item->'cancellation'->>'parent_request_id' from tc t cross join lateral jsonb_array_elements(public.get_employee_hub_service(actor,w,'2035-01-14','2035-01-17')->'requests') item where item->>'id'=t.cancellation::text),parent::text,'employee reads the cancellation and its original leave') from tc;
select is((select item->'cancellation'->>'parent_request_id' from tc t cross join lateral jsonb_array_elements(public.get_schedule_requests_service(manager,w,'closed')->'time_off_requests') item where item->>'id'=t.cancellation::text),parent::text,'manager reads the same cancellation origin') from tc;
-- A new request may cancel remaining approved hours, using the old snapshot zone.
update tc set periods=(select jsonb_agg(jsonb_build_object('segment_id',tc.segment,'starts_at',lower(span),'ends_at',upper(span))) from unnest(public.time_off_effective_ranges(tc.segment)) p(span)),op=gen_random_uuid();
update tc set result=pg_temp.tc_cancel(periods,op);
update tc set cancellation=(result->>'request_id')::uuid;
select is((select min(time_timezone) from public.schedule_time_off_segments where request_id=(select cancellation from tc)),'America/New_York','cancellation keeps original time zone after location settings change');
update tc set result=pg_temp.tc_decide('approve');
select is(public.time_off_effective_ranges(segment),'{}'::tstzmultirange,'approving remaining cancellation removes all approved leave') from tc;
select is((select status::text from public.schedule_time_off_requests where id=(select parent from tc)),'revoked','fully cancelled parent no longer appears as approved leave');
select is(public.request_time_off_cancellation_service(actor,w,parent,3,periods,'Plans changed',op)->>'request_id',cancellation::text,'submit retry remains idempotent after the cancellation is decided') from tc;
select is((select jsonb_agg(to_jsonb(ps) order by ps.id) from public.schedule_published_shifts ps),published,'full cancellation leaves published assignments unchanged') from tc;
-- Two physically different repeated clocks must coexist as cancellation periods.
update public.locations set timezone='America/New_York' where id=(select loc from tc);
update tc set parent=pg_temp.tc_new('2035-11-04',null,null);
update tc set segment=(select id from public.schedule_time_off_segments where request_id=tc.parent);
update tc set periods=jsonb_build_array(
 jsonb_build_object('segment_id',segment,'starts_at','2035-11-04T01:00:00-04:00','ends_at','2035-11-04T01:30:00-04:00'),
 jsonb_build_object('segment_id',segment,'starts_at','2035-11-04T01:00:00-05:00','ends_at','2035-11-04T01:30:00-05:00'));
update tc set result=pg_temp.tc_cancel(); update tc set cancellation=(result->>'request_id')::uuid;
select is((select count(*)::int from public.schedule_time_off_segments where request_id=(select cancellation from tc)),2,'both occurrences of repeated clock ranges are preserved');
select lives_ok($$select pg_temp.tc_decide('approve')$$,'manager can approve cancellation across both DST occurrences');
select is((select sum(extract(epoch from upper(span)-lower(span)))::int from tc cross join lateral unnest(public.time_off_cancelled_ranges(segment)) p(span)),3600,'DST cancellation removes exactly one physical hour');
-- Historical approved leave may already be in progress. Only its future subset
-- is eligible for a new cancellation; the original past hours stay immutable.
update public.locations set timezone='UTC' where id=(select loc from tc);
update tc set parent=gen_random_uuid(),segment=gen_random_uuid();
insert into public.schedule_time_off_requests(id,workspace_id,employee_id,request_type,reason,created_by,status,revision)
select parent,w,emp,'time_off','Already in progress',actor,'pending',1 from tc;
insert into public.schedule_time_off_segments(id,workspace_id,request_id,segment_date,start_time,end_time,time_timezone,starts_at,ends_at,ends_next_day,status)
select segment,w,parent,(a at time zone 'UTC')::date,(a at time zone 'UTC')::time,(b at time zone 'UTC')::time,'UTC',a,b,
 (b at time zone 'UTC')::date>(a at time zone 'UTC')::date,'pending'
from tc cross join lateral(select date_trunc('second',now())-interval '2 hours' a,date_trunc('second',now())+interval '3 hours' b) bounds;
select public.decide_time_off_service(manager,w,parent,'approve','',app_private.time_off_impact(w,parent)->>'fingerprint') from tc;
update tc set original=(select to_jsonb(s) from public.schedule_time_off_segments s where id=tc.segment),periods=jsonb_build_array(jsonb_build_object('segment_id',segment,
 'starts_at',date_trunc('second',now())+interval '1 hour','ends_at',date_trunc('second',now())+interval '2 hours'));
select is(public.time_off_cancellation_context(w,parent)->>'can_request','true','started leave with future remaining hours offers cancellation') from tc;
select is((select item->'cancellation'->>'can_request' from tc t cross join lateral jsonb_array_elements(public.get_employee_hub_service(actor,w,current_date-1,current_date+1)->'requests') item where item->>'id'=t.parent::text),'true','employee Hub exposes the same started-leave eligibility') from tc;
select throws_ok($$select pg_temp.tc_cancel(jsonb_set(periods,'{0,starts_at}',to_jsonb(now()-interval '1 hour'))) from tc$$,'22023',null,'hours already taken cannot be cancelled');
update tc set result=pg_temp.tc_cancel(); update tc set cancellation=(result->>'request_id')::uuid;
select is(result->>'status','pending','future subset of a started leave waits for manager approval') from tc;
select is(public.time_off_effective_ranges(segment),tstzmultirange(public.time_off_period_span(segment)),'pending subset keeps all past and future approved hours') from tc;
select lives_ok($$select pg_temp.tc_decide('approve')$$,'manager can accept only the requested future subset');
select is(public.time_off_effective_ranges(segment),tstzmultirange(public.time_off_period_span(segment))-tstzmultirange(tstzrange((periods->0->>'starts_at')::timestamptz,(periods->0->>'ends_at')::timestamptz,'[)')),'approval retains past hours and both unrequested portions') from tc;
select is((select to_jsonb(s) from public.schedule_time_off_segments s where id=(select segment from tc)),original,'future-subset cancellation never rewrites original leave hours') from tc;
select is((select jsonb_agg(to_jsonb(ps) order by ps.id) from public.schedule_published_shifts ps),published,'started-leave cancellation does not restore a published shift') from tc;
-- Entirely elapsed approved leave has no new cancellable future hours.
update tc set parent=gen_random_uuid(),segment=gen_random_uuid();
insert into public.schedule_time_off_requests(id,workspace_id,employee_id,request_type,reason,created_by,status,revision)
select parent,w,emp,'time_off','Elapsed leave',actor,'pending',1 from tc;
insert into public.schedule_time_off_segments(id,workspace_id,request_id,segment_date,start_time,end_time,time_timezone,starts_at,ends_at,ends_next_day,status)
select segment,w,parent,(a at time zone 'UTC')::date,(a at time zone 'UTC')::time,(b at time zone 'UTC')::time,'UTC',a,b,
 (b at time zone 'UTC')::date>(a at time zone 'UTC')::date,'pending'
from tc cross join lateral(select date_trunc('second',now())-interval '5 hours' a,date_trunc('second',now())-interval '4 hours' b) bounds;
select public.decide_time_off_service(manager,w,parent,'approve','',app_private.time_off_impact(w,parent)->>'fingerprint') from tc;
select is(public.time_off_cancellation_context(w,parent)->>'can_request','false','fully elapsed leave remains ineligible for cancellation') from tc;
set local role authenticated;
select throws_ok($$select * from public.time_off_cancellation_links$$,'42501',null,'raw cancellation origin is private');
select throws_ok($$select public.request_time_off_cancellation_service(null,null,null,1,'[]','',null)$$,'42501',null,'client cannot impersonate cancellation actor');
reset role;
select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table tpd as select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'::uuid w,
 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'::uuid manager,
 'af9a0000-0000-4000-8000-000000000001'::uuid actor,
 'af9a0000-0000-4000-8000-000000000002'::uuid emp,
 'af9a0000-0000-4000-8000-000000000003'::uuid loc,
 gen_random_uuid() op, null::uuid request, null::uuid segment, null::jsonb result,
 (select md5(coalesce(jsonb_agg(to_jsonb(ps) order by ps.id)::text,'')) from public.schedule_published_shifts ps) published_digest;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select actor,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','timeoff-pieces@example.test','','{}','{}',now(),now() from tpd;
insert into public.workspace_memberships(workspace_id,user_id,role,status,all_locations) select w,actor,'employee','active',true from tpd;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
select emp,w,actor,'E-994900','Partial','Tester',manager from tpd;
insert into public.locations(short_name, id,workspace_id,name,timezone,street_address,city,region,postal_code)
select 'T00043', loc,w,'Partial UTC','UTC','1 Test St','New York','NY','10001' from tpd;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by) select w,emp,loc,manager from tpd;
update tpd set result=public.submit_employee_time_off_periods_service(actor,w,loc,'Original request',
 '[{"segment_date":"2035-01-15","start_time":"10:00","end_time":"17:00"}]',gen_random_uuid(),'UTC');
update tpd set request=(result->>'request_id')::uuid;
update tpd set segment=(select id from public.schedule_time_off_segments where request_id=tpd.request);
create function pg_temp.p(a text,b text,s text default 'approved') returns jsonb language sql as $$
 select jsonb_build_object('starts_at',a,'ends_at',b,'status',s);
$$;
create function pg_temp.decide(pieces jsonb,revision integer default 1,operation uuid default gen_random_uuid()) returns jsonb language sql as $$
 select public.resolve_time_off_period_decision_service(manager,w,request,revision,'partial_approve','Appointment hours approved; afternoon declined.',
  jsonb_build_array(jsonb_build_object('segment_id',segment,'pieces',pieces)),operation) from tpd;
$$;
select is(public.time_off_effective_ranges(segment),tstzmultirange(tstzrange('2035-01-15 10:00Z','2035-01-15 17:00Z','[)')),'pending request prevents duplicate requested hours') from tpd;
select is(jsonb_array_length(public.assess_weekly_shift_availability(w,emp,jsonb_build_object('location_id',loc,'scheduled_date','2035-01-15','time_basis','explicit','time_timezone','UTC','start_time','10:00','end_time','11:00'))->'leave'),0,'a pending request supplies no approved leave') from tpd;
select throws_ok($$select pg_temp.decide('[]')$$,'22023',null,'empty pieces rejected');
select throws_ok($$select pg_temp.decide(jsonb_build_array(pg_temp.p('2035-01-15T10:00:00Z','2035-01-15T12:00:00Z')))$$,'22023',null,'omitted remainder rejected');
select throws_ok($$select pg_temp.decide(jsonb_build_array(pg_temp.p('2035-01-15T10:00:00Z','2035-01-15T12:00:00Z'),pg_temp.p('2035-01-15T13:00:00Z','2035-01-15T17:00:00Z','denied')))$$,'22023',null,'gap rejected');
select throws_ok($$select pg_temp.decide(jsonb_build_array(pg_temp.p('2035-01-15T10:00:00Z','2035-01-15T13:00:00Z'),pg_temp.p('2035-01-15T12:00:00Z','2035-01-15T17:00:00Z','denied')))$$,'22023',null,'overlap rejected');
select throws_ok($$select pg_temp.decide(jsonb_build_array(pg_temp.p('2035-01-15T09:00:00Z','2035-01-15T17:00:00Z')))$$,'22023',null,'outside hours rejected');
select throws_ok($$select pg_temp.decide(jsonb_build_array(pg_temp.p('2035-01-15T10:00:00Z','2035-01-15T10:00:00Z')))$$,'22023',null,'zero duration rejected');
select throws_ok($$select pg_temp.decide(jsonb_build_array(pg_temp.p('2035-01-15T17:00:00Z','2035-01-15T10:00:00Z')))$$,'22023',null,'reverse duration rejected');
select throws_ok($$select pg_temp.decide(jsonb_build_array(pg_temp.p('2035-01-15T10:00:00','2035-01-15T17:00:00')))$$,'22023',null,'timezone-free timestamps rejected');
select throws_ok($$select pg_temp.decide(jsonb_build_array(pg_temp.p('2035-01-15T10:00:00Z','2035-01-15T17:00:00Z','pending')))$$,'22023',null,'undecided piece rejected');
select throws_ok($$select pg_temp.decide(jsonb_build_array(pg_temp.p('2035-01-15T10:00:00Z','2035-01-15T17:00:00Z'),pg_temp.p('2035-01-15T10:00:00Z','2035-01-15T17:00:00Z')))$$,'22023',null,'duplicate pieces rejected');
select is((select count(*)::int from public.time_off_decision_pieces),0,'rejected pieces roll back all decision rows');
select is((select revision from public.schedule_time_off_requests where id=(select request from tpd)),1,'rejected pieces do not advance revision');
select is((select count(*)::int from public.schedule_time_off_events where request_id=(select request from tpd)),1,'rejected pieces do not write a decision event');
select throws_ok($$select public.resolve_schedule_time_off_request_service(actor,w,request,1,'approve') from tpd$$,'42501',null,'employee cannot decide own request');
select throws_ok($$select public.resolve_time_off_period_decision_service(manager,gen_random_uuid(),request,1,'approve','','[]',gen_random_uuid()) from tpd$$,'P0002',null,'a different workspace cannot resolve this request');
select throws_ok($$select public.resolve_schedule_time_off_request_service(manager,w,request,null,'approve') from tpd$$,'40001','stale time off request','null revision cannot bypass optimistic concurrency');
-- A manager whose employee profile owns the request also needs another reviewer.
update public.workspace_memberships set role='admin',role_id=(select id from public.workspace_roles where workspace_id=(select w from tpd) and access_class='admin' limit 1) where user_id=(select actor from tpd) and workspace_id=(select w from tpd);
select throws_ok($$select public.resolve_schedule_time_off_request_service(actor,w,request,1,'approve') from tpd$$,'42501','Own time-off decision access denied; another manager must review this request','manager cannot approve their own employee request');
update public.workspace_memberships set role='employee',role_id=(select id from public.workspace_roles where workspace_id=(select w from tpd) and access_class='employee' limit 1) where user_id=(select actor from tpd) and workspace_id=(select w from tpd);
update tpd set result=pg_temp.decide(jsonb_build_array(pg_temp.p('2035-01-15T10:00:00Z','2035-01-15T12:00:00Z'),pg_temp.p('2035-01-15T12:00:00Z','2035-01-15T17:00:00Z','denied')),1,op);
select is(result->>'status','partially_approved','a single requested period can receive a mixed decision') from tpd;
select is(public.time_off_effective_ranges(segment),tstzmultirange(tstzrange('2035-01-15 10:00Z','2035-01-15 12:00Z','[)')),'only approved pieces supply effective leave') from tpd;
select is(public.assess_weekly_shift_availability(w,emp,jsonb_build_object('location_id',loc,'scheduled_date','2035-01-15','time_basis','explicit','time_timezone','UTC','start_time','11:00','end_time','12:00'))->>'operation','blocked','approved piece blocks scheduling') from tpd;
select is(jsonb_array_length(public.assess_weekly_shift_availability(w,emp,jsonb_build_object('location_id',loc,'scheduled_date','2035-01-15','time_basis','explicit','time_timezone','UTC','start_time','12:00','end_time','17:00'))->'leave'),0,'denied piece does not block scheduling') from tpd;
select is((select end_time::text from public.schedule_time_off_segments where id=(select segment from tpd)),'17:00:00','original requested end remains immutable');
select is(jsonb_array_length(public.time_off_request_periods(request,w)->0->'decision_pieces'),2,'read model retains both approved and denied pieces') from tpd;
select is((select item->'decision_events'->0->>'note' from tpd t cross join lateral jsonb_array_elements(public.get_employee_hub_service(t.actor,t.w,'2035-01-01','2035-01-31')->'requests') item where item->>'id'=t.request::text),'Appointment hours approved; afternoon declined.','employee sees the manager decision note');
select is((select item->'segments'->0->'decision_pieces' from tpd t cross join lateral jsonb_array_elements(public.get_schedule_requests_service(t.manager,t.w,'closed')->'time_off_requests') item where item->>'id'=t.request::text),public.time_off_request_periods(request,w)->0->'decision_pieces','manager sees the same decision pieces') from tpd;
select is(pg_temp.decide(jsonb_build_array(pg_temp.p('2035-01-15T10:00:00Z','2035-01-15T12:00:00Z'),pg_temp.p('2035-01-15T12:00:00Z','2035-01-15T17:00:00Z','denied')),1,op),result,'retry returns the original decision result') from tpd;
select is((select count(*)::int from public.time_off_decision_pieces),2,'retry does not duplicate decision pieces');
select throws_ok($$select pg_temp.decide(jsonb_build_array(pg_temp.p('2035-01-15T10:00:00Z','2035-01-15T17:00:00Z')),1,op) from tpd$$,'40001',null,'changed decision cannot reuse a key');
select throws_ok($$update public.time_off_decision_pieces set status='denied'$$,'55000',null,'decision history cannot be rewritten');
select throws_ok($$delete from public.time_off_decision_pieces$$,'55000',null,'decision history cannot be deleted');
select throws_ok($$select public.submit_employee_time_off_periods_service(actor,w,loc,'Duplicate','[{"segment_date":"2035-01-15","start_time":"11:00","end_time":"13:00"}]',gen_random_uuid(),'UTC') from tpd$$,'23514',null,'new request cannot overlap the approved piece');
select lives_ok($$select public.submit_employee_time_off_periods_service(actor,w,loc,'Denied hours again','[{"segment_date":"2035-01-15","start_time":"12:00","end_time":"17:00"}]',gen_random_uuid(),'UTC') from tpd$$,'denied hours can be requested again');
select is((select md5(coalesce(jsonb_agg(to_jsonb(ps) order by ps.id)::text,'')) from public.schedule_published_shifts ps),published_digest,'request and decision do not implicitly change published assignments') from tpd;
select throws_ok($$select public.resolve_schedule_time_off_request_service(manager,w,request,2,'return_to_pending') from tpd$$,'23514',null,'reopening cannot conceal a later overlapping request');
select lives_ok($$select public.resolve_schedule_time_off_request_service(manager,w,request,2,'revoke') from tpd$$,'manager may revoke the effective leave');
select is(public.time_off_effective_ranges(segment),'{}'::tstzmultirange,'revoked decisions no longer supply leave') from tpd;
select is(jsonb_array_length(public.time_off_request_periods(request,w)->0->'decision_pieces'),2,'revocation retains the historical decision details') from tpd;
select public.resolve_schedule_time_off_request_service(manager,w,(select id from public.schedule_time_off_requests where employee_id=t.emp and reason='Denied hours again'),1,'deny') from tpd t;
select lives_ok($$select public.resolve_schedule_time_off_request_service(manager,w,request,3,'return_to_pending') from tpd$$,'reopening is allowed after the overlapping request is denied');
select is(jsonb_array_length(public.time_off_request_periods(request,w)->0->'decision_pieces'),0,'old decisions are not presented as current while review is pending') from tpd;
select lives_ok($$select public.resolve_schedule_time_off_request_service(manager,w,request,4,'approve') from tpd$$,'a new decision appends a new revision');
select is(public.time_off_effective_ranges(segment),tstzmultirange(tstzrange('2035-01-15 10:00Z','2035-01-15 17:00Z','[)')),'latest full approval replaces the old partial capacity') from tpd;
select is(jsonb_array_length(public.time_off_request_periods(request,w)->0->'decision_pieces'),1,'current projection excludes earlier decision pieces') from tpd;
select is((select count(*)::int from public.time_off_decision_pieces where request_id=(select request from tpd)),3,'earlier pieces remain in immutable history');
set local role authenticated;
select throws_ok($$select * from public.time_off_decision_pieces$$,'42501',null,'decision rows are private');
select throws_ok($$select public.resolve_time_off_period_decision_service(null,null,null,1,'approve','','[]',gen_random_uuid())$$,'42501',null,'client cannot impersonate the decision actor');
reset role;
select ok(not has_function_privilege('service_role','public.time_off_effective_ranges(uuid)','execute'),'effective leave helper cannot bypass scoped services');
select * from finish();
rollback;

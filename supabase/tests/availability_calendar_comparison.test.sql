begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table acc as select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'::uuid w,
 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'::uuid manager,'afa50000-0000-4000-8000-000000000001'::uuid actor,
 'afa50000-0000-4000-8000-000000000002'::uuid emp,'afa50000-0000-4000-8000-000000000003'::uuid loc,
 'afa50000-0000-4000-8000-000000000004'::uuid lunch,null::jsonb result,null::uuid request,null::uuid old_version;
select public.availability_lock_workspace(w) from acc;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select actor,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','calendar-comparison@example.test','','{}','{}',now(),now() from acc;
insert into public.workspace_memberships(workspace_id,user_id,role,status,all_locations) select w,actor,'employee','active',true from acc;
insert into public.locations(short_name, id,workspace_id,name,timezone,street_address,city,region,postal_code)
select 'T00001', loc,w,'Calendar comparison 30001','UTC','1 Test St','Test','CA','94000' from acc;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
select emp,w,actor,'E-995503','Dated','Availability',manager from acc;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by) select w,emp,loc,manager from acc;
insert into public.shift_types(id,workspace_id,name,default_start_time,default_end_time) select lunch,w,'Dated Lunch','12:00','16:00' from acc;
update public.workspace_scheduling_settings set availability_ownership='hybrid',availability_approval='narrowing',availability_initial_review=false,availability_notice_days=0,availability_enforcement='hard' where workspace_id=(select w from acc);
create function pg_temp.acc_proposal(changes jsonb,starts text default '2035-01-15',ends text default '2035-01-15',zone text default 'UTC') returns jsonb language sql as $$
 select jsonb_build_object('timezone',zone,'effective_from',starts,'effective_until',ends,'kind','temporary','date_overrides',changes,
 'days',(select jsonb_agg(jsonb_build_object('day',d,'mode','unavailable','windows','[]'::jsonb)) from generate_series(0,6) d));
$$;
create function pg_temp.acc_submit(p jsonb,ids jsonb default '[]',src text default 'employee') returns jsonb language sql as $$
 select public.availability_command_service(actor,w,jsonb_build_object('action','submit','employee_id',emp,'expected_revision',coalesce((select max(version_number) from public.employee_schedule_availability_versions where workspace_id=t.w and employee_id=t.emp),0),
 'proposal',p,'source',src,'replace_version_ids',ids),gen_random_uuid()) from acc t;
$$;
create function pg_temp.acc_decide(action text default 'approve') returns jsonb language sql as $$
 select public.availability_command_service(manager,w,jsonb_build_object('action',action,'employee_id',emp,'request_id',request,'expected_revision',coalesce((select max(version_number) from public.employee_schedule_availability_versions where workspace_id=t.w and employee_id=t.emp),0),
 'expected_request_revision',(select revision from public.availability_requests where id=t.request),'reason','Reviewed dated hours',
 'policy_revision',(select availability_policy_revision from public.workspace_scheduling_settings where workspace_id=t.w)),gen_random_uuid()) from acc t;
$$;
create function pg_temp.acc_assess(start_clock text,end_clock text,day text default '2035-01-15',typ uuid default null) returns jsonb language sql as $$
 select public.assess_shift_availability(w,emp,jsonb_build_object('location_id',loc,'employee_id',emp,'shift_type_id',typ,'scheduled_date',day,
 'time_basis','explicit','time_timezone','UTC','start_time',start_clock,'end_time',end_clock)) from acc;
$$;
insert into public.employee_schedule_availability_versions(workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from)
select w,emp,1,'UTC',(select jsonb_agg(jsonb_build_object('day',d,'mode','windows','windows','[{"start":"08:00","end":"20:00"}]'::jsonb,
 'blocked_shift_type_ids',case when d=1 then jsonb_build_array(lunch) else '[]'::jsonb end)) from generate_series(0,6)d),'employee',actor,'2034-01-01' from acc;
update acc set result=pg_temp.acc_submit(pg_temp.acc_proposal('[{"segment_date":"2035-01-15","start_time":"13:00","end_time":"17:00","mode":"unavailable"}]'));
update acc set request=(result->>'request_id')::uuid;
select pg_temp.acc_decide();
update acc set old_version=(select id from public.employee_schedule_availability_versions where employee_id=acc.emp and version_number=2);
create temp table comparison_leave as select (public.submit_employee_time_off_periods_service(actor,w,loc,'Comparison leave','[{"segment_date":"2035-01-15","start_time":"14:30","end_time":"15:30"}]',gen_random_uuid(),'UTC')->>'request_id')::uuid id from acc;
select public.resolve_schedule_time_off_request_service(manager,w,(select id from comparison_leave),1,'approve') from acc;
create function pg_temp.acc_command(p jsonb,ids jsonb default '[]',d date default '2035-01-15',zone_name text default 'UTC') returns jsonb language sql as $$
 select jsonb_build_object('employee_id',emp,'expected_revision',(select max(version_number) from public.employee_schedule_availability_versions where employee_id=emp),
 'proposal',p,'replace_version_ids',ids,'starts_on',d,'timezone',zone_name,'day_count',1) from acc;
$$;
create temp table comparison_input as select pg_temp.acc_command(pg_temp.acc_proposal('[{"segment_date":"2035-01-15","start_time":"14:00","end_time":"15:00","mode":"available"}]'),jsonb_build_array(old_version)) command from acc;
create temp table comparison_result as select public.availability_calendar_comparison_service(actor,w,(select command from comparison_input)) result from acc;
select is(result->'changes'->0->'newly_available','[{"start_at":"2035-01-15T14:00:00.000000Z","end_at":"2035-01-15T14:30:00.000000Z"}]'::jsonb,'only newly available hours outside approved leave count as gains') from comparison_result;
select is(result->'changes'->0->'no_longer_available','[]'::jsonb,'partial expansion closes no unrelated hours') from comparison_result;
select is(result->'before'->'days'->0->'available','[{"start_at":"2035-01-15T08:00:00.000000Z","end_at":"2035-01-15T13:00:00.000000Z"},{"start_at":"2035-01-15T17:00:00.000000Z","end_at":"2035-01-15T20:00:00.000000Z"}]'::jsonb,'before uses the composed approved date exception') from comparison_result;
select is(result->'after'->'days'->0->'available','[{"start_at":"2035-01-15T08:00:00.000000Z","end_at":"2035-01-15T13:00:00.000000Z"},{"start_at":"2035-01-15T14:00:00.000000Z","end_at":"2035-01-15T15:00:00.000000Z"},{"start_at":"2035-01-15T17:00:00.000000Z","end_at":"2035-01-15T20:00:00.000000Z"}]'::jsonb,'after preserves both outer remnants of the replaced exception') from comparison_result;
select is(result->'before'->'days'->0->'approved_leave',result->'after'->'days'->0->'approved_leave','proposal cannot change approved leave') from comparison_result;
select is(result->'changes'->0->>'shift_type_rules_changed','false','unchanged service restriction is not reported as changed just because the clock source changes') from comparison_result;
select is(comparison_result.result->'after'->'days'->0->'shift_type_rules'->0->>'shift_type_id',lunch::text,'Lunch restriction survives proposed clock expansion') from comparison_result,acc;
select is(public.availability_calendar_comparison_service(manager,w,(select command from comparison_input)),(select result from comparison_result),'manager and employee see identical scoped comparison') from acc;
select is((select count(*)::integer from public.employee_schedule_availability_versions where employee_id=emp),2,'comparison writes no version') from acc;
select is(pg_temp.acc_assess('14:00','15:00')->>'coverage','none','proposed expansion never changes actual Schedule assessment');
select throws_ok($$select public.availability_calendar_comparison_service(actor,w,jsonb_set((select command from comparison_input),'{expected_revision}','0')) from acc$$,'40001',null,'stale baseline cannot be compared as current');
select throws_ok($$select public.availability_calendar_comparison_service(gen_random_uuid(),w,(select command from comparison_input)) from acc$$,'42501',null,'comparison enforces employee read scope');
select throws_ok($$select public.availability_calendar_comparison_service(actor,gen_random_uuid(),(select command from comparison_input)) from acc$$,'42501',null,'comparison cannot cross workspaces');
select throws_ok($$select public.availability_calendar_comparison_service(actor,w,jsonb_set((select command from comparison_input),'{day_count}','32')) from acc$$,'22023',null,'comparison calendar range remains bounded');
select throws_ok($$select public.availability_calendar_comparison_service(actor,w,jsonb_set((select command from comparison_input),'{replace_version_ids}','[]')) from acc$$,'40001',null,'comparison requires explicit overlapping exception replacement');
-- Clock capacity unchanged but semantic service restriction removed.
select is(public.availability_calendar_comparison_service(actor,w,pg_temp.acc_command(jsonb_build_object('timezone','UTC','effective_from','2035-02-19','effective_until',null,'kind','weekly',
 'days',(select jsonb_agg(jsonb_build_object('day',d,'mode','windows','windows','[{"start":"08:00","end":"20:00"}]'::jsonb)) from generate_series(0,6)d)),'[]','2035-02-19'))->'changes'->0->>'shift_type_rules_changed','true','service-only changes are visible even when physical hours are unchanged') from acc;
-- Stored pending request: use the immutable stored proposal, never supplied replacement content.
update acc set result=pg_temp.acc_submit(pg_temp.acc_proposal('[{"segment_date":"2035-02-06","start_time":"10:00","end_time":"11:00","mode":"unavailable"}]','2035-02-06','2035-02-06'));
update acc set request=(result->>'request_id')::uuid;
create temp table stored_comparison as select jsonb_build_object('employee_id',emp,'expected_revision',2,'request_id',request,'expected_request_revision',1,'starts_on','2035-02-06','timezone','UTC','day_count',1) command from acc;
select is(public.availability_calendar_comparison_service(actor,w,(select command from stored_comparison))->'changes'->0->'no_longer_available','[{"start_at":"2035-02-06T10:00:00.000000Z","end_at":"2035-02-06T11:00:00.000000Z"}]'::jsonb,'pending request comparison uses its stored narrowing hours') from acc;
select throws_ok($$select public.availability_calendar_comparison_service(actor,w,(select command from stored_comparison)||jsonb_build_object('proposal',(select command->'proposal' from comparison_input))) from acc$$,'22023',null,'caller cannot mix a stored request with forged proposal content');
select throws_ok($$select public.availability_calendar_comparison_service(actor,w,jsonb_set((select command from stored_comparison),'{expected_request_revision}','9')) from acc$$,'40001',null,'request revision changes invalidate comparison');
select pg_temp.acc_decide('deny');
select throws_ok($$select public.availability_calendar_comparison_service(actor,w,jsonb_set((select command from stored_comparison),'{expected_request_revision}','2')) from acc$$,'40001',null,'closed requests cannot be presented as a live hypothetical comparison');
-- A repeated local clock must preserve the selected physical occurrences.
select is(public.availability_calendar_comparison_service(actor,w,pg_temp.acc_command(pg_temp.acc_proposal('[{"segment_date":"2035-11-04","start_time":"01:15","end_time":"01:45","start_fold":"earlier","end_fold":"later","mode":"unavailable"}]','2035-11-04','2035-11-04','America/Los_Angeles'),'[]','2035-11-04','America/Los_Angeles'))->'changes'->0->'no_longer_available',
 '[{"start_at":"2035-11-04T08:15:00.000000Z","end_at":"2035-11-04T09:45:00.000000Z"}]'::jsonb,'comparison preserves both fold occurrences and the 90-minute physical interval') from acc;
insert into public.availability_publication_locks(workspace_id,location_id,week_start,first_published_at) select w,loc,'2035-01-15',now() from acc;
select throws_ok($$select public.availability_calendar_comparison_service(actor,w,(select command from comparison_input)) from acc$$,'23514',null,'publication lock prevents preview from implying the late change is actionable');
set local role authenticated;
select throws_ok($$select public.availability_calendar_comparison_service(null,null,null)$$,'42501',null,'comparison service is not directly callable by authenticated clients');
select throws_ok($$select public.availability_calendar_context(null,null,null,null,null,null,null)$$,'42501',null,'hypothetical calendar resolver remains private');
reset role;
select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table ws as select
 'ad427000-0000-4000-8000-000000000001'::uuid w,
 'ad427000-0000-4000-8000-000000000002'::uuid manager,
 'ad427000-0000-4000-8000-000000000003'::uuid first_user,
 'ad427000-0000-4000-8000-000000000004'::uuid second_user,
 'ad427000-0000-4000-8000-000000000005'::uuid first_emp,
 'ad427000-0000-4000-8000-000000000006'::uuid second_emp,
 'ad427000-0000-4000-8000-000000000007'::uuid loc,
 'ad427000-0000-4000-8000-000000000008'::uuid job,
 (date_trunc('week',current_date)::date+14) start_day;
insert into auth.users(id,email) select manager,'weekly-exchange-manager@example.test' from ws
 union all select first_user,'weekly-exchange-first@example.test' from ws
 union all select second_user,'weekly-exchange-second@example.test' from ws;
insert into public.workspaces(id,name,created_by) select w,'Weekly exchange',manager from ws;
insert into public.workspace_memberships (workspace_id, user_id, role_id, employee_role_id)
select legacy.workspace_id::uuid, legacy.user_id::uuid, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (select w,manager,'owner'::public.workspace_role,true from ws
 union all select w,first_user,'employee'::public.workspace_role,true from ws
 union all select w,second_user,'employee'::public.workspace_role,true from ws) as legacy(workspace_id, user_id, role, all_locations);
insert into public.workspace_scheduling_settings(workspace_id) select w from ws on conflict do nothing;
insert into public.locations(short_name, id,workspace_id,name,street_address,city,region,postal_code,timezone)
 select 'T00052', loc,w,'Exchange site','1 Test Street','Test City','CA','90001','UTC' from ws;
insert into public.jobs(id,workspace_id,name) select job,w,'Server' from ws;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
 select first_emp,w,first_user,'E-9934271','First','Employee',manager from ws
 union all select second_emp,w,second_user,'E-9934272','Second','Employee',manager from ws;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
 select w,e.id,loc,manager from ws cross join lateral unnest(array[first_emp,second_emp]) e(id);
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,is_primary,created_by)
 select w,e.id,job,true,manager from ws cross join lateral unnest(array[first_emp,second_emp]) e(id);
insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
 select 'ad427000-0000-4000-8000-000000000010',w,loc,start_day,1,manager from ws;
create function pg_temp.shift_id(n integer) returns uuid language sql immutable as $$
 select ('ad427000-0000-4000-8000-'||lpad((20+n)::text,12,'0'))::uuid;
$$;
insert into public.schedule_published_shifts(id,source_shift_id,workspace_id,location_id,publication_id,employee_id,job_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
 select pg_temp.shift_id(n),pg_temp.shift_id(10+n),w,loc,'ad427000-0000-4000-8000-000000000010',
  case n when 3 then second_emp else first_emp end,job,start_day+n-1,'18:00','22:00','explicit','UTC' from ws cross join generate_series(1,4) n;
create function pg_temp.unavailable() returns jsonb language sql as $$
 select jsonb_build_object('days',jsonb_agg(jsonb_build_object('day',d,'all_day',true,'ranges','[]'::jsonb) order by d)) from generate_series(0,6) d;
$$;
insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by)
 select w,second_emp,pg_temp.unavailable(),1,second_user from ws;
create function pg_temp.command(actor uuid,command jsonb,key uuid default gen_random_uuid()) returns jsonb language sql as $$
 select public.shift_exchanges_command_service(actor,w,command,key) from ws;
$$;
create function pg_temp.read_model(actor uuid,manager_view boolean default false) returns jsonb language sql as $$
 select public.shift_exchanges_read_service(actor,w,manager_view,start_day,start_day+6) from ws;
$$;
create function pg_temp.warning(emp uuid,n integer) returns jsonb language sql as $$
 select public.weekly_exchange_employee_warning(w,emp,public.shift_exchange_shift(w,pg_temp.shift_id(n))) from ws;
$$;
create temp table state(cid uuid,aid uuid,result jsonb,preview jsonb,token text,key uuid default gen_random_uuid());
insert into state(result) select pg_temp.command(first_user,jsonb_build_object('action','create','kind','cover','shift_id',pg_temp.shift_id(1))) from ws;
update state set cid=(result->>'case_id')::uuid;
-- The first employee releases shift 2 too: only a release reaches the pool (TAKAS-RELEASE).
select pg_temp.command(first_user,jsonb_build_object('action','create','kind','cover','shift_id',pg_temp.shift_id(2))) from ws;
select is(jsonb_array_length(public.shift_exchanges_candidates_service(first_user,w,pg_temp.shift_id(1))->'employees'),1,'unavailable cover candidate is not hidden') from ws;
select ok(not (public.shift_exchanges_candidates_service(first_user,w,pg_temp.shift_id(1))::text like '%availability_warning%') or
 not (public.shift_exchanges_candidates_service(first_user,w,pg_temp.shift_id(1))->'employees'->0->'eligibility' ? 'availability_warning'),'cover search does not reveal another employee preference') from ws;
select is(jsonb_array_length(pg_temp.read_model(second_user)->'opportunities'),2,'both released shifts remain listed despite own unavailability') from ws;
select ok((pg_temp.read_model(second_user)->'opportunities'->0->'eligibility'->'availability_warning'->>'fingerprint') is not null,'own opportunity includes explicit decision token') from ws;
select throws_ok($$select pg_temp.command(second_user,jsonb_build_object('action','apply','shift_id',pg_temp.shift_id(1),'case_id',cid,'availability_accepted',true)) from ws,state$$,'PT409',null,'client boolean cannot invent acceptance');
select is((select count(*) from public.shift_exchange_applications where workspace_id=(select w from ws)),0::bigint,'missing acknowledgment rolls back without an application');
update state set token=(select pg_temp.warning(second_emp,1)->>'fingerprint' from ws);
update public.employee_weekly_preferences set preference=jsonb_set(jsonb_set(preference,'{days,1,all_day}','false'),'{days,1,ranges}','[{"start":"19:00","end":"20:00"}]') where workspace_id=(select w from ws);
select throws_ok($$select pg_temp.command(second_user,jsonb_build_object('action','apply','shift_id',pg_temp.shift_id(1),'case_id',cid,'availability_fingerprint',token)) from ws,state$$,'PT409',null,'changed own conflict rejects the previously displayed token');
update public.employee_weekly_preferences set preference=pg_temp.unavailable() where workspace_id=(select w from ws);
insert into public.manager_weekly_reminders(workspace_id,employee_id,preference,notes,revision,updated_by)
 select w,second_emp,pg_temp.unavailable(),array['Private reminder','','','','','',''],1,manager from ws;
select is(pg_temp.warning(second_emp,1)->>'fingerprint',(select token from state),'private manager changes cannot alter employee token') from ws;
select ok(pg_temp.read_model(second_user)::text not like '%Private reminder%' and pg_temp.read_model(second_user)::text not like '%manager_intervals%','employee response hides manager rules and notes') from ws;
select throws_ok($$select pg_temp.command(second_user,jsonb_build_object('action','apply','shift_id',pg_temp.shift_id(2),'availability_fingerprint',token)) from ws,state$$,'PT409',null,'acceptance token cannot move to a different shift');
update state set result=(select pg_temp.command(second_user,jsonb_build_object('action','apply','shift_id',pg_temp.shift_id(1),'case_id',cid,'availability_fingerprint',token),key) from ws);
update state set aid=(select id from public.shift_exchange_applications where case_id=cid and status='pending_manager');
select is(pg_temp.command(second_user,jsonb_build_object('action','apply','shift_id',pg_temp.shift_id(1),'case_id',cid,'availability_fingerprint',token),key)->>'case_id',cid::text,'retry reuses the successful acceptance') from ws,state;
select is((select count(*) from public.shift_exchange_applications where case_id=cid),1::bigint,'retry does not duplicate acceptance') from state;
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift_id(1)),(select first_emp from ws),'employee acceptance does not transfer before manager decision');
update state set preview=(select public.shift_exchange_preview(manager,w,cid,aid) from ws);
select is(preview->>'allowed','true','manager finalization needs no second employee or reminder decision') from state;
select ok(not (preview::text like '%manager_intervals%' or preview::text like '%employee_intervals%'),'manager exchange preview has no raw preference payload') from state;
select throws_ok($$select public.require_weekly_exchange_employee_warning(first_user,w,second_emp,public.shift_exchange_shift(w,pg_temp.shift_id(1)),jsonb_build_object('availability_fingerprint',token)) from ws,state$$,'42501',null,'even private guard validates the actual employee actor');
select tests.approved_leave(w,second_emp,second_user,loc,start_day,'18:00','20:00','ad427000-0000-4000-8000-000000000050') from ws;
select is(public.shift_exchange_preview(manager,w,cid,aid)->>'allowed','false','accepted employee cannot override new approved leave') from ws,state;
select throws_ok($$select pg_temp.command(manager,jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',result->>'revision','fingerprint',preview->>'fingerprint')) from ws,state$$,'PT409',null,'final write rechecks true blockers');
select is((select count(*) from public.schedule_availability_overrides where workspace_id=(select w from ws)),0::bigint,'blocked transfer creates no acceptance evidence');
-- Waiting for an answer: no `effective` hours yet (time off rebuild D8).
update public.time_off_requests set status='pending',effective='{}',decided_by=null,decided_at=null where id='ad427000-0000-4000-8000-000000000050';
update state set preview=(select public.shift_exchange_preview(manager,w,cid,aid) from ws);
update state set result=(select pg_temp.command(manager,jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',result->>'revision','fingerprint',preview->>'fingerprint')) from ws);
select is(result->>'status','completed','actual manager command completes with no extra availability override') from state;
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift_id(1)),(select second_emp from ws),'accepted employee receives the full shift');
-- BL-186: availability never gates a transfer; the employee's own choice is the application above.
select is((select count(*) from public.schedule_availability_overrides where workspace_id=(select w from ws)),0::bigint,'no acceptance evidence is needed for the employee''s own mark');
select is((select availability_snapshot->'assessment'->>'has_availability_conflict' from public.schedule_published_shifts where id=pg_temp.shift_id(1)),'true','the published shift records the warning it was taken with');
select is((select preference from public.employee_weekly_preferences where employee_id=(select second_emp from ws)),pg_temp.unavailable(),'voluntary assignment never rewrites the employee week');

-- A swap has two receiving employees, each makes their own explicit choice.
insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by)
 select w,first_emp,pg_temp.unavailable(),1,first_user from ws;
select ok((public.shift_exchanges_candidates_service(first_user,w,pg_temp.shift_id(4))->'shifts'->0->'availability_warning'->>'fingerprint') is not null,'swap candidate shows only the requester own warning') from ws;
select throws_ok($$select pg_temp.command(first_user,jsonb_build_object('action','create','kind','swap','shift_id',pg_temp.shift_id(4),'requested_shift_id',pg_temp.shift_id(3))) from ws$$,'PT409',null,'swap requester must acknowledge own incoming conflict');
update state set result=(select pg_temp.command(first_user,jsonb_build_object('action','create','kind','swap','shift_id',pg_temp.shift_id(4),'requested_shift_id',pg_temp.shift_id(3),'availability_fingerprint',pg_temp.warning(first_emp,3)->>'fingerprint')) from ws);
update state set cid=(result->>'case_id')::uuid;
update state set aid=(select id from public.shift_exchange_applications where case_id=cid);
select throws_ok($$select public.record_weekly_exchange_acceptance(w,cid,aid) from ws,state$$,'PT409',null,'invitation alone is not voluntary acceptance');
select ok(exists(select 1 from jsonb_array_elements(pg_temp.read_model(second_user)->'cases') c cross join lateral jsonb_array_elements(c->'applications') a where a->>'id'=(select aid::text from state) and a->'eligibility'->'availability_warning'->>'fingerprint' is not null),'invited employee receives own conflict token') from ws;
select throws_ok($$select pg_temp.command(second_user,jsonb_build_object('action','accept','case_id',cid,'application_id',aid,'expected_revision',result->>'revision')) from ws,state$$,'PT409',null,'invite response cannot silently accept a conflict');
update state set result=(select pg_temp.command(second_user,jsonb_build_object('action','accept','case_id',cid,'application_id',aid,'expected_revision',result->>'revision','availability_fingerprint',pg_temp.warning(second_emp,4)->>'fingerprint')) from ws);
update state set preview=(select public.shift_exchange_preview(manager,w,cid,aid) from ws);
update state set result=(select pg_temp.command(manager,jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',result->>'revision','fingerprint',preview->>'fingerprint')) from ws);
select is(result->>'status','completed','swap completes without re-prompting either employee or manager') from state;
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift_id(3)),(select first_emp from ws),'requester receives their accepted shift');
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift_id(4)),(select second_emp from ws),'invited employee receives their accepted shift');
select is((select count(*) from public.schedule_availability_overrides where workspace_id=(select w from ws)),0::bigint,'the swap records no acceptance either');
update public.employee_weekly_preferences set preference=public.empty_weekly_preference() where employee_id=(select second_emp from ws);
select is(pg_temp.warning(second_emp,2),null::jsonb,'manager-only conflict never asks the employee to reveal or accept a private reminder') from ws;
update state set result=(select pg_temp.command(second_user,jsonb_build_object('action','apply','shift_id',pg_temp.shift_id(2))) from ws);
update state set cid=(result->>'case_id')::uuid;
update state set aid=(select id from public.shift_exchange_applications where case_id=cid);
update state set preview=(select public.shift_exchange_preview(manager,w,cid,aid) from ws);
select is(preview->>'allowed','true','manager-only reminder does not require second consent after voluntary pickup') from state;
update state set result=(select pg_temp.command(manager,jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',result->>'revision','fingerprint',preview->>'fingerprint')) from ws);
select is(result->>'status','completed','a released shift completes with private reminder and no employee preference token') from state;
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift_id(2)),(select second_emp from ws),'the released shift goes to the volunteer');
select ok(not has_function_privilege('service_role','public.record_weekly_exchange_acceptance(uuid,uuid,uuid)','execute'),'raw acceptance writer is not an exposed RPC');
select ok(not has_function_privilege('authenticated','public.weekly_exchange_employee_warning(uuid,uuid,jsonb)','execute'),'employee cannot read another employee token directly');
select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- app_private.eligibility(): who may take a shift in a swap, pickup or cover
-- (FB-6.4 A1; KARARLAR "Takas, bırakılan vardiya (pickup), cover — uygunluk").
-- Part 1 reads the engine on its own; part 2 walks a cover through Shift Hub.

create temp table ws as select
 'ad426000-0000-4000-8000-000000000001'::uuid w,
 'ad426000-0000-4000-8000-000000000002'::uuid owner_id,
 'ad426000-0000-4000-8000-000000000003'::uuid employee_user,
 'ad426000-0000-4000-8000-000000000004'::uuid emp,
 'ad426000-0000-4000-8000-000000000006'::uuid loc,
 'ad426000-0000-4000-8000-000000000007'::uuid other_loc,
 'ad426000-0000-4000-8000-000000000008'::uuid shift_type,
 'ad426000-0000-4000-8000-000000000009'::uuid job;
insert into auth.users(id,email) select owner_id,'weekly-candidate-owner@example.test' from ws
 union all select employee_user,'weekly-candidate-employee@example.test' from ws;
insert into public.workspaces(id,name,created_by) select w,'Weekly candidates',owner_id from ws;
insert into public.workspace_memberships (workspace_id, user_id, role_id, employee_role_id)
select legacy.workspace_id::uuid, legacy.user_id::uuid, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (select w,owner_id,'owner'::public.workspace_role,true from ws
 union all select w,employee_user,'employee'::public.workspace_role,false from ws) as legacy(workspace_id, user_id, role, all_locations);
insert into public.workspace_scheduling_settings(workspace_id) select w from ws on conflict do nothing;
insert into public.locations(short_name, id,workspace_id,name,street_address,city,region,postal_code,timezone)
 select 'T00048', loc,w,'West','1 Test Street','Test City','CA','90001','America/Los_Angeles' from ws
 union all select 'T00049', other_loc,w,'East','2 Test Street','Test City','NY','10001','America/New_York' from ws;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
 select emp,w,employee_user,'E-993426','Weekly','Candidate',owner_id from ws;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,assigned_at,created_by)
 select w,emp,loc,'2020-01-01'::timestamptz,owner_id from ws union all select w,emp,other_loc,'2020-01-01'::timestamptz,owner_id from ws;
insert into public.jobs(id,workspace_id,name) select job,w,'Server' from ws;
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,assigned_at,is_primary,created_by)
 select w,emp,job,'2020-01-01',true,owner_id from ws;
insert into public.shift_types(id,workspace_id,name,default_start_time,default_end_time)
 select shift_type,w,'Dinner','18:00','20:00' from ws;
create function pg_temp.target(changes jsonb default '{}') returns jsonb language sql stable as $$
 select jsonb_build_object('location_id',loc,'job_id',job,'shift_type_id',shift_type,'date','2035-01-15',
  'start_time','18:00','end_time','22:00','time_basis','explicit')||changes from ws;
$$;
create function pg_temp.candidate(changes jsonb default '{}',excluded uuid[] default '{}',consent jsonb default null) returns jsonb language sql stable as $$
 select app_private.eligibility(w,emp,pg_temp.target(changes),jsonb_build_object('operation','release_pickup',
  'excluded',to_jsonb(excluded),'consent',consent,'with_assessment',true)) from ws;
$$;
create function pg_temp.has(e jsonb,part text,code text) returns boolean language sql immutable as $$
 select e->part @> jsonb_build_array(jsonb_build_object('code',code));
$$;

-- 1. The shape and the hours.
select is(pg_temp.candidate()->>'status','eligible','no declared preference is eligible');
select is(pg_temp.candidate()->'eligible','true'::jsonb,'eligible is its own answer');
select is(pg_temp.candidate()->'approvals_required',(select jsonb_build_array(loc) from ws),'the shift''s location approves (D5)');
select is(pg_temp.candidate()->'assessment'->>'operation','allowed','empty week is verified, not unknown');
select is(pg_temp.candidate('{"start_time":null}')->>'status','verification_required','missing start requires verification');
select ok(pg_temp.has(pg_temp.candidate('{"start_time":null}'),'blockers','hours_unconfirmed'),'and says the hours are not confirmed');
select is(pg_temp.candidate('{"end_time":"18:00"}')->>'status','ineligible','equal endpoints are refused');
select throws_ok($$select app_private.eligibility(w,emp,pg_temp.target(),'{"operation":"assign"}') from ws$$,'22023',null,
 'assign is not an exchange operation (T1)');
select ok(not (app_private.eligibility((select w from ws),(select emp from ws),pg_temp.target(),'{"operation":"release_pickup"}') ? 'assessment'),
 'the private assessment comes out only when asked for');

-- 2. Availability is never a blocker (M6, M8); it is the person's to set aside.
insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
 select 'ad426000-0000-4000-8000-000000000010',w,loc,'2035-01-15',1,owner_id from ws;
insert into public.schedule_published_shifts(id,source_shift_id,workspace_id,location_id,publication_id,employee_id,job_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
 select 'ad426000-0000-4000-8000-000000000011','ad426000-0000-4000-8000-000000000012',w,loc,
  'ad426000-0000-4000-8000-000000000010',emp,job,'2035-01-15','09:00','12:00','explicit','America/Los_Angeles' from ws;
insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by)
 select w,emp,jsonb_set(public.empty_weekly_preference(),'{days,1,ranges}','[{"start":"18:00","end":"20:00"}]'),1,employee_user from ws;
select is(pg_temp.candidate()->>'status','eligible','partial preference conflict does not make a candidate ineligible');
select ok(pg_temp.has(pg_temp.candidate(),'acknowledgements','availability'),'the person is asked "are you sure?" (M6)');
select ok(pg_temp.has(pg_temp.candidate(),'approval_flags','availability_consent'),'the approving manager sees "by their own consent" (M6)');
select ok(not pg_temp.has(pg_temp.candidate(),'blockers','availability'),'availability is never a blocker (M8)');
select is(pg_temp.candidate()->'assessment'->>'coverage','partial','partial warning remains separate');
select is(pg_temp.candidate('{"scheduled_date":"2035-01-16"}')->'assessment'->>'coverage','partial','the candidate date wins over a copied scheduled_date');
select is(pg_temp.candidate('{"start_time":"20:00"}')->'assessment'->>'has_availability_conflict','false','touching endpoints have no conflict');
select ok(not pg_temp.has(pg_temp.candidate('{"start_time":"20:00"}'),'acknowledgements','availability'),'and ask nothing');
select is(pg_temp.candidate('{"time_timezone":"America/New_York"}')->'assessment'->>'coverage','partial','actual saved timezone is compared with current target location rules');
update public.employee_weekly_preferences set preference=jsonb_set(public.empty_weekly_preference(),'{days,1,all_day}','true') where workspace_id=(select w from ws);
select is(pg_temp.candidate()->>'status','eligible','an all-day mark keeps the person selectable');
select is(pg_temp.candidate()->'assessment'->>'coverage','none','full preference conflict is retained as warning evidence');

-- 3. Real blockers and full-span employment checks are still authoritative.
select is(pg_temp.candidate('{"start_time":"10:00","end_time":"11:00"}')->>'status','ineligible','published shift overlap remains blocking');
select ok(pg_temp.has(pg_temp.candidate('{"start_time":"10:00","end_time":"11:00"}'),'blockers','time_overlap'),'two shifts at once is the blocker');
select is(pg_temp.candidate('{"start_time":"10:00","end_time":"11:00"}',array['ad426000-0000-4000-8000-000000000011'::uuid])->>'status','eligible','explicitly excluded source is not counted twice');
select is(pg_temp.candidate('{"start_time":"13:00","end_time":"14:00","time_snapshot":{"timezone":"America/New_York"}}')->>'status','ineligible','snapshot timezone fallback is used by overlap checks too');
update public.employee_location_assignments set ended_at='2035-01-16 03:00Z' where workspace_id=(select w from ws) and location_id=(select loc from ws);
select is(pg_temp.candidate()->>'status','ineligible','location employment must cover the full requested duration');
select ok(pg_temp.has(pg_temp.candidate(),'blockers','location_assignment'),'the location assignment is the blocker');
update public.employee_location_assignments set ended_at=null where workspace_id=(select w from ws);
update public.employee_job_assignments set ended_at='2035-01-16 03:00Z' where workspace_id=(select w from ws);
select is(pg_temp.candidate()->>'status','ineligible','job employment must cover the full requested duration');
select ok(pg_temp.has(pg_temp.candidate(),'blockers','job_assignment'),'the job assignment is the blocker');
update public.employee_job_assignments set ended_at=null where workspace_id=(select w from ws);
update public.workspace_memberships set status='suspended' where workspace_id=(select w from ws) and user_id=(select employee_user from ws);
select is(pg_temp.candidate()->>'status','ineligible','exchanges require active workspace access');
update public.workspace_memberships set status='active' where workspace_id=(select w from ws);
-- ROL-CIFT 2.1: somebody who only manages is never scheduled, whatever they are assigned to.
update public.workspace_memberships m
 set role_id=(select r.id from public.workspace_roles r where r.workspace_id=m.workspace_id and r.system_key='manager'),
  employee_role_id=null
 where m.workspace_id=(select w from ws) and m.user_id=(select employee_user from ws);
select is(pg_temp.candidate()->>'status','ineligible','exchanges require the employee access');
select ok(pg_temp.has(pg_temp.candidate(),'blockers','no_employee_access'),'and say so');
update public.workspace_memberships m
 set employee_role_id=(select r.id from public.workspace_roles r where r.workspace_id=m.workspace_id and r.system_key='employee'),
  role_id=null
 where m.workspace_id=(select w from ws) and m.user_id=(select employee_user from ws);
select ok(not pg_temp.has(pg_temp.candidate(),'blockers','no_employee_access'),'the employee access back, nothing is said about it');
update public.employee_profiles set is_excluded_from_schedule=true where workspace_id=(select w from ws);
select is(pg_temp.candidate()->>'status','ineligible','excluded employee remains ineligible');
update public.employee_profiles set is_excluded_from_schedule=false where workspace_id=(select w from ws);
select tests.closed_day(w, array[loc]::uuid[], ('2035-01-15')::date, ('2035-01-15')::date, owner_id, 'ad426000-0000-4000-8000-000000000015'::uuid) from ws;
select is(pg_temp.candidate()->>'status','ineligible','location closure is not an availability override');
delete from public.announcements where id='ad426000-0000-4000-8000-000000000015';
select is(pg_temp.candidate('{"date":"2035-03-11","start_time":"02:30","end_time":"04:00"}')->>'status','ineligible','nonexistent DST clock time remains blocked');
select is((pg_temp.candidate('{"date":"2035-11-04","start_time":"00:30","end_time":"02:30"}')->'assessment'->>'assessment_minutes')::numeric,180::numeric,'fall-back interval keeps its real elapsed duration');
select throws_ok($$select pg_temp.candidate('{"time_basis":"type_default","time_snapshot":{"start_time":"17:00","end_time":"22:00"}}')$$,'22023',null,'inconsistent time snapshot is a technical error');
select throws_ok($$select pg_temp.candidate('{"location_id":"ad426000-0000-4000-8000-000000000099"}')$$,'P0001',null,'unknown location fails instead of becoming available');

-- 4. Approved time off blocks every overlapping shift, even by a minute; the
-- person's consent no longer sets it aside (KARARLAR §1.1, Mert 2026-10-09; BL-995).
update public.employee_weekly_preferences set preference=public.empty_weekly_preference() where workspace_id=(select w from ws);
select tests.approved_leave(w,emp,employee_user,other_loc,'2035-01-15','09:00','10:00','ad426000-0000-4000-8000-000000000017') from ws;
select is(pg_temp.candidate()->>'status','eligible','09:00 New York leave does not overlap the 18:00 Los Angeles shift');
select tests.approved_leave(w,emp,employee_user,other_loc,'2035-01-15','21:00','22:00','ad426000-0000-4000-8000-000000000016') from ws;
select is(pg_temp.candidate()->>'status','ineligible','21:00 New York leave overlaps the 18:00 Los Angeles shift: a blocker');
select ok((pg_temp.candidate()->'reasons'->>0) like 'Approved time off%','leave blocker is explained separately');
select ok(pg_temp.has(pg_temp.candidate(),'blockers','approved_time_off'),'the blocker is approved_time_off');
select is(pg_temp.candidate(consent=>'true')->>'status','ineligible','the person''s own agreement no longer sets the leave aside');
select ok(not (pg_temp.candidate(consent=>'true') ? 'shortens_time_off'),'and nothing says the leave would shorten');
update public.schedule_time_off_requests set status='pending' where id in ('ad426000-0000-4000-8000-000000000016','ad426000-0000-4000-8000-000000000017');
select is(pg_temp.candidate()->>'status','eligible','pending leave does not become approved leave');

-- 5. The manager's reminder note never decides eligibility (M12).
insert into public.manager_weekly_reminders(workspace_id,employee_id,preference,enabled,notes,revision,updated_by)
 select w,emp,jsonb_set(public.empty_weekly_preference(),'{days,1,all_day}','true'),true,
  array['','Private manager note','','','','',''],1,owner_id from ws;
select is(pg_temp.candidate()->>'status','eligible','manager-only reminder never becomes an assignment blocker');
select ok(pg_temp.has(pg_temp.candidate(),'approval_flags','manager_note'),'the approving manager is reminded of it');
select ok(not pg_temp.has(pg_temp.candidate(),'acknowledgements','availability'),'manager conflict does not become an employee preference');
select ok(pg_temp.candidate()::text not like '%Private manager note%','the engine never carries the note text');
update public.manager_weekly_reminders set enabled=false where workspace_id=(select w from ws);
select ok(not pg_temp.has(pg_temp.candidate(),'approval_flags','manager_note'),'disabled reminders no longer flag');

-- 6. Travel and rest: always the approving manager's flag, never a blocker,
-- whatever Settings > Scheduling > Conflict handling says (D7).
update public.workspace_scheduling_settings set minimum_travel_minutes=30 where workspace_id=(select w from ws);
select is(pg_temp.candidate(jsonb_build_object('location_id',other_loc,'start_time','15:15','end_time','16:00'))->>'status','eligible',
 'a short travel gap does not take the person off the list') from ws;
select is(pg_temp.candidate(jsonb_build_object('location_id',other_loc,'start_time','15:15','end_time','16:00'))->'approval_flags'
 ->(0),'{"code":"minimum_travel","gap_minutes":15,"rule_minutes":30}'::jsonb,'it is measured in physical instants across timezones: 15 of 30 minutes') from ws;
select ok(not pg_temp.has(pg_temp.candidate(jsonb_build_object('location_id',other_loc,'start_time','15:30','end_time','16:00')),'approval_flags','minimum_travel'),
 'the exact travel boundary is not flagged') from ws;
select ok(not pg_temp.has(pg_temp.candidate('{"start_time":"12:00","end_time":"13:00"}'),'approval_flags','minimum_travel'),'same-location adjacent work needs no travel');
update public.workspace_scheduling_settings set conflict_rules=conflict_rules||'{"minimum_travel":"block","minimum_rest":"block"}',
 minimum_rest_minutes=600 where workspace_id=(select w from ws);
select is(pg_temp.candidate(jsonb_build_object('location_id',other_loc,'start_time','15:15','end_time','16:00'))->>'status','eligible',
 'Block in Settings does not block an exchange') from ws;
select is(pg_temp.candidate()->>'status','eligible','nor does a short rest');
select is(pg_temp.candidate()->'approval_flags'->(0),'{"code":"minimum_rest","gap_minutes":360,"rule_minutes":600}'::jsonb,
 'rest is flagged with the gap and the rule: 360 of 600 minutes');
select is(pg_temp.candidate()->'assessment'->>'operation','allowed','in an exchange the assessment leaves travel and rest to the flags');
select is(public.assess_weekly_shift_availability((select w from ws),(select emp from ws),pg_temp.target()||'{"scheduled_date":"2035-01-15"}')->>'operation','blocked',
 'Schedule''s own assignment keeps the Block setting');
-- C2 (KARARLAR "Takas inceleme penceresi H2", uyarı kutuları; ILKELER P11): the
-- review shows the rule that holds next to the one that does not, with what was
-- measured ("12 h of rest / 10 h needed"); only the review asks for it.
create function pg_temp.measured(changes jsonb default '{}') returns jsonb language sql stable as $$
 select app_private.eligibility(w,emp,pg_temp.target(changes),'{"operation":"swap","with_measures":true}')->'measures' from ws;
$$;
update public.workspace_scheduling_settings set minimum_rest_minutes=300 where workspace_id=(select w from ws);
select is(pg_temp.measured(),'{"rest_gap_minutes":360,"travel_gap_minutes":null,"rest_rule_minutes":300,"travel_rule_minutes":30}'::jsonb,
 'a rest that holds is still measured: 360 minutes against a 300 minute rule, no travel at the same location');
select is(pg_temp.measured(jsonb_build_object('location_id',other_loc,'start_time','15:30','end_time','16:00'))->'travel_gap_minutes','30'::jsonb,
 'a travel gap that holds is measured too: 30 of 30 minutes') from ws;
select ok(not (app_private.eligibility((select w from ws),(select emp from ws),pg_temp.target(),'{"operation":"swap"}') ? 'measures'),
 'the measures come out only when the review asks for them');
update public.workspace_scheduling_settings set minimum_travel_minutes=0,minimum_rest_minutes=0 where workspace_id=(select w from ws);

-- 7. Saved time zones stay canonical when a location's time zone changes.
update public.locations set timezone='America/New_York' where id=(select loc from ws);
select is(pg_temp.candidate('{"time_timezone":"America/Los_Angeles","start_time":"12:00","end_time":"13:00"}')->>'status','eligible',
 'target eligibility keeps its saved timezone after a location edit');
select is(pg_temp.candidate('{"time_timezone":"America/Los_Angeles","start_time":"11:00","end_time":"13:00"}')->>'status','ineligible',
 'and the other shift keeps its own saved timezone');
update public.locations set timezone='America/Los_Angeles' where id=(select loc from ws);

select ok(not has_function_privilege('anon','app_private.eligibility(uuid,uuid,jsonb,jsonb)','EXECUTE'),'anonymous cannot ask the engine');
select ok(not has_function_privilege('authenticated','app_private.eligibility(uuid,uuid,jsonb,jsonb)','EXECUTE'),'employee cannot read manager rules through the engine');
select ok(not has_function_privilege('service_role','app_private.eligibility(uuid,uuid,jsonb,jsonb)','EXECUTE'),'no RPC exposes the engine');

-- Part 2. KadikoyBesiktas Garson2 finishes in Besiktas at 17:00 and asks for
-- Garson1's 17:30 Kadikoy shift; travel is 45 minutes and set to Block.
select tests.world('em');
select tests.person('em','ayse','manager',array['K'],array['cook']);
select tests.person('em','garson1','employee',array['K'],array['cook']);
select tests.person('em','garson2','employee',array['K','B'],array['cook']);
select tests.person('em','garson3','employee',array['K'],array['cook']);
select tests.person('em','garson4','employee',array['K'],array['cook']);
select tests.publish_week('em',1,'[
 {"label":"k","person":"garson1","loc":"K","job":"cook","day":2,"start":"17:30","end":"22:00"},
 {"label":"b","person":"garson2","loc":"B","job":"cook","day":2,"start":"13:00","end":"17:00"}]');
select tests.approved_leave(tests.id('em'),tests.id('em:garson3'),tests.user('em:owner'),tests.id('em:K'),tests.week(1)+2);
select tests.availability('em','garson4',3,'17:00','23:00');
update public.workspace_scheduling_settings set minimum_travel_minutes=45,conflict_rules=conflict_rules||'{"minimum_travel":"block"}'
 where workspace_id=tests.id('em');
create function pg_temp.candidates() returns jsonb language sql as $$
 select public.shift_exchanges_candidates_service(tests.user('em:garson1'),tests.id('em'),tests.id('em:shift:k'))->'employees';
$$;
create function pg_temp.listed(person text) returns jsonb language sql as $$
 select e->'eligibility' from jsonb_array_elements(pg_temp.candidates()) e where e->>'id'=tests.id('em:'||person)::text;
$$;
select ok(pg_temp.listed('garson2') is not null,'D7: a short travel gap keeps Garson2 on the cover list');
select ok(pg_temp.listed('garson3') is null,'D1: Garson3 on approved leave is not on the cover list');
select ok(pg_temp.has(pg_temp.listed('garson4'),'acknowledgements','availability'),'D1: unavailable Garson4 is listed, marked unavailable');
select ok(not (pg_temp.candidates()::text like '%approval_flags%'),'the cover list never carries the manager''s flags');

select tests.cover_case('em','k','garson1','garson2');
create function pg_temp.preview() returns jsonb language sql as $$
 select public.shift_exchange_preview(tests.user('em:ayse'),tests.id('em'),tests.id('em:case:k'),tests.id('em:application:k'));
$$;
select is(pg_temp.preview()->>'allowed','true','Garson2 applied and the request is ready for approval');
select is(pg_temp.preview()->'receiver'->'approval_flags'->(0),'{"code":"minimum_travel","gap_minutes":30,"rule_minutes":45}'::jsonb,
 'Ayse sees "Travel 30 min, rule 45 min" on the approval');
select ok(exists(select 1 from jsonb_array_elements(public.shift_exchanges_read_service(tests.user('em:ayse'),tests.id('em'),true,tests.week(1),tests.week(1)+6)->'cases') c,
  jsonb_array_elements(c->'applications') a where a->'eligibility' ? 'approval_flags'),'the manager''s Requests read carries the flags');
select ok(not exists(select 1 from jsonb_array_elements(public.shift_exchanges_read_service(tests.user('em:garson2'),tests.id('em'),false,tests.week(1),tests.week(1)+6)->'cases') c,
  jsonb_array_elements(c->'applications') a where a->'eligibility' ? 'approval_flags'),'Garson2''s own read does not');
select is(public.shift_exchanges_command_service(tests.user('em:ayse'),tests.id('em'),jsonb_build_object('action','approve',
  'case_id',tests.id('em:case:k'),'application_id',tests.id('em:application:k'),
  'expected_revision',(select revision from public.shift_exchange_cases where id=tests.id('em:case:k')),
  'fingerprint',pg_temp.preview()->>'fingerprint'),gen_random_uuid())->>'status','completed','Ayse approves despite Block');
select is((select employee_id from public.schedule_published_shifts where id=tests.id('em:shift:k')),tests.id('em:garson2'),
 'and the Kadikoy shift is Garson2''s');

-- 8. Documents stay as they are today (out of scope 2): an accepted document
-- that blocks the schedule and expired before the shift keeps the person off.
insert into public.document_types(id,workspace_id,title,created_by,required_at_onboarding,tracks_expiry,expiry_schedule_impact)
 values(tests.remember('em:doc',gen_random_uuid()),tests.id('em'),'Food handler card',tests.user('em:owner'),true,true,'block');
-- A requirement only attaches to a published document type (schedule_publication.test.sql).
update public.document_types set publication_status='published' where id=tests.id('em:doc');
insert into public.employee_onboarding_requirements(id,workspace_id,case_id,employee_id,kind,title,sort_order,source_id,status)
 select tests.remember('em:req',gen_random_uuid()),c.workspace_id,c.id,c.employee_id,'document','Food handler card',99,tests.id('em:doc'),'completed'
 from public.employee_onboarding_cases c where c.employee_id=tests.id('em:garson4');
insert into public.employee_documents(workspace_id,employee_id,requirement_id,version_number,object_path,original_filename,media_type,size_bytes,review_status,uploaded_by,expiry_date)
 values(tests.id('em'),tests.id('em:garson4'),tests.id('em:req'),1,tests.id('em')||'/'||tests.id('em:garson4')||'/'||tests.id('em:req')||'/'||gen_random_uuid()||'.pdf','card.pdf','application/pdf',1,'accepted',tests.user('em:garson4'),tests.week(1));
select ok(pg_temp.has(app_private.eligibility(tests.id('em'),tests.id('em:garson4'),public.shift_exchange_shift(tests.id('em'),tests.id('em:shift:b')),
 '{"operation":"release_pickup"}'),'blockers','document_expired'),'an expired blocking document keeps Garson4 off the shift');

select * from finish();
rollback;

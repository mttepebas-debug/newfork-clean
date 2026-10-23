begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table wp_fixture as select
 'ad410000-0000-4000-8000-000000000001'::uuid w,
 'ad410000-0000-4000-8000-000000000002'::uuid owner_id,
 'ad410000-0000-4000-8000-000000000003'::uuid actor,
 'ad410000-0000-4000-8000-000000000004'::uuid emp,
 'ad410000-0000-4000-8000-000000000005'::uuid manager,
 'ad410000-0000-4000-8000-000000000006'::uuid loc,
 'ad410000-0000-4000-8000-000000000007'::uuid other_loc,
 'ad410000-0000-4000-8000-000000000008'::uuid dinner,
 'ad410000-0000-4000-8000-000000000009'::uuid hidden_type,
 public.empty_weekly_preference() p;
insert into auth.users(id,email) select owner_id,'weekly-owner@example.test' from wp_fixture
 union all select actor,'weekly-employee@example.test' from wp_fixture
 union all select manager,'weekly-manager@example.test' from wp_fixture;
insert into public.workspaces(id,name,created_by) select w,'Weekly preferences test',owner_id from wp_fixture;
insert into public.workspace_memberships (workspace_id, user_id, role_id, employee_role_id)
select legacy.workspace_id::uuid, legacy.user_id::uuid, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (select w,owner_id,'owner'::public.workspace_role,true from wp_fixture
 union all select w,actor,'employee'::public.workspace_role,false from wp_fixture
 union all select w,manager,'manager'::public.workspace_role,false from wp_fixture) as legacy(workspace_id, user_id, role, all_locations);
insert into public.workspace_scheduling_settings(workspace_id) select w from wp_fixture on conflict do nothing;
insert into public.locations(short_name, id,workspace_id,name,street_address,city,region,postal_code,timezone)
 select 'T00076', loc,w,'West','1 Test Street','Test City','CA','90001','America/Los_Angeles' from wp_fixture
 union all select 'T00077', other_loc,w,'East','2 Test Street','Test City','NY','10001','America/New_York' from wp_fixture;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
 select emp,w,actor,'E-993417','Weekly','Tester',owner_id from wp_fixture;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
 select w,emp,loc,owner_id from wp_fixture union all select w,emp,other_loc,owner_id from wp_fixture;
select tests.works_at(m.id, f.loc) from wp_fixture f join public.workspace_memberships m on m.workspace_id=f.w and m.user_id in(f.actor,f.manager);
insert into public.shift_types(id,workspace_id,name,color,default_start_time,default_end_time)
 select dinner,w,'Dinner','#256b56','17:00'::time,'23:00'::time from wp_fixture
 union all select hidden_type,w,'Private fallback','#256b56','09:00'::time,'12:00'::time from wp_fixture;


create function pg_temp.weekly_assess(changes jsonb default '{}') returns jsonb language sql stable as $$
 select public.assess_weekly_shift_availability(w,emp,jsonb_build_object('id','ad419000-0000-4000-8000-000000000001',
  'employee_id',emp,'location_id',loc,'scheduled_date','2035-01-15','time_basis','explicit',
  'start_time','18:00','end_time','20:00')||changes) from wp_fixture;
$$;
select is(pg_temp.weekly_assess()->>'operation','allowed','no saved week is available');
select is(pg_temp.weekly_assess()->>'coverage','full','missing record is not unknown');
select is(pg_temp.weekly_assess('{"start_time":null,"end_time":null}')->>'operation','warning_requires_override','a proposal without hours is never simply allowed');
select is(pg_temp.weekly_assess('{"start_time":"18:00","end_time":"18:00"}')->>'operation','blocked','a shift that starts when it ends is refused');
select throws_ok($$select pg_temp.weekly_assess('{"location_id":"ad419000-0000-4000-8000-000000000099"}')$$,'22023',null,'unknown location is a technical error');
insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by)
 select w,emp,jsonb_set(public.empty_weekly_preference(),'{days,1,ranges}','[{"start":"17:00","end":"23:00"}]'),1,actor from wp_fixture;
-- BL-186: an availability mark is a warning that never gates the shift.
select is(pg_temp.weekly_assess()->>'has_availability_conflict','true','custom hours overlapping a selected type produce an availability warning');
select is(pg_temp.weekly_assess()->>'operation','allowed','and the warning never gates the shift');
select ok(not (pg_temp.weekly_assess() ?| array['type_restrictions','service_classification']),'no shift type restriction or custom work classification');
select is(pg_temp.weekly_assess(jsonb_build_object('shift_type_id',(select dinner from wp_fixture),'start_time','12:00','end_time','17:00'))->>'has_availability_conflict',
 'false','actual hours trump matching type identity; touching endpoint is clear');
select is(pg_temp.weekly_assess(jsonb_build_object('shift_type_id',(select hidden_type from wp_fixture)))->>'has_availability_conflict',
 'true','different type still conflicts when actual hours overlap');
-- The warning's own fingerprint is what Publish acknowledges (S2 A).
create temp table weekly_fingerprint as select pg_temp.weekly_assess()->>'availability_fingerprint' fp;
select is(pg_temp.weekly_assess('{"time_snapshot":{"captured_at":"2035-01-01T00:00:00Z"}}')->>'availability_fingerprint',(select fp from weekly_fingerprint),
 'snapshot metadata without physical time changes does not re-prompt');
select is(pg_temp.weekly_assess(jsonb_build_object('shift_type_id',(select dinner from wp_fixture)))->>'availability_fingerprint',(select fp from weekly_fingerprint),
 'type label changes without physical time changes do not re-prompt');
insert into public.manager_weekly_reminders(workspace_id,employee_id,preference,revision,updated_by,notes)
 select w,emp,public.empty_weekly_preference(),1,manager,array['','Private note','','','','',''] from wp_fixture;
select is(pg_temp.weekly_assess()->>'availability_fingerprint',(select fp from weekly_fingerprint),'manager note alone does not invalidate acknowledgment');
select ok(position('Private note' in pg_temp.weekly_assess()::text)=0,'assessment does not contain private notes');
update public.employee_weekly_preferences set revision=revision+1,preference=jsonb_set(preference,'{days,2,all_day}','true') where workspace_id=(select w from wp_fixture);
update public.workspace_scheduling_settings set availability_preferences_revision=availability_preferences_revision+1,availability_onboarding_required=true
 where workspace_id=(select w from wp_fixture);
select is(pg_temp.weekly_assess()->>'availability_fingerprint',(select fp from weekly_fingerprint),'unrelated weekday, revision and onboarding setting do not re-prompt');
select isnt(pg_temp.weekly_assess('{"start_time":"19:00"}')->>'availability_fingerprint',(select fp from weekly_fingerprint),'different hours are a different warning');
-- Hours only: a shift type's own default hours never move an employee's week.
update public.shift_types set default_start_time='21:00',default_end_time='02:00' where id=(select dinner from wp_fixture);
select is(pg_temp.weekly_assess()->>'has_availability_conflict','true','a shift type''s default hours do not change the saved hours');
update public.employee_weekly_preferences set preference=jsonb_set(preference,'{days,1,ranges}','[{"start":"21:00","end":"24:00"}]') where workspace_id=(select w from wp_fixture);
select is(pg_temp.weekly_assess()->>'has_availability_conflict','false','the saved hours are what is compared');
select is(pg_temp.weekly_assess('{"scheduled_date":"2035-01-16","start_time":"01:00","end_time":"03:00"}')->>'coverage','none',
 'next-day All day covers the overnight hours');
update public.employee_weekly_preferences set preference=jsonb_set(jsonb_set(preference,'{days,2,all_day}','false'),'{days,2,ranges}','[{"start":"00:00","end":"02:00"}]') where workspace_id=(select w from wp_fixture);
select is(pg_temp.weekly_assess('{"scheduled_date":"2035-01-16","start_time":"01:00","end_time":"03:00"}')->>'coverage','partial',
 'an overnight stretch on the next day leaves the rest of the assignment clear');
update public.manager_weekly_reminders set preference=jsonb_set(preference,'{days,1,ranges}','[{"start":"18:00","end":"19:00"}]') where workspace_id=(select w from wp_fixture);
select is(pg_temp.weekly_assess()->>'coverage','full','a manager note never takes hours away (M12)');
update public.manager_weekly_reminders set enabled=false where workspace_id=(select w from wp_fixture);
select is(pg_temp.weekly_assess()->>'has_availability_conflict','false','off suppresses manager reminder without clearing its week');
update public.employee_weekly_preferences set preference=jsonb_set(public.empty_weekly_preference(),'{days,1,ranges}','[{"start":"18:00","end":"19:00"}]')
 where workspace_id=(select w from wp_fixture);
select is(pg_temp.weekly_assess()->>'has_availability_conflict','true','off does not hide employee conflict');
select is(pg_temp.weekly_assess('{"time_timezone":"America/New_York"}')->>'has_availability_conflict','false',
 'actual saved instant is compared against current target-location local preference');
select is(pg_temp.weekly_assess('{"time_timezone":"America/New_York"}')->>'preference_timezone','America/Los_Angeles','preference timezone remains target location');
select throws_ok($$select pg_temp.weekly_assess('{"time_basis":"type_default","time_snapshot":{"start_time":"17:00","end_time":"22:00"}}')$$,
 '22023',null,'inconsistent saved default snapshot is rejected');
select is(pg_temp.weekly_assess('{"scheduled_date":"2026-03-08","start_time":"02:30","end_time":"04:00"}')->>'operation','blocked',
 'nonexistent spring assignment time is a real blocker');
select is((pg_temp.weekly_assess('{"scheduled_date":"2026-03-08","start_time":"01:30","end_time":"03:30"}')->>'assessment_minutes')::numeric,60::numeric,
 'spring assignment uses physical elapsed duration');
select is((pg_temp.weekly_assess('{"scheduled_date":"2026-11-01","start_time":"00:30","end_time":"02:30"}')->>'assessment_minutes')::numeric,180::numeric,
 'autumn assignment includes repeated hour');
select is(pg_temp.weekly_assess('{"scheduled_date":"2026-11-01","start_time":"01:30","end_time":"02:30"}')->>'fold_resolution','post_transition_offset',
 'ambiguous shift endpoint reports deterministic choice');

select tests.approved_leave(w,emp,actor,other_loc,'2035-01-15','21:00','22:00','ad419000-0000-4000-8000-000000000003') from wp_fixture;
select is(pg_temp.weekly_assess()->>'operation','blocked','approved leave stays blocking, availability mark or not');
select is(pg_temp.weekly_assess()->'leave'->0->'intervals'->0->>'start_at','2035-01-16T02:00:00.000000Z','leave is evaluated in its own saved location timezone');
select is((select count(*) from jsonb_array_elements(pg_temp.weekly_assess()->'reasons') x where x->>'code'='availability'),1::bigint,
 'one combined availability reason independent of approved leave');
-- Waiting for an answer: no `effective` hours yet (time off rebuild D8).
update public.time_off_requests set status='pending',effective='{}',decided_by=null,decided_at=null,revision=revision+1
 where id='ad419000-0000-4000-8000-000000000003';
select is(pg_temp.weekly_assess()->>'operation','allowed','pending leave does not add a hard block');
select ok(not has_function_privilege('authenticated','public.assess_weekly_shift_availability(uuid,uuid,jsonb)','execute'),'employee cannot query raw manager intervals');
select ok(not has_function_privilege('service_role','public.assess_weekly_shift_availability(uuid,uuid,jsonb)','execute'),'internal evaluator has no exposed impersonation RPC');
select * from finish();
rollback;

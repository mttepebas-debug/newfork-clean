begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table wt_fixture as select
 'ad438000-0000-4000-8000-000000000001'::uuid w,
 'ad438000-0000-4000-8000-000000000002'::uuid owner_id,
 'ad438000-0000-4000-8000-000000000003'::uuid actor,
 'ad438000-0000-4000-8000-000000000004'::uuid emp,
 'ad438000-0000-4000-8000-000000000005'::uuid manager,
 'ad438000-0000-4000-8000-000000000006'::uuid loc,
 'ad438000-0000-4000-8000-000000000007'::uuid other_loc,
 'ad438000-0000-4000-8000-000000000008'::uuid dinner,
 'ad438000-0000-4000-8000-000000000009'::uuid hidden_type,
 'ad438000-0000-4000-8000-000000000010'::uuid hidden_emp,
 'ad438000-0000-4000-8000-000000000011'::uuid unassigned,
 'ad438000-0000-4000-8000-000000000012'::uuid undeclared,
 null::uuid manager_record;
insert into auth.users(id,email) select owner_id,'weekly-team-owner@example.test' from wt_fixture
 union all select actor,'weekly-team-employee@example.test' from wt_fixture
 union all select manager,'weekly-team-manager@example.test' from wt_fixture;
insert into public.workspaces(id,name,created_by) select w,'Weekly team test',owner_id from wt_fixture;
insert into public.workspace_memberships(workspace_id,user_id,role,all_locations)
 select w,owner_id,'owner'::public.workspace_role,true from wt_fixture
 union all select w,actor,'employee'::public.workspace_role,false from wt_fixture
 union all select w,manager,'manager'::public.workspace_role,false from wt_fixture;
insert into public.workspace_scheduling_settings(workspace_id) select w from wt_fixture on conflict do nothing;
insert into public.locations(short_name, id,workspace_id,name,street_address,city,region,postal_code,timezone)
 select 'T00078', loc,w,'West','1 Test Street','Test City','CA','90001','America/Los_Angeles' from wt_fixture
 union all select 'T00079', other_loc,w,'East','2 Test Street','Test City','NY','10001','America/New_York' from wt_fixture;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
 select emp,w,actor,'E-993480','Alex','Team',owner_id from wt_fixture
 union all select hidden_emp,w,null,'E-993481','Hidden','Employee',owner_id from wt_fixture
 union all select unassigned,w,null,'E-993482','Unassigned','Employee',owner_id from wt_fixture
 union all select undeclared,w,null,'E-993483','Undeclared','Employee',owner_id from wt_fixture;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
 select w,emp,loc,owner_id from wt_fixture union all select w,emp,other_loc,owner_id from wt_fixture
 union all select w,hidden_emp,other_loc,owner_id from wt_fixture union all select w,undeclared,loc,owner_id from wt_fixture;
-- The manager works at West through their own employee record, so they are one
-- of the people working there (KARARLAR M2; "Müsaitlik okuma = bildirim alıcıları").
update wt_fixture f set manager_record=tests.works_at(m.id, f.loc)
 from public.workspace_memberships m where m.workspace_id=f.w and m.user_id=f.manager;
create function pg_temp.team_ids(reader uuid, ws uuid) returns jsonb language sql as $$
 select coalesce(jsonb_agg(e->>'id' order by e->>'id'),'[]') from jsonb_array_elements(public.weekly_team_read_service(reader,ws)->'employees') e $$;
create function pg_temp.ids(variadic people uuid[]) returns jsonb language sql as $$
 select jsonb_agg(p::text order by p::text) from unnest(people) p $$;
create function pg_temp.team_row(reader uuid, ws uuid, person uuid) returns jsonb language sql as $$
 select e from jsonb_array_elements(public.weekly_team_read_service(reader,ws)->'employees') e where e->>'id'=person::text $$;
insert into public.shift_types(id,workspace_id,name,color,default_start_time,default_end_time)
 select dinner,w,'Dinner','#256b56','17:00'::time,'23:00'::time from wt_fixture
 union all select hidden_type,w,'Private fallback','#256b56','09:00'::time,'12:00'::time from wt_fixture;
insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by)
 select w,emp,public.empty_weekly_preference('time_range'),1,actor from wt_fixture
 union all select w,hidden_emp,jsonb_set(public.empty_weekly_preference('shift_type'),'{days,1,shift_type_ids}',jsonb_build_array(hidden_type)),1,owner_id from wt_fixture;
insert into public.manager_weekly_reminders(workspace_id,employee_id,preference,notes,revision,updated_by)
 select w,emp,jsonb_set(public.empty_weekly_preference('shift_type'),'{days,1,shift_type_ids}',jsonb_build_array(hidden_type)),array['secret manager note','','','','','',''],1,owner_id from wt_fixture;

select lives_ok($$select public.weekly_team_read_service(manager,w) from wt_fixture$$,'scoped manager reads team');
select is(pg_temp.team_ids(manager,w),pg_temp.ids(emp,undeclared,manager_record),'scoped manager sees the people working at their location, their own record included') from wt_fixture;
select is(pg_temp.team_ids(owner_id,w),pg_temp.ids(emp,hidden_emp,unassigned,undeclared,manager_record),'all-location owner also sees unassigned employee') from wt_fixture;
select is(public.weekly_team_read_service(manager,w)->'locations',jsonb_build_array(jsonb_build_object('id',loc,'name','West')),'location list does not disclose other location') from wt_fixture;
select is(pg_temp.team_row(manager,w,emp)->'location_ids',jsonb_build_array(loc),'multi-location employee returns only visible location ids') from wt_fixture;
select is(pg_temp.team_row(manager,w,emp)->>'submitted','true','explicit fully available week is submitted') from wt_fixture;
select is(pg_temp.team_row(manager,w,undeclared)->>'submitted','false','absent record is not submitted') from wt_fixture;
select is(pg_temp.team_row(manager,w,undeclared)->'preference',public.empty_weekly_preference('time_range'),'absent record projects a fully available week') from wt_fixture;
select is(public.weekly_team_read_service(manager,w)->'shift_types','[]'::jsonb,'hidden employee and manager reminder types are not disclosed') from wt_fixture;
select ok(not (public.weekly_team_read_service(manager,w)::text like '%secret manager note%'),'manager notes never enter team response') from wt_fixture;
select is((select count(*) from public.employee_weekly_preferences where workspace_id=(select w from wt_fixture)),2::bigint,'read does not manufacture declarations');
select is((select count(*) from public.weekly_preference_events where workspace_id=(select w from wt_fixture)),0::bigint,'read does not manufacture audit events');
select throws_ok($$select public.weekly_team_read_service(actor,w) from wt_fixture$$,'42501',null,'employee cannot read the team');
select throws_ok($$select public.weekly_team_read_service(gen_random_uuid(),w) from wt_fixture$$,'42501',null,'foreign actor cannot read the team');
select throws_ok($$select public.weekly_team_read_service(owner_id,gen_random_uuid()) from wt_fixture$$,'42501',null,'owner cannot cross workspaces');
select ok(not has_function_privilege('authenticated','public.weekly_team_read_service(uuid,uuid)','EXECUTE'),'authenticated cannot spoof service actor');
select ok(not has_function_privilege('anon','public.weekly_team_read_service(uuid,uuid)','EXECUTE'),'anonymous cannot invoke service read');
select ok(has_function_privilege('service_role','public.weekly_team_read_service(uuid,uuid)','EXECUTE'),'service role can invoke the read');

update public.employee_weekly_preferences set preference=jsonb_set(public.empty_weekly_preference('shift_type'),'{days,1,shift_type_ids}',jsonb_build_array((select dinner from wt_fixture))) where employee_id=(select emp from wt_fixture);
update public.shift_types set default_start_time='18:00' where id=(select dinner from wt_fixture);
select is(public.weekly_team_read_service(manager,w)->'shift_types'->0->>'start_time','18:00','selected type uses current settings hours') from wt_fixture;
update public.shift_types set archived_at=now() where id=(select dinner from wt_fixture);
select is(public.weekly_team_read_service(manager,w)->'shift_types'->0->>'archived','true','archived type stays visible as unavailable') from wt_fixture;
select is(public.weekly_team_read_service(manager,w)->'shift_types'->0->>'start_time','18:00','archived type retains captured hours') from wt_fixture;
update public.workspace_scheduling_settings set availability_input_mode='shift_type' where workspace_id=(select w from wt_fixture);
select is(pg_temp.team_row(manager,w,undeclared)->'preference'->>'input_mode','shift_type','undeclared week follows organization mode') from wt_fixture;
-- A role without availability.read (and so without availability.manage, which
-- needs it) keeps schedule.read but cannot read the team.
delete from public.workspace_role_permissions p using public.workspace_memberships m where p.role_id=m.role_id and m.user_id=(select manager from wt_fixture) and p.permission_key in ('availability.read','availability.manage');
select throws_ok($$select public.weekly_team_read_service(manager,w) from wt_fixture$$,'42501',null,'manager without availability read is denied');
update public.employee_profiles set archived_at=now() where id=(select emp from wt_fixture);
select is(pg_temp.team_ids(owner_id,w),pg_temp.ids(hidden_emp,unassigned,undeclared,manager_record),'archived employee excluded') from wt_fixture;
select * from finish();
rollback;

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
 public.empty_weekly_preference('time_range') p;
insert into auth.users(id,email) select owner_id,'weekly-owner@example.test' from wp_fixture
 union all select actor,'weekly-employee@example.test' from wp_fixture
 union all select manager,'weekly-manager@example.test' from wp_fixture;
insert into public.workspaces(id,name,created_by) select w,'Weekly preferences test',owner_id from wp_fixture;
insert into public.workspace_memberships(workspace_id,user_id,role,all_locations)
 select w,owner_id,'owner'::public.workspace_role,true from wp_fixture
 union all select w,actor,'employee'::public.workspace_role,false from wp_fixture
 union all select w,manager,'manager'::public.workspace_role,false from wp_fixture;
insert into public.workspace_scheduling_settings(workspace_id) select w from wp_fixture on conflict do nothing;
insert into public.locations(short_name, id,workspace_id,name,street_address,city,region,postal_code,timezone)
 select 'T00050', loc,w,'West','1 Test Street','Test City','CA','90001','America/Los_Angeles' from wp_fixture
 union all select 'T00051', other_loc,w,'East','2 Test Street','Test City','NY','10001','America/New_York' from wp_fixture;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
 select emp,w,actor,'E-993417','Weekly','Tester',owner_id from wp_fixture;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
 select w,emp,loc,owner_id from wp_fixture union all select w,emp,other_loc,owner_id from wp_fixture;
select tests.works_at(m.id, f.loc) from wp_fixture f join public.workspace_memberships m on m.workspace_id=f.w and m.user_id in(f.actor,f.manager);
insert into public.shift_types(id,workspace_id,name,color,default_start_time,default_end_time)
 select dinner,w,'Dinner','#256b56','17:00'::time,'23:00'::time from wp_fixture
 union all select hidden_type,w,'Private fallback','#256b56','09:00'::time,'12:00'::time from wp_fixture;

select ok(public.weekly_preference_valid(p),'empty seven-day week is valid') from wp_fixture;
select ok(not public.weekly_preference_valid(null),'null is not a week');
select ok(not public.weekly_preference_valid(jsonb_set(p,'{days,1,day}','0')),'duplicate weekdays rejected') from wp_fixture;
select ok(not public.weekly_preference_valid(jsonb_set(p,'{days,1,ranges}','[{"start":"17:00","end":"09:00"}]')),'manual overnight range rejected') from wp_fixture;
select ok(not public.weekly_preference_valid(jsonb_set(p,'{days,1,ranges}','[{"start":"09:00","end":"09:00"}]')),'empty range rejected') from wp_fixture;
select ok(not public.weekly_preference_valid(jsonb_set(p,'{days,1,ranges}','[{"start":"24:00","end":"24:00"}]')),'24:00 cannot start a range') from wp_fixture;
select ok(not public.weekly_preference_valid(jsonb_set(p,'{days,1,ranges}','[{"start":null,"end":"17:00"}]')),'malformed time is not available') from wp_fixture;
select ok(not public.weekly_preference_valid(jsonb_set(p,'{days,1,shift_type_ids}',jsonb_build_array(dinner))),'mode mixing rejected') from wp_fixture;
select ok(public.weekly_preference_valid(jsonb_set(p,'{days,1,ranges}','[{"start":"00:00","end":"24:00"}]')),'whole calendar range accepted') from wp_fixture;
-- Several hours a day (M4, S2 a): in order, apart, never the old single range.
select ok(public.weekly_preference_valid(jsonb_set(p,'{days,1,ranges}','[{"start":"09:00","end":"14:00"},{"start":"17:00","end":"24:00"}]')),'two ranges in a day accepted') from wp_fixture;
select ok(not public.weekly_preference_valid(jsonb_set(p,'{days,1,ranges}','[{"start":"09:00","end":"14:00"},{"start":"13:00","end":"15:00"}]')),'overlapping ranges rejected') from wp_fixture;
select ok(not public.weekly_preference_valid(jsonb_set(p,'{days,1,ranges}','[{"start":"17:00","end":"18:00"},{"start":"09:00","end":"10:00"}]')),'ranges out of order rejected') from wp_fixture;
select ok(not public.weekly_preference_valid(jsonb_set(p,'{days,1,ranges}','[{"start":"09:00","end":"10:00"},{"start":"10:00","end":"11:00"}]')),'touching ranges are one range, not two') from wp_fixture;
select ok(not public.weekly_preference_valid(jsonb_set(p,'{days,1,range}','{"start":"09:00","end":"10:00"}')),'the old single range is gone') from wp_fixture;

select is(public.weekly_preferences_read_service(actor,w)->'employee'->>'submitted','false','never submitted remains distinct') from wp_fixture;
select is(public.weekly_preferences_read_service(actor,w)->'manager','null'::jsonb,'employee cannot read private reminders') from wp_fixture;
select is(public.weekly_preferences_read_service(manager,w,emp)->>'can_manage','true','one managed location is enough even for a multi-location employee') from wp_fixture;
select throws_ok($$select public.weekly_preferences_read_service(gen_random_uuid(),w,emp) from wp_fixture$$,'42501',null,'unrelated actor cannot read');
select is(public.weekly_preference_capacity(w,emp,'[2035-01-15 09:00Z,2035-01-15 17:00Z)','UTC')->'employee_intervals','[]'::jsonb,'no record is available') from wp_fixture;

update wp_fixture set p=jsonb_set(p,'{days,1,ranges}','[{"start":"09:00","end":"17:00"}]');
select is(public.weekly_preference_intersections(w,p,'[2035-01-15 17:00Z,2035-01-15 18:00Z)','UTC'),'{}'::tstzmultirange,'touching endpoints do not conflict') from wp_fixture;
select is(public.weekly_preference_intersections(w,p,'[2035-01-15 16:59Z,2035-01-15 18:00Z)','UTC'),'{[2035-01-15 16:59Z,2035-01-15 17:00Z)}'::tstzmultirange,'any positive overlap conflicts') from wp_fixture;
select is(public.weekly_preference_intersections(w,p,'[2035-01-15 17:00Z,2035-01-15 18:00Z)','America/Los_Angeles'),'{[2035-01-15 17:00Z,2035-01-15 18:00Z)}'::tstzmultirange,'uses the target location wall clock') from wp_fixture;
select throws_ok($$select public.weekly_preference_intersections(w,p,'[2035-01-15 17:00Z,2035-01-15 18:00Z)','Invalid/Zone') from wp_fixture$$,'22023',null,'unknown timezone fails closed');

insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by) select w,emp,p,1,actor from wp_fixture;
insert into public.manager_weekly_reminders(workspace_id,employee_id,preference,revision,updated_by,notes)
 select w,emp,jsonb_set(public.empty_weekly_preference('time_range'),'{days,1,ranges}','[{"start":"16:00","end":"20:00"}]'),1,manager,array['','Private manager note','','','','',''] from wp_fixture;
select is(public.weekly_preference_capacity(w,emp,'[2035-01-15 09:00Z,2035-01-15 21:00Z)','UTC'),
 jsonb_build_object('employee_intervals',public.availability_ranges_json('{[2035-01-15 09:00Z,2035-01-15 17:00Z)}'::tstzmultirange),
  'manager_intervals',public.availability_ranges_json('{[2035-01-15 16:00Z,2035-01-15 20:00Z)}'::tstzmultirange)),
 'the mark and the note come back apart and are never joined (M12)') from wp_fixture;
select is(public.weekly_preferences_read_service(actor,w)->'manager','null'::jsonb,'employee response still excludes saved reminders and notes') from wp_fixture;
select is(public.weekly_preferences_read_service(manager,w,emp)->'manager'->'notes'->>1,'Private manager note','scoped manager can read shared notes') from wp_fixture;
update public.manager_weekly_reminders set enabled=false where workspace_id=(select w from wp_fixture);
select is(public.weekly_preference_capacity(w,emp,'[2035-01-15 17:00Z,2035-01-15 20:00Z)','UTC')->'manager_intervals','[]'::jsonb,'disabled reminders do not warn') from wp_fixture;
select is(public.weekly_preferences_read_service(manager,w,emp)->'manager'->'notes'->>1,'Private manager note','disabled reminders retain notes') from wp_fixture;
update public.manager_weekly_reminders set enabled=true,preference=public.empty_weekly_preference('time_range') where workspace_id=(select w from wp_fixture);
select is(public.weekly_preference_capacity(w,emp,'[2035-01-15 17:00Z,2035-01-15 20:00Z)','UTC')->'manager_intervals','[]'::jsonb,'notes alone never warn') from wp_fixture;

update wp_fixture set p=jsonb_set(public.empty_weekly_preference('shift_type'),'{days,1,shift_type_ids}',jsonb_build_array(dinner));
select is(public.weekly_preference_intersections(w,p,'[2035-01-15 12:00Z,2035-01-15 16:00Z)','UTC'),'{}'::tstzmultirange,'selected type does not restrict hours outside its defaults') from wp_fixture;
select is(public.weekly_preference_intersections(w,p,'[2035-01-15 18:00Z,2035-01-15 20:00Z)','UTC'),'{[2035-01-15 18:00Z,2035-01-15 20:00Z)}'::tstzmultirange,'selected type restricts its actual hours') from wp_fixture;
update public.shift_types set default_start_time='21:00',default_end_time='02:00' where id=(select dinner from wp_fixture);
select is(public.weekly_preference_intersections(w,p,'[2035-01-15 18:00Z,2035-01-15 20:00Z)','UTC'),'{}'::tstzmultirange,'current default changes follow silently') from wp_fixture;
select is(public.weekly_preference_intersections(w,p,'[2035-01-16 01:00Z,2035-01-16 03:00Z)','UTC'),'{[2035-01-16 01:00Z,2035-01-16 02:00Z)}'::tstzmultirange,'type spills into next day') from wp_fixture;
select is(public.weekly_preference_intersections(w,jsonb_set(jsonb_set(p,'{days,1,shift_type_ids}','[]'),'{days,6,shift_type_ids}',jsonb_build_array(dinner)),
 '[2035-01-21 01:00Z,2035-01-21 03:00Z)','UTC'),'{[2035-01-21 01:00Z,2035-01-21 02:00Z)}'::tstzmultirange,'overnight wraps Saturday to Sunday') from wp_fixture;
update public.shift_types set archived_at=now() where id=(select dinner from wp_fixture);
update public.shift_types set default_start_time=null,default_end_time=null where id=(select dinner from wp_fixture);
select is(public.weekly_preference_intersections(w,p,'[2035-01-16 01:00Z,2035-01-16 03:00Z)','UTC'),'{[2035-01-16 01:00Z,2035-01-16 02:00Z)}'::tstzmultirange,'archive keeps last valid hours') from wp_fixture;
update public.shift_types set default_start_time='09:00',default_end_time='12:00' where id=(select dinner from wp_fixture);
delete from public.shift_types where id=(select dinner from wp_fixture);
select is(public.weekly_preference_intersections(w,p,'[2035-01-16 01:00Z,2035-01-16 03:00Z)','UTC'),'{[2035-01-16 01:00Z,2035-01-16 02:00Z)}'::tstzmultirange,'deletion keeps the archive snapshot even if inactive defaults were edited') from wp_fixture;
select throws_ok($$select public.weekly_preference_intersections(w,jsonb_set(p,'{days,1,shift_type_ids}',jsonb_build_array(gen_random_uuid())),'[2035-01-15 17:00Z,2035-01-15 18:00Z)','UTC') from wp_fixture$$,'22023',null,'missing type data is not silently available');

update public.shift_types set archived_at=now() where id=(select hidden_type from wp_fixture);
update public.manager_weekly_reminders set preference=jsonb_set(public.empty_weekly_preference('shift_type'),'{days,1,shift_type_ids}',jsonb_build_array((select hidden_type from wp_fixture))) where workspace_id=(select w from wp_fixture);
select is((select count(*) from wp_fixture f cross join lateral jsonb_array_elements(public.weekly_preferences_read_service(actor,w)->'shift_types') t where t->>'id'=hidden_type::text),0::bigint,'employee catalog does not leak reminder-only archived selections');
select is((select count(*) from wp_fixture f cross join lateral jsonb_array_elements(public.weekly_preferences_read_service(manager,w,emp)->'shift_types') t where t->>'id'=hidden_type::text),1::bigint,'manager catalog retains its own archived selections');

update wp_fixture set p=jsonb_set(public.empty_weekly_preference('time_range'),'{days,0,ranges}','[{"start":"01:15","end":"01:45"}]');
select is(public.weekly_preference_intersections(w,p,'[2026-11-01 08:00Z,2026-11-01 10:00Z)','America/Los_Angeles'),
 '{[2026-11-01 08:15Z,2026-11-01 08:45Z),[2026-11-01 09:15Z,2026-11-01 09:45Z)}'::tstzmultirange,'autumn repeated hour covers both occurrences') from wp_fixture;
update wp_fixture set p=jsonb_set(p,'{days,0,ranges}','[{"start":"02:15","end":"02:45"}]');
select is(public.weekly_preference_intersections(w,p,'[2026-03-08 09:00Z,2026-03-08 12:00Z)','America/Los_Angeles'),'{}'::tstzmultirange,'nonexistent spring wall hours do not shift forward') from wp_fixture;
update wp_fixture set p=jsonb_set(jsonb_set(p,'{days,0,ranges}','[]'),'{days,0,all_day}','true');
select is(public.weekly_preference_intersections(w,p,'[2026-03-08 08:00Z,2026-03-09 08:00Z)','America/Los_Angeles'),
 '{[2026-03-08 08:00Z,2026-03-09 07:00Z)}'::tstzmultirange,'All day is a 23-hour calendar day at spring transition') from wp_fixture;

select ok(not has_table_privilege('authenticated','public.manager_weekly_reminders','select'),'no direct reminder table reads');
select ok(not has_table_privilege('authenticated','public.employee_weekly_preferences','update'),'no direct preference writes');
select ok(not has_function_privilege('authenticated','public.weekly_preferences_read_service(uuid,uuid,uuid)','execute'),'client cannot impersonate a read actor');
select ok(not has_function_privilege('service_role','public.weekly_preference_capacity(uuid,uuid,tstzrange,text,jsonb)','execute'),'internal evidence is not a public RPC');
select ok((select bool_and(relrowsecurity) from pg_class where oid in('public.employee_weekly_preferences'::regclass,'public.manager_weekly_reminders'::regclass,'public.weekly_preference_type_defaults'::regclass)),'all added public tables have RLS');
select * from finish();
rollback;

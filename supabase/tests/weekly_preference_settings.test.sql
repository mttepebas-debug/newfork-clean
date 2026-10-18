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
 select 'T00064', loc,w,'West','1 Test Street','Test City','CA','90001','America/Los_Angeles' from wp_fixture
 union all select 'T00065', other_loc,w,'East','2 Test Street','Test City','NY','10001','America/New_York' from wp_fixture;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
 select emp,w,actor,'E-993417','Weekly','Tester',owner_id from wp_fixture;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
 select w,emp,loc,owner_id from wp_fixture union all select w,emp,other_loc,owner_id from wp_fixture;
select tests.works_at(m.id, f.loc) from wp_fixture f join public.workspace_memberships m on m.workspace_id=f.w and m.user_id in(f.actor,f.manager);
insert into public.shift_types(id,workspace_id,name,color,default_start_time,default_end_time)
 select dinner,w,'Dinner','#256b56','17:00'::time,'23:00'::time from wp_fixture
 union all select hidden_type,w,'Private fallback','#256b56','09:00'::time,'12:00'::time from wp_fixture;

create function pg_temp.settings_save(changes jsonb default '{}', key_suffix integer default 1, acting uuid default null) returns jsonb language sql as $$
 select public.weekly_preference_settings_save_service(coalesce(acting,owner_id),w,
  '{"onboarding_required":true,"expected_revision":0}'::jsonb||changes,
  ('ad420000-0000-4000-8000-'||lpad(key_suffix::text,12,'0'))::uuid) from wp_fixture;
$$;
select is(public.weekly_preference_settings_read_service(owner_id,w)->>'can_edit','true','owner can edit settings') from wp_fixture;
select is(public.weekly_preference_settings_read_service(manager,w)->>'can_edit','false','ordinary manager cannot edit organization availability settings') from wp_fixture;
select throws_like($x$select public.weekly_preference_settings_read_service(actor,w) from wp_fixture$x$,'Not allowed','an employee does not read the organization''s availability settings (the core: settings.availability.read)');
select throws_ok($$select public.weekly_preference_settings_read_service(gen_random_uuid(),w) from wp_fixture$$,'42501',null,'nonmember cannot read another organization');
select throws_ok($$select pg_temp.settings_save('{}',1,(select manager from wp_fixture))$$,'42501',null,'manager save rejected in database');
select throws_ok($$select pg_temp.settings_save('{"onboarding_required":null}')$$,'22023',null,'null required flag rejected');
-- Availability is hours only (AVAIL-GUN-DB): no entry mode to read or save.
select is(public.weekly_preference_settings_read_service(owner_id,w),
 jsonb_build_object('settings',jsonb_build_object('onboarding_required',false,'revision',0),'can_edit',true),
 'the settings are whether onboarding asks for availability, and nothing else') from wp_fixture;
select throws_ok($$select pg_temp.settings_save('{"input_mode":"time_range"}')$$,'22023',null,'an entry mode is no longer a setting');
select hasnt_column('public','workspace_scheduling_settings','availability_input_mode','the organization has no availability entry mode');
select is((select count(*) from public.audit_events where workspace_id=(select w from wp_fixture) and action='availability.settings_updated'),0::bigint,'refused saves create no audit');
-- A shift type's default hours are its own rule, whatever availability asks.
select throws_ok($$insert into public.shift_types(workspace_id,name,color) select w,'Missing new type','#256b56' from wp_fixture$$,'22023',null,'new types always require default hours');
alter table public.shift_types disable trigger weekly_preference_type_hours;
update public.shift_types set default_start_time=null,default_end_time=null where id=(select dinner from wp_fixture);
alter table public.shift_types enable trigger weekly_preference_type_hours;
select lives_ok($$update public.shift_types set name='Dinner renamed' where id=(select dinner from wp_fixture)$$,'old incomplete catalog can still be renamed before repair');
update public.shift_types set default_start_time='21:00',default_end_time='02:00' where id=(select dinner from wp_fixture);
insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by)
 select w,emp,jsonb_set(p,'{days,1,all_day}','true'),1,actor from wp_fixture;
insert into public.manager_weekly_reminders(workspace_id,employee_id,preference,revision,updated_by,notes)
 select w,emp,jsonb_set(p,'{days,2,all_day}','true'),1,manager,array['','Private manager note','','','','',''] from wp_fixture;
select is(pg_temp.settings_save()->'settings'->>'revision','1','the onboarding setting saves and increments only the availability revision');
select is(pg_temp.settings_save()->'settings'->>'revision','1','same-key retry returns current settings');
select is((select preference from public.employee_weekly_preferences where workspace_id=(select w from wp_fixture)),jsonb_set(p,'{days,1,all_day}','true'),'a saved week is left as it was') from wp_fixture;
select is((select preference->'days'->2->>'all_day' from public.manager_weekly_reminders where workspace_id=(select w from wp_fixture)),'true','manager rules are left as they were');
select throws_ok($$select pg_temp.settings_save('{"onboarding_required":false}')$$,'22023',null,'key cannot be reused for another payload');
select throws_ok($$select pg_temp.settings_save('{"onboarding_required":false}',2)$$,'PT409',null,'stale revision cannot overwrite settings');
select is(pg_temp.settings_save('{"onboarding_required":false,"expected_revision":1}',2)->'settings'->>'revision','2','the onboarding setting saves again');
select is(pg_temp.settings_save('{"onboarding_required":false,"expected_revision":2}',3)->'settings'->>'revision','2','no-op save does not change revision');
select is((select count(*) from public.audit_events where workspace_id=(select w from wp_fixture) and action='availability.settings_updated'),2::bigint,'only effective setting changes have audit events');
select throws_ok($$update public.shift_types set default_start_time=null,default_end_time=null where id=(select dinner from wp_fixture)$$,'22023',null,'active defaults cannot be cleared');
update public.shift_types set archived_at=now() where id=(select dinner from wp_fixture);
update public.shift_types set default_start_time=null,default_end_time=null where id=(select dinner from wp_fixture);
select throws_ok($$update public.shift_types set archived_at=null where id=(select dinner from wp_fixture)$$,'22023',null,'restoring a type requires valid defaults');
select is((select count(*) from public.employee_weekly_preferences where workspace_id=(select w from wp_fixture)),1::bigint,'settings saves do not invent employee records');
select ok(not has_function_privilege('authenticated','public.weekly_preference_settings_save_service(uuid,uuid,jsonb,uuid)','execute'),'clients cannot impersonate settings actor');
select ok(not has_function_privilege('authenticated','public.weekly_preference_settings_read_service(uuid,uuid)','execute'),'read actor must come from API');
select * from finish();
rollback;

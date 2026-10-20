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
insert into public.workspace_memberships (workspace_id, user_id, role_id, employee_role_id)
select legacy.workspace_id::uuid, legacy.user_id::uuid, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (select w,owner_id,'owner'::public.workspace_role,true from wt_fixture
 union all select w,actor,'employee'::public.workspace_role,false from wt_fixture
 union all select w,manager,'manager'::public.workspace_role,false from wt_fixture) as legacy(workspace_id, user_id, role, all_locations);
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
-- The manager works at West through their own employee record. Only an employee
-- enters availability (M13), so that record is never listed and never counted as
-- a week not submitted (KK-178, S-32; BL-789).
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
insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by,updated_at)
 select w,emp,public.empty_weekly_preference(),1,actor,'2035-01-02 03:04:05+00' from wt_fixture
 union all select w,hidden_emp,jsonb_set(public.empty_weekly_preference(),'{days,1,ranges}','[{"start":"09:00","end":"12:00"}]'),1,owner_id,now() from wt_fixture;
insert into public.manager_weekly_reminders(workspace_id,employee_id,preference,notes,revision,updated_by)
 select w,emp,jsonb_set(public.empty_weekly_preference(),'{days,1,ranges}','[{"start":"09:00","end":"12:00"}]'),array['secret manager note','','','','','',''],1,owner_id from wt_fixture;
-- The job the Employees list names: the primary; failing that the first active job A to Z.
insert into public.jobs(id,workspace_id,name) select 'ad438000-0000-4000-8000-000000000015'::uuid,w,'Server' from wt_fixture
 union all select 'ad438000-0000-4000-8000-000000000016'::uuid,w,'Bartender' from wt_fixture
 union all select 'ad438000-0000-4000-8000-000000000017'::uuid,w,'Host' from wt_fixture;
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,is_primary,created_by)
 select w,emp,'ad438000-0000-4000-8000-000000000015'::uuid,true,owner_id from wt_fixture
 union all select w,emp,'ad438000-0000-4000-8000-000000000016'::uuid,false,owner_id from wt_fixture
 union all select w,undeclared,'ad438000-0000-4000-8000-000000000017'::uuid,false,owner_id from wt_fixture
 union all select w,undeclared,'ad438000-0000-4000-8000-000000000016'::uuid,false,owner_id from wt_fixture;

select lives_ok($$select public.weekly_team_read_service(manager,w) from wt_fixture$$,'scoped manager reads team');
select is(pg_temp.team_ids(manager,w),pg_temp.ids(emp,undeclared),'scoped manager sees the employees working at their location, not their own manager record') from wt_fixture;
select is(pg_temp.team_ids(owner_id,w),pg_temp.ids(emp,hidden_emp,unassigned,undeclared),'all-location owner also sees unassigned employee, and no manager') from wt_fixture;
-- An admin with an employee record at West is not listed either; a person not yet
-- joined (no account, so no role above employee) still is.
insert into auth.users(id,email) select gen_random_uuid(),'weekly-team-admin@example.test';
insert into public.workspace_memberships (workspace_id, user_id, role_id, employee_role_id)
select legacy.workspace_id::uuid, legacy.user_id::uuid, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (select f.w,u.id,'admin'::public.workspace_role,true from wt_fixture f,auth.users u where u.email='weekly-team-admin@example.test') as legacy(workspace_id, user_id, role, all_locations);
select tests.works_at(m.id,f.loc) from wt_fixture f join public.workspace_memberships m on m.workspace_id=f.w
 join auth.users u on u.id=m.user_id and u.email='weekly-team-admin@example.test';
select is(pg_temp.team_ids(owner_id,w),pg_temp.ids(emp,hidden_emp,unassigned,undeclared),'an admin working at West is not listed') from wt_fixture;
select is(pg_temp.team_ids(manager,w),pg_temp.ids(emp,undeclared),'nor shown to the West manager') from wt_fixture;
-- Somebody invited but not joined yet has no account to rank by: the role they
-- were invited with decides. An invited manager is not listed; an invited
-- employee is.
create temp table wt_invited as select
 'ad438000-0000-4000-8000-000000000013'::uuid invited_manager,
 'ad438000-0000-4000-8000-000000000014'::uuid invited_employee;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
 select i.invited_manager,f.w,null::uuid,'E-993486','Invited','Manager',f.owner_id from wt_fixture f,wt_invited i
 union all select i.invited_employee,f.w,null,'E-993487','Invited','Employee',f.owner_id from wt_fixture f,wt_invited i;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
 select f.w,i.invited_manager,f.loc,f.owner_id from wt_fixture f,wt_invited i
 union all select f.w,i.invited_employee,f.loc,f.owner_id from wt_fixture f,wt_invited i;
-- The invited manager's invitation names the management access, the employee's the employee one (DAVET-ERISIM).
insert into public.employee_invitations(workspace_id,employee_id,email,employee_role_id,management_role_id,token_hash,expires_at,created_by)
 select f.w,i.invited_manager,'weekly-team-invited-manager@example.test',null,
  (select m.role_id from public.workspace_memberships m where m.workspace_id=f.w and m.user_id=f.manager),
  encode(extensions.digest('weekly-team-invited-manager','sha256'),'hex'),now()+interval '7 days',f.owner_id from wt_fixture f,wt_invited i
 union all select f.w,i.invited_employee,'weekly-team-invited-employee@example.test',
  (select m.employee_role_id from public.workspace_memberships m where m.workspace_id=f.w and m.user_id=f.actor),null,
  encode(extensions.digest('weekly-team-invited-employee','sha256'),'hex'),now()+interval '7 days',f.owner_id from wt_fixture f,wt_invited i;
select is(pg_temp.team_ids(manager,w),pg_temp.ids(emp,undeclared,i.invited_employee),'an invited employee is listed, an invited manager is not') from wt_fixture,wt_invited i;
select is(pg_temp.team_ids(owner_id,w),pg_temp.ids(emp,hidden_emp,unassigned,undeclared,i.invited_employee),'the owner sees the same') from wt_fixture,wt_invited i;
select is(public.weekly_team_read_service(manager,w)->'locations',jsonb_build_array(jsonb_build_object('id',loc,'name','West')),'location list does not disclose other location') from wt_fixture;
select is(pg_temp.team_row(manager,w,emp)->'location_ids',jsonb_build_array(loc),'multi-location employee returns only visible location ids') from wt_fixture;
select is(pg_temp.team_row(manager,w,emp)->>'submitted','true','explicit fully available week is submitted') from wt_fixture;
-- can_open is availability.team_read on the person, the same reach that lists them:
-- whoever is listed opens (an unassigned person only through org-wide reach).
select is(pg_temp.team_row(manager,w,emp)->>'can_open','true','scoped manager can open a listed employee drawer') from wt_fixture;
select ok((select bool_and((e->>'can_open')::boolean) from jsonb_array_elements(public.weekly_team_read_service(owner_id,w)->'employees') e),'all-location owner opens every listed person, unassigned included') from wt_fixture;
select is(pg_temp.team_row(manager,w,undeclared)->>'submitted','false','absent record is not submitted') from wt_fixture;
select is(pg_temp.team_row(manager,w,undeclared)->'preference',public.empty_weekly_preference(),'absent record projects a fully available week') from wt_fixture;
-- Each row names the person's job and when their own week was last saved (AVAIL-GUN-DB).
select is(pg_temp.team_row(manager,w,emp)->>'job_name','Server','the primary job is the one named') from wt_fixture;
select is(pg_temp.team_row(manager,w,undeclared)->>'job_name','Bartender','without a primary, the first job A to Z') from wt_fixture;
select is(pg_temp.team_row(owner_id,w,unassigned)->'job_name','null'::jsonb,'nobody with no job has a job name') from wt_fixture;
select is((pg_temp.team_row(manager,w,emp)->>'updated_at')::timestamptz,'2035-01-02 03:04:05+00'::timestamptz,'the week''s own save time') from wt_fixture;
select is(pg_temp.team_row(manager,w,undeclared)->'updated_at','null'::jsonb,'a week never saved has no save time') from wt_fixture;
select ok(not (public.weekly_team_read_service(manager,w) ? 'shift_types'),'the team read carries no shift type catalog') from wt_fixture;
select ok(not (public.weekly_team_read_service(manager,w)::text like '%secret manager note%'),'manager notes never enter team response') from wt_fixture;
select is((select count(*) from public.employee_weekly_preferences where workspace_id=(select w from wt_fixture)),2::bigint,'read does not manufacture declarations');
select is((select count(*) from public.weekly_preference_events where workspace_id=(select w from wt_fixture)),0::bigint,'read does not manufacture audit events');
select throws_ok($$select public.weekly_team_read_service(actor,w) from wt_fixture$$,'42501',null,'employee cannot read the team');
select throws_ok($$select public.weekly_team_read_service(gen_random_uuid(),w) from wt_fixture$$,'42501',null,'foreign actor cannot read the team');
select throws_ok($$select public.weekly_team_read_service(owner_id,gen_random_uuid()) from wt_fixture$$,'42501',null,'owner cannot cross workspaces');
select ok(not has_function_privilege('authenticated','public.weekly_team_read_service(uuid,uuid)','EXECUTE'),'authenticated cannot spoof service actor');
select ok(not has_function_privilege('anon','public.weekly_team_read_service(uuid,uuid)','EXECUTE'),'anonymous cannot invoke service read');
select ok(has_function_privilege('service_role','public.weekly_team_read_service(uuid,uuid)','EXECUTE'),'service role can invoke the read');

-- A role without availability.read (and so without availability.manage, which
-- needs it) keeps schedule.read but cannot read the team.
delete from public.workspace_role_permissions p using public.workspace_memberships m where p.role_id=m.role_id and m.user_id=(select manager from wt_fixture) and p.permission_key in ('availability.read','availability.manage');
select throws_ok($$select public.weekly_team_read_service(manager,w) from wt_fixture$$,'42501',null,'manager without availability read is denied');
update public.employee_profiles set archived_at=now() where id=(select emp from wt_fixture);
select is(pg_temp.team_ids(owner_id,w),pg_temp.ids(hidden_emp,unassigned,undeclared,i.invited_employee),'archived employee excluded') from wt_fixture,wt_invited i;
select * from finish();
rollback;

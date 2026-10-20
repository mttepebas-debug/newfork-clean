begin;
-- BL-1045: an Employees, Jobs or Locations write refused with PT409 says which
-- kind of refusal in its hint. "Someone changed or deleted it meanwhile,
-- reload" and a standing "this cannot happen" shared the one code and no key,
-- so a screen could only guess (the job drawer offered Reload for every error).
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

create function pg_temp.refusal(statement text) returns text language plpgsql as $$
declare state text; key text;
begin
 execute statement;
 return 'no refusal';
exception when others then
 get stacked diagnostics state=returned_sqlstate, key=pg_exception_hint;
 return state||' '||coalesce(nullif(key,''),'(no hint)');
end;
$$;

-- Every PT409 these functions raise carries one of the known keys.
create temp table refusal_functions as
select p.oid, n.nspname||'.'||p.proname fn
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname||'.'||p.proname = any(array[
 'app_private.guard_assignment_deleted_job','app_private.guard_catalog_deletion_state','app_private.guard_deleted_department_job',
 'app_private.guard_deleted_location_assignment','public.create_employee_command_service','public.update_job_assignments_service',
 'public.update_job_details_and_assignments_service']);
create temp table refusal_raises as
select fn, m[1] statement
from refusal_functions, regexp_matches(pg_get_functiondef(oid), $re$(raise\s+exception\s+'(?:[^']|'')*'[^;]*;)$re$, 'gi') m
where m[1] ~* 'PT409';
select is((select count(distinct fn)::int from refusal_functions),7,'every listed employee, job and location function exists');
select is((select count(*)::int from refusal_raises),8,'the eight PT409 refusals are found in the function bodies');
select is((select coalesce(array_agg(distinct fn order by fn),'{}') from refusal_raises where statement !~* 'hint'),'{}'::text[],
 'no employee, job or location PT409 is raised without a reason key');
select is((select coalesce(array_agg(distinct key order by key),'{}') from (select (regexp_match(statement,$re$hint\s*=\s*'([^']*)'$re$,'i'))[1] key from refusal_raises) k
 where key is null or key not in ('job.changed','job.deleted','department.deleted','location.deleted','catalog.deleted',
  'employee.revision_conflict','employee.archived','employee.create_request_reused')),'{}'::text[],'every key is one the screens know');

-- Fixture: one owner, a department with two jobs, two employees, one location.
insert into auth.users(id,email) values
 ('1a045000-0000-4000-8000-000000000001','refusal-owner@example.test');
insert into public.workspaces(id,name,created_by) values('2a045000-0000-4000-8000-000000000001','Refusal keys test','1a045000-0000-4000-8000-000000000001');
insert into public.workspace_memberships (workspace_id, user_id, role_id, employee_role_id)
select legacy.workspace_id::uuid, legacy.user_id::uuid, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values
 ('2a045000-0000-4000-8000-000000000001','1a045000-0000-4000-8000-000000000001','owner',true)) as legacy(workspace_id, user_id, role, all_locations);
insert into public.employee_profiles(id,workspace_id,employee_code,first_name,last_name,created_by)
select ('7a045000-0000-4000-8000-00000000000'||i)::uuid,'2a045000-0000-4000-8000-000000000001','E-104'||i,'Refusal','Tester '||i,'1a045000-0000-4000-8000-000000000001'
from generate_series(1,2) i;
insert into public.departments(id,workspace_id,name) values
 ('9a045000-0000-4000-8000-000000000001','2a045000-0000-4000-8000-000000000001','Kitchen'),
 ('9a045000-0000-4000-8000-000000000002','2a045000-0000-4000-8000-000000000001','Bar');
insert into public.jobs(id,workspace_id,department_id,name,color) values
 ('aa045000-0000-4000-8000-000000000001','2a045000-0000-4000-8000-000000000001','9a045000-0000-4000-8000-000000000001','Cook','#123456'),
 ('aa045000-0000-4000-8000-000000000002','2a045000-0000-4000-8000-000000000001','9a045000-0000-4000-8000-000000000001','Prep','#654321');
insert into public.locations(id,workspace_id,name,short_name,street_address,city,region,postal_code,country_code,timezone) values
 ('8a045000-0000-4000-8000-000000000001','2a045000-0000-4000-8000-000000000001','West','WST1045','1 Road','City','CA','90012','US','America/Los_Angeles');

-- Jobs: details saved over newer ones.
select is(pg_temp.refusal($$select public.update_job_details_and_assignments_service('1a045000-0000-4000-8000-000000000001','2a045000-0000-4000-8000-000000000001',
 'aa045000-0000-4000-8000-000000000001','{"name":"Line cook","color":"#123456","department_id":"9a045000-0000-4000-8000-000000000001"}',
 '{"name":"Old name","color":"#123456","department_id":"9a045000-0000-4000-8000-000000000001"}','[]')$$),
 'PT409 job.changed','job details saved over newer ones: changed meanwhile');

-- Jobs: an employee's assignment saved over a newer record.
select is(pg_temp.refusal($$select public.update_job_assignments_service('1a045000-0000-4000-8000-000000000001','2a045000-0000-4000-8000-000000000001',
 'aa045000-0000-4000-8000-000000000001','[{"employee_id":"7a045000-0000-4000-8000-000000000001","assigned":true,"expected_revision":99}]')$$),
 'PT409 employee.revision_conflict','an assignment over a newer employee record: the person changed meanwhile');

-- Jobs: an employee archived while the drawer was open.
update public.employee_profiles set archived_at=now() where id='7a045000-0000-4000-8000-000000000002';
select is(pg_temp.refusal($$select public.update_job_assignments_service('1a045000-0000-4000-8000-000000000001','2a045000-0000-4000-8000-000000000001',
 'aa045000-0000-4000-8000-000000000001','[{"employee_id":"7a045000-0000-4000-8000-000000000002","assigned":true,"expected_revision":1}]')$$),
 'PT409 employee.archived','an assignment for an employee archived meanwhile: reload the employee list');

-- Catalog: deleted items. Deletion runs as the server does it (postgres).
update public.jobs set archived_at=now(), deleted_at=now() where id='aa045000-0000-4000-8000-000000000002';
select is(pg_temp.refusal($$insert into public.employee_job_assignments(workspace_id,employee_id,job_id,is_primary,created_by)
 values('2a045000-0000-4000-8000-000000000001','7a045000-0000-4000-8000-000000000001','aa045000-0000-4000-8000-000000000002',true,'1a045000-0000-4000-8000-000000000001')$$),
 'PT409 job.deleted','assigning a job deleted meanwhile');
update public.departments set archived_at=now(), deleted_at=now() where id='9a045000-0000-4000-8000-000000000002';
select is(pg_temp.refusal($$update public.jobs set department_id='9a045000-0000-4000-8000-000000000002' where id='aa045000-0000-4000-8000-000000000001'$$),
 'PT409 department.deleted','moving a job into a department deleted meanwhile');
select is(pg_temp.refusal($$update public.departments set name='Back bar' where id='9a045000-0000-4000-8000-000000000002'$$),
 'PT409 catalog.deleted','editing a catalog item deleted meanwhile');
update public.locations set archived_at=now(), deleted_at=now() where id='8a045000-0000-4000-8000-000000000001';
select is(pg_temp.refusal($$insert into public.employee_location_assignments(workspace_id,employee_id,location_id,is_primary,created_by)
 values('2a045000-0000-4000-8000-000000000001','7a045000-0000-4000-8000-000000000001','8a045000-0000-4000-8000-000000000001',true,'1a045000-0000-4000-8000-000000000001')$$),
 'PT409 location.deleted','assigning a location deleted meanwhile');
select is(pg_temp.refusal($$update public.locations set name='West side' where id='8a045000-0000-4000-8000-000000000001'$$),
 'PT409 catalog.deleted','editing a location deleted meanwhile');

-- Employees: a create request key replayed with other details is a standing refusal. Ada is filed at a
-- location and a job: Remote no longer saves without them (DAVET-ERISIM).
insert into public.locations(id,workspace_id,name,short_name,street_address,city,region,postal_code,country_code,timezone) values
 ('8a045000-0000-4000-8000-000000000002','2a045000-0000-4000-8000-000000000001','East','EST1045','2 Road','City','CA','90012','US','America/Los_Angeles');
create temp table create_command as select '{"first_name":"Ada","middle_name":"","last_name":"Refusal","preferred_name":"","invitation_email":"","start_date":"","internal_note":"","location_ids":["8a045000-0000-4000-8000-000000000002"],"primary_location_id":"8a045000-0000-4000-8000-000000000002","job_ids":["aa045000-0000-4000-8000-000000000001"],"primary_job_id":"aa045000-0000-4000-8000-000000000001","is_remote":true,"is_excluded_from_schedule":false,"expected_revision":null}'::jsonb employee;
select lives_ok($$select public.create_employee_command_service('1a045000-0000-4000-8000-000000000001','2a045000-0000-4000-8000-000000000001',
 '3a045000-0000-4000-8000-000000000001',employee,null) from create_command$$,'the first create lands');
select is(pg_temp.refusal($$select public.create_employee_command_service('1a045000-0000-4000-8000-000000000001','2a045000-0000-4000-8000-000000000001',
 '3a045000-0000-4000-8000-000000000001',employee||'{"last_name":"Changed"}',null) from create_command$$),
 'PT409 employee.create_request_reused','a create request key reused for other details: standing refusal, nothing to reload');

select * from finish();
rollback;

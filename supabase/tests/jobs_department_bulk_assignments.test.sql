begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email) values
('18000000-0000-4000-8000-000000000081','job-bulk-owner@example.test'),
('18000000-0000-4000-8000-000000000082','job-bulk-outsider@example.test'),
('18000000-0000-4000-8000-000000000083','job-bulk-manager@example.test');
insert into public.workspaces(id,name,created_by) values
('28000000-0000-4000-8000-000000000081','Job bulk test','18000000-0000-4000-8000-000000000081');
insert into public.workspace_memberships (workspace_id, user_id, role_id, employee_role_id)
select legacy.workspace_id::uuid, legacy.user_id::uuid, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values
('28000000-0000-4000-8000-000000000081','18000000-0000-4000-8000-000000000081','owner',true),
('28000000-0000-4000-8000-000000000081','18000000-0000-4000-8000-000000000083','manager',false)) as legacy(workspace_id, user_id, role, all_locations);
insert into public.employee_profiles(id,workspace_id,employee_code,first_name,last_name,created_by)
select ('78000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'28000000-0000-4000-8000-000000000081',
'E-'||lpad(i::text,4,'0'),'Employee',lpad(i::text,3,'0'),'18000000-0000-4000-8000-000000000081'
from generate_series(1,125)i;
create temporary table job_test_result(value jsonb);
grant all on job_test_result to service_role;
set local role service_role;
select lives_ok($$insert into job_test_result select public.create_department_with_jobs_service(
'18000000-0000-4000-8000-000000000081','28000000-0000-4000-8000-000000000081',
'{"name":" Service ","color":"#abcdef"}','[{"name":"Server","color":"#123456"},{"name":"Runner","color":"#654321"}]')$$,'creates department with multiple jobs');
select is((select value->'department'->>'name' from job_test_result),'Service','names trimmed');
select is((select jsonb_array_length(value->'jobs') from job_test_result),2,'both jobs returned');
select ok((select bool_and(j->>'department_id'=r.value->'department'->>'id') from job_test_result r,jsonb_array_elements(r.value->'jobs')j),'jobs use exact created department id');
select lives_ok($$select public.create_department_with_jobs_service('18000000-0000-4000-8000-000000000081','28000000-0000-4000-8000-000000000081','{"name":"Empty","color":"#abcdef"}','[]')$$,'department alone supported');
select throws_ok($$select public.create_department_with_jobs_service('18000000-0000-4000-8000-000000000081','28000000-0000-4000-8000-000000000081','{"name":"Must rollback","color":"#abcdef"}','[{"name":"Other","color":"#123456"},{"name":"server","color":"#654321"}]')$$,'23505',null,'job names unique across departments and case');
select throws_ok($$select public.create_department_with_jobs_service('18000000-0000-4000-8000-000000000081','28000000-0000-4000-8000-000000000081','{"name":"Invalid rollback","color":"#abcdef"}','[{"name":"Other","color":"#123456"},{"name":"Invalid","color":"nope"}]')$$,'23514',null,'later invalid job aborts whole transaction');
select throws_ok($$select public.create_department_with_jobs_service('18000000-0000-4000-8000-000000000082','28000000-0000-4000-8000-000000000081','{"name":"Forbidden","color":"#abcdef"}','[]')$$,'42501',null,'outsider cannot create');
set local role postgres;
select is((select count(*)::integer from public.departments where workspace_id='28000000-0000-4000-8000-000000000081'),2,'failed creations leave no departments');
select is((select count(*)::integer from public.jobs where workspace_id='28000000-0000-4000-8000-000000000081'),2,'failed creations leave no jobs');

create temporary table job_ids as select (value->'jobs'->0->>'id')::uuid a,(value->'jobs'->1->>'id')::uuid b from job_test_result;
select is((select (public.read_job_assignments_service('18000000-0000-4000-8000-000000000081','28000000-0000-4000-8000-000000000081',a)->>'total')::integer from job_ids),125,'total includes more than 100 employees');
select is((select jsonb_array_length(public.read_job_assignments_service('18000000-0000-4000-8000-000000000081','28000000-0000-4000-8000-000000000081',a)->'employees') from job_ids),50,'page is 50 rows');
select is((select jsonb_array_length(public.read_job_assignments_service('18000000-0000-4000-8000-000000000081','28000000-0000-4000-8000-000000000081',a,'',null,'all',2)->'employees') from job_ids),25,'last page includes remaining employees');
select is((select jsonb_array_length(public.read_job_assignments_service('18000000-0000-4000-8000-000000000081','28000000-0000-4000-8000-000000000081',a,'',null,'all',0,true)) from job_ids),125,'all targets are not truncated');
select is((select (public.read_job_assignments_service('18000000-0000-4000-8000-000000000083','28000000-0000-4000-8000-000000000081',a)->>'total')::integer from job_ids),0,'scoped manager with no scope sees no employees');
select throws_ok($$select public.read_job_assignments_service('18000000-0000-4000-8000-000000000082','28000000-0000-4000-8000-000000000081',a) from job_ids$$,'42501',null,'outsider cannot read employee targets');
select lives_ok($$select public.update_job_assignments_service('18000000-0000-4000-8000-000000000081','28000000-0000-4000-8000-000000000081',a,
'[{"employee_id":"78000000-0000-4000-8000-000000000001","assigned":true,"expected_revision":1}]') from job_ids$$,'assign first job');
select is((select count(*)::integer from public.employee_job_assignments where employee_id='78000000-0000-4000-8000-000000000001' and ended_at is null and is_primary),1,'first assigned job primary');
select is((select public.update_job_assignments_service('18000000-0000-4000-8000-000000000081','28000000-0000-4000-8000-000000000081',a,
'[{"employee_id":"78000000-0000-4000-8000-000000000001","assigned":true,"expected_revision":1}]')->>'changed_count' from job_ids),'0','retry is a harmless no-op');
select is((select revision from public.employee_profiles where id='78000000-0000-4000-8000-000000000001'),2,'retry does not increase revision');
select throws_ok($$select public.update_job_assignments_service('18000000-0000-4000-8000-000000000081','28000000-0000-4000-8000-000000000081',a,
'[{"employee_id":"78000000-0000-4000-8000-000000000002","assigned":true,"expected_revision":1},{"employee_id":"78000000-0000-4000-8000-000000000003","assigned":true,"expected_revision":99}]') from job_ids$$,'PT409',null,'stale later row aborts entire batch');
select is((select count(*)::integer from public.employee_job_assignments where employee_id='78000000-0000-4000-8000-000000000002'),0,'no partial assignment after conflict');
select lives_ok($$select public.update_job_assignments_service('18000000-0000-4000-8000-000000000081','28000000-0000-4000-8000-000000000081',b,
'[{"employee_id":"78000000-0000-4000-8000-000000000001","assigned":true,"expected_revision":2}]') from job_ids$$,'add second job');
select is((select job_id from public.employee_job_assignments where employee_id='78000000-0000-4000-8000-000000000001' and ended_at is null and is_primary),(select a from job_ids),'adding preserves existing primary');
select is((select (public.organization_job_counts_service('18000000-0000-4000-8000-000000000081','28000000-0000-4000-8000-000000000081')->'departments'->0->>'employee_count')::integer),1,'department count deduplicates employee with two jobs');
select lives_ok($$select public.update_job_assignments_service('18000000-0000-4000-8000-000000000081','28000000-0000-4000-8000-000000000081',a,
'[{"employee_id":"78000000-0000-4000-8000-000000000001","assigned":false,"expected_revision":3},{"employee_id":"78000000-0000-4000-8000-000000000002","assigned":true,"expected_revision":1}]') from job_ids$$,'mixed add/remove batch');
select is((select job_id from public.employee_job_assignments where employee_id='78000000-0000-4000-8000-000000000001' and ended_at is null and is_primary),(select b from job_ids),'primary auto promotes remaining job');
select lives_ok($$select public.update_job_assignments_service('18000000-0000-4000-8000-000000000081','28000000-0000-4000-8000-000000000081',b,
'[{"employee_id":"78000000-0000-4000-8000-000000000001","assigned":false,"expected_revision":4}]') from job_ids$$,'normal employee last job removal allowed');
select is((select count(*)::integer from public.employee_job_assignments where employee_id='78000000-0000-4000-8000-000000000001' and ended_at is null),0,'no assignments and no primary remain');
select is((select count(*)::integer from public.employee_job_assignments where employee_id='78000000-0000-4000-8000-000000000001'),2,'historical intervals retained');
select throws_ok($$select public.update_job_assignments_service('18000000-0000-4000-8000-000000000081','28000000-0000-4000-8000-000000000081',a,
'[{"employee_id":"78000000-0000-4000-8000-000000000001","assigned":true,"expected_revision":1}]') from job_ids$$,'PT409',null,'retry after reversal cannot overwrite newer decision');
select ok((select bool_and(actor_user_id='18000000-0000-4000-8000-000000000081') from public.employee_events where workspace_id='28000000-0000-4000-8000-000000000081'),'history identifies verified actor');
select ok(not has_function_privilege('authenticated','public.update_job_assignments_service(uuid,uuid,uuid,jsonb)','execute'),'client cannot call actor RPC');
select ok(not has_function_privilege('anon','public.read_job_assignments_service(uuid,uuid,uuid,text,uuid,text,integer,boolean)','execute'),'anon cannot call read RPC');
select ok(has_function_privilege('service_role','public.create_department_with_jobs_service(uuid,uuid,jsonb,jsonb)','execute'),'service can call create');
select lives_ok($$select public.create_department_jobs_service('18000000-0000-4000-8000-000000000081','28000000-0000-4000-8000-000000000081',
(select (value->'department'->>'id')::uuid from job_test_result),'[{"name":"Chef","color":"#123456"},{"name":"Cook","color":"#654321"}]')$$,'existing department accepts multiple jobs together');
select is((select count(*)::integer from public.jobs where workspace_id='28000000-0000-4000-8000-000000000081'),4,'existing department batch adds all jobs');
select throws_ok($$select public.create_department_jobs_service('18000000-0000-4000-8000-000000000081','28000000-0000-4000-8000-000000000081',
(select (value->'department'->>'id')::uuid from job_test_result),'[{"name":"Rollback cook","color":"#123456"},{"name":"Chef","color":"#654321"}]')$$,'23505',null,'existing department batch rejects later duplicate');
select is((select count(*)::integer from public.jobs where workspace_id='28000000-0000-4000-8000-000000000081'),4,'existing department batch rolls back earlier insertion');
select throws_ok($$select public.create_department_jobs_service('18000000-0000-4000-8000-000000000082','28000000-0000-4000-8000-000000000081',
(select (value->'department'->>'id')::uuid from job_test_result),'[{"name":"Outsider","color":"#123456"}]')$$,'42501',null,'outsider cannot add to department');
select lives_ok($$select public.update_job_assignments_service('18000000-0000-4000-8000-000000000081','28000000-0000-4000-8000-000000000081',a,
(select jsonb_agg(jsonb_build_object('employee_id',id,'assigned',true,'expected_revision',revision)) from public.employee_profiles where workspace_id='28000000-0000-4000-8000-000000000081')) from job_ids$$,'all 125 employees updated in one command');
select is((select count(*)::integer from public.employee_job_assignments where job_id=(select a from job_ids) and ended_at is null),125,'all-results update is complete beyond page limits');
select is((select last_name from public.employee_profiles where id='78000000-0000-4000-8000-000000000001'),'001','unrelated employee fields preserved');
select is((select (public.read_job_assignments_service('18000000-0000-4000-8000-000000000081','28000000-0000-4000-8000-000000000081',a,'E-0125')->>'total')::integer from job_ids),1,'employee code search covers later pages');
update public.jobs set archived_at=now() where id=(select b from job_ids);
select throws_ok($$select public.update_job_assignments_service('18000000-0000-4000-8000-000000000081','28000000-0000-4000-8000-000000000081',b,
'[{"employee_id":"78000000-0000-4000-8000-000000000001","assigned":true,"expected_revision":6}]') from job_ids$$,'22023',null,'archived job assignments are read-only');
select ok(not has_function_privilege('authenticated','public.create_department_jobs_service(uuid,uuid,uuid,jsonb)','execute'),'existing-department command is service only');
select lives_ok($$select public.update_department_with_jobs_service('18000000-0000-4000-8000-000000000081','28000000-0000-4000-8000-000000000081',
(select (value->'department'->>'id')::uuid from job_test_result),'{"name":"Dining","color":"#112233"}','[{"name":"Host","color":"#123456"},{"name":"Expo","color":"#654321"}]')$$,'department edit adds several jobs atomically');
select throws_ok($$select public.update_department_with_jobs_service('18000000-0000-4000-8000-000000000081','28000000-0000-4000-8000-000000000081',
(select (value->'department'->>'id')::uuid from job_test_result),'{"name":"Wrong name","color":"#112233"}','[{"name":"Host","color":"#123456"}]')$$,'23505',null,'invalid added job rolls back department edit too');
select is((select name from public.departments where id=(select (value->'department'->>'id')::uuid from job_test_result)),'Dining','department name retained after invalid edit');
update public.jobs set archived_at=null where id=(select b from job_ids);
select public.update_job_assignments_service('18000000-0000-4000-8000-000000000081','28000000-0000-4000-8000-000000000081',b,
(select jsonb_build_array(jsonb_build_object('employee_id',id,'assigned',true,'expected_revision',revision)) from public.employee_profiles where id='78000000-0000-4000-8000-000000000001')) from job_ids;
insert into public.locations(short_name, id,workspace_id,name,street_address,city,region,postal_code,country_code,timezone)
values('T00016','48000000-0000-4000-8000-000000000081','28000000-0000-4000-8000-000000000081','Dining','1 Main','City','CA','90001','US','America/Los_Angeles');
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,is_primary,created_by)
values('28000000-0000-4000-8000-000000000081','78000000-0000-4000-8000-000000000001','48000000-0000-4000-8000-000000000081',true,'18000000-0000-4000-8000-000000000081');
insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,status,published_by)
values('88000000-0000-4000-8000-000000000081','28000000-0000-4000-8000-000000000081','48000000-0000-4000-8000-000000000081','2026-09-07',1,'current','18000000-0000-4000-8000-000000000081');
insert into public.schedule_published_shifts(id,workspace_id,location_id,publication_id,employee_id,job_id,scheduled_date,start_time,end_time,source_shift_id)
select '98000000-0000-4000-8000-000000000081','28000000-0000-4000-8000-000000000081','48000000-0000-4000-8000-000000000081','88000000-0000-4000-8000-000000000081',
'78000000-0000-4000-8000-000000000001',a,'2026-09-08','10:00','16:00','98000000-0000-4000-8000-000000000082' from job_ids;
create temporary table preserved_rows as select
(select to_jsonb(s) from public.schedule_published_shifts s where id='98000000-0000-4000-8000-000000000081') shift,
(select jsonb_agg(to_jsonb(l)) from public.employee_location_assignments l where employee_id='78000000-0000-4000-8000-000000000001') locations,
(select id from public.employee_job_assignments where employee_id='78000000-0000-4000-8000-000000000001' and job_id=(select b from job_ids) and ended_at is null) other_assignment;
select throws_ok($$select public.delete_job_with_assignments_service('18000000-0000-4000-8000-000000000082','28000000-0000-4000-8000-000000000081',a) from job_ids$$,'42501',null,'outsider cannot delete job with assignments');
set local role authenticated;
select set_config('request.jwt.claim.sub','18000000-0000-4000-8000-000000000081',true);
select throws_ok($$update public.jobs set deleted_at=now(),archived_at=now() where workspace_id='28000000-0000-4000-8000-000000000081' and name='Server'$$,'42501',null,'direct client deletion cannot bypass employee authorization');
set local role postgres;
select is((select (public.delete_job_with_assignments_service('18000000-0000-4000-8000-000000000081','28000000-0000-4000-8000-000000000081',a)->>'removed_count')::integer from job_ids),125,'deletion detaches every employee including beyond 100');
select is((select count(*)::integer from public.employee_job_assignments where job_id=(select a from job_ids) and ended_at is null),0,'deleted job has no current employee assignments');
select ok((select deleted_at is not null and archived_at is not null from public.jobs where id=(select a from job_ids)),'deleted job remains for historical references only');
select is((select id from public.employee_job_assignments where employee_id='78000000-0000-4000-8000-000000000001' and ended_at is null and is_primary),(select other_assignment from preserved_rows),'deletion promotes existing remaining assignment without replacing its history');
select is((select count(*)::integer from public.employee_job_assignments where employee_id='78000000-0000-4000-8000-000000000002' and ended_at is null),0,'last-job employee stays without job');
select is((select to_jsonb(s) from public.schedule_published_shifts s where id='98000000-0000-4000-8000-000000000081'),(select shift from preserved_rows),'published shift unchanged by deletion');
select is((select jsonb_agg(to_jsonb(l)) from public.employee_location_assignments l where employee_id='78000000-0000-4000-8000-000000000001'),(select locations from preserved_rows),'location assignments unchanged by deletion');
select is((select public.delete_job_with_assignments_service('18000000-0000-4000-8000-000000000081','28000000-0000-4000-8000-000000000081',a)->>'removed_count' from job_ids),'0','delete retry creates no changes');
select throws_ok($$insert into public.employee_job_assignments(workspace_id,employee_id,job_id,is_primary,created_by)
select '28000000-0000-4000-8000-000000000081','78000000-0000-4000-8000-000000000002',a,true,'18000000-0000-4000-8000-000000000081' from job_ids$$,'PT409',null,'new current assignment cannot target a deleted job');
select throws_ok($$update public.jobs set archived_at=null where id=(select a from job_ids)$$,'23514',null,'deleted job cannot become active through stale restore');
select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email) values
('18000000-0000-4000-8000-000000000091','catalog-owner@example.test'),
('18000000-0000-4000-8000-000000000092','catalog-outsider@example.test');
insert into public.workspaces(id,name,created_by) values
('28000000-0000-4000-8000-000000000091','Catalog deletion','18000000-0000-4000-8000-000000000091');
insert into public.workspace_memberships(workspace_id,user_id,role,all_locations) values
('28000000-0000-4000-8000-000000000091','18000000-0000-4000-8000-000000000091','owner',true);
insert into public.departments(id,workspace_id,name) values
('38000000-0000-4000-8000-000000000091','28000000-0000-4000-8000-000000000091','Keep jobs'),
('38000000-0000-4000-8000-000000000092','28000000-0000-4000-8000-000000000091','Delete jobs');
insert into public.jobs(id,workspace_id,name,department_id) values
('58000000-0000-4000-8000-000000000091','28000000-0000-4000-8000-000000000091','Server','38000000-0000-4000-8000-000000000091'),
('58000000-0000-4000-8000-000000000092','28000000-0000-4000-8000-000000000091','Cook','38000000-0000-4000-8000-000000000092');
insert into public.jobs(id,workspace_id,name,department_id) values
('58000000-0000-4000-8000-000000000093','28000000-0000-4000-8000-000000000091','Chef','38000000-0000-4000-8000-000000000092');
insert into public.employee_profiles(id,workspace_id,employee_code,first_name,last_name,created_by) values
('78000000-0000-4000-8000-000000000091','28000000-0000-4000-8000-000000000091','E-0091','Catalog','Employee','18000000-0000-4000-8000-000000000091');
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,is_primary,created_by) values
('28000000-0000-4000-8000-000000000091','78000000-0000-4000-8000-000000000091','58000000-0000-4000-8000-000000000092',true,'18000000-0000-4000-8000-000000000091');
insert into public.locations(id,workspace_id,name,street_address,city,region,postal_code,timezone) values
('48000000-0000-4000-8000-000000000091','28000000-0000-4000-8000-000000000091','Location A','1 Main','City','CA','90001','America/Los_Angeles'),
('48000000-0000-4000-8000-000000000092','28000000-0000-4000-8000-000000000091','Location B','2 Main','City','CA','90001','America/Los_Angeles');
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,is_primary,created_by) values
('28000000-0000-4000-8000-000000000091','78000000-0000-4000-8000-000000000091','48000000-0000-4000-8000-000000000091',true,'18000000-0000-4000-8000-000000000091'),
('28000000-0000-4000-8000-000000000091','78000000-0000-4000-8000-000000000091','48000000-0000-4000-8000-000000000092',false,'18000000-0000-4000-8000-000000000091');
insert into public.shift_types(id,workspace_id,name,color) values
('68000000-0000-4000-8000-000000000091','28000000-0000-4000-8000-000000000091','Lunch','#123456');
insert into public.shift_labels(id,workspace_id,name,color) values
('69000000-0000-4000-8000-000000000091','28000000-0000-4000-8000-000000000091','Training','#123456');

create function pg_temp.del(kind text, entity uuid, choice text default 'keep') returns jsonb language sql as $$
  select public.delete_catalog_entity_service('18000000-0000-4000-8000-000000000091','28000000-0000-4000-8000-000000000091',kind,entity,choice);
$$;
insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,status,published_by)
values('88000000-0000-4000-8000-000000000091','28000000-0000-4000-8000-000000000091','48000000-0000-4000-8000-000000000091','2026-09-07',1,'current','18000000-0000-4000-8000-000000000091');
insert into public.schedule_published_shifts(id,workspace_id,location_id,publication_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id,label_ids,label_names)
values('98000000-0000-4000-8000-000000000091','28000000-0000-4000-8000-000000000091','48000000-0000-4000-8000-000000000091','88000000-0000-4000-8000-000000000091',
'58000000-0000-4000-8000-000000000092','68000000-0000-4000-8000-000000000091','2026-09-08','10:00','16:00','98000000-0000-4000-8000-000000000092',array['69000000-0000-4000-8000-000000000091'::uuid],array['Training']);
create temporary table preserved_shift as select to_jsonb(s) value from public.schedule_published_shifts s where id='98000000-0000-4000-8000-000000000091';
set local role authenticated;
select set_config('request.jwt.claim.sub','18000000-0000-4000-8000-000000000091',true);
select throws_ok($$update public.locations set deleted_at=now(),archived_at=now() where id='48000000-0000-4000-8000-000000000091'$$,'42501',null,'direct client deletion cannot skip assignment checks');
set local role postgres;
select throws_ok($$select public.delete_catalog_entity_service('18000000-0000-4000-8000-000000000092','28000000-0000-4000-8000-000000000091','departments','38000000-0000-4000-8000-000000000091')$$,'42501',null,'outsider denied');
select throws_ok($$select pg_temp.del('departments','38000000-0000-4000-8000-000000000099')$$,'P0002',null,'wrong workspace or missing item unavailable');
select throws_ok($$select pg_temp.del('anything','38000000-0000-4000-8000-000000000091')$$,'22023',null,'unknown kind rejected');
select lives_ok($$select pg_temp.del('departments','38000000-0000-4000-8000-000000000091','keep')$$,'department deleted keeping jobs');
select ok((select department_id is null and deleted_at is null from public.jobs where id='58000000-0000-4000-8000-000000000091'),'kept job becomes ungrouped');
select throws_ok($$insert into public.jobs(workspace_id,name,department_id) values('28000000-0000-4000-8000-000000000091','Stale','38000000-0000-4000-8000-000000000091')$$,'PT409',null,'stale department assignment rejected');
create function pg_temp.reject_second_job_delete() returns trigger language plpgsql as $$ begin
  if new.id='58000000-0000-4000-8000-000000000093' and new.deleted_at is not null then
    raise exception 'Concurrent change' using errcode='PT409'; end if;
  return new;
end; $$;
create trigger test_second_job_conflict before update on public.jobs for each row execute function pg_temp.reject_second_job_delete();
select throws_ok($$select pg_temp.del('departments','38000000-0000-4000-8000-000000000092','delete')$$,'PT409',null,'later child conflict rejects whole department deletion');
select ok((select deleted_at is null from public.jobs where id='58000000-0000-4000-8000-000000000092'),'earlier child deletion rolled back');
select is((select count(*)::integer from public.employee_job_assignments where employee_id='78000000-0000-4000-8000-000000000091' and ended_at is null),1,'earlier employee detachment rolled back');
select ok((select deleted_at is null from public.departments where id='38000000-0000-4000-8000-000000000092'),'department retained after conflict');
drop trigger test_second_job_conflict on public.jobs;
select lives_ok($$select pg_temp.del('departments','38000000-0000-4000-8000-000000000092','delete')$$,'department and jobs deleted together');
select ok((select deleted_at is not null from public.jobs where id='58000000-0000-4000-8000-000000000092'),'child job deleted');
select is((select count(*)::integer from public.employee_job_assignments where employee_id='78000000-0000-4000-8000-000000000091' and ended_at is null),0,'last job may be removed');
select is((select count(*)::integer from public.employee_location_assignments where employee_id='78000000-0000-4000-8000-000000000091' and ended_at is null),2,'department deletion keeps locations');
select lives_ok($$select pg_temp.del('locations','48000000-0000-4000-8000-000000000091')$$,'location deleted and assignments removed');
select is((select location_id from public.employee_location_assignments where employee_id='78000000-0000-4000-8000-000000000091' and ended_at is null and is_primary),'48000000-0000-4000-8000-000000000092'::uuid,'remaining primary promoted');
select lives_ok($$select pg_temp.del('locations','48000000-0000-4000-8000-000000000092')$$,'last location may be removed');
select is((select count(*)::integer from public.employee_location_assignments where employee_id='78000000-0000-4000-8000-000000000091' and ended_at is null),0,'employee may remain locationless');
select is((select count(*)::integer from public.employee_location_assignments where employee_id='78000000-0000-4000-8000-000000000091'),2,'assignment history retained');
select throws_ok($$insert into public.employee_location_assignments(workspace_id,employee_id,location_id,is_primary,created_by) values('28000000-0000-4000-8000-000000000091','78000000-0000-4000-8000-000000000091','48000000-0000-4000-8000-000000000091',true,'18000000-0000-4000-8000-000000000091')$$,'PT409',null,'stale location assignment rejected');
create temporary table history_before as select count(*)::integer events from public.employee_events where workspace_id='28000000-0000-4000-8000-000000000091';
select is((select pg_temp.del('locations','48000000-0000-4000-8000-000000000092')->>'removed_count'),'0','delete retry no-op');
select is((select count(*)::integer from public.employee_events where workspace_id='28000000-0000-4000-8000-000000000091'),(select events from history_before),'retry does not duplicate history');
select lives_ok($$select pg_temp.del('shift-types','68000000-0000-4000-8000-000000000091')$$,'type deletion succeeds');
select lives_ok($$select pg_temp.del('shift-labels','69000000-0000-4000-8000-000000000091')$$,'label deletion succeeds');
select ok((select deleted_at is not null and archived_at is not null from public.shift_types where id='68000000-0000-4000-8000-000000000091'),'type historical row retained but inactive');
select ok((select deleted_at is not null and archived_at is not null from public.shift_labels where id='69000000-0000-4000-8000-000000000091'),'label historical row retained but inactive');
select is((select to_jsonb(s) from public.schedule_published_shifts s where id='98000000-0000-4000-8000-000000000091'),(select value from preserved_shift),'location, type and label deletion preserve the full published shift');
select throws_ok($$update public.shift_types set archived_at=null where id='68000000-0000-4000-8000-000000000091'$$,'PT409',null,'stale restore rejected');
select ok(not has_function_privilege('authenticated','public.delete_catalog_entity_service(uuid,uuid,text,uuid,text)','execute'),'actor RPC service only');
select ok(not has_function_privilege('anon','public.delete_catalog_entity_service(uuid,uuid,text,uuid,text)','execute'),'anonymous RPC denied');
select * from finish();
rollback;

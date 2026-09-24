begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- Isolated records; the standard local seed supplies the workspace and its owner.
insert into public.locations(short_name, id,workspace_id,name,street_address,city,region,postal_code,timezone)
values('T00034','da000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','Archive regression','1 Main St','Los Angeles','CA','90001','America/Los_Angeles');
insert into public.jobs(id,workspace_id,name)
values('da000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','Archive regression');
insert into public.schedule_drafts(id,workspace_id,week_start,name,revision,created_by,updated_by)
values('da000000-0000-4000-8000-000000000003','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',date_trunc('week',current_date)::date,'Archive regression',1,'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','d9f43e62-e099-48e1-bc6f-a5aabe8e87d5');
insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by,source_draft_id)
values('da000000-0000-4000-8000-000000000004','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','da000000-0000-4000-8000-000000000001',date_trunc('week',current_date)::date,1,'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','da000000-0000-4000-8000-000000000003');
insert into public.schedule_published_shifts(id,workspace_id,location_id,publication_id,job_id,scheduled_date,start_time,end_time,source_shift_id)
values('da000000-0000-4000-8000-000000000005','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','da000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000004','da000000-0000-4000-8000-000000000002',current_date,'10:00','12:00','da000000-0000-4000-8000-000000000006');
insert into public.employee_profiles(id,workspace_id,employee_code,first_name,last_name,created_by)
values('da000000-0000-4000-8000-000000000007','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','E-9901','Archive','Regression','d9f43e62-e099-48e1-bc6f-a5aabe8e87d5');
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,is_primary,created_by)
values('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','da000000-0000-4000-8000-000000000007','da000000-0000-4000-8000-000000000001',true,'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5');
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,is_primary,created_by)
values('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','da000000-0000-4000-8000-000000000007','da000000-0000-4000-8000-000000000002',true,'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5');
update public.locations set archived_at=now() where id='da000000-0000-4000-8000-000000000001';
update public.jobs set archived_at=now() where id='da000000-0000-4000-8000-000000000002';
create temp table snapshots as select to_jsonb(p) publication, to_jsonb(s) shift
from public.schedule_location_publications p join public.schedule_published_shifts s on s.publication_id=p.id
where p.id='da000000-0000-4000-8000-000000000004';
set local role service_role;
select throws_ok($$select public.delete_schedule_draft_service('da000000-0000-4000-8000-000000000099','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','da000000-0000-4000-8000-000000000003')$$,'42501',null,'unauthorized actor cannot archive');
select throws_ok($$select public.delete_schedule_draft_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','da000000-0000-4000-8000-000000000099','da000000-0000-4000-8000-000000000003')$$,'42501',null,'wrong workspace cannot archive');
select is(public.delete_schedule_draft_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','da000000-0000-4000-8000-000000000003')->>'status','deleted','published draft can be archived after location and job removal');
reset role;
select ok((select archived_at is not null from public.schedule_drafts where id='da000000-0000-4000-8000-000000000003'),'draft retained as archived');
select is((select to_jsonb(p) from public.schedule_location_publications p where id='da000000-0000-4000-8000-000000000004'),(select publication from snapshots),'publication and source link remain unchanged');
select is((select to_jsonb(s) from public.schedule_published_shifts s where id='da000000-0000-4000-8000-000000000005'),(select shift from snapshots),'published snapshot remains unchanged');
set local role service_role;
select lives_ok($$select public.terminate_employee_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','da000000-0000-4000-8000-000000000007',(now() at time zone 'America/Los_Angeles')::timestamp - interval '1 minute','America/Los_Angeles','Employment ended','da000000-0000-4000-8000-000000000008')$$,'termination accepts assigned archived worksite timezone without reassignment');
reset role;
select ok((select archived_at is not null from public.employee_profiles where id='da000000-0000-4000-8000-000000000007'),'employee archived without saving new assignments');
select * from finish();
rollback;

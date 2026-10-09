begin;

create extension if not exists pgtap with schema extensions;

select no_plan();



-- Own locations/jobs/employees: shared seed locations may legitimately be archived.
insert into public.locations(short_name, id,workspace_id,name,street_address,city,region,postal_code,country_code,timezone)
select 'T00041-' || n::text, ('ada10000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','Travel QA '||n,'1 Test St','Test','CA','94000','US','America/Los_Angeles' from generate_series(1,2)n;
insert into public.jobs(id,workspace_id,name) values('ada30000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','Travel QA job');
insert into public.shift_types(id,workspace_id,name,default_start_time,default_end_time) values('ada40000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','Travel QA service','09:00','17:00');
insert into public.employee_profiles(id,workspace_id,employee_code,first_name,last_name,created_by)
select ('ada50000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','E-99320'||n,'Travel',n::text,'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5' from generate_series(1,2)n;


insert into public.schedule_location_publications(workspace_id,location_id,week_start,version_number,published_by)

select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',id,'2030-01-07',1,'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5' from public.locations where id in('ada10000-0000-4000-8000-000000000001','ada10000-0000-4000-8000-000000000002');

insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)

select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',e.id,l.id,'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5' from public.employee_profiles e cross join public.locations l

where e.id in('ada50000-0000-4000-8000-000000000001','ada50000-0000-4000-8000-000000000002') and l.id in('ada10000-0000-4000-8000-000000000001','ada10000-0000-4000-8000-000000000002')

and not exists(select 1 from public.employee_location_assignments a where a.employee_id=e.id and a.location_id=l.id and a.ended_at is null);

insert into public.employee_job_assignments(workspace_id,employee_id,job_id,created_by)

select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',e.id,'ada30000-0000-4000-8000-000000000001','d9f43e62-e099-48e1-bc6f-a5aabe8e87d5' from public.employee_profiles e

where e.id in('ada50000-0000-4000-8000-000000000001','ada50000-0000-4000-8000-000000000002') and not exists(select 1 from public.employee_job_assignments a where a.employee_id=e.id and a.job_id='ada30000-0000-4000-8000-000000000001' and a.ended_at is null);



-- A change to the conflict rules has to say which revision of them it is
-- changing, so two managers editing at once cannot overwrite each other. The
-- settings screen sends back the revision it read; so does this.
create function pg_temp.settings(value jsonb) returns jsonb language sql as $$
 select public.update_scheduling_settings_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  value || jsonb_build_object('conflict_rules_revision',
   (select conflict_rules_revision from public.workspace_scheduling_settings where workspace_id='6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')));
$$;

select is(pg_temp.settings('{"minimum_travel_minutes":30}')->>'minimum_travel_minutes','30','manager sets shared travel minimum');
select is(pg_temp.settings('{"time_format":"24h"}')->>'minimum_travel_minutes','30','old payload preserves configured minimum');
select is((select count(*)::int from public.audit_events where action='scheduling.settings_updated' and actor_user_id='d9f43e62-e099-48e1-bc6f-a5aabe8e87d5' and metadata->'after'->>'minimum_travel_minutes'='30'),2,'service actor and policy changes audited');
select throws_ok($$select pg_temp.settings('{"minimum_travel_minutes":241}')$$,'23514',null,'database bounds travel policy');
select throws_ok($$select public.update_scheduling_settings_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','00000000-0000-4000-8000-000000000001','{"minimum_travel_minutes":30}')$$,'42501',null,'actor cannot write another workspace');
select ok(not has_function_privilege('authenticated','public.update_scheduling_settings_service(uuid,uuid,jsonb)','execute'),'browser cannot forge service actor');

select * from finish();
rollback;

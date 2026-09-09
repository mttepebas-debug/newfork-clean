begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

create function pg_temp.clock_digest() returns jsonb language sql as $$
select jsonb_build_object(
 'sessions',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb)::text) from public.time_sessions t),
 'events',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb)::text) from public.time_events t),
 'manual',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb)::text) from public.time_manual_entries t),
 'amendments',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb)::text) from public.time_amendments t));
$$;
create temp table lu_clock_before as select pg_temp.clock_digest() digest;


create function pg_temp.run(action text,payload jsonb) returns jsonb language sql as $$

select public.lineup_operations_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',action,payload);

$$;

create temp table lu_test(target jsonb,op jsonb,preview jsonb,result jsonb,share jsonb,source_id uuid,slot_id uuid);

insert into lu_test(target) values('{"date":"2030-01-07","location_id":"ada10000-0000-4000-8000-000000000001","job_id":"ada30000-0000-4000-8000-000000000001","shift_type_id":"ada40000-0000-4000-8000-000000000001","start_time":"09:00","end_time":"17:00","section_id":null,"station":"Tables 21–26"}');


-- Own locations/jobs/employees: shared seed locations may legitimately be archived.
insert into public.locations(id,workspace_id,name,street_address,city,region,postal_code,country_code,timezone,lineup_operations_enabled)
select ('ada10000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','Travel QA '||n,'1 Test St','Test','CA','94000','US','America/Los_Angeles',true from generate_series(1,2)n;
insert into public.jobs(id,workspace_id,name) values('ada30000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','Travel QA job');
insert into public.shift_types(id,workspace_id,name,default_start_time,default_end_time) values('ada40000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','Travel QA service','09:00','17:00');
insert into public.employee_profiles(id,workspace_id,employee_code,first_name,last_name,created_by)
select ('ada50000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','E-99320'||n,'Travel',n::text,'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5' from generate_series(1,2)n;

-- Planning availability is declared before the first publication.
insert into public.employee_schedule_availability_versions(workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from,effective_until)

select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',e.id,coalesce((select max(version_number) from public.employee_schedule_availability_versions where employee_id=e.id),0)+1,'America/Los_Angeles',

  (select jsonb_agg(jsonb_build_object('day',n,'mode',case when e.id='ada50000-0000-4000-8000-000000000001' and n=5 then 'windows' else 'unrestricted' end,'windows',case when e.id='ada50000-0000-4000-8000-000000000001' and n=5 then '[{"start":"00:00","end":"06:00"},{"start":"12:00","end":"15:00"}]'::jsonb else '[]'::jsonb end)) from generate_series(0,6) n),'manager','d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','2030-01-07',null

from public.employee_profiles e where e.id in('ada50000-0000-4000-8000-000000000001','ada50000-0000-4000-8000-000000000002');

insert into public.schedule_location_publications(workspace_id,location_id,week_start,version_number,published_by)

select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',id,'2030-01-07',1,'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5' from public.locations where id in('ada10000-0000-4000-8000-000000000001','ada10000-0000-4000-8000-000000000002');

insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)

select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',e.id,l.id,'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5' from public.employee_profiles e cross join public.locations l

where e.id in('ada50000-0000-4000-8000-000000000001','ada50000-0000-4000-8000-000000000002') and l.id in('ada10000-0000-4000-8000-000000000001','ada10000-0000-4000-8000-000000000002')

and not exists(select 1 from public.employee_location_assignments a where a.employee_id=e.id and a.location_id=l.id and a.ended_at is null);

insert into public.employee_job_assignments(workspace_id,employee_id,job_id,created_by)

select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',e.id,'ada30000-0000-4000-8000-000000000001','d9f43e62-e099-48e1-bc6f-a5aabe8e87d5' from public.employee_profiles e

where e.id in('ada50000-0000-4000-8000-000000000001','ada50000-0000-4000-8000-000000000002') and not exists(select 1 from public.employee_job_assignments a where a.employee_id=e.id and a.job_id='ada30000-0000-4000-8000-000000000001' and a.ended_at is null);



create function pg_temp.settings(value jsonb) returns jsonb language sql as $$
 select public.update_scheduling_settings_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',value);
$$;

select is(pg_temp.settings('{"minimum_travel_minutes":30}')->>'minimum_travel_minutes','30','manager sets shared travel minimum');
select is(pg_temp.settings('{"time_format":"24h"}')->>'minimum_travel_minutes','30','old payload preserves configured minimum');
select is(public.lineup_effective_travel_minutes('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',60),60,'operation can increase company minimum');
select is((select count(*)::int from public.audit_events where action='scheduling.settings_updated' and actor_user_id='d9f43e62-e099-48e1-bc6f-a5aabe8e87d5' and metadata->'after'->>'minimum_travel_minutes'='30'),2,'service actor and policy changes audited');
select throws_ok($$select pg_temp.settings('{"minimum_travel_minutes":241}')$$,'23514',null,'database bounds travel policy');
select throws_ok($$select public.update_scheduling_settings_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','00000000-0000-4000-8000-000000000001','{"minimum_travel_minutes":30}')$$,'42501',null,'actor cannot write another workspace');
select ok(not has_function_privilege('authenticated','public.update_scheduling_settings_service(uuid,uuid,jsonb)','execute'),'browser cannot forge service actor');
select ok(not has_function_privilege('authenticated','public.lineup_effective_travel_minutes(uuid,integer)','execute'),'internal policy helper does not expose workspace settings');

update lu_test set op=jsonb_build_object('kind','assign','source_entry_id',null,'target_entry_id',null,'employee_id','ada50000-0000-4000-8000-000000000001','target',target,'reason','Travel fixture source','travel_minutes',0);
update lu_test set preview=pg_temp.run('preview',jsonb_build_object('operation',op));
select is(preview->>'allowed','true','first assignment remains eligible') from lu_test;
update lu_test set result=pg_temp.run('apply',jsonb_build_object('operation',op,'fingerprint',preview->>'fingerprint','idempotency_key','ada00000-0000-4000-8000-000000000001'));
update lu_test set source_id=(result->>'shift_id')::uuid;
select is(public.lineup_candidate_check('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','ada50000-0000-4000-8000-000000000001',target||'{"location_id":"ada10000-0000-4000-8000-000000000002","start_time":"17:15","end_time":"18:00"}')->>'status','ineligible','shared default argument blocks 15 minute gap at another location') from lu_test;
select is(public.lineup_candidate_check('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','ada50000-0000-4000-8000-000000000001',target||'{"location_id":"ada10000-0000-4000-8000-000000000002","start_time":"17:30","end_time":"18:00"}')->>'status','eligible','exact 30 minute boundary is eligible') from lu_test;
select is(public.lineup_candidate_check('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','ada50000-0000-4000-8000-000000000001',target||'{"location_id":"ada10000-0000-4000-8000-000000000002","start_time":"07:00","end_time":"08:45"}')->>'status','ineligible','travel also blocks before an existing shift') from lu_test;
select is(public.lineup_candidate_check('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','ada50000-0000-4000-8000-000000000001',target||'{"start_time":"17:00","end_time":"18:00"}')->>'status','eligible','adjacent work in the same location needs no travel') from lu_test;
select is(public.lineup_candidate_check('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','ada50000-0000-4000-8000-000000000001',target||'{"location_id":"ada10000-0000-4000-8000-000000000002","start_time":"17:15","end_time":"18:00"}',array[source_id])->>'status','eligible','excluded source placement is not counted twice for travel') from lu_test;

-- Independent legacy daily assignment, not a duplicate source placement.
insert into public.schedule_lineup_entries(id,workspace_id,lineup_id,location_id,employee_id,job_id,shift_type_id,start_time,end_time,created_by,updated_by)
select 'ada00000-0000-4000-8000-000000000009',ln.workspace_id,ln.id,ln.location_id,'ada50000-0000-4000-8000-000000000002',
'ada30000-0000-4000-8000-000000000001','ada40000-0000-4000-8000-000000000001','09:00','17:00',ln.created_by,ln.updated_by
from public.schedule_lineups ln where ln.workspace_id='6ea5d512-bc7f-4cf3-aad4-2f0815de00fd' and ln.lineup_date='2030-01-07' and ln.location_id='ada10000-0000-4000-8000-000000000001';
select is(public.lineup_candidate_check('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','ada50000-0000-4000-8000-000000000002',target||'{"location_id":"ada10000-0000-4000-8000-000000000002","start_time":"17:15","end_time":"18:00"}')->>'status','ineligible','standalone daily assignment reserves travel') from lu_test;
update public.schedule_lineup_entries set hidden=true where id='ada00000-0000-4000-8000-000000000009';
select is(public.lineup_candidate_check('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','ada50000-0000-4000-8000-000000000002',target||'{"location_id":"ada10000-0000-4000-8000-000000000002","start_time":"17:15","end_time":"18:00"}')->>'status','eligible','hidden standalone extra is not active work') from lu_test;
update public.schedule_lineup_entries set hidden=false,call_off=true where id='ada00000-0000-4000-8000-000000000009';
select is(public.lineup_candidate_check('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','ada50000-0000-4000-8000-000000000002',target||'{"location_id":"ada10000-0000-4000-8000-000000000002","start_time":"17:15","end_time":"18:00"}')->>'status','eligible','called-off standalone extra is not active work') from lu_test;

update lu_test set op=jsonb_build_object('kind','move','source_entry_id',(select id from public.schedule_lineup_entries where source_shift_id=lu_test.source_id),'target_entry_id',null,'employee_id',null,'target',target||'{"location_id":"ada10000-0000-4000-8000-000000000002","start_time":"10:00","end_time":"12:00"}','reason','Travel partial move','travel_minutes',0);
update lu_test set preview=pg_temp.run('preview',jsonb_build_object('operation',op));
select is(preview->>'effective_travel_minutes','30','preview uses company minimum for partial move') from lu_test;
select is(pg_temp.run('preview',jsonb_build_object('operation',op||'{"travel_minutes":60}'))->>'effective_travel_minutes','60','higher operation travel survives preview') from lu_test;
select pg_temp.settings('{"minimum_travel_minutes":60}');
select is(pg_temp.run('preview',jsonb_build_object('operation',op||'{"travel_minutes":30}'))->>'effective_travel_minutes','60','lower operation travel cannot bypass company minimum') from lu_test;
select throws_ok($$select pg_temp.run('apply',jsonb_build_object('operation',op,'fingerprint',preview->>'fingerprint','idempotency_key','ada00000-0000-4000-8000-000000000002')) from lu_test$$,'P0001','stale Line Up operation preview','policy change invalidates a prior Line Up review');
select pg_temp.settings('{"minimum_travel_minutes":30}');
update lu_test set preview=pg_temp.run('preview',jsonb_build_object('operation',op));
select is(preview->>'allowed','true','partial move with reserved travel is allowed') from lu_test;
update lu_test set result=pg_temp.run('apply',jsonb_build_object('operation',op,'fingerprint',preview->>'fingerprint','idempotency_key','ada00000-0000-4000-8000-000000000002'));
select is((select string_agg(start_time::text||'-'||end_time::text,',' order by start_time) from public.schedule_published_shifts where publication_id in (select id from public.schedule_location_publications where status='current') and scheduled_date='2030-01-07' and location_id='ada10000-0000-4000-8000-000000000001' and employee_id='ada50000-0000-4000-8000-000000000001'),'09:00:00-09:30:00,12:30:00-17:00:00','committed residual work reserves the reviewed 30 minutes');
select is((select count(*)::int from public.schedule_published_shifts where scheduled_date='2030-01-07' and location_id='ada10000-0000-4000-8000-000000000001' and employee_id is null and (start_time,end_time) in (('09:30'::time,'10:00'::time),('12:00'::time,'12:30'::time))),2,'travel gaps remain open in Schedule');
select pg_temp.settings('{"minimum_travel_minutes":60}');
select is(pg_temp.run('apply',jsonb_build_object('operation',op,'fingerprint',preview->>'fingerprint','idempotency_key','ada00000-0000-4000-8000-000000000002'))->>'event_id',result->>'event_id','successful retry remains idempotent after policy changes') from lu_test;
select is(pg_temp.clock_digest()::text,(select digest::text from lu_clock_before),'policy and staffing preserve actual time records');

-- Apply the shared minimum to both sides of a real partial swap, not just preview.
create function pg_temp.apply_op(op jsonb) returns jsonb language plpgsql as $$
declare p jsonb; begin p:=pg_temp.run('preview',jsonb_build_object('operation',op));
return pg_temp.run('apply',jsonb_build_object('operation',op,'fingerprint',p->>'fingerprint','idempotency_key',gen_random_uuid()));end;$$;
create temp table travel_swap(day date,minimum integer,requested integer,effective integer,a uuid,b uuid,op jsonb,preview jsonb);
insert into travel_swap(day,minimum,requested,effective) values('2030-01-08',30,0,30),('2030-01-09',30,60,60),('2030-01-10',60,30,60);
-- Build/apply each scenario in one DO block; pgTAP assertions follow on persisted rows.
do $$declare r record; t jsonb; v jsonb; begin
for r in select * from travel_swap order by day loop
 perform pg_temp.settings(jsonb_build_object('minimum_travel_minutes',r.minimum));
 select target||jsonb_build_object('date',r.day) into t from lu_test;
 v:=pg_temp.apply_op(jsonb_build_object('kind','assign','source_entry_id',null,'target_entry_id',null,'employee_id','ada50000-0000-4000-8000-000000000001','target',t,'reason','Shared travel swap source','travel_minutes',0));
 update travel_swap set a=(v->>'shift_id')::uuid where day=r.day;
 v:=pg_temp.apply_op(jsonb_build_object('kind','assign','source_entry_id',null,'target_entry_id',null,'employee_id','ada50000-0000-4000-8000-000000000002','target',t||'{"location_id":"ada10000-0000-4000-8000-000000000002"}','reason','Shared travel swap counterpart','travel_minutes',0));
 update travel_swap set b=(v->>'shift_id')::uuid where day=r.day;
 update travel_swap set op=jsonb_build_object('kind','swap','source_entry_id',(select id from public.schedule_lineup_entries where source_shift_id=a),'target_entry_id',(select id from public.schedule_lineup_entries where source_shift_id=b),'employee_id',null,'target',t||'{"start_time":"12:00","end_time":"15:00"}','reason','Shared minimum partial swap','travel_minutes',r.requested) where day=r.day;
 update travel_swap set preview=pg_temp.run('preview',jsonb_build_object('operation',op)) where day=r.day;
 perform pg_temp.apply_op(op) from travel_swap where day=r.day;
end loop;end;$$;
select is((preview->>'effective_travel_minutes')::integer,effective,day||': preview uses max(company, requested)') from travel_swap;
select is((select employee_id from public.schedule_published_shifts where id=a),'ada50000-0000-4000-8000-000000000002'::uuid,day||': first selected interval changes owner') from travel_swap;
select is((select employee_id from public.schedule_published_shifts where id=b),'ada50000-0000-4000-8000-000000000001'::uuid,day||': second selected interval changes owner atomically') from travel_swap;
select is((select count(*)::integer from public.schedule_published_shifts where scheduled_date=day and location_id in('ada10000-0000-4000-8000-000000000001','ada10000-0000-4000-8000-000000000002') and employee_id is null and ((start_time=('12:00'::time-make_interval(mins=>effective)) and end_time='12:00') or (start_time='15:00' and end_time=('15:00'::time+make_interval(mins=>effective))))),4,day||': both locations contain four exact open travel gaps') from travel_swap;
select is((select count(*)::integer from public.schedule_published_shifts where scheduled_date=day and ((location_id='ada10000-0000-4000-8000-000000000001' and employee_id='ada50000-0000-4000-8000-000000000001') or (location_id='ada10000-0000-4000-8000-000000000002' and employee_id='ada50000-0000-4000-8000-000000000002')) and ((start_time='09:00' and end_time=('12:00'::time-make_interval(mins=>effective))) or (start_time=('15:00'::time+make_interval(mins=>effective)) and end_time='17:00'))),4,day||': four residual working intervals retain original owners') from travel_swap;
select is(pg_temp.clock_digest()::text,(select digest::text from lu_clock_before),'all shared travel swaps preserve time records');
select * from finish();
rollback;

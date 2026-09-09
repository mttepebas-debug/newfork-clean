-- Rollback-only golden fixture for the web date-coverage projection.
begin;
create temp table tp as select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'::uuid w,
 'afc10000-0000-4000-8000-000000000001'::uuid emp,'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5'::uuid actor,
 (select jsonb_agg(jsonb_build_object('day',d,'mode','unrestricted','windows','[]'::jsonb)) from generate_series(0,6)d) rules;
insert into public.employee_profiles(id,workspace_id,employee_code,first_name,last_name,created_by)
 select emp,w,'E-995711','Temporary projection','QA',actor from tp;
insert into public.employee_schedule_availability_versions(id,workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from,effective_until,kind,replace_version_ids)
 select ('afc20000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,w,emp,n,'UTC',rules,'employee',actor,starts::date,ends::date,case when ends is null then 'weekly' else 'temporary' end,
 case when replaces is null then '{}'::uuid[] else array[('afc20000-0000-4000-8000-'||lpad(replaces::text,12,'0'))::uuid] end
 from tp cross join (values(1,'2034-01-01',null,null),(2,'2035-01-01','2035-01-31',null),
 (3,'2035-01-10','2035-01-20',2),(4,'2035-01-15','2035-01-17',3),(5,'2035-01-15','2035-01-17',4),
 (6,'2035-01-25',null,2),(7,'2036-02-28','2036-03-01',null)) v(n,starts,ends,replaces) order by n;
select jsonb_build_object('versions',(select jsonb_agg(jsonb_build_object('id',v.id,'revision',version_number,'effective_from',effective_from,'effective_until',effective_until,
 'kind',kind,'timezone',timezone,'days',recurring_rules,'replace_version_ids',to_jsonb(replace_version_ids),'source',source,'request_id',request_id,
 'confirmation_source',confirmation_source,'confirmation',confirmation) order by version_number) from public.employee_schedule_availability_versions v where employee_id=tp.emp),
 'cases',(select jsonb_agg(jsonb_build_object('starts_on',starts,'ends_on',ends,'expected_ids',
   (select coalesce(jsonb_agg(id order by id),'[]') from public.availability_overlapping_temporary_versions(tp.w,tp.emp,jsonb_build_object('effective_from',starts,'effective_until',ends)) id)))
 from (values('2035-01-01','2035-01-31'),('2035-01-12','2035-01-22'),('2035-01-18','2035-01-18'),('2035-01-25',null),
 ('2035-01-15','2035-01-17'),('2036-02-29','2036-02-29'),('2036-03-02',null)) ranges(starts,ends))) from tp;
rollback;

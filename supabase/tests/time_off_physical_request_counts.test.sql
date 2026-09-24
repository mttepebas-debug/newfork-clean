begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table cq as select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'::uuid w,
 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'::uuid owner,'afa00000-0000-4000-8000-000000000001'::uuid actor,
 'afa00000-0000-4000-8000-000000000002'::uuid reviewer,'afa00000-0000-4000-8000-000000000003'::uuid emp,
 'afa00000-0000-4000-8000-000000000004'::uuid a,'afa00000-0000-4000-8000-000000000005'::uuid b,
 'afa00000-0000-4000-8000-000000000006'::uuid job,'afa00000-0000-4000-8000-000000000007'::uuid typ,
 null::uuid request,null::jsonb preview,null::jsonb snapshot;
select public.availability_lock_workspace(w) from cq;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',id::text||'@counts.test','','{}','{}',now(),now() from cq cross join lateral(values(actor),(reviewer)) u(id);
insert into public.workspace_memberships(workspace_id,user_id,role,status,all_locations) select w,actor,'employee','active',true from cq;
insert into public.locations(short_name, id,workspace_id,name,timezone,street_address,city,region,postal_code)
select 'T00044', a,w,'Counts 24001 UTC','UTC','1 Test St','Test','CA','94000' from cq union all
select 'T00045', b,w,'Counts 24001 Hidden LA','America/Los_Angeles','2 Test St','Test','CA','94000' from cq;
insert into public.jobs(id,workspace_id,name) select job,w,'Counts 24001 job' from cq;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
select emp,w,actor,'E-995401','Counts 24001','Employee',owner from cq;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
select w,emp,a,owner from cq union all select w,emp,b,owner from cq;
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,created_by) select w,emp,job,owner from cq;
insert into public.shift_types(id,workspace_id,name,default_start_time,default_end_time) select typ,w,'Counts 24001 Lunch','12:00','16:00' from cq;
insert into public.employee_schedule_availability_versions(workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from)
select w,emp,1,'UTC',(select jsonb_agg(jsonb_build_object('day',d,'mode','unrestricted','windows','[]'::jsonb)) from generate_series(0,6)d),'employee',owner,'2034-01-01' from cq;
insert into public.workspace_roles(id,workspace_id,name,access_class) select 'afa10000-0000-4000-8000-000000000001',w,'Counts 24001 scoped reviewer','manager' from cq;
insert into public.workspace_role_permissions(workspace_id,role_id,permission_key)
select w,'afa10000-0000-4000-8000-000000000001',p from cq,unnest(array['workspace.read','schedule.time_off_requests.read','schedule.time_off_requests.manage','schedule.publish'])p;
insert into public.workspace_memberships(id,workspace_id,user_id,role,role_id,status,all_locations)
select 'afa10000-0000-4000-8000-000000000002',w,reviewer,'manager','afa10000-0000-4000-8000-000000000001','active',false from cq;
select tests.works_at('afa10000-0000-4000-8000-000000000002', a) from cq;
create temp table cq_publications as select n,('afa20000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid id,
 case when n=2 then b else a end location,case when n=3 then '2035-01-08'::date else '2035-01-15'::date end week from cq,generate_series(1,3)n;
insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
select p.id,w,p.location,p.week,1,owner from cq,cq_publications p;
create temp table cq_shifts as select n,('afa30000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid id,
 case when n=4 then 2 when n=5 then 3 else 1 end pub,
 case when n=5 then '2035-01-14'::date when n=6 then '2035-01-16'::date else '2035-01-15'::date end scheduled_date,
 -- The fourth shift is at the other location, which runs eight hours behind.
 -- It used to sit at 04:00 there, which is the same hour of the day as the
 -- third shift here, and the point of it was that the counter measures real
 -- time rather than the clock on the wall. Nobody can hold two shifts at once
 -- any more, so it moved to 10:00 there -- still the far location, still the
 -- other time zone, no longer the same moment.
 (array['08:00','10:00','12:00','10:00','23:00','18:00'])[n] start_time,
 (array['10:00','12:00','16:00','11:00','02:00','20:00'])[n] end_time from generate_series(1,6)n;
insert into public.schedule_published_shifts(id,workspace_id,publication_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,time_basis,time_snapshot,time_timezone,source_shift_id)
select s.id,w,p.id,p.location,emp,job,case when s.n in(3,6) then typ end,s.scheduled_date,(value->>'start_time')::time,(value->>'end_time')::time,
 value->>'time_basis',value->'time_snapshot',value->>'time_timezone',s.id
from cq,cq_shifts s join cq_publications p on p.n=s.pub
cross join lateral(select public.normalize_schedule_time_source(w,jsonb_build_object('location_id',p.location,'employee_id',emp,'job_id',job,'shift_type_id',case when s.n in(3,6) then typ end,
 'scheduled_date',s.scheduled_date,'time_basis',case when s.n=3 then 'type_default' else 'explicit' end,'start_time',case when s.n=3 then null else s.start_time end,'end_time',case when s.n=3 then null else s.end_time end)) value) source;
update cq set snapshot=(select jsonb_agg(to_jsonb(s) order by s.id) from public.schedule_published_shifts s where s.employee_id=cq.emp);
create function pg_temp.cq_request(d date,s text,e text) returns uuid language sql as $$
 select (public.submit_employee_time_off_periods_service(actor,w,a,'Counts 24001 request',jsonb_build_array(jsonb_build_object('segment_date',d,'start_time',s,'end_time',e)),gen_random_uuid(),'UTC')->>'request_id')::uuid from cq;
$$;
create function pg_temp.cq_row(who uuid,closed boolean default false) returns jsonb language sql as $$
 select r from cq,jsonb_array_elements(public.get_schedule_requests_service(who,w,case when closed then 'closed' else 'needs_review' end,null,'Counts 24001')->'time_off_requests') r where r->>'id'=request::text;
$$;
savepoint overlapping;
-- Wide enough to reach both: the Lunch shift here, and the one at the far
-- location whose hours land in the evening once the time zone is applied.
update cq set request=pg_temp.cq_request('2035-01-15','12:00','19:00');
select is((pg_temp.cq_row(owner)->>'conflict_count')::int,2,'counter includes the saved Lunch interval and cross-location LA assignment') from cq;
update cq set preview=public.preview_time_off_assignment_decision_service(owner,w,request,1,'approve','[]');
select is((pg_temp.cq_row(owner)->>'conflict_count')::int,jsonb_array_length(preview->'affected_shifts')+(preview->>'restricted_count')::int,'summary count matches the final full-approval preview') from cq;
select is((pg_temp.cq_row(reviewer)->>'conflict_count')::int,2,'scoped reader is warned about the same physical assignments') from cq;
select ok(position('Hidden LA' in pg_temp.cq_row(reviewer)::text)=0,'count does not expose another location name or assignment identity') from cq;
select is(public.preview_time_off_assignment_decision_service(reviewer,w,request,1,'approve','[]')->>'restricted_count','1','cross-location decision still requires a broader reviewer') from cq;
update public.shift_types set default_start_time='17:00',default_end_time='20:00' where id=(select typ from cq);
update public.locations set timezone='UTC' where id=(select b from cq);
select is((pg_temp.cq_row(owner)->>'conflict_count')::int,2,'later shift-type defaults and location time zone edits cannot move published intervals') from cq;
select is((select jsonb_agg(to_jsonb(s) order by s.id) from public.schedule_published_shifts s where s.employee_id=cq.emp),snapshot,'reading counts and previews never changes a published responsibility') from cq;
select is(public.time_off_request_assignment_count(gen_random_uuid(),request),0,'private helper never mixes a request into a different workspace') from cq;
select throws_ok($$select public.get_schedule_requests_service(actor,w) from cq$$,'42501',null,'employee cannot enumerate the manager queue');
rollback to savepoint overlapping;
savepoint boundary;
update cq set request=pg_temp.cq_request('2035-01-15','16:00','17:00');
select is((pg_temp.cq_row(owner)->>'conflict_count')::int,0,'same-day work and touching end boundaries are not false conflicts') from cq;
rollback to savepoint boundary;
savepoint precise;
update cq set request=pg_temp.cq_request('2035-01-15','15:59:59','16:00');
select is((pg_temp.cq_row(owner)->>'conflict_count')::int,1,'one second of real overlap is counted') from cq;
rollback to savepoint precise;
savepoint overnight;
update cq set request=pg_temp.cq_request('2035-01-15','00:30','01:30');
select is((pg_temp.cq_row(owner)->>'conflict_count')::int,1,'overnight work starting on the previous calendar date is counted') from cq;
rollback to savepoint overnight;
savepoint named_explicit;
update cq set request=pg_temp.cq_request('2035-01-16','13:00','14:00');
select is((pg_temp.cq_row(owner)->>'conflict_count')::int,0,'name plus explicit hours does not use the type default interval') from cq;
rollback to savepoint named_explicit;
savepoint explicit_overlap;
update cq set request=pg_temp.cq_request('2035-01-16','19:00','19:30');
select is((pg_temp.cq_row(owner)->>'conflict_count')::int,1,'name plus time uses its explicit overlapping hours') from cq;
select public.resolve_schedule_time_off_request_service(owner,w,request,1,'deny','Cannot approve these hours') from cq;
select is((pg_temp.cq_row(owner,true)->>'conflict_count')::int,0,'denied history does not claim an effective assignment conflict') from cq;
rollback to savepoint explicit_overlap;
savepoint legacy_approved;
update cq set request=pg_temp.cq_request('2035-01-15','12:00','17:00');
-- Reproduce an older partially approved record overlapping a publication.
-- New approvals cannot create this state without explicit shift disposition.
insert into public.time_off_decision_pieces(workspace_id,request_id,segment_id,decision_revision,starts_at,ends_at,time_timezone,status)
select w,request,s.id,2,'2035-01-15 12:00Z'::timestamptz,'2035-01-15 13:00Z'::timestamptz,'UTC','denied'::public.time_off_segment_status from cq join public.schedule_time_off_segments s on s.request_id=cq.request
union all select w,request,s.id,2,'2035-01-15 13:00Z'::timestamptz,'2035-01-15 17:00Z'::timestamptz,'UTC','approved'::public.time_off_segment_status from cq join public.schedule_time_off_segments s on s.request_id=cq.request;
update public.schedule_time_off_segments set status='approved' where request_id=(select request from cq);
update public.schedule_time_off_requests set status='partially_approved',revision=2 where id=(select request from cq);
select is((pg_temp.cq_row(owner,true)->>'conflict_count')::int,1,'closed partial history counts only approved pieces, excluding denied hours') from cq;
create temp table cq_cancellation as select (public.submit_employee_time_off_cancellation_service(actor,w,request,2,'Plans changed',
 jsonb_build_array(jsonb_build_object('segment_id',(select id from public.schedule_time_off_segments where request_id=cq.request),
 'starts_at','2035-01-15T13:00:00Z','ends_at','2035-01-15T16:00:00Z')),gen_random_uuid())->>'request_id')::uuid id from cq;
select is(public.time_off_request_assignment_count(w,(select id from cq_cancellation)),0,'cancellation requests do not propose assignment release') from cq;
select is((pg_temp.cq_row(owner,true)->>'conflict_count')::int,1,'pending cancellation does not remove the parent leave conflict') from cq;
select public.resolve_time_off_period_decision_service(owner,w,(select id from cq_cancellation),1,'approve','Cancellation confirmed','[]',gen_random_uuid()) from cq;
select is((pg_temp.cq_row(owner,true)->>'conflict_count')::int,0,'accepted cancellation removes only the cancelled overlap from the parent count') from cq;
select is((select jsonb_agg(to_jsonb(s) order by s.id) from public.schedule_published_shifts s where s.employee_id=cq.emp),snapshot,'legacy conflict review and cancellation never retroactively alter published assignments') from cq;
rollback to savepoint legacy_approved;
select ok(not has_function_privilege('authenticated','public.time_off_request_assignment_count(uuid,uuid)','execute'),'count helper cannot be called by employees directly');
select ok(not has_function_privilege('service_role','public.time_off_request_assignment_count(uuid,uuid)','execute'),'service clients must use the scoped queue read');
select * from finish();
rollback;

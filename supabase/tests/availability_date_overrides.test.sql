begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table ado as select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'::uuid w,
 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'::uuid manager,'afa30000-0000-4000-8000-000000000001'::uuid actor,
 'afa30000-0000-4000-8000-000000000002'::uuid emp,'afa30000-0000-4000-8000-000000000003'::uuid loc,
 'afa30000-0000-4000-8000-000000000004'::uuid lunch,null::jsonb result,null::uuid request,null::uuid old_version;
select public.availability_lock_workspace(w) from ado;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select actor,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','date-overrides@example.test','','{}','{}',now(),now() from ado;
insert into public.workspace_memberships(workspace_id,user_id,role,status,all_locations) select w,actor,'employee','active',true from ado;
insert into public.locations(id,workspace_id,name,timezone,street_address,city,region,postal_code)
select loc,w,'Date overrides 25001','UTC','1 Test St','Test','CA','94000' from ado;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
select emp,w,actor,'E-995501','Dated','Availability',manager from ado;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by) select w,emp,loc,manager from ado;
insert into public.shift_types(id,workspace_id,name,default_start_time,default_end_time) select lunch,w,'Dated Lunch','12:00','16:00' from ado;
update public.workspace_scheduling_settings set availability_ownership='hybrid',availability_approval='narrowing',availability_initial_review=false,availability_notice_days=0,availability_enforcement='hard' where workspace_id=(select w from ado);
create function pg_temp.ado_proposal(changes jsonb,starts text default '2035-01-15',ends text default '2035-01-15',zone text default 'UTC') returns jsonb language sql as $$
 select jsonb_build_object('timezone',zone,'effective_from',starts,'effective_until',ends,'kind','temporary','date_overrides',changes,
 'days',(select jsonb_agg(jsonb_build_object('day',d,'mode','unavailable','windows','[]'::jsonb)) from generate_series(0,6) d));
$$;
create function pg_temp.ado_submit(p jsonb,ids jsonb default '[]',src text default 'employee') returns jsonb language sql as $$
 select public.availability_command_service(actor,w,jsonb_build_object('action','submit','employee_id',emp,'expected_revision',coalesce((select max(version_number) from public.employee_schedule_availability_versions where workspace_id=t.w and employee_id=t.emp),0),
 'proposal',p,'source',src,'replace_version_ids',ids),gen_random_uuid()) from ado t;
$$;
create function pg_temp.ado_decide(action text default 'approve') returns jsonb language sql as $$
 select public.availability_command_service(manager,w,jsonb_build_object('action',action,'employee_id',emp,'request_id',request,'expected_revision',coalesce((select max(version_number) from public.employee_schedule_availability_versions where workspace_id=t.w and employee_id=t.emp),0),
 'expected_request_revision',(select revision from public.availability_requests where id=t.request),'reason','Reviewed dated hours',
 'policy_revision',(select availability_policy_revision from public.workspace_scheduling_settings where workspace_id=t.w)),gen_random_uuid()) from ado t;
$$;
create function pg_temp.ado_assess(start_clock text,end_clock text,day text default '2035-01-15',typ uuid default null) returns jsonb language sql as $$
 select public.assess_shift_availability(w,emp,jsonb_build_object('location_id',loc,'employee_id',emp,'shift_type_id',typ,'scheduled_date',day,
 'time_basis','explicit','time_timezone','UTC','start_time',start_clock,'end_time',end_clock)) from ado;
$$;
select throws_ok($$select pg_temp.ado_submit(pg_temp.ado_proposal('[{"segment_date":"2035-01-15","start_time":"10:00","end_time":"17:00","mode":"unavailable"}]'))$$,'22023',null,'dated changes require an approved base pattern');
insert into public.employee_schedule_availability_versions(workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from)
select w,emp,1,'UTC',(select jsonb_agg(jsonb_build_object('day',d,'mode','windows','windows','[{"start":"09:00","end":"18:00"}]'::jsonb,
 'blocked_shift_type_ids',case when d=1 then jsonb_build_array(lunch) else '[]'::jsonb end)) from generate_series(0,6)d),'employee',actor,'2034-01-01' from ado;
select is(pg_temp.ado_assess('09:00','18:00')->>'coverage','full','baseline hours known before change');
update ado set result=pg_temp.ado_submit(pg_temp.ado_proposal('[{"segment_date":"2035-01-15","start_time":"10:00","end_time":"17:00","mode":"unavailable"}]'));
update ado set request=(result->>'request_id')::uuid;
select is(result->>'status','pending_review','hour-only narrowing requires review') from ado;
select is(pg_temp.ado_assess('10:00','17:00')->>'coverage','full','unapproved change does not change capacity');
select is(pg_temp.ado_decide()->>'status','effective','manager approval activates dated change');
update ado set old_version=(select id from public.employee_schedule_availability_versions where request_id=ado.request);
select is(pg_temp.ado_assess('09:00','10:00')->>'coverage','full','hours before selected range preserved');
select is(pg_temp.ado_assess('17:00','18:00')->>'coverage','full','touching hours after selected range preserved');
select is(pg_temp.ado_assess('10:00','17:00')->>'coverage','none','only selected hours become unavailable');
select is(pg_temp.ado_assess('09:00','18:00')->>'coverage','partial','mixed shift is partially covered');
select is(public.availability_rules_for_date(emp,'2035-01-15')->1->'windows','[{"start":"09:00:00","end":"10:00:00"},{"start":"17:00:00","end":"18:00:00"}]'::jsonb,'legacy calendar projection includes remaining hours') from ado;
select is(pg_temp.ado_assess('09:00','18:00','2035-01-16')->>'coverage','full','following day unchanged');
select is(pg_temp.ado_assess('09:00','18:00','2035-01-22')->>'coverage','full','does not recur the next week');
select is(pg_temp.ado_assess('09:00','10:00','2035-01-15',lunch)->>'operation','blocked','clock edit retains independent Lunch restriction') from ado;
select is((public.availability_version_for_calendar(emp,'2035-01-15')).version_number,1,'calendar baseline does not select inert overlay weekdays') from ado;
select is(jsonb_array_length(public.availability_read_service(actor,w)->'versions'->0->'date_overrides'),1,'employee read includes exact dated change') from ado;
select is((select p->>'start_time' from ado cross join lateral jsonb_array_elements((public.availability_read_service(manager,w,emp)->'versions'->0->'date_overrides')) p),'10:00:00','manager sees original clocks');
select throws_ok($$select pg_temp.ado_submit(pg_temp.ado_proposal('[{"segment_date":"2035-01-15","start_time":"12:00","end_time":"13:00","mode":"available"}]'))$$,'40001',null,'overlapping approved exception cannot be silently overwritten');
select is(pg_temp.ado_submit(pg_temp.ado_proposal('[{"segment_date":"2035-01-15","start_time":"12:00","end_time":"13:00","mode":"available"}]'),jsonb_build_array(old_version))->>'status','effective','explicit subset replacement expands only its chosen hour') from ado;
select is(pg_temp.ado_assess('12:00','13:00')->>'coverage','full','replacement opens chosen hour');
select is(pg_temp.ado_assess('10:00','12:00')->>'coverage','none','left piece of old exception preserved');
select is(pg_temp.ado_assess('13:00','17:00')->>'coverage','none','right piece of old exception preserved');
select is(pg_temp.ado_assess('12:00','13:00','2035-01-15',lunch)->>'operation','blocked','available exception never removes Lunch restriction') from ado;
select throws_ok($$select pg_temp.ado_submit(pg_temp.ado_proposal('[{"segment_date":"2035-01-15","start_time":"12:00","end_time":"13:00","mode":"available"}]'),jsonb_build_array((select id from public.employee_schedule_availability_versions where employee_id=(select emp from ado) and version_number=1)))$$,'22023',null,'dated change cannot replace a weekly baseline');
-- A later weekly expansion affects only non-overridden hours.
select is(pg_temp.ado_submit(jsonb_build_object('timezone','UTC','effective_from','2035-01-15','effective_until',null,'kind','weekly',
 'days',(select jsonb_agg(jsonb_build_object('day',d,'mode','windows','windows','[{"start":"08:00","end":"20:00"}]'::jsonb,'blocked_shift_type_ids',case when d=1 then jsonb_build_array(lunch) else '[]'::jsonb end)) from generate_series(0,6)d)))->>'status','effective','weekly update can preserve dated overlays without replacing them') from ado;
select is(pg_temp.ado_assess('08:00','10:00')->>'coverage','full','new weekly expansion is visible outside exception');
select is(pg_temp.ado_assess('13:00','17:00')->>'coverage','none','new weekly version cannot erase dated exception');
select is(pg_temp.ado_assess('18:00','20:00')->>'coverage','full','new weekly hours after exception visible');
-- DST validation and immutable canonical snapshot integrity.
select throws_ok($$select public.availability_resolve_date_overrides(pg_temp.ado_proposal('[{"segment_date":"2035-03-11","start_time":"02:30","end_time":"04:00","mode":"unavailable"}]','2035-03-11','2035-03-11','America/Los_Angeles'))$$,'22023',null,'nonexistent spring clock rejected');
select throws_ok($$select public.availability_resolve_date_overrides(pg_temp.ado_proposal('[{"segment_date":"2035-11-04","start_time":"01:15","end_time":"02:00","mode":"unavailable"}]','2035-11-04','2035-11-04','America/Los_Angeles'))$$,'22023',null,'ambiguous repeated clock requires occurrence');
select is((public.availability_resolve_date_overrides(pg_temp.ado_proposal('[{"segment_date":"2035-11-04","start_time":"01:15","end_time":"02:00","start_fold":"earlier","mode":"unavailable"}]','2035-11-04','2035-11-04','America/Los_Angeles'))->0->>'starts_at')::timestamptz,'2035-11-04 08:15Z'::timestamptz,'earlier occurrence has explicit physical instant');
update ado set result=pg_temp.ado_submit(pg_temp.ado_proposal('[{"segment_date":"2035-11-04","start_time":"01:15","end_time":"02:00","start_fold":"earlier","mode":"unavailable"}]','2035-11-04','2035-11-04','America/Los_Angeles'));
update ado set request=(result->>'request_id')::uuid;
select is(result->>'status','pending_review','dated time-zone change is reviewed') from ado;
select is(pg_temp.ado_decide()->>'status','effective','approval preserves the repeated-clock snapshot');
select is(pg_temp.ado_assess('08:30','09:30','2035-11-04')->>'coverage','none','saved first-occurrence period covers physical hours across the fold');
select is((select extract(epoch from ((p->>'ends_at')::timestamptz-(p->>'starts_at')::timestamptz))::integer from jsonb_array_elements(public.availability_resolve_date_overrides(pg_temp.ado_proposal('[{"segment_date":"2035-03-11","mode":"unavailable"}]','2035-03-11','2035-03-11','America/Los_Angeles')))p),23*3600,'entire spring calendar day covers 23 actual hours');
select throws_ok($$select public.availability_resolve_date_overrides(pg_temp.ado_proposal('[{"segment_date":"2035-01-15","start_time":"23:00","end_time":"02:00","ends_next_day":true,"mode":"unavailable"}]'))$$,'22023',null,'overnight cannot hide the affected next date');
select lives_ok($$select public.availability_resolve_date_overrides(pg_temp.ado_proposal('[{"segment_date":"2035-01-15","start_time":"23:00","end_time":"02:00","ends_next_day":true,"mode":"unavailable"}]','2035-01-15','2035-01-16'))$$,'overnight captures both affected dates');
select throws_ok($$select public.availability_resolve_date_overrides(pg_temp.ado_proposal('[{"segment_date":"2035-01-15","start_time":"10:00","end_time":"12:00","mode":"available"},{"segment_date":"2035-01-15","start_time":"11:00","end_time":"13:00","mode":"unavailable"}]'))$$,'22023',null,'opposing overlapping pieces rejected');
select throws_ok($$update public.employee_schedule_availability_versions set date_overrides='[]' where id=(select old_version from ado)$$,'23514',null,'approved date exception is immutable');
select is(public.availability_proposals_overlap(pg_temp.ado_proposal('[{"segment_date":"2035-01-15","start_time":"10:00","end_time":"12:00","mode":"available"}]'),pg_temp.ado_proposal('[{"segment_date":"2035-01-15","start_time":"12:00","end_time":"13:00","mode":"unavailable"}]')),false,'touching pending dated changes are independent');
select is(pg_temp.ado_submit(pg_temp.ado_proposal('[{"segment_date":"2035-02-06","start_time":"10:00","end_time":"11:00","mode":"unavailable"}]','2035-02-06','2035-02-06'))->>'status','pending_review','first future dated request awaits review');
select is(pg_temp.ado_submit(pg_temp.ado_proposal('[{"segment_date":"2035-02-06","start_time":"11:00","end_time":"12:00","mode":"unavailable"}]','2035-02-06','2035-02-06'))->>'status','pending_review','nonoverlapping hours on same date can have independent requests');
select is(pg_temp.ado_assess('10:00','11:00','2035-02-06')->>'operation','verification_required','pending dated notice affects its exact hours');
select is(pg_temp.ado_assess('13:00','14:00','2035-02-06')->>'operation','allowed','pending dated notice does not block unrelated hours');
select throws_ok($$select pg_temp.ado_submit(pg_temp.ado_proposal('[{"segment_date":"2035-02-06","start_time":"10:30","end_time":"11:30","mode":"unavailable"}]','2035-02-06','2035-02-06'))$$,'40001',null,'actual pending overlap still requires explicit replacement');
-- Another location's Sunday publication still owns Monday UTC's early hours.
update public.locations set timezone='America/Los_Angeles' where id=(select loc from ado);
insert into public.availability_publication_locks(workspace_id,location_id,week_start,first_published_at) select w,loc,'2035-01-08',now() from ado;
select throws_ok($$select pg_temp.ado_submit(pg_temp.ado_proposal('[{"segment_date":"2035-01-15","start_time":"00:00","end_time":"01:00","mode":"unavailable"}]'))$$,'23514',null,'physical overlap with previous published location week is locked');
update public.locations set timezone='UTC' where id=(select loc from ado);
-- Publication locking applies even to hours outside any assigned shift.
insert into public.availability_publication_locks(workspace_id,location_id,week_start,first_published_at) select w,loc,'2035-01-15',now() from ado;
select throws_ok($$select pg_temp.ado_submit(pg_temp.ado_proposal('[{"segment_date":"2035-01-16","start_time":"10:00","end_time":"12:00","mode":"unavailable"}]','2035-01-16','2035-01-16'))$$,'23514',null,'published period rejects a late dated change');
set local role authenticated;
select throws_ok($$select public.availability_pattern_capacity_for_span(null,null,null)$$,'42501',null,'base capacity helper remains private');
select throws_ok($$select public.availability_validate_date_override_replacements(null,null,null,null)$$,'42501',null,'replacement validator remains private');
reset role;
-- Physical calendar projections share the assignment resolvers, including
-- replacement remnants, independent type rules and leave cancellation.
create function pg_temp.ado_calendar(d date default '2035-01-15',z text default 'UTC',n integer default 1) returns jsonb language sql as $$
 select public.availability_calendar_read_service(actor,w,emp,d,z,n) from ado;
$$;
select is(pg_temp.ado_calendar()->'days'->0->'available','[{"start_at":"2035-01-15T08:00:00.000000Z","end_at":"2035-01-15T10:00:00.000000Z"},{"start_at":"2035-01-15T12:00:00.000000Z","end_at":"2035-01-15T13:00:00.000000Z"},{"start_at":"2035-01-15T17:00:00.000000Z","end_at":"2035-01-15T20:00:00.000000Z"}]'::jsonb,'calendar composes weekly expansion and both sides of a replaced dated exception');
select ok(exists(select 1 from jsonb_array_elements(pg_temp.ado_calendar()->'days'->0->'sources') s where s->>'kind'='date_exception' and jsonb_array_length(s->'applies')>0),'calendar exposes the active dated source');
select is(pg_temp.ado_calendar()->'days'->0->'shift_type_rules'->0->>'shift_type_id',lunch::text,'dated clock changes do not erase service restriction in calendar') from ado;
select is(public.availability_calendar_read_service(manager,w,emp,'2035-01-15','UTC',1),pg_temp.ado_calendar(),'scoped manager and employee see identical physical hours') from ado;
select is(jsonb_array_length(public.availability_read_service(actor,w,emp)->'calendar'->'days'),7,'main read includes seven effective calendar days') from ado;
select is(pg_temp.ado_calendar('2035-02-06')->'days'->0->'available','[{"start_at":"2035-02-06T08:00:00.000000Z","end_at":"2035-02-06T20:00:00.000000Z"}]'::jsonb,'pending dated narrowing never changes approved calendar capacity');
select is(extract(epoch from ((pg_temp.ado_calendar('2035-03-11','America/Los_Angeles')->'days'->0->>'ends_at')::timestamptz-(pg_temp.ado_calendar('2035-03-11','America/Los_Angeles')->'days'->0->>'starts_at')::timestamptz))::integer,23*3600,'calendar spring day has 23 physical hours');
select is(extract(epoch from ((pg_temp.ado_calendar('2035-11-04','America/Los_Angeles')->'days'->0->>'ends_at')::timestamptz-(pg_temp.ado_calendar('2035-11-04','America/Los_Angeles')->'days'->0->>'starts_at')::timestamptz))::integer,25*3600,'calendar fall day has 25 physical hours');
select is(pg_temp.ado_calendar('2011-12-30','Pacific/Apia')->'days'->0->>'starts_at',null::text,'skipped civil date has no invented physical hours');
select ok(jsonb_array_length(pg_temp.ado_calendar('2033-01-01')->'days'->0->'unknown')>0,'dates without an approved baseline are unconfirmed');
select throws_ok($$select pg_temp.ado_calendar('2035-01-15','UTC',32)$$,'22023',null,'calendar bounds protect expensive read volume');
select throws_ok($$select pg_temp.ado_calendar('2035-01-15','Invalid/Zone')$$,'22023',null,'calendar rejects invalid display zone');
select throws_ok($$select public.availability_calendar_read_service(gen_random_uuid(),w,emp,'2035-01-15','UTC',1) from ado$$,'42501',null,'unrelated user cannot read employee calendar');
select throws_ok($$select public.availability_calendar_read_service(actor,gen_random_uuid(),emp,'2035-01-15','UTC',1) from ado$$,'42501',null,'calendar cannot cross workspaces');
create temp table calendar_leave as select (public.submit_employee_time_off_periods_service(actor,w,loc,'Calendar leave','[{"segment_date":"2035-01-15","start_time":"12:00","end_time":"13:00"}]',gen_random_uuid(),'UTC')->>'request_id')::uuid id from ado;
select is(pg_temp.ado_calendar()->'days'->0->'approved_leave','[]'::jsonb,'pending leave does not reduce capacity');
select public.resolve_schedule_time_off_request_service(manager,w,(select id from calendar_leave),1,'approve') from ado;
select is(pg_temp.ado_calendar()->'days'->0->'approved_leave','[{"start_at":"2035-01-15T12:00:00.000000Z","end_at":"2035-01-15T13:00:00.000000Z"}]'::jsonb,'approved leave shown as separate physical interval');
select is(jsonb_array_length(pg_temp.ado_calendar()->'days'->0->'planning_available'),2,'approved leave removed from available planning hours');
create temp table calendar_cancel as select (public.submit_employee_time_off_cancellation_service(actor,w,(select id from calendar_leave),2,'Calendar cancellation',
 jsonb_build_array(jsonb_build_object('segment_id',(select id from public.schedule_time_off_segments where request_id=(select id from calendar_leave)),
 'starts_at','2035-01-15T12:00:00Z','ends_at','2035-01-15T12:30:00Z')),gen_random_uuid())->>'request_id')::uuid id from ado;
select is(jsonb_array_length(pg_temp.ado_calendar()->'days'->0->'planning_available'),2,'pending cancellation does not restore capacity');
select public.resolve_time_off_period_decision_service(manager,w,(select id from calendar_cancel),1,'approve','Reviewed','[]',gen_random_uuid()) from ado;
select is(pg_temp.ado_calendar()->'days'->0->'planning_available'->1,'{"start_at":"2035-01-15T12:00:00.000000Z","end_at":"2035-01-15T12:30:00.000000Z"}'::jsonb,'only accepted cancellation hours return to planning capacity');
select is(jsonb_array_length(pg_temp.ado_calendar()->'days'->0->'shift_type_rules'),1,'leave cancellation cannot erase semantic type restrictions');
set local role authenticated;
select throws_ok($$select public.availability_calendar_read_service(null,null,null,null,null,1)$$,'42501',null,'calendar remains service-only');
select throws_ok($$select public.availability_read_before_calendar_service(null,null,null)$$,'42501',null,'wrapped read helper remains private');
reset role;
select * from finish();
rollback;

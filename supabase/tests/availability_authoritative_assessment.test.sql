begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table aa_state as select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'::uuid w,
 'ac910000-0000-4000-8000-000000000001'::uuid emp,'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5'::uuid actor,
 (select jsonb_agg(jsonb_build_object('day',d,'mode','unrestricted','windows','[]'::jsonb)) from generate_series(0,6) d) all_hours;
insert into public.employee_profiles(id,workspace_id,employee_code,first_name,last_name,created_by)
select emp,w,'E-993190','Interval','Assessment',actor from aa_state;
insert into public.employee_schedule_availability_versions(workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from)
select w,emp,1,'America/Los_Angeles',all_hours,'employee',actor,'2029-01-01' from aa_state;
create function pg_temp.aa_proposal(windows jsonb,zone_name text default 'America/Los_Angeles') returns jsonb language sql as $$
 select jsonb_build_object('timezone',zone_name,'effective_from','2029-01-01','effective_until',null,'kind','weekly','days',
  (select jsonb_agg(jsonb_build_object('day',d,'mode',case when jsonb_array_length(windows)=0 then 'unavailable' else 'windows' end,'windows',windows)) from generate_series(0,6) d));
$$;
create function pg_temp.aa(span tstzrange,proposal jsonb default null) returns public.availability_capacity_result language sql as $$
 select public.availability_capacity_for_span(w,emp,span,proposal) from aa_state;
$$;
select is((pg_temp.aa('[2030-01-07 20:00Z,2030-01-08 00:00Z)')).available,'{[2030-01-07 20:00Z,2030-01-08 00:00Z)}'::tstzmultirange,'unrestricted availability covers the entire physical interval');
select is((pg_temp.aa('[2028-01-07 20:00Z,2028-01-08 00:00Z)')).unknown,'{[2028-01-07 20:00Z,2028-01-08 00:00Z)}'::tstzmultirange,'before the first effective version remains unknown');
select is((pg_temp.aa('[2030-01-07 20:00Z,2030-01-08 00:00Z)',pg_temp.aa_proposal('[{"start":"00:00","end":"10:00"},{"start":"17:00","end":"24:00"}]'))).available,'{}'::tstzmultirange,'Lunch 12-16 is unavailable when employee blocks 10-17');
select is((pg_temp.aa('[2030-01-08 01:00Z,2030-01-08 03:00Z)',pg_temp.aa_proposal('[{"start":"00:00","end":"10:00"},{"start":"17:00","end":"24:00"}]'))).unavailable,'{}'::tstzmultirange,'shift beginning exactly at the unavailable end is allowed');
select is((pg_temp.aa('[2030-01-07 17:00Z,2030-01-07 20:00Z)',pg_temp.aa_proposal('[{"start":"00:00","end":"10:00"},{"start":"17:00","end":"24:00"}]'))).available,'{[2030-01-07 17:00Z,2030-01-07 18:00Z)}'::tstzmultirange,'partial coverage returns the exact available piece');
select is((pg_temp.aa('[2030-01-07 17:00Z,2030-01-07 20:00Z)',pg_temp.aa_proposal('[{"start":"00:00","end":"10:00"},{"start":"17:00","end":"24:00"}]'))).unavailable,'{[2030-01-07 18:00Z,2030-01-07 20:00Z)}'::tstzmultirange,'partial coverage returns the exact unavailable piece');
select is((pg_temp.aa('[2030-01-08 06:00Z,2030-01-08 10:00Z)',jsonb_build_object('timezone','America/Los_Angeles','effective_from','2029-01-01','effective_until',null,'kind','weekly','days',jsonb_set(all_hours,'{2}','{"day":2,"mode":"unavailable","windows":[]}')))).available,
 '{[2030-01-08 06:00Z,2030-01-08 08:00Z)}'::tstzmultirange,'overnight shift uses the next availability weekday after local midnight') from aa_state;
select is((pg_temp.aa('[2030-03-10 09:30Z,2030-03-10 10:30Z)',pg_temp.aa_proposal('[{"start":"02:00","end":"03:30"}]'))).available,
 '{[2030-03-10 10:00Z,2030-03-10 10:30Z)}'::tstzmultirange,'spring gap excludes nonexistent wall-clock hours rather than moving the rule');
select is((pg_temp.aa('[2030-11-03 08:15Z,2030-11-03 10:15Z)',pg_temp.aa_proposal('[{"start":"01:30","end":"02:00"}]'))).available,
 '{[2030-11-03 08:30Z,2030-11-03 09:00Z),[2030-11-03 09:30Z,2030-11-03 10:00Z)}'::tstzmultirange,'autumn fold includes both real occurrences of the available window');
select is((pg_temp.aa('[2030-01-07 10:00Z,2030-01-07 12:00Z)',pg_temp.aa_proposal('[{"start":"16:00","end":"17:00"}]','Asia/Kathmandu'))).available,
 '{[2030-01-07 10:15Z,2030-01-07 11:15Z)}'::tstzmultirange,'availability supports non-whole-hour timezone offsets');
select is((pg_temp.aa('[2030-01-07 08:00Z,2030-01-07 09:00Z)',pg_temp.aa_proposal('[{"start":"23:00","end":"24:00"}]','Pacific/Honolulu'))).available,
 '{[2030-01-07 09:00Z,2030-01-07 09:00Z)}'::tstzmultirange,'a later calendar date in UTC does not select an unrelated local availability hour');

insert into public.employee_schedule_availability_versions(id,workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from,effective_until,kind)
select 'ac920000-0000-4000-8000-000000000002',w,emp,2,'America/Los_Angeles',pg_temp.aa_proposal('[]')->'days','employee',actor,'2030-01-08','2030-01-09','temporary' from aa_state;
insert into public.employee_schedule_availability_versions(id,workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from)
select 'ac920000-0000-4000-8000-000000000003',w,emp,3,'America/Los_Angeles',pg_temp.aa_proposal('[{"start":"10:00","end":"14:00"}]')->'days','employee',actor,'2030-01-07' from aa_state;
select is((pg_temp.aa('[2030-01-08 20:00Z,2030-01-08 21:00Z)')).available,'{}'::tstzmultirange,'a newer weekly baseline does not erase an active temporary pattern');
select is((pg_temp.aa('[2030-01-10 20:00Z,2030-01-10 21:00Z)')).available,'{[2030-01-10 20:00Z,2030-01-10 21:00Z)}'::tstzmultirange,'temporary expiry returns to the weekly baseline effective at expiry');
select is((pg_temp.aa('[2030-01-10 23:00Z,2030-01-11 00:00Z)')).available,'{}'::tstzmultirange,'expiry does not return to an obsolete unrestricted baseline');
select is((pg_temp.aa('[2030-01-08 07:00Z,2030-01-08 10:00Z)')).unavailable,'{[2030-01-08 07:00Z,2030-01-08 10:00Z)}'::tstzmultirange,'an overnight interval is evaluated across a temporary version boundary');
select is((pg_temp.aa('[2030-01-08 20:00Z,2030-01-08 21:00Z)',pg_temp.aa_proposal('[{"start":"12:00","end":"13:00"}]')||jsonb_build_object('replace_version_ids',jsonb_build_array('ac920000-0000-4000-8000-000000000002')))).available,
 '{[2030-01-08 20:00Z,2030-01-08 21:00Z)}'::tstzmultirange,'explicit replacement can supersede the named temporary pattern');
select is((pg_temp.aa('[2030-01-08 20:00Z,2030-01-08 21:00Z)',pg_temp.aa_proposal('[{"start":"12:00","end":"13:00"}]'))).available,
 '{}'::tstzmultirange,'an unconfirmed implicit replacement is never applied');
select throws_ok($$select * from public.availability_offset_segments('[2030-01-01Z,infinity)'::tstzrange,'UTC')$$,'22023',null,'unbounded assessments are rejected');

-- All assignment forms share the same resolved interval and enforcement result.
insert into public.employee_schedule_availability_versions(workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from)
select w,emp,4,'America/Los_Angeles',pg_temp.aa_proposal('[{"start":"00:00","end":"10:00"},{"start":"17:00","end":"24:00"}]')->'days','employee',actor,'2030-01-11' from aa_state;
update public.workspace_scheduling_settings set availability_enforcement='soft' where workspace_id=(select w from aa_state);
create function pg_temp.aa_shift(patch jsonb default '{}') returns jsonb language sql as $$
 select jsonb_build_object('id','ac930000-0000-4000-8000-000000000001','location_id','11000000-0000-4000-8000-000000000001',
  'job_id','13000000-0000-4000-8000-000000000001','shift_type_id','14000000-0000-4000-8000-000000000001','scheduled_date','2030-01-11',
  'start_time','12:00','end_time','16:00','time_basis','explicit','time_timezone','America/Los_Angeles')||patch;
$$;
create function pg_temp.aa_assessment(patch jsonb default '{}') returns jsonb language sql as $$
 select public.assess_shift_availability(w,emp,pg_temp.aa_shift(patch)) from aa_state;
$$;
select is(pg_temp.aa_assessment()->>'coverage','none','explicit Lunch hours conflict with unavailable 10-17');
select is(pg_temp.aa_assessment()->>'operation','warning_requires_override','soft availability needs a recorded override');
select is(pg_temp.aa_assessment('{"hide_time_on_badge":true}')->>'fingerprint',pg_temp.aa_assessment()->>'fingerprint','badge clock visibility cannot change assessment or its override fingerprint');
select is(pg_temp.aa_assessment('{"note":"Display-only edit"}')->>'fingerprint',pg_temp.aa_assessment()->>'fingerprint','note edits do not invalidate unchanged physical availability');
select is(pg_temp.aa_assessment('{"time_basis":"type_default","time_snapshot":{"shift_type_id":"14000000-0000-4000-8000-000000000001","default_revision":1,"start_time":"12:00","end_time":"16:00","timezone":"America/Los_Angeles"}}')->>'coverage','none','name-only assignment evaluates the saved default reference interval');
select is(pg_temp.aa_assessment('{"start_time":"18:00","end_time":"20:00","time_snapshot":{"start_time":"12:00","end_time":"16:00","timezone":"America/Los_Angeles"}}')->>'operation','allowed','explicit hours win over a retained type label and default snapshot');
select throws_ok($$select pg_temp.aa_assessment('{"time_basis":"type_default","time_snapshot":{"start_time":"10:00","end_time":"16:00"}}')$$,'22023',null,'inconsistent saved reference hours cannot fake a clean assessment');
select is(pg_temp.aa_assessment('{"start_time":null,"end_time":null}')->>'operation','verification_required','a proposal without hours cannot be called available');
select is(pg_temp.aa_assessment('{"scheduled_date":"2028-01-11"}')->>'coverage','unknown','unreported availability remains unknown');
create temp table aa_soft_fingerprint as select pg_temp.aa_assessment()->>'fingerprint' fingerprint;
update public.workspace_scheduling_settings set availability_enforcement='hard' where workspace_id=(select w from aa_state);
select is(pg_temp.aa_assessment()->>'operation','blocked','hard availability cannot be bypassed with the soft override path');
select isnt(pg_temp.aa_assessment()->>'fingerprint',(select fingerprint from aa_soft_fingerprint),'policy change invalidates the prior override context');
insert into public.employee_schedule_availability_versions(workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from,effective_until)
select w,emp,5,'America/Los_Angeles',pg_temp.aa_proposal('[]')->'days','employee',actor,'2030-01-12','2030-01-12' from aa_state;
select is(pg_temp.aa_assessment('{"scheduled_date":"2030-01-12","start_time":null,"end_time":null}')->>'operation','blocked','definite all-day hard unavailability is enforced even without shift hours');
update public.workspace_scheduling_settings set availability_enforcement='soft' where workspace_id=(select w from aa_state);
update public.locations set timezone='America/New_York' where workspace_id=(select w from aa_state) and id='11000000-0000-4000-8000-000000000002';
insert into public.schedule_time_off_requests(id,workspace_id,employee_id,location_id,status,created_by)
select 'ac940000-0000-4000-8000-000000000001',w,emp,'11000000-0000-4000-8000-000000000002','approved',actor from aa_state;
insert into public.schedule_time_off_segments(workspace_id,request_id,segment_date,start_time,end_time,status)
select w,'ac940000-0000-4000-8000-000000000001','2030-01-11','21:00','22:00','approved' from aa_state;
select is(pg_temp.aa_assessment('{"start_time":"18:00","end_time":"20:00"}')->>'operation','blocked','approved leave blocks assignment across locations even with soft availability');
select is(pg_temp.aa_assessment('{"start_time":"18:00","end_time":"20:00"}')->>'coverage','partial','approved partial leave subtracts only its physical overlap');
select is(pg_temp.aa_assessment('{"start_time":"18:00","end_time":"20:00"}')->'available_intervals'->0->>'start_at','2030-01-12T03:00:00.000000Z','leave uses its own location timezone, not the target shift timezone');
update public.schedule_time_off_requests set status='pending',revision=revision+1 where id='ac940000-0000-4000-8000-000000000001';
select is(pg_temp.aa_assessment('{"start_time":"18:00","end_time":"20:00"}')->>'operation','allowed','unapproved leave never silently releases or blocks an assignment');
select is(pg_temp.aa_assessment('{"scheduled_date":"2030-03-10","start_time":"02:30","end_time":"04:00"}')->>'operation','blocked','nonexistent spring shift clock requires correction rather than silent normalization');
select is((pg_temp.aa_assessment('{"scheduled_date":"2030-03-10","start_time":"01:30","end_time":"03:30"}')->>'assessment_minutes')::numeric::integer,60,'spring physical interval has the correct elapsed duration');
select is((pg_temp.aa_assessment('{"scheduled_date":"2030-11-03","start_time":"00:30","end_time":"02:30"}')->>'assessment_minutes')::numeric::integer,180,'autumn physical interval includes the repeated hour');
select is(pg_temp.aa_assessment('{"scheduled_date":"2030-11-03","start_time":"01:30","end_time":"02:30"}')->>'fold_resolution','post_transition_offset','ambiguous shift clock reports PostgreSQL selected offset explicitly');
select is(pg_temp.aa_assessment('{"scheduled_date":"2030-11-03","start_time":"01:30","end_time":"02:30"}')->'intervals'->0->>'start_at','2030-11-03T09:30:00.000000Z','ambiguous start resolves deterministically to the post-transition offset');
select * from finish();
rollback;

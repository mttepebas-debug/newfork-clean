begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select tests.world('tad');
select tests.person('tad', 'emp', 'employee', array['K'], array['cook']);
select tests.person('tad', 'other', 'employee', array['K'], array['cook']);
select tests.publish_week('tad', 1, jsonb_build_array(jsonb_build_object(
  'label', 's', 'person', 'emp', 'loc', 'K', 'job', 'cook', 'day', 1, 'start', '15:00', 'end', '23:00'
), jsonb_build_object(
  'label', 'other', 'person', 'other', 'loc', 'K', 'job', 'cook', 'day', 1, 'start', '09:00', 'end', '14:00'
)));
create temp table tad as select tests.id('tad') w,
 tests.user('tad:owner') manager, tests.user('tad:emp') actor,
 tests.id('tad:emp') emp, tests.id('tad:K') loc,
 tests.id('tad:shift:s') shift, tests.id('tad:shift:other') other_shift,
 gen_random_uuid() request,gen_random_uuid() segment,gen_random_uuid() op,
 null::jsonb preview,null::jsonb result,null::jsonb decisions,null::jsonb original;
update tad set original=(select to_jsonb(ps) from public.schedule_published_shifts ps where id=tad.shift);
insert into public.schedule_time_off_requests(id,workspace_id,employee_id,location_id,reason,created_by,period_version)
select request,w,emp,loc,'Time off during a published shift',actor,2 from tad;
-- BL-217: the location's own timezone is read live instead of assumed as a
-- literal, so this file can never again disagree with a location it does not
-- own (BL-209's root cause).
insert into public.schedule_time_off_segments(id,workspace_id,request_id,segment_date,start_time,end_time,time_timezone,starts_at,ends_at,ends_next_day,fold_choices)
select t.segment,t.w,t.request,(p->>'segment_date')::date,(p->>'start_time')::time,(p->>'end_time')::time,p->>'time_timezone',
 (p->>'starts_at')::timestamptz,(p->>'ends_at')::timestamptz,(p->>'ends_next_day')::boolean,p->'fold_choices'
 from tad t cross join lateral (select public.time_off_resolve_period(jsonb_build_object('segment_date',t.original->>'scheduled_date','start_time','15:00','end_time','23:00'),(select timezone from public.locations where id=t.loc)) p) resolved;
update tad set decisions=jsonb_build_array(jsonb_build_object('segment_id',segment,'pieces',
 (select jsonb_build_array(
  jsonb_build_object('starts_at',s.starts_at,'ends_at',s.starts_at+interval '1 hour','status','denied'),
  jsonb_build_object('starts_at',s.starts_at+interval '1 hour','ends_at',s.starts_at+interval '3 hours','status','approved'),
  jsonb_build_object('starts_at',s.starts_at+interval '3 hours','ends_at',s.ends_at,'status','denied')) from public.schedule_time_off_segments s where id=tad.segment)));
select is((select to_jsonb(ps) from public.schedule_published_shifts ps where id=(select shift from tad)),original,'request alone preserves the entire published assignment') from tad;
update tad set preview=public.preview_time_off_assignment_decision_service(manager,w,request,1,'partial_approve',decisions);
select is(jsonb_array_length(preview->'affected_shifts'),1,'preview finds the shift overlapping the approved piece') from tad;
select is(preview->>'restricted_count','0','authorized manager can decide this location') from tad;
select is(preview->'affected_shifts'->0->>'start_time','15:00:00','preview makes the entire shift release explicit') from tad;
select is((select status::text from public.schedule_time_off_requests where id=(select request from tad)),'pending','preview leaves the request pending');
select is((select employee_id from public.schedule_published_shifts where id=(select shift from tad)),emp,'preview does not release the employee') from tad;
select throws_ok($$select public.resolve_schedule_time_off_request_service(manager,w,request,1,'partial_approve','',decisions) from tad$$,'40001',null,'older clients cannot approve over a published assignment without disposition');
select throws_ok($$select public.decide_time_off_with_assignments_service(manager,w,request,1,'partial_approve','',decisions,op,preview->>'fingerprint','[]') from tad$$,'22023',null,'every affected assignment needs an explicit choice');
select throws_ok($$select public.decide_time_off_with_assignments_service(manager,w,request,1,'partial_approve','',decisions,op,'stale',jsonb_build_array(jsonb_build_object('shift_id',shift,'action','release_entire_shift'))) from tad$$,'40001',null,'stale preview cannot release an assignment');
select throws_ok($$select public.decide_time_off_with_assignments_service(manager,w,request,1,'partial_approve','',decisions,op,preview->>'fingerprint',jsonb_build_array(jsonb_build_object('shift_id',shift,'action','keep'))) from tad$$,'22023',null,'approval cannot leave the conflicting shift assigned');
select throws_ok($$select public.decide_time_off_with_assignments_service(manager,w,request,1,'partial_approve','',decisions,op,preview->>'fingerprint',jsonb_build_array(jsonb_build_object('shift_id',other_shift,'action','release_entire_shift'))) from tad$$,'22023',null,'cannot release an unrelated shift');
select is((select count(*)::int from public.time_off_decision_pieces where request_id=(select request from tad)),0,'failed final approval rolls back the leave decision');
select is((select count(*)::int from public.time_off_assignment_releases where request_id=(select request from tad)),0,'failed final approval writes no release history');
select is((select employee_id from public.schedule_published_shifts where id=(select shift from tad)),emp,'failed final approval keeps the employee responsible') from tad;
savepoint assignment_changed;
update public.schedule_published_shifts set employee_id=null where id=(select shift from tad);
select throws_ok($$select public.decide_time_off_with_assignments_service(manager,w,request,1,'partial_approve','',decisions,op,preview->>'fingerprint',jsonb_build_array(jsonb_build_object('shift_id',shift,'action','release_entire_shift'))) from tad$$,'40001',null,'a real assignment change after preview invalidates the decision');
rollback to savepoint assignment_changed;
savepoint restricted_reviewer;
-- A manager-class role with request management but not the publish
-- permission every full manager keeps -- built off today's real manager
-- permission set (nothing hand-listed here can drift out of date).
select tests.role('tad', 'time off reviewer', 'manager', array(
 select rp.permission_key
 from public.workspace_role_permissions rp
 join public.workspace_roles r on r.id = rp.role_id
 where r.workspace_id = (select w from tad) and r.system_key = 'manager'
   and rp.permission_key <> 'schedule.publish'
));
select tests.person('tad', 'reviewer', 'time off reviewer', array['K', 'B'], array['cook']);
select is(public.preview_time_off_assignment_decision_service(tests.user('tad:reviewer'),w,request,1,'partial_approve',decisions)->>'restricted_count','1','request management alone does not grant assignment release') from tad;
select is(jsonb_array_length(public.preview_time_off_assignment_decision_service(tests.user('tad:reviewer'),w,request,1,'partial_approve',decisions)->'affected_shifts'),0,'restricted assignment details are not exposed in preview') from tad;
select throws_ok($$select public.decide_time_off_with_assignments_service(tests.user('tad:reviewer'),w,request,1,'partial_approve','',decisions,op,preview->>'fingerprint',jsonb_build_array(jsonb_build_object('shift_id',shift,'action','release_entire_shift'))) from tad$$,'42501',null,'publishing permission is required for every affected assignment');
rollback to savepoint restricted_reviewer;
update tad set result=public.decide_time_off_with_assignments_service(manager,w,request,1,'partial_approve','Release entire shift to open coverage.',decisions,op,preview->>'fingerprint',jsonb_build_array(jsonb_build_object('shift_id',shift,'action','release_entire_shift')));
select is(result->>'status','partially_approved','final approval records the partial leave outcome') from tad;
select is(result->>'released_shift_count','1','final result reports the explicit shift release') from tad;
select is((select employee_id from public.schedule_published_shifts where id=(select shift from tad)),null::uuid,'employee responsibility ends only with the committed assignment change');
select is((select to_jsonb(ps)-'employee_id'-'availability_snapshot' from public.schedule_published_shifts ps where id=(select shift from tad)),original-'employee_id'-'availability_snapshot','release keeps the published shift hours and identity intact') from tad;
select is((select employee_id from public.schedule_draft_shifts where id=(select (original->>'source_shift_id')::uuid from tad)),null::uuid,'matching draft is rebased to prevent restoring the released employee');
select is((select count(*)::int from public.time_off_assignment_releases where request_id=(select request from tad)),1,'one immutable assignment audit accompanies the decision');
select is((select before_assignment->>'employee_id' from public.time_off_assignment_releases where request_id=(select request from tad)),emp::text,'audit retains the prior employee and assignment terms') from tad;
select is((select metadata->'released_assignments'->0->>'id' from public.schedule_time_off_events where request_id=(select request from tad) and action='partially_approved'),shift::text,'employee decision event identifies the released shift') from tad;
select is(public.time_off_event_released_assignments(actor,w,(select id from public.schedule_time_off_events where request_id=t.request and action='partially_approved'))->0->>'id',shift::text,'employee can read their released assignment details') from tad t;
select is(public.time_off_event_released_assignments(manager,w,(select id from public.schedule_time_off_events where request_id=t.request and action='partially_approved'))->0->>'id',shift::text,'authorized manager reads the same released assignment') from tad t;
select is(jsonb_array_length(public.time_off_event_released_assignments(gen_random_uuid(),w,(select id from public.schedule_time_off_events where request_id=t.request and action='partially_approved'))),0,'unrelated actors cannot read released assignment evidence') from tad t;
select ok(not exists(select 1 from jsonb_array_elements(public.get_employee_hub_service(actor,w,(original->>'scheduled_date')::date-1,(original->>'scheduled_date')::date+1)->'shifts') ps where ps->>'id'=shift::text),'employee schedule no longer lists the released assignment') from tad;
select is(public.decide_time_off_with_assignments_service(manager,w,request,1,'partial_approve','Release entire shift to open coverage.',decisions,op,preview->>'fingerprint',jsonb_build_array(jsonb_build_object('shift_id',shift,'action','release_entire_shift'))),result,'network retry returns the same committed outcome') from tad;
select is((select count(*)::int from public.time_off_assignment_releases where request_id=(select request from tad)),1,'retry does not duplicate release history');
select throws_ok($$update public.time_off_assignment_releases set before_assignment='{}' where request_id=(select request from tad)$$,'55000',null,'release history cannot be rewritten');
set local role authenticated;
select throws_ok($$select * from public.time_off_assignment_releases$$,'42501',null,'release evidence is private');
select throws_ok($$select public.preview_time_off_assignment_decision_service(null,null,null,1,'approve','[]')$$,'42501',null,'client cannot impersonate preview actor');
reset role;
select ok(not has_function_privilege('service_role','public.apply_time_off_period_decision(uuid,uuid,uuid,integer,text,text,jsonb)','execute'),'private core cannot bypass assignment disposition through the API');
select * from finish();
rollback;

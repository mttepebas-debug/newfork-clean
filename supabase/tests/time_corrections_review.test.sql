begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

select has_table('public','time_correction_requests','correction request table exists');
select has_table('public','time_review_windows','review window table exists');
select has_function('public','request_own_time_correction_service',array['uuid','uuid','uuid','integer','timestamp with time zone','timestamp with time zone','text','uuid'],'employee correction service exists');
select has_function('public','decide_time_correction_service',array['uuid','uuid','uuid','integer','text','text','uuid'],'manager decision service exists');
select has_function('public','approve_time_review_window_service',array['uuid','uuid','uuid','date','date','jsonb','uuid'],'review approval service exists');

create temporary table correction_state(session_id uuid,correction_id uuid,result jsonb);

set local role authenticated;
select throws_ok(
  $$select public.request_own_time_correction_service('a6000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','b7200000-0000-4000-8000-000000000001',1,now(),now()+interval '1 hour','Fix','b7000000-0000-4000-8000-000000000001')$$,
  '42501',null,'browser role cannot invoke correction service'
);
select throws_ok($$select * from public.time_correction_requests$$,'42501',null,'browser role cannot read correction table');
select throws_ok($$select * from public.time_review_windows$$,'42501',null,'browser role cannot read review windows');
reset role;

insert into correction_state(session_id,result)
select (created->'session'->>'id')::uuid,created from (select public.create_manual_time_session_service(
  'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  '15000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',
  '2026-08-17 16:00:00+00','2026-08-18 00:00:00+00','Written log','b7000000-0000-4000-8000-000000000001'
) created) source;
select is(result->'session'->>'capture_state','complete','manual fixture is complete') from correction_state;

update correction_state set result=public.request_own_time_correction_service(
  'a6000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',session_id,1,
  '2026-08-17 16:15:00+00','2026-08-18 00:00:00+00','Clock-in was fifteen minutes later','b7000000-0000-4000-8000-000000000002'
);
update correction_state set correction_id=(result->'correction'->>'id')::uuid;
select is(result->'correction'->>'status','pending','employee submits pending correction') from correction_state;
select is(result->'correction'->>'base_revision','1','request captures session revision') from correction_state;
select is((select count(*)::integer from public.notifications where source_type='time_correction' and event_key='submitted'),1,'reviewer receives one correction notification');
select throws_ok(
  (select format($$select public.request_own_time_correction_service('a6000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','%s',1,'2026-08-17 16:30:00+00','2026-08-18 00:00:00+00','Another request','b7000000-0000-4000-8000-000000000003')$$,session_id) from correction_state),
  '23505',null,'only one pending request is allowed per session'
);
update correction_state set result=public.request_own_time_correction_service(
  'a6000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',session_id,1,
  '2026-08-17 16:15:00+00','2026-08-18 00:00:00+00','Clock-in was fifteen minutes later','b7000000-0000-4000-8000-000000000002'
);
select ok((result->>'idempotent_replay')::boolean,'identical request replay is idempotent') from correction_state;
select is(jsonb_array_length(public.get_employee_time_tracking_service('a6000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->'sessions'->0->'correction_requests'),1,'employee history exposes request') from correction_state limit 1;
select is(jsonb_array_length(public.get_manager_time_entries_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2026-08-17','2026-08-23')->'sessions'->0->'correction_requests'),1,'manager record exposes request') from correction_state limit 1;

update correction_state set result=public.decide_time_correction_service(
  'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',correction_id,1,'accept','Verified against signed note','b7000000-0000-4000-8000-000000000004'
);
select is(result->'correction'->>'status','accepted','manager accepts correction') from correction_state;
select is(result->'session'->>'revision','2','accept advances session revision') from correction_state;
select is((result->'session'->>'effective_started_at')::timestamptz,'2026-08-17 16:15:00+00'::timestamptz,'accept applies requested start') from correction_state;
select isnt(result->>'amendment',null,'accept creates an amendment') from correction_state;
select is((select count(*)::integer from public.notifications where source_type='time_correction' and event_key='decided'),1,'employee receives decision notification');
select throws_ok(
  (select format($$update public.time_correction_requests set reason='Changed' where id='%s'$$,correction_id) from correction_state),
  '42501',null,'submitted correction content is immutable'
);
update correction_state set result=public.decide_time_correction_service(
  'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',correction_id,1,'accept','Verified against signed note','b7000000-0000-4000-8000-000000000004'
);
select ok((result->>'idempotent_replay')::boolean,'identical decision replay is idempotent') from correction_state;

truncate correction_state;
insert into correction_state(session_id,result)
select (created->'session'->>'id')::uuid,created from (select public.create_manual_time_session_service(
  'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','15000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',
  '2026-08-18 16:00:00+00','2026-08-19 00:00:00+00','Written log','b7000000-0000-4000-8000-000000000005') created) source;
update correction_state set result=public.request_own_time_correction_service('a6000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',session_id,1,'2026-08-18 16:00:00+00','2026-08-18 23:45:00+00','Clock-out was earlier','b7000000-0000-4000-8000-000000000006');
update correction_state set correction_id=(result->'correction'->>'id')::uuid;
update correction_state set result=public.decide_time_correction_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',correction_id,1,'reject','Written log confirms original time','b7000000-0000-4000-8000-000000000007');
select is(result->'correction'->>'status','rejected','manager can reject with a reason') from correction_state;
select is(result->>'amendment',null,'rejection creates no amendment') from correction_state;
select is(result->'session'->>'revision','1','rejection leaves session revision unchanged') from correction_state;

truncate correction_state;
insert into correction_state(session_id,result)
select (created->'session'->>'id')::uuid,created from (select public.create_manual_time_session_service(
  'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','15000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',
  '2026-08-19 16:00:00+00','2026-08-20 00:00:00+00','Written log','b7000000-0000-4000-8000-000000000008') created) source;
update correction_state set result=public.request_own_time_correction_service('a6000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',session_id,1,'2026-08-19 16:15:00+00','2026-08-20 00:00:00+00','Clock-in was later','b7000000-0000-4000-8000-000000000009');
update correction_state set correction_id=(result->'correction'->>'id')::uuid;
update correction_state set result=public.apply_time_amendment_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',session_id,1,'2026-08-19 16:05:00+00','2026-08-20 00:00:00+00','Manager found newer source','b7000000-0000-4000-8000-000000000010');
select throws_ok(
  (select format($$select public.decide_time_correction_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','%s',1,'accept','Accept employee request','b7000000-0000-4000-8000-000000000011')$$,correction_id) from correction_state),
  '40001',null,'stale correction decision is rejected'
);

truncate correction_state;
insert into correction_state(session_id,result)
select (created->'session'->>'id')::uuid,created from (select public.create_manual_time_session_service(
  'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','15000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',
  '2026-08-20 16:00:00+00','2026-08-21 00:00:00+00','Written log','b7000000-0000-4000-8000-000000000012') created) source;
update correction_state set result=public.approve_time_review_window_service(
  'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001','2026-08-20','2026-08-20',
  jsonb_build_array(jsonb_build_object('session_id',session_id,'expected_revision',1)),'b7000000-0000-4000-8000-000000000013'
);
select is(result->>'approved_session_count','1','review window approves exact supplied set') from correction_state;
select is((select review_state::text from public.time_sessions where id=correction_state.session_id),'approved','reviewed session is approved') from correction_state;
select is(jsonb_array_length(public.get_manager_time_entries_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','2026-08-17','2026-08-23')->'review_windows'),1,'manager read model includes approved window') from correction_state limit 1;
do $$ begin
  perform public.create_manual_time_session_service(
    'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    '15000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',
    '2026-08-20 18:00:00+00','2026-08-21 02:00:00+00','Second written log',
    'b7000000-0000-4000-8000-000000000016'
  );
end $$;
select throws_ok(
  $$select public.approve_time_review_window_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001','2026-08-20','2026-08-20','[{"session_id":"b7200000-0000-4000-8000-000000000099","expected_revision":1}]','b7000000-0000-4000-8000-000000000014')$$,
  '40001',null,'review window rejects a stale session set'
);
update correction_state set result=public.apply_time_amendment_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',session_id,1,'2026-08-20 16:10:00+00','2026-08-21 00:00:00+00','Post-review correction','b7000000-0000-4000-8000-000000000015');
select is(result->'session'->>'review_state','reopened','amendment reopens an approved session') from correction_state;

select * from finish();
rollback;

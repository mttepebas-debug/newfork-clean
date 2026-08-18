begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('99000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'time-alex@example.test', '', '{}', '{}', now(), now()),
  ('99000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'time-manager@example.test', '', '{}', '{}', now(), now()),
  ('99000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'time-other-owner@example.test', '', '{}', '{}', now(), now());

update public.employee_profiles
set user_id = '99000000-0000-4000-8000-000000000001'
where id = '15000000-0000-4000-8000-000000000001';

insert into public.workspace_memberships (
  id, workspace_id, user_id, role, status, all_locations
) values
  ('99100000-0000-4000-8000-000000000001', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '99000000-0000-4000-8000-000000000001', 'employee', 'active', false),
  ('99100000-0000-4000-8000-000000000002', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '99000000-0000-4000-8000-000000000002', 'manager', 'active', false);

insert into public.membership_location_scopes (membership_id, workspace_id, location_id)
values
  ('99100000-0000-4000-8000-000000000001', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '11000000-0000-4000-8000-000000000001'),
  ('99100000-0000-4000-8000-000000000002', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '11000000-0000-4000-8000-000000000001');

insert into public.workspaces (id, name, created_by)
values ('99200000-0000-4000-8000-000000000001', 'Other time tenant', '99000000-0000-4000-8000-000000000003');
insert into public.workspace_memberships (
  id, workspace_id, user_id, role, status, all_locations
) values (
  '99300000-0000-4000-8000-000000000001',
  '99200000-0000-4000-8000-000000000001',
  '99000000-0000-4000-8000-000000000003',
  'owner', 'active', true
);

select ok(
  public.service_actor_has_permission(
    '99000000-0000-4000-8000-000000000001',
    '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    'time.capture.own'
  ),
  'employee receives own capture permission'
);
select isnt(
  public.service_actor_has_permission(
    '99000000-0000-4000-8000-000000000001',
    '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    'time.amend.location'
  ),
  true,
  'employee does not receive manager amendment permission'
);
select ok(
  public.service_actor_has_permission(
    '99000000-0000-4000-8000-000000000002',
    '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    'time.read.location'
  ),
  'manager receives location time read permission'
);
select isnt(
  public.service_actor_has_permission(
    '99000000-0000-4000-8000-000000000002',
    '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    'time.audit.read'
  ),
  true,
  'manager does not receive organization time audit permission'
);
select ok(
  public.service_actor_can_time_location(
    '99000000-0000-4000-8000-000000000002',
    '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    '11000000-0000-4000-8000-000000000001',
    'time.amend.location'
  ),
  'manager time authority includes assigned location'
);
select isnt(
  public.service_actor_can_time_location(
    '99000000-0000-4000-8000-000000000002',
    '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    '11000000-0000-4000-8000-000000000002',
    'time.amend.location'
  ),
  true,
  'manager time authority excludes unassigned location'
);

set local role authenticated;
select throws_ok($$select * from public.time_sessions$$, '42501', null, 'authenticated role cannot read time sessions directly');
select throws_ok($$select * from public.time_events$$, '42501', null, 'authenticated role cannot read time events directly');
select throws_ok(
  $$select public.capture_time_event_service('99000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','15000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',null,'clock_in',now(),'99400000-0000-4000-8000-000000000001','web')$$,
  '42501', null, 'authenticated role cannot invoke time service RPC directly'
);
reset role;

create temp table time_test_state (
  result jsonb,
  session_id uuid,
  clock_in_at timestamptz,
  clock_out_at timestamptz
);
insert into time_test_state (clock_in_at, clock_out_at)
values (date_trunc('second', now() - interval '4 hours'), date_trunc('second', now()));

update time_test_state
set result = public.capture_time_event_service(
  '99000000-0000-4000-8000-000000000001',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  '15000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  null,
  'clock_in',
  clock_in_at,
  '99400000-0000-4000-8000-000000000001',
  'mobile_web'
);
update time_test_state set session_id = (result->'session'->>'id')::uuid;

select is(result->'session'->>'capture_state', 'open', 'clock in creates an open session') from time_test_state;
select is(result->'event'->>'source', 'mobile_web', 'clock event preserves its bounded source') from time_test_state;

update time_test_state
set result = public.capture_time_event_service(
  '99000000-0000-4000-8000-000000000001',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  '15000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  null,
  'clock_in',
  clock_in_at,
  '99400000-0000-4000-8000-000000000001',
  'mobile_web'
);
select is(result->>'idempotent_replay', 'true', 'identical clock retry is an idempotent replay') from time_test_state;
select is((select count(*)::integer from public.time_events), 1, 'idempotent retry stores one event');
select throws_ok(
  $$select public.capture_time_event_service('99000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','15000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',null,'clock_in',(select clock_in_at + interval '1 minute' from time_test_state),'99400000-0000-4000-8000-000000000001','mobile_web')$$,
  '23505', 'idempotency key payload conflict', 'idempotency key cannot be reused for another payload'
);

update time_test_state
set result = public.capture_time_event_service(
  '99000000-0000-4000-8000-000000000001',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  '15000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  session_id,
  'break_start',
  clock_in_at + interval '2 hours',
  '99400000-0000-4000-8000-000000000002',
  'mobile_web'
);
select is(result->'session'->>'capture_state', 'on_break', 'break start moves the session on break') from time_test_state;
select throws_ok(
  $$select public.capture_time_event_service('99000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','15000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',(select session_id from time_test_state),'clock_out',(select clock_out_at from time_test_state),'99400000-0000-4000-8000-000000000003','mobile_web')$$,
  '23514', 'time event is invalid for the current session state', 'clock out cannot silently end an open break'
);

update time_test_state
set result = public.capture_time_event_service(
  '99000000-0000-4000-8000-000000000001',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  '15000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  session_id,
  'break_end',
  clock_in_at + interval '2 hours 30 minutes',
  '99400000-0000-4000-8000-000000000004',
  'mobile_web'
);
select is(result->'session'->>'capture_state', 'open', 'break end returns the session to open') from time_test_state;
select throws_ok(
  $$select public.capture_time_event_service('99000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','15000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',(select session_id from time_test_state),'break_start',(select clock_in_at + interval '1 hour' from time_test_state),'99400000-0000-4000-8000-000000000005','mobile_web')$$,
  '22023', 'time event precedes the current session state', 'out of order events fail closed'
);

update time_test_state
set result = public.capture_time_event_service(
  '99000000-0000-4000-8000-000000000001',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  '15000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  session_id,
  'clock_out',
  clock_out_at,
  '99400000-0000-4000-8000-000000000006',
  'mobile_web'
);
select is(result->'session'->>'capture_state', 'complete', 'clock out completes the session') from time_test_state;
select is(
  (select started_at from public.time_sessions where id = (select session_id from time_test_state)),
  (select clock_in_at from time_test_state),
  'raw session start remains the exact captured timestamp'
);
select is(
  (select ended_at from public.time_sessions where id = (select session_id from time_test_state)),
  (select clock_out_at from time_test_state),
  'raw session end remains the exact captured timestamp'
);
select is((select count(*)::integer from public.time_events), 4, 'completed session retains all four raw events');
select throws_ok(
  $$update public.time_events set occurred_at = occurred_at + interval '1 minute' where id = (select (result->'event'->>'id')::uuid from time_test_state)$$,
  '42501', 'time history is append only', 'raw events cannot be updated'
);
select throws_ok(
  $$delete from public.time_events where id = (select (result->'event'->>'id')::uuid from time_test_state)$$,
  '42501', 'time history is append only', 'raw events cannot be deleted'
);

update time_test_state
set result = public.apply_time_amendment_service(
  '99000000-0000-4000-8000-000000000002',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  session_id,
  4,
  clock_in_at + interval '5 minutes',
  clock_out_at - interval '10 minutes',
  'Employee confirmed corrected times',
  '99500000-0000-4000-8000-000000000001'
);
select is((result->'session'->>'revision')::integer, 5, 'amendment advances the session revision') from time_test_state;
select is(
  (select effective_started_at from public.time_sessions where id = (select session_id from time_test_state)),
  (select clock_in_at + interval '5 minutes' from time_test_state),
  'amendment changes the effective start'
);
select is(
  (select started_at from public.time_sessions where id = (select session_id from time_test_state)),
  (select clock_in_at from time_test_state),
  'amendment preserves the raw start'
);

update time_test_state
set result = public.apply_time_amendment_service(
  '99000000-0000-4000-8000-000000000002',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  session_id,
  4,
  clock_in_at + interval '5 minutes',
  clock_out_at - interval '10 minutes',
  'Employee confirmed corrected times',
  '99500000-0000-4000-8000-000000000001'
);
select is(result->>'idempotent_replay', 'true', 'identical amendment retry is idempotent') from time_test_state;
select is((select count(*)::integer from public.time_amendments), 1, 'idempotent amendment stores one history row');
select throws_ok(
  $$select public.apply_time_amendment_service('99000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select session_id from time_test_state),4,(select clock_in_at from time_test_state),(select clock_out_at from time_test_state),'Stale manager change','99500000-0000-4000-8000-000000000002')$$,
  '40001', 'stale time session revision', 'stale amendment cannot overwrite newer state'
);
select throws_ok(
  $$select public.apply_time_amendment_service('99000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select session_id from time_test_state),5,(select clock_in_at from time_test_state),(select clock_out_at from time_test_state),'Employee direct change','99500000-0000-4000-8000-000000000003')$$,
  '42501', 'location time amendment denied', 'employee cannot bypass correction workflow with a direct amendment'
);
select throws_ok(
  $$update public.time_amendments set reason = 'Hidden rewrite' where session_id = (select session_id from time_test_state)$$,
  '42501', 'time history is append only', 'amendment history cannot be updated'
);
select is(
  (select count(*)::integer from public.audit_events where action in ('time.event_recorded', 'time.session_amended') and target_id = (select session_id::text from time_test_state)),
  5,
  'capture and amendment actions create audit events'
);
select throws_ok(
  $$select public.capture_time_event_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','15000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002',null,'clock_in',now(),'99400000-0000-4000-8000-000000000007','manager')$$,
  '42501', 'employee location assignment required', 'manager cannot capture time at an employee unassigned location'
);
select throws_ok(
  $$select public.capture_time_event_service('99000000-0000-4000-8000-000000000003','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','15000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',null,'clock_in',now(),'99400000-0000-4000-8000-000000000008','manager')$$,
  '42501', 'location time amendment denied', 'another tenant owner cannot act in this workspace'
);
select throws_ok(
  $$select public.capture_time_event_service('99000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','15000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',null,'clock_in',now(),'99400000-0000-4000-8000-000000000009','web')$$,
  '22023', 'manager capture source required', 'manager cannot disguise an on-behalf event as employee web capture'
);

set local role authenticated;
select throws_ok($$select * from public.time_amendments$$, '42501', null, 'authenticated role cannot read time amendments directly');
reset role;

select hasnt_column('public', 'time_events', 'latitude', 'time events do not collect latitude');
select hasnt_column('public', 'time_events', 'photo_url', 'time events do not collect photos');
select is(
  (select before_started_at from public.time_amendments where session_id = (select session_id from time_test_state)),
  (select clock_in_at from time_test_state),
  'amendment history records its before value'
);
select is(
  (select after_ended_at from public.time_amendments where session_id = (select session_id from time_test_state)),
  (select clock_out_at - interval '10 minutes' from time_test_state),
  'amendment history records its after value'
);

select * from finish();
rollback;

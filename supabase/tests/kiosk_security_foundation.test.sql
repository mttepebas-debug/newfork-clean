begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('a9000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'kiosk-manager@example.test', '', '{}', '{}', now(), now()),
  ('a9000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'kiosk-other-owner@example.test', '', '{}', '{}', now(), now());

insert into public.workspace_memberships (
  id, workspace_id, user_id, role, status, all_locations
) values (
  'a9100000-0000-4000-8000-000000000001',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  'a9000000-0000-4000-8000-000000000001',
  'manager', 'active', false
);
insert into public.membership_location_scopes (membership_id, workspace_id, location_id)
values (
  'a9100000-0000-4000-8000-000000000001',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  '11000000-0000-4000-8000-000000000001'
);

insert into public.workspaces (id, name, created_by)
values (
  'a9200000-0000-4000-8000-000000000001',
  'Other kiosk tenant',
  'a9000000-0000-4000-8000-000000000002'
);
insert into public.workspace_memberships (
  id, workspace_id, user_id, role, status, all_locations
) values (
  'a9300000-0000-4000-8000-000000000001',
  'a9200000-0000-4000-8000-000000000001',
  'a9000000-0000-4000-8000-000000000002',
  'owner', 'active', true
);

select has_table('public', 'kiosk_devices', 'kiosk devices table exists');
select has_table('public', 'kiosk_enrollment_codes', 'kiosk enrollment table exists');
select has_table('public', 'employee_kiosk_credentials', 'employee kiosk credentials table exists');
select has_table('public', 'kiosk_verification_attempts', 'verification attempts table exists');
select has_table('public', 'kiosk_action_sessions', 'short action sessions table exists');
select has_table('public', 'kiosk_security_events', 'kiosk security audit table exists');

select ok(
  public.service_actor_can_kiosk_location(
    'a9000000-0000-4000-8000-000000000001',
    '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    '11000000-0000-4000-8000-000000000001',
    'kiosk.device.enroll.location'
  ),
  'manager receives kiosk enrollment permission'
);
select ok(
  public.service_actor_can_kiosk_location(
    'a9000000-0000-4000-8000-000000000001',
    '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    '11000000-0000-4000-8000-000000000001',
    'kiosk.pin.reset.location'
  ),
  'manager kiosk authority includes assigned location'
);
select isnt(
  public.service_actor_can_kiosk_location(
    'a9000000-0000-4000-8000-000000000001',
    '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    '11000000-0000-4000-8000-000000000002',
    'kiosk.pin.reset.location'
  ),
  true,
  'manager kiosk authority excludes unassigned location'
);
select throws_ok(
  $$select public.create_kiosk_enrollment_service('a9000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000002','Other counter',repeat('9',64),now()+interval '10 minutes')$$,
  '42501', 'kiosk enrollment denied', 'manager cannot enroll a kiosk outside assigned locations'
);
select throws_ok(
  $$select public.create_kiosk_enrollment_service('a9000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001','Cross tenant',repeat('8',64),now()+interval '10 minutes')$$,
  '42501', 'kiosk enrollment denied', 'another tenant owner cannot enroll in this workspace'
);

create temp table kiosk_test_state (
  enrollment jsonb,
  exchange_result jsonb,
  device_id uuid,
  invalid_begin jsonb,
  valid_begin jsonb,
  finish_result jsonb
);
insert into kiosk_test_state default values;
update kiosk_test_state set enrollment = public.create_kiosk_enrollment_service(
  'a9000000-0000-4000-8000-000000000001',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  '11000000-0000-4000-8000-000000000001',
  'Front counter', repeat('a',64), now() + interval '10 minutes'
);
select is(enrollment->>'label', 'Front counter', 'manager creates a bounded enrollment') from kiosk_test_state;
select is(
  (select code_hash from public.kiosk_enrollment_codes where id = (select (enrollment->>'id')::uuid from kiosk_test_state)),
  repeat('a',64),
  'enrollment stores only the supplied code verifier'
);

update kiosk_test_state
set exchange_result = public.exchange_kiosk_enrollment_service(repeat('a',64), repeat('b',64));
update kiosk_test_state set device_id = (exchange_result->'device'->>'id')::uuid;
select is(exchange_result->'device'->>'status', 'active', 'single-use exchange creates an active device') from kiosk_test_state;
select is(
  (select status::text from public.kiosk_enrollment_codes where id = (select (enrollment->>'id')::uuid from kiosk_test_state)),
  'consumed',
  'successful exchange consumes the enrollment code'
);
select throws_ok(
  $$select public.exchange_kiosk_enrollment_service(repeat('a',64),repeat('1',64))$$,
  'P0002', 'active kiosk enrollment not found', 'enrollment code cannot be replayed'
);

set local role authenticated;
select throws_ok($$select * from public.kiosk_devices$$, '42501', null, 'authenticated role cannot read kiosk devices directly');
select throws_ok($$select * from public.kiosk_enrollment_codes$$, '42501', null, 'authenticated role cannot read enrollment verifiers directly');
select throws_ok($$select * from public.employee_kiosk_credentials$$, '42501', null, 'authenticated role cannot read PIN hashes directly');
select throws_ok($$select * from public.kiosk_verification_attempts$$, '42501', null, 'authenticated role cannot read verification attempts directly');
select throws_ok($$select * from public.kiosk_action_sessions$$, '42501', null, 'authenticated role cannot read action tokens directly');
select throws_ok($$select * from public.kiosk_security_events$$, '42501', null, 'authenticated role cannot read kiosk audit directly');
select throws_ok(
  $$select public.exchange_kiosk_enrollment_service(repeat('a',64),repeat('2',64))$$,
  '42501', null, 'authenticated role cannot invoke kiosk service RPCs directly'
);
reset role;

select is(
  public.set_employee_kiosk_pin_service(
    'a9000000-0000-4000-8000-000000000001',
    '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    '11000000-0000-4000-8000-000000000001',
    '15000000-0000-4000-8000-000000000001',
    'scrypt$16384$8$1$abcdefghijklmnop$abcdefghijklmnopqrstuvwxyz1234567890'
  )->>'employee_id',
  '15000000-0000-4000-8000-000000000001',
  'manager can reset an assigned employee kiosk PIN'
);
select isnt(
  (select pin_hash from public.employee_kiosk_credentials where employee_id = '15000000-0000-4000-8000-000000000001'),
  '123456',
  'database never stores the plaintext PIN'
);
select throws_ok(
  $$select public.set_employee_kiosk_pin_service('a9000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000002','15000000-0000-4000-8000-000000000003','scrypt$16384$8$1$abcdefghijklmnop$abcdefghijklmnopqrstuvwxyz1234567890')$$,
  '42501', 'kiosk PIN reset denied', 'manager cannot reset a PIN outside assigned locations'
);

update kiosk_test_state set invalid_begin = public.begin_kiosk_pin_verification_service(
  repeat('b',64), 'a9400000-0000-4000-8000-000000000001'
);
select is(invalid_begin->>'eligible', 'false', 'unknown employee uses the generic ineligible path') from kiosk_test_state;
select is(invalid_begin->>'pin_hash', null, 'ineligible verification does not return a PIN hash') from kiosk_test_state;
update kiosk_test_state set finish_result = public.finish_kiosk_pin_verification_service(
  (invalid_begin->>'attempt_id')::uuid, false, repeat('c',64), now()+interval '60 seconds'
);
select is(finish_result->>'verified', 'false', 'invalid verification creates no action authority') from kiosk_test_state;

update kiosk_test_state set valid_begin = public.begin_kiosk_pin_verification_service(
  repeat('b',64), '15000000-0000-4000-8000-000000000001'
);
select is(valid_begin->>'eligible', 'true', 'assigned active employee enters the eligible verification path') from kiosk_test_state;
update kiosk_test_state set finish_result = public.finish_kiosk_pin_verification_service(
  (valid_begin->>'attempt_id')::uuid, true, repeat('d',64), now()+interval '60 seconds'
);
select is(finish_result->>'verified', 'true', 'verified PIN creates short action authority') from kiosk_test_state;
select is(
  (select count(*)::integer from public.kiosk_action_sessions where token_hash = repeat('d',64)),
  1,
  'successful verification stores one hashed action token'
);

insert into public.kiosk_verification_attempts (
  workspace_id, location_id, device_id, device_credential_version,
  claimed_employee_id, eligible, outcome, completed_at
)
select
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  '11000000-0000-4000-8000-000000000001',
  (select device_id from kiosk_test_state),
  1,
  '15000000-0000-4000-8000-000000000002',
  false, 'failure', now()
from generate_series(1,5);
select is(
  public.begin_kiosk_pin_verification_service(
    repeat('b',64), '15000000-0000-4000-8000-000000000002'
  )->>'rate_limited',
  'true',
  'five recent failures trigger the employee-device cooldown'
);

select is(
  public.rotate_kiosk_device_credential_service(repeat('b',64), repeat('e',64))->>'credential_version',
  '2',
  'device can atomically rotate its credential'
);
select throws_ok(
  $$select public.begin_kiosk_pin_verification_service(repeat('b',64),'15000000-0000-4000-8000-000000000001')$$,
  'P0002', 'active kiosk device not found', 'rotated credential stops working immediately'
);
update kiosk_test_state set valid_begin = public.begin_kiosk_pin_verification_service(
  repeat('e',64), '15000000-0000-4000-8000-000000000001'
);
select is(valid_begin->>'eligible',
  'true',
  'replacement credential authenticates the same scoped device'
) from kiosk_test_state;
select is(
  public.set_employee_kiosk_pin_service(
    'a9000000-0000-4000-8000-000000000001',
    '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    '11000000-0000-4000-8000-000000000001',
    '15000000-0000-4000-8000-000000000001',
    'scrypt$16384$8$1$qrstuvwxyzabcdef$0123456789abcdefghijklmnopqrstuvwxyz'
  )->>'employee_id',
  '15000000-0000-4000-8000-000000000001',
  'PIN reset succeeds while a verification is pending'
);
update kiosk_test_state set finish_result = public.finish_kiosk_pin_verification_service(
  (valid_begin->>'attempt_id')::uuid, true, repeat('3',64), now()+interval '60 seconds'
);
select is(finish_result->>'verified', 'false', 'PIN reset invalidates an in-flight verification') from kiosk_test_state;

update kiosk_test_state set valid_begin = public.begin_kiosk_pin_verification_service(
  repeat('e',64), '15000000-0000-4000-8000-000000000001'
);
select is(
  public.rotate_kiosk_device_credential_service(repeat('e',64), repeat('f',64))->>'credential_version',
  '3',
  'second credential rotation advances the device version'
);
update kiosk_test_state set finish_result = public.finish_kiosk_pin_verification_service(
  (valid_begin->>'attempt_id')::uuid, true, repeat('4',64), now()+interval '60 seconds'
);
select is(finish_result->>'verified', 'false', 'credential rotation invalidates an in-flight verification') from kiosk_test_state;
select throws_ok(
  $$select public.begin_kiosk_pin_verification_service(repeat('e',64),'15000000-0000-4000-8000-000000000001')$$,
  'P0002', 'active kiosk device not found', 'second rotated credential stops working immediately'
);
select is(
  public.begin_kiosk_pin_verification_service(
    repeat('f',64), '15000000-0000-4000-8000-000000000001'
  )->>'eligible',
  'true',
  'latest device credential remains usable after race invalidation'
);
select lives_ok(
  $$select public.revoke_kiosk_device_service('a9000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select device_id from kiosk_test_state))$$,
  'assigned manager can revoke the device'
);
select is(
  (select status::text from public.kiosk_devices where id = (select device_id from kiosk_test_state)),
  'revoked',
  'revocation persists an explicit device state'
);
select throws_ok(
  $$select public.begin_kiosk_pin_verification_service(repeat('f',64),'15000000-0000-4000-8000-000000000001')$$,
  'P0002', 'active kiosk device not found', 'revoked device stops working immediately'
);
select cmp_ok(
  (select count(*) from public.kiosk_security_events),
  '>=', 7::bigint,
  'enrollment, PIN, verification, rotation, and revocation create security events'
);
select is(
  (select count(*)::integer from public.kiosk_security_events
    where metadata::text like '%123456%'),
  0,
  'security audit metadata never contains the plaintext PIN'
);

select * from finish();
rollback;

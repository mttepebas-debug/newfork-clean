begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'aa000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'capture-kiosk@example.test', '', '{}', '{}', now(), now()
);

insert into public.kiosk_devices (
  id, workspace_id, location_id, label, credential_hash, created_by
) values (
  'aa100000-0000-4000-8000-000000000001',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  '11000000-0000-4000-8000-000000000001',
  'Test counter', repeat('1', 64), 'aa000000-0000-4000-8000-000000000001'
);

select is(
  public.get_kiosk_directory_service(repeat('1',64))->'device'->>'label',
  'Test counter', 'device credential resolves the bound kiosk'
);
select is(
  public.get_kiosk_directory_service(repeat('1',64))->'device'->'location'->>'id',
  '11000000-0000-4000-8000-000000000001', 'directory remains bound to one location'
);
select cmp_ok(
  jsonb_array_length(public.get_kiosk_directory_service(repeat('1',64))->'employees'),
  '>', 0, 'directory includes active employees assigned to the kiosk location'
);
select ok(
  not (public.get_kiosk_directory_service(repeat('1',64))::text like '%invitation_email%'),
  'directory omits employee contact data'
);
select ok(
  not (public.get_kiosk_directory_service(repeat('1',64))::text like '%pin_hash%'),
  'directory omits PIN state and hashes'
);

insert into public.kiosk_action_sessions (
  workspace_id, location_id, device_id, employee_id, token_hash, expires_at
) values (
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  '11000000-0000-4000-8000-000000000001',
  'aa100000-0000-4000-8000-000000000001',
  '15000000-0000-4000-8000-000000000001', repeat('2',64), now()+interval '60 seconds'
);

select is(
  public.get_kiosk_action_state_service(repeat('1',64),repeat('2',64))->'allowed_actions'->>0,
  'clock_in', 'an employee without an active session can only clock in'
);
select is(
  public.get_kiosk_action_state_service(repeat('1',64),repeat('2',64))->>'expected_revision',
  '0', 'new kiosk session starts from revision zero'
);

create temp table kiosk_capture_state (clock_in jsonb, replay jsonb, break_start jsonb, stale jsonb, finish jsonb);
insert into kiosk_capture_state default values;
update kiosk_capture_state set clock_in = public.capture_kiosk_time_action_service(
  repeat('1',64),repeat('2',64),'clock_in',0,'2025-08-17T18:00:00Z','aa200000-0000-4000-8000-000000000001'
);
select is(clock_in->>'status','accepted','clock in is accepted') from kiosk_capture_state;
select is(clock_in->'session'->>'capture_state','open','clock in creates an open session') from kiosk_capture_state;
select is((clock_in->'events'->0->>'event_type'),'clock_in','clock in appends a raw event') from kiosk_capture_state;
select is(
  (select actor_user_id from public.time_events where kiosk_action_session_id =
    (select id from public.kiosk_action_sessions where token_hash=repeat('2',64))),
  null, 'kiosk event does not invent an authenticated user'
);
select is(
  (select actor_employee_id from public.time_events where kiosk_action_session_id =
    (select id from public.kiosk_action_sessions where token_hash=repeat('2',64))),
  '15000000-0000-4000-8000-000000000001'::uuid, 'kiosk event records the employee principal'
);
select is(
  (select kiosk_device_id from public.time_events where kiosk_action_session_id =
    (select id from public.kiosk_action_sessions where token_hash=repeat('2',64))),
  'aa100000-0000-4000-8000-000000000001'::uuid, 'kiosk event records device provenance'
);

update kiosk_capture_state set replay = public.capture_kiosk_time_action_service(
  repeat('1',64),repeat('2',64),'clock_in',0,'2025-08-17T18:00:00Z','aa200000-0000-4000-8000-000000000001'
);
select is(replay->>'idempotent_replay','true','same action payload replays the accepted result') from kiosk_capture_state;
select throws_ok(
  $$select public.capture_kiosk_time_action_service(repeat('1',64),repeat('2',64),'clock_in',0,'2025-08-17T18:00:01Z','aa200000-0000-4000-8000-000000000002')$$,
  '23505','kiosk action already consumed','consumed action authority rejects a different payload'
);

insert into public.kiosk_action_sessions (workspace_id,location_id,device_id,employee_id,token_hash,expires_at)
values
('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001','aa100000-0000-4000-8000-000000000001','15000000-0000-4000-8000-000000000001',repeat('3',64),now()+interval '60 seconds'),
('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001','aa100000-0000-4000-8000-000000000001','15000000-0000-4000-8000-000000000001',repeat('4',64),now()+interval '60 seconds'),
('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001','aa100000-0000-4000-8000-000000000001','15000000-0000-4000-8000-000000000001',repeat('5',64),now()+interval '60 seconds');

update kiosk_capture_state set break_start = public.capture_kiosk_time_action_service(
  repeat('1',64),repeat('3',64),'break_start',1,'2025-08-17T20:00:00Z','aa200000-0000-4000-8000-000000000003'
);
select is(break_start->'session'->>'capture_state','on_break','break start transitions the session') from kiosk_capture_state;
update kiosk_capture_state set stale = public.capture_kiosk_time_action_service(
  repeat('1',64),repeat('4',64),'break_end',1,'2025-08-17T20:30:00Z','aa200000-0000-4000-8000-000000000004'
);
select is(stale->>'reason','stale_state','stale expected revision fails closed') from kiosk_capture_state;
select is(
  (select revoked_at is not null from public.kiosk_action_sessions where token_hash=repeat('4',64)),
  true, 'stale action authority is revoked'
);
update kiosk_capture_state set finish = public.capture_kiosk_time_action_service(
  repeat('1',64),repeat('5',64),'end_break_and_clock_out',2,'2025-08-17T22:00:00Z','aa200000-0000-4000-8000-000000000005'
);
select is(finish->'session'->>'capture_state','complete','explicit combined action completes the session') from kiosk_capture_state;
select is(jsonb_array_length(finish->'events'),2,'combined action appends break end and clock out events') from kiosk_capture_state;
select is(
  (select string_agg(event_type::text,',' order by received_at,id) from public.time_events
    where kiosk_action_session_id=(select id from public.kiosk_action_sessions where token_hash=repeat('5',64))),
  'break_end,clock_out','combined action preserves both raw state transitions'
);

set local role authenticated;
select throws_ok(
  $$select public.get_kiosk_directory_service(repeat('1',64))$$,
  '42501',null,'authenticated clients cannot invoke kiosk service RPCs directly'
);
reset role;

select * from finish();
rollback;

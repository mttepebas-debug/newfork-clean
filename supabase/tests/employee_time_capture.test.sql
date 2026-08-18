begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

create temp table employee_time_state (
  result jsonb,
  session_id uuid,
  clock_in_at timestamptz,
  clock_out_at timestamptz
);
insert into employee_time_state (clock_in_at, clock_out_at)
values (date_trunc('second', now() - interval '3 hours'), date_trunc('second', now()));

update employee_time_state
set result = public.get_employee_time_tracking_service(
  'a6000000-0000-4000-8000-000000000001',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'
);
select is(result->'employee'->>'id', '15000000-0000-4000-8000-000000000001', 'time read model derives employee from actor') from employee_time_state;
select is(jsonb_array_length(result->'locations'), 1, 'time read model exposes assigned active locations') from employee_time_state;
select is(result->>'current_session', null, 'time read model starts without a current session') from employee_time_state;

set local role authenticated;
select throws_ok(
  $$select public.get_employee_time_tracking_service('a6000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')$$,
  '42501', null, 'authenticated role cannot invoke own time read RPC directly'
);
select throws_ok(
  $$select public.capture_own_time_event_service('a6000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001',null,'clock_in',now(),'a6100000-0000-4000-8000-000000000001')$$,
  '42501', null, 'authenticated role cannot invoke own capture RPC directly'
);
reset role;

update employee_time_state
set result = public.capture_own_time_event_service(
  'a6000000-0000-4000-8000-000000000001',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  '11000000-0000-4000-8000-000000000001',
  null,
  'clock_in',
  clock_in_at,
  'a6100000-0000-4000-8000-000000000001'
);
update employee_time_state set session_id = (result->'session'->>'id')::uuid;
select is(result->'session'->>'capture_state', 'open', 'own capture wrapper creates an open session') from employee_time_state;
select is(result->'event'->>'source', 'web', 'own capture wrapper fixes source server-side') from employee_time_state;

update employee_time_state
set result = public.get_employee_time_tracking_service(
  'a6000000-0000-4000-8000-000000000001',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'
);
select is(result->'current_session'->>'capture_state', 'open', 'read model returns the active session') from employee_time_state;

update employee_time_state
set result = public.capture_own_time_event_service(
  'a6000000-0000-4000-8000-000000000001',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  '11000000-0000-4000-8000-000000000001',
  session_id,
  'break_start',
  clock_in_at + interval '1 hour',
  'a6100000-0000-4000-8000-000000000002'
);
select is(result->'session'->>'capture_state', 'on_break', 'own capture wrapper starts a break') from employee_time_state;

update employee_time_state
set result = public.capture_own_time_event_service(
  'a6000000-0000-4000-8000-000000000001',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  '11000000-0000-4000-8000-000000000001',
  session_id,
  'break_end',
  clock_in_at + interval '1 hour 20 minutes',
  'a6100000-0000-4000-8000-000000000003'
);
select is(result->'session'->>'capture_state', 'open', 'own capture wrapper ends a break') from employee_time_state;

update employee_time_state
set result = public.capture_own_time_event_service(
  'a6000000-0000-4000-8000-000000000001',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  '11000000-0000-4000-8000-000000000001',
  session_id,
  'clock_out',
  clock_out_at,
  'a6100000-0000-4000-8000-000000000004'
);
select is(result->'session'->>'capture_state', 'complete', 'own capture wrapper completes a session') from employee_time_state;

update employee_time_state
set result = public.get_employee_time_tracking_service(
  'a6000000-0000-4000-8000-000000000001',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'
);
select is(result->>'current_session', null, 'completed session leaves no current session') from employee_time_state;
select is(jsonb_array_length(result->'sessions'), 1, 'completed session appears in personal history') from employee_time_state;
select is(jsonb_array_length(result->'sessions'->0->'events'), 4, 'personal history contains all raw events') from employee_time_state;
select is(
  (result->'sessions'->0->>'started_at')::timestamptz,
  clock_in_at,
  'personal history preserves the exact clock-in timestamp'
) from employee_time_state;
select is(result->'sessions'->0->>'location_name', 'Main Dining', 'personal history resolves location name') from employee_time_state;

select * from finish();
rollback;

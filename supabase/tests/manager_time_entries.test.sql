begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'b6000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'time-manager-scope@example.test', '', '{}', '{}', now(), now()
);
insert into public.workspace_memberships (
  id, workspace_id, user_id, role, status, all_locations
) values (
  'b6000000-0000-4000-8000-000000000002',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  'b6000000-0000-4000-8000-000000000001',
  'manager', 'active', false
);
select tests.works_at('b6000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000001');

set local role authenticated;
select throws_ok(
  $$select * from public.time_manual_entries$$,
  '42501', null, 'authenticated role cannot read manual time provenance directly'
);
select throws_ok(
  $$select public.get_manager_time_entries_service('b6000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',current_date,current_date)$$,
  '42501', null, 'authenticated role cannot invoke manager time read RPC directly'
);
reset role;

create temp table manager_time_state (
  result jsonb,
  first_session_id uuid,
  second_session_id uuid,
  started_at timestamptz,
  ended_at timestamptz
);
insert into manager_time_state (started_at, ended_at)
values (
  date_trunc('second', now() - interval '6 hours'),
  date_trunc('second', now() - interval '2 hours')
);

update manager_time_state
set result = public.get_manager_time_entries_service(
  'b6000000-0000-4000-8000-000000000001',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  current_date - 1,
  current_date + 1
);
select is(jsonb_array_length(result->'locations'), 1, 'manager read exposes only scoped locations') from manager_time_state;
select is(result->'locations'->0->>'name', 'Main Dining', 'manager read resolves the scoped location') from manager_time_state;
select is(jsonb_array_length(result->'employees'), 3, 'manager read exposes employees assigned to scoped locations, the manager included') from manager_time_state;

select throws_ok(
  $$select public.create_manual_time_session_service(
    'b6000000-0000-4000-8000-000000000001',
    '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    '15000000-0000-4000-8000-000000000002',
    '11000000-0000-4000-8000-000000000002',
    now() - interval '4 hours', now(), 'Garden correction',
    'b6100000-0000-4000-8000-000000000001'
  )$$,
  '42501', 'location time amendment denied', 'manager cannot create time outside assigned locations'
);
select throws_ok(
  $$select public.create_manual_time_session_service(
    'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5',
    '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    '15000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000002',
    now() - interval '4 hours', now(), 'Wrong assignment',
    'b6100000-0000-4000-8000-000000000002'
  )$$,
  '42501', 'employee location assignment required', 'manual entry requires an active employee location assignment'
);

update manager_time_state
set result = public.create_manual_time_session_service(
  'b6000000-0000-4000-8000-000000000001',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  '15000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  started_at, ended_at, 'Employee forgot to clock in',
  'b6100000-0000-4000-8000-000000000003'
);
update manager_time_state set first_session_id = (result->'session'->>'id')::uuid;
select is(result->'session'->>'capture_state', 'complete', 'manual entry creates a complete session') from manager_time_state;
select is(jsonb_array_length(result->'events'), 2, 'manual entry preserves clock-in and clock-out events') from manager_time_state;
select is(result->'events'->0->>'source', 'manager', 'manual entry fixes manager provenance') from manager_time_state;
select matches(
  result->'events'->0->>'idempotency_key',
  '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
  'derived event idempotency key is a standards-valid UUID'
) from manager_time_state;
select is(result->'manual_entry'->>'reason', 'Employee forgot to clock in', 'manual entry preserves its reason') from manager_time_state;

update manager_time_state
set result = public.create_manual_time_session_service(
  'b6000000-0000-4000-8000-000000000001',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  '15000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  started_at, ended_at, 'Employee forgot to clock in',
  'b6100000-0000-4000-8000-000000000003'
);
select is(result->>'idempotent_replay', 'true', 'identical manual entry retry is idempotent') from manager_time_state;
select is((select count(*)::integer from public.time_manual_entries), 1, 'manual entry retry stores one provenance record');
select throws_ok(
  $$select public.create_manual_time_session_service(
    'b6000000-0000-4000-8000-000000000001',
    '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    '15000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000001',
    (select started_at + interval '1 minute' from manager_time_state),
    (select ended_at from manager_time_state), 'Employee forgot to clock in',
    'b6100000-0000-4000-8000-000000000003'
  )$$,
  '23505', 'idempotency key payload conflict', 'manual idempotency key rejects another payload'
);

update manager_time_state
set result = public.get_manager_time_entries_service(
  'b6000000-0000-4000-8000-000000000001',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', current_date - 1, current_date + 1
);
select is(jsonb_array_length(result->'sessions'), 1, 'manual session appears in manager read model') from manager_time_state;
select is(result->'sessions'->0->>'employee_name', 'Alex Kim', 'manager session resolves employee name') from manager_time_state;
select is(result->'sessions'->0->'manual_entry'->>'reason', 'Employee forgot to clock in', 'manager detail exposes manual provenance') from manager_time_state;
select is(jsonb_array_length(result->'sessions'->0->'attention_codes'), 0, 'non-overlapping complete session starts without attention') from manager_time_state;

update manager_time_state
set result = public.create_manual_time_session_service(
  'b6000000-0000-4000-8000-000000000001',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  '15000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  started_at + interval '3 hours', ended_at + interval '2 hours',
  'Overlapping source record', 'b6100000-0000-4000-8000-000000000004'
);
update manager_time_state set second_session_id = (result->'session'->>'id')::uuid;
update manager_time_state
set result = public.get_manager_time_entries_service(
  'b6000000-0000-4000-8000-000000000001',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', current_date - 1, current_date + 1
);
select is(
  (select count(*)::integer from jsonb_array_elements(result->'sessions') session_detail where session_detail->'attention_codes' ? 'overlap'),
  2,
  'overlapping sessions are surfaced for attention without rewriting either record'
) from manager_time_state;

update manager_time_state
set result = public.apply_time_amendment_service(
  'b6000000-0000-4000-8000-000000000001',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', first_session_id, 1,
  started_at - interval '10 minutes', ended_at,
  'Corrected from written log', 'b6100000-0000-4000-8000-000000000005'
);
select is(result->'session'->>'revision', '2', 'manager amendment advances the session revision') from manager_time_state;

update manager_time_state
set result = public.get_manager_time_entries_service(
  'b6000000-0000-4000-8000-000000000001',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', current_date - 1, current_date + 1
);
select ok(
  exists (
    select 1 from jsonb_array_elements(result->'sessions') session_detail
    where session_detail->>'id' = first_session_id::text
      and jsonb_array_length(session_detail->'amendments') = 1
      and session_detail->'attention_codes' ? 'amended'
  ),
  'manager read exposes amendment history and attention provenance'
) from manager_time_state;
select throws_ok(
  $$select public.apply_time_amendment_service(
    'b6000000-0000-4000-8000-000000000001',
    '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    (select first_session_id from manager_time_state), 1,
    (select started_at from manager_time_state), (select ended_at from manager_time_state),
    'Stale retry', 'b6100000-0000-4000-8000-000000000006'
  )$$,
  '40001', 'stale time session revision', 'stale amendment revision is rejected'
);
select throws_ok(
  $$update public.time_manual_entries set reason = 'Hidden rewrite'$$,
  '42501', 'time history is append only', 'manual provenance cannot be rewritten'
);
select throws_ok(
  $$select public.get_manager_time_entries_service(
    'b6000000-0000-4000-8000-000000000001',
    '99200000-0000-4000-8000-000000000001', current_date, current_date
  )$$,
  '42501', 'location time read denied', 'manager read cannot cross tenants'
);
select throws_ok(
  $$select public.get_manager_time_entries_service(
    'b6000000-0000-4000-8000-000000000001',
    '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', current_date - 42, current_date
  )$$,
  '22023', 'time entry range cannot exceed 42 days', 'manager read range is bounded'
);

select * from finish();
rollback;

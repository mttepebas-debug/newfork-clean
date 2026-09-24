begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'ab000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'kiosk-controls@example.test', '', '{}', '{}', now(), now()
);
insert into public.user_profiles (user_id, display_name)
values ('ab000000-0000-4000-8000-000000000001', 'Kiosk Manager');
insert into public.workspace_memberships (
  id, workspace_id, user_id, role, status, all_locations
) values (
  'ab010000-0000-4000-8000-000000000001',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  'ab000000-0000-4000-8000-000000000001',
  'manager', 'active', false
);
select tests.works_at('ab010000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001');

insert into public.kiosk_devices (
  id, workspace_id, location_id, label, credential_hash, created_by
) values
  ('ab100000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001','Main counter',repeat('6',64),'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5'),
  ('ab100000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000002','Private counter',repeat('7',64),'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5');
update public.kiosk_devices set last_seen_at = now() where id = 'ab100000-0000-4000-8000-000000000001';

insert into public.kiosk_security_events (
  workspace_id, location_id, device_id, actor_user_id, action
) values
  ('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000001','kiosk.test.visible'),
  ('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000002','ab100000-0000-4000-8000-000000000002','d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','kiosk.test.hidden');

create temp table kiosk_manager_state (model jsonb, enrollment jsonb);
insert into kiosk_manager_state values (
  public.get_kiosk_management_service(
    'ab000000-0000-4000-8000-000000000001',
    '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'
  ), null
);

select is(jsonb_array_length(model->'locations'),1,'manager sees one scoped location') from kiosk_manager_state;
select is(model->'locations'->0->>'id','11000000-0000-4000-8000-000000000001','location scope is preserved') from kiosk_manager_state;
select is(model->'locations'->0->>'can_enroll','true','location reports enrollment capability') from kiosk_manager_state;
select is(model->'locations'->0->>'can_reset_pin','true','location reports PIN capability') from kiosk_manager_state;
select is(jsonb_array_length(model->'devices'),1,'manager sees only scoped devices') from kiosk_manager_state;
select is(model->'devices'->0->>'label','Main counter','device label is visible') from kiosk_manager_state;
select isnt(model->'devices'->0->>'last_seen_at',null,'last contact is visible') from kiosk_manager_state;
select ok(not (model::text like '%Private counter%'),'unscoped device is absent from the complete read model') from kiosk_manager_state;
select cmp_ok(jsonb_array_length(model->'employees'),'>',0,'PIN candidates are returned for scoped assignments') from kiosk_manager_state;
select ok(not (model::text like '%invitation_email%'),'PIN candidates omit employee contact data') from kiosk_manager_state;
select is(jsonb_array_length(model->'events'),1,'audit list is location scoped') from kiosk_manager_state;
select is(model->'events'->0->>'action','kiosk.test.visible','scoped audit event is visible') from kiosk_manager_state;
select ok(not (model::text like '%kiosk.test.hidden%'),'unscoped audit event is absent') from kiosk_manager_state;

select is(
  public.update_kiosk_device_label_service(
    'ab000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    'ab100000-0000-4000-8000-000000000001','Host stand tablet'
  )->>'label',
  'Host stand tablet','manager renames a scoped device'
);
select throws_ok(
  $$select public.update_kiosk_device_label_service('ab000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','ab100000-0000-4000-8000-000000000002','Leaked rename')$$,
  '42501','kiosk device update denied','manager cannot rename an unscoped device'
);
select is(
  (select count(*)::integer from public.kiosk_security_events where action='kiosk.device.label_updated' and device_id='ab100000-0000-4000-8000-000000000001'),
  1,'label update is audited'
);

insert into public.kiosk_action_sessions (
  workspace_id, location_id, device_id, employee_id, token_hash, expires_at
) values (
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001',
  'ab100000-0000-4000-8000-000000000001','15000000-0000-4000-8000-000000000001',repeat('8',64),now()+interval '60 seconds'
);
update kiosk_manager_state set enrollment = public.create_kiosk_reenrollment_service(
  'ab000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  'ab100000-0000-4000-8000-000000000001',repeat('9',64),now()+interval '10 minutes'
);
select is(enrollment->>'label','Host stand tablet','re-enrollment preserves the device label') from kiosk_manager_state;
select is(
  (select status::text from public.kiosk_devices where id='ab100000-0000-4000-8000-000000000001'),
  'revoked','re-enrollment revokes the old device immediately'
);
select throws_ok(
  $$select public.get_kiosk_directory_service(repeat('6',64))$$,
  'P0002','active kiosk device not found','old device credential stops working immediately'
);
select is(
  (select revoked_at is not null from public.kiosk_action_sessions where token_hash=repeat('8',64)),
  true,'re-enrollment revokes open action sessions'
);
select is(
  (select replacement_for_device_id from public.kiosk_enrollment_codes where code_hash=repeat('9',64)),
  'ab100000-0000-4000-8000-000000000001'::uuid,'replacement enrollment links to the old device'
);
select is(
  (select status::text from public.kiosk_enrollment_codes where code_hash=repeat('9',64)),
  'pending','replacement code remains pending for device exchange'
);
select throws_ok(
  $$select public.create_kiosk_reenrollment_service('ab000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','ab100000-0000-4000-8000-000000000002',repeat('a',64),now()+interval '10 minutes')$$,
  '42501','kiosk re-enrollment denied','manager cannot replace an unscoped device'
);
select is(
  (select count(*)::integer from public.kiosk_security_events where action='kiosk.device.reenrollment_created' and device_id='ab100000-0000-4000-8000-000000000001'),
  1,'replacement enrollment is audited'
);

set local role authenticated;
select throws_ok(
  $$select public.get_kiosk_management_service('ab000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')$$,
  '42501',null,'authenticated clients cannot invoke management service RPC directly'
);
reset role;

select * from finish();
rollback;

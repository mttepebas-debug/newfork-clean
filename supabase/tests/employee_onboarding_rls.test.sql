begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('17000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'onboarding-owner@example.test', '', '{}', '{}', now(), now()),
  ('17000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'onboarding-manager@example.test', '', '{}', '{}', now(), now()),
  ('17000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'onboarding-employee@example.test', '', '{}', '{}', now(), now()),
  ('17000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'onboarding-outsider@example.test', '', '{}', '{}', now(), now());

insert into public.workspaces (id, name, created_by)
values
  ('27000000-0000-4000-8000-000000000001', 'Onboarding Workspace', '17000000-0000-4000-8000-000000000001'),
  ('27000000-0000-4000-8000-000000000002', 'Outside Workspace', '17000000-0000-4000-8000-000000000004');

insert into public.workspace_memberships (id, workspace_id, user_id, role, status, all_locations)
values
  ('37000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000001', 'owner', 'active', true),
  ('37000000-0000-4000-8000-000000000002', '27000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000002', 'manager', 'active', true),
  ('37000000-0000-4000-8000-000000000003', '27000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000003', 'employee', 'pending_activation', true),
  ('37000000-0000-4000-8000-000000000004', '27000000-0000-4000-8000-000000000002', '17000000-0000-4000-8000-000000000004', 'owner', 'active', true);

insert into public.employee_profiles (
  id, workspace_id, user_id, employee_code, first_name, last_name, preferred_name,
  invitation_email, created_by
) values (
  '47000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001',
  '17000000-0000-4000-8000-000000000003', 'E-0001', 'Taylor', 'Reed', '',
  'onboarding-employee@example.test', '17000000-0000-4000-8000-000000000001'
);

insert into public.document_types (
  id, workspace_id, title, description, required_at_onboarding, requires_review,
  accepted_formats, tracks_expiry, sort_order, created_by
) values (
  '57000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001',
  'Photo identification', 'Government-issued photo identification.', true, false,
  array['pdf', 'jpeg', 'png'], false, 10, '17000000-0000-4000-8000-000000000001'
);

insert into public.signature_retention_policies (
  id, workspace_id, name, retention_trigger, duration_days, jurisdiction_scope,
  authority_reference, status, approved_by, approved_at, created_by
) values (
  '67000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001',
  'Onboarding acknowledgements', 'signed_at', 2555, 'Test workspace',
  'Synthetic test policy', 'approved', '17000000-0000-4000-8000-000000000001', now(),
  '17000000-0000-4000-8000-000000000001'
);

insert into public.signature_templates (id, workspace_id, name, created_by)
values (
  '77000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001',
  'Workplace policy', '17000000-0000-4000-8000-000000000001'
);

insert into public.signature_template_versions (
  id, workspace_id, template_id, version_number, title, summary, execution_class,
  content_text, content_digest, intent_statement, effective_date,
  required_at_onboarding, blocks_activation, retention_policy_id, status,
  published_by, published_at, created_by
) values (
  '87000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001',
  '77000000-0000-4000-8000-000000000001', 1, 'Workplace policy',
  'Read and acknowledge the workplace policy.', 'acknowledgement',
  'Synthetic workplace policy content.', repeat('a', 64),
  'I acknowledge that I reviewed this policy.', current_date, true, true,
  '67000000-0000-4000-8000-000000000001', 'published',
  '17000000-0000-4000-8000-000000000001', now(),
  '17000000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000001', true);
select ok(public.workspace_has_permission('27000000-0000-4000-8000-000000000001', 'employee_onboarding.review'), 'owner receives onboarding review');
select ok(public.workspace_has_permission('27000000-0000-4000-8000-000000000001', 'employee_documents.review'), 'owner receives document review');
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000002', true);
select ok(public.workspace_has_permission('27000000-0000-4000-8000-000000000001', 'employee_onboarding.review'), 'manager receives onboarding review');
select isnt(public.workspace_has_permission('27000000-0000-4000-8000-000000000001', 'employee_documents.review'), true, 'manager does not receive private document review');

select throws_ok(
  $$select * from public.employee_private_profiles$$,
  '42501', null, 'authenticated clients cannot read private profiles directly'
);
select throws_ok(
  $$select * from public.employee_sensitive_identifiers$$,
  '42501', null, 'authenticated clients cannot read encrypted identifiers directly'
);

set local role service_role;
select lives_ok(
  $$select public.initialize_employee_onboarding_service('17000000-0000-4000-8000-000000000003')$$,
  'pending employee initializes self-scoped onboarding'
);
select is((select count(*)::integer from public.employee_onboarding_cases where employee_id = '47000000-0000-4000-8000-000000000001'), 1, 'one onboarding case is created');
select is((select count(*)::integer from public.employee_onboarding_requirements where employee_id = '47000000-0000-4000-8000-000000000001'), 5, 'core and configured requirements are snapshotted once');
select lives_ok(
  $$select public.initialize_employee_onboarding_service('17000000-0000-4000-8000-000000000003')$$,
  'onboarding initialization is idempotent'
);
select is((select count(*)::integer from public.employee_onboarding_requirements where employee_id = '47000000-0000-4000-8000-000000000001'), 5, 'idempotent initialization does not duplicate requirements');
select is((public.get_employee_onboarding_service('17000000-0000-4000-8000-000000000003')->>'membership_status'), 'pending_activation', 'self projection retains pending membership');

select is(public.save_employee_onboarding_profile_service(
  '17000000-0000-4000-8000-000000000003',
  jsonb_build_object(
    'legal_first_name', 'Taylor', 'legal_last_name', 'Reed', 'preferred_name', '',
    'phone', '3105550100', 'street_address', '1 Main St', 'city', 'Los Angeles',
    'region', 'CA', 'postal_code', '90001', 'country_code', 'US',
    'date_of_birth', '1990-01-01', 'emergency_contact_name', 'Morgan Reed',
    'emergency_contact_phone', '3105550101', 'share_phone_with_teammates', false,
    'share_email_with_teammates', false
  ), 1), 2, 'private profile save advances revision');
select is((select status::text from public.employee_onboarding_requirements where employee_id = '47000000-0000-4000-8000-000000000001' and kind = 'profile'), 'completed', 'profile requirement completes');
select throws_ok(
  $$select public.save_employee_onboarding_profile_service(
    '17000000-0000-4000-8000-000000000003', '{}'::jsonb, 1
  )$$,
  '40001', 'onboarding changed; refresh required', 'stale profile write fails closed'
);

select is(public.save_employee_ssn_envelope_service(
  '17000000-0000-4000-8000-000000000003', 'ciphertext-value', 'encrypted-key',
  'nonce-value', 'tag-value', 'test-key', 'v1', '6789', 2
), 3, 'encrypted identity save advances revision');
select isnt((select ciphertext from public.employee_sensitive_identifiers where employee_id = '47000000-0000-4000-8000-000000000001'), '123456789', 'plaintext SSN is not stored');
select is((select last_four from public.employee_sensitive_identifiers where employee_id = '47000000-0000-4000-8000-000000000001'), '6789', 'only last four is projected separately');

select is(public.confirm_employee_document_service(
  '17000000-0000-4000-8000-000000000003',
  (select id from public.employee_onboarding_requirements where employee_id = '47000000-0000-4000-8000-000000000001' and kind = 'document'),
  '27000000-0000-4000-8000-000000000001/47000000-0000-4000-8000-000000000001/' ||
    (select id::text from public.employee_onboarding_requirements where employee_id = '47000000-0000-4000-8000-000000000001' and kind = 'document') || '/photo-id.pdf',
  'photo-id.pdf', 'application/pdf', 1024, null, 3
), 4, 'private document confirmation advances revision');
select is((select review_status::text from public.employee_documents where employee_id = '47000000-0000-4000-8000-000000000001'), 'accepted', 'non-review document completes immediately');

select is(public.acknowledge_employee_requirement_service(
  '17000000-0000-4000-8000-000000000003',
  (select id from public.employee_onboarding_requirements where employee_id = '47000000-0000-4000-8000-000000000001' and kind = 'acknowledgement'),
  'Taylor Reed', repeat('a', 64), now(),
  '97000000-0000-4000-8000-000000000001', 4
), 5, 'policy acknowledgement advances revision');
select is((select count(*)::integer from public.employee_acknowledgement_envelopes where employee_id = '47000000-0000-4000-8000-000000000001'), 1, 'acknowledgement evidence is retained once');

select is(public.save_employee_availability_service(
  '17000000-0000-4000-8000-000000000003', 'America/Los_Angeles',
  '[{"day":0,"mode":"unrestricted","windows":[]},{"day":1,"mode":"unrestricted","windows":[]},{"day":2,"mode":"unrestricted","windows":[]},{"day":3,"mode":"unrestricted","windows":[]},{"day":4,"mode":"unrestricted","windows":[]},{"day":5,"mode":"unrestricted","windows":[]},{"day":6,"mode":"unavailable","windows":[]}]'::jsonb,
  5
), 6, 'availability confirmation advances revision');
select is((select jsonb_array_length(recurring_rules) from public.employee_availability_versions where employee_id = '47000000-0000-4000-8000-000000000001'), 7, 'availability stores seven explicit weekdays');
select is(public.submit_employee_onboarding_service('17000000-0000-4000-8000-000000000003', 6), 7, 'complete employee onboarding submits');
select is((select status::text from public.employee_onboarding_cases where employee_id = '47000000-0000-4000-8000-000000000001'), 'submitted', 'submission does not activate the case');
select set_config('request.jwt.claim.sub', '', true);
select is((public.get_employee_onboarding_review_service(
  '17000000-0000-4000-8000-000000000002',
  '27000000-0000-4000-8000-000000000001',
  '47000000-0000-4000-8000-000000000001'
)->>'ssn_present')::boolean, true, 'manager review receives SSN status only');
select throws_ok(
  $$select public.review_employee_onboarding_service(
    '17000000-0000-4000-8000-000000000002',
    '27000000-0000-4000-8000-000000000001',
    '47000000-0000-4000-8000-000000000001', 'activate', null, '', 7, false
  )$$,
  '55000', 'sensitive infrastructure readiness required', 'activation fails closed without production readiness'
);
select lives_ok(
  $$select public.review_employee_onboarding_service(
    '17000000-0000-4000-8000-000000000002',
    '27000000-0000-4000-8000-000000000001',
    '47000000-0000-4000-8000-000000000001', 'activate', null, '', 7, true
  )$$,
  'authorized manager activates a fully complete case'
);
set local role postgres;
select is((select status::text from public.workspace_memberships where id = '37000000-0000-4000-8000-000000000003'), 'active', 'activation updates membership atomically');
select is((select status::text from public.employee_onboarding_cases where employee_id = '47000000-0000-4000-8000-000000000001'), 'approved', 'activation approves onboarding case');
set local role service_role;
select throws_ok(
  $$select public.get_employee_onboarding_review_service(
    '17000000-0000-4000-8000-000000000004',
    '27000000-0000-4000-8000-000000000001',
    '47000000-0000-4000-8000-000000000001'
  )$$,
  '42501', 'employee onboarding review required', 'cross-tenant review is denied'
);
select is((select count(*)::integer from public.onboarding_events where employee_id = '47000000-0000-4000-8000-000000000001' and metadata::text like '%ciphertext-value%'), 0, 'audit metadata excludes encrypted and private payloads');

select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
select plan(69);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('17000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'onboarding-owner@example.test', '', '{}', '{}', now(), now()),
  ('17000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'onboarding-manager@example.test', '', '{}', '{}', now(), now()),
  ('17000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'onboarding-employee@example.test', '', '{}', '{}', now(), now()),
  ('17000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'onboarding-outsider@example.test', '', '{}', '{}', now(), now()),
  ('17000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'name-review@example.test', '', '{}', '{}', now(), now()),
  ('17000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'final-approval@example.test', '', '{}', '{}', now(), now()),
  ('17000000-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'review-auto@example.test', '', '{}', '{}', now(), now());

insert into public.user_profiles (user_id, display_name, phone)
values (
  '17000000-0000-4000-8000-000000000003',
  'Taylor account',
  '3105559999'
);

insert into public.workspaces (id, name, created_by)
values
  ('27000000-0000-4000-8000-000000000001', 'Onboarding Workspace', '17000000-0000-4000-8000-000000000001'),
  ('27000000-0000-4000-8000-000000000002', 'Outside Workspace', '17000000-0000-4000-8000-000000000004');

insert into public.workspace_memberships (id, workspace_id, user_id, role, status, all_locations)
values
  ('37000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000001', 'owner', 'active', true),
  ('37000000-0000-4000-8000-000000000002', '27000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000002', 'manager', 'active', true),
  ('37000000-0000-4000-8000-000000000003', '27000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000003', 'employee', 'pending_activation', true),
  ('37000000-0000-4000-8000-000000000004', '27000000-0000-4000-8000-000000000002', '17000000-0000-4000-8000-000000000004', 'owner', 'active', true),
  ('37000000-0000-4000-8000-000000000005', '27000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000005', 'employee', 'pending_activation', true),
  ('37000000-0000-4000-8000-000000000006', '27000000-0000-4000-8000-000000000002', '17000000-0000-4000-8000-000000000006', 'employee', 'pending_activation', true),
  ('37000000-0000-4000-8000-000000000007', '27000000-0000-4000-8000-000000000002', '17000000-0000-4000-8000-000000000007', 'employee', 'pending_activation', true);

insert into public.employee_profiles (
  id, workspace_id, user_id, employee_code, first_name, last_name, preferred_name,
  invitation_email, created_by
) values (
  '47000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001',
  '17000000-0000-4000-8000-000000000003', 'E-0001', 'Taylor', 'Reed', '',
  'onboarding-employee@example.test', '17000000-0000-4000-8000-000000000001'
), (
  '47000000-0000-4000-8000-000000000002', '27000000-0000-4000-8000-000000000001',
  '17000000-0000-4000-8000-000000000005', 'E-0002', 'Taylro', 'Reed', '',
  'name-review@example.test', '17000000-0000-4000-8000-000000000001'
), (
  '47000000-0000-4000-8000-000000000003', '27000000-0000-4000-8000-000000000002',
  '17000000-0000-4000-8000-000000000006', 'E-0003', 'Avery', 'Stone', '',
  'final-approval@example.test', '17000000-0000-4000-8000-000000000004'
), (
  '47000000-0000-4000-8000-000000000004', '27000000-0000-4000-8000-000000000002',
  '17000000-0000-4000-8000-000000000007', 'E-0004', 'Jame', 'Porter', '',
  'review-auto@example.test', '17000000-0000-4000-8000-000000000004'
);


insert into public.employee_onboarding_settings (workspace_id, final_approval_required, updated_by)
values ('27000000-0000-4000-8000-000000000002', true, '17000000-0000-4000-8000-000000000004');

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
  $$select public.initialize_employee_onboarding_service('17000000-0000-4000-8000-000000000005')$$,
  'name correction employee initializes onboarding'
);
select is(public.save_employee_onboarding_profile_service(
  '17000000-0000-4000-8000-000000000005',
  jsonb_build_object(
    'legal_first_name', 'Taylor', 'legal_last_name', 'Reed',
    'phone', '3105550200', 'date_of_birth', '',
    'emergency_contact_name', 'Casey Reed',
    'emergency_contact_relationship', 'Partner',
    'emergency_contact_email', '',
    'emergency_contact_phone', '3105550201', 'share_phone_with_teammates', false,
    'share_email_with_teammates', false
  ), 1), 2, 'changed legal name profile save advances revision');
select is((select status::text from public.employee_onboarding_requirements where employee_id = '47000000-0000-4000-8000-000000000002' and kind = 'profile'), 'awaiting_review', 'changed legal name waits for owner or admin review');
select throws_ok(
  $$select public.review_employee_onboarding_service(
    '17000000-0000-4000-8000-000000000002',
    '27000000-0000-4000-8000-000000000001',
    '47000000-0000-4000-8000-000000000002', 'accept_requirement',
    (select id from public.employee_onboarding_requirements where employee_id = '47000000-0000-4000-8000-000000000002' and kind = 'profile'),
    '', 2, true
  )$$,
  '42501', 'owner or admin approval required for legal name changes', 'manager cannot approve legal name correction'
);
select lives_ok(
  $$select public.review_employee_onboarding_service(
    '17000000-0000-4000-8000-000000000001',
    '27000000-0000-4000-8000-000000000001',
    '47000000-0000-4000-8000-000000000002', 'accept_requirement',
    (select id from public.employee_onboarding_requirements where employee_id = '47000000-0000-4000-8000-000000000002' and kind = 'profile'),
    '', 2, true
  )$$,
  'owner approves legal name correction'
);
set local role postgres;
select is((select first_name from public.employee_profiles where id = '47000000-0000-4000-8000-000000000002'), 'Taylor', 'legal name approval updates employee display name source');

set local role service_role;
set local role postgres;
select is(
  (public.leave_employee_onboarding_service('17000000-0000-4000-8000-000000000005', 3)->>'status'),
  'left',
  'pending employee can leave onboarding after warning'
);
set local role postgres;
select is((select status::text from public.workspace_memberships where id = '37000000-0000-4000-8000-000000000005'), 'suspended', 'leaving pending onboarding suspends organization access');
select is((select status::text from public.employee_onboarding_cases where employee_id = '47000000-0000-4000-8000-000000000002'), 'cancelled', 'leaving pending onboarding cancels the case');
select is((select user_id from public.employee_profiles where id = '47000000-0000-4000-8000-000000000002'), '17000000-0000-4000-8000-000000000005'::uuid, 'leaving onboarding preserves the linked employee record');
select is((select count(*)::integer from public.onboarding_events where employee_id = '47000000-0000-4000-8000-000000000002' and action = 'onboarding.left'), 1, 'leaving onboarding writes an onboarding event');
select is((select count(*)::integer from public.audit_events where target_id = '37000000-0000-4000-8000-000000000005' and action = 'employee_onboarding.left'), 1, 'leaving onboarding writes an audit event');

set local role service_role;
select lives_ok(
  $$select public.initialize_employee_onboarding_service('17000000-0000-4000-8000-000000000003')$$,
  'pending employee initializes self-scoped onboarding'
);
select is((select count(*)::integer from public.employee_onboarding_cases where employee_id = '47000000-0000-4000-8000-000000000001'), 1, 'one onboarding case is created');
select is((select count(*)::integer from public.employee_onboarding_requirements where employee_id = '47000000-0000-4000-8000-000000000001'), 4, 'core and configured requirements are snapshotted once');
select is((select count(*)::integer from public.employee_onboarding_requirements where employee_id = '47000000-0000-4000-8000-000000000001' and kind = 'ssn'), 0, 'SSN is deferred from V1 onboarding');
select ok(
  exists (
    select 1
    from public.employee_onboarding_requirements
    where employee_id = '47000000-0000-4000-8000-000000000001'
      and kind = 'availability'
      and required = false
      and blocks_activation = false
  ),
  'availability is optional and non-blocking'
);
select lives_ok(
  $$select public.initialize_employee_onboarding_service('17000000-0000-4000-8000-000000000003')$$,
  'onboarding initialization is idempotent'
);
select is((select count(*)::integer from public.employee_onboarding_requirements where employee_id = '47000000-0000-4000-8000-000000000001'), 4, 'idempotent initialization does not duplicate requirements');
set local role postgres;
insert into public.document_types (
  id, workspace_id, title, description, required_at_onboarding, requires_review,
  accepted_formats, tracks_expiry, sort_order, created_by
) values (
  '57000000-0000-4000-8000-000000000002', '27000000-0000-4000-8000-000000000001',
  'Late handbook', 'Required after onboarding already started.', true, false,
  array['pdf'], false, 20, '17000000-0000-4000-8000-000000000001'
);
insert into public.signature_template_versions (
  id, workspace_id, template_id, version_number, title, summary, execution_class,
  content_text, content_digest, intent_statement, effective_date,
  required_at_onboarding, blocks_activation, retention_policy_id, status,
  published_by, published_at, created_by
) values (
  '87000000-0000-4000-8000-000000000002', '27000000-0000-4000-8000-000000000001',
  '77000000-0000-4000-8000-000000000001', 2, 'Late workplace policy',
  'Published after onboarding already started.', 'acknowledgement',
  'Synthetic workplace policy content v2.', repeat('b', 64),
  'I acknowledge that I reviewed this updated policy.', current_date, true, true,
  '67000000-0000-4000-8000-000000000001', 'published',
  '17000000-0000-4000-8000-000000000001', now(),
  '17000000-0000-4000-8000-000000000001'
);
set local role service_role;
select lives_ok(
  $$select public.initialize_employee_onboarding_service('17000000-0000-4000-8000-000000000003')$$,
  'late onboarding requirement config does not mutate an existing snapshot'
);
select is((select count(*)::integer from public.employee_onboarding_requirements where employee_id = '47000000-0000-4000-8000-000000000001'), 4, 'existing onboarding snapshot remains immutable after later config changes');
select is((select count(*)::integer from public.employee_onboarding_requirements where employee_id = '47000000-0000-4000-8000-000000000001' and source_id in ('57000000-0000-4000-8000-000000000002', '87000000-0000-4000-8000-000000000002')), 0, 'late document and acknowledgement sources are excluded from existing snapshot');
select is((public.get_employee_onboarding_service('17000000-0000-4000-8000-000000000003')->>'membership_status'), 'pending_activation', 'self projection retains pending membership');
select is((public.get_employee_onboarding_service('17000000-0000-4000-8000-000000000003')->'profile'->>'legal_first_name'), 'Taylor', 'self profile is prefilled from employer-provided legal first name');
select is(
  (
    select p.provolatile::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_employee_onboarding_service'
      and pg_get_function_identity_arguments(p.oid) = 'target_user_id uuid, target_workspace_id uuid'
  ),
  'v',
  'employee onboarding getter remains volatile because it initializes missing cases'
);

select is(public.save_employee_onboarding_profile_service(
  '17000000-0000-4000-8000-000000000003',
  jsonb_build_object(
    'legal_first_name', 'Taylor', 'legal_last_name', 'Reed',
    'phone', '3105550100', 'date_of_birth', '',
    'emergency_contact_name', 'Morgan Reed',
    'emergency_contact_relationship', 'Sibling',
    'emergency_contact_email', 'morgan@example.test',
    'emergency_contact_phone', '3105550101', 'share_phone_with_teammates', false,
    'share_email_with_teammates', false
  ), 1), 2, 'private profile save advances revision');
select is((select status::text from public.employee_onboarding_requirements where employee_id = '47000000-0000-4000-8000-000000000001' and kind = 'profile'), 'completed', 'profile requirement completes');
set local role postgres;
select is((select phone from public.employee_private_profiles where employee_id = '47000000-0000-4000-8000-000000000001'), '3105550100', 'submitted workspace phone wins over the account suggestion');
select is((select phone from public.user_profiles where user_id = '17000000-0000-4000-8000-000000000003'), '3105559999', 'onboarding does not overwrite an existing global account phone');
set local role service_role;
select throws_ok(
  $$select public.save_employee_onboarding_profile_service(
    '17000000-0000-4000-8000-000000000003', '{}'::jsonb, 1
  )$$,
  '40001', 'onboarding changed; refresh required', 'stale profile write fails closed'
);

select throws_ok(
  $$select public.confirm_employee_document_service(
    '17000000-0000-4000-8000-000000000003',
    (select id from public.employee_onboarding_requirements where employee_id = '47000000-0000-4000-8000-000000000001' and kind = 'document'),
    '27000000-0000-4000-8000-000000000001/47000000-0000-4000-8000-000000000001/' ||
      (select id::text from public.employee_onboarding_requirements where employee_id = '47000000-0000-4000-8000-000000000001' and kind = 'document') || '/photo-id.pdf',
    'photo-id.pdf', 'application/pdf', 1024, null, 2
  )$$,
  '22023', 'invalid private document upload', 'private document confirmation rejects non-contract object paths'
);

select is(public.confirm_employee_document_service(
  '17000000-0000-4000-8000-000000000003',
  (select id from public.employee_onboarding_requirements where employee_id = '47000000-0000-4000-8000-000000000001' and kind = 'document'),
  '27000000-0000-4000-8000-000000000001/47000000-0000-4000-8000-000000000001/' ||
    (select id::text from public.employee_onboarding_requirements where employee_id = '47000000-0000-4000-8000-000000000001' and kind = 'document') || '/97000000-0000-4000-8000-000000000002.pdf',
  'photo-id.pdf', 'application/pdf', 1024, null, 2
), 3, 'private document confirmation advances revision');
select is((select review_status::text from public.employee_documents where employee_id = '47000000-0000-4000-8000-000000000001'), 'accepted', 'non-review document completes immediately');

select is(public.acknowledge_employee_requirement_service(
  '17000000-0000-4000-8000-000000000003',
  (select id from public.employee_onboarding_requirements where employee_id = '47000000-0000-4000-8000-000000000001' and kind = 'acknowledgement'),
  'Taylor Reed', repeat('a', 64), now(),
  '97000000-0000-4000-8000-000000000001', 3
), 4, 'policy acknowledgement advances revision');
select is((select count(*)::integer from public.employee_acknowledgement_envelopes where employee_id = '47000000-0000-4000-8000-000000000001'), 1, 'acknowledgement evidence is retained once');
select is(
  (
    select jsonb_build_object(
      'template_version_id', template_version_id,
      'content_digest', content_digest,
      'user_id', user_id,
      'membership_id', membership_id,
      'authenticated', authenticated_at is not null
    )::text
    from public.employee_acknowledgement_envelopes
    where employee_id = '47000000-0000-4000-8000-000000000001'
  ),
  jsonb_build_object(
    'template_version_id', '87000000-0000-4000-8000-000000000001'::uuid,
    'content_digest', repeat('a', 64),
    'user_id', '17000000-0000-4000-8000-000000000003'::uuid,
    'membership_id', '37000000-0000-4000-8000-000000000003'::uuid,
    'authenticated', true
  )::text,
  'acknowledgement evidence stores version, digest, actor and membership'
);

select is((select count(*)::integer from public.employee_availability_versions where employee_id = '47000000-0000-4000-8000-000000000001'), 0, 'availability can be skipped in V1');
select is(public.submit_employee_onboarding_service('17000000-0000-4000-8000-000000000003', 4), 6, 'complete employee onboarding auto-activates without final approval setting');
set local role postgres;
select is((select status::text from public.workspace_memberships where id = '37000000-0000-4000-8000-000000000003'), 'active', 'auto-activation updates membership atomically');
select is((select status::text from public.employee_onboarding_cases where employee_id = '47000000-0000-4000-8000-000000000001'), 'approved', 'auto-activation approves onboarding case');
set local role service_role;
select throws_ok(
  $$select public.leave_employee_onboarding_service('17000000-0000-4000-8000-000000000003', 6)$$,
  '23514', 'active employees cannot leave onboarding', 'active employees cannot self-leave onboarding'
);
set local role service_role;
select lives_ok(
  $$select public.initialize_employee_onboarding_service('17000000-0000-4000-8000-000000000006')$$,
  'final approval employee initializes onboarding'
);
select is(public.save_employee_onboarding_profile_service(
  '17000000-0000-4000-8000-000000000006',
  jsonb_build_object(
    'legal_first_name', 'Avery', 'legal_last_name', 'Stone',
    'phone', '3105550300', 'date_of_birth', '',
    'emergency_contact_name', 'Riley Stone',
    'emergency_contact_relationship', 'Spouse',
    'emergency_contact_email', '',
    'emergency_contact_phone', '3105550301', 'share_phone_with_teammates', false,
    'share_email_with_teammates', false
  ), 1), 2, 'final approval profile save advances revision');
select is(public.submit_employee_onboarding_service('17000000-0000-4000-8000-000000000006', 2), 3, 'final approval setting keeps completed onboarding submitted');
set local role postgres;
select is((select status::text from public.workspace_memberships where id = '37000000-0000-4000-8000-000000000006'), 'pending_activation', 'final approval setting keeps membership pending');
select is((select status::text from public.employee_onboarding_cases where employee_id = '47000000-0000-4000-8000-000000000003'), 'submitted', 'final approval setting keeps case submitted');
set local role service_role;
select throws_ok(
  $$select public.review_employee_onboarding_service(
    '17000000-0000-4000-8000-000000000006',
    '27000000-0000-4000-8000-000000000002',
    '47000000-0000-4000-8000-000000000003', 'activate',
    null, '', 3, true
  )$$,
  '42501', 'employee onboarding review required', 'pending submitter cannot activate without active reviewer permission'
);
select is(public.review_employee_onboarding_service(
  '17000000-0000-4000-8000-000000000004',
  '27000000-0000-4000-8000-000000000002',
  '47000000-0000-4000-8000-000000000003', 'activate',
  null, '', 3, true
), 4, 'owner activates final approval case');
set local role postgres;
select is((select status::text from public.workspace_memberships where id = '37000000-0000-4000-8000-000000000006'), 'active', 'owner activation updates final approval membership');
select is((select status::text from public.employee_onboarding_cases where employee_id = '47000000-0000-4000-8000-000000000003'), 'approved', 'owner activation approves final approval case');
update public.employee_onboarding_settings
set final_approval_required = false
where workspace_id = '27000000-0000-4000-8000-000000000002';
set local role service_role;
select lives_ok(
  $$select public.initialize_employee_onboarding_service('17000000-0000-4000-8000-000000000007')$$,
  'review-gated employee initializes onboarding'
);
select is(public.save_employee_onboarding_profile_service(
  '17000000-0000-4000-8000-000000000007',
  jsonb_build_object(
    'legal_first_name', 'Jamie', 'legal_last_name', 'Porter',
    'phone', '3105550400', 'date_of_birth', '',
    'emergency_contact_name', 'Casey Porter',
    'emergency_contact_relationship', 'Parent',
    'emergency_contact_email', '',
    'emergency_contact_phone', '3105550401', 'share_phone_with_teammates', false,
    'share_email_with_teammates', false
  ), 1), 2, 'review-gated profile save advances revision');
select is(public.submit_employee_onboarding_service('17000000-0000-4000-8000-000000000007', 2), 3, 'review-gated onboarding submits while waiting for review');
set local role postgres;
select is((select status::text from public.workspace_memberships where id = '37000000-0000-4000-8000-000000000007'), 'pending_activation', 'review-gated membership stays pending before approval');
set local role service_role;
select is(public.review_employee_onboarding_service(
  '17000000-0000-4000-8000-000000000004',
  '27000000-0000-4000-8000-000000000002',
  '47000000-0000-4000-8000-000000000004', 'accept_requirement',
  (select id from public.employee_onboarding_requirements where employee_id = '47000000-0000-4000-8000-000000000004' and kind = 'profile'),
  '', 3, true
), 5, 'default-off final review auto-activates onboarding');
set local role postgres;
select is((select status::text from public.workspace_memberships where id = '37000000-0000-4000-8000-000000000007'), 'active', 'review acceptance auto-activates membership');
select is((select status::text from public.employee_onboarding_cases where employee_id = '47000000-0000-4000-8000-000000000004'), 'approved', 'review acceptance approves onboarding case');
set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
set local role postgres;
insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
select '27000000-0000-4000-8000-000000000001', role.id, permission.key
from public.workspace_roles role
join public.permissions permission
  on permission.key in ('documents.read', 'employee_documents.review')
where role.workspace_id = '27000000-0000-4000-8000-000000000001'
  and role.system_key = 'manager'
on conflict do nothing;

insert into public.employee_profiles (
  id, workspace_id, user_id, employee_code, first_name, last_name, preferred_name,
  invitation_email, created_by
) values (
  '47000000-0000-4000-8000-000000000005', '27000000-0000-4000-8000-000000000001',
  '17000000-0000-4000-8000-000000000002', 'E-0005', 'Manager', 'Target', '',
  'onboarding-manager@example.test', '17000000-0000-4000-8000-000000000001'
);
insert into public.employee_onboarding_cases (
  id, workspace_id, employee_id, membership_id, status
) values (
  'a7000000-0000-4000-8000-000000000005',
  '27000000-0000-4000-8000-000000000001',
  '47000000-0000-4000-8000-000000000005',
  '37000000-0000-4000-8000-000000000002',
  'in_progress'
);
insert into public.employee_onboarding_requirements (
  id, workspace_id, case_id, employee_id, kind, title, required,
  blocks_activation, requires_review, sort_order, status
) values (
  'b7000000-0000-4000-8000-000000000005',
  '27000000-0000-4000-8000-000000000001',
  'a7000000-0000-4000-8000-000000000005',
  '47000000-0000-4000-8000-000000000005',
  'document', 'Manager private document', true, true, true, 20, 'awaiting_review'
);
insert into public.employee_documents (
  id, workspace_id, employee_id, requirement_id, version_number, object_path,
  original_filename, media_type, size_bytes, review_status, uploaded_by
) values (
  'c7000000-0000-4000-8000-000000000005',
  '27000000-0000-4000-8000-000000000001',
  '47000000-0000-4000-8000-000000000005',
  'b7000000-0000-4000-8000-000000000005',
  1,
  '27000000-0000-4000-8000-000000000001/47000000-0000-4000-8000-000000000005/b7000000-0000-4000-8000-000000000005/97000000-0000-4000-8000-000000000005.pdf',
  'manager-private.pdf',
  'application/pdf',
  1024,
  'awaiting_review',
  '17000000-0000-4000-8000-000000000002'
);
set local role service_role;
select is(
  public.get_employee_document_path_service(
    '17000000-0000-4000-8000-000000000002',
    '27000000-0000-4000-8000-000000000001',
    '47000000-0000-4000-8000-000000000001',
    (select id from public.employee_onboarding_requirements where employee_id = '47000000-0000-4000-8000-000000000001' and kind = 'document')
  ),
  '27000000-0000-4000-8000-000000000001/47000000-0000-4000-8000-000000000001/' ||
    (select id::text from public.employee_onboarding_requirements where employee_id = '47000000-0000-4000-8000-000000000001' and kind = 'document') || '/97000000-0000-4000-8000-000000000002.pdf',
  'document reviewer manager can download scoped employee-role document'
);
select throws_ok(
  $$select public.get_employee_onboarding_review_service(
    '17000000-0000-4000-8000-000000000002',
    '27000000-0000-4000-8000-000000000001',
    '47000000-0000-4000-8000-000000000005'
  )$$,
  'P0002', 'onboarding case unavailable', 'manager cannot open manager-role onboarding review'
);
select throws_ok(
  $$select public.get_employee_document_path_service(
    '17000000-0000-4000-8000-000000000002',
    '27000000-0000-4000-8000-000000000001',
    '47000000-0000-4000-8000-000000000005',
    'b7000000-0000-4000-8000-000000000005'
  )$$,
  'P0002', 'employee document unavailable', 'manager cannot download manager-role document'
);
select is((public.get_employee_onboarding_review_service(
  '17000000-0000-4000-8000-000000000002',
  '27000000-0000-4000-8000-000000000001',
  '47000000-0000-4000-8000-000000000001'
)->>'ssn_present')::boolean, false, 'manager review receives no SSN status in V1');
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

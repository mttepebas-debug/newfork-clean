begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('17000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'onboarding-owner@example.test', '', '{}', '{}', now(), now()),
  ('17000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'onboarding-manager@example.test', '', '{}', '{}', now(), now()),
  ('17000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'onboarding-employee@example.test', '', '{}', '{}', now(), now()),
  ('17000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'onboarding-outsider@example.test', '', '{}', '{}', now(), now()),
  ('17000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'name-review@example.test', '', '{}', '{}', now(), now()),
  ('17000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'final-approval@example.test', '', '{}', '{}', now(), now()),
  ('17000000-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'review-auto@example.test', '', '{}', '{}', now(), now());

insert into public.user_profiles (user_id, display_name)
values (
  '17000000-0000-4000-8000-000000000003',
  'Taylor account'
);

insert into public.workspaces (id, name, created_by)
values
  ('27000000-0000-4000-8000-000000000001', 'Onboarding Workspace', '17000000-0000-4000-8000-000000000001'),
  ('27000000-0000-4000-8000-000000000002', 'Outside Workspace', '17000000-0000-4000-8000-000000000004');

insert into public.workspace_memberships (id, workspace_id, user_id, status, role_id, employee_role_id)
select legacy.id::uuid, legacy.workspace_id::uuid, legacy.user_id::uuid, legacy.status::text::public.membership_status, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values
  ('37000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000001', 'owner', 'active', true),
  ('37000000-0000-4000-8000-000000000002', '27000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000002', 'manager', 'active', true),
  ('37000000-0000-4000-8000-000000000003', '27000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000003', 'employee', 'pending_activation', true),
  ('37000000-0000-4000-8000-000000000004', '27000000-0000-4000-8000-000000000002', '17000000-0000-4000-8000-000000000004', 'owner', 'active', true),
  ('37000000-0000-4000-8000-000000000005', '27000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000005', 'employee', 'pending_activation', true),
  ('37000000-0000-4000-8000-000000000006', '27000000-0000-4000-8000-000000000002', '17000000-0000-4000-8000-000000000006', 'employee', 'pending_activation', true),
  ('37000000-0000-4000-8000-000000000007', '27000000-0000-4000-8000-000000000002', '17000000-0000-4000-8000-000000000007', 'employee', 'pending_activation', true)) as legacy(id, workspace_id, user_id, role, status, all_locations);

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
  accepted_formats, tracks_expiry, sort_order, created_by, publication_status, published_at, lifecycle_settings
) values (
  '57000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001',
  'Photo identification', 'Government-issued photo identification.', true, false,
  array['pdf', 'jpeg', 'png'], false, 10, '17000000-0000-4000-8000-000000000001', 'published', now(),
  '{"mode": "required", "target": {"operator": "and", "job_ids": [], "employee_ids": [], "location_ids": [], "department_ids": []}, "period_days": null, "extra_fields": [], "assignment_scope": "future_onboarding", "suspend_on_overdue": false}'
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
select ok(public.workspace_has_permission('27000000-0000-4000-8000-000000000001', 'employee_documents.review'), 'manager receives document review (BL-560)');

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
    'emergency_contact_phone', '+13105550201', 'share_phone_with_teammates', false,
    'share_email_with_teammates', false
  ), 1), 2, 'changed legal name profile save advances revision');
select is((select status::text from public.employee_onboarding_requirements where employee_id = '47000000-0000-4000-8000-000000000002' and kind = 'profile'), 'awaiting_review', 'changed legal name waits for owner or admin review');
-- Only an owner or an admin approves a legal name (Mert, 2026-10-02, FB-6.6 S1).
select throws_ok(
  $$select public.review_employee_onboarding_service(
    '17000000-0000-4000-8000-000000000002',
    '27000000-0000-4000-8000-000000000001',
    '47000000-0000-4000-8000-000000000002', 'accept_requirement',
    (select id from public.employee_onboarding_requirements where employee_id = '47000000-0000-4000-8000-000000000002' and kind = 'profile'),
    '', 2, true
  )$$,
  '42501', 'Not allowed', 'manager cannot approve legal name correction'
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
  accepted_formats, tracks_expiry, sort_order, created_by, publication_status, published_at
) values (
  '57000000-0000-4000-8000-000000000002', '27000000-0000-4000-8000-000000000001',
  'Late handbook', 'Required after onboarding already started.', true, false,
  array['pdf'], false, 20, '17000000-0000-4000-8000-000000000001', 'published', now()
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
    'emergency_contact_phone', '+13105550101', 'share_phone_with_teammates', false,
    'share_email_with_teammates', false
  ), 1), 2, 'private profile save advances revision');
select is((select status::text from public.employee_onboarding_requirements where employee_id = '47000000-0000-4000-8000-000000000001' and kind = 'profile'), 'completed', 'profile requirement completes');
set local role postgres;
-- BL-335 / KK-7: the legacy phone column is not the account phone; phone_e164 is.
select is((select phone from public.employee_private_profiles where employee_id = '47000000-0000-4000-8000-000000000001'), '+13105550100', 'the record carries the account phone the onboarding number filled');
select is((select phone_e164 from public.user_profiles where user_id = '17000000-0000-4000-8000-000000000003'), '+13105550100', 'onboarding fills an empty account phone in E.164');
set local role service_role;
select throws_ok(
  $$select public.save_employee_onboarding_profile_service(
    '17000000-0000-4000-8000-000000000003', '{}'::jsonb, 1
  )$$,
  'PT409', 'onboarding changed; refresh required', 'stale profile write fails closed'
);

-- The employee's document and policy, through the paths the app uses today.
create function pg_temp.req(k text) returns public.employee_onboarding_requirements language sql as $$
  select * from public.employee_onboarding_requirements where employee_id = '47000000-0000-4000-8000-000000000001' and kind::text = k$$;
select throws_ok(
  $$select public.save_employee_document_draft_file_service(
    '17000000-0000-4000-8000-000000000003', (pg_temp.req('document')).id, (pg_temp.req('document')).lifecycle_revision,
    '27000000-0000-4000-8000-000000000001/47000000-0000-4000-8000-000000000001/' || (pg_temp.req('document')).id::text || '/photo-id.pdf',
    'photo-id.pdf', 'application/pdf', 1024)$$,
  '22023', 'invalid private document upload', 'private document upload rejects non-contract object paths'
);
select lives_ok(
  $$select public.save_employee_document_draft_file_service(
    '17000000-0000-4000-8000-000000000003', (pg_temp.req('document')).id, (pg_temp.req('document')).lifecycle_revision,
    '27000000-0000-4000-8000-000000000001/47000000-0000-4000-8000-000000000001/' || (pg_temp.req('document')).id::text || '/97000000-0000-4000-8000-000000000002.pdf',
    'photo-id.pdf', 'application/pdf', 1024)$$,
  'the employee uploads their document'
);
select lives_ok(
  $$select public.submit_employee_document_lifecycle_service(
    '17000000-0000-4000-8000-000000000003', (pg_temp.req('document')).id, (pg_temp.req('document')).lifecycle_revision,
    (select s.id from public.employee_document_submissions s where s.requirement_id = (pg_temp.req('document')).id and s.state = 'draft'),
    null, '{}'::jsonb)$$,
  'and submits it'
);
select is((select review_status::text from public.employee_documents where employee_id = '47000000-0000-4000-8000-000000000001'), 'accepted', 'non-review document completes immediately');
select lives_ok(
  $$select public.acknowledge_document_lifecycle_service(
    '17000000-0000-4000-8000-000000000003', '27000000-0000-4000-8000-000000000001', (pg_temp.req('acknowledgement')).id,
    (pg_temp.req('acknowledgement')).lifecycle_revision, 'Taylor Reed', repeat('a', 64), now(), '97000000-0000-4000-8000-000000000001')$$,
  'policy acknowledgement is recorded'
);
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

select is((select status::text from public.employee_onboarding_requirements where employee_id = '47000000-0000-4000-8000-000000000001' and kind = 'availability'), 'not_started', 'availability can be skipped in V1');
select lives_ok($$select public.submit_employee_onboarding_service('17000000-0000-4000-8000-000000000003',
  (select c.revision from public.employee_onboarding_cases c where c.employee_id = '47000000-0000-4000-8000-000000000001'))$$,
  'complete employee onboarding submits');
set local role postgres;
select is((select status::text from public.workspace_memberships where id = '37000000-0000-4000-8000-000000000003'), 'active', 'auto-activation updates membership atomically');
select is((select status::text from public.employee_onboarding_cases where employee_id = '47000000-0000-4000-8000-000000000001'), 'approved', 'auto-activation approves onboarding case');
set local role service_role;
select throws_ok(
  $$select public.leave_employee_onboarding_service('17000000-0000-4000-8000-000000000003',
    (select c.revision from public.employee_onboarding_cases c where c.employee_id = '47000000-0000-4000-8000-000000000001'))$$,
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
    'emergency_contact_phone', '+13105550301', 'share_phone_with_teammates', false,
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
  '42501', 'Not allowed', 'pending submitter cannot activate without active reviewer permission'
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
    'emergency_contact_phone', '+13105550401', 'share_phone_with_teammates', false,
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
  on permission.key in ('documents.read', 'employee_documents.read', 'employee_documents.review')
where role.workspace_id = '27000000-0000-4000-8000-000000000001'
  and role.system_key = 'manager'
on conflict do nothing;

-- The manager and Taylor work at one location; a manager manages where they work (EMP-001).
insert into public.locations (id, workspace_id, name, short_name, street_address, city, region, postal_code, country_code, timezone)
values ('d7000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001', 'Main', 'MAIN', '1 Road', 'City', 'CA', '90012', 'US', 'America/Los_Angeles');
insert into public.employee_profiles (
  id, workspace_id, user_id, employee_code, first_name, last_name, preferred_name,
  invitation_email, created_by
) values (
  '47000000-0000-4000-8000-000000000005', '27000000-0000-4000-8000-000000000001',
  '17000000-0000-4000-8000-000000000002', 'E-0005', 'Manager', 'Target', '',
  'onboarding-manager@example.test', '17000000-0000-4000-8000-000000000001'
);
insert into public.employee_location_assignments (workspace_id, employee_id, location_id, is_primary, created_by)
select '27000000-0000-4000-8000-000000000001', e, 'd7000000-0000-4000-8000-000000000001', true, '17000000-0000-4000-8000-000000000001'
from unnest(array['47000000-0000-4000-8000-000000000001', '47000000-0000-4000-8000-000000000005']::uuid[]) e;
set local role service_role;
select is(
  public.get_employee_document_lifecycle_path_service(
    '17000000-0000-4000-8000-000000000002',
    '27000000-0000-4000-8000-000000000001',
    (pg_temp.req('document')).id,
    (select s.id from public.employee_document_submissions s where s.requirement_id = (pg_temp.req('document')).id and s.state = 'accepted'),
    (select f.id from public.employee_documents f where f.requirement_id = (pg_temp.req('document')).id),
    false
  ),
  '27000000-0000-4000-8000-000000000001/47000000-0000-4000-8000-000000000001/' ||
    (pg_temp.req('document')).id::text || '/97000000-0000-4000-8000-000000000002.pdf',
  'a manager who reads documents downloads the document of somebody at their location'
);
select throws_ok(
  $$select public.get_employee_onboarding_review_service(
    '17000000-0000-4000-8000-000000000002',
    '27000000-0000-4000-8000-000000000001',
    '47000000-0000-4000-8000-000000000005'
  )$$,
  '42501', 'Not allowed', 'nobody opens the review of their own onboarding'
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
  '42501', 'Not allowed', 'cross-tenant review is denied'
);
select is((select count(*)::integer from public.onboarding_events where employee_id = '47000000-0000-4000-8000-000000000001' and metadata::text like '%ciphertext-value%'), 0, 'audit metadata excludes encrypted and private payloads');

select * from finish();
rollback;

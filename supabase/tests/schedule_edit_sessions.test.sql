begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('51000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'second-manager@example.test', '', '{}', '{}', now(), now()),
  ('51000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'edit-employee@example.test', '', '{}', '{}', now(), now());
insert into public.user_profiles (user_id, display_name) values
  ('51000000-0000-4000-8000-000000000001', 'Second Manager'),
  ('51000000-0000-4000-8000-000000000002', 'Edit Employee');
insert into public.workspace_memberships (
  id, workspace_id, user_id, role, status, all_locations
) values
  ('52000000-0000-4000-8000-000000000001', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '51000000-0000-4000-8000-000000000001', 'manager', 'active', false),
  ('52000000-0000-4000-8000-000000000002', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '51000000-0000-4000-8000-000000000002', 'employee', 'active', true);
insert into public.membership_location_scopes (membership_id, workspace_id, location_id)
values ('52000000-0000-4000-8000-000000000001', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '11000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5', true);
select throws_ok($$select * from public.schedule_drafts$$, '42501', null, 'authenticated cannot read drafts directly');
select throws_ok($$select * from public.schedule_draft_shifts$$, '42501', null, 'authenticated cannot read draft shifts directly');
select throws_ok($$select * from public.schedule_edit_sessions$$, '42501', null, 'authenticated cannot read edit sessions directly');
select throws_ok($$select * from public.schedule_edit_session_shifts$$, '42501', null, 'authenticated cannot read working shifts directly');

set local role service_role;
create temp table edit_test_state (
  session_id uuid,
  session_revision integer,
  shift_id uuid,
  shift_revision integer,
  draft_id uuid,
  draft_revision integer
);

with acquired as (
  select public.acquire_schedule_edit_session_service(
    'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5',
    '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    current_date - (extract(isodow from current_date)::integer - 1),
    'published', null
  ) result
)
insert into edit_test_state (session_id, session_revision, shift_id, shift_revision)
select (result->'session'->>'id')::uuid, (result->'session'->>'revision')::integer,
  (result->'session'->'shifts'->0->>'id')::uuid,
  (result->'session'->'shifts'->0->>'revision')::integer
from acquired;

select is((select count(*)::integer from edit_test_state), 1, 'owner acquires a published edit session');
select is((select jsonb_array_length(public.get_schedule_edit_session_service(
  'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', session_id)->'shifts')
  from edit_test_state), 7, 'published source copies seven shifts');
select is((public.acquire_schedule_edit_session_service(
  '51000000-0000-4000-8000-000000000001', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  current_date - (extract(isodow from current_date)::integer - 1), 'blank', null
)->>'status'), 'conflict', 'second manager receives a lease conflict');

with mutated as (
  select public.mutate_schedule_edit_shift_service(
    'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    session_id, session_revision, 'create', '53000000-0000-4000-8000-000000000001', null,
    jsonb_build_object(
      'location_id', '11000000-0000-4000-8000-000000000001',
      'employee_id', '15000000-0000-4000-8000-000000000001',
      'job_id', '13000000-0000-4000-8000-000000000001',
      'shift_type_id', '14000000-0000-4000-8000-000000000002',
      'scheduled_date', current_date - (extract(isodow from current_date)::integer - 1) + 2,
      'start_time', '12:00', 'end_time', '16:00',
      'note', 'Created in edit session',
      'conflict_override_note', 'Manager acknowledged schedule warning.'
    ), '54000000-0000-4000-8000-000000000001'
  ) result from edit_test_state
)
update edit_test_state set
  session_revision = (select (result->>'revision')::integer from mutated);

select is((select jsonb_array_length(public.get_schedule_edit_session_service(
  'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', session_id)->'shifts')
  from edit_test_state), 8, 'create adds a working shift');
select ok((select (public.get_schedule_edit_session_service(
  'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', session_id)->>'dirty')::boolean
  from edit_test_state), 'mutation marks the session dirty');

set local role postgres;
select is((select count(*)::integer from public.audit_events where action = 'schedule.soft_conflict_overridden'), 1, 'soft conflict override is audited');
select is((select metadata->>'note' from public.audit_events where action = 'schedule.soft_conflict_overridden' limit 1), 'Manager acknowledged schedule warning.', 'soft conflict override audit uses automatic note');

set local role service_role;
select throws_ok(
  format($$select public.mutate_schedule_edit_shift_service(
    'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    '%s', 1, 'delete', '%s', 1, null, null)$$,
    (select session_id from edit_test_state), (select shift_id from edit_test_state)),
  '40001', 'session revision stale', 'stale session revision is rejected'
);
select throws_ok(
  format($$select public.mutate_schedule_edit_shift_service(
    'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    '%s', %s, 'update', '%s', 99, '{}'::jsonb, null)$$,
    (select session_id from edit_test_state), (select session_revision from edit_test_state),
    (select shift_id from edit_test_state)),
  '23503', 'invalid shift location', 'invalid update payload fails closed before mutation'
);

set local role postgres;
insert into public.document_types(
  id, workspace_id, title, description, required_at_onboarding,
  requires_review, accepted_formats, tracks_expiry, expiry_warning_days,
  expiry_schedule_impact, sort_order, created_by
) values (
  'e9500000-0000-4000-8000-000000000001',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  'Edit session hard blocker', 'Hard Schedule edit conflict fixture',
  true, false, array['pdf'], true, 14, 'block', 400,
  'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'
);
-- A document requirement is only created against a published document
-- type; against a draft, or a type that does not exist, the row is dropped
-- without a word and everything that points at it fails later.
update public.document_types set publication_status='published' where id='e9500000-0000-4000-8000-000000000001';
insert into public.employee_onboarding_cases(
  id, workspace_id, employee_id, membership_id, status,
  submitted_at, approved_at, approved_by
) values (
  'e9500000-0000-4000-8000-000000000002',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  '15000000-0000-4000-8000-000000000001',
  'a6000000-0000-4000-8000-000000000003',
  'approved', now(), now(), 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'
);
insert into public.employee_onboarding_requirements(
  id, workspace_id, case_id, employee_id, kind, source_id, title,
  required, blocks_activation, requires_review, sort_order, status
) values (
  'e9500000-0000-4000-8000-000000000003',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  'e9500000-0000-4000-8000-000000000002',
  '15000000-0000-4000-8000-000000000001',
  'document', 'e9500000-0000-4000-8000-000000000001',
  'Edit session hard blocker', true, true, false, 400, 'completed'
);
insert into public.employee_documents(
  id, workspace_id, employee_id, requirement_id, version_number,
  object_path, original_filename, media_type, size_bytes, review_status,
  expiry_date, uploaded_by
) values (
  'e9500000-0000-4000-8000-000000000004',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  '15000000-0000-4000-8000-000000000001',
  'e9500000-0000-4000-8000-000000000003',
  1,
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/15000000-0000-4000-8000-000000000001/e9500000-0000-4000-8000-000000000003/e9500000-0000-4000-8000-000000000004.pdf',
  'edit-session-hard-blocker.pdf', 'application/pdf', 1024,
  'accepted',
  current_date - (extract(isodow from current_date)::integer - 1) - 1,
  'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'
);

set local role service_role;
select throws_ok(
  format($$select public.mutate_schedule_edit_shift_service(
    'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5',
    '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    '%s', %s, 'create', 'e9500000-0000-4000-8000-000000000005', null,
    jsonb_build_object(
      'location_id', '11000000-0000-4000-8000-000000000001',
      'employee_id', '15000000-0000-4000-8000-000000000001',
      'job_id', '13000000-0000-4000-8000-000000000001',
      'shift_type_id', '14000000-0000-4000-8000-000000000002',
      'scheduled_date', current_date - (extract(isodow from current_date)::integer - 1) + 3,
      'start_time', '02:00', 'end_time', '03:00', 'note', 'Blocked by expired document'
    ), 'e9500000-0000-4000-8000-000000000006')$$,
    (select session_id from edit_test_state),
    (select session_revision from edit_test_state)),
  '23514', 'employee document hard conflict',
  'expired hard-block document prevents assigned shift creation'
);
select is((select count(*)::integer from public.schedule_edit_session_shifts where session_id = (select session_id from edit_test_state)), 8, 'hard document conflict leaves working copy unchanged');

with saved as (
  select public.save_schedule_edit_session_service(
    'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    session_id, session_revision, 'Opening plan', null, null
  ) result from edit_test_state
)
update edit_test_state set draft_id = (select (result->>'id')::uuid from saved),
  draft_revision = (select (result->>'revision')::integer from saved);

select is((select count(*)::integer from public.schedule_drafts where id = (select draft_id from edit_test_state)), 1, 'save creates a named draft');
select is((select count(*)::integer from public.schedule_draft_shifts where draft_id = (select draft_id from edit_test_state)), 8, 'save atomically stores the working snapshot');
select is((select count(*)::integer from public.schedule_published_shifts where workspace_id = '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'), 7, 'draft save does not mutate published shifts');
select throws_ok(
  format($$select public.save_schedule_edit_session_service(
    'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    '%s', %s, 'Opening plan', null, null)$$,
    (select session_id from edit_test_state), (select session_revision from edit_test_state)),
  'PT409', 'edit lease expired', 'closed session cannot save again'
);

select is(jsonb_array_length(public.list_schedule_drafts_service(
  'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  current_date - (extract(isodow from current_date)::integer - 1))->'drafts'), 1, 'draft list returns the saved draft');

with acquired as (
  select public.acquire_schedule_edit_session_service(
    'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    current_date - (extract(isodow from current_date)::integer - 1), 'blank', null
  ) result
)
update edit_test_state set session_id = (select (result->'session'->>'id')::uuid from acquired),
  session_revision = (select (result->'session'->>'revision')::integer from acquired);
select lives_ok(
  format($$select public.discard_schedule_edit_session_service(
    'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '%s')$$,
    (select session_id from edit_test_state)), 'blank session can be discarded'
);
select is((select status::text from public.schedule_edit_sessions where id = (select session_id from edit_test_state)), 'discarded', 'discard closes the lease');

select throws_ok(
  $$select public.acquire_schedule_edit_session_service(
    '51000000-0000-4000-8000-000000000002', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    current_date - (extract(isodow from current_date)::integer - 1), 'blank', null)$$,
  '42501', 'schedule manage access denied', 'employee cannot acquire an edit session'
);
select throws_ok(
  $$select public.mutate_schedule_edit_shift_service(
    '51000000-0000-4000-8000-000000000001', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    gen_random_uuid(), 1, 'create', gen_random_uuid(), null,
    jsonb_build_object('location_id', '11000000-0000-4000-8000-000000000002'), gen_random_uuid())$$,
  'P0002', 'edit session not found', 'non-holder cannot mutate an arbitrary session'
);

select * from finish();
rollback;

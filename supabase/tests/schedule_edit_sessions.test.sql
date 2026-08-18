begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

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
      'start_time', '12:00', 'end_time', '16:00', 'note', 'Created in edit session'
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
  '23503', 'invalid shift reference', 'invalid update payload fails closed before mutation'
);

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
  '40001', 'edit lease expired', 'closed session cannot save again'
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
  '42501', 'schedule manage access required', 'employee cannot acquire an edit session'
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

begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- BL-237: this file used to open an edit session from the real seeded
-- Meyhouse workspace's PUBLISHED week and expect its real data's seven
-- shifts to already be there. current_date's week only matched that real
-- published week on the day it was last published; every day after, the
-- published source came back empty. A throwaway tests.world() that publishes
-- its own seven shifts for this run's own week means this can never rot with
-- real time again.
select tests.world('ses');
select tests.person('ses', 'mgr2', 'manager', array['K'], array['cook']);
select tests.person('ses', 'emp2', 'employee', array['K'], array['cook']);
select tests.person('ses', 'alex', 'employee', array['K'], array['cook']);
select tests.person('ses', 'deniz', 'employee', array['K'], array['cook']);
select tests.person('ses', 'docemp', 'employee', array['K'], array['cook']);
select tests.publish_week('ses', 1, '[
  {"label": "s0", "person": "alex", "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "17:00"},
  {"label": "s1", "person": "deniz", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "17:00"},
  {"label": "s2", "person": "deniz", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "17:00"},
  {"label": "s3", "person": "alex", "loc": "K", "job": "cook", "day": 3, "start": "09:00", "end": "17:00"},
  {"label": "s4", "person": "alex", "loc": "K", "job": "cook", "day": 4, "start": "09:00", "end": "17:00"},
  {"label": "s5", "person": "deniz", "loc": "K", "job": "cook", "day": 5, "start": "09:00", "end": "17:00"},
  {"label": "s6", "person": "alex", "loc": "K", "job": "cook", "day": 6, "start": "09:00", "end": "17:00"}
]');

-- authenticated/service_role have no USAGE on the tests schema, so every id a
-- role-switched statement needs is resolved here first, while still postgres.
create temp table ses_ids as select
  tests.user('ses:owner') owner_id, tests.user('ses:mgr2') mgr2, tests.user('ses:emp2') emp2,
  tests.id('ses') w, tests.id('ses:K') k, tests.id('ses:alex') alex, tests.id('ses:docemp') docemp,
  tests.id('ses:job:cook') job, tests.week(1) week1;
grant select on ses_ids to authenticated, service_role;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select owner_id::text from ses_ids), true);
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
  select public.acquire_schedule_edit_session_service(owner_id, w, week1, 'published', null) result
  from ses_ids
)
insert into edit_test_state (session_id, session_revision, shift_id, shift_revision)
select (result->'session'->>'id')::uuid, (result->'session'->>'revision')::integer,
  (result->'session'->'shifts'->0->>'id')::uuid,
  (result->'session'->'shifts'->0->>'revision')::integer
from acquired;

select is((select count(*)::integer from edit_test_state), 1, 'owner acquires a published edit session');
select is((select jsonb_array_length(public.get_schedule_edit_session_service(owner_id, w, session_id)->'shifts')
  from edit_test_state, ses_ids), 7, 'published source copies seven shifts');
-- A schedule edit locks its draft, not its week (user decision 2026-09-24,
-- FOUNDATION-B 3b): a session opened from the published week or a blank one
-- never blocks another such session, however busy the owner already is with
-- theirs. Only opening the very same *named* draft (schedule_resume_lease,
-- schedule_edit_locks) hands back a lease conflict.
select is((select (public.acquire_schedule_edit_session_service(mgr2, w, week1, 'blank', null)->>'status')
  from ses_ids), 'acquired', 'second manager opens their own blank session alongside it');

with mutated as (
  select public.mutate_schedule_edit_shift_service(
    ids.owner_id, ids.w,
    state.session_id, state.session_revision, 'create', gen_random_uuid(), null,
    jsonb_build_object(
      'location_id', ids.k,
      'employee_id', ids.alex,
      'job_id', ids.job,
      'shift_type_id', null,
      'scheduled_date', ids.week1 + 2,
      'start_time', '12:00', 'end_time', '16:00',
      'note', 'Created in edit session',
      'conflict_override_note', 'Manager acknowledged schedule warning.'
    ), gen_random_uuid()
  ) result from edit_test_state state, ses_ids ids
)
update edit_test_state set
  session_revision = (select (result->>'revision')::integer from mutated);

select is((select jsonb_array_length(public.get_schedule_edit_session_service(owner_id, w, session_id)->'shifts')
  from edit_test_state, ses_ids), 8, 'create adds a working shift');
select ok((select (public.get_schedule_edit_session_service(owner_id, w, session_id)->>'dirty')::boolean
  from edit_test_state, ses_ids), 'mutation marks the session dirty');

set local role postgres;
select is((select count(*)::integer from public.audit_events where action = 'schedule.soft_conflict_overridden' and workspace_id = (select w from ses_ids)), 1, 'soft conflict override is audited');
select is((select metadata->>'note' from public.audit_events where action = 'schedule.soft_conflict_overridden' and workspace_id = (select w from ses_ids) limit 1), 'Manager acknowledged schedule warning.', 'soft conflict override audit uses automatic note');

set local role service_role;
select throws_ok(
  format($$select public.mutate_schedule_edit_shift_service(
    %L, %L, %L, 1, 'delete', %L, 1, null, null)$$,
    (select owner_id from ses_ids), (select w from ses_ids),
    (select session_id from edit_test_state), (select shift_id from edit_test_state)),
  '40001', 'session revision stale', 'stale session revision is rejected'
);
select throws_ok(
  format($$select public.mutate_schedule_edit_shift_service(
    %L, %L, %L, %s, 'update', %L, 99, '{}'::jsonb, null)$$,
    (select owner_id from ses_ids), (select w from ses_ids),
    (select session_id from edit_test_state), (select session_revision from edit_test_state),
    (select shift_id from edit_test_state)),
  '23503', 'invalid shift location', 'invalid update payload fails closed before mutation'
);

set local role postgres;
insert into public.document_types(
  id, workspace_id, title, description, required_at_onboarding,
  requires_review, accepted_formats, tracks_expiry, expiry_warning_days,
  expiry_schedule_impact, sort_order, created_by
)
select gen_random_uuid(), w, 'Edit session hard blocker', 'Hard Schedule edit conflict fixture',
  true, false, array['pdf'], true, 14, 'block', 400, owner_id
from ses_ids;
-- A document requirement is only created against a published document
-- type; against a draft, or a type that does not exist, the row is dropped
-- without a word and everything that points at it fails later.
update public.document_types set publication_status='published' where workspace_id = (select w from ses_ids) and title = 'Edit session hard blocker';
-- tests.person already opened this employee's own onboarding case; reuse it
-- (one case per employee) instead of inserting a second one.
create temp table doc_ids as select
  (select id from public.document_types where workspace_id = w and title = 'Edit session hard blocker') doc_type,
  (select id from public.workspace_memberships where workspace_id = w and user_id = tests.user('ses:docemp')) membership,
  (select id from public.employee_onboarding_cases where employee_id = docemp) case_id, gen_random_uuid() requirement_id,
  gen_random_uuid() document_id
from ses_ids;
update public.employee_onboarding_cases oc
set status = 'approved', submitted_at = now(), approved_at = now(), approved_by = ids.owner_id
from ses_ids ids where oc.id = (select case_id from doc_ids);
insert into public.employee_onboarding_requirements(
  id, workspace_id, case_id, employee_id, kind, source_id, title,
  required, blocks_activation, requires_review, sort_order, status
)
select doc_ids.requirement_id, ids.w, doc_ids.case_id, ids.docemp, 'document', doc_ids.doc_type,
  'Edit session hard blocker', true, true, false, 400, 'completed'
from ses_ids ids, doc_ids;
insert into public.employee_documents(
  id, workspace_id, employee_id, requirement_id, version_number,
  object_path, original_filename, media_type, size_bytes, review_status,
  expiry_date, uploaded_by
)
select doc_ids.document_id, ids.w, ids.docemp, doc_ids.requirement_id, 1,
  ids.w || '/' || ids.docemp || '/' || doc_ids.requirement_id || '/' || doc_ids.document_id || '.pdf',
  'edit-session-hard-blocker.pdf', 'application/pdf', 1024,
  'accepted', ids.week1 - 1, ids.owner_id
from ses_ids ids, doc_ids;

set local role service_role;
select throws_ok(
  format($$select public.mutate_schedule_edit_shift_service(
    %L, %L, %L, %s, 'create', %L, null,
    jsonb_build_object(
      'location_id', %L,
      'employee_id', %L,
      'job_id', %L,
      'shift_type_id', null,
      'scheduled_date', %L::date,
      'start_time', '02:00', 'end_time', '03:00', 'note', 'Blocked by expired document'
    ), %L)$$,
    (select owner_id from ses_ids), (select w from ses_ids),
    (select session_id from edit_test_state), (select session_revision from edit_test_state),
    gen_random_uuid(),
    (select k from ses_ids), (select docemp from ses_ids), (select job from ses_ids), (select (week1 + 3)::text from ses_ids),
    gen_random_uuid()),
  '23514', 'employee document hard conflict',
  'expired hard-block document prevents assigned shift creation'
);
select is((select count(*)::integer from public.schedule_edit_session_shifts where session_id = (select session_id from edit_test_state)), 8, 'hard document conflict leaves working copy unchanged');

with saved as (
  select public.save_schedule_edit_session_service(
    ids.owner_id, ids.w, state.session_id, state.session_revision, 'Opening plan', null, null
  ) result from edit_test_state state, ses_ids ids
)
update edit_test_state set draft_id = (select (result->>'id')::uuid from saved),
  draft_revision = (select (result->>'revision')::integer from saved);

select is((select count(*)::integer from public.schedule_drafts where id = (select draft_id from edit_test_state)), 1, 'save creates a named draft');
select is((select count(*)::integer from public.schedule_draft_shifts where draft_id = (select draft_id from edit_test_state)), 8, 'save atomically stores the working snapshot');
select is((select count(*)::integer from public.schedule_published_shifts where workspace_id = (select w from ses_ids)), 7, 'draft save does not mutate published shifts');
select throws_ok(
  format($$select public.save_schedule_edit_session_service(
    %L, %L, %L, %s, 'Opening plan', null, null)$$,
    (select owner_id from ses_ids), (select w from ses_ids),
    (select session_id from edit_test_state), (select session_revision from edit_test_state)),
  'PT409', 'edit lease expired', 'closed session cannot save again'
);

-- A publish never archives its draft (BL-253), so the week lists two: the
-- draft tests.publish_week published from, and the one saved here.
select is((select jsonb_array_length(public.list_schedule_drafts_service(owner_id, w, week1)->'drafts')
  from ses_ids), 2, 'draft list keeps the published draft beside the saved one');
select is((select count(*)::integer
  from ses_ids, jsonb_array_elements(public.list_schedule_drafts_service(owner_id, w, week1)->'drafts') d
  where d->>'id' = (select draft_id::text from edit_test_state)), 1, 'draft list returns the saved draft');

with acquired as (
  select public.acquire_schedule_edit_session_service(owner_id, w, week1, 'blank', null) result from ses_ids
)
update edit_test_state set session_id = (select (result->'session'->>'id')::uuid from acquired),
  session_revision = (select (result->'session'->>'revision')::integer from acquired);
select lives_ok(
  format($$select public.discard_schedule_edit_session_service(%L, %L, %L)$$,
    (select owner_id from ses_ids), (select w from ses_ids), (select session_id from edit_test_state)),
  'blank session can be discarded'
);
select is((select status::text from public.schedule_edit_sessions where id = (select session_id from edit_test_state)), 'discarded', 'discard closes the lease');

select throws_ok(
  format($$select public.acquire_schedule_edit_session_service(%L, %L, %L, 'blank', null)$$,
    (select emp2 from ses_ids), (select w from ses_ids), (select week1 from ses_ids)),
  '42501', 'Not allowed', 'employee cannot acquire an edit session'
);
-- BL-160: the message alone ('Not allowed') is the same string for every
-- authz.* reason; check the reason itself so a wrong one (say, a document
-- block) could not quietly pass this test too.
create function pg_temp.said(statement text) returns text
language plpgsql as $$
declare code text; reason text; what text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics code = returned_sqlstate, reason = pg_exception_hint, what = pg_exception_detail;
  return concat_ws(' ', code, nullif(reason, ''), nullif(what, ''));
end;
$$;
select is(pg_temp.said(
  format($$select public.acquire_schedule_edit_session_service(%L, %L, %L, 'blank', null)$$,
    (select emp2 from ses_ids), (select w from ses_ids), (select week1 from ses_ids))),
  '42501 authz.missing_permission schedule.edit', 'an employee is refused for missing permission, not some other reason');
select throws_ok(
  format($$select public.mutate_schedule_edit_shift_service(
    %L, %L, gen_random_uuid(), 1, 'create', gen_random_uuid(), null,
    jsonb_build_object('location_id', gen_random_uuid()), gen_random_uuid())$$,
    (select mgr2 from ses_ids), (select w from ses_ids)),
  'P0002', 'edit session not found', 'non-holder cannot mutate an arbitrary session'
);

select * from finish();
rollback;

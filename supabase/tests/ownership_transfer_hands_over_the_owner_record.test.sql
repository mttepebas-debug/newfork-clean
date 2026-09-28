begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- BL-246 (user, 2026-09-28): the person who becomes owner by a transfer is
-- asked for no document from then on, like any owner: their open document
-- obligations are excused when they accept, and a document block lifts.
-- A transfer that is rejected or cancelled changes nothing.

-- What one statement answers: 'allowed', or the refusal as '<sqlstate> <hint>'.
create function pg_temp.refusal(statement text) returns text
language plpgsql as $$
declare
  state text;
  hint text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics state = returned_sqlstate, hint = pg_exception_hint;
  return state || coalesce(' ' || nullif(hint, ''), '');
end;
$$;

select tests.world('ot');
select tests.person('ot', 'deniz', 'admin', array['K'], array['cook']);
select tests.person('ot', 'emre', 'employee', array['K'], array['cook']);

-- A document everybody must hand in; Deniz's deadline has passed.
create temporary table required_document (id uuid, preview jsonb);
insert into required_document (id)
select public.save_document_type_lifecycle_service(tests.user('ot:owner'), tests.id('ot'), null, null, jsonb_build_object(
  'title', 'Food handler card', 'description', 'Card', 'requires_review', true, 'accepted_formats', array['pdf'],
  'tracks_expiry', false, 'expiry_warning_days', 30,
  'lifecycle_settings', jsonb_build_object('mode', 'conditional', 'assignment_scope', 'all_active',
    'target', jsonb_build_object('operator', 'and', 'location_ids', '[]'::jsonb, 'department_ids', '[]'::jsonb,
      'job_ids', '[]'::jsonb, 'employee_ids', '[]'::jsonb),
    'period_days', 7, 'suspend_on_overdue', true, 'extra_fields', '[]'::jsonb)));
update required_document set preview = public.preview_document_publication_service(tests.user('ot:owner'), tests.id('ot'), id);
select public.set_document_publication_service(tests.user('ot:owner'), tests.id('ot'), id,
  (preview ->> 'revision')::integer, (preview ->> 'publication_revision')::integer, preview ->> 'preview_token', 'Publish', 'published')
from required_document;
select tests.settle();
-- ponytail: nothing in the product moves the clock; the deadline is set by hand.
update public.employee_onboarding_requirements set deadline_at = now() - interval '1 day'
where source_id = (select id from required_document) and lifecycle_user_id = tests.user('ot:deniz');

create function pg_temp.deniz_excused() returns boolean language sql as $$
  select r.lifecycle_exempt from public.employee_onboarding_requirements r
  where r.source_id = (select id from required_document) and r.lifecycle_user_id = tests.user('ot:deniz')
$$;
create function pg_temp.pending() returns uuid language sql as $$
  select id from public.workspace_ownership_transfers where workspace_id = tests.id('ot') and status = 'pending'
$$;
create function pg_temp.offer() returns void language sql as $$
  select public.initiate_workspace_ownership_transfer_service(tests.user('ot:owner'), tests.id('ot'), tests.user('ot:deniz'))
$$;
create function pg_temp.respond(person text, action text) returns text language sql as $$
  select pg_temp.refusal(format('select public.respond_workspace_ownership_transfer_service(%L, %L, %L, %L)',
    tests.user(person), tests.id('ot'), pg_temp.pending(), action))
$$;

select ok(app_private.document_actor_blocked(tests.user('ot:deniz'), tests.id('ot')),
  'Deniz, an admin, is blocked by an overdue document');

-- 1. Rejected or cancelled: nothing changes -------------------------------------------

select pg_temp.offer();
select is(pg_temp.respond('ot:deniz', 'reject'), 'allowed', 'Deniz rejects the transfer');
select is(pg_temp.deniz_excused(), false, 'a rejected transfer excuses no document');

select pg_temp.offer();
select public.cancel_workspace_ownership_transfer_service(tests.user('ot:owner'), tests.id('ot'), pg_temp.pending());
select is(pg_temp.deniz_excused(), false, 'nor does a cancelled one');

-- 2. Only the person offered the workspace answers -------------------------------------

select pg_temp.offer();
select is(pg_temp.respond('ot:emre', 'accept'), '42501 transfer.target_required',
  'somebody else cannot accept it');
select is(pg_temp.deniz_excused(), false, 'and excuses nothing by trying');

-- 3. Accepted: the new owner is asked for no document ----------------------------------

select is(pg_temp.respond('ot:deniz', 'accept'), 'allowed', 'Deniz accepts');
select is(pg_temp.deniz_excused(), true, 'her overdue document is excused');
select ok(not app_private.document_actor_blocked(tests.user('ot:deniz'), tests.id('ot')),
  'and the document block lifts');
select is(
  pg_temp.refusal(format('select public.set_employee_document_exemption_service(%L, %L, %L, %s, false, %L)',
    tests.user('ot:deniz'), tests.id('ot'),
    (select r.id from public.employee_onboarding_requirements r
     where r.source_id = (select id from required_document) and r.lifecycle_user_id = tests.user('ot:deniz')),
    (select r.lifecycle_revision from public.employee_onboarding_requirements r
     where r.source_id = (select id from required_document) and r.lifecycle_user_id = tests.user('ot:deniz')),
    'Back to work')),
  '42501',
  'the excuse cannot be taken back, as for any owner'
);

select * from finish();
rollback;

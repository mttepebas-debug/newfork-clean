begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- BL-221, then the decision chain (KARARLAR S-169): the owner's own leave waits like
-- anybody's, and the owner whom nobody else can answer decides it alone, also when
-- the owner misses a required document. "Is this the owner's own request?" asks who
-- the owner is, not whether the owner may set up the workspace (workspace.setup
-- refuses a document-blocked owner).

select tests.world('od');
-- The owner works here too (ROL-CIFT: the employee side needs the employee slot).
select tests.employee_slot('od', 'owner');

-- A document everybody must hand in; the owner's copy is not excused and its
-- deadline has passed.
-- ponytail: an owner's documents arrive excused, and nothing in the product
-- moves the clock; both are set by hand to reach a document-blocked owner.
create temporary table required_document (id uuid, preview jsonb);
insert into required_document (id)
select public.save_document_type_lifecycle_service(tests.user('od:owner'), tests.id('od'), null, null, jsonb_build_object(
  'title', 'Food handler card', 'description', 'Card', 'requires_review', true, 'accepted_formats', array['pdf'],
  'tracks_expiry', false, 'expiry_warning_days', 30,
  'lifecycle_settings', jsonb_build_object('mode', 'conditional', 'assignment_scope', 'all_active',
    'target', jsonb_build_object('operator', 'and', 'location_ids', '[]'::jsonb, 'department_ids', '[]'::jsonb,
      'job_ids', '[]'::jsonb, 'employee_ids', '[]'::jsonb),
    'period_days', 7, 'suspend_on_overdue', true, 'extra_fields', '[]'::jsonb)));
update required_document set preview = public.preview_document_publication_service(tests.user('od:owner'), tests.id('od'), id);
select public.set_document_publication_service(tests.user('od:owner'), tests.id('od'), id,
  (preview ->> 'revision')::integer, (preview ->> 'publication_revision')::integer, preview ->> 'preview_token', 'Publish', 'published')
from required_document;
select tests.settle();
update public.employee_onboarding_requirements
set lifecycle_exempt = false, deadline_at = now() - interval '1 day'
where source_id = (select id from required_document) and lifecycle_user_id = tests.user('od:owner');

select ok(app_private.document_actor_blocked(tests.user('od:owner'), tests.id('od')),
  'the owner misses a required document');

select tests.leave('od', 'owner', 1);

select is(
  (select r.status::text from public.schedule_time_off_requests r where r.id = tests.id('od:owner:time_off')),
  'pending',
  'the owner''s request waits for a decision'
);
select is(
  (public.decide_time_off_service(tests.user('od:owner'), tests.id('od'), tests.id('od:owner:time_off'), 'approve', '',
    app_private.time_off_impact(tests.id('od'), tests.id('od:owner:time_off')) ->> 'fingerprint')) ->> 'status',
  'approved',
  'nobody else can answer it, so the owner approves it, missing document and all'
);
select is(
  (select array_agg(e.action order by e.action) from public.schedule_time_off_events e
   where e.request_id = tests.id('od:owner:time_off') and e.actor_user_id = tests.user('od:owner')),
  array['approved', 'submitted'],
  'filed and approved by the owner'
);

select * from finish();
rollback;

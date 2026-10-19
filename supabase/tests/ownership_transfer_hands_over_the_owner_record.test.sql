begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

-- BL-252/BL-246 (user, 2026-09-28). Accepting an ownership transfer hands
-- over what being the owner means: the new owner works the Owner job and the
-- old owner no longer does; the new owner is asked for no document, like any
-- owner, so what they still owed is excused and a document block lifts.
-- A transfer that is rejected, cancelled or refused changes nothing. It swaps
-- the two management slots and leaves the employee access alone (ROL-CIFT,
-- design §4.12).

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
select tests.person('ot', 'faruk', 'admin', array['K'], array['cook']);
select tests.person('ot', 'gizem', 'admin', array['K'], array['cook']);

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

-- Two more: a policy everybody must sign, with no period; and a permit that
-- is taken down before the transfer and put back up after it.
create function pg_temp.publish_type(title text, settings jsonb) returns uuid language plpgsql as $$
declare
  type_id uuid := public.save_document_type_lifecycle_service(tests.user('ot:owner'), tests.id('ot'), null, null, jsonb_build_object(
    'title', title, 'description', title, 'requires_review', true, 'accepted_formats', array['pdf'],
    'tracks_expiry', false, 'expiry_warning_days', 30, 'lifecycle_settings', settings));
begin
  perform pg_temp.set_publication(type_id, 'published');
  return type_id;
end;
$$;
create function pg_temp.set_publication(type_id uuid, status text) returns void language plpgsql as $$
declare
  preview jsonb := public.preview_document_publication_service(tests.user('ot:owner'), tests.id('ot'), type_id);
begin
  perform public.set_document_publication_service(tests.user('ot:owner'), tests.id('ot'), type_id,
    (preview ->> 'revision')::integer, (preview ->> 'publication_revision')::integer, preview ->> 'preview_token',
    'Publication', status);
end;
$$;
create function pg_temp.settings(mode text, period integer) returns jsonb language sql as $$
  select jsonb_build_object('mode', mode, 'assignment_scope', 'all_active',
    'target', jsonb_build_object('operator', 'and', 'location_ids', '[]'::jsonb, 'department_ids', '[]'::jsonb,
      'job_ids', '[]'::jsonb, 'employee_ids', '[]'::jsonb),
    'period_days', period, 'suspend_on_overdue', period is not null, 'extra_fields', '[]'::jsonb)
$$;
select tests.remember('ot:policy', pg_temp.publish_type('Policy', pg_temp.settings('required', null)));
select tests.remember('ot:permit', pg_temp.publish_type('Permit', pg_temp.settings('conditional', 7)));
select tests.settle();

-- The requirement a person holds for a document type.
create function pg_temp.req(person text, type_id uuid) returns public.employee_onboarding_requirements language sql as $$
  select r from public.employee_onboarding_requirements r
  where r.source_id = type_id and r.employee_id = tests.id(person)
$$;
create function pg_temp.card() returns uuid language sql as $$ select id from required_document $$;

-- The employee handbook, a policy everybody signs, applied to everyone.
create temporary table handbook (retention uuid, template uuid, version uuid, impact jsonb);
insert into handbook (retention) select public.save_signature_retention_policy_service(tests.user('ot:owner'), tests.id('ot'),
  null, 'Policy evidence', 'employment_end', 1095, 'Workspace', 'Internal policy');
select public.approve_signature_retention_policy_service(tests.user('ot:owner'), tests.id('ot'), (select retention from handbook));
update handbook set template = public.save_policy_lifecycle_service(tests.user('ot:owner'), tests.id('ot'), null, jsonb_build_object(
  'title', 'Employee handbook', 'summary', 'Read it', 'content_text', 'Be kind.', 'intent_statement', 'I have read it.',
  'locale', 'en-US', 'effective_date', current_date, 'retention_policy_id', retention,
  'lifecycle_settings', pg_temp.settings('required', 3)));
select public.publish_signature_template_service(tests.user('ot:owner'), tests.id('ot'), (select template from handbook));
update handbook set version = (select v.id from public.signature_template_versions v where v.template_id = handbook.template and v.status = 'published');
update handbook set impact = public.preview_policy_definition_apply_service(tests.user('ot:owner'), tests.id('ot'), version);
select public.apply_policy_definition_service(tests.user('ot:owner'), tests.id('ot'), version,
  (impact ->> 'revision')::integer, impact ->> 'preview_token', 'Everybody signs') from handbook;
select tests.settle();
create function pg_temp.handbook() returns uuid language sql as $$ select version from handbook $$;

-- A reviewer excuses Deniz from the policy by hand, before any transfer.
select public.set_employee_document_exemption_service(tests.user('ot:owner'), tests.id('ot'),
  (pg_temp.req('ot:deniz', tests.id('ot:policy'))).id, (pg_temp.req('ot:deniz', tests.id('ot:policy'))).lifecycle_revision,
  true, 'Signed on paper');

create function pg_temp.deniz_excused() returns boolean language sql as $$
  select r.lifecycle_exempt from public.employee_onboarding_requirements r
  where r.source_id = (select id from required_document) and r.lifecycle_user_id = tests.user('ot:deniz')
$$;
create function pg_temp.works_owner_job(person text) returns boolean language sql as $$
  select exists (select 1 from public.employee_job_assignments a
    join public.jobs j on j.id = a.job_id and j.system_key = 'owner'
    where a.employee_id = tests.id(person) and a.ended_at is null)
$$;
create function pg_temp.pending() returns uuid language sql as $$
  select id from public.workspace_ownership_transfers where workspace_id = tests.id('ot') and status = 'pending'
$$;
create function pg_temp.offer(person text default 'ot:deniz') returns void language sql as $$
  select public.initiate_workspace_ownership_transfer_service(tests.user('ot:owner'), tests.id('ot'), tests.user(person))
$$;
create function pg_temp.cancel() returns void language sql as $$
  select public.cancel_workspace_ownership_transfer_service(tests.user('ot:owner'), tests.id('ot'), pg_temp.pending())
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
select pg_temp.cancel();
select is(pg_temp.deniz_excused(), false, 'nor does a cancelled one');
select ok(pg_temp.works_owner_job('ot:owner') and not pg_temp.works_owner_job('ot:deniz'),
  'and the owner keeps the Owner job');
select ok((pg_temp.req('ot:owner', pg_temp.card())).lifecycle_exempt
    and (pg_temp.req('ot:owner', tests.id('ot:policy'))).lifecycle_exempt
    and (pg_temp.req('ot:owner', pg_temp.handbook())).owner_excused,
  'and stays excused from the documents and the handbook');

-- 2. Only an active admin is offered the workspace ----------------------------------
-- Archiving a record or removing its access, the product's two ways to part a
-- person from their record, both suspend the membership, and neither runs
-- while a transfer is pending. So such an admin is never offered the
-- workspace.

create function pg_temp.offer_answer(person text) returns text language sql as $$
  select pg_temp.refusal(format('select public.initiate_workspace_ownership_transfer_service(%L, %L, %L)',
    tests.user('ot:owner'), tests.id('ot'), tests.user(person)))
$$;

select public.set_employee_archived_service(tests.user('ot:owner'), tests.id('ot'), tests.id('ot:faruk'), true, false);
select is(pg_temp.offer_answer('ot:faruk'), '23514 transfer.target_not_admin',
  'an admin whose record is archived is not offered the workspace');

select public.remove_employee_access_service(tests.user('ot:owner'), tests.id('ot'), tests.id('ot:gizem'));
select is(pg_temp.offer_answer('ot:gizem'), '23514 transfer.target_not_admin',
  'nor is an admin whose access was removed');
select ok(pg_temp.works_owner_job('ot:owner') and not pg_temp.works_owner_job('ot:faruk')
    and not pg_temp.works_owner_job('ot:gizem')
    and not exists (select 1 from public.workspace_ownership_transfers
      where workspace_id = tests.id('ot') and status = 'accepted'),
  'nothing is handed over: the owner keeps the Owner job');

-- 3. Only the person offered the workspace answers -------------------------------------

select pg_temp.offer();
select is(pg_temp.respond('ot:emre', 'accept'), '42501 transfer.target_required',
  'somebody else cannot accept it');
select is(pg_temp.deniz_excused(), false, 'and excuses nothing by trying');

-- 4. Accepted --------------------------------------------------------------------------

select pg_temp.set_publication(tests.id('ot:permit'), 'draft');

-- Deniz hands in her card; it waits for review, with its clock stopped.
select public.save_employee_document_draft_file_service(tests.user('ot:deniz'), (pg_temp.req('ot:deniz', pg_temp.card())).id,
  (pg_temp.req('ot:deniz', pg_temp.card())).lifecycle_revision,
  format('%s/%s/%s/%s.pdf', tests.id('ot'), tests.id('ot:deniz'), (pg_temp.req('ot:deniz', pg_temp.card())).id, gen_random_uuid()),
  'card.pdf', 'application/pdf', 100);
select public.submit_employee_document_lifecycle_service(tests.user('ot:deniz'), (pg_temp.req('ot:deniz', pg_temp.card())).id,
  (pg_temp.req('ot:deniz', pg_temp.card())).lifecycle_revision,
  (select s.id from public.employee_document_submissions s
   where s.requirement_id = (pg_temp.req('ot:deniz', pg_temp.card())).id and s.state = 'draft'),
  current_date + 30, '{}');

select is(pg_temp.respond('ot:deniz', 'accept'), 'allowed', 'Deniz accepts');
select ok(pg_temp.works_owner_job('ot:deniz'), 'Deniz works the Owner job');
select ok(not pg_temp.works_owner_job('ot:owner'), 'the old owner no longer does');
select is(pg_temp.deniz_excused(), true, 'her overdue document is excused');
select ok((select r.deadline_at is null and r.paused_remaining_seconds is null and r.document_suspended_at is null
   from public.employee_onboarding_requirements r where r.id = (pg_temp.req('ot:deniz', pg_temp.card())).id),
  'and no clock is left on it, as with any exemption');
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
  '42501 authz.rank',
  'the excuse cannot be taken back, as for any owner: nobody decides on their own document'
);
select is(
  pg_temp.refusal(format('select public.set_employee_document_exemption_service(%L, %L, %L, %s, false, %L)',
    tests.user('ot:deniz'), tests.id('ot'), (pg_temp.req('ot:deniz', pg_temp.card())).id,
    (pg_temp.req('ot:deniz', pg_temp.card())).lifecycle_revision - 1, 'Back to work')),
  '42501 authz.rank',
  'not even with a stale copy: the core answers before the revision check'
);
select is((select count(*)::integer from public.workspace_ownership_transfers
  where workspace_id = tests.id('ot') and status = 'accepted'), 1, 'one transfer was accepted');
select is((pg_temp.req('ot:deniz', pg_temp.card())).owner_excused, true,
  'her card is excused because she is the owner');
select is(
  (select array_agg(a.metadata ->> 'reason') from public.onboarding_events a
   where a.target_id = (pg_temp.req('ot:deniz', pg_temp.card())).id::text and a.action = 'document.exempted'),
  array['Now the owner'],
  'the excuse is recorded like any exemption, with the transfer as its reason'
);
select ok((pg_temp.req('ot:deniz', tests.id('ot:policy'))).lifecycle_exempt
    and not (pg_temp.req('ot:deniz', tests.id('ot:policy'))).owner_excused,
  'the policy a reviewer excused by hand stays excused by hand');

-- 5. The old owner, now an admin, is asked for the documents everyone is ------------

select is((pg_temp.req('ot:owner', pg_temp.card())).lifecycle_exempt, false,
  'the old owner''s owner excuse from the card is taken back');
select ok((pg_temp.req('ot:owner', pg_temp.card())).deadline_at > now() + interval '6 days',
  'and the card is due a full period from now');
select ok((pg_temp.req('ot:owner', tests.id('ot:policy'))).required
    and (pg_temp.req('ot:owner', tests.id('ot:policy'))).blocks_activation
    and not (pg_temp.req('ot:owner', tests.id('ot:policy'))).lifecycle_exempt,
  'the policy is required again, as it is of everyone');
select ok(not (pg_temp.req('ot:owner', pg_temp.handbook())).lifecycle_exempt
    and (pg_temp.req('ot:owner', pg_temp.handbook())).required
    and (pg_temp.req('ot:owner', pg_temp.handbook())).deadline_at > now() + interval '2 days',
  'the handbook is theirs to sign again, due a full period from now');
select is(
  (select count(*)::integer from public.onboarding_events a
   where a.target_id = (pg_temp.req('ot:owner', pg_temp.handbook())).id::text and a.action = 'document.exemption_removed'),
  1,
  'and that is recorded too'
);
select ok(not app_private.document_actor_blocked(tests.user('ot:owner'), tests.id('ot')),
  'the old owner is not blocked by what they owe again');
select is(
  (select count(*)::integer from public.onboarding_events a
   where a.target_id = (pg_temp.req('ot:owner', pg_temp.card())).id::text and a.action = 'document.exemption_removed'),
  1,
  'taking the excuse back is recorded like removing any exemption'
);

-- The permit was taken down before the transfer: nothing about it changes
-- while it is down, and the excuse is taken back when it is put back up.
select ok((pg_temp.req('ot:owner', tests.id('ot:permit'))).lifecycle_exempt
    and (pg_temp.req('ot:owner', tests.id('ot:permit'))).owner_excused,
  'a document taken down keeps the old owner''s excuse while it is down');
select pg_temp.set_publication(tests.id('ot:permit'), 'published');
select is((pg_temp.req('ot:owner', tests.id('ot:permit'))).lifecycle_exempt, false,
  'and loses it when the document is put back up');
select is((pg_temp.req('ot:deniz', tests.id('ot:permit'))).lifecycle_exempt, true,
  'while the new owner stays excused from it');

-- 6. The management slots swap; the employee access stays (ROL-CIFT 4.2) -----------
-- Ula only manages and the owner also works shifts. Ula's record is archived
-- by hand after the offer (ponytail: no product path parts them while a
-- transfer is pending); taking ownership asks for no employee record.

select tests.world('ou');
select tests.person('ou', 'ula', 'admin', array['K'], array['cook']);
select tests.no_employee_slot('ou', 'ula');
select tests.employee_slot('ou', 'owner');
select public.initiate_workspace_ownership_transfer_service(tests.user('ou:owner'), tests.id('ou'), tests.user('ou:ula'));
update public.employee_profiles set archived_at = now() where id = tests.id('ou:ula');
create function pg_temp.slots(person text) returns text language sql as $$
  select concat_ws(' + ', r.system_key::text, case when m.employee_role_id is not null then 'employee' end)
  from public.workspace_memberships m left join public.workspace_roles r on r.id = m.role_id
  where m.workspace_id = tests.id('ou') and m.user_id = tests.user(person)
$$;
create function pg_temp.management_jobs(person text) returns text[] language sql as $$
  select array_agg(lower(j.name) order by j.name)
  from public.membership_management_jobs held
  join public.workspace_memberships m on m.id = held.membership_id
  join public.jobs j on j.id = held.job_id
  where m.workspace_id = tests.id('ou') and m.user_id = tests.user(person)
$$;
select is(pg_temp.refusal(format('select public.respond_workspace_ownership_transfer_service(%L, %L, %L, ''accept'')',
    tests.user('ou:ula'), tests.id('ou'),
    (select id from public.workspace_ownership_transfers where workspace_id = tests.id('ou') and status = 'pending'))),
  'allowed', 'Ula accepts with no employee record');
select is(pg_temp.slots('ou:ula'), 'owner', 'Ula is the owner and still only manages');
select is(pg_temp.management_jobs('ou:ula'), array['general manager', 'owner'], 'with the Owner job beside the Management job they held');
select is(pg_temp.slots('ou:owner'), 'admin + employee', 'the old owner is an admin and keeps the employee access');
select is(pg_temp.management_jobs('ou:owner'), array['general manager'], 'with a Management job of an admin');
select is((select count(*)::integer from public.workspace_ownership_transfers
  where workspace_id = tests.id('ou') and status = 'accepted'), 1, 'one transfer was accepted there');
select ok(app_private.has_employee_access(tests.id('ou'), tests.user('ou:owner'))
    and not app_private.has_employee_access(tests.id('ou'), tests.user('ou:ula')),
  'the employee side moved for nobody');

select * from finish();
rollback;

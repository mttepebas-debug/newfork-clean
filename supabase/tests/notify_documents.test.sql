begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- BILDIRIM-U5 (KARARLAR S-123, S-95, S-127; docs/plan/research/BILDIRIM-URETICILER.md §2.6): documents write their
-- own notices into the new core.
--   (a) documents asked of people: one notice per person for one go, however many documents;
--   (b) a document sent for review reaches who may review that person now (the core), never by a record;
--       the five-cell probe: an admin made a manager, a reviewer moved off the person's location, a role
--       without review, a reviewer missing a required document, one whose access was removed;
--   (c) the decision tells the person once, and closes every reviewer's card;
--   (d) a document accepted without review tells nobody, not even its sender;
--   (e) the daily check: due dates at 7, 1 and 0 days, expiry at 30, 7 and 1 days (the person and who may
--       review them), access restricted and back; each once;
--   (f) an exemption taken back asks the person again;
--   (g) a handover asks the former owner; (h) access restricted and back on every path, back only when
--       nothing blocks the person; (i) a notice that fails leaves the documents' work standing.

select tests.world('dc');
select tests.world('dx');
select tests.person('dc', 'zeynep', 'admin', array['K'], array['server']);
-- A manager's role without documents: the built-in Manager reads and reviews them since BL-560.
select tests.role('dc', 'no docs manager', 'manager', array(
  select rp.permission_key from public.workspace_role_permissions rp join public.workspace_roles r on r.id = rp.role_id
  where r.workspace_id = tests.id('dc') and r.system_key = 'manager' and rp.permission_key not like 'employee_documents.%'));
select tests.person('dc', 'ayse', 'no docs manager', array['K'], array['cook']);
select tests.person('dc', 'ali', 'employee', array['K'], array['cook']);
select tests.person('dc', 'emre', 'employee', array['K'], array['cook']);
select tests.person('dc', 'dmo', 'admin', array['K'], array['server']);
-- A manager's role that may review documents too; Rev works Kadikoy and Besiktas.
select tests.role('dc', 'reviewing manager', 'manager', array(
  select rp.permission_key from public.workspace_role_permissions rp join public.workspace_roles r on r.id = rp.role_id
  where r.workspace_id = tests.id('dc') and r.system_key = 'manager'
  union select 'employee_documents.review' union select 'employee_documents.read'));
select tests.person('dc', 'rev', 'reviewing manager', array['K', 'B'], array['cook']);
-- A manager's role without document review (custom roles are manager or employee class).
select tests.person('dc', 'lim', 'no docs manager', array['K'], array['cook']);
select tests.person('dc', 'blk', 'admin', array['K'], array['server']);
select tests.person('dc', 'gon', 'admin', array['K'], array['server']);
-- Ext's access comes back when his last block's date is moved out, in (h).
select tests.person('dc', 'ext', 'employee', array['K'], array['cook']);
-- One's card falls past due and is excused before the daily check: never told restricted, so never back, in (h).
select tests.person('dc', 'one', 'employee', array['K'], array['cook']);

create temp table who as select label, tests.user(label) uid
from unnest(array['dc:owner', 'dc:zeynep', 'dc:ayse', 'dc:ali', 'dc:emre', 'dc:dmo', 'dc:rev', 'dc:lim', 'dc:blk', 'dc:gon', 'dx:owner']) label;
create function pg_temp.told(type_key text, subject uuid default null) returns text[] language sql stable as $$
  select coalesce(array_agg(w.label order by w.label collate "C"), '{}')
  from public.person_notifications n join who w on w.uid = n.user_id
  where n.type_key = told.type_key and (subject is null or n.subject_id = subject)
$$;

-- A document everybody is asked for, published by the owner.
create function pg_temp.document(title text, review boolean, expiry boolean) returns uuid language plpgsql as $$
declare made uuid; preview jsonb;
begin
  made := public.save_document_type_lifecycle_service(tests.user('dc:owner'), tests.id('dc'), null, null, jsonb_build_object(
    'title', title, 'description', title, 'requires_review', review, 'accepted_formats', array['pdf'],
    'tracks_expiry', expiry, 'expiry_warning_days', 30,
    'lifecycle_settings', jsonb_build_object('mode', 'conditional', 'assignment_scope', 'all_active',
      'target', jsonb_build_object('operator', 'and', 'location_ids', '[]'::jsonb, 'department_ids', '[]'::jsonb,
        'job_ids', '[]'::jsonb, 'employee_ids', '[]'::jsonb),
      'period_days', 7, 'suspend_on_overdue', true, 'extra_fields', '[]'::jsonb)));
  preview := public.preview_document_publication_service(tests.user('dc:owner'), tests.id('dc'), made);
  perform public.set_document_publication_service(tests.user('dc:owner'), tests.id('dc'), made,
    (preview ->> 'revision')::integer, (preview ->> 'publication_revision')::integer, preview ->> 'preview_token', 'Publish', 'published');
  perform tests.settle();
  return made;
end $$;
create function pg_temp.req(person text, doc uuid) returns public.employee_onboarding_requirements language sql stable as $$
  select r from public.employee_onboarding_requirements r
  where r.source_id = doc and r.employee_id = tests.id('dc:' || person) and r.lifecycle_retired_at is null
$$;
create function pg_temp.send(person text, doc uuid) returns integer language plpgsql as $$
declare r public.employee_onboarding_requirements := pg_temp.req(person, doc);
begin
  perform public.save_employee_document_draft_file_service(tests.user('dc:' || person), r.id, r.lifecycle_revision,
    r.workspace_id || '/' || r.employee_id || '/' || r.id || '/' || gen_random_uuid() || '.pdf', 'card.pdf', 'application/pdf', 100);
  r := pg_temp.req(person, doc);
  return public.submit_employee_document_lifecycle_service(tests.user('dc:' || person), r.id, r.lifecycle_revision,
    (select s.id from public.employee_document_submissions s where s.requirement_id = r.id and s.state = 'draft'),
    current_date + 365, '{}');
end $$;
create function pg_temp.review(reviewer text, person text, doc uuid, decision text) returns integer language plpgsql as $$
declare r public.employee_onboarding_requirements := pg_temp.req(person, doc);
begin
  return public.review_employee_document_lifecycle_service(tests.user('dc:' || reviewer), r.workspace_id, r.id, r.lifecycle_revision,
    r.submitted_document_id, decision, 'Checked', 'full',
    (select jsonb_agg(jsonb_build_object('id', f.file_id, 'decision', 'keep')) from public.employee_document_submission_files f
     where f.submission_id = r.submitted_document_id));
end $$;

-- (a) Asked ----------------------------------------------------------------------------------------------

-- One go, two documents: the food handler card is reviewed and expires; the tip policy is not reviewed.
create temp table docs as select pg_temp.document('Food handler card', true, true) card, pg_temp.document('Tip policy', false, false) policy;
select is(pg_temp.told('documents.requested'),
  array['dc:ali', 'dc:ayse', 'dc:blk', 'dc:dmo', 'dc:emre', 'dc:gon', 'dc:lim', 'dc:rev', 'dc:zeynep'],
  '(a) everybody asked is told once for the two documents; not the owner who published them, not another workspace');
select ok((select bool_and(n.url like '/account/documents?workspace=%') from public.person_notifications n
           where n.type_key = 'documents.requested' and n.workspace_id = tests.id('dc')), '(a) and it opens their documents');

-- The five come to lose the right to review.
select public.update_employee_membership_role_service(tests.user('dc:owner'), tests.id('dc'), tests.id('dc:dmo'),
  tests.id('dc:role:no docs manager'));
select tests.stops_working_at((select m.id from public.workspace_memberships m
  where m.workspace_id = tests.id('dc') and m.user_id = tests.user('dc:rev')), tests.id('dc:K'));
-- ponytail: Blk's deadline is moved into the past by hand; nothing in the product moves the clock.
update public.employee_onboarding_requirements set deadline_at = now() - interval '1 day'
where source_id = (select card from docs) and lifecycle_user_id = tests.user('dc:blk');
-- Every notice so far is in its recipient's choices, read before Gon's access goes (tests.unlisted_notices
-- reads choices now; a person whose access is gone reads none).
create temp table checked as select n.id from public.person_notifications n where n.workspace_id = tests.id('dc');
select is(tests.unlisted_notices(tests.id('dc')), '{}'::text[], 'so far every notice is in its recipient''s choices (BILDIRIM-12)');
select public.remove_employee_access_service(tests.user('dc:owner'), tests.id('dc'), tests.id('dc:gon'));
select is(
  (select array_agg(p || ' ' || coalesce(app_private.authz_reason(tests.user('dc:' || p), tests.id('dc'), 'documents.review', null,
     tests.id('dc:ali')), 'ok') order by p) from unnest(array['zeynep', 'dmo', 'rev', 'lim', 'blk', 'gon']) p),
  array['blk document_blocked', 'dmo missing_permission', 'gon not_active', 'lim missing_permission', 'rev out_of_scope', 'zeynep ok'],
  '(b) the core: Zeynep may review Ali; the five may not');

-- (b) Sent for review -----------------------------------------------------------------------------------

select pg_temp.send('ali', (select card from docs));
select is(pg_temp.told('documents.review_needed'), array['dc:owner', 'dc:zeynep'],
  '(b) Ali''s card reaches the owner and Zeynep, who may review him now; not the five, not Ali, not Ayse who may not');

-- (c) Decided ------------------------------------------------------------------------------------------

select pg_temp.review('owner', 'ali', (select card from docs), 'approve');
select is(pg_temp.told('documents.decided'), array['dc:ali'], '(c) the approval tells Ali once');
select ok((select title = 'Your Food handler card was approved' from public.person_notifications
           where type_key = 'documents.decided' and workspace_id = tests.id('dc')),
  '(c) saying which and how');
select is((select resolution || ' by ' || coalesce((select w.label from who w where w.uid = n.resolved_by), '-')
           from public.person_notifications n where n.type_key = 'documents.review_needed' and n.user_id = tests.user('dc:zeynep')),
  'approved by dc:owner', '(c) Zeynep''s card closes: the owner approved it');
create function pg_temp.asked_card(person text) returns text language sql stable as $$
  select coalesce(n.resolution, 'open') from public.person_notifications n
  where n.type_key = 'documents.requested' and n.user_id = tests.user('dc:' || person)
  order by n.created_at, n.id limit 1
$$;
select is(pg_temp.asked_card('ali'), 'open', '(c) Ali''s "documents to complete" stays open: the tip policy is still asked of him');
-- An exemption while a review waits closes the reviewers' cards (the owner and Zeynep had Ayse's).
select pg_temp.send('ayse', (select card from docs));
select is(pg_temp.told('documents.review_needed', (pg_temp.req('ayse', (select card from docs))).id), array['dc:owner', 'dc:zeynep'],
  '(c) Ayse''s card waits for the owner and Zeynep');
select public.set_employee_document_exemption_service(tests.user('dc:owner'), tests.id('dc'), (pg_temp.req('ayse', (select card from docs))).id,
  (pg_temp.req('ayse', (select card from docs))).lifecycle_revision, true, 'Brought it in person');
select is((select count(*)::integer from public.person_notifications n where n.type_key = 'documents.review_needed'
           and n.subject_id = (pg_temp.req('ayse', (select card from docs))).id and n.resolved_at is null), 0,
  '(c) exempted while it waited: no reviewer''s card stays open');
select pg_temp.send('emre', (select card from docs));
select pg_temp.review('zeynep', 'emre', (select card from docs), 'reject');
select ok((select title = 'Your Food handler card needs a change' from public.person_notifications
           where type_key = 'documents.decided' and user_id = tests.user('dc:emre')), '(c) a decline tells Emre what to change');
select is(pg_temp.told('documents.decided'), array['dc:ali', 'dc:emre'], '(c) one each');

-- (d) Accepted without review ---------------------------------------------------------------------------

select pg_temp.send('ali', (select policy from docs));
select is(pg_temp.told('documents.review_needed', (pg_temp.req('ali', (select policy from docs))).id), '{}'::text[],
  '(d) the tip policy needs no review: nobody is asked');
select is(pg_temp.told('documents.decided', (pg_temp.req('ali', (select policy from docs))).id), '{}'::text[],
  '(d) and Ali is not told of what he did himself');
select is(pg_temp.asked_card('ali'), 'completed', '(d) nothing is asked of Ali now: his "documents to complete" closes');
select is(pg_temp.asked_card('emre'), 'open', '(d) Emre''s stays open: his card needs a change');

-- (e) The daily check -----------------------------------------------------------------------------------

-- ponytail: the check takes the oldest-checked cases first across workspaces; the rest of this database
-- is moved to the back, so this workspace's cases are in the batch.
update public.employee_onboarding_cases set document_notification_checked_at = now() + interval '1 year'
where workspace_id <> tests.id('dc');
create temp table check_time as select (((current_date + 1)::timestamp + time '10:00')
  at time zone app_private.document_employee_timezone(tests.id('dc'), tests.id('dc:emre'))) at_time;
create function pg_temp.check() returns jsonb language sql as $$
  select public.documents_maintain_service(500, (select at_time from check_time))
$$;
-- Emre's tip policy is due in 7 days, then tomorrow; Ali's card expires in 14 days.
update public.employee_onboarding_requirements set deadline_at = (select at_time from check_time) + interval '7 days'
where id = (pg_temp.req('emre', (select policy from docs))).id;
-- ponytail: approved two months ago, so the 30-day warning is not inside the time since approval.
update public.employee_document_submissions set expiry_date = ((select at_time from check_time)
  at time zone app_private.document_employee_timezone(tests.id('dc'), tests.id('dc:ali')))::date + 14,
  reviewed_at = now() - interval '60 days'
where id = (pg_temp.req('ali', (select card from docs))).approved_document_id;
select pg_temp.check();
select pg_temp.check();
select is(pg_temp.told('documents.due_soon', (pg_temp.req('emre', (select policy from docs))).id), array['dc:emre'],
  '(e) Emre''s policy, due in 7 days: told once over two checks (everybody else''s is due soon too, each their own)');
select is(pg_temp.told('documents.expiring'), array['dc:ali', 'dc:owner', 'dc:zeynep'],
  '(e) Ali''s card expires in 14 days: Ali, and who may review him, once');
select is(pg_temp.told('documents.access_changed'), array['dc:blk'], '(e) Blk''s access is restricted: told once');
update public.employee_onboarding_requirements set deadline_at = (select at_time from check_time) + interval '1 day'
where id = (pg_temp.req('emre', (select policy from docs))).id;
select pg_temp.check();
select is(pg_temp.told('documents.due_soon', (pg_temp.req('emre', (select policy from docs))).id), array['dc:emre', 'dc:emre'],
  '(e) due tomorrow: once more');
-- A new card waiting for review: no "upload the new one" for the old one's expiry.
select pg_temp.send('ali', (select card from docs));
update public.employee_document_submissions set expiry_date = ((select at_time from check_time)
  at time zone app_private.document_employee_timezone(tests.id('dc'), tests.id('dc:ali')))::date + 5
where id = (pg_temp.req('ali', (select card from docs))).approved_document_id;
select pg_temp.check();
select is(pg_temp.told('documents.expiring'), array['dc:ali', 'dc:owner', 'dc:zeynep'],
  '(e) Ali''s card expires in 5 days but the new one waits for review: no new warning');
-- The restriction is the suspension itself, not the last notice: gone after the 90 days, it is not told again.
delete from public.person_notifications where type_key = 'documents.access_changed' and workspace_id = tests.id('dc');
select pg_temp.check();
select is(pg_temp.told('documents.access_changed'), '{}'::text[], '(e) still restricted, its notice purged: not told again');
-- Blk is excused from the card: the restriction lifts, and Blk hears it.
select public.set_employee_document_exemption_service(tests.user('dc:owner'), tests.id('dc'), (pg_temp.req('blk', (select card from docs))).id,
  (pg_temp.req('blk', (select card from docs))).lifecycle_revision, true, 'Brought it in person');
select is(pg_temp.told('documents.access_changed'), array['dc:blk'], '(e) and told that access is back');
select is((select n.data ->> 'state' from public.person_notifications n
           where n.type_key = 'documents.access_changed' and n.workspace_id = tests.id('dc')), 'restored', '(e) saying so');

-- (f) An exemption taken back ---------------------------------------------------------------------------

select public.set_employee_document_exemption_service(tests.user('dc:owner'), tests.id('dc'), (pg_temp.req('emre', (select card from docs))).id,
  (pg_temp.req('emre', (select card from docs))).lifecycle_revision, true, 'Has one from last job');
select public.set_employee_document_exemption_service(tests.user('dc:owner'), tests.id('dc'), (pg_temp.req('emre', (select card from docs))).id,
  (pg_temp.req('emre', (select card from docs))).lifecycle_revision, false, 'Needs a new one');
select is((select count(*)::integer from public.person_notifications where type_key = 'documents.requested' and user_id = tests.user('dc:emre')), 2,
  '(f) the exemption taken back asks Emre again');

-- (h) Access, on every path --------------------------------------------------------------------------
-- Whoever is restricted hears it, and hears when it lifts, however the suspension comes and goes: a
-- document type taken down (Dmo), a document sent just after its due date and then approved (Lim).

create function pg_temp.access_told(person text) returns text[] language sql stable as $$
  select coalesce(array_agg(n.data ->> 'state' order by n.data ->> 'state'), '{}') from public.person_notifications n
  where n.type_key = 'documents.access_changed' and n.user_id = tests.user('dc:' || person)
$$;
create temp table allergen as select pg_temp.document('Allergen sheet', true, false) id;
-- ponytail: Dmo's deadline is moved into the past by hand; nothing in the product moves the clock.
update public.employee_onboarding_requirements set deadline_at = now() - interval '1 day'
where source_id = (select id from allergen) and lifecycle_user_id = tests.user('dc:dmo');
select pg_temp.check();
select is(pg_temp.access_told('dmo'), array['restricted'], '(h) Dmo is restricted and told');
create temp table allergen_down as select public.preview_document_publication_service(tests.user('dc:owner'), tests.id('dc'), id) preview
from allergen;
select public.set_document_publication_service(tests.user('dc:owner'), tests.id('dc'), (select id from allergen),
  (preview ->> 'revision')::integer, (preview ->> 'publication_revision')::integer, preview ->> 'preview_token', 'Unpublish', 'draft')
from allergen_down;
select is(pg_temp.access_told('dmo'), array['restored', 'restricted'], '(h) the allergen sheet taken down: Dmo hears access is back');

-- ponytail: Lim's card fell due a moment ago; he sends it before the daily check runs.
update public.employee_onboarding_requirements set deadline_at = now() - interval '30 seconds'
where source_id = (select card from docs) and lifecycle_user_id = tests.user('dc:lim');
select pg_temp.send('lim', (select card from docs));
select pg_temp.review('zeynep', 'lim', (select card from docs), 'approve');
select is(pg_temp.access_told('lim'), array['restored', 'restricted'],
  '(h) Lim, restricted the moment he sent it late, hears both: restricted, then back on approval');

-- Back only when nothing blocks the person any more: Dmo's card is suspended, his tip policy is past due
-- but not yet suspended; the card is excused, the policy still blocks him.
-- ponytail: this file is one transaction, so its keys (the instant, the transaction) are the same as for
-- Dmo's first pair; that pair is cleared so the next is not taken for it.
delete from public.person_notifications where type_key = 'documents.access_changed' and user_id = tests.user('dc:dmo');
update public.employee_onboarding_requirements set deadline_at = now() - interval '1 day'
where source_id = (select card from docs) and lifecycle_user_id = tests.user('dc:dmo');
select pg_temp.check();
select is(pg_temp.access_told('dmo'), array['restricted'], '(h) Dmo''s card suspends him again: told');
update public.employee_onboarding_requirements set deadline_at = now() - interval '1 day'
where source_id = (select policy from docs) and lifecycle_user_id = tests.user('dc:dmo');
select public.set_employee_document_exemption_service(tests.user('dc:owner'), tests.id('dc'), (pg_temp.req('dmo', (select card from docs))).id,
  (pg_temp.req('dmo', (select card from docs))).lifecycle_revision, true, 'Brought it in person');
select ok(app_private.document_actor_blocked(tests.user('dc:dmo'), tests.id('dc')), '(h) his past-due policy still blocks Dmo');
select is(pg_temp.access_told('dmo'), array['restricted'],
  '(h) so the card excused does not tell him his access is back');
-- The policy, never suspended, is excused too: nothing blocks Dmo now, and he hears it.
select public.set_employee_document_exemption_service(tests.user('dc:owner'), tests.id('dc'), (pg_temp.req('dmo', (select policy from docs))).id,
  (pg_temp.req('dmo', (select policy from docs))).lifecycle_revision, true, 'Signed on paper');
select ok(not app_private.document_actor_blocked(tests.user('dc:dmo'), tests.id('dc')), '(h) nothing blocks Dmo now');
select is(pg_temp.access_told('dmo'), array['restored', 'restricted'],
  '(h) the last block lifted without a suspension of its own still tells him his access is back');
-- The same when the last block's type is taken down: Ext's card is suspended, his policy past due; the
-- card is excused, then the tip policy is unpublished. (A deadline cannot be extended once it has passed
-- or while the person is blocked, so an extension never lifts a block.)
update public.employee_onboarding_requirements set deadline_at = now() - interval '1 day'
where source_id = (select card from docs) and lifecycle_user_id = tests.user('dc:ext');
select pg_temp.check();
update public.employee_onboarding_requirements set deadline_at = now() - interval '1 day'
where source_id = (select policy from docs) and lifecycle_user_id = tests.user('dc:ext');
select public.set_employee_document_exemption_service(tests.user('dc:owner'), tests.id('dc'), (pg_temp.req('ext', (select card from docs))).id,
  (pg_temp.req('ext', (select card from docs))).lifecycle_revision, true, 'Brought it in person');
select is(pg_temp.access_told('ext'), array['restricted'], '(h) Ext is restricted, and still blocked by his policy');
create temp table policy_down as select public.preview_document_publication_service(tests.user('dc:owner'), tests.id('dc'), policy) preview
from docs;
select public.set_document_publication_service(tests.user('dc:owner'), tests.id('dc'), (select policy from docs),
  (preview ->> 'revision')::integer, (preview ->> 'publication_revision')::integer, preview ->> 'preview_token', 'Unpublish', 'draft')
from policy_down;
select is(pg_temp.access_told('ext'), array['restored', 'restricted'], '(h) the tip policy taken down: Ext hears his access is back');
-- "Back" only after "restricted": One's card is past due, never suspended, and excused before anyone told him.
update public.employee_onboarding_requirements set deadline_at = now() - interval '1 day'
where source_id = (select card from docs) and lifecycle_user_id = tests.user('dc:one');
select public.set_employee_document_exemption_service(tests.user('dc:owner'), tests.id('dc'), (pg_temp.req('one', (select card from docs))).id,
  (pg_temp.req('one', (select card from docs))).lifecycle_revision, true, 'Brought it in person');
select is(pg_temp.access_told('one'), '{}'::text[], '(h) One was never told restricted, so he is not told his access is back');

-- (g) The owner hands the workspace over -------------------------------------------------------------
-- The documents the owner was excused from are asked of them now.

create temp table handover as select (public.initiate_workspace_ownership_transfer_service(tests.user('dc:owner'), tests.id('dc'),
  tests.user('dc:zeynep')) ->> 'transfer_id')::uuid id;
select public.respond_workspace_ownership_transfer_service(tests.user('dc:zeynep'), tests.id('dc'), (select id from handover), 'accept');
select is((select count(*)::integer from public.person_notifications where type_key = 'documents.requested' and user_id = tests.user('dc:owner')), 1,
  '(g) the former owner is asked for the documents they were excused from');

-- (i) The documents' work outlives a notice that fails ---------------------------------------------------
-- A notice that cannot be written leaves the document event and the restriction standing (the same rule
-- as domain_work_outlives_notifications): logged, never rolled back.

create temp table core_notify as select pg_get_functiondef('app_private.notify_rows(uuid, uuid, jsonb)'::regprocedure) def;
create or replace function app_private.notify_rows(target_workspace uuid, target_actor uuid, target_rows jsonb)
returns integer language plpgsql set search_path = '' as $$ begin raise exception 'notices are down'; end $$;
select lives_ok($$ select pg_temp.document('Knife safety', false, false) $$,
  '(i) a document published while notices fail is published');
select is((select count(*)::integer from public.employee_onboarding_requirements r join public.workspaces w on w.id = r.workspace_id
           where r.workspace_id = tests.id('dc') and r.title = 'Knife safety' and r.lifecycle_retired_at is null) > 0, true,
  '(i) and asked of the team');
update public.employee_onboarding_requirements set deadline_at = now() - interval '1 day'
where title = 'Knife safety' and workspace_id = tests.id('dc') and lifecycle_user_id = tests.user('dc:ali');
select lives_ok($$ select pg_temp.check() $$, '(i) the daily check runs while notices fail');
select ok((select document_suspended_at is not null from public.employee_onboarding_requirements
           where title = 'Knife safety' and workspace_id = tests.id('dc') and lifecycle_user_id = tests.user('dc:ali')),
  '(i) and Ali''s overdue knife safety sheet is suspended all the same');
select is(pg_temp.access_told('ali'), '{}'::text[], '(i) his notice is lost, not the restriction');
do $$ begin execute (select def from core_notify); end $$;

select is((select count(*)::integer from public.person_notifications where workspace_id = tests.id('dx')), 0,
  'another workspace hears nothing of this one');
select is(tests.unlisted_notices(tests.id('dc'), array(select id from checked)), '{}'::text[],
  'every notice written since is in its recipient''s choices (BILDIRIM-12)');

select * from finish();
rollback;

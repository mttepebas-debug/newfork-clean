begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Bildirim paneli slice 2 (KARARLAR S-247 (3), Mert 2026-10-23): every person's notice is their own. When
-- what a document card asks for is done, the card says how and who did it; it is never deleted; read is per
-- person, and only the one who did it has their own card read.
--   (a) the person's "due" card closes when they hand the document in: accepted without review ->
--       completed, waiting for review -> submitted, a policy signed -> acknowledged;
--   (b) a decline closes only the reviewers' cards: the person's own due card is not "declined", they
--       upload again;
--   (c) "Your access is back" is news written in the same transaction that lifts the block: it is not
--       closed at birth with the person's "documents to complete";
--   (d) due again sooner (7, 1, 0 days), the newer card takes over: the earlier open one is superseded.

select tests.world('nd');
select tests.person('nd', 'zeynep', 'admin', array['K'], array['server']);
select tests.person('nd', 'ali', 'employee', array['K'], array['cook']);
select tests.person('nd', 'emre', 'employee', array['K'], array['cook']);
select tests.person('nd', 'ayse', 'employee', array['K'], array['cook']);
select tests.person('nd', 'deniz', 'employee', array['K'], array['cook']);
select tests.person('nd', 'can', 'employee', array['K'], array['cook']);

create temp table who as select p label, tests.user('nd:' || p) uid
from unnest(array['owner', 'zeynep', 'ali', 'emre', 'ayse', 'deniz', 'can']) p;

-- Every card of one kind about one thing, one line each: who, due in, state, outcome, by whom, read, seen.
create function pg_temp.cards(kind text, subject uuid) returns text[] language sql stable as $$
  select coalesce(array_agg(concat_ws(' ', w.label,
      'due in ' || (n.data ->> 'days_left'),
      n.data ->> 'state',
      coalesce(n.resolution, 'open'),
      case when n.resolved_at is not null then 'by ' || coalesce((select v.label from who v where v.uid = n.resolved_by), 'nobody') end,
      case when n.read_at is null then 'unread' else 'read' end,
      case when n.seen_at is null then 'unseen' else 'seen' end)
    order by w.label collate "C", (n.data ->> 'days_left')::integer desc nulls last, n.event_key collate "C"), '{}')
  from public.person_notifications n join who w on w.uid = n.user_id
  where n.type_key = kind and n.subject_id = subject
$$;

-- A document everybody is asked for, published by the owner.
create function pg_temp.document(title text, review boolean) returns uuid language plpgsql as $$
declare made uuid; preview jsonb;
begin
  made := public.save_document_type_lifecycle_service(tests.user('nd:owner'), tests.id('nd'), null, null, jsonb_build_object(
    'title', title, 'description', title, 'requires_review', review, 'accepted_formats', array['pdf'],
    'tracks_expiry', false, 'expiry_warning_days', 30,
    'lifecycle_settings', jsonb_build_object('mode', 'conditional', 'assignment_scope', 'all_active',
      'target', jsonb_build_object('operator', 'and', 'location_ids', '[]'::jsonb, 'department_ids', '[]'::jsonb,
        'job_ids', '[]'::jsonb, 'employee_ids', '[]'::jsonb),
      'period_days', 7, 'suspend_on_overdue', true, 'extra_fields', '[]'::jsonb)));
  preview := public.preview_document_publication_service(tests.user('nd:owner'), tests.id('nd'), made);
  perform public.set_document_publication_service(tests.user('nd:owner'), tests.id('nd'), made,
    (preview ->> 'revision')::integer, (preview ->> 'publication_revision')::integer, preview ->> 'preview_token', 'Publish', 'published');
  perform tests.settle();
  return made;
end $$;
-- A policy everybody signs, applied by the owner.
create function pg_temp.policy(title text) returns uuid language plpgsql as $$
declare retention uuid; template uuid; version uuid; impact jsonb;
begin
  retention := public.save_signature_retention_policy_service(tests.user('nd:owner'), tests.id('nd'), null,
    'Policy evidence', 'employment_end', 1095, 'Workspace', 'Internal policy');
  perform public.approve_signature_retention_policy_service(tests.user('nd:owner'), tests.id('nd'), retention);
  template := public.save_policy_lifecycle_service(tests.user('nd:owner'), tests.id('nd'), null, jsonb_build_object(
    'title', title, 'summary', 'Read this policy', 'content_text', 'Wash your hands before every shift.',
    'intent_statement', 'I have read this policy.', 'locale', 'en-US', 'effective_date', '2026-09-15',
    'retention_policy_id', retention, 'lifecycle_settings', jsonb_build_object('mode', 'required',
      'target', jsonb_build_object('operator', 'and', 'location_ids', '[]'::jsonb, 'department_ids', '[]'::jsonb,
        'job_ids', '[]'::jsonb, 'employee_ids', '[]'::jsonb),
      'assignment_scope', 'all_active', 'period_days', 3, 'suspend_on_overdue', true, 'extra_fields', '[]'::jsonb)));
  perform public.publish_signature_template_service(tests.user('nd:owner'), tests.id('nd'), template);
  select v.id into version from public.signature_template_versions v where v.template_id = template and v.status = 'published';
  impact := public.preview_policy_definition_apply_service(tests.user('nd:owner'), tests.id('nd'), version);
  perform public.apply_policy_definition_service(tests.user('nd:owner'), tests.id('nd'), version,
    (impact ->> 'revision')::integer, impact ->> 'preview_token', 'Everybody signs the hygiene policy');
  perform tests.settle();
  return version;
end $$;
create function pg_temp.req(person text, source uuid) returns public.employee_onboarding_requirements language sql stable as $$
  select r from public.employee_onboarding_requirements r
  where r.source_id = source and r.employee_id = tests.id('nd:' || person) and r.lifecycle_retired_at is null
$$;
create function pg_temp.send(person text, doc uuid) returns integer language plpgsql as $$
declare r public.employee_onboarding_requirements := pg_temp.req(person, doc);
begin
  perform public.save_employee_document_draft_file_service(tests.user('nd:' || person), r.id, r.lifecycle_revision,
    r.workspace_id || '/' || r.employee_id || '/' || r.id || '/' || gen_random_uuid() || '.pdf', 'card.pdf', 'application/pdf', 100);
  r := pg_temp.req(person, doc);
  return public.submit_employee_document_lifecycle_service(tests.user('nd:' || person), r.id, r.lifecycle_revision,
    (select s.id from public.employee_document_submissions s where s.requirement_id = r.id and s.state = 'draft'),
    null, '{}');
end $$;
create function pg_temp.review(reviewer text, person text, doc uuid, decision text) returns integer language plpgsql as $$
declare r public.employee_onboarding_requirements := pg_temp.req(person, doc);
begin
  return public.review_employee_document_lifecycle_service(tests.user('nd:' || reviewer), r.workspace_id, r.id, r.lifecycle_revision,
    r.submitted_document_id, decision, 'The photo is blurry', 'full',
    (select jsonb_agg(jsonb_build_object('id', f.file_id, 'decision', 'keep')) from public.employee_document_submission_files f
     where f.submission_id = r.submitted_document_id));
end $$;
create function pg_temp.sign(person text, version uuid) returns integer language plpgsql as $$
declare r public.employee_onboarding_requirements := pg_temp.req(person, version);
begin
  return public.acknowledge_document_lifecycle_service(tests.user('nd:' || person), r.workspace_id, r.id, r.lifecycle_revision,
    (select concat_ws(' ', e.first_name, e.last_name) from public.employee_profiles e where e.id = r.employee_id),
    (select v.content_digest from public.signature_template_versions v where v.id = version), now(), gen_random_uuid());
end $$;

-- The daily check, tomorrow at 10:00 in the person's time zone, for one person.
create temp table check_time as select (((current_date + 1)::timestamp + time '10:00')
  at time zone app_private.document_employee_timezone(tests.id('nd'), tests.id('nd:ali'))) at_time;
create function pg_temp.check(person text) returns integer language sql as $$
  select app_private.document_check_case(c.id, (select at_time from check_time))
  from public.employee_onboarding_cases c where c.employee_id = tests.id('nd:' || person)
$$;
-- ponytail: due dates are moved by hand, a whole number of days after the check; nothing moves the clock.
create function pg_temp.due_in(person text, source uuid, days integer) returns void language sql as $$
  update public.employee_onboarding_requirements set deadline_at = (select at_time from check_time) + make_interval(days => days)
  where id = (pg_temp.req(person, source)).id
$$;

create temp table docs as select pg_temp.document('Food handler card', true) card, pg_temp.document('Allergen sheet', false) sheet,
  pg_temp.policy('Hygiene policy') hygiene;
create temp table subject as select
  (pg_temp.req('ali', (select card from docs))).id ali_card,
  (pg_temp.req('emre', (select sheet from docs))).id emre_sheet,
  (pg_temp.req('ayse', (select hygiene from docs))).id ayse_hygiene,
  (pg_temp.req('deniz', (select card from docs))).id deniz_card,
  (pg_temp.req('deniz', (select sheet from docs))).id deniz_sheet,
  (pg_temp.req('can', (select card from docs))).id can_card;

-- (a) Handed in: sent for review ----------------------------------------------------------------------------

select pg_temp.due_in('ali', (select card from docs), 7);
select pg_temp.check('ali');
select is(pg_temp.cards('documents.due_soon', (select ali_card from subject)), array['ali due in 7 open unread unseen'],
  '(a) the daily check tells Ali his food handler card is due in 7 days');
select pg_temp.send('ali', (select card from docs));
select is(pg_temp.cards('documents.due_soon', (select ali_card from subject)), array['ali due in 7 submitted by ali read seen'],
  '(a) Ali sends it for review: his due card says submitted, by him, and is read for him');
select is(pg_temp.cards('documents.review_needed', (select ali_card from subject)),
  array['owner open unread unseen', 'zeynep open unread unseen'],
  '(a) the owner''s and Zeynep''s review cards wait for the decision');

-- (b) Declined: only the reviewers' cards close ---------------------------------------------------------------

-- ponytail: a due card left open from before this change (Ali sent his card before it shipped), written by hand.
select app_private.notify('documents.due_soon', tests.id('nd'), array[tests.user('nd:ali')],
  'doc_due:' || (select ali_card from subject) || ':before', 'Due tomorrow: Food handler card', null,
  '/account/documents?workspace=' || tests.id('nd'), null, 'document_requirement', (select ali_card from subject),
  jsonb_build_object('requirement_id', (select ali_card from subject), 'days_left', 1));
create temp table owner_signals as select count(*) n from realtime.messages m
where m.topic = 'notifications:' || tests.user('nd:owner');
select pg_temp.review('zeynep', 'ali', (select card from docs), 'reject');
select is(pg_temp.cards('documents.review_needed', (select ali_card from subject)),
  array['owner declined by zeynep unread unseen', 'zeynep declined by zeynep read seen'],
  '(b) Zeynep declines: both review cards say so; hers is read, the owner''s stays unread');
select is(pg_temp.cards('documents.due_soon', (select ali_card from subject)),
  array['ali due in 7 submitted by ali read seen', 'ali due in 1 open unread unseen'],
  '(b) Ali''s due cards are not declined: he uploads again');
select is((select count(*) from realtime.messages m where m.topic = 'notifications:' || tests.user('nd:owner')) - (select n from owner_signals),
  1::bigint, '(b) the owner''s list hears the change once');
select pg_temp.send('ali', (select card from docs));
select is(pg_temp.cards('documents.due_soon', (select ali_card from subject)),
  array['ali due in 7 submitted by ali read seen', 'ali due in 1 submitted by ali read seen'],
  '(a) Ali uploads again: the card still open closes, submitted by him');

-- (a) Handed in: accepted without review, a policy signed ----------------------------------------------------

select pg_temp.due_in('emre', (select sheet from docs), 7);
select pg_temp.check('emre');
select pg_temp.send('emre', (select sheet from docs));
select is(pg_temp.cards('documents.due_soon', (select emre_sheet from subject)), array['emre due in 7 completed by emre read seen'],
  '(a) Emre''s allergen sheet needs no review: his due card says completed, by him');
select is(pg_temp.cards('documents.review_needed', (select emre_sheet from subject)), '{}'::text[],
  '(a) and nobody is asked to review it');

select pg_temp.due_in('ayse', (select hygiene from docs), 7);
select pg_temp.check('ayse');
select pg_temp.sign('ayse', (select hygiene from docs));
select is(pg_temp.cards('documents.due_soon', (select ayse_hygiene from subject)), array['ayse due in 7 acknowledged by ayse read seen'],
  '(a) Ayse signs the hygiene policy: her due card says acknowledged, by her');

-- (d) Due again sooner: the newer card takes over -------------------------------------------------------------

select pg_temp.due_in('deniz', (select card from docs), 7);
select pg_temp.due_in('deniz', (select sheet from docs), 7);
select pg_temp.check('deniz');
-- Deniz reads the 7-day card; superseding it leaves that as it is.
select public.mark_notifications_read_service(tests.user('nd:deniz'), tests.id('nd'), array(
  select n.id from public.person_notifications n where n.type_key = 'documents.due_soon' and n.subject_id = (select deniz_card from subject)));
select pg_temp.due_in('deniz', (select card from docs), 1);
select pg_temp.check('deniz');
select pg_temp.check('deniz');
select is(pg_temp.cards('documents.due_soon', (select deniz_card from subject)),
  array['deniz due in 7 superseded by nobody read seen', 'deniz due in 1 open unread unseen'],
  '(d) due tomorrow: the 1-day card takes over, the 7-day one is superseded by the check and stays read');
select is(pg_temp.cards('documents.due_soon', (select deniz_sheet from subject)), array['deniz due in 7 open unread unseen'],
  '(d) his allergen sheet''s card is another document''s: it stays open');
select pg_temp.due_in('deniz', (select card from docs), 0);
select pg_temp.check('deniz');
select is(pg_temp.cards('documents.due_soon', (select deniz_card from subject)),
  array['deniz due in 7 superseded by nobody read seen', 'deniz due in 1 superseded by nobody unread unseen',
        'deniz due in 0 open unread unseen'],
  '(d) due today: one open card, the earlier ones superseded and kept');

-- (c) Access back is news: closed at birth by nobody, left unread ----------------------------------------------------------------

-- Can has signed the hygiene policy and sent the allergen sheet; only his food handler card is left.
select pg_temp.sign('can', (select hygiene from docs));
select pg_temp.send('can', (select sheet from docs));
-- ponytail: the card fell past due and the daily check suspended it (document_suspend_overdue, Can's row only).
update public.employee_onboarding_requirements set deadline_at = now() - interval '1 day', document_suspended_at = now()
where id = (select can_card from subject);
-- ponytail: Can was told he was restricted yesterday, in an earlier transaction than the one that lifts it.
update public.person_notifications set created_at = now() - interval '1 day'
where type_key = 'documents.access_changed' and user_id = tests.user('nd:can');
select is(pg_temp.cards('documents.access_changed', tests.id('nd:can')), array['can restricted open unread unseen'],
  '(c) Can is restricted and told');
select public.set_employee_document_exemption_service(tests.user('nd:owner'), tests.id('nd'), (select can_card from subject),
  (select r.lifecycle_revision from public.employee_onboarding_requirements r where r.id = (select can_card from subject)),
  true, 'Brought it in person');
select is(pg_temp.cards('documents.access_changed', tests.id('nd:can')),
  array['can restored restored by nobody unread unseen', 'can restricted completed by owner unread unseen'],
  '(c) the owner excuses the card: "restricted" closes, completed by the owner; "your access is back" asks nothing (restored, by nobody) and stays to be read');
select is(pg_temp.cards('documents.requested', tests.id('nd:can')), array['can completed by owner unread unseen'],
  '(c) nothing is asked of Can now: his "documents to complete" closes, by the owner');

select * from finish();
rollback;

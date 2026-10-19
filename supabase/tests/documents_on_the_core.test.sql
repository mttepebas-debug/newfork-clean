begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- Documents ask the authorization core (FB-6.6, D1-D6). Employees > a person >
-- Documents: who reads, approves, rejects, exempts or extends somebody's
-- document, and what the employee and the owner do with their own.
--   D1 nobody decides on their own document, a peer's, or a higher rank's:
--      an employee's goes to a manager where they work, an admin or the owner;
--      a manager's to an admin or the owner; an admin's to the owner only.
--   D2 one decision on a person who works at two locations is the decision.
--   D3 a restricted manager (a document overdue, onboarding not finished)
--      neither reads nor decides on somebody else's document.
--   D4 (somebody still finishing onboarding opens their own notifications) went with them, BILDIRIM-06.
--   D5 the owner's own upload is on file at once, in nobody's queue.
--   D6 a draft definition asks nothing of anybody, the policy path included;
--      starting onboarding filters a draft out before any gate.

select tests.world('m');
select tests.world('x');
-- Managers who read and review documents, as the default manager role does (BL-560), and more.
select tests.role('m', 'doc manager', 'manager', array(
  select rp.permission_key
  from public.workspace_role_permissions rp
  join public.workspace_roles r on r.id = rp.role_id
  where r.workspace_id = tests.id('m') and r.system_key = 'manager'
  union select unnest(array['documents.read', 'employee_documents.read', 'employee_documents.review',
    -- the permission that used to approve legal names: it no longer does (S1)
    'employees.private.read', 'employees.private.manage'])
));
-- A manager who reads documents and reviews onboarding, but decides on no document.
select tests.role('m', 'doc reader', 'manager', array(
  select rp.permission_key
  from public.workspace_role_permissions rp
  join public.workspace_roles r on r.id = rp.role_id
  where r.workspace_id = tests.id('m') and r.system_key = 'manager'
    and rp.permission_key <> 'employee_documents.review'
  union select unnest(array['documents.read', 'employee_documents.read'])
));
select tests.person('m', 'zeynep', 'admin', array['K'], array['server']);
select tests.person('m', 'lale', 'doc reader', array['K'], array['cook']);
select tests.person('m', 'kaan', 'admin', array['B'], array['server']);
select tests.person('m', 'ayse', 'doc manager', array['K'], array['cook']);
select tests.person('m', 'deniz', 'doc manager', array['K'], array['cook']);
select tests.person('m', 'mehmet', 'doc manager', array['B'], array['cook']);
select tests.person('m', 'hande', 'doc manager', array['K'], array['cook']);
select tests.person('m', 'emre', 'employee', array['K'], array['cook']);
select tests.person('m', 'veli', 'employee', array['K'], array['server']);
select tests.person('m', 'ali', 'employee', array['K', 'B'], array['cook']);
select tests.person('m', 'aydan', 'manager', array['K'], array['cook'], 'onboarding');

-- Food Handler: asked of everybody, reviewed, overdue restricts.
create temp table food(id uuid);
insert into food select public.save_document_type_lifecycle_service(tests.user('m:owner'), tests.id('m'), null, null,
  '{"title": "Food Handler", "description": "", "requires_review": true, "accepted_formats": ["pdf"], "tracks_expiry": false,
    "expiry_warning_days": 30, "lifecycle_settings": {"mode": "required", "assignment_scope": "all_active",
    "target": {"operator": "and", "location_ids": [], "department_ids": [], "job_ids": [], "employee_ids": []},
    "period_days": 7, "suspend_on_overdue": true, "extra_fields": []}}');
create temp table preview(p jsonb);
insert into preview select public.preview_document_publication_service(tests.user('m:owner'), tests.id('m'), id) from food;
select public.set_document_publication_service(tests.user('m:owner'), tests.id('m'), f.id, (p.p ->> 'revision')::int,
  (p.p ->> 'publication_revision')::int, p.p ->> 'preview_token', 'Publish', 'published') from food f, preview p;

create function pg_temp.emp(person text) returns uuid language sql as $$
  select tests.id(case person when 'owner' then 'm:owner' else 'm:' || person end)$$;
create function pg_temp.usr(person text) returns uuid language sql as $$ select tests.user('m:' || person) $$;
create function pg_temp.req(person text) returns public.employee_onboarding_requirements language sql as $$
  select r.* from public.employee_onboarding_requirements r
  where r.employee_id = pg_temp.emp(person) and r.source_id = (select id from food) and r.lifecycle_retired_at is null$$;
-- Runs a statement: 'ok', or the refusal's code and authz hint.
create function pg_temp.attempt(statement text) returns text language plpgsql as $$
declare code text; hint text;
begin
  execute statement;
  return 'ok';
exception when others then
  get stacked diagnostics code = returned_sqlstate, hint = pg_exception_hint;
  return code || coalesce(' ' || nullif(hint, ''), '');
end;
$$;
-- The person uploads one file and sends it.
create function pg_temp.upload(person text) returns void language plpgsql as $$
begin
  perform public.save_employee_document_draft_file_service(pg_temp.usr(person), (pg_temp.req(person)).id,
    (pg_temp.req(person)).lifecycle_revision,
    tests.id('m') || '/' || pg_temp.emp(person) || '/' || (pg_temp.req(person)).id || '/' || gen_random_uuid() || '.pdf',
    'food-handler.pdf', 'application/pdf', 1024);
  perform public.submit_employee_document_lifecycle_service(pg_temp.usr(person), (pg_temp.req(person)).id,
    (pg_temp.req(person)).lifecycle_revision,
    (select s.id from public.employee_document_submissions s where s.requirement_id = (pg_temp.req(person)).id and s.state = 'draft'),
    null, '{}'::jsonb);
end;
$$;
-- The actor approves the person's sent document, keeping every file.
create function pg_temp.approve(actor text, person text) returns text language sql as $$
  select pg_temp.attempt(format(
    'select public.review_employee_document_lifecycle_service(%L, %L, %L, %s, %L, ''approve'', '''', ''full'', %L)',
    pg_temp.usr(actor), tests.id('m'), (pg_temp.req(person)).id, (pg_temp.req(person)).lifecycle_revision,
    (pg_temp.req(person)).submitted_document_id,
    (select jsonb_agg(jsonb_build_object('id', f.file_id, 'decision', 'keep'))
     from public.employee_document_submission_files f where f.submission_id = (pg_temp.req(person)).submitted_document_id)))$$;

select pg_temp.upload(p) from unnest(array['deniz', 'emre', 'veli', 'zeynep', 'kaan', 'ali']) p;

-- D1 ---------------------------------------------------------------------------------
select is(pg_temp.approve('ayse', 'deniz'), '42501 authz.rank', 'Ayse cannot approve Deniz''s Food Handler: a peer manager');
-- S2: a document waiting for review is its deciders' and its owner's.
create function pg_temp.lists(actor text, person text) returns boolean language sql as $$
  select exists (select 1 from jsonb_array_elements(public.list_employee_document_lifecycle_service(pg_temp.usr(actor), tests.id('m'), false)) o
    where (o ->> 'id')::uuid = (pg_temp.req(person)).id)$$;
select ok(not pg_temp.lists('ayse', 'deniz'), 'Ayse does not see Deniz''s Food Handler while it waits for review (S2)');
select is(pg_temp.attempt(format('select public.get_employee_document_lifecycle_service(%L, %L, %L, false)',
  pg_temp.usr('ayse'), tests.id('m'), (pg_temp.req('deniz')).id)), '42501 authz.out_of_scope', 'nor opens it');
select ok(pg_temp.lists('zeynep', 'deniz'), 'an admin, who decides on it, sees it');
select ok(pg_temp.lists('ayse', 'emre'), 'Ayse sees Emre''s waiting one: she decides on it');
select is(pg_temp.attempt(format('select public.get_employee_document_lifecycle_service(%L, %L, %L, true)',
  pg_temp.usr('deniz'), tests.id('m'), (pg_temp.req('deniz')).id)), 'ok', 'Deniz sees her own');
select is(pg_temp.approve('zeynep', 'zeynep'), '42501 authz.rank', 'Zeynep cannot approve her own');
select is(pg_temp.approve('zeynep', 'kaan'), '42501 authz.rank', 'nor Kaan''s: a peer admin');
select is(pg_temp.approve('emre', 'veli'), '42501 authz.missing_permission', 'an employee approves nobody''s');
select is(pg_temp.approve('owner', 'kaan'), 'ok', 'the owner approves an admin''s');
select is(pg_temp.approve('zeynep', 'deniz'), 'ok', 'an admin approves a manager''s');
select ok(pg_temp.lists('ayse', 'deniz'), 'once decided, Ayse sees Deniz''s Food Handler under M2');
-- Deniz uploads a renewal over her valid approval: the approved one stays seen
-- under M2, the waiting upload is her deciders' and hers (S2 as Mert chose it).
create temp table deniz_approved as
select s.id as submission_id, f.file_id from public.employee_document_submissions s
join public.employee_document_submission_files f on f.submission_id = s.id
where s.id = (pg_temp.req('deniz')).approved_document_id;
select pg_temp.upload('deniz');
create function pg_temp.row_of(actor text, person text) returns jsonb language sql as $$
  select o from jsonb_array_elements(public.list_employee_document_lifecycle_service(pg_temp.usr(actor), tests.id('m'), false)) o
  where (o ->> 'id')::uuid = (pg_temp.req(person)).id$$;
create function pg_temp.detail(actor text, person text) returns jsonb language sql as $$
  select public.get_employee_document_lifecycle_service(pg_temp.usr(actor), tests.id('m'), (pg_temp.req(person)).id, false)$$;
select is(pg_temp.row_of('ayse', 'deniz') ->> 'status', 'completed', 'Ayse still sees Deniz''s Food Handler as valid');
select is(pg_temp.row_of('ayse', 'deniz') ->> 'submitted_id', null, 'but not that a renewal waits');
select ok(not exists (select 1 from jsonb_array_elements(pg_temp.detail('ayse', 'deniz') -> 'submissions') x where x ->> 'state' = 'pending_review'),
  'nor the waiting upload in its history of versions');
select ok(exists (select 1 from jsonb_array_elements(pg_temp.detail('ayse', 'deniz') -> 'submissions') x where x ->> 'state' = 'accepted'),
  'while the approved version is there');
select is(pg_temp.attempt(format('select public.get_employee_document_lifecycle_path_service(%L, %L, %L, %L, %L, false)',
  pg_temp.usr('ayse'), tests.id('m'), (pg_temp.req('deniz')).id, (pg_temp.req('deniz')).submitted_document_id,
  (select f.file_id from public.employee_document_submission_files f where f.submission_id = (pg_temp.req('deniz')).submitted_document_id))),
  'P0002', 'she cannot download the waiting file');
select is(pg_temp.attempt(format('select public.get_employee_document_lifecycle_path_service(%L, %L, %L, %L, %L, false)',
  pg_temp.usr('ayse'), tests.id('m'), (pg_temp.req('deniz')).id, (select submission_id from deniz_approved), (select file_id from deniz_approved))),
  'ok', 'and downloads the approved one');
select is(pg_temp.row_of('zeynep', 'deniz') ->> 'status', 'pending_review', 'Zeynep, who decides on it, sees the renewal waiting');
select ok(exists (select 1 from jsonb_array_elements(pg_temp.detail('zeynep', 'deniz') -> 'submissions') x where x ->> 'state' = 'pending_review'),
  'and its upload');
-- Deniz replaces the renewal before anybody reviewed it: the first renewal is
-- 'superseded', still never reviewed, so still her deciders' and hers.
create temp table deniz_first_renewal as
select s.id as submission_id, f.file_id from public.employee_document_submissions s
join public.employee_document_submission_files f on f.submission_id = s.id
where s.id = (pg_temp.req('deniz')).submitted_document_id;
select pg_temp.upload('deniz');
select is((select s.state from public.employee_document_submissions s where s.id = (select submission_id from deniz_first_renewal)),
  'superseded', 'the first renewal was replaced unreviewed');
create function pg_temp.has_version(actor text, self_only boolean) returns boolean language sql as $$
  select exists (select 1 from jsonb_array_elements(public.get_employee_document_lifecycle_service(pg_temp.usr(actor), tests.id('m'),
    (pg_temp.req('deniz')).id, self_only) -> 'submissions') x where (x ->> 'id')::uuid = (select submission_id from deniz_first_renewal))$$;
create function pg_temp.has_history(actor text, self_only boolean) returns boolean language sql as $$
  select exists (select 1 from jsonb_array_elements(public.get_employee_document_lifecycle_service(pg_temp.usr(actor), tests.id('m'),
    (pg_temp.req('deniz')).id, self_only) -> 'history') h where h -> 'metadata' ->> 'submission_id' = (select submission_id from deniz_first_renewal)::text)$$;
select ok(not pg_temp.has_version('ayse', false), 'Ayse does not see the replaced renewal among the versions');
select ok(not pg_temp.has_history('ayse', false), 'nor in the history');
select is(pg_temp.attempt(format('select public.get_employee_document_lifecycle_path_service(%L, %L, %L, %L, %L, false)',
  pg_temp.usr('ayse'), tests.id('m'), (pg_temp.req('deniz')).id, (select submission_id from deniz_first_renewal), (select file_id from deniz_first_renewal))),
  'P0002', 'nor downloads it: the same answer as for any file she does not see');
select ok(pg_temp.has_version('zeynep', false) and pg_temp.has_history('zeynep', false), 'Zeynep, who decides on it, sees it and its history');
select ok(pg_temp.has_version('deniz', true), 'and Deniz sees her own');
select is(pg_temp.attempt(format('select public.get_employee_document_lifecycle_path_service(%L, %L, %L, %L, %L, false)',
  pg_temp.usr('zeynep'), tests.id('m'), (pg_temp.req('deniz')).id, (select submission_id from deniz_first_renewal), (select file_id from deniz_first_renewal))),
  'ok', 'and Zeynep downloads it');
-- Zeynep rejects Deniz's renewal: the rejected upload and its reason are her
-- deciders' and hers too (Mert, 2026-10-03); Ayse still sees the valid approval.
create function pg_temp.reject(actor text, person text, reason text) returns text language sql as $$
  select pg_temp.attempt(format(
    'select public.review_employee_document_lifecycle_service(%L, %L, %L, %s, %L, ''reject'', %L, ''full'', %L)',
    pg_temp.usr(actor), tests.id('m'), (pg_temp.req(person)).id, (pg_temp.req(person)).lifecycle_revision,
    (pg_temp.req(person)).submitted_document_id, reason,
    (select jsonb_agg(jsonb_build_object('id', f.file_id, 'decision', 'keep'))
     from public.employee_document_submission_files f where f.submission_id = (pg_temp.req(person)).submitted_document_id)))$$;
create temp table deniz_rejected as
select s.id as submission_id, f.file_id from public.employee_document_submissions s
join public.employee_document_submission_files f on f.submission_id = s.id
where s.id = (pg_temp.req('deniz')).submitted_document_id;
select is(pg_temp.reject('zeynep', 'deniz', 'Blurry photo'), 'ok', 'Zeynep rejects the renewal');
select is(pg_temp.row_of('ayse', 'deniz') ->> 'status', 'completed', 'Ayse sees Deniz''s Food Handler still valid');
select ok(pg_temp.row_of('ayse', 'deniz') ->> 'rejection_reason' is null and pg_temp.row_of('ayse', 'deniz') ->> 'submitted_id' is null,
  'not the rejection nor its reason');
select ok(not exists (select 1 from jsonb_array_elements(pg_temp.detail('ayse', 'deniz') -> 'submissions') x
    where (x ->> 'id')::uuid = (select submission_id from deniz_rejected)), 'nor the rejected upload among the versions');
select ok(not exists (select 1 from jsonb_array_elements(pg_temp.detail('ayse', 'deniz') -> 'history') h
    where h -> 'metadata' ->> 'submission_id' = (select submission_id from deniz_rejected)::text), 'nor in the history');
select is(pg_temp.attempt(format('select public.get_employee_document_lifecycle_path_service(%L, %L, %L, %L, %L, false)',
  pg_temp.usr('ayse'), tests.id('m'), (pg_temp.req('deniz')).id, (select submission_id from deniz_rejected), (select file_id from deniz_rejected))),
  'P0002', 'nor downloads it');
select is(pg_temp.row_of('zeynep', 'deniz') ->> 'rejection_reason', 'Blurry photo', 'Zeynep sees the rejection and its reason');
select ok(exists (select 1 from jsonb_array_elements(pg_temp.detail('zeynep', 'deniz') -> 'submissions') x
    where (x ->> 'id')::uuid = (select submission_id from deniz_rejected) and x ->> 'rejection_reason' = 'Blurry photo'), 'and the rejected upload');
select is((public.get_employee_document_lifecycle_service(pg_temp.usr('deniz'), tests.id('m'), (pg_temp.req('deniz')).id, true)
  -> 'obligation' ->> 'rejection_reason'), 'Blurry photo', 'and Deniz sees why');
select is(pg_temp.approve('ayse', 'emre'), 'ok', 'Ayse approves Emre''s, an employee where she works');
select is(pg_temp.approve('mehmet', 'veli'), '42501 authz.out_of_scope', 'Mehmet does not decide at Kadikoy');

-- D2 ---------------------------------------------------------------------------------
select is(pg_temp.approve('mehmet', 'ali'), 'ok', 'Mehmet approves Ali''s, who works at Besiktas and Kadikoy');
select is(app_private.document_obligation_state(pg_temp.req('ali'), now()), 'completed', 'one approval completes it');
select ok(not app_private.document_actor_blocked(pg_temp.usr('ali'), tests.id('m')), 'and Ali is open at both locations');
select is(pg_temp.attempt(format('select public.get_employee_document_lifecycle_service(%L, %L, %L, false)',
  pg_temp.usr('ayse'), tests.id('m'), (pg_temp.req('ali')).id)), 'ok', 'Ayse at Kadikoy reads the decided document too');

-- S1: a legal name typed in onboarding -------------------------------------------------
-- Can is invited as "Can Person" and types "Can Emre Person", as on his ID.
select tests.person('m', 'can', 'employee', array['K'], array['cook'], 'onboarding');
select public.save_employee_onboarding_profile_service(pg_temp.usr('can'),
  jsonb_build_object('legal_first_name', 'Can Emre', 'legal_last_name', 'Person', 'phone', '4155550123',
    'emergency_contact_name', 'Contact', 'emergency_contact_relationship', 'Friend', 'emergency_contact_phone', '+14155550100'),
  (select c.revision from public.employee_onboarding_cases c where c.employee_id = pg_temp.emp('can')), tests.id('m'));
create function pg_temp.legal_name(actor text) returns text language sql as $$
  select pg_temp.attempt(format(
    'select public.review_employee_onboarding_service(%L, %L, %L, ''accept_requirement'', %L, '''', %s, true)',
    pg_temp.usr(actor), tests.id('m'), pg_temp.emp('can'),
    (select r.id from public.employee_onboarding_requirements r where r.employee_id = pg_temp.emp('can') and r.kind = 'profile'),
    (select c.revision from public.employee_onboarding_cases c where c.employee_id = pg_temp.emp('can'))))$$;
select is((select status::text from public.employee_onboarding_requirements where employee_id = pg_temp.emp('can') and kind = 'profile'),
  'awaiting_review', 'the changed legal name waits for approval');
select is(app_private.authz_reason(pg_temp.usr('ayse'), tests.id('m'), 'onboarding.review', null, pg_temp.emp('can')), null,
  'Ayse reviews Can''s onboarding');
select is(pg_temp.legal_name('ayse'), '42501 authz.out_of_scope',
  'but not his legal name, though her role holds employees.private.manage (S1)');
select is(pg_temp.legal_name('zeynep'), 'ok', 'an admin approves it');
select is((select first_name from public.employee_profiles where id = pg_temp.emp('can')), 'Can Emre', 'and the record takes it');

-- S2 in the onboarding review: Veli's Food Handler still waits for review -----------------
create function pg_temp.review_read(actor text, person text) returns jsonb language sql as $$
  select public.get_employee_onboarding_review_service(pg_temp.usr(actor), tests.id('m'), pg_temp.emp(person))$$;
select ok(not exists (select 1 from jsonb_array_elements(pg_temp.review_read('lale', 'veli') -> 'requirements') q
    where (q ->> 'id')::uuid = (pg_temp.req('veli')).id),
  'Lale, who reads documents but decides on none, does not see Veli''s waiting Food Handler in his onboarding');
select ok(exists (select 1 from jsonb_array_elements(pg_temp.review_read('ayse', 'veli') -> 'requirements') q
    where (q ->> 'id')::uuid = (pg_temp.req('veli')).id),
  'Ayse, who decides on it, does');
select is((pg_temp.review_read('lale', 'veli') ->> 'progress_total')::int, (pg_temp.review_read('ayse', 'veli') ->> 'progress_total')::int - 1,
  'and Lale''s progress does not count the row she cannot see');

-- D3 ---------------------------------------------------------------------------------
update public.employee_onboarding_requirements set deadline_at = now() - interval '1 day' where id = (pg_temp.req('hande')).id;
select ok(app_private.document_actor_blocked(pg_temp.usr('hande'), tests.id('m')), 'Hande''s own Food Handler is overdue');
select is(pg_temp.approve('hande', 'veli'), '42501 authz.document_blocked', 'so she approves nobody''s');
select is(pg_temp.attempt(format('select public.get_employee_document_lifecycle_service(%L, %L, %L, false)',
  pg_temp.usr('hande'), tests.id('m'), (pg_temp.req('veli')).id)), '42501 authz.document_blocked',
  'and reads nobody''s (KARARLAR "Kısıtlı kişi"; the time-off exception does not reach documents)');
select is(pg_temp.attempt(format('select public.get_employee_document_lifecycle_service(%L, %L, %L, true)',
  pg_temp.usr('hande'), tests.id('m'), (pg_temp.req('hande')).id)), 'ok', 'she still opens her own to fix it');

-- D4 went with the old notifications (BILDIRIM-06): there is no inbox to open until the new system.

-- D5 ---------------------------------------------------------------------------------
select ok((pg_temp.req('owner')).owner_excused and (pg_temp.req('owner')).lifecycle_exempt, 'the owner is not asked for Food Handler');
select lives_ok($$select pg_temp.upload('owner')$$, 'the owner uploads theirs anyway (BL-118)');
select is((select s.state from public.employee_document_submissions s where s.id = (pg_temp.req('owner')).submitted_document_id),
  'accepted', 'it is on file at once');
select ok((pg_temp.req('owner')).approved_document_id is not null and (pg_temp.req('owner')).deadline_at is null,
  'with no review and no clock');
select is(app_private.document_obligation_state(pg_temp.req('owner'), now()), 'exempt', 'the owner stays excused');
select is(pg_temp.attempt(format('select public.set_employee_document_exemption_service(%L, %L, %L, %s, false, ''Back'')',
  tests.user('m:owner'), tests.id('m'), (pg_temp.req('owner')).id, (pg_temp.req('owner')).lifecycle_revision)),
  '42501 authz.rank', 'and decides nothing about their own');

-- D6 / Done when 8 ---------------------------------------------------------------------
create temp table draft(id uuid);
insert into draft select public.save_document_type_lifecycle_service(tests.user('m:owner'), tests.id('m'), null, null,
  '{"title": "Draft badge", "description": "", "requires_review": true, "accepted_formats": ["pdf"], "tracks_expiry": false,
    "expiry_warning_days": 30, "lifecycle_settings": {"mode": "required", "assignment_scope": "all_active",
    "target": {"operator": "and", "location_ids": [], "department_ids": [], "job_ids": [], "employee_ids": []},
    "period_days": 7, "suspend_on_overdue": true, "extra_fields": []}}');
select is((select count(*)::integer from public.employee_onboarding_requirements where source_id = (select id from draft)), 0,
  'a draft definition is asked of nobody');
select lives_ok($$select tests.person('m', 'pelin', 'employee', array['K'], array['cook'], 'onboarding')$$,
  'somebody starts onboarding while a draft matches them: filtered, not refused');
select is((select count(*)::integer from public.employee_onboarding_requirements where source_id = (select id from draft)), 0,
  'and the draft is not among what they are asked');
select ok(not app_private.document_actor_blocked(pg_temp.usr('pelin'), tests.id('m')), 'nor does it restrict them');
create temp table retention(id uuid);
insert into retention select public.save_signature_retention_policy_service(tests.user('m:owner'), tests.id('m'), null,
  'Policies', 'signed_at', 365, 'Workspace', 'Internal');
select public.approve_signature_retention_policy_service(tests.user('m:owner'), tests.id('m'), id) from retention;
create temp table draft_policy(id uuid);
insert into draft_policy select public.save_policy_lifecycle_service(tests.user('m:owner'), tests.id('m'), null,
  jsonb_build_object('title', 'Draft policy', 'summary', 'Read it', 'content_text', 'Policy text', 'intent_statement', 'I read it',
    'locale', 'en-US', 'effective_date', current_date, 'retention_policy_id', (select id from retention),
    'lifecycle_settings', jsonb_build_object('mode', 'required', 'assignment_scope', 'all_active', 'period_days', 7,
      'suspend_on_overdue', true, 'target', jsonb_build_object('operator', 'and', 'location_ids', '[]'::jsonb,
        'department_ids', '[]'::jsonb, 'job_ids', '[]'::jsonb, 'employee_ids', '[]'::jsonb))));
select is((select count(*)::integer from public.employee_onboarding_requirements r
  join public.signature_template_versions v on v.id = r.source_id
  where v.template_id = (select id from draft_policy)), 0, 'a draft policy is asked of nobody either');

-- Done when 10: the drawer's Review button and the command answer alike -----------------
create function pg_temp.drawer(actor text, person text) returns boolean language sql as $$
  select (public.get_employee_detail_service(pg_temp.usr(actor), tests.id('m'), pg_temp.emp(person)) -> 'allowed' ->> 'onboarding_review')::boolean$$;
create function pg_temp.command(actor text, person text) returns boolean language sql as $$
  select pg_temp.attempt(format(
    'select public.review_employee_onboarding_before_availability_service(%L, %L, %L, ''look'', null, null, %s, false)',
    pg_temp.usr(actor), tests.id('m'), pg_temp.emp(person),
    coalesce((select c.revision from public.employee_onboarding_cases c where c.employee_id = pg_temp.emp(person)), 1))) like '22023%'$$;
select is(pg_temp.drawer('ayse', 'emre'), pg_temp.command('ayse', 'emre'), 'Ayse may review Emre''s onboarding: the drawer says so too');
select ok(pg_temp.drawer('ayse', 'emre'), 'and it is yes');
select is(pg_temp.drawer('ayse', 'deniz'), pg_temp.command('ayse', 'deniz'), 'Ayse may not review Deniz''s: the drawer says so too');
select ok(not pg_temp.drawer('ayse', 'deniz'), 'and it is no');

-- Nothing approved yet: Ayse rejects Veli's Food Handler. Lale, who reads
-- documents but decides on none, sees it as still missing, not the reason.
select is(pg_temp.reject('ayse', 'veli', 'Wrong document'), 'ok', 'Ayse rejects Veli''s Food Handler');
select ok(pg_temp.row_of('lale', 'veli') ->> 'status' in ('missing', 'grace') and pg_temp.row_of('lale', 'veli') ->> 'rejection_reason' is null,
  'Lale sees it as still missing, without the reason');
select is((select q ->> 'rejection_reason' from jsonb_array_elements(pg_temp.review_read('lale', 'veli') -> 'requirements') q
    where (q ->> 'id')::uuid = (pg_temp.req('veli')).id), null, 'in his onboarding too');
select is(pg_temp.row_of('ayse', 'veli') ->> 'rejection_reason', 'Wrong document', 'Ayse, who decided, sees the reason');

select * from finish();
rollback;

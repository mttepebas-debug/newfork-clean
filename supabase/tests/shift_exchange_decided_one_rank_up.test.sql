begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Who decides a shift change (FB-6.4 A2, EKRAN-02 A2; ILKELER P07, KARARLAR
-- "Takas… uygunluk", "Schedule → Requests" K-S1, K-S2, K-S4, K-S5; the decision chain, S-164, S-169).
-- Kadikoy has two managers, Ayse and Can, and Aydan, who misses a required
-- document; Besiktas has no manager. Zeynep is an admin.

select tests.world('ru');
-- The owner works here too (ROL-CIFT: the employee side needs the employee slot).
select tests.employee_slot('ru', 'owner');
select tests.person('ru', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('ru', 'can', 'manager', array['K'], array['cook']);
select tests.person('ru', 'aydan', 'manager', array['K'], array['server']);
select tests.person('ru', 'zeynep', 'admin', array['K'], array['cook']);
select tests.person('ru', 'emre', 'employee', array['K'], array['cook']);
select tests.person('ru', 'ali', 'employee', array['K', 'B'], array['cook']);
select tests.person('ru', 'deniz', 'employee', array['K', 'B'], array['cook']);
select tests.person('ru', 'veli', 'employee', array['B'], array['cook']);
select tests.person('ru', 'pelin', 'employee', array['K'], array['cook'], 'onboarding');
select tests.person('ru', 'sema', 'employee', array['K'], array['server']);
-- ponytail: the owner cooks too, as Employees -> the owner's record -> Jobs would say.
insert into public.employee_job_assignments (workspace_id, employee_id, job_id, is_primary, created_by)
values (tests.id('ru'), tests.id('ru:owner'), tests.id('ru:job:cook'), false, tests.user('ru:owner'));

select tests.publish_week('ru', 1, '[
  {"label": "emre-k",  "person": "emre",  "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"},
  {"label": "ayse-k",  "person": "ayse",  "loc": "K", "job": "cook", "day": 1, "start": "16:00", "end": "22:00"},
  {"label": "ayse-k2", "person": "ayse",  "loc": "K", "job": "cook", "day": 5, "start": "09:00", "end": "15:00"},
  {"label": "olcay-k", "person": "owner", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"},
  {"label": "veli-b",  "person": "veli",  "loc": "B", "job": "cook", "day": 2, "start": "16:00", "end": "22:00"},
  {"label": "ali-k",   "person": "ali",   "loc": "K", "job": "cook", "day": 3, "start": "09:00", "end": "15:00"},
  {"label": "deniz-b", "person": "deniz", "loc": "B", "job": "cook", "day": 4, "start": "09:00", "end": "15:00"},
  {"label": "zeynep-k", "person": "zeynep", "loc": "K", "job": "cook", "day": 6, "start": "09:00", "end": "15:00"}
]');

-- Aydan and Sema, the servers, miss a document servers must hand in
-- (schedule_asks_the_core.test.sql).
-- ponytail: the deadline is moved into the past by hand.
create temporary table required_document (id uuid, preview jsonb);
insert into required_document (id)
select public.save_document_type_lifecycle_service(tests.user('ru:owner'), tests.id('ru'), null, null, jsonb_build_object(
  'title', 'Food handler card', 'description', 'Card', 'requires_review', true, 'accepted_formats', array['pdf'],
  'tracks_expiry', false, 'expiry_warning_days', 30,
  'lifecycle_settings', jsonb_build_object('mode', 'conditional', 'assignment_scope', 'all_active',
    'target', jsonb_build_object('operator', 'and', 'location_ids', '[]'::jsonb, 'department_ids', '[]'::jsonb,
      'job_ids', jsonb_build_array(tests.id('ru:job:server')), 'employee_ids', '[]'::jsonb),
    'period_days', 7, 'suspend_on_overdue', true, 'extra_fields', '[]'::jsonb)));
update required_document set preview = public.preview_document_publication_service(tests.user('ru:owner'), tests.id('ru'), id);
select public.set_document_publication_service(tests.user('ru:owner'), tests.id('ru'), id,
  (preview ->> 'revision')::integer, (preview ->> 'publication_revision')::integer, preview ->> 'preview_token', 'Publish', 'published')
from required_document;
select tests.settle();
update public.employee_onboarding_requirements set deadline_at = now() - interval '1 day'
where source_id = (select id from required_document) and lifecycle_user_id in (tests.user('ru:aydan'), tests.user('ru:sema'));
select is((app_private.actor(tests.user('ru:aydan'), tests.id('ru'))).document_blocked, true, 'Aydan misses a required document');
select is((app_private.actor(tests.user('ru:sema'), tests.id('ru'))).document_blocked, true, 'so does Sema');

select tests.cover_case('ru', 'emre-k', 'emre', 'ali');
select tests.cover_case('ru', 'ayse-k', 'ayse', 'ali');
select tests.cover_case('ru', 'ayse-k2', 'ayse', 'emre');
select tests.cover_case('ru', 'olcay-k', 'owner', 'emre');
select tests.cover_case('ru', 'veli-b', 'veli', 'ali');
select tests.cover_case('ru', 'zeynep-k', 'zeynep', 'emre');
-- Deniz cannot work Tuesday mornings.
select tests.availability('ru', 'deniz', 2, '09:00', '12:00');

create function pg_temp.said(statement text) returns text language plpgsql as $$
declare code text; reason text;
begin
  execute statement;
  return 'ok';
exception when others then
  get stacked diagnostics code = returned_sqlstate, reason = pg_exception_hint;
  return concat_ws(' ', code, nullif(reason, ''));
end;
$$;
create function pg_temp.command(person text, command jsonb) returns jsonb language sql as $$
  select public.shift_exchanges_command_service(tests.user('ru:' || person), tests.id('ru'), command, gen_random_uuid())
$$;
create function pg_temp.decide(person text, label text, verb text, private_note text default '') returns jsonb language sql as $$
  select pg_temp.command(person, jsonb_build_object('action', verb, 'case_id', tests.id('ru:case:' || label),
    'application_id', tests.id('ru:application:' || label), 'reason', 'Not this time', 'private_note', private_note,
    'expected_revision', (select revision from public.shift_exchange_cases where id = tests.id('ru:case:' || label)),
    'fingerprint', public.shift_exchange_preview(tests.user('ru:' || person), tests.id('ru'), tests.id('ru:case:' || label),
      tests.id('ru:application:' || label)) ->> 'fingerprint'))
$$;
create function pg_temp.users(variadic people text[]) returns uuid[] language sql as $$
  select array(select tests.user(case p when 'owner' then 'ru:owner' else 'ru:' || p end) from unnest(people) p order by 1)
$$;

-- 1. Covers asked for.
-- Emre looks for cover: Deniz is listed as unavailable, never with her hours.
select is((select e -> 'eligibility' -> 'acknowledgements' from jsonb_array_elements(public.shift_exchanges_candidates_service(
  tests.user('ru:emre'), tests.id('ru'), tests.id('ru:shift:emre-k')) -> 'employees') e where e ->> 'id' = tests.id('ru:deniz')::text),
  '[{"code": "availability"}]'::jsonb, 'Emre sees that Deniz is unavailable, not when');

-- 2. One decision chain (KARARLAR S-164, S-169): Kadikoy's manager decides a request at
-- Kadikoy, whatever the rank of whom it is about; nobody decides their own (D3, P07);
-- the reason comes from the core.
select is(pg_temp.said($$select pg_temp.decide('ayse', 'ayse-k2', 'approve')$$), '42501 authz.rank', 'Ayse cannot approve her own');
select is(pg_temp.said($$select pg_temp.decide('ayse', 'ayse-k2', 'reject')$$), '42501 authz.rank', 'nor reject it (BL-726)');
select is(public.shift_exchange_preview(tests.user('ru:ayse'), tests.id('ru'), tests.id('ru:case:ayse-k2'), tests.id('ru:application:ayse-k2')) -> 'reasons',
  '["A separate manager must approve your own exchange"]'::jsonb, 'Ayse''s preview says why she cannot');
select is(pg_temp.said($$select pg_temp.decide('ayse', 'veli-b', 'approve')$$), '42501 authz.out_of_scope', 'Ayse does not decide at Besiktas');
select is(pg_temp.said($$select pg_temp.decide('deniz', 'emre-k', 'approve')$$), '42501 authz.missing_permission', 'an employee decides nothing');
select is(pg_temp.said($$select pg_temp.decide('aydan', 'emre-k', 'approve')$$), '42501 authz.document_blocked', 'K-S2: Aydan, missing a document, cannot approve');
select is(pg_temp.decide('can', 'ayse-k2', 'approve') ->> 'status', 'completed', 'Can approves his peer Ayse''s cover');
select is(pg_temp.decide('can', 'emre-k', 'approve') ->> 'status', 'completed', 'Can approves Emre''s cover');

-- The admin's own cover goes to Kadikoy's manager: rank is not counted on the employee side.
select is(pg_temp.said($$select pg_temp.decide('zeynep', 'zeynep-k', 'approve')$$), '42501 authz.rank', 'Zeynep cannot approve her own');
select is(pg_temp.decide('ayse', 'zeynep-k', 'approve') ->> 'status', 'completed', 'Ayse approves the admin''s cover');

-- 3. K-S1: the owner's own cover goes to the location's manager or an admin.
select is(pg_temp.said($$select pg_temp.decide('owner', 'olcay-k', 'approve')$$), '42501 authz.rank', 'the owner cannot approve their own');
select is(pg_temp.decide('ayse', 'olcay-k', 'approve') ->> 'status', 'completed', 'Kadikoy''s manager approves the owner''s cover');

-- 4. D4: somebody restricted neither applies nor offers.
select is(pg_temp.said($$select pg_temp.command('pelin', jsonb_build_object('action', 'apply', 'shift_id', tests.id('ru:shift:veli-b'),
  'case_id', tests.id('ru:case:veli-b')))$$), '42501 authz.not_active', 'Pelin, still onboarding, cannot apply');
select is(pg_temp.said($$select pg_temp.command('pelin', jsonb_build_object('action', 'create', 'kind', 'cover', 'shift_id', tests.id('ru:shift:veli-b')))$$),
  '42501 authz.not_active', 'nor offer a shift');
select is(pg_temp.said($$select pg_temp.command('sema', jsonb_build_object('action', 'apply', 'shift_id', tests.id('ru:shift:veli-b'),
  'case_id', tests.id('ru:case:veli-b')))$$), '42501 authz.document_blocked', 'Sema, missing a document, cannot apply');
select is(pg_temp.said($$select pg_temp.command('sema', jsonb_build_object('action', 'create', 'kind', 'cover', 'shift_id', tests.id('ru:shift:veli-b')))$$),
  '42501 authz.document_blocked', 'nor offer a shift');

-- 5. K-S5: a private note reaches only those who decide the case.
select pg_temp.decide('zeynep', 'ayse-k', 'reject', 'Ali was late twice');
create function pg_temp.note_seen(person text, manager_view boolean) returns boolean language sql as $$
  select exists(select 1 from jsonb_array_elements(public.shift_exchanges_read_service(tests.user('ru:' || person), tests.id('ru'),
    manager_view, tests.week(1), tests.week(1) + 6, tests.id('ru:case:ayse-k')) -> 'cases') c, jsonb_array_elements(c -> 'history') h
    where c ->> 'id' = tests.id('ru:case:ayse-k')::text and h ->> 'private_note' = 'Ali was late twice')
$$;
select ok(pg_temp.note_seen('zeynep', true), 'Zeynep, who decides it, reads the private note');
select ok(pg_temp.note_seen('can', true), 'so does Can, Kadikoy''s other manager, who decides it too');
select ok(not pg_temp.note_seen('aydan', true), 'Aydan, missing a document, does not');
select ok(not pg_temp.note_seen('ali', false), 'nor does Ali');
select ok(not pg_temp.note_seen('ayse', false), 'nor does Ayse, whose case it is');

-- 6. R2-18: approving one side of a two-location swap again tells nobody again.
select tests.remember('ru:case:swap', (pg_temp.command('ali', jsonb_build_object('action', 'create', 'kind', 'swap',
  'shift_id', tests.id('ru:shift:ali-k'), 'requested_shift_id', tests.id('ru:shift:deniz-b'))) ->> 'case_id')::uuid);
select tests.remember('ru:application:swap', (select a.id from public.shift_exchange_applications a where a.case_id = tests.id('ru:case:swap')));
select pg_temp.command('deniz', jsonb_build_object('action', 'accept', 'case_id', tests.id('ru:case:swap'),
  'application_id', tests.id('ru:application:swap'),
  'expected_revision', (select revision from public.shift_exchange_cases where id = tests.id('ru:case:swap'))));
select tests.settle();
select is(pg_temp.decide('ayse', 'swap', 'approve') ->> 'status', 'open', 'Ayse approves Kadikoy''s side; Besiktas still decides');
select is(pg_temp.decide('ayse', 'swap', 'approve') ->> 'status', 'open', 'and approves it again');
select is((select count(*)::integer from public.shift_exchange_events where case_id = tests.id('ru:case:swap') and action = 'scope_approved'), 1,
  'one approval, one notice');
select is(public.shift_exchange_preview(tests.user('ru:can'), tests.id('ru'), tests.id('ru:case:swap'), tests.id('ru:application:swap')) ->> 'requires_other_manager',
  'true', 'Besiktas''s side still waits');

select * from finish();
rollback;

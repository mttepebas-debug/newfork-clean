begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Who may close a shift change (EXCHANGE-CLOSE-RANK; ILKELER P07, KARARLAR G1, K-S1;
-- the decision chain, S-164, S-169): its owner takes it back, or whoever decides it
-- where it is closes it: the location's manager, an admin or the owner, whatever the
-- rank of its owner.
-- Kadikoy has two managers, Ayse and Can, and Aydan, who misses a required
-- document; Zeynep and Kaan are admins. Besiktas has Bora, its manager, and Veli.

select tests.world('xc');
-- The owner works here too (ROL-CIFT: the employee side needs the employee slot).
select tests.employee_slot('xc', 'owner');
select tests.person('xc', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('xc', 'can', 'manager', array['K'], array['cook']);
select tests.person('xc', 'aydan', 'manager', array['K'], array['server']);
select tests.person('xc', 'bora', 'manager', array['B'], array['cook']);
select tests.person('xc', 'zeynep', 'admin', array['K'], array['cook']);
select tests.person('xc', 'kaan', 'admin', array['K'], array['cook']);
select tests.person('xc', 'emre', 'employee', array['K'], array['cook']);
select tests.person('xc', 'ali', 'employee', array['K', 'B'], array['cook']);
select tests.person('xc', 'veli', 'employee', array['B'], array['cook']);
select tests.person('xc', 'deniz', 'employee', array['K', 'B'], array['cook']);
-- ponytail: the owner cooks too, as Employees -> the owner's record -> Jobs would say.
insert into public.employee_job_assignments (workspace_id, employee_id, job_id, is_primary, created_by)
values (tests.id('xc'), tests.id('xc:owner'), tests.id('xc:job:cook'), false, tests.user('xc:owner'));

select tests.publish_week('xc', 1, '[
  {"label": "ayse-k",   "person": "ayse",   "loc": "K", "job": "cook", "day": 1, "start": "16:00", "end": "22:00"},
  {"label": "zeynep-k", "person": "zeynep", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"},
  {"label": "emre-k",   "person": "emre",   "loc": "K", "job": "cook", "day": 3, "start": "09:00", "end": "15:00"},
  {"label": "ali-k",    "person": "ali",    "loc": "K", "job": "cook", "day": 4, "start": "09:00", "end": "15:00"},
  {"label": "veli-b",   "person": "veli",   "loc": "B", "job": "cook", "day": 5, "start": "09:00", "end": "15:00"},
  {"label": "owner-k",  "person": "owner",  "loc": "K", "job": "cook", "day": 5, "start": "16:00", "end": "22:00"},
  {"label": "ali-k2",   "person": "ali",    "loc": "K", "job": "cook", "day": 6, "start": "09:00", "end": "15:00"},
  {"label": "deniz-b",  "person": "deniz",  "loc": "B", "job": "cook", "day": 2, "start": "16:00", "end": "22:00"}
]');

-- Aydan, a server, misses a document servers must hand in
-- (shift_exchange_decided_one_rank_up.test.sql).
-- ponytail: the deadline is moved into the past by hand.
create temporary table required_document (id uuid, preview jsonb);
insert into required_document (id)
select public.save_document_type_lifecycle_service(tests.user('xc:owner'), tests.id('xc'), null, null, jsonb_build_object(
  'title', 'Food handler card', 'description', 'Card', 'requires_review', true, 'accepted_formats', array['pdf'],
  'tracks_expiry', false, 'expiry_warning_days', 30,
  'lifecycle_settings', jsonb_build_object('mode', 'conditional', 'assignment_scope', 'all_active',
    'target', jsonb_build_object('operator', 'and', 'location_ids', '[]'::jsonb, 'department_ids', '[]'::jsonb,
      'job_ids', jsonb_build_array(tests.id('xc:job:server')), 'employee_ids', '[]'::jsonb),
    'period_days', 7, 'suspend_on_overdue', true, 'extra_fields', '[]'::jsonb)));
update required_document set preview = public.preview_document_publication_service(tests.user('xc:owner'), tests.id('xc'), id);
select public.set_document_publication_service(tests.user('xc:owner'), tests.id('xc'), id,
  (preview ->> 'revision')::integer, (preview ->> 'publication_revision')::integer, preview ->> 'preview_token', 'Publish', 'published')
from required_document;
select tests.settle();
update public.employee_onboarding_requirements set deadline_at = now() - interval '1 day'
where source_id = (select id from required_document) and lifecycle_user_id = tests.user('xc:aydan');
select is((app_private.actor(tests.user('xc:aydan'), tests.id('xc'))).document_blocked, true, 'Aydan misses a required document');

select tests.cover_case('xc', 'ayse-k', 'ayse', 'ali');
select tests.cover_case('xc', 'zeynep-k', 'zeynep', 'emre');
select tests.cover_case('xc', 'emre-k', 'emre', 'ali');
select tests.cover_case('xc', 'ali-k', 'ali', 'emre');
select tests.cover_case('xc', 'veli-b', 'veli', 'ali');
select tests.cover_case('xc', 'owner-k', 'owner', 'emre');
select tests.remember('xc:case:swap', (public.shift_exchanges_command_service(tests.user('xc:ali'), tests.id('xc'), jsonb_build_object(
  'action', 'create', 'kind', 'swap', 'shift_id', tests.id('xc:shift:ali-k2'), 'requested_shift_id', tests.id('xc:shift:deniz-b')),
  gen_random_uuid()) ->> 'case_id')::uuid);
select tests.settle();

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
create function pg_temp.close(person text, label text) returns jsonb language sql as $$
  select public.shift_exchanges_command_service(tests.user(case person when 'owner' then 'xc:owner' else 'xc:' || person end), tests.id('xc'),
    jsonb_build_object('action', 'close', 'case_id', tests.id('xc:case:' || label), 'reason', '',
      'expected_revision', (select revision from public.shift_exchange_cases where id = tests.id('xc:case:' || label))), gen_random_uuid())
$$;
create function pg_temp.status(label text) returns text language sql as $$
  select status from public.shift_exchange_cases where id = tests.id('xc:case:' || label)
$$;

-- 1. One decision chain (KARARLAR S-164, S-169): who decides a request closes it, whatever the
-- rank of its owner; a peer manager decides a manager's.
select is((select c ->> 'can_manage' from jsonb_array_elements(public.shift_exchanges_read_service(tests.user('xc:can'), tests.id('xc'),
  true, tests.week(1), tests.week(1) + 6, tests.id('xc:case:ayse-k')) -> 'cases') c where c ->> 'id' = tests.id('xc:case:ayse-k')::text),
  'true', 'Can reads Ayse''s cover with its buttons');
select is(pg_temp.said($$select pg_temp.close('ali', 'ayse-k')$$), '42501 authz.missing_permission', 'Ali, who asked for it, cannot close it');
select is(pg_temp.status('ayse-k'), 'open', 'it stays open');
select is(pg_temp.close('can', 'ayse-k') ->> 'status', 'cancelled', 'Can, her peer, closes it');

-- 2. An admin's cover: Kadikoy's manager closes it.
select is(pg_temp.close('ayse', 'zeynep-k') ->> 'status', 'cancelled', 'Ayse closes the admin Zeynep''s cover');

-- 3. An employee's cover: their manager closes it; the owner of a cover takes it back.
select is(pg_temp.said($$select pg_temp.close('aydan', 'emre-k')$$), '42501 authz.document_blocked', 'K-S2: Aydan, missing a document, closes nothing');
select is(pg_temp.close('can', 'emre-k') ->> 'status', 'cancelled', 'Can closes Emre''s cover');
select is(pg_temp.close('ali', 'ali-k') ->> 'status', 'cancelled', 'Ali takes his own back');

-- 4. K-S1: the owner's own cover goes to the location's manager.
select is(pg_temp.close('ayse', 'owner-k') ->> 'status', 'cancelled', 'Ayse closes the owner''s cover');

-- 5. A two-location swap: the manager of the requested shift's location closes it too.
select is(pg_temp.close('bora', 'swap') ->> 'status', 'cancelled', 'Bora closes Ali''s swap for Deniz''s Besiktas shift');

-- 6. Out of the manager's locations, the same answer as before.
select is(pg_temp.said($$select pg_temp.close('ayse', 'veli-b')$$), '42501 authz.out_of_scope', 'Ayse closes nothing at Besiktas');
select is(pg_temp.status('veli-b'), 'open', 'Veli''s cover stays open');

select * from finish();
rollback;

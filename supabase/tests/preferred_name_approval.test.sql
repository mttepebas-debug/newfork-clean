begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- A preferred name was storable in name only: the column existed and a check
-- constraint held it at the empty string. KARARLAR S-131 (Mert, 2026-10-17): a
-- preferred name always waits for the people the core lets decide it; there is
-- no setting that lets one through. Only with nobody above to decide (the
-- owner's own) does it take effect at once. A refusal tells the person nothing.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('1c000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'preferred-owner@example.test', '', '{}', '{}', now(), now()),
  ('1c000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'preferred-staff@example.test', '', '{}', '{}', now(), now());

insert into public.user_profiles (user_id, display_name)
values
  ('1c000000-0000-4000-8000-000000000001', 'Robin Vance'),
  ('1c000000-0000-4000-8000-000000000002', 'Alexander Okonkwo');

create temporary table preferred_target on commit drop as
select public.create_owner_workspace_service(
  '1c000000-0000-4000-8000-000000000001',
  'Preferred Name Co'
) as workspace_id;
-- People join a workspace once its owner has finished setting it up.
update public.workspaces set lifecycle_status = 'active' where id = (select workspace_id from preferred_target);

insert into public.employee_profiles (id, workspace_id, user_id, employee_code, first_name, last_name, created_by)
values (
  '1d000000-0000-4000-8000-000000000001',
  (select workspace_id from preferred_target),
  '1c000000-0000-4000-8000-000000000002',
  'E-8001', 'Alexander', 'Okonkwo',
  '1c000000-0000-4000-8000-000000000001'
);

insert into public.workspace_memberships (workspace_id, user_id, status, role_id, employee_role_id)
select legacy.workspace_id::uuid, legacy.user_id::uuid, legacy.status::text::public.membership_status, (case when legacy.role::text <> 'employee' then coalesce(legacy.role_id::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(legacy.role_id::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (select
  (select workspace_id from preferred_target),
  '1c000000-0000-4000-8000-000000000002',
  'employee'::public.workspace_role,
  (select id from public.workspace_roles
   where workspace_id = (select workspace_id from preferred_target)
     and system_key = 'employee'),
  'active'::public.membership_status,
  '1d000000-0000-4000-8000-000000000001') as legacy(workspace_id, user_id, role, role_id, status, employee_id);

-- Every workspace answers them: the first request waits for its deciders.
select is(
  public.request_employee_preferred_name_service(
    '1c000000-0000-4000-8000-000000000002',
    (select workspace_id from preferred_target),
    '1d000000-0000-4000-8000-000000000001',
    'Alex'
  ),
  'waiting',
  'a preferred name waits for an answer, from the first one on'
);
select public.decide_employee_preferred_name_service(
  '1c000000-0000-4000-8000-000000000001',
  (select workspace_id from preferred_target),
  (select request_id from public.list_pending_preferred_names_service(
    '1c000000-0000-4000-8000-000000000001',
    (select workspace_id from preferred_target)
  )),
  true
);

select is(
  (select preferred_name from public.employee_profiles
   where id = '1d000000-0000-4000-8000-000000000001'),
  'Alex',
  'approved, the record shows it, where the check constraint used to forbid it'
);

select is(
  public.request_employee_preferred_name_service(
    '1c000000-0000-4000-8000-000000000002',
    (select workspace_id from preferred_target),
    '1d000000-0000-4000-8000-000000000001',
    'Xander'
  ),
  'waiting',
  'the next request waits too'
);

select is(
  (select preferred_name from public.employee_profiles
   where id = '1d000000-0000-4000-8000-000000000001'),
  'Alex',
  'and nothing about the record changes while it waits'
);

select is(
  (select requested_name from public.list_pending_preferred_names_service(
    '1c000000-0000-4000-8000-000000000001',
    (select workspace_id from preferred_target)
  )),
  'Xander',
  'the workspace can see what it has been asked'
);

-- Refused: the name disappears and the person is not told, because being told
-- would make a refusal a conversation the workspace did not choose to have.
select public.decide_employee_preferred_name_service(
  '1c000000-0000-4000-8000-000000000001',
  (select workspace_id from preferred_target),
  (select request_id from public.list_pending_preferred_names_service(
    '1c000000-0000-4000-8000-000000000001',
    (select workspace_id from preferred_target)
  )),
  false
);

select is(
  (select preferred_name from public.employee_profiles
   where id = '1d000000-0000-4000-8000-000000000001'),
  'Alex',
  'a refusal leaves the name that was already there'
);

select is(
  (select count(*)::integer from public.list_pending_preferred_names_service(
    '1c000000-0000-4000-8000-000000000001',
    (select workspace_id from preferred_target)
  )),
  0,
  'and nothing is left waiting'
);
select is(
  (select array_agg(n.title order by n.created_at, n.id) from public.person_notifications n
   where n.type_key = 'people.preferred_name_decided' and n.user_id = '1c000000-0000-4000-8000-000000000002'),
  array['You''ll be called Alex'],
  'S-131: the refusal tells him nothing; only the approval was told'
);

-- Approved: it takes effect.
select public.request_employee_preferred_name_service(
  '1c000000-0000-4000-8000-000000000002',
  (select workspace_id from preferred_target),
  '1d000000-0000-4000-8000-000000000001',
  'Sasha'
);
select public.decide_employee_preferred_name_service(
  '1c000000-0000-4000-8000-000000000001',
  (select workspace_id from preferred_target),
  (select request_id from public.list_pending_preferred_names_service(
    '1c000000-0000-4000-8000-000000000001',
    (select workspace_id from preferred_target)
  )),
  true
);

select is(
  (select preferred_name from public.employee_profiles
   where id = '1d000000-0000-4000-8000-000000000001'),
  'Sasha',
  'an approval is what puts the asked-for name on the record'
);

-- Whose name it is does not depend on who is senior.
select throws_ok(
  $$select public.request_employee_preferred_name_service(
    '1c000000-0000-4000-8000-000000000001',
    (select workspace_id from preferred_target),
    '1d000000-0000-4000-8000-000000000001',
    'Whatever'
  )$$,
  '42501',
  'Not allowed',
  'and nobody asks for somebody else''s preferred name, owner included'
);

-- BL-099, BL-119: a request waits on the people the core lets decide this
-- person's preferred name (employee.decide_preferred_name: in scope, ranked
-- above them, not themselves); each of them finds it among the names waiting.
select tests.world('pn');
select tests.person('pn', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('pn', 'can', 'manager', array['B'], array['cook']);
select tests.person('pn', 'zeynep', 'admin', array['K'], array['cook']);
select tests.person('pn', 'ali', 'employee', array['K'], array['cook']);
select tests.person('pn', 'bob', 'employee', array['K'], array['cook']);
select tests.person('pn', 'deniz', 'employee', array['B'], array['cook']);

-- Who finds this person's request among the names waiting for them.
create function pg_temp.asked(person text) returns text[] language plpgsql as $$
declare who text; found text[] := '{}';
begin
  foreach who in array array['owner', 'ayse', 'can', 'zeynep', 'ali', 'bob', 'deniz'] loop
    begin
      if exists (select 1 from public.list_pending_preferred_names_service(tests.user('pn:' || who), tests.id('pn')) l
                 where l.employee_id = tests.id('pn:' || person)) then
        found := found || who;
      end if;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
  return found;
end $$;
create function pg_temp.pending(target_employee uuid) returns uuid language sql as $$
  select r.id from public.employee_preferred_name_requests r where r.employee_id = target_employee and r.status = 'pending'
$$;
create function pg_temp.name_of(person text) returns text language sql as $$
  select preferred_name from public.employee_profiles where id = tests.id('pn:' || person)
$$;

-- Deniz works at Besiktas: Can, Besiktas's manager, is asked.
select public.request_employee_preferred_name_service(tests.user('pn:deniz'), tests.id('pn'), tests.id('pn:deniz'), 'Den');
select ok('can' = any (pg_temp.asked('deniz')), 'Besiktas''s manager is asked about a Besiktas person''s preferred name');

-- Ali works at Kadikoy.
select public.request_employee_preferred_name_service(tests.user('pn:ali'), tests.id('pn'), tests.id('pn:ali'), 'Al');
select is(pg_temp.asked('ali'), array['owner', 'ayse', 'zeynep'],
  'it asks the owner, Kadikoy''s manager and the admin: not Besiktas''s manager, not a coworker, not Ali');

-- Zeynep, the admin, was asked about Ali; about her own name she is not.
select public.request_employee_preferred_name_service(tests.user('pn:zeynep'), tests.id('pn'), tests.id('pn:zeynep'), 'Zee');
select is(pg_temp.asked('zeynep'), array['owner'],
  'an admin''s own request asks the owner only: not herself, not a manager ranked below her');

-- BL-342: an approval puts the name on the record; a refusal leaves it.
select public.decide_employee_preferred_name_service(tests.user('pn:ayse'), tests.id('pn'), pg_temp.pending(tests.id('pn:ali')), true);
select is(pg_temp.name_of('ali'), 'Al', 'Ayse approves Ali''s name: it is his');
select public.decide_employee_preferred_name_service(tests.user('pn:owner'), tests.id('pn'), pg_temp.pending(tests.id('pn:deniz')), false);
select isnt(pg_temp.name_of('deniz'), 'Den', 'a refused name is not Deniz''s');
-- Nobody ranks above the owner, so the owner's own request does not wait (KK-17).
select is(public.request_employee_preferred_name_service(tests.user('pn:owner'), tests.id('pn'), tests.id('pn:owner'), 'Olly'),
  'published', 'the owner''s own name does not wait for an answer');

-- S-131: no workspace lets a name through on its own; Bob's waits like everyone's.
select is(public.request_employee_preferred_name_service(tests.user('pn:bob'), tests.id('pn'), tests.id('pn:bob'), 'Rob'),
  'waiting', 'a name never takes effect on its own while somebody may decide it');
select is(pg_temp.name_of('bob'), '', 'Bob keeps his name until then');
-- The owner exception holds whoever else drops out (BILDIRIM-U4a review): with Kadikoy's manager missing a
-- required document and the admin's access removed, nobody but the owner may decide, and a request still
-- waits for the owner; it never takes effect on its own.
create temp table required_document (id uuid, preview jsonb);
insert into required_document (id)
select public.save_document_type_lifecycle_service(tests.user('pn:owner'), tests.id('pn'), null, null, jsonb_build_object(
  'title', 'Food handler card', 'description', 'Card', 'requires_review', true, 'accepted_formats', array['pdf'],
  'tracks_expiry', false, 'expiry_warning_days', 30,
  'lifecycle_settings', jsonb_build_object('mode', 'conditional', 'assignment_scope', 'all_active',
    'target', jsonb_build_object('operator', 'and', 'location_ids', '[]'::jsonb, 'department_ids', '[]'::jsonb,
      'job_ids', '[]'::jsonb, 'employee_ids', '[]'::jsonb),
    'period_days', 7, 'suspend_on_overdue', true, 'extra_fields', '[]'::jsonb)));
update required_document set preview = public.preview_document_publication_service(tests.user('pn:owner'), tests.id('pn'), id);
select public.set_document_publication_service(tests.user('pn:owner'), tests.id('pn'), id,
  (preview ->> 'revision')::integer, (preview ->> 'publication_revision')::integer, preview ->> 'preview_token', 'Publish', 'published')
from required_document;
select tests.settle();
-- ponytail: Ayse's deadline is moved into the past by hand; nothing in the product moves the clock.
update public.employee_onboarding_requirements set deadline_at = now() - interval '1 day'
where source_id = (select id from required_document) and lifecycle_user_id = tests.user('pn:ayse');
select public.remove_employee_access_service(tests.user('pn:owner'), tests.id('pn'), tests.id('pn:zeynep'));
select is(public.request_employee_preferred_name_service(tests.user('pn:bob'), tests.id('pn'), tests.id('pn:bob'), 'Bobby'),
  'waiting', 'Bob''s request still waits when only the owner may decide it');
select is((select array_agg(n.user_id = tests.user('pn:owner')) from public.person_notifications n
           where n.type_key = 'people.preferred_name_requested' and n.subject_id = pg_temp.pending(tests.id('pn:bob'))),
  array[true], 'and goes to the owner alone: not Ayse, missing a document, nor Zeynep, whose access was removed');
select is(public.request_employee_preferred_name_service(tests.user('pn:can'), tests.id('pn'), tests.id('pn:can'), 'Cano'),
  'waiting', 'a manager''s own request waits for the owner too');
select is((select array_agg(n.user_id = tests.user('pn:owner')) from public.person_notifications n
           where n.type_key = 'people.preferred_name_requested' and n.subject_id = pg_temp.pending(tests.id('pn:can'))),
  array[true], 'and goes to the owner alone');
-- The setting that let names through is gone with its table (retired_objects_stay_gone).
select hasnt_table('public', 'employee_name_settings', 'the preferred-name setting''s table is gone');
select hasnt_function('public', 'get_employee_name_settings_service', 'its read is gone');
select hasnt_function('public', 'set_employee_name_settings_service', 'its write is gone');

select * from finish();
rollback;

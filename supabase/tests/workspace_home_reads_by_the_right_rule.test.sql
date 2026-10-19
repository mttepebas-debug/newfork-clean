begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- Workspace home (get_workspace_dashboard_service), KK-179 (2) and (5).
--
-- (5) BL-807: a document-expiry to-do is read with the documents rule, the
-- same rule that picks who gets its notification. Ayse (a manager role without
-- document access; the built-in Manager has it since BL-560) no longer sees "Expired employee document · Emre Person";
-- Sena (a manager role with document access) and the owner do. A to-do about
-- Emre that is not about a document still follows the employee rule.
--
-- (2) BL-805: every member has an account row (user_profiles). Nothing made
-- one at sign-up, so an owner who never saved Account > Profile got NULL from
-- the dashboard and the API answered 500. Now the membership opens the row.

select tests.world('h');
select tests.role('h', 'no docs manager', 'manager', array(
  select g.permission_key from public.workspace_role_permissions g
  join public.workspace_roles r on r.id = g.role_id
  where r.workspace_id = tests.id('h') and r.system_key::text = 'manager'
    and g.permission_key not like 'employee_documents.%'
));
select tests.person('h', 'ayse', 'no docs manager', array['K'], array['cook']);
select tests.person('h', 'emre', 'employee', array['K'], array['cook']);
select tests.role('h', 'docs manager', 'manager', array(
  select g.permission_key from public.workspace_role_permissions g
  join public.workspace_roles r on r.id = g.role_id
  where r.workspace_id = tests.id('h') and r.system_key::text = 'manager'
  union select 'employee_documents.read'
));
select tests.person('h', 'sena', 'docs manager', array['K'], array['cook']);

create function pg_temp.u(person text) returns uuid language sql as $$
  select tests.user('h:' || person)
$$;
grant execute on function pg_temp.u(text) to public;

create function pg_temp.todo_titles(person text) returns text[] language sql as $$
  select coalesce(array_agg(t ->> 'title' order by t ->> 'title'), '{}')
  from jsonb_array_elements(
    public.get_workspace_dashboard_service(pg_temp.u(person), tests.id('h')) -> 'todos') t
  where (t ->> 'employee_id')::uuid = tests.id('h:emre')
$$;

-- The rules as they stand: Ayse reads Emre, but not his documents.
select is(app_private.authz_reason(pg_temp.u('ayse'), tests.id('h'), 'employee.read', null, tests.id('h:emre')),
  null, 'Ayse (Manager) reads Emre');
select is(app_private.authz_reason(pg_temp.u('ayse'), tests.id('h'), 'documents.read', null, tests.id('h:emre')),
  'missing_permission', 'Ayse (Manager) has no document access');
select is(app_private.authz_reason(pg_temp.u('sena'), tests.id('h'), 'documents.read', null, tests.id('h:emre')),
  null, 'Sena (docs manager) reads Emre''s documents');

-- Emre's food handler card expired yesterday.
insert into public.document_types (id, workspace_id, title, description, required_at_onboarding, requires_review,
  accepted_formats, tracks_expiry, expiry_warning_days, expiry_schedule_impact, sort_order, created_by)
values (tests.remember('h:doc:type', gen_random_uuid()), tests.id('h'), 'Food handler card', 'Expiring certificate',
  true, false, array['pdf'], true, 14, 'track_only', 90, pg_temp.u('owner'));
update public.document_types set publication_status = 'published' where id = tests.id('h:doc:type');
insert into public.employee_onboarding_requirements (id, workspace_id, case_id, employee_id, kind, source_id, title,
  required, blocks_activation, requires_review, sort_order, status)
select tests.remember('h:doc:requirement', gen_random_uuid()), tests.id('h'), c.id, tests.id('h:emre'), 'document',
  tests.id('h:doc:type'), 'Food handler card', true, true, false, 90, 'completed'
from public.employee_onboarding_cases c where c.employee_id = tests.id('h:emre');
insert into public.employee_documents (id, workspace_id, employee_id, requirement_id, version_number, object_path,
  original_filename, media_type, size_bytes, review_status, expiry_date, uploaded_by)
select tests.remember('h:doc', gen_random_uuid()), tests.id('h'), tests.id('h:emre'), tests.id('h:doc:requirement'), 1,
  tests.id('h') || '/' || tests.id('h:emre') || '/' || tests.id('h:doc:requirement') || '/' || gen_random_uuid() || '.pdf',
  'food-handler.pdf', 'application/pdf', 1024, 'accepted', current_date - 1, pg_temp.u('emre');

-- A to-do about Emre that is not about a document.
select public.create_workspace_todo_service(pg_temp.u('owner'), tests.id('h'), 'Call Emre back', '', tests.id('h:emre'), null);

select is(pg_temp.todo_titles('owner'), array['Call Emre back', 'Expired employee document'],
  'the owner sees the document to-do and the other to-do about Emre');
select is(pg_temp.todo_titles('sena'), array['Call Emre back', 'Expired employee document'],
  'Sena, with document access, sees both');
select is(pg_temp.todo_titles('ayse'), array['Call Emre back'],
  'Ayse, without document access, sees only the to-do that is not about a document');


-- KK-179 (2): every member has an account row.
select is(
  (select count(*)::integer from public.workspace_memberships m
   where m.status in ('active', 'pending_activation')
     and not exists (select 1 from public.user_profiles p where p.user_id = m.user_id)),
  0, 'no member who can open the app is without an account row');

-- Mina signs up (nothing makes an account row) and creates her workspace.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (tests.remember('h:mina:user', gen_random_uuid()), '00000000-0000-0000-0000-000000000000', 'authenticated',
  'authenticated', 'mina.rivera@world.test', '', now(), '{}', '{}', now(), now());
select is((select count(*)::integer from public.user_profiles p where p.user_id = tests.id('h:mina:user')), 0,
  'signing up alone opens no account row');
select tests.remember('h:mina:ws', public.create_owner_workspace_service(tests.id('h:mina:user'), 'Mina''s Diner'));
select is((select p.display_name from public.user_profiles p where p.user_id = tests.id('h:mina:user')), 'mina.rivera',
  'creating her workspace opens Mina''s account row, named from her email');
select isnt(public.get_workspace_dashboard_service(tests.id('h:mina:user'), tests.id('h:mina:ws')), null,
  'Mina opens Workspace: an answer, not nothing (the API turned nothing into a 500)');
select is(public.get_workspace_dashboard_service(tests.id('h:mina:user'), tests.id('h:mina:ws')) ->> 'display_name',
  'mina.rivera', 'Workspace greets Mina by her account name');

-- Leo signs up through an invitation: his row takes the name on his record.
select tests.person('h', 'leo', 'employee', array['K'], array['cook'], 'pending');
delete from public.user_profiles where user_id = tests.user('h:leo');
update auth.users set raw_user_meta_data = '{}' where id = tests.user('h:leo');
select public.accept_employee_invitation_by_id_service(tests.user('h:leo'), tests.id('h:leo:invitation'));
select is((select p.display_name from public.user_profiles p where p.user_id = tests.user('h:leo')), 'Leo Person',
  'accepting an invitation opens the account row with the name on the employee record');

-- Only a membership that can open the app opens a row: suspended and removed do not.
select tests.person('h', 'nora', 'employee', array['K'], array['cook'], 'pending');
delete from public.user_profiles where user_id = tests.user('h:nora');
update public.employee_profiles set user_id = tests.user('h:nora') where id = tests.id('h:nora');
insert into public.workspace_memberships (workspace_id, user_id, status, role_id, employee_role_id)
select legacy.workspace_id::uuid, legacy.user_id::uuid, legacy.status::text::public.membership_status, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values (tests.id('h'), tests.user('h:nora'), 'employee', 'suspended', false)) as legacy(workspace_id, user_id, role, status, all_locations);
update public.workspace_memberships set status = 'removed' where workspace_id = tests.id('h') and user_id = tests.user('h:nora');
select is((select count(*)::integer from public.user_profiles p where p.user_id = tests.user('h:nora')), 0,
  'a suspended or removed membership opens no account row');

-- A row that exists is never renamed by a membership.
update public.user_profiles set display_name = 'Olcay O.' where user_id = pg_temp.u('owner');
update public.workspace_memberships set status = 'active' where user_id = pg_temp.u('owner') and workspace_id = tests.id('h');
select is((select p.display_name from public.user_profiles p where p.user_id = pg_temp.u('owner')), 'Olcay O.',
  'an existing account row keeps its name');

-- A deleted account does not come back through an old membership.
delete from public.user_profiles where user_id = tests.user('h:emre');
insert into public.account_deletion_requests (user_id, status, typed_email, restore_until, completed_at)
values (tests.user('h:emre'), 'completed', '<deleted>', now() - interval '1 day', now());
update public.workspace_memberships set status = 'active' where user_id = tests.user('h:emre');
select is((select count(*)::integer from public.user_profiles p where p.user_id = tests.user('h:emre')), 0,
  'a finished account deletion stays finished');

select * from finish();
rollback;

begin;
-- BL-276 (the rest): Settings > Roles asks the authorization core, not the old
-- permission helper. (Settings > Notifications went with the old notification
-- system, BILDIRIM-06.) Who may do what stays
-- as it was, except that the core says no where the old helper did not look:
-- a closed workspace, and one reason in the hint for every no.
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

-- An answer: 'ok', or the SQLSTATE and the hint.
create function pg_temp.answer(statement text) returns text language plpgsql as $$
declare key text;
begin
 execute statement;
 return 'ok';
exception when others then
 get stacked diagnostics key=pg_exception_hint;
 return sqlstate||' '||coalesce(nullif(key,''),'(no hint)');
end;
$$;
grant execute on function pg_temp.answer(text) to service_role;

-- 1. No function asks the old helper (the setup checklist, its last caller,
-- went in checklist-drop), and every function this moved asks the core.
select is(
  array(select p.proname::text from pg_proc p
        where p.pronamespace in ('public'::regnamespace, 'app_private'::regnamespace)
          and p.prosrc ~ '(^|[^_a-z])service_actor_has_permission\s*\('
        order by 1),
  '{}'::text[],
  'no function asks the old permission helper');
select is(
  array(select p.oid::regprocedure::text from pg_proc p
        where p.oid = any (array[
          'app_private.can_edit_role(uuid,uuid,uuid)',
          'app_private.workspace_has_permission(uuid,text)',
          'public.save_workspace_role_service(uuid,uuid,uuid,text,text,public.workspace_role,text[],timestamp with time zone)',
          'public.delete_workspace_role_service(uuid,uuid,uuid)']::regprocedure[])
          and p.prosrc !~ 'app_private\.(authorize|authz_reason|actor)\('
        order by 1),
  '{}'::text[],
  'every moved function asks the core');
-- 2. The world: the owner, an admin, a manager, an employee, and somebody from
-- another workspace.
select tests.world('ns');
select tests.world('nx');
select tests.person('ns', 'zeynep', 'admin', array['K', 'B'], array['cook']);
select tests.person('ns', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('ns', 'veli', 'employee', array['K'], array['server']);
select tests.role('ns', 'spare', 'manager', array['workspace.read']);
create temp table ids as select
 tests.id('ns') w, tests.user('ns:owner') owner_user, tests.user('ns:zeynep') admin_user, tests.user('ns:ayse') manager_user,
 tests.user('ns:veli') employee_user, tests.user('nx:owner') stranger_user,
 tests.id('ns:role:spare') spare_role,
 (select r.id from public.workspace_roles r where r.workspace_id = tests.id('ns') and r.system_key = 'admin') admin_role,
 (select r.id from public.workspace_roles r where r.workspace_id = tests.id('ns') and r.system_key = 'manager') manager_role;
grant select on ids to service_role;

-- 4. Roles.
create function pg_temp.save_role(actor uuid, role_id uuid, access_class public.workspace_role, keys text[]) returns text language sql as $$
 select pg_temp.answer(format('select public.save_workspace_role_service(%L,%L,%L,%L,'''',%L,%L,%L)',
  actor, (select w from ids), role_id, coalesce((select r.name from public.workspace_roles r where r.id = role_id), 'Try ' || left(gen_random_uuid()::text, 8)),
  access_class, keys, (select r.updated_at from public.workspace_roles r where r.id = role_id)))
$$;
create function pg_temp.manager_keys() returns text[] language sql as $$
 select array(select rp.permission_key from public.workspace_role_permissions rp where rp.role_id = (select manager_role from ids))
$$;

select is(pg_temp.save_role(owner_user, null, 'manager', pg_temp.manager_keys()), 'ok', 'the owner creates a manager role') from ids;
select is(pg_temp.save_role(admin_user, null, 'manager', pg_temp.manager_keys()), 'ok', 'an admin creates a manager role') from ids;
select is(pg_temp.save_role(admin_user, spare_role, 'manager', array['workspace.read']), 'ok', 'an admin edits a manager role') from ids;
select is(pg_temp.save_role(owner_user, admin_role, 'admin', array(select rp.permission_key from public.workspace_role_permissions rp where rp.role_id = admin_role)),
  'ok', 'the owner edits the Admin role') from ids;
select is(pg_temp.save_role(admin_user, admin_role, 'admin', array(select rp.permission_key from public.workspace_role_permissions rp where rp.role_id = admin_role)),
  '42501 authz.rank', 'an admin does not edit the Admin role: rank') from ids;
select is(pg_temp.save_role(owner_user, (select r.id from public.workspace_roles r where r.workspace_id = tests.id('nx') and r.system_key = 'manager'), 'manager', array['workspace.read']),
  '42501 authz.out_of_scope', 'a role of another workspace is out of scope') from ids;
select is(pg_temp.save_role(manager_user, spare_role, 'manager', array['workspace.read']), '42501 authz.missing_permission', 'a manager edits no role') from ids;
select is(pg_temp.save_role(stranger_user, spare_role, 'manager', array['workspace.read']), '42501 authz.not_member', 'somebody from another workspace is not a member') from ids;
select is(pg_temp.answer(format('select public.delete_workspace_role_service(%L,%L,%L)', manager_user, w, spare_role)),
  '42501 authz.missing_permission', 'a manager deletes no role') from ids;
select is(pg_temp.answer(format('select public.delete_workspace_role_service(%L,%L,%L)', admin_user, w, admin_role)),
  '42501 authz.rank', 'an admin does not delete the Admin role') from ids;
select is(pg_temp.answer(format('select public.delete_workspace_role_service(%L,%L,%L)', owner_user, w, gen_random_uuid())),
  '42501 authz.out_of_scope', 'a role that is not there is out of scope') from ids;
-- An admin hands on only what the Admin role holds today.
delete from public.workspace_role_permissions where role_id = (select admin_role from ids) and permission_key = 'schedule.export';
select is(pg_temp.save_role(admin_user, null, 'manager', pg_temp.manager_keys()), '42501 authz.missing_permission',
  'an admin role without schedule.export cannot put it on a manager role') from ids;
select is(pg_temp.save_role(owner_user, null, 'manager', pg_temp.manager_keys()), 'ok', 'the owner still can') from ids;
select is(app_private.can_edit_role(owner_user, w, spare_role), true, 'the owner may edit the spare role') from ids;
select is(app_private.can_edit_role(manager_user, w, spare_role), false, 'a manager may not') from ids;

-- 5. The RLS helper: the same keys, held where the core says.
create function pg_temp.holds(actor uuid, key text) returns boolean language sql as $$
 select tests.as_browser(actor, format('select 1 where public.workspace_has_permission(%L, %L)', (select w from ids), key)) > 0
$$;
select is(pg_temp.holds(owner_user, 'settings.jobs.manage'), true, 'the owner holds settings.jobs.manage') from ids;
select is(pg_temp.holds(admin_user, 'roles.read'), true, 'an admin holds roles.read') from ids;
select is(pg_temp.holds(manager_user, 'settings.jobs.manage'), false, 'a manager does not hold settings.jobs.manage') from ids;
select is(pg_temp.holds(manager_user, 'schedule.read'), true, 'a manager holds what the role grants') from ids;
select is(pg_temp.holds(employee_user, 'settings.jobs.read'), false, 'an employee holds no settings key') from ids;
select is(pg_temp.holds(stranger_user, 'settings.jobs.read'), false, 'somebody from another workspace holds nothing here') from ids;
select is(tests.as_browser(admin_user, format('update public.workspaces set name = name where id = %L', w)), 1,
  'an admin still renames the workspace through the browser') from ids;

-- A member missing a required document holds nothing, as with the old helper.
select tests.world('nd');
select tests.person('nd', 'dora', 'manager', array['K'], array['cook']);
-- ponytail: the deadline is moved into the past by hand, as in schedule_asks_the_core.
create temporary table required_document (id uuid, preview jsonb);
insert into required_document (id)
select public.save_document_type_lifecycle_service(tests.user('nd:owner'), tests.id('nd'), null, null, jsonb_build_object(
  'title', 'Food handler card', 'description', 'Card', 'requires_review', true, 'accepted_formats', array['pdf'],
  'tracks_expiry', false, 'expiry_warning_days', 30,
  'lifecycle_settings', jsonb_build_object('mode', 'conditional', 'assignment_scope', 'all_active',
    'target', jsonb_build_object('operator', 'and', 'location_ids', '[]'::jsonb, 'department_ids', '[]'::jsonb,
      'job_ids', '[]'::jsonb, 'employee_ids', '[]'::jsonb),
    'period_days', 7, 'suspend_on_overdue', true, 'extra_fields', '[]'::jsonb)));
update required_document set preview = public.preview_document_publication_service(tests.user('nd:owner'), tests.id('nd'), id);
select public.set_document_publication_service(tests.user('nd:owner'), tests.id('nd'), id,
  (preview ->> 'revision')::integer, (preview ->> 'publication_revision')::integer, preview ->> 'preview_token', 'Publish', 'published')
from required_document;
select tests.settle();
create function pg_temp.dora_holds(key text) returns boolean language sql as $$
 select tests.as_browser(tests.user('nd:dora'), format('select 1 where public.workspace_has_permission(%L, %L)', tests.id('nd'), key)) > 0
$$;
select is(pg_temp.dora_holds('schedule.read'), true, 'a manager with the document still due holds schedule.read');
update public.employee_onboarding_requirements set deadline_at = now() - interval '1 day'
where source_id = (select id from required_document) and lifecycle_user_id = tests.user('nd:dora');
select is(pg_temp.dora_holds('schedule.read'), false, 'past the deadline without it, nothing');

-- 6. A closed workspace says no, where the old helper said yes.
update public.workspaces set lifecycle_status = 'suspended' where id = tests.id('ns');
select is(pg_temp.save_role(owner_user, spare_role, 'manager', array['workspace.read']), '42501 authz.workspace_closed', 'no role is saved in a closed workspace') from ids;
select is(app_private.can_edit_role(owner_user, w, spare_role), false, 'nor may one be edited') from ids;
select is(pg_temp.holds(owner_user, 'settings.jobs.manage'), false, 'the browser''s catalog writes close with it') from ids;
select is(tests.as_browser(owner_user, format('update public.workspaces set name = name where id = %L', w)), 0,
  'the workspace is not renamed through the browser') from ids;

select * from finish();
rollback;

begin;
-- BL-276 (the rest): Settings > Roles and Settings > Notifications ask the
-- authorization core, not the old permission helper. Who may do what stays
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

-- 1. The old helper is asked by the setup checklist alone (Soru-16, BL-808),
-- and every function this moved asks the core.
select is(
  array(select p.proname::text from pg_proc p
        where p.pronamespace in ('public'::regnamespace, 'app_private'::regnamespace)
          and p.prosrc ~ '(^|[^_a-z])service_actor_has_permission\s*\('
        order by 1),
  array['get_owner_setup_checklist_progress_service', 'mark_owner_setup_checklist_item_service',
        'set_owner_setup_checklist_closed_service'],
  'only the three setup checklist services still ask the old permission helper');
select is(
  array(select p.oid::regprocedure::text from pg_proc p
        where p.oid = any (array[
          'app_private.can_edit_role(uuid,uuid,uuid)',
          'app_private.workspace_has_permission(uuid,text)',
          'public.save_workspace_role_service(uuid,uuid,uuid,text,text,public.workspace_role,text[],timestamp with time zone)',
          'public.delete_workspace_role_service(uuid,uuid,uuid)',
          'public.get_notification_settings_service(uuid,uuid)',
          'public.save_notification_policy_service(uuid,uuid,text,integer,text,uuid,integer,boolean,text[],text,text)',
          'public.reset_notification_policies_service(uuid,uuid,text,text,text)',
          'public.preview_notification_policy_service(uuid,uuid,text,text,uuid)']::regprocedure[])
          and p.prosrc !~ 'app_private\.(authorize|authz_reason|actor)\('
        order by 1),
  '{}'::text[],
  'every moved function asks the core');
select is(
  array(select p.oid::regprocedure::text from pg_proc p
        where p.oid = any (array[
          'public.save_notification_policy_service(uuid,uuid,text,integer,text,uuid,integer,boolean,text[],text,text)',
          'public.reset_notification_policies_service(uuid,uuid,text,text,text)']::regprocedure[])
          and p.prosrc ~ 'all_locations|membership_location_scopes'
        order by 1),
  '{}'::text[],
  'the notification writes keep no scope rule of their own');

-- 2. The world: the owner, an admin, a manager, a manager whose role reads
-- notification settings, an employee, and somebody from another workspace.
select tests.world('ns');
select tests.world('nx');
select tests.person('ns', 'zeynep', 'admin', array['K', 'B'], array['cook']);
select tests.person('ns', 'ayse', 'manager', array['K'], array['cook']);
select tests.role('ns', 'notice reader', 'manager', array(
  select rp.permission_key from public.workspace_role_permissions rp join public.workspace_roles r on r.id = rp.role_id
  where r.workspace_id = tests.id('ns') and r.system_key = 'manager') || array['notifications.settings.read']);
select tests.person('ns', 'nil', 'notice reader', array['K'], array['cook']);
select tests.person('ns', 'veli', 'employee', array['K'], array['server']);
select tests.role('ns', 'spare', 'manager', array['workspace.read']);
create temp table ids as select
 tests.id('ns') w, tests.user('ns:owner') owner_user, tests.user('ns:zeynep') admin_user, tests.user('ns:ayse') manager_user,
 tests.user('ns:nil') reader_user, tests.user('ns:veli') employee_user, tests.user('nx:owner') stranger_user,
 tests.id('ns:role:spare') spare_role,
 (select r.id from public.workspace_roles r where r.workspace_id = tests.id('ns') and r.system_key = 'admin') admin_role,
 (select r.id from public.workspace_roles r where r.workspace_id = tests.id('ns') and r.system_key = 'manager') manager_role;
grant select on ids to service_role;

create function pg_temp.read_settings(actor uuid) returns text language sql as $$
 select pg_temp.answer(format('select public.get_notification_settings_service(%L,%L)', actor, (select w from ids)))
$$;
create function pg_temp.can_write(actor uuid) returns boolean language sql as $$
 select (public.get_notification_settings_service(actor, (select w from ids)) ->> 'can_write')::boolean
$$;
create function pg_temp.save_policy(actor uuid) returns text language sql as $$
 select pg_temp.answer(format(
  'select public.save_notification_policy_service(%L,%L,''schedule.published'',1,''global'',null,(select p.version from public.notification_org_policies p where p.workspace_id = %L and p.type_key = ''schedule.published'' and p.role_id is null and p.location_id is null),true,array[''in_app''],''immediate'',''Keep publication notices'')',
  actor, (select w from ids), (select w from ids)))
$$;
create function pg_temp.reset(actor uuid) returns text language sql as $$
 select pg_temp.answer(format('select public.reset_notification_policies_service(%L,%L,''all'',null,''Back to the defaults'')', actor, (select w from ids)))
$$;
create function pg_temp.preview(actor uuid) returns text language sql as $$
 select pg_temp.answer(format('select public.preview_notification_policy_service(%L,%L,''schedule.published'',''in_app'',null)', actor, (select w from ids)))
$$;

-- 3. Notification settings: the same people as before, one reason each.
select is(pg_temp.read_settings(owner_user), 'ok', 'the owner reads notification settings') from ids;
select is(pg_temp.read_settings(admin_user), 'ok', 'an admin reads notification settings') from ids;
select is(pg_temp.read_settings(reader_user), 'ok', 'a manager whose role reads notification settings reads them') from ids;
select is(pg_temp.read_settings(manager_user), '42501 authz.missing_permission', 'a manager without the read is told missing_permission') from ids;
select is(pg_temp.read_settings(employee_user), '42501 authz.missing_permission', 'an employee is told missing_permission') from ids;
select is(pg_temp.read_settings(stranger_user), '42501 authz.not_member', 'somebody from another workspace is not a member') from ids;
select is(pg_temp.can_write(owner_user), true, 'the owner may change them') from ids;
select is(pg_temp.can_write(admin_user), true, 'an admin may change them') from ids;
select is(pg_temp.can_write(reader_user), false, 'the reading manager may not') from ids;

select is(pg_temp.save_policy(admin_user), 'ok', 'an admin saves a workspace policy') from ids;
select is(pg_temp.save_policy(owner_user), 'ok', 'the owner saves it again') from ids;
select is(pg_temp.save_policy(reader_user), '42501 authz.missing_permission', 'the reading manager cannot save one') from ids;
select is(pg_temp.save_policy(employee_user), '42501 authz.missing_permission', 'an employee cannot') from ids;
select is(pg_temp.answer(format(
  'select public.save_notification_policy_service(%L,%L,''schedule.published'',1,''role'',%L,null,true,array[''in_app''],''immediate'',''For a stranger role'')',
  owner_user, w, (select r.id from public.workspace_roles r where r.workspace_id = tests.id('nx') and r.system_key = 'manager'))),
  '42501 authz.out_of_scope', 'a role of another workspace is out of scope') from ids;
select is(pg_temp.answer(format(
  'select public.save_notification_policy_service(%L,%L,''schedule.published'',1,''location'',%L,null,true,array[''in_app''],''immediate'',''For a stranger location'')',
  owner_user, w, tests.id('nx:K'))),
  '42501 authz.out_of_scope', 'a location of another workspace is out of scope') from ids;
select is(pg_temp.answer(format(
  'select public.save_notification_policy_service(%L,%L,''schedule.published'',1,''location'',%L,null,true,array[''in_app''],''immediate'',''For Kadikoy'')',
  admin_user, w, tests.id('ns:K'))),
  'ok', 'an admin saves a policy for a location') from ids;

select is(pg_temp.reset(reader_user), '42501 authz.missing_permission', 'the reading manager cannot reset policies') from ids;
select is(pg_temp.reset(admin_user), 'ok', 'an admin resets them') from ids;

select is(pg_temp.preview(owner_user), 'ok', 'the owner previews a test send') from ids;
select is(pg_temp.preview(admin_user), 'ok', 'an admin previews a test send') from ids;
select is(pg_temp.preview(reader_user), '42501 authz.missing_permission', 'the reading manager cannot') from ids;
select is(pg_temp.answer(format('select public.preview_notification_policy_service(%L,%L,''schedule.published'',''in_app'',%L)',
  admin_user, w, owner_user)), '42501 authz.out_of_scope', 'a preview is only ever for oneself') from ids;
-- The test send is its own permission: an admin role without it, settings
-- write or not, previews nothing (the old helper's rule, kept).
delete from public.workspace_role_permissions where role_id = (select admin_role from ids) and permission_key = 'notifications.test_send';
select is(pg_temp.preview(admin_user), '42501 authz.missing_permission', 'an admin role without the test send permission previews nothing') from ids;
select is(pg_temp.save_policy(admin_user), 'ok', 'and still saves policies') from ids;

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
select is(pg_temp.save_role(admin_user, null, 'manager', pg_temp.manager_keys()), '42501 (no hint)',
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

-- 6. A closed workspace says no, where the old helper said yes.
update public.workspaces set lifecycle_status = 'suspended' where id = tests.id('ns');
select is(pg_temp.read_settings(admin_user), '42501 authz.workspace_closed', 'notification settings are closed with the workspace') from ids;
select is(pg_temp.save_policy(owner_user), '42501 authz.workspace_closed', 'no policy is saved in a closed workspace') from ids;
select is(pg_temp.save_role(owner_user, spare_role, 'manager', array['workspace.read']), '42501 authz.workspace_closed', 'no role is saved in a closed workspace') from ids;
select is(app_private.can_edit_role(owner_user, w, spare_role), false, 'nor may one be edited') from ids;
select is(pg_temp.holds(owner_user, 'settings.jobs.manage'), false, 'the browser''s catalog writes close with it') from ids;
select is(tests.as_browser(owner_user, format('update public.workspaces set name = name where id = %L', w)), 0,
  'the workspace is not renamed through the browser') from ids;

select * from finish();
rollback;

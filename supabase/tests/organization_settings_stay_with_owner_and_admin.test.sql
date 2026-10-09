begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- GUVENLIK-A GA-2 (BL-178). KARARLAR K14 S2 and "Manager tipi rollere
-- organizasyon ayarı yazma izni verilemez": the organization-wide Edit
-- permissions and roles.read stay with the owner and admin roles. Settings >
-- Roles cannot put them on a manager or employee role, not even when the role
-- already carries one; the organization reads stay grantable (K14 S1).

select tests.world('os');
select tests.person('os', 'zeynep', 'admin', array['K', 'B'], array['cook']);
select tests.person('os', 'ayse', 'manager', array['K'], array['cook']);

-- The ten permissions with the reads each one needs (Invitations & access Edit
-- needs roles.read, so it stays with owner and admin too).
create temporary table os_org (key text primary key, needs text[]);
insert into os_org values
  ('settings.general.manage', array['settings.general.read']),
  ('settings.locations.manage', array['settings.locations.read']),
  ('settings.jobs.manage', array['settings.jobs.read']),
  ('settings.shift_catalog.manage', array['settings.shift_catalog.read']),
  ('settings.schedule_rules.manage', array['settings.schedule_rules.read']),
  ('documents.manage', array['documents.read']),
  ('notifications.settings.write', array['notifications.settings.read']),
  ('schedule.conflict_rules.manage', array['settings.schedule_rules.read']),
  ('roles.read', array[]::text[]),
  ('employee_access.manage', array['employees.read', 'employee_access.read', 'roles.read']);

-- A save's answer: 'ok', or the SQLSTATE and the authz hint.
create function pg_temp.save(actor uuid, access_class public.workspace_role, keys text[], role_id uuid default null)
returns text language plpgsql as $$
declare hint text;
begin
  perform public.save_workspace_role_service(
    actor, tests.id('os'), role_id, 'Try ' || left(gen_random_uuid()::text, 8), '', access_class,
    array['workspace.read'] || keys,
    (select r.updated_at from public.workspace_roles r where r.id = role_id));
  return 'ok';
exception when others then
  get stacked diagnostics hint = pg_exception_hint;
  return sqlstate || ' ' || coalesce(hint, '');
end $$;

select set_eq(
  $$select key from public.permissions where not custom_grantable$$,
  $$select key from os_org union values ('roles.manage'), ('workspace.manage'), ('notifications.broadcast.approve'),
    ('notifications.delivery_audit.read'), ('notifications.dlq.replay'), ('notifications.test_send')$$,
  'the organization Edit permissions and roles.read are not grantable to a custom role');

select is(
  (select array_agg(key order by key) from os_org where pg_temp.save(tests.user('os:owner'), 'manager', needs || key) <> '42501 authz.rank'),
  null,
  'the owner cannot put any of them on a new manager role; the refusal is 42501 with authz.rank');

select is(
  (select array_agg(key order by key) from os_org where pg_temp.save(tests.user('os:zeynep'), 'manager', needs || key) <> '42501 authz.rank'),
  null,
  'an admin cannot either');

select is(
  pg_temp.save(tests.user('os:owner'), 'manager',
    array['settings.general.read', 'settings.locations.read', 'settings.jobs.read', 'settings.shift_catalog.read',
          'settings.schedule_rules.read', 'documents.read', 'notifications.settings.read']),
  'ok',
  'the organization reads stay grantable to a manager role (K14 S1)');

-- A role that already carries one (written before this rule) is not let through on its next save.
select tests.role('os', 'Old grant', 'manager', array['workspace.read', 'settings.general.read']);
insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
values (tests.id('os'), tests.id('os:role:Old grant'), 'settings.general.manage');
select is(
  pg_temp.save(tests.user('os:owner'), 'manager', array['settings.general.read', 'settings.general.manage'], tests.id('os:role:Old grant')),
  '42501 authz.rank',
  'a role that already carries General Edit cannot be saved with it again');
select is(
  pg_temp.save(tests.user('os:owner'), 'manager', array['settings.general.read'], tests.id('os:role:Old grant')),
  'ok',
  'the owner can save that role without it');

select is(
  pg_temp.save(tests.user('os:owner'), 'admin',
    (select array_agg(p.permission_key) from public.workspace_role_permissions p
     join public.workspace_roles r on r.id = p.role_id
     where r.workspace_id = tests.id('os') and r.system_key = 'admin' and p.permission_key <> 'workspace.read'),
    (select r.id from public.workspace_roles r where r.workspace_id = tests.id('os') and r.system_key = 'admin')),
  'ok',
  'the admin role keeps them: the owner saves it unchanged');

select is(
  (select count(distinct p.permission_key)::integer from public.workspace_role_permissions p
   join public.workspace_roles r on r.id = p.role_id
   where r.workspace_id = tests.id('os') and r.system_key = 'admin' and p.permission_key in (select key from os_org)),
  10,
  'the admin role holds all ten');

select is(
  (select count(*)::integer from public.workspace_role_permissions p
   join public.workspace_roles r on r.id = p.role_id
   where r.access_class in ('manager', 'employee') and p.permission_key in (select key from os_org)),
  0,
  'no manager or employee role holds any of them');

select * from finish();
rollback;

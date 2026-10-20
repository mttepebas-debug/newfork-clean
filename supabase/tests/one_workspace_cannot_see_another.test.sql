begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- S17 from the joining plan. An account in two workspaces reads one of them at
-- a time, and the other has to be invisible while they do — not filtered by the
-- screen, but absent from what the database will hand over.
--
-- workspace_rls covers the policies themselves in detail. What nothing measured
-- is the shape this whole mission is about: the same person, two workspaces,
-- and a row from each of the tables the joining chain touches.
--
-- employee_profiles and employee_invitations are left out on purpose. Reading
-- either directly as this role errors before any policy decides anything, for
-- a reason that has nothing to do with which workspace they belong to: their
-- policies call a function the role cannot execute. See SEC-002.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('21000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'both-ways@example.test', '', '{}', '{}', now(), now()),
  ('21000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'elsewhere-owner@example.test', '', '{}', '{}', now(), now());

insert into public.user_profiles (user_id, display_name)
values
  ('21000000-0000-4000-8000-000000000001', 'Both Ways'),
  ('21000000-0000-4000-8000-000000000002', 'Elsewhere Owner');

create temporary table sides on commit drop as
select
  public.create_owner_workspace_service(
    '21000000-0000-4000-8000-000000000001', 'Mine Co'
  ) as mine,
  public.create_owner_workspace_service(
    '21000000-0000-4000-8000-000000000002', 'Theirs Co'
  ) as theirs;

insert into public.locations (
  id, workspace_id, name, short_name, street_address, city, region,
  postal_code, timezone
)
values
  ('22000000-0000-4000-8000-000000000001', (select mine from sides), 'My Room', 'MR', '1 Mine St', 'Oakland', 'CA', '94601', 'America/Los_Angeles'),
  ('22000000-0000-4000-8000-000000000002', (select theirs from sides), 'Their Room', 'TR', '2 Theirs St', 'Oakland', 'CA', '94601', 'America/Los_Angeles');

insert into public.employee_profiles (id, workspace_id, employee_code, first_name, last_name, created_by)
values
  ('23000000-0000-4000-8000-000000000001', (select mine from sides), 'E-7201', 'Someone', 'Mine', '21000000-0000-4000-8000-000000000001'),
  ('23000000-0000-4000-8000-000000000002', (select theirs from sides), 'E-7202', 'Someone', 'Theirs', '21000000-0000-4000-8000-000000000002');

insert into public.employee_location_assignments (workspace_id, employee_id, location_id, is_primary, created_by)
values
  ((select mine from sides), '23000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', true, '21000000-0000-4000-8000-000000000001'),
  ((select theirs from sides), '23000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000002', true, '21000000-0000-4000-8000-000000000002');

select public.prepare_employee_invitation_service(
  '21000000-0000-4000-8000-000000000002',
  (select theirs from sides),
  '23000000-0000-4000-8000-000000000002',
  'somebody-there@example.test',
  (select id from public.workspace_roles
   where workspace_id = (select theirs from sides) and system_key = 'employee'), null, '{}'::uuid[],
  encode(extensions.digest('token-theirs', 'sha256'), 'hex'),
  now() + interval '7 days'
);

grant select on sides to authenticated;

-- Read as the person who owns Mine Co and has nothing to do with Theirs Co.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '21000000-0000-4000-8000-000000000001', true
);

select is(
  (select count(*)::integer from public.workspaces
   where id = (select mine from sides)),
  1,
  'their own workspace is there to read'
);

select is(
  (select count(*)::integer from public.workspaces
   where id = (select theirs from sides)),
  0,
  'and the other one is not a row they can see at all'
);

select is(
  (select count(*)::integer from public.workspace_memberships
   where workspace_id = (select theirs from sides)),
  0,
  'nor who is in it'
);

select is(
  (select count(*)::integer from public.locations
   where workspace_id = (select theirs from sides)),
  0,
  'nor where it works'
);

-- And their own side is not hidden from them by the same rules.
select is(
  (select count(*)::integer from public.locations
   where workspace_id = (select mine from sides)),
  1,
  'while their own side is all there'
);

select is(
  (select count(*)::integer from public.workspace_memberships
   where workspace_id = (select mine from sides)),
  1,
  'including who is in it'
);

reset role;

select * from finish();
rollback;

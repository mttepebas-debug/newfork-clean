begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- S7 and S11 from the joining plan, which nothing had measured.
--
-- S7: two workspaces invite the same person. Accepting one must leave the other
-- exactly where it was — an invitation is between one workspace and one
-- account, and accepting is not an answer to anybody else's question.
--
-- S11: an invitation arrives while that person is in the middle of setting up
-- a workspace of their own. Neither is allowed to cancel the other.
--
-- Its own fixture, so it says what it measures whatever else the database
-- happens to hold.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('1e000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'two-invites-first@example.test', '', '{}', '{}', now(), now()),
  ('1e000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'two-invites-second@example.test', '', '{}', '{}', now(), now()),
  ('1e000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'two-invites-joiner@example.test', '', '{}', '{}', now(), now());
-- These accounts have confirmed their address; accepting an invitation asks for it (SEC-003).
update auth.users set email_confirmed_at = now() where id::text like '1e000000-%' and email_confirmed_at is null;

insert into public.user_profiles (user_id, display_name)
values
  ('1e000000-0000-4000-8000-000000000001', 'First Owner'),
  ('1e000000-0000-4000-8000-000000000002', 'Second Owner'),
  ('1e000000-0000-4000-8000-000000000003', 'Jordan Reyes');

create temporary table two_workspaces on commit drop as
select
  public.create_owner_workspace_service(
    '1e000000-0000-4000-8000-000000000001', 'First Co'
  ) as first_id,
  public.create_owner_workspace_service(
    '1e000000-0000-4000-8000-000000000002', 'Second Co'
  ) as second_id;

-- A record in each, for the same person, invited by each owner.
insert into public.employee_profiles (id, workspace_id, employee_code, first_name, last_name, created_by)
values
  ('1f000000-0000-4000-8000-000000000001', (select first_id from two_workspaces), 'E-7101', 'Jordan', 'Reyes', '1e000000-0000-4000-8000-000000000001'),
  ('1f000000-0000-4000-8000-000000000002', (select second_id from two_workspaces), 'E-7102', 'Jordan', 'Reyes', '1e000000-0000-4000-8000-000000000002');

-- A workspace cannot invite somebody it has nowhere to put.
insert into public.locations (
  id, workspace_id, name, short_name, street_address, city, region,
  postal_code, timezone
)
values
  ('20000000-0000-4000-8000-000000000001', (select first_id from two_workspaces), 'First Room', 'FR', '1 First St', 'Oakland', 'CA', '94601', 'America/Los_Angeles'),
  ('20000000-0000-4000-8000-000000000002', (select second_id from two_workspaces), 'Second Room', 'SR', '2 Second St', 'Oakland', 'CA', '94601', 'America/Los_Angeles');

insert into public.employee_location_assignments (workspace_id, employee_id, location_id, is_primary, created_by)
values
  ((select first_id from two_workspaces), '1f000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', true, '1e000000-0000-4000-8000-000000000001'),
  ((select second_id from two_workspaces), '1f000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', true, '1e000000-0000-4000-8000-000000000002');

select public.prepare_employee_invitation_service(
  '1e000000-0000-4000-8000-000000000001',
  (select first_id from two_workspaces),
  '1f000000-0000-4000-8000-000000000001',
  'two-invites-joiner@example.test',
  (select id from public.workspace_roles
   where workspace_id = (select first_id from two_workspaces) and system_key = 'employee'), null, '{}'::uuid[],
  encode(extensions.digest('token-first', 'sha256'), 'hex'),
  now() + interval '7 days'
);

select public.prepare_employee_invitation_service(
  '1e000000-0000-4000-8000-000000000002',
  (select second_id from two_workspaces),
  '1f000000-0000-4000-8000-000000000002',
  'two-invites-joiner@example.test',
  (select id from public.workspace_roles
   where workspace_id = (select second_id from two_workspaces) and system_key = 'employee'), null, '{}'::uuid[],
  encode(extensions.digest('token-second', 'sha256'), 'hex'),
  now() + interval '7 days'
);

select is(
  (select count(*)::integer from public.employee_invitations
   where lower(email) = 'two-invites-joiner@example.test' and status = 'pending'),
  2,
  'two workspaces can be waiting on the same person at once'
);

-- S7. Answering one.
select public.accept_employee_invitation_service(
  '1e000000-0000-4000-8000-000000000003',
  encode(extensions.digest('token-first', 'sha256'), 'hex')
);

select is(
  (select status::text from public.employee_invitations
   where workspace_id = (select first_id from two_workspaces)),
  'accepted',
  'accepting one answers that one'
);

select is(
  (select status::text from public.employee_invitations
   where workspace_id = (select second_id from two_workspaces)),
  'pending',
  'and leaves the other exactly where it was'
);

select is(
  (select count(*)::integer from public.workspace_memberships
   where user_id = '1e000000-0000-4000-8000-000000000003'),
  1,
  'joining one workspace joins one workspace'
);

select is(
  (select workspace_id from public.workspace_memberships
   where user_id = '1e000000-0000-4000-8000-000000000003'),
  (select first_id from two_workspaces),
  'and it is the one that was answered'
);

-- The second is still answerable afterwards, which is the point of leaving it.
select public.accept_employee_invitation_service(
  '1e000000-0000-4000-8000-000000000003',
  encode(extensions.digest('token-second', 'sha256'), 'hex')
);

select is(
  (select count(*)::integer from public.workspace_memberships
   where user_id = '1e000000-0000-4000-8000-000000000003'),
  2,
  'the one left waiting can still be answered later'
);

-- S11. The same person starts a workspace of their own, with an invitation
-- from somewhere else still unanswered.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('1e000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mid-setup@example.test', '', '{}', '{}', now(), now());
-- These accounts have confirmed their address; accepting an invitation asks for it (SEC-003).
update auth.users set email_confirmed_at = now() where id::text like '1e000000-%' and email_confirmed_at is null;
insert into public.user_profiles (user_id, display_name)
values ('1e000000-0000-4000-8000-000000000004', 'Sam Mid Setup');

insert into public.employee_profiles (id, workspace_id, employee_code, first_name, last_name, created_by)
values ('1f000000-0000-4000-8000-000000000003', (select first_id from two_workspaces), 'E-7103', 'Sam', 'Setup', '1e000000-0000-4000-8000-000000000001');

insert into public.employee_location_assignments (workspace_id, employee_id, location_id, is_primary, created_by)
values ((select first_id from two_workspaces), '1f000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', true, '1e000000-0000-4000-8000-000000000001');

select public.prepare_employee_invitation_service(
  '1e000000-0000-4000-8000-000000000001',
  (select first_id from two_workspaces),
  '1f000000-0000-4000-8000-000000000003',
  'mid-setup@example.test',
  (select id from public.workspace_roles
   where workspace_id = (select first_id from two_workspaces) and system_key = 'employee'), null, '{}'::uuid[],
  encode(extensions.digest('token-mid', 'sha256'), 'hex'),
  now() + interval '7 days'
);

-- A workspace of their own is refused while somebody is still waiting for an
-- answer. The guard is deliberate: two half-finished ways into the product at
-- once is the state nobody can explain afterwards.
select throws_ok(
  $$select public.create_owner_workspace_service(
    '1e000000-0000-4000-8000-000000000004', 'Half Started Co'
  )$$,
  'pending invitation must be resolved first',
  'a workspace of your own waits until the invitation is answered'
);

select is(
  (select status::text from public.employee_invitations
   where lower(email) = 'mid-setup@example.test'),
  'pending',
  'and being refused does not answer it for them'
);

select public.accept_employee_invitation_service(
  '1e000000-0000-4000-8000-000000000004',
  encode(extensions.digest('token-mid', 'sha256'), 'hex')
);

create temporary table mid_setup on commit drop as
select public.create_owner_workspace_service(
  '1e000000-0000-4000-8000-000000000004', 'Half Started Co'
) as workspace_id;

select is(
  (select count(*)::integer from public.workspace_memberships
   where user_id = '1e000000-0000-4000-8000-000000000004'),
  2,
  'answering it opens the way, and keeps the workspace they joined'
);

select is(
  (select lifecycle_status::text from public.workspaces
   where id = (select workspace_id from mid_setup)),
  'draft',
  'their own one starts unfinished, which is what draft means'
);

select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

-- ROL-CIFT 1.2 (KARARLAR S-164 ... S-169; design §3, §4.2, §4.4, §4.11): the authorization core reads
-- the two access slots. Managing comes from Manages, not from where somebody works; what somebody may do
-- for themselves (offer or take a shift, availability, time off) needs the employee slot.
--
-- ponytail: people are inserted by hand, as in membership_two_access_slots: the test world builds them
-- with the two slots from 1.4 on. Locations, profiles and assignments go in with triggers off, because
-- their triggers still read the dropped membership role until then.

insert into auth.users (id, email, created_at) values
  ('c1200000-0000-4000-8000-000000000001', 'core2-olcay@example.test', now()),
  ('c1200000-0000-4000-8000-000000000002', 'core2-emre@example.test', now()),
  ('c1200000-0000-4000-8000-000000000003', 'core2-mona@example.test', now()),
  ('c1200000-0000-4000-8000-000000000004', 'core2-dora@example.test', now()),
  ('c1200000-0000-4000-8000-000000000005', 'core2-ece@example.test', now()),
  ('c1200000-0000-4000-8000-000000000006', 'core2-fikret@example.test', now()),
  ('c1200000-0000-4000-8000-000000000007', 'core2-ada@example.test', now());
insert into public.workspaces (id, name, created_by, lifecycle_status)
values ('c1200000-0000-4000-8000-000000000101', 'Core Two', 'c1200000-0000-4000-8000-000000000001', 'active');
insert into public.workspace_onboarding (workspace_id, status, current_step, completed_at, updated_by)
values ('c1200000-0000-4000-8000-000000000101', 'complete', 4, now(), 'c1200000-0000-4000-8000-000000000001');

create temporary table slot_role (key text primary key, id uuid not null);
insert into slot_role
select r.system_key::text, r.id from public.workspace_roles r
where r.workspace_id = 'c1200000-0000-4000-8000-000000000101' and r.system_key is not null;

set local session_replication_role = replica;
insert into public.locations (id, workspace_id, name, short_name, street_address, city, region, postal_code, timezone) values
  ('c1200000-0000-4000-8000-000000000201', 'c1200000-0000-4000-8000-000000000101', 'Kadikoy', 'KDK', '1 Moda Cd', 'Istanbul', 'Istanbul', '34710', 'Europe/Istanbul'),
  ('c1200000-0000-4000-8000-000000000202', 'c1200000-0000-4000-8000-000000000101', 'Besiktas', 'BJK', '2 Barbaros Blv', 'Istanbul', 'Istanbul', '34353', 'Europe/Istanbul');
insert into public.departments (id, workspace_id, name, system_key) values
  ('c1200000-0000-4000-8000-000000000301', 'c1200000-0000-4000-8000-000000000101', 'Management', 'management'),
  ('c1200000-0000-4000-8000-000000000302', 'c1200000-0000-4000-8000-000000000101', 'Kitchen', null);
insert into public.jobs (id, workspace_id, department_id, name, system_key, lineup_icons) values
  ('c1200000-0000-4000-8000-000000000401', 'c1200000-0000-4000-8000-000000000101', 'c1200000-0000-4000-8000-000000000301', 'Owner', 'owner', '{}'),
  ('c1200000-0000-4000-8000-000000000402', 'c1200000-0000-4000-8000-000000000101', 'c1200000-0000-4000-8000-000000000301', 'General Manager', null, '{}'),
  ('c1200000-0000-4000-8000-000000000403', 'c1200000-0000-4000-8000-000000000101', 'c1200000-0000-4000-8000-000000000302', 'Cook', null, '{}');
insert into public.employee_profiles (id, workspace_id, user_id, employee_code, first_name, last_name, created_by)
select ('c1200000-0000-4000-8000-00000000060' || n)::uuid, 'c1200000-0000-4000-8000-000000000101',
  ('c1200000-0000-4000-8000-00000000000' || n)::uuid, 'E-00000' || n, name, 'Person', 'c1200000-0000-4000-8000-000000000001'
from (values (1, 'Olcay'), (2, 'Emre'), (3, 'Mona'), (4, 'Dora'), (5, 'Ece'), (6, 'Fikret'), (7, 'Ada')) people(n, name);
-- Works at: Emre Besiktas; Dora, Ece, Fikret and Ada Kadikoy (all as cooks); Mona works nowhere.
insert into public.employee_location_assignments (workspace_id, employee_id, location_id, is_primary, created_by) values
  ('c1200000-0000-4000-8000-000000000101', 'c1200000-0000-4000-8000-000000000602', 'c1200000-0000-4000-8000-000000000202', true, 'c1200000-0000-4000-8000-000000000001'),
  ('c1200000-0000-4000-8000-000000000101', 'c1200000-0000-4000-8000-000000000604', 'c1200000-0000-4000-8000-000000000201', true, 'c1200000-0000-4000-8000-000000000001'),
  ('c1200000-0000-4000-8000-000000000101', 'c1200000-0000-4000-8000-000000000605', 'c1200000-0000-4000-8000-000000000201', true, 'c1200000-0000-4000-8000-000000000001'),
  ('c1200000-0000-4000-8000-000000000101', 'c1200000-0000-4000-8000-000000000606', 'c1200000-0000-4000-8000-000000000201', true, 'c1200000-0000-4000-8000-000000000001'),
  ('c1200000-0000-4000-8000-000000000101', 'c1200000-0000-4000-8000-000000000607', 'c1200000-0000-4000-8000-000000000201', true, 'c1200000-0000-4000-8000-000000000001');
insert into public.employee_job_assignments (workspace_id, employee_id, job_id, is_primary, created_by)
select 'c1200000-0000-4000-8000-000000000101', e, 'c1200000-0000-4000-8000-000000000403', true, 'c1200000-0000-4000-8000-000000000001'
from unnest(array['c1200000-0000-4000-8000-000000000602', 'c1200000-0000-4000-8000-000000000604',
                  'c1200000-0000-4000-8000-000000000605', 'c1200000-0000-4000-8000-000000000606',
                  'c1200000-0000-4000-8000-000000000607']::uuid[]) e;
set local session_replication_role = origin;

insert into public.workspace_memberships (id, workspace_id, user_id, role_id, employee_role_id, status) values
  ('c1200000-0000-4000-8000-000000000501', 'c1200000-0000-4000-8000-000000000101', 'c1200000-0000-4000-8000-000000000001',
   (select id from slot_role where key = 'owner'), null, 'active'),
  ('c1200000-0000-4000-8000-000000000502', 'c1200000-0000-4000-8000-000000000101', 'c1200000-0000-4000-8000-000000000002',
   (select id from slot_role where key = 'manager'), (select id from slot_role where key = 'employee'), 'active'),
  ('c1200000-0000-4000-8000-000000000503', 'c1200000-0000-4000-8000-000000000101', 'c1200000-0000-4000-8000-000000000003',
   (select id from slot_role where key = 'manager'), null, 'active'),
  ('c1200000-0000-4000-8000-000000000504', 'c1200000-0000-4000-8000-000000000101', 'c1200000-0000-4000-8000-000000000004',
   (select id from slot_role where key = 'manager'), (select id from slot_role where key = 'employee'), 'active'),
  ('c1200000-0000-4000-8000-000000000505', 'c1200000-0000-4000-8000-000000000101', 'c1200000-0000-4000-8000-000000000005',
   null, (select id from slot_role where key = 'employee'), 'active'),
  ('c1200000-0000-4000-8000-000000000506', 'c1200000-0000-4000-8000-000000000101', 'c1200000-0000-4000-8000-000000000006',
   (select id from slot_role where key = 'manager'), (select id from slot_role where key = 'employee'), 'active'),
  ('c1200000-0000-4000-8000-000000000507', 'c1200000-0000-4000-8000-000000000101', 'c1200000-0000-4000-8000-000000000007',
   (select id from slot_role where key = 'admin'), (select id from slot_role where key = 'employee'), 'active');
-- Manages: Emre, Mona, Dora and Fikret manage Kadikoy, and nothing else.
-- ponytail: a new manager starts managing where they work until ROL-CIFT 6.3 (manages_follow_works);
-- Manages is set here apart from Works at.
delete from public.membership_managed_locations
where workspace_id = 'c1200000-0000-4000-8000-000000000101';
insert into public.membership_managed_locations (workspace_id, membership_id, location_id)
select 'c1200000-0000-4000-8000-000000000101', m, 'c1200000-0000-4000-8000-000000000201'
from unnest(array['c1200000-0000-4000-8000-000000000502', 'c1200000-0000-4000-8000-000000000503',
                  'c1200000-0000-4000-8000-000000000504', 'c1200000-0000-4000-8000-000000000506']::uuid[]) m;
insert into public.membership_management_jobs (workspace_id, membership_id, job_id) values
  ('c1200000-0000-4000-8000-000000000101', 'c1200000-0000-4000-8000-000000000501', 'c1200000-0000-4000-8000-000000000401');
insert into public.membership_management_jobs (workspace_id, membership_id, job_id)
select 'c1200000-0000-4000-8000-000000000101', m, 'c1200000-0000-4000-8000-000000000402'
from unnest(array['c1200000-0000-4000-8000-000000000502', 'c1200000-0000-4000-8000-000000000503',
                  'c1200000-0000-4000-8000-000000000504', 'c1200000-0000-4000-8000-000000000506',
                  'c1200000-0000-4000-8000-000000000507']::uuid[]) m;

-- Managing comes from Manages ---------------------------------------------------------------------------
select is(
  app_private.scope_set('c1200000-0000-4000-8000-000000000002', 'c1200000-0000-4000-8000-000000000101', 'schedule.edit'),
  array['c1200000-0000-4000-8000-000000000201']::uuid[],
  'Emre manages Kadikoy and works at Besiktas: he edits the Kadikoy schedule only'
);
select is(
  app_private.authz_reason('c1200000-0000-4000-8000-000000000002', 'c1200000-0000-4000-8000-000000000101', 'schedule.edit',
    array['c1200000-0000-4000-8000-000000000202']::uuid[]),
  'out_of_scope',
  'and not the Besiktas one, where he only works'
);
select is(
  app_private.scope_set('c1200000-0000-4000-8000-000000000003', 'c1200000-0000-4000-8000-000000000101', 'schedule.edit'),
  array['c1200000-0000-4000-8000-000000000201']::uuid[],
  'Mona, who works nowhere, manages Kadikoy'
);
select is(
  (app_private.actor('c1200000-0000-4000-8000-000000000001', 'c1200000-0000-4000-8000-000000000101')).manages,
  array['c1200000-0000-4000-8000-000000000201', 'c1200000-0000-4000-8000-000000000202']::uuid[],
  'the owner manages every live location'
);

-- The actor's two slots ---------------------------------------------------------------------------------
select is(
  (select (s.class, s.has_employee, s.works)::text
   from app_private.actor('c1200000-0000-4000-8000-000000000003', 'c1200000-0000-4000-8000-000000000101') s),
  '(manager,f,{})',
  'Mona is a manager with no employee slot and works nowhere'
);
select is(
  (select (s.class, s.has_employee, s.works)::text
   from app_private.actor('c1200000-0000-4000-8000-000000000002', 'c1200000-0000-4000-8000-000000000101') s),
  '(manager,t,{c1200000-0000-4000-8000-000000000202})',
  'Emre is a manager with an employee slot, working at Besiktas'
);
select is(
  (select (s.class, s.has_employee, s.manages)::text
   from app_private.actor('c1200000-0000-4000-8000-000000000005', 'c1200000-0000-4000-8000-000000000101') s),
  '(employee,t,{})',
  'Ece only works: employee class, manages nothing'
);
select ok(
  (select 'schedule.read' = any (s.own_permissions) and not 'schedule.edit' = any (s.own_permissions)
   from app_private.actor('c1200000-0000-4000-8000-000000000004', 'c1200000-0000-4000-8000-000000000101') s),
  'Dora''s own permissions come from her employee role, the employee eligible ones only'
);

-- What one does for oneself needs the employee slot ---------------------------------------------------
select is(
  app_private.authz_reason('c1200000-0000-4000-8000-000000000002', 'c1200000-0000-4000-8000-000000000101', 'exchange.offer_own'),
  null,
  'Emre offers his own shift'
);
select is(
  app_private.authz_reason('c1200000-0000-4000-8000-000000000003', 'c1200000-0000-4000-8000-000000000101', 'exchange.offer_own'),
  'rank',
  'Mona, who only manages, has no shift of her own to offer'
);
select is(
  app_private.authz_reason('c1200000-0000-4000-8000-000000000003', 'c1200000-0000-4000-8000-000000000101', 'availability.own'),
  'rank',
  'nor availability of her own'
);
select is(
  app_private.authz_reason('c1200000-0000-4000-8000-000000000004', 'c1200000-0000-4000-8000-000000000101', 'availability.own'),
  null,
  'Dora, a manager who also works, keeps her availability'
);
select ok(
  app_private.has_employee_access('c1200000-0000-4000-8000-000000000101', 'c1200000-0000-4000-8000-000000000004')
  and not app_private.has_employee_access('c1200000-0000-4000-8000-000000000101', 'c1200000-0000-4000-8000-000000000003'),
  'has_employee_access: Dora yes, Mona no'
);
select is(
  app_private.authz_reason('c1200000-0000-4000-8000-000000000003', 'c1200000-0000-4000-8000-000000000101', 'time_off.request_own'),
  'rank',
  'Mona, who only manages, asks no time off of her own (design §4.10)'
);
select is(
  app_private.authz_reason('c1200000-0000-4000-8000-000000000003', 'c1200000-0000-4000-8000-000000000101', 'exchange.apply_own'),
  'rank',
  'nor takes somebody else''s shift (design §4.4)'
);

-- Rank does not count on the employee side (design §3): a location's manager writes the availability of
-- a peer manager or an admin who works there.
select is(
  app_private.authz_reason('c1200000-0000-4000-8000-000000000004', 'c1200000-0000-4000-8000-000000000101', 'availability.team_write',
    null, 'c1200000-0000-4000-8000-000000000606'),
  null,
  'Dora, Kadikoy''s manager, writes the availability of Fikret, a peer manager who works there'
);
select is(
  app_private.authz_reason('c1200000-0000-4000-8000-000000000004', 'c1200000-0000-4000-8000-000000000101', 'availability.team_write',
    null, 'c1200000-0000-4000-8000-000000000607'),
  null,
  'and of Ada, an admin who works there'
);
select is(
  app_private.authz_reason('c1200000-0000-4000-8000-000000000004', 'c1200000-0000-4000-8000-000000000101', 'availability.team_write',
    null, 'c1200000-0000-4000-8000-000000000603'),
  'rank',
  'but not of Mona, who has no employee slot and so no availability'
);

-- The helpers outside the core read the slots too ----------------------------------------------------
-- Row level security on locations (can_access_location): a manager reaches their Manages.
create temporary table seen_locations (location_id uuid);
grant insert on seen_locations to authenticated;
select tests.as_browser('c1200000-0000-4000-8000-000000000003',
  'insert into pg_temp.seen_locations select id from public.locations where workspace_id = ''c1200000-0000-4000-8000-000000000101''');
select is(
  (select array_agg(location_id order by location_id) from seen_locations),
  array['c1200000-0000-4000-8000-000000000201']::uuid[],
  'Mona, who manages Kadikoy and works nowhere, reads Kadikoy and not Besiktas'
);
-- The permission check services use: an employee slot's own permissions.
select ok(
  public.service_actor_has_permission('c1200000-0000-4000-8000-000000000005', 'c1200000-0000-4000-8000-000000000101', 'schedule.read'),
  'Ece, who only works, reads the schedule through her employee role'
);
select ok(
  not public.service_actor_has_permission('c1200000-0000-4000-8000-000000000005', 'c1200000-0000-4000-8000-000000000101', 'schedule.edit'),
  'and does not edit it'
);
-- Ownership transfer and a new workspace ask the core who owns (ROL-CIFT 1.4): the owner, not an admin
-- who works or a manager, searches for whom to hand over to and cancels a handover; somebody who works
-- in an open workspace without owning one does not start another.
create function pg_temp.said(statement text) returns text language plpgsql as $$
declare code text; hint text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics code = returned_sqlstate, hint = pg_exception_hint;
  return code || coalesce(' ' || nullif(hint, ''), '');
end;
$$;
select is(pg_temp.said($q$select count(*) from public.search_workspace_ownership_candidates_service(
    'c1200000-0000-4000-8000-000000000001', 'c1200000-0000-4000-8000-000000000101', 'Person')$q$),
  'allowed', 'the owner searches for whom to hand the workspace to');
select is(pg_temp.said($q$select count(*) from public.search_workspace_ownership_candidates_service(
    'c1200000-0000-4000-8000-000000000007', 'c1200000-0000-4000-8000-000000000101', 'Person')$q$),
  '42501 workspace.owner_required', 'Ada, an admin who works, does not');
select is(pg_temp.said($q$select public.cancel_workspace_ownership_transfer_service(
    'c1200000-0000-4000-8000-000000000003', 'c1200000-0000-4000-8000-000000000101', gen_random_uuid())$q$),
  '42501 workspace.owner_required', 'Mona, a manager, cancels no handover');
select is(pg_temp.said($q$select public.cancel_workspace_ownership_transfer_service(
    'c1200000-0000-4000-8000-000000000001', 'c1200000-0000-4000-8000-000000000101', gen_random_uuid())$q$),
  '02000 transfer.not_found', 'the owner passes the owner check and finds no such handover');
select is(pg_temp.said($q$select public.create_owner_workspace_service('c1200000-0000-4000-8000-000000000004', 'Dora Co')$q$),
  '42501', 'Dora, who works in an open workspace she does not own, starts no workspace of her own');
select is(pg_temp.said($q$select public.create_owner_workspace_service('c1200000-0000-4000-8000-000000000001', 'Olcay Two')$q$),
  'allowed', 'the owner starts another');

-- Closing the workspace and starting a handover ask the core too (ROL-CIFT 1.4): only the owner closes
-- or cancels a closing, and only an admin is handed the workspace.
select is(pg_temp.said($q$select public.request_workspace_closure_service('c1200000-0000-4000-8000-000000000007',
    'c1200000-0000-4000-8000-000000000101', 'scheduled_end_period', null, true, now() + interval '3 days')$q$),
  '42501 workspace.owner_required', 'Ada, an admin who works, does not close the workspace');
select is(pg_temp.said($q$select public.request_workspace_closure_service('c1200000-0000-4000-8000-000000000001',
    'c1200000-0000-4000-8000-000000000101', 'scheduled_end_period', null, true, now() + interval '3 days')$q$),
  'allowed', 'the owner closes it later');
select is(pg_temp.said($q$select public.cancel_workspace_closure_service('c1200000-0000-4000-8000-000000000004',
    'c1200000-0000-4000-8000-000000000101')$q$),
  '42501 workspace.owner_required', 'Dora, a manager who works, does not cancel the closing');
select is(pg_temp.said($q$select public.cancel_workspace_closure_service('c1200000-0000-4000-8000-000000000001',
    'c1200000-0000-4000-8000-000000000101')$q$),
  'allowed', 'the owner cancels it');
select is(pg_temp.said($q$select public.initiate_workspace_ownership_transfer_service('c1200000-0000-4000-8000-000000000001',
    'c1200000-0000-4000-8000-000000000101', 'c1200000-0000-4000-8000-000000000003')$q$),
  '23514 transfer.target_not_admin', 'the workspace is not handed to Mona, a manager');
select isnt(pg_temp.said($q$select public.initiate_workspace_ownership_transfer_service('c1200000-0000-4000-8000-000000000001',
    'c1200000-0000-4000-8000-000000000101', 'c1200000-0000-4000-8000-000000000007')$q$),
  '23514 transfer.target_not_admin', 'Ada, an admin who also works, passes the admin check');

-- The workspace context the API reads names both slots (ROL-CIFT 1.5).
select is(
  (select (c.management_access, c.employee_access)::text
   from public.resolve_workspace_context_service('c1200000-0000-4000-8000-000000000004', 'c1200000-0000-4000-8000-000000000101') c),
  '(manager,t)', 'Dora''s context: a manager who works');
select is(
  (select (c.management_access, c.employee_access)::text
   from public.resolve_workspace_context_service('c1200000-0000-4000-8000-000000000003', 'c1200000-0000-4000-8000-000000000101') c),
  '(manager,f)', 'Mona''s context: a manager only');
select is(
  (select (c.management_access, c.employee_access)::text
   from public.resolve_workspace_context_service('c1200000-0000-4000-8000-000000000005', 'c1200000-0000-4000-8000-000000000101') c),
  '(,t)', 'Ece''s context: an employee only');

-- One role placed in the two slots (an invitation reopening a suspended account, a role change, a
-- restored access) never makes an owner: only an ownership transfer does.
select is(pg_temp.said($q$select app_private.place_single_role('c1200000-0000-4000-8000-000000000503',
    (select id from slot_role where key = 'owner'))$q$),
  '42501 authz.missing_permission', 'Mona is not made the owner by placing a role');

select hasnt_function('app_private', 'ranks_as_employee', 'ranks_as_employee is gone; has_employee_access reads the slot');

select * from finish();
rollback;

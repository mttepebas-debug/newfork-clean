begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- BL-1069 (Mert 2026-10-12): a manager who may invite somebody sees that
-- person's invitation, and so its Send reminder / Copy link / Revoke buttons.
-- The drawer gave the invitation only to who reads access
-- (employee_access.read), which the built-in Manager role does not hold: Ayse
-- invited Pia, still read "Ready to invite", and a second Invite took the first
-- link back. The invitation is read by the rule its buttons ask
-- (employee.invite on the person, and a role the reader may give): whoever
-- sent it.

select tests.world('v');
select tests.person('v', 'ayse', 'manager', array['B'], array['cook']);
select tests.person('v', 'zeynep', 'admin', array['K', 'B'], array['cook']);
-- Invited by the owner as an employee, not accepted yet.
select tests.person('v', 'pia', 'employee', array['B'], array['cook'], 'pending');
-- Invited by the owner as a manager: no manager hands that role out.
select tests.person('v', 'mia', 'manager', array['B'], array['cook'], 'pending');
-- At Kadikoy only, where Ayse does not manage.
select tests.person('v', 'cem', 'employee', array['K'], array['cook'], 'pending');
-- Joined as an employee, a manager at Besiktas since: a fellow manager of Ayse,
-- whose (accepted) invitation is into a role Ayse may give.
select tests.person('v', 'mo', 'employee', array['B'], array['cook']);
update public.workspace_memberships set role_id = (
  select r.id from public.workspace_roles r where r.workspace_id = tests.id('v') and r.system_key = 'manager')
where workspace_id = tests.id('v') and user_id = tests.user('v:mo');
-- He manages Besiktas: Manages is set apart from Works at (DAVET-ERISIM).
insert into public.membership_managed_locations (workspace_id, membership_id, location_id)
select m.workspace_id, m.id, tests.id('v:B') from public.workspace_memberships m
where m.workspace_id = tests.id('v') and m.user_id = tests.user('v:mo');
-- A manager role that reads people but does not invite them.
select tests.role('v', 'Desk', 'manager', array['workspace.read', 'employees.read']);
select tests.person('v', 'can', 'Desk', array['B'], array['cook']);

create function pg_temp.invitation(reader text, person text) returns jsonb language sql as $$
  select public.get_employee_detail_service(tests.user('v:' || reader), tests.id('v'), tests.id('v:' || person)) -> 'invitation'
$$;

-- The manager reads the invitation the owner sent ------------------------------------------

select is(pg_temp.invitation('ayse', 'pia') ->> 'status', 'pending',
  'Ayse, who may invite Pia, reads Pia''s waiting invitation though she does not read access');
select is(pg_temp.invitation('ayse', 'pia') ->> 'email',
  (select i.email from public.employee_invitations i where i.id = tests.id('v:pia:invitation')),
  'with its address');
select is(pg_temp.invitation('ayse', 'pia') ->> 'id', tests.id('v:pia:invitation')::text,
  'it is the invitation her buttons act on');

-- And the one she sent herself ---------------------------------------------------------------

-- ponytail: now() stands still in a transaction; the owner's invitation goes
-- back a minute so Ayse's is the newer one.
update public.employee_invitations set created_at = now() - interval '1 minute'
where id = tests.id('v:pia:invitation');
select public.prepare_employee_invitation_service(
  tests.user('v:ayse'), tests.id('v'), tests.id('v:pia'),
  (select i.email from public.employee_invitations i where i.id = tests.id('v:pia:invitation')),
  (select r.id from public.workspace_roles r where r.workspace_id = tests.id('v') and r.system_key = 'employee'),
  null, '{}'::uuid[],
  encode(extensions.digest('pia-from-ayse', 'sha256'), 'hex'),
  now() + interval '7 days');
select is(pg_temp.invitation('ayse', 'pia') ->> 'invited_by_name', 'Ayse Person',
  'after Ayse sends it again she reads her own invitation, with her name as who sent it');
select is(pg_temp.invitation('ayse', 'pia') ->> 'status', 'pending', 'waiting');

-- What stays hidden --------------------------------------------------------------------------

select is(pg_temp.invitation('ayse', 'mia'), 'null'::jsonb,
  'an invitation into a role Ayse cannot give (Manager) stays hidden: its buttons are not hers');
select is(app_private.can_invite_with_role(tests.user('v:ayse'), tests.id('v'),
    (select i.role_id from public.employee_invitations i where i.id = tests.id('v:mo:invitation'))),
  true, 'Mo was invited into a role Ayse may give');
select is(pg_temp.invitation('ayse', 'mo'), 'null'::jsonb,
  'but Mo is a fellow manager now, whom Ayse may not invite: his invitation stays hidden from her');
select is(pg_temp.invitation('can', 'pia'), 'null'::jsonb,
  'a manager whose role does not invite reads no invitation');
select throws_ok(
  format('select public.get_employee_detail_service(%L, %L, %L)', tests.user('v:ayse'), tests.id('v'), tests.id('v:cem')),
  '42501', null, 'Ayse reads nothing of Cem, who works where she does not manage');

-- Who reads access reads every invitation, as before -----------------------------------------

select is(pg_temp.invitation('owner', 'mia') ->> 'status', 'pending', 'the owner reads Mia''s invitation');
select is(pg_temp.invitation('zeynep', 'mia') ->> 'status', 'pending', 'an admin reads it too');

select * from finish();
rollback;

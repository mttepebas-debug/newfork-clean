begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- Settings > General, "New people wait for approval" (KATILIM-ONAY, KARARLAR S-231, Mert 2026-10-21).
-- On by default. On: somebody who joins finishes onboarding, then waits for a manager's approval. Off:
-- they are in when they finish; a required document in review still holds them. Turning it off lets in
-- the people waiting only for approval; turning it on makes the open cases wait too. Somebody approved
-- never goes back. Only the owner and admins change it.
--
-- The test world turns it off (tests.world), so every other test keeps people who let themselves in.

select tests.world('ja');
select tests.person('ja', 'zeynep', 'admin', array['K'], array['server']);
select tests.person('ja', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('ja', 'emre', 'employee', array['K'], array['cook']);
-- Accepted, onboarding not finished.
select tests.person('ja', 'pia', 'employee', array['K'], array['cook'], 'onboarding');
select tests.person('ja', 'dora', 'employee', array['K'], array['cook'], 'onboarding');
select tests.person('ja', 'can', 'employee', array['K'], array['cook'], 'onboarding');
select tests.world('jx');

create function pg_temp.u(label text) returns uuid language sql as $$ select tests.user(label) $$;
grant execute on function pg_temp.u(text) to public;

create function pg_temp.set(actor text, approval boolean) returns jsonb language sql as $$
  select public.set_onboarding_approval_service(tests.user(actor), tests.id('ja'), approval)
$$;
create function pg_temp.approval() returns boolean language sql as $$
  select (public.get_onboarding_approval_service(tests.user('ja:owner'), tests.id('ja')) ->> 'final_approval_required')::boolean
$$;
create function pg_temp.membership(person text) returns text language sql as $$
  select m.status::text from public.workspace_memberships m
  join public.employee_profiles e on e.workspace_id = m.workspace_id and e.user_id = m.user_id
  where e.id = tests.id('ja:' || person)
$$;
create function pg_temp.waits(person text) returns boolean language sql as $$
  select c.final_approval_required from public.employee_onboarding_cases c where c.employee_id = tests.id('ja:' || person)
$$;
-- The person finishes their onboarding the way the test world's people do (tests.person).
create function pg_temp.finish(person text) returns void language plpgsql as $$
begin
  perform public.save_employee_onboarding_profile_service(
    tests.user('ja:' || person),
    jsonb_build_object(
      'legal_first_name', initcap(person), 'legal_last_name', 'Person',
      'phone', tests.phone('ja:' || person), 'emergency_contact_name', 'Contact',
      'emergency_contact_relationship', 'Friend', 'emergency_contact_phone', '+14155550100'),
    (select c.revision from public.employee_onboarding_cases c where c.employee_id = tests.id('ja:' || person)),
    tests.id('ja'));
  perform public.submit_employee_onboarding_service(
    tests.user('ja:' || person),
    (select c.revision from public.employee_onboarding_cases c where c.employee_id = tests.id('ja:' || person)),
    tests.id('ja'));
  perform tests.settle();
end;
$$;
create function pg_temp.refusal(sql text) returns text language plpgsql as $$
begin
  execute sql;
  return 'allowed';
exception when insufficient_privilege then
  declare h text; begin get stacked diagnostics h = pg_exception_hint; return h; end;
end;
$$;

-- On by default -------------------------------------------------------------------------------------------------

select is(
  (select c.column_default from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'employee_onboarding_settings' and c.column_name = 'final_approval_required'),
  'true', 'a new setting row waits for approval');
delete from public.employee_onboarding_settings where workspace_id = tests.id('jx');
select is(public.employee_onboarding_final_approval_required(tests.id('jx')), true,
  'a workspace that never chose waits for approval');
select is((public.get_onboarding_approval_service(tests.user('jx:owner'), tests.id('jx')) ->> 'final_approval_required')::boolean, true,
  'and its owner reads it on');
select tests.person('jx', 'xena', 'employee', array['K'], array['cook'], 'onboarding');
select is((select c.final_approval_required from public.employee_onboarding_cases c where c.employee_id = tests.id('jx:xena')), true,
  'somebody who joins it waits for approval');

-- Turning it on ---------------------------------------------------------------------------------------------------

select is(pg_temp.approval(), false, 'the test world starts with it off');
select is(pg_temp.set('ja:owner', true), '{"final_approval_required": true}'::jsonb, 'the owner turns it on');
select is(pg_temp.approval(), true, 'and it reads on');
select is(pg_temp.waits('pia'), true, 'somebody still onboarding waits for approval once it is on');

select pg_temp.finish('pia');
select is(pg_temp.membership('pia'), 'pending_activation', 'finishing onboarding does not let them in while it is on');
select is((select c.status::text from public.employee_onboarding_cases c where c.employee_id = tests.id('ja:pia')), 'submitted',
  'their onboarding is finished and waits');

-- Dora's required document is still in review when she finishes.
insert into public.employee_onboarding_requirements(workspace_id, employee_id, case_id, kind, title, required, blocks_activation,
  requires_review, sort_order, source_snapshot, lifecycle_user_id, lifecycle_settings, status)
select c.workspace_id, c.employee_id, c.id, 'document', 'Food handler card', true, true, true, 90,
  '{"accepted_formats":["pdf"],"tracks_expiry":false,"timezone":"America/Los_Angeles"}', tests.user('ja:dora'),
  '{"mode":"required","target":{"location_ids":[],"department_ids":[],"job_ids":[],"employee_ids":[]},"assignment_scope":"all_active","period_days":7,"suspend_on_overdue":false,"extra_fields":[]}',
  'awaiting_review'
from public.employee_onboarding_cases c where c.employee_id = tests.id('ja:dora');
select pg_temp.finish('dora');
select is(pg_temp.membership('dora'), 'pending_activation', 'nor Dora, whose document is in review');

-- Who may change it -----------------------------------------------------------------------------------------------

select is(pg_temp.refusal(format('select public.set_onboarding_approval_service(%L, %L, false)', pg_temp.u('ja:ayse'), tests.id('ja'))),
  'authz.missing_permission', 'a manager does not change it');
select is(pg_temp.refusal(format('select public.set_onboarding_approval_service(%L, %L, false)', pg_temp.u('ja:emre'), tests.id('ja'))),
  'authz.missing_permission', 'nor does an employee');
select is(pg_temp.refusal(format('select public.set_onboarding_approval_service(%L, %L, false)', pg_temp.u('jx:owner'), tests.id('ja'))),
  'authz.not_member', 'nor another workspace''s owner');
select is(pg_temp.refusal(format('select public.set_onboarding_approval_service(%L, %L, false)', pg_temp.u('ja:pia'), tests.id('ja'))),
  'authz.not_active', 'nor somebody not in yet');
select is(pg_temp.approval(), true, 'the refusals changed nothing');
select is(pg_temp.membership('pia'), 'pending_activation', 'and let nobody in');
select is(pg_temp.refusal(format('select public.get_onboarding_approval_service(%L, %L)', pg_temp.u('ja:emre'), tests.id('ja'))),
  'allowed', 'anybody in the workspace reads it');
select is(pg_temp.refusal(format('select public.get_onboarding_approval_service(%L, %L)', pg_temp.u('jx:owner'), tests.id('ja'))),
  'authz.not_member', 'another workspace does not');
select throws_ok($$select pg_temp.set('ja:owner', null)$$, '22023', null, 'a change says on or off');

-- Turning it off --------------------------------------------------------------------------------------------------

select is(pg_temp.set('ja:zeynep', false), '{"final_approval_required": false}'::jsonb, 'an admin turns it off');
select is(pg_temp.approval(), false, 'and it reads off');
select is(pg_temp.membership('pia'), 'active', 'Pia, who was waiting only for approval, is in at once');
select is(
  (select array[c.status::text, (c.approved_by = tests.user('ja:zeynep'))::text] from public.employee_onboarding_cases c
   where c.employee_id = tests.id('ja:pia')),
  array['approved', 'true'], 'let in by whoever turned it off');
select is(
  (select count(*)::integer from public.employee_events ev
   where ev.employee_id = tests.id('ja:pia') and ev.action = 'employee.auto_activated'),
  1, 'the way finishing onboarding lets somebody in');
select is(
  (select array_agg(array[ev.actor_user_id::text, ev.target_type, ev.target_id, ev.metadata ->> 'source'])
   from public.onboarding_events ev
   where ev.employee_id = tests.id('ja:pia') and ev.action = 'onboarding.activate'),
  array[array[pg_temp.u('ja:zeynep')::text, 'onboarding_case',
    (select c.id::text from public.employee_onboarding_cases c where c.employee_id = tests.id('ja:pia')), 'approval_setting_off']],
  'Pia''s onboarding history says she was let in, by whom, the way a manager''s Approve does');
select is(
  (select count(*)::integer from public.onboarding_events ev
   where ev.workspace_id = tests.id('ja') and ev.action = 'onboarding.activate'),
  1, 'one history line for each person let in, none for Dora');
select is(pg_temp.membership('dora'), 'pending_activation', 'Dora still waits for her document');
select is(pg_temp.waits('dora'), false, 'and only for it');
select is(pg_temp.waits('can'), false, 'somebody still onboarding no longer waits for approval');
select is(
  (select count(*)::integer from public.audit_events a
   where a.workspace_id = tests.id('ja') and a.action = 'onboarding.approval_setting_changed'),
  2, 'every change is on the audit trail');

-- On again --------------------------------------------------------------------------------------------------------

-- A new required document for somebody already in.
insert into public.employee_onboarding_requirements(workspace_id, employee_id, case_id, kind, title, required, blocks_activation,
  requires_review, sort_order, source_snapshot, lifecycle_user_id, lifecycle_settings, status)
select c.workspace_id, c.employee_id, c.id, 'document', 'New policy', true, true, true, 91,
  '{"accepted_formats":["pdf"],"tracks_expiry":false,"timezone":"America/Los_Angeles"}', tests.user('ja:pia'),
  '{"mode":"required","target":{"location_ids":[],"department_ids":[],"job_ids":[],"employee_ids":[]},"assignment_scope":"all_active","period_days":7,"suspend_on_overdue":false,"extra_fields":[]}',
  'not_started'
from public.employee_onboarding_cases c where c.employee_id = tests.id('ja:pia');
select pg_temp.set('ja:owner', true);
select is(pg_temp.membership('pia'), 'active', 'somebody approved never goes back to waiting, a new required document neither');
select is((select c.status::text from public.employee_onboarding_cases c where c.employee_id = tests.id('ja:pia')), 'approved',
  'their onboarding stays approved');
select is(pg_temp.waits('can'), true, 'an open case waits again');
select pg_temp.finish('can');
select is(pg_temp.membership('can'), 'pending_activation', 'Can finishes and waits');
select lives_ok(format($$select public.review_employee_onboarding_service(%L, %L, %L, 'activate', null, null, %s, true)$$,
  tests.user('ja:ayse'), tests.id('ja'), tests.id('ja:can'),
  (select c.revision from public.employee_onboarding_cases c where c.employee_id = tests.id('ja:can'))),
  'a manager where Can works approves him');
select is(pg_temp.membership('can'), 'active', 'and he is in');

select * from finish();
rollback;

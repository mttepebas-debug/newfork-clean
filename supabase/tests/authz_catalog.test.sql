begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- How far the database is from one authorization core (FOUNDATION-B stage
-- 2c). Each count is a pattern stage 4 and 6 remove; a ceiling only comes
-- down. Lower it in the same commit that removes the pattern, so nobody adds
-- a new copy of a rule while the old copies are being folded into
-- app_private.authorize(). Measured 2026-09-24 after 20260925000517.

create temporary table core_function as
select p.proname::text as name, p.prosrc as body
from pg_proc p
where p.pronamespace in ('public'::regnamespace, 'app_private'::regnamespace);

-- Reads the signed-in user from the JWT; at the end only app_private.rls_can()
-- (stage 4a), which this count leaves out. FB-6.2.6 dropped can_access_employee (27 -> 25)
-- and can_manage_employee_record (25 -> 24).
select cmp_ok(
  (select count(*)::integer from core_function where body ~ 'auth\.uid\(\)' and name <> 'rls_can'),
  '<=', 24, 'functions that call auth.uid() only go down'
);

-- Pretends to be the caller by writing the JWT subject: the bridges that let a
-- service_role call reuse a browser-era function. Target 0. FB-6.2.3 took
-- Employees' two read bridges (43 -> 41), FB-6.2.4 the four write bridges and
-- the onboarding activation's (41 -> 36), FB-6.2.5 the four invitation services' (36 -> 32),
-- FB-6.2.6 Settings > Jobs' six and catalog deletion's (32 -> 26), the onboarding review's (26 -> 25),
-- BL-475 the department and job reorder command, gone (25 -> 24).
select cmp_ok(
  (select count(*)::integer from core_function where body ~ 'set_config\(\s*''request\.jwt\.claim'),
  '<=', 24, 'functions that write request.jwt.claim only go down'
);

-- Decides scope or rank on its own instead of asking the core. Target 0
-- outside the core. FB-6.2.4: Employees' writes and the membership guard ask
-- the core (59 -> 52); FB-6.2.5 the invitation's role rule and the owner's setup (52 -> 47);
-- FB-6.2.6 Workspace home's counts and the Schedule's week list, BL-155 (47 -> 45), and
-- can_access_employee's two copies (45 -> 43), can_manage_employee_record (43 -> 42),
-- the to-do list's own role reading (42 -> 41).
select cmp_ok(
  (select count(*)::integer from core_function
   where body ~* 'membership_location_scopes|all_locations|access_class\s*(=|in)|\.role\s*(=|<>|in)'),
  '<=', 41, 'functions with their own scope or rank logic only go down'
);

-- Wrapper chains and versioned copies of one entry point. Target 0. FB-6.1 .4
-- folded Schedule's 24 into one function per job (37 -> 13), and with them
-- the grid's own scope reading (60 -> 59 above).
select cmp_ok(
  (select count(*)::integer from core_function where name ~ '(_base|_v[0-9]+|_legacy)(_|$)'),
  '<=', 13, '_base, _vN and _legacy functions only go down'
);

-- Policies that read the JWT themselves rather than through the core.
-- FB-6.2.3: memberships are read through rls_can (11 -> 10).
select cmp_ok(
  (select count(*)::integer from pg_policies
   where schemaname = 'public' and (qual ~ 'auth\.uid' or with_check ~ 'auth\.uid')),
  '<=', 10, 'policies that call auth.uid() only go down'
);

-- Work the product defers to commit. Stage 4b removed the three triggers that
-- copied assignments into manager scope rows (17 -> 14), 5.6 took Line Up's
-- four (14 -> 10); what remains is document assignment, role dependencies and
-- Shift Hub's terms and deadline checks.
select cmp_ok(
  (select count(*)::integer from pg_trigger where not tgisinternal and tgdeferrable),
  '<=', 10, 'deferred triggers only go down'
);

-- The one way to say no: 42501 with an authz.* hint from this list.
select is(
  array(
    select distinct m[1] from core_function, regexp_matches(body, 'hint\s*=\s*''(authz\.[a-z_]+)''', 'g') m
    where m[1] not in (
      'authz.not_member', 'authz.workspace_closed', 'authz.not_active', 'authz.document_blocked',
      'authz.owner_only', 'authz.missing_permission', 'authz.rank', 'authz.out_of_scope'
    )
    order by 1
  ),
  '{}'::text[],
  'every authz hint is one of the eight reasons'
);

-- A 42501 that does not say which reason: every raise statement with 42501
-- and no hint (BL-276). Measured 2026-09-29 on 20260929190000: 255 in 152
-- functions; 253 after FB-6.2.3; 226 after FB-6.2.4; 205 after FB-6.2.5; 189 after FB-6.2.6's
-- jobs, 181 after its dashboard, 177 after its refusals (BL-354),
-- 176 after the onboarding review, 175 after the Workspace layout (KK-36),
-- 173 after the reorder command went (BL-475). Target 0.
select cmp_ok(
  (select count(*)::integer from core_function, regexp_matches(body, 'raise\s[^;]*;', 'gi') m
   where m[1] ~ '42501' and m[1] !~* 'hint'),
  '<=', 173, 'refusals without an authz hint only go down'
);

-- Every action the core answers for, both ways (BL-130): an action added or
-- dropped in a migration fails here until this list, the matrix and the web's
-- twin (packages/shared/src/authorization.ts) say so too.
select is(
  array(select a.key from app_private.authz_actions a order by a.key collate "C"),
  array[
    'account.self', 'announcement.acknowledge', 'announcement.read', 'announcement.write', 'audit.read',
    'availability.note_read', 'availability.own', 'availability.team_read', 'availability.team_write',
    'documents.read', 'documents.review', 'documents.self', 'employee.archive', 'employee.change_role',
    'employee.create', 'employee.decide_preferred_name', 'employee.invite', 'employee.list',
    'employee.make_admin', 'employee.read', 'employee.references.read', 'employee.remove_access',
    'employee.remove_from_location', 'employee.request_preferred_name', 'employee.save',
    'employee.save_own_contact', 'employee.terminate',
    'employee_hub.read', 'employee_hub.self', 'exchange.apply_own', 'exchange.approve', 'exchange.offer_own',
    'exchange.read', 'important_date.write', 'membership.read', 'notifications.read_own', 'onboarding.review',
    'onboarding.self', 'requests.read', 'schedule.edit', 'schedule.export', 'schedule.publish', 'schedule.read',
    'schedule.templates', 'schedule.templates.read', 'settings.availability.read', 'settings.availability.write',
    'settings.catalog.read', 'settings.conflict_rules.write', 'settings.documents.read', 'settings.documents.write',
    'settings.important_dates.read', 'settings.jobs.read', 'settings.jobs.write', 'settings.locations.read',
    'settings.locations.write', 'settings.notifications.read', 'settings.notifications.write',
    'settings.organization.write', 'settings.people', 'settings.people.read', 'settings.roles.read',
    'settings.roles.write',
    'settings.scheduling.write', 'settings.shift_catalog.read', 'settings.signature_templates.read',
    'time_off.decide', 'time_off.request_own', 'workspace.accept_ownership', 'workspace.close',
    'workspace.create', 'workspace.read', 'workspace.setup', 'workspace.todos', 'workspace.transfer_ownership'
  ]::text[],
  'the core answers for exactly these actions'
);

-- The last old person helper answers only for documents and onboarding,
-- which move to the core with FB-6.6 and take it with them (P3). The list
-- only shrinks: nothing else starts asking it.
select is(
  array(
    select p.proname::text from pg_proc p
    where p.pronamespace in ('public'::regnamespace, 'app_private'::regnamespace)
      and p.prosrc ~ '(^|[^_a-z])service_actor_can_access_employee\s*\('
      and p.proname <> 'service_actor_can_access_employee'
      and p.proname not in (
        'apply_lifecycle_definition', 'document_actor_can_read', 'document_definition_target_options_service',
        'document_notification_policy', 'document_publication_can_access', 'document_timezone_admin',
        'enqueue_document_notification', 'extend_employee_document_deadline_service',
        'get_employee_onboarding_review_service', 'preview_employee_document_assignments_service',
        'preview_lifecycle_definition', 'review_employee_document_lifecycle_service',
        'review_employee_onboarding_before_availability_service', 'set_employee_document_exemption_service',
        'sync_expiring_document_todos_service'
      )
    order by 1
  ),
  '{}'::text[],
  'only documents and onboarding still ask service_actor_can_access_employee'
);

select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

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
-- and can_manage_employee_record (25 -> 24), FB-6.7 can_manage_important_date and the
-- important date audit trigger (24 -> 22), FB-6.6 the eleven document and signature functions behind
-- the bridges (22 -> 11).
select cmp_ok(
  (select count(*)::integer from core_function where body ~ 'auth\.uid\(\)' and name <> 'rls_can'),
  '<=', 11, 'functions that call auth.uid() only go down'
);

-- Pretends to be the caller by writing the JWT subject: the bridges that let a
-- service_role call reuse a browser-era function. Target 0. FB-6.2.3 took
-- Employees' two read bridges (43 -> 41), FB-6.2.4 the four write bridges and
-- the onboarding activation's (41 -> 36), FB-6.2.5 the four invitation services' (36 -> 32),
-- FB-6.2.6 Settings > Jobs' six and catalog deletion's (32 -> 26), the onboarding review's (26 -> 25),
-- BL-475 the department and job reorder command, gone (25 -> 24), FB-6.6 the eleven Settings >
-- Documents and Signature templates bridges (24 -> 13), AVATAR-IKON the five job-writing services (13 -> 8).
select cmp_ok(
  (select count(*)::integer from core_function where body ~ 'set_config\(\s*''request\.jwt\.claim'),
  '<=', 8, 'functions that write request.jwt.claim only go down'
);

-- Decides scope or rank on its own instead of asking the core. Target 0
-- outside the core. FB-6.2.4: Employees' writes and the membership guard ask
-- the core (59 -> 52); FB-6.2.5 the invitation's role rule and the owner's setup (52 -> 47);
-- FB-6.2.6 Workspace home's counts and the Schedule's week list, BL-155 (47 -> 45), and
-- can_access_employee's two copies (45 -> 43), can_manage_employee_record (43 -> 42),
-- the to-do list's own role reading (42 -> 41), FB-6.3.3 the time-off notice
-- trigger's membership scopes (41 -> 40), FB-6.7 the announcement helpers, the old inbox read
-- and the announcement matchers (40 -> 32), FB-6.6 the document and onboarding helpers (32 -> 26),
-- FB-6.4 A2 the three Schedule helpers (26 -> 23), BL-276 the notification policy writes (23 -> 21),
-- BILDIRIM-06 the old notification system (21 -> 20). ROL-CIFT 1.4 (20 -> 18): the membership's role
-- and all_locations went with enforce_role_location_scope and service_actor_has_permission's own role
-- reading; ownership transfer, closing the workspace and a new workspace ask the core who owns.
-- app_private.role_class() is the two-slot model's way to ask a role's kind, and "coalesce(x.access_class,
-- ...) into" a way that escaped the pattern, so it counts both.
-- The two-slot model's data rules (which slot a role fits, Manages only for a manager, a Management job
-- for a management access) read a role's kind for integrity, not for a permission: they are named and
-- counted apart below, and leave this count.
create temporary table slot_rule (name text primary key);
insert into slot_rule values
  ('membership_access_slots_hold'), ('managed_location_needs_manager'), ('management_job_holds'),
  ('ensure_management_and_owner'),
  -- ponytail: these two go in ROL-CIFT slices 4 and 6 (6 -> 4)
  ('place_single_role'), ('manages_follow_works');
select cmp_ok(
  (select count(*)::integer from core_function
   where body ~* 'membership_location_scopes|all_locations|access_class\s*(=|in)|\.role\s*(=|<>|in)|role_class\(|coalesce\(\s*[a-z_]+\.access_class[^)]*\)\s*into'
     and name not in (select name from slot_rule)),
  '<=', 18, 'functions with their own scope or rank logic only go down'
);
-- The slot rules: only these, and they only go down too.
select is(
  array(select name from core_function
        where body ~* 'membership_location_scopes|all_locations|access_class\s*(=|in)|\.role\s*(=|<>|in)|role_class\(|coalesce\(\s*[a-z_]+\.access_class[^)]*\)\s*into'
          and name in (select name from slot_rule) order by 1),
  array(select name from slot_rule order by 1),
  'the two-slot data rules read a role''s kind, and nothing else is let off the count'
);
select cmp_ok((select count(*)::integer from slot_rule), '<=', 6, 'the two-slot data rules only go down');

-- Wrapper chains and versioned copies of one entry point. Target 0. FB-6.1 .4
-- folded Schedule's 24 into one function per job (37 -> 13), and with them
-- the grid's own scope reading (60 -> 59 above). FB-6.7 the _legacy announcement publish (13 -> 12).
-- FB-6.4 A1 folded weekly_assignment_candidate_base into app_private.eligibility (12 -> 11).
-- BILDIRIM-06 dropped the old notification system's ten (11 -> 1: request_account_deletion_v2_service).
select cmp_ok(
  (select count(*)::integer from core_function where name ~ '(_base|_v[0-9]+|_legacy)(_|$)'),
  '<=', 1, '_base, _vN and _legacy functions only go down'
);

-- Policies that read the JWT themselves rather than through the core.
-- FB-6.2.3: memberships are read through rls_can (11 -> 10). BILDIRIM-06 the account
-- notification table's (10 -> 9).
select cmp_ok(
  (select count(*)::integer from pg_policies
   where schemaname = 'public' and (qual ~ 'auth\.uid' or with_check ~ 'auth\.uid')),
  '<=', 9, 'policies that call auth.uid() only go down'
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
-- 173 after the reorder command went (BL-475), 171 after the old time-off
-- decision paths went (FB-6.3.7), 161 after announcements and important dates moved to the
-- core (FB-6.7), 111 after documents and onboarding moved (FB-6.6), 100 after the Schedule
-- edit's refusals gave their reason (EKRAN-01 DB-1a; 104 measured before it), 83 after Shift Hub's
-- (FB-6.4 A2), 82 after Settings > Roles' "not eligible for a lower role" (GUVENLIK-A GA-2), 67 after
-- Settings > Roles and Notifications asked the core (BL-276), 57 after the old notification system
-- went (BILDIRIM-06), 46 after the five job-writing services asked the core (AVATAR-IKON). Target 0.
select cmp_ok(
  (select count(*)::integer from core_function, regexp_matches(body, 'raise\s[^;]*;', 'gi') m
   where m[1] ~ '42501' and m[1] !~* 'hint'),
  '<=', 46, 'refusals without an authz hint only go down'
);

-- Every action the core answers for, both ways (BL-130): an action added or
-- dropped in a migration fails here until this list, the matrix and the web's
-- twin (packages/shared/src/authorization.ts) say so too.
select is(
  array(select a.key from app_private.authz_actions a order by a.key collate "C"),
  array[
    'account.self', 'announcement.acknowledge', 'announcement.read', 'announcement.write', 'announcement.write_wide', 'audit.read',
    'availability.note_read', 'availability.own', 'availability.team_read', 'availability.team_write',
    'documents.read', 'documents.review', 'documents.self', 'employee.archive', 'employee.change_role',
    'employee.create', 'employee.decide_preferred_name', 'employee.invite', 'employee.list',
    'employee.make_admin', 'employee.read', 'employee.references.read', 'employee.remove_access',
    'employee.remove_from_location', 'employee.request_preferred_name', 'employee.save',
    'employee.save_own_contact', 'employee.terminate',
    'employee_hub.read', 'employee_hub.self', 'exchange.apply_own', 'exchange.approve', 'exchange.offer_own',
    'exchange.read', 'important_date.write', 'important_date.write_wide', 'lineup.acknowledge', 'lineup.read', 'lineup.share', 'membership.read', 'notifications.read_own', 'notifications.write_own', 'onboarding.legal_name', 'onboarding.review',
    'onboarding.self', 'requests.read', 'schedule.edit', 'schedule.export', 'schedule.publish', 'schedule.read',
    'schedule.templates', 'schedule.templates.read', 'settings.availability.read', 'settings.availability.write',
    'settings.catalog.read', 'settings.conflict_rules.write', 'settings.documents.read', 'settings.documents.write',
    'settings.important_dates.read', 'settings.jobs.read', 'settings.jobs.write', 'settings.locations.read',
    'settings.locations.write',
    'settings.organization.write', 'settings.roles.read',
    'settings.roles.write',
    'settings.scheduling.write', 'settings.shift_catalog.read', 'settings.signature_templates.read',
    'time_off.decide', 'time_off.decide_alone', 'time_off.request_own', 'time_off.revoke', 'workspace.accept_ownership', 'workspace.close',
    'workspace.create', 'workspace.read', 'workspace.setup', 'workspace.todos', 'workspace.transfer_ownership'
  ]::text[],
  'the core answers for exactly these actions'
);

-- The old permission helper: FB-6.6 took documents, signature templates and
-- onboarding off it (30 -> 11), AVAIL-002 the availability settings (11 -> 10),
-- BL-276 Settings > Roles, Settings > Notifications and the RLS helper (10 -> 3).
-- The setup checklist's three wait for who sees the checklist (SORULAR Soru-16,
-- BL-808); when they move, the helper goes. Nothing else starts asking it.
select is(
  array(
    select p.proname::text from pg_proc p
    where p.pronamespace in ('public'::regnamespace, 'app_private'::regnamespace)
      and p.prosrc ~ '(^|[^_a-z])service_actor_has_permission\s*\('
      and p.proname not in ('get_owner_setup_checklist_progress_service', 'mark_owner_setup_checklist_item_service',
        'set_owner_setup_checklist_closed_service')
    order by 1
  ),
  '{}'::text[],
  'the old permission helper is asked by the three setup checklist services alone'
);

-- Every document, signature template and employee onboarding entry point asks
-- the core before anything else (FB-6.6). Not these: the owner's own setup
-- (FB-6.8), background work, and the Schedule's document-conflict predicates.
select is(
  array(
    select p.oid::regprocedure::text from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname like '%\_service'
      and p.proname ~ '(document|onboarding|signature|lifecycle|policy_definition)'
      and p.proname !~ 'owner_onboarding'
      and p.proname not in ('sync_expiring_document_todos_service', 'documents_maintain_service',
        'employee_has_hard_document_schedule_conflict_service', 'schedule_draft_has_hard_document_conflicts_service')
      and coalesce(substring(p.prosrc from '(?i)\mbegin\M\s*(.*)$'), '') !~* '^\s*(perform|if [^;]*then\s+perform) app_private\.authorize\('
    order by 1
  ),
  '{}'::text[],
  'every document and onboarding entry point asks the core first'
);

select * from finish();
rollback;

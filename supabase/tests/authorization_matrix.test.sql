begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- The authorization matrix (FOUNDATION-B stage 2b).
--
-- Every person below tries every action against every target, through the
-- same entry point the API calls, and the answer is compared with
-- pg_temp.expected(). expected() is the one place the product's permission
-- rules are written as code; it never reads the app's own role or scope
-- tables, so it is a specification the app is measured against, not a copy of
-- it. The rules are in docs/plan/REUSE.md, "Ürün kuralları — rol, kapsam,
-- uygunluk"; a rule changes there first, then here, then in the app.
--
-- A cell whose answer is still a product question returns 'decide:<id>' and
-- runs as a pgTAP TODO, so open questions print as a list without failing the
-- suite. A cell where the app is known to break a rule is listed in
-- pg_temp.known() and also runs as TODO; once the app is fixed, the cell fails
-- until its known() row is removed.
--
-- Stage 'legacy': today's ways of saying no all count as no (42501, P0002, a
-- NULL or empty answer). Stage 4 narrows this to 42501 with an authz.* hint.
--
-- Every cell is asked twice: once of the entry point the API calls today, and
-- once of the authorization core (app_private.authz_reason, stage 4). The
-- core has no known gaps: it answers as expected() in every cell that is not
-- an open product question.

-- 1. The world ------------------------------------------------------------------

select tests.world('m');
select tests.world('x');
select tests.person('m', 'zeynep', 'admin', array['K'], array['server']);
select tests.person('m', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('m', 'mehmet', 'manager', array['B'], array['cook']);
select tests.person('m', 'can', 'manager', array['K', 'B'], array['cook']);
select tests.person('m', 'nur', 'manager', null, null);
select tests.role('m', 'shift lead', 'manager', array(
  select rp.permission_key
  from public.workspace_role_permissions rp
  join public.workspace_roles r on r.id = rp.role_id
  where r.workspace_id = tests.id('m') and r.system_key = 'manager'
    and rp.permission_key not in ('employees.manage', 'schedule.publish')
));
select tests.person('m', 'nil', 'shift lead', array['K'], array['cook']);
select tests.person('m', 'ali', 'employee', array['K', 'B'], array['cook', 'server']);
select tests.person('m', 'emre', 'employee', array['K'], array['cook']);
select tests.person('m', 'veli', 'employee', array['B'], array['server']);
select tests.person('m', 'sami', 'manager', array['K'], array['cook'], 'suspended');
select tests.person('m', 'pelin', 'employee', array['K'], array['cook'], 'pending');
select tests.person('m', 'remzi', 'employee', array['B'], array['cook'], 'removed');
select tests.person('m', 'aydan', 'manager', array['K'], array['cook'], 'onboarding');
select tests.person('x', 'xena', 'employee', array['K'], array['cook']);
select tests.time_off('m', 'emre');
select tests.time_off('m', 'veli');
select tests.time_off('m', 'ali');
select tests.time_off('m', 'ayse');
select tests.time_off('m', 'zeynep');
-- A published week (no shift on Wednesday, the day of the time-off requests)
-- and two cover requests Ali has applied to.
select tests.publish_week('m', 0, '[
  {"label": "emre-k", "person": "emre", "loc": "K", "job": "cook",   "day": 1, "start": "09:00", "end": "15:00"},
  {"label": "veli-b", "person": "veli", "loc": "B", "job": "server", "day": 1, "start": "09:00", "end": "15:00"},
  {"label": "ali-k",  "person": "ali",  "loc": "K", "job": "cook",   "day": 4, "start": "09:00", "end": "15:00"},
  {"label": "ayse-k", "person": "ayse", "loc": "K", "job": "cook",   "day": 3, "start": "09:00", "end": "15:00"}
]');
select tests.cover_case('m', 'emre-k', 'emre', 'ali');
select tests.cover_case('m', 'veli-b', 'veli', 'ali');
-- Drafts and templates at one or both locations (REUSE "Taslak ve lokasyon"
-- B3, K-2; M2 publish and export).
-- ponytail: stored as they are; a draft is written by saving a whole edit and
-- a template from a draft, neither of which the rule depends on.
insert into public.schedule_drafts (id, workspace_id, week_start, name, created_by, updated_by, location_ids)
select tests.remember('m:dr:' || d.label, gen_random_uuid()), tests.id('m'), tests.week(2), 'Draft ' || d.label,
  tests.user('m:owner'), tests.user('m:owner'), array(select tests.id('m:' || l) from unnest(d.locs) l)
from (values ('K', array['K']), ('B', array['B']), ('KB', array['K', 'B'])) d(label, locs);
insert into public.schedule_templates (id, workspace_id, name, created_by, updated_by)
select tests.remember('m:tpl:' || t.label, gen_random_uuid()), tests.id('m'), 'Template ' || t.label,
  tests.user('m:owner'), tests.user('m:owner')
from (values ('K'), ('KB')) t(label);
insert into public.schedule_template_shifts (workspace_id, template_id, location_id, job_id, day_offset, start_time, end_time, time_basis)
select tests.id('m'), tests.id('m:tpl:' || t.label), tests.id('m:' || l), tests.id('m:job:cook'), 0, '09:00', '15:00', 'explicit'
from (values ('K', array['K']), ('KB', array['K', 'B'])) t(label, locs), unnest(t.locs) l;

-- 2. Who they are, written down independently of the app ------------------------
-- class: owner | admin | manager | employee. status: active | suspended |
-- invited (no membership yet) | removed | restricted (onboarding not finished).

create temporary table persona (
  label text primary key,
  tenant text not null,
  class text not null,
  status text not null,
  locs text[] not null,
  permissions_removed text[] not null default '{}'
);
insert into persona values
  ('olcay',  'm', 'owner',    'active',     '{K,B}', '{}'),
  ('zeynep', 'm', 'admin',    'active',     '{K}',   '{}'),
  ('ayse',   'm', 'manager',  'active',     '{K}',   '{}'),
  ('mehmet', 'm', 'manager',  'active',     '{B}',   '{}'),
  ('can',    'm', 'manager',  'active',     '{K,B}', '{}'),
  ('nur',    'm', 'manager',  'active',     '{}',    '{}'),
  ('nil',    'm', 'manager',  'active',     '{K}',   '{employees.manage,schedule.publish}'),
  ('ali',    'm', 'employee', 'active',     '{K,B}', '{}'),
  ('emre',   'm', 'employee', 'active',     '{K}',   '{}'),
  ('veli',   'm', 'employee', 'active',     '{B}',   '{}'),
  ('sami',   'm', 'manager',  'suspended',  '{K}',   '{}'),
  ('pelin',  'm', 'employee', 'invited',    '{K}',   '{}'),
  ('remzi',  'm', 'employee', 'removed',    '{B}',   '{}'),
  ('aydan',  'm', 'manager',  'restricted', '{K}',   '{}'),
  ('xavier', 'x', 'owner',    'active',     '{K,B}', '{}');
-- The manager role an owner starts with holds none of the Settings read
-- permissions below (important_dates.read aside); an owner may grant them to a
-- manager-type role (settings_reads_ask_the_core.test.sql).
update persona set permissions_removed = permissions_removed || array[
  'settings.locations.read', 'settings.jobs.read', 'settings.shift_catalog.read',
  'roles.read', 'documents.read', 'signature_templates.read']
where class = 'manager';

create temporary table actor as
select p.label,
  case p.label when 'olcay' then tests.user('m:owner') when 'xavier' then tests.user('x:owner')
    else tests.user('m:' || p.label) end as user_id,
  case p.label when 'olcay' then tests.id('m:owner') when 'xavier' then tests.id('x:owner')
    else tests.id('m:' || p.label) end as employee_id
from persona p;

-- 3. What they act on -------------------------------------------------------------

create temporary table target (
  label text primary key,
  kind text not null,          -- person | location | workspace | time_off
  tenant text not null,
  locs text[],                 -- person: where they work; location: itself (null: none);
                               -- time_off: the requester's primary location
  class text,                  -- person, time_off: the rank of the person it belongs to
  holder text                  -- person, time_off: whose it is
);
insert into target values
  ('emre',       'person',    'm', '{K}',   'employee', 'emre'),
  ('veli',       'person',    'm', '{B}',   'employee', 'veli'),
  ('ali',        'person',    'm', '{K,B}', 'employee', 'ali'),
  ('ayse',       'person',    'm', '{K}',   'manager',  'ayse'),
  ('zeynep',     'person',    'm', '{K}',   'admin',    'zeynep'),
  ('olcay',      'person',    'm', '{K,B}', 'owner',    'olcay'),
  ('xena',       'person',    'x', '{K}',   'employee', 'xena'),
  ('K',          'location',  'm', '{K}',   null,       null),
  ('B',          'location',  'm', '{B}',   null,       null),
  ('x:K',        'location',  'x', '{K}',   null,       null),
  ('none',       'location',  'm', null,    null,       null),
  ('workspace',  'workspace', 'm', null,    null,       null),
  -- Nobody has a published shift on the day, so each request is decided at
  -- the requester's primary location.
  ('to:emre',    'time_off',  'm', '{K}',   'employee', 'emre'),
  ('to:veli',    'time_off',  'm', '{B}',   'employee', 'veli'),
  ('to:ali',     'time_off',  'm', '{K}',   'employee', 'ali'),
  ('to:ayse',    'time_off',  'm', '{K}',   'manager',  'ayse'),
  ('to:zeynep',  'time_off',  'm', '{K}',   'admin',    'zeynep'),
  ('site:K',     'site',      'm', '{K}',   null,       null),
  ('site:B',     'site',      'm', '{B}',   null,       null),
  ('sh:ali-k',   'shift',     'm', '{K}',   'employee', 'ali'),
  ('sh:ayse-k',  'shift',     'm', '{K}',   'manager',  'ayse'),
  ('case:emre-k', 'case',     'm', '{K}',   'employee', 'emre'),
  ('case:veli-b', 'case',     'm', '{B}',   'employee', 'veli'),
  ('dr:K',       'draft',     'm', '{K}',   null,       null),
  ('dr:B',       'draft',     'm', '{B}',   null,       null),
  ('dr:KB',      'draft',     'm', '{K,B}', null,       null),
  -- a template has no location of its own: where its shifts are
  ('tpl:K',      'template',  'm', '{K}',   null,       null),
  ('tpl:KB',     'template',  'm', '{K,B}', null,       null);

create temporary table target_id as
select t.label,
  case
    when t.label = 'olcay' then tests.id('m:owner')
    when t.label = 'xena' then tests.id('x:xena')
    when t.kind = 'person' then tests.id('m:' || t.label)
    when t.label in ('K', 'B') then tests.id('m:' || t.label)
    when t.label = 'x:K' then tests.id('x:K')
    when t.label = 'workspace' then tests.id('m')
    when t.kind = 'time_off' then tests.id('m:' || t.holder || ':time_off')
    when t.kind = 'site' then tests.id('m:' || substr(t.label, 6))
    when t.kind = 'shift' then tests.id('m:shift:' || substr(t.label, 4))
    when t.kind = 'case' then tests.id('m:case:' || substr(t.label, 6))
    when t.kind in ('draft', 'template') then tests.id('m:' || t.label)
  end as id
from target t;

-- 4. The actions, each on the entry point the API calls ---------------------------
-- The template runs with $1 = actor user id, $2 = workspace m, $3 = target id.
-- empty_is_no: a false/0/NULL answer means the actor was not let through (a
-- read that hides the row, or a browser write RLS filtered out).

create temporary table action (
  key text primary key,
  target_kind text not null,
  permission text,             -- the permission key the action needs
  owner_only boolean not null default false,
  empty_is_no boolean not null default false,
  template text not null,
  member boolean not null default false,        -- any active member's own action, not management
  restricted_ok boolean not null default false  -- still open to somebody who has not finished onboarding
);
insert into action (key, target_kind, permission, owner_only, empty_is_no, template) values
  ('employee.read', 'person', 'employees.read', false, true,
   $$select public.get_employee_detail_service($1, $2, $3) is not null$$),
  ('employee.list', 'person', 'employees.read', false, true,
   $$select exists (select 1 from public.list_employees_service($1, $2, false, '', 'all', 500, 0) e where e.id = $3)$$),
  ('employee.save', 'person', 'employees.manage', false, false,
   $$select public.save_employee_service($1, $2, $3,
       e.first_name, e.middle_name, e.last_name, e.preferred_name, e.invitation_email, e.start_date, e.internal_note,
       array(select l.location_id from public.employee_location_assignments l where l.employee_id = e.id and l.ended_at is null),
       (select l.location_id from public.employee_location_assignments l where l.employee_id = e.id and l.ended_at is null and l.is_primary limit 1),
       array(select j.job_id from public.employee_job_assignments j where j.employee_id = e.id and j.ended_at is null),
       (select j.job_id from public.employee_job_assignments j where j.employee_id = e.id and j.ended_at is null and j.is_primary limit 1),
       e.is_remote, e.is_excluded_from_schedule, e.revision) is not null
     from public.employee_profiles e where e.id = $3$$),
  ('availability.team_write', 'person', 'availability.manage', false, true,
   $$select (public.weekly_preferences_read_service($1, $2, $3) ->> 'can_manage')::boolean$$),
  ('availability.team_read', 'person', 'availability.read', false, true,
   $$select public.weekly_preference_manager_scope($1, $2, $3, 'availability.read')$$),
  ('availability.note_read', 'person', 'availability.read', false, true,
   $$select jsonb_typeof(public.weekly_preferences_read_service($1, $2, $3) -> 'manager') = 'object'$$),
  ('employee.terminate', 'person', 'employees.archive', false, false,
   $$select public.terminate_employee_service($1, $2, $3, localtimestamp, 'Europe/Istanbul', 'matrix probe', gen_random_uuid()) is not null$$),
  ('employee.archive', 'person', 'employees.archive', false, false,
   $$select public.set_employee_archived_service($1, $2, $3, true) is not null$$),
  ('employee.remove_access', 'person', 'employees.manage', false, false,
   $$select public.remove_employee_access_service($1, $2, $3) is not null$$),
  ('employee.make_admin', 'person', null, true, false,
   $$select public.update_employee_membership_role_service($1, $2, $3,
       (select r.id from public.workspace_roles r where r.workspace_id = $2 and r.system_key = 'admin')) is not null$$),
  ('employee.make_employee', 'person', 'employees.manage', false, false,
   $$select public.update_employee_membership_role_service($1, $2, $3,
       (select r.id from public.workspace_roles r where r.workspace_id = $2 and r.system_key = 'employee')) is not null$$),
  ('employee.create', 'location', 'employees.manage', false, false,
   $$select public.create_employee_command_service($1, $2, gen_random_uuid(),
       jsonb_build_object('first_name', 'Probe', 'middle_name', '', 'last_name', 'Person', 'preferred_name', '',
         'invitation_email', 'probe.' || gen_random_uuid() || '@world.test', 'start_date', '', 'internal_note', '',
         'location_ids', to_jsonb(array_remove(array[$3], null)), 'primary_location_id', $3,
         'job_ids', case when $3 is null then '[]'::jsonb else to_jsonb(array[(select j.id from public.jobs j where j.workspace_id = $2 order by j.name limit 1)]) end,
         'primary_job_id', case when $3 is null then null else (select j.id from public.jobs j where j.workspace_id = $2 order by j.name limit 1) end,
         'is_remote', $3 is null, 'is_excluded_from_schedule', false, 'expected_revision', null),
       (select r.id from public.workspace_roles r where r.workspace_id = $2 and r.system_key = 'employee')) is not null$$),
  ('schedule.read', 'location', 'schedule.read', false, true,
   $$select exists (select 1 from jsonb_array_elements(public.get_schedule_read_model_service($1, $2, tests.week(0)) -> 'locations') l
     where (l ->> 'id')::uuid = $3)$$),
  ('schedule.edit', 'workspace', 'schedule.manage', false, false,
   $$select public.acquire_schedule_edit_session_service($1, $2, tests.week(5), 'blank') is not null$$),
  ('schedule.templates.read', 'workspace', 'schedule.templates.read', false, false,
   $$select public.list_schedule_templates_service($1, $2) is not null$$),
  ('schedule.publish', 'site', 'schedule.publish', false, false,
   $$select tests.publish_week_as($1, 'm', 3, jsonb_build_array(jsonb_build_object(
       'label', 'probe', 'day', 0, 'start', '09:00', 'end', '15:00',
       'person', case when $3 = tests.id('m:K') then 'emre' else 'veli' end,
       'loc', case when $3 = tests.id('m:K') then 'K' else 'B' end,
       'job', case when $3 = tests.id('m:K') then 'cook' else 'server' end))) is not null$$),
  ('exchange.approve', 'case', 'schedule.shift_change_requests.manage', false, false,
   $$select public.shift_exchanges_command_service($1, $2, jsonb_build_object(
       'action', 'approve', 'case_id', $3,
       'application_id', (select a.id from public.shift_exchange_applications a where a.case_id = $3 limit 1),
       'expected_revision', (select c.revision from public.shift_exchange_cases c where c.id = $3),
       'fingerprint', public.shift_exchange_preview($1, $2, $3,
         (select a.id from public.shift_exchange_applications a where a.case_id = $3 limit 1)) ->> 'fingerprint'),
     gen_random_uuid()) is not null$$),
  ('settings.organization.write', 'workspace', null, false, true,
   $$select tests.as_browser($1, format('update public.workspaces set name = name where id = %L', $2)) > 0$$),
  ('settings.locations.write', 'workspace', null, false, true,
   $$select tests.as_browser($1, format(
       'insert into public.locations (workspace_id, name, short_name, street_address, city, region, postal_code, timezone) values (%L, ''Probe'', ''PRB'', ''1 St'', ''C'', ''R'', ''1'', ''UTC'')', $2)) > 0$$),
  ('settings.jobs.write', 'workspace', null, false, false,
   $$select public.create_department_with_jobs_service($1, $2, '{"name": "Probe", "color": "#abcdef"}', '[]') is not null$$),
  ('settings.roles.write', 'workspace', null, false, false,
   $$select public.save_workspace_role_service($1, $2, null, 'Probe role', '', 'employee', array(
       select rp.permission_key from public.workspace_role_permissions rp join public.workspace_roles r on r.id = rp.role_id
       where r.workspace_id = $2 and r.system_key = 'employee')) is not null$$),
  ('settings.scheduling.write', 'workspace', null, false, false,
   $$select public.update_scheduling_settings_service($1, $2, '{"week_start_day": "monday"}') is not null$$),
  ('settings.conflict_rules.write', 'workspace', null, false, false,
   $$select public.update_scheduling_settings_service($1, $2, (
       select jsonb_build_object('minimum_rest_minutes', s.minimum_rest_minutes, 'conflict_rules_revision', s.conflict_rules_revision)
       from public.workspace_scheduling_settings s where s.workspace_id = $2)) is not null$$),
  ('workspace.close', 'workspace', null, true, false,
   $$select public.request_workspace_closure_service($1, $2, 'immediate', (select w.name from public.workspaces w where w.id = $2), true, null) is not null$$),
  ('workspace.transfer_ownership', 'workspace', null, true, false,
   $$select public.initiate_workspace_ownership_transfer_service($1, $2, tests.user('m:zeynep')) is not null$$),
  ('time_off.decide', 'time_off', 'schedule.time_off_requests.manage', false, false,
   $$select public.resolve_schedule_time_off_request_service($1, $2, $3,
       (select r.revision from public.schedule_time_off_requests r where r.id = $3), 'approve', '') is not null$$),
  ('announcement.write', 'location', 'announcements.manage', false, false,
   $$select public.save_announcement_audience_service($1, $2, null, null, 'Probe', 'Body', 'general', array['employee'],
       coalesce(array_remove(array[$3], null), '{}'), null, null, null, '{}', '{}') is not null$$),
  ('important_date.write', 'location', 'important_dates.manage', false, true,
   $$select tests.as_browser($1, format(
       'insert into public.important_dates (workspace_id, title, type, starts_on, ends_on, recurrence, note, affects_scheduling, location_ids, location_id) values (%L, ''Probe'', ''event'', %L, %L, ''none'', '''', false, %L::uuid[], %L)',
       $2, tests.week(0), tests.week(0), coalesce(array_remove(array[$3], null), '{}'), $3)) > 0$$);

-- A draft or a template with several locations, and the locations a publish
-- or an export names (FB-6.1 .4). The export and the publish preview are asked
-- of the draft's own locations.
insert into action (key, target_kind, permission, owner_only, empty_is_no, template) values
  ('schedule.draft_delete', 'draft', 'schedule.manage', false, false,
   $$select public.delete_schedule_draft_service($1, $2, $3) is not null$$),
  ('schedule.publish_locations', 'draft', 'schedule.publish', false, false,
   $$select public.preview_schedule_publication_service($1, $2, $3,
       (select d.location_ids from public.schedule_drafts d where d.id = $3), null, true) is not null$$),
  ('schedule.export_locations', 'draft', 'schedule.export', false, false,
   $$select public.record_schedule_export_event_service($1, $2, 'probe', 'pdf', jsonb_build_object('location_ids',
       (select to_jsonb(d.location_ids) from public.schedule_drafts d where d.id = $3))) is not null$$),
  ('schedule.template_rename', 'template', 'schedule.templates.manage', false, false,
   $$select public.rename_schedule_template_service($1, $2, $3, 'Probe ' || gen_random_uuid(),
       (select t.revision from public.schedule_templates t where t.id = $3)) is not null$$),
  ('schedule.template_delete', 'template', 'schedule.templates.manage', false, false,
   $$select public.delete_schedule_template_service($1, $2, $3,
       (select t.revision from public.schedule_templates t where t.id = $3)) is not null$$);

-- Direct browser reads of the two sensitive tables the browser can still read.
-- Removing someone's access unlinks their employee record from their account;
-- the only unlinked record the matrix targets is the actor's own (Sami, self).
insert into action (key, target_kind, permission, owner_only, empty_is_no, template) values
  ('read.membership', 'person', null, false, true,
   $$select tests.as_browser($1, format('select 1 from public.workspace_memberships where workspace_id = %L and user_id = %L',
       $2, coalesce((select e.user_id from public.employee_profiles e where e.id = $3), $1))) > 0$$),
  ('read.audit', 'workspace', null, false, true,
   $$select tests.as_browser($1, format('select 1 from public.audit_events where workspace_id = %L', $2)) > 0$$);

-- The Settings pages' reads (FB-6.1.9): one entry point per page, each asking
-- the core for the permission the page is opened with.
insert into action (key, target_kind, permission, owner_only, empty_is_no, template) values
  ('settings.locations.read', 'location', 'settings.locations.read', false, true,
   $$select exists (select 1 from jsonb_array_elements(public.list_settings_locations_service($1, $2)) l
     where (l ->> 'id')::uuid = $3)$$),
  ('settings.jobs.read', 'workspace', 'settings.jobs.read', false, false,
   $$select public.read_settings_jobs_service($1, $2) is not null$$),
  ('settings.shift_catalog.read', 'workspace', 'settings.shift_catalog.read', false, false,
   $$select public.list_settings_shift_types_service($1, $2) is not null
     and public.list_settings_shift_labels_service($1, $2) is not null$$),
  ('settings.important_dates.read', 'workspace', 'important_dates.read', false, false,
   $$select public.read_settings_important_dates_service($1, $2) is not null$$),
  ('settings.roles.read', 'workspace', 'roles.read', false, false,
   $$select public.read_role_workspace_service($1, $2) is not null$$),
  ('settings.documents.read', 'workspace', 'documents.read', false, false,
   $$select public.list_settings_document_types_service($1, $2) is not null$$),
  ('settings.signature_templates.read', 'workspace', 'signature_templates.read', false, false,
   $$select public.read_signature_settings_service($1, $2) is not null$$);

-- The consistency layer: the older helpers that each answer "may this person
-- manage this location?" on their own. They must all give the same answer as
-- the rule, a blank location included. Stage 4 replaces them with the core.
insert into action (key, target_kind, permission, owner_only, empty_is_no, template) values
  ('legacy.schedule_can_manage', 'location', 'schedule.manage', false, true,
   $$select public.schedule_actor_can_manage_service($1, $2, $3)$$),
  ('legacy.schedule_capability', 'location', 'schedule.manage', false, true,
   $$select public.schedule_actor_has_capability_service($1, $2, 'schedule.manage', $3)$$),
  ('legacy.schedule_can_publish', 'location', 'schedule.publish', false, true,
   $$select public.schedule_actor_can_publish_service($1, $2, $3)$$),
  ('legacy.communication_capability', 'location', 'announcements.manage', false, true,
   $$select public.communication_actor_has_capability_service($1, $2, 'announcements.manage', $3)$$);

insert into action (key, target_kind, permission, owner_only, empty_is_no, template, member, restricted_ok) values
  ('notifications.read_own', 'workspace', null, false, false,
   $$select public.get_notification_inbox_v2_service($1, $2) is not null$$, true, true),
  ('exchange.offer_own', 'shift', null, false, false,
   $$select public.shift_exchanges_command_service($1, $2,
       jsonb_build_object('action', 'create', 'kind', 'cover', 'shift_id', $3), gen_random_uuid()) is not null$$, true, false),
  ('time_off.request_own', 'workspace', null, false, false,
   $$select public.submit_employee_time_off_service($1, $2,
       (select l.location_id from public.employee_location_assignments l join public.employee_profiles e on e.id = l.employee_id
        where e.user_id = $1 and e.workspace_id = $2 and l.ended_at is null order by l.is_primary desc limit 1),
       'probe', array[tests.week(1) + 3]) is not null$$, true, false);

-- The same actions as the core names them. blank: how a blank location reaches
-- the core, as the entry point receives it: 'null' ({NULL}, no location) or
-- 'org' ('{}', the whole organization). by_account: the target row is keyed by
-- the person's account (a membership), not their employee record.
create temporary table core_action (
  key text primary key references action (key),
  core_key text not null,
  blank text not null default 'null' check (blank in ('null', 'org')),
  by_account boolean not null default false
);
insert into core_action (key, core_key, blank) values
  ('employee.read', 'employee.read', 'null'),
  ('employee.list', 'employee.list', 'null'),
  ('employee.save', 'employee.save', 'null'),
  ('availability.team_write', 'availability.team_write', 'null'),
  ('availability.team_read', 'availability.team_read', 'null'),
  ('availability.note_read', 'availability.note_read', 'null'),
  ('employee.terminate', 'employee.terminate', 'null'),
  ('employee.archive', 'employee.archive', 'null'),
  ('employee.remove_access', 'employee.remove_access', 'null'),
  ('employee.make_admin', 'employee.make_admin', 'null'),
  ('employee.make_employee', 'employee.change_role', 'null'),
  ('employee.create', 'employee.create', 'org'),
  ('schedule.read', 'schedule.read', 'null'),
  ('schedule.edit', 'schedule.edit', 'null'),
  ('schedule.templates.read', 'schedule.templates.read', 'null'),
  ('schedule.publish', 'schedule.publish', 'null'),
  ('schedule.draft_delete', 'schedule.edit', 'null'),
  ('schedule.publish_locations', 'schedule.publish', 'null'),
  ('schedule.export_locations', 'schedule.export', 'null'),
  ('schedule.template_rename', 'schedule.templates', 'null'),
  ('schedule.template_delete', 'schedule.templates', 'null'),
  ('exchange.approve', 'exchange.approve', 'null'),
  ('settings.organization.write', 'settings.organization.write', 'null'),
  ('settings.locations.write', 'settings.locations.write', 'null'),
  ('settings.jobs.write', 'settings.jobs.write', 'null'),
  ('settings.roles.write', 'settings.roles.write', 'null'),
  ('settings.scheduling.write', 'settings.scheduling.write', 'null'),
  ('settings.conflict_rules.write', 'settings.conflict_rules.write', 'null'),
  ('settings.locations.read', 'settings.locations.read', 'null'),
  ('settings.jobs.read', 'settings.jobs.read', 'null'),
  ('settings.shift_catalog.read', 'settings.shift_catalog.read', 'null'),
  ('settings.important_dates.read', 'settings.important_dates.read', 'null'),
  ('settings.roles.read', 'settings.roles.read', 'null'),
  ('settings.documents.read', 'settings.documents.read', 'null'),
  ('settings.signature_templates.read', 'settings.signature_templates.read', 'null'),
  ('workspace.close', 'workspace.close', 'null'),
  ('workspace.transfer_ownership', 'workspace.transfer_ownership', 'null'),
  ('time_off.decide', 'time_off.decide', 'null'),
  ('announcement.write', 'announcement.write', 'org'),
  ('important_date.write', 'important_date.write', 'org'),
  ('read.membership', 'membership.read', 'null'),
  ('read.audit', 'audit.read', 'null'),
  ('legacy.schedule_can_manage', 'schedule.edit', 'null'),
  ('legacy.schedule_capability', 'schedule.edit', 'null'),
  ('legacy.schedule_can_publish', 'schedule.publish', 'null'),
  ('legacy.communication_capability', 'announcement.write', 'null'),
  ('notifications.read_own', 'notifications.read_own', 'null'),
  ('exchange.offer_own', 'exchange.offer_own', 'null'),
  ('time_off.request_own', 'time_off.request_own', 'null');
update core_action set by_account = true where key = 'read.membership';

select is(
  array(select a.key from action a where not exists (select 1 from core_action c where c.key = a.key) order by 1),
  '{}'::text[],
  'every matrix action is asked of the core too'
);
select is(
  array(select c.core_key from core_action c
        where not exists (select 1 from app_private.authz_actions a where a.key = c.core_key) order by 1),
  '{}'::text[],
  'the core knows every action the matrix asks it'
);

-- 5. The rules ---------------------------------------------------------------------

create function pg_temp.rank(class text) returns integer language sql immutable as $$
  select case class when 'owner' then 4 when 'admin' then 3 when 'manager' then 2 when 'employee' then 1 else 0 end
$$;

create function pg_temp.expected(actor_label text, action_key text, target_label text)
returns text
language plpgsql
as $$
declare
  p persona;
  a action;
  t target;
  is_self boolean;
  shares boolean;
  covers boolean;
begin
  select * into p from persona where label = actor_label;
  select * into a from action where key = action_key;
  if target_label = 'self' then
    t := row('self', 'person', p.tenant, p.locs, p.class, actor_label)::target;
  else
    select * into t from target where label = target_label;
  end if;
  is_self := t.holder = actor_label;

  -- Nobody reaches into another workspace, and only active members act at all;
  -- somebody who has not finished onboarding only finishes it.
  if p.tenant <> 'm' or t.tenant <> 'm' then return 'deny'; end if;
  -- Whoever has a membership, in whatever state, can read their own row.
  if action_key = 'read.membership' and is_self then
    return case when p.status = 'invited' then 'deny' else 'allow' end;
  end if;
  if p.status = 'restricted' and a.restricted_ok then return 'allow'; end if;
  if p.status <> 'active' then return 'deny'; end if;
  if a.member and t.holder is not null and not is_self then return 'deny'; end if;
  if a.member then return 'allow'; end if;
  if a.permission is not null and a.permission = any (p.permissions_removed) then return 'deny'; end if;
  if a.owner_only and p.class <> 'owner' then return 'deny'; end if;
  if p.class = 'employee' then return 'deny'; end if;

  -- A manager's reach: where they work. An empty list reaches nowhere.
  shares := t.locs is not null and t.locs && p.locs;
  covers := t.locs is not null and cardinality(t.locs) > 0 and t.locs <@ p.locs;

  case action_key
  when 'employee.read', 'employee.list' then
    if p.class in ('owner', 'admin') then return 'allow'; end if;
    return case when shares then 'allow' else 'deny' end;

  when 'employee.save' then
    -- User decisions 2026-09-24 (1A-4A): an admin does not edit the owner's
    -- record; a manager edits neither their own record (it goes one level up)
    -- nor a peer's or a senior's, and edits the whole record of somebody who
    -- also works at another location.
    if p.class = 'owner' then return 'allow'; end if;
    if p.class = 'admin' then
      return case when t.class = 'owner' then 'deny' else 'allow' end;
    end if;
    if not shares or is_self then return 'deny'; end if;
    if pg_temp.rank(t.class) >= pg_temp.rank('manager') then return 'deny'; end if;
    return 'allow';

  when 'availability.team_write', 'availability.note_read' then
    -- The Manager note is about employees only (user decision 2026-09-26,
    -- REUSE "Müsaitlik notu yalnız çalışan için"): nobody writes or reads one
    -- about a manager, an admin or the owner, themselves included. Owner and
    -- admins for every employee, a manager for those at their locations.
    if t.class <> 'employee' then return 'deny'; end if;
    if p.class in ('owner', 'admin') then return 'allow'; end if;
    return case when shares then 'allow' else 'deny' end;

  when 'availability.team_read' then
    -- Whoever hears of a person's availability update reads it (user decision
    -- 2026-09-26, REUSE "Müsaitlik okuma = bildirim alıcıları"): owner and
    -- admins everybody, a manager everybody who works at their locations,
    -- peers and seniors too. The note is availability.note_read.
    if p.class in ('owner', 'admin') then return 'allow'; end if;
    return case when shares then 'allow' else 'deny' end;

  when 'employee.terminate', 'employee.archive' then
    -- Ending employment or archiving is admin and owner only; a manager only
    -- removes somebody from their own location (a separate action).
    if is_self then return 'deny'; end if;
    if p.class = 'owner' then return 'allow'; end if;
    if p.class = 'admin' and pg_temp.rank(t.class) < pg_temp.rank('admin') then return 'allow'; end if;
    return 'deny';

  when 'employee.remove_access' then
    if is_self then return 'deny'; end if;
    if p.class = 'owner' then return 'allow'; end if;
    if p.class = 'admin' and pg_temp.rank(t.class) < pg_temp.rank('admin') then return 'allow'; end if;
    -- Only admin and owner take access away (user decision 2026-09-24, 5A).
    return 'deny';

  when 'employee.make_admin' then
    -- Owner only (checked above); nobody changes their own role.
    return case when is_self or t.class = 'owner' then 'deny' else 'allow' end;

  when 'employee.make_employee' then
    if is_self or t.class = 'owner' then return 'deny'; end if;
    if p.class = 'owner' then return 'allow'; end if;
    if p.class = 'admin' then return case when t.class = 'admin' then 'deny' else 'allow' end; end if;
    -- A manager moves somebody between employee roles at their own locations
    -- (user decision 2026-09-24, 6A).
    return case when shares and t.class = 'employee' then 'allow' else 'deny' end;

  when 'employee.create' then
    if t.locs is null then
      return case when p.class in ('owner', 'admin') then 'allow' else 'deny' end;
    end if;
    if p.class in ('owner', 'admin') then return 'allow'; end if;
    return case when covers then 'allow' else 'deny' end;

  when 'schedule.read' then
    if t.locs is null then return 'deny'; end if;
    if p.class in ('owner', 'admin') then return 'allow'; end if;
    return case when covers then 'allow' else 'deny' end;

  when 'schedule.edit', 'schedule.templates.read' then
    -- May they do it somewhere at all: a manager needs a location.
    if p.class in ('owner', 'admin') then return 'allow'; end if;
    return case when cardinality(p.locs) > 0 then 'allow' else 'deny' end;

  when 'settings.organization.write', 'settings.locations.write', 'settings.jobs.write',
       'settings.roles.write', 'settings.scheduling.write', 'settings.conflict_rules.write' then
    -- Managers read the catalog; they never write organization settings (D1).
    return case when p.class in ('owner', 'admin') then 'allow' else 'deny' end;

  when 'settings.locations.read' then
    -- Owner and admins read every location, a manager only where they work
    -- (REUSE "Ürün kuralları": Locations'ta yalnız kendi lokasyonları).
    if t.locs is null then return 'deny'; end if;
    if p.class in ('owner', 'admin') then return 'allow'; end if;
    return case when covers then 'allow' else 'deny' end;

  when 'settings.jobs.read', 'settings.shift_catalog.read', 'settings.important_dates.read',
       'settings.documents.read', 'settings.signature_templates.read' then
    -- Managers read the catalog, as far as their role holds the page's read
    -- permission (checked above).
    return 'allow';

  when 'settings.roles.read' then
    -- Roles are not shown to managers (REUSE "Ürün kuralları").
    return case when p.class in ('owner', 'admin') then 'allow' else 'deny' end;

  when 'workspace.close', 'workspace.transfer_ownership' then
    return 'allow';  -- owner only, checked above

  when 'time_off.decide' then
    -- Requests go one rank up and nobody decides their own. With no published
    -- shift on the day, the manager of the primary location decides; admin and
    -- owner can always decide alone.
    if is_self then return 'deny'; end if;
    if p.class = 'owner' then return 'allow'; end if;
    if p.class = 'admin' then return case when t.class in ('admin', 'owner') then 'deny' else 'allow' end; end if;
    return case when t.class = 'employee' and covers then 'allow' else 'deny' end;

  when 'legacy.schedule_can_manage', 'legacy.schedule_capability', 'legacy.schedule_can_publish',
       'legacy.communication_capability' then
    -- Manage reach at one location: admin and owner anywhere in the
    -- workspace, a manager where they work, nobody at a blank location.
    if t.locs is null then return 'deny'; end if;
    if p.class in ('owner', 'admin') then return 'allow'; end if;
    return case when covers then 'allow' else 'deny' end;

  when 'schedule.publish' then
    if p.class in ('owner', 'admin') then return 'allow'; end if;
    return case when covers then 'allow' else 'deny' end;

  when 'schedule.draft_delete', 'schedule.template_rename', 'schedule.template_delete',
       'schedule.publish_locations', 'schedule.export_locations' then
    -- A draft or template with several locations is deleted or renamed only by
    -- a manager of every one of them, or an admin or the owner (B3, K-2); a
    -- publish or an export names only locations the manager reaches (M2).
    if p.class in ('owner', 'admin') then return 'allow'; end if;
    return case when covers then 'allow' else 'deny' end;

  when 'exchange.approve' then
    -- A pickup or cover is approved at the shift's location only.
    if is_self then return 'deny'; end if;
    if p.class in ('owner', 'admin') then return 'allow'; end if;
    return case when covers then 'allow' else 'deny' end;

  when 'read.membership' then
    if p.class in ('owner', 'admin') then return 'allow'; end if;
    return case when shares then 'allow' else 'deny' end;

  when 'read.audit' then
    return case when p.class in ('owner', 'admin') then 'allow' else 'deny' end;

  when 'announcement.write', 'important_date.write' then
    -- Managers write for their own locations; the whole organization is admin
    -- and owner.
    if p.class in ('owner', 'admin') then return 'allow'; end if;
    return case when covers then 'allow' else 'deny' end;

  else
    raise exception 'expected(): no rule for action %', action_key;
  end case;
end;
$$;

-- 6. Where the app is known to break a rule today ---------------------------------
-- Each row names what is wrong and which stage fixes it. Matching cells run as
-- TODO. A row that no longer matches any failing cell fails the suite, so the
-- list can only shrink with the fixes. actors/targets match a label or a class;
-- null matches everything.

create temporary table known_gap (
  id text primary key,
  actors text[],
  actions text[] not null,
  targets text[],
  reason text not null
);
insert into known_gap values
  ('manager-hidden-peers', '{manager}', '{employee.read,employee.list}', '{self,ayse,zeynep,olcay}',
   'M2: a manager sees everyone who works at their locations; today their own record and managers, admins and the owner are hidden (stage 6, employees)'),
  ('manager-cannot-change-employee-role', '{manager}', '{employee.make_employee}', null,
   'a manager cannot move somebody between employee roles at their own location; decided allowed on 2026-09-24, 6A (stage 6, employees)'),
  ('manager-cannot-invite', '{manager}', '{employee.create}', '{K,B}',
   'a manager cannot add and invite an employee at their own location; employee_access.manage is required (stage 6, employees)'),
  ('owner-record-no-primary', '{olcay}', '{employee.save}', '{self,olcay}',
   'the owner record setup creates has no primary location or job, so saving it as it is fails with 23502 (stage 6, employees)'),
  ('admin-own-record', '{zeynep}', '{employee.save}', '{self,zeynep}',
   'an admin cannot save their own employee record, P0002 (stage 6, employees)'),
  ('important-date-no-as-validation', null, '{important_date.write}', '{K,B,x:K}',
   'an important date at a location out of reach or in another workspace is refused as 23514 "Choose a location in this workspace", not as a permission no: the browser insert runs its trigger before row security (stage 6, announcements)'),
  ('restricted-no-notifications', '{aydan}', '{notifications.read_own}', null,
   'somebody who has not finished onboarding cannot open their own notifications (stage 6, onboarding)'),
  ('membership-rows-open', '{manager,employee}', '{read.membership}', null,
   'any member can read every membership row in the workspace from the browser: every role and status, across locations (stage 6, employees)'),
  ('legacy-blank-location', null,
   '{legacy.schedule_can_manage,legacy.schedule_capability,legacy.schedule_can_publish,legacy.communication_capability}', '{none}',
   'the old location helpers answer yes for a blank location to every manager, admin and owner: blank means everywhere, E2. 56 callers pass null for "anywhere"; each moves to scope_set() with its domain and the helpers go (stage 6)'),
  ('time-off-needs-location', '{nur}', '{time_off.request_own}', null,
   'asking for time off still needs a location, so a person with none cannot ask; time off belongs to the person (stage 6, time off)');

create temporary table known_hit (id text primary key);

create function pg_temp.known(actor_label text, action_key text, target_label text)
returns text
language sql
stable
as $$
  select k.id from known_gap k
  where (k.actors is null or actor_label = any (k.actors)
         or (select p.class from persona p where p.label = actor_label) = any (k.actors))
    and action_key = any (k.actions)
    and (k.targets is null or target_label = any (k.targets))
  order by k.id
  limit 1
$$;

-- 7. The probe ----------------------------------------------------------------------
-- Runs one call and undoes it by raising a sentinel, so every cell starts from
-- the same world. TA1/TA2 are their own class: a handler for a code ending in
-- 000 would catch the whole class.

create function pg_temp.probe(template text, actor_id uuid, workspace_id uuid, target_id uuid, empty_is_no boolean)
returns text
language plpgsql
as $$
declare
  answer text;
  state text;
begin
  begin
    execute template into answer using actor_id, workspace_id, target_id;
    if empty_is_no and (answer is null or answer in ('false', 'f', '0')) then
      raise exception 'probe hidden' using errcode = 'TA002';
    end if;
    raise exception 'probe allowed' using errcode = 'TA001';
  exception
    when sqlstate 'TA001' then return 'allow';
    when sqlstate 'TA002' then return 'deny:empty';
    when others then
      get stacked diagnostics state = returned_sqlstate;
      if state in ('42501', 'P0002') then return 'deny:' || state; end if;
      return 'error:' || state || ' ' || left(sqlerrm, 100);
  end;
end;
$$;

create function pg_temp.core_answer(user_id uuid, own_employee uuid, action_key text, target_label text, target_uuid uuid)
returns text
language plpgsql
as $$
declare
  m core_action;
  t target;
  person uuid;
  account uuid;
  places uuid[];
  reason text;
begin
  select * into m from core_action where key = action_key;
  if target_label = 'self' and m.by_account then
    account := user_id;
  elsif target_label = 'self' then
    person := own_employee;
  else
    select * into t from target where label = target_label;
    case t.kind
    when 'person' then
      if m.by_account then
        account := (select e.user_id from public.employee_profiles e where e.id = target_uuid);
      else
        person := target_uuid;
      end if;
    when 'location', 'site' then
      if target_label = 'none' then
        places := case m.blank when 'org' then '{}'::uuid[] else array[null]::uuid[] end;
      else
        places := array[target_uuid];
      end if;
    when 'time_off', 'shift', 'case' then
      person := case t.holder when 'olcay' then tests.id('m:owner') else tests.id('m:' || t.holder) end;
      places := array(select tests.id('m:' || l) from unnest(t.locs) l);
    when 'draft', 'template' then
      places := array(select tests.id('m:' || l) from unnest(t.locs) l);
      -- A one-place action is asked at each location in turn.
      if (select a.scope_class from app_private.authz_actions a where a.key = m.core_key) = 'place' then
        select r into reason from unnest(places) place,
          app_private.authz_reason(user_id, tests.id('m'), m.core_key, array[place]) r
        where r is not null limit 1;
        return case when reason is null then 'allow' else 'deny:' || reason end;
      end if;
    when 'workspace' then
      -- Opening the editor asks for the locations the person may edit.
      if (select a.scope_class from app_private.authz_actions a where a.key = m.core_key) = 'set' then
        places := app_private.scope_set(user_id, tests.id('m'), m.core_key);
      end if;
    end case;
  end if;
  reason := app_private.authz_reason(user_id, tests.id('m'), m.core_key, places, person, account);
  return case when reason is null then 'allow' else 'deny:' || reason end;
end;
$$;

create function pg_temp.run()
returns setof text
language plpgsql
as $$
declare
  c record;
  actual text;
  verdict text;
  wanted text;
  gap text;
  cell_label text;
  core text;
begin
  for c in
    select p.label as actor, ac.user_id, ac.employee_id as own_employee, a.key, a.template, a.empty_is_no,
      t.label as target,
      case when t.label = 'self' then ac.employee_id else ti.id end as target_id
    from persona p
    join actor ac on ac.label = p.label
    cross join action a
    join (select label, kind from target union all select 'self', 'person') t on t.kind = a.target_kind
    left join target_id ti on ti.label = t.label
    order by a.key, p.label, t.label
  loop
    actual := pg_temp.probe(c.template, c.user_id, tests.id('m'),
      case when c.target = 'none' then null else c.target_id end, c.empty_is_no);
    verdict := case when actual = 'allow' then 'allow' when actual like 'deny:%' then 'deny' else actual end;
    wanted := pg_temp.expected(c.actor, c.key, c.target);
    gap := pg_temp.known(c.actor, c.key, c.target);
    cell_label := format('%s | %s | %s', c.key, c.actor, c.target);

    if wanted like 'decide:%' then
      perform todo(wanted, 1);
      return next is(verdict, wanted, cell_label || ' (today: ' || actual || ')');
    elsif gap is not null and verdict <> wanted then
      insert into known_hit values (gap) on conflict do nothing;
      perform todo('known: ' || gap, 1);
      return next is(verdict, wanted, cell_label || ' (today: ' || actual || ')');
    else
      return next is(verdict, wanted, cell_label || ' (today: ' || actual || ')');
    end if;

    core := pg_temp.core_answer(c.user_id, c.own_employee, c.key, c.target, c.target_id);
    if wanted like 'decide:%' then
      perform todo(wanted, 1);
    end if;
    return next is(case when core = 'allow' then 'allow' else 'deny' end, wanted,
      'core | ' || cell_label || ' (core: ' || core || ')');
  end loop;

  for gap in select k.id from known_gap k where not exists (select 1 from known_hit h where h.id = k.id) order by 1 loop
    return next fail('known gap ' || gap || ' no longer shows up; delete its row');
  end loop;
end;
$$;

select * from pg_temp.run();

select * from finish();
rollback;

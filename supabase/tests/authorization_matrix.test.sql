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
-- A second admin (BL-129): what one admin may do to another.
select tests.person('m', 'kaan', 'admin', array['B'], array['server']);
select tests.person('m', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('m', 'mehmet', 'manager', array['B'], array['cook']);
select tests.person('m', 'can', 'manager', array['K', 'B'], array['cook']);
select tests.person('m', 'nur', 'manager', null, null);
-- Manages Besiktas without taking shifts there: assigned to it and excluded
-- from the Schedule (EMP-001). Can, above, is the manager of two locations.
select tests.person('m', 'derya', 'manager', array['B'], array['cook']);
select tests.excluded('m', 'derya');
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
-- ROL-CIFT (design §3, §4.2): the two access slots. Dora manages Kadikoy and works there; Ersin manages
-- Kadikoy and works only at Besiktas; Mona manages Kadikoy and works nowhere (a Management job only);
-- Ada is an admin who works at Kadikoy. Oya, in a small world of her own, owns it and works there.
select tests.person('m', 'dora', 'manager', array['K'], array['cook']);
select tests.person('m', 'ersin', 'manager+employee', array['B'], array['cook']);
-- Ersin's Manages is set apart from where he works through the access change the drawer saves (DAVET-ERISIM).
select public.change_employee_access_service(tests.user('m:owner'), tests.id('m'), tests.id('m:ersin'),
  m.employee_role_id, m.role_id, array[tests.id('m:K')], null, null)
from public.workspace_memberships m where m.workspace_id = tests.id('m') and m.user_id = tests.user('m:ersin');
select tests.person('m', 'mona', 'manager', array['K'], array['general manager']);
select tests.person('m', 'ada', 'admin', array['K'], array['cook']);
select tests.world('o');
select tests.employee_slot('o', 'owner');
-- Aydan has typed her legal name and not finished onboarding: the emergency
-- contact form asks for one on file.
select public.save_employee_onboarding_profile_service(
  tests.user('m:aydan'),
  jsonb_build_object(
    'legal_first_name', 'Aydan', 'legal_last_name', 'Person',
    'phone', '4155550123', 'emergency_contact_name', 'Contact',
    'emergency_contact_relationship', 'Friend', 'emergency_contact_phone', '+14155550100'),
  (select c.revision from public.employee_onboarding_cases c where c.employee_id = tests.id('m:aydan')),
  tests.id('m'));
-- Time off waiting for a decision (Wednesday of week 0), and approved time off
-- in week 3 that a manager, an admin or the owner might revoke (FB-6.3).
select tests.remember('m:' || h || ':leave', tests.leave('m', h))
from unnest(array['emre', 'veli', 'ali', 'ayse', 'zeynep']) h;
-- Olcay, the owner, only manages: no time off of her own (ROL-CIFT, design §4.10).
select tests.remember('m:lv:' || h, tests.leave('m', h, 3))
from unnest(array['emre', 'ali', 'ayse', 'zeynep']) h;
select public.decide_time_off_service(tests.user('m:owner'), tests.id('m'), tests.id('m:lv:' || h), 'approve', '',
  app_private.time_off_impact(tests.id('m'), tests.id('m:lv:' || h)) ->> 'fingerprint')
from unnest(array['emre', 'ali', 'ayse', 'zeynep']) h;
select tests.settle();
-- A published week (no shift on Wednesday, the day of the time-off requests)
-- and two cover requests Ali has applied to.
select tests.publish_week('m', 0, '[
  {"label": "emre-k", "person": "emre", "loc": "K", "job": "cook",   "day": 1, "start": "09:00", "end": "15:00"},
  {"label": "veli-b", "person": "veli", "loc": "B", "job": "server", "day": 1, "start": "09:00", "end": "15:00"},
  {"label": "ali-k",  "person": "ali",  "loc": "K", "job": "cook",   "day": 4, "start": "09:00", "end": "15:00"},
  {"label": "ayse-k", "person": "ayse", "loc": "K", "job": "cook",   "day": 3, "start": "09:00", "end": "15:00"},
  {"label": "ayse-k2", "person": "ayse", "loc": "K", "job": "cook",  "day": 5, "start": "09:00", "end": "15:00"}
]');
select tests.cover_case('m', 'emre-k', 'emre', 'ali');
select tests.cover_case('m', 'veli-b', 'veli', 'ali');
-- A manager's own shift: her peers do not decide it (D3).
select tests.cover_case('m', 'ayse-k2', 'ayse', 'emre');
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
-- BL-188 (Q-C): a template at Kadikoy and a location deleted since counts as
-- a Kadikoy template in every rule.
-- ponytail: a location deleted by hand; there is no delete-location builder step.
insert into public.locations (workspace_id, name, short_name, street_address, city, region, postal_code, timezone)
values (tests.id('m'), 'Moda', 'MDA', '1 St', 'Istanbul', 'Istanbul', '34710', 'Europe/Istanbul');
select tests.remember('m:D', (select l.id from public.locations l where l.workspace_id = tests.id('m') and l.short_name = 'MDA'));
insert into public.schedule_templates (id, workspace_id, name, created_by, updated_by)
values (tests.remember('m:tpl:KD', gen_random_uuid()), tests.id('m'), 'Template KD', tests.user('m:owner'), tests.user('m:owner'));
insert into public.schedule_template_shifts (workspace_id, template_id, location_id, job_id, day_offset, start_time, end_time, time_basis)
select tests.id('m'), tests.id('m:tpl:KD'), tests.id('m:' || l), tests.id('m:job:cook'), 0, '09:00', '15:00', 'explicit'
from unnest(array['K', 'D']) l;
-- as deleting it on Settings does: the location goes, then whoever worked there
-- (the owner, kept at every live location) stops.
update public.locations set archived_at = now(), deleted_at = now() where id = tests.id('m:D');
update public.employee_location_assignments set ended_at = now() where location_id = tests.id('m:D') and ended_at is null;
-- Where somebody works, one location at a time: what "remove from <location>"
-- acts on (FB-6.2 S1). Label m:pl:<holder>@<location>.
select tests.remember('m:pl:' || x.holder || '@' || x.loc, (
  select a.id from public.employee_location_assignments a
  where a.employee_id = tests.id(case x.holder when 'olcay' then 'm:owner' else 'm:' || x.holder end)
    and a.location_id = tests.id('m:' || x.loc) and a.ended_at is null))
from (values ('emre', 'K'), ('ali', 'K'), ('ali', 'B'), ('veli', 'B'), ('can', 'K'), ('zeynep', 'K'), ('olcay', 'K')) x(holder, loc);
-- Preferred names waiting for an answer (every one waits, KARARLAR S-131). Label m:nr:<holder>.
select public.request_employee_preferred_name_service(tests.user('m:' || h), tests.id('m'), tests.id('m:' || h), initcap(h) || 'y')
from unnest(array['emre', 'veli', 'ali', 'ayse', 'zeynep', 'kaan']) h;
select tests.remember('m:nr:' || h, (
    select r.id from public.employee_preferred_name_requests r
    where r.employee_id = tests.id('m:' || h) and r.status = 'pending'))
from unnest(array['emre', 'veli', 'ali', 'ayse', 'zeynep', 'kaan']) h;
-- A published document asked of everybody, optional so it restricts nobody
-- (FB-6.6): what documents.read, .review and .self act on.
create temporary table matrix_badge (id uuid);
insert into matrix_badge select public.save_document_type_lifecycle_service(tests.user('m:owner'), tests.id('m'), null, null,
  '{"title": "Matrix badge", "description": "", "requires_review": true, "accepted_formats": ["pdf"], "tracks_expiry": false,
    "expiry_warning_days": 30, "lifecycle_settings": {"mode": "optional", "assignment_scope": "all_active",
    "target": {"operator": "and", "location_ids": [], "department_ids": [], "job_ids": [], "employee_ids": []},
    "period_days": null, "suspend_on_overdue": false, "extra_fields": []}}');
create temporary table matrix_badge_preview (p jsonb);
insert into matrix_badge_preview select public.preview_document_publication_service(tests.user('m:owner'), tests.id('m'), id) from matrix_badge;
select public.set_document_publication_service(tests.user('m:owner'), tests.id('m'), b.id, (v.p ->> 'revision')::int,
  (v.p ->> 'publication_revision')::int, v.p ->> 'preview_token', 'Matrix', 'published') from matrix_badge b, matrix_badge_preview v;
-- Everybody's legal name waits for approval (FB-6.6 S1): what onboarding.legal_name acts on.
update public.employee_onboarding_requirements set requires_review = true, status = 'awaiting_review'
where workspace_id = tests.id('m') and kind = 'profile';
create function pg_temp.badge(person uuid) returns uuid language sql stable as $$
  select r.id from public.employee_onboarding_requirements r
  where r.employee_id = person and r.source_id = (select id from matrix_badge) and r.lifecycle_retired_at is null$$;
-- A photo the person uploaded (AVATAR-IKON): nobody in the world has one, so the removal probe gives
-- the target one first; the probe's sentinel undoes both.
create function pg_temp.photo_then_remove(actor uuid, w uuid, person uuid) returns text language plpgsql as $$
begin
  insert into public.member_avatars (membership_id, workspace_id, photo_path)
  select m.id, m.workspace_id, m.workspace_id || '/' || m.id || '/' || gen_random_uuid() || '.jpg'
  from public.employee_profiles e
  join public.workspace_memberships m on m.workspace_id = e.workspace_id and m.user_id = e.user_id
  where e.id = person
  on conflict (membership_id) do update set photo_path = excluded.photo_path, art_key = null;
  return public.remove_member_photo_service(actor, w, person);
end;
$$;

-- 2. Who they are, written down independently of the app ------------------------
-- class: owner | admin | manager | employee (the management slot's, else employee). status: active |
-- suspended | invited (no membership yet) | removed | restricted (onboarding not finished).
-- locs: where they work. employee: they hold the employee slot. manages: a manager's Manages (owners
-- and admins reach every location by class).

create temporary table persona (
  label text primary key,
  tenant text not null,
  class text not null,
  status text not null,
  locs text[] not null,
  permissions_removed text[] not null default '{}',
  employee boolean not null default true,
  manages text[] not null default '{}'
);
-- A manager filed with a job outside Management also holds the employee slot (design §5.1).
insert into persona values
  ('olcay',  'm', 'owner',    'active',     '{K,B}', '{}', false, '{}'),
  ('zeynep', 'm', 'admin',    'active',     '{K}',   '{}', true,  '{}'),
  ('kaan',   'm', 'admin',    'active',     '{B}',   '{}', true,  '{}'),
  ('ada',    'm', 'admin',    'active',     '{K}',   '{}', true,  '{}'),
  ('derya',  'm', 'manager',  'active',     '{B}',   '{}', true,  '{B}'),
  ('ayse',   'm', 'manager',  'active',     '{K}',   '{}', true,  '{K}'),
  ('dora',   'm', 'manager',  'active',     '{K}',   '{}', true,  '{K}'),
  ('ersin',  'm', 'manager',  'active',     '{B}',   '{}', true,  '{K}'),
  ('mona',   'm', 'manager',  'active',     '{K}',   '{}', false, '{K}'),
  ('mehmet', 'm', 'manager',  'active',     '{B}',   '{}', true,  '{B}'),
  ('can',    'm', 'manager',  'active',     '{K,B}', '{}', true,  '{K,B}'),
  ('nur',    'm', 'manager',  'active',     '{}',    '{}', false, '{}'),
  ('nil',    'm', 'manager',  'active',     '{K}',   '{employees.manage,schedule.publish}', true, '{K}'),
  ('ali',    'm', 'employee', 'active',     '{K,B}', '{}', true,  '{}'),
  ('emre',   'm', 'employee', 'active',     '{K}',   '{}', true,  '{}'),
  ('veli',   'm', 'employee', 'active',     '{B}',   '{}', true,  '{}'),
  ('sami',   'm', 'manager',  'suspended',  '{K}',   '{}', true,  '{K}'),
  ('pelin',  'm', 'employee', 'invited',    '{K}',   '{}', true,  '{}'),
  ('remzi',  'm', 'employee', 'removed',    '{B}',   '{}', true,  '{}'),
  ('aydan',  'm', 'manager',  'restricted', '{K}',   '{}', true,  '{K}'),
  ('xavier', 'x', 'owner',    'active',     '{K,B}', '{}', false, '{}'),
  ('oya',    'o', 'owner',    'active',     '{K,B}', '{}', true,  '{}');
-- The manager role an owner starts with holds none of the Settings read
-- permissions below (important_dates.read aside); an owner may grant them to a
-- manager-type role (settings_reads_ask_the_core.test.sql), all but
-- settings.locations.read, which stays with owners and admins (BL-176).
update persona set permissions_removed = permissions_removed || array[
  'settings.locations.read', 'settings.jobs.read', 'settings.shift_catalog.read',
  'roles.read', 'documents.read']
-- It reads and decides the documents of the people where it manages (BL-560).
where class = 'manager';

create temporary table actor as
select p.label,
  case p.label when 'olcay' then tests.user('m:owner') when 'xavier' then tests.user('x:owner')
    when 'oya' then tests.user('o:owner') else tests.user('m:' || p.label) end as user_id,
  case p.label when 'olcay' then tests.id('m:owner') when 'xavier' then tests.id('x:owner')
    when 'oya' then tests.id('o:owner') else tests.id('m:' || p.label) end as employee_id,
  case p.tenant when 'o' then tests.id('o') else tests.id('m') end as workspace_id
from persona p;

-- 3. What they act on -------------------------------------------------------------

create temporary table target (
  label text primary key,
  kind text not null,          -- person | location | workspace | time_off | leave
  tenant text not null,
  locs text[],                 -- person: where they work; location: itself (null: none);
                               -- time_off, leave: where the person it belongs to works
  class text,                  -- person, time_off, leave: the rank of the person it belongs to
  holder text,                 -- person, time_off, leave: whose it is
  employee boolean             -- person: they hold the employee slot (ROL-CIFT)
);
insert into target values
  ('emre',       'person',    'm', '{K}',   'employee', 'emre'),
  ('veli',       'person',    'm', '{B}',   'employee', 'veli'),
  ('ali',        'person',    'm', '{K,B}', 'employee', 'ali'),
  ('ayse',       'person',    'm', '{K}',   'manager',  'ayse'),
  ('zeynep',     'person',    'm', '{K}',   'admin',    'zeynep'),
  ('kaan',       'person',    'm', '{B}',   'admin',    'kaan'),
  -- a manager who works at Besiktas and manages Kadikoy, and one who only manages
  ('ersin',      'person',    'm', '{B}',   'manager',  'ersin'),
  ('mona',       'person',    'm', '{K}',   'manager',  'mona'),
  -- a manager kept off the Schedule is reached where they are assigned, like anybody
  ('derya',      'person',    'm', '{B}',   'manager',  'derya'),
  ('olcay',      'person',    'm', '{K,B}', 'owner',    'olcay'),
  -- one person at one location
  ('pl:emre@K',  'placement', 'm', '{K}',   'employee', 'emre'),
  ('pl:ali@K',   'placement', 'm', '{K}',   'employee', 'ali'),
  ('pl:ali@B',   'placement', 'm', '{B}',   'employee', 'ali'),
  ('pl:veli@B',  'placement', 'm', '{B}',   'employee', 'veli'),
  -- a manager with a second location: their only one is not taken (K4, EMP-001),
  -- which is the record's rule and not a permission
  ('pl:can@K',   'placement', 'm', '{K}',   'manager',  'can'),
  ('pl:zeynep@K', 'placement', 'm', '{K}',  'admin',    'zeynep'),
  ('pl:olcay@K', 'placement', 'm', '{K}',   'owner',    'olcay'),
  -- a preferred name waiting for an answer; locs: where its person works
  ('nr:emre',    'name_request', 'm', '{K}',   'employee', 'emre'),
  ('nr:veli',    'name_request', 'm', '{B}',   'employee', 'veli'),
  ('nr:ali',     'name_request', 'm', '{K,B}', 'employee', 'ali'),
  ('nr:ayse',    'name_request', 'm', '{K}',   'manager',  'ayse'),
  ('nr:zeynep',  'name_request', 'm', '{K}',   'admin',    'zeynep'),
  ('nr:kaan',    'name_request', 'm', '{B}',   'admin',    'kaan'),
  ('xena',       'person',    'x', '{K}',   'employee', 'xena'),
  ('K',          'location',  'm', '{K}',   null,       null),
  ('B',          'location',  'm', '{B}',   null,       null),
  ('x:K',        'location',  'x', '{K}',   null,       null),
  ('none',       'location',  'm', null,    null,       null),
  ('workspace',  'workspace', 'm', null,    null,       null),
  -- A request waiting for a decision: the managers of every location the
  -- person works at vote (FB-6.3).
  ('to:emre',    'time_off',  'm', '{K}',   'employee', 'emre'),
  ('to:veli',    'time_off',  'm', '{B}',   'employee', 'veli'),
  ('to:ali',     'time_off',  'm', '{K,B}', 'employee', 'ali'),
  ('to:ayse',    'time_off',  'm', '{K}',   'manager',  'ayse'),
  ('to:zeynep',  'time_off',  'm', '{K}',   'admin',    'zeynep'),
  -- Approved time off, which can be revoked.
  ('lv:emre',    'leave',     'm', '{K}',   'employee', 'emre'),
  ('lv:ali',     'leave',     'm', '{K,B}', 'employee', 'ali'),
  ('lv:ayse',    'leave',     'm', '{K}',   'manager',  'ayse'),
  ('lv:zeynep',  'leave',     'm', '{K}',   'admin',    'zeynep'),
  ('site:K',     'site',      'm', '{K}',   null,       null),
  ('site:B',     'site',      'm', '{B}',   null,       null),
  ('sh:ali-k',   'shift',     'm', '{K}',   'employee', 'ali'),
  ('sh:ayse-k',  'shift',     'm', '{K}',   'manager',  'ayse'),
  ('case:emre-k', 'case',     'm', '{K}',   'employee', 'emre'),
  ('case:veli-b', 'case',     'm', '{B}',   'employee', 'veli'),
  ('case:ayse-k2', 'case',    'm', '{K}',   'manager',  'ayse'),
  ('dr:K',       'draft',     'm', '{K}',   null,       null),
  ('dr:B',       'draft',     'm', '{B}',   null,       null),
  ('dr:KB',      'draft',     'm', '{K,B}', null,       null),
  -- a template has no location of its own: where its shifts are
  ('tpl:K',      'template',  'm', '{K}',   null,       null),
  ('tpl:KB',     'template',  'm', '{K,B}', null,       null),
  -- shifts at K and a deleted location, which counts nowhere (Q-C, BL-188)
  ('tpl:KD',     'template',  'm', '{K}',   null,       null);
-- Who holds the employee slot among the people targets (ROL-CIFT): everybody but the owner and Mona.
update target set employee = (holder not in ('olcay', 'mona')) where kind = 'person';

create temporary table target_id as
select t.label,
  case
    when t.label = 'olcay' then tests.id('m:owner')
    when t.label = 'xena' then tests.id('x:xena')
    when t.kind = 'person' then tests.id('m:' || t.label)
    when t.label in ('K', 'B') then tests.id('m:' || t.label)
    when t.label = 'x:K' then tests.id('x:K')
    when t.label = 'workspace' then tests.id('m')
    when t.kind = 'time_off' then tests.id('m:' || t.holder || ':leave')
    when t.kind = 'leave' then tests.id('m:' || t.label)
    when t.kind = 'site' then tests.id('m:' || substr(t.label, 6))
    when t.kind = 'shift' then tests.id('m:shift:' || substr(t.label, 4))
    when t.kind = 'case' then tests.id('m:case:' || substr(t.label, 6))
    when t.kind in ('draft', 'template', 'placement', 'name_request') then tests.id('m:' || t.label)
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
  -- the path of their photo; nobody in the world has one, so an answer is the path or null (AVATAR-IKON)
  ('employee.avatar', 'person', 'employees.read', false, false,
   $$select coalesce(public.get_member_avatar_service($1, $2, $3), 'none')$$),
  -- removing the photo they uploaded, by whoever saves their record (AVATAR-IKON)
  ('employee.avatar_remove', 'person', 'employees.manage', false, false,
   $$select pg_temp.photo_then_remove($1, $2, $3) is not null$$),
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
  -- DAVET-ERISIM: a role change is an access change (the single-role service is gone). Making somebody an
  -- admin puts the admin role in the management slot, their employee slot kept; making them an employee
  -- leaves the employee role alone, the management slot emptied.
  ('employee.make_admin', 'person', null, true, false,
   $$select public.preview_employee_access_change_service($1, $2, $3,
       (select m.employee_role_id from public.employee_profiles e
        join public.workspace_memberships m on m.workspace_id = e.workspace_id and m.user_id = e.user_id where e.id = $3),
       (select r.id from public.workspace_roles r where r.workspace_id = $2 and r.system_key = 'admin')) is not null$$),
  ('employee.make_employee', 'person', 'employees.manage', false, false,
   $$select public.preview_employee_access_change_service($1, $2, $3,
       (select r.id from public.workspace_roles r where r.workspace_id = $2 and r.system_key = 'employee'), null) is not null$$),
  -- ROL-CIFT 4.1: an access change on somebody else's record, previewed with the slots they hold;
  -- on one's own record the owner alone (change_own_access). Each reaches only its own records.
  ('employee.change_access', 'person', 'employees.manage', false, true,
   $$select case when exists (select 1 from public.employee_profiles e where e.id = $3 and e.user_id = $1) then false
     else (select public.preview_employee_access_change_service($1, $2, $3, m.employee_role_id, m.role_id) is not null
       from public.employee_profiles e join public.workspace_memberships m on m.workspace_id = e.workspace_id and m.user_id = e.user_id
       where e.id = $3) end$$),
  ('employee.change_own_access', 'person', null, true, true,
   $$select case when not exists (select 1 from public.employee_profiles e where e.id = $3 and e.user_id = $1) then false
     else (select public.preview_employee_access_change_service($1, $2, $3, m.employee_role_id, m.role_id) is not null
       from public.workspace_memberships m where m.workspace_id = $2 and m.user_id = $1) end$$),
  ('employee.create', 'location', 'employees.manage', false, false,
   $$select public.create_employee_command_service($1, $2, gen_random_uuid(),
       jsonb_build_object('first_name', 'Probe', 'middle_name', '', 'last_name', 'Person', 'preferred_name', '',
         'invitation_email', 'probe.' || gen_random_uuid() || '@world.test', 'start_date', '', 'internal_note', '',
         'location_ids', to_jsonb(array_remove(array[$3], null)), 'primary_location_id', $3,
         'job_ids', case when $3 is null then '[]'::jsonb else to_jsonb(array[(select j.id from public.jobs j where j.workspace_id = $2 order by j.name limit 1)]) end,
         'primary_job_id', case when $3 is null then null else (select j.id from public.jobs j where j.workspace_id = $2 order by j.name limit 1) end,
         'is_remote', $3 is null, 'is_excluded_from_schedule', false, 'expected_revision', null),
       jsonb_build_object('employee_role_id',
         (select r.id from public.workspace_roles r where r.workspace_id = $2 and r.system_key = 'employee'))) is not null$$),
  ('schedule.read', 'location', 'schedule.read', false, true,
   $$select exists (select 1 from jsonb_array_elements(public.get_schedule_read_model_service($1, $2, tests.week(0)) -> 'locations') l
     where (l ->> 'id')::uuid = $3)$$),
  -- The day's lineups (LINEUP stage 1): the Schedule's readers, by location.
  ('lineup.read', 'location', 'schedule.read', false, true,
   $$select exists (select 1 from jsonb_array_elements(public.get_lineup_day_service($1, $2, tests.week(0)) -> 'locations') l
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
  -- Settings > Notifications (BILDIRIM-07): an organization setting, the whole setting saved as it is.
  ('notifications.workspace_settings', 'workspace', null, false, false,
   $$select public.save_notification_workspace_settings_service($1, $2,
       '{"email_enabled": true, "push_enabled": true, "sms_enabled": false, "muted_types": []}') is not null$$),
  ('workspace.close', 'workspace', null, true, false,
   $$select public.request_workspace_closure_service($1, $2, 'immediate', (select w.name from public.workspaces w where w.id = $2), true, null) is not null$$),
  ('workspace.transfer_ownership', 'workspace', null, true, false,
   $$select public.initiate_workspace_ownership_transfer_service($1, $2, tests.user('m:zeynep')) is not null$$),
  ('time_off.decide', 'time_off', 'schedule.time_off_requests.manage', false, false,
   $$select public.decide_time_off_service($1, $2, $3, 'approve', '',
       app_private.time_off_impact($2, $3) ->> 'fingerprint') is not null$$),
  -- deciding alone, at once: an admin or the owner; a manager's answer is a vote
  ('time_off.decide_alone', 'time_off', 'schedule.time_off_requests.manage', false, true,
   $$select (public.decide_time_off_service($1, $2, $3, 'approve', '',
       app_private.time_off_impact($2, $3) ->> 'fingerprint') ->> 'alone')::boolean$$),
  ('time_off.revoke', 'leave', 'schedule.time_off_requests.manage', false, false,
   $$select public.revoke_time_off_service($1, $2, $3,
       (select r.revision from public.schedule_time_off_requests r where r.id = $3), 'matrix probe') is not null$$),
  -- seeing time off comes with deciding it: no "View" level of its own (EKRAN-02 K-S3)
  ('requests.read', 'time_off', 'schedule.time_off_requests.manage', false, true,
   $$select exists (select 1 from jsonb_array_elements(public.get_schedule_requests_service($1, $2, 'needs_review')
       -> 'time_off_requests') r where (r ->> 'id')::uuid = $3)$$),
  -- One location (FB-6.7 K1); a blank location, or another workspace's, is
  -- the same no as one out of reach. A post on Important Dates asks the
  -- important date rule too (EKRAN-08).
  ('announcement.write', 'location', 'announcements.manage', false, false,
   $$select public.save_announcement_service($1, $2, null, null, jsonb_build_object('title', 'Probe',
       'locations', jsonb_build_array(jsonb_build_object('location_id', coalesce($3, gen_random_uuid()), 'day', 'open'))),
       'draft') is not null$$),
  ('important_date.write', 'location', 'important_dates.manage', false, false,
   $$select public.save_announcement_service($1, $2, null, null, jsonb_build_object('title', 'Probe',
       'starts_on', tests.week(0), 'on_important_dates', true,
       'locations', jsonb_build_array(jsonb_build_object('location_id', coalesce($3, gen_random_uuid()), 'day', 'open'))),
       'draft') is not null$$),
  -- Several locations (K1): every live location of the workspace at once.
  ('announcement.write_wide', 'workspace', 'announcements.manage', false, false,
   $$select public.save_announcement_service($1, $2, null, null, jsonb_build_object('title', 'Probe',
       'locations', (select jsonb_agg(jsonb_build_object('location_id', l.id, 'day', 'open')) from public.locations l
                     where l.workspace_id = $2 and l.archived_at is null)), 'draft') is not null$$),
  ('important_date.write_wide', 'workspace', 'important_dates.manage', false, false,
   $$select public.save_announcement_service($1, $2, null, null, jsonb_build_object('title', 'Probe',
       'starts_on', tests.week(0), 'on_important_dates', true,
       'locations', (select jsonb_agg(jsonb_build_object('location_id', l.id, 'day', 'open')) from public.locations l
                     where l.workspace_id = $2 and l.archived_at is null)), 'draft') is not null$$);

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
   $$select public.get_important_dates_service($1, $2) is not null$$),
  ('settings.roles.read', 'workspace', 'roles.read', false, false,
   $$select public.read_role_workspace_service($1, $2) is not null$$),
  ('settings.documents.read', 'workspace', 'documents.read', false, false,
   $$select public.list_settings_document_types_service($1, $2) is not null$$),
  ('settings.signature_templates.read', 'workspace', 'documents.read', false, false,
   $$select public.read_signature_settings_service($1, $2) is not null$$);

-- Removing somebody from one location (FB-6.2 S1), and answering a preferred
-- name (BL-099): the pending list shows only what the actor may answer.
insert into action (key, target_kind, permission, owner_only, empty_is_no, template) values
  ('employee.remove_from_location', 'placement', 'employees.manage', false, false,
   $$select public.remove_employee_from_location_service($1, $2, a.employee_id, a.location_id) is not null
     from public.employee_location_assignments a where a.id = $3$$),
  ('employee.decide_preferred_name', 'name_request', 'employees.manage', false, false,
   $$select public.decide_employee_preferred_name_service($1, $2, $3, true)$$),
  ('employee.pending_names', 'name_request', 'employees.manage', false, true,
   $$select exists (select 1 from public.list_pending_preferred_names_service($1, $2) r where r.request_id = $3)$$);

-- The Employees drawer's pickers (BL-231): the locations the actor reaches.
insert into action (key, target_kind, permission, owner_only, empty_is_no, template) values
  ('employee.references.read', 'location', 'employees.read', false, true,
   $$select exists (select 1 from jsonb_array_elements(public.read_employee_references_service($1, $2) -> 'locations') l
     where (l ->> 'id')::uuid = $3)$$);

-- Somebody's documents (FB-6.6): read, and decided on. Exempting is the
-- decision a probe can make on any badge without a submission.
insert into action (key, target_kind, permission, owner_only, empty_is_no, template) values
  ('documents.read', 'person', 'employee_documents.read', false, true,
   $$select public.get_employee_document_lifecycle_service($1, $2, pg_temp.badge($3), false) is not null$$),
  ('documents.review', 'person', 'employee_documents.review', false, false,
   $$select public.set_employee_document_exemption_service($1, $2, pg_temp.badge($3),
       (select r.lifecycle_revision from public.employee_onboarding_requirements r where r.id = pg_temp.badge($3)), true, 'matrix probe') is not null$$),
  ('onboarding.review', 'person', 'employee_onboarding.review', false, true,
   $$select public.get_employee_onboarding_review_service($1, $2, $3) is not null$$),
  ('onboarding.legal_name', 'person', 'employee_onboarding.review', false, false,
   $$select public.review_employee_onboarding_before_availability_service($1, $2, $3, 'accept_requirement',
       (select r.id from public.employee_onboarding_requirements r where r.employee_id = $3 and r.kind = 'profile'), '',
       (select c.revision from public.employee_onboarding_cases c where c.employee_id = $3), true) is not null$$);
insert into action (key, target_kind, permission, owner_only, empty_is_no, template, member, restricted_ok) values
  -- One's own document and onboarding, open to somebody still finishing it.
  ('documents.self', 'person', null, false, true,
   $$select public.get_employee_document_lifecycle_service($1, $2, pg_temp.badge($3), true) is not null$$, true, true),
  ('onboarding.self', 'workspace', null, false, true,
   $$select public.get_employee_onboarding_service($1, $2) is not null$$, true, true),
  -- One's own avatar in this workspace (AVATAR-IKON), also while onboarding is not finished.
  ('avatar.self', 'workspace', null, false, true,
   $$select public.get_own_avatar_service($1, $2) is not null$$, true, true),
  -- One's own notification list (BILDIRIM-07), also while onboarding is not finished.
  ('notifications.read_own', 'workspace', null, false, false,
   $$select public.get_notification_feed_service($1, $2) is not null$$, true, true),
  -- and one's own choices, written (a choice put back to the default changes nothing).
  ('notifications.write_own', 'workspace', null, false, false,
   $$select public.save_notification_preferences_service($1, $2,
       '[{"topic": "my_schedule", "channel": "email", "enabled": null}]') is not null$$, true, true),
  ('exchange.offer_own', 'shift', null, false, false,
   $$select public.shift_exchanges_command_service($1, $2,
       jsonb_build_object('action', 'create', 'kind', 'cover', 'shift_id', $3), gen_random_uuid()) is not null$$, true, false),
  ('time_off.request_own', 'workspace', null, false, false,
   $$select public.submit_time_off_service($1, $2, jsonb_build_array(jsonb_build_object('segment_date', tests.week(1) + 3)),
       'probe', 'Europe/Istanbul', gen_random_uuid()) is not null$$, true, false),
  -- one's own week of availability: an employee's only (M13), also while
  -- finishing onboarding, whose step writes the same week (M2, AVAIL-002)
  ('availability.own', 'person', null, false, true,
   $$select (public.weekly_preferences_read_service($1, $2, $3) ->> 'can_edit_employee')::boolean$$, true, true),
  -- one's own emergency contact, on one's own record only (BL-443, BL-444)
  ('employee.save_own_contact', 'person', null, false, false,
   $$select true from (select public.save_own_employment_contact_service($1, $2, $3,
       'Probe Contact', 'Friend', '+14155550100') offset 0) done$$, true, true);
-- Publishing a day's lineup (LINEUP-PUBLISH): who publishes the Schedule there, by location.
insert into action (key, target_kind, permission, owner_only, empty_is_no, template) values
  ('lineup.share', 'site', 'schedule.publish', false, false,
   $$select public.lineup_command_service($1, $2, gen_random_uuid(), 'share', jsonb_build_object(
       'lineups', jsonb_build_array(jsonb_build_object('location_id', $3, 'service_date', tests.week(0) + 1,
         'shift_type_id', null)), 'ask_ack', true)) is not null$$);
-- The managers' Home (KARARLAR S-210): opening it, and arranging one's own cards on it (KK-36).
insert into action (key, target_kind, permission, owner_only, empty_is_no, template) values
  ('home.manager.read', 'workspace', 'workspace.read', false, false,
   $$select public.get_manager_home_service($1, $2) is not null$$),
  ('home.layout.save', 'workspace', 'workspace.read', false, false,
   $$select public.save_workspace_layout_service($1, $2,
       array['quick_actions', 'operations', 'pending_requests', 'open_shifts', 'announcements', 'todos'],
       array[]::text[]) is not null$$);

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
  ('employee.avatar', 'employee.read', 'null'),
  ('employee.avatar_remove', 'employee.save', 'null'),
  ('employee.save', 'employee.save', 'null'),
  ('availability.team_write', 'availability.team_write', 'null'),
  ('availability.team_read', 'availability.team_read', 'null'),
  ('availability.note_read', 'availability.note_read', 'null'),
  ('employee.terminate', 'employee.terminate', 'null'),
  ('employee.archive', 'employee.archive', 'null'),
  ('employee.remove_access', 'employee.remove_access', 'null'),
  ('employee.make_admin', 'employee.make_admin', 'null'),
  ('employee.make_employee', 'employee.change_role', 'null'),
  ('employee.change_access', 'employee.change_role', 'null'),
  ('employee.change_own_access', 'employee.change_own_access', 'null'),
  ('employee.create', 'employee.create', 'org'),
  ('schedule.read', 'schedule.read', 'null'),
  ('lineup.read', 'lineup.read', 'null'),
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
  ('notifications.workspace_settings', 'settings.organization.write', 'null'),
  ('settings.locations.read', 'settings.locations.read', 'null'),
  ('settings.jobs.read', 'settings.jobs.read', 'null'),
  ('settings.shift_catalog.read', 'settings.shift_catalog.read', 'null'),
  ('settings.important_dates.read', 'settings.important_dates.read', 'null'),
  ('settings.roles.read', 'settings.roles.read', 'null'),
  ('settings.documents.read', 'settings.documents.read', 'null'),
  ('settings.signature_templates.read', 'settings.signature_templates.read', 'null'),
  ('employee.references.read', 'employee.references.read', 'null'),
  ('employee.remove_from_location', 'employee.remove_from_location', 'null'),
  ('employee.decide_preferred_name', 'employee.decide_preferred_name', 'null'),
  ('employee.pending_names', 'employee.decide_preferred_name', 'null'),
  ('workspace.close', 'workspace.close', 'null'),
  ('workspace.transfer_ownership', 'workspace.transfer_ownership', 'null'),
  ('time_off.decide', 'time_off.decide', 'null'),
  ('time_off.decide_alone', 'time_off.decide_alone', 'null'),
  ('time_off.revoke', 'time_off.revoke', 'null'),
  ('requests.read', 'requests.read', 'null'),
  ('announcement.write', 'announcement.write', 'null'),
  ('important_date.write', 'important_date.write', 'null'),
  ('announcement.write_wide', 'announcement.write_wide', 'null'),
  ('important_date.write_wide', 'important_date.write_wide', 'null'),
  ('read.membership', 'membership.read', 'null'),
  ('read.audit', 'audit.read', 'null'),
  ('notifications.read_own', 'notifications.read_own', 'null'),
  ('notifications.write_own', 'notifications.write_own', 'null'),
  ('documents.read', 'documents.read', 'null'),
  ('documents.review', 'documents.review', 'null'),
  ('documents.self', 'documents.self', 'null'),
  ('onboarding.review', 'onboarding.review', 'null'),
  ('onboarding.legal_name', 'onboarding.legal_name', 'null'),
  ('onboarding.self', 'onboarding.self', 'null'),
  ('avatar.self', 'avatar.self', 'null'),
  ('exchange.offer_own', 'exchange.offer_own', 'null'),
  ('time_off.request_own', 'time_off.request_own', 'null'),
  ('employee.save_own_contact', 'employee.save_own_contact', 'null'),
  ('availability.own', 'availability.own', 'null');
insert into core_action (key, core_key, blank) values ('lineup.share', 'lineup.share', 'null');
insert into core_action (key, core_key, blank) values
  ('home.manager.read', 'workspace.todos', 'null'),
  ('home.layout.save', 'workspace.todos', 'null');
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
  reach text[];
  shares boolean;
  covers boolean;
begin
  select * into p from persona where label = actor_label;
  select * into a from action where key = action_key;
  if target_label = 'self' then
    t := row('self', 'person', p.tenant, p.locs, p.class, actor_label, p.employee)::target;
  else
    select * into t from target where label = target_label;
  end if;
  is_self := t.holder = actor_label;

  -- Nobody reaches into another workspace, and only active members act at all;
  -- somebody who has not finished onboarding only finishes it.
  -- Oya acts in her own world, on her own record only.
  if t.tenant <> p.tenant or p.tenant = 'x' then return 'deny'; end if;
  -- Whoever has a membership, in whatever state, can read their own row.
  if action_key = 'read.membership' and is_self then
    return case when p.status = 'invited' then 'deny' else 'allow' end;
  end if;
  -- One's own action is never done on somebody else's, in whatever state.
  if a.member and t.holder is not null and not is_self then return 'deny'; end if;
  -- Availability, offering a shift and asking time off are the employee side's: they need the employee
  -- slot, whatever the management slot (KARARLAR M13; ROL-CIFT, design §4.4, §4.10, §4.11).
  if action_key in ('availability.own', 'exchange.offer_own', 'time_off.request_own') and not p.employee then
    return 'deny';
  end if;
  if p.status = 'restricted' and a.restricted_ok then return 'allow'; end if;
  if p.status <> 'active' then return 'deny'; end if;
  if a.member then return 'allow'; end if;
  if a.permission is not null and a.permission = any (p.permissions_removed) then return 'deny'; end if;
  if a.owner_only and p.class <> 'owner' then return 'deny'; end if;
  if p.class = 'employee' then return 'deny'; end if;

  -- A manager's reach: their Manages, and nothing else (KARARLAR S-167, design §4.2; it was where they
  -- work, EMP-001). An empty list reaches nowhere.
  reach := p.manages;
  shares := t.locs is not null and t.locs && reach;
  covers := t.locs is not null and cardinality(t.locs) > 0 and t.locs <@ reach;

  case action_key
  when 'employee.read', 'employee.list', 'employee.avatar' then
    if p.class in ('owner', 'admin') then return 'allow'; end if;
    return case when shares then 'allow' else 'deny' end;

  when 'employee.save', 'employee.avatar_remove' then
    -- User decisions 2026-09-24 (1A-4A): an admin does not edit the owner's
    -- record; a manager edits neither their own record (it goes one level up)
    -- nor a peer's or a senior's, and edits the whole record of somebody who
    -- also works at another location.
    if p.class = 'owner' then return 'allow'; end if;
    -- Nor another admin's: peers do not manage peers (KK-24, 2026-09-29).
    if p.class = 'admin' then
      return case when t.class = 'owner' or (t.class = 'admin' and not is_self) then 'deny' else 'allow' end;
    end if;
    if not shares or is_self then return 'deny'; end if;
    if pg_temp.rank(t.class) >= pg_temp.rank('manager') then return 'deny'; end if;
    return 'allow';

  when 'availability.team_write', 'availability.note_read' then
    -- The Manager note is about the employee side (user decision 2026-09-26): about everybody who holds
    -- the employee slot, a manager or an admin who works too included, and about nobody else (ROL-CIFT,
    -- design §4.11). Nobody reads or writes one about themselves (design §4.6). Owner and admins for
    -- every such person, a manager for those at the locations they manage.
    if not coalesce(t.employee, false) or is_self then return 'deny'; end if;
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

  when 'employee.remove_from_location' then
    -- A manager takes an employee off a location they manage; the record stays,
    -- with no location if it was the only one (FB-6.2 S1). Ending employment
    -- is admin and owner only (above). Nobody removes themselves or a peer.
    if is_self then return 'deny'; end if;
    if p.class = 'owner' then return 'allow'; end if;
    if p.class = 'admin' then
      return case when pg_temp.rank(t.class) < pg_temp.rank('admin') then 'allow' else 'deny' end;
    end if;
    return case when t.class = 'employee' and covers then 'allow' else 'deny' end;

  when 'employee.decide_preferred_name', 'employee.pending_names' then
    -- A request goes one rank up and nobody answers their own (BL-099); the
    -- owner's own request passes by itself (KK-17), so it never waits here.
    if is_self then return 'deny'; end if;
    if p.class = 'owner' then return 'allow'; end if;
    if p.class = 'admin' then
      return case when pg_temp.rank(t.class) < pg_temp.rank('admin') then 'allow' else 'deny' end;
    end if;
    return case when t.class = 'employee' and shares then 'allow' else 'deny' end;

  when 'documents.read' then
    -- M2: whoever reads documents reads everybody's where they manage; the
    -- owner and admins everybody's (FB-6.6). A restricted reader reads
    -- nobody's (D3, above).
    if p.class in ('owner', 'admin') then return 'allow'; end if;
    return case when shares then 'allow' else 'deny' end;

  when 'documents.review', 'onboarding.review' then
    -- One rank up, never one's own nor a peer's (D1, P07): an employee's at a
    -- manager's locations, an admin or the owner; a manager's by an admin or
    -- the owner; an admin's by the owner only.
    if is_self then return 'deny'; end if;
    if p.class = 'owner' then return 'allow'; end if;
    if p.class = 'admin' then
      return case when pg_temp.rank(t.class) < pg_temp.rank('admin') then 'allow' else 'deny' end;
    end if;
    return case when t.class = 'employee' and shares then 'allow' else 'deny' end;

  when 'onboarding.legal_name' then
    -- A legal name is approved by an owner or an admin only, one rank up
    -- (Mert, 2026-10-02, FB-6.6 S1); a manager never, whatever their role holds.
    if is_self then return 'deny'; end if;
    if p.class = 'owner' then return 'allow'; end if;
    if p.class = 'admin' then
      return case when pg_temp.rank(t.class) < pg_temp.rank('admin') then 'allow' else 'deny' end;
    end if;
    return 'deny';

  when 'employee.make_admin' then
    -- Owner only (checked above); nobody changes their own role.
    return case when is_self or t.class = 'owner' then 'deny' else 'allow' end;

  when 'employee.change_own_access' then
    -- The owner, with nobody above, on their own record alone (ROL-CIFT 4.1, KARARLAR S-165).
    return case when is_self then 'allow' else 'deny' end;

  -- An access change goes one rank above the person's highest access (ROL-CIFT 4.1), as a role change.
  when 'employee.make_employee', 'employee.change_access' then
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

  -- A lineup is read where the Schedule is (LINEUP stage 1).
  when 'schedule.read', 'lineup.read' then
    if t.locs is null then return 'deny'; end if;
    if p.class in ('owner', 'admin') then return 'allow'; end if;
    return case when covers then 'allow' else 'deny' end;

  when 'schedule.edit', 'schedule.templates.read' then
    -- May they do it somewhere at all: a manager needs a location.
    if p.class in ('owner', 'admin') then return 'allow'; end if;
    return case when cardinality(reach) > 0 then 'allow' else 'deny' end;

  when 'settings.organization.write', 'settings.locations.write', 'settings.jobs.write',
       'settings.roles.write', 'settings.scheduling.write', 'settings.conflict_rules.write',
       'notifications.workspace_settings' then
    -- Managers read the catalog; they never write organization settings (D1).
    return case when p.class in ('owner', 'admin') then 'allow' else 'deny' end;

  when 'settings.locations.read', 'employee.references.read' then
    -- Owner and admins read every location; the Employees drawer's pickers
    -- (BL-231) give a manager the locations where they work. No manager role
    -- holds settings.locations.read (Mert 2026-10-12, BL-176).
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

  when 'home.manager.read', 'home.layout.save' then
    -- The managers' Home is management's (KARARLAR S-210): the owner, an admin, a manager, whatever
    -- they manage (one managing nowhere opens it empty), and whoever only works never (checked above);
    -- nor somebody suspended, invited, removed, still in onboarding or of another workspace (above).
    -- Its layout is one's own and goes with opening it (KK-36).
    return 'allow';

  when 'time_off.decide', 'requests.read' then
    -- One decision chain (KARARLAR S-164, S-169; ROL-CIFT design §4.5): the managers of every location
    -- the person works at vote, the person aside; rank is not counted on the employee side, so a peer
    -- manager votes on a manager's and an admin's request too. An admin and the owner decide at every
    -- step (FB-6.3). The Requests queue reads only what its reader decides (FB-6.3.8c); one's own
    -- waits on Employee hub (the owner whom nobody else answers is world o's, not this one's).
    if is_self then return 'deny'; end if;
    if p.class in ('owner', 'admin') then return 'allow'; end if;
    return case when shares then 'allow' else 'deny' end;

  when 'time_off.revoke' then
    -- Taking approved time off back is management's, by rank: any manager of a location the person
    -- works at, or an admin or the owner, one rank up; nobody their own.
    if is_self then return 'deny'; end if;
    if p.class = 'owner' then return 'allow'; end if;
    if p.class = 'admin' then return case when t.class in ('admin', 'owner') then 'deny' else 'allow' end; end if;
    return case when t.class = 'employee' and shares then 'allow' else 'deny' end;

  when 'time_off.decide_alone' then
    -- At once and final: an admin or the owner, whatever the person's rank (S-169), never their own.
    if is_self then return 'deny'; end if;
    if p.class in ('owner', 'admin') then return 'allow'; end if;
    return 'deny';

  -- A lineup is published by whoever publishes the Schedule there (LINEUP-PUBLISH).
  when 'schedule.publish', 'lineup.share' then
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
    -- A pickup or cover is approved at the shift's location only, by its manager, an admin or the
    -- owner, whatever the rank of the person it is about (KARARLAR S-164, S-169); nobody decides
    -- their own (D3, P07).
    if is_self then return 'deny'; end if;
    if p.class in ('owner', 'admin') then return 'allow'; end if;
    return case when covers then 'allow' else 'deny' end;

  when 'read.membership' then
    if p.class in ('owner', 'admin') then return 'allow'; end if;
    return case when shares then 'allow' else 'deny' end;

  when 'read.audit' then
    return case when p.class in ('owner', 'admin') then 'allow' else 'deny' end;

  when 'announcement.write', 'important_date.write' then
    -- A record at one location (KARARLAR "Duyurular ve önemli tarihler" K1):
    -- an admin or the owner anywhere, a manager where they manage; nobody at
    -- no location.
    if t.locs is null then return 'deny'; end if;
    if p.class in ('owner', 'admin') then return 'allow'; end if;
    return case when covers then 'allow' else 'deny' end;

  when 'announcement.write_wide', 'important_date.write_wide' then
    -- Several locations or the whole workspace: an admin's or the owner's (K1).
    return case when p.class in ('owner', 'admin') then 'allow' else 'deny' end;

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
-- FB-6.4 A2 closed the last known gap (legacy-blank-location): the three
-- old Schedule helpers are gone. A new gap is a row here.

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

create function pg_temp.core_answer(user_id uuid, own_employee uuid, action_key text, target_label text, target_uuid uuid,
  w uuid)
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
    when 'time_off', 'leave', 'shift', 'case', 'placement' then
      person := case t.holder when 'olcay' then tests.id('m:owner') else tests.id('m:' || t.holder) end;
      places := array(select tests.id('m:' || l) from unnest(t.locs) l);
      -- A vote on time off is cast for one location at a time: any location
      -- of the person where the actor may decide lets them vote (FB-6.3).
      if t.kind = 'time_off' and (select a.scope_class from app_private.authz_actions a where a.key = m.core_key) = 'place' then
        if exists (select 1 from unnest(places) place
                   where app_private.authz_reason(user_id, tests.id('m'), m.core_key, array[place], person) is null) then
          return 'allow';
        end if;
        select r into reason from unnest(places) place,
          app_private.authz_reason(user_id, tests.id('m'), m.core_key, array[place], person) r limit 1;
        return 'deny:' || reason;
      end if;
    when 'name_request' then
      person := tests.id('m:' || t.holder);
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
  reason := app_private.authz_reason(user_id, w, m.core_key, places, person, account);
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
    select p.label as actor, ac.user_id, ac.employee_id as own_employee, ac.workspace_id, a.key, a.template, a.empty_is_no,
      t.label as target,
      case when t.label = 'self' then ac.employee_id else ti.id end as target_id
    from persona p
    join actor ac on ac.label = p.label
    cross join action a
    join (select label, kind from target union all select 'self', 'person') t on t.kind = a.target_kind
    left join target_id ti on ti.label = t.label
    -- Oya acts on her own record in her own world; the matrix badge is world m's, so not on documents.
    where p.tenant <> 'o' or (t.label = 'self' and a.key not like 'documents.%')
    order by a.key, p.label, t.label
  loop
    actual := pg_temp.probe(c.template, c.user_id, c.workspace_id,
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

    core := pg_temp.core_answer(c.user_id, c.own_employee, c.key, c.target, c.target_id, c.workspace_id);
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

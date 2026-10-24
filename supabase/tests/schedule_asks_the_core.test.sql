begin;
create extension if not exists pgtap with schema extensions;
select plan(83);

-- DAVET-ERISIM: a role change is an access change (the single-role service is gone). An employee role
-- takes the employee slot and empties the management one; a management role goes beside the employee
-- slot held, a manager managing where they work.
create function pg_temp.change_role(actor uuid, w uuid, emp uuid, next_role uuid) returns jsonb language sql as $$
  select public.change_employee_access_service(actor, w, emp,
    case when r.access_class = 'employee' then r.id else m.employee_role_id end,
    case when r.access_class <> 'employee' then r.id end,
    case when r.access_class = 'manager' then array(select a.location_id from public.employee_location_assignments a
      where a.employee_id = emp and a.ended_at is null) else '{}'::uuid[] end,
    null, null)
  from public.workspace_roles r, public.employee_profiles e
  join public.workspace_memberships m on m.workspace_id = e.workspace_id and m.user_id = e.user_id
  where r.id = next_role and e.id = emp
$$;
grant execute on function pg_temp.change_role(uuid, uuid, uuid, uuid) to public;

-- FB-6.1 step .2: Schedule's entry points ask the authorization core
-- (app_private.authorize() / scope_set()) instead of the three old Schedule
-- helpers, and a no is 42501 with an authz.* hint. The helpers stay until the
-- time off and shift exchange slices move their last callers (FB-6.1 K-1).
--
-- "Somewhere" (K-bir-yerde): an object with no location of its own (an export
-- preset, the drafts list) is asked of the locations the person reaches:
--   app_private.authorize(actor, w, '<action>',
--     target_locations => app_private.scope_set(actor, w, '<action>'))
-- Owners and admins pass ('{}' is the whole organization), a manager passes
-- with one location in reach, a manager with none is out_of_scope. Only set
-- actions read '{}' that way, so the shape is only used with them (section 2).
-- An action on one place or one person asks the same question as
--   if cardinality(scope_set(...)) = 0 then perform authorize(actor, w, act)
-- which raises the reason (a blank location is never everywhere).

select tests.world('sc');
select tests.world('sx');
select tests.person('sc', 'zeynep', 'admin', array['K'], array['server']);
select tests.person('sc', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('sc', 'mehmet', 'manager', array['B'], array['cook']);
select tests.person('sc', 'can', 'manager', array['K', 'B'], array['cook', 'server']);
select tests.person('sc', 'nur', 'manager', null, null);
select tests.person('sc', 'aydan', 'manager', array['K'], array['cook']);
select tests.person('sc', 'emre', 'employee', array['K'], array['cook']);
select tests.person('sc', 'veli', 'employee', array['B'], array['server']);
select tests.role('sc', 'rules lead', 'manager', array(
  select rp.permission_key
  from public.workspace_role_permissions rp
  join public.workspace_roles r on r.id = rp.role_id
  where r.workspace_id = tests.id('sc') and r.system_key = 'manager'
  union select 'settings.schedule_rules.read'
));
-- Settings > Roles no longer puts schedule.conflict_rules.manage on a
-- manager-type role (GUVENLIK-A GA-2); written straight into the table, the
-- conflict rules check below proves the core still says no.
insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
values (tests.id('sc'), tests.id('sc:role:rules lead'), 'schedule.conflict_rules.manage');
select tests.person('sc', 'rita', 'rules lead', array['K'], array['cook']);
-- A manager-type role without template access.
select tests.role('sc', 'no templates', 'manager', array(
  select rp.permission_key
  from public.workspace_role_permissions rp
  join public.workspace_roles r on r.id = rp.role_id
  where r.workspace_id = tests.id('sc') and r.system_key = 'manager'
    and rp.permission_key not in ('schedule.templates.read', 'schedule.templates.manage')
));
select tests.person('sc', 'tina', 'no templates', array['K'], array['cook']);
select tests.person('sc', 'zafer', 'admin', array['B'], array['server']);
-- The managers and admins here only manage (ROL-CIFT): the Manager note and one's own availability
-- are about the employee side, which they do not hold.
select tests.no_employee_slot('sc', p) from unnest(array['zeynep', 'ayse', 'can', 'zafer']) p;
-- A workspace whose every location is closed.
select tests.world('sn');

-- Aydan misses a required document: a document everybody must hand in, and
-- her deadline has passed.
-- ponytail: the deadline is moved into the past by hand; nothing in the
-- product moves the clock.
create temporary table required_document (id uuid, preview jsonb);
insert into required_document (id)
select public.save_document_type_lifecycle_service(tests.user('sc:owner'), tests.id('sc'), null, null, jsonb_build_object(
  'title', 'Food handler card', 'description', 'Card', 'requires_review', true, 'accepted_formats', array['pdf'],
  'tracks_expiry', false, 'expiry_warning_days', 30,
  'lifecycle_settings', jsonb_build_object('mode', 'conditional', 'assignment_scope', 'all_active',
    'target', jsonb_build_object('operator', 'and', 'location_ids', '[]'::jsonb, 'department_ids', '[]'::jsonb,
      'job_ids', '[]'::jsonb, 'employee_ids', '[]'::jsonb),
    'period_days', 7, 'suspend_on_overdue', true, 'extra_fields', '[]'::jsonb)));
update required_document set preview = public.preview_document_publication_service(tests.user('sc:owner'), tests.id('sc'), id);
select public.set_document_publication_service(tests.user('sc:owner'), tests.id('sc'), id,
  (preview ->> 'revision')::integer, (preview ->> 'publication_revision')::integer, preview ->> 'preview_token', 'Publish', 'published')
from required_document;
select tests.settle();
update public.employee_onboarding_requirements set deadline_at = now() - interval '1 day'
where source_id = (select id from required_document) and lifecycle_user_id = tests.user('sc:aydan');


create function pg_temp.said(statement text) returns text
language plpgsql
as $$
declare
  code text;
  reason text;
  what text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics code = returned_sqlstate, reason = pg_exception_hint, what = pg_exception_detail;
  return concat_ws(' ', code, nullif(reason, ''), nullif(what, ''));
end;
$$;

select is((app_private.actor(tests.user('sc:aydan'), tests.id('sc'))).document_blocked, true, 'Aydan misses a required document');
select is(app_private.scope_set(tests.user('sc:nur'), tests.id('sc'), 'schedule.edit'), '{}'::uuid[], 'Nur manages no location');

-- 1. Nobody asks the old helpers ---------------------------------------------------------
-- FB-6.4 A2 moved the last six callers (time off and shift exchanges) to the
-- core and dropped the three Schedule helpers (FB-6.1 K-1); nothing may start
-- asking them again.

select is(
  array(select distinct p.proname::text from pg_proc p
    where p.pronamespace in ('public'::regnamespace, 'app_private'::regnamespace)
      and p.prosrc ~ 'schedule_actor_(can_manage|can_publish|has_capability)_service\s*\(' order by 1),
  '{}'::text[],
  'nobody asks the old Schedule helpers (58 before FB-6.1 .2, 24 before .4, 10 before BL-177, 6 before FB-6.4)'
);

-- 2. The "somewhere" shape ----------------------------------------------------------------
-- Every target_locations => app_private.scope_set( call is the whole shape, asks
-- for the same person, workspace and action twice, and the action is a set
-- action, the only kind where an empty reach ('{}') means the organization.

create temporary table somewhere_call as
select p.oid, p.proname::text as name, m[1] as actor_asked, m[2] as workspace_asked, m[3] as action_asked,
  m[4] as actor_reached, m[5] as workspace_reached, m[6] as action_reached
from pg_proc p,
  regexp_matches(p.prosrc,
    'app_private\.authorize\(\s*([a-z_]+)\s*,\s*([a-z_]+)\s*,\s*''([a-z_.]+)''\s*,\s*target_locations\s*=>\s*app_private\.scope_set\(\s*([a-z_]+)\s*,\s*([a-z_]+)\s*,\s*''([a-z_.]+)''\s*\)\s*\)',
    'g') m
where p.pronamespace in ('public'::regnamespace, 'app_private'::regnamespace);

select is(
  array(
    select p.proname::text from pg_proc p
    where p.pronamespace in ('public'::regnamespace, 'app_private'::regnamespace)
      and p.proname <> 'scope_set'
      and (select count(*) from regexp_matches(p.prosrc, 'target_locations\s*=>\s*app_private\.scope_set\(', 'g'))
        <> (select count(*) from somewhere_call c where c.oid = p.oid)
    order by 1
  ),
  '{}'::text[],
  'every scope_set() target is the whole "somewhere" shape'
);
select is(
  array(
    select distinct c.name || ': ' || c.action_asked from somewhere_call c
    left join app_private.authz_actions a on a.key = c.action_asked
    where c.action_asked <> c.action_reached or c.actor_asked <> c.actor_reached
       or c.workspace_asked <> c.workspace_reached or a.scope_class is distinct from 'set'
    order by 1
  ),
  '{}'::text[],
  '"somewhere" asks for one person, one workspace and one set action'
);
select cmp_ok((select count(distinct name)::integer from somewhere_call), '>=', 12, 'the Schedule entry points without a location of their own ask "somewhere"');

-- 3. How each "somewhere" gate says no ------------------------------------------------------
-- A manager with no location, a manager missing a required document and an
-- employee are refused with the reason; the owner passes.

-- Time off rebuild D8: the old Requests reader (get_schedule_requests_service, requests.read "somewhere") went
-- with the old time off; the new list, time_off_requests_service, asks time_off.decide of each person.
create temporary table gate (action text primary key, statement text not null);
insert into gate values
  ('schedule.export', $$select public.list_schedule_export_presets_service(%L, %L)$$),
  ('schedule.edit', $$select public.list_schedule_drafts_service(%L, %L, tests.week(0))$$),
  ('schedule.templates', $$select public.apply_schedule_template_service(%L, %L, gen_random_uuid(), 1, gen_random_uuid(), 'merge', array['__no_department__'])$$),
  ('schedule.templates.read', $$select public.list_schedule_templates_service(%L, %L)$$),
  ('exchange.read', $$select public.shift_exchanges_read_service(%L, %L, true)$$),
  ('availability.team_read', $$select public.weekly_team_read_service(%L, %L)$$);

create function pg_temp.at_gate(person text, gate_action text) returns text
language sql
as $$
  select pg_temp.said(format(g.statement, tests.user('sc:' || person), tests.id('sc')))
  from gate g where g.action = gate_action
$$;

select is(pg_temp.at_gate('nur', g.action), '42501 authz.out_of_scope ' || g.action,
  g.action || ': a manager with no location is out of scope')
from gate g order by g.action;
select is(pg_temp.at_gate('aydan', g.action), '42501 authz.document_blocked ' || g.action,
  g.action || ': a manager missing a required document is blocked')
from gate g where g.action <> 'exchange.read' order by g.action;
-- ...but reads Requests and decides nothing there (EKRAN-02 K-S2).
select is(pg_temp.at_gate('aydan', g.action), 'allowed',
  g.action || ': a manager missing a required document still reads Requests')
from gate g where g.action = 'exchange.read' order by g.action;
select is(pg_temp.at_gate('emre', g.action), '42501 authz.missing_permission ' || g.action,
  g.action || ': an employee does not hold the permission')
from gate g order by g.action;
select ok(pg_temp.at_gate('owner', g.action) not like '42501%',
  g.action || ': the owner passes (' || pg_temp.at_gate('owner', g.action) || ')')
from gate g order by g.action;

select is(pg_temp.said(format($$select public.list_schedule_templates_service(%L, %L)$$, tests.user('sc:tina'), tests.id('sc'))),
  '42501 authz.missing_permission schedule.templates.read', 'a manager-type role without template access cannot list templates');
select is(pg_temp.said(format($$select public.get_schedule_template_service(%L, %L, gen_random_uuid())$$, tests.user('sc:tina'), tests.id('sc'))),
  '42501 authz.missing_permission schedule.templates.read', 'a manager-type role without template access cannot open a template');

-- The Manager note (Team availability) is about employees only: nobody writes
-- or reads one about a manager, an admin or the owner, themselves included
-- (user decision 2026-09-26, REUSE "Müsaitlik notu yalnız çalışan için").
create function pg_temp.may_write_note(person text, whose text) returns text
language plpgsql
as $$
begin
  return case when (public.weekly_preferences_read_service(tests.user('sc:' || person), tests.id('sc'), tests.id('sc:' || whose))
    ->> 'can_manage')::boolean then 'yes' else 'no' end;
exception when sqlstate '42501' then
  return 'no';
end;
$$;
select is(pg_temp.may_write_note('ayse', 'emre'), 'yes', 'Ayşe writes a note about Emre, who works at Kadıköy');
select is(pg_temp.may_write_note('ayse', 'can'), 'no', 'Ayşe does not write a note about Can, a manager at Kadıköy');
select is(pg_temp.may_write_note('ayse', 'ayse'), 'no', 'Ayşe does not write a note about herself');
select is(pg_temp.may_write_note('zeynep', 'owner'), 'no', 'an admin does not write a note about the owner');
select is(pg_temp.may_write_note('zeynep', 'zafer'), 'no', 'an admin does not write a note about another admin');
select is(pg_temp.may_write_note('zeynep', 'zeynep'), 'no', 'an admin has no Manager note, not even her own');
select is(pg_temp.may_write_note('owner', 'owner'), 'no', 'the owner has no Manager note, not even her own');
select is(pg_temp.may_write_note('zeynep', 'emre'), 'yes', 'Zeynep (admin) writes a note about Emre, an employee');
select is(pg_temp.may_write_note('zeynep', 'ayse'), 'no', 'Zeynep (admin) does not write a note about Ayşe, a manager');

-- Only an employee saves a week of their own (M13, AVAIL-002).
create function pg_temp.save_own(whose text) returns void
language plpgsql
as $$
begin
  perform public.weekly_preferences_save_service(tests.user('sc:' || whose), tests.id('sc'), jsonb_build_object(
    'employee_id', tests.id('sc:' || whose), 'source', 'employee',
    'expected_revision', coalesce((select p.revision from public.employee_weekly_preferences p where p.employee_id = tests.id('sc:' || whose)), 0),
    'settings_revision', (select s.availability_preferences_revision from public.workspace_scheduling_settings s where s.workspace_id = tests.id('sc')),
    'preference', public.empty_weekly_preference()), gen_random_uuid());
end;
$$;
select throws_ok($$select pg_temp.save_own('can')$$, '42501', null, 'Can, a manager at Kadıköy, does not save a week of his own');
select lives_ok($$select pg_temp.save_own('emre')$$, 'Emre, an employee, saves his own week');

-- Who reads a person's weekly availability: every manager of a location they work at,
-- whatever their rank, and the owner and admins (user decision 2026-09-26, BL-139);
-- the Manager note comes with it only when the person is an employee.
create function pg_temp.reads(reader uuid, whose uuid) returns boolean
language plpgsql
as $$
begin
  perform public.weekly_preferences_read_service(reader, tests.id('sc'), whose);
  return true;
exception when sqlstate '42501' then
  return false;
end;
$$;
create function pg_temp.reads(person text, whose text) returns boolean
language sql
as $$ select pg_temp.reads(tests.user('sc:' || person), tests.id('sc:' || whose)) $$;
create function pg_temp.reads_note(person text, whose text) returns boolean
language plpgsql
as $$
begin
  return coalesce(jsonb_typeof(public.weekly_preferences_read_service(tests.user('sc:' || person), tests.id('sc'), tests.id('sc:' || whose))
    -> 'manager') = 'object', false);
exception when sqlstate '42501' then
  return false;
end;
$$;
select is(pg_temp.reads('zeynep', 'emre'), true, 'the admin reads Emre''s availability');
select is(pg_temp.reads('ayse', 'emre'), true, 'Ayşe reads Emre''s, who works at Kadıköy');
select is(pg_temp.reads('ayse', 'can'), true, 'Ayşe reads the availability of Can, a manager at Kadıköy');
-- The owner works at every location (BL-218), Kadıköy included.
select is(pg_temp.reads('ayse', 'owner'), true, 'Ayşe reads the owner, who works at Kadıköy');
select is(pg_temp.reads('ayse', 'zeynep'), true, 'Ayşe reads the availability of Zeynep, an admin at Kadıköy');
select is(pg_temp.reads('mehmet', 'emre'), false, 'Mehmet (Beşiktaş) does not read Emre (Kadıköy)');
select is(pg_temp.reads('emre', 'can'), false, 'Emre, an employee, does not read Can''s availability');
select is(pg_temp.reads_note('zeynep', 'emre'), true, 'Zeynep (admin) reads the Manager note about Emre');
select is(pg_temp.reads_note('ayse', 'emre'), true, 'Ayşe reads the Manager note about Emre');
select is(pg_temp.reads_note('zeynep', 'ayse'), false, 'Zeynep (admin) reads no Manager note about Ayşe, a manager');
select is(pg_temp.reads_note('ayse', 'can'), false, 'Ayşe reads Can''s availability but no Manager note: he is a manager');
select is(pg_temp.reads_note('ayse', 'ayse'), false, 'Ayşe has no Manager note to read about herself');
select is(public.weekly_preferences_read_service(tests.user('sc:ayse'), tests.id('sc'), tests.id('sc:can')) ? 'manager', false,
  'the read model says so by leaving the manager part out');

-- Saving a Manager note about somebody who is not an employee is refused.
create function pg_temp.save_note(person text, whose text) returns text
language plpgsql
as $$
begin
  perform public.weekly_preferences_save_service(tests.user('sc:' || person), tests.id('sc'), jsonb_build_object(
    'employee_id', tests.id('sc:' || whose), 'source', 'manager',
    'expected_revision', coalesce((select n.revision from public.manager_weekly_reminders n where n.employee_id = tests.id('sc:' || whose)), 0),
    'settings_revision', (select s.availability_preferences_revision from public.workspace_scheduling_settings s where s.workspace_id = tests.id('sc')),
    'preference', public.empty_weekly_preference(), 'enabled', true,
    'notes', jsonb_build_array('Call before Friday', '', '', '', '', '', '')), gen_random_uuid());
  return 'saved';
exception when others then
  return sqlstate;
end;
$$;
select is(pg_temp.save_note('zeynep', 'ayse'), '42501', 'Zeynep (admin) cannot save a Manager note about Ayşe, a manager');
select is(pg_temp.save_note('owner', 'owner'), '42501', 'the owner cannot save a Manager note about herself');

-- With no live location in the workspace, the owner reads an empty Shift Hub
-- manager view and team availability instead of a refusal.
-- ponytail: closed by hand; there is no delete-location entry point yet.
update public.locations set archived_at = now(), deleted_at = now() where workspace_id = tests.id('sn');
select is(pg_temp.said(format($$select public.shift_exchanges_read_service(%L, %L, true)$$, tests.user('sn:owner'), tests.id('sn'))),
  'allowed', 'the owner of a workspace with no live location reads an empty Shift Hub manager view');
select is(pg_temp.said(format($$select public.weekly_team_read_service(%L, %L)$$, tests.user('sn:owner'), tests.id('sn'))),
  'allowed', 'the owner of a workspace with no live location reads team availability');

-- 4. Scheduled exports and recent exports (Q-A, user decision 2026-09-25) ---------------
-- A manager sees a record only when every one of its locations is theirs; a
-- closed, unknown or foreign location, or none at all, leaves it to the owner
-- and admins.

-- ponytail: a third location closed by hand; there is no delete-location
-- entry point yet.
insert into public.locations (workspace_id, name, short_name, street_address, city, region, postal_code, timezone)
values (tests.id('sc'), 'Moda', 'MDA', '1 St', 'Istanbul', 'Istanbul', '34710', 'Europe/Istanbul');
select tests.remember('sc:M', (select l.id from public.locations l where l.workspace_id = tests.id('sc') and l.short_name = 'MDA'));

create temporary table export_case (name text primary key, location_ids uuid[]);
insert into export_case values
  ('k-only', array[tests.id('sc:K')]),
  ('k-and-b', array[tests.id('sc:K'), tests.id('sc:B')]),
  ('b-only', array[tests.id('sc:B')]),
  ('k-and-closed', array[tests.id('sc:K'), tests.id('sc:M')]),
  ('closed-only', array[tests.id('sc:M')]),
  ('unknown', array[gen_random_uuid()]),
  ('foreign', array[tests.id('sx:K')]);

select public.create_schedule_export_preset_service(tests.user('sc:owner'), tests.id('sc'), 'Weekly', '{}'::jsonb);
-- ponytail: stored as they are; the create entry point checks their locations
-- only from FB-6.1 .4 (Q3), and a closed location closes after the record.
insert into public.scheduled_schedule_exports
  (workspace_id, preset_id, name, recipients, location_ids, day_of_week, send_hour, created_by, updated_by)
select tests.id('sc'), (select p.id from public.schedule_export_presets p where p.workspace_id = tests.id('sc')),
  c.name, '["books@example.test"]'::jsonb, c.location_ids, 1, 9, tests.user('sc:owner'), tests.user('sc:owner')
from export_case c;
insert into public.schedule_export_events (workspace_id, actor_user_id, surface, format, params)
select tests.id('sc'), tests.user('sc:owner'), c.name, 'pdf', jsonb_build_object('location_ids', to_jsonb(c.location_ids))
from export_case c
union all select tests.id('sc'), tests.user('sc:owner'), 'empty', 'pdf', '{"location_ids": []}'
union all select tests.id('sc'), tests.user('sc:owner'), 'missing', 'pdf', '{}'
union all select tests.id('sc'), tests.user('sc:owner'), 'garbage', 'pdf', '{"location_ids": ["not-a-location"]}';
update public.locations set archived_at = now(), deleted_at = now() where id = tests.id('sc:M');

create function pg_temp.scheduled_exports(person text) returns text[]
language sql
as $$
  select array(select s ->> 'name' from jsonb_array_elements(
    public.list_schedule_export_schedules_service(tests.user('sc:' || person), tests.id('sc')) -> 'schedules') s order by 1)
$$;
create function pg_temp.recent_exports(person text) returns text[]
language sql
as $$
  select array(select e ->> 'surface' from jsonb_array_elements(
    public.list_schedule_export_events_service(tests.user('sc:' || person), tests.id('sc')) -> 'events') e order by 1)
$$;

-- BL-188 (Q-C): a deleted location counts nowhere; Kadıköy + the closed Moda is a Kadıköy record.
select is(pg_temp.scheduled_exports('ayse'), array['k-and-closed', 'k-only'], 'Ayşe (Kadıköy) sees the scheduled exports all at Kadıköy once the closed location is left out');
select is(pg_temp.scheduled_exports('can'), array['b-only', 'k-and-b', 'k-and-closed', 'k-only'],
  'a manager of both sees every scheduled export all at their locations, none only closed, unknown or foreign');
select is(pg_temp.scheduled_exports('owner'),
  array['b-only', 'closed-only', 'foreign', 'k-and-b', 'k-and-closed', 'k-only', 'unknown'],
  'the owner sees every scheduled export');
select is(pg_temp.scheduled_exports('zeynep'),
  array['b-only', 'closed-only', 'foreign', 'k-and-b', 'k-and-closed', 'k-only', 'unknown'],
  'an admin sees every scheduled export');
select is(pg_temp.said(format($$select public.list_schedule_export_schedules_service(%L, %L)$$, tests.user('sc:nur'), tests.id('sc'))),
  '42501 authz.out_of_scope schedule.export', 'a manager with no location is refused the scheduled exports');

select is(pg_temp.recent_exports('ayse'), array['k-and-closed', 'k-only'], 'Ayşe sees the recent exports all at Kadıköy once the closed location is left out');
select is(pg_temp.recent_exports('can'), array['b-only', 'k-and-b', 'k-and-closed', 'k-only'],
  'a manager of both sees no recent export only closed, or with an unknown, foreign, blank or malformed location');
select is(pg_temp.recent_exports('owner'),
  array['b-only', 'closed-only', 'empty', 'foreign', 'garbage', 'k-and-b', 'k-and-closed', 'k-only', 'missing', 'unknown'],
  'the owner sees the ten recent exports');
select is(pg_temp.said(format($$select public.list_schedule_export_events_service(%L, %L)$$, tests.user('sc:emre'), tests.id('sc'))),
  '42501 authz.missing_permission schedule.export', 'an employee is refused the recent exports');

-- 5. Drafts in the Schedule's draft list (B1) ---------------------------------------------
-- ponytail: drafts stored as they are; a draft is written by saving an edit,
-- which needs a whole week of shifts per location.
insert into public.schedule_drafts (workspace_id, week_start, name, created_by, updated_by, location_ids)
values
  (tests.id('sc'), tests.week(0), 'T', tests.user('sc:owner'), tests.user('sc:owner'), array[tests.id('sc:K'), tests.id('sc:B')]),
  (tests.id('sc'), tests.week(0), 'Kadikoy', tests.user('sc:owner'), tests.user('sc:owner'), array[tests.id('sc:K')]),
  (tests.id('sc'), tests.week(0), 'Besiktas', tests.user('sc:owner'), tests.user('sc:owner'), array[tests.id('sc:B')]),
  (tests.id('sc'), tests.week(0), 'Moda', tests.user('sc:owner'), tests.user('sc:owner'), array[tests.id('sc:M')]);

create function pg_temp.drafts(person text) returns text[]
language sql
as $$
  select array(select d ->> 'name' from jsonb_array_elements(
    public.list_schedule_drafts_service(tests.user('sc:' || person), tests.id('sc'), tests.week(0)) -> 'drafts') d order by 1)
$$;

select is(pg_temp.drafts('ayse'), array['Kadikoy', 'T'], 'Ayşe lists the drafts that include Kadıköy');
select is(pg_temp.drafts('mehmet'), array['Besiktas', 'T'], 'Mehmet lists the drafts that include Beşiktaş');
select is(pg_temp.drafts('owner'), array['Besiktas', 'Kadikoy', 'Moda', 'T'], 'the owner lists every draft, one at a closed location too');

-- 6. Scheduling settings (N3; the question comes first) -----------------------------------
create function pg_temp.settings_as(person text, settings jsonb) returns text
language sql
as $$
  select pg_temp.said(format($f$select public.update_scheduling_settings_service(%L, %L, %L::jsonb)$f$,
    tests.user(person), tests.id('sc'), settings))
$$;
create function pg_temp.conflict_rules() returns jsonb
language sql
as $$
  select jsonb_build_object('minimum_rest_minutes', s.minimum_rest_minutes, 'conflict_rules_revision', s.conflict_rules_revision)
  from public.workspace_scheduling_settings s where s.workspace_id = tests.id('sc')
$$;

select is(pg_temp.settings_as('sx:owner', '"not settings"'), '42501 authz.not_member settings.scheduling.write',
  'somebody from another workspace is refused before their settings are read');
select is(pg_temp.settings_as('sc:ayse', pg_temp.conflict_rules()), '42501 authz.missing_permission settings.conflict_rules.write',
  'a manager does not change conflict handling');
select is(pg_temp.settings_as('sc:rita', pg_temp.conflict_rules()), '42501 authz.out_of_scope settings.conflict_rules.write',
  'a manager-type role holding the conflict rules permission still does not write organization settings');
select is(pg_temp.settings_as('sc:owner', pg_temp.conflict_rules()), 'allowed', 'the owner changes conflict handling');
select is(pg_temp.settings_as('sc:owner', pg_temp.conflict_rules() || '{"week_start_day": "monday"}'), 'allowed',
  'the owner changes conflict handling and the other settings together');

-- 7. Moving a shift asks at both locations (N5) --------------------------------------------
-- Can opens next week at Kadıköy and Beşiktaş and adds Veli's Beşiktaş shift;
-- then Can stops working at Beşiktaş. Moving the shift to Kadıköy would take it
-- out of a location Can no longer reaches.
create temporary table moving (session uuid, shift uuid);
insert into moving (session)
select (public.acquire_schedule_edit_session_service(tests.user('sc:can'), tests.id('sc'), tests.week(1), 'blank', null) -> 'session' ->> 'id')::uuid;
update moving set shift = tests.add_shift(tests.user('sc:can'), 'sc', session, 1,
  '{"person": "veli", "loc": "B", "job": "server", "day": 2, "start": "09:00", "end": "15:00"}');
select tests.settle();
select tests.stops_working_at((
  select m.id from public.workspace_memberships m where m.workspace_id = tests.id('sc') and m.user_id = tests.user('sc:can')
), tests.id('sc:B'));

select is(
  pg_temp.said(format($$select public.add_schedule_pending_op_service(%L, %L, %L, 'update', %L, %L::jsonb)$$,
    tests.user('sc:can'), tests.id('sc'), (select session from moving), (select shift from moving),
    jsonb_build_object('location_id', tests.id('sc:K')))),
  '42501 authz.out_of_scope schedule.edit',
  'moving a shift is asked at the location it leaves too'
);

-- 8. A shift without a location is not everywhere (E2) -------------------------------------
select is(
  pg_temp.said(format($$select public.assess_weekly_schedule_assignment_service(%L, %L, '{}'::jsonb)$$,
    tests.user('sc:owner'), tests.id('sc'))),
  '42501 authz.out_of_scope schedule.edit',
  'checking a shift with no location is refused, the owner too'
);

-- A person who stops being an employee loses their Manager note for good (user
-- decision 2026-09-26, REUSE a9c7797): Emre is made a manager and back.
create function pg_temp.make(whose text, role_key text) returns void
language sql
as $$
  select pg_temp.change_role(tests.user('sc:owner'), tests.id('sc'), tests.id('sc:' || whose),
    (select r.id from public.workspace_roles r where r.workspace_id = tests.id('sc') and r.system_key::text = role_key));
$$;
create function pg_temp.notes_about(whose text) returns integer
language sql
as $$ select count(*)::integer from public.manager_weekly_reminders n where n.employee_id = tests.id('sc:' || whose) $$;
select is(pg_temp.save_note('ayse', 'emre'), 'saved', 'Ayşe saves a Manager note about Emre');
select is(pg_temp.notes_about('emre'), 1, 'Emre has a Manager note');
select pg_temp.make('emre', 'manager');
-- A promotion keeps the employee slot (design §4.8); Emre also gives it up, so he stops being an employee.
select tests.no_employee_slot('sc', 'emre');
select is(pg_temp.notes_about('emre'), 0, 'made a manager, Emre''s Manager note is deleted');
select pg_temp.make('emre', 'employee');
select is(public.weekly_preferences_read_service(tests.user('sc:zeynep'), tests.id('sc'), tests.id('sc:emre')) -> 'manager' ->> 'revision', '0',
  'an employee again, Emre starts with an empty Manager note');

select * from finish();
rollback;

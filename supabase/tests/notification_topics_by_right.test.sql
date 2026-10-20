begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

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

-- BILDIRIM-12 (KARARLAR S-123; settings variant A): a person's notification choices list only the topics
-- they could receive at least one type of, as the core says (scope_set over the actions a type is heard
-- by), never by a role's name. Each topic carries its level (important or optional) and a line that says
-- what is in it.
--   (a) an employee sees their own seven; a manager and an admin also approvals, needs attention, team;
--   (b) the five-cell probe: a manager made an employee, one moved to another location, one whose role
--       lacks the decisions, one missing a required document, one whose access was removed;
--   (c) a topic the owner turned every optional type of off is gone;
--   (d) level and description;
--   (e) every type a person may choose is heard by actions the core knows.

select tests.world('tb');
select tests.person('tb', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('tb', 'zeynep', 'admin', array['K'], array['server']);
select tests.person('tb', 'ali', 'employee', array['K'], array['cook']);
select tests.person('tb', 'dmo', 'manager', array['K'], array['cook']);
select tests.person('tb', 'mov', 'manager', array['K', 'B'], array['cook']);
-- A manager's role without the decisions, and without whatever needs them.
select tests.role('tb', 'no decisions', 'manager', array(
  with recursive gone(key) as (
    select unnest(array['schedule.time_off_requests.manage', 'schedule.shift_change_requests.manage',
      'employee_onboarding.review', 'employees.manage', 'employee_documents.review'])
    union select d.permission_key from app_private.role_permission_dependencies d join gone on gone.key = d.required_key
  )
  select rp.permission_key from public.workspace_role_permissions rp
  join public.workspace_roles r on r.id = rp.role_id
  where r.workspace_id = tests.id('tb') and r.system_key = 'manager' and rp.permission_key not in (select key from gone)));
select tests.person('tb', 'lim', 'no decisions', array['K'], array['cook']);
-- A manager's role that reads the team's availability but invites nobody (BILDIRIM-U7, KARARLAR S-133).
select tests.role('tb', 'reads availability', 'manager', array(
  with recursive gone(key) as (
    select 'employees.manage'::text
    union select d.permission_key from app_private.role_permission_dependencies d join gone on gone.key = d.required_key
  )
  select rp.permission_key from public.workspace_role_permissions rp
  join public.workspace_roles r on r.id = rp.role_id
  where r.workspace_id = tests.id('tb') and r.system_key = 'manager' and rp.permission_key not in (select key from gone)));
select tests.person('tb', 'rav', 'reads availability', array['K'], array['cook']);
select tests.person('tb', 'blk', 'manager', array['K'], array['cook']);
select tests.person('tb', 'gon', 'manager', array['K'], array['cook']);
-- Onur is still onboarding.
select tests.person('tb', 'onu', 'employee', array['K'], array['cook'], 'onboarding');

create function pg_temp.topics(person text) returns text[] language sql as $$
  select array(select t ->> 'key' from jsonb_array_elements(
    public.get_notification_preferences_service(tests.user('tb:' || person), tests.id('tb')) -> 'topics') t)
$$;
create function pg_temp.refusal(statement text) returns text language plpgsql as $$
declare state text; hint text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics state = returned_sqlstate, hint = pg_exception_hint;
  return state || ' ' || coalesce(hint, '');
end $$;

-- (a) ------------------------------------------------------------------------------------------------

select is(pg_temp.topics('ali'),
  array['my_schedule', 'open_shifts', 'shift_changes', 'time_off', 'profile', 'documents', 'announcements'],
  '(a) Ali, an employee, sees the seven that are about his own work');
select is(pg_temp.topics('ayse'),
  array['my_schedule', 'open_shifts', 'shift_changes', 'time_off', 'profile', 'documents', 'announcements',
        'approvals', 'needs_attention', 'team'],
  '(a) Ayse, a manager, also approvals, needs attention and team updates');
select is(pg_temp.topics('zeynep'), pg_temp.topics('ayse'), '(a) an admin the same');

-- (b) The five-cell probe ------------------------------------------------------------------------------

select pg_temp.change_role(tests.user('tb:owner'), tests.id('tb'), tests.id('tb:dmo'),
  (select r.id from public.workspace_roles r where r.workspace_id = tests.id('tb') and r.system_key = 'employee'));
select is(pg_temp.topics('dmo'), pg_temp.topics('ali'), '(b) a manager made an employee sees what an employee sees');

select tests.stops_working_at((select m.id from public.workspace_memberships m
  where m.workspace_id = tests.id('tb') and m.user_id = tests.user('tb:mov')), tests.id('tb:K'));
select is(pg_temp.topics('mov'), pg_temp.topics('ayse'),
  '(b) a manager moved to Besiktas still decides there: still the manager''s ten');

select ok(not ('approvals' = any (pg_temp.topics('lim'))), '(b) a role without the decisions: no approvals');

select ok(exists (select 1 from public.workspace_role_permissions rp join public.workspace_roles r on r.id = rp.role_id
  where r.id = tests.id('tb:role:reads availability') and rp.permission_key = 'availability.read')
  and not exists (select 1 from public.workspace_role_permissions rp join public.workspace_roles r on r.id = rp.role_id
  where r.id = tests.id('tb:role:reads availability') and rp.permission_key = 'employees.manage'),
  '(b) Rav''s role reads the team''s availability and does not invite');
select ok(not ('team' = any (pg_temp.topics('rav'))),
  '(b) reading the team''s availability brings no team updates: availability tells nobody, and the rest is for who invites');

create temp table required_document (id uuid, preview jsonb);
insert into required_document (id)
select public.save_document_type_lifecycle_service(tests.user('tb:owner'), tests.id('tb'), null, null, jsonb_build_object(
  'title', 'Food handler card', 'description', 'Card', 'requires_review', true, 'accepted_formats', array['pdf'],
  'tracks_expiry', false, 'expiry_warning_days', 30,
  'lifecycle_settings', jsonb_build_object('mode', 'conditional', 'assignment_scope', 'all_active',
    'target', jsonb_build_object('operator', 'and', 'location_ids', '[]'::jsonb, 'department_ids', '[]'::jsonb,
      'job_ids', '[]'::jsonb, 'employee_ids', '[]'::jsonb),
    'period_days', 7, 'suspend_on_overdue', true, 'extra_fields', '[]'::jsonb)));
update required_document set preview = public.preview_document_publication_service(tests.user('tb:owner'), tests.id('tb'), id);
select public.set_document_publication_service(tests.user('tb:owner'), tests.id('tb'), id,
  (preview ->> 'revision')::integer, (preview ->> 'publication_revision')::integer, preview ->> 'preview_token', 'Publish', 'published')
from required_document;
select tests.settle();
-- ponytail: Blk's deadline is moved into the past by hand; nothing in the product moves the clock.
update public.employee_onboarding_requirements set deadline_at = now() - interval '1 day'
where source_id = (select id from required_document) and lifecycle_user_id = tests.user('tb:blk');
select is((app_private.actor(tests.user('tb:blk'), tests.id('tb'))).document_blocked, true, '(b) Blk misses a required document');
select ok(not ('approvals' = any (pg_temp.topics('blk'))) and not ('needs_attention' = any (pg_temp.topics('blk'))),
  '(b) a manager missing a required document decides nothing now: no approvals, no needs attention');
select ok(array['my_schedule', 'shift_changes', 'time_off', 'profile', 'documents', 'announcements'] <@ pg_temp.topics('blk'),
  '(b) but still hears about their own shifts, requests, profile, documents and announcements, and may choose how');
select ok(array['my_schedule', 'shift_changes', 'time_off', 'profile', 'documents', 'announcements'] <@ pg_temp.topics('onu'),
  '(b) a person still onboarding the same');

select public.remove_employee_access_service(tests.user('tb:owner'), tests.id('tb'), tests.id('tb:gon'));
select matches(pg_temp.refusal($$select pg_temp.topics('gon')$$), '^42501 authz\.',
  '(b) a person whose access was removed reads no choices at all');

-- (c) ------------------------------------------------------------------------------------------------

insert into public.notification_workspace_muted_types (workspace_id, type_key, muted_by)
select tests.id('tb'), t.key, tests.user('tb:owner') from public.notification_types t where t.topic_key = 'team';
select ok(not ('team' = any (pg_temp.topics('ayse'))), '(c) every team update turned off by the owner: the topic is gone');

-- (d) ------------------------------------------------------------------------------------------------

select is(
  (select jsonb_object_agg(t ->> 'key', t ->> 'level') from jsonb_array_elements(
    public.get_notification_preferences_service(tests.user('tb:zeynep'), tests.id('tb')) -> 'topics') t),
  '{"my_schedule": "important", "open_shifts": "optional", "shift_changes": "important", "time_off": "important",
    "profile": "important", "documents": "important", "announcements": "important", "approvals": "important",
    "needs_attention": "important"}'::jsonb,
  '(d) each topic says its level: open shifts, all optional, is optional; the rest important');
select ok((select bool_and(char_length(t ->> 'description') between 10 and 160) from jsonb_array_elements(
    public.get_notification_preferences_service(tests.user('tb:ali'), tests.id('tb')) -> 'topics') t),
  '(d) and a line that says what is in it');

-- (e) ------------------------------------------------------------------------------------------------

select is((select count(*)::integer from public.notification_types t where t.level <> 'required' and cardinality(t.heard_by) = 0), 0,
  '(e) every type a person may choose names who hears it');
select is((select count(*)::integer from public.notification_types t, unnest(t.heard_by) a
           where a <> 'self' and not exists (select 1 from app_private.authz_actions x where x.key = a)), 0,
  '(e) and every action it names is the core''s, or self: a notice about the person themselves');

-- (f) No open location left: the owner still may choose about what still reaches them, a stopped email too.
update public.locations set archived_at = now() where workspace_id = tests.id('tb');
select ok(array['my_schedule', 'documents', 'announcements', 'needs_attention'] <@ pg_temp.topics('owner'),
  '(f) every location archived: the owner still has their own topics and needs attention');

select * from finish();
rollback;

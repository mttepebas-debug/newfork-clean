begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- BILDIRIM-U7 (KARARLAR S-123, S-126, S-127, "Müsaitlik güncelleme bildirimi" 2026-09-26, S-32;
-- docs/plan/research/BILDIRIM-URETICILER.md §2.4 #18): an employee's saved week writes its own notice into the
-- new core.
--   (a) everyone who may read the person's availability is told (availability.team_read; no rank rule): the
--       owner, the admins, the managers of their location; not the person, not another location's manager;
--   (b) once a day per person, by the day at their home location; a second change that day writes no row;
--   (c) a save that changes nothing tells nobody, except the very first one, which confirms the week;
--       a manager's own notes tell nobody;
--   (d) the save outlives its notice: with the core's write or its holder list down, the week is saved;
--   (e) the five-cell probe on who may read it: a manager made an employee, moved off the location, whose role
--       cannot read availability, missing a required document, whose access was removed: none of them is told;
--   (f) hours only (AVAIL-GUN): the entry mode is gone, and its "Check your availability" type with it; a
--       settings save tells nobody.

select tests.world('av');
select tests.world('ax');
select tests.person('av', 'zeynep', 'admin', array['K'], array['server']);
select tests.person('av', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('av', 'veli', 'manager', array['B'], array['cook']);
select tests.person('av', 'emre', 'employee', array['K'], array['cook']);
select tests.person('av', 'deniz', 'employee', array['B'], array['cook']);
select tests.person('av', 'kim', 'employee', array['K'], array['cook']);
-- The five who will lose the right to read Kadikoy's availability, in (e).
select tests.person('av', 'dmo', 'manager', array['K'], array['cook']);
select tests.person('av', 'mov', 'manager', array['K', 'B'], array['cook']);
select tests.person('av', 'lim', 'manager', array['K'], array['cook']);
select tests.person('av', 'blk', 'manager', array['K'], array['cook']);
select tests.person('av', 'gon', 'manager', array['K'], array['cook']);
-- Saves in (d), one per broken part of the core.
select tests.person('av', 'svr', 'employee', array['K'], array['cook']);
select tests.person('av', 'svh', 'employee', array['K'], array['cook']);
update public.workspace_scheduling_settings set availability_onboarding_required = false where workspace_id = tests.id('av');

create temp table who as select label, tests.user(label) uid
from unnest(array['av:owner', 'av:zeynep', 'av:ayse', 'av:veli', 'av:emre', 'av:deniz', 'av:kim', 'av:dmo', 'av:mov',
  'av:lim', 'av:blk', 'av:gon', 'av:svr', 'av:svh', 'ax:owner']) label;
create function pg_temp.u(person text) returns uuid language sql as $$
  select tests.user('av:' || person)
$$;
-- Who was told that this person's availability changed.
create function pg_temp.told(person text) returns text[] language sql stable as $$
  select coalesce(array_agg(w.label order by w.label collate "C"), '{}')
  from public.person_notifications n join who w on w.uid = n.user_id
  where n.type_key = 'availability.updated' and n.workspace_id = tests.id('av') and n.subject_id = tests.id('av:' || person)
$$;
create function pg_temp.rows(person text) returns integer language sql stable as $$
  select count(*)::integer from public.person_notifications n
  where n.type_key = 'availability.updated' and n.workspace_id = tests.id('av') and n.subject_id = tests.id('av:' || person)
$$;
-- The person saves a week, read back first so the save carries the revisions the screen would.
create function pg_temp.save(person text, week jsonb) returns jsonb language sql as $$
  select public.weekly_preferences_save_service(pg_temp.u(person), tests.id('av'), jsonb_build_object(
    'employee_id', tests.id('av:' || person), 'source', 'employee',
    'expected_revision', coalesce((m -> 'employee' ->> 'revision')::integer, 0),
    'settings_revision', (m -> 'settings' ->> 'revision')::integer, 'preference', week), gen_random_uuid())
  from (select public.weekly_preferences_read_service(pg_temp.u(person), tests.id('av')) m) x
$$;
create function pg_temp.week(day integer, starts text, ends text) returns jsonb language sql immutable as $$
  select jsonb_set(public.empty_weekly_preference(), array['days', day::text, 'ranges'],
    jsonb_build_array(jsonb_build_object('start', starts, 'end', ends)))
$$;
create function pg_temp.revision(person text) returns integer language sql stable as $$
  select p.revision from public.employee_weekly_preferences p where p.employee_id = tests.id('av:' || person)
$$;
select is(tests.unlisted_notices(tests.id('av')), '{}'::text[], 'the world''s notices are in their recipients'' choices');
create temp table checked as select n.id from public.person_notifications n where n.workspace_id = tests.id('av');

-- (a) Who may read it is told ------------------------------------------------------------------------------

select pg_temp.save('emre', pg_temp.week(1, '18:00', '22:00'));
select is(pg_temp.told('emre'),
  array['av:ayse', 'av:blk', 'av:dmo', 'av:gon', 'av:lim', 'av:mov', 'av:owner', 'av:zeynep'],
  '(a) Emre changes his week: the owner, the admin and Kadikoy''s managers are told; not Emre, not Besiktas''s Veli');
select is((select array_agg(distinct n.title) from public.person_notifications n
           where n.type_key = 'availability.updated' and n.subject_id = tests.id('av:emre')),
  array[app_private.people_name(tests.id('av:emre')) || ' changed their availability'], '(a) saying who');
select is((select array_agg(distinct n.url) from public.person_notifications n
           where n.type_key = 'availability.updated' and n.subject_id = tests.id('av:emre')),
  array['/app/employees?employeeId=' || tests.id('av:emre')::text || '&section=availability'],
  '(a) opening their availability in the Employees drawer');
select pg_temp.save('deniz', pg_temp.week(2, '09:00', '13:00'));
select is(pg_temp.told('deniz'), array['av:mov', 'av:owner', 'av:veli', 'av:zeynep'],
  '(a) Deniz, at Besiktas: Besiktas''s managers (Veli, Mov) and the owner and admin; not Kadikoy''s');

-- (b) Once a day ------------------------------------------------------------------------------------------

select pg_temp.save('emre', pg_temp.week(3, '18:00', '22:00'));
select is(pg_temp.rows('emre'), 8, '(b) a second change the same day writes no second row');
select is((select array_agg(distinct n.event_key) from public.person_notifications n
           where n.type_key = 'availability.updated' and n.subject_id = tests.id('av:emre')),
  array['availability:' || tests.id('av:emre')::text || ':'
        || (now() at time zone (select l.timezone from public.locations l where l.id = tests.id('av:K')))::date::text],
  '(b) the day is the one at his home location');

-- (c) Nothing changed -------------------------------------------------------------------------------------

delete from public.person_notifications where type_key = 'availability.updated' and subject_id = tests.id('av:deniz');
select pg_temp.save('deniz', pg_temp.week(2, '09:00', '13:00'));
select is(pg_temp.rows('deniz'), 0, '(c) Deniz saves the same week again: nobody is told');
select is(pg_temp.revision('deniz'), 2, '(c) the week is still saved');
select pg_temp.save('kim', public.empty_weekly_preference());
select is(pg_temp.told('kim'),
  array['av:ayse', 'av:blk', 'av:dmo', 'av:gon', 'av:lim', 'av:mov', 'av:owner', 'av:zeynep'],
  '(c) Kim''s first save, nothing marked: news all the same, the week is confirmed');
select is((select array_agg(distinct n.title) from public.person_notifications n
           where n.type_key = 'availability.updated' and n.subject_id = tests.id('av:kim')),
  array[app_private.people_name(tests.id('av:kim')) || ' confirmed their availability'], '(c) saying it is confirmed');
delete from public.person_notifications where type_key = 'availability.updated' and subject_id = tests.id('av:emre');
select public.weekly_preferences_save_service(pg_temp.u('ayse'), tests.id('av'), jsonb_build_object(
  'employee_id', tests.id('av:emre'), 'source', 'manager',
  'expected_revision', coalesce((m -> 'manager' ->> 'revision')::integer, 0),
  'settings_revision', (m -> 'settings' ->> 'revision')::integer,
  'preference', pg_temp.week(4, '10:00', '14:00'), 'enabled', true,
  'notes', jsonb_build_array('', '', '', '', 'Prefers mornings', '', '')), gen_random_uuid())
from (select public.weekly_preferences_read_service(pg_temp.u('ayse'), tests.id('av'), tests.id('av:emre')) m) x;
select is(pg_temp.rows('emre'), 0, '(c) Ayse''s own notes about Emre tell nobody');
select is(tests.unlisted_notices(tests.id('av'), array(select id from checked)), '{}'::text[],
  '(c) every notice so far is in its recipient''s choices (BILDIRIM-12)');
insert into checked select n.id from public.person_notifications n where n.workspace_id = tests.id('av') on conflict do nothing;

-- (d) The save outlives its notice ------------------------------------------------------------------------
-- With the core's write (notify_rows) or its holder list (notify_holders) broken in turn, the week is
-- saved. The failure is logged; the work stands.

create temp table core_saved as select p.proname, pg_get_functiondef(p.oid) def from pg_proc p
where p.pronamespace = 'app_private'::regnamespace and p.proname in ('notify_rows', 'notify_holders');
create function pg_temp.restore_core() returns void language plpgsql as $$
declare d text;
begin
  for d in select def from core_saved loop execute d; end loop;
end $$;
create temp table outlived (broken text, done text);
create function pg_temp.outlives(broken text, person text) returns void language plpgsql as $$
begin
  perform pg_temp.save(person, pg_temp.week(5, '12:00', '16:00'));
  insert into outlived values (broken, 'revision ' || pg_temp.revision(person));
exception when others then
  insert into outlived values (broken, 'died: ' || sqlerrm);
end $$;
create or replace function app_private.notify_rows(target_workspace uuid, target_actor uuid, target_rows jsonb)
returns integer language plpgsql set search_path = '' as $$ begin raise exception 'notices are down'; end $$;
select pg_temp.outlives('notify_rows', 'svr');
select pg_temp.restore_core();
create or replace function app_private.notify_holders(target_workspace uuid, target_action text, target_places uuid[] default null,
  target_person uuid default null)
returns uuid[] language plpgsql set search_path = '' as $$ begin raise exception 'holders are down'; end $$;
select pg_temp.outlives('notify_holders', 'svh');
select pg_temp.restore_core();
select is((select array_agg(broken || ': ' || done order by broken) from outlived),
  array['notify_holders: revision 1', 'notify_rows: revision 1'],
  '(d) with notices or holder lists down, the week is saved');
select is(pg_temp.rows('svr') + pg_temp.rows('svh'), 0, '(d) and nobody is told');

-- (e) Who may read it, five cells -------------------------------------------------------------------------
-- Dmo is made an employee, Mov leaves Kadikoy, Lim's role loses team availability, Blk misses a required
-- document, Gon's access is removed. Then Emre changes his week again.

select tests.role('av', 'no availability', 'manager', array(
  select rp.permission_key from public.workspace_role_permissions rp
  join public.workspace_roles r on r.id = rp.role_id
  where r.workspace_id = tests.id('av') and r.system_key = 'manager' and rp.permission_key not like 'availability.%'));
select public.update_employee_membership_role_service(pg_temp.u('zeynep'), tests.id('av'), tests.id('av:dmo'),
  (select r.id from public.workspace_roles r where r.workspace_id = tests.id('av') and r.system_key = 'employee'));
select tests.stops_working_at((select m.id from public.workspace_memberships m
  where m.workspace_id = tests.id('av') and m.user_id = pg_temp.u('mov')), tests.id('av:K'));
select public.update_employee_membership_role_service(pg_temp.u('zeynep'), tests.id('av'), tests.id('av:lim'),
  (select r.id from public.workspace_roles r where r.workspace_id = tests.id('av') and r.name = 'no availability'));
create temp table required_document (id uuid, preview jsonb);
insert into required_document (id)
select public.save_document_type_lifecycle_service(pg_temp.u('zeynep'), tests.id('av'), null, null, jsonb_build_object(
  'title', 'Food handler card', 'description', 'Card', 'requires_review', true, 'accepted_formats', array['pdf'],
  'tracks_expiry', false, 'expiry_warning_days', 30,
  'lifecycle_settings', jsonb_build_object('mode', 'conditional', 'assignment_scope', 'all_active',
    'target', jsonb_build_object('operator', 'and', 'location_ids', '[]'::jsonb, 'department_ids', '[]'::jsonb,
      'job_ids', '[]'::jsonb, 'employee_ids', '[]'::jsonb),
    'period_days', 7, 'suspend_on_overdue', true, 'extra_fields', '[]'::jsonb)));
update required_document set preview = public.preview_document_publication_service(pg_temp.u('zeynep'), tests.id('av'), id);
select public.set_document_publication_service(pg_temp.u('zeynep'), tests.id('av'), id,
  (preview ->> 'revision')::integer, (preview ->> 'publication_revision')::integer, preview ->> 'preview_token', 'Publish', 'published')
from required_document;
select tests.settle();
insert into checked select n.id from public.person_notifications n where n.workspace_id = tests.id('av') on conflict do nothing;
-- ponytail: Blk's deadline is moved into the past by hand; nothing in the product moves the clock.
update public.employee_onboarding_requirements set deadline_at = now() - interval '1 day'
where source_id = (select id from required_document) and lifecycle_user_id = pg_temp.u('blk');
select public.remove_employee_access_service(pg_temp.u('zeynep'), tests.id('av'), tests.id('av:gon'));
select is(
  (select array_agg(person || ' ' || coalesce(app_private.authz_reason(pg_temp.u(person), tests.id('av'), 'availability.team_read',
     target_person => tests.id('av:emre')), 'ok') order by person) from unnest(array['ayse', 'blk', 'dmo', 'gon', 'lim', 'mov']) person),
  array['ayse ok', 'blk document_blocked', 'dmo missing_permission', 'gon not_active', 'lim missing_permission', 'mov out_of_scope'],
  '(e) the core: Ayse may read Emre''s availability; the five may not');
delete from public.person_notifications where type_key = 'availability.updated' and subject_id = tests.id('av:emre');
select pg_temp.save('emre', pg_temp.week(6, '08:00', '12:00'));
select is(pg_temp.told('emre'), array['av:ayse', 'av:owner', 'av:zeynep'],
  '(e) Emre changes his week: Ayse, the owner and the admin are told; none of the five');

-- (f) Hours only: the mode notice is gone -----------------------------------------------------------------

select is((select count(*)::integer from public.notification_types where key = 'availability.mode_changed'), 0,
  '(f) "Check your availability" after a mode change is gone with the mode');
create temp table before_settings as select count(*)::integer n from public.person_notifications where workspace_id = tests.id('av');
select public.weekly_preference_settings_save_service(pg_temp.u('owner'), tests.id('av'), jsonb_build_object(
  'onboarding_required', true, 'expected_revision', (m -> 'settings' ->> 'revision')::integer), gen_random_uuid())
from (select public.weekly_preference_settings_read_service(pg_temp.u('owner'), tests.id('av')) m) x;
select is((select count(*)::integer from public.person_notifications where workspace_id = tests.id('av')),
  (select n from before_settings), '(f) the owner changes the availability settings: nobody is told');

select is((select count(*)::integer from public.person_notifications where workspace_id = tests.id('ax')), 0,
  'another workspace hears nothing of this one');
select is(tests.unlisted_notices(tests.id('av'), array(select id from checked)), '{}'::text[],
  'every notice written since is in its recipient''s choices (BILDIRIM-12)');

select * from finish();
rollback;

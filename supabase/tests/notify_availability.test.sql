begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- BILDIRIM-U7 (KARARLAR S-133; Mert, 2026-10-17): availability raises no notification at all.
--   (a) an employee saving their week, the first time or with a change, tells nobody; nor does a manager's
--       own note, nor the owner's availability settings;
--   (b) the catalog has no availability type left (availability.updated, availability.mode_changed), no
--       type can be filed under availability, and the Team updates topic no longer promises availability.

select tests.world('av');
select tests.person('av', 'zeynep', 'admin', array['K'], array['server']);
select tests.person('av', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('av', 'emre', 'employee', array['K'], array['cook']);
select tests.person('av', 'kim', 'employee', array['K'], array['cook']);
update public.workspace_scheduling_settings set availability_onboarding_required = false where workspace_id = tests.id('av');

create function pg_temp.u(person text) returns uuid language sql as $$
  select tests.user('av:' || person)
$$;
create function pg_temp.notices() returns integer language sql stable as $$
  select count(*)::integer from public.person_notifications n where n.workspace_id = tests.id('av')
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
create temp table before_saves as select pg_temp.notices() n;

-- (a) Saving tells nobody -----------------------------------------------------------------------------------

select pg_temp.save('emre', pg_temp.week(1, '18:00', '22:00'));
select pg_temp.save('emre', pg_temp.week(3, '18:00', '22:00'));
select pg_temp.save('kim', public.empty_weekly_preference());
select is((select p.revision from public.employee_weekly_preferences p where p.employee_id = tests.id('av:emre')), 2,
  '(a) Emre''s two saves are kept');
select public.weekly_preferences_save_service(pg_temp.u('ayse'), tests.id('av'), jsonb_build_object(
  'employee_id', tests.id('av:emre'), 'source', 'manager',
  'expected_revision', coalesce((m -> 'manager' ->> 'revision')::integer, 0),
  'settings_revision', (m -> 'settings' ->> 'revision')::integer,
  'preference', pg_temp.week(4, '10:00', '14:00'), 'enabled', true,
  'notes', jsonb_build_array('', '', '', '', 'Prefers mornings', '', '')), gen_random_uuid())
from (select public.weekly_preferences_read_service(pg_temp.u('ayse'), tests.id('av'), tests.id('av:emre')) m) x;
select public.weekly_preference_settings_save_service(pg_temp.u('owner'), tests.id('av'), jsonb_build_object(
  'onboarding_required', true, 'expected_revision', (m -> 'settings' ->> 'revision')::integer), gen_random_uuid())
from (select public.weekly_preference_settings_read_service(pg_temp.u('owner'), tests.id('av')) m) x;
select is(pg_temp.notices(), (select n from before_saves),
  '(a) Emre changes his week twice, Kim confirms hers, Ayse writes a note, the owner changes the settings: nobody is told');

-- (b) No availability type is left -------------------------------------------------------------------------

select is(array(select key from public.notification_types where key like 'availability.%' or area = 'availability'),
  '{}'::text[], '(b) the catalog has no availability type');
select ok(not exists (select 1 from pg_constraint c where c.conrelid = 'public.notification_types'::regclass
  and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%''availability''%'), '(b) and none can be filed under availability');
select ok((select p.description from public.notification_topics p where p.key = 'team') !~* 'availability',
  '(b) Team updates no longer promises availability changes');

select * from finish();
rollback;

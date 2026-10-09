begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- BL-188 (REUSE Q-C): a deleted location counts in no template or scheduled
-- export rule. "Standard week" has shifts at Kadikoy and Besiktas. While
-- Besiktas exists, Ayse (Kadikoy manager) does not see it; once Besiktas is
-- deleted she sees it, renames it, applies it and deletes it. Scheduled and
-- recent exports for Kadikoy + Besiktas follow the same rule.

select tests.world('dl');
select tests.person('dl', 'ayse', 'manager', array['K'], array['cook']);

-- ponytail: stored as they are; there is no builder helper for templates or
-- scheduled exports, and a template is saved from a whole edit.
insert into public.schedule_templates (workspace_id, name, created_by, updated_by)
values (tests.id('dl'), 'Standard week', tests.user('dl:owner'), tests.user('dl:owner'));
select tests.remember('dl:template', (select id from public.schedule_templates where workspace_id = tests.id('dl') and name = 'Standard week'));
insert into public.schedule_template_shifts (workspace_id, template_id, location_id, job_id, day_offset, start_time, end_time, time_basis, time_timezone, note)
select tests.id('dl'), tests.id('dl:template'), tests.id('dl:' || loc), tests.id('dl:job:cook'), 1, '09:00', '15:00', 'explicit', 'Europe/Istanbul',
  case loc when 'B' then 'Besiktas keys are in the safe' else '' end
from unnest(array['K', 'B']) loc;
-- An archived location counts nowhere too (G8a, KK-13): "Old kitchen"
-- has shifts at Kadikoy and the archived Moda.
insert into public.locations (workspace_id, name, short_name, street_address, city, region, postal_code, timezone)
values (tests.id('dl'), 'Moda', 'MDA', '1 St', 'Istanbul', 'Istanbul', '34710', 'Europe/Istanbul');
select tests.remember('dl:A', (select l.id from public.locations l where l.workspace_id = tests.id('dl') and l.short_name = 'MDA'));
insert into public.schedule_templates (workspace_id, name, created_by, updated_by)
values (tests.id('dl'), 'Old kitchen', tests.user('dl:owner'), tests.user('dl:owner'));
insert into public.schedule_template_shifts (workspace_id, template_id, location_id, job_id, day_offset, start_time, end_time, time_basis, time_timezone)
select tests.id('dl'), (select id from public.schedule_templates where workspace_id = tests.id('dl') and name = 'Old kitchen'),
  tests.id('dl:' || loc), tests.id('dl:job:cook'), 2, '09:00', '15:00', 'explicit', 'Europe/Istanbul'
from unnest(array['K', 'A']) loc;
update public.locations set archived_at = now() where id = tests.id('dl:A');
select public.create_schedule_export_preset_service(tests.user('dl:ayse'), tests.id('dl'), 'Weekly', '{}'::jsonb);
insert into public.scheduled_schedule_exports
  (workspace_id, preset_id, name, recipients, location_ids, day_of_week, send_hour, created_by, updated_by)
values (tests.id('dl'), (select p.id from public.schedule_export_presets p where p.workspace_id = tests.id('dl')),
  'Both kitchens', '["books@example.test"]'::jsonb, array[tests.id('dl:K'), tests.id('dl:B')], 1, 9,
  tests.user('dl:ayse'), tests.user('dl:ayse'));
select tests.remember('dl:export', (select id from public.scheduled_schedule_exports where workspace_id = tests.id('dl')));
insert into public.schedule_export_events (workspace_id, actor_user_id, surface, format, params)
values (tests.id('dl'), tests.user('dl:owner'), 'both kitchens', 'pdf',
  jsonb_build_object('location_ids', jsonb_build_array(tests.id('dl:K'), tests.id('dl:B'))));

create function pg_temp.templates() returns text[] language sql as $$
  select array(select t ->> 'name' from jsonb_array_elements(
    public.list_schedule_templates_service(tests.user('dl:ayse'), tests.id('dl')) -> 'templates') t order by 1)
$$;
create function pg_temp.scheduled_exports() returns text[] language sql as $$
  select array(select s ->> 'name' from jsonb_array_elements(
    public.list_schedule_export_schedules_service(tests.user('dl:ayse'), tests.id('dl')) -> 'schedules') s order by 1)
$$;
create function pg_temp.recent_exports() returns text[] language sql as $$
  select array(select e ->> 'surface' from jsonb_array_elements(
    public.list_schedule_export_events_service(tests.user('dl:ayse'), tests.id('dl')) -> 'events') e order by 1)
$$;
create function pg_temp.opened(person text) returns jsonb language sql as $$
  select public.get_schedule_template_service(tests.user('dl:' || person), tests.id('dl'), tests.id('dl:template'))
$$;
create function pg_temp.revision() returns integer language sql as $$
  select revision from public.schedule_templates where id = tests.id('dl:template')
$$;

-- 1. Besiktas exists: Ayse sees none of it (as today).
select is(pg_temp.templates(), array['Old kitchen'], 'while Besiktas exists Ayse does not see the Kadikoy + Besiktas template (only Old kitchen, whose Moda is archived)');
select throws_ok(format($$select public.get_schedule_template_service(%L, %L, %L)$$,
  tests.user('dl:ayse'), tests.id('dl'), tests.id('dl:template')), 'P0002', null, 'nor open it');
select throws_ok(format($$select public.rename_schedule_template_service(%L, %L, %L, 'Mine', %s)$$,
  tests.user('dl:ayse'), tests.id('dl'), tests.id('dl:template'), pg_temp.revision()), '42501', null, 'nor rename it');
select is(pg_temp.scheduled_exports(), '{}'::text[], 'nor see the Kadikoy + Besiktas scheduled export');
select is(pg_temp.recent_exports(), '{}'::text[], 'nor the recent export for both');

-- 2. Besiktas is deleted.
update public.locations set archived_at = now(), deleted_at = now() where id = tests.id('dl:B');

select is(pg_temp.templates(), array['Old kitchen', 'Standard week'], 'after Besiktas is deleted Ayse sees the template');
select is(public.get_schedule_template_service(tests.user('dl:ayse'), tests.id('dl'), tests.id('dl:template')) -> 'template' ->> 'name',
  'Standard week', 'and opens it');
select is((select jsonb_agg(s ->> 'location_id') from jsonb_array_elements(pg_temp.opened('ayse') -> 'shifts') s),
  jsonb_build_array(tests.id('dl:K')), 'with only the Kadikoy shift: nothing of the deleted Besiktas, its note included');
select is((select jsonb_agg(s ->> 'location_id') from jsonb_array_elements(pg_temp.opened('owner') -> 'shifts') s),
  jsonb_build_array(tests.id('dl:K')), 'the owner too opens it without the deleted Besiktas shift');
select ok('Old kitchen' = any (pg_temp.templates()), 'an archived Moda counts nowhere either (KK-13): Ayse sees Old kitchen');
select is(public.rename_schedule_template_service(tests.user('dl:ayse'), tests.id('dl'), tests.id('dl:template'), 'Kadikoy week', pg_temp.revision())
  -> 'template' ->> 'name', 'Kadikoy week', 'renaming it keeps the new name');
select is((select name from public.schedule_templates where id = tests.id('dl:template')), 'Kadikoy week', 'and it is saved');

select tests.remember('dl:session', (public.acquire_schedule_edit_session_service(
  tests.user('dl:ayse'), tests.id('dl'), tests.week(1), 'blank', null) -> 'session' ->> 'id')::uuid);
select is(
  (public.apply_schedule_template_service(tests.user('dl:ayse'), tests.id('dl'), tests.id('dl:session'),
    (select revision from public.schedule_edit_sessions where id = tests.id('dl:session')), tests.id('dl:template'), 'merge') ->> 'applied_shift_count')::integer,
  1, 'applying it writes the Kadikoy shift');
select is(
  array(select location_id from public.schedule_edit_session_shifts where session_id = tests.id('dl:session')),
  array[tests.id('dl:K')], 'and nothing for the deleted Besiktas');

select is(pg_temp.scheduled_exports(), array['Both kitchens'], 'Ayse sees the scheduled export once Besiktas is deleted');
select is(public.update_schedule_export_schedule_service(tests.user('dl:ayse'), tests.id('dl'), tests.id('dl:export'),
  '{"name": "Kadikoy only"}'::jsonb) ->> 'name', 'Kadikoy only', 'and can rename her own scheduled export');
select is(pg_temp.recent_exports(), array['both kitchens'], 'and sees the recent export');

select lives_ok(format($$select public.delete_schedule_template_service(%L, %L, %L, %s)$$,
  tests.user('dl:ayse'), tests.id('dl'), tests.id('dl:template'), pg_temp.revision()), 'Ayse deletes the template');
select is(pg_temp.templates(), array['Old kitchen'], 'and it is gone');

select * from finish();
rollback;

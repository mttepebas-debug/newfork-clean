begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- G4 (BL-101, BL-225, Q-C): the weekly export email for Kadikoy + Besiktas.
-- The cron is handed only live locations and the workspace's week start day;
-- whether the person who set it up may still export is the core's answer
-- inside the preview. Once Besiktas is deleted the email goes out for
-- Kadikoy alone; once both are deleted the export is still listed, empty, so
-- the cron can switch it off and say why instead of failing silently.

select tests.world('g4');
select tests.person('g4', 'ayse', 'manager', array['K'], array['cook']);

-- ponytail: stored as it is; there is no builder helper for scheduled exports.
select public.create_schedule_export_preset_service(tests.user('g4:owner'), tests.id('g4'), 'Weekly', '{}'::jsonb);
insert into public.scheduled_schedule_exports
  (workspace_id, preset_id, name, recipients, location_ids, day_of_week, send_hour, created_by, updated_by)
values (tests.id('g4'), (select p.id from public.schedule_export_presets p where p.workspace_id = tests.id('g4')),
  'Both kitchens', '["books@example.test"]'::jsonb, array[tests.id('g4:K'), tests.id('g4:B')], 1, 9,
  tests.user('g4:owner'), tests.user('g4:owner'));

create function pg_temp.candidate() returns jsonb language sql as $$
  select c from jsonb_array_elements(public.list_schedule_export_cron_candidates_service(now())->'schedules') c
  where c->>'workspace_id' = tests.id('g4')::text
$$;
create function pg_temp.locations() returns uuid[] language sql as $$
  select array(select jsonb_array_elements_text(pg_temp.candidate()->'location_ids')::uuid order by 1)
$$;

select is(pg_temp.locations(), (select array_agg(x order by x) from unnest(array[tests.id('g4:K'), tests.id('g4:B')]) x),
  'while both kitchens exist, the cron is handed both');
select is(pg_temp.candidate()->>'week_start_day', 'monday', 'and the workspace week start day with it');

update public.workspace_scheduling_settings set week_start_day = 'sunday' where workspace_id = tests.id('g4');
select is(pg_temp.candidate()->>'week_start_day', 'sunday', 'a workspace that starts its week on Sunday is handed Sunday');

-- Ayse manages Kadikoy only: the core refuses her an export that reaches Besiktas.
select throws_ok(
  format('select public.preview_schedule_export_service(%L, %L, %L, ''published'', null, %L)',
    tests.user('g4:ayse'), tests.id('g4'), tests.week(0), array[tests.id('g4:K'), tests.id('g4:B')]),
  '42501', null, 'the core refuses an export that reaches past its creator''s locations');

update public.locations set archived_at = now(), deleted_at = now() where id = tests.id('g4:B');
select is(pg_temp.locations(), array[tests.id('g4:K')], 'once Besiktas is deleted, the cron is handed Kadikoy alone');
select is(
  public.preview_schedule_export_service(tests.user('g4:owner'), tests.id('g4'), tests.week(0), 'published', null, pg_temp.locations())->>'status',
  'export_ready', 'and the owner''s export of what is left goes through the core');
select is(
  (select location_ids from public.scheduled_schedule_exports where workspace_id = tests.id('g4')),
  array[tests.id('g4:K'), tests.id('g4:B')], 'the saved export itself is not rewritten');

update public.locations set archived_at = now(), deleted_at = now() where id = tests.id('g4:K');
select is(pg_temp.locations(), '{}'::uuid[], 'with every location deleted it is still listed, empty, so the cron can say why');

select * from finish();
rollback;

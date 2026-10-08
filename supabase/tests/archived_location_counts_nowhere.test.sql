begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

-- G8a / BL-132 (KK-13). An archived location counts in the authorization core
-- as a deleted one does: nobody's scope holds it, no target on it is reached,
-- and it takes no part in whether a template is somebody's. Unlike a deleted
-- one it comes back: once the archive is undone, scope returns by itself.
-- Settings > Locations still shows it to whoever manages locations, so it can
-- be restored.
-- Example: Mert archives Besiktas. Ayse, who manages Besiktas, no longer reads
-- or edits its Schedule, nor Emre who works only there; Kaan, who manages
-- Kadikoy, now sees the Kadikoy + Besiktas template. Mert restores Besiktas and
-- everything is as before.

select tests.world('ar');
select tests.person('ar', 'kaan', 'manager', array['K'], array['cook']);
select tests.person('ar', 'ayse', 'manager', array['B'], array['cook']);
select tests.person('ar', 'emre', 'employee', array['B'], array['cook']);
select tests.person('ar', 'zeynep', 'admin', array['K'], array['server']);

-- ponytail: stored as it is; there is no builder helper for templates.
insert into public.schedule_templates (workspace_id, name, created_by, updated_by)
values (tests.id('ar'), 'Both kitchens', tests.user('ar:owner'), tests.user('ar:owner'));
select tests.remember('ar:template', (select id from public.schedule_templates where workspace_id = tests.id('ar') and name = 'Both kitchens'));
insert into public.schedule_template_shifts (workspace_id, template_id, location_id, job_id, day_offset, start_time, end_time, time_basis, time_timezone)
select tests.id('ar'), tests.id('ar:template'), tests.id('ar:' || loc), tests.id('ar:job:cook'), 1, '09:00', '15:00', 'explicit', 'Europe/Istanbul'
from unnest(array['K', 'B']) loc;

-- The SQLSTATE a statement is refused with, or 'allowed'.
create function pg_temp.refusal(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return 'allowed';
exception when others then
  return sqlstate;
end;
$$;
-- What the core answers somebody: 'allowed' or the reason it refuses.
create function pg_temp.at(person text, action text, loc text) returns text language sql as $$
  select coalesce(app_private.authz_reason(tests.user('ar:' || person), tests.id('ar'), action, array[tests.id('ar:' || loc)], null, null), 'allowed')
$$;
create function pg_temp.on_emre(person text) returns text language sql as $$
  select coalesce(app_private.authz_reason(tests.user('ar:' || person), tests.id('ar'), 'employee.save', null, tests.id('ar:emre'), null), 'allowed')
$$;
-- The locations somebody reads the Schedule of, by key.
create function pg_temp.scope(person text) returns text[] language sql as $$
  select coalesce(array_agg(l.short_name order by l.short_name), '{}')
  from unnest(app_private.scope_set(tests.user('ar:' || person), tests.id('ar'), 'schedule.read')) s(id)
  join public.locations l on l.id = s.id
$$;
create function pg_temp.templates(person text) returns text[] language sql as $$
  select array(select t ->> 'name' from jsonb_array_elements(
    public.list_schedule_templates_service(tests.user('ar:' || person), tests.id('ar')) -> 'templates') t order by 1)
$$;
-- Settings > Locations: a browser write or read of Besiktas, rows touched.
create function pg_temp.browser(person text, statement text) returns integer language sql as $$
  select tests.as_browser(tests.user('ar:' || person), format(statement, tests.id('ar:B')))
$$;

-- 1. Before: Ayse manages Besiktas --------------------------------------------------------

select is(pg_temp.at('ayse', 'schedule.read', 'B') || ' ' || pg_temp.on_emre('ayse'), 'allowed allowed',
  'Ayse reads the Besiktas Schedule and saves Emre, who works there');
select is(pg_temp.templates('kaan'), '{}'::text[], 'Kaan does not see the Kadikoy + Besiktas template');

-- 2. Besiktas is archived ------------------------------------------------------------------

select is(pg_temp.browser('owner', 'update public.locations set archived_at = now(), updated_at = now() where id = %L'), 1,
  'the owner archives Besiktas in Settings > Locations');

-- (a) the manager of an archived location no longer reaches it
select is(pg_temp.at('ayse', 'schedule.read', 'B'), 'out_of_scope', 'Ayse no longer reads the Besiktas Schedule');
select is(pg_temp.at('ayse', 'schedule.edit', 'B'), 'out_of_scope', 'nor edits it');
select is(pg_temp.at('ayse', 'schedule.publish', 'B'), 'out_of_scope', 'nor publishes it');
select is(pg_temp.on_emre('ayse'), 'out_of_scope', 'nor saves Emre, who works only at Besiktas');
select is(pg_temp.scope('ayse'), '{}'::text[], 'her Schedule scope is empty');
select is(
  (select c.location_ids from public.resolve_workspace_context_service(tests.user('ar:ayse'), tests.id('ar')) c),
  '{}'::uuid[],
  'and the locations the app gives her (workspace context) leave Besiktas out, as a deleted one');
select is(pg_temp.at('owner', 'schedule.read', 'B'), 'out_of_scope', 'the owner does not reach it either: it counts nowhere');
-- (d) owner and admin scope
select is(pg_temp.scope('owner'), array['KDK'], 'the owner''s scope holds Kadikoy only');
select is(pg_temp.scope('zeynep'), array['KDK'], 'and so does the admin''s');
-- (c) a template counts only its live locations
select is(pg_temp.templates('kaan'), array['Both kitchens'], 'Kaan now sees the Kadikoy + Besiktas template');
select is(pg_temp.refusal(format('select public.rename_schedule_template_service(%L, %L, %L, %L, %s)',
    tests.user('ar:kaan'), tests.id('ar'), tests.id('ar:template'), 'Kadikoy week',
    (select revision from public.schedule_templates where id = tests.id('ar:template')))),
  'allowed', 'and renames it');
select is((select name from public.schedule_templates where id = tests.id('ar:template')), 'Kadikoy week',
  'the new name is kept');
-- (e) the publish preview asks the core alone
select ok(
  (select p.prosrc not like '%schedule publication scope denied%'
   from pg_proc p where p.oid = 'public.preview_schedule_publication_service(uuid,uuid,uuid,uuid[],uuid[],boolean)'::regprocedure),
  'the publish preview keeps no archived-location check of its own');
-- (f) Settings > Locations still shows it to whoever manages locations
select is(pg_temp.browser('owner', 'select 1 from public.locations where id = %L'), 1,
  'the owner still sees the archived Besiktas in Settings > Locations');
select is(pg_temp.browser('zeynep', 'select 1 from public.locations where id = %L'), 1, 'so does the admin');
-- and through the app's own read of Settings > Locations (ultrareview finding 2)
create function pg_temp.settings_list(person text) returns text[] language sql as $$
  select array(select l ->> 'short_name' from jsonb_array_elements(
    public.list_settings_locations_service(tests.user('ar:' || person), tests.id('ar'))) l order by 1)
$$;
select is(pg_temp.settings_list('owner'), array['BJK', 'KDK'], 'Settings > Locations lists the archived Besiktas to the owner, to restore it');
select is(pg_temp.settings_list('zeynep'), array['BJK', 'KDK'], 'and to the admin');
select is(
  pg_temp.refusal(format('select public.list_settings_locations_service(%L, %L)', tests.user('ar:kaan'), tests.id('ar')))
    || ' ' || pg_temp.refusal(format('select public.list_settings_locations_service(%L, %L)', tests.user('ar:emre'), tests.id('ar'))),
  '42501 42501', 'a manager and an employee do not read Settings > Locations at all');
-- Another workspace's archived location is not listed.
select tests.world('ax');
update public.locations set archived_at = now() where id = tests.id('ax:B');
select is(
  (select count(*)::integer from jsonb_array_elements(
     public.list_settings_locations_service(tests.user('ar:owner'), tests.id('ar'))) l
   where (l ->> 'workspace_id')::uuid <> tests.id('ar')),
  0, 'another workspace''s archived location is not listed');
select is(pg_temp.browser('zeynep', 'update public.locations set archived_at = null, updated_at = now() where id = %L')
    || ' ' || pg_temp.browser('zeynep', 'update public.locations set archived_at = now(), updated_at = now() where id = %L'),
  '1 1', 'the admin can restore it too (and archive it again)');
-- A scheduled export takes no archived location it did not hold (ultrareview finding 1).
select public.create_schedule_export_preset_service(tests.user('ar:kaan'), tests.id('ar'), 'Weekly', '{}'::jsonb);
insert into public.scheduled_schedule_exports
  (workspace_id, preset_id, name, recipients, location_ids, day_of_week, send_hour, created_by, updated_by)
values (tests.id('ar'), (select p.id from public.schedule_export_presets p where p.workspace_id = tests.id('ar')),
  'Kadikoy', '["kaan@example.test"]'::jsonb, array[tests.id('ar:K')], 1, 9, tests.user('ar:kaan'), tests.user('ar:kaan'));
select is(pg_temp.refusal(format('select public.update_schedule_export_schedule_service(%L, %L, %L, %L::jsonb)',
    tests.user('ar:kaan'), tests.id('ar'),
    (select e.id from public.scheduled_schedule_exports e where e.workspace_id = tests.id('ar')),
    jsonb_build_object('location_ids', jsonb_build_array(tests.id('ar:K'), tests.id('ar:B'))))),
  '42501', 'Kaan cannot add the archived Besiktas, which he does not manage, to his scheduled export');
-- BL-494 (KARARLAR 2026-10-01): a rule whose every location is archived is
-- fixed or deleted only by the owner or an admin.
insert into public.scheduled_schedule_exports
  (workspace_id, preset_id, name, recipients, location_ids, day_of_week, send_hour, created_by, updated_by)
values (tests.id('ar'), (select p.id from public.schedule_export_presets p where p.workspace_id = tests.id('ar')),
  'Besiktas', '["ayse@example.test"]'::jsonb, array[tests.id('ar:B')], 1, 9, tests.user('ar:ayse'), tests.user('ar:ayse'));
select tests.remember('ar:export:B', (select e.id from public.scheduled_schedule_exports e
  where e.workspace_id = tests.id('ar') and e.name = 'Besiktas'));
select is(pg_temp.refusal(format('select public.update_schedule_export_schedule_service(%L, %L, %L, %L::jsonb)',
    tests.user('ar:ayse'), tests.id('ar'), tests.id('ar:export:B'), '{"send_hour": 10}')),
  '42501', 'Ayse, whose Besiktas is archived, cannot change her Besiktas rule');
-- Kaan still manages a live Kadikoy, so he gets past the first gate; the rule's
-- own check is the one that stops him (EKRAN-01 B14).
select is(pg_temp.refusal(format('select public.update_schedule_export_schedule_service(%L, %L, %L, %L::jsonb)',
    tests.user('ar:kaan'), tests.id('ar'), tests.id('ar:export:B'), '{"send_hour": 10}')),
  '42501', 'nor can Kaan, who manages only the live Kadikoy');
select is(pg_temp.refusal(format('select public.delete_schedule_export_schedule_service(%L, %L, %L)',
    tests.user('ar:kaan'), tests.id('ar'), tests.id('ar:export:B'))),
  '42501', 'nor delete it');
select is(pg_temp.refusal(format('select public.update_schedule_export_schedule_service(%L, %L, %L, %L::jsonb)',
    tests.user('ar:zeynep'), tests.id('ar'), tests.id('ar:export:B'), '{"send_hour": 10}')),
  'allowed', 'the admin can');
select is(pg_temp.refusal(format('select public.delete_schedule_export_schedule_service(%L, %L, %L)',
    tests.user('ar:owner'), tests.id('ar'), tests.id('ar:export:B'))),
  'allowed', 'and the owner deletes it');

-- 3. The owner restores Besiktas -----------------------------------------------------------

select is(pg_temp.browser('owner', 'update public.locations set archived_at = null, updated_at = now() where id = %L'), 1,
  'the owner restores Besiktas');
-- (b) scope returns by itself
select is(pg_temp.at('ayse', 'schedule.read', 'B') || ' ' || pg_temp.at('ayse', 'schedule.edit', 'B'), 'allowed allowed',
  'Ayse reads and edits the Besiktas Schedule again');
select is(pg_temp.on_emre('ayse'), 'allowed', 'and saves Emre again');
select is(pg_temp.scope('owner'), array['BJK', 'KDK'], 'Besiktas is back in the owner''s scope');
select is(pg_temp.templates('kaan'), '{}'::text[], 'and Kaan no longer sees the template that is not his');

-- 4. One rule, in one place ---------------------------------------------------------------

select is(
  array(select p.proname::text from pg_proc p
        where p.oid in ('app_private.scope_set(uuid,uuid,text)'::regprocedure,
                        'app_private.actor(uuid,uuid)'::regprocedure,
                        'app_private.authz_check(app_private.actor_state,app_private.authz_actions,uuid[],uuid,uuid)'::regprocedure,
                        'app_private.actor_actions(app_private.actor_state)'::regprocedure,
                        'public.live_location_ids(uuid,uuid[])'::regprocedure)
          and (p.prosrc not like '%app_private.location_is_live(%' or p.prosrc ~ 'location\.deleted_at is (not )?null')
        order by 1),
  '{}'::text[],
  'the core asks whether a location is live in one place, app_private.location_is_live');
select is(
  pg_temp.refusal(format('update public.locations set deleted_at = now() where id = %L', tests.id('ar:K'))),
  '23514',
  'a location is not deleted without being archived (guard_catalog_deletion_state): "live" is "not archived"');
select is(
  (select count(*)::integer from public.locations where deleted_at is not null and archived_at is null),
  0, 'no location is deleted without being archived');

-- 5. A record at an archived location still saves (nf-guvenlik Y1, E1) --------------------
-- The drawer's save leaves an assignment at an archived location as it is, sent
-- or not; it adds, keeps and takes away live locations only. Deniz works at
-- Kadikoy (primary) and Besiktas, Can at Besiktas (primary) and Kadikoy.

select tests.person('ar', 'deniz', 'employee', array['K', 'B'], array['cook']);
select tests.person('ar', 'can', 'employee', array['B', 'K'], array['cook']);
select pg_temp.browser('owner', 'update public.locations set archived_at = now(), updated_at = now() where id = %L');
-- Where somebody works now: location keys, * = primary.
create function pg_temp.works(person text) returns text language sql as $$
  select coalesce(string_agg(l.short_name || case when a.is_primary then '*' else '' end, ',' order by l.short_name), '-')
  from public.employee_location_assignments a join public.locations l on l.id = a.location_id
  where a.employee_id = tests.id('ar:' || person) and a.ended_at is null
$$;
-- A record saved from the drawer by somebody, with these locations and primary.
create function pg_temp.save(actor text, person text, locs text[], primary_loc text) returns text language sql as $$
  select pg_temp.refusal(format(
    'select public.save_employee_service(%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %s)',
    tests.user('ar:' || actor), tests.id('ar'), e.id, e.first_name, e.middle_name, e.last_name, e.preferred_name,
    e.invitation_email, e.start_date, e.internal_note,
    array(select tests.id('ar:' || l) from unnest(locs) l),
    case when primary_loc is null then null else tests.id('ar:' || primary_loc) end,
    array(select a.job_id from public.employee_job_assignments a where a.employee_id = e.id and a.ended_at is null),
    (select a.job_id from public.employee_job_assignments a where a.employee_id = e.id and a.ended_at is null and a.is_primary),
    e.is_remote, e.is_excluded_from_schedule, e.revision))
  from public.employee_profiles e where e.id = tests.id('ar:' || person)
$$;

select is(pg_temp.save('owner', 'deniz', array['K'], 'K') || ' ' || pg_temp.works('deniz'), 'allowed BJK,KDK*',
  'A: the owner saves Deniz without Besiktas; the Besiktas assignment stays as it is');
select is(pg_temp.save('owner', 'deniz', array['K', 'B'], 'K') || ' ' || pg_temp.works('deniz'), 'allowed BJK,KDK*',
  'B: saved as read, with Besiktas');
select is(pg_temp.save('owner', 'owner', array['K'], null), 'allowed',
  'D: the owner saves their own record without Besiktas');
select is(pg_temp.save('owner', 'owner', array['K', 'B'], null) || ' ' || pg_temp.works('owner'), 'allowed BJK,KDK',
  'E: and as read, with Besiktas, which they still hold (E1)');
select is(pg_temp.save('kaan', 'deniz', array['K'], 'K') || ' ' || pg_temp.works('deniz'), 'allowed BJK,KDK*',
  'F: Kaan, who manages Kadikoy, saves Deniz without Besiktas; it stays');
select is(pg_temp.save('kaan', 'deniz', array['K', 'B'], 'K'), 'allowed', 'G: and as read');
select is(pg_temp.save('owner', 'can', array['B', 'K'], 'B') || ' ' || pg_temp.works('can'), 'allowed BJK*,KDK',
  'Can is saved as read; Besiktas stays his primary location');
select is(pg_temp.save('owner', 'kaan', array['K', 'B'], 'K'), '42501',
  'Besiktas is not given to somebody new while archived');
select is(pg_temp.refusal(format('select public.remove_employee_from_location_service(%L, %L, %L, %L)',
    tests.user('ar:owner'), tests.id('ar'), tests.id('ar:deniz'), tests.id('ar:B'))), '42501',
  'C: "Remove from Besiktas" is refused while it is archived, as on a deleted location');
select pg_temp.browser('owner', 'update public.locations set archived_at = null, updated_at = now() where id = %L');
select is(pg_temp.works('deniz') || ' ' || pg_temp.works('can'), 'BJK,KDK* BJK*,KDK',
  'once Besiktas is restored Deniz and Can work there again, their primary locations as before');

select * from finish();
rollback;

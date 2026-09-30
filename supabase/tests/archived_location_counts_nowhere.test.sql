begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

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

select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- The edges of announcements (EKRAN-08: one record; an important date is a post
-- on Important Dates): an author who has left, the minute's release, a
-- scheduled post losing its time, archived locations, two people editing at
-- once, the Schedule's closed days read by the API, publishing again, a post
-- whose audience narrows (BL-534), Unpublish keeping the days already gone,
-- and the yearly repeat. Rules: KARARLAR "Duyurular ve önemli tarihler" K2
-- addendum, K4, K24, K25, K27; KK-86, KK-92; S-15.

-- 1. The world ------------------------------------------------------------------------
-- Kadikoy (K), Besiktas (B) and Moda (M, archived later). Olcay is the owner.

select tests.world('r');
select tests.person('r', 'zeynep', 'admin', array['K'], array['server']);
select tests.person('r', 'hande', 'admin', array['K'], array['server']);
select tests.person('r', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('r', 'mina', 'manager', array['K'], array['cook']);
select tests.person('r', 'selin', 'manager', array['K'], array['cook']);
select tests.person('r', 'veli', 'manager', array['B'], array['cook']);
select tests.person('r', 'emre', 'employee', array['K'], array['cook']);
select tests.person('r', 'ali', 'employee', array['K', 'B'], array['server']);
select tests.person('r', 'deniz', 'employee', array['B'], array['server']);
select tests.as_browser(tests.user('r:owner'), format(
  $sql$insert into public.locations (id, workspace_id, name, short_name, street_address, city, region, postal_code, timezone)
       values (%L, %L, 'Moda', 'MDA', '3 Moda Cd', 'Istanbul', 'Istanbul', '34710', 'Europe/Istanbul')$sql$,
  tests.remember('r:M', gen_random_uuid()), tests.id('r')));

-- 2. Helpers --------------------------------------------------------------------------

-- 'ok', or the refusal's code and hint: '42501 authz.rank'.
create function pg_temp.try(statement text) returns text language plpgsql as $$
declare state text; hint text;
begin
  execute statement;
  return 'ok';
exception when others then
  get stacked diagnostics state = returned_sqlstate, hint = pg_exception_hint;
  return state || ' ' || coalesce(hint, '');
end;
$$;

create function pg_temp.u(person text) returns uuid language sql as $$
  select tests.user('r:' || person)
$$;

create function pg_temp.rev(id uuid) returns integer language sql as $$
  select revision from public.announcements where announcements.id = rev.id
$$;

create function pg_temp.status(id uuid) returns text language sql as $$
  select status::text from public.announcements where announcements.id = status.id
$$;

-- A post at these locations (each Open), a month ahead; extra adds or overrides fields.
create function pg_temp.payload(keys text[], title text, extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('title', title, 'body', 'Body of ' || title, 'starts_on', current_date + 30,
    'locations', coalesce((select jsonb_agg(jsonb_build_object('location_id', tests.id('r:' || k), 'day', 'open')) from unnest(keys) k),
      '[]'::jsonb)) || extra
$$;

create function pg_temp.save(person text, id uuid, p jsonb, intent text) returns jsonb language sql as $$
  select public.save_announcement_service(pg_temp.u(person), tests.id('r'), id, pg_temp.rev(id), p, intent)
$$;

create function pg_temp.draft(person text, keys text[], title text, extra jsonb default '{}') returns uuid language sql as $$
  select (pg_temp.save(person, null, pg_temp.payload(keys, title, extra), 'draft') ->> 'announcement_id')::uuid
$$;

create function pg_temp.publish(person text, keys text[], title text, extra jsonb default '{}') returns uuid
language plpgsql as $$
declare made uuid := pg_temp.draft(person, keys, title, extra);
begin
  perform pg_temp.save(person, made, pg_temp.payload(keys, title, extra), 'publish');
  return made;
end;
$$;

create function pg_temp.set_state(person text, id uuid, action text) returns jsonb language sql as $$
  select public.set_announcement_state_service(pg_temp.u(person), tests.id('r'), id, pg_temp.rev(id), action)
$$;

create function pg_temp.sees(person text, id uuid) returns jsonb language sql as $$
  select a from jsonb_array_elements(public.get_announcements_service(pg_temp.u(person), tests.id('r')) -> 'announcements') a
  where (a ->> 'id')::uuid = id
$$;

-- Who a post reaches (announcements.delivered_to), by name.
create function pg_temp.reached(subject uuid) returns text[] language sql as $$
  select coalesce(array_agg(distinct p.label order by p.label), '{}')
  from public.announcements a
  cross join lateral unnest(a.delivered_to) r(user_id)
  join (select i.label, i.id from tests.ids i where i.label ~ '^r:[a-z]+:user$') u on u.id = r.user_id
  cross join lateral (select split_part(u.label, ':', 2) label) p
  where a.id = subject
$$;

-- 3. The API reads the Schedule's closed days (BL-530) ---------------------------------

select tests.remember('r:ann:closed', tests.closed_day(tests.id('r'), array[tests.id('r:K')], current_date + 60, current_date + 60,
  pg_temp.u('owner'), title => 'Inventory closed'));
set local role service_role;
select lives_ok($$select count(*) from public.schedule_closures$$,
  'BL-530: the API, as service_role, reads the Schedule''s closed days');
reset role;
select is((select count(*)::integer from public.schedule_closures c
           where c.workspace_id = tests.id('r') and c.location_id = tests.id('r:K') and c.closed_date = current_date + 60),
  1, 'BL-530: the Kadikoy closed day is one closure');

-- 4. An author who has left: admin and owner only (K2 addendum) ---------------------------

select tests.remember('r:ann:hande', pg_temp.publish('hande', array['K'], 'Hande at K', '{"on_important_dates": true}'));
select public.remove_employee_access_service(pg_temp.u('owner'), tests.id('r'), tests.id('r:hande'));
select is(pg_temp.try(format($$select pg_temp.save('ayse', %L, pg_temp.payload(array['K'], 'Changed by Ayse', '{"on_important_dates": true}'), 'save')$$,
  tests.id('r:ann:hande'))), '42501 authz.rank', 'K2: admin Hande has left; the Kadikoy manager cannot change her post');
select is(pg_temp.try(format($$select pg_temp.save('owner', %L, pg_temp.payload(array['K'], 'Changed by the owner', '{"on_important_dates": true}'), 'save')$$,
  tests.id('r:ann:hande'))), 'ok', 'K2: the owner changes it');
select is(pg_temp.try(format($$select pg_temp.save('zeynep', %L, pg_temp.payload(array['K'], 'Changed by Zeynep', '{"on_important_dates": true}'), 'save')$$,
  tests.id('r:ann:hande'))), 'ok', 'K2: so does an admin');

-- Selin, a Kadikoy manager, has left: her rank is the last role she had, so
-- her posts stay a manager's (Mert, 2026-10-02: "En nihayetinde o da
-- müdürdü."). Kadikoy's other managers act on them (K3); Besiktas's do not.
select tests.remember('r:ann:selin', pg_temp.publish('selin', array['K'], 'Selin at K', '{"on_important_dates": true}'));
select public.remove_employee_access_service(pg_temp.u('owner'), tests.id('r'), tests.id('r:selin'));
select is(pg_temp.try(format($$select pg_temp.save('ayse', %L, pg_temp.payload(array['K'], 'Selin at K, by Ayse', '{"on_important_dates": true}'), 'save')$$,
  tests.id('r:ann:selin'))), 'ok', 'K2: manager Selin has left; Ayse, Kadikoy''s manager too, still changes her post');
select is(pg_temp.try(format($$select pg_temp.set_state('ayse', %L, 'unpublish')$$, tests.id('r:ann:selin'))), 'ok',
  'K2: and unpublishes it');
select is(pg_temp.try(format($$select pg_temp.set_state('ayse', %L, 'archive')$$, tests.id('r:ann:selin'))), 'ok',
  'K2: and archives it');
select tests.remember('r:ann:selin2', pg_temp.draft('owner', array['K'], 'Selin''s other'));
update public.announcements set created_by = pg_temp.u('selin'), status = 'unpublished' where id = tests.id('r:ann:selin2');
select is(pg_temp.try(format($$select pg_temp.set_state('veli', %L, 'archive')$$, tests.id('r:ann:selin2'))),
  '42501 authz.out_of_scope', 'K3: Veli, Besiktas''s manager only, does not');

-- An author who was never a member here: missing author information never lets
-- a manager in (CLAUDE.md §9, fail closed).
select tests.world('n');
select tests.remember('r:ann:mina', pg_temp.publish('mina', array['K'], 'Mina''s post'));
select is(pg_temp.try(format($$select pg_temp.save('ayse', %L, pg_temp.payload(array['K'], 'Peer change'), 'save')$$,
  tests.id('r:ann:mina'))), 'ok', 'K3: while Mina is here, Ayse changes her peer''s post');
-- ponytail: the author is set by hand to someone with no membership here; the rule under test is the post's.
update public.announcements set created_by = tests.user('n:owner') where id = tests.id('r:ann:mina');
select is(pg_temp.try(format($$select pg_temp.save('ayse', %L, pg_temp.payload(array['K'], 'Peer change again'), 'save')$$,
  tests.id('r:ann:mina'))), '42501 authz.rank', 'K2: a post whose author has no role here is not a manager''s to change');
select is(pg_temp.try(format($$select pg_temp.save('zeynep', %L, pg_temp.payload(array['K'], 'Admin change'), 'save')$$,
  tests.id('r:ann:mina'))), 'ok', 'K2: an admin changes it');

-- 5. The minute's release: one broken row holds up nobody (O2) ------------------------------

create function pg_temp.schedule_in(w text, person uuid, title text) returns uuid language plpgsql as $$
declare
  p jsonb := jsonb_build_object('title', title, 'body', 'Body', 'publish_at', now() + interval '1 hour',
    'locations', jsonb_build_array(jsonb_build_object('location_id', tests.id(w || ':K'), 'day', 'open')));
  made uuid := (public.save_announcement_service(person, tests.id(w), null, null, p, 'draft') ->> 'announcement_id')::uuid;
begin
  perform public.save_announcement_service(person, tests.id(w), made, 1, p, 'schedule');
  return made;
end;
$$;
-- Bug 2: a post reaches people, so n's Kadikoy has someone besides its owner.
select tests.person('n', 'nur', 'employee', array['K'], array['server']);
select tests.remember('n:ann', pg_temp.schedule_in('n', tests.user('n:owner'), 'Broken'));
select tests.remember('r:ann:due', pg_temp.schedule_in('r', pg_temp.u('owner'), 'Due'));
-- ponytail: time passes by moving their hour back.
update public.announcements set publish_at = now() - interval '1 minute' where id in (tests.id('n:ann'), tests.id('r:ann:due'));
create function pg_temp.break_release() returns trigger language plpgsql as $$
begin
  if new.id = tests.id('n:ann') and new.status = 'published' then
    raise exception 'this row cannot be published';
  end if;
  return new;
end;
$$;
create trigger edge_cases_break_release before update on public.announcements
  for each row execute function pg_temp.break_release();
select is(pg_temp.try('select app_private.announcement_release()'), 'ok',
  'O2: one row that cannot be published does not stop the minute''s release');
select is(pg_temp.status(tests.id('r:ann:due')), 'published', 'O2: another workspace''s post goes out');
select ok((select a.release_error is not null and a.release_failed_at is null and a.status = 'scheduled'
           from public.announcements a where a.id = tests.id('n:ann')),
  'O2: the broken one keeps its error and waits for the next minute');
select is(pg_temp.try(format('select public.get_announcements_service(%L, %L)', tests.user('n:owner'), tests.id('n'))), 'ok',
  'O2: and its workspace''s announcements still open');
drop trigger edge_cases_break_release on public.announcements;

-- Somebody who is not a member is reached by nothing: a plain no, never an
-- unknown that a caller might read either way (fail closed).
select is((select app_private.announcement_reaches(a, tests.user('n:owner')) from public.announcements a where a.id = tests.id('r:ann:due')),
  false, 'an outsider is not reached by a post: false, not null');

-- 6. A scheduled post without its time is a draft (K25, KK-92 a) ----------------------------

select tests.remember('r:ann:untimed', pg_temp.schedule_in('r', pg_temp.u('owner'), 'Untimed'));
select is(pg_temp.status(tests.id('r:ann:untimed')), 'scheduled', 'a post for later is scheduled');
select is(pg_temp.try(format($$select pg_temp.save('owner', %L, pg_temp.payload(array['K'], 'Untimed'), 'schedule')$$,
  tests.id('r:ann:untimed'))), '22023 announcement.publish_time_required', 'K25: it cannot stay scheduled without its time');
select pg_temp.set_state('owner', tests.id('r:ann:untimed'), 'unschedule');
select is(pg_temp.status(tests.id('r:ann:untimed')), 'draft', 'K25: unscheduled, it waits as a draft');
select is(pg_temp.reached(tests.id('r:ann:untimed')), '{}'::text[], 'K25: and it reaches nobody');
select ok(pg_temp.sees('zeynep', tests.id('r:ann:untimed')) is null, 'K19: back to a draft, it is the owner''s own again');

-- 7. Archived locations (KK-86) ----------------------------------------------------------

select tests.remember('r:ann:km', pg_temp.publish('owner', array['K', 'M'], 'Kadikoy and Moda'));
select tests.remember('r:ann:m', pg_temp.draft('owner', array['M'], 'Moda only'));
update public.locations set archived_at = now() where id = tests.id('r:M');
select is((select jsonb_agg(jsonb_build_object('name', l ->> 'name', 'archived', l -> 'archived') order by l ->> 'name')
           from jsonb_array_elements(pg_temp.sees('owner', tests.id('r:ann:km')) -> 'locations') l),
  '[{"name": "Kadikoy", "archived": false}, {"name": "Moda", "archived": true}]'::jsonb,
  'KK-86: the post still lists archived Moda, marked, so an edit keeps it');
select pg_temp.save('owner', tests.id('r:ann:km'), pg_temp.payload(array['K'], 'Kadikoy and Moda, new text'), 'save');
select ok('emre' = any (pg_temp.reached(tests.id('r:ann:km'))), 'KK-86: a change reaches Kadikoy''s people');
select is((select count(*)::integer from public.announcement_locations t where t.announcement_id = tests.id('r:ann:km')), 2,
  'KK-86: and Moda''s row stays as it was');
select is(pg_temp.try(format($$select pg_temp.save('owner', %L, pg_temp.payload('{}', 'Moda only'), 'draft')$$, tests.id('r:ann:m'))), 'ok',
  'KK-86: a draft only at archived Moda can still be changed');
select is(pg_temp.try(format($$select pg_temp.save('owner', %L, pg_temp.payload('{}', 'Moda only'), 'publish')$$, tests.id('r:ann:m'))),
  '22023 announcement.nobody', 'KK-86: but it reaches nobody, so it does not go out');

-- 7b. Nobody but its author (bugs 2 and 35) ------------------------------------------------------
-- A new location, Sile (S), reaches the owner alone (locations_reach_the_owner);
-- then employee Sena joins. A post reaches people, not a checked location: its
-- author never counts, on the location row either.

select tests.as_browser(tests.user('r:owner'), format(
  $sql$insert into public.locations (id, workspace_id, name, short_name, street_address, city, region, postal_code, timezone)
       values (%L, %L, 'Sile', 'SLE', '1 Sile Cd', 'Istanbul', 'Istanbul', '34980', 'Europe/Istanbul')$sql$,
  tests.remember('r:S', gen_random_uuid()), tests.id('r')));
create function pg_temp.people_at(person text, key text) returns integer language sql as $$
  select (l ->> 'people_count')::integer
  from jsonb_array_elements(public.get_announcements_service(pg_temp.u(person), tests.id('r')) -> 'locations') l
  where (l ->> 'id')::uuid = tests.id('r:' || key)
$$;
select is(pg_temp.people_at('owner', 'S'), 0, 'bug 35: Sile''s row does not count the owner, who is writing');
select tests.remember('r:ann:alone', pg_temp.draft('owner', array['S'], 'Only the owner at Sile'));
select is(pg_temp.try(format($$select pg_temp.save('owner', %L, pg_temp.payload(array['S'], 'Only the owner at Sile'), 'publish')$$,
  tests.id('r:ann:alone'))), '22023 announcement.nobody', 'bug 2: a location with only its author reaches nobody, so it does not go out');
select is(pg_temp.try(format($$select pg_temp.save('owner', %L, pg_temp.payload('{}', 'Only the owner at Sile', jsonb_build_object('people', jsonb_build_array(%L))), 'publish')$$,
  tests.id('r:ann:alone'), pg_temp.u('owner'))), '22023 announcement.nobody', 'bug 2: nor does a list naming only its author');

select tests.person('r', 'sena', 'employee', array['S'], array['server']);
select is(pg_temp.people_at('owner', 'S'), 1, 'bug 35: with Sena there, the owner''s row says 1');
select is(pg_temp.people_at('zeynep', 'S'), 2, 'bug 35: and admin Zeynep, who is not at Sile, reads 2');
select is(pg_temp.try(format($$select pg_temp.save('owner', %L, pg_temp.payload(array['S'], 'Only the owner at Sile'), 'publish')$$,
  tests.id('r:ann:alone'))), 'ok', 'bug 2: once Sena is there it goes out');

-- Scheduled while Sena was there; she leaves Sile before it is due.
select tests.remember('r:ann:later', pg_temp.draft('owner', array['S'], 'Later at Sile'));
select pg_temp.save('owner', tests.id('r:ann:later'),
  pg_temp.payload(array['S'], 'Later at Sile', jsonb_build_object('publish_at', now() + interval '1 hour')), 'schedule');
update public.employee_location_assignments set ended_at = now()
where employee_id = tests.id('r:sena') and location_id = tests.id('r:S');
-- ponytail: time passes by moving its hour back.
update public.announcements set publish_at = now() - interval '1 minute' where id = tests.id('r:ann:later');
select app_private.announcement_release(tests.id('r'));
select is(pg_temp.sees('owner', tests.id('r:ann:later')) ->> 'display_status', 'publish_failed',
  'bug 2: due with nobody left to reach, it does not go out');
select is(pg_temp.sees('owner', tests.id('r:ann:later')) ->> 'publish_error_code', 'nobody', 'bug 2: and says nobody would get it');

-- Mert, 2026-10-20: a published post whose people all left can still be put
-- right (whoever joins later reads the right one); and a post that sets a
-- day's hours does its work with nobody to tell.
select is(pg_temp.try(format($$select pg_temp.save('owner', %L, pg_temp.payload(array['S'], 'Only the owner at Sile, fixed'), 'save')$$,
  tests.id('r:ann:alone'))), 'ok', 'bug 2: a published post nobody is left at can still be corrected');
create function pg_temp.closed_at(key text, title text, extra jsonb default '{}') returns jsonb language sql as $$
  select pg_temp.payload('{}', title, jsonb_build_object('starts_on', current_date + 40,
    'locations', jsonb_build_array(jsonb_build_object('location_id', tests.id('r:' || key), 'day', 'closed'))) || extra)
$$;
select tests.remember('r:ann:closed', pg_temp.draft('owner', '{}', 'Sile closed'));
select is(pg_temp.try(format($$select pg_temp.save('owner', %L, pg_temp.closed_at('S', 'Sile closed'), 'publish')$$,
  tests.id('r:ann:closed'))), 'ok', 'bug 2: a closed day at a location with only its author still goes out');
select tests.remember('r:ann:closed2', pg_temp.draft('owner', '{}', 'Sile closed later'));
select pg_temp.save('owner', tests.id('r:ann:closed2'), pg_temp.closed_at('S', 'Sile closed later',
  jsonb_build_object('starts_on', current_date + 41, 'publish_at', now() + interval '1 hour')), 'schedule');
-- ponytail: time passes by moving its hour back.
update public.announcements set publish_at = now() - interval '1 minute' where id = tests.id('r:ann:closed2');
select app_private.announcement_release(tests.id('r'));
select is(pg_temp.status(tests.id('r:ann:closed2')), 'published', 'bug 2: and so does one scheduled, when it comes due');

-- 8. Two people editing at once: the later save is refused (KK-92 c) ----------------------------

select tests.remember('r:ann:rev', pg_temp.draft('owner', array['K'], 'Revisioned'));
select is(pg_temp.try(format($$select public.save_announcement_service(%L, %L, %L, null, %L::jsonb, 'draft')$$,
    pg_temp.u('owner'), tests.id('r'), tests.id('r:ann:rev'), pg_temp.payload(array['K'], 'Changed'))),
  'PT409 announcement.changed', 'KK-92 c: a change that names no revision is refused');
select is(pg_temp.try(format($$select public.save_announcement_service(%L, %L, %L, %s, %L::jsonb, 'draft')$$,
    pg_temp.u('owner'), tests.id('r'), tests.id('r:ann:rev'), pg_temp.rev(tests.id('r:ann:rev')) - 1, pg_temp.payload(array['K'], 'Changed'))),
  'PT409 announcement.changed', 'KK-92 c: so is one made on an old revision');
select is(pg_temp.try(format($$select public.set_announcement_state_service(%L, %L, %L, %s, 'archive')$$,
    pg_temp.u('owner'), tests.id('r'), tests.id('r:ann:rev'), pg_temp.rev(tests.id('r:ann:rev')) - 1)),
  'PT409 announcement.changed', 'KK-92 c: archiving on an old revision is refused too');

-- BL-958: no lasting conflict is refused with 40001. PostgREST takes 40001 for
-- a passing conflict and runs the same request again, forever, holding one of
-- its connections; ten such saves stop the API for every workspace. A lasting
-- conflict answers PT409, keeping its hint. The list is every function moved
-- off 40001 (ACIL-40001) and the announcement's writers: a later migration that
-- brings 40001 back to one of them turns this red. Schedule's editing services
-- are EKRAN-01's.
select is(array(
  select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname, p.proname) in (
      ('app_private', 'apply_owner_onboarding_update'), ('app_private', 'announcement_apply'),
      ('app_private', 'announcement_bring_back'), ('app_private', 'announcement_release'),
      ('app_private', 'time_off_finalize'), ('app_private', 'time_off_release_shifts'),
      ('public', 'create_employee_command_service'), ('public', 'decide_time_off_service'),
      ('public', 'employee_request_action_service'), ('public', 'leave_employee_onboarding_service'),
      ('public', 'request_time_off_cancellation_service'),
      ('public', 'review_employee_onboarding_before_availability_service'), ('public', 'revoke_time_off_service'),
      ('public', 'save_announcement_service'), ('public', 'save_employee_onboarding_profile_service'),
      ('public', 'save_employee_service'),
      ('public', 'save_notification_policy_service'), ('public', 'save_notification_user_preferences_service'),
      ('public', 'set_announcement_state_service'),
      ('public', 'shorten_time_off_service'), ('public', 'submit_employee_onboarding_service'),
      ('public', 'submit_time_off_service'), ('public', 'weekly_preference_settings_save_service'))
    -- Every way to raise 40001: PL/pgSQL keywords are case-insensitive, options take = or :=.
    and p.prosrc ~* $re$(errcode\s*:?=\s*'(40001|serialization_failure)'|raise\s+(exception\s+)?sqlstate\s+'40001'|raise\s+serialization_failure)$re$
  order by 1), '{}'::text[], 'BL-958: no lasting conflict in these 23 functions is refused with 40001');

-- 9. Publishing again (K27) ---------------------------------------------------------------

select tests.remember('r:ann:open', pg_temp.publish('owner', array['K'], 'Menu day', '{"on_important_dates": true}'));
select pg_temp.set_state('owner', tests.id('r:ann:open'), 'unpublish');
select pg_temp.save('owner', tests.id('r:ann:open'), pg_temp.payload(array['K'], 'Menu day', '{"on_important_dates": true}'), 'publish');
select ok('emre' = any (pg_temp.reached(tests.id('r:ann:open'))) and 'ali' = any (pg_temp.reached(tests.id('r:ann:open'))),
  'K27: a post that asks no acknowledgement, published again, reaches everybody again, Emre too');

-- 10. A narrower audience no longer reaches those it left (BL-534) ------------------------------------

select tests.remember('r:ann:narrow', pg_temp.publish('owner', array['K', 'B'], 'Both places'));
select ok(array['deniz', 'emre'] <@ pg_temp.reached(tests.id('r:ann:narrow')),
  'BL-534: a Kadikoy and Besiktas post reaches Deniz and Emre');
select pg_temp.save('owner', tests.id('r:ann:narrow'), pg_temp.payload(array['K'], 'Both places'), 'save');
select ok(not 'deniz' = any (pg_temp.reached(tests.id('r:ann:narrow'))),
  'BL-534: Besiktas taken off, it no longer reaches Deniz (Besiktas only)');
select ok(array['ali', 'emre'] <@ pg_temp.reached(tests.id('r:ann:narrow')),
  'BL-534: it still reaches Emre and Ali (Kadikoy too)');
select pg_temp.save('owner', tests.id('r:ann:narrow'), pg_temp.payload(array['K', 'B'], 'Both places'), 'save');
select ok(array['deniz', 'veli'] <@ pg_temp.reached(tests.id('r:ann:narrow')), 'BL-534: Besiktas back, it reaches its people again');

-- Narrowed right after it went out: it no longer reaches Deniz.
select tests.remember('r:ann:narrow2', pg_temp.publish('owner', array['K', 'B'], 'Both places date', '{"on_important_dates": true}'));
select pg_temp.save('owner', tests.id('r:ann:narrow2'), pg_temp.payload(array['K'], 'Both places date', '{"on_important_dates": true}'), 'save');
select ok(not 'deniz' = any (pg_temp.reached(tests.id('r:ann:narrow2'))), 'BL-534: a post narrowed at once does not reach Deniz');
select ok('emre' = any (pg_temp.reached(tests.id('r:ann:narrow2'))), 'BL-534: it reaches Emre');

-- 11. Unpublish keeps the days already gone on the Schedule (K11) ------------------------------

-- Days count from Moda's own today (Istanbul), not the database's: from 21:00 UTC they differ.
select tests.remember('r:ann:running', tests.closed_day(tests.id('r'), array[tests.id('r:K')],
  (now() at time zone 'Europe/Istanbul')::date - 1, (now() at time zone 'Europe/Istanbul')::date + 2,
  pg_temp.u('owner'), title => 'Water cut'));
select pg_temp.set_state('owner', tests.id('r:ann:running'), 'unpublish');
select is((select array_agg(c.closed_date - (now() at time zone 'Europe/Istanbul')::date order by c.closed_date) from public.schedule_closures c
           where c.announcement_id = tests.id('r:ann:running')), array[-1],
  'K11: unpublished while it runs, yesterday stays closed on the Schedule; the days ahead open');
select is(pg_temp.try($$select pg_temp.publish('owner', array['K'], 'Last Tuesday closed', jsonb_build_object('starts_on', current_date - 6,
  'locations', jsonb_build_array(jsonb_build_object('location_id', tests.id('r:K'), 'day', 'closed'))))$$),
  '22023 announcement.start_past', 'a closed day cannot be put on a day already gone');

-- 12. The yearly repeat (S-15) ----------------------------------------------------------------------

select is(app_private.announcement_next_year(date '2028-02-29', 'date'), date '2029-02-28',
  'S-15: Feb 29 comes back on Feb 28 in a year without one');
select is(app_private.announcement_next_year(date '2026-11-10', 'nth'), date '2027-11-09',
  'S-15: the second Tuesday of November comes back on next year''s second Tuesday');
select is(app_private.announcement_next_year(date '2026-05-29', 'nth'), date '2027-05-28',
  'S-15: a fifth Friday, in a month with four, comes back on the last one');
select is(app_private.announcement_next_year(date '2026-05-25', 'last'), date '2027-05-31',
  'S-15: the last Monday of May comes back on next year''s last Monday');
select is(app_private.announcement_next_year(date '2026-05-25', 'none'), null, 'a post that does not repeat has no next year');

select * from finish();
rollback;

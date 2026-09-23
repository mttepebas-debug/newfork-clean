begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- A schedule edit locks one location and week (FOUNDATION-B stage 3).
-- Ayse manages Kadikoy, Mehmet Besiktas, Can both; Zeynep is an admin. Ali
-- works at both locations.

select tests.world('lk');
select tests.person('lk', 'zeynep', 'admin', array['K'], array['server']);
select tests.person('lk', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('lk', 'mehmet', 'manager', array['B'], array['cook']);
select tests.person('lk', 'can', 'manager', array['K', 'B'], array['cook']);
select tests.person('lk', 'ali', 'employee', array['K', 'B'], array['cook', 'server']);
select tests.person('lk', 'emre', 'employee', array['K'], array['cook']);
select tests.person('lk', 'veli', 'employee', array['B'], array['server']);

create temporary table lk (key text primary key, value jsonb);
create function pg_temp.open(person text, locs text[], source text default 'blank', draft uuid default null, n integer default 1)
returns jsonb language sql as $$
  select public.acquire_schedule_edit_session_service(
    tests.user('lk:' || person), tests.id('lk'), tests.week(n), source::public.schedule_edit_source, draft,
    case when locs is null then null else array(select tests.id('lk:' || l) from unnest(locs) l) end)
$$;
create function pg_temp.session(result jsonb) returns uuid language sql as $$ select (result -> 'session' ->> 'id')::uuid $$;
create function pg_temp.save(person text, session uuid, name text, draft uuid default null)
returns uuid language sql as $$
  select (public.save_schedule_edit_session_service(
    tests.user('lk:' || person), tests.id('lk'), session,
    (select s.revision from public.schedule_edit_sessions s where s.id = session), name, draft,
    (select d.revision from public.schedule_drafts d where d.id = draft)) ->> 'id')::uuid
$$;
create function pg_temp.draft_locations(draft uuid) returns text[] language sql as $$
  select array(select l.short_name from public.schedule_draft_shifts s join public.locations l on l.id = s.location_id
               where s.draft_id = draft order by l.short_name)
$$;

-- Two managers, two locations, one week, at the same time.
insert into lk values ('ayse', pg_temp.open('ayse', null));
insert into lk values ('mehmet', pg_temp.open('mehmet', null));
select is((select value ->> 'status' from lk where key = 'ayse'), 'acquired', 'Ayse opens Kadikoy');
select is((select value ->> 'status' from lk where key = 'mehmet'), 'acquired', 'Mehmet opens Besiktas the same week');
select is(
  (select value -> 'session' -> 'location_ids' from lk where key = 'mehmet'),
  jsonb_build_array(tests.id('lk:B')),
  'an edit with no locations named takes the ones the person may edit'
);

-- The admin wants the whole week: told who holds what, given nothing.
insert into lk values ('zeynep', pg_temp.open('zeynep', null));
select is((select value ->> 'status' from lk where key = 'zeynep'), 'conflict', 'the admin is told both locations are taken');
select is(
  (select array(select item ->> 'holder_name' from jsonb_array_elements(value -> 'locks') item order by item ->> 'location_name') from lk where key = 'zeynep'),
  array['Mehmet Person', 'Ayse Person'],
  'the answer names the holder of each location'
);
select is((select value -> 'free_location_ids' from lk where key = 'zeynep'), '[]'::jsonb, 'and that no location is free');
select ok(
  not exists (select 1 from public.schedule_edit_sessions s where s.holder_user_id = tests.user('lk:zeynep') and s.status = 'active'),
  'a refused edit takes nothing'
);

-- A session's shifts stay inside its locations.
select throws_ok(
  format($$select tests.add_shift(tests.user('lk:can'), 'lk', %L, 1, '{"person": "veli", "loc": "B", "job": "server", "day": 1, "start": "09:00", "end": "15:00"}')$$,
    pg_temp.session((select value from lk where key = 'ayse'))),
  '42501', null,
  'a shift at another location cannot enter a Kadikoy edit'
);

-- Each saves their own location.
select tests.add_shift(tests.user('lk:ayse'), 'lk', pg_temp.session(value), 1,
  '{"person": "emre", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}') from lk where key = 'ayse';
select tests.add_shift(tests.user('lk:mehmet'), 'lk', pg_temp.session(value), 1,
  '{"person": "veli", "loc": "B", "job": "server", "day": 1, "start": "09:00", "end": "15:00"}') from lk where key = 'mehmet';
insert into lk values ('draft_k', to_jsonb(pg_temp.save('ayse', pg_temp.session((select value from lk where key = 'ayse')), 'Kadikoy week')));
insert into lk values ('draft_b', to_jsonb(pg_temp.save('mehmet', pg_temp.session((select value from lk where key = 'mehmet')), 'Besiktas week')));
select is(
  (select location_ids from public.schedule_drafts where id = (select (value #>> '{}')::uuid from lk where key = 'draft_k')),
  array[tests.id('lk:K')],
  'a draft remembers the location it covers'
);
select ok(
  not exists (select 1 from public.schedule_edit_locks where week_start = tests.week(1) and workspace_id = tests.id('lk')),
  'saving lets the locations go'
);

-- One draft for both locations, then Ayse edits its Kadikoy part.
insert into lk values ('owner', pg_temp.open('owner', null));
select tests.add_shift(tests.user('lk:owner'), 'lk', pg_temp.session(value), 1,
  '{"person": "ali", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"}') from lk where key = 'owner';
select tests.add_shift(tests.user('lk:owner'), 'lk', pg_temp.session(value), 1,
  '{"person": "ali", "loc": "B", "job": "server", "day": 4, "start": "09:00", "end": "15:00"}') from lk where key = 'owner';
insert into lk values ('draft_kb', to_jsonb(pg_temp.save('owner', pg_temp.session((select value from lk where key = 'owner')), 'Both locations')));
insert into lk values ('ayse2', pg_temp.open('ayse', array['K'], 'draft', (select (value #>> '{}')::uuid from lk where key = 'draft_kb')));
select is(
  (select jsonb_array_length(value -> 'session' -> 'shifts') from lk where key = 'ayse2'),
  1,
  'an edit of Kadikoy loads only the Kadikoy part of the draft'
);

-- Mehmet may not take over a Kadikoy edit; the admin may, and saving it keeps Besiktas.
select throws_ok(
  format($$select public.takeover_schedule_edit_session_service(tests.user('lk:mehmet'), tests.id('lk'), %L)$$,
    pg_temp.session((select value from lk where key = 'ayse2'))),
  '42501', null,
  'somebody who cannot edit Kadikoy cannot take over its edit'
);
select lives_ok(
  format($$select public.takeover_schedule_edit_session_service(tests.user('lk:zeynep'), tests.id('lk'), %L)$$,
    pg_temp.session((select value from lk where key = 'ayse2'))),
  'the admin takes over the Kadikoy edit'
);
select pg_temp.save('zeynep', pg_temp.session((select value from lk where key = 'ayse2')), 'Both locations',
  (select (value #>> '{}')::uuid from lk where key = 'draft_kb'));
select is(
  pg_temp.draft_locations((select (value #>> '{}')::uuid from lk where key = 'draft_kb')),
  array['BJK', 'KDK'],
  'BL-097: saving a taken-over Kadikoy edit keeps the draft''s Besiktas shifts'
);

-- A Kadikoy-only draft cannot be published for Besiktas.
select throws_ok(
  format($$select public.preview_schedule_publication_service(tests.user('lk:owner'), tests.id('lk'), %L, array[tests.id('lk:K'), tests.id('lk:B')], null, true)$$,
    (select value #>> '{}' from lk where key = 'draft_k')),
  '22023', null,
  'publishing a location the draft does not cover is refused'
);
select lives_ok(
  format($$select public.preview_schedule_publication_service(tests.user('lk:owner'), tests.id('lk'), %L, array[tests.id('lk:K')], null, true)$$,
    (select value #>> '{}' from lk where key = 'draft_k')),
  'the location it covers can be previewed'
);

-- An abandoned edit is recovered for its own location only.
insert into lk values ('ayse3', pg_temp.open('ayse', null, 'blank', null, 2));
insert into lk values ('mehmet3', pg_temp.open('mehmet', null, 'blank', null, 2));
select tests.add_shift(tests.user('lk:ayse'), 'lk', pg_temp.session(value), 2,
  '{"person": "emre", "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "15:00"}') from lk where key = 'ayse3';
update public.schedule_edit_sessions set dirty = true, expires_at = now() - interval '1 minute'
where id = pg_temp.session((select value from lk where key = 'ayse3'));
insert into lk values ('can3', pg_temp.open('can', array['K'], 'blank', null, 2));
select is((select value ->> 'status' from lk where key = 'can3'), 'acquired_after_recovery', 'Can takes Kadikoy from an expired edit');
select is(
  (select location_ids from public.schedule_drafts where id = (select (value ->> 'recovered_draft_id')::uuid from lk where key = 'can3')),
  array[tests.id('lk:K')],
  'the unsaved Kadikoy work becomes a Kadikoy draft'
);
select is(
  (select status::text from public.schedule_edit_sessions where id = pg_temp.session((select value from lk where key = 'mehmet3'))),
  'active',
  'Mehmet''s Besiktas edit is untouched'
);

-- Editing Kadikoy still sees Ali's published Besiktas shift.
select tests.publish_week('lk', 3, '[{"label": "ali-b", "person": "ali", "loc": "B", "job": "server", "day": 1, "start": "09:00", "end": "15:00"}]');
insert into lk values ('ayse4', pg_temp.open('ayse', array['K'], 'blank', null, 3));
select ok(
  exists (
    select 1 from jsonb_array_elements(public.assess_schedule_shift_service(
      tests.user('lk:ayse'), tests.id('lk'),
      jsonb_build_object('location_id', tests.id('lk:K'), 'employee_id', tests.id('lk:ali'), 'job_id', tests.id('lk:job:cook'),
        'scheduled_date', tests.week(3) + 1, 'time_basis', 'explicit', 'start_time', '10:00', 'end_time', '14:00',
        'time_timezone', 'Europe/Istanbul', 'note', ''),
      null, pg_temp.session((select value from lk where key = 'ayse4'))) -> 'reasons') reason
    where reason ->> 'code' = 'time_overlap'
  ),
  'a Kadikoy edit sees that Ali already works in Besiktas at that time'
);

select * from finish();
rollback;

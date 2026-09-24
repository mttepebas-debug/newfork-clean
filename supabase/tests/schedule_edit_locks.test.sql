begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- A schedule edit locks its draft, not its locations (FOUNDATION-B 3b, user
-- decision 2026-09-24, option A); publishing says when a location was
-- published or unpublished after the draft's work there started.
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
create function pg_temp.got(key text) returns jsonb language sql as $$ select value from lk where lk.key = got.key $$;
create function pg_temp.draft(key text) returns uuid language sql as $$ select (value #>> '{}')::uuid from lk where lk.key = draft.key $$;
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
create function pg_temp.preview(person text, draft uuid, locs text[]) returns jsonb language sql as $$
  select public.preview_schedule_publication_service(tests.user('lk:' || person), tests.id('lk'), draft,
    array(select tests.id('lk:' || l) from unnest(locs) l), null, true)
$$;
-- What the preview says changed at one location since the draft's work there started.
create function pg_temp.changed(person text, draft uuid, loc text) returns jsonb language sql as $$
  select item -> 'changed_since_start'
  from jsonb_array_elements(pg_temp.preview(person, draft, array[loc]) -> 'locations') item
  where item ->> 'location_id' = tests.id('lk:' || loc)::text
$$;
create function pg_temp.publish(person text, draft uuid, locs text[]) returns jsonb language sql as $$
  select public.publish_schedule_draft_service(tests.user('lk:' || person), tests.id('lk'), draft,
    array(select tests.id('lk:' || l) from unnest(locs) l), null, true,
    (select d.revision from public.schedule_drafts d where d.id = draft),
    pg_temp.preview(person, draft, locs) ->> 'fingerprint', '[]'::jsonb)
$$;

-- Two managers, two locations, one week, at the same time; the admin too.
insert into lk values ('ayse', pg_temp.open('ayse', null));
insert into lk values ('mehmet', pg_temp.open('mehmet', null));
insert into lk values ('zeynep', pg_temp.open('zeynep', null));
select is(pg_temp.got('ayse') ->> 'status', 'acquired', 'Ayse opens Kadikoy');
select is(pg_temp.got('mehmet') ->> 'status', 'acquired', 'Mehmet opens Besiktas the same week');
select is(
  pg_temp.got('mehmet') -> 'session' -> 'location_ids',
  jsonb_build_array(tests.id('lk:B')),
  'an edit with no locations named takes the ones the person may edit'
);
select is(pg_temp.got('zeynep') ->> 'status', 'acquired', 'the admin opens the whole week while both edit: new work locks nothing');
select is(jsonb_array_length(pg_temp.got('zeynep') -> 'session' -> 'location_ids'), 2, 'and her edit covers both locations');
select public.discard_schedule_edit_session_service(tests.user('lk:zeynep'), tests.id('lk'), pg_temp.session(pg_temp.got('zeynep')));

-- A session's shifts stay inside its locations.
select throws_ok(
  format($$select tests.add_shift(tests.user('lk:can'), 'lk', %L, 1, '{"person": "veli", "loc": "B", "job": "server", "day": 1, "start": "09:00", "end": "15:00"}')$$,
    pg_temp.session(pg_temp.got('ayse'))),
  '42501', null,
  'a shift at another location cannot enter a Kadikoy edit'
);

-- Each saves their own location.
select tests.add_shift(tests.user('lk:ayse'), 'lk', pg_temp.session(pg_temp.got('ayse')), 1,
  '{"person": "emre", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}');
select tests.add_shift(tests.user('lk:mehmet'), 'lk', pg_temp.session(pg_temp.got('mehmet')), 1,
  '{"person": "veli", "loc": "B", "job": "server", "day": 1, "start": "09:00", "end": "15:00"}');
insert into lk values ('draft_k', to_jsonb(pg_temp.save('ayse', pg_temp.session(pg_temp.got('ayse')), 'Kadikoy week')));
insert into lk values ('draft_b', to_jsonb(pg_temp.save('mehmet', pg_temp.session(pg_temp.got('mehmet')), 'Besiktas week')));
select is(
  (select location_ids from public.schedule_drafts where id = pg_temp.draft('draft_k')),
  array[tests.id('lk:K')],
  'a draft remembers the location it covers'
);

-- One draft for both locations: one person edits it at a time.
insert into lk values ('owner', pg_temp.open('owner', null));
select tests.add_shift(tests.user('lk:owner'), 'lk', pg_temp.session(pg_temp.got('owner')), 1,
  '{"person": "ali", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"}');
select tests.add_shift(tests.user('lk:owner'), 'lk', pg_temp.session(pg_temp.got('owner')), 1,
  '{"person": "ali", "loc": "B", "job": "server", "day": 4, "start": "09:00", "end": "15:00"}');
insert into lk values ('draft_kb', to_jsonb(pg_temp.save('owner', pg_temp.session(pg_temp.got('owner')), 'Both locations')));
insert into lk values ('ayse2', pg_temp.open('ayse', array['K'], 'draft', pg_temp.draft('draft_kb')));
select is(
  jsonb_array_length(pg_temp.got('ayse2') -> 'session' -> 'shifts'),
  1,
  'an edit of Kadikoy loads only the Kadikoy part of the draft'
);
insert into lk values ('mehmet2', pg_temp.open('mehmet', array['B'], 'draft', pg_temp.draft('draft_kb')));
select is(pg_temp.got('mehmet2') ->> 'status', 'conflict', 'Mehmet cannot open the draft Ayse is editing, even for Besiktas');
select is(pg_temp.got('mehmet2') ->> 'holder_name', 'Ayse Person', 'the answer names who is editing it');
select ok(
  not exists (
    select 1 from public.schedule_edit_sessions s
    where s.holder_user_id = tests.user('lk:mehmet') and s.status = 'active' and s.week_start = tests.week(1)
  ),
  'a refused edit takes nothing'
);

-- Mehmet may not take over a Kadikoy edit; the admin may, and saving it keeps Besiktas.
select throws_ok(
  format($$select public.takeover_schedule_edit_session_service(tests.user('lk:mehmet'), tests.id('lk'), %L)$$,
    pg_temp.session(pg_temp.got('ayse2'))),
  '42501', null,
  'somebody who cannot edit Kadikoy cannot take over its edit'
);
select lives_ok(
  format($$select public.takeover_schedule_edit_session_service(tests.user('lk:zeynep'), tests.id('lk'), %L)$$,
    pg_temp.session(pg_temp.got('ayse2'))),
  'the admin takes over the Kadikoy edit'
);
select pg_temp.save('zeynep', pg_temp.session(pg_temp.got('ayse2')), 'Both locations', pg_temp.draft('draft_kb'));
select is(
  pg_temp.draft_locations(pg_temp.draft('draft_kb')),
  array['BJK', 'KDK'],
  'BL-097: saving a taken-over Kadikoy edit keeps the draft''s Besiktas shifts'
);

-- A Kadikoy-only draft cannot be published for Besiktas.
select throws_ok(
  format($$select public.preview_schedule_publication_service(tests.user('lk:owner'), tests.id('lk'), %L, array[tests.id('lk:K'), tests.id('lk:B')], null, true)$$,
    pg_temp.draft('draft_k')),
  '22023', null,
  'publishing a location the draft does not cover is refused'
);
select is(
  pg_temp.changed('owner', pg_temp.draft('draft_k'), 'K'),
  'null'::jsonb,
  'the location it covers previews, with nothing changed there since the draft started'
);

-- An expired edit of a draft is recovered by the next person who opens the draft.
insert into lk values ('ayse3', pg_temp.open('ayse', null, 'blank', null, 2));
select tests.add_shift(tests.user('lk:ayse'), 'lk', pg_temp.session(pg_temp.got('ayse3')), 2,
  '{"person": "emre", "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "15:00"}');
insert into lk values ('draft_k2', to_jsonb(pg_temp.save('ayse', pg_temp.session(pg_temp.got('ayse3')), 'Kadikoy week 2')));
insert into lk values ('ayse3b', pg_temp.open('ayse', null, 'draft', pg_temp.draft('draft_k2'), 2));
update public.schedule_edit_sessions set dirty = true, expires_at = now() - interval '1 minute'
where id = pg_temp.session(pg_temp.got('ayse3b'));
insert into lk values ('can3', pg_temp.open('can', array['K'], 'draft', pg_temp.draft('draft_k2'), 2));
select is(pg_temp.got('can3') ->> 'status', 'acquired_after_recovery', 'Can opens the draft from Ayse''s expired edit');
select is(
  (select location_ids from public.schedule_drafts where id = (pg_temp.got('can3') ->> 'recovered_draft_id')::uuid),
  array[tests.id('lk:K')],
  'her unsaved Kadikoy work becomes a Kadikoy draft'
);

-- An expired edit of the week itself waits for its holder; others start their own.
insert into lk values ('ayse4', pg_temp.open('ayse', null, 'blank', null, 3));
update public.schedule_edit_sessions set dirty = true, expires_at = now() - interval '1 minute'
where id = pg_temp.session(pg_temp.got('ayse4'));
insert into lk values ('can4', pg_temp.open('can', array['K'], 'blank', null, 3));
select is(pg_temp.got('can4') ->> 'status', 'acquired', 'Can starts his own Kadikoy edit');
select is(
  (select status::text from public.schedule_edit_sessions where id = pg_temp.session(pg_temp.got('ayse4'))),
  'active',
  'Ayse''s unsaved edit is left for her to pick back up'
);

-- Editing Kadikoy still sees Ali's published Besiktas shift.
select tests.publish_week('lk', 4, '[{"label": "ali-b", "person": "ali", "loc": "B", "job": "server", "day": 1, "start": "09:00", "end": "15:00"}]');
insert into lk values ('ayse5', pg_temp.open('ayse', array['K'], 'blank', null, 4));
select ok(
  exists (
    select 1 from jsonb_array_elements(public.assess_schedule_shift_service(
      tests.user('lk:ayse'), tests.id('lk'),
      jsonb_build_object('location_id', tests.id('lk:K'), 'employee_id', tests.id('lk:ali'), 'job_id', tests.id('lk:job:cook'),
        'scheduled_date', tests.week(4) + 1, 'time_basis', 'explicit', 'start_time', '10:00', 'end_time', '14:00',
        'time_timezone', 'Europe/Istanbul', 'note', ''),
      null, pg_temp.session(pg_temp.got('ayse5'))) -> 'reasons') reason
    where reason ->> 'code' = 'time_overlap'
  ),
  'a Kadikoy edit sees that Ali already works in Besiktas at that time'
);

-- Kadikoy is published; Ayse starts from it. Zeynep publishes Kadikoy while
-- Ayse still works: Ayse's draft warns before it replaces Zeynep's version.
select tests.publish_week('lk', 5, '[{"label": "emre-k5", "person": "emre", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}]');
insert into lk values ('ayse6', pg_temp.open('ayse', array['K'], 'published', null, 5));
select tests.add_shift(tests.user('lk:ayse'), 'lk', pg_temp.session(pg_temp.got('ayse6')), 5,
  '{"person": "emre", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"}');
insert into lk values ('zeynep6', pg_temp.open('zeynep', array['K'], 'published', null, 5));
select tests.add_shift(tests.user('lk:zeynep'), 'lk', pg_temp.session(pg_temp.got('zeynep6')), 5,
  '{"person": "emre", "loc": "K", "job": "cook", "day": 3, "start": "09:00", "end": "15:00"}');
insert into lk values ('draft_z6', to_jsonb(pg_temp.save('zeynep', pg_temp.session(pg_temp.got('zeynep6')), 'Zeynep week 5')));
select pg_temp.publish('zeynep', pg_temp.draft('draft_z6'), array['K']);
insert into lk values ('draft_a6', to_jsonb(pg_temp.save('ayse', pg_temp.session(pg_temp.got('ayse6')), 'Ayse week 5')));
select is(
  pg_temp.changed('ayse', pg_temp.draft('draft_a6'), 'K') ->> 'kind',
  'published',
  'Ayse''s preview says Kadikoy was published after she started'
);
select is(
  pg_temp.changed('ayse', pg_temp.draft('draft_a6'), 'K') ->> 'by_name',
  'Zeynep Person',
  'and who published it'
);
select is(
  pg_temp.publish('ayse', pg_temp.draft('draft_a6'), array['K']) ->> 'status',
  'published',
  'knowing it, Ayse still publishes'
);
select is(
  pg_temp.changed('ayse', pg_temp.draft('draft_a6'), 'K'),
  'null'::jsonb,
  'her draft now starts from what she published'
);
select public.unpublish_schedule_service(tests.user('lk:zeynep'), tests.id('lk'), tests.week(5), array[tests.id('lk:K')],
  public.preview_schedule_unpublication_service(tests.user('lk:zeynep'), tests.id('lk'), tests.week(5), array[tests.id('lk:K')]) ->> 'fingerprint');
select is(
  pg_temp.changed('ayse', pg_temp.draft('draft_a6'), 'K') ->> 'kind',
  'unpublished',
  'an unpublished location is named too'
);

select * from finish();
rollback;

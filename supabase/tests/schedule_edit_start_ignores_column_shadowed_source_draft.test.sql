begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- BL-210 follow-up: app_private.schedule_edit_starting_point's join
--   left join public.schedule_drafts draft on draft.id = source_draft_id
-- means "source_draft_id" (its own uuid parameter -- the draft THIS edit
-- resumes, null for a blank edit) but public.schedule_location_publications
-- also has a column literally named source_draft_id (the draft that WAS
-- published to create that publication row). Postgres resolves the bare name
-- to the table column, not the parameter, for every publication row -- so a
-- blank edit's "where did each location start" lookup silently joins each
-- publication to the draft IT came from instead of to nothing. A published
-- week's draft is never archived (only Delete does that) and publishing
-- always adds a publication as its own draft's new base_publication_ids
-- entry, so that old, superseded publication still looks "current" to the
-- join -- a manager who republishes the same week twice, then opens a plain
-- new edit of it, gets both the old and the new publication as their
-- starting point. That is exactly the shape that later makes
-- app_private.schedule_publication_changes_since_start's one-row assumption
-- (one_draft_one_editor.sql:148) blow up with "more than one row returned by
-- a subquery used as an expression" on the publish preview.

select tests.world('rp');
select tests.person('rp', 'mia', 'manager', array['K'], array['cook']);
select tests.person('rp', 'ali', 'employee', array['K'], array['cook']);

-- Publish the same week twice -- an ordinary "I published, then changed
-- something and republished" flow, nothing exotic.
select tests.publish_week_as(tests.user('rp:mia'), 'rp', 1, '[
  {"label": "first", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}
]');
select tests.publish_week_as(tests.user('rp:mia'), 'rp', 1, '[
  {"label": "second", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}
]');

select is(
  (select count(*)::int from public.schedule_location_publications
   where workspace_id = tests.id('rp') and location_id = tests.id('rp:K') and status = 'current'),
  1, 'sanity: only one publication is current for K after the second publish'
);

-- A plain new edit of the same week (the Schedule screen's default "open a
-- blank draft"), same actor: its starting point for K should be that one
-- current publication only.
select tests.remember('rp:session:blank', (public.acquire_schedule_edit_session_service(
  tests.user('rp:mia'), tests.id('rp'), tests.week(1), 'blank', null) -> 'session' ->> 'id')::uuid);

select is(
  (select count(*)::int from public.schedule_edit_sessions
   where id = tests.id('rp:session:blank')
     and base_publication_ids && (
       select array_agg(id) from public.schedule_location_publications
       where workspace_id = tests.id('rp') and location_id = tests.id('rp:K') and status = 'superseded'
     )),
  0, 'a blank edit''s starting point does not include a superseded publication'
);
select is(
  cardinality((select base_publication_ids from public.schedule_edit_sessions where id = tests.id('rp:session:blank'))),
  1, 'a blank edit of one location starts from exactly one publication'
);

-- The symptom a manager saw (BL-234): saving that edit and opening the
-- Publish preview failed with "more than one row returned by a subquery".
select tests.remember('rp:draft', (public.save_schedule_edit_session_service(
  tests.user('rp:mia'), tests.id('rp'), tests.id('rp:session:blank'),
  (select revision from public.schedule_edit_sessions where id = tests.id('rp:session:blank')),
  'republish check', null, null) ->> 'id')::uuid);
select lives_ok(
  format('select public.preview_schedule_publication_service(%L, %L, %L, array[%L]::uuid[])',
    tests.user('rp:mia'), tests.id('rp'), tests.id('rp:draft'), tests.id('rp:K')),
  'the publish preview of a week published twice does not crash');

select * from finish();
rollback;

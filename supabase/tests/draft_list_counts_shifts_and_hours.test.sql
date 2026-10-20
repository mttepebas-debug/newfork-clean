begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- New Schedule window (Mert, 2026-10-12 17:00 PT): every schedule of the week
-- shows its shifts and paid hours and who saved it last, counted only where
-- the reader schedules. The owner publishes three shifts for Ali: Monday
-- 09:00-15:00 at Kadikoy with a 30-minute unpaid break (330 paid minutes),
-- Tuesday 22:00-06:00 at Kadikoy, past midnight (480), and Wednesday
-- 10:00-14:00 at Besiktas (240). Derya manages Kadikoy only.
-- QA 41 (Mert, 2026-10-20): an open shift on Thursday at Kadikoy is in no
-- total, the grid's way; the window says it apart as open_shift_count.

select tests.world('dc');
select tests.person('dc', 'ali', 'employee', array['K', 'B'], array['cook']);
select tests.person('dc', 'derya', 'manager', array['K'], array['cook']);
select tests.remember('dc:draft', tests.publish_week('dc', 1, '[
  {"label": "mon", "person": "ali", "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "15:00"},
  {"label": "tue", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "22:00", "end": "06:00"},
  {"label": "wed", "person": "ali", "loc": "B", "job": "cook", "day": 2, "start": "10:00", "end": "14:00"},
  {"label": "open", "loc": "K", "job": "cook", "day": 3, "start": "10:00", "end": "14:00"}
]'));
-- ponytail: the builder's shift has no break field; set the break on both copies by hand.
update public.schedule_draft_shifts set unpaid_break_minutes = 30
where draft_id = tests.id('dc:draft') and start_time = '09:00';
update public.schedule_published_shifts set unpaid_break_minutes = 30
where id = tests.id('dc:shift:mon');

create temp table list_for(reader text, body jsonb);
insert into list_for
select reader, public.list_schedule_drafts_service(tests.user('dc:' || reader), tests.id('dc'), tests.week(1))
from unnest(array['owner', 'derya']) reader;

create temp table draft_row(reader text, fields jsonb);
insert into draft_row
select l.reader, d from list_for l, jsonb_array_elements(l.body -> 'drafts') d
where d ->> 'id' = tests.id('dc:draft')::text;

select is((select count(*)::integer from draft_row), 2, 'the owner and the Kadikoy manager both see the published week''s draft');

select is((select (fields ->> 'shift_count')::integer from draft_row where reader = 'owner'), 3,
  'the owner counts every shift of the draft');
select is((select (fields ->> 'paid_minutes')::integer from draft_row where reader = 'owner'), 1050,
  'paid minutes: past midnight counts to the morning, the unpaid break is taken off');
select is((select (fields ->> 'shift_count')::integer from draft_row where reader = 'derya'), 2,
  'a manager counts only the shifts at the locations they schedule');
select is((select (fields ->> 'paid_minutes')::integer from draft_row where reader = 'derya'), 810,
  'and only those shifts'' paid minutes');
select is((select (fields ->> 'open_shift_count')::integer from draft_row where reader = 'owner'), 1,
  'the open shift is counted apart, not in the shifts or hours');
select is((select (fields ->> 'open_shift_count')::integer from draft_row where reader = 'derya'), 1,
  'the Kadikoy manager sees the Kadikoy open shift apart too');
select is((select fields ->> 'updated_by_name' from draft_row where reader = 'owner'), 'Olcay Owner',
  'the row names who saved the draft last');

select is((select body -> 'published' from list_for where reader = 'owner'),
  '{"shift_count": 3, "paid_minutes": 1050, "open_shift_count": 1}'::jsonb,
  'the live schedule has its own total, from what is published');
select is((select body -> 'published' from list_for where reader = 'derya'),
  '{"shift_count": 2, "paid_minutes": 810, "open_shift_count": 1}'::jsonb,
  'the manager''s live total stays at their locations');

select is(
  public.list_schedule_drafts_service(tests.user('dc:owner'), tests.id('dc'), tests.week(2)),
  '{"drafts": [], "published": {"shift_count": 0, "paid_minutes": 0, "open_shift_count": 0}}'::jsonb,
  'a week with nothing in it says so with zeros, not nulls'
);

-- Another workspace publishes the same week: none of its shifts reach these
-- numbers. Berk manages Besiktas only: a draft with nothing at Besiktas is not
-- in his list at all, and his count of the first draft stays at Besiktas.
select tests.world('dz');
select tests.person('dz', 'ali', 'employee', array['K'], array['cook']);
select tests.publish_week('dz', 1, '[
  {"label": "mon", "person": "ali", "loc": "K", "job": "cook", "day": 0, "start": "08:00", "end": "16:00"}
]');
select tests.person('dc', 'berk', 'manager', array['B'], array['cook']);
-- Derya opens it: her edit covers Kadikoy only, so the draft is tied to Kadikoy alone.
select tests.remember('dc:kadikoy-only', tests.publish_week_as(tests.user('dc:derya'), 'dc', 3, '[
  {"label": "k3", "person": "ali", "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "13:00"}
]'));

select is(
  public.list_schedule_drafts_service(tests.user('dc:owner'), tests.id('dc'), tests.week(1)) -> 'published',
  '{"shift_count": 3, "paid_minutes": 1050, "open_shift_count": 1}'::jsonb,
  'another workspace''s week adds nothing to the live total'
);
select is(
  (select (d ->> 'shift_count')::integer
   from jsonb_array_elements(public.list_schedule_drafts_service(tests.user('dc:berk'), tests.id('dc'), tests.week(1)) -> 'drafts') d
   where d ->> 'id' = tests.id('dc:draft')::text),
  1,
  'the Besiktas manager counts only the Besiktas shift of the draft'
);
-- The open shift is at Kadikoy: out of Berk's reach, so not in his open count either.
select is(
  (select (d ->> 'open_shift_count')::integer
   from jsonb_array_elements(public.list_schedule_drafts_service(tests.user('dc:berk'), tests.id('dc'), tests.week(1)) -> 'drafts') d
   where d ->> 'id' = tests.id('dc:draft')::text),
  0,
  'an open shift at another location is not in the Besiktas manager''s open count'
);
select is(
  public.list_schedule_drafts_service(tests.user('dc:berk'), tests.id('dc'), tests.week(1)) -> 'published',
  '{"shift_count": 1, "paid_minutes": 240, "open_shift_count": 0}'::jsonb,
  'nor in his live total'
);
select is(
  (select count(*)::integer
   from jsonb_array_elements(public.list_schedule_drafts_service(tests.user('dc:berk'), tests.id('dc'), tests.week(3)) -> 'drafts') d
   where d ->> 'id' = tests.id('dc:kadikoy-only')::text),
  0,
  'a draft with nothing at the manager''s locations is not in their list'
);

select * from finish();
rollback;

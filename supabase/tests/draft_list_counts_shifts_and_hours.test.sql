begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- New Schedule window (Mert, 2026-10-12 17:00 PT): every schedule of the week
-- shows its shifts and paid hours and who saved it last, counted only where
-- the reader schedules. The owner publishes three shifts for Ali: Monday
-- 09:00-15:00 at Kadikoy with a 30-minute unpaid break (330 paid minutes),
-- Tuesday 22:00-06:00 at Kadikoy, past midnight (480), and Wednesday
-- 10:00-14:00 at Besiktas (240). Derya manages Kadikoy only.

select tests.world('dc');
select tests.person('dc', 'ali', 'employee', array['K', 'B'], array['cook']);
select tests.person('dc', 'derya', 'manager', array['K'], array['cook']);
select tests.remember('dc:draft', tests.publish_week('dc', 1, '[
  {"label": "mon", "person": "ali", "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "15:00"},
  {"label": "tue", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "22:00", "end": "06:00"},
  {"label": "wed", "person": "ali", "loc": "B", "job": "cook", "day": 2, "start": "10:00", "end": "14:00"}
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
select is((select fields ->> 'updated_by_name' from draft_row where reader = 'owner'), 'Olcay Owner',
  'the row names who saved the draft last');

select is((select body -> 'published' from list_for where reader = 'owner'),
  '{"shift_count": 3, "paid_minutes": 1050}'::jsonb,
  'the live schedule has its own total, from what is published');
select is((select body -> 'published' from list_for where reader = 'derya'),
  '{"shift_count": 2, "paid_minutes": 810}'::jsonb,
  'the manager''s live total stays at their locations');

select is(
  public.list_schedule_drafts_service(tests.user('dc:owner'), tests.id('dc'), tests.week(2)),
  '{"drafts": [], "published": {"shift_count": 0, "paid_minutes": 0}}'::jsonb,
  'a week with nothing in it says so with zeros, not nulls'
);

select * from finish();
rollback;

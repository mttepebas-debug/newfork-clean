begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- Home's "Next 7 days" strip (Mert, 2026-10-24): one line per shift, coloured by its shift type and as long
-- as the shift, and a day off told apart from a day whose schedule is not posted yet.
-- Alex works at Kadikoy only. Week 1: Kadikoy posted. Week 2: nothing posted. Week 3: only Besiktas posted.
select tests.world('ws');
select tests.person('ws', 'alex', 'employee', array['K'], array['cook']);
select tests.person('ws', 'sam', 'employee', array['B'], array['cook']);

select tests.publish_week('ws', 1, '[
  {"label": "alex-mon", "person": "alex", "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "13:00"},
  {"label": "alex-tue", "person": "alex", "loc": "K", "job": "cook", "day": 1, "start": "18:00", "end": "22:00"}
]');
select tests.publish_week('ws', 3, '[
  {"label": "sam-mon", "person": "sam", "loc": "B", "job": "cook", "day": 0, "start": "09:00", "end": "17:00"}
]');

insert into public.shift_types(id, workspace_id, name, color, sort_order, default_start_time, default_end_time)
values ('99000000-0000-4000-8000-0000000000a1', tests.id('ws'), 'Dinner', '#176954', 1, '17:00', '23:00');
update public.schedule_published_shifts set shift_type_id = '99000000-0000-4000-8000-0000000000a1'
where id = tests.id('ws:shift:alex-tue');

create temp table strip_state(model jsonb);
insert into strip_state(model)
values (public.get_employee_hub_service(tests.user('ws:alex'), tests.id('ws'), tests.week(1), tests.week(1) + 20));

select is(
  (select array_agg(d order by ord) from strip_state, jsonb_array_elements_text(model -> 'posted_days') with ordinality as p(d, ord)),
  (select array_agg(to_char(tests.week(1) + i, 'YYYY-MM-DD') order by i) from generate_series(0, 6) i),
  'every day of a week posted at the person''s location is a posted day, in order'
) from strip_state;
select ok(not (model -> 'posted_days') ? to_char(tests.week(2), 'YYYY-MM-DD'),
  'a day of a week nobody posted is not a posted day') from strip_state;
select ok(not (model -> 'posted_days') ? to_char(tests.week(3), 'YYYY-MM-DD'),
  'a week posted only at a location the person does not work at does not count') from strip_state;

select is((select s ->> 'shift_type_color' from jsonb_array_elements(model -> 'shifts') s where s ->> 'id' = tests.id('ws:shift:alex-tue')::text),
  '#176954', 'a shift with a shift type carries the type''s colour') from strip_state;
select is((select array[s ->> 'shift_type_start_time', s ->> 'shift_type_end_time'] from jsonb_array_elements(model -> 'shifts') s where s ->> 'id' = tests.id('ws:shift:alex-tue')::text),
  array['17:00', '23:00'], 'and the type''s default times, as HH:MM') from strip_state;
select is((select array[s ->> 'start_time', s ->> 'end_time'] from jsonb_array_elements(model -> 'shifts') s where s ->> 'id' = tests.id('ws:shift:alex-tue')::text),
  array['18:00', '22:00'], 'the shift''s own times stay its own') from strip_state;

select ok((select s ? 'shift_type_color' and s -> 'shift_type_color' = 'null'::jsonb from jsonb_array_elements(model -> 'shifts') s where s ->> 'id' = tests.id('ws:shift:alex-mon')::text),
  'a shift without a type says its colour is null') from strip_state;
select ok((select s ? 'shift_type_start_time' and s -> 'shift_type_start_time' = 'null'::jsonb
    and s ? 'shift_type_end_time' and s -> 'shift_type_end_time' = 'null'::jsonb
  from jsonb_array_elements(model -> 'shifts') s where s ->> 'id' = tests.id('ws:shift:alex-mon')::text),
  'and its type times are null') from strip_state;

-- A range with no posted week answers an empty list, not null.
select is(public.get_employee_hub_service(tests.user('ws:alex'), tests.id('ws'), tests.week(2), tests.week(2) + 6) -> 'posted_days',
  '[]'::jsonb, 'a range with nothing posted says an empty list');

select * from finish();
rollback;

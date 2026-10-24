begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

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

-- A publication covers a person the way it covers a shift (schedule_shift_in_department_scope_service): every
-- department when it names none, else a job of the person's in one of its departments, or a job with no
-- department when it takes those (nf-guvenlik, hub-week-data).
-- Bea tends bar at Kadikoy. Week 4: Kadikoy posted for Kitchen only. Week 5: Kadikoy posted, then unpublished.
create temp table bar_state(created jsonb);
insert into bar_state select public.create_department_with_jobs_service(tests.user('ws:owner'), tests.id('ws'),
  '{"name": "Bar", "color": "#4478A8"}'::jsonb, '[{"name": "Bartender", "color": "#D39A36"}]'::jsonb);
select tests.remember('ws:job:bartender', (created -> 'jobs' -> 0 ->> 'id')::uuid) from bar_state;
select tests.person('ws', 'bea', 'employee', array['K'], array['bartender']);

select tests.publish_week('ws', 4, '[
  {"label": "alex-w4", "person": "alex", "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "13:00"}
]');
-- ponytail: straight into the row, past the publish drawer's department choice, which has its own tests.
update public.schedule_location_publications set department_ids = array[tests.id('ws:kitchen')], include_no_department = false
where workspace_id = tests.id('ws') and location_id = tests.id('ws:K') and week_start = tests.week(4) and status = 'current';

select tests.publish_week('ws', 5, '[
  {"label": "alex-w5", "person": "alex", "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "13:00"}
]');
update public.schedule_location_publications set status = 'unpublished', unpublished_by = tests.user('ws:owner'), unpublished_at = now()
where workspace_id = tests.id('ws') and location_id = tests.id('ws:K') and week_start = tests.week(5) and status = 'current';

select ok(public.get_employee_hub_service(tests.user('ws:alex'), tests.id('ws'), tests.week(4), tests.week(4) + 6) -> 'posted_days'
  ? to_char(tests.week(4) + 3, 'YYYY-MM-DD'), 'a week posted for Kitchen is posted for a cook');
select is(public.get_employee_hub_service(tests.user('ws:bea'), tests.id('ws'), tests.week(4), tests.week(4) + 6) -> 'posted_days',
  '[]'::jsonb, 'but not for a bartender at the same location: her empty days are not yet posted, not off');
select ok(public.get_employee_hub_service(tests.user('ws:bea'), tests.id('ws'), tests.week(1), tests.week(1) + 6) -> 'posted_days'
  ? to_char(tests.week(1) + 3, 'YYYY-MM-DD'), 'a week posted for every department is posted for her');
select is(public.get_employee_hub_service(tests.user('ws:alex'), tests.id('ws'), tests.week(5), tests.week(5) + 6) -> 'posted_days',
  '[]'::jsonb, 'an unpublished week is not posted');

-- Dana worked at Besiktas, whose week 3 is posted, and stopped working there.
select tests.person('ws', 'dana', 'employee', array['B'], array['cook']);
select ok(public.get_employee_hub_service(tests.user('ws:dana'), tests.id('ws'), tests.week(3), tests.week(3) + 6) -> 'posted_days'
  ? to_char(tests.week(3), 'YYYY-MM-DD'), 'a week posted where the person works is posted');
select tests.stops_working_at((select m.id from public.workspace_memberships m
  where m.workspace_id = tests.id('ws') and m.user_id = tests.user('ws:dana')), tests.id('ws:B'));
select is(public.get_employee_hub_service(tests.user('ws:dana'), tests.id('ws'), tests.week(3), tests.week(3) + 6) -> 'posted_days',
  '[]'::jsonb, 'a location the person no longer works at does not count');

-- Another workspace posts week 6. ponytail: a publication's location belongs to its own workspace (foreign key
-- location_id, workspace_id), so this one cannot name Alex's location; the read still keeps to its workspace.
select tests.world('wo');
select tests.person('wo', 'olga', 'employee', array['K'], array['cook']);
select tests.publish_week('wo', 6, '[
  {"label": "olga-w6", "person": "olga", "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "13:00"}
]');
select is(public.get_employee_hub_service(tests.user('ws:alex'), tests.id('ws'), tests.week(6), tests.week(6) + 6) -> 'posted_days',
  '[]'::jsonb, 'another workspace''s publication does not count');

select * from finish();
rollback;

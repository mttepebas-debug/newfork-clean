begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

-- LINEUP-EDIT L3a (KARARLAR S-178 madde 5-7; Mert 2026-10-20 ~04:20 AM PT, "Bu kapsamla, Moved sonra"): on a draft
-- lineup a manager calls a person off and back in, adds somebody from a scored list (Best fit / Available /
-- Consider / Unavailable), puts somebody in a person's place and takes it back. Another location's row is never
-- touched. Kadikoy's Lunch: Eli 9 AM - 3 PM in the kitchen; around it, one person for each rule of the list.

select tests.world('e');
select tests.world('ex');
select tests.person('e', 'mia', 'manager', array['K'], array['cook']);
select tests.person('e', 'bo', 'manager', array['B'], array['cook']);
select tests.person('e', 'eli', 'employee', array['K'], array['cook']);
select tests.person('e', 'ana', 'employee', array['K'], array['cook']);
select tests.person('e', 'cem', 'employee', array['K'], array['cook']);
select tests.person('e', 'deniz', 'employee', array['K', 'B'], array['cook']);
select tests.person('e', 'fay', 'employee', array['K'], array['cook']);
select tests.person('e', 'hal', 'employee', array['K'], array['server']);
select tests.person('e', 'ivy', 'employee', array['K'], array['cook']);
select tests.person('e', 'jon', 'employee', array['B'], array['cook']);
select tests.person('e', 'kai', 'employee', array['K'], array['cook']);
select tests.person('ex', 'xan', 'manager', array['K'], array['cook']);

-- Gus works the floor, not the kitchen: free, but not in its positions.
select tests.remember('e:job:host', (public.create_department_with_jobs_service(tests.user('e:owner'), tests.id('e'),
  '{"name": "Floor", "color": "#3C7A68"}'::jsonb, '[{"name": "Host", "color": "#4478A8"}]'::jsonb) -> 'jobs' -> 0 ->> 'id')::uuid);
select tests.person('e', 'gus', 'employee', array['K'], array['host']);
update public.employee_profiles set is_excluded_from_schedule = true where id = tests.id('e:kai');

insert into public.shift_types (id, workspace_id, name, color, default_start_time, default_end_time)
values (tests.remember('e:type:lunch', gen_random_uuid()), tests.id('e'), 'Lunch', '#1F9D74', '09:00', '15:00'),
  (tests.remember('e:type:dinner', gen_random_uuid()), tests.id('e'), 'Dinner', '#5B4BD6', '16:00', '22:00');
select tests.publish_week('e', 0, jsonb_build_array(
  jsonb_build_object('label', 'eli', 'person', 'eli', 'loc', 'K', 'job', 'cook', 'day', 0, 'start', '09:00', 'end', '15:00'),
  -- Cem: Dinner here, after Lunch. Hal: Dinner here from 1 PM, two of Lunch's six hours. Ivy: five of them.
  jsonb_build_object('label', 'cem', 'person', 'cem', 'loc', 'K', 'job', 'cook', 'day', 0, 'start', '16:00', 'end', '22:00'),
  jsonb_build_object('label', 'hal', 'person', 'hal', 'loc', 'K', 'job', 'server', 'day', 0, 'start', '13:00', 'end', '20:00'),
  jsonb_build_object('label', 'ivy', 'person', 'ivy', 'loc', 'K', 'job', 'cook', 'day', 0, 'start', '10:00', 'end', '16:00'),
  -- Deniz: Lunch at Besiktas, 10 AM - 2 PM, four of the six hours.
  jsonb_build_object('label', 'deniz', 'person', 'deniz', 'loc', 'B', 'job', 'cook', 'day', 0, 'start', '10:00', 'end', '14:00')
));
-- ponytail: the test editor has no shift type field; the published rows get theirs here.
update public.schedule_published_shifts set shift_type_id = tests.id('e:type:lunch')
where id in (tests.id('e:shift:eli'), tests.id('e:shift:deniz'));
update public.schedule_published_shifts set shift_type_id = tests.id('e:type:dinner')
where id in (tests.id('e:shift:cem'), tests.id('e:shift:hal'), tests.id('e:shift:ivy'));
-- Fay has the day off.
select tests.approved_leave(tests.id('e'), tests.id('e:fay'), tests.user('e:owner'), tests.id('e:K'), tests.week(0));

create temporary table fixture (key text primary key, value uuid);
insert into fixture values
  ('eli_source', (select source_shift_id from public.schedule_published_shifts where id = tests.id('e:shift:eli')));

create function pg_temp.lunch(extra jsonb)
returns jsonb
language sql
as $$
  select jsonb_build_object('location_id', tests.id('e:K'), 'service_date', tests.week(0), 'shift_type_id', tests.id('e:type:lunch')) || extra
$$;
create function pg_temp.candidates(actor uuid, extra jsonb)
returns jsonb
language sql
as $$
  select public.get_lineup_candidates_service(actor, tests.id('e'), pg_temp.lunch(extra))
$$;
create function pg_temp.edit(actor uuid, extra jsonb)
returns jsonb
language sql
as $$
  select public.lineup_edit_service(actor, tests.id('e'), gen_random_uuid(), pg_temp.lunch(extra))
$$;
create function pg_temp.lunch_rows()
returns setof jsonb
language sql
as $$
  select r from jsonb_array_elements(
      public.get_lineup_day_service(tests.user('e:owner'), tests.id('e'), tests.week(0)) -> 'locations') l,
    jsonb_array_elements(l -> 'lineups') x, jsonb_array_elements(x -> 'rows') r
  where l ->> 'id' = tests.id('e:K')::text and x ->> 'shift_type_id' = tests.id('e:type:lunch')::text
$$;
create function pg_temp.row_of(person text)
returns jsonb
language sql
as $$
  select r from pg_temp.lunch_rows() r where r ->> 'employee_id' = tests.id('e:' || person)::text
$$;
create function pg_temp.refusal(statement text)
returns text
language plpgsql
as $$
declare
  state text;
  why text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics state = returned_sqlstate, why = pg_exception_hint;
  return state || ':' || coalesce(why, '');
end;
$$;
create temporary table kitchen as
select c from jsonb_array_elements(pg_temp.candidates(tests.user('e:mia'), jsonb_build_object('department_id', tests.id('e:kitchen'))) -> 'candidates') c;

-- 1. Add Staff's list for the kitchen, by score.
select is(
  (select string_agg((c ->> 'name') || ' ' || (c ->> 'group') || ' ' || (c ->> 'score'), ', ' order by o)
   from jsonb_array_elements(pg_temp.candidates(tests.user('e:mia'), jsonb_build_object('department_id', tests.id('e:kitchen'))) -> 'candidates')
     with ordinality as x (c, o)),
  'Ana Person best_fit 100, Gus Person consider 100, Mia Person best_fit 100, Cem Person available 65, Deniz Person unavailable 45, Hal Person available 30, Fay Person unavailable 15',
  'the kitchen''s list: who is free first (Mia, a manager who also works, as the Schedule has her); Gus is free but not in the kitchen; Deniz and Fay last, unavailable'
);
select is(
  (select c -> 'why' from kitchen where c ->> 'name' = 'Deniz Person'),
  '{"reason": "elsewhere", "location_name": "Besiktas", "shift_name": "Lunch", "start_time": "10:00", "end_time": "14:00", "partial": true}'::jsonb,
  'working somewhere else says where, which shift and its hours, and that it is part of these hours'
);
select is((select c -> 'why' from kitchen where c ->> 'name' = 'Fay Person'), '{"reason": "time_off"}'::jsonb, 'approved time off');
select is(
  (select c -> 'why' from kitchen where c ->> 'name' = 'Hal Person'),
  '{"reason": "overlap_here", "shift_name": "Dinner", "start_time": "13:00", "end_time": "20:00", "overlap_minutes": 120}'::jsonb,
  'a shift here for part of these hours says how much'
);
select is(
  (select c -> 'why' from kitchen where c ->> 'name' = 'Cem Person'),
  '{"reason": "other_shift", "location_name": null, "shift_name": "Dinner", "start_time": "16:00", "end_time": "22:00"}'::jsonb,
  'another shift here, after this one'
);
select is((select c -> 'why' from kitchen where c ->> 'name' = 'Ana Person'), '{"reason": "no_shift"}'::jsonb, 'no shift today');
select is(
  (select row(c ->> 'job_id', c -> 'job_ids')::text from kitchen where c ->> 'name' = 'Ana Person'),
  row(tests.id('e:job:cook')::text, jsonb_build_array(tests.id('e:job:cook')))::text,
  'she would join as her kitchen position'
);
select is(
  (select count(*)::integer from kitchen where c ->> 'name' in ('Eli Person', 'Ivy Person', 'Jon Person', 'Kai Person')),
  0, 'not offered: Eli is on it, Ivy is here for most of these hours, Jon works elsewhere only, Kai is kept off the Schedule'
);
select is(
  (select row(r -> 'window' ->> 'start_time', r -> 'window' ->> 'end_time')::text
   from (select pg_temp.candidates(tests.user('e:mia'), jsonb_build_object('department_id', tests.id('e:kitchen'))) r) w),
  row('09:00', '15:00')::text, 'the hours measured by: the kitchen''s on this lineup'
);

-- Another location's draft is its own: Besiktas moves Deniz to 9 AM - 3 PM in a lineup it hasn't published, and
-- the list still reads Besiktas's published Schedule (the review of 051577fd2; the Schedule's ghost shift).
insert into public.daily_lineups (id, workspace_id, location_id, service_date, shift_type_id)
values (tests.remember('e:lineup:b', gen_random_uuid()), tests.id('e'), tests.id('e:B'), tests.week(0), tests.id('e:type:lunch'));
insert into public.daily_lineup_rows (workspace_id, lineup_id, location_id, service_date, source_shift_id, starts, ends)
select tests.id('e'), tests.id('e:lineup:b'), tests.id('e:B'), tests.week(0), s.source_shift_id, '09:00', '15:00'
from public.schedule_published_shifts s where s.id = tests.id('e:shift:deniz');
select is(
  (select c -> 'why' from jsonb_array_elements(pg_temp.candidates(tests.user('e:mia'),
     jsonb_build_object('department_id', tests.id('e:kitchen'))) -> 'candidates') c where c ->> 'name' = 'Deniz Person'),
  '{"reason": "elsewhere", "location_name": "Besiktas", "shift_name": "Lunch", "start_time": "10:00", "end_time": "14:00", "partial": true}'::jsonb,
  'another location''s draft doesn''t show: its published Schedule does'
);

-- 2. Replace's list for Eli's row: his position and hours; the floor's Gus is only to consider.
select is(
  (select string_agg((c ->> 'name') || ' ' || (c ->> 'group'), ', ' order by o)
   from jsonb_array_elements(pg_temp.candidates(tests.user('e:mia'), jsonb_build_object('row',
       jsonb_build_object('source_shift_id', (select value from fixture where key = 'eli_source')))) -> 'candidates')
     with ordinality as x (c, o)
   where c ->> 'name' in ('Ana Person', 'Gus Person', 'Hal Person')),
  'Ana Person best_fit, Gus Person consider, Hal Person consider',
  'for Eli''s place: a cook fits; Hal (server) and Gus are only to consider'
);

-- 3. Who may: the location's manager; not another location's, an employee or a stranger.
select is(
  pg_temp.refusal(format($$select pg_temp.candidates(%L, jsonb_build_object('department_id', %L))$$, tests.user('e:bo'), tests.id('e:kitchen'))),
  '42501:authz.out_of_scope', 'another location''s manager is out of scope'
);
select is(
  pg_temp.refusal(format($$select pg_temp.candidates(%L, jsonb_build_object('department_id', %L))$$, tests.user('e:eli'), tests.id('e:kitchen'))),
  '42501:authz.' || app_private.authz_reason(tests.user('e:eli'), tests.id('e'), 'lineup.share'), 'an employee gets the core''s reason'
);
select is(
  pg_temp.refusal(format($$select pg_temp.candidates(%L, jsonb_build_object('department_id', %L))$$, tests.user('ex:xan'), tests.id('e:kitchen'))),
  '42501:authz.not_member', 'another workspace''s manager is not a member here'
);
select is(
  pg_temp.refusal(format($$select pg_temp.candidates(%L, '{}'::jsonb)$$, tests.user('e:mia'))),
  '22023:lineup.invalid_command', 'a department or a person, one of them'
);

-- 4. Add Staff: Ana joins as a cook with Eli's hours (the position's on this lineup); twice is refused.
select lives_ok(
  format($$select pg_temp.edit(%L, jsonb_build_object('action', 'add_person', 'person',
    jsonb_build_object('employee_id', %L, 'job_id', %L)))$$, tests.user('e:mia'), tests.id('e:ana'), tests.id('e:job:cook')),
  'the manager adds Ana'
);
select is(
  (select row(r ->> 'start_time', r ->> 'end_time', r ->> 'job_id', r -> 'lineup_only')::text from pg_temp.row_of('ana') r),
  row('09:00', '15:00', tests.id('e:job:cook')::text, 'true'::jsonb)::text, 'in the lineup only, with the cooks'' hours'
);
select is(
  pg_temp.refusal(format($$select pg_temp.edit(%L, jsonb_build_object('action', 'add_person', 'person',
    jsonb_build_object('employee_id', %L, 'job_id', %L)))$$, tests.user('e:mia'), tests.id('e:ana'), tests.id('e:job:cook'))),
  '22023:lineup.already_on', 'someone on the lineup is not added again'
);
select is(
  pg_temp.refusal(format($$select pg_temp.edit(%L, jsonb_build_object('action', 'add_person', 'person',
    jsonb_build_object('employee_id', %L, 'job_id', %L)))$$, tests.user('e:mia'), tests.id('e:jon'), tests.id('e:job:cook'))),
  '42501:authz.out_of_scope', 'someone who isn''t at this location is out of reach'
);
select lives_ok(
  format($$select pg_temp.edit(%L, jsonb_build_object('action', 'add_person', 'person',
    jsonb_build_object('employee_id', %L, 'job_id', %L, 'starts', '10:00', 'ends', '14:00')))$$,
    tests.user('e:mia'), tests.id('e:deniz'), tests.id('e:job:cook')),
  'Add anyway: Deniz, who works at Besiktas then, with the hours given'
);
select is(
  (select count(*)::integer from public.daily_lineup_rows r
   where r.employee_id = tests.id('e:deniz') and r.location_id = tests.id('e:B')),
  0, 'Besiktas has no row of Deniz''s changed (Moved is its own slice)'
);

-- 5. Call off and Call in.
select lives_ok(
  format($$select pg_temp.edit(%L, jsonb_build_object('action', 'call_off', 'row', jsonb_build_object('source_shift_id', %L)))$$,
    tests.user('e:mia'), (select value from fixture where key = 'eli_source')),
  'Eli is called off'
);
select ok((select r ->> 'called_off_at' is not null from pg_temp.row_of('eli') r), 'the day reads him called off');
select is(
  pg_temp.refusal(format($$select pg_temp.edit(%L, jsonb_build_object('action', 'replace', 'row', jsonb_build_object('source_shift_id', %L),
    'person', jsonb_build_object('employee_id', %L)))$$,
    tests.user('e:mia'), (select value from fixture where key = 'eli_source'), tests.id('e:cem'))),
  '22023:lineup.row_out', 'a person called off isn''t replaced'
);
select pg_temp.edit(tests.user('e:mia'), jsonb_build_object('action', 'call_in', 'row',
  jsonb_build_object('source_shift_id', (select value from fixture where key = 'eli_source'))));
select is((select r ->> 'called_off_at' from pg_temp.row_of('eli') r), null, 'Call in brings him back');

-- Called off, a person is still on the lineup: added again, she would be there twice (the review of 051577fd2).
select pg_temp.edit(tests.user('e:mia'), jsonb_build_object('action', 'call_off', 'row',
  jsonb_build_object('row_id', (select r ->> 'id' from pg_temp.row_of('ana') r))));
select is(
  pg_temp.refusal(format($$select pg_temp.edit(%L, jsonb_build_object('action', 'add_person', 'person',
    jsonb_build_object('employee_id', %L, 'job_id', %L)))$$, tests.user('e:mia'), tests.id('e:ana'), tests.id('e:job:cook'))),
  '22023:lineup.already_on', 'someone called off is called back in, not added again'
);
select pg_temp.edit(tests.user('e:mia'), jsonb_build_object('action', 'call_in', 'row',
  jsonb_build_object('row_id', (select r ->> 'id' from pg_temp.row_of('ana') r))));

-- 6. Replace: Cem takes Eli's place, his position, hours, label, section and place in the order; Undo gives it back.
insert into public.shift_labels (id, workspace_id, name) values (tests.remember('e:label:lead', gen_random_uuid()), tests.id('e'), 'Lead');
select pg_temp.edit(tests.user('e:mia'), jsonb_build_object('action', 'set_row', 'row', jsonb_build_object(
  'source_shift_id', (select value from fixture where key = 'eli_source'), 'label_ids', jsonb_build_array(tests.id('e:label:lead')),
  'section_name', 'Window')));
update public.daily_lineup_rows set sort_order = 3 where source_shift_id = (select value from fixture where key = 'eli_source');
select pg_temp.edit(tests.user('e:mia'), jsonb_build_object('action', 'replace',
  'row', jsonb_build_object('source_shift_id', (select value from fixture where key = 'eli_source')),
  'person', jsonb_build_object('employee_id', tests.id('e:cem'))));
select is(
  (select row(c ->> 'start_time', c ->> 'end_time', c ->> 'job_id', (e ->> 'replaced_by_row_id') = (c ->> 'id'))::text
   from pg_temp.row_of('cem') c, pg_temp.row_of('eli') e),
  row('09:00', '15:00', tests.id('e:job:cook')::text, true)::text, 'Cem has Eli''s place, and Eli is Replaced by him'
);
select is(
  (select row(c -> 'label_ids', c ->> 'section_id', c ->> 'section_name', c ->> 'sort_order')::text from pg_temp.row_of('cem') c),
  row(jsonb_build_array(tests.id('e:label:lead')), null, 'Window', '3')::text,
  'and Eli''s label, his section (a name typed for today) and his place in the order'
);
-- Ana takes Cem's place in turn: Cem's Undo would leave two in one place (the review of 051577fd2).
select pg_temp.edit(tests.user('e:mia'), jsonb_build_object('action', 'call_off', 'row',
  jsonb_build_object('row_id', (select r ->> 'id' from pg_temp.row_of('ana') r))));
select is(
  pg_temp.refusal(format($$select pg_temp.edit(%L, jsonb_build_object('action', 'replace', 'row', jsonb_build_object('row_id', %L),
    'person', jsonb_build_object('employee_id', %L)))$$,
    tests.user('e:mia'), (select r ->> 'id' from pg_temp.row_of('cem') r), tests.id('e:ana'))),
  '22023:lineup.already_on', 'a person called off here doesn''t take a place either'
);
select pg_temp.edit(tests.user('e:mia'), jsonb_build_object('action', 'replace',
  'row', jsonb_build_object('row_id', (select r ->> 'id' from pg_temp.row_of('cem') r)),
  'person', jsonb_build_object('employee_id', tests.id('e:gus'))));
select is(
  pg_temp.refusal(format($$select pg_temp.edit(%L, jsonb_build_object('action', 'undo_replace', 'row', jsonb_build_object('row_id', %L)))$$,
    tests.user('e:mia'), (select r ->> 'id' from pg_temp.row_of('cem') r))),
  '22023:lineup.row_out', 'Undo goes back the way it came: Gus''s first, then Cem''s'
);
select pg_temp.edit(tests.user('e:mia'), jsonb_build_object('action', 'undo_replace', 'row',
  jsonb_build_object('row_id', (select r ->> 'id' from pg_temp.row_of('gus') r))));
select is(
  pg_temp.refusal(format($$select pg_temp.edit(%L, jsonb_build_object('action', 'replace', 'row', jsonb_build_object('source_shift_id', %L),
    'person', jsonb_build_object('employee_id', %L)))$$,
    tests.user('e:mia'), (select value from fixture where key = 'eli_source'), tests.id('e:hal'))),
  '22023:lineup.row_out', 'a place taken is not taken twice'
);
select pg_temp.edit(tests.user('e:mia'), jsonb_build_object('action', 'undo_replace', 'row',
  jsonb_build_object('row_id', (select r ->> 'id' from pg_temp.row_of('cem') r))));
select is(
  (select row((select r ->> 'replaced_by_row_id' from pg_temp.row_of('eli') r),
     (select count(*) from pg_temp.lunch_rows() r where r ->> 'employee_id' = tests.id('e:cem')::text))::text),
  row(null, 0)::text, 'Undo: Eli is back in his place, Cem off the lineup'
);
select is(
  pg_temp.refusal(format($$select pg_temp.edit(%L, jsonb_build_object('action', 'undo_replace', 'row', jsonb_build_object('row_id', %L)))$$,
    tests.user('e:mia'), (select r ->> 'id' from pg_temp.row_of('ana') r))),
  '22023:lineup.not_replacing', 'Undo needs a place taken'
);

-- Who may change who is on it: another location's manager is out of scope here too.
select is(
  pg_temp.refusal(format($$select pg_temp.edit(%L, jsonb_build_object('action', 'call_off', 'row', jsonb_build_object('source_shift_id', %L)))$$,
    tests.user('e:bo'), (select value from fixture where key = 'eli_source'))),
  '42501:authz.out_of_scope', 'another location''s manager calls nobody off here'
);

-- 7. The lock is the edit's: a published lineup changes after Edit only.
select public.lineup_command_service(tests.user('e:mia'), tests.id('e'), gen_random_uuid(), 'share', jsonb_build_object(
  'lineups', jsonb_build_array(jsonb_build_object('location_id', tests.id('e:K'), 'service_date', tests.week(0),
    'shift_type_id', tests.id('e:type:lunch'))), 'ask_ack', false));
select is(
  pg_temp.refusal(format($$select pg_temp.edit(%L, jsonb_build_object('action', 'call_off', 'row', jsonb_build_object('source_shift_id', %L)))$$,
    tests.user('e:mia'), (select value from fixture where key = 'eli_source'))),
  '22023:lineup.live', 'a published lineup is locked'
);

-- 8. The candidates' read is the server's only.
select ok(
  not has_function_privilege('anon', 'public.get_lineup_candidates_service(uuid, uuid, jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.get_lineup_candidates_service(uuid, uuid, jsonb)', 'execute')
    and has_function_privilege('service_role', 'public.get_lineup_candidates_service(uuid, uuid, jsonb)', 'execute'),
  'only the API reads the candidates'
);
select ok(
  not has_function_privilege('anon', 'app_private.lineup_staff_eligible(uuid, uuid, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'app_private.lineup_staff_eligible(uuid, uuid, uuid)', 'execute'),
  'and nobody calls the eligibility rule from outside'
);

select * from finish();
rollback;

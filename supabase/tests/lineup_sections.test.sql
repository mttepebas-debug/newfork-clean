begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

-- LINEUP-EDIT L2b (KARARLAR S-178 madde 4 and ek 3; Mert 2026-10-20 ~00:40 AM PT): a location's sections are added,
-- renamed, ordered and removed (the Sections window); a row takes one of them or a name typed in that lineup only
-- ("Other…"), which "Save to sections" adds to the location's sections. A section removed leaves the draft rows of
-- today and later that had it with none (Mert: "Satırdan da silinsin"); a published lineup keeps it, as its
-- employees see it, until Edit takes it back (Mert: "Edit'e kadar kalsın"); a day that is over keeps its rows. Who
-- may: lineup.share, by location.

select tests.world('e');
select tests.world('ex');
select tests.person('e', 'mia', 'manager', array['K'], array['cook']);
select tests.person('e', 'bo', 'manager', array['B'], array['cook']);
select tests.person('e', 'eli', 'employee', array['K'], array['cook']);
select tests.person('e', 'ana', 'employee', array['K'], array['cook']);
select tests.person('ex', 'xan', 'manager', array['K'], array['cook']);

insert into public.shift_types (id, workspace_id, name, color, default_start_time, default_end_time)
values (tests.remember('e:type:lunch', gen_random_uuid()), tests.id('e'), 'Lunch', '#1F9D74', '09:00', '15:00');
insert into public.location_sections (id, workspace_id, location_id, name, sort_order)
values (tests.remember('e:section:patio', gen_random_uuid()), tests.id('e'), tests.id('e:K'), 'Patio', 1),
  (tests.remember('e:section:bar', gen_random_uuid()), tests.id('e'), tests.id('e:B'), 'Bar', 1);

select tests.publish_week('e', 0, jsonb_build_array(
  jsonb_build_object('label', 'eli-mon', 'person', 'eli', 'loc', 'K', 'job', 'cook', 'day', 0, 'start', '09:00', 'end', '15:00'),
  jsonb_build_object('label', 'ana-mon', 'person', 'ana', 'loc', 'K', 'job', 'cook', 'day', 0, 'start', '10:00', 'end', '15:00')
));
-- ponytail: the test editor has no shift type field; the published rows get theirs here.
update public.schedule_published_shifts set shift_type_id = tests.id('e:type:lunch')
where id in (tests.id('e:shift:eli-mon'), tests.id('e:shift:ana-mon'));

create temporary table fixture (key text primary key, value uuid);
insert into fixture values
  ('eli_source', (select source_shift_id from public.schedule_published_shifts where id = tests.id('e:shift:eli-mon'))),
  ('ana_source', (select source_shift_id from public.schedule_published_shifts where id = tests.id('e:shift:ana-mon')));

-- The Sections window at Kadikoy, as the API sends it.
create function pg_temp.sections(actor uuid, body jsonb, place uuid default null)
returns jsonb
language sql
as $$
  select public.lineup_sections_service(actor, tests.id('e'),
    jsonb_build_object('location_id', coalesce(place, tests.id('e:K'))) || body)
$$;
-- Its answer, as names in order.
create function pg_temp.names(answer jsonb)
returns text
language sql
as $$
  select string_agg(s ->> 'name', ',' order by o) from jsonb_array_elements(answer -> 'sections') with ordinality as x (s, o)
$$;
create function pg_temp.section(place uuid, title text)
returns uuid
language sql
as $$
  select s.id from public.location_sections s where s.location_id = place and s.name = title and s.archived_at is null
$$;
-- An edit of one row of the Lunch lineup at Kadikoy, Monday.
create function pg_temp.edit(actor uuid, source uuid, fields jsonb)
returns jsonb
language sql
as $$
  select public.lineup_edit_service(actor, tests.id('e'), gen_random_uuid(),
    jsonb_build_object('location_id', tests.id('e:K'), 'service_date', tests.week(0), 'shift_type_id', tests.id('e:type:lunch'),
      'action', 'set_row', 'row', jsonb_build_object('source_shift_id', source) || fields))
$$;
create function pg_temp.lunch_row(source uuid)
returns jsonb
language sql
as $$
  select r from jsonb_array_elements(
      public.get_lineup_day_service(tests.user('e:owner'), tests.id('e'), tests.week(0)) -> 'locations') l,
    jsonb_array_elements(l -> 'lineups') x, jsonb_array_elements(x -> 'rows') r
  where r ->> 'source_shift_id' = source::text
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
create function pg_temp.refused_by(statement text)
returns text
language plpgsql
as $$
declare
  state text;
  key text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics state = returned_sqlstate, key = constraint_name;
  return state || ' ' || coalesce(key, '');
end;
$$;

-- 1. Add: after the others; the same name again is the same section.
select is(
  pg_temp.names(pg_temp.sections(tests.user('e:mia'), jsonb_build_object('action', 'add', 'name', ' Terrace '))),
  'Patio,Terrace', 'the location''s manager adds a section, trimmed, after the others'
);
select pg_temp.sections(tests.user('e:mia'), jsonb_build_object('action', 'add', 'name', 'terrace'));
select is(
  (select count(*)::integer from public.location_sections s where s.location_id = tests.id('e:K') and s.archived_at is null
     and lower(s.name) = 'terrace'),
  1, 'the same name again adds nothing'
);
select is(
  pg_temp.refusal(format($$select pg_temp.sections(%L, jsonb_build_object('action', 'add', 'name', '  '))$$, tests.user('e:mia'))),
  '22023:lineup.invalid_section_name', 'a blank name is refused'
);
select is(
  pg_temp.refusal(format($$select pg_temp.sections(%L, jsonb_build_object('action', 'add', 'name', repeat('x', 41)))$$,
    tests.user('e:mia'))),
  '22023:lineup.invalid_section_name', 'a name over 40 characters is refused'
);

-- 2. Rename; never onto another section's name.
select is(
  pg_temp.names(pg_temp.sections(tests.user('e:mia'), jsonb_build_object('action', 'rename',
    'section_id', pg_temp.section(tests.id('e:K'), 'Terrace'), 'name', 'Garden'))),
  'Patio,Garden', 'a section is renamed in its place'
);
select is(
  pg_temp.refusal(format($$select pg_temp.sections(%L, jsonb_build_object('action', 'rename', 'section_id', %L, 'name', ' PATIO '))$$,
    tests.user('e:mia'), pg_temp.section(tests.id('e:K'), 'Garden'))),
  '22023:lineup.section_exists', 'a name another section has is refused'
);

-- 3. Reorder: every section of the location, once.
select is(
  pg_temp.names(pg_temp.sections(tests.user('e:mia'), jsonb_build_object('action', 'reorder', 'section_ids',
    jsonb_build_array(pg_temp.section(tests.id('e:K'), 'Garden'), tests.id('e:section:patio'))))),
  'Garden,Patio', 'the sections take the order sent'
);
select is(
  pg_temp.refusal(format($$select pg_temp.sections(%L, jsonb_build_object('action', 'reorder', 'section_ids', jsonb_build_array(%L)))$$,
    tests.user('e:mia'), pg_temp.section(tests.id('e:K'), 'Garden'))),
  '22023:lineup.invalid_section', 'an order that leaves a section out is refused'
);
select is(
  pg_temp.refusal(format($$select pg_temp.sections(%L, jsonb_build_object('action', 'reorder', 'section_ids', jsonb_build_array(%L, %L, %L)))$$,
    tests.user('e:mia'), pg_temp.section(tests.id('e:K'), 'Garden'), tests.id('e:section:patio'), tests.id('e:section:bar'))),
  '22023:lineup.invalid_section', 'an order with another location''s section is refused'
);

-- 4. Who may: the location's manager (above); not another location's manager, an employee or a stranger.
select is(
  pg_temp.refusal(format($$select pg_temp.sections(%L, jsonb_build_object('action', 'add', 'name', 'Deck'))$$, tests.user('e:bo'))),
  '42501:authz.out_of_scope', 'another location''s manager is out of scope'
);
select is(
  pg_temp.refusal(format($$select pg_temp.sections(%L, jsonb_build_object('action', 'add', 'name', 'Deck'))$$, tests.user('e:eli'))),
  '42501:authz.' || app_private.authz_reason(tests.user('e:eli'), tests.id('e'), 'lineup.share'), 'an employee gets the core''s reason'
);
select is(
  pg_temp.refusal(format($$select pg_temp.sections(%L, jsonb_build_object('action', 'add', 'name', 'Deck'))$$, tests.user('ex:xan'))),
  '42501:authz.not_member', 'another workspace''s manager is not a member here'
);
select is(
  pg_temp.refusal(format($$select pg_temp.sections(%L, jsonb_build_object('action', 'rename', 'section_id', %L, 'name', 'Lounge'))$$,
    tests.user('e:mia'), tests.id('e:section:bar'))),
  '42501:authz.out_of_scope', 'another location''s section, sent under this one, is out of reach'
);
select is(
  pg_temp.refusal(format($$select pg_temp.sections(%L, jsonb_build_object('action', 'rename', 'section_id', %L, 'name', 'Lounge'), %L)$$,
    tests.user('e:mia'), tests.id('e:section:bar'), tests.id('e:B'))),
  '42501:authz.out_of_scope', 'and under its own location, which is not hers'
);
select is(
  pg_temp.refusal(format($$select pg_temp.sections(%L, jsonb_build_object('action', 'shout'))$$, tests.user('e:mia'))),
  '22023:lineup.invalid_command', 'an unknown action is refused'
);

-- 5. "Other…": a name typed in this lineup only; the location's section of that name if it has one.
select lives_ok(
  format($$select pg_temp.edit(%L, %L, jsonb_build_object('section_name', ' Window '))$$,
    tests.user('e:mia'), (select value from fixture where key = 'eli_source')),
  'a name typed in the lineup'
);
select is(
  (select row(r ->> 'section_name', r ->> 'section_id')::text from pg_temp.lunch_row((select value from fixture where key = 'eli_source')) r),
  row('Window', null)::text, 'the day reads it, trimmed, with no section'
);
select is(
  pg_temp.names(pg_temp.sections(tests.user('e:mia'), jsonb_build_object('action', 'reorder', 'section_ids',
    jsonb_build_array(pg_temp.section(tests.id('e:K'), 'Garden'), tests.id('e:section:patio'))))),
  'Garden,Patio', 'and the location''s sections do not change'
);
select pg_temp.edit(tests.user('e:mia'), (select value from fixture where key = 'eli_source'), jsonb_build_object('section_name', 'garden'));
select is(
  (select row(r ->> 'section_name', r ->> 'section_id')::text from pg_temp.lunch_row((select value from fixture where key = 'eli_source')) r),
  row('Garden', pg_temp.section(tests.id('e:K'), 'Garden'))::text, 'a name the location has is its section'
);
select pg_temp.edit(tests.user('e:mia'), (select value from fixture where key = 'eli_source'), jsonb_build_object('section_name', 'Deck', 'save_section', true));
select is(
  (select row(r ->> 'section_name', (r ->> 'section_id')::uuid = pg_temp.section(tests.id('e:K'), 'Deck'))::text
   from pg_temp.lunch_row((select value from fixture where key = 'eli_source')) r),
  row('Deck', true)::text, 'Save to sections adds it to the location''s sections, and the row has it'
);
select is(
  pg_temp.refusal(format($$select pg_temp.edit(%L, %L, jsonb_build_object('section_id', %L, 'section_name', 'Window'))$$,
    tests.user('e:mia'), (select value from fixture where key = 'eli_source'), tests.id('e:section:patio'))),
  '22023:lineup.invalid_section', 'a section and a typed name together are refused'
);
select is(
  pg_temp.refusal(format($$select pg_temp.edit(%L, %L, jsonb_build_object('section_name', repeat('x', 41)))$$,
    tests.user('e:mia'), (select value from fixture where key = 'eli_source'))),
  '22023:lineup.invalid_section_name', 'a typed name over 40 characters is refused'
);
select is(
  pg_temp.refusal(format($$select pg_temp.edit(%L, %L, jsonb_build_object('section_name', 'Window', 'save_section', 'yes'))$$,
    tests.user('e:mia'), (select value from fixture where key = 'eli_source'))),
  '22023:lineup.invalid_command', 'Save to sections is yes or no'
);
select pg_temp.edit(tests.user('e:mia'), (select value from fixture where key = 'eli_source'), jsonb_build_object('section_name', 'Window'));
select pg_temp.edit(tests.user('e:mia'), (select value from fixture where key = 'eli_source'), jsonb_build_object('section_id', tests.id('e:section:patio')));
select is(
  (select row(r.section_id, r.section_name)::text from public.daily_lineup_rows r
   where r.source_shift_id = (select value from fixture where key = 'eli_source')),
  row(tests.id('e:section:patio'), null)::text, 'choosing a section drops the typed name'
);
select pg_temp.edit(tests.user('e:mia'), (select value from fixture where key = 'eli_source'), jsonb_build_object('section_name', null));
select is(
  (select row(r.section_id, r.section_name)::text from public.daily_lineup_rows r
   where r.source_shift_id = (select value from fixture where key = 'eli_source')),
  row(null, null)::text, 'no typed name: no section either'
);
select is(
  pg_temp.refused_by(format($$update public.daily_lineup_rows set section_id = %L, section_name = 'Window' where source_shift_id = %L$$,
    tests.id('e:section:patio'), (select value from fixture where key = 'eli_source'))),
  '23514 daily_lineup_rows_one_section', 'a row never has both'
);

-- 6. Remove. Eli is on Patio, Ana on "Window"; the lineup is published; a day that is over had Patio too, and
-- Tuesday's draft has Eli on Deck.
select pg_temp.edit(tests.user('e:mia'), (select value from fixture where key = 'eli_source'),
  jsonb_build_object('section_id', tests.id('e:section:patio')));
select pg_temp.edit(tests.user('e:mia'), (select value from fixture where key = 'ana_source'),
  jsonb_build_object('section_name', 'Window'));
select public.lineup_command_service(tests.user('e:mia'), tests.id('e'), gen_random_uuid(), 'share', jsonb_build_object(
  'lineups', jsonb_build_array(jsonb_build_object('location_id', tests.id('e:K'), 'service_date', tests.week(0),
    'shift_type_id', tests.id('e:type:lunch'))), 'ask_ack', true));
insert into public.daily_lineups (id, workspace_id, location_id, service_date, shift_type_id)
values (tests.remember('e:lineup:past', gen_random_uuid()), tests.id('e'), tests.id('e:K'), current_date - 2, tests.id('e:type:lunch'));
insert into public.daily_lineup_rows (id, workspace_id, lineup_id, location_id, service_date, employee_id, job_id, starts, ends, section_id)
values (tests.remember('e:row:past', gen_random_uuid()), tests.id('e'), tests.id('e:lineup:past'), tests.id('e:K'), current_date - 2,
  tests.id('e:eli'), tests.id('e:job:cook'), '09:00', '15:00', tests.id('e:section:patio'));
insert into public.daily_lineups (id, workspace_id, location_id, service_date, shift_type_id)
values (tests.remember('e:lineup:tue', gen_random_uuid()), tests.id('e'), tests.id('e:K'), tests.week(0) + 1, tests.id('e:type:lunch'));
insert into public.daily_lineup_rows (id, workspace_id, lineup_id, location_id, service_date, employee_id, job_id, starts, ends, section_id)
values (tests.remember('e:row:tue', gen_random_uuid()), tests.id('e'), tests.id('e:lineup:tue'), tests.id('e:K'), tests.week(0) + 1,
  tests.id('e:eli'), tests.id('e:job:cook'), '09:00', '15:00', pg_temp.section(tests.id('e:K'), 'Deck'));

select is(
  (select section_name from jsonb_array_elements(public.get_my_lineups_service(tests.user('e:ana'), tests.id('e'), tests.week(0)) -> 'lineups') x,
     jsonb_to_recordset(x -> 'mine') m (section_name text)),
  'Window', 'the employee reads the typed name on her published lineup'
);
select is(
  pg_temp.names(pg_temp.sections(tests.user('e:mia'), jsonb_build_object('action', 'remove', 'section_id', tests.id('e:section:patio')))),
  'Garden,Deck', 'a section removed leaves the list'
);
select is(
  (select r.section_id from public.daily_lineup_rows r where r.source_shift_id = (select value from fixture where key = 'eli_source')),
  tests.id('e:section:patio'), 'the published lineup''s row keeps it until Edit'
);
select is(
  (select section_name from jsonb_array_elements(public.get_my_lineups_service(tests.user('e:eli'), tests.id('e'), tests.week(0)) -> 'lineups') x,
     jsonb_to_recordset(x -> 'mine') m (section_name text)),
  'Patio', 'and Eli still reads Patio on his phone'
);
select is(
  (select r.section_id from public.daily_lineup_rows r where r.id = tests.id('e:row:past')),
  tests.id('e:section:patio'), 'a day that is over keeps its rows'
);
select is(
  pg_temp.names(pg_temp.sections(tests.user('e:mia'), jsonb_build_object('action', 'remove', 'section_id', tests.id('e:section:patio')))),
  'Garden,Deck', 'removing it again answers the same'
);
select is(
  pg_temp.refusal(format($$select pg_temp.sections(%L, jsonb_build_object('action', 'rename', 'section_id', %L, 'name', 'Patio 2'))$$,
    tests.user('e:mia'), tests.id('e:section:patio'))),
  '42501:authz.out_of_scope', 'a removed section is out of reach'
);
select public.lineup_command_service(tests.user('e:mia'), tests.id('e'), gen_random_uuid(), 'unpublish', jsonb_build_object(
  'lineups', jsonb_build_array(jsonb_build_object('location_id', tests.id('e:K'), 'service_date', tests.week(0),
    'shift_type_id', tests.id('e:type:lunch')))));
select is(
  (select r ->> 'section_name' from pg_temp.lunch_row((select value from fixture where key = 'eli_source')) r),
  null, 'taken back with Edit, the draft reads Eli with no section'
);
select is(
  (select r.section_id from public.daily_lineup_rows r where r.source_shift_id = (select value from fixture where key = 'eli_source')),
  null, 'and his row has none'
);
select is(
  pg_temp.refusal(format($$select pg_temp.edit(%L, %L, jsonb_build_object('section_id', %L))$$,
    tests.user('e:mia'), (select value from fixture where key = 'eli_source'), tests.id('e:section:patio'))),
  '22023:lineup.invalid_section', 'a removed section is not chosen again'
);
create temporary table tuesday_before as select d.revision from public.daily_lineups d where d.id = tests.id('e:lineup:tue');
select is(
  pg_temp.names(pg_temp.sections(tests.user('e:mia'), jsonb_build_object('action', 'remove',
    'section_id', pg_temp.section(tests.id('e:K'), 'Deck')))),
  'Garden', 'Deck is removed too'
);
select is(
  (select r.section_id from public.daily_lineup_rows r where r.id = tests.id('e:row:tue')),
  null, 'and a draft''s row, on a day to come, has none at once'
);
select is(
  (select d.revision from public.daily_lineups d where d.id = tests.id('e:lineup:tue')),
  (select revision + 1 from tuesday_before), 'and that draft''s revision moves on'
);

-- 7. A lineup taken back with Edit is a draft: Eli on Garden there, Garden removed, his row has none at once.
select pg_temp.edit(tests.user('e:mia'), (select value from fixture where key = 'eli_source'), jsonb_build_object('section_id', pg_temp.section(tests.id('e:K'), 'Garden')));
select is(
  coalesce(pg_temp.names(pg_temp.sections(tests.user('e:mia'), jsonb_build_object('action', 'remove',
    'section_id', pg_temp.section(tests.id('e:K'), 'Garden')))), ''),
  '', 'Garden is removed: no sections are left'
);
select is(
  (select r.section_id from public.daily_lineup_rows r where r.source_shift_id = (select value from fixture where key = 'eli_source')),
  null, 'on a lineup taken back with Edit, the row has none at once'
);

-- 8. A typed name: a removed section's name is only a name; a person added in the lineup takes one too.
select pg_temp.edit(tests.user('e:mia'), (select value from fixture where key = 'eli_source'), jsonb_build_object('section_name', 'Patio'));
select is(
  (select row(r.section_id, r.section_name)::text from public.daily_lineup_rows r where r.source_shift_id = (select value from fixture where key = 'eli_source')),
  row(null, 'Patio')::text, 'a removed section''s name, typed, stays a typed name'
);
select public.lineup_edit_service(tests.user('e:mia'), tests.id('e'), gen_random_uuid(), jsonb_build_object(
  'location_id', tests.id('e:K'), 'service_date', tests.week(0) + 1, 'shift_type_id', tests.id('e:type:lunch'),
  'action', 'set_row', 'row', jsonb_build_object('row_id', tests.id('e:row:tue'), 'section_name', 'Booth')));
select is(
  (select row(r.section_id, r.section_name)::text from public.daily_lineup_rows r where r.id = tests.id('e:row:tue')),
  row(null, 'Booth')::text, 'a person added in the lineup takes a typed name'
);

-- 9. The service is the server's only.
select ok(
  not has_function_privilege('anon', 'public.lineup_sections_service(uuid, uuid, jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.lineup_sections_service(uuid, uuid, jsonb)', 'execute')
    and has_function_privilege('service_role', 'public.lineup_sections_service(uuid, uuid, jsonb)', 'execute'),
  'only the API calls the sections service'
);

select * from finish();
rollback;

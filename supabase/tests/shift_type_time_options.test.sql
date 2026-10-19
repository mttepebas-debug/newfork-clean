begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

-- A shift type's time options (PRESET-SAAT, KARARLAR S-183). Besides its
-- primary hours (default_start_time / default_end_time, unchanged) a type keeps
-- up to 8 more pairs in shift_types.time_options. A preset dropped on the
-- Schedule offers the primary first, then these. Example: Dinner 4:15 PM –
-- 11:30 PM is primary; 5:00 – 11:00 PM and 6:00 – 11:30 PM are its options.
-- The list is checked on every write (valid HH:MM, start <> end, no repeats,
-- none equal to the primary; every type has primary hours) and stored as
-- HH:MM. Whoever may edit the catalog may change it from the browser, like
-- the type's other details; the Schedule read model and the Settings list
-- return it.

select tests.world('to');
select tests.world('tx');
select tests.person('to', 'mona', 'manager', array['K'], array['cook']);

create function pg_temp.browser_refusal(actor uuid, statement text) returns text
language plpgsql as $$
declare state text; hint text;
begin
  perform tests.as_browser(actor, statement);
  return 'allowed';
exception when others then
  get stacked diagnostics state = returned_sqlstate, hint = pg_exception_hint;
  return state || coalesce(' ' || nullif(hint, ''), '');
end;
$$;
grant execute on function pg_temp.browser_refusal(uuid, text) to public;

create temporary table ids as
select tests.user('to:owner') as owner, tests.user('to:mona') as mona, tests.user('tx:owner') as outsider,
       tests.id('to') as ws, tests.id('tx') as other_ws;
grant select on ids to public;

insert into public.shift_types (id, workspace_id, name, color, default_start_time, default_end_time)
select '7a000000-0000-4000-8000-000000000001', ws, 'Dinner', '#7c3aed', '16:15', '23:30' from ids;

create function pg_temp.options(target uuid) returns jsonb language sql as $$
  select t.time_options from public.shift_types t where t.id = target
$$;
grant execute on function pg_temp.options(uuid) to public;

-- The column: a list, never missing, empty by default.
select col_not_null('public', 'shift_types', 'time_options', 'every shift type has a time option list');
select col_type_is('public', 'shift_types', 'time_options', 'jsonb', 'the list is jsonb');
select is(pg_temp.options('7a000000-0000-4000-8000-000000000001'), '[]'::jsonb, 'a new type has no extra options');

-- The owner saves two options from the browser; they come back as HH:MM.
select is(
  pg_temp.browser_refusal((select owner from ids), $$update public.shift_types
    set time_options = '[{"start_time":"17:00:00","end_time":"23:00"},{"start_time":"18:00","end_time":"23:30"}]'
    where id = '7a000000-0000-4000-8000-000000000001'$$),
  'allowed', 'the owner saves time options from the browser');
select is(pg_temp.options('7a000000-0000-4000-8000-000000000001'),
  '[{"start_time":"17:00","end_time":"23:00"},{"start_time":"18:00","end_time":"23:30"}]'::jsonb,
  'options are stored as HH:MM in their order');

-- Refused lists.
select is(pg_temp.browser_refusal((select owner from ids), $$update public.shift_types
    set time_options = '[{"start_time":"17:00","end_time":"17:00"}]' where id = '7a000000-0000-4000-8000-000000000001'$$),
  '22023 shift_type.time_options_invalid', 'an option starting and ending at the same time is refused');
select is(pg_temp.browser_refusal((select owner from ids), $$update public.shift_types
    set time_options = '[{"start_time":"17:00","end_time":"23:00"},{"start_time":"17:00","end_time":"23:00"}]' where id = '7a000000-0000-4000-8000-000000000001'$$),
  '22023 shift_type.time_options_invalid', 'the same option twice is refused');
select is(pg_temp.browser_refusal((select owner from ids), $$update public.shift_types
    set time_options = '[{"start_time":"16:15","end_time":"23:30"}]' where id = '7a000000-0000-4000-8000-000000000001'$$),
  '22023 shift_type.time_options_invalid', 'an option equal to the primary hours is refused');
select is(pg_temp.browser_refusal((select owner from ids), $$update public.shift_types
    set time_options = '[{"start_time":"25:00","end_time":"23:00"}]' where id = '7a000000-0000-4000-8000-000000000001'$$),
  '22023 shift_type.time_options_invalid', 'an impossible time is refused');
select is(pg_temp.browser_refusal((select owner from ids), $$update public.shift_types
    set time_options = '{"start_time":"17:00","end_time":"23:00"}' where id = '7a000000-0000-4000-8000-000000000001'$$),
  '22023 shift_type.time_options_invalid', 'a list that is not an array is refused');
select is(pg_temp.browser_refusal((select owner from ids), $$update public.shift_types
    set time_options = '[{"start_time":"17:00","end_time":"23:00","note":"x"}]' where id = '7a000000-0000-4000-8000-000000000001'$$),
  '22023 shift_type.time_options_invalid', 'an option with other fields is refused');
select is(pg_temp.browser_refusal((select owner from ids), format($$update public.shift_types
    set time_options = %L where id = '7a000000-0000-4000-8000-000000000001'$$,
    (select jsonb_agg(jsonb_build_object('start_time', to_char(time '08:00' + make_interval(mins => n * 15), 'HH24:MI'), 'end_time', '23:45'))
     from generate_series(0, 8) n)::text)),
  '22023 shift_type.time_options_invalid', 'nine more options are refused');
-- Making an option primary swaps it with the primary hours in one update and
-- raises the default revision, as any change of the primary hours does.
select is(pg_temp.browser_refusal((select owner from ids), $$update public.shift_types
    set default_start_time = '17:00', default_end_time = '23:00',
        time_options = '[{"start_time":"16:15","end_time":"23:30"},{"start_time":"18:00","end_time":"23:30"}]'
    where id = '7a000000-0000-4000-8000-000000000001'$$),
  'allowed', 'an option becomes primary and the old primary an option in one update');
select is((select default_revision from public.shift_types where id = '7a000000-0000-4000-8000-000000000001'), 2,
  'the new primary hours raise the default revision');

-- Moving only the primary hours onto an option is refused too, and a new type
-- may be opened with its options, checked the same way.
select is(pg_temp.browser_refusal((select owner from ids), $$update public.shift_types
    set default_start_time = '18:00', default_end_time = '23:30'
    where id = '7a000000-0000-4000-8000-000000000001'$$),
  '22023 shift_type.time_options_invalid', 'primary hours moved onto an existing option are refused');
select is(pg_temp.browser_refusal((select owner from ids), $$insert into public.shift_types (workspace_id, name, color, default_start_time, default_end_time, time_options)
    select workspace_id, 'Brunch', '#d97706', '10:00', '14:00', '[{"start_time":"11:00:00","end_time":"15:00"}]'::jsonb
    from public.shift_types where id = '7a000000-0000-4000-8000-000000000001'$$),
  'allowed', 'a new type is opened with its options');
select is((select time_options from public.shift_types where name = 'Brunch' and workspace_id = (select ws from ids)),
  '[{"start_time":"11:00","end_time":"15:00"}]'::jsonb, 'a new type''s options are stored as HH:MM');
select is(pg_temp.browser_refusal((select owner from ids), $$insert into public.shift_types (workspace_id, name, color, default_start_time, default_end_time, time_options)
    select workspace_id, 'Late Brunch', '#d97706', '10:00', '14:00', '[{"start_time":"10:00","end_time":"14:00"}]'::jsonb
    from public.shift_types where id = '7a000000-0000-4000-8000-000000000001'$$),
  '22023 shift_type.time_options_invalid', 'a new type whose option repeats its primary is refused');

-- A manager without catalog rights changes nothing; another workspace sees nothing.
select is(tests.as_browser((select mona from ids), $$update public.shift_types set time_options = '[]'
    where id = '7a000000-0000-4000-8000-000000000001'$$), 0, 'a manager without catalog rights updates no row');
select is(tests.as_browser((select outsider from ids), $$update public.shift_types set time_options = '[]'
    where id = '7a000000-0000-4000-8000-000000000001'$$), 0, 'an owner of another workspace updates no row');
select is(pg_temp.options('7a000000-0000-4000-8000-000000000001'),
  '[{"start_time":"16:15","end_time":"23:30"},{"start_time":"18:00","end_time":"23:30"}]'::jsonb,
  'the refused updates left the list as it was');

-- The readers return it.
select is(
  (select t->'time_options' from jsonb_array_elements(public.get_schedule_read_model_service((select owner from ids), (select ws from ids), current_date)->'shift_types') t
   where t->>'id' = '7a000000-0000-4000-8000-000000000001'),
  '[{"start_time":"16:15","end_time":"23:30"},{"start_time":"18:00","end_time":"23:30"}]'::jsonb,
  'the Schedule read model carries the options');
select is(
  (select t->'time_options' from jsonb_array_elements(public.list_settings_shift_types_service((select owner from ids), (select ws from ids))) t
   where t->>'id' = '7a000000-0000-4000-8000-000000000001'),
  '[{"start_time":"16:15","end_time":"23:30"},{"start_time":"18:00","end_time":"23:30"}]'::jsonb,
  'the Settings list carries the options');

select * from finish();
rollback;

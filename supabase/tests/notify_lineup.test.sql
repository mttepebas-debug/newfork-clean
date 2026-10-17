begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- LINEUP-PUBLISH (KARARLAR "Lineup yayını öne alındı", 2026-10-17; Line-up PLAN §9): publishing tells the
-- people on the lineup, once each per share however many lineups it published (lineup.shared); the manager who
-- published hears nothing, nor anyone not on it. The same command sent again and an unpublish tell nobody.
-- The lineup work outlives a notice that fails.
-- ponytail: a share's event key is its transaction's, and this file is one transaction, so each share that
-- should tell somebody happens in its own world (nl: one lineup; nm: two in one share).

create function pg_temp.world(w text) returns void language plpgsql as $$
begin
  perform tests.world(w);
  perform tests.person(w, 'mia', 'manager', array['K'], array['cook']);
  perform tests.person(w, 'eli', 'employee', array['K'], array['cook']);
  perform tests.person(w, 'ida', 'employee', array['K'], array['cook']);
  perform tests.person(w, 'bo', 'employee', array['B'], array['server']);
  insert into public.shift_types (id, workspace_id, name, color, default_start_time, default_end_time)
  values (tests.remember(w || ':type:dinner', gen_random_uuid()), tests.id(w), 'Dinner', '#1F9D74', '16:00', '22:00'),
         (tests.remember(w || ':type:lunch', gen_random_uuid()), tests.id(w), 'Lunch', '#1F6F9D', '10:00', '15:00');
  perform tests.publish_week(w, 0, jsonb_build_array(
    jsonb_build_object('label', 'eli-din', 'person', 'eli', 'loc', 'K', 'job', 'cook', 'day', 0, 'start', '16:00', 'end', '22:00'),
    jsonb_build_object('label', 'ida-din', 'person', 'ida', 'loc', 'K', 'job', 'cook', 'day', 0, 'start', '17:00', 'end', '22:00'),
    jsonb_build_object('label', 'ida-lun', 'person', 'ida', 'loc', 'K', 'job', 'cook', 'day', 0, 'start', '10:00', 'end', '14:00'),
    jsonb_build_object('label', 'bo-mon', 'person', 'bo', 'loc', 'B', 'job', 'server', 'day', 0, 'start', '16:00', 'end', '22:00')
  ));
end $$;
select pg_temp.world('nl');
select pg_temp.world('nm');
-- ponytail: the test editor has no shift type field; the published rows get theirs here (a label remembered
-- inside a function is read outside it).
update public.schedule_published_shifts set shift_type_id = tests.id(w || ':type:dinner')
from unnest(array['nl', 'nm']) w
where id in (tests.id(w || ':shift:eli-din'), tests.id(w || ':shift:ida-din'));
update public.schedule_published_shifts set shift_type_id = tests.id(w || ':type:lunch')
from unnest(array['nl', 'nm']) w
where id = tests.id(w || ':shift:ida-lun');

create function pg_temp.lineup(w text, type_label text) returns jsonb language sql as $$
  select jsonb_build_object('location_id', tests.id(w || ':K'), 'service_date', tests.week(0),
    'shift_type_id', tests.id(w || ':type:' || type_label))
$$;
create function pg_temp.run(w text, command uuid, kind text, lineups jsonb, ask boolean default true) returns jsonb language sql as $$
  select public.lineup_command_service(tests.user(w || ':mia'), tests.id(w), command, kind,
    jsonb_build_object('lineups', lineups, 'ask_ack', ask))
$$;
create function pg_temp.told(who text) returns text[] language sql as $$
  select coalesce(array_agg(n.title order by n.title), '{}') from public.person_notifications n
  where n.workspace_id = tests.id(split_part(who, ':', 1)) and n.user_id = tests.user(who) and n.type_key = 'lineup.shared'
$$;
create temporary table command_ids (label text primary key, id uuid not null default gen_random_uuid());
insert into command_ids (label) values ('dinner'), ('down'), ('both'), ('broken');
create function pg_temp.cmd(label text) returns uuid language sql as $$ select id from command_ids where command_ids.label = cmd.label $$;

-- (a) One lineup published, asking to acknowledge: everybody on it hears it once; nobody else.
select pg_temp.run('nl', pg_temp.cmd('dinner'), 'share', jsonb_build_array(pg_temp.lineup('nl', 'dinner')));
select is(pg_temp.told('nl:eli'), array['Your Dinner lineup is ready · please acknowledge'], '(a) Eli, on the dinner lineup, is told once');
select is(pg_temp.told('nl:ida'), array['Your Dinner lineup is ready · please acknowledge'], '(a) Ida too');
select is(pg_temp.told('nl:bo'), '{}'::text[], '(a) Bo, not on it, is not told');
select is(pg_temp.told('nl:mia'), '{}'::text[], '(a) Mia, who published it, is not told');
select is(
  (select row(n.url, n.actor_user_id, n.subject_type, n.data ->> 'ask_ack', n.data -> 'lineup_ids' ->> 0)::text
   from public.person_notifications n
   where n.workspace_id = tests.id('nl') and n.user_id = tests.user('nl:eli') and n.type_key = 'lineup.shared'),
  row('/app/employee-hub/schedule?view=day&date=' || to_char(tests.week(0), 'YYYY-MM-DD'), tests.user('nl:mia'), 'lineup_share',
      'true', (select d.id from public.daily_lineups d where d.workspace_id = tests.id('nl') and d.shift_type_id = tests.id('nl:type:dinner'))::text)::text,
  '(a) the notice opens her schedule on that day and names who published it and the lineup'
);

-- (b) The same command again tells nobody again; (c) unpublish tells nobody.
select pg_temp.run('nl', pg_temp.cmd('dinner'), 'share', jsonb_build_array(pg_temp.lineup('nl', 'dinner')));
select is(cardinality(pg_temp.told('nl:eli')), 1, '(b) the same command sent again tells nobody again');
select pg_temp.run('nl', pg_temp.cmd('down'), 'unpublish', jsonb_build_array(pg_temp.lineup('nl', 'dinner')));
select is(cardinality(pg_temp.told('nl:eli')) + cardinality(pg_temp.told('nl:ida')), 2, '(c) unpublishing tells nobody');

-- (d) Two lineups in one share, not asking: one notice each, about the day; Ida is on both and hears once.
select pg_temp.run('nm', pg_temp.cmd('both'), 'share', jsonb_build_array(pg_temp.lineup('nm', 'dinner'), pg_temp.lineup('nm', 'lunch')), false);
select is(pg_temp.told('nm:ida'), array['Your lineups for ' || to_char(tests.week(0), 'Dy, Mon FMDD') || ' are ready'],
  '(d) Ida, on both lineups, hears once about the day');
select is(pg_temp.told('nm:eli'), array['Your lineups for ' || to_char(tests.week(0), 'Dy, Mon FMDD') || ' are ready'],
  '(d) Eli too, without "please acknowledge"');
select is(pg_temp.told('nm:bo') || pg_temp.told('nm:mia'), '{}'::text[], '(d) nobody else');

-- Every notice is in its recipient's choices (BILDIRIM-12).
select is(tests.unlisted_notices(tests.id('nl')) || tests.unlisted_notices(tests.id('nm')), '{}'::text[],
  'every lineup notice is in its recipient''s choices');

-- (e) With the core's write down, publishing still publishes.
create temp table core_saved as select pg_get_functiondef(p.oid) def from pg_proc p
where p.pronamespace = 'app_private'::regnamespace and p.proname = 'notify_rows';
create or replace function app_private.notify_rows(target_workspace uuid, target_actor uuid, target_rows jsonb)
returns integer language plpgsql set search_path = '' as $$ begin raise exception 'notices are down'; end $$;
select lives_ok(format($$select pg_temp.run('nl', %L, 'share', jsonb_build_array(pg_temp.lineup('nl', 'dinner')))$$, pg_temp.cmd('broken')),
  '(e) publishing lives while notify_rows is down');
select is(
  (select row(d.latest_version, d.editing)::text from public.daily_lineups d
   where d.workspace_id = tests.id('nl') and d.shift_type_id = tests.id('nl:type:dinner')),
  row(2, false)::text, '(e) and the lineup is published again as version 2');
do $$ declare d text; begin for d in select def from core_saved loop execute d; end loop; end $$;

select * from finish();
rollback;

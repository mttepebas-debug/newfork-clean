begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Lineup publishing (LINEUP-PUBLISH; KARARLAR "Lineup yayını öne alındı", 2026-10-17; Line-up PLAN §6, §7,
-- §10): a manager publishes a day's lineup and takes it back (lineup_command_service, lineup.share behind
-- schedule.publish, at her locations only); the same command sent twice is done once. An employee reads the
-- published lineups she is on (get_my_lineups_service) as they are now, never a copy, and acknowledges them
-- (acknowledge_lineup_service). The manager's day says who published, when, and how many acknowledged.

select tests.world('p');
select tests.world('px');
select tests.person('p', 'mia', 'manager', array['K'], array['cook']);
select tests.person('p', 'eli', 'employee', array['K'], array['cook']);
select tests.person('p', 'ida', 'employee', array['K'], array['cook']);
select tests.person('p', 'bo', 'employee', array['B'], array['server']);
select tests.person('p', 'noa', 'employee', array['K'], array['cook']);
select tests.person('px', 'xan', 'manager', array['K'], array['cook']);

insert into public.shift_types (id, workspace_id, name, color, default_start_time, default_end_time)
values (tests.remember('p:type:dinner', gen_random_uuid()), tests.id('p'), 'Dinner', '#1F9D74', '16:00', '22:00');

select tests.publish_week('p', 0, jsonb_build_array(
  jsonb_build_object('label', 'eli-mon', 'person', 'eli', 'loc', 'K', 'job', 'cook', 'day', 0, 'start', '16:00', 'end', '22:00'),
  jsonb_build_object('label', 'open-mon', 'loc', 'K', 'job', 'cook', 'day', 0, 'start', '17:00', 'end', '22:00'),
  jsonb_build_object('label', 'bo-mon', 'person', 'bo', 'loc', 'B', 'job', 'server', 'day', 0, 'start', '16:00', 'end', '22:00')
));
-- ponytail: the test editor has no shift type field; the published rows get theirs here.
update public.schedule_published_shifts set shift_type_id = tests.id('p:type:dinner')
where id in (tests.id('p:shift:eli-mon'), tests.id('p:shift:open-mon'));

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
-- The dinner lineup at Kadikoy on a day of week 0, as one share payload.
create function pg_temp.dinner(on_day date default null, at_place uuid default null, ask boolean default true)
returns jsonb
language sql
as $$
  select jsonb_build_object('lineups', jsonb_build_array(jsonb_build_object(
    'location_id', coalesce(at_place, tests.id('p:K')), 'service_date', coalesce(on_day, tests.week(0)),
    'shift_type_id', tests.id('p:type:dinner'))), 'ask_ack', ask)
$$;
create function pg_temp.share(who text, command uuid, body jsonb, kind text default 'share')
returns jsonb
language sql
as $$
  select public.lineup_command_service(tests.user(who), tests.id(split_part(who, ':', 1)), command, kind, body)
$$;
create function pg_temp.dinner_day(who text default 'p:owner')
returns jsonb
language sql
as $$
  select x from jsonb_array_elements(public.get_lineup_day_service(tests.user(who), tests.id('p'), tests.week(0)) -> 'locations') l,
    jsonb_array_elements(l -> 'lineups') x
  where x ->> 'shift_type_id' = tests.id('p:type:dinner')::text
$$;
create function pg_temp.mine(who text, on_day date default null)
returns jsonb
language sql
as $$
  select public.get_my_lineups_service(tests.user(who), tests.id('p'), coalesce(on_day, tests.week(0))) -> 'lineups'
$$;
create temporary table command_ids (label text primary key, id uuid not null default gen_random_uuid());
insert into command_ids (label) values ('first'), ('second'), ('again'), ('down'), ('down-again'), ('up');
create function pg_temp.cmd(label text) returns uuid language sql as $$ select id from command_ids where command_ids.label = cmd.label $$;

-- 1. The core's actions: no new permission.
select is(
  array(select row(a.key, a.scope_class, a.effect, coalesce(a.permission_key, '-'))::text from app_private.authz_actions a
        where a.key in ('lineup.share', 'lineup.acknowledge') order by a.key),
  array[row('lineup.acknowledge', 'own', 'write', '-')::text, row('lineup.share', 'place', 'write', 'schedule.publish')::text],
  'lineup.share is a place write behind schedule.publish; lineup.acknowledge is one''s own'
);
select ok(
  (select c.relrowsecurity from pg_class c where c.oid = 'public.lineup_commands'::regclass)
  and not exists (select 1 from information_schema.role_table_grants g
                  where g.table_schema = 'public' and g.table_name = 'lineup_commands' and g.grantee in ('anon', 'authenticated')),
  'the command record has row level security and nothing for the browser'
);

-- 2. Before: a draft nobody sees.
select is((pg_temp.dinner_day() ->> 'status'), 'draft', 'the dinner lineup starts as a draft');
select is((pg_temp.dinner_day() -> 'published')::boolean, false, 'a draft is not published');
select is(jsonb_array_length(pg_temp.mine('p:eli')), 0, 'Eli sees no lineup before it is published');

-- 3. Mia publishes the dinner lineup at Kadikoy.
create temporary table first_share as select pg_temp.share('p:mia', pg_temp.cmd('first'), pg_temp.dinner()) as body;
select is((select body -> 'lineups' -> 0 ->> 'status' from first_share), 'shared', 'the share publishes the lineup');
select is((select (body -> 'lineups' -> 0 ->> 'version')::integer from first_share), 1, 'as version 1');
select is(
  (select row(d.latest_version, d.editing)::text from public.daily_lineups d
   where d.workspace_id = tests.id('p') and d.location_id = tests.id('p:K') and d.service_date = tests.week(0)
     and d.shift_type_id = tests.id('p:type:dinner')),
  row(1, false)::text, 'a lineup nobody had changed gets its header when it is published'
);
select is(
  (select row(v.shared_by, v.ask_ack, char_length(v.fingerprint), jsonb_array_length(v.snapshot -> 'rows'))::text
   from public.daily_lineup_versions v where v.id = (select (body -> 'lineups' -> 0 ->> 'version_id')::uuid from first_share)),
  row(tests.user('p:mia'), true, 64, 2)::text,
  'the version records who, whether it asks to acknowledge, and the rows as they were, with a fingerprint'
);

-- 4. The same command again: the same answer, nothing more. Another command under its id: refused.
select is(pg_temp.share('p:mia', pg_temp.cmd('first'), pg_temp.dinner()), (select body from first_share),
  'the same command id answers the same');
select is(
  (select count(*)::integer from public.daily_lineup_versions v
   join public.daily_lineups d on d.id = v.lineup_id
   where d.workspace_id = tests.id('p') and d.service_date = tests.week(0)),
  1, 'and records no second version');
select is(pg_temp.refusal(format('select pg_temp.share(%L, %L, pg_temp.dinner(null, null, false))', 'p:mia', pg_temp.cmd('first'))),
  '22023:lineup.command_reused', 'a command id used for another command is refused');
select is(pg_temp.share('p:mia', pg_temp.cmd('again'), pg_temp.dinner()) -> 'lineups' -> 0 ->> 'status', 'unchanged',
  'publishing a published lineup again changes nothing');

-- 5. The manager's day: published, by whom, when, how many are on it and have the app.
select is(
  (select row(x ->> 'status', x -> 'published', x ->> 'version', x ->> 'shared_by', x ->> 'shared_by_name',
              x -> 'ask_ack', x -> 'acknowledged', x -> 'people', x -> 'with_app')::text
   from pg_temp.dinner_day() x),
  row('shared', 'true'::jsonb, '1', tests.user('p:mia')::text,
      (select e.first_name || ' ' || e.last_name from public.employee_profiles e where e.id = tests.id('p:mia')),
      'true'::jsonb, '0'::jsonb, '1'::jsonb, '1'::jsonb)::text,
  'the day says it is published, its version, who published it, and none of the one person on it has acknowledged'
);
select ok((pg_temp.dinner_day() ->> 'shared_at') is not null and (pg_temp.dinner_day() ->> 'version_id') is not null,
  'with when it was published and the version employees see');

-- 6. Eli reads it: her row, the team, the notes. Bo, at Besiktas, does not.
select is(jsonb_array_length(pg_temp.mine('p:eli')), 1, 'Eli sees the published dinner lineup she is on');
select is(
  (select row(x -> 'location' ->> 'name', x ->> 'shift_type_name', x -> 'ask_ack', x -> 'acknowledged_at',
              jsonb_array_length(x -> 'mine'), x -> 'mine' -> 0 ->> 'start_time')::text
   from jsonb_array_elements(pg_temp.mine('p:eli')) x),
  row('Kadikoy', 'Dinner', 'true'::jsonb, 'null'::jsonb, 1, '16:00')::text,
  'with the location, the shift type, her own row, and that she has not acknowledged yet'
);
select is(
  (select jsonb_agg(t -> 'is_me') from jsonb_array_elements(pg_temp.mine('p:eli')) x, jsonb_array_elements(x -> 'team') t),
  '[true]'::jsonb, 'the team is the people on it (the open shift is nobody''s), her own row marked'
);
select ok((select x ? 'notes' from jsonb_array_elements(pg_temp.mine('p:eli')) x), 'and the notes');
select is(jsonb_array_length(pg_temp.mine('p:bo')), 0, 'Bo is not on it: he sees nothing (his own lineup is a draft)');
select is(jsonb_array_length(pg_temp.mine('p:ida')), 0, 'Ida works no shift that day: nothing');
select is(jsonb_array_length(pg_temp.mine('p:eli', tests.week(0) + 1)), 0, 'another day: nothing');

-- 7. Eli acknowledges; again is the same; the manager's count says so.
create temporary table eli_ack as
select public.acknowledge_lineup_service(tests.user('p:eli'), tests.id('p'), (pg_temp.dinner_day() ->> 'version_id')::uuid) as body;
select is((select body ->> 'status' from eli_ack), 'saved', 'Eli acknowledges the version she sees');
select is(public.acknowledge_lineup_service(tests.user('p:eli'), tests.id('p'), (pg_temp.dinner_day() ->> 'version_id')::uuid),
  (select body from eli_ack), 'acknowledging again answers the same');
select is(pg_temp.dinner_day() -> 'acknowledged', '1'::jsonb, 'the manager''s day counts her');
select is((select x ->> 'acknowledged_at' from jsonb_array_elements(pg_temp.mine('p:eli')) x),
  (select body ->> 'acknowledged_at' from eli_ack), 'and Eli''s read says when');
select is(pg_temp.refusal(format('select public.acknowledge_lineup_service(%L, %L, %L)',
    tests.user('p:bo'), tests.id('p'), pg_temp.dinner_day() ->> 'version_id')),
  '42501:authz.out_of_scope', 'Bo, not on it, cannot acknowledge it');
select is(pg_temp.refusal(format('select public.acknowledge_lineup_service(%L, %L, %L)',
    tests.user('p:bo'), tests.id('p'), gen_random_uuid())),
  '42501:authz.out_of_scope', 'an unknown version gets the very same answer');
select is(pg_temp.refusal(format('select public.acknowledge_lineup_service(%L, %L, %L)',
    tests.user('px:xan'), tests.id('p'), pg_temp.dinner_day() ->> 'version_id')),
  '42501:authz.not_member', 'another workspace''s manager is not a member here');

-- 7b. The manager's day says who read it and when, and who has no app (Mert 2026-10-17: the Read list).
create function pg_temp.dinner_row(who text) returns jsonb language sql as $$
  select r from jsonb_array_elements(pg_temp.dinner_day() -> 'rows') r where r ->> 'employee_id' = tests.id(who)::text
$$;
select is((select row(r -> 'has_app', r ->> 'acknowledged_at')::text from pg_temp.dinner_row('p:eli') r),
  row('true'::jsonb, (select body ->> 'acknowledged_at' from eli_ack))::text,
  'each row says the person has the app and when she acknowledged the version staff see');
select is((select row(r -> 'has_app', r -> 'acknowledged_at')::text from jsonb_array_elements(pg_temp.dinner_day() -> 'rows') r
           where r ->> 'employee_id' is null),
  row('false'::jsonb, 'null'::jsonb)::text, 'an open shift is nobody: no app, no acknowledgement');
-- Noa takes the open shift; she can no longer sign in here.
update public.schedule_published_shifts set employee_id = tests.id('p:noa') where id = tests.id('p:shift:open-mon');
update public.workspace_memberships set status = 'suspended' where workspace_id = tests.id('p') and user_id = tests.user('p:noa');
select is((select row(r -> 'has_app', r -> 'acknowledged_at')::text from pg_temp.dinner_row('p:noa') r),
  row('false'::jsonb, 'null'::jsonb)::text, 'someone without the app: no app, nothing acknowledged');
select is(row(pg_temp.dinner_day() -> 'people', pg_temp.dinner_day() -> 'with_app')::text, row('2'::jsonb, '1'::jsonb)::text,
  'the same reading as the count: two on it, one with the app');
update public.schedule_published_shifts set employee_id = null where id = tests.id('p:shift:open-mon');

-- 8. Who may publish: Mia only where she manages; no one else.
select is(pg_temp.refusal(format('select pg_temp.share(%L, gen_random_uuid(), pg_temp.dinner(null, %L))', 'p:mia', tests.id('p:B'))),
  '42501:authz.out_of_scope', 'Mia cannot publish at Besiktas, which she does not manage');
select is(pg_temp.refusal(format('select pg_temp.share(%L, gen_random_uuid(), pg_temp.dinner(null, %L))', 'p:mia', gen_random_uuid())),
  pg_temp.refusal(format('select pg_temp.share(%L, gen_random_uuid(), pg_temp.dinner(null, %L))', 'p:mia', tests.id('p:B'))),
  'an unknown location gets the very same answer');
select is(pg_temp.refusal(format('select pg_temp.share(%L, gen_random_uuid(), pg_temp.dinner(null, %L))', 'p:mia', tests.id('px:K'))),
  '42501:authz.out_of_scope', 'another workspace''s location too');
select is(pg_temp.refusal(format($$select public.lineup_command_service(%L, %L, gen_random_uuid(), 'share', pg_temp.dinner())$$,
    tests.user('px:xan'), tests.id('p'))),
  '42501:authz.not_member', 'another workspace''s manager is not a member here');
select is(pg_temp.refusal(format('select pg_temp.share(%L, gen_random_uuid(), pg_temp.dinner())', 'p:eli')),
  '42501:authz.' || app_private.authz_reason(tests.user('p:eli'), tests.id('p'), 'lineup.share', target_locations => array[tests.id('p:K')]),
  'an employee cannot publish: the core''s own reason');
select is(pg_temp.refusal(format($$select pg_temp.share(%L, gen_random_uuid(), jsonb_build_object('lineups', jsonb_build_array(
      jsonb_build_object('location_id', %L, 'service_date', %L, 'shift_type_id', %L)), 'ask_ack', true))$$,
    'p:mia', tests.id('p:K'), tests.week(0), gen_random_uuid())),
  '42501:authz.out_of_scope', 'an unknown shift type is an unknown lineup');
select is(pg_temp.refusal(format($$select pg_temp.share(%L, gen_random_uuid(), '{"lineups": []}')$$, 'p:mia')),
  '22023:lineup.invalid_command', 'a command with no lineup is refused');

-- 9. Not before the week is published, not a past day.
select is(pg_temp.refusal(format('select pg_temp.share(%L, gen_random_uuid(), pg_temp.dinner(%L))', 'p:mia', tests.week(1))),
  '22023:lineup.week_not_published', 'a day of a week whose Schedule is not published: publish the week first');
select is(pg_temp.refusal(format('select pg_temp.share(%L, gen_random_uuid(), pg_temp.dinner(%L))', 'p:mia', current_date - 2)),
  '22023:lineup.past_day', 'a past day (the location''s clock) is refused');
select is(pg_temp.refusal(format('select pg_temp.share(%L, gen_random_uuid(), pg_temp.dinner(%L), %L)', 'p:mia', tests.week(0) + 2, 'unpublish')),
  '22023:lineup.not_shared', 'a lineup never published cannot be unpublished');

-- One command is one day: its notice names that day (nf-guvenlik, LINEUP-PUBLISH).
select is(pg_temp.refusal(format($$select pg_temp.share(%L, gen_random_uuid(), jsonb_build_object('lineups', jsonb_build_array(
      jsonb_build_object('location_id', %L, 'service_date', %L, 'shift_type_id', %L),
      jsonb_build_object('location_id', %L, 'service_date', %L, 'shift_type_id', %L)), 'ask_ack', true))$$,
    'p:mia', tests.id('p:K'), tests.week(0), tests.id('p:type:dinner'), tests.id('p:K'), tests.week(0) + 1, tests.id('p:type:dinner'))),
  '22023:lineup.one_day', 'lineups of two days in one command are refused, not as a matter of reach');
select is(pg_temp.refusal(format($$select pg_temp.share(%L, gen_random_uuid(), jsonb_build_object('lineups', jsonb_build_array(
      jsonb_build_object('location_id', %L, 'service_date', %L, 'shift_type_id', %L),
      jsonb_build_object('location_id', %L, 'service_date', %L, 'shift_type_id', %L))), %L)$$,
    'p:mia', tests.id('p:K'), tests.week(0), tests.id('p:type:dinner'), tests.id('p:K'), tests.week(0) + 1, tests.id('p:type:dinner'),
    'unpublish')),
  '22023:lineup.one_day', 'an unpublish of two days too');

-- The employee's read and acknowledgement in another workspace: not a member there.
select is(pg_temp.refusal(format('select public.get_my_lineups_service(%L, %L, %L)', tests.user('px:xan'), tests.id('p'), tests.week(0))),
  '42501:authz.not_member', 'another workspace''s person does not read its lineups');

-- A published lineup whose shift type is deleted since: its manager still takes it back; it is not published again.
insert into public.shift_types (id, workspace_id, name, color, default_start_time, default_end_time)
values (tests.remember('p:type:late', gen_random_uuid()), tests.id('p'), 'Late', '#9D1F74', '22:00', '23:30');
create function pg_temp.late(kind text default 'share') returns jsonb language sql as $$
  select pg_temp.share('p:mia', gen_random_uuid(), jsonb_build_object('lineups', jsonb_build_array(jsonb_build_object(
    'location_id', tests.id('p:K'), 'service_date', tests.week(0), 'shift_type_id', tests.id('p:type:late'))), 'ask_ack', true), kind)
$$;
select is(pg_temp.late() -> 'lineups' -> 0 ->> 'status', 'shared', 'the Late lineup is published');
update public.shift_types set archived_at = now(), deleted_at = now() where id = tests.id('p:type:late');
select is(pg_temp.late('unpublish') -> 'lineups' -> 0 ->> 'status', 'unpublished',
  'its shift type deleted, the manager still takes the published lineup back');
select is(pg_temp.refusal('select pg_temp.late()'), '42501:authz.out_of_scope',
  'a deleted shift type is not published again');

-- 10. Unpublish: employees no longer see it, nor acknowledge it; again is harmless.
select is(pg_temp.share('p:mia', pg_temp.cmd('down'), pg_temp.dinner(), 'unpublish') -> 'lineups' -> 0 ->> 'status', 'unpublished',
  'Mia takes the lineup back');
select is(row(pg_temp.dinner_day() ->> 'status', pg_temp.dinner_day() -> 'published')::text, row('editing', 'false'::jsonb)::text,
  'the manager''s day says it is back in her hands');
select is(jsonb_array_length(pg_temp.mine('p:eli')), 0, 'Eli no longer sees it');
select is(pg_temp.refusal(format('select public.acknowledge_lineup_service(%L, %L, %L)',
    tests.user('p:eli'), tests.id('p'), pg_temp.dinner_day() ->> 'version_id')),
  '42501:authz.out_of_scope', 'nor acknowledges it');
select is(pg_temp.share('p:mia', pg_temp.cmd('down-again'), pg_temp.dinner(), 'unpublish') -> 'lineups' -> 0 ->> 'status', 'unpublished',
  'unpublishing again is harmless');
select is(pg_temp.refusal(format('select pg_temp.share(%L, gen_random_uuid(), pg_temp.dinner(), %L)', 'p:eli', 'unpublish')),
  '42501:authz.' || app_private.authz_reason(tests.user('p:eli'), tests.id('p'), 'lineup.share', target_locations => array[tests.id('p:K')]),
  'an employee cannot unpublish');

-- 11. Published again: version 2, seen again, acknowledged afresh.
select is((pg_temp.share('p:mia', pg_temp.cmd('up'), pg_temp.dinner()) -> 'lineups' -> 0 ->> 'version')::integer, 2,
  'published again as version 2');
select is((select row(x ->> 'version', x -> 'acknowledged_at')::text from jsonb_array_elements(pg_temp.mine('p:eli')) x),
  row('2', 'null'::jsonb)::text, 'Eli sees it again, not yet acknowledged');
select is(pg_temp.dinner_day() -> 'acknowledged', '0'::jsonb, 'the new version''s count starts at none');
select is(pg_temp.dinner_row('p:eli') -> 'acknowledged_at', 'null'::jsonb,
  'and Eli''s row no longer shows the old version''s acknowledgement');

-- 12. Live: the Schedule gives Eli's shift to Ida after publishing; the published lineup shows Ida at once.
update public.schedule_published_shifts set employee_id = tests.id('p:ida') where id = tests.id('p:shift:eli-mon');
select is(jsonb_array_length(pg_temp.mine('p:ida')), 1, 'Ida, now on the shift, sees the published lineup');
select is(jsonb_array_length(pg_temp.mine('p:eli')), 0, 'Eli, off it, no longer does');
select is((select x -> 'mine' -> 0 ->> 'start_time' from jsonb_array_elements(pg_temp.mine('p:ida')) x), '16:00',
  'with the shift as it is now');
select is(public.acknowledge_lineup_service(tests.user('p:ida'), tests.id('p'), (pg_temp.dinner_day() ->> 'version_id')::uuid) ->> 'status',
  'saved', 'and acknowledges it');
select ok((pg_temp.dinner_row('p:ida') ->> 'acknowledged_at') is not null, 'her row says when');

select * from finish();
rollback;

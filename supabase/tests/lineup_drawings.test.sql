begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- AVATAR-IKON slice 4 (design 2026-10-19 §6; Mert 2026-10-20 "Evet, başla"): every Lineup row carries a drawing,
-- art_key. The person's own archive drawing first; otherwise one of her job's Lineup icons, dealt evenly across the
-- lineup (no icon twice before every icon once); a job with no icons deals from the shared "team" drawings. The deal
-- is seeded by the lineup (location, day, shift type), so a draft reads the same every time; a share writes it
-- (daily_lineup_drawings) and from then on it stays, whatever the job's icons become. A photo never reaches a Lineup.
--
-- Kadikoy's Lunch on a day of week 0: four cooks and Tia (cook, then server), two servers, two hosts (Host has no
-- icons). Cook has two icons, Server three.

select tests.world('d');
select tests.person('d', 'mia', 'manager', array['K'], array['cook']);
select tests.person('d', 'c1', 'employee', array['K'], array['cook']);
select tests.person('d', 'c2', 'employee', array['K'], array['cook']);
select tests.person('d', 'c3', 'employee', array['K'], array['cook']);
select tests.person('d', 'c4', 'employee', array['K'], array['cook']);
select tests.person('d', 'lea', 'employee', array['K'], array['cook']);
select tests.person('d', 'tia', 'employee', array['K'], array['cook', 'server']);
select tests.person('d', 's1', 'employee', array['K'], array['server']);
select tests.person('d', 's2', 'employee', array['K'], array['server']);
select tests.remember('d:job:host', (public.create_department_with_jobs_service(tests.user('d:owner'), tests.id('d'),
  '{"name": "Floor", "color": "#3C7A68"}'::jsonb, '[{"name": "Host", "color": "#4478A8"}]'::jsonb) -> 'jobs' -> 0 ->> 'id')::uuid);
select tests.person('d', 'h1', 'employee', array['K'], array['host']);
select tests.person('d', 'h2', 'employee', array['K'], array['host']);

create temporary table art (name text primary key, keys text[] not null);
insert into art values
  ('cook', array(select a.key from app_private.lineup_art a where a.kind <> 'team' order by a.no limit 2)),
  ('server', array(select a.key from app_private.lineup_art a where a.kind <> 'team' order by a.no limit 3 offset 2)),
  ('cook_later', array(select a.key from app_private.lineup_art a where a.kind <> 'team' order by a.no limit 2 offset 5)),
  ('own', array(select a.key from app_private.lineup_art a where a.kind <> 'team' order by a.no limit 1 offset 10)),
  ('team', array(select a.key from app_private.lineup_art a where a.kind = 'team' order by a.no));
create function pg_temp.keys(which text) returns text[] language sql as $$ select keys from art where name = which $$;
grant select on art to public;

update public.jobs set lineup_icons = pg_temp.keys('cook') where id = tests.id('d:job:cook');
update public.jobs set lineup_icons = pg_temp.keys('server') where id = tests.id('d:job:server');
update public.jobs set lineup_icons = '{}' where id = tests.id('d:job:host');

insert into public.shift_types (id, workspace_id, name, color, default_start_time, default_end_time)
values (tests.remember('d:type:lunch', gen_random_uuid()), tests.id('d'), 'Lunch', '#1F9D74', '09:00', '15:00');
select tests.publish_week('d', 0, jsonb_build_array(
  jsonb_build_object('label', 'c1', 'person', 'c1', 'loc', 'K', 'job', 'cook', 'day', 0, 'start', '09:00', 'end', '15:00'),
  jsonb_build_object('label', 'c2', 'person', 'c2', 'loc', 'K', 'job', 'cook', 'day', 0, 'start', '09:00', 'end', '15:00'),
  jsonb_build_object('label', 'c3', 'person', 'c3', 'loc', 'K', 'job', 'cook', 'day', 0, 'start', '09:00', 'end', '15:00'),
  jsonb_build_object('label', 'c4', 'person', 'c4', 'loc', 'K', 'job', 'cook', 'day', 0, 'start', '09:00', 'end', '15:00'),
  jsonb_build_object('label', 'tia-cook', 'person', 'tia', 'loc', 'K', 'job', 'cook', 'day', 0, 'start', '09:00', 'end', '12:00'),
  jsonb_build_object('label', 'tia-server', 'person', 'tia', 'loc', 'K', 'job', 'server', 'day', 0, 'start', '12:00', 'end', '15:00'),
  jsonb_build_object('label', 's1', 'person', 's1', 'loc', 'K', 'job', 'server', 'day', 0, 'start', '09:00', 'end', '15:00'),
  jsonb_build_object('label', 's2', 'person', 's2', 'loc', 'K', 'job', 'server', 'day', 0, 'start', '09:00', 'end', '15:00'),
  jsonb_build_object('label', 'h1', 'person', 'h1', 'loc', 'K', 'job', 'host', 'day', 0, 'start', '09:00', 'end', '15:00'),
  jsonb_build_object('label', 'h2', 'person', 'h2', 'loc', 'K', 'job', 'host', 'day', 0, 'start', '09:00', 'end', '15:00'),
  -- The next day's Lunch: two cooks, a lineup of its own.
  jsonb_build_object('label', 'c1-tue', 'person', 'c1', 'loc', 'K', 'job', 'cook', 'day', 1, 'start', '09:00', 'end', '15:00'),
  jsonb_build_object('label', 'c2-tue', 'person', 'c2', 'loc', 'K', 'job', 'cook', 'day', 1, 'start', '09:00', 'end', '15:00')
));
-- ponytail: the test editor has no shift type field; the published rows get theirs here.
update public.schedule_published_shifts set shift_type_id = tests.id('d:type:lunch') where workspace_id = tests.id('d');

-- S1 uploaded a photo; it is her avatar in this workspace.
create temporary table photo (path text);
insert into photo
select tests.id('d') || '/' || m.id || '/' || gen_random_uuid() || '.jpg'
from public.workspace_memberships m join public.employee_profiles e on e.user_id = m.user_id
where m.workspace_id = tests.id('d') and e.id = tests.id('d:s1');
grant select on photo to public;
insert into public.member_avatars (membership_id, workspace_id, photo_path)
select m.id, tests.id('d'), (select path from photo)
from public.workspace_memberships m join public.employee_profiles e on e.user_id = m.user_id
where m.workspace_id = tests.id('d') and e.id = tests.id('d:s1');

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
create function pg_temp.lunch(on_day integer default 0)
returns jsonb
language sql
as $$
  select x from jsonb_array_elements(public.get_lineup_day_service(tests.user('d:owner'), tests.id('d'), tests.week(0) + on_day)
    -> 'locations') l, jsonb_array_elements(l -> 'lineups') x
  where l ->> 'id' = tests.id('d:K')::text and x ->> 'shift_type_id' = tests.id('d:type:lunch')::text
$$;
-- Each (person, job) on the lineup and its drawing, as "<employee>:<job>" => key.
create function pg_temp.drawings(on_day integer default 0)
returns jsonb
language sql
as $$
  select coalesce(jsonb_object_agg((r ->> 'employee_id') || ':' || (r ->> 'job_id'), r -> 'art_key'), '{}'::jsonb)
  from jsonb_array_elements(pg_temp.lunch(on_day) -> 'rows') r where r ->> 'employee_id' is not null
$$;
create function pg_temp.art_of(person text, job text default null)
returns text
language sql
as $$
  select r ->> 'art_key' from jsonb_array_elements(pg_temp.lunch() -> 'rows') r
  where r ->> 'employee_id' = tests.id('d:' || person)::text
    and (job is null or r ->> 'job_id' = tests.id('d:job:' || job)::text)
  limit 1
$$;
create function pg_temp.stored()
returns jsonb
language sql
as $$
  select coalesce(jsonb_object_agg(s.employee_id || ':' || s.job_id, s.art_key), '{}'::jsonb)
  from public.daily_lineup_drawings s
  join public.daily_lineups d on d.id = s.lineup_id
  where d.workspace_id = tests.id('d') and d.location_id = tests.id('d:K') and d.service_date = tests.week(0)
$$;
-- How many times each drawing is used by one job's people.
create function pg_temp.uses(job text, map jsonb default null)
returns integer[]
language sql
as $$
  select coalesce(array_agg(n order by n desc), '{}') from (
    select count(*)::integer as n from jsonb_each_text(coalesce(map, pg_temp.drawings())) e
    where split_part(e.key, ':', 2) = tests.id('d:job:' || job)::text group by e.value) t
$$;
-- The pairs the deal is asked for, as lineup_day asks: each person and job on the lineup, with the job's icons.
create function pg_temp.pairs(on_day integer default 0)
returns jsonb
language sql
as $$
  select jsonb_agg(distinct jsonb_build_object('employee_id', r ->> 'employee_id', 'job_id', r ->> 'job_id',
    'icons', to_jsonb(j.lineup_icons)))
  from jsonb_array_elements(pg_temp.lunch(on_day) -> 'rows') r
  join public.jobs j on j.id = (r ->> 'job_id')::uuid
  where r ->> 'employee_id' is not null
$$;
create function pg_temp.share(kind text default 'share')
returns jsonb
language sql
as $$
  select public.lineup_command_service(tests.user('d:owner'), tests.id('d'), gen_random_uuid(), kind,
    jsonb_build_object('lineups', jsonb_build_array(jsonb_build_object('location_id', tests.id('d:K'),
      'service_date', tests.week(0), 'shift_type_id', tests.id('d:type:lunch'))), 'ask_ack', true))
$$;
create function pg_temp.own(person text, key text)
returns void
language sql
as $$
  delete from public.member_avatars a where a.membership_id = (
    select m.id from public.workspace_memberships m join public.employee_profiles e on e.user_id = m.user_id
    where m.workspace_id = tests.id('d') and e.id = tests.id('d:' || person));
  insert into public.member_avatars (membership_id, workspace_id, art_key)
  select m.id, tests.id('d'), key from public.workspace_memberships m join public.employee_profiles e on e.user_id = m.user_id
  where key is not null and m.workspace_id = tests.id('d') and e.id = tests.id('d:' || person);
$$;
create function pg_temp.mine(person text)
returns jsonb
language sql
as $$
  select public.get_my_lineups_service(tests.user('d:' || person), tests.id('d'), tests.week(0)) -> 'lineups' -> 0
$$;

-- 1. The table: row level security on, nothing granted to the browser, one drawing per person and job.
select ok((select c.relrowsecurity from pg_class c where c.oid = 'public.daily_lineup_drawings'::regclass),
  'daily_lineup_drawings has row level security');
select is(
  (select count(*)::integer from information_schema.role_table_grants g
   where g.table_schema = 'public' and g.table_name = 'daily_lineup_drawings' and g.grantee in ('anon', 'authenticated')),
  0, 'the browser holds no right on daily_lineup_drawings'
);
select is(
  (select count(*)::integer from pg_policy p where p.polrelid = 'public.daily_lineup_drawings'::regclass),
  0, 'and no policy: only the lineup services read and write it'
);
select ok(not has_function_privilege('authenticated', 'app_private.deal_lineup_art(text, jsonb, jsonb)', 'execute'),
  'the browser cannot call the deal');
-- Every foreign key is served by an index that starts with its first column: deleting a person, a job or a
-- drawing does not scan the table. The lineup's is the primary key's lead column.
select is(
  (select array_agg(c.conname::text order by c.conname) from pg_constraint c
   where c.conrelid = 'public.daily_lineup_drawings'::regclass and c.contype = 'f'
     and not exists (select 1 from pg_index i where i.indrelid = c.conrelid
                     and (i.indkey::int2[])[0] = c.conkey[1])),
  null, 'every foreign key of daily_lineup_drawings leads an index'
);

-- 2. Every row with a person carries a key; a draft deals evenly per job. Two icons over five cooks: 3 and 2.
create temporary table draft as select pg_temp.drawings() as map;
select is((select count(*)::integer from draft, jsonb_each(map) e where e.value = 'null'::jsonb), 0,
  'every person''s row has a drawing');
select is(pg_temp.uses('cook'), array[3, 2], 'two cook icons over five cooks: one three times, one twice');
select is(pg_temp.uses('server'), array[1, 1, 1], 'three server icons over three servers: each once');
select ok(
  (select bool_and(e.value = any (pg_temp.keys('cook'))) from draft, jsonb_each_text(map) e
   where split_part(e.key, ':', 2) = tests.id('d:job:cook')::text),
  'a cook draws only from Cook''s icons'
);
-- Host has no icons: the team drawings, still evenly.
select is(pg_temp.uses('host'), array[1, 1], 'the two hosts get two different drawings');
select ok(
  (select bool_and(e.value = any (pg_temp.keys('team'))) from draft, jsonb_each_text(map) e
   where split_part(e.key, ':', 2) = tests.id('d:job:host')::text),
  'from the team drawings'
);

-- 3. Tia works two jobs on one lineup: each row draws from its own job.
select ok(pg_temp.art_of('tia', 'cook') = any (pg_temp.keys('cook')), 'Tia''s cook row has a cook icon');
select ok(pg_temp.art_of('tia', 'server') = any (pg_temp.keys('server')), 'Tia''s server row has a server icon');

-- 4. S1's photo never reaches the Lineup: her row has a server icon.
select is((select count(*)::integer from public.member_avatars a where a.photo_path = (select path from photo)), 1,
  'S1 has a photo as her avatar');
select ok(pg_temp.art_of('s1') = any (pg_temp.keys('server')), 'a person with a photo gets her job''s icon');

-- 5. A draft reads the same every time, and the deal is the lineup's: location, day, shift type.
select is(pg_temp.drawings(), (select map from draft), 'the draft reads the same twice');
select is(
  pg_temp.drawings(),
  app_private.deal_lineup_art(tests.id('d:K') || ':' || tests.week(0) || ':' || tests.id('d:type:lunch'), pg_temp.pairs(), '{}'),
  'the draft is the deal seeded by its location, day and shift type'
);
select is(
  pg_temp.drawings(1),
  app_private.deal_lineup_art(tests.id('d:K') || ':' || (tests.week(0) + 1) || ':' || tests.id('d:type:lunch'), pg_temp.pairs(1), '{}'),
  'the next day''s lineup is dealt with its own seed'
);
-- A deal is the seed's: another seed deals the same people otherwise.
select isnt(
  app_private.deal_lineup_art('a', '[{"employee_id": "e1", "job_id": "j", "icons": ["k1", "k2", "k3", "k4"]},
    {"employee_id": "e2", "job_id": "j", "icons": ["k1", "k2", "k3", "k4"]},
    {"employee_id": "e3", "job_id": "j", "icons": ["k1", "k2", "k3", "k4"]}]', '{}'),
  app_private.deal_lineup_art('b', '[{"employee_id": "e1", "job_id": "j", "icons": ["k1", "k2", "k3", "k4"]},
    {"employee_id": "e2", "job_id": "j", "icons": ["k1", "k2", "k3", "k4"]},
    {"employee_id": "e3", "job_id": "j", "icons": ["k1", "k2", "k3", "k4"]}]', '{}'),
  'two seeds deal differently'
);
-- A stored pair keeps its drawing and counts: the others take the icon it left.
select is(
  app_private.deal_lineup_art('a', '[{"employee_id": "e1", "job_id": "j", "icons": ["k1", "k2"]},
    {"employee_id": "e2", "job_id": "j", "icons": ["k1", "k2"]}]', '{"e1:j": "k1"}'),
  '{"e1:j": "k1", "e2:j": "k2"}'::jsonb,
  'a stored drawing stays and the next person takes the least used icon'
);

-- 6. A share writes the draft as it was, and the read stays the same.
select is(pg_temp.stored(), '{}'::jsonb, 'nothing is written before a share');
select is(pg_temp.share() -> 'lineups' -> 0 ->> 'status', 'shared', 'the owner shares the lineup');
select is(pg_temp.stored(), (select map from draft), 'the share writes what the draft showed');
select is(pg_temp.drawings(), (select map from draft), 'and the shared lineup reads the same');

-- 7. The record of a version holds no drawing, and no answer holds the photo.
select ok(
  not exists (select 1 from public.daily_lineup_versions v, jsonb_array_elements(v.snapshot -> 'rows') r
              where v.workspace_id = tests.id('d') and r ? 'art_key'),
  'the published version''s record has no art_key'
);
select ok(
  (select bool_and(position(split_part((select path from photo), '/', 3) in t) = 0 and t not ilike '%profile-photos%')
   from (select public.get_lineup_day_service(tests.user('d:owner'), tests.id('d'), tests.week(0))::text
         union all select public.get_my_lineups_service(tests.user('d:s1'), tests.id('d'), tests.week(0))::text
         union all select public.get_my_lineups_service(tests.user('d:c1'), tests.id('d'), tests.week(0))::text
         union all select v.snapshot::text from public.daily_lineup_versions v where v.workspace_id = tests.id('d')) x(t)),
  'no Lineup answer and no record names the photo'
);

-- 8. The manager and the employee see the same drawing.
select is(pg_temp.mine('c2') -> 'mine' -> 0 ->> 'art_key', pg_temp.art_of('c2'), 'C2''s own row has her drawing');
select is(
  (select r ->> 'art_key' from jsonb_array_elements(pg_temp.mine('c3') -> 'team') r
   where r ->> 'employee_id' = tests.id('d:c2')::text),
  pg_temp.art_of('c2'), 'and her teammates see the same'
);
select is(
  (select r ->> 'art_key' from jsonb_array_elements(pg_temp.mine('s2') -> 'team') r
   where r ->> 'employee_id' = tests.id('d:s1')::text),
  pg_temp.art_of('s1'), 'S1 (with a photo) shows her server icon to the team'
);

-- 9. A person's own drawing comes first; removing it brings the written one back.
select pg_temp.own('c1', (pg_temp.keys('own'))[1]);
select is(pg_temp.art_of('c1'), (pg_temp.keys('own'))[1], 'C1''s own drawing comes first');
select is(pg_temp.mine('c1') -> 'mine' -> 0 ->> 'art_key', (pg_temp.keys('own'))[1], 'on her own Lineup too');
select is(pg_temp.stored(), (select map from draft), 'and the written deal is untouched');
select pg_temp.own('tia', (pg_temp.keys('own'))[1]);
select is(array[pg_temp.art_of('tia', 'cook'), pg_temp.art_of('tia', 'server')],
  array[(pg_temp.keys('own'))[1], (pg_temp.keys('own'))[1]], 'Tia''s own drawing on both her rows');
select pg_temp.own('c1', null);
select pg_temp.own('tia', null);
select is(pg_temp.drawings(), (select map from draft), 'removed, the written drawings come back');

-- 10. Someone added after the share takes the least used icon at once, and the next share writes it.
select is(pg_temp.share('unpublish') -> 'lineups' -> 0 ->> 'status', 'unpublished', 'the owner unpublishes');
select lives_ok(
  format($$select public.lineup_edit_service(%L, %L, gen_random_uuid(), %L)$$, tests.user('d:owner'), tests.id('d'),
    jsonb_build_object('location_id', tests.id('d:K'), 'service_date', tests.week(0), 'shift_type_id', tests.id('d:type:lunch'),
      'action', 'add_person', 'person', jsonb_build_object('employee_id', tests.id('d:lea'), 'job_id', tests.id('d:job:cook')))),
  'the owner adds Lea as a cook'
);
select is(
  pg_temp.art_of('lea'),
  (select e.value from draft, jsonb_each_text(map) e where split_part(e.key, ':', 2) = tests.id('d:job:cook')::text
   group by e.value order by count(*) limit 1),
  'Lea takes the cook icon used twice, not the one used three times'
);
select is(pg_temp.uses('cook'), array[3, 3], 'the cooks are even again');
select is(pg_temp.share() -> 'lineups' -> 0 ->> 'status', 'shared', 'shared again');
select is(pg_temp.stored() ->> (tests.id('d:lea') || ':' || tests.id('d:job:cook')), pg_temp.art_of('lea'),
  'the share writes Lea''s');
create temporary table shared_map as select pg_temp.drawings() as map;

-- 11. Cook's icons change afterwards: the written drawings stay, through unpublish and share.
select is(pg_temp.share('unpublish') -> 'lineups' -> 0 ->> 'status', 'unpublished', 'unpublished again');
update public.jobs set lineup_icons = pg_temp.keys('cook_later') where id = tests.id('d:job:cook');
select is(pg_temp.drawings(), (select map from shared_map), 'Cook''s new icons change no written drawing');
select is(pg_temp.share() -> 'lineups' -> 0 ->> 'status', 'shared', 'shared once more');
select is(pg_temp.drawings(), (select map from shared_map), 'the drawings are the same after the share');

-- 12. A written drawing is one of the archive's.
select is(
  pg_temp.refusal(format($$update public.daily_lineup_drawings set art_key = 'no-such-drawing'
    where workspace_id = %L and employee_id = %L$$, tests.id('d'), tests.id('d:c2'))),
  '23503:', 'a drawing is one of the archive''s'
);

select * from finish();
rollback;

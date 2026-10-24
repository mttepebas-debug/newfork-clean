begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Everyone at a location reads its published lineups (Mert 2026-10-24): get_my_lineups_service keeps the lineups
-- she is on in `lineups` (her ticket, her Acknowledge) and gives the day's other published lineups at the
-- locations she works at now in `others`, whole but with no ticket and no acknowledgement. Only the people on a
-- lineup are told of it and may acknowledge it (lineup_publish.test.sql). Not a draft, not one back in the
-- manager's hands, not another location, not another workspace.

select tests.world('lo');
select tests.world('lx');
select tests.person('lo', 'mia', 'manager', array['K'], array['cook']);
select tests.person('lo', 'eli', 'employee', array['K'], array['cook']);
select tests.person('lo', 'ida', 'employee', array['K'], array['cook']);
select tests.person('lo', 'noa', 'employee', array['K'], array['cook']);
select tests.person('lo', 'bo', 'employee', array['B'], array['server']);
select tests.person('lo', 'kai', 'employee', array['K', 'B'], array['cook']);
select tests.person('lo', 'zed', 'employee', array['B', 'K'], array['cook']);
select tests.person('lx', 'xia', 'employee', array['K'], array['cook']);

insert into public.shift_types (id, workspace_id, name, color, default_start_time, default_end_time)
values (tests.remember('lo:type:brunch', gen_random_uuid()), tests.id('lo'), 'Brunch', '#D39A36', '09:00', '12:00'),
       (tests.remember('lo:type:lunch', gen_random_uuid()), tests.id('lo'), 'Lunch', '#4478A8', '12:00', '15:00'),
       (tests.remember('lo:type:dinner', gen_random_uuid()), tests.id('lo'), 'Dinner', '#1F9D74', '16:00', '22:00'),
       (tests.remember('lo:type:late', gen_random_uuid()), tests.id('lo'), 'Late', '#9D1F74', '22:00', '23:30'),
       (tests.remember('lx:type:dinner', gen_random_uuid()), tests.id('lx'), 'Dinner', '#1F9D74', '16:00', '22:00');

select tests.publish_week('lo', 0, jsonb_build_array(
  jsonb_build_object('label', 'noa-brunch', 'person', 'noa', 'loc', 'K', 'job', 'cook', 'day', 0, 'start', '09:00', 'end', '12:00'),
  jsonb_build_object('label', 'ida-lunch', 'person', 'ida', 'loc', 'K', 'job', 'cook', 'day', 0, 'start', '12:00', 'end', '15:00'),
  jsonb_build_object('label', 'eli-dinner', 'person', 'eli', 'loc', 'K', 'job', 'cook', 'day', 0, 'start', '16:00', 'end', '22:00'),
  jsonb_build_object('label', 'open-dinner', 'loc', 'K', 'job', 'cook', 'day', 0, 'start', '17:00', 'end', '22:00'),
  jsonb_build_object('label', 'noa-late', 'person', 'noa', 'loc', 'K', 'job', 'cook', 'day', 0, 'start', '22:00', 'end', '23:30'),
  jsonb_build_object('label', 'bo-dinner', 'person', 'bo', 'loc', 'B', 'job', 'server', 'day', 0, 'start', '16:00', 'end', '22:00')
));
select tests.publish_week('lx', 0, jsonb_build_array(
  jsonb_build_object('label', 'xia-dinner', 'person', 'xia', 'loc', 'K', 'job', 'cook', 'day', 0, 'start', '16:00', 'end', '22:00')
));
-- ponytail: the test editor has no shift type field; the published rows get theirs here.
update public.schedule_published_shifts s set shift_type_id = tests.id(t.type_label)
from (values ('lo:shift:noa-brunch', 'lo:type:brunch'), ('lo:shift:ida-lunch', 'lo:type:lunch'),
             ('lo:shift:eli-dinner', 'lo:type:dinner'), ('lo:shift:open-dinner', 'lo:type:dinner'),
             ('lo:shift:noa-late', 'lo:type:late'), ('lo:shift:bo-dinner', 'lo:type:dinner'),
             ('lx:shift:xia-dinner', 'lx:type:dinner')) t(shift_label, type_label)
where s.id = tests.id(t.shift_label);

create function pg_temp.share(who text, place text, type_label text, kind text default 'share', ask boolean default true)
returns jsonb
language sql
as $$
  select public.lineup_command_service(tests.user(who), tests.id(split_part(who, ':', 1)), gen_random_uuid(), kind,
    jsonb_build_object('lineups', jsonb_build_array(jsonb_build_object(
      'location_id', tests.id(place), 'service_date', tests.week(0), 'shift_type_id', tests.id(type_label))),
      'ask_ack', ask))
$$;
create function pg_temp.read(who text)
returns jsonb
language sql
as $$
  select public.get_my_lineups_service(tests.user(who), tests.id(split_part(who, ':', 1)), tests.week(0))
$$;
-- Each lineup as "<location> <shift type>", in the order the read gives them.
create function pg_temp.names(who text, part text)
returns text[]
language sql
as $$
  select coalesce(array_agg((x -> 'location' ->> 'name') || ' ' || (x ->> 'shift_type_name') order by o), '{}')
  from jsonb_array_elements(pg_temp.read(who) -> part) with ordinality t(x, o)
$$;

-- Kadikoy: Brunch (Noa, asks nobody to acknowledge, with a special) and Dinner (Eli) published; Lunch (Ida) never
-- published; Late (Noa) published and taken back. Besiktas: Dinner (Bo) published. The other workspace's Kadikoy
-- Dinner (Xia) published.
select pg_temp.share('lo:mia', 'lo:K', 'lo:type:brunch', 'share', false);
update public.daily_lineups set specials = 'Shakshuka'
where workspace_id = tests.id('lo') and location_id = tests.id('lo:K') and service_date = tests.week(0)
  and shift_type_id = tests.id('lo:type:brunch');
select pg_temp.share('lo:mia', 'lo:K', 'lo:type:dinner');
select pg_temp.share('lo:mia', 'lo:K', 'lo:type:late');
select pg_temp.share('lo:mia', 'lo:K', 'lo:type:late', 'unpublish');
select pg_temp.share('lo:owner', 'lo:B', 'lo:type:dinner');
select pg_temp.share('lx:owner', 'lx:K', 'lx:type:dinner');
-- Zed works at Besiktas only now: his Kadikoy assignment ended.
update public.employee_location_assignments set ended_at = clock_timestamp()
where employee_id = tests.id('lo:zed') and location_id = tests.id('lo:K') and ended_at is null;

-- The world as built: the lineups' states.
select is(
  (select array_agg(t.name || ':' || d.latest_version || ':' || d.editing order by t.name)
   from public.daily_lineups d join public.shift_types t on t.id = d.shift_type_id
   where d.workspace_id = tests.id('lo') and d.location_id = tests.id('lo:K') and d.service_date = tests.week(0)),
  array['Brunch:1:false', 'Dinner:1:false', 'Late:1:true'],
  'Kadikoy has Brunch and Dinner published, Late taken back, and Lunch never published'
);

-- (a) A lineup she is on stays hers.
select is(pg_temp.names('lo:eli', 'lineups'), array['Kadikoy Dinner'], 'Eli''s own lineup is the Dinner she is on');
select is(pg_temp.names('lo:eli', 'others'), array['Kadikoy Brunch'],
  'her others are Kadikoy''s other published lineup, never the one she is on');

-- (b) The published lineups at her location without her: whole, with no ticket and no acknowledgement.
select is(pg_temp.names('lo:ida', 'lineups'), '{}'::text[], 'Ida''s Lunch is not published: she is on no lineup');
select is(pg_temp.names('lo:ida', 'others'), array['Kadikoy Brunch', 'Kadikoy Dinner'],
  'she reads Kadikoy''s published Brunch and Dinner, by shift type');
select is(
  (select array_agg(k order by k) from jsonb_array_elements(pg_temp.read('lo:ida') -> 'others') x, jsonb_object_keys(x) k
   where x ->> 'shift_type_name' = 'Dinner'),
  array['ask_ack', 'color', 'id', 'location', 'notes', 'shared_at', 'shift_type_id', 'shift_type_name', 'team', 'version',
        'version_id'],
  'another lineup has the lineup''s fields with no ticket (mine) and no acknowledged_at'
);
select is(
  (select row(x ->> 'id', x ->> 'version_id', x ->> 'version', x -> 'location' ->> 'id', x -> 'location' ->> 'timezone',
              x -> 'ask_ack', x ->> 'shared_at' is not null)::text
   from jsonb_array_elements(pg_temp.read('lo:ida') -> 'others') x where x ->> 'shift_type_name' = 'Dinner'),
  (select row(d.id, v.id, 1, tests.id('lo:K'), 'Europe/Istanbul', 'true'::jsonb, true)::text
   from public.daily_lineups d join public.daily_lineup_versions v on v.lineup_id = d.id
   where d.workspace_id = tests.id('lo') and d.location_id = tests.id('lo:K') and d.service_date = tests.week(0)
     and d.shift_type_id = tests.id('lo:type:dinner')),
  'the Dinner as staff see it: its id, the version published, Kadikoy, and that it asks to acknowledge'
);
select is(
  (select jsonb_agg(jsonb_build_object('employee_id', t ->> 'employee_id', 'is_me', t -> 'is_me', 'start_time', t ->> 'start_time'))
   from jsonb_array_elements(pg_temp.read('lo:ida') -> 'others') x, jsonb_array_elements(x -> 'team') t
   where x ->> 'shift_type_name' = 'Dinner'),
  jsonb_build_array(jsonb_build_object('employee_id', tests.id('lo:eli'), 'is_me', false, 'start_time', '16:00')),
  'its team is the people on it (the open shift is nobody''s), none of them her'
);
select is(
  (select row(x -> 'ask_ack', x -> 'notes' ->> 'specials', x -> 'team' -> 0 ->> 'employee_id')::text
   from jsonb_array_elements(pg_temp.read('lo:ida') -> 'others') x where x ->> 'shift_type_name' = 'Brunch'),
  row('false'::jsonb, 'Shakshuka', tests.id('lo:noa'))::text,
  'the Brunch with its notes, Noa on it, and no ask to acknowledge'
);
select ok(
  not exists (select 1 from jsonb_array_elements(pg_temp.read('lo:ida') -> 'others') x, jsonb_array_elements(x -> 'team') t
              where (t -> 'is_me')::boolean),
  'nobody on another lineup is her'
);

-- (c) Not a lineup back in the manager's hands, nor one never published.
select is(pg_temp.names('lo:noa', 'lineups'), array['Kadikoy Brunch'], 'Noa''s Late is back in the manager''s hands: only Brunch is hers');
select is(pg_temp.names('lo:noa', 'others'), array['Kadikoy Dinner'],
  'and her others are the Dinner: not the Late taken back, not the Lunch never published');

-- (d) Only where she works now.
select is(pg_temp.names('lo:bo', 'others'), '{}'::text[], 'Bo works at Besiktas only: no Kadikoy lineup');
select is(pg_temp.names('lo:bo', 'lineups'), array['Besiktas Dinner'], 'and his own Besiktas Dinner stays his');
select is(pg_temp.names('lo:kai', 'others'), array['Besiktas Dinner', 'Kadikoy Brunch', 'Kadikoy Dinner'],
  'Kai works at both: every published lineup of the day, by location then shift type');
select is(pg_temp.names('lo:zed', 'others'), array['Besiktas Dinner'],
  'Zed''s Kadikoy assignment ended: Besiktas only');

-- (e) Never another workspace's.
select is(pg_temp.names('lx:xia', 'lineups'), array['Kadikoy Dinner'], 'the other workspace''s Dinner is Xia''s');
select ok(
  not exists (select 1 from jsonb_array_elements(pg_temp.read('lo:kai') -> 'others') x
              where x -> 'location' ->> 'id' = tests.id('lx:K')::text
                 or x ->> 'shift_type_id' = tests.id('lx:type:dinner')::text),
  'it never reaches anyone here'
);
select is(pg_temp.names('lx:xia', 'others'), '{}'::text[], 'and nothing of this workspace reaches Xia');

-- Reading another lineup is not being on it: only the people on it acknowledge (nf-guvenlik 2026-10-24).
select throws_ok(
  format('select public.acknowledge_lineup_service(%L, %L, %L)', tests.user('lo:kai'), tests.id('lo'),
    (select x ->> 'version_id' from jsonb_array_elements(pg_temp.read('lo:kai') -> 'others') x
     where x -> 'location' ->> 'name' = 'Kadikoy' and x ->> 'shift_type_name' = 'Dinner')),
  '42501', null,
  'Kai reads Kadikoy''s Dinner but cannot acknowledge it'
);
-- On a lineup at a place she no longer works: that lineup stays hers, the place's others don't come with it (the
-- second gate, on top of the read's own places; nf-guvenlik 2026-10-24).
update public.employee_location_assignments set ended_at = clock_timestamp()
where employee_id = tests.id('lo:noa') and location_id = tests.id('lo:K') and ended_at is null;
select is(pg_temp.names('lo:noa', 'lineups'), array['Kadikoy Brunch'], 'Noa''s Kadikoy assignment ended: her Brunch stays hers');
select is(pg_temp.names('lo:noa', 'others'), '{}'::text[], 'and Kadikoy''s Dinner no longer reaches her');
-- An archived location gives nothing.
update public.locations set archived_at = now() where id = tests.id('lo:B');
select is(pg_temp.names('lo:kai', 'others'), array['Kadikoy Brunch', 'Kadikoy Dinner'], 'Besiktas archived: Kadikoy only');

-- (f) An archived employee record: nothing at all, `others` too.
update public.employee_profiles set archived_at = now() where id = tests.id('lo:ida');
select is(
  (select row(r -> 'lineups', r -> 'others')::text from pg_temp.read('lo:ida') r),
  row('[]'::jsonb, '[]'::jsonb)::text,
  'Ida''s record archived: no lineup of hers and no other'
);
-- A day with no published lineup anywhere: the same empty answer.
select is(
  (select row(r -> 'lineups', r -> 'others')::text
   from public.get_my_lineups_service(tests.user('lo:kai'), tests.id('lo'), tests.week(0) + 1) r),
  row('[]'::jsonb, '[]'::jsonb)::text,
  'another day: no lineup and no other'
);

select * from finish();
rollback;

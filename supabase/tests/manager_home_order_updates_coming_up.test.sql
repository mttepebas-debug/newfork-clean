begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- S-220, S-225 (Mert 2026-10-20): the managers' Home keeps the person's own
-- order of the location cards and adds Updates (last 7 days) and Coming up
-- (next 14 days), each line read under its own rule.

select tests.world('ho');
select tests.person('ho', 'ayse', 'manager', array['K'], array['general manager']);
select tests.person('ho', 'emre', 'employee', array['K'], array['cook']);
select tests.person('ho', 'bora', 'manager', array['B'], array['general manager']);
select tests.world('hx');

create function pg_temp.u(person text) returns uuid language sql as $$
  select tests.user('ho:' || person)
$$;
grant execute on function pg_temp.u(text) to public;
create function pg_temp.home(person text) returns jsonb language sql as $$
  select public.get_manager_home_service(pg_temp.u(person), tests.id('ho'))
$$;
create function pg_temp.names(person text) returns text[] language sql as $$
  select array_agg(l ->> 'name' order by n) from jsonb_array_elements(pg_temp.home(person) -> 'locations') with ordinality x(l, n)
$$;
create function pg_temp.kinds(person text, list text) returns text[] language sql as $$
  select coalesce(array_agg(distinct i ->> 'kind' order by i ->> 'kind'), '{}') from jsonb_array_elements(pg_temp.home(person) -> list) i
$$;
create function pg_temp.refusal(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return 'allowed';
exception when others then
  declare state text; hint text;
  begin
    get stacked diagnostics state = returned_sqlstate, hint = pg_exception_hint;
    return state || coalesce(' ' || nullif(hint, ''), '');
  end;
end;
$$;
create function pg_temp.save(person text, sections text[], places uuid[]) returns jsonb language sql as $$
  select public.save_workspace_layout_service(pg_temp.u(person), tests.id('ho'), sections, '{}'::text[], places)
$$;

-- The sections: the first order for somebody who never saved one.
select is(pg_temp.home('owner') -> 'layout' -> 'widget_order',
  '["operations", "pending_requests", "quick_actions", "updates", "open_shifts", "announcements", "coming_up", "todos"]'::jsonb,
  'eight sections in their first order');
-- A layout saved before (six sections): Updates and Coming up come after it.
select public.save_workspace_layout_service(pg_temp.u('ayse'), tests.id('ho'),
  array['todos', 'operations', 'pending_requests', 'open_shifts', 'announcements', 'quick_actions'], array['todos']);
select is(pg_temp.home('ayse') -> 'layout',
  '{"widget_order": ["todos", "operations", "pending_requests", "open_shifts", "announcements", "quick_actions", "updates", "coming_up"], "hidden_widget_ids": ["todos"]}'::jsonb,
  'a six-section layout keeps its order, the two new sections after it');

-- S-220: the cards in the person's own order, apart from the sections.
select is(pg_temp.names('owner'), array['Besiktas', 'Kadikoy'], 'unordered, the cards come by name');
select is(pg_temp.save('owner', array['updates', 'operations', 'pending_requests', 'quick_actions', 'open_shifts', 'announcements', 'coming_up', 'todos'],
  array[tests.id('ho:K'), tests.id('ho:B')]), '{"status": "saved"}'::jsonb, 'the owner saves Kadikoy first');
select is(pg_temp.names('owner'), array['Kadikoy', 'Besiktas'], 'and reads Kadikoy first');
select is(pg_temp.home('owner') -> 'layout' -> 'widget_order' ->> 0, 'updates', 'with the sections as saved');
select is(pg_temp.names('bora'), array['Besiktas'], 'the order is the owner''s alone: Bora reads his own location');
-- A location added later comes last; one the person no longer reads is not shown.
insert into public.locations (id, workspace_id, name, short_name, street_address, city, region, postal_code, timezone)
values (tests.remember('ho:A', gen_random_uuid()), tests.id('ho'), 'Atasehir', 'ATA', '5 Ata St', 'Istanbul', 'IST', '34750', 'Europe/Istanbul');
select is(pg_temp.names('owner'), array['Kadikoy', 'Besiktas', 'Atasehir'], 'a new location comes after the ordered ones');
select is(pg_temp.save('ayse', array['updates', 'operations', 'pending_requests', 'quick_actions', 'open_shifts', 'announcements', 'coming_up', 'todos'],
  array[tests.id('ho:B'), tests.id('ho:K')]) ->> 'status', 'saved', 'Ayse saves an order naming Besiktas too');
select is(pg_temp.names('ayse'), array['Kadikoy'], 'but reads only the location she manages');
-- Another workspace's location is not kept.
select pg_temp.save('owner', array['updates', 'operations', 'pending_requests', 'quick_actions', 'open_shifts', 'announcements', 'coming_up', 'todos'],
  array[tests.id('hx:K'), tests.id('ho:B'), tests.id('ho:K')]);
select is((select location_order from public.workspace_layout_preferences where workspace_id = tests.id('ho') and user_id = pg_temp.u('owner')),
  array[tests.id('ho:B'), tests.id('ho:K')], 'another workspace''s location is dropped from the saved order');
-- What the save refuses.
select is(pg_temp.refusal($$select pg_temp.save('owner', array['operations', 'pending_requests', 'quick_actions', 'open_shifts', 'announcements', 'todos'], '{}')$$),
  '22023', 'the new save takes all eight sections');
select is(pg_temp.refusal($$select pg_temp.save('owner', array['updates', 'operations', 'pending_requests', 'quick_actions', 'open_shifts', 'announcements', 'coming_up', 'notifications'], '{}')$$),
  '22023', 'an unknown section is refused');
select is(pg_temp.refusal(format($$select pg_temp.save('owner', array['updates', 'operations', 'pending_requests', 'quick_actions', 'open_shifts', 'announcements', 'coming_up', 'todos'], array['%s', '%s']::uuid[])$$,
  tests.id('ho:K'), tests.id('ho:K'))), '22023', 'a location twice is refused');
select is(pg_temp.refusal($$select pg_temp.save('emre', array['updates', 'operations', 'pending_requests', 'quick_actions', 'open_shifts', 'announcements', 'coming_up', 'todos'], '{}')$$),
  '42501 authz.missing_permission', 'an employee does not arrange the managers'' Home');
select is(pg_temp.refusal($$select public.save_workspace_layout_service(tests.user('hx:owner'), tests.id('ho'),
    array['updates', 'operations', 'pending_requests', 'quick_actions', 'open_shifts', 'announcements', 'coming_up', 'todos'], '{}', '{}')$$),
  '42501 authz.not_member', 'nor does the owner of another workspace');

-- Updates (S-225). Nothing yet.
-- The world's people accepted their invitations as it was built: they joined this week.
select is((select array_agg(u ->> 'person' order by u ->> 'person') from jsonb_array_elements(pg_temp.home('owner') -> 'updates') u),
  array['Ayse Person', 'Bora Person', 'Emre Person'], 'at first the owner reads who joined this week');
select is((select array_agg(u ->> 'person') from jsonb_array_elements(pg_temp.home('ayse') -> 'updates') u),
  array['Emre Person'], 'Ayse reads who joined at Kadikoy, not herself');
-- Kadikoy publishes the week from today, by the owner.
insert into public.schedule_location_publications (id, workspace_id, location_id, week_start, version_number, status, published_by)
select tests.remember('ho:pub:K', gen_random_uuid()), tests.id('ho'), tests.id('ho:K'),
  (now() at time zone l.timezone)::date, 1, 'current', pg_temp.u('owner')
from public.locations l where l.id = tests.id('ho:K');
-- Emre asks for three days off and the owner approves.
select tests.remember('ho:off', (public.submit_time_off_service(pg_temp.u('emre'), tests.id('ho'),
  jsonb_build_array(jsonb_build_object('segment_date', current_date + 3), jsonb_build_object('segment_date', current_date + 4),
    jsonb_build_object('segment_date', current_date + 5)),
  'Family', 'Europe/Istanbul', gen_random_uuid()) ->> 'request_id')::uuid);
select public.decide_time_off_service(pg_temp.u('owner'), tests.id('ho'), tests.id('ho:off'), 'approve', '',
  app_private.time_off_impact(tests.id('ho'), tests.id('ho:off')) ->> 'fingerprint');
-- Ayse approved a cover of a Kadikoy shift (the row goes straight in: this test reads it).
set local session_replication_role = replica;
insert into public.shift_exchange_cases (id, workspace_id, kind, audience, status, offered_source_id, owner_id, offered_snapshot,
  consent_fingerprint, expires_at, created_by)
values (tests.remember('ho:case', gen_random_uuid()), tests.id('ho'), 'cover', 'eligible_pool', 'completed', gen_random_uuid(),
  tests.id('ho:emre'), jsonb_build_object('location_id', tests.id('ho:K'), 'date', current_date + 2), 'x', now() + interval '1 day',
  pg_temp.u('emre'));
insert into public.shift_exchange_events (workspace_id, case_id, actor_user_id, action)
values (tests.id('ho'), tests.id('ho:case'), pg_temp.u('ayse'), 'transfer_completed');
-- Bora declined a swap of that Kadikoy shift for a Besiktas one: his side is the one asked for.
insert into public.shift_exchange_cases (id, workspace_id, kind, audience, status, offered_source_id, requested_source_id, owner_id,
  offered_snapshot, requested_snapshot, consent_fingerprint, expires_at, created_by)
values (tests.remember('ho:swap', gen_random_uuid()), tests.id('ho'), 'swap', 'direct', 'cancelled', gen_random_uuid(), gen_random_uuid(),
  tests.id('ho:emre'), jsonb_build_object('location_id', tests.id('ho:K'), 'date', current_date + 4),
  jsonb_build_object('location_id', tests.id('ho:B'), 'date', current_date + 4), 'x', now() + interval '1 day', pg_temp.u('emre'));
insert into public.shift_exchange_events (workspace_id, case_id, actor_user_id, action)
values (tests.id('ho'), tests.id('ho:swap'), pg_temp.u('bora'), 'application_rejected');
set local session_replication_role = origin;

select is(pg_temp.kinds('owner', 'updates'), array['cover', 'joined', 'published', 'swap', 'time_off'],
  'the owner reads the week published, the time off, the cover, the swap and who joined');
select is((select u - 'at' - 'id' from jsonb_array_elements(pg_temp.home('owner') -> 'updates') u where u ->> 'kind' = 'published'),
  jsonb_build_object('kind', 'published', 'location_ids', jsonb_build_array(tests.id('ho:K')), 'by', 'Olcay Owner',
    'first_date', (pg_temp.home('owner') -> 'locations' -> 0 ->> 'today')::date,
    'last_date', (pg_temp.home('owner') -> 'locations' -> 0 ->> 'today')::date + 6, 'shifts', 0),
  'a publication says where, by whom and which days');
select is((select u - 'at' - 'id' from jsonb_array_elements(pg_temp.home('owner') -> 'updates') u where u ->> 'kind' = 'time_off'),
  jsonb_build_object('kind', 'time_off', 'location_ids', jsonb_build_array(tests.id('ho:K')), 'approved', true,
    'person', 'Emre Person', 'by', 'Olcay Owner', 'first_date', current_date + 3, 'last_date', current_date + 5),
  'the time off says whose, approved, by whom and when');
select is((select u ->> 'person' || ' · ' || (u ->> 'approved') || ' · ' || (u ->> 'by') from jsonb_array_elements(pg_temp.home('owner') -> 'updates') u where u ->> 'kind' = 'cover'),
  'Emre Person · true · Ayse Person', 'the cover says whose, approved and by whom');
select is(pg_temp.kinds('ayse', 'updates'), array['cover', 'joined', 'published', 'swap', 'time_off'], 'Ayse reads them at Kadikoy too');
select is(pg_temp.kinds('bora', 'updates'), array['swap'], 'Bora, at Besiktas, reads only the swap his location was asked for');
select is((select u -> 'location_ids' from jsonb_array_elements(pg_temp.home('bora') -> 'updates') u),
  jsonb_build_array(tests.id('ho:B')), 'filed under his location alone');
select is((select (u ->> 'approved') || ' · ' || (u ->> 'by') from jsonb_array_elements(pg_temp.home('owner') -> 'updates') u where u ->> 'kind' = 'swap'),
  'false · Bora Person', 'a declined direct swap reads declined, by whom');
select is(public.get_manager_home_service(tests.user('hx:owner'), tests.id('hx')) -> 'updates', '[]'::jsonb,
  'another workspace''s owner reads none of them');

-- Coming up (S-225): the approved time off, a closed day, the days not yet published past the next seven.
set local session_replication_role = replica;
insert into public.announcements (id, workspace_id, title, body, status, published_at, created_by, updated_by, time_zone,
  starts_on, ends_on, on_schedule)
values (tests.remember('ho:closed', gen_random_uuid()), tests.id('ho'), 'Republic Day', '', 'published', now(),
  pg_temp.u('owner'), pg_temp.u('owner'), 'Europe/Istanbul', current_date + 9, current_date + 9, true);
insert into public.announcement_locations (workspace_id, announcement_id, location_id, day)
values (tests.id('ho'), tests.id('ho:closed'), tests.id('ho:K'), 'closed');
set local session_replication_role = origin;

select is((select array_agg(c ->> 'kind' || ' ' || (c ->> 'first_date') order by n)
  from jsonb_array_elements(pg_temp.home('ayse') -> 'coming_up') with ordinality x(c, n)),
  array['time_off ' || (current_date + 3), 'unpublished ' || ((pg_temp.home('ayse') -> 'locations' -> 0 ->> 'today')::date + 7),
    'closed ' || (current_date + 9)],
  'Ayse reads, soonest first: Emre off, the days after this week not published, the closed day');
select is((select c - 'id' from jsonb_array_elements(pg_temp.home('ayse') -> 'coming_up') c where c ->> 'kind' = 'closed'),
  jsonb_build_object('kind', 'closed', 'location_ids', jsonb_build_array(tests.id('ho:K')), 'name', 'Republic Day',
    'first_date', current_date + 9, 'last_date', current_date + 9),
  'the closed day has its announcement''s name');
select is((select array_agg(c ->> 'kind' order by c ->> 'kind') from jsonb_array_elements(pg_temp.home('bora') -> 'coming_up') c),
  array['unpublished'], 'Bora reads only that Besiktas is not published');

select * from finish();
rollback;

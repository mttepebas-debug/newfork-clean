-- Test world builder (FOUNDATION-B stage 2a).
--
-- Tests build people and workspaces through the product's own entry points,
-- the same calls the API makes, so a fixture can only hold what the product
-- can create today. The only raw insert is into auth.users. Anything the
-- product cannot reach on its own gets a named helper with a ponytail: note.
--
-- Loaded by `supabase db reset` (config.toml [db.seed]) and by CI before the
-- pgTAP run; it lives outside supabase/tests so pg_prove does not run it.
-- Idempotent: safe to load again over itself.
--
--   select tests.world('w');                       -- owner, Kadikoy + Besiktas, Kitchen: Cook + Server
--   select tests.person('w', 'ali', 'employee', array['K','B'], array['cook']);
--   select tests.id('w:ali');                      -- employee id;  tests.user('w:ali') -> auth user id
--   select tests.week(0);                          -- a Monday far enough ahead that no rule about the past applies

create schema if not exists tests;
revoke all on schema tests from public;
grant usage on schema tests to service_role;

create table if not exists tests.ids (
  label text primary key,
  id uuid not null
);

create or replace function tests.id(target_label text)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  found uuid;
begin
  select i.id into found from tests.ids i where i.label = target_label;
  if found is null then
    raise exception 'tests.id: no such label %', target_label;
  end if;
  return found;
end;
$$;

create or replace function tests.remember(target_label text, target_id uuid)
returns uuid
language sql
set search_path = ''
as $$
  insert into tests.ids (label, id) values (target_label, target_id)
  on conflict (label) do update set id = excluded.id
  returning id;
$$;

create or replace function tests.user(target_label text)
returns uuid
language sql
stable
set search_path = ''
as $$ select tests.id(target_label || ':user') $$;

-- Ends a builder step the way an API request ends, so the next call starts
-- like a new one: runs the checks and syncs the product defers to commit
-- (document assignment, role dependencies) and defers
-- again, and forgets the caller identity that service functions stamp on the
-- transaction (request.jwt.claim.sub, set local by the JWT bridges). A test
-- transaction never commits, so without this the deferred rows would never
-- exist and the last builder call's identity would leak into the test.
create or replace function tests.settle()
returns void
language plpgsql
set search_path = ''
as $$
begin
  -- ponytail: "all deferred" restores the defaults only while every deferrable
  -- constraint is initially deferred; this stops the builder if one is not.
  if exists (
    select 1 from pg_catalog.pg_constraint c
    where c.condeferrable and not c.condeferred
  ) then
    raise exception 'tests.settle: a deferrable initially immediate constraint exists; settle would change its timing';
  end if;
  set constraints all immediate;
  set constraints all deferred;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- A Monday about two years out, n weeks on. Nothing in a test should depend on
-- what day it is when the suite runs.
create or replace function tests.week(n integer default 0)
returns date
language sql
stable
set search_path = ''
as $$
  select (current_date + 700 - (extract(isodow from current_date + 700)::integer - 1)) + 7 * n;
$$;

create or replace function tests.new_user(target_label text, display_name text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  user_id uuid := gen_random_uuid();
  email text := replace(target_label, ':', '.') || '.' || left(user_id::text, 8) || '@world.test';
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    email, '', now(), '{}', jsonb_build_object('display_name', display_name), now(), now()
  );
  insert into public.user_profiles (user_id, display_name) values (user_id, display_name);
  perform tests.remember(target_label || ':user', user_id);
  return user_id;
end;
$$;

-- Runs one statement the way the web app does it: as authenticated, with the
-- actor's JWT subject, under RLS, and returns how many rows it touched (RLS
-- hides rows rather than refusing, so 0 is how a browser write says no). Used
-- where the web reads or writes directly, because there is no server entry
-- point to call.
drop function if exists tests.as_browser(uuid, text);
create function tests.as_browser(actor uuid, statement text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  previous_role text := current_user;
  previous_sub text := current_setting('request.jwt.claim.sub', true);
  touched integer;
begin
  perform set_config('request.jwt.claim.sub', actor::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);
  set local role authenticated;
  execute statement;
  get diagnostics touched = row_count;
  execute format('set local role %I', previous_role);
  perform set_config('request.jwt.claim.sub', coalesce(previous_sub, ''), true);
  perform set_config('request.jwt.claims', '', true);
  return touched;
end;
$$;

-- A workspace as its owner leaves setup: two locations (K = Kadikoy,
-- B = Besiktas), one department (Kitchen) with two jobs (cook, server), and
-- the owner filed as an employee at both locations with the Owner job only
-- (setup also makes Management and Owner; cook and server are assigned by hand).
-- Labels: <w>:owner, <w>:K, <w>:B, <w>:job:cook, <w>:job:server, <w>:kitchen.
create or replace function tests.world(w text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  owner_id uuid := tests.new_user(w || ':owner', 'Olcay Owner');
  workspace uuid;
  created jsonb;
  job jsonb;
begin
  workspace := public.create_owner_workspace_service(owner_id, 'World ' || w);
  perform tests.remember(w, workspace);

  perform public.update_owner_onboarding_service(
    owner_id, workspace, 'World ' || w, 2::smallint, false,
    (select o.revision from public.workspace_onboarding o where o.workspace_id = workspace),
    'Olcay', null, 'Owner'
  );

  perform tests.as_browser(owner_id, format(
    $sql$insert into public.locations (id, workspace_id, name, short_name, street_address, city, region, postal_code, timezone)
         values (%L, %L, 'Kadikoy', 'KDK', '1 Moda Cd', 'Istanbul', 'Istanbul', '34710', 'Europe/Istanbul'),
                (%L, %L, 'Besiktas', 'BJK', '2 Barbaros Blv', 'Istanbul', 'Istanbul', '34353', 'Europe/Istanbul')$sql$,
    tests.remember(w || ':K', gen_random_uuid()), workspace,
    tests.remember(w || ':B', gen_random_uuid()), workspace
  ));

  created := public.create_department_with_jobs_service(
    owner_id, workspace,
    '{"name": "Kitchen", "color": "#3C7A68"}'::jsonb,
    '[{"name": "Cook", "color": "#D39A36"}, {"name": "Server", "color": "#4478A8"}]'::jsonb
  );
  perform tests.remember(w || ':kitchen', (created -> 'department' ->> 'id')::uuid);
  for job in select value from jsonb_array_elements(created -> 'jobs') loop
    perform tests.remember(w || ':job:' || lower(job ->> 'name'), (job ->> 'id')::uuid);
  end loop;

  perform public.update_owner_onboarding_service(
    owner_id, workspace, 'World ' || w, 4::smallint, true,
    (select o.revision from public.workspace_onboarding o where o.workspace_id = workspace),
    'Olcay', null, 'Owner'
  );
  perform tests.remember(w || ':owner', (
    select e.id from public.employee_profiles e
    where e.workspace_id = workspace and e.user_id = owner_id
  ));
  perform tests.settle();
  return workspace;
end;
$$;

-- A role the owner saved in Settings > Roles. Label: <w>:role:<name>.
create or replace function tests.role(w text, role_name text, access_class public.workspace_role, permission_keys text[])
returns uuid
language sql
set search_path = ''
as $$
  select tests.remember(w || ':role:' || role_name, public.save_workspace_role_service(
    tests.user(w || ':owner'), tests.id(w), null, role_name, '', access_class, permission_keys
  ));
$$;

-- Somebody the owner added and invited, who accepted. access is a system role
-- (admin, manager, employee) or the name of a role made with tests.role.
-- locs are location keys (K, B), jobs are job keys (cook, server); both empty
-- files them as remote. status: active (accepted and finished their own
-- onboarding) | onboarding (accepted, onboarding not finished) | pending
-- (invited, not accepted) | suspended (access removed, record kept) |
-- removed (employment ended).
-- Labels: <w>:<label> (employee id), <w>:<label>:user (auth user id).
create or replace function tests.person(
  w text,
  person_label text,
  access text,
  locs text[] default array['K'],
  jobs text[] default array['cook'],
  status text default 'active'
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  owner_id uuid := tests.user(w || ':owner');
  workspace uuid := tests.id(w);
  user_id uuid := tests.new_user(w || ':' || person_label, initcap(person_label) || ' Person');
  location_ids uuid[] := array(select tests.id(w || ':' || k) from unnest(coalesce(locs, '{}')) k);
  job_ids uuid[] := array(select tests.id(w || ':job:' || k) from unnest(coalesce(jobs, '{}')) k);
  role_id uuid;
  created jsonb;
  employee uuid;
begin
  if status not in ('active', 'onboarding', 'pending', 'suspended', 'removed') then
    raise exception 'tests.person: unknown status %', status;
  end if;
  select r.id into role_id
  from public.workspace_roles r
  where r.workspace_id = workspace
    and (r.system_key::text = access or r.id = (select i.id from tests.ids i where i.label = w || ':role:' || access));
  if role_id is null then
    raise exception 'tests.person: no role % in world %', access, w;
  end if;

  created := public.create_employee_command_service(
    owner_id, workspace, gen_random_uuid(),
    jsonb_build_object(
      'first_name', initcap(person_label), 'middle_name', '', 'last_name', 'Person',
      'preferred_name', '',
      'invitation_email', (select u.email from auth.users u where u.id = user_id),
      'start_date', '', 'internal_note', '',
      'location_ids', to_jsonb(location_ids),
      'primary_location_id', location_ids[1],
      'job_ids', to_jsonb(job_ids),
      'primary_job_id', job_ids[1],
      'is_remote', cardinality(location_ids) = 0,
      'is_excluded_from_schedule', false,
      'expected_revision', null
    ),
    role_id
  );
  employee := tests.remember(w || ':' || person_label, (created ->> 'id')::uuid);
  perform tests.remember(w || ':' || person_label || ':invitation', (created ->> 'invitation_id')::uuid);

  if status <> 'pending' then
    perform public.accept_employee_invitation_by_id_service(user_id, (created ->> 'invitation_id')::uuid);
  end if;
  perform tests.settle();

  if status in ('active', 'suspended', 'removed') then
    perform public.save_employee_onboarding_profile_service(
      user_id,
      jsonb_build_object(
        'legal_first_name', initcap(person_label), 'legal_last_name', 'Person',
        'phone', '4155550123', 'emergency_contact_name', 'Contact',
        'emergency_contact_relationship', 'Friend', 'emergency_contact_phone', '4155550100'
      ),
      (select c.revision from public.employee_onboarding_cases c where c.employee_id = employee),
      workspace
    );
    perform public.submit_employee_onboarding_service(
      user_id,
      (select c.revision from public.employee_onboarding_cases c where c.employee_id = employee),
      workspace
    );
    perform tests.settle();
  end if;

  if status = 'suspended' then
    perform public.remove_employee_access_service(owner_id, workspace, employee);
  elsif status = 'removed' then
    perform public.terminate_employee_service(
      owner_id, workspace, employee, localtimestamp, 'Europe/Istanbul', 'test world', gen_random_uuid()
    );
  end if;
  perform tests.settle();
  return employee;
end;
$$;

-- A time-off request the person files from Employee Hub, for the Wednesday of
-- tests.week(n), at their primary location. Label: <w>:<label>:time_off.
create or replace function tests.time_off(w text, person_label text, n integer default 0)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  employee uuid := tests.id(w || ':' || person_label);
  location uuid := (
    select l.location_id from public.employee_location_assignments l
    where l.employee_id = employee and l.ended_at is null
    order by l.is_primary desc, l.assigned_at limit 1
  );
  request uuid;
begin
  perform public.submit_employee_time_off_service(
    tests.user(w || ':' || person_label), tests.id(w), location, 'test world', array[tests.week(n) + 2]
  );
  select r.id into request from public.schedule_time_off_requests r
  where r.employee_id = employee order by r.created_at desc limit 1;
  perform tests.settle();
  return tests.remember(w || ':' || person_label || ':time_off', request);
end;
$$;

-- The employee's own "My availability" mark: unavailable on one weekday
-- (0 = Sunday .. 6 = Saturday, matching extract(dow)) for a clock range
-- (e.g. '18:00', '22:00'). Every other day is left available. BL-186 (a
-- preference, never a block).
create or replace function tests.availability(w text, person_label text, weekday integer, start_time text, end_time text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  actor uuid := tests.user(w || ':' || person_label);
  workspace uuid := tests.id(w);
  employee uuid := tests.id(w || ':' || person_label);
  model jsonb := public.weekly_preferences_read_service(actor, workspace, employee);
  preference jsonb;
begin
  select jsonb_build_object('input_mode', 'time_range', 'days', jsonb_agg(
    case when day = weekday then jsonb_build_object(
      'day', day, 'all_day', false, 'shift_type_ids', '[]'::jsonb,
      'range', jsonb_build_object('start', start_time, 'end', end_time))
    else jsonb_build_object('day', day, 'all_day', false, 'shift_type_ids', '[]'::jsonb, 'range', null) end
    order by day
  )) into preference
  from generate_series(0, 6) day;

  perform public.weekly_preferences_save_service(
    actor, workspace,
    -- The save refuses a stale screen: send the revisions the page was read at.
    jsonb_build_object('source', 'employee', 'employee_id', employee, 'preference', preference, 'decisions', '[]'::jsonb,
      'expected_revision', model -> 'employee' -> 'revision', 'settings_revision', model -> 'settings' -> 'revision'),
    gen_random_uuid()
  );
  perform tests.settle();
end;
$$;

-- A tag the owner made in Settings > Shift labels (found if it is already
-- there). Label: <w>:label:<lowercase name>.
create or replace function tests.shift_label(w text, label_name text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  found uuid;
begin
  select l.id into found from public.shift_labels l
  where l.workspace_id = tests.id(w) and lower(l.name) = lower(label_name) and l.archived_at is null;
  if found is null then
    found := gen_random_uuid();
    perform tests.as_browser(tests.user(w || ':owner'), format(
      $sql$insert into public.shift_labels (id, workspace_id, name) values (%L, %L, %L)$sql$,
      found, tests.id(w), label_name));
  end if;
  return tests.remember(w || ':label:' || lower(label_name), found);
end;
$$;

-- One shift added to an open edit the way the Schedule screen adds it: assess,
-- then create with the assessment's fingerprint. shift is {"person", "loc",
-- "job", "day" (0 = Monday), "start", "end"} and optionally "note",
-- "hide_time_on_badge", "label_ids", "label_names" (the shift's tags as the
-- quick editor sends them; with names only, the tags are made in the catalog
-- with tests.shift_label, as the server takes names from there); n is the
-- week. Returns the shift id.
create or replace function tests.add_shift(actor uuid, w text, session uuid, n integer, shift jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  payload jsonb := jsonb_build_object(
    'location_id', tests.id(w || ':' || (shift ->> 'loc')),
    -- No person: an open shift, for anyone at the location to pick up.
    'employee_id', case when shift ->> 'person' is not null then tests.id(w || ':' || (shift ->> 'person')) end,
    'job_id', tests.id(w || ':job:' || (shift ->> 'job')),
    'scheduled_date', tests.week(n) + (shift ->> 'day')::integer,
    'time_basis', 'explicit',
    'start_time', shift ->> 'start',
    'end_time', shift ->> 'end',
    'time_timezone', 'Europe/Istanbul',
    'note', coalesce(shift ->> 'note', ''),
    'hide_time_on_badge', coalesce((shift ->> 'hide_time_on_badge')::boolean, false),
    'label_ids', coalesce(shift -> 'label_ids', (
      select coalesce(jsonb_agg(tests.shift_label(w, tag.name) order by tag.ord), '[]'::jsonb)
      from jsonb_array_elements_text(coalesce(shift -> 'label_names', '[]'::jsonb)) with ordinality as tag(name, ord))),
    'label_names', coalesce(shift -> 'label_names', '[]'::jsonb)
  );
  shift_id uuid := gen_random_uuid();
begin
  perform public.mutate_schedule_edit_shift_service(
    actor, tests.id(w), session,
    (select e.revision from public.schedule_edit_sessions e where e.id = session),
    'create', shift_id, null,
    payload || jsonb_build_object('availability_assessment_fingerprint',
      public.assess_schedule_shift_service(actor, tests.id(w), payload, null, session) ->> 'fingerprint'),
    gen_random_uuid()
  );
  return shift_id;
end;
$$;

-- A week somebody writes and publishes on the Schedule screen: open editing,
-- check each shift, add it, save the draft, preview, publish. shifts is a JSON
-- list of {"label", "person", "loc", "job", "day" (0 = Monday), "start", "end"}
-- plus tests.add_shift's optional keys. Labels: <w>:shift:<label> (the published shift id). Returns the draft id.
-- tests.publish_week(w, n, shifts) publishes as the owner.
create or replace function tests.publish_week_as(owner_id uuid, w text, n integer, shifts jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  workspace uuid := tests.id(w);
  session uuid;
  draft uuid;
  preview jsonb;
  shift jsonb;
  location_ids uuid[];
begin
  session := (public.acquire_schedule_edit_session_service(owner_id, workspace, tests.week(n), 'blank', null) -> 'session' ->> 'id')::uuid;
  for shift in select value from jsonb_array_elements(shifts) loop
    perform tests.add_shift(owner_id, w, session, n, shift);
  end loop;
  -- A fresh name each call: a real user picks one, and the product keeps at
  -- most one active draft per name per week (schedule_drafts_active_name_idx).
  -- A publish never archives the draft it came from (only deleting one does),
  -- so two publishes of the same week -- e.g. shift-hub-swap.spec.ts under
  -- --repeat-each reusing one world -- would collide on a fixed name (BL-210).
  draft := (public.save_schedule_edit_session_service(
    owner_id, workspace, session,
    (select e.revision from public.schedule_edit_sessions e where e.id = session),
    'test world ' || substr(gen_random_uuid()::text, 1, 8), null, null
  ) ->> 'id')::uuid;
  location_ids := array(
    select distinct tests.id(w || ':' || (value ->> 'loc')) from jsonb_array_elements(shifts)
  );
  preview := public.preview_schedule_publication_service(owner_id, workspace, draft, location_ids, null, true);
  perform public.publish_schedule_draft_service(
    owner_id, workspace, draft, location_ids, null, true,
    (select d.revision from public.schedule_drafts d where d.id = draft),
    preview ->> 'fingerprint', '[]'::jsonb
  );
  for shift in select value from jsonb_array_elements(shifts) loop
    perform tests.remember(w || ':shift:' || (shift ->> 'label'), (
      select p.id from public.schedule_published_shifts p
      where p.workspace_id = workspace
        and p.employee_id is not distinct from case when shift ->> 'person' is not null then tests.id(w || ':' || (shift ->> 'person')) end
        and p.location_id = tests.id(w || ':' || (shift ->> 'loc'))
        and p.scheduled_date = tests.week(n) + (shift ->> 'day')::integer
        and p.start_time = (shift ->> 'start')::time
        -- Republishing the same slot leaves the old (superseded) published
        -- shift row in place alongside the new one; without this, remembering
        -- a label an earlier publish already used for the same person/
        -- location/day/time matches both and errors ("more than one row").
        and exists (
          select 1 from public.schedule_location_publications publication
          where publication.id = p.publication_id and publication.status = 'current'
        )
    ));
  end loop;
  perform tests.settle();
  return draft;
end;
$$;

create or replace function tests.publish_week(w text, n integer, shifts jsonb)
returns uuid
language sql
set search_path = ''
as $$ select tests.publish_week_as(tests.user(w || ':owner'), w, n, shifts) $$;

-- The holder of a published shift asks for cover in Shift Hub and somebody
-- applies. Labels: <w>:case:<shift label>, <w>:application:<shift label>.
create or replace function tests.cover_case(w text, shift_label text, holder text, applicant text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  workspace uuid := tests.id(w);
  created jsonb;
  opened uuid;
begin
  created := public.shift_exchanges_command_service(
    tests.user(w || ':' || holder), workspace,
    jsonb_build_object('action', 'create', 'kind', 'cover', 'shift_id', tests.id(w || ':shift:' || shift_label)),
    gen_random_uuid()
  );
  opened := tests.remember(w || ':case:' || shift_label, (created ->> 'case_id')::uuid);
  perform tests.settle();
  perform public.shift_exchanges_command_service(
    tests.user(w || ':' || applicant), workspace,
    jsonb_build_object('action', 'apply', 'shift_id', tests.id(w || ':shift:' || shift_label), 'case_id', opened),
    gen_random_uuid()
  );
  perform tests.remember(w || ':application:' || shift_label, (
    select a.id from public.shift_exchange_applications a
    where a.case_id = opened and a.employee_id = tests.id(w || ':' || applicant)
  ));
  perform tests.settle();
  return opened;
end;
$$;

-- A password on a builder account, so a browser test can sign in through the
-- real sign-in screen. The builder only ever loads locally and in CI (db
-- reset seeds it; db push to the hosted project never does), so these
-- passwords never exist on the hosted project. The token columns are blanked
-- because the auth server cannot read NULL there.
create or replace function tests.password(person_label text, secret text)
returns text
language sql
set search_path = ''
as $$
  update auth.users
  set encrypted_password = extensions.crypt(secret, extensions.gen_salt('bf')),
      confirmation_token = '', recovery_token = '', email_change_token_new = '',
      email_change_token_current = '', email_change = '', phone_change = '',
      phone_change_token = '', reauthentication_token = ''
  where id = tests.user(person_label)
  returning email;
$$;

-- A member of a hand-built fixture working at a location, in today's shape:
-- their employee record (made if the fixture has none) with an active
-- assignment there. Where somebody works and what a manager manages both come
-- from assignments; membership_location_scopes is a view of them (stage 4b).
-- ponytail: for the older test files that insert memberships by hand; people
-- the builder makes get their assignments through the product (tests.person).
create or replace function tests.works_at(membership uuid, location uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  member public.workspace_memberships;
  profile public.employee_profiles;
  maker uuid;
begin
  select * into member from public.workspace_memberships m where m.id = membership;
  if member.id is null then
    raise exception 'tests.works_at: no membership %', membership;
  end if;
  maker := coalesce((
    select m.user_id from public.workspace_memberships m
    where m.workspace_id = member.workspace_id and m.role = 'owner' limit 1
  ), member.user_id);
  select * into profile from public.employee_profiles e
  where e.workspace_id = member.workspace_id and e.user_id = member.user_id;
  if profile.id is not null and profile.archived_at is not null then
    raise exception 'tests.works_at: the employee record of membership % is archived', membership;
  end if;
  if profile.id is null then
    insert into public.employee_profiles (workspace_id, user_id, employee_code, first_name, last_name, created_by)
    values (
      member.workspace_id, member.user_id,
      'E-' || lpad((coalesce((
        select max(substring(e.employee_code from 3)::bigint)
        from public.employee_profiles e where e.workspace_id = member.workspace_id
      ), 0) + 1)::text, 6, '0'),
      'Fixture', 'Member', maker
    )
    returning * into profile;
  end if;
  insert into public.employee_location_assignments (workspace_id, employee_id, location_id, is_primary, created_by)
  select member.workspace_id, profile.id, location,
    not exists (
      select 1 from public.employee_location_assignments a
      where a.employee_id = profile.id and a.ended_at is null and a.is_primary
    ),
    maker
  where not exists (
    select 1 from public.employee_location_assignments a
    where a.employee_id = profile.id and a.location_id = location and a.ended_at is null
  );
  return profile.id;
end;
$$;

-- The opposite: the member no longer works at the location (every location
-- when location is null). Their active assignments there end now.
create or replace function tests.stops_working_at(membership uuid, location uuid default null)
returns void
language sql
set search_path = ''
as $$
  update public.employee_location_assignments a
  set ended_at = clock_timestamp()
  from public.workspace_memberships m
  join public.employee_profiles e on e.workspace_id = m.workspace_id and e.user_id = m.user_id
  where m.id = membership
    and a.employee_id = e.id
    and a.ended_at is null
    and (location is null or a.location_id = location);
$$;

revoke all on all functions in schema tests from public;
grant execute on all functions in schema tests to service_role;
grant select, insert, update on tests.ids to service_role;

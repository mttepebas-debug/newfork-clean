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

-- Runs the checks and syncs the product defers to commit (manager scope rows,
-- document assignment, role dependencies), then defers again, so the next call
-- starts the way an API request does. A test transaction never commits, so
-- without this those rows would never exist.
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
    id, instance_id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    email, '', '{}', jsonb_build_object('display_name', display_name), now(), now()
  );
  insert into public.user_profiles (user_id, display_name) values (user_id, display_name);
  perform tests.remember(target_label || ':user', user_id);
  return user_id;
end;
$$;

-- Runs one statement the way the web app does it: as authenticated, with the
-- actor's JWT subject, under RLS. Used only where the web writes directly
-- (Settings > Organization), because there is no server entry point to call.
create or replace function tests.as_browser(actor uuid, statement text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  previous_role text := current_user;
  previous_sub text := current_setting('request.jwt.claim.sub', true);
begin
  perform set_config('request.jwt.claim.sub', actor::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);
  set local role authenticated;
  execute statement;
  execute format('set local role %I', previous_role);
  perform set_config('request.jwt.claim.sub', coalesce(previous_sub, ''), true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- A workspace as its owner leaves setup: two locations (K = Kadikoy,
-- B = Besiktas), one department (Kitchen) with two jobs (cook, server), and
-- the owner filed as an employee at both locations with both jobs.
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
      owner_id, workspace, employee, localtimestamp, 'Europe/Istanbul', 'block', 'test world', gen_random_uuid()
    );
  end if;
  perform tests.settle();
  return employee;
end;
$$;

revoke all on all functions in schema tests from public;
grant execute on all functions in schema tests to service_role;
grant select, insert, update on tests.ids to service_role;

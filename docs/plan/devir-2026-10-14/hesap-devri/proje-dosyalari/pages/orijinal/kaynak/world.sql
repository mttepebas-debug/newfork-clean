-- Harbor & Vine: the demo restaurant the Original tabs are recorded on.
-- Same names as the Schedule test page (pages/schedule-test/source/mock/world.ts).
-- Built through the product's own service functions, like supabase/test-support/builder.sql.
\set ON_ERROR_STOP 1

-- Weeks start this Monday here (the builder's tests.week is two years out).
create or replace function tests.week(n integer default 0)
returns date language sql stable set search_path = '' as $$
  select (current_date - (extract(isodow from current_date)::integer - 1)) + 7 * n;
$$;

-- Shifts take their location's time zone.
create or replace function tests.add_shift(actor uuid, w text, session uuid, n integer, shift jsonb)
returns uuid language plpgsql set search_path = '' as $$
declare
  payload jsonb := jsonb_build_object(
    'location_id', tests.id(w || ':' || (shift ->> 'loc')),
    'employee_id', case when shift ->> 'person' is not null then tests.id(w || ':' || (shift ->> 'person')) end,
    'job_id', tests.id(w || ':job:' || (shift ->> 'job')),
    'scheduled_date', tests.week(n) + (shift ->> 'day')::integer,
    'time_basis', 'explicit',
    'start_time', shift ->> 'start',
    'end_time', shift ->> 'end',
    'time_timezone', (select l.timezone from public.locations l where l.id = tests.id(w || ':' || (shift ->> 'loc'))),
    'note', coalesce(shift ->> 'note', ''),
    'hide_time_on_badge', false,
    'label_ids', coalesce((
      select jsonb_agg(tests.shift_label(w, tag.name) order by tag.ord)
      from jsonb_array_elements_text(coalesce(shift -> 'label_names', '[]'::jsonb)) with ordinality as tag(name, ord)), '[]'::jsonb),
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

create or replace function tests.demo_user(target_label text, first text, last text)
returns uuid language plpgsql set search_path = '' as $$
declare
  user_id uuid := gen_random_uuid();
  email text := lower(first || '.' || replace(last, ' ', '')) || '@harborvine.test';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change_token_current, email_change, phone_change, phone_change_token, reauthentication_token)
  values (user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email,
    extensions.crypt('[GIZLI-CIKARILDI]', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', first || ' ' || last), now(), now(),
    '', '', '', '', '', '', '', '');
  insert into public.user_profiles (user_id, display_name) values (user_id, first || ' ' || last);
  perform tests.remember(target_label || ':user', user_id);
  return user_id;
end;
$$;

create or replace function tests.demo_world(w text)
returns uuid language plpgsql set search_path = '' as $$
declare
  owner_id uuid := tests.demo_user(w || ':owner', 'Mert', 'Tepebas');
  workspace uuid;
  created jsonb;
  job jsonb;
  dept jsonb;
begin
  workspace := public.create_owner_workspace_service(owner_id, 'Harbor & Vine');
  perform tests.remember(w, workspace);
  perform public.update_owner_onboarding_service(owner_id, workspace, 'Harbor & Vine', 2::smallint, false,
    (select o.revision from public.workspace_onboarding o where o.workspace_id = workspace), 'Mert', null, 'Tepebas');

  insert into tests.ids (label, id)
  select w || ':management', d.id from public.departments d where d.workspace_id = workspace and d.system_key = 'management'
  union all
  select w || ':job:' || lower(j.name), j.id from public.jobs j join public.departments d on d.id = j.department_id
  where j.workspace_id = workspace and d.system_key = 'management'
  on conflict (label) do update set id = excluded.id;

  perform tests.as_browser(owner_id, format(
    $sql$insert into public.locations (id, workspace_id, name, short_name, street_address, city, region, postal_code, timezone)
         values (%L, %L, 'Downtown', 'DTN', '120 Water St', 'New York', 'NY', '10038', 'America/New_York'),
                (%L, %L, 'Uptown', 'UPT', '2280 Broadway', 'New York', 'NY', '10024', 'America/New_York')$sql$,
    tests.remember(w || ':D', gen_random_uuid()), workspace,
    tests.remember(w || ':U', gen_random_uuid()), workspace));

  for dept in select value from jsonb_array_elements($j$[
    {"key":"foh","d":{"name":"Front of House","color":"#4478A8"},"jobs":[{"name":"Server","color":"#4478A8"},{"name":"Host","color":"#7C5CC4"},{"name":"Busser","color":"#5B8DB8"}]},
    {"key":"kitchen","d":{"name":"Kitchen","color":"#3C7A68"},"jobs":[{"name":"Line Cook","color":"#D39A36"},{"name":"Prep Cook","color":"#C2703D"},{"name":"Dishwasher","color":"#8A8F98"}]},
    {"key":"bar","d":{"name":"Bar","color":"#A0476B"},"jobs":[{"name":"Bartender","color":"#A0476B"},{"name":"Barback","color":"#C77D9B"}]}
  ]$j$::jsonb) loop
    created := public.create_department_with_jobs_service(owner_id, workspace, dept -> 'd', dept -> 'jobs');
    perform tests.remember(w || ':' || (dept ->> 'key'), (created -> 'department' ->> 'id')::uuid);
    for job in select value from jsonb_array_elements(created -> 'jobs') loop
      perform tests.remember(w || ':job:' || replace(lower(job ->> 'name'), ' ', ''), (job ->> 'id')::uuid);
    end loop;
  end loop;

  perform public.update_owner_onboarding_service(owner_id, workspace, 'Harbor & Vine', 4::smallint, true,
    (select o.revision from public.workspace_onboarding o where o.workspace_id = workspace), 'Mert', null, 'Tepebas');
  perform tests.remember(w || ':owner', (select e.id from public.employee_profiles e where e.workspace_id = workspace and e.user_id = owner_id));
  perform tests.settle();
  return workspace;
end;
$$;

create or replace function tests.demo_person(w text, person_label text, first text, last text, access text,
  locs text[], jobs text[], status text default 'active', start_date text default '')
returns uuid language plpgsql set search_path = '' as $$
declare
  owner_id uuid := tests.user(w || ':owner');
  workspace uuid := tests.id(w);
  user_id uuid := tests.demo_user(w || ':' || person_label, first, last);
  location_ids uuid[] := array(select tests.id(w || ':' || k) from unnest(coalesce(locs, '{}')) k);
  job_ids uuid[] := array(select tests.id(w || ':job:' || k) from unnest(coalesce(jobs, '{}')) k);
  role_id uuid;
  created jsonb;
  employee uuid;
begin
  select r.id into role_id from public.workspace_roles r where r.workspace_id = workspace and r.system_key::text = access;
  created := public.create_employee_command_service(owner_id, workspace, gen_random_uuid(),
    jsonb_build_object('first_name', first, 'middle_name', '', 'last_name', last, 'preferred_name', '',
      'invitation_email', (select u.email from auth.users u where u.id = user_id),
      'start_date', start_date, 'internal_note', '',
      'location_ids', to_jsonb(location_ids), 'primary_location_id', location_ids[1],
      'job_ids', to_jsonb(job_ids), 'primary_job_id', job_ids[1],
      'is_remote', cardinality(location_ids) = 0, 'is_excluded_from_schedule', false, 'expected_revision', null),
    role_id);
  employee := tests.remember(w || ':' || person_label, (created ->> 'id')::uuid);
  perform tests.remember(w || ':' || person_label || ':invitation', (created ->> 'invitation_id')::uuid);
  if status <> 'pending' then
    perform public.accept_employee_invitation_by_id_service(user_id, (created ->> 'invitation_id')::uuid);
  end if;
  perform tests.settle();
  if status in ('active', 'removed') then
    perform public.save_employee_onboarding_profile_service(user_id,
      jsonb_build_object('legal_first_name', first, 'legal_last_name', last, 'phone', '2125550' || lpad((abs(hashtext(person_label)) % 1000)::text, 3, '0'),
        'emergency_contact_name', 'Alex ' || last, 'emergency_contact_relationship', 'Sibling', 'emergency_contact_phone', '2125550100'),
      (select c.revision from public.employee_onboarding_cases c where c.employee_id = employee), workspace);
    perform public.submit_employee_onboarding_service(user_id,
      (select c.revision from public.employee_onboarding_cases c where c.employee_id = employee), workspace);
    perform tests.settle();
  end if;
  if status = 'removed' then
    perform public.terminate_employee_service(owner_id, workspace, employee, (now() at time zone 'America/New_York') - interval '5 minutes', 'America/New_York', 'Moved away', gen_random_uuid());
  end if;
  perform tests.settle();
  return employee;
end;
$$;

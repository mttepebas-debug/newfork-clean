-- Synthetic local-only account. Never copy this credential to a hosted environment.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_sso_user,
  is_anonymous
)
values (
  '00000000-0000-0000-0000-000000000000',
  'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5',
  'authenticated',
  'authenticated',
  'owner@newfork.test',
  crypt('newfork-local', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Local Owner"}'::jsonb,
  now(),
  now(),
  false,
  false
);

insert into auth.identities (
  id,
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values (
  '40000000-0000-4000-8000-000000000001',
  'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5',
  'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5',
  '{"sub":"d9f43e62-e099-48e1-bc6f-a5aabe8e87d5","email":"owner@newfork.test","email_verified":true}'::jsonb,
  'email',
  now(),
  now(),
  now()
);

update auth.users
set
  confirmation_token = '',
  recovery_token = '',
  email_change_token_new = '',
  email_change = '',
  email_change_token_current = '',
  phone = '',
  phone_change = '',
  phone_change_token = '',
  reauthentication_token = ''
where id = 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5';

insert into public.workspaces (id, name, created_by)
values (
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  'Meyhouse',
  'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'
);

insert into public.workspace_memberships (id, workspace_id, user_id, role, status)
values (
  'bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5',
  'owner',
  'active'
);

insert into public.user_workspace_preferences (user_id, active_workspace_id)
values (
  'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'
);

-- The membership above already opened the account row (KK-179 (2)); the seed names it.
insert into public.user_profiles (user_id, display_name)
values ('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5', 'Local Owner')
on conflict (user_id) do update set display_name = excluded.display_name;

insert into public.user_preferences (user_id, theme)
values ('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5', 'system');

insert into public.workspace_onboarding (workspace_id, status, current_step, completed_at, updated_by)
values (
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  'complete',
  4,
  now(),
  'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'
);

-- Synthetic multi-organization memberships for local organization switcher verification.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous
) values (
  '00000000-0000-0000-0000-000000000000',
  'b0000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'external-owner@newfork.test',
  crypt('newfork-local', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"External Owner"}'::jsonb,
  now(), now(), false, false
);

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  '40000000-0000-4000-8000-000000000090',
  'b0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',
  '{"sub":"b0000000-0000-4000-8000-000000000001","email":"external-owner@newfork.test","email_verified":true}'::jsonb,
  'email', now(), now(), now()
);

update auth.users
set confirmation_token = '', recovery_token = '',
  email_change_token_new = '', email_change = '', email_change_token_current = '',
  phone = null, phone_change = '', phone_change_token = '', reauthentication_token = ''
where id = 'b0000000-0000-4000-8000-000000000001';

insert into public.user_profiles (user_id, display_name)
values ('b0000000-0000-4000-8000-000000000001', 'External Owner')
on conflict (user_id) do update set display_name = excluded.display_name;

insert into public.user_preferences (user_id, theme)
values ('b0000000-0000-4000-8000-000000000001', 'system');

insert into public.workspaces (id, name, created_by)
values
  ('7ea5d512-bc7f-4cf3-aad4-2f0815de00fd', 'Employee Demo', 'b0000000-0000-4000-8000-000000000001'),
  ('8ea5d512-bc7f-4cf3-aad4-2f0815de00fd', 'Pending Demo', 'b0000000-0000-4000-8000-000000000001'),
  ('9ea5d512-bc7f-4cf3-aad4-2f0815de00fd', 'Suspended Demo', 'b0000000-0000-4000-8000-000000000001');

insert into public.workspace_memberships (id, workspace_id, user_id, role, status)
values
  ('b1000000-0000-4000-8000-000000000001', '7ea5d512-bc7f-4cf3-aad4-2f0815de00fd', 'b0000000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('b1000000-0000-4000-8000-000000000002', '8ea5d512-bc7f-4cf3-aad4-2f0815de00fd', 'b0000000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('b1000000-0000-4000-8000-000000000003', '9ea5d512-bc7f-4cf3-aad4-2f0815de00fd', 'b0000000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('b1000000-0000-4000-8000-000000000004', '7ea5d512-bc7f-4cf3-aad4-2f0815de00fd', 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5', 'employee', 'active'),
  ('b1000000-0000-4000-8000-000000000005', '8ea5d512-bc7f-4cf3-aad4-2f0815de00fd', 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5', 'employee', 'pending_activation'),
  ('b1000000-0000-4000-8000-000000000006', '9ea5d512-bc7f-4cf3-aad4-2f0815de00fd', 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5', 'manager', 'suspended');

insert into public.workspace_onboarding (workspace_id, status, current_step, completed_at, updated_by)
values
  ('7ea5d512-bc7f-4cf3-aad4-2f0815de00fd', 'complete', 4, now(), 'b0000000-0000-4000-8000-000000000001'),
  ('8ea5d512-bc7f-4cf3-aad4-2f0815de00fd', 'complete', 4, now(), 'b0000000-0000-4000-8000-000000000001'),
  ('9ea5d512-bc7f-4cf3-aad4-2f0815de00fd', 'complete', 4, now(), 'b0000000-0000-4000-8000-000000000001');

insert into public.locations (
  id, workspace_id, name, street_address, city, region, postal_code,
  country_code, timezone, sort_order, short_name
) values (
  '71000000-0000-4000-8000-000000000001',
  '7ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  'Employee Demo Floor', '200 Demo St', 'Los Angeles', 'CA', '90001',
  'US', 'America/Los_Angeles', 0, 'DEMO'
);

insert into public.departments (id, workspace_id, name, color)
values (
  '72000000-0000-4000-8000-000000000001',
  '7ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  'Service', '#3C7A68'
);

insert into public.jobs (id, workspace_id, department_id, name, color)
values (
  '73000000-0000-4000-8000-000000000001',
  '7ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  '72000000-0000-4000-8000-000000000001',
  'Team Member', '#4478A8'
);

insert into public.employee_profiles (
  id, workspace_id, user_id, employee_code, first_name, last_name,
  preferred_name, invitation_email, created_by
) values (
  'f59127f6-ce6a-44d6-aa10-0387e44805f8',
  '7ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5',
  'E-0001', 'Local', 'Switcher', '', 'owner@newfork.test',
  'b0000000-0000-4000-8000-000000000001'
);

insert into public.employee_location_assignments (
  id, workspace_id, employee_id, location_id, is_primary, created_by
) values (
  '74000000-0000-4000-8000-000000000001',
  '7ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  'f59127f6-ce6a-44d6-aa10-0387e44805f8',
  '71000000-0000-4000-8000-000000000001',
  true,
  'b0000000-0000-4000-8000-000000000001'
);

insert into public.employee_job_assignments (
  id, workspace_id, employee_id, job_id, is_primary, created_by
) values (
  '75000000-0000-4000-8000-000000000001',
  '7ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  'f59127f6-ce6a-44d6-aa10-0387e44805f8',
  '73000000-0000-4000-8000-000000000001',
  true,
  'b0000000-0000-4000-8000-000000000001'
);

-- Synthetic pending employee used only for local Phase 4B browser verification.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous
) values (
  '00000000-0000-0000-0000-000000000000',
  'e44f1741-9d58-4e38-8a62-3bc1c27bcd21',
  'authenticated', 'authenticated', 'employee@newfork.test',
  crypt('newfork-employee-local', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Local Employee"}'::jsonb,
  now(), now(), false, false
);

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  '40000000-0000-4000-8000-000000000002',
  'e44f1741-9d58-4e38-8a62-3bc1c27bcd21',
  'e44f1741-9d58-4e38-8a62-3bc1c27bcd21',
  '{"sub":"e44f1741-9d58-4e38-8a62-3bc1c27bcd21","email":"employee@newfork.test","email_verified":true}'::jsonb,
  'email', now(), now(), now()
);

update auth.users set confirmation_token = '', recovery_token = '',
  email_change_token_new = '', email_change = '', email_change_token_current = '',
  phone = null, phone_change = '', phone_change_token = '', reauthentication_token = ''
where id = 'e44f1741-9d58-4e38-8a62-3bc1c27bcd21';

insert into public.user_profiles (user_id, display_name)
values ('e44f1741-9d58-4e38-8a62-3bc1c27bcd21', 'Local Employee')
on conflict (user_id) do update set display_name = excluded.display_name;
insert into public.user_preferences (user_id, theme)
values ('e44f1741-9d58-4e38-8a62-3bc1c27bcd21', 'system');
insert into public.workspace_memberships (
  id, workspace_id, user_id, role, status, all_locations
) values (
  'efea5f44-d86a-4650-94d0-5e63840fcfe1',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  'e44f1741-9d58-4e38-8a62-3bc1c27bcd21',
  'employee', 'pending_activation', true
);
insert into public.employee_profiles (
  id, workspace_id, user_id, employee_code, first_name, last_name,
  preferred_name, invitation_email, created_by
) values (
  'f59127f6-ce6a-44d6-aa10-0387e44805f7',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  'e44f1741-9d58-4e38-8a62-3bc1c27bcd21',
  'E-0001', 'Local', 'Employee', '', 'employee@newfork.test',
  'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'
);
select public.initialize_employee_onboarding_service('e44f1741-9d58-4e38-8a62-3bc1c27bcd21');

-- Synthetic Phase 5A parity fixture. Dates follow the current local schedule week.
do $$
declare
  schedule_week date := current_date - (extract(isodow from current_date)::integer - 1);
  friday_detail text;
  demo record;
begin
  insert into public.locations (
    id, workspace_id, name, street_address, city, region, postal_code,
    country_code, timezone, sort_order, short_name
  ) values
    ('11000000-0000-4000-8000-000000000001', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', 'Main Dining', '100 Main St', 'Los Angeles', 'CA', '90001', 'US', 'America/Los_Angeles', 0, 'MAIN'),
    ('11000000-0000-4000-8000-000000000002', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', 'Garden Room', '100 Main St', 'Los Angeles', 'CA', '90001', 'US', 'America/Los_Angeles', 10, 'GARDEN');

  insert into public.departments (id, workspace_id, name, color) values
    ('12000000-0000-4000-8000-000000000001', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', 'Dining Room', '#3C7A68'),
    ('12000000-0000-4000-8000-000000000002', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', 'Kitchen', '#8A6240');

  insert into public.jobs (id, workspace_id, department_id, name, color) values
    ('13000000-0000-4000-8000-000000000001', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '12000000-0000-4000-8000-000000000001', 'Server', '#4478A8'),
    ('13000000-0000-4000-8000-000000000002', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '12000000-0000-4000-8000-000000000001', 'Bartender', '#7A5DA8'),
    ('13000000-0000-4000-8000-000000000003', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '12000000-0000-4000-8000-000000000002', 'Line Cook', '#A85D4A');

  insert into public.shift_types (
    id, workspace_id, name, color, default_start_time, default_end_time, sort_order
  ) values
    ('14000000-0000-4000-8000-000000000001', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', 'Open', '#4E8B72', '09:00', '17:00', 0),
    ('14000000-0000-4000-8000-000000000002', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', 'Dinner', '#5279A6', '15:00', '23:00', 10),
    ('14000000-0000-4000-8000-000000000003', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', 'Close', '#7358A0', '18:00', '02:00', 20);

  insert into public.employee_profiles (
    id, workspace_id, employee_code, first_name, last_name, preferred_name, start_date, created_by
  ) values
    ('15000000-0000-4000-8000-000000000001', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', 'E-0002', 'Alex', 'Kim', '', schedule_week - 90, 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'),
    ('15000000-0000-4000-8000-000000000002', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', 'E-0003', 'Jordan', 'Lee', '', schedule_week - 60, 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'),
    ('15000000-0000-4000-8000-000000000003', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', 'E-0004', 'Sam', 'Rivera', '', schedule_week - 30, 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5');

  insert into public.employee_location_assignments (
    id, workspace_id, employee_id, location_id, is_primary, created_by
  ) values
    ('16000000-0000-4000-8000-000000000001', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '15000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', true, 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'),
    ('16000000-0000-4000-8000-000000000002', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '15000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000001', true, 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'),
    ('16000000-0000-4000-8000-000000000003', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '15000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000002', false, 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'),
    ('16000000-0000-4000-8000-000000000004', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '15000000-0000-4000-8000-000000000003', '11000000-0000-4000-8000-000000000002', true, 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5');

  insert into public.employee_job_assignments (
    id, workspace_id, employee_id, job_id, is_primary, created_by
  ) values
    ('17000000-0000-4000-8000-000000000001', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '15000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', true, 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'),
    ('17000000-0000-4000-8000-000000000002', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '15000000-0000-4000-8000-000000000002', '13000000-0000-4000-8000-000000000002', true, 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'),
    ('17000000-0000-4000-8000-000000000003', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '15000000-0000-4000-8000-000000000003', '13000000-0000-4000-8000-000000000003', true, 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5');

  -- Alex Kim marked every Friday as a day they cannot work.
  insert into public.employee_weekly_preferences (workspace_id, employee_id, preference, revision, updated_by)
  values ('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '15000000-0000-4000-8000-000000000001',
    jsonb_set(public.empty_weekly_preference('time_range'), '{days,5,all_day}', 'true'),
    1, 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5');

  -- A closed day is an important date whose location is Closed (FB-6.7,
  -- BL-530, EKRAN-08); the Schedule reads its closures from the published ones.
  insert into public.important_dates (
    id, workspace_id, location_id, location_ids, title, type, starts_on, ends_on,
    location_days, status, created_by, updated_by
  ) values (
    '19000000-0000-4000-8000-000000000001', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    '11000000-0000-4000-8000-000000000002', array['11000000-0000-4000-8000-000000000002']::uuid[],
    'Private event setup', 'event', schedule_week + 3, schedule_week + 3,
    '{"11000000-0000-4000-8000-000000000002": {"status": "closed"}}'::jsonb,
    'published', 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5', 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'
  );

  -- The demo week. Removed on 2026-09-22 because it no longer loaded under the
  -- schedule's rules, and put back the same day, rewritten to satisfy them:
  -- seven test suites build on these exact rows, and one week kept here beats
  -- seven copies kept in seven files. The owner's own Meyhouse workspace, loaded
  -- from supabase/local-fixture, has no shifts; this one is the test fixture.


  insert into public.schedule_location_publications (
    id, workspace_id, location_id, week_start, version_number, status, published_by, published_at
  ) values
    ('21000000-0000-4000-8000-000000000001', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '11000000-0000-4000-8000-000000000001', schedule_week, 1, 'current', 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5', now() - interval '1 day'),
    ('21000000-0000-4000-8000-000000000002', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '11000000-0000-4000-8000-000000000002', schedule_week, 1, 'current', 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5', now() - interval '1 day');

  -- Two of these are on purpose: Alex Kim working the Friday they said they
  -- could not, and Sam Rivera working the day their location is closed.
  -- Publishing refuses each until a manager's acceptance is on record, and
  -- records it against an assessment it computes itself -- so each row is
  -- tried, and a refusal of that kind is answered by recording exactly the
  -- assessment the refusal carried, the way a manager's "publish anyway" would.
  for demo in
    select * from (values
      ('22000000-0000-4000-8000-000000000001', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '11000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', '14000000-0000-4000-8000-000000000001', schedule_week, '09:00', '17:00', '', '23000000-0000-4000-8000-000000000001'),
      ('22000000-0000-4000-8000-000000000002', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '11000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000002', '13000000-0000-4000-8000-000000000002', '14000000-0000-4000-8000-000000000002', schedule_week + 1, '15:00', '23:00', '', '23000000-0000-4000-8000-000000000002'),
      ('22000000-0000-4000-8000-000000000003', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '11000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000002', '13000000-0000-4000-8000-000000000002', null, schedule_week + 2, '18:00', '22:00', 'Private booking', '23000000-0000-4000-8000-000000000003'),
      ('22000000-0000-4000-8000-000000000004', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '11000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', '14000000-0000-4000-8000-000000000002', schedule_week + 4, '15:00', '23:00', '', '23000000-0000-4000-8000-000000000004'),
      ('22000000-0000-4000-8000-000000000005', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '11000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', null, '13000000-0000-4000-8000-000000000001', '14000000-0000-4000-8000-000000000003', schedule_week + 5, '18:00', '02:00', 'Open shift', '23000000-0000-4000-8000-000000000005'),
      ('22000000-0000-4000-8000-000000000006', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '11000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000002', '15000000-0000-4000-8000-000000000003', '13000000-0000-4000-8000-000000000003', '14000000-0000-4000-8000-000000000001', schedule_week + 2, '09:00', '17:00', '', '23000000-0000-4000-8000-000000000006'),
      ('22000000-0000-4000-8000-000000000007', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '11000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000002', '15000000-0000-4000-8000-000000000003', '13000000-0000-4000-8000-000000000003', '14000000-0000-4000-8000-000000000002', schedule_week + 3, '15:00', '23:00', 'Closure conflict fixture', '23000000-0000-4000-8000-000000000007')
    ) v(id, workspace_id, location_id, publication_id, employee_id, job_id,
        shift_type_id, scheduled_date, start_time, end_time, note, source_shift_id)
  loop
    begin
      insert into public.schedule_published_shifts (
        id, workspace_id, location_id, publication_id, employee_id, job_id,
        shift_type_id, scheduled_date, start_time, end_time, note, source_shift_id
      ) values (
        demo.id::uuid, demo.workspace_id::uuid, demo.location_id::uuid, demo.publication_id::uuid,
        demo.employee_id::uuid, demo.job_id::uuid, demo.shift_type_id::uuid, demo.scheduled_date,
        demo.start_time::time, demo.end_time::time, demo.note, demo.source_shift_id::uuid);
    exception when sqlstate '23514' then
      get stacked diagnostics friday_detail = pg_exception_detail;
      insert into public.schedule_availability_overrides(workspace_id,shift_id,employee_id,location_id,assessment_fingerprint,assessment,reason,actor_user_id)
      values (demo.workspace_id::uuid, demo.source_shift_id::uuid, demo.employee_id::uuid, demo.location_id::uuid,
              friday_detail::jsonb->>'fingerprint', friday_detail::jsonb,
              'Synthetic demo: the manager accepted this on purpose.', 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5');
      insert into public.schedule_published_shifts (
        id, workspace_id, location_id, publication_id, employee_id, job_id,
        shift_type_id, scheduled_date, start_time, end_time, note, source_shift_id
      ) values (
        demo.id::uuid, demo.workspace_id::uuid, demo.location_id::uuid, demo.publication_id::uuid,
        demo.employee_id::uuid, demo.job_id::uuid, demo.shift_type_id::uuid, demo.scheduled_date,
        demo.start_time::time, demo.end_time::time, demo.note, demo.source_shift_id::uuid);
    end;
  end loop;

end
$$;

-- Reproducible active employee with a sign-in (Alex Kim), for browser checks
-- and the schedule tests that use membership a6000000-...-0003.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous
) values (
  '00000000-0000-0000-0000-000000000000',
  'a6000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'time.employee@newfork.test',
  crypt('newfork-time-local', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Alex Kim"}'::jsonb,
  now(), now(), false, false
);

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  'a6000000-0000-4000-8000-000000000002',
  'a6000000-0000-4000-8000-000000000001',
  'a6000000-0000-4000-8000-000000000001',
  '{"sub":"a6000000-0000-4000-8000-000000000001","email":"time.employee@newfork.test","email_verified":true}'::jsonb,
  'email', now(), now(), now()
);

update auth.users set confirmation_token = '', recovery_token = '',
  email_change_token_new = '', email_change = '', email_change_token_current = '',
  phone = null, phone_change = '', phone_change_token = '', reauthentication_token = ''
where id = 'a6000000-0000-4000-8000-000000000001';

insert into public.user_profiles (user_id, display_name)
values ('a6000000-0000-4000-8000-000000000001', 'Alex Kim')
on conflict (user_id) do update set display_name = excluded.display_name;
insert into public.user_preferences (user_id, theme)
values ('a6000000-0000-4000-8000-000000000001', 'system');
insert into public.workspace_memberships (
  id, workspace_id, user_id, role, status, all_locations
) values (
  'a6000000-0000-4000-8000-000000000003',
  '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
  'a6000000-0000-4000-8000-000000000001',
  'employee', 'active', false
);
update public.employee_profiles
set user_id = 'a6000000-0000-4000-8000-000000000001'
where id = '15000000-0000-4000-8000-000000000001';

-- Every owner here finished setup, and setup files the owner the way it files
-- anybody else (BL-080): an employee record under the name its first step
-- asked for, that name as their legal name, and every location and job. This is
-- the state app_private.apply_owner_onboarding_update leaves; written out here
-- because these workspaces are seeded as already finished.
do $$
declare
  owner_row record;
begin
  for owner_row in
    select * from (values
      ('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'::uuid, 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'::uuid, '0e000000-0000-4000-8000-000000000001'::uuid, 'E-0005', 'Local', 'Owner', 'owner@newfork.test'),
      ('7ea5d512-bc7f-4cf3-aad4-2f0815de00fd'::uuid, 'b0000000-0000-4000-8000-000000000001'::uuid, '0e000000-0000-4000-8000-000000000002'::uuid, 'E-0002', 'External', 'Owner', 'external-owner@newfork.test'),
      ('8ea5d512-bc7f-4cf3-aad4-2f0815de00fd'::uuid, 'b0000000-0000-4000-8000-000000000001'::uuid, '0e000000-0000-4000-8000-000000000003'::uuid, 'E-0001', 'External', 'Owner', 'external-owner@newfork.test'),
      ('9ea5d512-bc7f-4cf3-aad4-2f0815de00fd'::uuid, 'b0000000-0000-4000-8000-000000000001'::uuid, '0e000000-0000-4000-8000-000000000004'::uuid, 'E-0001', 'External', 'Owner', 'external-owner@newfork.test')
    ) seeded (workspace_id, user_id, employee_id, employee_code, first_name, last_name, email)
  loop
    insert into public.employee_profiles (
      id, workspace_id, user_id, employee_code, first_name, last_name,
      preferred_name, invitation_email, created_by
    ) values (
      owner_row.employee_id, owner_row.workspace_id, owner_row.user_id,
      owner_row.employee_code, owner_row.first_name, owner_row.last_name,
      '', owner_row.email, owner_row.user_id
    );
    insert into public.employee_private_profiles (
      employee_id, workspace_id, legal_first_name, legal_last_name
    ) values (
      owner_row.employee_id, owner_row.workspace_id, owner_row.first_name, owner_row.last_name
    );
    perform app_private.open_owner_record_to_everything(
      owner_row.workspace_id, owner_row.employee_id, owner_row.user_id
    );
  end loop;
end;
$$;

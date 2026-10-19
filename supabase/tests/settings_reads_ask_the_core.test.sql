begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- The eight Settings pages read through the API (FB-6.1.9): Locations, Jobs,
-- Shift types, Shift labels, Important dates (a page under Announcements since
-- EKRAN-08, still read with its Settings permission), Roles, Documents and
-- Acknowledgements. Each page has one entry point, and each entry point asks
-- the authorization core first, so somebody who may not read the page gets
-- 42501 with an authz.* hint instead of an empty list. Who may read what, cell
-- by cell, is in authorization_matrix.test.sql; this file pins what the matrix
-- does not: the answer's shape, a manager-type role that holds the read
-- permissions, and an owner who has not finished setting up.

select tests.world('s');
select tests.world('t');
select tests.role('s', 'catalog lead', 'manager', array(
  select rp.permission_key
  from public.workspace_role_permissions rp
  join public.workspace_roles r on r.id = rp.role_id
  where r.workspace_id = tests.id('s') and r.system_key = 'manager'
) || array['settings.jobs.read', 'settings.shift_catalog.read', 'documents.read']);
select tests.person('s', 'lale', 'catalog lead', array['K'], array['cook']);
select tests.person('s', 'nuri', 'catalog lead', null, null);
select tests.person('s', 'emre', 'employee', array['K'], array['cook']);
-- Invited to the custom role, not accepted yet: a pending invitation.
select tests.person('s', 'pia', 'catalog lead', array['K'], array['cook'], 'pending');

-- An owner halfway through setup: the workspace is still a draft, with no
-- location yet. The setup wizard reads locations, departments and jobs.
select tests.new_user('d:owner', 'Dora Draft');
select tests.remember('d', public.create_owner_workspace_service(tests.user('d:owner'), 'World d'));

insert into public.shift_types (workspace_id, name, default_start_time, default_end_time, sort_order)
values (tests.id('s'), 'Close', '17:00', '01:00', 1),
       (tests.id('s'), 'Open', '09:00', '15:00', 0);
select tests.shift_label('s', 'Training');
-- ponytail: a post on Important Dates put in place directly; writing one is the
-- announcement tests' job (EKRAN-08: Important Dates is a page under Announcements).
with made as (
  insert into public.announcements (workspace_id, title, body, category, status, starts_on, ends_on, on_important_dates,
    time_zone, created_by, updated_by, published_by, published_at)
  values (tests.id('s'), 'Inventory', '', 'event', 'published', tests.week(1), tests.week(1), true, 'Europe/Istanbul',
    tests.user('s:owner'), tests.user('s:owner'), tests.user('s:owner'), now())
  returning id)
insert into public.announcement_locations (workspace_id, announcement_id, location_id, day)
select tests.id('s'), made.id, place, 'open' from made, unnest(array[tests.id('s:K'), tests.id('s:B')]) place;

create temporary table reader (name text primary key);
insert into reader values
  ('list_settings_locations_service'), ('read_settings_jobs_service'),
  ('list_settings_shift_types_service'), ('list_settings_shift_labels_service'),
  ('get_important_dates_service'), ('read_role_workspace_service'),
  ('list_settings_document_types_service'), ('read_signature_settings_service');

-- What one call answers: 'allowed', or the refusal as '<sqlstate> <hint>'.
create function pg_temp.answer(service text, actor uuid, w uuid)
returns text
language plpgsql
as $$
declare
  state text;
  hint text;
begin
  execute format('select public.%I($1, $2)', service) using actor, w;
  return 'allowed';
exception when others then
  get stacked diagnostics state = returned_sqlstate, hint = pg_exception_hint;
  return state || ' ' || coalesce(hint, '');
end;
$$;

-- 1. Saying no ----------------------------------------------------------------------

select is(
  array(select r.name || ': ' || pg_temp.answer(r.name, tests.user('s:emre'), tests.id('s')) from reader r order by 1),
  array(select r.name || ': 42501 authz.missing_permission' from reader r order by 1),
  'an employee is refused every Settings read with a reason'
);
select is(
  array(select r.name || ': ' || pg_temp.answer(r.name, tests.user('t:owner'), tests.id('s')) from reader r order by 1),
  array(select r.name || ': 42501 authz.not_member' from reader r order by 1),
  'the owner of another workspace is not a member here'
);
select is(
  pg_temp.answer('read_role_workspace_service', tests.user('s:lale'), tests.id('s')),
  '42501 authz.missing_permission',
  'a manager whose role does not hold roles.read is refused Roles'
);

-- 2. A manager-type role that holds the read permissions ---------------------------

select is(
  array(select r.name || ': ' || pg_temp.answer(r.name, tests.user('s:lale'), tests.id('s'))
        from reader r where r.name not in ('read_role_workspace_service', 'list_settings_locations_service') order by 1),
  array(select r.name || ': allowed' from reader r
        where r.name not in ('read_role_workspace_service', 'list_settings_locations_service') order by 1),
  'a manager whose role holds the read permissions reads the catalog pages'
);
-- Settings > Locations is for owners and admins only, no manager role may hold
-- its read (Mert 2026-10-12, BL-176; organization_settings_stay_with_owner_and_admin).
select is(
  pg_temp.answer('list_settings_locations_service', tests.user('s:lale'), tests.id('s')),
  '42501 authz.missing_permission',
  'a manager is refused Settings > Locations, where they work too'
);
select is(
  pg_temp.answer('list_settings_locations_service', tests.user('s:nuri'), tests.id('s')),
  '42501 authz.missing_permission',
  'and so is a manager who works nowhere'
);
select is(
  pg_temp.answer('read_settings_jobs_service', tests.user('s:nuri'), tests.id('s')),
  'allowed',
  'a manager who works nowhere still reads the job catalog'
);

-- 3. An owner who has not finished setting up --------------------------------------

select is(
  (select w.lifecycle_status::text from public.workspaces w where w.id = tests.id('d')),
  'draft',
  'the setup owner''s workspace is still a draft'
);
select is(
  array(select r.name || ': ' || pg_temp.answer(r.name, tests.user('d:owner'), tests.id('d')) from reader r order by 1),
  array(select r.name || ': allowed' from reader r order by 1),
  'an owner halfway through setup reads every Settings page'
);
select is(
  public.list_settings_locations_service(tests.user('d:owner'), tests.id('d')),
  '[]'::jsonb,
  'an owner with no location yet reads an empty list, not a refusal'
);

-- 4. What comes back ------------------------------------------------------------------

select is(
  (select array_agg(k order by k) from jsonb_object_keys(
    public.list_settings_locations_service(tests.user('s:owner'), tests.id('s')) -> 0) k),
  array['archived_at', 'city', 'country_code', 'id', 'name', 'phone', 'postal_code', 'region',
        'short_name', 'sort_order', 'street_address', 'timezone', 'workspace_id'],
  'a location carries the columns Settings > Locations shows'
);
select is(
  array(select l ->> 'name' from jsonb_array_elements(
    public.list_settings_locations_service(tests.user('s:owner'), tests.id('s'))) l),
  array['Besiktas', 'Kadikoy'],
  'the owner reads every location, in order'
);

select is(
  (select array_agg(k order by k) from jsonb_object_keys(
    public.read_settings_jobs_service(tests.user('s:owner'), tests.id('s')) -> 'jobs' -> 0) k),
  array['archived_at', 'color', 'department_id', 'id', 'lineup_icons', 'name', 'system_key', 'workspace_id'],
  'a job carries the columns Settings > Jobs shows'
);
select is(
  array(select (j ->> 'name') || coalesce(':' || (j ->> 'system_key'), '') from jsonb_array_elements(
    public.read_settings_jobs_service(tests.user('s:owner'), tests.id('s')) -> 'jobs') j),
  array['Assistant Manager', 'Cook', 'General Manager', 'Owner:owner', 'Server'],
  'Settings > Jobs reads the jobs A to Z, the kept Owner job marked as the system''s'
);
select is(
  array(select (d ->> 'name') || coalesce(':' || (d ->> 'system_key'), '') from jsonb_array_elements(
    public.read_settings_jobs_service(tests.user('s:owner'), tests.id('s')) -> 'departments') d),
  array['Kitchen', 'Management:management'],
  'and the departments A to Z, in the same answer'
);

select is(
  (select jsonb_agg(jsonb_build_object('name', t ->> 'name', 'start', t -> 'default_start_time',
     'end', t -> 'default_end_time', 'crosses_midnight', t -> 'crosses_midnight'))
   from jsonb_array_elements(public.list_settings_shift_types_service(tests.user('s:owner'), tests.id('s'))) t),
  '[{"name": "Open", "start": "09:00", "end": "15:00", "crosses_midnight": false},
    {"name": "Close", "start": "17:00", "end": "01:00", "crosses_midnight": true}]'::jsonb,
  'shift types come in order, their default hours as HH:MM'
);
select is(
  array(select l ->> 'name' from jsonb_array_elements(
    public.list_settings_shift_labels_service(tests.user('s:owner'), tests.id('s'))) l),
  array['Training'],
  'Settings > Shift labels reads the labels'
);

select is(
  (select array(select l ->> 'name' from jsonb_array_elements(d -> 'locations') l order by 1)
   from jsonb_array_elements(
     public.get_important_dates_service(tests.user('s:lale'), tests.id('s')) -> 'dates') d),
  array['Besiktas', 'Kadikoy'],
  'an important date names its locations, even one the reader does not work at'
);
select is(
  array(select l ->> 'name' from jsonb_array_elements(
    public.get_announcements_service(tests.user('s:lale'), tests.id('s')) -> 'locations') l),
  array['Kadikoy'],
  'the drawer''s location list offers a manager the locations they may write a post for'
);
select is(
  array(select l ->> 'name' from jsonb_array_elements(
    public.get_announcements_service(tests.user('s:owner'), tests.id('s')) -> 'locations') l),
  array['Besiktas', 'Kadikoy'],
  'and the owner every location'
);

-- Settings > Roles: the whole permission catalog, every role row as stored
-- plus what the role editor shows about it.
create temporary table roles_read as
select public.read_role_workspace_service(tests.user('s:owner'), tests.id('s')) as body;
select is(
  (select body -> 'permissions' from roles_read),
  (select jsonb_agg(p order by p.sort_order) from public.permissions p),
  'Settings > Roles reads the whole permission catalog, in order'
);
select is(
  array(select r ->> 'name' from roles_read, jsonb_array_elements(body -> 'roles') r),
  array(select r.name from public.workspace_roles r where r.workspace_id = tests.id('s') order by r.sort_order, r.name),
  'Settings > Roles reads every role of the workspace, in order'
);
select is(
  array(select r ->> 'name' from roles_read, jsonb_array_elements(body -> 'roles') r
        where r - array['permission_keys', 'member_count', 'pending_invite_count', 'blocking_member_count',
                        'blocking_invite_count', 'editable', 'deletable']
          is distinct from (select to_jsonb(w) from public.workspace_roles w where w.id = (r ->> 'id')::uuid)),
  '{}'::text[],
  'each role carries its stored row and nothing else besides the editor''s seven fields'
);
select is(
  array(select r ->> 'name' from roles_read, jsonb_array_elements(body -> 'roles') r
        where r -> 'permission_keys' is distinct from coalesce((
          select jsonb_agg(g.permission_key order by g.permission_key)
          from public.workspace_role_permissions g where g.role_id = (r ->> 'id')::uuid), '[]'::jsonb)),
  '{}'::text[],
  'each role lists exactly its granted permissions'
);
select is(
  (select jsonb_build_object('member_count', r -> 'member_count', 'pending_invite_count', r -> 'pending_invite_count',
     'blocking_member_count', r -> 'blocking_member_count', 'blocking_invite_count', r -> 'blocking_invite_count',
     'editable', r -> 'editable', 'deletable', r -> 'deletable')
   from roles_read, jsonb_array_elements(body -> 'roles') r where r ->> 'name' = 'catalog lead'),
  jsonb_build_object('member_count', 2, 'pending_invite_count', 1, 'blocking_member_count', 2,
    'blocking_invite_count', 3, 'editable', true, 'deletable', false),
  'the custom role counts its two members and one pending invitation, and cannot be deleted while used'
);
select is(
  (select jsonb_build_object('editable', r -> 'editable', 'deletable', r -> 'deletable')
   from roles_read, jsonb_array_elements(body -> 'roles') r where r ->> 'name' = 'Owner'),
  '{"editable": false, "deletable": false}'::jsonb,
  'the owner role is neither editable nor deletable'
);

select is(
  jsonb_typeof(public.list_settings_document_types_service(tests.user('s:owner'), tests.id('s'))),
  'array',
  'Settings > Documents reads a list'
);
select is(
  (select array_agg(k order by k) from jsonb_object_keys(
    public.read_signature_settings_service(tests.user('s:owner'), tests.id('s'))) k),
  array['policies', 'templates', 'versions'],
  'Settings > Acknowledgements reads policies, templates and versions in one answer'
);

select * from finish();
rollback;

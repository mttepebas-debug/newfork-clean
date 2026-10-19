begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- What a browser session (anon or authenticated) may do directly, read from the
-- live catalog. Every other call goes through the API as service_role. A new
-- grant fails here until it is added to the list on purpose.

select is(
  array(
    select n.nspname || '.' || p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'app_private')
      and p.prosecdef
      and (has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('public', p.oid, 'EXECUTE'))
    order by 1
  ),
  '{}'::text[],
  'no SECURITY DEFINER function is executable by anon or PUBLIC'
);

select set_eq(
  $$
    select n.nspname || '.' || p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'app_private')
      and p.prosecdef
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  $$,
  array[
    -- RLS helpers the policies call.
    'app_private.can_access_location',
    'app_private.can_manage_workspace',
    'app_private.is_workspace_member',
    'app_private.rls_can',
    'app_private.workspace_allows_interactive_access',
    'app_private.workspace_has_permission',
    'app_private.workspace_role_for'
  ],
  'authenticated executes only the allowed SECURITY DEFINER functions'
);

select set_eq(
  $$
    select grantee || ' ' || table_name || ' ' || privilege_type
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('anon', 'authenticated', 'PUBLIC')
      and privilege_type <> 'SELECT'
  $$,
  array[
    -- Settings > Organization (updates are column grants, checked below)
    'authenticated departments INSERT',
    'authenticated jobs INSERT',
    'authenticated locations INSERT',
    'authenticated shift_labels INSERT',
    'authenticated shift_types INSERT',
    -- the signed-in person's own account
    'authenticated user_preferences INSERT', 'authenticated user_preferences UPDATE',
    'authenticated user_profiles INSERT', 'authenticated user_profiles UPDATE'
  ],
  'the browser writes only the allowed tables'
);

select set_eq(
  $$
    select column_name
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'workspaces'
      and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE')
  $$,
  array[
    'name', 'logo_storage_path', 'logo_file_name', 'logo_updated_at',
    'schedule_logo_scale', 'schedule_logo_offset_x', 'schedule_logo_offset_y', 'updated_at'
  ],
  'the browser updates only the workspace name and logo columns'
);

-- A catalog row stays in its workspace: the browser updates only the columns
-- the Settings forms send, never workspace_id, id or created_at (GUVENLIK-A GA-1).
select set_eq(
  $$
    select table_name || '.' || column_name
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name in ('departments', 'jobs', 'locations', 'shift_labels', 'shift_types')
      and grantee = 'authenticated'
      and privilege_type = 'UPDATE'
  $$,
  array[
    'departments.name', 'departments.color', 'departments.archived_at', 'departments.updated_at',
    'jobs.name', 'jobs.color', 'jobs.department_id', 'jobs.archived_at', 'jobs.updated_at',
    'locations.name', 'locations.short_name', 'locations.street_address', 'locations.city',
    'locations.region', 'locations.postal_code', 'locations.country_code', 'locations.timezone',
    'locations.phone', 'locations.archived_at', 'locations.updated_at',
    'shift_labels.name', 'shift_labels.color', 'shift_labels.archived_at', 'shift_labels.updated_at',
    'shift_types.name', 'shift_types.color', 'shift_types.default_start_time',
    'shift_types.default_end_time', 'shift_types.time_options', 'shift_types.archived_at', 'shift_types.updated_at'
  ],
  'the browser updates only the catalog columns the Settings forms send'
);

-- ponytail: the web reads only the catalog tables, the account's own rows and
-- roles directly; the rest of this list is either needed by RLS policies and
-- realtime or unused. Stage 6 trims it; until then it cannot grow. FB-6.1.9
-- took out the tables Settings now reads through the API (document types,
-- acknowledgements, role grants, the permission catalog).
select set_eq(
  $$
    select table_name
    from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated', 'PUBLIC') and privilege_type = 'SELECT'
  $$,
  array[
    'account_organization_history', 'audit_events', 'departments',
    'employee_onboarding_settings', 'jobs', 'locations',
    'shift_labels', 'shift_types', 'user_preferences', 'user_profiles', 'user_workspace_preferences',
    'workspace_closure_requests', 'workspace_entitlements', 'workspace_memberships', 'workspace_onboarding',
    'workspace_ownership_transfers', 'workspace_roles',
    'workspace_scheduling_settings', 'workspaces'
  ],
  'the browser reads only the allowed tables'
);

select ok(
  exists (
    select 1
    from pg_default_acl d
    where d.defaclrole = 'postgres'::regrole
      and d.defaclnamespace = 0
      and d.defaclobjtype = 'f'
      and not exists (select 1 from aclexplode(d.defaclacl) a where a.grantee = 0)
  ),
  'functions postgres creates start without PUBLIC execute'
);

create function public.browser_privileges_probe() returns integer
language sql security definer set search_path = '' as 'select 1';
create function app_private.browser_privileges_probe() returns integer
language sql security definer set search_path = '' as 'select 1';
create table public.browser_privileges_probe (id integer);

select ok(
  not has_function_privilege('anon', 'public.browser_privileges_probe()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.browser_privileges_probe()', 'EXECUTE'),
  'a new public function is not callable from the browser until granted'
);
select ok(
  not has_function_privilege('anon', 'app_private.browser_privileges_probe()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'app_private.browser_privileges_probe()', 'EXECUTE'),
  'a new app_private function is not callable from the browser until granted'
);
select ok(
  not has_table_privilege('authenticated', 'public.browser_privileges_probe', 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
  and not has_table_privilege('anon', 'public.browser_privileges_probe', 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'),
  'a new public table is not writable from the browser until granted'
);

select * from finish();
rollback;

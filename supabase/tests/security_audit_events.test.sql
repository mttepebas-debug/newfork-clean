begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select has_table('app_private', 'security_audit_events', 'restricted security audit table exists');
select has_function(
  'app_private',
  'record_security_audit_event_service',
  array['uuid', 'uuid', 'text', 'text', 'text', 'text', 'jsonb'],
  'restricted security audit writer exists'
);
select col_is_pk('app_private', 'security_audit_events', 'id', 'security audit events have a primary key');

set local role authenticated;
select throws_ok(
  $$select count(*) from app_private.security_audit_events$$,
  '42501',
  null,
  'authenticated users cannot read restricted security audit events'
);
select throws_ok(
  $$select app_private.record_security_audit_event_service(null, null, 'tenant.foreign_id_attempt', 'employees.api', 'employee', 'foreign-id', '{}')$$,
  '42501',
  null,
  'authenticated users cannot write restricted security audit events'
);
reset role;

-- BL-288: the table is shared with every earlier run, so this run's event
-- carries its own resource id and only that row is read back.
select set_config('bl288.resource', 'foreign-id-' || gen_random_uuid(), true);

set local role service_role;
select ok(
  app_private.record_security_audit_event_service(
    null,
    null,
    'tenant.foreign_id_attempt',
    'employees.api',
    'employee',
    current_setting('bl288.resource'),
    '{"route":"/v1/workspaces/:workspaceId/employees/:employeeId"}'
  ) is not null,
  'service role can append a restricted security audit event'
);
reset role;

create temp table this_run as
select * from app_private.security_audit_events
where resource_id_hash = encode(extensions.digest(current_setting('bl288.resource'), 'sha256'), 'hex');
select is(
  (select count(*)::integer from this_run),
  1,
  'one restricted security audit event is stored'
);
select is(
  (select count(*)::integer from this_run where resource_type = 'employee' and event_type = 'tenant.foreign_id_attempt'),
  1,
  'raw resource ids are stored only as hashes'
);
select is(
  (select count(*)::integer from app_private.security_audit_events
   where resource_id_hash = current_setting('bl288.resource')),
  0,
  'raw resource ids are not stored in the restricted audit event'
);

select * from finish();
rollback;

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

set local role service_role;
select ok(
  app_private.record_security_audit_event_service(
    null,
    null,
    'tenant.foreign_id_attempt',
    'employees.api',
    'employee',
    'foreign-id',
    '{"route":"/v1/workspaces/:workspaceId/employees/:employeeId"}'
  ) is not null,
  'service role can append a restricted security audit event'
);
reset role;

select is(
  (select count(*)::integer from app_private.security_audit_events),
  1,
  'one restricted security audit event is stored'
);
select is(
  (select resource_id_hash = encode(extensions.digest('foreign-id', 'sha256'), 'hex') from app_private.security_audit_events limit 1),
  true,
  'raw resource ids are stored only as hashes'
);
select isnt(
  (select resource_id_hash from app_private.security_audit_events limit 1),
  'foreign-id',
  'raw resource ids are not stored in the restricted audit event'
);

select * from finish();
rollback;

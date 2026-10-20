begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  email_change, email_change_token_current, email_change_token_new,
  email_change_sent_at
) values
  (
    '72000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'security-owner@example.test', '',
    '{}', '{}', now(), now(), '', '', '', null
  ),
  (
    '72000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'delete-me@example.test', '',
    '{}', '{}', now(), now(), 'new-email@example.test',
    repeat('a', 64), repeat('b', 64), now()
  ),
  (
    '72000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'finalize-me@example.test', '',
    '{}', '{}', now(), now(), '', '', '', null
  );

insert into auth.one_time_tokens (
  id, user_id, token_type, token_hash, relates_to
) values
  (
    '72000000-0000-4000-8000-000000000011',
    '72000000-0000-4000-8000-000000000002',
    'email_change_token_current', repeat('c', 64), 'delete-me@example.test'
  ),
  (
    '72000000-0000-4000-8000-000000000012',
    '72000000-0000-4000-8000-000000000002',
    'email_change_token_new', repeat('d', 64), 'new-email@example.test'
  );

insert into public.workspaces (
  id, name, created_by
) values (
  '72000000-0000-4000-8000-000000000101',
  'Security Test Workspace',
  '72000000-0000-4000-8000-000000000001'
);
select public.initialize_workspace_roles('72000000-0000-4000-8000-000000000101');

insert into public.workspace_memberships (id, workspace_id, user_id, status, role_id, employee_role_id)
select legacy.id::uuid, legacy.workspace_id::uuid, legacy.user_id::uuid, legacy.status::text::public.membership_status, (case when legacy.role::text <> 'employee' then coalesce(legacy.role_id::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(legacy.role_id::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values (
  '72000000-0000-4000-8000-000000000201',
  '72000000-0000-4000-8000-000000000101',
  '72000000-0000-4000-8000-000000000001',
  'owner', 'active',
  (select id from public.workspace_roles
   where workspace_id = '72000000-0000-4000-8000-000000000101'
     and system_key = 'owner')
)) as legacy(id, workspace_id, user_id, role, status, role_id);

insert into public.employee_profiles (
  id, workspace_id, employee_code, first_name, last_name,
  invitation_email, created_by
) values (
  '72000000-0000-4000-8000-000000000301',
  '72000000-0000-4000-8000-000000000101',
  'E-7201', 'Pending', 'Invite', 'delete-me@example.test',
  '72000000-0000-4000-8000-000000000001'
);

insert into public.employee_invitations (
  id, workspace_id, employee_id, email, employee_role_id, token_hash,
  expires_at, created_by
) values (
  '72000000-0000-4000-8000-000000000401',
  '72000000-0000-4000-8000-000000000101',
  '72000000-0000-4000-8000-000000000301',
  'delete-me@example.test',
  (select id from public.workspace_roles
   where workspace_id = '72000000-0000-4000-8000-000000000101'
     and system_key = 'employee'),
  repeat('e', 64), now() + interval '7 days',
  '72000000-0000-4000-8000-000000000001'
);

select is(
  jsonb_array_length(public.get_account_deletion_blockers_service(
    '72000000-0000-4000-8000-000000000001'
  )),
  1,
  'active workspace membership is returned as a deletion blocker'
);
select is(
  public.get_account_deletion_blockers_service(
    '72000000-0000-4000-8000-000000000001'
  )->0->>'is_owner',
  'true',
  'ownership is explicit in the active membership blocker'
);
select is(
  public.get_account_deletion_blockers_service(
    '72000000-0000-4000-8000-000000000002'
  ),
  '[]'::jsonb,
  'a pending invitation does not falsely count as active access'
);

select is(
  public.cancel_account_email_change_service(
    '72000000-0000-4000-8000-000000000002'
  )->>'status',
  'cancelled',
  'pending email change can be cancelled by the private service'
);
select is(
  (select nullif(email_change, '') from auth.users
   where id = '72000000-0000-4000-8000-000000000002'),
  null,
  'cancelling clears the pending Auth email'
);
select is(
  (select count(*)::integer from auth.one_time_tokens
   where user_id = '72000000-0000-4000-8000-000000000002'
     and token_type in ('email_change_token_current', 'email_change_token_new')),
  0,
  'cancelling invalidates both email-change one-time tokens'
);

insert into public.user_profiles(user_id, display_name)
values ('72000000-0000-4000-8000-000000000002', 'Keep My Profile');
insert into public.user_preferences(user_id, theme, time_format)
values ('72000000-0000-4000-8000-000000000002', 'dark', '24h');
-- Model an existing preference left from access that has since been removed.
-- The insert guard only allows current membership; deletion must retain older rows too.
alter table public.user_workspace_preferences disable trigger enforce_active_workspace_preference_membership_trigger;
insert into public.user_workspace_preferences(user_id, active_workspace_id)
values ('72000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000101'),
 ('72000000-0000-4000-8000-000000000003', '72000000-0000-4000-8000-000000000101');
alter table public.user_workspace_preferences enable trigger enforce_active_workspace_preference_membership_trigger;

create temporary table first_request as
select public.request_account_deletion_v2_service(
  '72000000-0000-4000-8000-000000000002', repeat('1', 64)
) as payload;

select is(
  (select payload->>'status' from first_request),
  'pending',
  'password-verified deletion service creates a pending request'
);
select is((select active_workspace_id::text from public.user_workspace_preferences
  where user_id='72000000-0000-4000-8000-000000000002'),
  '72000000-0000-4000-8000-000000000101', 'workspace preferences survive pending deletion');
select is(
  (select recovery_token_digest from public.account_deletion_requests
   where user_id = '72000000-0000-4000-8000-000000000002'
     and status = 'pending'),
  repeat('1', 64),
  'only the recovery token digest is persisted'
);
select is(
  (select status::text from public.employee_invitations
   where id = '72000000-0000-4000-8000-000000000401'),
  'revoked',
  'requesting deletion cancels an unaccepted invitation'
);

create temporary table retry_request as
select public.request_account_deletion_v2_service(
  '72000000-0000-4000-8000-000000000002', repeat('2', 64)
) as payload;

select is(
  (select payload->>'request_id' from retry_request),
  (select payload->>'request_id' from first_request),
  'retry reuses the existing pending request'
);
select is(
  (select payload->>'restore_until' from retry_request),
  (select payload->>'restore_until' from first_request),
  'retry preserves the original restore deadline'
);
select is(
  (select recovery_token_digest from public.account_deletion_requests
   where user_id = '72000000-0000-4000-8000-000000000002'
     and status = 'pending'),
  repeat('2', 64),
  'retry invalidates the previous recovery token digest'
);
select throws_ok(
  $$select public.restore_account_deletion_by_token_service(repeat('9', 64))$$,
  'P0002',
  'valid recovery token required',
  'an unknown recovery token cannot restore an account'
);
select is(
  public.prepare_account_deletion_recovery_resend_service(
    'unknown@example.test', repeat('4', 64)
  ),
  null,
  'recovery resend does not reveal whether an email has a pending request'
);
-- G5 (KK-11): a new link at most once per fifteen minutes; age the last one.
update public.account_deletion_requests
set recovery_token_rotated_at = now() - interval '16 minutes'
where user_id = '72000000-0000-4000-8000-000000000002' and status = 'pending';
select is(
  public.prepare_account_deletion_recovery_resend_service(
    'DELETE-ME@example.test', repeat('4', 64)
  )->>'email',
  'delete-me@example.test',
  'recovery resend matches the pending account case-insensitively'
);
select is(
  (select recovery_token_digest from public.account_deletion_requests
   where user_id = '72000000-0000-4000-8000-000000000002'
     and status = 'pending'),
  repeat('4', 64),
  'recovery resend invalidates the previous token digest'
);
select is(
  public.restore_account_deletion_by_token_service(repeat('4', 64))->>'status',
  'restored',
  'the current one-time recovery token restores the account'
);
select is((select theme::text from public.user_preferences where user_id='72000000-0000-4000-8000-000000000002'),
  'dark', 'restore preserves the personal theme');
select is((select time_format from public.user_preferences where user_id='72000000-0000-4000-8000-000000000002'),
  '24h', 'restore preserves regional preferences');
select is((select active_workspace_id::text from public.user_workspace_preferences
  where user_id='72000000-0000-4000-8000-000000000002'),
  '72000000-0000-4000-8000-000000000101', 'restore preserves workspace preferences');

insert into public.user_profiles (user_id, display_name)
values ('72000000-0000-4000-8000-000000000003', 'Finalize Me');
insert into public.user_preferences (user_id)
values ('72000000-0000-4000-8000-000000000003');
insert into public.account_deletion_requests (
  id, user_id, typed_email, acknowledged, requested_at, restore_until,
  recovery_token_digest, recovery_token_rotated_at
) values (
  '72000000-0000-4000-8000-000000000501',
  '72000000-0000-4000-8000-000000000003',
  'finalize-me@example.test', true,
  now() - interval '13 days', now() + interval '1 day',
  repeat('3', 64), now()
);

select throws_ok(
  $$select public.finalize_account_deletion_service(
      '72000000-0000-4000-8000-000000000501', now()
    )$$,
  '23514',
  'account deletion restore window remains open',
  'finalizer cannot delete before the stored restore deadline'
);
create temporary table claimed_work as select * from public.claim_account_deletion_work_service(100);
select is(
  (select action from claimed_work where request_id = '72000000-0000-4000-8000-000000000501'),
  'last_24h',
  'the worker claims the final 24-hour reminder'
);
select is((select count(*)::integer from public.claim_account_deletion_work_service(100)
  where request_id='72000000-0000-4000-8000-000000000501'), 0,
  'a second worker cannot claim an item with a live lease');
select lives_ok($$select public.prepare_account_deletion_delivery_service(
 '72000000-0000-4000-8000-000000000501',
 (select lease_id from claimed_work where request_id='72000000-0000-4000-8000-000000000501'),
 'last_24h', repeat('5',64))$$, 'claimed reminder registers a recovery digest');
select is((select recovery_token_digest from public.account_deletion_requests
 where id='72000000-0000-4000-8000-000000000501'), repeat('3',64),
 'reminder does not invalidate the earlier recovery link');
select is(public.restore_account_deletion_by_token_service(repeat('5',64))->>'status',
 'restored', 'the reminder link can restore the account');

update public.account_deletion_requests
set status = 'pending', restored_at = null, restore_until = now() - interval '1 second',
  work_lease_until = now() - interval '1 second'
where id = '72000000-0000-4000-8000-000000000501';

create temporary table reclaimed_work as select * from public.claim_account_deletion_work_service(100);
select isnt((select lease_id from reclaimed_work where request_id='72000000-0000-4000-8000-000000000501'),
 (select lease_id from claimed_work where request_id='72000000-0000-4000-8000-000000000501'),
 'expired work is reclaimed with a new fencing token');
select throws_ok($$select public.complete_account_deletion_work_service(
 '72000000-0000-4000-8000-000000000501',
 (select lease_id from claimed_work where request_id='72000000-0000-4000-8000-000000000501'), 'finalize')$$,
 'P0001', 'account deletion lease unavailable', 'stale workers cannot complete another lease');
select throws_ok($$select public.finalize_claimed_account_deletion_service(
 '72000000-0000-4000-8000-000000000501',
 (select lease_id from claimed_work where request_id='72000000-0000-4000-8000-000000000501'))$$,
 'P0001', 'account deletion lease unavailable', 'stale workers cannot purge account data');

select is(
  public.finalize_claimed_account_deletion_service(
    '72000000-0000-4000-8000-000000000501',
    (select lease_id from reclaimed_work where request_id='72000000-0000-4000-8000-000000000501')
  )->>'status',
  'completed',
  'finalizer completes after the exact stored deadline'
);
select is(
  (select typed_email from public.account_deletion_requests
   where id = '72000000-0000-4000-8000-000000000501'),
  '<deleted>',
  'finalizer removes the retained email from the request record'
);
select is(
  (select count(*)::integer from public.user_profiles
   where user_id = '72000000-0000-4000-8000-000000000003'),
  0,
  'finalizer removes the global account profile'
);
select is((select count(*)::integer from public.user_preferences where user_id='72000000-0000-4000-8000-000000000003'),
 0, 'final purge removes personal preferences');
select is((select count(*)::integer from public.user_workspace_preferences where user_id='72000000-0000-4000-8000-000000000003'),
 0, 'final purge removes workspace preferences');
select is(
  public.finalize_account_deletion_service(
    '72000000-0000-4000-8000-000000000501', now()
  )->>'idempotent',
  'true',
  'finalizer is idempotent after completion'
);

select * from finish();
rollback;

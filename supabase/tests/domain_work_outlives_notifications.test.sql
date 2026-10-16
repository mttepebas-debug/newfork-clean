begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- BILDIRIM-01: five pieces of domain work lived inside the old notification code. The notification
-- system is torn down next; before that, each of them must stand on its own:
--   K1  a person past a document deadline is restricted (KARARLAR K:87 "Kısıtlı kişi")
--   K2  a shift exchange whose deadline passed, or whose shift changed, closes
--   K3  every shift exchange step leaves one history row (shift_exchange_events)
--   K4  an account security event leaves one audit row (app_private.security_audit_events)
--   K5  an expiring employee document opens a Workspace to-do
-- Part 1 checks each with the notification system as it is today. Part 2 makes every "send a
-- notification" call these paths make do nothing, which is what the teardown leaves behind, and
-- checks the work again. Part 3 reads the function bodies: the only notification names they hold
-- are those calls.

select tests.world('dw');
select tests.person('dw', 'ali', 'employee', array['K'], array['cook']);
select tests.person('dw', 'deniz', 'employee', array['K'], array['cook']);
select tests.person('dw', 'ece', 'employee', array['K'], array['cook']);
select tests.publish_week('dw', 1, '[
  {"label": "ali-tue", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"},
  {"label": "ali-wed", "person": "ali", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"},
  {"label": "ali-thu", "person": "ali", "loc": "K", "job": "cook", "day": 3, "start": "09:00", "end": "15:00"}
]');

create function pg_temp.events(case_id uuid, act text) returns integer language sql as $$
  select count(*)::integer from public.shift_exchange_events e where e.case_id = events.case_id and e.action = act
$$;
create function pg_temp.audit(person text, event text) returns integer language sql as $$
  select count(*)::integer from app_private.security_audit_events a
  where a.actor_user_id = tests.user('dw:' || person) and a.event_type = event
$$;
-- An overdue document request that restricts the person when it is missed (Settings > Documents,
-- "suspend on overdue"). Label: dw:requirement:<person>.
create function pg_temp.overdue_requirement(person text) returns uuid language plpgsql as $$
declare r uuid := gen_random_uuid();
begin
  insert into public.employee_onboarding_requirements(id, workspace_id, employee_id, case_id, kind, title, required,
    blocks_activation, requires_review, sort_order, source_snapshot, lifecycle_user_id, lifecycle_settings, deadline_at)
  select r, c.workspace_id, c.employee_id, c.id, 'document', 'Background check', true, false, true, 50,
    '{"accepted_formats":["pdf"],"tracks_expiry":false,"timezone":"Europe/Istanbul"}', tests.user('dw:' || person),
    '{"mode":"conditional","target":{"location_ids":[],"department_ids":[],"job_ids":[],"employee_ids":[]},"assignment_scope":"all_active","period_days":7,"suspend_on_overdue":true,"extra_fields":[]}',
    now() + interval '7 days'
  from public.employee_onboarding_cases c where c.employee_id = tests.id('dw:' || person);
  -- ponytail: an active membership's insert sets deadline_at to now()+period_days, and now() is fixed
  -- in this transaction, so the deadline is moved into the past by hand.
  update public.employee_onboarding_requirements set deadline_at = now() - interval '1 day' where id = r;
  return tests.remember('dw:requirement:' || person, r);
end $$;
create function pg_temp.suspended(person text) returns boolean language sql as $$
  select document_suspended_at is not null from public.employee_onboarding_requirements
  where id = tests.id('dw:requirement:' || person)
$$;
-- An accepted document that expires in three days, on a document type that tracks expiry.
create function pg_temp.expiring_document(person text) returns uuid language plpgsql as $$
declare t uuid := gen_random_uuid(); r uuid := gen_random_uuid(); d uuid := gen_random_uuid(); c public.employee_onboarding_cases%rowtype;
begin
  select * into c from public.employee_onboarding_cases where employee_id = tests.id('dw:' || person);
  insert into public.document_types(id, workspace_id, title, description, required_at_onboarding, requires_review,
    accepted_formats, tracks_expiry, expiry_warning_days, expiry_schedule_impact, sort_order, created_by)
  values (t, c.workspace_id, 'Food handler card ' || person, '', true, false, array['pdf'], true, 14, 'track_only', 90,
    tests.user('dw:owner'));
  update public.document_types set publication_status = 'published' where id = t;
  insert into public.employee_onboarding_requirements(id, workspace_id, case_id, employee_id, kind, source_id, title,
    required, blocks_activation, requires_review, sort_order, status)
  values (r, c.workspace_id, c.id, c.employee_id, 'document', t, 'Food handler card', true, false, false, 90, 'completed');
  insert into public.employee_documents(id, workspace_id, employee_id, requirement_id, version_number, object_path,
    original_filename, media_type, size_bytes, review_status, expiry_date, uploaded_by)
  values (d, c.workspace_id, c.employee_id, r, 1, c.workspace_id || '/' || c.employee_id || '/' || r || '/' || d || '.pdf',
    'card.pdf', 'application/pdf', 1024, 'accepted', current_date + 3, tests.user('dw:owner'));
  return d;
end $$;
create function pg_temp.todo(document uuid) returns integer language sql as $$
  select count(*)::integer from public.workspace_todos
  where source_type = 'employee_document_expiry' and source_id = document and status = 'open'
$$;

-- 1. Today, with the notification system in place --------------------------------------------------

-- K3: Ali asks for cover on Tuesday, Deniz applies: one history row per step.
select tests.cover_case('dw', 'ali-tue', 'ali', 'deniz');
select is(pg_temp.events(tests.id('dw:case:ali-tue'), 'cover_opened'), 1, 'K3: the cover request leaves one history row');
select is(pg_temp.events(tests.id('dw:case:ali-tue'), 'application_submitted'), 1, 'K3: the application leaves one history row');

-- K2: the Tuesday request's deadline passes; the maintenance closes it with one history row.
update public.shift_exchange_cases set expires_at = now() - interval '1 second' where id = tests.id('dw:case:ali-tue');
select public.shift_exchanges_maintain_service(100);
select is((select status from public.shift_exchange_cases where id = tests.id('dw:case:ali-tue')), 'expired', 'K2: maintenance closes an exchange whose deadline passed');
select is((select status from public.shift_exchange_applications where id = tests.id('dw:application:ali-tue')), 'expired', 'K2: and its application');
select is(pg_temp.events(tests.id('dw:case:ali-tue'), 'expired'), 1, 'K2: the closing leaves one history row');

-- K4: Ali changes his password; the API records it through the audit entry point, once.
select public.record_account_security_event_service(tests.user('dw:ali'), 'account.password_changed');
select is(pg_temp.audit('ali', 'account.password_changed'), 1, 'K4: a password change leaves one audit row');
select is((select count(*)::integer from public.account_notification_items where user_id = tests.user('dw:ali')
  and type_key = 'security.account.password_changed'), 1, 'K4: the account notification still follows from the audit row, until the teardown');
select throws_ok($$select public.record_account_security_event_service(tests.user('dw:ali'), 'account.external_login')$$,
  '22023', 'unsupported account security event', 'K4: an event the API cannot observe is not recorded');
create function pg_temp.refusal(statement text) returns text language plpgsql as $$
declare hint text;
begin
  execute statement;
  return 'no refusal';
exception when others then
  get stacked diagnostics hint = pg_exception_hint;
  return sqlstate || ' ' || coalesce(nullif(hint, ''), '(no hint)');
end $$;
select is(pg_temp.refusal($$select public.record_account_security_event_service(gen_random_uuid(), 'account.password_changed')$$),
  '42501 authz.not_active', 'K4: an account that is not there records nothing, and says why');
set local role authenticated;
select throws_ok($$select public.record_account_security_event_service('00000000-0000-4000-8000-000000000001', 'account.password_changed')$$,
  '42501', null, 'K4: a browser cannot write the audit trail');
reset role;

-- K1: Ece misses a document deadline. A notification that fails must not undo the restriction.
select pg_temp.overdue_requirement('ece');
create function pg_temp.break_notifications() returns void language plpgsql as $$
begin
  create or replace function app_private.document_notify_access(w uuid, e uuid, u uuid) returns void
    language plpgsql as $f$ begin raise exception 'stand-in: the notification failed'; end $f$;
end $$;
select pg_temp.break_notifications();
-- Every case in the batch now warns that it was skipped; the warnings stay out of the output.
set local client_min_messages = error;
select lives_ok($$select public.documents_maintain_service(500)$$, 'K1: document maintenance runs while notifications fail');
select ok(pg_temp.suspended('ece'), 'K1: a failing notification does not undo the restriction');
select is((public.documents_maintain_service(500) ->> 'suspended')::integer, 0, 'K1: a restriction is written once');
reset client_min_messages;

-- K5: Ali's food handler card expires in three days; Workspace gets a to-do.
create temp table k5(document uuid, other uuid);
insert into k5 select pg_temp.expiring_document('ali'), null;
select public.sync_expiring_document_todos_service(tests.id('dw'));
select is(pg_temp.todo(document), 1, 'K5: an expiring document opens one Workspace to-do') from k5;

-- 2. With every "send a notification" call doing nothing --------------------------------------------

-- What the teardown leaves: the calls are gone. Here they stay and do nothing, for this transaction.
create function pg_temp.silence(target regprocedure) returns void language plpgsql as $$
declare result_type text := pg_get_function_result(target);
begin
  execute format('create or replace function %s.%I(%s) returns %s language sql as %L',
    (select quote_ident(n.nspname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.oid = target),
    (select p.proname from pg_proc p where p.oid = target),
    pg_get_function_arguments(target), result_type,
    case when result_type = 'void' then 'select' else format('select null::%s', result_type) end);
end $$;
select pg_temp.silence(p.oid::regprocedure) from pg_proc p
where p.oid in (
  'public.enqueue_notification_outbox_service'::regproc, 'app_private.enqueue_document_notification'::regproc,
  'app_private.document_notify_access'::regproc, 'public.shift_exchange_emit_notification_base'::regproc,
  'public.shift_exchange_sync_notifications'::regproc
);
alter table app_private.security_audit_events disable trigger project_account_security_notification;
select is(
  (select count(*)::integer from pg_proc p join pg_language l on l.oid = p.prolang where l.lanname = 'sql' and p.oid in (
    'public.enqueue_notification_outbox_service'::regproc, 'app_private.enqueue_document_notification'::regproc,
    'app_private.document_notify_access'::regproc, 'public.shift_exchange_emit_notification_base'::regproc,
    'public.shift_exchange_sync_notifications'::regproc)),
  5, 'every notification call these paths make now does nothing');

-- K3 + K2: Ali asks for cover on Wednesday, Deniz applies, the deadline passes.
select tests.cover_case('dw', 'ali-wed', 'ali', 'deniz');
select is(pg_temp.events(tests.id('dw:case:ali-wed'), 'cover_opened'), 1, 'K3 without notifications: the cover request leaves one history row');
select is(pg_temp.events(tests.id('dw:case:ali-wed'), 'application_submitted'), 1, 'K3 without notifications: the application leaves one history row');
update public.shift_exchange_cases set expires_at = now() - interval '1 second' where id = tests.id('dw:case:ali-wed');
select public.shift_exchanges_maintain_service(100);
select is((select status from public.shift_exchange_cases where id = tests.id('dw:case:ali-wed')), 'expired', 'K2 without notifications: the exchange closes');
select is((select status from public.shift_exchange_applications where id = tests.id('dw:application:ali-wed')), 'expired', 'K2 without notifications: and its application');
select is(pg_temp.events(tests.id('dw:case:ali-wed'), 'expired'), 1, 'K2 without notifications: the closing leaves one history row');
-- A shift that changed under an open request closes it too.
select tests.cover_case('dw', 'ali-thu', 'ali', 'deniz');
update public.schedule_published_shifts set end_time = '16:00' where id = tests.id('dw:shift:ali-thu');
select public.shift_exchanges_maintain_service(100);
select is((select status from public.shift_exchange_cases where id = tests.id('dw:case:ali-thu')), 'invalidated', 'K2 without notifications: a changed shift closes its request');
select is(pg_temp.events(tests.id('dw:case:ali-thu'), 'invalidated'), 1, 'K2 without notifications: with one history row');

-- K4: Deniz changes her password.
select public.record_account_security_event_service(tests.user('dw:deniz'), 'account.password_changed');
select is(pg_temp.audit('deniz', 'account.password_changed'), 1, 'K4 without notifications: one audit row');

-- K1: Deniz misses a document deadline.
select pg_temp.overdue_requirement('deniz');
select is((public.documents_maintain_service(500) ->> 'suspended')::integer, 1, 'K1 without notifications: maintenance restricts one requirement');
select ok(pg_temp.suspended('deniz'), 'K1 without notifications: Deniz is restricted');

-- K5: Deniz's card expires in three days.
update k5 set other = pg_temp.expiring_document('deniz');
select public.sync_expiring_document_todos_service(tests.id('dw'));
select is(pg_temp.todo(other), 1, 'K5 without notifications: the expiring document opens one Workspace to-do') from k5;
select is(pg_temp.todo(document), 1, 'K5 without notifications: the earlier to-do stays open') from k5;

-- 3. The bodies: the only notification names left are the calls above -----------------------------

create function pg_temp.notification_names(target regprocedure) returns text[] language sql as $$
  select coalesce(array_agg(distinct m[1] order by m[1]), '{}')
  from pg_proc p, regexp_matches(lower(p.prosrc), '([a-z_]*notif[a-z_]*)', 'g') m where p.oid = target
$$;
select is(pg_temp.notification_names('public.shift_exchange_emit'::regproc),
  '{shift_exchange_emit_notification_base,shift_exchange_sync_notifications}',
  'K3: the history row is written before the two notification calls, which are all the notification code it holds');
select is(pg_temp.notification_names('public.shift_exchanges_maintain_service'::regproc), '{}',
  'K2: closing exchanges holds no notification code of its own');
select is(pg_temp.notification_names('app_private.document_suspend_overdue'::regproc), '{}',
  'K1: the restriction holds no notification code');
select ok((select prosrc ~ 'app_private\.document_suspend_overdue\(' from pg_proc where oid = 'public.documents_maintain_service'::regproc),
  'K1: document maintenance restricts before its reminders');
select is(pg_temp.notification_names('public.documents_maintain_service'::regproc),
  '{document_notification_checked_at,document_notify_access,enqueue_document_notification}',
  'K1: what document maintenance holds besides the restriction is the reminder loop alone (its queue mark and two calls)');
select is(pg_temp.notification_names('public.record_account_security_event_service'::regproc), '{}',
  'K4: the audit entry point holds no notification code');
select is(pg_temp.notification_names('app_private.record_security_audit_event_service'::regproc), '{}',
  'K4: nor does the audit writer it calls');
select is(pg_temp.notification_names('public.sync_expiring_document_todos_service'::regproc),
  '{enqueue_notification_outbox_service,notification_count,notifications_enqueued}',
  'K5: the to-do sync holds one notification statement and its count, nothing the to-do statements read');
select is((select count(*)::integer from regexp_matches(
    (select prosrc from pg_proc where oid = 'public.sync_expiring_document_todos_service'::regproc),
    'enqueue_notification_outbox_service', 'g')), 1,
  'K5: one notification call, in its own statement');

-- K1 + K2 run on their own cron, not the notification worker's.
select is((select schedule || ' ' || command from cron.job where jobname = 'maintenance'),
  '* * * * * select app_private.dispatch_cron_endpoint(''/api/internal/cron/maintenance'');',
  'K1 + K2: the database calls the maintenance route every minute');

select * from finish();
rollback;

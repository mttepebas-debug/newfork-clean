begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- BILDIRIM-01 moved five pieces of domain work out of the old notification code:
--   K1  a person past a document deadline is restricted (KARARLAR K:87 "Kısıtlı kişi")
--   K2  a shift exchange whose deadline passed, or whose shift changed, closes
--   K3  every shift exchange step leaves one history row (shift_exchange_events)
--   K4  an account security event leaves one audit row (app_private.security_audit_events)
--   K5  an expiring employee document opens a Workspace to-do
-- BILDIRIM-04 (teardown part C1) took every "send a notification" call out of the domain work.
-- BILDIRIM-06 (part C2) dropped the old system: part 1 checks the work runs without it, part 2 that
-- it still lives where it moved. That nothing names a dropped object: old_notifications_are_dropped.

select tests.world('dw');
select tests.person('dw', 'ali', 'employee', array['K'], array['cook']);
select tests.person('dw', 'deniz', 'employee', array['K'], array['cook']);
select tests.person('dw', 'ece', 'employee', array['K'], array['cook']);
-- K1's "not restricted" side: each has a passed deadline and is left alone for one reason only.
select tests.person('dw', 'fatma', 'employee', array['K'], array['cook']);
select tests.person('dw', 'gul', 'employee', array['K'], array['cook']);
select tests.person('dw', 'ilker', 'employee', array['K'], array['cook']);
select tests.person('dw', 'jale', 'employee', array['K'], array['cook']);
select tests.world('dz');
select tests.person('dz', 'hale', 'employee', array['K'], array['cook']);
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
-- "suspend on overdue"). person is a name in world dw, or a full label (dz:hale). Label: dw:requirement:<person>.
create function pg_temp.overdue_requirement(person text) returns uuid language plpgsql as $$
declare r uuid := gen_random_uuid(); who text := case when person like '%:%' then person else 'dw:' || person end;
begin
  insert into public.employee_onboarding_requirements(id, workspace_id, employee_id, case_id, kind, title, required,
    blocks_activation, requires_review, sort_order, source_snapshot, lifecycle_user_id, lifecycle_settings, deadline_at)
  select r, c.workspace_id, c.employee_id, c.id, 'document', 'Background check', true, false, true, 50,
    '{"accepted_formats":["pdf"],"tracks_expiry":false,"timezone":"Europe/Istanbul"}', tests.user(who),
    '{"mode":"conditional","target":{"location_ids":[],"department_ids":[],"job_ids":[],"employee_ids":[]},"assignment_scope":"all_active","period_days":7,"suspend_on_overdue":true,"extra_fields":[]}',
    now() + interval '7 days'
  from public.employee_onboarding_cases c where c.employee_id = tests.id(who);
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
create function pg_temp.refusal(statement text) returns text language plpgsql as $$
declare hint text;
begin
  execute statement;
  return 'no refusal';
exception when others then
  get stacked diagnostics hint = pg_exception_hint;
  return sqlstate || ' ' || coalesce(nullif(hint, ''), '(no hint)');
end $$;

-- The old notification system is gone (part C2): its functions were named for notifications,
-- outboxes and inboxes, its tables likewise. The new system's own (BILDIRIM-07) are named one by one.
create temp table new_system(name text);
insert into new_system values
  ('get_notification_feed_service'), ('get_notification_preferences_service'), ('get_notification_workspace_settings_service'),
  ('mark_notifications_read_service'), ('mark_notifications_seen_service'), ('mark_notifications_unread_service'),
  ('notification_resolve'), ('notification_route'),
  ('notify'), ('purge_expired_notifications'), ('save_notification_preferences_service'),
  ('save_notification_workspace_settings_service'),
  -- The producers' own helpers (BILDIRIM-U1 on).
  ('notify_account_security'), ('notify_deciders'), ('notify_holders'), ('notify_rows'), ('notify_workspace_closing'),
  -- The email channel (BILDIRIM-14).
  ('claim_notification_emails_service'), ('finish_notification_email_service'), ('apply_notification_email_event_service'),
  ('release_notification_emails_service'), ('notification_email_channel'),
  -- Phone alerts (BILDIRIM-15).
  ('claim_notification_push_service'), ('finish_notification_push_service'), ('release_notification_push_service'),
  ('save_notification_push_subscription_service'), ('delete_notification_push_subscription_service'),
  ('notification_push_channel'), ('notification_push_sends'),
  -- One dispatcher for every channel (BILDIRIM-DAGITICI).
  ('begin_notification_dispatch_service'), ('end_notification_dispatch_service'), ('notification_dispatch_alerts_service'),
  ('raise_notification_alerts_service'),
  ('notification_dispatch'), ('notification_quotas'), ('notification_alerts'),
  ('notification_deliveries'), ('notification_email_suppressions'), ('notification_preferences'),
  ('notification_push_subscriptions'), ('notification_sms_consents'), ('notification_sms_opt_outs'), ('notification_topics'),
  ('notification_types'),
  ('notification_workspace_muted_types'), ('notification_workspace_settings'), ('person_notifications');
select is((select count(*)::integer from pg_proc p
           where p.pronamespace in ('public'::regnamespace, 'app_private'::regnamespace)
             and (p.proname ~ '(notif|outbox|inbox)'
                  or p.proname in ('announcement_deliver', 'announcement_tell_failed', 'communication_withdraw', 'time_off_notice'))
             and p.proname::text not in (select name from new_system))
        + (select count(*)::integer from pg_class c
           where c.relnamespace in ('public'::regnamespace, 'app_private'::regnamespace) and c.relkind in ('r', 'v', 'p')
             and c.relname ~ '(notif|outbox|inbox)'
             and c.relname::text not in (select name from new_system)), 0,
  'the old notification system is gone');

-- 1. Without it ------------------------------------------------------------------------------------

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
-- A shift that changed under an open request closes it too.
select tests.cover_case('dw', 'ali-thu', 'ali', 'deniz');
update public.schedule_published_shifts set end_time = '16:00' where id = tests.id('dw:shift:ali-thu');
select public.shift_exchanges_maintain_service(100);
select is((select status from public.shift_exchange_cases where id = tests.id('dw:case:ali-thu')), 'invalidated', 'K2: a changed shift closes its request');
select is(pg_temp.events(tests.id('dw:case:ali-thu'), 'invalidated'), 1, 'K2: with one history row');

-- K4: Ali changes his password; the API records it through the audit entry point, once.
select public.record_account_security_event_service(tests.user('dw:ali'), 'account.password_changed');
select is(pg_temp.audit('ali', 'account.password_changed'), 1, 'K4: a password change leaves one audit row');
select throws_ok($$select public.record_account_security_event_service(tests.user('dw:ali'), 'account.external_login')$$,
  '22023', 'unsupported account security event', 'K4: an event the API cannot observe is not recorded');
select is(pg_temp.refusal($$select public.record_account_security_event_service(gen_random_uuid(), 'account.password_changed')$$),
  '42501 authz.not_active', 'K4: an account that is not there records nothing, and says why');
set local role authenticated;
select throws_ok($$select public.record_account_security_event_service('00000000-0000-4000-8000-000000000001', 'account.password_changed')$$,
  '42501', null, 'K4: a browser cannot write the audit trail');
reset role;

-- K1: Ece misses a document deadline. (The shared database may hold other overdue rows: a first
-- pass takes them, so the count below is Ece's alone.)
select public.documents_maintain_service(500);
select pg_temp.overdue_requirement('ece');
select is(public.documents_maintain_service(500) - 'checked', '{"suspended": 1}'::jsonb,
  'K1: document maintenance restricts one requirement');
select ok(pg_temp.suspended('ece'), 'K1: Ece is restricted');
select is((public.documents_maintain_service(500) ->> 'suspended')::integer, 0, 'K1: a restriction is written once');

-- K1 does not restrict. The restriction runs over every workspace each minute, so who it leaves alone
-- matters as much as who it takes. Each requirement below is past its deadline with "suspend on
-- overdue" set, unless said otherwise; one condition keeps it unrestricted.
select pg_temp.overdue_requirement(p) from unnest(array['fatma', 'gul', 'ilker', 'jale', 'dz:hale']) p;
-- Fatma left the team's list: her profile is archived, her membership is untouched.
update public.employee_profiles set archived_at = now() where id = tests.id('dw:fatma');
-- Gul's access was taken away: her membership is neither active nor waiting for activation.
update public.workspace_memberships set status = 'suspended' where workspace_id = tests.id('dw') and user_id = tests.user('dw:gul');
-- Hale's workspace is paused: nobody works in it.
update public.workspaces set lifecycle_status = 'suspended' where id = tests.id('dz');
-- Ilker's document type does not restrict on overdue; Jale's says nothing about it.
update public.employee_onboarding_requirements set lifecycle_settings = jsonb_set(lifecycle_settings, '{suspend_on_overdue}', 'false')
where id = tests.id('dw:requirement:ilker');
update public.employee_onboarding_requirements set lifecycle_settings = lifecycle_settings - 'suspend_on_overdue'
where id = tests.id('dw:requirement:jale');
select ok((select p.archived_at is not null and m.status = 'active' from public.employee_profiles p
  join public.workspace_memberships m on m.workspace_id = p.workspace_id and m.user_id = p.user_id where p.id = tests.id('dw:fatma')),
  'K1 setup: Fatma is archived and nothing else');
select ok((select r.deadline_at < now() from public.employee_onboarding_requirements r
  where r.id = tests.id('dw:requirement:fatma')) and (select bool_and(r.deadline_at < now()) from public.employee_onboarding_requirements r
  where r.id in (select tests.id('dw:requirement:' || p) from unnest(array['gul', 'ilker', 'jale', 'dz:hale']) p)),
  'K1 setup: every one of their deadlines has passed');
select app_private.document_suspend_overdue();
select ok(not pg_temp.suspended('fatma'), 'K1: an archived person is not restricted');
select ok(not pg_temp.suspended('gul'), 'K1: a person whose access was taken away is not restricted');
select ok(not pg_temp.suspended('dz:hale'), 'K1: a person in a paused workspace is not restricted');
select ok(not pg_temp.suspended('ilker'), 'K1: a requirement that does not restrict on overdue does not');
select ok(not pg_temp.suspended('jale'), 'K1: nor one whose settings say nothing about it');

-- K5: Ali's food handler card expires in three days; Workspace gets a to-do.
create temp table k5(document uuid);
insert into k5 select pg_temp.expiring_document('ali');
select is(public.sync_expiring_document_todos_service(tests.id('dw')) ->> 'opened_or_refreshed', '1',
  'K5: the to-do sync runs');
select is(pg_temp.todo(document), 1, 'K5: an expiring document opens one Workspace to-do') from k5;

-- 2. Where the work lives ---------------------------------------------------------------------------

select ok((select prosrc ~ 'app_private\.document_suspend_overdue\(' from pg_proc where oid = 'public.documents_maintain_service'::regproc),
  'K1: document maintenance restricts');
select ok((select prosrc ~ 'insert into public\.shift_exchange_events' from pg_proc where oid = 'public.shift_exchange_emit'::regproc),
  'K3: shift_exchange_emit writes the history row');

-- K1 + K2 run on their own cron.
select is((select schedule || ' ' || command from cron.job where jobname = 'maintenance'),
  '* * * * * select app_private.dispatch_cron_endpoint(''/api/internal/cron/maintenance'');',
  'K1 + K2: the database calls the maintenance route every minute');

select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- EKRAN-01 BE-2b (KK-166, KARARLAR Schedule "Haftalık e-postada kısmi teslim
-- kuralı kapatmaz"): the weekly export email goes to 10 people; Ali's address
-- is wrong. The week shows as not delivered to Ali, but the 9 who got it keep
-- getting it: only a send that reached nobody counts toward the three that
-- switch the rule off, and a send that reached anybody starts that count over.

select tests.world('pd');
-- ponytail: stored as it is; there is no builder helper for scheduled exports.
select public.create_schedule_export_preset_service(tests.user('pd:owner'), tests.id('pd'), 'Weekly', '{}'::jsonb);
insert into public.scheduled_schedule_exports
  (workspace_id, preset_id, name, recipients, location_ids, day_of_week, send_hour, created_by, updated_by)
values (tests.id('pd'), (select p.id from public.schedule_export_presets p where p.workspace_id = tests.id('pd')),
  'Kitchen week', '["ali@example.test", "books@example.test"]'::jsonb, array[tests.id('pd:K')], 1, 9,
  tests.user('pd:owner'), tests.user('pd:owner'));
select tests.remember('pd:rule', (select s.id from public.scheduled_schedule_exports s where s.workspace_id = tests.id('pd')));

create function pg_temp.partial() returns void language sql as $$
  select public.record_schedule_export_schedule_success_service(tests.id('pd'), tests.id('pd:rule'), now(), 'pdf', '{}'::jsonb,
    'Not delivered to 1 of 10 recipients: ali@example.test');
$$;
create function pg_temp.failed() returns void language sql as $$
  select public.record_schedule_export_schedule_failure_service(tests.id('pd'), tests.id('pd:rule'), 'Not delivered to any recipient');
$$;
create function pg_temp.rule() returns public.scheduled_schedule_exports language sql as $$
  select s from public.scheduled_schedule_exports s where s.id = tests.id('pd:rule')
$$;

select pg_temp.partial();
select is((pg_temp.rule()).last_error, 'Not delivered to 1 of 10 recipients: ali@example.test',
  'a partial send shows the week as not delivered to Ali');
select ok((pg_temp.rule()).last_sent_at is not null, 'and counts as sent, so the 9 are not emailed again within the hour');
select is((pg_temp.rule()).consecutive_failures, 0, 'and does not count toward switching the rule off');

select pg_temp.partial();
select pg_temp.failed();
select is((pg_temp.rule()).consecutive_failures, 1, 'partial, partial, nobody: one failure in a row');
select ok((pg_temp.rule()).enabled, 'and the rule stays on');

select pg_temp.failed();
select pg_temp.partial();
select is((pg_temp.rule()).consecutive_failures, 0, 'a send that reached anybody starts the count over');

select pg_temp.failed();
select pg_temp.failed();
select pg_temp.failed();
select is((pg_temp.rule()).consecutive_failures, 3, 'three sends that reached nobody');
select ok(not (pg_temp.rule()).enabled, 'switch the rule off');

select public.record_schedule_export_schedule_success_service(tests.id('pd'), tests.id('pd:rule'), now(), 'pdf', '{}'::jsonb);
select is((pg_temp.rule()).last_error, null, 'a full send clears the note');

select * from finish();
rollback;

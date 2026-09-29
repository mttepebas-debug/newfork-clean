begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- G9. BL-247: a closed workspace refuses time off at every door, the owner's
-- own-approval shortcut included. BL-220: the notification check knows an
-- owner's own request by what happened then, not by who owns the workspace
-- now. BL-109: the write guard's refusal does not blame a shift change.

select tests.world('tc');
select tests.person('tc', 'ali', 'employee', array['K'], array['cook']);
select tests.person('tc', 'zeynep', 'admin', array['K'], array['cook']);

create function pg_temp.refusal(q text) returns text language plpgsql as $$
declare h text;
begin
  execute q;
  return 'allowed';
exception when others then
  get stacked diagnostics h = pg_exception_hint;
  return sqlstate || ' ' || coalesce(h, '');
end $$;
create function pg_temp.drift() returns uuid[] language sql as $$
  select array(select (m ->> 'event_id')::uuid
    from jsonb_array_elements(public.reconcile_notification_platform_service() -> 'deterministic_domain_events_without_outbox') m
    where m ->> 'workspace_id' = tests.id('tc')::text order by 1)
$$;
create function pg_temp.submitted(target_request uuid) returns uuid language sql as $$
  select e.id from public.schedule_time_off_events e where e.request_id = target_request and e.action = 'submitted'
$$;

-- Olcay (the owner) records his own time off; Zeynep (an admin) asks for hers,
-- and her review notice is lost.
select tests.time_off('tc', 'owner', 1);
select tests.time_off('tc', 'zeynep', 2);
delete from public.notification_outbox o
where o.workspace_id = tests.id('tc') and o.event_id = pg_temp.submitted(tests.id('tc:zeynep:time_off'));

select is(pg_temp.drift(), array[pg_temp.submitted(tests.id('tc:zeynep:time_off'))],
  'the check reports Zeynep''s lost notice and not Olcay''s own time off');

-- Olcay hands the workspace to Zeynep.
select public.initiate_workspace_ownership_transfer_service(tests.user('tc:owner'), tests.id('tc'), tests.user('tc:zeynep'));
select public.respond_workspace_ownership_transfer_service(tests.user('tc:zeynep'), tests.id('tc'),
  (select t.id from public.workspace_ownership_transfers t where t.workspace_id = tests.id('tc') and t.status = 'pending'), 'accept');

select is(pg_temp.drift(), array[pg_temp.submitted(tests.id('tc:zeynep:time_off'))],
  'after the handover the check says the same: who owns the workspace today changes nothing');

select is(pg_temp.refusal(format($$select app_private.authorize_time_off_decision(%L, %L, %L, %L, 'approve')$$,
    tests.user('tc:zeynep'), tests.id('tc'), tests.id('tc:zeynep'), tests.id('tc:K'))),
  'allowed', 'Zeynep, now the owner, may approve her own time off');

-- The workspace closes.
update public.workspaces set lifecycle_status = 'suspended' where id = tests.id('tc');

select is(pg_temp.refusal(format($$select app_private.authorize_time_off_decision(%L, %L, %L, %L, 'approve')$$,
    tests.user('tc:zeynep'), tests.id('tc'), tests.id('tc:zeynep'), tests.id('tc:K'))),
  '42501 authz.workspace_closed', 'in a closed workspace the owner''s shortcut is closed too');
select is(pg_temp.refusal($$select tests.time_off('tc', 'ali', 3)$$),
  '42501 authz.workspace_closed', 'Ali cannot ask for time off in a closed workspace');
select is(pg_temp.refusal(format($$select public.submit_employee_time_off_cancellation_service(%L, %L, %L, 1, '', '[]', gen_random_uuid())$$,
    tests.user('tc:owner'), tests.id('tc'), tests.id('tc:owner:time_off'))),
  '42501 authz.workspace_closed', 'nor can anybody ask to cancel approved time off');

select ok(
  (select p.prosrc like '%Another change is being saved%' and p.prosrc not like '%shift change%'
   from pg_proc p where p.oid = 'public.shift_exchange_guard_eligibility_write()'::regprocedure),
  'the write guard''s refusal no longer says a shift change is being reviewed');

select * from finish();
rollback;

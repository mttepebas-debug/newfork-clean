begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- G9. BL-247: a closed workspace refuses time off at every door, the owner's own included: asking, asking to
-- cancel, answering a request or a cancellation, and taking back. Nothing it refused changed. The time off
-- rebuild (D8) wrote this again for the new services. BL-109: the write guard's refusal does not blame a
-- shift change.

select tests.world('tc');
-- The owner works here too (ROL-CIFT: the employee side needs the employee slot).
select tests.employee_slot('tc', 'owner');
select tests.person('tc', 'ali', 'employee', array['K'], array['cook']);
select tests.person('tc', 'mk', 'manager', array['K'], array['general manager']);
select tests.settle();

create function pg_temp.refusal(statement text)
returns text
language plpgsql
as $$
declare state text; why text;
begin
  execute statement;
  return 'ok';
exception when others then
  get stacked diagnostics state = returned_sqlstate, why = pg_exception_hint;
  return state || ' ' || coalesce(why, '');
end;
$$;

create temporary table fixture (key text primary key, value uuid);
create function pg_temp.req(label text) returns public.time_off_requests language sql as $$
  select r from public.time_off_requests r where r.id = (select f.value from fixture f where f.key = label)
$$;
-- `person` answers the request under `label` on what they read: the revision, and the shifts at stake
-- when it is time off (a cancellation carries none).
create function pg_temp.answer(person text, label text, verdict text) returns jsonb language sql as $$
  select public.answer_time_off_service(tests.user('tc:' || person), tests.id('tc'), (pg_temp.req(label)).id,
    verdict, null, (pg_temp.req(label)).revision,
    case when (pg_temp.req(label)).kind = 'leave'
      then app_private.time_off_shifts_print(app_private.time_off_shifts_at_stake(pg_temp.req(label))) end)
$$;
create function pg_temp.ask_cancel(person text, label text) returns jsonb language sql as $$
  select public.ask_time_off_cancellation_service(tests.user('tc:' || person), tests.id('tc'), (pg_temp.req(label)).id,
    null, (pg_temp.req(label)).revision, gen_random_uuid())
$$;

-- While the workspace is open: Ali's time off in week 1 is approved, in week 2 approved with a cancellation
-- waiting, and in week 3 waiting for an answer.
insert into fixture values ('approved', tests.leave('tc', 'ali', 1));
select pg_temp.answer('mk', 'approved', 'approve');
insert into fixture values ('cancelled', tests.leave('tc', 'ali', 2));
select pg_temp.answer('mk', 'cancelled', 'approve');
select pg_temp.ask_cancel('ali', 'cancelled');
insert into fixture select 'cancellation', c.id from public.time_off_requests c
  where c.kind = 'cancel' and c.cancels_id = (pg_temp.req('cancelled')).id;
insert into fixture values ('pending', tests.leave('tc', 'ali', 3));

select is(array[(pg_temp.req('approved')).status, (pg_temp.req('cancelled')).status,
    (pg_temp.req('cancellation')).status, (pg_temp.req('pending')).status],
  array['approved', 'approved', 'pending', 'pending'],
  'while the workspace is open, time off is approved, a cancellation waits and a request waits');

create temporary table before_close as
  select r.id, r.status, r.revision, r.effective::text as effective
  from public.time_off_requests r where r.workspace_id = tests.id('tc');

-- The workspace closes.
update public.workspaces set lifecycle_status = 'suspended' where id = tests.id('tc');

select is(pg_temp.refusal($$select tests.leave('tc', 'ali', 4)$$),
  '42501 authz.workspace_closed', 'Ali cannot ask for time off in a closed workspace');
select is(pg_temp.refusal($$select tests.leave('tc', 'owner', 4)$$),
  '42501 authz.workspace_closed', 'in a closed workspace the owner cannot ask either');
select is(pg_temp.refusal($$select pg_temp.ask_cancel('ali', 'approved')$$),
  '42501 authz.workspace_closed', 'nor can anybody ask to cancel approved time off');
select is(pg_temp.refusal($$select pg_temp.answer('mk', 'pending', 'approve')$$),
  '42501 authz.workspace_closed', 'the manager cannot answer a request');
select is(pg_temp.refusal($$select pg_temp.answer('owner', 'pending', 'decline')$$),
  '42501 authz.workspace_closed', 'nor can the owner');
select is(pg_temp.refusal($$select pg_temp.answer('mk', 'cancellation', 'approve')$$),
  '42501 authz.workspace_closed', 'the manager cannot answer a cancellation');
select is(pg_temp.refusal(format($$select public.take_back_time_off_service(%L, %L, %L, 'Short-staffed', %s)$$,
    tests.user('tc:mk'), tests.id('tc'), (pg_temp.req('approved')).id, (pg_temp.req('approved')).revision)),
  '42501 authz.workspace_closed', 'the manager cannot take approved time off back');
select is(pg_temp.refusal(format($$select public.take_back_time_off_service(%L, %L, %L, 'Short-staffed', %s)$$,
    tests.user('tc:owner'), tests.id('tc'), (pg_temp.req('approved')).id, (pg_temp.req('approved')).revision)),
  '42501 authz.workspace_closed', 'nor can the owner');

select set_eq(
  $$select r.id, r.status, r.revision, r.effective::text from public.time_off_requests r where r.workspace_id = tests.id('tc')$$,
  $$select b.id, b.status, b.revision, b.effective from before_close b$$,
  'nothing the closed workspace refused changed a request');

select ok(
  (select p.prosrc like '%Another change is being saved%' and p.prosrc not like '%shift change%'
   from pg_proc p where p.oid = 'public.shift_exchange_guard_eligibility_write()'::regprocedure),
  'the write guard''s refusal no longer says a shift change is being reviewed');

select * from finish();
rollback;

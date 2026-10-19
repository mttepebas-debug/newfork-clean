begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- G9. BL-247: a closed workspace refuses time off at every door, the owner's own
-- request included. BL-109: the write guard's refusal does not blame a shift change.

select tests.world('tc');
-- The owner works here too (ROL-CIFT: the employee side needs the employee slot).
select tests.employee_slot('tc', 'owner');
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

-- Olcay (the owner) and Zeynep (an admin) ask for time off.
select tests.leave('tc', 'owner', 1);
select tests.leave('tc', 'zeynep', 2);

-- Olcay hands the workspace to Zeynep.
select public.initiate_workspace_ownership_transfer_service(tests.user('tc:owner'), tests.id('tc'), tests.user('tc:zeynep'));
select public.respond_workspace_ownership_transfer_service(tests.user('tc:zeynep'), tests.id('tc'),
  (select t.id from public.workspace_ownership_transfers t where t.workspace_id = tests.id('tc') and t.status = 'pending'), 'accept');

-- The decision chain (KARARLAR S-169): the owner's own time off waits like anybody's.
select tests.leave('tc', 'zeynep', 3);
select is((select r.status::text from public.schedule_time_off_requests r where r.id = tests.id('tc:zeynep:time_off')),
  'pending', 'Zeynep, now the owner, asks for time off and it waits for a decision');

-- The workspace closes.
update public.workspaces set lifecycle_status = 'suspended' where id = tests.id('tc');

select is(pg_temp.refusal($$select tests.leave('tc', 'zeynep', 4)$$),
  '42501 authz.workspace_closed', 'in a closed workspace the owner cannot ask either');
select is(pg_temp.refusal($$select tests.leave('tc', 'ali', 3)$$),
  '42501 authz.workspace_closed', 'Ali cannot ask for time off in a closed workspace');
select is(pg_temp.refusal(format($$select public.request_time_off_cancellation_service(%L, %L, %L, 1, '[]', '', gen_random_uuid())$$,
    tests.user('tc:owner'), tests.id('tc'), tests.id('tc:owner:time_off'))),
  '42501 authz.workspace_closed', 'nor can anybody ask to cancel approved time off');

select ok(
  (select p.prosrc like '%Another change is being saved%' and p.prosrc not like '%shift change%'
   from pg_proc p where p.oid = 'public.shift_exchange_guard_eligibility_write()'::regprocedure),
  'the write guard''s refusal no longer says a shift change is being reviewed');

select * from finish();
rollback;

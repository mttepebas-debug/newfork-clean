begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- Mert, 2026-10-11 (Requests, EKRAN-02): a swap or a cover reaches a manager
-- only once both sides agreed: somebody asked for the cover, or the teammate
-- accepted the swap. A request that closed before that never reaches the
-- manager's list. The owner and the people asked read it in Shift Hub all along.

select tests.world('ag');
select tests.person('ag', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('ag', 'ali', 'employee', array['K'], array['cook']);
select tests.person('ag', 'veli', 'employee', array['K'], array['cook']);
select tests.publish_week('ag', 1, '[
  {"label": "ali-mon", "person": "ali", "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "15:00"},
  {"label": "ali-tue", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"},
  {"label": "veli-wed", "person": "veli", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"},
  {"label": "ali-fri", "person": "ali", "loc": "K", "job": "cook", "day": 4, "start": "09:00", "end": "15:00"},
  {"label": "open-sat", "loc": "K", "job": "cook", "day": 5, "start": "09:00", "end": "15:00"}
]');

create function pg_temp.command(who text, command jsonb) returns jsonb language sql as $$
  select public.shift_exchanges_command_service(tests.user('ag:' || who), tests.id('ag'), command, gen_random_uuid())
$$;
-- The case as the person reads it: Requests for a manager, Shift Hub for an employee.
create function pg_temp.read(who text, manager_view boolean, target uuid, focused uuid default null) returns jsonb language sql as $$
  select c from jsonb_array_elements(public.shift_exchanges_read_service(tests.user('ag:' || who), tests.id('ag'), manager_view,
    tests.week(1), tests.week(1) + 6, focused) -> 'cases') c where c ->> 'id' = target::text
$$;
create function pg_temp.revision(target uuid) returns integer language sql as $$
  select revision from public.shift_exchange_cases where id = target
$$;

-- A cover nobody asked for yet -----------------------------------------------------
select tests.remember('ag:case:cover', (pg_temp.command('ali', jsonb_build_object('action', 'create', 'kind', 'cover',
  'shift_id', tests.id('ag:shift:ali-mon'))) ->> 'case_id')::uuid);
select tests.settle();
select ok(pg_temp.read('ali', false, tests.id('ag:case:cover')) is not null, 'Ali reads his cover in Shift Hub');
select ok(pg_temp.read('ayse', true, tests.id('ag:case:cover')) is null, 'Ayse''s Requests does not list a cover nobody asked for');
select ok(pg_temp.read('ayse', true, tests.id('ag:case:cover'), tests.id('ag:case:cover')) is null, 'nor does a link to it open it');

select pg_temp.command('veli', jsonb_build_object('action', 'apply', 'shift_id', tests.id('ag:shift:ali-mon'),
  'case_id', tests.id('ag:case:cover')));
select tests.settle();
select is(pg_temp.read('ayse', true, tests.id('ag:case:cover')) ->> 'stage', 'ready_for_manager',
  'once Veli asks for the shift, Ayse''s Requests lists it, ready for her');

-- The owner closes it after somebody asked: the manager keeps its record.
select pg_temp.command('ali', jsonb_build_object('action', 'close', 'case_id', tests.id('ag:case:cover'),
  'expected_revision', pg_temp.revision(tests.id('ag:case:cover')), 'reason', 'I can work after all'));
select is(pg_temp.read('ayse', true, tests.id('ag:case:cover')) ->> 'status', 'cancelled',
  'a cover closed after somebody asked stays in Ayse''s list, closed');

-- A cover closed before anybody asked ---------------------------------------------
select tests.remember('ag:case:quiet', (pg_temp.command('ali', jsonb_build_object('action', 'create', 'kind', 'cover',
  'shift_id', tests.id('ag:shift:ali-tue'))) ->> 'case_id')::uuid);
select pg_temp.command('ali', jsonb_build_object('action', 'close', 'case_id', tests.id('ag:case:quiet'),
  'expected_revision', pg_temp.revision(tests.id('ag:case:quiet')), 'reason', 'Never mind'));
select ok(pg_temp.read('ali', false, tests.id('ag:case:quiet')) is not null, 'Ali still reads his closed cover');
select ok(pg_temp.read('ayse', true, tests.id('ag:case:quiet')) is null, 'Ayse never reads a cover that closed before anybody asked');

-- A swap waits for the teammate -----------------------------------------------------
select tests.remember('ag:case:swap', (pg_temp.command('ali', jsonb_build_object('action', 'create', 'kind', 'swap',
  'shift_id', tests.id('ag:shift:ali-fri'), 'requested_shift_id', tests.id('ag:shift:veli-wed'))) ->> 'case_id')::uuid);
select tests.settle();
select is(pg_temp.read('veli', false, tests.id('ag:case:swap')) ->> 'stage', 'awaiting_peer', 'Veli is asked in Shift Hub');
select ok(pg_temp.read('ayse', true, tests.id('ag:case:swap')) is null, 'Ayse''s Requests does not list a swap Veli has not accepted');

select pg_temp.command('veli', jsonb_build_object('action', 'accept', 'case_id', tests.id('ag:case:swap'),
  'application_id', (select a.id from public.shift_exchange_applications a where a.case_id = tests.id('ag:case:swap')),
  'expected_revision', pg_temp.revision(tests.id('ag:case:swap'))));
select tests.settle();
select is(pg_temp.read('ayse', true, tests.id('ag:case:swap')) ->> 'stage', 'ready_for_manager',
  'once Veli accepts, Ayse''s Requests lists the swap, ready for her');
-- Closed after the agreement, the manager finds it by either side's date, as before
-- (shift_exchange_range_read). An open case skips the date range for a manager (BL-839),
-- so the search is checked on the closed one.
select pg_temp.command('ali', jsonb_build_object('action', 'close', 'case_id', tests.id('ag:case:swap'),
  'expected_revision', pg_temp.revision(tests.id('ag:case:swap')), 'reason', 'Plans changed'));
select ok(exists(select 1 from public.shift_exchange_cases where id = tests.id('ag:case:swap') and status <> 'open'),
  'Ali closed the agreed swap');
select ok(exists(select 1 from jsonb_array_elements(public.shift_exchanges_read_service(tests.user('ag:ayse'), tests.id('ag'), true,
  tests.week(1) + 2, tests.week(1) + 2) -> 'cases') c where c ->> 'id' = tests.id('ag:case:swap')::text),
  'Ayse finds the closed agreed swap by the date of the shift Veli gives');

-- An open shift is somebody asking already ----------------------------------------
select tests.remember('ag:case:open', (pg_temp.command('veli', jsonb_build_object('action', 'apply',
  'shift_id', tests.id('ag:shift:open-sat'))) ->> 'case_id')::uuid);
select tests.settle();
select is(pg_temp.read('ayse', true, tests.id('ag:case:open')) ->> 'kind', 'open_pickup',
  'Veli asking for Saturday''s open shift is in Ayse''s Requests');

select * from finish();
rollback;

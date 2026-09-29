begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- The "no" contract where FB-6.2 .6 leaves it (BL-155, BL-354): every refusal
-- is 42501 with an authz.* hint, and something unknown gets the very answer
-- something out of reach gets, so the answer never says whether it exists.
-- The Schedule's week list asks the core which locations it covers.

select tests.world('m');
select tests.person('m', 'ayse', 'manager', array['K'], array['cook']);
-- Manages Besiktas without working there (KARARLAR "yalnız yönetir").
select tests.person('m', 'selin', 'manager', null, null);
select tests.manages('m', 'selin', 'B');
select tests.person('m', 'emre', 'employee', array['K'], array['cook']);
select tests.person('m', 'veli', 'employee', array['B'], array['cook']);
select tests.person('m', 'sami', 'employee', array['K'], array['cook'], 'suspended');
select tests.world('x');
select tests.person('x', 'xena', 'employee', array['K'], array['cook']);
select tests.publish_week('m', 1, '[
  {"label": "veli-b", "person": "veli", "loc": "B", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"},
  {"label": "emre-k", "person": "emre", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"}
]');
select tests.time_off('m', 'veli', 2);

-- The whole answer: code, reason and message.
create function pg_temp.answer(statement text) returns text language plpgsql as $$
declare
  code text;
  reason text;
  said text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics code = returned_sqlstate, reason = pg_exception_hint, said = message_text;
  return code || ' ' || coalesce(reason, '') || ' ' || said;
end;
$$;
create function pg_temp.refusal(statement text) returns text language sql as $$
  select case when a = 'allowed' then a else split_part(a, ' ', 1) || ' ' || split_part(a, ' ', 2) end
  from pg_temp.answer(statement) a
$$;

-- 1. The Schedule's week list (BL-155) ---------------------------------------------------

-- Whose shifts the week lists.
create function pg_temp.week_shifts(actor text) returns uuid[] language sql as $$
  select coalesce(array_agg((s ->> 'employee_id')::uuid order by s ->> 'employee_id'), '{}')
  from jsonb_array_elements(public.list_schedule_weekly_shifts_service(
    tests.user('m:' || actor), tests.id('m'), tests.week(1)) -> 'shifts') s
$$;

select ok(tests.id('m:veli') = any(pg_temp.week_shifts('selin')),
  'a manager who only manages Besiktas lists its week');
select ok(not tests.id('m:veli') = any(pg_temp.week_shifts('ayse')),
  'a manager at Kadikoy does not list Besiktas''s');
select ok(tests.id('m:emre') = any(pg_temp.week_shifts('ayse')), 'but lists their own location''s');
select is(
  pg_temp.refusal(format('select public.list_schedule_weekly_shifts_service(%L, %L, %L)',
    tests.user('m:emre'), tests.id('m'), tests.week(1))),
  '42501 authz.missing_permission', 'an employee lists no manager week'
);

-- 2. Employee Hub's door (BL-354) ----------------------------------------------------------

select is(
  pg_temp.refusal(format('select public.employee_hub_actor_service(%L, %L)', tests.user('x:xena'), tests.id('m'))),
  '42501 authz.not_member', 'somebody from another workspace is not a member here'
);
select is(
  pg_temp.refusal(format('select public.employee_hub_actor_service(%L, %L)', tests.user('m:sami'), tests.id('m'))),
  '42501 authz.not_active', 'somebody whose access was removed is not active'
);

-- 3. An unknown time-off request answers as one out of reach (BL-354) ----------------------

select is(
  pg_temp.answer(format($$select public.decide_time_off_with_assignments_service(%L, %L, %L, 1, 'reject', '', '[]', gen_random_uuid(), null, '[]')$$,
    tests.user('m:ayse'), tests.id('m'), gen_random_uuid())),
  pg_temp.answer(format($$select public.decide_time_off_with_assignments_service(%L, %L, %L, 1, 'reject', '', '[]', gen_random_uuid(), null, '[]')$$,
    tests.user('m:ayse'), tests.id('m'), tests.id('m:veli:time_off'))),
  'deciding: an unknown request gets the answer a request at another location gets'
);
select is(
  pg_temp.refusal(format($$select public.decide_time_off_with_assignments_service(%L, %L, %L, 1, 'reject', '', '[]', gen_random_uuid(), null, '[]')$$,
    tests.user('m:ayse'), tests.id('m'), gen_random_uuid())),
  '42501 authz.out_of_scope', 'and that answer is out of scope'
);
select is(
  pg_temp.answer(format($$select public.preview_time_off_assignment_decision_service(%L, %L, %L, 1, 'approve', '[]')$$,
    tests.user('m:ayse'), tests.id('m'), gen_random_uuid())),
  pg_temp.answer(format($$select public.preview_time_off_assignment_decision_service(%L, %L, %L, 1, 'approve', '[]')$$,
    tests.user('m:ayse'), tests.id('m'), tests.id('m:veli:time_off'))),
  'previewing: the same'
);
select is(
  pg_temp.answer(format($$select public.shorten_time_off_service(%L, %L, %L, 1, '[]', '', gen_random_uuid())$$,
    tests.user('m:ayse'), tests.id('m'), gen_random_uuid())),
  pg_temp.answer(format($$select public.shorten_time_off_service(%L, %L, %L, 1, '[]', '', gen_random_uuid())$$,
    tests.user('m:ayse'), tests.id('m'), tests.id('m:veli:time_off'))),
  'shortening: the same'
);
select is(
  pg_temp.refusal(format($$select public.shorten_time_off_service(%L, %L, %L, 1, '[]', '', gen_random_uuid())$$,
    tests.user('m:ayse'), tests.id('m'), gen_random_uuid())),
  '42501 authz.out_of_scope', 'and that answer is out of scope'
);

-- 4. Asking for a preferred name on somebody else's record ---------------------------------

select is(
  pg_temp.refusal(format('select public.request_employee_preferred_name_service(%L, %L, %L, %L)',
    tests.user('m:ayse'), tests.id('m'), tests.id('m:emre'), 'Em')),
  '42501 authz.out_of_scope', 'nobody asks for a preferred name on somebody else''s record'
);
select is(
  pg_temp.answer(format('select public.request_employee_preferred_name_service(%L, %L, %L, %L)',
    tests.user('m:ayse'), tests.id('m'), gen_random_uuid(), 'Em')),
  pg_temp.answer(format('select public.request_employee_preferred_name_service(%L, %L, %L, %L)',
    tests.user('m:ayse'), tests.id('m'), tests.id('m:emre'), 'Em')),
  'an unknown record gets the answer somebody else''s gets'
);
select is(
  pg_temp.refusal(format('select public.request_employee_preferred_name_service(%L, %L, %L, %L)',
    tests.user('m:emre'), tests.id('m'), tests.id('m:emre'), 'Em')),
  'allowed', 'the person asks on their own record'
);
-- The core's gates hold for one's own record too (nf-guvenlik D-a).
select is(
  pg_temp.refusal(format('select public.request_employee_preferred_name_service(%L, %L, %L, %L)',
    tests.user('m:sami'), tests.id('m'), tests.id('m:sami'), 'Sam')),
  '42501 authz.not_active', 'not with their access removed'
);
select tests.world('c');
select tests.person('c', 'cem', 'employee', array['K'], array['cook']);
update public.workspaces set lifecycle_status = 'suspended' where id = tests.id('c');
select is(
  pg_temp.refusal(format('select public.request_employee_preferred_name_service(%L, %L, %L, %L)',
    tests.user('c:cem'), tests.id('c'), tests.id('c:cem'), 'Cemo')),
  '42501 authz.workspace_closed', 'nor in a workspace that is closed'
);

select * from finish();
rollback;

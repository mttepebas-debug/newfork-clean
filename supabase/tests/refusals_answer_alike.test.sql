begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- The "no" contract where FB-6.2 .6 leaves it (BL-155, BL-354): every refusal
-- is 42501 with an authz.* hint, and something unknown gets the very answer
-- something out of reach gets, so the answer never says whether it exists.
-- The Schedule's week list asks the core which locations it covers.

select tests.world('m');
select tests.person('m', 'ayse', 'manager', array['K'], array['cook']);
-- Manages Besiktas without taking shifts: assigned there and excluded from the
-- Schedule (EMP-001).
select tests.person('m', 'selin', 'manager', array['B'], array['cook']);
select tests.excluded('m', 'selin');
select tests.person('m', 'emre', 'employee', array['K'], array['cook']);
select tests.person('m', 'veli', 'employee', array['B'], array['cook']);
select tests.person('m', 'sami', 'employee', array['K'], array['cook'], 'suspended');
select tests.world('x');
select tests.person('x', 'xena', 'employee', array['K'], array['cook']);
select tests.publish_week('m', 1, '[
  {"label": "veli-b", "person": "veli", "loc": "B", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"},
  {"label": "emre-k", "person": "emre", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"}
]');
select tests.leave('m', 'veli', 2);

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
  'a manager excluded from the Schedule lists the week of the location they are assigned to');
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
-- Time off rebuild D8: deciding and shortening went with the old time off (the decision preview before it); the new
-- request's doors are answering, what answering would open, and taking approved time off back.

select is(
  pg_temp.answer(format($$select public.answer_time_off_service(%L, %L, %L, 'decline', '', 1, null)$$,
    tests.user('m:ayse'), tests.id('m'), gen_random_uuid())),
  pg_temp.answer(format($$select public.answer_time_off_service(%L, %L, %L, 'decline', '', 1, null)$$,
    tests.user('m:ayse'), tests.id('m'), tests.id('m:veli:time_off'))),
  'answering: an unknown request gets the answer a request at another location gets'
);
select is(
  pg_temp.refusal(format($$select public.answer_time_off_service(%L, %L, %L, 'decline', '', 1, null)$$,
    tests.user('m:ayse'), tests.id('m'), gen_random_uuid())),
  '42501 authz.out_of_scope', 'and that answer is out of scope'
);
select is(
  pg_temp.answer(format($$select public.time_off_impact_service(%L, %L, %L)$$,
    tests.user('m:ayse'), tests.id('m'), gen_random_uuid())),
  pg_temp.answer(format($$select public.time_off_impact_service(%L, %L, %L)$$,
    tests.user('m:ayse'), tests.id('m'), tests.id('m:veli:time_off'))),
  'previewing: the same'
);
select is(
  pg_temp.answer(format($$select public.take_back_time_off_service(%L, %L, %L, 'Short staffed', 1)$$,
    tests.user('m:ayse'), tests.id('m'), gen_random_uuid())),
  pg_temp.answer(format($$select public.take_back_time_off_service(%L, %L, %L, 'Short staffed', 1)$$,
    tests.user('m:ayse'), tests.id('m'), tests.id('m:veli:time_off'))),
  'taking back: the same'
);
select is(
  pg_temp.refusal(format($$select public.take_back_time_off_service(%L, %L, %L, 'Short staffed', 1)$$,
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
-- KK-32: somebody still finishing onboarding, or missing a required document,
-- asks on their own record all the same (restricted_ok). Account > Profile's
-- one Save writes the name to every workspace the person is in; one that is
-- still onboarding them no longer fails it.
select tests.world('r');
select tests.person('r', 'nur', 'employee', array['K'], array['cook'], 'onboarding');
select is(
  pg_temp.refusal(format('select public.request_employee_preferred_name_service(%L, %L, %L, %L)',
    tests.user('r:nur'), tests.id('r'), tests.id('r:nur'), 'Nuri')),
  'allowed', 'somebody still finishing their onboarding asks on their own record'
);
select tests.world('d');
select tests.person('d', 'dora', 'employee', array['K'], array['cook']);
-- ponytail: the deadline is moved into the past by hand, as in schedule_asks_the_core.
create temporary table required_document (id uuid, preview jsonb);
insert into required_document (id)
select public.save_document_type_lifecycle_service(tests.user('d:owner'), tests.id('d'), null, null, jsonb_build_object(
  'title', 'Food handler card', 'description', 'Card', 'requires_review', true, 'accepted_formats', array['pdf'],
  'tracks_expiry', false, 'expiry_warning_days', 30,
  'lifecycle_settings', jsonb_build_object('mode', 'conditional', 'assignment_scope', 'all_active',
    'target', jsonb_build_object('operator', 'and', 'location_ids', '[]'::jsonb, 'department_ids', '[]'::jsonb,
      'job_ids', '[]'::jsonb, 'employee_ids', '[]'::jsonb),
    'period_days', 7, 'suspend_on_overdue', true, 'extra_fields', '[]'::jsonb)));
update required_document set preview = public.preview_document_publication_service(tests.user('d:owner'), tests.id('d'), id);
select public.set_document_publication_service(tests.user('d:owner'), tests.id('d'), id,
  (preview ->> 'revision')::integer, (preview ->> 'publication_revision')::integer, preview ->> 'preview_token', 'Publish', 'published')
from required_document;
select tests.settle();
update public.employee_onboarding_requirements set deadline_at = now() - interval '1 day'
where source_id = (select id from required_document) and lifecycle_user_id = tests.user('d:dora');
select is((app_private.actor(tests.user('d:dora'), tests.id('d'))).document_blocked, true,
  'Dora misses a required document');
select is(
  pg_temp.refusal(format('select public.request_employee_preferred_name_service(%L, %L, %L, %L)',
    tests.user('d:dora'), tests.id('d'), tests.id('d:dora'), 'Dor')),
  'allowed', 'and so does somebody missing a required document'
);

select * from finish();
rollback;

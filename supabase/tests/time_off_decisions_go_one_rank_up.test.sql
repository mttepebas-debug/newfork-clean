begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- BL-177: a time-off request goes one rank up (REUSE "Rütbe"). A manager
-- decides an employee's request at their location, never another manager's;
-- an admin decides a manager's, never the owner's; the owner decides an
-- admin's; nobody decides their own. Every decision path (approve, partial
-- approve, the assignment-aware entry point) asks the core,
-- app_private.authorize(..., 'time_off.decide', target_person => requester),
-- and a no is 42501 with an authz.* hint.
--
-- The owner's own request needs no approval: it is recorded approved when
-- filed, through the same approval step (decision event by the owner,
-- published shifts on those hours released), and so is the owner's
-- cancellation of their own leave.

select tests.world('to');
select tests.person('to', 'ali', 'manager', array['K'], array['cook']);
select tests.person('to', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('to', 'mehmet', 'manager', array['B'], array['cook']);
select tests.person('to', 'zeynep', 'admin', array['K'], array['server']);
select tests.person('to', 'emre', 'employee', array['K'], array['cook']);
-- The owner works a published Wednesday shift at Kadikoy, the day every
-- request below asks for.
select tests.publish_week('to', 0, '[
  {"label": "owner-wed", "person": "owner", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"}
]');
select tests.time_off('to', 'emre');
select tests.time_off('to', 'ayse');
select tests.time_off('to', 'zeynep');
select tests.time_off('to', 'owner');

-- What a call answers: 'allowed', or the error code and its authz hint.
create function pg_temp.outcome(statement text)
returns text
language plpgsql
as $$
declare
  code text;
  reason text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics code = returned_sqlstate, reason = pg_exception_hint;
  return concat_ws(' ', code, nullif(reason, ''));
end;
$$;

-- Decide a request whole, the way the Requests screen does.
create function pg_temp.resolve(actor_label text, holder text, verb text default 'approve')
returns text
language sql
as $$
  select pg_temp.outcome(format(
    'select public.resolve_schedule_time_off_request_service(%L, %L, %L, %s, %L, %L)',
    tests.user('to:' || actor_label), tests.id('to'), tests.id('to:' || holder || ':time_off'),
    (select r.revision from public.schedule_time_off_requests r where r.id = tests.id('to:' || holder || ':time_off')),
    verb, ''
  ))
$$;

-- Approve the first half of the day and deny the rest.
create function pg_temp.approve_half(actor_label text, holder text)
returns text
language sql
as $$
  select pg_temp.outcome(format(
    'select public.resolve_time_off_period_decision_service(%L, %L, %L, %s, %L, %L, %L::jsonb, %L)',
    tests.user('to:' || actor_label), tests.id('to'), s.request_id, r.revision, 'partial_approve', '',
    jsonb_build_array(jsonb_build_object('segment_id', s.id, 'pieces', jsonb_build_array(
      jsonb_build_object('starts_at', lower(span), 'ends_at', lower(span) + (upper(span) - lower(span)) / 2, 'status', 'approved'),
      jsonb_build_object('starts_at', lower(span) + (upper(span) - lower(span)) / 2, 'ends_at', upper(span), 'status', 'denied')
    ))),
    gen_random_uuid()
  ))
  from public.schedule_time_off_segments s
  join public.schedule_time_off_requests r on r.id = s.request_id
  cross join lateral public.time_off_period_span(s.id) span
  where s.request_id = tests.id('to:' || holder || ':time_off')
$$;

-- The assignment-aware entry point the API calls.
create function pg_temp.decide(actor_label text, holder text)
returns text
language sql
as $$
  select pg_temp.outcome(format(
    'select public.decide_time_off_with_assignments_service(%L, %L, %L, %s, %L, %L, %L::jsonb, %L, null, %L::jsonb)',
    tests.user('to:' || actor_label), tests.id('to'), tests.id('to:' || holder || ':time_off'),
    (select r.revision from public.schedule_time_off_requests r where r.id = tests.id('to:' || holder || ':time_off')),
    'approve', '', '[]', gen_random_uuid(), '[]'
  ))
$$;

-- 1. The owner's request is recorded approved when filed.
select is(
  (select r.status::text || ' ' || r.revision from public.schedule_time_off_requests r where r.id = tests.id('to:owner:time_off')),
  'approved 2', 'the owner''s request is approved as soon as it is filed'
);
select is(
  (select array_agg(e.action || ' by ' || case when e.actor_user_id = tests.user('to:owner') then 'owner' else 'someone else' end order by e.action)
   from public.schedule_time_off_events e where e.request_id = tests.id('to:owner:time_off')),
  array['approved by owner', 'submitted by owner'],
  'its history reads: filed by the owner, approved by the owner'
);
select is(
  (select p.employee_id from public.schedule_published_shifts p where p.id = tests.id('to:shift:owner-wed')),
  null::uuid, 'the owner''s published Wednesday shift is released, as with any approval'
);
select is(
  (select count(*)::integer from public.time_off_assignment_releases x
   where x.request_id = tests.id('to:owner:time_off') and x.published_shift_id = tests.id('to:shift:owner-wed')),
  1, 'and the release is on record'
);

-- 2. Nobody decides their own request.
select is(pg_temp.resolve('ayse', 'ayse'), '42501 authz.rank', 'Ayse cannot approve her own request');
select is(pg_temp.resolve('owner', 'owner', 'revoke'), '42501 authz.rank', 'the owner cannot revoke their own leave');

-- 3. A manager decides an employee's request, not another manager's.
select is(pg_temp.resolve('ali', 'ayse'), '42501 authz.rank', 'Ali (manager, Kadikoy) cannot approve Ayse''s request (manager, Kadikoy)');
select is(pg_temp.approve_half('ali', 'ayse'), '42501 authz.rank', 'nor approve half of it');
select is(pg_temp.decide('ali', 'ayse'), '42501 authz.rank', 'nor through the assignment-aware entry point');
select is(pg_temp.resolve('mehmet', 'emre'), '42501 authz.out_of_scope', 'Mehmet (manager, Besiktas) cannot decide Emre''s Kadikoy request');
select is(pg_temp.approve_half('ali', 'emre'), 'allowed', 'Ali approves half of Emre''s request (employee, Kadikoy)');

-- 4. An admin decides a manager's request, never the owner's.
select is(pg_temp.resolve('zeynep', 'owner', 'revoke'), '42501 authz.rank', 'Zeynep (admin) cannot revoke the owner''s leave');
select is(pg_temp.approve_half('zeynep', 'owner'), '42501 authz.rank', 'nor decide part of it');
select is(pg_temp.resolve('zeynep', 'ayse'), 'allowed', 'Zeynep (admin) approves Ayse''s request (manager)');

-- 5. The owner decides an admin's request.
select is(pg_temp.decide('owner', 'zeynep'), 'allowed', 'the owner approves Zeynep''s request (admin)');

-- 6. What the refusals left behind: nothing.
select is(
  (select count(*)::integer from public.schedule_time_off_events e
   where e.request_id = tests.id('to:ayse:time_off') and e.actor_user_id = tests.user('to:ali')),
  0, 'Ali left no decision on Ayse''s request'
);
select is(
  (select r.status::text from public.schedule_time_off_requests r where r.id = tests.id('to:owner:time_off')),
  'approved', 'the owner''s leave is still approved'
);

-- 7. The owner's cancellation of their own leave is recorded approved too.
create temporary table owner_cancel as
select public.submit_employee_time_off_cancellation_service(
  tests.user('to:owner'), tests.id('to'), r.id, r.revision, 'plans changed',
  (select jsonb_agg(jsonb_build_object('segment_id', s.id, 'starts_at', lower(span), 'ends_at', upper(span)))
   from public.schedule_time_off_segments s cross join lateral unnest(public.time_off_effective_ranges(s.id)) span
   where s.request_id = r.id),
  gen_random_uuid()
) as result
from public.schedule_time_off_requests r where r.id = tests.id('to:owner:time_off');
select is((select result ->> 'status' from owner_cancel), 'approved', 'the owner''s cancellation is approved as soon as it is filed');
select is(
  (select r.status::text from public.schedule_time_off_requests r where r.id = tests.id('to:owner:time_off')),
  'revoked', 'and the cancelled leave is no longer in effect'
);
select is(
  (select p.employee_id from public.schedule_published_shifts p where p.id = tests.id('to:shift:owner-wed')),
  null::uuid, 'the released shift stays released, as with any cancellation'
);

select * from finish();
rollback;

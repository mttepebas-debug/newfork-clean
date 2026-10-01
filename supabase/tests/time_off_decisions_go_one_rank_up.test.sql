begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

-- BL-177: a time-off request goes one rank up (REUSE "Rütbe"). A manager
-- decides an employee's request at their location, never another manager's;
-- an admin decides a manager's, never the owner's; the owner decides an
-- admin's; nobody decides their own. A vote (decide_time_off_service) and a
-- revoke (revoke_time_off_service) ask the core, app_private.authorize(...,
-- 'time_off.decide' / 'time_off.revoke', target_person => requester), and a no
-- is 42501 with an authz.* hint. FB-6.3.7: no partial decision, one entry
-- point for a vote.
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
select tests.person('to', 'zafer', 'admin', array['K'], array['server']);
select tests.person('to', 'emre', 'employee', array['K'], array['cook']);
-- The owner works a published Wednesday shift at Kadikoy, the day every
-- request below asks for.
-- The owner works the Owner job only until somebody assigns another (BL-218).
insert into public.employee_job_assignments (workspace_id, employee_id, job_id, created_by)
values (tests.id('to'), tests.id('to:owner'), tests.id('to:job:cook'), tests.user('to:owner'));
select tests.publish_week('to', 0, '[
  {"label": "owner-wed", "person": "owner", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"}
]');
select tests.leave('to', 'emre');
select tests.leave('to', 'ayse');
select tests.leave('to', 'zeynep');
select tests.leave('to', 'zafer');
select tests.leave('to', 'owner');

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

-- A vote on a request, the way the Requests screen sends it; 'revoke' takes
-- approved leave back.
create function pg_temp.resolve(actor_label text, holder text, verb text default 'approve')
returns text
language sql
as $$
  select pg_temp.outcome(case when verb = 'revoke' then format(
    'select public.revoke_time_off_service(%L, %L, %L, %s, %L)',
    tests.user('to:' || actor_label), tests.id('to'), r.id, r.revision, 'test')
  else format(
    'select public.decide_time_off_service(%L, %L, %L, %L, %L, %L)',
    tests.user('to:' || actor_label), tests.id('to'), r.id, verb, '',
    app_private.time_off_impact(tests.id('to'), r.id) ->> 'fingerprint') end)
  from public.schedule_time_off_requests r where r.id = tests.id('to:' || holder || ':time_off')
$$;

-- 1. The owner's request is recorded approved when filed.
select is(
  (select r.status::text from public.schedule_time_off_requests r where r.id = tests.id('to:owner:time_off')),
  'approved', 'the owner''s request is approved as soon as it is filed'
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
-- Approving on filing is only for the owner's own request.
select is(
  (select r.status::text from public.schedule_time_off_requests r where r.id = tests.id('to:emre:time_off')),
  'pending', 'Emre''s request is still pending'
);

-- 2. Nobody decides their own request.
select is(pg_temp.resolve('ayse', 'ayse'), '42501 authz.rank', 'Ayse cannot approve her own request');
select is(pg_temp.resolve('owner', 'owner', 'revoke'), '42501 authz.rank', 'the owner cannot revoke their own leave');
select is(pg_temp.resolve('zeynep', 'zeynep'), '42501 authz.rank', 'Zeynep (admin) cannot approve her own request');

-- 3. A manager decides an employee's request, not another manager's.
select is(pg_temp.resolve('ali', 'ayse'), '42501 authz.rank', 'Ali (manager, Kadikoy) cannot approve Ayse''s request (manager, Kadikoy)');
select is(pg_temp.resolve('ali', 'zeynep'), '42501 authz.rank', 'Ali (manager) cannot approve Zeynep''s request (admin)');
select is(pg_temp.resolve('mehmet', 'emre'), '42501 authz.out_of_scope', 'Mehmet (manager, Besiktas) cannot decide Emre''s Kadikoy request');
select is(pg_temp.resolve('ali', 'emre'), 'allowed', 'Ali approves Emre''s request (employee, Kadikoy)');

-- 4. An admin decides a manager's request, never the owner's.
select is(pg_temp.resolve('zeynep', 'owner', 'revoke'), '42501 authz.rank', 'Zeynep (admin) cannot revoke the owner''s leave');
select is(pg_temp.resolve('zeynep', 'zafer'), '42501 authz.rank', 'Zeynep (admin) cannot approve Zafer''s request (admin)');
select is(pg_temp.resolve('zeynep', 'ayse'), 'allowed', 'Zeynep (admin) approves Ayse''s request (manager)');

-- 5. The owner decides an admin's request.
select is(pg_temp.resolve('owner', 'zeynep'), 'allowed', 'the owner approves Zeynep''s request (admin)');

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
select public.request_time_off_cancellation_service(
  tests.user('to:owner'), tests.id('to'), r.id, r.revision,
  (select jsonb_agg(jsonb_build_object('segment_id', s.id, 'starts_at', lower(span), 'ends_at', upper(span)))
   from public.schedule_time_off_segments s cross join lateral unnest(public.time_off_effective_ranges(s.id)) span
   where s.request_id = r.id),
  'plans changed', gen_random_uuid()
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

begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- BL-177, then the decision chain (KARARLAR S-164, S-169; ROL-CIFT design §4.5, §8.1):
-- a time-off request goes to the managers of the person's locations other than the
-- person, else an admin, else the owner; rank is not counted on the employee side, so
-- a manager votes on a peer manager's or an admin's request, and an admin decides a
-- peer admin's. An admin and the owner decide alone at every step. Nobody decides
-- their own; the owner's own waits like anybody's (it was recorded approved at once).
-- A vote (decide_time_off_service) and a revoke (revoke_time_off_service) ask the
-- core, and a no is 42501 with an authz.* hint. Revoking approved leave is
-- management's and keeps the rank (one rank up). FB-6.3.7: no partial decision, one
-- entry point for a vote.

select tests.world('to');
-- The owner works here too (ROL-CIFT: the employee side needs the employee slot).
select tests.employee_slot('to', 'owner');
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

-- 1. The owner's request waits like anybody's: Kadikoy has managers and there are admins.
select is(
  (select r.status::text from public.schedule_time_off_requests r where r.id = tests.id('to:owner:time_off')),
  'pending', 'the owner''s request waits for a decision'
);
select is(
  (select p.employee_id from public.schedule_published_shifts p where p.id = tests.id('to:shift:owner-wed')),
  tests.id('to:owner'), 'the owner''s published Wednesday shift is still theirs'
);

-- 2. Nobody decides their own request.
select is(pg_temp.resolve('owner', 'owner'), '42501 authz.rank', 'the owner cannot approve their own request');
select is(pg_temp.resolve('ayse', 'ayse'), '42501 authz.rank', 'Ayse cannot approve her own request');
select is(pg_temp.resolve('zeynep', 'zeynep'), '42501 authz.rank', 'Zeynep (admin) cannot approve her own request');

-- 3. Kadikoy's managers vote whatever the rank of whom it is about.
select is(pg_temp.resolve('mehmet', 'emre'), '42501 authz.out_of_scope', 'Mehmet (manager, Besiktas) cannot decide Emre''s Kadikoy request');
select is(pg_temp.resolve('ali', 'emre'), 'allowed', 'Ali approves Emre''s request (employee, Kadikoy)');
select is(pg_temp.resolve('ali', 'ayse'), 'allowed', 'Ali approves his peer Ayse''s request (manager, Kadikoy)');
select is(pg_temp.resolve('ali', 'zeynep'), 'allowed', 'Ali approves Zeynep''s request (admin, works at Kadikoy)');

-- 4. An admin decides at every step, a peer admin's request too.
select is(pg_temp.resolve('zeynep', 'zafer'), 'allowed', 'Zeynep (admin) approves Zafer''s request (admin)');
select is(pg_temp.resolve('zeynep', 'owner'), 'allowed', 'Zeynep (admin) approves the owner''s request');
select is(
  (select r.status::text from public.schedule_time_off_requests r where r.id = tests.id('to:owner:time_off')),
  'approved', 'the owner''s request is approved'
);
select is(
  (select p.employee_id from public.schedule_published_shifts p where p.id = tests.id('to:shift:owner-wed')),
  null::uuid, 'and the owner''s published Wednesday shift is released, as with any approval'
);

-- 5. Revoking approved leave keeps the rank: one rank up, never one's own.
select is(pg_temp.resolve('owner', 'owner', 'revoke'), '42501 authz.rank', 'the owner cannot revoke their own leave');
select is(pg_temp.resolve('zeynep', 'owner', 'revoke'), '42501 authz.rank', 'Zeynep (admin) cannot revoke the owner''s leave');

-- 6. The owner's cancellation of their own leave waits too.
create temporary table owner_cancel as
select public.request_time_off_cancellation_service(
  tests.user('to:owner'), tests.id('to'), r.id, r.revision,
  (select jsonb_agg(jsonb_build_object('segment_id', s.id, 'starts_at', lower(span), 'ends_at', upper(span)))
   from public.schedule_time_off_segments s cross join lateral unnest(public.time_off_effective_ranges(s.id)) span
   where s.request_id = r.id),
  'plans changed', gen_random_uuid()
) as result
from public.schedule_time_off_requests r where r.id = tests.id('to:owner:time_off');
select is((select result ->> 'status' from owner_cancel), 'pending', 'the owner''s cancellation waits for a decision');
select is(
  (select r.status::text from public.schedule_time_off_requests r where r.id = tests.id('to:owner:time_off')),
  'approved', 'and the leave stays in effect until then'
);

select * from finish();
rollback;

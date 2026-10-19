begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- FB-6.3.8c (user decisions 2026-10-01, KARARLAR "İzin"): a time-off request,
-- waiting or closed, is read in Requests and counted on Workspace home only by
-- the people who decide it, nobody their own. The decision chain (KARARLAR
-- S-164, S-169): rank is not counted on the employee side, so a manager reads a
-- peer manager's and an admin's request at their locations, and an admin reads
-- another admin's; the owner reads everybody's. A cancellation request is read
-- the same way. The person reads their own on Employee hub, not in the decision
-- queue.

select tests.world('sd');
-- The owner works here too (ROL-CIFT: the employee side needs the employee slot).
select tests.employee_slot('sd', 'owner');
select tests.person('sd', 'zeynep', 'admin', array['K'], array['cook']);
select tests.person('sd', 'kaan', 'admin', array['B'], array['cook']);
select tests.person('sd', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('sd', 'hande', 'manager', array['K'], array['cook']);
select tests.person('sd', 'mehmet', 'manager', array['B'], array['cook']);
select tests.person('sd', 'ali', 'employee', array['K'], array['cook']);
select tests.person('sd', 'veli', 'employee', array['B'], array['cook']);

-- The first names a viewer's queue lists ('needs_review' or 'closed').
create function pg_temp.queue(who text, which text) returns text[] language sql as $$
  select coalesce(array_agg(split_part(t ->> 'employee_name', ' ', 1) order by t ->> 'employee_name'), '{}')
  from jsonb_array_elements(public.get_schedule_requests_service(
    tests.user('sd:' || who), tests.id('sd'), which, null, '', null, 100) -> 'time_off_requests') t
$$;
create function pg_temp.lists(who text, rid uuid) returns boolean language sql as $$
  select exists (select 1 from jsonb_array_elements(public.get_schedule_requests_service(
    tests.user('sd:' || who), tests.id('sd'), 'needs_review', null, '', null, 100) -> 'time_off_requests') t
    where (t ->> 'id')::uuid = rid)
$$;
create function pg_temp.tab_count(who text) returns integer language sql as $$
  select (public.get_schedule_requests_service(tests.user('sd:' || who), tests.id('sd'), 'needs_review', null, '', null, 100)
    ->> 'time_off_pending_count')::integer
$$;
create function pg_temp.home(who text) returns integer language sql as $$
  select (public.get_workspace_dashboard_service(tests.user('sd:' || who), tests.id('sd')) #>> '{metrics,pending_time_off_count}')::integer
$$;
create function pg_temp.decide(who text, rid uuid, verdict text, note text default '') returns jsonb language sql as $$
  select public.decide_time_off_service(tests.user('sd:' || who), tests.id('sd'), rid, verdict, note,
    app_private.time_off_impact(tests.id('sd'), rid) ->> 'fingerprint')
$$;
create function pg_temp.cancel(who text, rid uuid) returns uuid language sql as $$
  select (public.request_time_off_cancellation_service(tests.user('sd:' || who), tests.id('sd'), rid,
    (select r.revision from public.schedule_time_off_requests r where r.id = rid),
    (select jsonb_agg(jsonb_build_object('segment_id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at))
     from public.schedule_time_off_segments s where s.request_id = rid),
    'Plans changed', gen_random_uuid()) ->> 'request_id')::uuid
$$;

select tests.remember('sd:hande:1', tests.leave('sd', 'hande', 1));
select tests.remember('sd:ali:1', tests.leave('sd', 'ali', 1));
select tests.remember('sd:veli:1', tests.leave('sd', 'veli', 1));
select tests.remember('sd:zeynep:1', tests.leave('sd', 'zeynep', 1));
select tests.remember('sd:kaan:1', tests.leave('sd', 'kaan', 1));

-- 1. Waiting requests -----------------------------------------------------------

select is(pg_temp.queue('ayse', 'needs_review'), array['Ali', 'Hande', 'Zeynep'],
  'Ayse (manager, Kadikoy) reads every Kadikoy request but her own: Ali''s, her peer Hande''s, the admin Zeynep''s');
select is(pg_temp.tab_count('ayse'), 3, 'and the Time off tab counts three');
select is(pg_temp.home('ayse'), 3, 'and Workspace home counts three');
select is(pg_temp.queue('hande', 'needs_review'), array['Ali', 'Zeynep'],
  'Hande reads Ali''s and Zeynep''s, not her own (it waits on Employee hub)');
select is(pg_temp.home('hande'), 2, 'and Workspace home counts two for Hande');
select is(pg_temp.queue('mehmet', 'needs_review'), array['Kaan', 'Veli'],
  'Mehmet (Besiktas) reads Veli''s and the admin Kaan''s: Ali works at Kadikoy alone');
select is(pg_temp.queue('zeynep', 'needs_review'), array['Ali', 'Hande', 'Kaan', 'Veli'],
  'an admin reads everybody''s but her own, another admin''s too');
select is(pg_temp.queue('kaan', 'needs_review'), array['Ali', 'Hande', 'Veli', 'Zeynep'],
  'so does the admin of Besiktas: an admin decides anywhere');
select is(pg_temp.home('zeynep'), 4, 'Workspace home counts the same four for the admin');
select is(pg_temp.queue('owner', 'needs_review'), array['Ali', 'Hande', 'Kaan', 'Veli', 'Zeynep'],
  'the owner reads everybody''s, the admins'' too');
select is(pg_temp.tab_count('owner'), 5, 'and counts five');
select is(pg_temp.home('owner'), 5, 'on Workspace home as well');

-- 2. Closed requests follow the same rule ----------------------------------------

select is(pg_temp.decide('zeynep', tests.id('sd:hande:1'), 'deny', 'Short staffed that week') ->> 'status', 'denied',
  'the admin declines Hande''s request');
select is(pg_temp.decide('ayse', tests.id('sd:ali:1'), 'approve') ->> 'status', 'approved',
  'Ayse approves Ali''s; Kadikoy was the only vote');
select is(pg_temp.queue('ayse', 'closed'), array['Ali', 'Hande'],
  'Ayse''s closed list holds Ali''s request and her peer Hande''s declined one');
select is(pg_temp.queue('hande', 'closed'), array['Ali'], 'Hande''s closed list does not hold her own either');
select is(pg_temp.queue('owner', 'closed'), array['Ali', 'Hande'], 'the owner''s holds both');
select is(pg_temp.queue('zeynep', 'closed'), array['Ali', 'Hande'], 'so does the admin''s');

-- 3. A cancellation request is read like any other ------------------------------

select tests.remember('sd:hande:2', tests.leave('sd', 'hande', 2));
select is(pg_temp.decide('zeynep', tests.id('sd:hande:2'), 'approve') ->> 'status', 'approved',
  'the admin approves Hande''s second request alone');
select tests.remember('sd:hande:2:cancel', pg_temp.cancel('hande', tests.id('sd:hande:2')));
select ok(pg_temp.lists('ayse', tests.id('sd:hande:2:cancel')),
  'Ayse reads her peer Hande''s request to cancel approved time off');
select ok(pg_temp.lists('zeynep', tests.id('sd:hande:2:cancel')), 'the admin, who decides it, does');
select tests.remember('sd:ali:1:cancel', pg_temp.cancel('ali', tests.id('sd:ali:1')));
select ok(pg_temp.lists('ayse', tests.id('sd:ali:1:cancel')), 'Ayse reads Ali''s request to cancel: she decides it');
select ok(not pg_temp.lists('mehmet', tests.id('sd:ali:1:cancel')), 'the manager of another location does not');
select is(pg_temp.home('ayse'), 3, 'Workspace home counts both cancellations and Zeynep''s request for Ayse');

-- 4. Reading follows where the person works today; the vote does not --------------
-- (user decision 2026-10-01 ~19:05Z, FB-6.3.8c review): Ali asks while he works
-- at Kadikoy only, then also starts at Besiktas. Mehmet reads the request, as he
-- would revoke Ali's approved time off, but cannot vote on it: the locations
-- that decide were fixed when Ali sent it.

select tests.remember('sd:ali:3', tests.leave('sd', 'ali', 3));
select tests.works_at(
  (select m.id from public.workspace_memberships m where m.workspace_id = tests.id('sd') and m.user_id = tests.user('sd:ali')),
  tests.id('sd:B'));
select ok(pg_temp.lists('mehmet', tests.id('sd:ali:3')),
  'Mehmet reads the request of somebody who started at Besiktas after sending it');
create function pg_temp.refusal(q text) returns text language plpgsql as $$
begin
  execute q;
  return 'allowed';
exception when others then
  return sqlstate;
end $$;
select is(pg_temp.refusal(format('select pg_temp.decide(%L, %L, %L)', 'mehmet', tests.id('sd:ali:3'), 'approve')), '42501',
  'but his vote is turned away: Besiktas was not one of the locations that decide it');

-- 5. The owner's own time off waits for who decides it (KARARLAR S-169) ----------

select tests.remember('sd:owner:1', tests.leave('sd', 'owner', 4));
select is((select r.status::text from public.schedule_time_off_requests r where r.id = tests.id('sd:owner:1')), 'pending',
  'the owner''s own time off waits like anybody''s');
select ok(not pg_temp.lists('owner', tests.id('sd:owner:1')), 'the owner does not read it in Requests: there are admins');
select ok(pg_temp.lists('zeynep', tests.id('sd:owner:1')), 'the admin does');
select is(pg_temp.decide('zeynep', tests.id('sd:owner:1'), 'approve') ->> 'status', 'approved', 'and approves it alone');
select ok(jsonb_path_exists(
    public.get_schedule_read_model_service(tests.user('sd:zeynep'), tests.id('sd'), tests.week(4))
      -> 'employees',
    '$[*] ? (@.id == $who).weekly_availability[*].leave_intervals[*]',
    jsonb_build_object('who', tests.id('sd:owner'))),
  'and the admin sees it on the Schedule (M2)');

select * from finish();
rollback;

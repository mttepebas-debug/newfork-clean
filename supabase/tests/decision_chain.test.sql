begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- One decision chain for every request decided last by a manager (KARARLAR S-164, S-169
-- and its addition; ROL-CIFT design §4.5, §8.1): a cover, a swap, a release application
-- and time off go to the location's manager other than the person who asked, else an
-- admin, else the owner. Rank is not counted on the employee side. The chain only says
-- who is told; an admin and the owner decide at every step. Nobody decides their own,
-- but the owner whom nobody else can answer decides their own in Requests.
--
-- World dc: Kadikoy has two managers who also work, Dora and Can; Ada is an admin who
-- works at Kadikoy too. Besiktas has one manager, Bea, who works there.
-- World dn: no admin; Kadikoy's only manager is Dina.
-- World do: the owner alone with Ali, an employee.

select tests.world('dc');
select tests.employee_slot('dc', 'owner');
select tests.person('dc', 'dora', 'manager', array['K'], array['cook']);
select tests.person('dc', 'can', 'manager', array['K'], array['cook']);
select tests.person('dc', 'ada', 'admin', array['K'], array['cook']);
select tests.person('dc', 'bea', 'manager', array['B'], array['cook']);
select tests.person('dc', 'ali', 'employee', array['K', 'B'], array['cook']);
select tests.person('dc', 'emre', 'employee', array['K'], array['cook']);
select tests.publish_week('dc', 1, '[
  {"label": "dora-k", "person": "dora", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"},
  {"label": "dora-k2", "person": "dora", "loc": "K", "job": "cook", "day": 3, "start": "09:00", "end": "15:00"},
  {"label": "ada-k",  "person": "ada",  "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"},
  {"label": "bea-b",  "person": "bea",  "loc": "B", "job": "cook", "day": 4, "start": "09:00", "end": "15:00"}
]');
select tests.cover_case('dc', 'dora-k', 'dora', 'ali');
select tests.cover_case('dc', 'dora-k2', 'dora', 'emre');
select tests.cover_case('dc', 'ada-k', 'ada', 'emre');
select tests.cover_case('dc', 'bea-b', 'bea', 'ali');

select tests.world('dn');
select tests.person('dn', 'dina', 'manager', array['K'], array['cook']);
select tests.person('dn', 'ali', 'employee', array['K'], array['cook']);
select tests.publish_week('dn', 1, '[
  {"label": "dina-k", "person": "dina", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}
]');
select tests.cover_case('dn', 'dina-k', 'dina', 'ali');

select tests.world('do');
select tests.employee_slot('do', 'owner');
select tests.person('do', 'ali', 'employee', array['K'], array['cook']);
-- ponytail: the owner cooks too, as Employees -> the owner's record -> Jobs would say.
insert into public.employee_job_assignments (workspace_id, employee_id, job_id, is_primary, created_by)
values (tests.id('do'), tests.id('do:owner'), tests.id('do:job:cook'), false, tests.user('do:owner'));
select tests.publish_week('do', 1, '[
  {"label": "owner-k", "person": "owner", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}
]');
select tests.cover_case('do', 'owner-k', 'owner', 'ali');

create function pg_temp.said(statement text) returns text language plpgsql as $$
declare code text; reason text;
begin
  execute statement;
  return 'ok';
exception when others then
  get stacked diagnostics code = returned_sqlstate, reason = pg_exception_hint;
  return concat_ws(' ', code, nullif(reason, ''));
end;
$$;
create function pg_temp.who(w text, person text) returns uuid language sql as $$
  select tests.user(w || ':' || person)
$$;
create function pg_temp.reason(w text, actor text, label text, applicant boolean default true) returns text language sql as $$
  select app_private.exchange_decision_reason(pg_temp.who(w, actor), tests.id(w), c.owner_id,
    case when applicant then (select a.employee_id from public.shift_exchange_applications a where a.id = tests.id(w || ':application:' || label)) end,
    (c.offered_snapshot ->> 'location_id')::uuid)
  from public.shift_exchange_cases c where c.id = tests.id(w || ':case:' || label)
$$;
create function pg_temp.decide(w text, actor text, label text, verb text default 'approve') returns jsonb language sql as $$
  select public.shift_exchanges_command_service(pg_temp.who(w, actor), tests.id(w), jsonb_build_object('action', verb,
    'case_id', tests.id(w || ':case:' || label), 'application_id', tests.id(w || ':application:' || label), 'reason', '',
    'expected_revision', (select revision from public.shift_exchange_cases where id = tests.id(w || ':case:' || label)),
    'fingerprint', public.shift_exchange_preview(pg_temp.who(w, actor), tests.id(w), tests.id(w || ':case:' || label),
      tests.id(w || ':application:' || label)) ->> 'fingerprint'), gen_random_uuid())
$$;
create function pg_temp.manager_rows(w text, actor text) returns uuid[] language sql as $$
  select coalesce(array_agg((c ->> 'id')::uuid order by c ->> 'id'), '{}')
  from jsonb_array_elements(public.shift_exchanges_read_service(pg_temp.who(w, actor), tests.id(w), true,
    tests.week(1), tests.week(1) + 6) -> 'cases') c
$$;
create function pg_temp.tier(w text, person text, loc text) returns text language sql as $$
  select app_private.decision_tier(tests.id(w), tests.id(w || ':' || person), tests.id(w || ':' || loc))
$$;

-- peer_manager_decides_dual_request: Dora's cover goes to Can, her peer at Kadikoy.
select is(pg_temp.reason('dc', 'can', 'dora-k'), null, 'Can may decide Dora''s cover');
select is(pg_temp.tier('dc', 'dora', 'K'), 'location_manager', 'Dora''s Kadikoy request goes to its other manager');

-- admin_rank_not_counted: Ada is an admin; on the employee side her cover goes to Kadikoy's manager.
select is(pg_temp.reason('dc', 'can', 'ada-k'), null, 'Can may decide Ada''s cover, though she is an admin');
select is(pg_temp.decide('dc', 'can', 'ada-k') ->> 'status', 'completed', 'and approves it');

-- Nobody decides their own, whatever their rank (the hint is the core's own no to oneself).
select is(pg_temp.reason('dc', 'dora', 'dora-k'), 'rank', 'Dora may not decide her own cover');
select is(pg_temp.reason('dc', 'ali', 'dora-k'), 'rank', 'nor Ali the cover he applied for');
select is(pg_temp.said($$select pg_temp.decide('dc', 'dora', 'dora-k')$$), '42501 authz.rank', 'Dora''s approval is refused');
select is(public.shift_exchange_preview(pg_temp.who('dc', 'dora'), tests.id('dc'), tests.id('dc:case:dora-k'),
  tests.id('dc:application:dora-k')) -> 'reasons', '["A separate manager must approve your own exchange"]'::jsonb,
  'her preview says a separate manager must approve it');

-- The chain says who is told; an admin and the owner decide at every step (S-169 addition).
select is(pg_temp.reason('dc', 'ada', 'dora-k'), null, 'Ada may decide Dora''s cover while Can is there');
select is(pg_temp.reason('dc', 'owner', 'dora-k'), null, 'so may the owner');
select is(pg_temp.reason('dc', 'bea', 'dora-k'), 'out_of_scope', 'Bea, Besiktas''s manager, may not');

-- only_manager_goes_up: Bea is Besiktas's only manager; her request goes to the admin.
select is(pg_temp.tier('dc', 'bea', 'B'), 'admin', 'Bea''s Besiktas request goes to the admin');
select is(pg_temp.reason('dc', 'bea', 'bea-b'), 'rank', 'Bea may not decide her own');
select is(pg_temp.decide('dc', 'ada', 'bea-b') ->> 'status', 'completed', 'Ada approves it');

-- An employee's request goes to the location's manager.
select is(pg_temp.tier('dc', 'ali', 'B'), 'location_manager', 'Ali''s Besiktas request goes to Bea');

-- close_follows_decide: whoever decides closes; a party does not.
select is(pg_temp.reason('dc', 'can', 'dora-k2', false), null, 'Can may close Dora''s other cover');
select is(pg_temp.reason('dc', 'emre', 'dora-k2'), 'rank', 'Emre, who applied, may not close it');
create function pg_temp.refusal_text(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return 'ok';
exception when others then
  return sqlerrm;
end;
$$;
select is(pg_temp.refusal_text(format($q$select public.shift_exchanges_command_service(%L, %L, %L::jsonb, gen_random_uuid())$q$,
  pg_temp.who('dc', 'emre'), tests.id('dc'), jsonb_build_object('action', 'close', 'case_id', tests.id('dc:case:dora-k2'), 'reason', '',
    'expected_revision', (select revision from public.shift_exchange_cases where id = tests.id('dc:case:dora-k2'))))),
  'Only the person who asked or someone who decides this request can close it',
  'Emre, who applied, is told who may close it');
select is(public.shift_exchanges_command_service(pg_temp.who('dc', 'can'), tests.id('dc'), jsonb_build_object('action', 'close',
  'case_id', tests.id('dc:case:dora-k2'), 'reason', '',
  'expected_revision', (select revision from public.shift_exchange_cases where id = tests.id('dc:case:dora-k2'))), gen_random_uuid()) ->> 'status',
  'cancelled', 'Can closes it');

-- requests_hide_own_rows: Dora's own requests are not in her Requests (design §4.6).
select ok(not (tests.id('dc:case:dora-k') = any (pg_temp.manager_rows('dc', 'dora'))), 'Dora''s open cover is not in her Requests');
select ok(tests.id('dc:case:dora-k') = any (pg_temp.manager_rows('dc', 'can')), 'it is in Can''s');
-- time off rebuild D8: the closed Requests list (get_schedule_requests_closed_service) went with the old time off.
select ok(tests.id('dc:case:dora-k') = any (
  select (c ->> 'id')::uuid from jsonb_array_elements(public.shift_exchanges_read_service(pg_temp.who('dc', 'dora'), tests.id('dc'), false,
    tests.week(1), tests.week(1) + 6) -> 'cases') c), 'Dora follows her cover in the employee view');
select is(pg_temp.decide('dc', 'can', 'dora-k') ->> 'status', 'completed', 'Can approves Dora''s cover');

-- chain_skips_to_owner: no admin, Dina is Kadikoy's only manager: the owner decides.
select is(pg_temp.tier('dn', 'dina', 'K'), 'owner', 'Dina''s request goes to the owner');
select is(pg_temp.reason('dn', 'owner', 'dina-k'), null, 'the owner may decide it');
select is(pg_temp.decide('dn', 'owner', 'dina-k') ->> 'status', 'completed', 'and approves it');

-- owner_tier_self_only and owner_exception: the owner alone with Ali decides their own.
select is(pg_temp.tier('do', 'owner', 'K'), 'self_only', 'nobody but the owner can answer the owner''s request');
select is(pg_temp.reason('do', 'owner', 'owner-k'), null, 'so the owner may decide it');
select ok(tests.id('do:case:owner-k') = any (pg_temp.manager_rows('do', 'owner')), 'it is in the owner''s Requests');
select is((select o ->> 'decision_tier' from jsonb_array_elements(public.shift_exchanges_read_service(pg_temp.who('do', 'owner'), tests.id('do'), false,
  tests.week(1), tests.week(1) + 6) -> 'own_shifts') o where (o ->> 'id')::uuid = tests.id('do:shift:owner-k')),
  'self_only', 'the owner''s shift says nobody else can approve a request for it');
select is((select o ->> 'decision_tier' from jsonb_array_elements(public.shift_exchanges_read_service(pg_temp.who('dc', 'dora'), tests.id('dc'), false,
  tests.week(1), tests.week(1) + 6) -> 'own_shifts') o where (o ->> 'id')::uuid = tests.id('dc:shift:dora-k2')),
  'location_manager', 'Dora''s shift goes to Kadikoy''s other manager');
select is(pg_temp.decide('do', 'owner', 'owner-k') ->> 'status', 'completed', 'the owner approves their own cover');

-- owner_no_exception_with_admin: with an admin, the owner's own goes to the admin.
select tests.publish_week('do', 2, '[
  {"label": "owner-k2", "person": "owner", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}
]');
select tests.cover_case('do', 'owner-k2', 'owner', 'ali');
select tests.person('do', 'ada', 'admin', array['B'], array['cook']);
select is(pg_temp.tier('do', 'owner', 'K'), 'admin', 'with an admin the owner''s request goes to the admin');
select is(pg_temp.reason('do', 'owner', 'owner-k2'), 'rank', 'and the owner may not decide their own');
select ok(not (tests.id('do:case:owner-k2') = any (pg_temp.manager_rows('do', 'owner'))), 'nor is it in the owner''s Requests');

-- time_off_same_chain: the same chain for time off.
-- Time off rebuild D8: one answer decides (answer_time_off_service); votes by location went with the old time off.
create function pg_temp.answer(w text, actor text, holder text, verb text default 'approve') returns text language sql as $$
  select pg_temp.said(format('select public.answer_time_off_service(%L, %L, %L, %L, null, %s, %L)',
    pg_temp.who(w, actor), tests.id(w), r.id, verb, r.revision,
    app_private.time_off_shifts_print(app_private.time_off_shifts_at_stake(r))))
  from public.time_off_requests r where r.id = tests.id(w || ':' || holder || ':time_off')
$$;
create function pg_temp.time_off_status(w text, holder text) returns text language sql as $$
  select r.status from public.time_off_requests r where r.id = tests.id(w || ':' || holder || ':time_off')
$$;
create function pg_temp.time_off_rows(w text, actor text) returns uuid[] language sql as $$
  select coalesce(array_agg((r ->> 'id')::uuid), '{}')
  from jsonb_array_elements(public.time_off_requests_service(pg_temp.who(w, actor), tests.id(w)) -> 'requests') r
$$;
create function pg_temp.told(w text, holder text) returns text[] language sql as $$
  select coalesce(array_agg(n.user_id::text order by n.user_id), '{}') from public.person_notifications n
  where n.type_key = 'time_off.requested' and n.subject_id = tests.id(w || ':' || holder || ':time_off')
$$;
create function pg_temp.users(w text, variadic people text[]) returns text[] language sql as $$
  select array(select pg_temp.who(w, p)::text from unnest(people) p order by 1)
$$;

select tests.leave('dc', 'dora');
select tests.leave('dc', 'bea');
select tests.leave('dn', 'dina');
select is(pg_temp.told('dc', 'dora'), pg_temp.users('dc', 'can'), 'Dora''s time off is told to Can');
select is(pg_temp.told('dc', 'bea'), pg_temp.users('dc', 'ada'), 'Bea''s to the admin, not the owner');
select is(pg_temp.told('dn', 'dina'), pg_temp.users('dn', 'owner'), 'Dina''s to the owner');
select is(pg_temp.answer('dc', 'dora', 'dora'), '42501 authz.rank', 'Dora may not decide her own time off');
select ok(not (tests.id('dc:dora:time_off') = any (pg_temp.time_off_rows('dc', 'dora'))), 'nor is it in her Requests');
select is(pg_temp.answer('dc', 'can', 'dora'), 'ok', 'Can answers for Kadikoy');
select is(pg_temp.time_off_status('dc', 'dora'), 'approved', 'and Dora''s time off is approved');
select is(pg_temp.answer('dc', 'can', 'bea'), '42501 authz.out_of_scope', 'Can does not decide at Besiktas');
select is(pg_temp.answer('dc', 'ada', 'bea'), 'ok', 'Ada decides Bea''s time off');
select is(pg_temp.time_off_status('dc', 'bea'), 'approved', 'it is approved');
select is(pg_temp.answer('dn', 'owner', 'dina'), 'ok', 'the owner decides Dina''s');
-- Rank is not counted on the employee side: Kadikoy's manager decides the owner's own time off.
insert into public.employee_location_assignments (workspace_id, employee_id, location_id, is_primary, created_by)
select tests.id('dc'), tests.id('dc:owner'), tests.id('dc:K'), false, tests.user('dc:owner')
where not exists (select 1 from public.employee_location_assignments a
  where a.employee_id = tests.id('dc:owner') and a.location_id = tests.id('dc:K') and a.ended_at is null);
select tests.leave('dc', 'owner', 2);
select is(pg_temp.told('dc', 'owner'), pg_temp.users('dc', 'bea', 'can', 'dora'), 'the owner''s time off is told to the managers of the owner''s locations');
select is(pg_temp.answer('dc', 'owner', 'owner'), '42501 authz.rank', 'the owner may not decide their own here');
select is(app_private.time_off_decider_reason(pg_temp.who('dc', 'bea'), tests.id('dc'), tests.id('dc:owner')), null,
  'Bea, a manager, may answer it for Besiktas');
select is(pg_temp.answer('dc', 'dora', 'owner'), 'ok', 'Dora, a manager, answers it for Kadikoy');
select is(pg_temp.time_off_status('dc', 'owner'), 'approved', 'and the owner''s time off is approved');

-- The owner's own time off follows the chain: it waits.
select tests.world('dt');
select tests.employee_slot('dt', 'owner');
insert into public.employee_job_assignments (workspace_id, employee_id, job_id, is_primary, created_by)
values (tests.id('dt'), tests.id('dt:owner'), tests.id('dt:job:cook'), false, tests.user('dt:owner'));
select tests.person('dt', 'ali', 'employee', array['K'], array['cook']);
insert into public.employee_location_assignments (workspace_id, employee_id, location_id, is_primary, created_by)
select tests.id('dt'), tests.id('dt:owner'), tests.id('dt:K'), false, tests.user('dt:owner')
where not exists (select 1 from public.employee_location_assignments a
  where a.employee_id = tests.id('dt:owner') and a.location_id = tests.id('dt:K') and a.ended_at is null);
select tests.leave('dt', 'owner');
select is(pg_temp.time_off_status('dt', 'owner'), 'pending', 'the owner''s time off waits like anyone''s');
-- time off rebuild D8: the lone owner deciding their own time off (in Requests) went with the old time off:
-- nobody answers their own, the owner neither (KARARLAR S-239; time_off_answer shows the lone owner's waits).

select tests.person('dt', 'ada', 'admin', array['B'], array['cook']);
select tests.leave('dt', 'owner', 1);
select is(pg_temp.answer('dt', 'owner', 'owner'), '42501 authz.rank', 'with an admin, the owner may not decide their own');
select is(pg_temp.told('dt', 'owner'), pg_temp.users('dt', 'ada'), 'it is told to the admin');
select is(pg_temp.answer('dt', 'ada', 'owner'), 'ok', 'the admin decides it');

select * from finish();
rollback;

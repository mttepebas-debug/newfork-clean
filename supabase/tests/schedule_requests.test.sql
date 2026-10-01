begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- BL-237: this file used to run against the real seeded Meyhouse workspace,
-- with its time-off segments needing to overlap real seed shift
-- 22000000-...-0001, published for "the current week". current_date's week
-- only matched that real published week on the day it was last published;
-- every day after, they were different weeks and nothing overlapped. A
-- throwaway tests.world() that publishes its own week and its own shift for
-- this run means this can never rot with real time again.
select tests.world('sr');
select tests.person('sr', 'mgr', 'manager', array['K'], array['cook']);
select tests.person('sr', 'alex', 'employee', array['K'], array['cook']);
select tests.person('sr', 'deniz', 'employee', array['B'], array['cook']);
select tests.publish_week('sr', 1, '[
  {"label": "alex-mon", "person": "alex", "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "17:00"}
]');

-- FB-6.3.7: requests are sent the way Employee Hub sends them (no location,
-- whole days from the Wednesday of week 1); Deniz works only at B.
select tests.remember('sr:request:alex', tests.leave('sr', 'alex', 1, 2));
select tests.leave('sr', 'deniz', 1);

-- authenticated has no USAGE on the tests schema, so every id a role-switched
-- statement needs is resolved here first, while still postgres.
create temp table sr_ids as select tests.user('sr:mgr') mgr, tests.user('sr:alex') alex, tests.id('sr') w, tests.id('sr:B') b;
grant select on sr_ids to authenticated;

set local role authenticated;
select throws_ok($$select * from public.schedule_time_off_requests$$,'42501',null,'time off requests deny authenticated reads');
select throws_ok($$select * from public.schedule_time_off_segments$$,'42501',null,'time off segments deny authenticated reads');
select throws_ok($$select * from public.schedule_time_off_events$$,'42501',null,'time off events deny authenticated reads');
reset role;

select is((select count(distinct (r.system_key, p.permission_key))::integer from public.workspace_role_permissions p join public.workspace_roles r on r.id=p.role_id where r.workspace_id=tests.id('sr') and r.system_key in('owner','admin','manager') and p.permission_key in('schedule.time_off_requests.read','schedule.time_off_requests.manage','schedule.shift_change_requests.read','schedule.shift_change_requests.manage')),12,'manager classes receive four request capabilities');
select is((select count(*)::integer from public.workspace_role_permissions p join public.workspace_roles r on r.id=p.role_id where r.workspace_id=tests.id('sr') and r.system_key='employee' and p.permission_key like 'schedule.%requests.%'),0,'employee receives no manager request capability');

create temp table phase6b_state(model jsonb,result jsonb);
insert into phase6b_state(model) values(public.get_schedule_requests_service(tests.user('sr:mgr'),tests.id('sr')));
select is(model->>'workspace_id',tests.id('sr')::text,'request model is workspace scoped') from phase6b_state;
select is((model->>'time_off_pending_count')::integer,1,'pending count honors location scope') from phase6b_state;
select is(jsonb_array_length(model->'time_off_requests'),1,'queue excludes inaccessible location') from phase6b_state;
select is(model->'time_off_requests'->0->>'employee_name','Alex Person','queue returns employee identity') from phase6b_state;
select is(jsonb_array_length(model->'time_off_requests'->0->'segments'),2,'queue returns immutable request segments') from phase6b_state;
select throws_ok(format($$select public.get_schedule_requests_service(%L,%L,'needs_review',%L)$$,mgr,w,b),'42501','Not allowed','manager cannot query another location') from sr_ids;
select throws_ok(format($$select public.get_schedule_requests_service(%L,%L)$$,alex,w),'42501','Not allowed','employee cannot read manager queues') from sr_ids;

-- FB-6.3.7: no "viewed" mark, no partial decision, no return to pending. Alex
-- works only at K, so the manager of K decides alone.
update phase6b_state set result=public.decide_time_off_service(tests.user('sr:mgr'),tests.id('sr'),tests.id('sr:request:alex'),'approve','',
  app_private.time_off_impact(tests.id('sr'),tests.id('sr:request:alex'))->>'fingerprint');
select is(result->>'status','approved','the manager of the only location decides the request') from phase6b_state;
select is((public.get_schedule_requests_service(tests.user('sr:mgr'),tests.id('sr'))->>'time_off_pending_count')::integer,0,'a decided request leaves the pending count');
select throws_ok(format($$select public.decide_time_off_service(%L,%L,%L,'deny','',null)$$,tests.user('sr:mgr'),tests.id('sr'),tests.id('sr:request:alex')),'40001',null,'a closed request takes no further vote');

select * from finish();
rollback;

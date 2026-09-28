begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

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

select tests.remember('sr:request:alex', gen_random_uuid());
select tests.remember('sr:request:deniz', gen_random_uuid());
select tests.remember('sr:segment:alex-1', gen_random_uuid());
select tests.remember('sr:segment:alex-2', gen_random_uuid());
insert into public.schedule_time_off_requests(id,workspace_id,employee_id,location_id,reason,created_by) values
(tests.id('sr:request:alex'),tests.id('sr'),tests.id('sr:alex'),tests.id('sr:K'),'Family appointment',tests.user('sr:alex')),
(tests.id('sr:request:deniz'),tests.id('sr'),tests.id('sr:deniz'),tests.id('sr:B'),'Garden request',tests.user('sr:deniz'));
insert into public.schedule_time_off_segments(id,workspace_id,request_id,segment_date) values
(tests.id('sr:segment:alex-1'),tests.id('sr'),tests.id('sr:request:alex'),tests.week(1)),
(tests.id('sr:segment:alex-2'),tests.id('sr'),tests.id('sr:request:alex'),tests.week(1)+1),
(gen_random_uuid(),tests.id('sr'),tests.id('sr:request:deniz'),current_date);
insert into public.schedule_time_off_events(workspace_id,request_id,action,actor_user_id,note) values
(tests.id('sr'),tests.id('sr:request:alex'),'submitted',tests.user('sr:alex'),'Family appointment');

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

select is((public.mark_schedule_time_off_viewed_service(tests.user('sr:mgr'),tests.id('sr'),tests.id('sr:request:alex'))->>'status'),'viewed','opening request records viewed state');
select is((select count(*)::integer from public.schedule_time_off_events where request_id=tests.id('sr:request:alex') and action='viewed'),1,'viewed audit is recorded once');
select lives_ok(format($$select public.mark_schedule_time_off_viewed_service(%L,%L,%L)$$,tests.user('sr:mgr'),tests.id('sr'),tests.id('sr:request:alex')),'repeat viewing is idempotent');
select is((select count(*)::integer from public.schedule_time_off_events where request_id=tests.id('sr:request:alex') and action='viewed'),1,'repeat viewing does not duplicate audit');

do $$ declare actor uuid:=tests.user('sr:mgr'); w uuid:=tests.id('sr'); rid uuid:=tests.id('sr:request:alex');
  seg1 uuid:=tests.id('sr:segment:alex-1'); seg2 uuid:=tests.id('sr:segment:alex-2');
  decisions jsonb; preview jsonb; releases jsonb; begin
 decisions:=jsonb_build_array(jsonb_build_object('segment_id',seg1,'status','approved'),jsonb_build_object('segment_id',seg2,'status','denied'));
 preview:=public.preview_time_off_assignment_decision_service(actor,w,rid,1,'partial_approve',decisions);
 select coalesce(jsonb_agg(jsonb_build_object('shift_id',s->>'id','action','release_entire_shift')),'[]') into releases from jsonb_array_elements(preview->'affected_shifts') s;
 update phase6b_state set result=public.decide_time_off_with_assignments_service(actor,w,rid,1,'partial_approve','First day approved; release the overlapping shift to open coverage.',decisions,gen_random_uuid(),preview->>'fingerprint',releases);
end $$;
select is(result->>'status','partially_approved','mixed segment decisions create partial approval') from phase6b_state;
select is((result->>'revision')::integer,2,'time off decision increments revision') from phase6b_state;
select is((select count(*)::integer from public.schedule_time_off_segments where request_id=tests.id('sr:request:alex') and status='approved'),1,'partial approval persists approved segment');
select is((select employee_id from public.schedule_published_shifts where id=tests.id('sr:shift:alex-mon')),null::uuid,'explicit leave disposition releases the overlapping shift');
select throws_ok(format($$select public.resolve_schedule_time_off_request_service(%L,%L,%L,1,'revoke')$$,tests.user('sr:mgr'),tests.id('sr'),tests.id('sr:request:alex')),'40001','stale time off request','stale time off transition fails');
select is((public.resolve_schedule_time_off_request_service(tests.user('sr:mgr'),tests.id('sr'),tests.id('sr:request:alex'),2,'return_to_pending')->>'status'),'pending','closed request returns to pending');
select is((select count(*)::integer from public.schedule_time_off_segments where request_id=tests.id('sr:request:alex') and status='pending'),2,'return resets segment decisions');
select is((select employee_id from public.schedule_published_shifts where id=tests.id('sr:shift:alex-mon')),null::uuid,'reopening a request does not silently restore a released assignment');

select * from finish();
rollback;

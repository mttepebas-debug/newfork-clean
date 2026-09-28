begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- BL-237: this file used to read whatever the real seeded Meyhouse workspace
-- already had published for "the current week" -- current_date's week only
-- matches that real data on the day it was last published, so the read model
-- came back empty every day after. A throwaway tests.world() that publishes
-- its own week for this run means this can never rot with real time again.
select tests.world('eh');
select tests.person('eh', 'alex', 'employee', array['K'], array['cook']);
select tests.person('eh', 'jordan', 'employee', array['K'], array['cook']);
select tests.person('eh', 'sam', 'employee', array['B'], array['cook']);
select tests.new_user('eh:noprofile', 'No Profile');
insert into public.workspace_memberships(id,workspace_id,user_id,role,status,all_locations)
values (gen_random_uuid(), tests.id('eh'), tests.user('eh:noprofile'), 'employee', 'active', true);

insert into public.workspaces(id,name,created_by)
values ('99000000-0000-4000-8000-000000000001','Second Hub Workspace',tests.user('eh:alex'));
insert into public.workspace_memberships(id,workspace_id,user_id,role,status,all_locations)
values ('98100000-0000-4000-8000-000000000004','99000000-0000-4000-8000-000000000001',tests.user('eh:alex'),'employee','active',true);
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,preferred_name,invitation_email,created_by)
values (
  '99000000-0000-4000-8000-000000000002',
  '99000000-0000-4000-8000-000000000001',
  tests.user('eh:alex'),
  'E-9901',
  'Alex',
  'Second',
  '',
  'hub-alex-second@example.test',
  tests.user('eh:alex')
);

select tests.publish_week('eh', 1, '[
  {"label": "alex-mon", "person": "alex", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "17:00"},
  {"label": "alex-tue", "person": "alex", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "17:00"}
]');
-- An open (unassigned) shift at Alex's own location: not built through
-- tests.add_shift (it always names an employee), so this row goes straight in.
insert into public.schedule_published_shifts (
  workspace_id, location_id, publication_id, job_id, scheduled_date,
  start_time, end_time, time_basis, time_timezone, source_shift_id
)
select tests.id('eh'), tests.id('eh:K'),
  (select id from public.schedule_location_publications where workspace_id = tests.id('eh') and location_id = tests.id('eh:K') and status = 'current'),
  tests.id('eh:job:cook'), tests.week(1) + 3, '09:00', '17:00', 'explicit', 'Europe/Istanbul', gen_random_uuid();

-- authenticated/anon roles have no USAGE on the tests schema, so every id a
-- role-switched statement needs is resolved here first, while still postgres.
create temp table eh_ids as select
  tests.user('eh:alex') alex, tests.user('eh:noprofile') noprofile,
  tests.id('eh') w, tests.id('eh:K') k, tests.id('eh:B') b;
grant select on eh_ids to authenticated;

set local role authenticated;
select throws_ok($$select * from public.schedule_published_shifts$$,'42501',null,'employee cannot read published shift tables directly');
select throws_ok(format($$select public.get_employee_hub_service(%L,%L,current_date,current_date+14)$$,alex,w),'42501',null,'authenticated role cannot invoke service RPC directly') from eh_ids;
reset role;

select throws_ok(format($$select public.get_employee_hub_service(%L,%L,current_date,current_date+14)$$,noprofile,w),'42501','employee profile required','active membership without employee profile fails closed') from eh_ids;

create temp table hub_state(model jsonb,result jsonb,request_id uuid);
insert into hub_state(model) values(public.get_employee_hub_service(tests.user('eh:alex'),tests.id('eh'),tests.week(1),tests.week(1)+42));
select is(model->'employee'->>'id',tests.id('eh:alex')::text,'read model resolves actor employee server-side') from hub_state;
select is(jsonb_array_length(model->'shifts'),2,'read model returns only actor published shifts') from hub_state;
select is(jsonb_array_length(model->'open_shifts'),1,'read model exposes open shifts at assigned locations') from hub_state;
select is((select count(*)::integer from jsonb_array_elements(model->'team') teammate where teammate->>'display_name'='Jordan Person'),1,'team includes employees at shared locations') from hub_state;
select is((select count(*)::integer from jsonb_array_elements(model->'team') teammate where teammate->>'display_name'='Sam Person'),0,'team excludes employees only at other locations') from hub_state;

select throws_ok(format($$select public.submit_employee_time_off_service(%L,%L,%L,'Other location',array[current_date+10])$$,tests.user('eh:alex'),tests.id('eh'),tests.id('eh:B')),'42501','employee location access denied','time off rejects an unassigned location');
update hub_state set result=public.submit_employee_time_off_service(tests.user('eh:alex'),tests.id('eh'),tests.id('eh:K'),'Personal',array[current_date+10,current_date+11]);
update hub_state set request_id=(result->>'request_id')::uuid;
select is(result->>'status','pending','time off submission creates a pending request') from hub_state;
select is((select count(*)::integer from public.schedule_time_off_segments segment join hub_state state on state.request_id=segment.request_id),2,'time off submission stores immutable date segments');
select throws_ok(format($$select public.submit_employee_time_off_service(%L,%L,%L,'Overlap',array[current_date+10])$$,tests.user('eh:alex'),tests.id('eh'),tests.id('eh:K')),'23514','overlapping time off request exists','overlapping request is rejected');
select is((public.employee_request_action_service(tests.user('eh:alex'),tests.id('eh'),(select request_id from hub_state),'time_off','cancel',1)->>'status'),'cancelled','employee can cancel own pending time off');

select * from finish();
rollback;

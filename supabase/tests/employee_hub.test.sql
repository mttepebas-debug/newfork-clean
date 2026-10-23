begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- BL-237: this file used to read whatever the real seeded Meyhouse workspace
-- already had published for "the current week" -- current_date's week only
-- matches that real data on the day it was last published, so the read model
-- came back empty every day after. A throwaway tests.world() that publishes
-- its own week for this run means this can never rot with real time again.
select tests.world('eh');
select tests.person('eh', 'alex', 'employee', array['K'], array['cook']);
select tests.person('eh', 'jordan', 'employee', array['K'], array['cook']);
select tests.person('eh', 'sam', 'employee', array['B'], array['cook']);
-- Daylight Home's "Manager on the floor" (S-163, rol-cift design 4.13): a shift in a Management job.
select tests.person('eh', 'mina', 'manager', array['K'], array['cook', 'general manager']);
select tests.new_user('eh:noprofile', 'No Profile');
insert into public.workspace_memberships (id, workspace_id, user_id, status, role_id, employee_role_id)
select legacy.id::uuid, legacy.workspace_id::uuid, legacy.user_id::uuid, legacy.status::text::public.membership_status, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values (gen_random_uuid(), tests.id('eh'), tests.user('eh:noprofile'), 'employee', 'active', true)) as legacy(id, workspace_id, user_id, role, status, all_locations);

insert into public.workspaces(id,name,created_by)
values ('99000000-0000-4000-8000-000000000001','Second Hub Workspace',tests.user('eh:alex'));
insert into public.workspace_memberships (id, workspace_id, user_id, status, role_id, employee_role_id)
select legacy.id::uuid, legacy.workspace_id::uuid, legacy.user_id::uuid, legacy.status::text::public.membership_status, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values ('98100000-0000-4000-8000-000000000004','99000000-0000-4000-8000-000000000001',tests.user('eh:alex'),'employee','active',true)) as legacy(id, workspace_id, user_id, role, status, all_locations);
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
  {"label": "alex-tue", "person": "alex", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "17:00"},
  {"label": "mina-mon", "person": "mina", "loc": "K", "job": "general manager", "day": 1, "start": "08:00", "end": "16:00"},
  {"label": "jordan-mon", "person": "jordan", "loc": "K", "job": "cook", "day": 1, "start": "10:00", "end": "18:00"}
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

-- Daylight Home (CALISAN-HOME-GUNISIGI): a shift says its shift type, the card's "Brunch" when no lineup section.
insert into public.shift_types(id,workspace_id,name,color,sort_order,default_start_time,default_end_time)
values ('99000000-0000-4000-8000-000000000031',tests.id('eh'),'Dinner','#176954',1,'17:00','23:00');
update public.schedule_published_shifts set shift_type_id='99000000-0000-4000-8000-000000000031'
where workspace_id=tests.id('eh') and scheduled_date=tests.week(1)+1 and employee_id=tests.id('eh:alex');

create temp table hub_state(model jsonb,result jsonb,request_id uuid);
insert into hub_state(model) values(public.get_employee_hub_service(tests.user('eh:alex'),tests.id('eh'),tests.week(1),tests.week(1)+42));
select is(model->'employee'->>'id',tests.id('eh:alex')::text,'read model resolves actor employee server-side') from hub_state;
select is(jsonb_array_length(model->'shifts'),2,'read model returns only actor published shifts') from hub_state;
select is(jsonb_array_length(model->'open_shifts'),0,'no open shift reaches the employee here: an offered one is in Shift Hub (Mert, 2026-10-20)') from hub_state;
select is(model->'shifts'->0->>'shift_type_name','Dinner','a shift with a shift type says its name') from hub_state;
select is((select (t->>'is_management')::boolean from jsonb_array_elements(model->'team_shifts') t where t->>'employee_name'='Mina Person'),true,'a teammate''s shift in a Management job says so') from hub_state;
select is((select (t->>'is_management')::boolean from jsonb_array_elements(model->'team_shifts') t where t->>'employee_name'='Jordan Person'),false,'a teammate''s other shift does not') from hub_state;
select ok(model->'shifts'->1 ? 'shift_type_name' and model->'shifts'->1->'shift_type_name' = 'null'::jsonb,'a shift without one says null') from hub_state;
select is((select count(*)::integer from jsonb_array_elements(model->'team') teammate where teammate->>'display_name'='Jordan Person'),1,'team includes employees at shared locations') from hub_state;
select is((select count(*)::integer from jsonb_array_elements(model->'team') teammate where teammate->>'display_name'='Sam Person'),0,'team excludes employees only at other locations') from hub_state;

-- FB-6.3.7: the request names no location; every location Alex works at decides.
-- Time off rebuild D8: asked, refused and withdrawn in the time off table (one row, no date segments).
update hub_state set result=public.ask_time_off_service(tests.user('eh:alex'),tests.id('eh'),'vacation',current_date+10,current_date+11,
  true,null,null,'Personal',(select timezone from public.locations where id=tests.id('eh:K')),gen_random_uuid());
update hub_state set request_id=(result->>'id')::uuid;
select is(result->>'status','pending','time off submission creates a pending request') from hub_state;
select is((select array[(r.starts_at at time zone r.time_timezone)::date,(r.ends_at at time zone r.time_timezone)::date-1]
  from public.time_off_requests r join hub_state state on state.request_id=r.id),array[current_date+10,current_date+11],'time off submission stores the two days asked');
select throws_ok(format($$select public.ask_time_off_service(%L,%L,'vacation',current_date+10,current_date+10,true,null,null,'Overlap',%L,gen_random_uuid())$$,tests.user('eh:alex'),tests.id('eh'),(select timezone from public.locations where id=tests.id('eh:K'))),'PT409','You already have time off or a request in these hours','overlapping request is rejected');
select is((public.withdraw_time_off_service(tests.user('eh:alex'),tests.id('eh'),(select request_id from hub_state),1)->>'status'),'withdrawn','employee can withdraw own pending time off');

select * from finish();
rollback;

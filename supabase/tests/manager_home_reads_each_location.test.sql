begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- The managers' Home, "Locations first" (YONETICI-HOME, BL-1156, KARARLAR S-210):
-- get_manager_home_service reads each location's day in the actor's schedule
-- scope, the people working there without a required document (S-206) as the
-- documents rule lets the actor see, and the time off waiting on an answer.

select tests.world('mh');
select tests.person('mh', 'ayse', 'manager', array['K'], array['general manager']);
select tests.person('mh', 'emre', 'employee', array['K'], array['cook']);
select tests.person('mh', 'bora', 'manager', array['B'], array['general manager']);
select tests.role('mh', 'no docs manager', 'manager', array(
  select g.permission_key from public.workspace_role_permissions g
  join public.workspace_roles r on r.id = g.role_id
  where r.workspace_id = tests.id('mh') and r.system_key::text = 'manager'
    and g.permission_key not like 'employee_documents.%'
));
select tests.person('mh', 'sena', 'no docs manager', array['K'], array['general manager']);

create function pg_temp.u(person text) returns uuid language sql as $$
  select tests.user('mh:' || person)
$$;
grant execute on function pg_temp.u(text) to public;
create function pg_temp.home(person text) returns jsonb language sql as $$
  select public.get_manager_home_service(pg_temp.u(person), tests.id('mh'))
$$;
create function pg_temp.place(person text, loc text) returns jsonb language sql as $$
  select l from jsonb_array_elements(pg_temp.home(person) -> 'locations') l
  where (l ->> 'id')::uuid = tests.id('mh:' || loc)
$$;
create function pg_temp.refusal(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return 'allowed';
exception when others then
  declare state text; hint text;
  begin
    get stacked diagnostics state = returned_sqlstate, hint = pg_exception_hint;
    return state || ' ' || coalesce(hint, '');
  end;
end;
$$;

-- Kadikoy publishes this week from today: Ayse manages on the floor, Emre cooks, one shift is open.
insert into public.schedule_location_publications (id, workspace_id, location_id, week_start, version_number, status, published_by)
select tests.remember('mh:pub:K', gen_random_uuid()), tests.id('mh'), tests.id('mh:K'),
  (now() at time zone l.timezone)::date, 1, 'current', pg_temp.u('owner')
from public.locations l where l.id = tests.id('mh:K');
-- The rows go straight in: this test reads them; the availability guard is not its subject.
set local session_replication_role = replica;
insert into public.schedule_published_shifts (workspace_id, location_id, publication_id, employee_id, job_id,
  scheduled_date, start_time, end_time, time_basis, time_timezone, source_shift_id)
select tests.id('mh'), l.id, tests.id('mh:pub:K'), shift.employee, shift.job,
  (now() at time zone l.timezone)::date + shift.day, time '09:00', time '17:00', 'explicit', l.timezone, gen_random_uuid()
from public.locations l
cross join (values
  (tests.id('mh:ayse'), tests.id('mh:job:general manager'), 0),
  (tests.id('mh:emre'), tests.id('mh:job:cook'), 0),
  (null::uuid, tests.id('mh:job:server'), 0),
  (null::uuid, tests.id('mh:job:server'), 2)
) shift(employee, job, day)
where l.id = tests.id('mh:K');
set local session_replication_role = origin;

-- Emre owes a required food handler card; nothing is uploaded.
insert into public.document_types (id, workspace_id, title, description, required_at_onboarding, requires_review,
  accepted_formats, tracks_expiry, expiry_warning_days, expiry_schedule_impact, sort_order, created_by)
values (tests.remember('mh:doc:type', gen_random_uuid()), tests.id('mh'), 'Food handler card', 'Certificate',
  true, false, array['pdf'], false, 14, 'track_only', 90, pg_temp.u('owner'));
update public.document_types set publication_status = 'published' where id = tests.id('mh:doc:type');
insert into public.employee_onboarding_requirements (workspace_id, case_id, employee_id, kind, source_id, title,
  required, blocks_activation, requires_review, sort_order, status, lifecycle_settings)
select tests.id('mh'), c.id, tests.id('mh:emre'), 'document', tests.id('mh:doc:type'), 'Food handler card',
  true, true, false, 90, 'not_started',
  '{"mode": "required", "target": {"operator": "and", "location_ids": [], "department_ids": [], "job_ids": [], "employee_ids": []},
    "assignment_scope": "future_onboarding", "period_days": null, "suspend_on_overdue": false, "extra_fields": []}'::jsonb
from public.employee_onboarding_cases c where c.employee_id = tests.id('mh:emre');

-- Emre asks for a day off in ten days.
select public.submit_time_off_service(pg_temp.u('emre'), tests.id('mh'),
  jsonb_build_array(jsonb_build_object('segment_date', current_date + 10)), 'Wedding', 'Europe/Istanbul', gen_random_uuid());

-- Who opens it, and which locations they see.
select is(pg_temp.refusal($$select pg_temp.home('emre')$$), '42501 authz.missing_permission',
  'an employee does not open the managers'' Home');
select is((select array_agg(l ->> 'name' order by l ->> 'name') from jsonb_array_elements(pg_temp.home('owner') -> 'locations') l),
  array['Besiktas', 'Kadikoy'], 'the owner sees every location');
select is((select array_agg(l ->> 'name') from jsonb_array_elements(pg_temp.home('ayse') -> 'locations') l),
  array['Kadikoy'], 'Ayse sees only the location she manages');
select is((select array_agg(l ->> 'name') from jsonb_array_elements(pg_temp.home('bora') -> 'locations') l),
  array['Besiktas'], 'Bora sees only Besiktas');

-- Kadikoy's day.
select is(jsonb_array_length(pg_temp.place('owner', 'K') -> 'today_shifts'), 3, 'today''s three shifts at Kadikoy');
select is((select count(*)::integer from jsonb_array_elements(pg_temp.place('owner', 'K') -> 'today_shifts') s where (s ->> 'open')::boolean),
  1, 'one of them is open');
select is(pg_temp.place('owner', 'K') ->> 'today', ((now() at time zone 'Europe/Istanbul')::date)::text, 'today is the location''s own day');
select is((select array_agg(m ->> 'name') from jsonb_array_elements(pg_temp.place('owner', 'K') -> 'floor_managers') m),
  array['Ayse Person'], 'Ayse is the manager on the floor: a Management job on a shift there today (S-163)');
select is(jsonb_array_length(pg_temp.place('owner', 'B') -> 'today_shifts'), 0, 'Besiktas has no shifts today');

-- The next seven days.
select is(jsonb_array_length(pg_temp.place('owner', 'K') -> 'week'), 7, 'seven days from today');
select is(pg_temp.place('owner', 'K') -> 'week' -> 0 ->> 'shifts', '3', 'today has three shifts');
select is(pg_temp.place('owner', 'K') -> 'week' -> 2 ->> 'open', '1', 'the day after tomorrow has one open shift');
select is(pg_temp.place('owner', 'K') -> 'week' -> 6 ->> 'published', 'true', 'the week from today is published at Kadikoy');
select is(pg_temp.place('owner', 'B') -> 'week' -> 0 ->> 'published', 'false', 'nothing is published at Besiktas');
select is((select array_agg(o ->> 'job_name') from jsonb_array_elements(pg_temp.place('owner', 'K') -> 'open_shifts') o),
  array['Server', 'Server'], 'the open shifts still ahead');

-- S-206: working without a required document, by the documents rule.
select is((select array_agg((d ->> 'name') || ' · ' || (d ->> 'document')) from jsonb_array_elements(pg_temp.place('owner', 'K') -> 'missing_documents') d),
  array['Emre Person · Food handler card'], 'the owner sees Emre without his food handler card');
select is((select array_agg(d ->> 'name') from jsonb_array_elements(pg_temp.place('ayse', 'K') -> 'missing_documents') d),
  array['Emre Person'], 'Ayse (Manager, reads documents) sees it too');
select is(pg_temp.place('sena', 'K') -> 'missing_documents', '[]'::jsonb,
  'Sena, a manager without document access, does not');
select is(pg_temp.place('owner', 'B') -> 'missing_documents', '[]'::jsonb, 'nobody is missing one at Besiktas');

-- Time off waiting on an answer, with the person's locations in view.
select is((select array_agg((t ->> 'employee_name') || ' · ' || (t ->> 'first_date'))
  from jsonb_array_elements(pg_temp.home('owner') -> 'time_off') t),
  array['Emre Person · ' || (current_date + 10)::text], 'the owner sees Emre''s request');
select is(pg_temp.home('ayse') -> 'time_off' -> 0 -> 'location_ids', jsonb_build_array(tests.id('mh:K')),
  'Ayse sees it, filed under Kadikoy');
select is(pg_temp.home('bora') -> 'time_off', '[]'::jsonb, 'Bora, at Besiktas, does not');

select * from finish();
rollback;

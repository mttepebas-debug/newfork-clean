begin;
create extension if not exists pgtap with schema extensions;
select plan(52);

-- Time off rebuild D5 (KARARLAR S-239 (1), (6)): whoever may answer a person's time off enters approved time
-- off for them. It is a record, not a request: approved at once, entered and answered by the same person.
-- Who: the people who may answer it (app_private.time_off_decider_why), never for themselves, the owner
-- neither; only for somebody with employee access (S-166). When: from the location's today (all day today
-- is allowed; a shift that started stays), at most 31 days, in the person's primary location's zone. Not
-- over time off already approved, nor over a request still waiting (answer that first). Its effect is an
-- approval's: the published shifts it covers that have not started go to open shifts, on the print the
-- form read. The employee hears it was added; so do the others who may answer.
--
-- World te: Kadikoy (K) and Besiktas (B), both Istanbul.
--   ali - employee at K and B          maria, bea, cem - employees at K
--   mk  - manager at K                 mb  - manager at B
--   mia - manager at K who also works (manager+employee)
--   blk - manager at K past a required document's deadline
--   ad  - admin                        owner - who also works
-- World tf: only its owner.

select tests.world('te');
select tests.world('tf');
select tests.person('te', 'ali', 'employee', array['K', 'B'], array['cook']);
select tests.person('te', 'maria', 'employee', array['K'], array['cook']);
select tests.person('te', 'bea', 'employee', array['K'], array['cook']);
select tests.person('te', 'cem', 'employee', array['K'], array['cook']);
select tests.person('te', 'mk', 'manager', array['K'], array['general manager']);
select tests.person('te', 'mb', 'manager', array['B'], array['general manager']);
select tests.person('te', 'mia', 'manager+employee', array['K'], array['general manager', 'cook']);
select tests.person('te', 'blk', 'manager', array['K'], array['general manager']);
select tests.person('te', 'ad', 'admin', array['K'], array['general manager']);
select tests.employee_slot('te', 'owner');
select tests.settle();

select tests.publish_week('te', 0, '[
  {"label": "ali-k-tue", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"},
  {"label": "ali-b-wed", "person": "ali", "loc": "B", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"},
  {"label": "ali-k-fri", "person": "ali", "loc": "K", "job": "cook", "day": 4, "start": "09:00", "end": "15:00"}
]');
select tests.publish_week('te', 1, '[
  {"label": "maria-today", "person": "maria", "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "17:00"},
  {"label": "maria-tomorrow", "person": "maria", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}
]');
create temporary table checked_notices as select n.id from public.person_notifications n where n.workspace_id = tests.id('te');

-- Blk misses a required document: a type every active person needs, published, and only Blk's deadline
-- moved into the past.
create temporary table required_document (id uuid, preview jsonb);
insert into required_document (id)
select public.save_document_type_lifecycle_service(tests.user('te:owner'), tests.id('te'), null, null, jsonb_build_object(
  'title', 'Food handler card', 'description', 'Card', 'requires_review', true, 'accepted_formats', array['pdf'],
  'tracks_expiry', false, 'expiry_warning_days', 30,
  'lifecycle_settings', jsonb_build_object('mode', 'conditional', 'assignment_scope', 'all_active',
    'target', jsonb_build_object('operator', 'and', 'location_ids', '[]'::jsonb, 'department_ids', '[]'::jsonb,
      'job_ids', '[]'::jsonb, 'employee_ids', '[]'::jsonb),
    'period_days', 7, 'suspend_on_overdue', true, 'extra_fields', '[]'::jsonb)));
update required_document set preview = public.preview_document_publication_service(tests.user('te:owner'), tests.id('te'), id);
select public.set_document_publication_service(tests.user('te:owner'), tests.id('te'), id,
  (preview ->> 'revision')::integer, (preview ->> 'publication_revision')::integer, preview ->> 'preview_token', 'Publish', 'published')
from required_document;
select tests.settle();
-- ponytail: nothing in the product moves the clock; Blk's deadline is moved into the past by hand.
update public.employee_onboarding_requirements set deadline_at = now() - interval '1 day'
where source_id = (select id from required_document) and lifecycle_user_id = tests.user('te:blk');
insert into checked_notices select n.id from public.person_notifications n
where n.workspace_id = tests.id('te') and n.id not in (select id from checked_notices);

create temporary table fixture (key text primary key, value uuid);
create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'Europe/Istanbul')::date $$;
-- What entering would open, as the admin (who reads every location) reads it.
create function pg_temp.print(person text, first_day date, last_day date) returns text language sql as $$
  select public.enter_time_off_impact_service(tests.user('te:ad'), tests.id('te'), tests.id('te:' || person),
    first_day, last_day) ->> 'fingerprint'
$$;
-- Somebody of world te enters all day time off for `person`, on what the form read unless told otherwise.
create function pg_temp.enter(actor text, person text, first_day date, last_day date, note text default 'Family visit',
  print text default null, zone text default 'Europe/Istanbul', request_key uuid default null, w text default 'te')
returns jsonb
language sql
as $$
  select public.enter_time_off_service(tests.user(w || ':' || actor), tests.id('te'), tests.id('te:' || person), 'vacation',
    first_day, last_day, true, null, null, note, zone, coalesce(print, pg_temp.print(person, first_day, last_day)),
    coalesce(request_key, gen_random_uuid()))
$$;
create function pg_temp.refusal(statement text)
returns text
language plpgsql
as $$
declare state text; why text;
begin
  execute statement;
  return 'ok';
exception when others then
  get stacked diagnostics state = returned_sqlstate, why = pg_exception_hint;
  return state || ' ' || coalesce(why, '');
end;
$$;
create function pg_temp.said(statement text)
returns text
language plpgsql
as $$
begin
  execute statement;
  return 'ok';
exception when others then
  return sqlerrm;
end;
$$;
create function pg_temp.req(label text) returns public.time_off_requests language sql as $$
  select r from public.time_off_requests r where r.id = (select value from fixture where key = label)
$$;
create function pg_temp.told(notice text, request_label text)
returns text[]
language sql
as $$
  select coalesce(array_agg(i.label order by i.label), '{}')
  from public.person_notifications n
  join tests.ids i on i.id = n.user_id and i.label like 'te:%:user'
  where n.type_key = told.notice and n.subject_type = 'time_off'
    and n.subject_id = (select f.value from fixture f where f.key = told.request_label)
$$;
create function pg_temp.people(actor text) returns text[] language sql as $$
  select coalesce(array_agg(i.label order by i.label), '{}')
  from jsonb_array_elements(public.time_off_entry_people_service(tests.user('te:' || actor), tests.id('te')) -> 'people') p
  join tests.ids i on i.id = (p ->> 'employee_id')::uuid and i.label ~ '^te:[a-z]+$'
$$;

-- 1. Whom each may enter time off for: the people whose time off they may answer, with employee access.
select ok(pg_temp.people('mk') @> array['te:ali', 'te:bea', 'te:cem', 'te:maria', 'te:mia'],
  'a manager may enter time off for the employees of his location');
select ok(not pg_temp.people('mk') && array['te:mk', 'te:mb', 'te:blk', 'te:ad'],
  'not for himself nor for people who only manage');
select is(pg_temp.people('mb'), array['te:ali', 'te:owner'],
  'the other location''s manager, for the people who work there (the owner works at Besiktas too, S-164)');
select ok(pg_temp.people('ad') @> array['te:ali', 'te:maria', 'te:mia', 'te:owner'], 'an admin, for everybody who works');
select ok(not pg_temp.people('mia') && array['te:mia'], 'nobody for themselves');
select ok(not pg_temp.people('owner') && array['te:owner'], 'the owner neither');
select is(
  (select row(p ->> 'name', p ->> 'time_zone', p ->> 'today', p -> 'location_names')::text
   from jsonb_array_elements(public.time_off_entry_people_service(tests.user('te:mk'), tests.id('te')) -> 'people') p
   where p ->> 'employee_id' = tests.id('te:ali')::text),
  row('Ali Person', 'Europe/Istanbul', pg_temp.today()::text, '["Kadikoy", "Besiktas"]'::jsonb)::text,
  'each with the zone of their primary location and today there');
select is(pg_temp.refusal($$select public.time_off_entry_people_service(tests.user('te:bea'), tests.id('te'))$$),
  '42501 authz.missing_permission', 'an employee has nobody to enter time off for');
select is(pg_temp.refusal($$select public.time_off_entry_people_service(tests.user('te:blk'), tests.id('te'))$$),
  '42501 authz.document_blocked', 'nor a manager past a document deadline');

-- 2. What entering would open: Mk reads Kadikoy's schedule, not Besiktas's.
select is(
  (select row(x ->> 'shift_count', x ->> 'hidden_shift_count', jsonb_array_length(x -> 'locations'),
     x -> 'locations' -> 0 ->> 'location_name', x ->> 'time_zone', x ->> 'overlap')::text
   from public.enter_time_off_impact_service(tests.user('te:mk'), tests.id('te'), tests.id('te:ali'),
     tests.week(0) + 1, tests.week(0) + 2) x),
  row('2', '1', 1, 'Kadikoy', 'Europe/Istanbul', null)::text,
  'a manager sees the shifts of his location and a count of the others');
select is(public.enter_time_off_impact_service(tests.user('te:mk'), tests.id('te'), tests.id('te:ali'),
    tests.week(0) + 1, tests.week(0) + 1, '08:00', '10:00') ->> 'shift_count',
  '1', 'hours count the shifts they touch');
select is(pg_temp.refusal($$select public.enter_time_off_impact_service(tests.user('te:bea'), tests.id('te'), tests.id('te:ali'),
    tests.week(0) + 1, tests.week(0) + 2)$$), '42501 authz.missing_permission', 'an employee does not read it');

-- 3. Who may not enter it.
select is(pg_temp.refusal($$select pg_temp.enter('bea', 'ali', tests.week(0) + 1, tests.week(0) + 2)$$),
  '42501 authz.missing_permission', 'an employee may not');
select is(pg_temp.refusal($$select pg_temp.enter('blk', 'ali', tests.week(0) + 1, tests.week(0) + 2, print => 'x')$$),
  '42501 authz.document_blocked', 'a manager past a document deadline may not');
select is(pg_temp.refusal($$select pg_temp.enter('mia', 'mia', tests.week(0) + 1, tests.week(0) + 2, print => 'x')$$),
  '42501 authz.rank', 'a manager may not enter her own');
select is(pg_temp.refusal($$select pg_temp.enter('owner', 'owner', tests.week(0) + 1, tests.week(0) + 2, print => 'x')$$),
  '42501 authz.rank', 'the owner may not enter their own');
select is(pg_temp.refusal($$select pg_temp.enter('mb', 'maria', tests.week(0) + 1, tests.week(0) + 2, print => 'x')$$),
  '42501 authz.out_of_scope', 'a manager of a location she does not work at may not');
select is(pg_temp.refusal($$select pg_temp.enter('ad', 'mk', tests.week(0) + 1, tests.week(0) + 2, print => 'x')$$),
  '22023 time_off.no_employee_access', 'nobody enters time off for somebody who only manages');
select is(pg_temp.refusal($$select pg_temp.enter('owner', 'ali', tests.week(0) + 1, tests.week(0) + 2, print => 'x', w => 'tf')$$),
  '42501 authz.not_member', 'another workspace''s owner may not');
select is(pg_temp.refusal($$select public.enter_time_off_service(tests.user('te:ad'), tests.id('te'), gen_random_uuid(), 'vacation',
    tests.week(0) + 1, tests.week(0) + 1, true, null, null, null, 'Europe/Istanbul', 'x', gen_random_uuid())$$),
  -- D8 (BL-354): as somebody out of reach, so an id does not tell whether it is a person.
  '42501 authz.out_of_scope', 'a person who is not there answers as somebody out of reach');

-- 4. When: from the location's today, at most 31 days, in the person's zone, on the shifts read.
select is(pg_temp.refusal($$select pg_temp.enter('mk', 'maria', pg_temp.today() - 1, pg_temp.today(), print => 'x')$$),
  '22023 time_off.past', 'a day that has passed is refused');
select is(pg_temp.refusal($$select pg_temp.enter('mk', 'maria', tests.week(0) + 1, tests.week(0) + 32, print => 'x')$$),
  '22023 time_off.too_long', 'more than 31 days is refused');
select is(pg_temp.refusal($$select pg_temp.enter('mk', 'maria', tests.week(0) + 2, tests.week(0) + 1, print => 'x')$$),
  '22023 time_off.order', 'a last day before the first is refused');
select is(pg_temp.refusal($$select pg_temp.enter('mk', 'maria', tests.week(0) + 1, tests.week(0) + 1, zone => 'America/New_York')$$),
  'PT409 time_off.timezone_changed', 'a form drawn in another zone is refused');
select is(pg_temp.refusal($$select pg_temp.enter('mb', 'ali', tests.week(0) + 1, tests.week(0) + 2, print => 'a picture of other shifts')$$),
  'PT409 time_off.changed', 'time off entered on another picture of the shifts is refused');
select is((select count(*)::integer from public.time_off_requests r where r.workspace_id = tests.id('te')), 0,
  'and nothing was written');

-- 5. Mb, the manager of Ali's other location, enters Tuesday and Wednesday for him.
insert into fixture values ('ali', (pg_temp.enter('mb', 'ali', tests.week(0) + 1, tests.week(0) + 2, 'Doctor said rest',
  request_key => tests.remember('ali:key', gen_random_uuid())) ->> 'id')::uuid);
select is(
  (select row(r.status, r.kind, r.effective = tstzmultirange(tstzrange(r.starts_at, r.ends_at, '[)')), r.created_by, r.decided_by,
     r.decided_at = now(), r.note, r.time_timezone, r.revision)::text from public.time_off_requests r
   where r.id = (select value from fixture where key = 'ali')),
  row('approved', 'leave', true, tests.user('te:mb'), tests.user('te:mb'), true, 'Doctor said rest', 'Europe/Istanbul', 1)::text,
  'it is approved time off at once, entered and answered by Mb, now');
select is(
  array(select s.employee_id is null from public.schedule_published_shifts s
        where s.id in (tests.id('te:shift:ali-k-tue'), tests.id('te:shift:ali-b-wed'), tests.id('te:shift:ali-k-fri'))
        order by s.scheduled_date),
  array[true, true, false], 'his Tuesday and Wednesday shifts went to open shifts; Friday is his');
select is((select count(*)::integer from public.time_off_request_releases x where x.request_id = (select value from fixture where key = 'ali')),
  2, 'each opened shift is recorded');
select is(
  (select row(s.pending, s.span)::text from app_private.leave_spans(tests.id('te'), array[tests.id('te:ali')],
     tstzrange(tests.week(0)::timestamp at time zone 'UTC', (tests.week(0) + 7)::timestamp at time zone 'UTC')) s),
  row(false, tstzrange(((tests.week(0) + 1)::timestamp at time zone 'Europe/Istanbul'),
    ((tests.week(0) + 3)::timestamp at time zone 'Europe/Istanbul'), '[)'))::text,
  'leave_spans reads it as approved time off');
select is(
  (select row(r ->> 'status', r ->> 'added_by_name', r ->> 'decided_by_name')::text
   from jsonb_array_elements(public.my_time_off_service(tests.user('te:ali'), tests.id('te')) -> 'requests') r
   where r ->> 'id' = (select value::text from fixture where key = 'ali')),
  row('approved', 'Mb Person', 'Mb Person')::text,
  'Ali reads it as approved, added by Mb');
select is(
  (select r ->> 'added_by_name' from jsonb_array_elements(public.time_off_requests_service(tests.user('te:mk'), tests.id('te')) -> 'requests') r
   where r ->> 'id' = (select value::text from fixture where key = 'ali')),
  'Mb Person', 'and Requests → Time off lists it, added by Mb');
-- The same key gives back the same time off; for other days it is refused.
select is(pg_temp.enter('mb', 'ali', tests.week(0) + 1, tests.week(0) + 2, 'Doctor said rest', print => 'whatever',
    request_key => tests.id('ali:key')) ->> 'id',
  (select value::text from fixture where key = 'ali'), 'sent again, it is the same time off');
select is(pg_temp.refusal($$select pg_temp.enter('mb', 'ali', tests.week(0) + 1, tests.week(0) + 3, 'Doctor said rest',
    print => 'x', request_key => tests.id('ali:key'))$$),
  'PT409 time_off.key_reused', 'the same key for other days is refused');

-- Ali hears it was added for him; the others who may answer hear of it; not Mb, who entered it.
select is(pg_temp.told('time_off.decided', 'ali'), array['te:ali:user', 'te:mia:user', 'te:mk:user'],
  'Ali and the other managers who may answer hear of it');
select is(
  (select row(n.title, n.body, n.url, n.data ->> 'outcome', n.data ->> 'entered', n.data ->> 'shifts_opened')::text
   from public.person_notifications n
   where n.type_key = 'time_off.decided' and n.user_id = tests.user('te:ali')
     and n.subject_id = (select value from fixture where key = 'ali')),
  row('Time off ' || app_private.time_off_days_label(pg_temp.req('ali')) || ' was added for you', 'Doctor said rest',
    '/app/employee-hub/my-availability?section=time-off', 'approved', 'true', '2')::text,
  'Ali''s notice says it was added for him and links to his time off');
select is(
  (select row(n.title, n.body, n.url)::text from public.person_notifications n
   where n.type_key = 'time_off.decided' and n.user_id = tests.user('te:mk')
     and n.subject_id = (select value from fixture where key = 'ali')),
  row('Ali P.''s time off ' || app_private.time_off_days_label(pg_temp.req('ali')) || ' was added',
    '2 shifts went to open shifts.', '/app/schedule/requests?type=time_off&request=' || (select value from fixture where key = 'ali'))::text,
  'Mk''s notice says it was added and how many shifts opened');
select is(
  (select count(*)::integer from public.person_notifications n
   where n.type_key = 'time_off.requested' and n.subject_id = (select value from fixture where key = 'ali')),
  0, 'nobody is asked to answer it');

-- 6. Not over time off: approved, or a request still waiting (answer that first).
select is(pg_temp.refusal($$select pg_temp.enter('mk', 'ali', tests.week(0) + 2, tests.week(0) + 3, print => 'x')$$),
  'PT409 time_off.overlap', 'time off over approved time off is refused');
select is(public.enter_time_off_impact_service(tests.user('te:mk'), tests.id('te'), tests.id('te:ali'),
    tests.week(0) + 2, tests.week(0) + 3) ->> 'overlap', 'approved', 'and the form says so before it is sent');
insert into fixture values ('cem', (public.ask_time_off_service(tests.user('te:cem'), tests.id('te'), 'sick', tests.week(0) + 3,
  tests.week(0) + 3, true, null, null, null, 'Europe/Istanbul', gen_random_uuid()) ->> 'id')::uuid);
select is(pg_temp.refusal($$select pg_temp.enter('mk', 'cem', tests.week(0) + 3, tests.week(0) + 4, print => 'x')$$),
  'PT409 time_off.pending_overlap', 'time off over a request still waiting is refused');
select is(pg_temp.said($$select pg_temp.enter('mk', 'cem', tests.week(0) + 3, tests.week(0) + 4, print => 'x')$$),
  'Cem Person has a request waiting for these days. Answer it first.', 'saying to answer the request first');
select is(public.enter_time_off_impact_service(tests.user('te:mk'), tests.id('te'), tests.id('te:cem'),
    tests.week(0) + 3, tests.week(0) + 4) ->> 'overlap', 'pending', 'the form knows it before it is sent');
select ok(pg_temp.enter('mk', 'cem', tests.week(0) + 4, tests.week(0) + 4) ->> 'status' = 'approved',
  'the next day is free');

-- 7. Today, all day: a shift that started stays; tomorrow's goes to open shifts.
-- ponytail: the published shifts are moved to today and tomorrow by hand (a publish is for the weeks ahead),
-- past the assignment guard, which would ask for a fresh acceptance of the moved shifts.
set local session_replication_role = replica;
update public.schedule_published_shifts
set scheduled_date = pg_temp.today(), start_time = '00:00', end_time = '23:59'
where id = tests.id('te:shift:maria-today');
update public.schedule_published_shifts set scheduled_date = pg_temp.today() + 1
where id = tests.id('te:shift:maria-tomorrow');
set local session_replication_role = origin;
select is(public.enter_time_off_impact_service(tests.user('te:mk'), tests.id('te'), tests.id('te:maria'),
    pg_temp.today(), pg_temp.today() + 1) ->> 'shift_count', '1', 'only the shift that has not started would open');
insert into fixture values ('maria', (pg_temp.enter('mk', 'maria', pg_temp.today(), pg_temp.today() + 1) ->> 'id')::uuid);
select is(
  (select row(r.status, lower(r.effective) = pg_temp.today()::timestamp at time zone 'Europe/Istanbul')::text
   from public.time_off_requests r where r.id = (select value from fixture where key = 'maria')),
  row('approved', true)::text, 'today all day is entered from today''s midnight');
select is(
  array(select s.employee_id is null from public.schedule_published_shifts s
        where s.id in (tests.id('te:shift:maria-today'), tests.id('te:shift:maria-tomorrow')) order by s.scheduled_date),
  array[false, true], 'the started shift stays hers; tomorrow''s is open');
select is(pg_temp.told('time_off.decided', 'maria'), array['te:maria:user', 'te:mia:user'],
  'Maria hears it, and so does the other manager of Kadikoy');

-- 8. An admin enters for the owner; the owner, for an employee.
select is(pg_temp.enter('ad', 'owner', tests.week(0) + 5, tests.week(0) + 5) ->> 'status', 'approved',
  'an admin enters time off for the owner');
select is(pg_temp.enter('owner', 'bea', tests.week(0) + 5, tests.week(0) + 5) ->> 'added_by_name', 'Olcay Owner',
  'the owner enters time off for an employee');

-- 9. Asked by the employee, it is not "added".
select is(
  (select r ->> 'added_by_name' from jsonb_array_elements(public.my_time_off_service(tests.user('te:cem'), tests.id('te')) -> 'requests') r
   where r ->> 'id' = (select value::text from fixture where key = 'cem')),
  null, 'a request Cem sent himself says nobody added it');

select is(tests.unlisted_notices(tests.id('te'), array(select id from checked_notices)), '{}'::text[],
  'every notice is in its recipient''s choices');

select * from finish();
rollback;

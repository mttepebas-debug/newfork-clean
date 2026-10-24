begin;
create extension if not exists pgtap with schema extensions;
select plan(72);

-- Time off rebuild D3 (KARARLAR S-239): a manager, an admin or the owner answers a time off request in the
-- new table. One answer is enough: any manager of one of the person's live locations who may decide there,
-- or an admin or the owner. Nobody answers their own request, the owner neither; a manager past a document
-- deadline does not answer. Approving opens the person's published shifts the time off covers that have not
-- started, and closes the shift changes they were part of. The employee hears the answer either way; on an
-- approval so do the others who were asked. A request whose start passed while it waited expires instead.
--
-- World tq: Kadikoy (K) and Besiktas (B), both Istanbul.
--   ali - employee at K and B          bea, cem, dor, eve - employees at K
--   mk  - manager at K                 mb  - manager at B
--   mia - manager at K who also works (manager+employee)
--   blk - manager at K past a required document's deadline
--   ad  - admin                        ade - admin who also works
--   owner - who also works
-- World tz: only its owner, who also works.

select tests.world('tq');
select tests.world('tz');
select tests.person('tq', 'ali', 'employee', array['K', 'B'], array['cook']);
select tests.person('tq', 'bea', 'employee', array['K'], array['cook']);
select tests.person('tq', 'cem', 'employee', array['K'], array['cook']);
select tests.person('tq', 'dor', 'employee', array['K'], array['cook']);
select tests.person('tq', 'eve', 'employee', array['K'], array['cook']);
select tests.person('tq', 'mk', 'manager', array['K'], array['general manager']);
select tests.person('tq', 'mb', 'manager', array['B'], array['general manager']);
select tests.person('tq', 'mia', 'manager+employee', array['K'], array['general manager', 'cook']);
select tests.person('tq', 'blk', 'manager', array['K'], array['general manager']);
select tests.person('tq', 'ad', 'admin', array['K'], array['general manager']);
select tests.person('tq', 'ade', 'admin+employee', array['K'], array['general manager', 'cook']);
select tests.employee_slot('tq', 'owner');
select tests.employee_slot('tz', 'owner');
select tests.settle();

select tests.publish_week('tq', 0, '[
  {"label": "ali-k-tue", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"},
  {"label": "ali-b-wed", "person": "ali", "loc": "B", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"},
  {"label": "ali-k-fri", "person": "ali", "loc": "K", "job": "cook", "day": 4, "start": "09:00", "end": "15:00"},
  {"label": "bea-k-tue", "person": "bea", "loc": "K", "job": "cook", "day": 1, "start": "16:00", "end": "22:00"}
]');
select tests.publish_week('tq', 1, '[
  {"label": "bea-today", "person": "bea", "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "17:00"},
  {"label": "bea-tomorrow", "person": "bea", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}
]');
-- Ali asks for cover on Tuesday and Eve applies: a shift change on a shift the approval opens.
select tests.cover_case('tq', 'ali-k-tue', 'ali', 'eve');
-- The notices so far are checked before Blk loses her right to choose (BILDIRIM-12).
create temporary table checked_notices as select n.id from public.person_notifications n where n.workspace_id = tests.id('tq');
select is(tests.unlisted_notices(tests.id('tq')), '{}'::text[], 'the shift change''s notices are in their recipients'' choices');

-- Blk misses a required document: a type every active person needs, published, and only Blk's deadline
-- moved into the past.
create temporary table required_document (id uuid, preview jsonb);
insert into required_document (id)
select public.save_document_type_lifecycle_service(tests.user('tq:owner'), tests.id('tq'), null, null, jsonb_build_object(
  'title', 'Food handler card', 'description', 'Card', 'requires_review', true, 'accepted_formats', array['pdf'],
  'tracks_expiry', false, 'expiry_warning_days', 30,
  'lifecycle_settings', jsonb_build_object('mode', 'conditional', 'assignment_scope', 'all_active',
    'target', jsonb_build_object('operator', 'and', 'location_ids', '[]'::jsonb, 'department_ids', '[]'::jsonb,
      'job_ids', '[]'::jsonb, 'employee_ids', '[]'::jsonb),
    'period_days', 7, 'suspend_on_overdue', true, 'extra_fields', '[]'::jsonb)));
update required_document set preview = public.preview_document_publication_service(tests.user('tq:owner'), tests.id('tq'), id);
select public.set_document_publication_service(tests.user('tq:owner'), tests.id('tq'), id,
  (preview ->> 'revision')::integer, (preview ->> 'publication_revision')::integer, preview ->> 'preview_token', 'Publish', 'published')
from required_document;
select tests.settle();
-- ponytail: nothing in the product moves the clock; Blk's deadline is moved into the past by hand.
update public.employee_onboarding_requirements set deadline_at = now() - interval '1 day'
where source_id = (select id from required_document) and lifecycle_user_id = tests.user('tq:blk');

create temporary table fixture (key text primary key, value uuid);
create function pg_temp.ask(person text, first_day date, last_day date, w text default 'tq')
returns uuid
language sql
as $$
  select (public.ask_time_off_service(tests.user(w || ':' || person), tests.id(w), 'vacation', first_day, last_day, true,
    null, null, 'Family visit', 'Europe/Istanbul', gen_random_uuid()) ->> 'id')::uuid
$$;
create function pg_temp.req(label text) returns public.time_off_requests language sql as $$
  select r from public.time_off_requests r where r.id = (select value from fixture where key = label)
$$;
create function pg_temp.print(label text) returns text language sql as $$
  select app_private.time_off_shifts_print(app_private.time_off_shifts_at_stake(pg_temp.req(label)))
$$;
-- An answer as somebody of world tq, on what they read (the revision and the print) unless told otherwise.
create function pg_temp.answer(person text, label text, verdict text, note text default null,
  revision integer default null, print text default null, w text default 'tq')
returns jsonb
language sql
as $$
  select public.answer_time_off_service(tests.user(w || ':' || person), tests.id('tq'), (select value from fixture where key = label),
    verdict, note, coalesce(revision, (pg_temp.req(label)).revision), coalesce(print, pg_temp.print(label)))
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
-- Who got a notice of this type about this request, by label, sorted.
create function pg_temp.told(notice text, request_label text, w text default 'tq')
returns text[]
language sql
as $$
  select coalesce(array_agg(i.label order by i.label), '{}')
  from public.person_notifications n
  join tests.ids i on i.id = n.user_id and i.label like told.w || ':%:user'
  where n.type_key = told.notice and n.subject_type = 'time_off'
    and n.subject_id = (select f.value from fixture f where f.key = told.request_label)
$$;
create function pg_temp.resolved(label text) returns text[] language sql as $$
  select coalesce(array_agg(distinct n.resolution order by n.resolution), '{}')
  from public.person_notifications n
  where n.type_key = 'time_off.requested' and n.subject_id = (select value from fixture where key = label)
$$;

-- 1. Ali asks for Tuesday and Wednesday of week 0. Who may answer hears of it: a manager of each of his
-- locations who may decide there (not Blk, past a document deadline); no admin, no owner while each location
-- has one.
insert into fixture values ('ali', pg_temp.ask('ali', tests.week(0) + 1, tests.week(0) + 2));
select is(pg_temp.told('time_off.requested', 'ali'), array['tq:mb:user', 'tq:mia:user', 'tq:mk:user'],
  'the managers of his two locations are asked, in S-169''s order');
select is(
  (select row(n.url, n.title, n.data ->> 'kind_of_leave')::text from public.person_notifications n
   where n.type_key = 'time_off.requested' and n.subject_id = (select value from fixture where key = 'ali')
     and n.user_id = tests.user('tq:mk')),
  row('/app/schedule/requests?type=time_off&request=' || (select value from fixture where key = 'ali'),
    'Ali P. asks for time off', 'vacation')::text,
  'the card opens the request in Requests → Time off'
);

-- 2. The employee's form: his published shifts in those days that have not started.
select is(public.my_time_off_shifts_service(tests.user('tq:ali'), tests.id('tq'), tests.week(0) + 1, tests.week(0) + 2) ->> 'count',
  '2', 'two of his shifts would open');
select is(public.my_time_off_shifts_service(tests.user('tq:ali'), tests.id('tq'), tests.week(0) + 1, tests.week(0) + 1,
  '08:00', '10:00') ->> 'count', '1', 'hours count the shifts they touch');
select is(pg_temp.refusal($$select public.my_time_off_shifts_service(tests.user('tq:ali'), tests.id('tq'), tests.week(0) + 2, tests.week(0) + 1)$$),
  '22023 time_off.order', 'a last day before the first is refused');
select is(pg_temp.refusal($$select public.my_time_off_shifts_service(tests.user('tq:mk'), tests.id('tq'), tests.week(0) + 1, tests.week(0) + 2)$$),
  '42501 authz.rank', 'somebody with no employee access has no time off to ask');

-- 3. What approving would open: Mk reads Kadikoy's schedule, not Besiktas's.
select is(
  (select row(x ->> 'shift_count', x ->> 'hidden_shift_count', jsonb_array_length(x -> 'locations'),
     x -> 'locations' -> 0 ->> 'location_name', x -> 'locations' -> 0 -> 'shifts' -> 0 ->> 'start_time',
     x ->> 'fingerprint' = pg_temp.print('ali'), x -> 'request' ->> 'employee_name')::text
   from public.time_off_impact_service(tests.user('tq:mk'), tests.id('tq'), (select value from fixture where key = 'ali')) x),
  row('2', '1', 1, 'Kadikoy', '09:00', true, 'Ali Person')::text,
  'a manager sees the shifts of his location and a count of the others'
);
select is(
  (select jsonb_array_length(x -> 'locations') from public.time_off_impact_service(tests.user('tq:ad'), tests.id('tq'),
     (select value from fixture where key = 'ali')) x),
  2, 'an admin sees both locations');
select is(pg_temp.refusal($$select public.time_off_impact_service(tests.user('tq:bea'), tests.id('tq'), (select value from fixture where key = 'ali'))$$),
  '42501 authz.missing_permission', 'an employee does not read it');
select is(pg_temp.refusal($$select public.time_off_impact_service(tests.user('tq:ad'), tests.id('tq'), gen_random_uuid())$$),
  -- D8 (BL-354): as one out of reach, so an id does not tell whether it is a request.
  '42501 authz.out_of_scope', 'a request that is not there answers as one out of reach');

-- 4. Who may not answer.
select is(pg_temp.refusal($$select pg_temp.answer('bea', 'ali', 'approve')$$), '42501 authz.missing_permission',
  'an employee may not answer');
select is(pg_temp.refusal($$select pg_temp.answer('blk', 'ali', 'approve')$$), '42501 authz.document_blocked',
  'a manager past a document deadline may not answer');
select is(pg_temp.refusal($$select pg_temp.answer('owner', 'ali', 'approve', w => 'tz')$$), '42501 authz.not_member',
  'another workspace''s owner may not answer');
select is(pg_temp.refusal($$select pg_temp.answer('mk', 'ali', 'maybe')$$), '22023 time_off.invalid',
  'an answer is approve or decline');
select is(pg_temp.refusal($$select pg_temp.answer('mk', 'ali', 'approve', print => 'a picture of other shifts')$$),
  'PT409 time_off.changed', 'an approval on another picture of the shifts is refused');
select is(pg_temp.refusal($$select pg_temp.answer('mk', 'ali', 'approve', revision => 7)$$),
  'PT409 time_off.changed', 'an answer on another revision is refused');
select is((pg_temp.req('ali')).status, 'pending', 'and nothing changed');

-- 5. Mb, the manager of his other location, approves.
select is(pg_temp.answer('mb', 'ali', 'approve', 'Enjoy') ->> 'status', 'approved', 'the other location''s manager approves');
select is(
  (select row(r.status, r.effective = tstzmultirange(tstzrange(r.starts_at, r.ends_at, '[)')), r.decided_by, r.decision_note,
     r.revision, r.decided_at = now())::text from public.time_off_requests r where r.id = (select value from fixture where key = 'ali')),
  row('approved', true, tests.user('tq:mb'), 'Enjoy', 2, true)::text,
  'the whole range is now his time off, with who answered and when'
);
select is(
  array(select s.employee_id is null from public.schedule_published_shifts s
        where s.id in (tests.id('tq:shift:ali-k-tue'), tests.id('tq:shift:ali-b-wed'), tests.id('tq:shift:ali-k-fri'))
        order by s.scheduled_date),
  array[true, true, false],
  'his Tuesday and Wednesday shifts are open; Friday is his'
);
select is((select count(*)::integer from public.time_off_request_releases x where x.request_id = (select value from fixture where key = 'ali')),
  2, 'each opened shift is recorded');
select is((select x.before_assignment ->> 'employee_id' from public.time_off_request_releases x
           where x.published_shift_id = tests.id('tq:shift:ali-k-tue')), tests.id('tq:ali')::text,
  'with whose it was');
select is((select c.status from public.shift_exchange_cases c where c.id = tests.id('tq:case:ali-k-tue')), 'invalidated',
  'the cover request on Tuesday''s shift can no longer happen');
select is(
  (select array_agg(a.status order by a.id) from public.shift_exchange_applications a where a.case_id = tests.id('tq:case:ali-k-tue')),
  array['invalidated'], 'and Eve''s application closes with it');
select is(
  (select row(s.pending, s.span)::text from app_private.leave_spans(tests.id('tq'), array[tests.id('tq:ali')],
     tstzrange(tests.week(0)::timestamp at time zone 'UTC', (tests.week(0) + 7)::timestamp at time zone 'UTC')) s),
  row(false, tstzrange(((tests.week(0) + 1)::timestamp at time zone 'Europe/Istanbul'), ((tests.week(0) + 3)::timestamp at time zone 'Europe/Istanbul'), '[)'))::text,
  'leave_spans reads it as approved time off'
);
select is(
  public.get_employee_hub_service(tests.user('tq:ali'), tests.id('tq'), tests.week(0), tests.week(0) + 6) -> 'leave_days',
  jsonb_build_array(tests.week(0) + 1, tests.week(0) + 2),
  'Employee Hub''s leave_days are his two days'
);
select is(public.my_time_off_shifts_service(tests.user('tq:ali'), tests.id('tq'), tests.week(0) + 1, tests.week(0) + 2) ->> 'count',
  '0', 'no shift of his is left in those days');

-- Ali hears it; so do the others who were asked; the cards asking them close.
select is(pg_temp.told('time_off.decided', 'ali'), array['tq:ali:user', 'tq:mia:user', 'tq:mk:user'],
  'Ali and the other managers who were asked hear the approval; not the one who gave it');
select is(
  (select row(n.title, n.body, n.url, n.data ->> 'outcome', n.data ->> 'shifts_opened')::text from public.person_notifications n
   where n.type_key = 'time_off.decided' and n.user_id = tests.user('tq:ali')
     and n.subject_id = (select value from fixture where key = 'ali')),
  row('Your time off ' || to_char(tests.week(0) + 1, 'FMMon FMDD') ||
      case when date_trunc('month', tests.week(0) + 1) = date_trunc('month', tests.week(0) + 2)
        then '–' || to_char(tests.week(0) + 2, 'FMDD') else '–' || to_char(tests.week(0) + 2, 'FMMon FMDD') end || ' is approved',
    'Enjoy', '/app/employee-hub/my-availability?section=time-off', 'approved', '2')::text,
  'Ali''s notice says it is approved, with the note, and links to his time off'
);
select is(pg_temp.resolved('ali'), array['approved'], 'every card asking for an answer is closed as approved');
select is(pg_temp.refusal($$select pg_temp.answer('mk', 'ali', 'decline')$$), 'PT409 time_off.not_pending',
  'an answered request is not answered again');

-- 6. Cem asks; Mk declines with a note. Cem hears it; nobody else does.
insert into fixture values ('cem', pg_temp.ask('cem', tests.week(0) + 3, tests.week(0) + 3));
select is(pg_temp.told('time_off.requested', 'cem'), array['tq:mia:user', 'tq:mk:user'],
  'Kadikoy''s managers are asked about Cem');
select is(
  (select jsonb_agg(t ->> 'id') from jsonb_array_elements(public.get_manager_home_service(tests.user('tq:mk'), tests.id('tq')) -> 'time_off') t
   where t ->> 'id' = (select value::text from fixture where key = 'cem')),
  jsonb_build_array((select value::text from fixture where key = 'cem')),
  'Home lists his request as waiting for Mk'
);
select cmp_ok(
  ((public.get_workspace_dashboard_service(tests.user('tq:mk'), tests.id('tq')) -> 'metrics' ->> 'pending_time_off_count'))::integer,
  '>=', 1, 'and the dashboard counts it');
select is(pg_temp.answer('mk', 'cem', 'decline', '  Short staffed  ') ->> 'status', 'declined', 'Mk declines');
select is(
  (select row(r.status, isempty(r.effective), r.decided_by, r.decision_note)::text from public.time_off_requests r
   where r.id = (select value from fixture where key = 'cem')),
  row('declined', true, tests.user('tq:mk'), 'Short staffed')::text,
  'a declined request is no time off');
select is(pg_temp.told('time_off.decided', 'cem'), array['tq:cem:user'], 'only Cem hears a decline');
select is(
  (select row(n.body, n.data ->> 'outcome')::text from public.person_notifications n
   where n.type_key = 'time_off.decided' and n.subject_id = (select value from fixture where key = 'cem')),
  row('Short staffed', 'declined')::text, 'with the note');
select is(pg_temp.resolved('cem'), array['declined'], 'the cards close as declined');
select is(
  (select row(u ->> 'approved', u ->> 'by', u ->> 'person')::text
   from jsonb_array_elements(public.get_manager_home_service(tests.user('tq:mia'), tests.id('tq')) -> 'updates') u
   where u ->> 'id' = (select value::text from fixture where key = 'cem')),
  row('false', 'Mk Person', 'Cem Person')::text,
  'Home''s updates say Mk declined Cem''s time off'
);

-- 7. Nobody answers their own request.
insert into fixture values ('mia', pg_temp.ask('mia', tests.week(0) + 5, tests.week(0) + 5));
select is(pg_temp.refusal($$select pg_temp.answer('mia', 'mia', 'approve')$$), '42501 authz.rank',
  'a manager does not answer her own request');
select is(pg_temp.told('time_off.requested', 'mia'), array['tq:mk:user'], 'the other manager is asked, not Mia');
select is(pg_temp.answer('mk', 'mia', 'approve') ->> 'status', 'approved', 'the other manager answers it');
insert into fixture values ('ade', pg_temp.ask('ade', tests.week(0) + 5, tests.week(0) + 5));
select is(pg_temp.refusal($$select pg_temp.answer('ade', 'ade', 'approve')$$), '42501 authz.rank',
  'an admin does not answer her own request');
select is(pg_temp.answer('ad', 'ade', 'approve') ->> 'status', 'approved', 'another admin does');
insert into fixture values ('owner', pg_temp.ask('owner', tests.week(0) + 5, tests.week(0) + 5));
select is(pg_temp.refusal($$select pg_temp.answer('owner', 'owner', 'approve')$$), '42501 authz.rank',
  'the owner does not answer their own request');
select is(pg_temp.answer('ad', 'owner', 'decline') ->> 'status', 'declined', 'an admin answers the owner''s');
-- A one-person workspace: nobody is asked, nobody may answer, and at its start it expires.
insert into fixture values ('tz', pg_temp.ask('owner', tests.week(0) + 5, tests.week(0) + 5, 'tz'));
select is(pg_temp.told('time_off.requested', 'tz', 'tz'), '{}'::text[], 'a lone owner''s request asks nobody');
select is(pg_temp.refusal($$select public.answer_time_off_service(tests.user('tz:owner'), tests.id('tz'),
    (select value from fixture where key = 'tz'), 'approve', null, 1, pg_temp.print('tz'))$$),
  '42501 authz.rank', 'and the lone owner may not answer it');
select is(public.time_off_requests_service(tests.user('tz:owner'), tests.id('tz')) ->> 'total', '0',
  'nor does it show in their list');

-- 8. A request whose start passed while it waited expires instead, without an error.
insert into public.time_off_requests (id, workspace_id, employee_id, starts_at, ends_at, all_day, time_timezone,
  kind_of_leave, created_by, client_key)
values (tests.remember('dor:request', gen_random_uuid()), tests.id('tq'), tests.id('tq:dor'), now() - interval '1 hour',
  now() + interval '3 hours', false, 'Europe/Istanbul', 'sick', tests.user('tq:dor'), gen_random_uuid());
insert into fixture values ('dor', tests.id('dor:request'));
select is(pg_temp.answer('mk', 'dor', 'approve') ->> 'status', 'expired', 'an answer after the start gets "expired" back');
select is((select row(r.status, r.revision, isempty(r.effective))::text from public.time_off_requests r where r.id = tests.id('dor:request')),
  row('expired', 2, true)::text, 'and writes it: no time off');

-- 9. A shift that started stays: Bea's request starts in a minute; her shift today started this morning,
-- tomorrow's has not.
-- ponytail: the published shifts are moved to today and tomorrow by hand (a publish is for the weeks ahead),
-- past the assignment guard, which would ask for a fresh acceptance of the moved shifts.
set local session_replication_role = replica;
update public.schedule_published_shifts
set scheduled_date = (now() at time zone 'Europe/Istanbul')::date, start_time = '00:00', end_time = '23:59'
where id = tests.id('tq:shift:bea-today');
update public.schedule_published_shifts
set scheduled_date = (now() at time zone 'Europe/Istanbul')::date + 1
where id = tests.id('tq:shift:bea-tomorrow');
set local session_replication_role = origin;
insert into public.time_off_requests (id, workspace_id, employee_id, starts_at, ends_at, all_day, time_timezone,
  kind_of_leave, created_by, client_key)
values (tests.remember('bea:request', gen_random_uuid()), tests.id('tq'), tests.id('tq:bea'), now() + interval '1 minute',
  ((now() at time zone 'Europe/Istanbul')::date + 2)::timestamp at time zone 'Europe/Istanbul', false, 'Europe/Istanbul',
  'personal', tests.user('tq:bea'), gen_random_uuid());
insert into fixture values ('bea', tests.id('bea:request'));
select is((public.time_off_impact_service(tests.user('tq:ad'), tests.id('tq'), tests.id('bea:request')) ->> 'shift_count'), '1',
  'only the shift that has not started would open');
select is(pg_temp.answer('ad', 'bea', 'approve') ->> 'shifts_opened', '1', 'an admin approves; one shift opens');
select is(
  array(select s.employee_id is null from public.schedule_published_shifts s
        where s.id in (tests.id('tq:shift:bea-today'), tests.id('tq:shift:bea-tomorrow')) order by s.scheduled_date),
  array[false, true], 'the started shift stays hers; tomorrow''s is open');
select is(pg_temp.told('time_off.decided', 'bea'), array['tq:bea:user', 'tq:mia:user', 'tq:mk:user'],
  'Bea hears it, and so do Kadikoy''s managers who could have answered; not the admin who did');

-- 10. A withdrawn request's cards close.
insert into fixture values ('eve', pg_temp.ask('eve', tests.week(0) + 6, tests.week(0) + 6));
select public.withdraw_time_off_service(tests.user('tq:eve'), tests.id('tq'), (select value from fixture where key = 'eve'), 1);
select is(pg_temp.resolved('eve'), array['withdrawn'], 'withdrawing closes the cards as withdrawn');

-- 11. The answerers' list (Requests → Time off).
insert into fixture values ('eve2', pg_temp.ask('eve', tests.week(1) + 3, tests.week(1) + 3));
-- D7: the page's own time format and location filter come with the list (the old read is gone): the workspace's
-- clock, and the locations whose requests this person answers.
select is(
  (select row(x ->> 'time_format', (select array_agg(l ->> 'name' order by l ->> 'name') from jsonb_array_elements(x -> 'locations') l))::text
   from public.time_off_requests_service(tests.user('tq:mk'), tests.id('tq')) x),
  row((select s.time_format from public.workspace_scheduling_settings s where s.workspace_id = tests.id('tq')),
    array['Kadikoy'])::text,
  'the list says the workspace''s time format and the manager''s locations');
select is(
  (select array_agg(l ->> 'name' order by l ->> 'name') from jsonb_array_elements(
     public.time_off_requests_service(tests.user('tq:ad'), tests.id('tq')) -> 'locations') l),
  array['Besiktas', 'Kadikoy'], 'an admin''s: every location');
-- The owner works at both locations: any of their managers may answer the owner's request too.
select is(
  (select row(x -> 'requests' -> 0 ->> 'employee_name', x -> 'requests' -> 0 ->> 'status',
     (select array_agg(r ->> 'employee_name' order by r ->> 'employee_name') from jsonb_array_elements(x -> 'requests') r))::text
   from public.time_off_requests_service(tests.user('tq:mk'), tests.id('tq')) x),
  row('Eve Person', 'pending', array['Ade Person', 'Ali Person', 'Bea Person', 'Cem Person', 'Dor Person', 'Eve Person',
    'Mia Person', 'Olcay Owner'])::text,
  'a manager''s list: what waits first; everyone at his location, the owner and an admin too; withdrawn requests are not listed'
);
select is(
  (select row(x ->> 'total', x ->> 'waiting', jsonb_array_length(x -> 'requests'))::text
   from public.time_off_requests_service(tests.user('tq:mk'), tests.id('tq'), 'open') x),
  row('1', '1', 1)::text, 'Open is what waits');
select is(
  (select array_agg(r ->> 'employee_name' order by r ->> 'employee_name') from jsonb_array_elements(
     public.time_off_requests_service(tests.user('tq:mb'), tests.id('tq')) -> 'requests') r),
  array['Ali Person', 'Olcay Owner'], 'Besiktas''s manager lists only the people who work there');
select is(
  (select array_agg(r ->> 'employee_name' order by r ->> 'employee_name') from jsonb_array_elements(
     public.time_off_requests_service(tests.user('tq:mia'), tests.id('tq')) -> 'requests') r
   where r ->> 'employee_id' = tests.id('tq:mia')::text),
  null, 'Mia does not list her own request');
select is(
  (select array_agg(r ->> 'employee_name' order by r ->> 'employee_name') from jsonb_array_elements(
     public.time_off_requests_service(tests.user('tq:ad'), tests.id('tq'), target_location_id => tests.id('tq:B')) -> 'requests') r),
  array['Ali Person', 'Olcay Owner'], 'a location narrows it to who works there');
select is(
  (select array_agg(r ->> 'employee_name') from jsonb_array_elements(
     public.time_off_requests_service(tests.user('tq:ad'), tests.id('tq'), target_search => 'cem') -> 'requests') r),
  array['Cem Person'], 'a search finds a name');
select is(
  (select row(x ->> 'total', jsonb_array_length(x -> 'requests'))::text
   from public.time_off_requests_service(tests.user('tq:mk'), tests.id('tq'), target_page => 2, target_page_size => 25) x),
  row('8', 0)::text, 'a page past the end is empty, the total stays');
select is(
  (select (x -> 'requests' -> 0 ->> 'id') || ' ' || (x ->> 'total')
   from public.time_off_requests_service(tests.user('tq:mk'), tests.id('tq'), target_request_id => (select value from fixture where key = 'cem')) x),
  (select value::text from fixture where key = 'cem') || ' 1', 'one request by its id, for a link');
-- Three requests start on the same day; their order among themselves is the id's.
select is(
  (select (array_agg(r.value ->> 'employee_name' order by r.ordinality))[1:4]
     || (array_agg(r.value ->> 'employee_name' order by r.ordinality desc))[1:1]
   from jsonb_array_elements(
     public.time_off_requests_service(tests.user('tq:mk'), tests.id('tq'), target_sort => 'starts') -> 'requests') with ordinality r),
  array['Dor Person', 'Bea Person', 'Ali Person', 'Cem Person', 'Eve Person'],
  'sorted by start, the soonest first');
select is(pg_temp.refusal($$select public.time_off_requests_service(tests.user('tq:mk'), tests.id('tq'), target_sort => 'name')$$),
  '22023 time_off.invalid', 'an unknown sort is refused');
select is(pg_temp.refusal($$select public.time_off_requests_service(tests.user('tq:bea'), tests.id('tq'))$$),
  '42501 authz.missing_permission', 'an employee has no such list');

select is(tests.unlisted_notices(tests.id('tq'), array(select id from checked_notices)), '{}'::text[],
  'every time off notice written here is in its recipient''s choices (BILDIRIM-12)');

select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- EKRAN-02 A3: the time-off rules of Requests and what its list reads.
--   R2-13  one decision tells each person once.
--   R2-45  the employee hears how it was decided.
--   R2-23  a shortening tells everybody who approved; after the system's
--          approval, the managers who could decide.
--   R2-53  ...and does not say the person is back on the schedule.
--   R2-42  a request the employee withdrew reads as withdrawn.
--   R2-52  hours the system gave back read apart from the employee's own cancellation.
--   K-S2   a manager missing a document reads Requests but decides nothing.
--   K-S3   seeing time off comes with deciding it: no "View" level of its own.
--   BL-411 who is not a member hears so before a request is looked up.
--   BL-507 a request the deadline job cannot close leaves a record.
--   BL-506 the deadline job's pass bound is a parameter.
--   R2-55  a malformed period id is a bad request (22023), not a server error.

select tests.world('ra');
select tests.person('ra', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('ra', 'hande', 'manager', array['K'], array['cook']);
select tests.person('ra', 'nur', 'manager', array['K'], array['cook']);
select tests.person('ra', 'mehmet', 'manager', array['B'], array['cook']);
select tests.person('ra', 'zeynep', 'admin', array['K'], array['cook']);
select tests.person('ra', 'ali', 'employee', array['K'], array['cook']);
select tests.person('ra', 'veli', 'employee', array['K', 'B'], array['cook']);

-- Ali works Wednesday of week 1 at Kadikoy.
select tests.publish_week('ra', 1, '[
  {"label": "ali-k", "person": "ali", "loc": "K", "job": "cook", "day": 2, "start": "10:00", "end": "16:00"}
]');

create function pg_temp.refusal(q text) returns text language plpgsql as $$
declare h text;
begin
  execute q;
  return 'allowed';
exception when others then
  get stacked diagnostics h = pg_exception_hint;
  return sqlstate || coalesce(' ' || nullif(h, ''), '');
end $$;
create function pg_temp.decide(who text, rid uuid, verdict text) returns jsonb language sql as $$
  select public.decide_time_off_service(tests.user('ra:' || who), tests.id('ra'), rid, verdict, '',
    app_private.time_off_impact(tests.id('ra'), rid) ->> 'fingerprint')
$$;
create function pg_temp.cancel(who text, rid uuid) returns uuid language sql as $$
  select (public.request_time_off_cancellation_service(tests.user('ra:' || who), tests.id('ra'), rid,
    (select r.revision from public.schedule_time_off_requests r where r.id = rid),
    (select jsonb_agg(jsonb_build_object('segment_id', s.id, 'starts_at', s.starts_at + interval '1 hour', 'ends_at', s.starts_at + interval '3 hours'))
     from public.schedule_time_off_segments s where s.request_id = rid),
    'Plans changed', gen_random_uuid()) ->> 'request_id')::uuid
$$;
create function pg_temp.shorten(who text, rid uuid, periods jsonb default null) returns jsonb language sql as $$
  select public.shorten_time_off_service(tests.user('ra:' || who), tests.id('ra'), rid,
    (select r.revision from public.schedule_time_off_requests r where r.id = rid),
    coalesce(periods, (select jsonb_agg(jsonb_build_object('segment_id', s.id, 'starts_at', s.starts_at + interval '10 hours',
      'ends_at', s.starts_at + interval '12 hours')) from public.schedule_time_off_segments s where s.request_id = rid)),
    '', gen_random_uuid())
$$;
-- Notices queued since the last mark, as (recipient, type, title, body).
create temporary table heard_before (id uuid primary key);
create function pg_temp.mark() returns void language sql as $$
  delete from heard_before;
  insert into heard_before select o.id from public.notification_outbox o where o.workspace_id = tests.id('ra');
$$;
create function pg_temp.heard() returns table (recipient uuid, type_key text, title text, body text) language sql as $$
  select r::uuid, o.type_key, o.payload ->> 'title', o.payload ->> 'body'
  from public.notification_outbox o, jsonb_array_elements_text(o.payload -> 'recipient_user_ids') r
  where o.workspace_id = tests.id('ra') and o.id not in (select id from heard_before)
$$;
create function pg_temp.times(who text) returns integer language sql as $$
  select count(*)::integer from pg_temp.heard() h where h.recipient = tests.user('ra:' || who)
$$;
create function pg_temp.row_of(who text, which text, rid uuid) returns jsonb language sql as $$
  select t from jsonb_array_elements(public.get_schedule_requests_service(
    tests.user('ra:' || who), tests.id('ra'), which, null, '', null, 100) -> 'time_off_requests') t
  where (t ->> 'id')::uuid = rid
$$;

-- 1. An approval that opens a shift (R2-13 a, R2-45) -----------------------------

select tests.remember('ra:ali:1', tests.leave('ra', 'ali', 1));
select pg_temp.mark();
select is(pg_temp.decide('ayse', tests.id('ra:ali:1'), 'approve') ->> 'status', 'approved',
  'Ayse approves Ali''s Wednesday; his Kadikoy shift opens');
select is(pg_temp.times('hande'), 1,
  'Hande, the other Kadikoy manager, hears once: not "approved" and "a shift is open" both');
select is((select array_agg(h.type_key) from pg_temp.heard() h where h.recipient = tests.user('ra:hande')), array['schedule.time_off.shifts_opened'],
  'and it is the notice that says which shift is open');
select is(pg_temp.times('ali'), 1, 'Ali hears once');
select is((select jsonb_agg(jsonb_build_object('title', h.title, 'body', h.body)) from pg_temp.heard() h where h.recipient = tests.user('ra:ali')),
  '[{"title": "Time off approved", "body": "Your time-off request was approved."}]'::jsonb,
  'and the notice says it was approved');

select tests.remember('ra:ali:5', tests.leave('ra', 'ali', 5));
select pg_temp.mark();
select is(pg_temp.decide('ayse', tests.id('ra:ali:5'), 'deny') ->> 'status', 'denied', 'Ayse declines another');
select is((select jsonb_agg(jsonb_build_object('title', h.title, 'body', h.body)) from pg_temp.heard() h where h.recipient = tests.user('ra:ali')),
  '[{"title": "Time off declined", "body": "Your time-off request was declined."}]'::jsonb,
  'Ali hears it was declined');

-- 2. An approved cancellation (R2-13 b) -------------------------------------------

select tests.remember('ra:ali:1:cancel', pg_temp.cancel('ali', tests.id('ra:ali:1')));
select pg_temp.mark();
select is(pg_temp.decide('ayse', tests.id('ra:ali:1:cancel'), 'approve') ->> 'status', 'approved',
  'Ayse approves Ali''s request to give back two hours');
select is(pg_temp.times('ali'), 1, 'Ali hears once, about his cancellation');
select is((select array_agg(h.title) from pg_temp.heard() h where h.recipient = tests.user('ra:ali')), array['Leave cancellation approved'],
  'which says it was approved');
select is(pg_temp.times('hande'), 1, 'Hande hears once');
select is((select array_agg(h.title) from pg_temp.heard() h where h.recipient = tests.user('ra:hande')), array['Leave cancellation approved'],
  'and is not told a second time that time off was approved');

-- 3. Revoking leave with a cancellation waiting (R2-13 c) --------------------------

select tests.remember('ra:ali:2', tests.leave('ra', 'ali', 2));
select pg_temp.decide('ayse', tests.id('ra:ali:2'), 'approve');
select tests.remember('ra:ali:2:cancel', pg_temp.cancel('ali', tests.id('ra:ali:2')));
select pg_temp.mark();
select is(public.revoke_time_off_service(tests.user('ra:ayse'), tests.id('ra'), tests.id('ra:ali:2'),
    (select r.revision from public.schedule_time_off_requests r where r.id = tests.id('ra:ali:2')), 'Short staffed') ->> 'status',
  'revoked', 'Ayse revokes Ali''s week-2 leave while his cancellation waits');
select is(pg_temp.times('ali'), 1, 'Ali hears once');
select is((select array_agg(h.title) from pg_temp.heard() h where h.recipient = tests.user('ra:ali')), array['Time off revoked'],
  'that his time off was revoked');
select is(pg_temp.times('hande'), 1, 'Hande hears once');

-- 4. Shortening after two approvals (R2-23, R2-53) ---------------------------------

select tests.remember('ra:veli:1', tests.leave('ra', 'veli', 1));
select is(pg_temp.decide('ayse', tests.id('ra:veli:1'), 'approve') ->> 'final', 'false', 'Ayse approves for Kadikoy');
select is(pg_temp.decide('mehmet', tests.id('ra:veli:1'), 'approve') ->> 'status', 'approved', 'Mehmet''s approval for Besiktas settles it');
select pg_temp.mark();
select is(pg_temp.shorten('hande', tests.id('ra:veli:1')) ->> 'status', 'approved', 'Hande gives back two hours of it');
select is(
  (select array_agg(h.recipient order by h.recipient) from pg_temp.heard() h where h.type_key = 'requests.time_off.shortened' and h.recipient <> tests.user('ra:veli')),
  (select array_agg(x order by x) from unnest(array[tests.user('ra:ayse'), tests.user('ra:mehmet')]) x),
  'both managers who approved it hear, not only the last one');
select ok((select bool_and(h.body like '% is no longer time off.') from pg_temp.heard() h
    where h.type_key = 'requests.time_off.shortened' and h.recipient = tests.user('ra:ayse')),
  'and are told the hours are no longer time off, not that Veli is back on the schedule');

-- Approved by the system: the managers who could decide hear.
select tests.remember('ra:ali:3', tests.leave('ra', 'ali', 3));
select app_private.time_off_finalize(tests.id('ra'), tests.id('ra:ali:3'), 'approve', null, 'All deciding locations approved', false);
select pg_temp.mark();
select pg_temp.shorten('hande', tests.id('ra:ali:3'));
select is(
  (select array_agg(h.recipient order by h.recipient) from pg_temp.heard() h where h.type_key = 'requests.time_off.shortened' and h.recipient <> tests.user('ra:ali')),
  (select array_agg(x order by x) from unnest(array[tests.user('ra:ayse'), tests.user('ra:nur')]) x),
  'when the system approved it, the Kadikoy managers who could decide it hear (Hande shortened it herself)');

-- 5. What the list reads (R2-42, R2-52) ---------------------------------------------

select tests.remember('ra:ali:4', tests.leave('ra', 'ali', 4));
select public.employee_request_action_service(tests.user('ra:ali'), tests.id('ra'), tests.id('ra:ali:4'), 'time_off', 'cancel',
  (select r.revision from public.schedule_time_off_requests r where r.id = tests.id('ra:ali:4')));
select is(pg_temp.row_of('ayse', 'closed', tests.id('ra:ali:4')) -> 'withdrawn', 'true'::jsonb,
  'the request Ali withdrew reads as withdrawn');
select is(pg_temp.row_of('ayse', 'closed', tests.id('ra:ali:2')) -> 'withdrawn', 'false'::jsonb,
  'the leave Ayse revoked does not');
select is(pg_temp.row_of('ayse', 'closed',
    (select l.request_id from public.time_off_cancellation_links l where l.parent_request_id = tests.id('ra:ali:3'))) -> 'shortened',
  'true'::jsonb, 'the hours Hande gave back read as the system''s shortening');
select is(pg_temp.row_of('ayse', 'closed', tests.id('ra:ali:1:cancel')) -> 'shortened', 'false'::jsonb,
  'Ali''s own cancellation does not');

-- 6. Malformed ids and who hears first (R2-55, BL-411) ------------------------------

select is(pg_temp.refusal(format($$select pg_temp.shorten('hande', %L, '[{"segment_id": "nope", "starts_at": "2099-01-01T10:00:00Z", "ends_at": "2099-01-01T11:00:00Z"}]')$$,
    tests.id('ra:veli:1'))), '22023', 'a malformed period id in a shortening is a bad request');
select is(pg_temp.refusal(format($$select public.request_time_off_cancellation_service(%L, %L, %L,
    (select r.revision from public.schedule_time_off_requests r where r.id = %L),
    '[{"segment_id": "nope", "starts_at": "2099-01-01T10:00:00Z", "ends_at": "2099-01-01T11:00:00Z"}]', '', gen_random_uuid())$$,
    tests.user('ra:veli'), tests.id('ra'), tests.id('ra:veli:1'), tests.id('ra:veli:1'))), '22023',
  'so it is in a cancellation');

select tests.world('rx');
select is(pg_temp.refusal(format($$select public.decide_time_off_service(%L, %L, gen_random_uuid(), 'approve', '', '')$$,
    tests.user('rx:owner'), tests.id('ra'))), '42501 authz.not_member',
  'somebody of another workspace deciding an unknown request hears they are not a member');
select is(pg_temp.refusal(format($$select public.decide_time_off_service(%L, %L, %L, 'approve', '', '')$$,
    tests.user('rx:owner'), tests.id('ra'), tests.id('ra:ali:5'))), '42501 authz.not_member',
  'the same as for a request that exists');
select is(pg_temp.refusal(format($$select public.revoke_time_off_service(%L, %L, gen_random_uuid(), 1, 'x')$$,
    tests.user('rx:owner'), tests.id('ra'))), '42501 authz.not_member', 'revoking an unknown one too');
select is(pg_temp.refusal(format($$select public.shorten_time_off_service(%L, %L, gen_random_uuid(), 1, '[]', '', gen_random_uuid())$$,
    tests.user('rx:owner'), tests.id('ra'))), '42501 authz.not_member', 'and shortening one');
select is(pg_temp.refusal(format($$select public.decide_time_off_service(%L, %L, gen_random_uuid(), 'approve', '', '')$$,
    tests.user('ra:ayse'), tests.id('ra'))), '42501 authz.out_of_scope', 'a member deciding an unknown request hears it is out of scope');

-- 7. Seeing time off comes with deciding it (K-S3) ------------------------------------

select is((select a.permission_key from app_private.authz_actions a where a.key = 'requests.read'),
  'schedule.time_off_requests.manage', 'reading Requests'' time off asks for the permission to decide it');
select is(pg_temp.refusal(format($$select public.save_workspace_role_service(%L, %L, null, 'Shift lead', '', 'manager',
    array['workspace.read', 'schedule.read', 'schedule.time_off_requests.read']); set constraints all immediate$$,
    tests.user('ra:owner'), tests.id('ra'))), '22023', 'a role cannot be given time off to view alone');
select lives_ok(format($$select public.save_workspace_role_service(%L, %L, null, 'Floor lead', '', 'manager',
    array['workspace.read', 'schedule.read', 'schedule.time_off_requests.read', 'schedule.time_off_requests.manage']); set constraints all immediate$$,
    tests.user('ra:owner'), tests.id('ra')), 'with deciding, it can');
select is((select count(*)::integer from public.workspace_role_permissions g
    where g.permission_key = 'schedule.time_off_requests.read'
      and not exists (select 1 from public.workspace_role_permissions m where m.role_id = g.role_id
                      and m.permission_key = 'schedule.time_off_requests.manage')), 0,
  'no role anywhere views time off without deciding it');

-- 8. The deadline job (BL-507, BL-506) ---------------------------------------------

-- Two of Veli's requests are past their deadline and come first in the queue;
-- closing the first one fails.
select tests.remember('ra:veli:7', tests.leave('ra', 'veli', 7));
select tests.remember('ra:veli:8', tests.leave('ra', 'veli', 8));
update public.schedule_time_off_requests set decide_by = '2000-01-01T00:00:00Z' where id = tests.id('ra:veli:7');
update public.schedule_time_off_requests set decide_by = '2000-01-01T00:01:00Z' where id = tests.id('ra:veli:8');
create function pg_temp.break_one() returns trigger language plpgsql as $$
begin
  if new.request_id = tests.id('ra:veli:7') then raise exception 'broken on purpose' using errcode = 'XX001'; end if;
  return new;
end $$;
create trigger break_one before insert on public.schedule_time_off_events for each row execute function pg_temp.break_one();
select app_private.time_off_sweep(1);
select is((select status::text from public.schedule_time_off_requests where id = tests.id('ra:veli:7')), 'pending',
  'the request the job could not close stays waiting');
select is((select jsonb_build_object('sqlstate', f.sqlstate, 'message', f.message, 'attempts', f.attempts)
    from app_private.time_off_sweep_failures f where f.request_id = tests.id('ra:veli:7')),
  '{"sqlstate": "XX001", "message": "broken on purpose", "attempts": 1}'::jsonb, 'and leaves a record of why');
select is((select status::text from public.schedule_time_off_requests where id = tests.id('ra:veli:8')), 'pending',
  'a pass bounded to one request leaves the next for the next pass');
select app_private.time_off_sweep(1);
select is((select f.attempts from app_private.time_off_sweep_failures f where f.request_id = tests.id('ra:veli:7')), 2,
  'a second failure counts on the same record');
drop trigger break_one on public.schedule_time_off_events;
select app_private.time_off_sweep(2);
select is((select array_agg(status::text order by id) from public.schedule_time_off_requests
    where id in (tests.id('ra:veli:7'), tests.id('ra:veli:8'))), array['denied', 'denied'],
  'once it can, the job closes both');
set local role authenticated;
select throws_ok($$select * from app_private.time_off_sweep_failures$$, '42501', null, 'a signed-in browser cannot read the record');
reset role;

-- 9. A manager missing a document (K-S2) --------------------------------------------

create temporary table required_document (id uuid, preview jsonb);
insert into required_document (id)
select public.save_document_type_lifecycle_service(tests.user('ra:owner'), tests.id('ra'), null, null, jsonb_build_object(
  'title', 'Food handler card', 'description', 'Card', 'requires_review', true, 'accepted_formats', array['pdf'],
  'tracks_expiry', false, 'expiry_warning_days', 30,
  'lifecycle_settings', jsonb_build_object('mode', 'conditional', 'assignment_scope', 'all_active',
    'target', jsonb_build_object('operator', 'and', 'location_ids', '[]'::jsonb, 'department_ids', '[]'::jsonb,
      'job_ids', '[]'::jsonb, 'employee_ids', '[]'::jsonb),
    'period_days', 7, 'suspend_on_overdue', true, 'extra_fields', '[]'::jsonb)));
update required_document set preview = public.preview_document_publication_service(tests.user('ra:owner'), tests.id('ra'), id);
select public.set_document_publication_service(tests.user('ra:owner'), tests.id('ra'), id,
  (preview ->> 'revision')::integer, (preview ->> 'publication_revision')::integer, preview ->> 'preview_token', 'Publish', 'published')
from required_document;
select tests.settle();
-- ponytail: nothing in the product moves the clock; the deadline is set by hand.
update public.employee_onboarding_requirements
set lifecycle_exempt = false, deadline_at = now() - interval '1 day'
where source_id = (select id from required_document) and lifecycle_user_id = tests.user('ra:nur');
select ok(app_private.document_actor_blocked(tests.user('ra:nur'), tests.id('ra')), 'Nur, a Kadikoy manager, misses the document');

select tests.remember('ra:ali:6', tests.leave('ra', 'ali', 6));
select ok(pg_temp.row_of('nur', 'needs_review', tests.id('ra:ali:6')) is not null, 'Nur reads Ali''s waiting request');
select ok(pg_temp.row_of('nur', 'closed', tests.id('ra:ali:5')) is not null, 'and his closed one');
select is(pg_temp.refusal(format('select pg_temp.decide(%L, %L, %L)', 'nur', tests.id('ra:ali:6'), 'approve')),
  '42501 authz.document_blocked', 'but cannot decide it');
select is(pg_temp.refusal(format($$select public.revoke_time_off_service(%L, %L, %L, %s, 'x')$$, tests.user('ra:nur'), tests.id('ra'),
    tests.id('ra:ali:3'), (select r.revision from public.schedule_time_off_requests r where r.id = tests.id('ra:ali:3')))),
  '42501 authz.document_blocked', 'nor revoke approved time off');
select is(app_private.authz_reason(tests.user('ra:nur'), tests.id('ra'), 'exchange.read', array[tests.id('ra:K')]), null,
  'Nur reads Kadikoy''s shift changes');
select is(app_private.authz_reason(tests.user('ra:nur'), tests.id('ra'), 'exchange.approve', array[tests.id('ra:K')]), 'document_blocked',
  'but decides none');

select * from finish();
rollback;

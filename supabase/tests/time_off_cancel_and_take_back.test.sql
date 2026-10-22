begin;
create extension if not exists pgtap with schema extensions;
select plan(64);

-- Time off rebuild D4 (KARARLAR S-239 (4), (6), (1)): approved time off is cancelled by a request the
-- employee sends and one manager answers, or taken back (revoked) by whoever may answer it, with a note.
-- Either way only what is left of it goes (from the answer on, or from its start when it has not started):
-- app_private.time_off_cut. Shifts an approval opened stay open. One cancellation waits per time off; it
-- reads as expired once the time off is over.
--
-- World tc: Kadikoy (K) and Besiktas (B), both Istanbul.
--   ali - employee at K and B          bea, cem, dor, eve, fay - employees at K
--   mk  - manager at K                 mb  - manager at B
--   mia - manager at K who also works (manager+employee)
--   ad  - admin

select tests.world('tc');
select tests.person('tc', 'ali', 'employee', array['K', 'B'], array['cook']);
select tests.person('tc', 'bea', 'employee', array['K'], array['cook']);
select tests.person('tc', 'cem', 'employee', array['K'], array['cook']);
select tests.person('tc', 'dor', 'employee', array['K'], array['cook']);
select tests.person('tc', 'eve', 'employee', array['K'], array['cook']);
select tests.person('tc', 'fay', 'employee', array['K'], array['cook']);
select tests.person('tc', 'mk', 'manager', array['K'], array['general manager']);
select tests.person('tc', 'mb', 'manager', array['B'], array['general manager']);
select tests.person('tc', 'mia', 'manager+employee', array['K'], array['general manager', 'cook']);
select tests.person('tc', 'ad', 'admin', array['K'], array['general manager']);
select tests.settle();

select tests.publish_week('tc', 0, '[
  {"label": "ali-k-tue", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"},
  {"label": "ali-b-wed", "person": "ali", "loc": "B", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"}
]');
create temporary table checked_notices as select n.id from public.person_notifications n where n.workspace_id = tests.id('tc');

create temporary table fixture (key text primary key, value uuid);
create function pg_temp.ask(person text, first_day date, last_day date)
returns uuid
language sql
as $$
  select (public.ask_time_off_service(tests.user('tc:' || person), tests.id('tc'), 'vacation', first_day, last_day, true,
    null, null, 'Family visit', 'Europe/Istanbul', gen_random_uuid()) ->> 'id')::uuid
$$;
create function pg_temp.req(label text) returns public.time_off_requests language sql as $$
  select r from public.time_off_requests r where r.id = (select value from fixture where key = label)
$$;
create function pg_temp.approve(person text, label text) returns jsonb language sql as $$
  select public.answer_time_off_service(tests.user('tc:' || person), tests.id('tc'), (select value from fixture where key = label),
    'approve', null, (pg_temp.req(label)).revision,
    app_private.time_off_shifts_print(app_private.time_off_shifts_at_stake(pg_temp.req(label))))
$$;
-- The employee asks to cancel the time off under `label`, on what they read.
create function pg_temp.ask_cancel(person text, label text, note text default null, revision integer default null,
  request_key uuid default null)
returns jsonb
language sql
as $$
  select public.ask_time_off_cancellation_service(tests.user('tc:' || person), tests.id('tc'), (select value from fixture where key = label),
    note, coalesce(revision, (pg_temp.req(label)).revision), coalesce(request_key, gen_random_uuid()))
$$;
-- The cancellation waiting (or last asked) on the time off under `label`.
create function pg_temp.cancel_of(label text) returns public.time_off_requests language sql as $$
  select c from public.time_off_requests c
  where c.kind = 'cancel' and c.cancels_id = (select value from fixture where key = label)
  order by c.created_at desc, c.id desc limit 1
$$;
create function pg_temp.answer_cancel(person text, label text, verdict text, note text default null)
returns jsonb
language sql
as $$
  select public.answer_time_off_service(tests.user('tc:' || person), tests.id('tc'), (pg_temp.cancel_of(label)).id,
    verdict, note, (pg_temp.cancel_of(label)).revision, null)
$$;
create function pg_temp.take_back(person text, label text, note text default 'Short-staffed that week')
returns jsonb
language sql
as $$
  select public.take_back_time_off_service(tests.user('tc:' || person), tests.id('tc'), (select value from fixture where key = label),
    note, (pg_temp.req(label)).revision)
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
-- Who got a notice of this type about this subject, by label, sorted.
create function pg_temp.told(notice text, subject uuid)
returns text[]
language sql
as $$
  select coalesce(array_agg(i.label order by i.label), '{}')
  from public.person_notifications n
  join tests.ids i on i.id = n.user_id and i.label like 'tc:%:user'
  where n.type_key = told.notice and n.subject_type = 'time_off' and n.subject_id = told.subject
$$;
create function pg_temp.open_cards(subject uuid) returns integer language sql as $$
  select count(*)::integer from public.person_notifications n
  where n.type_key = 'time_off.requested' and n.subject_id = subject and n.resolved_at is null
$$;
create function pg_temp.spans(person text) returns text language sql as $$
  select coalesce(string_agg(s.span::text, ',' order by lower(s.span)), '')
  from app_private.leave_spans(tests.id('tc'), array[tests.id('tc:' || person)], tstzrange(null, null)) s
$$;

-- 1. Ali's Tuesday and Wednesday are approved; both his shifts go to open shifts.
insert into fixture values ('ali', pg_temp.ask('ali', tests.week(0) + 1, tests.week(0) + 2));
select is(pg_temp.approve('mk', 'ali') ->> 'shifts_opened', '2', 'Ali''s time off is approved and opens his two shifts');

-- 2. He asks to cancel it, with a note. It waits; his time off stays as it is until somebody answers.
select is(pg_temp.refusal($$select pg_temp.ask_cancel('ali', 'ali', revision => 1)$$), 'PT409 time_off.changed',
  'asking on an old picture of the time off is refused');
select is(pg_temp.refusal($$select public.ask_time_off_cancellation_service(tests.user('tc:ali'), tests.id('tc'),
    (select value from fixture where key = 'ali'), null, (pg_temp.req('ali')).revision, null)$$),
  '22023 time_off.invalid', 'a request key is required');
select is(pg_temp.refusal($$select pg_temp.ask_cancel('bea', 'ali')$$), '42501 authz.out_of_scope',
  'somebody else does not ask to cancel his time off');
select is(pg_temp.refusal($$select pg_temp.ask_cancel('ali', 'ali', repeat('x', 1001))$$), '22023 time_off.invalid',
  'a note is at most 1000 characters');
insert into fixture values ('ali:key', gen_random_uuid());
select is(
  (select row(x ->> 'status', x -> 'cancellation' ->> 'status', x -> 'cancellation' ->> 'note')::text
   from pg_temp.ask_cancel('ali', 'ali', '  Plans changed  ', request_key => (select value from fixture where key = 'ali:key')) x),
  row('approved', 'pending', 'Plans changed')::text,
  'the time off stays approved and carries the cancellation waiting');
select is(
  (select row(c.kind, c.status, c.starts_at = r.starts_at, c.ends_at = r.ends_at, c.kind_of_leave, isempty(c.effective), c.created_by)::text
   from pg_temp.cancel_of('ali') c, pg_temp.req('ali') r),
  row('cancel', 'pending', true, true, 'vacation', true, tests.user('tc:ali'))::text,
  'the cancellation is a row of its own: the same range, no time off of its own');
select is(
  (pg_temp.ask_cancel('ali', 'ali', 'Plans changed', request_key => (select value from fixture where key = 'ali:key')) -> 'cancellation' ->> 'id'),
  (pg_temp.cancel_of('ali')).id::text, 'sending the same request key again gives back the same cancellation');
select is(pg_temp.refusal($$select pg_temp.ask_cancel('ali', 'ali', 'Other words', request_key => (select value from fixture where key = 'ali:key'))$$),
  'PT409 time_off.key_reused', 'the same key with another note is refused');
select is(pg_temp.refusal($$select pg_temp.ask_cancel('ali', 'ali')$$), 'PT409 time_off.cancel_pending',
  'one cancellation waits at a time');
select is(pg_temp.refusal($$insert into public.time_off_requests (workspace_id, employee_id, kind, cancels_id, starts_at, ends_at,
    all_day, time_timezone, kind_of_leave, created_by, client_key)
  select r.workspace_id, r.employee_id, 'cancel', r.id, r.starts_at, r.ends_at, r.all_day, r.time_timezone, r.kind_of_leave,
    r.created_by, gen_random_uuid() from pg_temp.req('ali') r$$),
  '23505 ', 'and the table keeps it so');
select is(pg_temp.told('time_off.requested', (pg_temp.cancel_of('ali')).id), array['tc:mb:user', 'tc:mia:user', 'tc:mk:user'],
  'whoever may answer hears of it, in S-169''s order');
select is(
  (select row(n.title, n.body, n.url, n.data ->> 'kind')::text from public.person_notifications n
   where n.type_key = 'time_off.requested' and n.subject_id = (pg_temp.cancel_of('ali')).id and n.user_id = tests.user('tc:mk')),
  row('Ali Person asks to cancel time off', app_private.time_off_days_label(pg_temp.req('ali')) || ' · Plans changed',
    '/app/schedule/requests?type=time_off&request=' || (pg_temp.cancel_of('ali')).id, 'cancel')::text,
  'the card opens the cancellation in Requests → Time off');
select is(
  (select array_agg(r ->> 'kind' order by r ->> 'kind') from jsonb_array_elements(public.my_time_off_service(tests.user('tc:ali'), tests.id('tc')) -> 'requests') r),
  array['leave'], 'his own list shows the time off once, not the cancellation beside it');
select is(
  (select row(r ->> 'kind', r ->> 'status', r ->> 'cancels_id', r ->> 'employee_name')::text
   from jsonb_array_elements(public.time_off_requests_service(tests.user('tc:mk'), tests.id('tc'), target_view => 'open') -> 'requests') r),
  row('cancel', 'pending', (select value from fixture where key = 'ali')::text, 'Ali Person')::text,
  'a manager''s list shows the cancellation waiting');
select is((public.time_off_requests_service(tests.user('tc:mk'), tests.id('tc')) ->> 'waiting'), '1', 'and counts it as waiting');

-- 3. Who answers a cancellation: as for the time off itself.
select is(pg_temp.refusal($$select pg_temp.answer_cancel('bea', 'ali', 'approve')$$), '42501 authz.missing_permission',
  'an employee does not answer it');
select is(pg_temp.refusal($$select pg_temp.answer_cancel('ali', 'ali', 'approve')$$), '42501 authz.missing_permission',
  'nor does he answer his own');

-- 4. Besiktas's manager declines it: the time off stays as it was, and Ali hears so.
select is(
  (select row(x ->> 'kind', x ->> 'status', x ->> 'decision_note')::text from pg_temp.answer_cancel('mb', 'ali', 'decline', 'We need you') x),
  row('cancel', 'declined', 'We need you')::text, 'a manager declines the cancellation');
select is(
  (select row(r.status, r.effective = tstzmultirange(tstzrange(r.starts_at, r.ends_at, '[)')))::text from pg_temp.req('ali') r),
  row('approved', true)::text, 'the time off stays, all of it');
select is(pg_temp.open_cards((pg_temp.cancel_of('ali')).id), 0, 'the cards asking for an answer close');
select is(
  (select row(n.title, n.body, n.data ->> 'outcome', n.data ->> 'kind')::text from public.person_notifications n
   where n.type_key = 'time_off.decided' and n.subject_id = (pg_temp.cancel_of('ali')).id and n.user_id = tests.user('tc:ali')),
  row('Your request to cancel time off ' || app_private.time_off_days_label(pg_temp.req('ali')) || ' is declined',
    'We need you', 'declined', 'cancel')::text,
  'Ali hears the answer');
select is(pg_temp.told('time_off.decided', (pg_temp.cancel_of('ali')).id), array['tc:ali:user'], 'and only he does');
select is(public.my_time_off_service(tests.user('tc:ali'), tests.id('tc')) -> 'requests' -> 0 -> 'cancellation' ->> 'status',
  'declined', 'his list says the cancellation was declined');

-- 5. He asks again and Kadikoy's manager approves: nothing of it had started, so all of it goes. The shifts
-- the approval opened stay open.
select pg_temp.ask_cancel('ali', 'ali');
select is(pg_temp.answer_cancel('mk', 'ali', 'approve') ->> 'status', 'approved', 'a manager approves the cancellation');
select is(
  (select row(r.status, isempty(r.effective), r.ended_by, r.ended_at is not null)::text from pg_temp.req('ali') r),
  row('cancelled', true, tests.user('tc:mk'), true)::text, 'the time off is cancelled, none of it left');
select is(
  array(select s.employee_id is null from public.schedule_published_shifts s
        where s.id in (tests.id('tc:shift:ali-k-tue'), tests.id('tc:shift:ali-b-wed'))),
  array[true, true], 'his shifts stay open shifts');
select is(pg_temp.spans('ali'), '', 'leave_spans has no time off of his');
select is(
  (select row(r ->> 'status', r ->> 'used_until', r -> 'cancellation' ->> 'status')::text
   from jsonb_array_elements(public.my_time_off_service(tests.user('tc:ali'), tests.id('tc')) -> 'requests') r),
  row('cancelled', null, 'approved')::text, 'his list reads it cancelled, nothing used');
select is(
  (select row(n.title, n.data ->> 'outcome')::text from public.person_notifications n
   where n.type_key = 'time_off.decided' and n.subject_id = (pg_temp.cancel_of('ali')).id and n.user_id = tests.user('tc:ali')),
  row('Your time off ' || app_private.time_off_days_label(pg_temp.req('ali')) || ' is cancelled', 'approved')::text,
  'Ali hears his time off is cancelled');
select is(pg_temp.refusal($$select pg_temp.ask_cancel('ali', 'ali')$$), 'PT409 time_off.not_approved',
  'cancelled time off has nothing more to cancel');

-- 6. Time off that started: only the rest goes; what was used stays, and so does the status's word.
-- ponytail: nothing in the product moves the clock; Bea's approved time off is moved to have started a day ago.
insert into fixture values ('bea', pg_temp.ask('bea', tests.week(1) + 1, tests.week(1) + 3));
select pg_temp.approve('mk', 'bea');
update public.time_off_requests
set starts_at = now() - interval '1 day', ends_at = now() + interval '2 days',
    effective = tstzmultirange(tstzrange(now() - interval '1 day', now() + interval '2 days', '[)'))
where id = (select value from fixture where key = 'bea');
select is(pg_temp.ask_cancel('bea', 'bea') -> 'cancellation' ->> 'status', 'pending', 'time off that started can be cancelled too');
select is(
  (select row(r ->> 'kind', r ->> 'status')::text
   from jsonb_array_elements(public.time_off_requests_service(tests.user('tc:mk'), tests.id('tc'), target_view => 'open') -> 'requests') r),
  row('cancel', 'pending')::text, 'its cancellation waits even though the time off started');
select pg_temp.answer_cancel('mia', 'bea', 'approve');
select is(
  (select row(r.status, r.effective = tstzmultirange(tstzrange(now() - interval '1 day', now(), '[)')))::text from pg_temp.req('bea') r),
  row('cancelled', true)::text, 'the cancelled time off keeps the day used, up to the answer');
select is(pg_temp.spans('bea'), tstzrange(now() - interval '1 day', now(), '[)')::text, 'leave_spans reads the day used');
select is(
  (select r ->> 'used_until' from jsonb_array_elements(public.my_time_off_service(tests.user('tc:bea'), tests.id('tc')) -> 'requests') r),
  to_jsonb(now()) #>> '{}', 'her list says until when she used it');

-- 7. A cancellation reads as expired once the time off is over, and an answer then writes it.
-- ponytail: Cem's approved time off and his cancellation are moved into the past.
insert into fixture values ('cem', pg_temp.ask('cem', tests.week(1) + 1, tests.week(1) + 1));
select pg_temp.approve('mk', 'cem');
select pg_temp.ask_cancel('cem', 'cem');
update public.time_off_requests
set starts_at = now() - interval '3 days', ends_at = now() - interval '2 days',
    effective = case when kind = 'leave' then tstzmultirange(tstzrange(now() - interval '3 days', now() - interval '2 days', '[)')) else '{}' end
where id = (select value from fixture where key = 'cem') or cancels_id = (select value from fixture where key = 'cem');
select is(public.my_time_off_service(tests.user('tc:cem'), tests.id('tc')) -> 'requests' -> 0 -> 'cancellation' ->> 'status',
  'expired', 'the employee reads it expired');
select is(
  (select r ->> 'status' from jsonb_array_elements(public.time_off_requests_service(tests.user('tc:mk'), tests.id('tc')) -> 'requests') r
   where r ->> 'id' = (pg_temp.cancel_of('cem')).id::text),
  'expired', 'so does a manager');
select is(pg_temp.answer_cancel('mk', 'cem', 'approve') ->> 'status', 'expired', 'an answer then gets "expired" back');
select is(
  (select row(c.status, r.status, r.effective = tstzmultirange(tstzrange(now() - interval '3 days', now() - interval '2 days', '[)')))::text
   from pg_temp.cancel_of('cem') c, pg_temp.req('cem') r),
  row('expired', 'approved', true)::text, 'and writes it; the time off stays as it was');
select is(pg_temp.open_cards((pg_temp.cancel_of('cem')).id), 0, 'its cards close');
select is(pg_temp.refusal($$select pg_temp.ask_cancel('cem', 'cem')$$), 'PT409 time_off.ended',
  'time off that is over cannot be cancelled');

-- 8. A request still waiting is withdrawn, not cancelled; a cancellation waiting is withdrawn too.
insert into fixture values ('dor', pg_temp.ask('dor', tests.week(1) + 1, tests.week(1) + 2));
select is(pg_temp.refusal($$select pg_temp.ask_cancel('dor', 'dor')$$), 'PT409 time_off.not_approved',
  'a request waiting for an answer has nothing to cancel');
select pg_temp.approve('mk', 'dor');
select pg_temp.ask_cancel('dor', 'dor');
select is(
  public.withdraw_time_off_service(tests.user('tc:dor'), tests.id('tc'), (pg_temp.cancel_of('dor')).id, (pg_temp.cancel_of('dor')).revision) ->> 'status',
  'withdrawn', 'the employee withdraws the cancellation');
select is(
  (select row(c.status, r.status, pg_temp.open_cards(c.id))::text from pg_temp.cancel_of('dor') c, pg_temp.req('dor') r),
  row('withdrawn', 'approved', 0)::text, 'the time off stays approved and the cards close');
select is(public.my_time_off_service(tests.user('tc:dor'), tests.id('tc')) -> 'requests' -> 0 -> 'cancellation', 'null'::jsonb,
  'a withdrawn cancellation is not shown');

-- 9. Revoke: whoever may answer takes approved time off back, with a note. A cancellation waiting closes.
insert into fixture values ('eve', pg_temp.ask('eve', tests.week(1) + 1, tests.week(1) + 2));
select pg_temp.approve('mk', 'eve');
select pg_temp.ask_cancel('eve', 'eve');
select is(pg_temp.refusal($$select pg_temp.take_back('ad', 'eve', '   ')$$), '22023 time_off.note_required', 'a note is required');
select is(pg_temp.refusal($$select pg_temp.take_back('ad', 'eve', null)$$), '22023 time_off.note_required', 'a missing note too');
select is(pg_temp.refusal($$select pg_temp.take_back('bea', 'eve')$$), '42501 authz.missing_permission', 'an employee does not revoke');
select is(pg_temp.refusal($$select pg_temp.take_back('eve', 'eve')$$), '42501 authz.missing_permission', 'nor does the employee herself');
select is(pg_temp.refusal($$select pg_temp.take_back('mb', 'eve')$$), '42501 authz.out_of_scope',
  'a manager of a location she does not work at does not');
select is(pg_temp.refusal($$select public.take_back_time_off_service(tests.user('tc:ad'), tests.id('tc'),
    (select value from fixture where key = 'eve'), 'Short-staffed', 1)$$), 'PT409 time_off.changed',
  'revoking on an old picture of it is refused');
select is(
  (select row(x ->> 'status', x ->> 'ended_note', x ->> 'shifts_opened')::text from pg_temp.take_back('ad', 'eve', ' Short-staffed that week ') x),
  row('revoked', 'Short-staffed that week', '0')::text, 'an admin revokes it, with a note');
select is(
  (select row(r.status, isempty(r.effective), r.ended_by)::text from pg_temp.req('eve') r),
  row('revoked', true, tests.user('tc:ad'))::text, 'none of it had started: none of it is left');
select is(
  (select row(c.status, pg_temp.open_cards(c.id))::text from pg_temp.cancel_of('eve') c),
  row('withdrawn', 0)::text, 'her cancellation waiting closes, and its cards');
select is(pg_temp.told('time_off.decided', (select value from fixture where key = 'eve')),
  array['tc:eve:user', 'tc:mia:user', 'tc:mk:user'], 'she hears it, and so do the others who may answer');
select is(
  (select row(n.title, n.body, n.data ->> 'outcome')::text from public.person_notifications n
   where n.type_key = 'time_off.decided' and n.subject_id = (select value from fixture where key = 'eve')
     and n.user_id = tests.user('tc:eve') and n.data ->> 'outcome' = 'revoked'),
  row('Your time off ' || app_private.time_off_days_label(pg_temp.req('eve')) || ' was revoked', 'Short-staffed that week', 'revoked')::text,
  'with the note');
select is(pg_temp.refusal($$select pg_temp.take_back('mk', 'eve')$$), 'PT409 time_off.not_approved',
  'revoked time off is not revoked again');

-- 10. Revoking time off that started takes back only the rest; a manager of her location may. Shifts the
-- approval opened stay open.
insert into fixture values ('fay', pg_temp.ask('fay', tests.week(1) + 1, tests.week(1) + 3));
select pg_temp.approve('mk', 'fay');
-- ponytail: the clock is not moved; the time off is moved to have started half a day ago.
update public.time_off_requests
set starts_at = now() - interval '12 hours', ends_at = now() + interval '1 day',
    effective = tstzmultirange(tstzrange(now() - interval '12 hours', now() + interval '1 day', '[)'))
where id = (select value from fixture where key = 'fay');
select is(pg_temp.take_back('mia', 'fay') ->> 'status', 'revoked', 'a manager of her location revokes it');
select is(pg_temp.spans('fay'), tstzrange(now() - interval '12 hours', now(), '[)')::text,
  'what she used stays: leave_spans reads it up to the revoke');
select is(
  (select array_agg(s.employee_id is null) from public.schedule_published_shifts s
   where s.id in (tests.id('tc:shift:ali-k-tue'), tests.id('tc:shift:ali-b-wed'))),
  array[true, true], 'a revoke elsewhere gives no shift back either');

-- 11. Mia's own: she may not answer her cancellation, nor revoke her own time off.
insert into fixture values ('mia', pg_temp.ask('mia', tests.week(1) + 4, tests.week(1) + 4));
select pg_temp.approve('mk', 'mia');
select pg_temp.ask_cancel('mia', 'mia');
select is(pg_temp.refusal($$select pg_temp.answer_cancel('mia', 'mia', 'approve')$$), '42501 authz.rank',
  'nobody answers their own cancellation');
select is(pg_temp.refusal($$select pg_temp.take_back('mia', 'mia')$$), '42501 authz.rank',
  'nor revokes their own time off');

-- 12. time_off_cut takes a range out of what is left and takes the workspace's availability lock first.
select is(
  (select r.effective from app_private.time_off_cut((select value from fixture where key = 'dor'),
     tstzrange((pg_temp.req('dor')).starts_at + interval '6 hours', (pg_temp.req('dor')).starts_at + interval '18 hours', '[)')) r),
  tstzmultirange(tstzrange((pg_temp.req('dor')).starts_at, (pg_temp.req('dor')).starts_at + interval '6 hours', '[)'),
    tstzrange((pg_temp.req('dor')).starts_at + interval '18 hours', (pg_temp.req('dor')).ends_at, '[)')),
  'a cut in the middle leaves two pieces');
select ok(
  (select p.prosrc ~ 'public\.availability_lock_workspace\(' from pg_proc p
   where p.oid = 'app_private.time_off_cut(uuid, tstzrange)'::regprocedure),
  'the cut takes the workspace''s availability lock');
select ok(
  not has_function_privilege('authenticated', 'app_private.time_off_cut(uuid, tstzrange)', 'execute')
  and not has_function_privilege('authenticated', 'public.take_back_time_off_service(uuid, uuid, uuid, text, integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.ask_time_off_cancellation_service(uuid, uuid, uuid, text, integer, uuid)', 'execute'),
  'nobody signed in calls them directly');

select is(tests.unlisted_notices(tests.id('tc'), array(select id from checked_notices)), '{}'::text[],
  'every time off notice written here is in its recipient''s choices (BILDIRIM-12)');

select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- BL-910 (EKRAN-02 #108; ILKELER P07, KARARLAR "Takas… uygunluk" K-S5): the
-- reason a manager writes when declining an application is written for the
-- applicant ("Provide a reason visible to this employee"). Emre gives up his
-- Monday shift, Ali asks for it, Ayse declines with a reason. Ali reads the
-- reason; Emre hears that the request was declined, never why: not in his
-- notification, not in the case's history in Shift Hub.

select tests.world('rr');
select tests.person('rr', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('rr', 'emre', 'employee', array['K'], array['cook']);
select tests.person('rr', 'ali', 'employee', array['K'], array['cook']);
select tests.publish_week('rr', 1, '[
  {"label": "emre-k", "person": "emre", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}
]');
select tests.cover_case('rr', 'emre-k', 'emre', 'ali');

select public.shift_exchanges_command_service(tests.user('rr:ayse'), tests.id('rr'), jsonb_build_object(
  'action', 'reject', 'case_id', tests.id('rr:case:emre-k'), 'application_id', tests.id('rr:application:emre-k'),
  'expected_revision', (select revision from public.shift_exchange_cases where id = tests.id('rr:case:emre-k')),
  'reason', 'You were late twice this month'), gen_random_uuid());
select tests.settle();

create temporary table rejected on commit drop as
select payload ->> 'body' as body, r.recipient
from public.notification_outbox o
cross join lateral jsonb_array_elements_text(o.payload -> 'recipient_user_ids') as r(recipient)
where o.workspace_id = tests.id('rr') and o.subject_type = 'shift_exchange_cases'
  and o.subject_id = tests.id('rr:case:emre-k')::text and o.payload ->> 'request_action' = 'application_rejected';

select is((select body from rejected where recipient = tests.user('rr:ali')::text),
  'You were late twice this month', 'Ali, who applied, reads the manager''s reason');
select ok(exists(select 1 from rejected where recipient = tests.user('rr:emre')::text),
  'Emre, who gave the shift up, still hears the request was declined');
select is((select count(*)::integer from rejected where recipient = tests.user('rr:emre')::text and body like '%late twice%'), 0,
  'but Emre''s notification does not carry the reason');
select is((select count(*)::integer from rejected where body like '%late twice%'), 1,
  'the reason goes to the applicant alone');
select is((select body from rejected where recipient = tests.user('rr:emre')::text),
  'A request for your shift was declined. You are still responsible for this shift.',
  'Emre reads the general sentence');

-- The case's history, as each of them reads it in Shift Hub on the shift's day
-- (an employee's Shift Hub lists the days it shows).
create temporary table seen on commit drop as
with day as (select (offered_snapshot ->> 'date')::date as d from public.shift_exchange_cases where id = tests.id('rr:case:emre-k'))
select who, h ->> 'message' as message
from day cross join (values ('ali'), ('emre')) as people(who)
cross join lateral jsonb_array_elements(public.shift_exchanges_read_service(tests.user('rr:' || who), tests.id('rr'), false, day.d, day.d) -> 'cases') as c
cross join lateral jsonb_array_elements(c -> 'history') as h
where c ->> 'id' = tests.id('rr:case:emre-k')::text and h ->> 'action' = 'application_rejected';

select is((select message from seen where who = 'ali'), 'You were late twice this month',
  'Ali''s Shift Hub history keeps the reason');
select is((select message from seen where who = 'emre'), 'A request for your shift was declined. You are still responsible for this shift.',
  'Emre''s Shift Hub history says the request was declined, not why');

select * from finish();
rollback;

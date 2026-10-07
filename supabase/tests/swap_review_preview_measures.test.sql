begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- EKRAN-02 C2 (KARARLAR "Takas inceleme penceresi H2", uyarı kutuları; ILKELER
-- P11): the swap review's green box names what was measured on the shift where
-- a rule holds. The manager's decision preview asks the engine for it on both
-- sides. Ali (Kadikoy) and Deniz (Besiktas) swap Monday shifts; Ali also works
-- Sunday night at Kadikoy, so his rest before Deniz's shift is measured.

select tests.world('pm');
select tests.person('pm', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('pm', 'ali', 'employee', array['K', 'B'], array['cook']);
select tests.person('pm', 'deniz', 'employee', array['K', 'B'], array['cook']);
select tests.publish_week('pm', 1, '[
  {"label": "ali-sun", "person": "ali",   "loc": "K", "job": "cook", "day": 0, "start": "16:00", "end": "22:00"},
  {"label": "ali-k",   "person": "ali",   "loc": "K", "job": "cook", "day": 1, "start": "16:00", "end": "22:00"},
  {"label": "deniz-b", "person": "deniz", "loc": "B", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}
]');

create temporary table swap_case on commit drop as
select (public.shift_exchanges_command_service(tests.user('pm:ali'), tests.id('pm'),
  jsonb_build_object('action', 'create', 'kind', 'swap', 'shift_id', tests.id('pm:shift:ali-k'),
    'requested_shift_id', tests.id('pm:shift:deniz-b')), gen_random_uuid()) ->> 'case_id')::uuid as id;
select tests.settle();
select public.shift_exchanges_command_service(tests.user('pm:deniz'), tests.id('pm'),
  jsonb_build_object('action', 'accept', 'case_id', c.id, 'application_id', a.id, 'expected_revision', c.revision), gen_random_uuid())
from public.shift_exchange_cases c join public.shift_exchange_applications a on a.case_id = c.id
where c.id = (select id from swap_case);
select tests.settle();

create temporary table review on commit drop as
select public.shift_exchange_preview(tests.user('pm:ayse'), tests.id('pm'), c.id, a.id) as p
from public.shift_exchange_cases c join public.shift_exchange_applications a on a.case_id = c.id
where c.id = (select id from swap_case);

select ok((select p -> 'receiver' ? 'measures' from review), 'the preview measures the side of the one who takes the offered shift');
select ok((select p -> 'giver' ? 'measures' from review), 'and the side of the one who gives it');
select is((select (p -> 'giver' -> 'measures' ->> 'rest_gap_minutes')::integer from review), 660,
  'Ali''s rest before Deniz''s Monday shift is measured: Sunday 22:00 to Monday 09:00');
select is((select p -> 'giver' -> 'measures' -> 'rest_rule_minutes' from review),
  (select to_jsonb(minimum_rest_minutes) from public.workspace_scheduling_settings where workspace_id = tests.id('pm')),
  'with the workspace''s rest rule next to it');

select * from finish();
rollback;

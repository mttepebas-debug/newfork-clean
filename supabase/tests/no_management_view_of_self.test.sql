begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- ROL-CIFT slice 5.2 (design §4.6): nobody sees management's view of themselves. Dora manages Kadikoy
-- and works there; what Can, the other manager, writes about her reaches Can, never Dora, from any read.
-- Ada is an admin who works shifts too: her document waiting for review is in the owner's documents to
-- review (an admin's goes to the owner), never in hers. Her own side still shows her own document.

select tests.world('nm');
select tests.person('nm', 'dora', 'manager', array['K'], array['cook']);
select tests.person('nm', 'can', 'manager', array['K'], array['cook']);
select tests.person('nm', 'ada', 'admin', array['K'], array['cook']);

create function pg_temp.who(person text) returns uuid language sql as $$ select tests.user('nm:' || person) $$;

-- Can's Manager note about Dora: unavailable Monday evenings.
insert into public.manager_weekly_reminders (workspace_id, employee_id, preference, enabled, notes, revision, updated_by)
select tests.id('nm'), tests.id('nm:dora'),
  jsonb_build_object('days', jsonb_agg(jsonb_build_object('day', d, 'all_day', false,
    'ranges', case when d = 1 then '[{"start": "18:00", "end": "22:00"}]'::jsonb else '[]'::jsonb end) order by d)),
  true, array['', 'Leaves early on Mondays', '', '', '', '', ''], 1, pg_temp.who('can')
from generate_series(0, 6) d;

create function pg_temp.dora_row(actor text) returns jsonb language sql as $$
  select e from jsonb_array_elements(public.get_schedule_read_model_service(pg_temp.who(actor), tests.id('nm'),
    tests.week(1)) -> 'employees') e where (e ->> 'id')::uuid = tests.id('nm:dora')
$$;
create function pg_temp.notes_in(row_json jsonb) returns boolean language sql as $$
  select exists (select 1 from jsonb_array_elements(row_json -> 'weekly_availability') w
    where jsonb_typeof(w -> 'manager_notes') = 'array' or jsonb_array_length(coalesce(w -> 'note_intervals', '[]')) > 0)
$$;

-- The Schedule: Can reads the note on Dora's row; Dora, reading the same Schedule, does not.
select ok(pg_temp.notes_in(pg_temp.dora_row('can')), 'Can reads his note on Dora''s Schedule row');
select ok(pg_temp.dora_row('dora') is not null and not pg_temp.notes_in(pg_temp.dora_row('dora')),
  'Dora reads her Schedule row without it');

-- Availability: Can opens Dora's week with the note; Dora opens her own without it.
select is(jsonb_typeof(public.weekly_preferences_read_service(pg_temp.who('can'), tests.id('nm'), tests.id('nm:dora')) -> 'manager'),
  'object', 'Can''s view of Dora''s week has his note');
select isnt(jsonb_typeof(public.weekly_preferences_read_service(pg_temp.who('dora'), tests.id('nm'), tests.id('nm:dora')) -> 'manager'),
  'object', 'Dora''s view of her own week has none');

-- A document everybody hands in; Ada hands hers in and it waits for review.
create temporary table card (id uuid, preview jsonb);
insert into card (id)
select public.save_document_type_lifecycle_service(tests.user('nm:owner'), tests.id('nm'), null, null, jsonb_build_object(
  'title', 'Food handler card', 'description', 'Card', 'requires_review', true, 'accepted_formats', array['pdf'],
  'tracks_expiry', false, 'expiry_warning_days', 30,
  'lifecycle_settings', jsonb_build_object('mode', 'conditional', 'assignment_scope', 'all_active',
    'target', jsonb_build_object('operator', 'and', 'location_ids', '[]'::jsonb, 'department_ids', '[]'::jsonb,
      'job_ids', '[]'::jsonb, 'employee_ids', '[]'::jsonb),
    'period_days', 7, 'suspend_on_overdue', true, 'extra_fields', '[]'::jsonb)));
update card set preview = public.preview_document_publication_service(tests.user('nm:owner'), tests.id('nm'), id);
select public.set_document_publication_service(tests.user('nm:owner'), tests.id('nm'), id,
  (preview ->> 'revision')::integer, (preview ->> 'publication_revision')::integer, preview ->> 'preview_token', 'Publish', 'published')
from card;
select tests.settle();
create function pg_temp.req() returns public.employee_onboarding_requirements language sql as $$
  select r from public.employee_onboarding_requirements r
  where r.source_id = (select id from card) and r.employee_id = tests.id('nm:ada')
$$;
select public.save_employee_document_draft_file_service(pg_temp.who('ada'), (pg_temp.req()).id, (pg_temp.req()).lifecycle_revision,
  format('%s/%s/%s/%s.pdf', tests.id('nm'), tests.id('nm:ada'), (pg_temp.req()).id, gen_random_uuid()),
  'card.pdf', 'application/pdf', 100);
select public.submit_employee_document_lifecycle_service(pg_temp.who('ada'), (pg_temp.req()).id, (pg_temp.req()).lifecycle_revision,
  (select s.id from public.employee_document_submissions s where s.requirement_id = (pg_temp.req()).id and s.state = 'draft'),
  current_date + 30, '{}');
select tests.settle();

create function pg_temp.listed(actor text, self_only boolean) returns boolean language sql as $$
  select exists (select 1 from jsonb_array_elements(public.list_employee_document_lifecycle_service(pg_temp.who(actor),
    tests.id('nm'), self_only)) d where (d ->> 'id')::uuid = (pg_temp.req()).id)
$$;
select ok((select s.state = 'pending_review' from public.employee_document_submissions s where s.id = (pg_temp.req()).submitted_document_id),
  'Ada''s card waits for review');
select ok(pg_temp.listed('owner', false), 'it is in the owner''s documents to review');
select ok(not pg_temp.listed('ada', false), 'it is not in Ada''s documents to review');
select ok(pg_temp.listed('ada', true), 'Ada follows it in her own documents');

select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- AVAIL-002 (M13): only an employee keeps a week of availability.
-- * Only an employee's onboarding has the Availability step. With
--   "availability required at onboarding" on, an invited manager has no such
--   step and finishes onboarding; an open onboarding gains or loses the step
--   with the person's role.
-- * A promotion above employee deletes the person's own week and its history
--   (Mert 2026-10-04, "Terfide silinsin"): no warning, no orange; who only
--   manages is not scheduled at all (ROL-CIFT 2.1), so Auto-fill does not offer
--   them. A change between employee roles keeps the week.

select tests.world('ao');
update public.workspace_scheduling_settings set availability_onboarding_required = true where workspace_id = tests.id('ao');
-- Ayse only manages (ROL-CIFT): filed with a Management job, she holds no employee slot.
select tests.person('ao', 'ayse', 'manager', array['K'], array['general manager'], 'onboarding');
select tests.person('ao', 'ali', 'employee', array['K'], array['cook'], 'onboarding');

create function pg_temp.step(person text) returns jsonb language sql as $$
  select jsonb_build_object('required', r.required, 'blocks', r.blocks_activation)
  from public.employee_onboarding_requirements r
  join public.employee_onboarding_cases c on c.id = r.case_id
  where c.employee_id = tests.id('ao:' || person) and r.kind = 'availability' and r.lifecycle_retired_at is null
$$;
create function pg_temp.revision(person text) returns integer language sql as $$
  select c.revision from public.employee_onboarding_cases c where c.employee_id = tests.id('ao:' || person)
$$;
create function pg_temp.role_to(person text, access text) returns void language sql as $$
  -- ROL-CIFT: an employee role is the employee slot alone; a management role is the management slot
  -- alone (they stop working).
  update public.workspace_memberships m
  set role_id = case when r.access_class = 'employee' then null else r.id end,
      employee_role_id = case when r.access_class = 'employee' then r.id end
  from public.workspace_roles r
  where m.workspace_id = tests.id('ao') and m.user_id = tests.user('ao:' || person) and r.workspace_id = m.workspace_id
    and (r.system_key::text = access or r.id = (select i.id from tests.ids i where i.label = 'ao:role:' || access))
$$;
create temp table ao (k text primary key, v integer);

select is(pg_temp.step('ali'), '{"required": true, "blocks": true}'::jsonb, 'an employee still owes the week');
select is(pg_temp.step('ayse'), null, 'an invited manager has no Availability step');

-- Ayşe fills in her profile and submits; nothing waits on a week she cannot keep.
select public.save_employee_onboarding_profile_service(tests.user('ao:ayse'), jsonb_build_object(
    'legal_first_name', 'Ayse', 'legal_last_name', 'Person', 'phone', '4155550123', 'emergency_contact_name', 'Contact',
    'emergency_contact_relationship', 'Friend', 'emergency_contact_phone', '+14155550100'),
  pg_temp.revision('ayse'), tests.id('ao'));
select lives_ok($$select public.submit_employee_onboarding_service(tests.user('ao:ayse'), pg_temp.revision('ayse'), tests.id('ao'))$$,
  'the invited manager submits onboarding');
select tests.settle();
select is((select m.status::text from public.workspace_memberships m where m.workspace_id = tests.id('ao') and m.user_id = tests.user('ao:ayse')),
  'active', 'and is in');

-- Ali is made a manager before he finishes: the step stops waiting on him.
insert into ao values ('before', pg_temp.revision('ali'));
select pg_temp.role_to('ali', 'manager');
select is(pg_temp.step('ali'), null, 'a promoted person loses the step');
select is(pg_temp.revision('ali'), (select v + 1 from ao where k = 'before'), 'and his onboarding moves on once');

-- Turning the setting off and on again does not touch a manager's onboarding.
update public.workspace_scheduling_settings set availability_onboarding_required = false where workspace_id = tests.id('ao');
update public.workspace_scheduling_settings set availability_onboarding_required = true where workspace_id = tests.id('ao');
select is(pg_temp.revision('ali'), (select v + 1 from ao where k = 'before'), 'a settings change leaves a manager''s onboarding as it was');
select is(pg_temp.step('ali'), null, 'and gains no step');

-- Back to employee: the week is owed again.
select pg_temp.role_to('ali', 'employee');
select is(pg_temp.step('ali'), '{"required": true, "blocks": true}'::jsonb, 'an employee again has the step and owes the week');
select is(pg_temp.revision('ali'), (select v + 2 from ao where k = 'before'), 'and his onboarding moves on again');

-- Emre and Veli, employees, mark Monday evenings themselves.
update public.workspace_scheduling_settings set availability_onboarding_required = false where workspace_id = tests.id('ao');
select tests.person('ao', 'emre', 'employee', array['K'], array['cook']);
select tests.person('ao', 'veli', 'employee', array['K'], array['cook']);
select tests.role('ao', 'barista', 'employee', array(
  select rp.permission_key from public.workspace_role_permissions rp join public.workspace_roles r on r.id = rp.role_id
  where r.workspace_id = tests.id('ao') and r.system_key = 'employee'));
create function pg_temp.save_week(person text) returns jsonb language sql as $$
  select public.weekly_preferences_save_service(tests.user('ao:' || person), tests.id('ao'), jsonb_build_object(
    'employee_id', tests.id('ao:' || person), 'source', 'employee',
    'expected_revision', coalesce((m -> 'employee' ->> 'revision')::integer, 0),
    'settings_revision', (m -> 'settings' ->> 'revision')::integer,
    'preference', jsonb_set(public.empty_weekly_preference(), '{days,1,ranges}', '[{"start": "18:00", "end": "22:00"}]')),
    gen_random_uuid())
  from (select public.weekly_preferences_read_service(tests.user('ao:' || person), tests.id('ao')) m) x
$$;
create function pg_temp.kept(person text) returns jsonb language sql as $$
  select jsonb_build_object(
    'week', exists (select 1 from public.employee_weekly_preferences where employee_id = tests.id('ao:' || person)),
    'history', exists (select 1 from public.weekly_preference_events where employee_id = tests.id('ao:' || person) and source = 'employee'),
    'commands', exists (select 1 from public.weekly_preference_commands where command ->> 'employee_id' = tests.id('ao:' || person)::text))
$$;
create function pg_temp.monday_evening(person text) returns jsonb language sql as $$
  select jsonb_build_object('location_id', tests.id('ao:K'), 'employee_id', tests.id('ao:' || person),
    'job_id', tests.id('ao:job:cook'), 'scheduled_date', tests.week(2), 'time_basis', 'explicit',
    'start_time', '18:00', 'end_time', '22:00', 'time_timezone', 'Europe/Istanbul', 'note', '')
$$;
create function pg_temp.auto_fill() returns jsonb language sql as $$
  select coalesce(jsonb_agg(c -> 'employee_id'), '[]') from jsonb_array_elements(public.preview_schedule_auto_fill_service(
    tests.user('ao:owner'), tests.id('ao'), tests.id('ao:session')) -> 'proposals') p, jsonb_array_elements(p -> 'candidates') c
$$;
create function pg_temp.orange(person text) returns integer language sql as $$
  select count(*)::integer from jsonb_array_elements(public.get_schedule_read_model_service(tests.user('ao:owner'), tests.id('ao'), tests.week(2))
    -> 'employees') e, jsonb_array_elements(e -> 'weekly_availability') a, jsonb_array_elements(a -> 'days') d
  where e ->> 'id' = tests.id('ao:' || person)::text and (d ->> 'has_unavailable')::boolean
$$;
select pg_temp.save_week('emre');
select pg_temp.save_week('veli');
select is(pg_temp.kept('emre'), '{"week": true, "history": true, "commands": true}'::jsonb, 'Emre''s week is saved with its history');
-- An open Monday evening for Auto-fill.
select tests.remember('ao:session', (public.acquire_schedule_edit_session_service(
  tests.user('ao:owner'), tests.id('ao'), tests.week(2), 'blank', null) -> 'session' ->> 'id')::uuid);
select public.mutate_schedule_edit_shift_service(tests.user('ao:owner'), tests.id('ao'), tests.id('ao:session'),
  (select revision from public.schedule_edit_sessions where id = tests.id('ao:session')), 'create', gen_random_uuid(), null,
  pg_temp.monday_evening('emre') || '{"employee_id": null}', gen_random_uuid());
select ok(not pg_temp.auto_fill() @> jsonb_build_array(tests.id('ao:emre')), 'Auto-fill leaves Emre out of his marked evening');
select is(pg_temp.orange('emre'), 1, 'and the grid shows his Monday orange');

-- Veli moves to another employee role: his week stays.
select pg_temp.role_to('veli', 'barista');
select is(pg_temp.kept('veli'), '{"week": true, "history": true, "commands": true}'::jsonb, 'a change between employee roles keeps the week');

-- Emre is made a manager: his week and its history go, without a word (nothing sends one since
-- the old notifications went, BILDIRIM-06).
select pg_temp.role_to('emre', 'manager');
select is(pg_temp.kept('emre'), '{"week": false, "history": false, "commands": false}'::jsonb, 'a promotion deletes his week and its history');
select is(public.assess_schedule_shift_service(tests.user('ao:owner'), tests.id('ao'), pg_temp.monday_evening('emre'), null, tests.id('ao:session'))
  -> 'has_availability_conflict', 'false'::jsonb, 'Schedule warns of nothing on his Monday evening');
select is(pg_temp.orange('emre'), 0, 'and the grid shows no orange for him');
-- ROL-CIFT 2.1: who only manages is not scheduled, so Auto-fill does not offer him at all.
select ok(not pg_temp.auto_fill() @> jsonb_build_array(tests.id('ao:emre')), 'Auto-fill does not offer him, who only manages now');

-- Back to employee: he starts empty.
select pg_temp.role_to('emre', 'employee');
select is(pg_temp.kept('emre'), '{"week": false, "history": false, "commands": false}'::jsonb, 'back to employee, he starts with no week');

select * from finish();
rollback;

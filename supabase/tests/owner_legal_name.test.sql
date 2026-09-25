begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- BL-080. An owner gives their legal name at the first step of setup: the
-- three name fields there are the legal name as well as the account's and the
-- record's name. It is required, it is never copied from the account name, and
-- afterwards only the owner changes it, with the old and the new name kept in
-- the audit log. Employees keep the onboarding review they have today.

-- The SQLSTATE and authz hint a call is refused with, or 'allowed'.
create function pg_temp.refusal(statement text) returns text
language plpgsql as $$
declare
  state text;
  hint text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics state = returned_sqlstate, hint = pg_exception_hint;
  return state || coalesce(' ' || nullif(hint, ''), '');
end;
$$;

-- 1. Setup's first step writes the legal name ------------------------------------------

select tests.world('ln');
select tests.world('lx');

select is(
  (select legal_first_name || '|' || legal_middle_name || '|' || legal_last_name
   from public.employee_private_profiles where employee_id = tests.id('ln:owner')),
  'Olcay||Owner',
  'the name typed at the first step of setup is the owner''s legal name'
);
select ok(
  (select emergency_contact_name is null and emergency_contact_phone is null
     and emergency_contact_relationship is null and phone is null
   from public.employee_private_profiles where employee_id = tests.id('ln:owner')),
  'nothing but the legal name is put on the owner''s private record'
);

-- A new owner, part way through the first step.
select tests.new_user('fresh:owner', 'Mert Ali Tepebas');
select tests.remember('fresh', public.create_owner_workspace_service(tests.user('fresh:owner'), 'Fresh Co'));

create function pg_temp.save_setup(first_name text, middle_name text, last_name text, next_step smallint default 2)
returns text language sql as $$
  select pg_temp.refusal(format(
    'select public.update_owner_onboarding_service(%L, %L, %L, %s::smallint, false, %s, %L, %L, %L)',
    tests.user('fresh:owner'), tests.id('fresh'), 'Fresh Co', next_step,
    (select revision from public.workspace_onboarding where workspace_id = tests.id('fresh')),
    first_name, middle_name, last_name
  ))
$$;

select is(pg_temp.save_setup(null, null, null), '23514',
  'the first step cannot be passed without a legal name');
select is(
  (select current_step::integer from public.workspace_onboarding where workspace_id = tests.id('fresh')),
  1,
  'and setup stays on the first step'
);
select is(pg_temp.save_setup('Mert', '', '  '), '22023',
  'a legal name needs a family name');
select is(pg_temp.save_setup('', '', 'Tepebas'), '22023',
  'and a given name');
select is(pg_temp.save_setup(repeat('M', 81), '', 'Tepebas'), '22023',
  'and fits the record');
select is(
  (select count(*)::integer from public.employee_profiles where workspace_id = tests.id('fresh')),
  0,
  'a refused step files nobody'
);

select is(pg_temp.save_setup('Mert', 'Ali', 'Tepebas'), 'allowed', 'with a legal name the step passes');
select tests.remember('fresh:owner:employee', (
  select id from public.employee_profiles
  where workspace_id = tests.id('fresh') and user_id = tests.user('fresh:owner')
));
select is(
  (select legal_first_name || '|' || legal_middle_name || '|' || legal_last_name
   from public.employee_private_profiles where employee_id = tests.id('fresh:owner:employee')),
  'Mert|Ali|Tepebas',
  'all three parts are kept as typed'
);

-- The later steps do not ask again, and do not clear it.
select is(pg_temp.save_setup(null, null, null, 3::smallint), 'allowed', 'a later step does not ask for it again');
select is(
  (select legal_first_name || '|' || legal_last_name
   from public.employee_private_profiles where employee_id = tests.id('fresh:owner:employee')),
  'Mert|Tepebas',
  'and leaves it as it was'
);

-- Going back to the first step during setup and correcting it corrects it.
select is(pg_temp.save_setup('Mert', '', 'Tepebaş'), 'allowed', 'the first step can be corrected during setup');
select is(
  (select legal_first_name || '|' || legal_middle_name || '|' || legal_last_name
   from public.employee_private_profiles where employee_id = tests.id('fresh:owner:employee')),
  'Mert||Tepebaş',
  'and the correction is the legal name'
);

-- 2. The account area does not guess a legal name ---------------------------------------

-- Somebody who accepted an invitation and has not filled in onboarding has no
-- private record. Saving an emergency contact used to open one with the
-- record's name copied in as a legal name.
select tests.person('ln', 'aydan', 'employee', array['K'], array['cook'], 'onboarding');
select is(
  pg_temp.refusal(format(
    'select public.save_own_employment_contact_service(%L, %L, %L, %L, %L, %L)',
    tests.user('ln:aydan'), tests.id('ln'), tests.id('ln:aydan'), 'Deniz', 'Sibling', '4155550100'
  )),
  '23514',
  'an emergency contact cannot be saved before there is a legal name on file'
);
select is(
  (select count(*)::integer from public.employee_private_profiles where employee_id = tests.id('ln:aydan')),
  0,
  'and no legal name is made up from the record''s name'
);

-- With a legal name on file the contact is saved and the legal name stays.
update public.employee_profiles set first_name = 'Renamed' where id = tests.id('ln:owner');
select is(
  pg_temp.refusal(format(
    'select public.save_own_employment_contact_service(%L, %L, %L, %L, %L, %L)',
    tests.user('ln:owner'), tests.id('ln'), tests.id('ln:owner'), 'Morgan Owner', 'Spouse', '4155550101'
  )),
  'allowed',
  'the owner saves an emergency contact onto the record setup opened'
);
select is(
  (select legal_first_name || '|' || emergency_contact_name || '|' || emergency_contact_relationship
   from public.employee_private_profiles where employee_id = tests.id('ln:owner')),
  'Olcay|Morgan Owner|Spouse',
  'the contact is saved and the legal name is not touched'
);

-- 3. The owner changes their legal name, and it is on record ---------------------------

create function pg_temp.change(actor_label text, workspace_label text, first_name text, middle_name text, last_name text)
returns text language sql as $$
  select pg_temp.refusal(format(
    'select public.save_owner_legal_name_service(%L, %L, %L, %L, %L)',
    tests.user(actor_label), tests.id(workspace_label), first_name, middle_name, last_name
  ))
$$;

select is(pg_temp.change('ln:owner', 'ln', 'Olcay', 'Deniz', 'Ownerson'), 'allowed', 'the owner changes their legal name');
select is(
  (select legal_first_name || '|' || legal_middle_name || '|' || legal_last_name
   from public.employee_private_profiles where employee_id = tests.id('ln:owner')),
  'Olcay|Deniz|Ownerson',
  'the new legal name is on the record'
);
select is(
  (select jsonb_build_object(
     'actor', actor_user_id = tests.user('ln:owner'),
     'target', target_type || ':' || (target_id = tests.id('ln:owner')::text),
     'when', occurred_at is not null,
     'previous', metadata -> 'previous',
     'next', metadata -> 'next')
   from public.audit_events
   where workspace_id = tests.id('ln') and action = 'employee.legal_name_changed'),
  jsonb_build_object(
    'actor', true, 'target', 'employee:true', 'when', true,
    'previous', jsonb_build_object('first_name', 'Olcay', 'middle_name', '', 'last_name', 'Owner'),
    'next', jsonb_build_object('first_name', 'Olcay', 'middle_name', 'Deniz', 'last_name', 'Ownerson')
  ),
  'the audit log keeps the old name, the new name, who changed it and when'
);

select is(pg_temp.change('ln:owner', 'ln', 'Olcay', 'Deniz', 'Ownerson'), 'allowed', 'saving the same name again is fine');
select is(
  (select count(*)::integer from public.audit_events
   where workspace_id = tests.id('ln') and action = 'employee.legal_name_changed'),
  1,
  'but a save that changes nothing records no change'
);
select is(pg_temp.change('ln:owner', 'ln', 'Olcay', '', ' '), '22023', 'a legal name cannot be emptied');

-- 4. Nobody else, and nowhere else -------------------------------------------------------

select tests.person('ln', 'ali', 'employee', array['K'], array['cook']);
select tests.person('ln', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('ln', 'ada', 'admin', array['K'], array['cook']);

select is(
  array[
    pg_temp.change('ln:ali', 'ln', 'Ali', '', 'Changed'),
    pg_temp.change('ln:ayse', 'ln', 'Ayse', '', 'Changed'),
    pg_temp.change('ln:ada', 'ln', 'Ada', '', 'Changed')
  ],
  array['42501 authz.owner_only', '42501 authz.owner_only', '42501 authz.owner_only'],
  'an employee, a manager and an admin are told no: this is the owner''s own'
);
select is(
  array[
    pg_temp.change('lx:owner', 'ln', 'Olcay', '', 'Changed'),
    pg_temp.change('ln:owner', 'lx', 'Olcay', '', 'Changed')
  ],
  array['42501 authz.not_member', '42501 authz.not_member'],
  'an owner cannot reach another workspace''s record, and is not reached from one'
);
select is(
  (select string_agg(legal_last_name, ',' order by legal_last_name)
   from public.employee_private_profiles
   where employee_id in (tests.id('ln:owner'), tests.id('lx:owner'), tests.id('ln:ali'))),
  'Owner,Ownerson,Person',
  'and every refused change left the legal names where they were'
);

select * from finish();
rollback;

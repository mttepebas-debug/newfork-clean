begin;
create extension if not exists pgtap with schema extensions;
select plan(67);

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
select is(pg_temp.save_setup('Mert', '', 'Tepebasi'), 'allowed', 'the first step can be corrected during setup');
select is(
  (select legal_first_name || '|' || legal_middle_name || '|' || legal_last_name
   from public.employee_private_profiles where employee_id = tests.id('fresh:owner:employee')),
  'Mert||Tepebasi',
  'and the correction is the legal name'
);
-- BL-969: the US letter rule holds in the data too.
select is(pg_temp.save_setup('Mert', '', 'Tepebaş'), '23514', 'a legal name with Turkish-only letters is refused');

-- 2. The account area does not guess a legal name ---------------------------------------

-- Somebody who accepted an invitation and has not filled in onboarding has no
-- private record. Saving an emergency contact used to open one with the
-- record's name copied in as a legal name.
select tests.person('ln', 'aydan', 'employee', array['K'], array['cook'], 'onboarding');
select is(
  pg_temp.refusal(format(
    'select public.save_own_employment_contact_service(%L, %L, %L, %L, %L, %L)',
    tests.user('ln:aydan'), tests.id('ln'), tests.id('ln:aydan'), 'Deniz', 'Sibling', '+14155550100'
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
    tests.user('ln:owner'), tests.id('ln'), tests.id('ln:owner'), 'Morgan Owner', 'Spouse', '+14155550101'
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

-- 5. The owner reads it back ------------------------------------------------------------

create function pg_temp.read(actor_label text, workspace_label text)
returns text language plpgsql as $$
declare
  result text;
begin
  select coalesce(legal_first_name, '<null>') || '|' || coalesce(legal_middle_name, '<null>')
         || '|' || coalesce(legal_last_name, '<null>')
  into result
  from public.get_own_legal_name_service(tests.user(actor_label), tests.id(workspace_label));
  return result;
exception when others then
  return pg_temp.refusal(format(
    'select * from public.get_own_legal_name_service(%L, %L)',
    tests.user(actor_label), tests.id(workspace_label)
  ));
end;
$$;

select is(pg_temp.read('ln:owner', 'ln'), 'Olcay|Deniz|Ownerson', 'the owner reads their own legal name back');

-- An owner who has not passed the first step has none yet.
select tests.new_user('blank:owner', 'Blank Owner');
select tests.remember('blank', public.create_owner_workspace_service(tests.user('blank:owner'), 'Blank Co'));
select is(pg_temp.read('blank:owner', 'blank'), '<null>|<null>|<null>', 'with no legal name on file every part reads as nothing');

-- The owner's record is filed only under the names the first step asked for;
-- there is no fallback to the account name, the e-mail or a placeholder.
select is(
  pg_temp.refusal(format(
    'select app_private.ensure_owner_employee_profile(%L, %L)',
    tests.id('blank'), tests.user('blank:owner')
  )),
  '22023',
  'an owner''s record is not filed without a name'
);
select is(
  (select count(*)::integer from public.employee_profiles where workspace_id = tests.id('blank')),
  0,
  'and nothing is filed under the account''s name instead'
);

select is(
  array[pg_temp.read('ln:ali', 'ln'), pg_temp.read('ln:ayse', 'ln'), pg_temp.read('ln:ada', 'ln')],
  array['42501 authz.owner_only', '42501 authz.owner_only', '42501 authz.owner_only'],
  'an employee, a manager and an admin cannot read it this way'
);
select is(
  array[pg_temp.read('lx:owner', 'ln'), pg_temp.read('ln:owner', 'lx')],
  array['42501 authz.not_member', '42501 authz.not_member'],
  'and nobody reads it from another workspace'
);

-- 6. Ownership goes only to somebody with a legal name (user decision 2026-09-26) ------

-- An admin the workspace knows only as a member: verified, active, no
-- onboarding case, no private record.
select tests.new_user('ln:nameless', 'Nameless Admin');
-- Written as the test's own setup, not as whoever a service call last named.
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
insert into public.workspace_memberships (workspace_id, user_id, role, role_id, status)
select tests.id('ln'), tests.user('ln:nameless'), 'admin'::public.workspace_role, role.id,
  'active'::public.membership_status
from public.workspace_roles role
where role.workspace_id = tests.id('ln') and role.system_key = 'admin';

create function pg_temp.transfer(target_label text) returns text language sql as $$
  select pg_temp.refusal(format(
    'select public.initiate_workspace_ownership_transfer_service(%L, %L, %L)',
    tests.user('ln:owner'), tests.id('ln'), tests.user(target_label)
  ))
$$;

select is(pg_temp.transfer('ln:nameless'), '23514 transfer.target_legal_name_missing',
  'ownership is not offered to somebody with no legal name on file');
select is(
  (select count(*)::integer from public.workspace_ownership_transfers where workspace_id = tests.id('ln')),
  0,
  'and no transfer is started'
);
select is(pg_temp.transfer('ln:ada'), 'allowed',
  'an admin whose onboarding filed a legal name can be offered ownership');

-- The candidate list offers only people a transfer would accept.
select ok(
  tests.user('ln:ada') in (
    select "userId" from public.search_workspace_ownership_candidates_service(
      tests.user('ln:owner'), tests.id('ln'), 'Ada')),
  'an admin with a legal name on file is offered as a candidate'
);
select is(
  (select count(*)::integer from public.search_workspace_ownership_candidates_service(
     tests.user('ln:owner'), tests.id('ln'), 'Nameless')),
  0,
  'an admin with none is not offered at all'
);

-- 9. The US letter rule in the data (BL-969) -------------------------------------------

-- KARARLAR "Form ve girdi kuralları (ABD)": ş, ğ, ı and İ are refused wherever a
-- form takes a name or an address, whichever way the row is written; other
-- Latin accents and hyphens are not.
create function pg_temp.letters(target_table text, target_column text, row_id uuid, typed text,
  key_column text default 'id')
returns text language sql as $$
  select pg_temp.refusal(format('update public.%I set %I = %L where %I = %L',
    target_table, target_column, typed, key_column, row_id))
$$;

select is(pg_temp.letters('workspaces', 'name', tests.id('ln'), 'Kadıköy Cafe'), '23514',
  'a workspace name refuses Turkish-only letters');
select is(pg_temp.letters('workspaces', 'name', tests.id('ln'), 'José Peña-Smith Grill'), 'allowed',
  'and takes other Latin accents and hyphens');
select is(pg_temp.letters('locations', 'name', tests.id('ln:K'), 'Kadıköy'), '23514', 'a location name refuses them');
select is(pg_temp.letters('locations', 'street_address', tests.id('ln:K'), '1 Moda Caddesi Şehit'), '23514',
  'a location street refuses them');
select is(pg_temp.letters('locations', 'city', tests.id('ln:K'), 'İstanbul'), '23514', 'a location city refuses them');
select is(pg_temp.letters('locations', 'city', tests.id('ln:K'), 'Peñasco'), 'allowed', 'and takes ñ');
select is(pg_temp.letters('locations', 'region', tests.id('ln:K'), 'Kadıköy'), '23514', 'a location region refuses them');
select is(pg_temp.letters('departments', 'name', tests.id('ln:kitchen'), 'Mutfak Ağı'), '23514',
  'a department name refuses them');
select is(pg_temp.letters('jobs', 'name', tests.id('ln:job:cook'), 'Aşçı'), '23514', 'a job name refuses them');
select is(pg_temp.letters('employee_profiles', 'first_name', tests.id('ln:owner'), 'Ayşe'), '23514',
  'an employee''s first name refuses them');
select is(pg_temp.letters('employee_profiles', 'first_name', tests.id('ln:owner'), 'José'), 'allowed',
  'and takes é');
select is(pg_temp.letters('employee_profiles', 'middle_name', tests.id('ln:owner'), 'Gül'), 'allowed',
  'ü is not one of the four');
select is(pg_temp.letters('employee_profiles', 'middle_name', tests.id('ln:owner'), 'Ağca'), '23514',
  'an employee''s middle name refuses them');
select is(pg_temp.letters('employee_profiles', 'last_name', tests.id('ln:owner'), 'Yılmaz'), '23514',
  'an employee''s last name refuses them');
select is(pg_temp.letters('employee_profiles', 'preferred_name', tests.id('ln:owner'), 'Işık'), '23514',
  'an employee''s preferred name refuses them');
select is(pg_temp.letters('employee_private_profiles', 'legal_first_name', tests.id('ln:owner'), 'Ayşe', 'employee_id'),
  '23514', 'a legal first name refuses them');
select is(pg_temp.letters('employee_private_profiles', 'legal_middle_name', tests.id('ln:owner'), 'Ağca', 'employee_id'),
  '23514', 'a legal middle name refuses them');
select is(pg_temp.letters('employee_private_profiles', 'legal_last_name', tests.id('ln:owner'), 'Yılmaz', 'employee_id'),
  '23514', 'a legal last name refuses them');
select is(pg_temp.letters('employee_private_profiles', 'legal_last_name', tests.id('ln:owner'), 'Peña-Smith', 'employee_id'),
  'allowed', 'and takes ñ and a hyphen');
select is(pg_temp.letters('employee_private_profiles', 'preferred_name', tests.id('ln:owner'), 'Işık', 'employee_id'),
  '23514', 'a private preferred name refuses them');
select is(pg_temp.letters('employee_private_profiles', 'street_address', tests.id('ln:owner'), '1 Bağdat Caddesi', 'employee_id'),
  '23514', 'a home street refuses them');
select is(pg_temp.letters('employee_private_profiles', 'city', tests.id('ln:owner'), 'Şişli', 'employee_id'),
  '23514', 'a home city refuses them');
select is(pg_temp.letters('employee_private_profiles', 'region', tests.id('ln:owner'), 'İstanbul', 'employee_id'),
  '23514', 'a home state refuses them');
select is(
  pg_temp.refusal(format(
    'update public.employee_private_profiles set emergency_contact_name = %L, emergency_contact_relationship = %L, emergency_contact_phone = %L where employee_id = %L',
    'Ayşe', 'Friend', '+14155550100', tests.id('ln:owner'))),
  '23514', 'an emergency contact''s name refuses them');
select is(
  pg_temp.refusal(format(
    'update public.employee_private_profiles set emergency_contact_name = %L, emergency_contact_relationship = %L, emergency_contact_phone = %L where employee_id = %L',
    'Ayse', 'Kardeş', '+14155550100', tests.id('ln:owner'))),
  '23514', 'an emergency contact''s relationship refuses them');
-- Pasted from macOS or a PDF, the letter can arrive as a base letter and a
-- combining mark: the same letter, refused the same way (BL-969 code review).
select is(pg_temp.letters('workspaces', 'name', tests.id('ln'), U&'S\0327is\0327li Grill'), '23514',
  'a workspace name refuses a decomposed ş');
select is(pg_temp.letters('employee_private_profiles', 'legal_last_name', tests.id('ln:owner'), U&'I\0307nce', 'employee_id'),
  '23514', 'a legal last name refuses a decomposed İ');
select is(
  pg_temp.refusal(format(
    'insert into public.employee_preferred_name_requests (workspace_id, employee_id, requested_name, status, requested_by) values (%L, %L, %L, %L, %L)',
    tests.id('ln'), tests.id('ln:owner'), 'Işık', 'rejected', tests.user('ln:owner'))),
  '23514', 'a preferred name request refuses them');

select * from finish();
rollback;

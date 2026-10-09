begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- TEL-2 (Mert, 2026-10-09). A phone given in onboarding is the person's own:
-- nobody else live in the workspace holds it, and the emergency contact is
-- somebody else. Emergency contacts are not compared with other people's
-- numbers; two friends may name each other.
--
-- Ali works in tp; Rem's employment there ended; Sus lost access but keeps her
-- record. Oya and Bea accepted and are onboarding. Xena works in tq, where Pia
-- is onboarding.

select tests.world('tp');
select tests.world('tq');
select tests.person('tp', 'ali', 'employee');
select tests.person('tp', 'rem', 'employee', array['K'], array['cook'], 'removed');
select tests.person('tp', 'sus', 'employee', array['K'], array['cook'], 'suspended');
select tests.person('tp', 'oya', 'employee', array['K'], array['cook'], 'onboarding');
select tests.person('tp', 'bea', 'employee', array['K'], array['cook'], 'onboarding');
select tests.person('tq', 'xena', 'employee');
select tests.person('tq', 'pia', 'employee', array['K'], array['cook'], 'onboarding');

-- The number as the screen shows it: (415) 555-0100.
create function pg_temp.typed(e164 text) returns text language sql as $$
  select '(' || substr(e164, 3, 3) || ') ' || substr(e164, 6, 3) || '-' || substr(e164, 9)
$$;

create function pg_temp.in_use(person text, phone text, w text default 'tp') returns boolean
language sql as $$
  select public.onboarding_phone_in_use_service(tests.user(w || ':' || person), phone, tests.id(w))
$$;

create function pg_temp.save(person text, phone text, emergency text, w text default 'tp') returns text
language plpgsql as $$
declare
  code text;
  reason text;
  broken text;
begin
  perform public.save_employee_onboarding_profile_service(
    tests.user(w || ':' || person),
    jsonb_build_object(
      'legal_first_name', initcap(person), 'legal_last_name', 'Person',
      'phone', phone, 'emergency_contact_name', 'Contact',
      'emergency_contact_relationship', 'Friend', 'emergency_contact_phone', emergency),
    (select c.revision from public.employee_onboarding_cases c where c.employee_id = tests.id(w || ':' || person)),
    tests.id(w));
  return 'saved';
exception when others then
  get stacked diagnostics code = returned_sqlstate, reason = pg_exception_hint, broken = constraint_name;
  return code || ' ' || coalesce(nullif(reason, ''), broken, '');
end;
$$;

create function pg_temp.refusal(statement text) returns text
language plpgsql as $$
declare
  code text;
  broken text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics code = returned_sqlstate, broken = constraint_name;
  return code || ' ' || coalesce(broken, '');
end;
$$;

-- What the screen asks while the number is typed.
select is(pg_temp.in_use('oya', pg_temp.typed(tests.phone('tp:ali'))), true,
  'a number another person of the workspace holds is in use, typed as the screen shows it');
select is(pg_temp.in_use('oya', tests.phone('tp:ali')), true, 'and in E.164');
select is(pg_temp.in_use('oya', '(310) 555-0111'), false, 'a number nobody holds is free');
select is(pg_temp.in_use('oya', pg_temp.typed(tests.phone('tp:rem'))), false,
  'a number on a record whose employment ended is free');
select is(pg_temp.in_use('oya', pg_temp.typed(tests.phone('tp:sus'))), true,
  'a number on a record that only lost access is still somebody''s');
select is(pg_temp.in_use('pia', pg_temp.typed(tests.phone('tp:ali')), 'tq'), false,
  'another workspace''s numbers are not this workspace''s business');
select throws_ok(
  format('select public.onboarding_phone_in_use_service(%L, %L, %L)',
    tests.user('tq:xena'), tests.phone('tp:ali'), tests.id('tp')),
  '42501', null,
  'somebody outside the workspace cannot ask');
select ok(
  not has_function_privilege('authenticated', 'public.onboarding_phone_in_use_service(uuid, text, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'app_private.phone_used_in_workspace(uuid, text, uuid)', 'execute'),
  'only the API asks; a browser session cannot');

-- What the save refuses.
select is(pg_temp.save('oya', pg_temp.typed(tests.phone('tp:ali')), '+13105550190'), '23505 onboarding.phone_in_use',
  'onboarding refuses a number somebody else in the workspace holds');
select is((select phone_e164 from public.user_profiles where user_id = tests.user('tp:oya')), null,
  'and the account does not take it');
select is(pg_temp.save('oya', '(310) 555-0111', '+13105550111'), '23514 onboarding.emergency_is_own_phone',
  'onboarding refuses the person''s own number as the emergency contact''s');
select is(pg_temp.save('oya', '(310) 555-0111', tests.phone('tp:ali')), 'saved',
  'a coworker''s number is a valid emergency contact');
select is((select emergency_contact_phone || ' / ' || phone from public.employee_private_profiles
           where employee_id = tests.id('tp:oya')),
  tests.phone('tp:ali') || ' / +13105550111', 'and is what the record keeps');
select is(pg_temp.in_use('oya', '(310) 555-0111'), false, 'the person''s own number is not in use by somebody else');
select is(pg_temp.save('oya', '(310) 555-0111', '+13105550190'), 'saved', 'so saving it again goes through');
select is(pg_temp.save('pia', pg_temp.typed(tests.phone('tp:ali')), '+13105550190', 'tq'), 'saved',
  'a number held in another workspace is taken');
select is(pg_temp.save('bea', '(310) 555-0122', pg_temp.typed(tests.phone('tp:oya'))), '23514 employee_private_profiles_emergency_contact_phone_us_phone',
  'an emergency number reaches the record only in E.164, so the comparison sees the stored form');

-- An account that already has a phone gives that one, not the typed one.
update public.user_profiles set phone_e164 = tests.phone('tp:ali') where user_id = tests.user('tp:bea');
select is(pg_temp.save('bea', '(310) 555-0122', '+13105550190'), '23505 onboarding.phone_in_use',
  'onboarding refuses an account phone somebody else in the workspace holds');

-- The table refuses an emergency number equal to the record's own, whoever writes it.
select is(
  pg_temp.refusal(format(
    'update public.employee_private_profiles set emergency_contact_phone = phone where employee_id = %L', tests.id('tp:ali'))),
  '23514 employee_private_profiles_emergency_is_not_own_phone',
  'a record cannot name its own phone as the emergency contact''s');
select is(
  pg_temp.refusal(format(
    'update public.user_profiles set phone_e164 = %L where user_id = %L', '+14155550100', tests.user('tp:ali'))),
  '23514 employee_private_profiles_emergency_is_not_own_phone',
  'nor can the account phone become the emergency contact''s on the way to the record');

-- The edit kept the rest of the save function.
select ok(
  pg_get_functiondef('public.save_employee_onboarding_profile_service(uuid, jsonb, integer, uuid)'::regprocedure) like '%PT409%',
  'the save still refuses a stale revision');
select ok(
  (select count(*) from public.employee_private_profiles where emergency_contact_phone = phone) = 0,
  'no record names its own phone as the emergency contact''s');

select * from finish();
rollback;

-- BL-969: KARARLAR "Form ve girdi kuralları (ABD)" hold in the data, not only in
-- the forms (KK-222, KK-223). A name or an address takes no ş, ğ, ı or İ, and
-- a phone is a US number kept once, in E.164. The rows written before the rule
-- are corrected here once, the tables refuse the rest, and the app reads with
-- the one schema it writes with (CLAUDE.md §2.A.4–5).
--
-- Nothing changes when the data needs a person's decision: a required phone
-- that is not a US number, an account number that would overwrite a different
-- one on a record, or a name that would take another one's place once its
-- letters are replaced, stops the migration with the count (P09).
--
-- The column kept for the old account phone goes in the next migration, once
-- the web that no longer reads it is live.

-- A busy table answers in seconds with an error rather than holding the rest.
set local lock_timeout = '5s';

-- A US number in E.164 from whatever was saved, or null when it is not one.
create function pg_temp.us_phone(saved text) returns text
language sql immutable as $us$
  select case
    when btrim(coalesce(saved, '')) = '' then null
    when btrim(saved) like '+%' and regexp_replace(saved, '\D', '', 'g') !~ '^1' then null
    else (
      select case when parts.local_digits ~ '^[2-9][0-9]{9}$' then '+1' || parts.local_digits end
      from (
        select case
          when char_length(digits.d) = 11 and digits.d like '1%' then substr(digits.d, 2)
          else digits.d
        end as local_digits
        from (select regexp_replace(saved, '\D', '', 'g') as d) digits
      ) parts
    )
  end
$us$;

do $check$
declare
  required_phones integer;
  account_phones integer;
  overwritten_phones integer;
  collisions integer;
begin
  select count(*) into required_phones
  from public.employee_private_profiles private_record
  where (private_record.phone is not null and pg_temp.us_phone(private_record.phone) is null)
     or (private_record.emergency_contact_phone is not null
         and pg_temp.us_phone(private_record.emergency_contact_phone) is null);

  -- An account number that is not a US one is cleared, unless clearing it
  -- would clear the phone on a record of that person too (KK-7 copies it).
  select count(*) into account_phones
  from public.user_profiles account
  where coalesce(account.phone_e164, account.phone) is not null
    and coalesce(pg_temp.us_phone(account.phone_e164), pg_temp.us_phone(account.phone)) is null
    and exists (
      select 1
      from public.employee_profiles record
      join public.employee_private_profiles private_record on private_record.employee_id = record.id
      where record.user_id = account.user_id and private_record.phone is not null
    );

  -- A number taken over from the old column reaches the person's records too;
  -- it must not replace a different number one of them holds.
  select count(*) into overwritten_phones
  from public.user_profiles account
  where account.phone_e164 is null
    and pg_temp.us_phone(account.phone) is not null
    and exists (
      select 1
      from public.employee_profiles record
      join public.employee_private_profiles private_record on private_record.employee_id = record.id
      where record.user_id = account.user_id
        and private_record.phone is not null
        and pg_temp.us_phone(private_record.phone) is distinct from pg_temp.us_phone(account.phone)
    );

  select count(*) into collisions from (
    select workspace_id, lower(translate(name, 'şŞğĞıİ', 'sSgGiI'))
    from public.locations where archived_at is null
    group by 1, 2 having count(*) > 1
    union all
    select workspace_id, lower(translate(name, 'şŞğĞıİ', 'sSgGiI'))
    from public.departments where archived_at is null
    group by 1, 2 having count(*) > 1
    union all
    select workspace_id, lower(translate(name, 'şŞğĞıİ', 'sSgGiI'))
    from public.jobs where archived_at is null
    group by 1, 2 having count(*) > 1
  ) clashing;

  if required_phones + account_phones + overwritten_phones + collisions > 0 then
    raise exception 'BL-969 stopped before changing anything: % required phone(s) and % account phone(s) are not US numbers; % old account number(s) would overwrite a different one on a record; % name(s) would clash once their letters are replaced',
      required_phones, account_phones, overwritten_phones, collisions
      using errcode = 'P0001';
  end if;
end;
$check$;

-- 1. The rows written before the rule -------------------------------------------------

-- Deferred document checks run at once from here, so the tables can change
-- shape after the rows do.
set constraints public.document_assignment_changed immediate;

-- A deleted catalog row refuses every edit from the screens. This one
-- correction goes past that guard, which is back before the tables change shape.
alter table public.locations disable trigger catalog_deletion_state_guard;
alter table public.departments disable trigger catalog_deletion_state_guard;
alter table public.jobs disable trigger jobs_deletion_state_guard;

update public.workspaces set
    name = translate(name, 'şŞğĞıİ', 'sSgGiI')
where name ~ '[şŞğĞıİ]';

update public.locations set
    name = translate(name, 'şŞğĞıİ', 'sSgGiI'),
    street_address = translate(street_address, 'şŞğĞıİ', 'sSgGiI'),
    city = translate(city, 'şŞğĞıİ', 'sSgGiI'),
    region = translate(region, 'şŞğĞıİ', 'sSgGiI')
where name ~ '[şŞğĞıİ]'
   or street_address ~ '[şŞğĞıİ]'
   or city ~ '[şŞğĞıİ]'
   or region ~ '[şŞğĞıİ]';

update public.departments set
    name = translate(name, 'şŞğĞıİ', 'sSgGiI')
where name ~ '[şŞğĞıİ]';

update public.jobs set
    name = translate(name, 'şŞğĞıİ', 'sSgGiI')
where name ~ '[şŞğĞıİ]';

update public.employee_profiles set
    first_name = translate(first_name, 'şŞğĞıİ', 'sSgGiI'),
    middle_name = translate(middle_name, 'şŞğĞıİ', 'sSgGiI'),
    last_name = translate(last_name, 'şŞğĞıİ', 'sSgGiI'),
    preferred_name = translate(preferred_name, 'şŞğĞıİ', 'sSgGiI')
where first_name ~ '[şŞğĞıİ]'
   or middle_name ~ '[şŞğĞıİ]'
   or last_name ~ '[şŞğĞıİ]'
   or preferred_name ~ '[şŞğĞıİ]';

update public.employee_private_profiles set
    legal_first_name = translate(legal_first_name, 'şŞğĞıİ', 'sSgGiI'),
    legal_middle_name = translate(legal_middle_name, 'şŞğĞıİ', 'sSgGiI'),
    legal_last_name = translate(legal_last_name, 'şŞğĞıİ', 'sSgGiI'),
    preferred_name = translate(preferred_name, 'şŞğĞıİ', 'sSgGiI'),
    street_address = translate(street_address, 'şŞğĞıİ', 'sSgGiI'),
    city = translate(city, 'şŞğĞıİ', 'sSgGiI'),
    region = translate(region, 'şŞğĞıİ', 'sSgGiI'),
    emergency_contact_name = translate(emergency_contact_name, 'şŞğĞıİ', 'sSgGiI'),
    emergency_contact_relationship = translate(emergency_contact_relationship, 'şŞğĞıİ', 'sSgGiI')
where legal_first_name ~ '[şŞğĞıİ]'
   or legal_middle_name ~ '[şŞğĞıİ]'
   or legal_last_name ~ '[şŞğĞıİ]'
   or preferred_name ~ '[şŞğĞıİ]'
   or street_address ~ '[şŞğĞıİ]'
   or city ~ '[şŞğĞıİ]'
   or region ~ '[şŞğĞıİ]'
   or emergency_contact_name ~ '[şŞğĞıİ]'
   or emergency_contact_relationship ~ '[şŞğĞıİ]';

update public.employee_preferred_name_requests set
    requested_name = translate(requested_name, 'şŞğĞıİ', 'sSgGiI')
where requested_name ~ '[şŞğĞıİ]';

alter table public.locations enable trigger catalog_deletion_state_guard;
alter table public.departments enable trigger catalog_deletion_state_guard;
alter table public.jobs enable trigger jobs_deletion_state_guard;

update public.employee_private_profiles
set phone = pg_temp.us_phone(phone)
where phone is not null and phone is distinct from pg_temp.us_phone(phone);

update public.employee_private_profiles
set emergency_contact_phone = pg_temp.us_phone(emergency_contact_phone)
where emergency_contact_phone is not null
  and emergency_contact_phone is distinct from pg_temp.us_phone(emergency_contact_phone);

-- The account keeps one number. One saved only in the column kept for the old
-- move is taken over when it is a US number; one that is not is cleared, and
-- the person gives a US one in Account > Profile.
update public.user_profiles
set phone_e164 = coalesce(pg_temp.us_phone(phone_e164), pg_temp.us_phone(phone)),
    updated_at = now()
where phone_e164 is distinct from coalesce(pg_temp.us_phone(phone_e164), pg_temp.us_phone(phone));

-- 2. One way in for a phone -------------------------------------------------------------

-- Only a US number, in E.164, whatever way it was typed.
create or replace function app_private.account_phone_e164(raw_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  trimmed text := btrim(coalesce(raw_phone, ''));
  digits text;
  local_digits text;
begin
  if trimmed = '' then
    return null;
  end if;
  digits := regexp_replace(trimmed, '\D', '', 'g');
  if left(trimmed, 1) = '+' and digits !~ '^1' then
    raise exception 'that phone number cannot be dialled' using errcode = '22023';
  end if;
  local_digits := case
    when char_length(digits) = 11 and digits like '1%' then substr(digits, 2)
    else digits
  end;
  if local_digits !~ '^[2-9][0-9]{9}$' then
    raise exception 'that phone number cannot be dialled' using errcode = '22023';
  end if;
  return '+1' || local_digits;
end;
$$;

-- The emergency phone goes through it too, in both places that write one.
create or replace function public.save_employee_onboarding_profile_service(target_user_id uuid, profile_payload jsonb, expected_revision integer, target_workspace_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_case public.employee_onboarding_cases%rowtype;
  employee public.employee_profiles%rowtype;
  normalized_country_code text := nullif(upper(btrim(coalesce(profile_payload->>'country_code', ''))), '');
  normalized_birth_date text := nullif(btrim(coalesce(profile_payload->>'date_of_birth', '')), '');
  submitted_phone text := nullif(btrim(coalesce(profile_payload->>'phone', '')), '');
  emergency_email text := btrim(coalesce(profile_payload->>'emergency_contact_email', ''));
  account_phone text;
  legal_name_changed boolean;
  next_requirement_status public.employee_onboarding_requirement_status;
begin
 perform app_private.authorize(target_user_id, app_private.onboarding_self_workspace(target_user_id, target_workspace_id, true), 'onboarding.self');
  select onboarding.* into target_case from public.employee_onboarding_cases onboarding
  where onboarding.id = app_private.employee_onboarding_case_id(target_user_id, target_workspace_id)
  for update;
  if target_case.id is null then raise exception 'onboarding unavailable' using errcode = 'P0002'; end if;
  if target_case.revision <> expected_revision then raise exception 'onboarding changed; refresh required' using errcode = '40001'; end if;
  if target_case.status in ('submitted', 'approved', 'cancelled') then raise exception 'onboarding cannot be edited' using errcode = '22023'; end if;

  select * into employee
  from public.employee_profiles
  where id = target_case.employee_id
  for update;

  select profile.phone_e164 into account_phone
  from public.user_profiles profile
  where profile.user_id = target_user_id;

  if coalesce(profile_payload->>'legal_first_name', '') = ''
    or coalesce(profile_payload->>'legal_last_name', '') = ''
    or coalesce(account_phone, submitted_phone) is null
    or coalesce(profile_payload->>'emergency_contact_name', '') = ''
    or coalesce(profile_payload->>'emergency_contact_relationship', '') = ''
    or coalesce(profile_payload->>'emergency_contact_phone', '') = ''
    or (emergency_email <> '' and emergency_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
    or (normalized_country_code is not null and normalized_country_code !~ '^[A-Z]{2}$')
    or (normalized_birth_date is not null and normalized_birth_date !~ '^\d{4}-\d{2}-\d{2}$') then
    raise exception 'complete private profile required' using errcode = '22023';
  end if;

  -- The account is the phone's only source. An empty account takes the number
  -- typed here; a filled one keeps its own. The record copies the account.
  account_phone := app_private.adopt_account_phone(
    target_user_id, submitted_phone, btrim(employee.first_name || ' ' || employee.last_name)
  );

  legal_name_changed :=
    lower(btrim(profile_payload->>'legal_first_name')) is distinct from lower(btrim(employee.first_name))
    or lower(btrim(profile_payload->>'legal_last_name')) is distinct from lower(btrim(employee.last_name));
  next_requirement_status := case
    when legal_name_changed then 'awaiting_review'::public.employee_onboarding_requirement_status
    else 'completed'::public.employee_onboarding_requirement_status
  end;

  insert into public.employee_private_profiles (
    employee_id, workspace_id, legal_first_name, legal_middle_name, legal_last_name, preferred_name,
    phone, street_address, city, region, postal_code, country_code, date_of_birth,
    emergency_contact_name, emergency_contact_relationship, emergency_contact_phone,
    emergency_contact_email, share_phone_with_teammates, share_email_with_teammates
  ) values (
    target_case.employee_id, target_case.workspace_id,
    btrim(profile_payload->>'legal_first_name'),
    left(btrim(coalesce(profile_payload->>'legal_middle_name', '')), 80),
    btrim(profile_payload->>'legal_last_name'),
    left(btrim(coalesce(profile_payload->>'preferred_name', '')), 80),
    account_phone,
    nullif(btrim(coalesce(profile_payload->>'street_address', '')), ''),
    nullif(btrim(coalesce(profile_payload->>'city', '')), ''),
    nullif(btrim(coalesce(profile_payload->>'region', '')), ''),
    nullif(btrim(coalesce(profile_payload->>'postal_code', '')), ''),
    normalized_country_code,
    normalized_birth_date::date,
    btrim(profile_payload->>'emergency_contact_name'),
    btrim(profile_payload->>'emergency_contact_relationship'),
    app_private.account_phone_e164(profile_payload->>'emergency_contact_phone'),
    emergency_email,
    coalesce((profile_payload->>'share_phone_with_teammates')::boolean, false),
    coalesce((profile_payload->>'share_email_with_teammates')::boolean, false)
  ) on conflict (employee_id) do update set
    legal_first_name = excluded.legal_first_name,
    legal_middle_name = excluded.legal_middle_name,
    legal_last_name = excluded.legal_last_name,
    -- It was forced empty while the field was closed. The person answers it
    -- now, and leaving it blank is a valid answer.
    preferred_name = excluded.preferred_name,
    -- The account's number, same as the trigger writes; never the form's.
    phone = excluded.phone,
    street_address = excluded.street_address,
    city = excluded.city,
    region = excluded.region,
    postal_code = excluded.postal_code,
    country_code = excluded.country_code,
    date_of_birth = excluded.date_of_birth,
    emergency_contact_name = excluded.emergency_contact_name,
    emergency_contact_relationship = excluded.emergency_contact_relationship,
    emergency_contact_phone = excluded.emergency_contact_phone,
    emergency_contact_email = excluded.emergency_contact_email,
    share_phone_with_teammates = excluded.share_phone_with_teammates,
    share_email_with_teammates = excluded.share_email_with_teammates,
    updated_at = now();

  update public.employee_onboarding_requirements set
    status = next_requirement_status,
    requires_review = legal_name_changed,
    rejection_reason = null,
    reviewed_by = null,
    reviewed_at = null,
    completed_at = case when legal_name_changed then null else now() end,
    updated_at = now()
  where case_id = target_case.id and kind = 'profile'::public.employee_onboarding_requirement_kind;

  update public.employee_onboarding_cases set status = 'in_progress'::public.employee_onboarding_case_status, revision = revision + 1,
    updated_at = now() where id = target_case.id returning revision into expected_revision;
  insert into public.onboarding_events (workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id, metadata)
  values (target_case.workspace_id, target_case.employee_id, target_case.id, target_user_id,
    'onboarding.profile_saved', 'onboarding_case', target_case.id::text,
    jsonb_build_object('legal_name_review_required', legal_name_changed));
  return expected_revision;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_own_employment_contact_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid, contact_name text, contact_relationship text, contact_phone text, contact_email text DEFAULT ''::text, personal_phone text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  employee_row public.employee_profiles%rowtype;
  private_row public.employee_private_profiles%rowtype;
  cleaned_personal_phone text := nullif(btrim(coalesce(personal_phone, '')), '');
  relationship text;
begin
  -- The one rule: your own record, whoever you are here. Somebody else's and
  -- an unknown one get the same answer (authz.out_of_scope).
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.save_own_contact',
    target_person => target_employee_id);
  select * into employee_row
  from public.employee_profiles
  where id = target_employee_id
    and workspace_id = target_workspace_id
    and archived_at is null;

  if employee_row.id is null then
    raise exception 'employee not found'
      using errcode = 'P0002', hint = 'employee.not_found';
  end if;

  if char_length(btrim(coalesce(contact_name, ''))) < 1
    or char_length(btrim(coalesce(contact_phone, ''))) < 7 then
    raise exception 'an emergency contact needs a name and a phone number'
      using errcode = '22023';
  end if;
  -- A half-typed number is refused here, where the screen can read the refusal.
  if cleaned_personal_phone is not null
    and char_length(cleaned_personal_phone) < 7 then
    raise exception 'a personal phone number is too short to reach anybody'
      using errcode = '22023';
  end if;

  select * into private_row
  from public.employee_private_profiles
  where employee_id = employee_row.id
  for update;
  if private_row.employee_id is null then
    raise exception 'there is no legal name on file for this record yet'
      using errcode = '23514';
  end if;

  relationship := coalesce(
    nullif(btrim(coalesce(contact_relationship, '')), ''),
    private_row.emergency_contact_relationship
  );
  if relationship is null then
    raise exception 'an emergency contact needs a relationship' using errcode = '22023';
  end if;

  -- The phone is the account's (KK-7). An empty account takes this number and
  -- the trigger copies it onto every live record, this one included.
  perform app_private.adopt_account_phone(
    actor_user_id, cleaned_personal_phone,
    btrim(employee_row.first_name || ' ' || employee_row.last_name)
  );

  update public.employee_private_profiles
  set
    emergency_contact_name = btrim(contact_name),
    emergency_contact_relationship = relationship,
    emergency_contact_phone = app_private.account_phone_e164(contact_phone),
    emergency_contact_email = btrim(coalesce(contact_email, '')),
    updated_at = now()
  where employee_id = employee_row.id;
end;
$function$;

-- 3. The tables refuse the rest ---------------------------------------------------------

alter table public.workspaces
  add constraint workspaces_name_us_letters check (name !~ '[şŞğĞıİ]');

alter table public.locations
  add constraint locations_name_us_letters check (name !~ '[şŞğĞıİ]'),
  add constraint locations_street_address_us_letters check (street_address !~ '[şŞğĞıİ]'),
  add constraint locations_city_us_letters check (city !~ '[şŞğĞıİ]'),
  add constraint locations_region_us_letters check (region !~ '[şŞğĞıİ]');

alter table public.departments
  add constraint departments_name_us_letters check (name !~ '[şŞğĞıİ]');

alter table public.jobs
  add constraint jobs_name_us_letters check (name !~ '[şŞğĞıİ]');

alter table public.employee_profiles
  add constraint employee_profiles_first_name_us_letters check (first_name !~ '[şŞğĞıİ]'),
  add constraint employee_profiles_middle_name_us_letters check (middle_name !~ '[şŞğĞıİ]'),
  add constraint employee_profiles_last_name_us_letters check (last_name !~ '[şŞğĞıİ]'),
  add constraint employee_profiles_preferred_name_us_letters check (preferred_name !~ '[şŞğĞıİ]');

alter table public.employee_private_profiles
  add constraint employee_private_profiles_legal_first_name_us_letters check (legal_first_name !~ '[şŞğĞıİ]'),
  add constraint employee_private_profiles_legal_middle_name_us_letters check (legal_middle_name !~ '[şŞğĞıİ]'),
  add constraint employee_private_profiles_legal_last_name_us_letters check (legal_last_name !~ '[şŞğĞıİ]'),
  add constraint employee_private_profiles_preferred_name_us_letters check (preferred_name !~ '[şŞğĞıİ]'),
  add constraint employee_private_profiles_street_address_us_letters check (street_address !~ '[şŞğĞıİ]'),
  add constraint employee_private_profiles_city_us_letters check (city !~ '[şŞğĞıİ]'),
  add constraint employee_private_profiles_region_us_letters check (region !~ '[şŞğĞıİ]'),
  add constraint employee_private_profiles_emergency_contact_name_us_letters check (emergency_contact_name !~ '[şŞğĞıİ]'),
  add constraint employee_private_profiles_emergency_relationship_us_letters check (emergency_contact_relationship !~ '[şŞğĞıİ]');

alter table public.employee_preferred_name_requests
  add constraint employee_preferred_name_requests_requested_name_us_letters check (requested_name !~ '[şŞğĞıİ]');

alter table public.employee_private_profiles
  drop constraint employee_private_profiles_phone_check,
  drop constraint employee_private_profiles_emergency_contact_phone_check,
  add constraint employee_private_profiles_phone_us_phone
    check (phone ~ '^\+1[2-9][0-9]{9}$'),
  add constraint employee_private_profiles_emergency_contact_phone_us_phone
    check (emergency_contact_phone ~ '^\+1[2-9][0-9]{9}$');

alter table public.user_profiles
  drop constraint user_profiles_phone_e164_check,
  add constraint user_profiles_phone_e164_us_phone
    check (phone_e164 ~ '^\+1[2-9][0-9]{9}$');

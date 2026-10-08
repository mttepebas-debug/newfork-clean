-- BL-969: KARARLAR "Form ve girdi kuralları (ABD)" hold in the data, not only in
-- the forms (KK-222, KK-223). A name or an address takes no ş, ğ, ı or İ, read
-- in composed form (a letter and a combining mark are the same letter), and a
-- phone is a US number kept once, in E.164. The rows written before the rule
-- are corrected here once, the tables refuse the rest, and the app reads with
-- the one schema it writes with (CLAUDE.md §2.A.4–5).
--
-- Nothing changes when the data needs a person's decision: a required phone
-- that is not a US number, an account number that would clear or replace a
-- different one on a live record, or names that would become one once their
-- letters are replaced, stop the migration with the count (P09).
--
-- The services that write a phone are not re-created here: the API hands them
-- a US number in E.164 and the CHECKs refuse anything else. Re-creating them
-- from a copy would undo other work on the same functions (ACIL-40001 answers
-- a stale onboarding save with PT409; BL-969 code review).
--
-- The column kept for the old account phone goes in the next migration, once
-- the web that no longer reads it is live; until then it says what phone_e164
-- says.

-- A busy table answers in seconds with an error rather than holding the rest.
set local lock_timeout = '5s';

-- Deferred document checks run at once from here, so the tables can change
-- shape after the rows do.
set constraints public.document_assignment_changed immediate;

-- A US number in E.164 from whatever was saved, or null when it is not one:
-- the same reading as toUsPhone in packages/shared/src/us-forms.ts and as
-- app_private.account_phone_e164 below.
create function pg_temp.us_phone(saved text) returns text
language sql immutable as $us$
  select (case when normalize(coalesce(saved, ''), NFKC) ~ '\+[ \t\n\v\f\r().-]*[02-9]' then null else (select case when parts.local_digits ~ '^[2-9][0-9]{9}$' then '+1' || parts.local_digits end from (select case when char_length(d.digits) = 11 and d.digits like '1%' then substr(d.digits, 2) else d.digits end as local_digits from (select regexp_replace(normalize(coalesce(saved, ''), NFKC), '[^0-9]', '', 'g') as digits) d) parts) end)
$us$;

do $check$
declare
  required_phones integer;
  record_phones integer;
  clashes integer;
begin
  select count(*)
  from public.employee_private_profiles private_record
  where (private_record.phone is not null and pg_temp.us_phone(private_record.phone) is null)
     or (private_record.emergency_contact_phone is not null and pg_temp.us_phone(private_record.emergency_contact_phone) is null) into required_phones;
  select count(*)
  from public.user_profiles account
  cross join lateral (select coalesce(pg_temp.us_phone(account.phone_e164), pg_temp.us_phone(account.phone)) as next_phone) next
  where account.phone_e164 is distinct from next.next_phone
    and exists (
      select 1
      from public.employee_profiles record
      join public.workspace_memberships membership
        on membership.workspace_id = record.workspace_id
       and membership.user_id = record.user_id
      join public.employee_private_profiles private_record
        on private_record.employee_id = record.id
       and private_record.workspace_id = record.workspace_id
      where record.user_id = account.user_id
        and record.archived_at is null
        and membership.status in ('active', 'pending_activation')
        and private_record.phone is not null
        and pg_temp.us_phone(private_record.phone) is distinct from next.next_phone
    ) into record_phones;
  select count(*) from (
    select workspace_id, lower(translate(normalize(name, NFC), 'şŞğĞıİ', 'sSgGiI'))
    from public.locations where deleted_at is null
    group by 1, 2
    having count(*) > 1
       and count(*) filter (where archived_at is null) > 0
       and count(*) filter (where normalize(name, NFC) ~ '[şŞğĞıİ]') > 0
    union all
    select workspace_id, lower(translate(normalize(name, NFC), 'şŞğĞıİ', 'sSgGiI'))
    from public.departments where deleted_at is null
    group by 1, 2
    having count(*) > 1
       and count(*) filter (where archived_at is null) > 0
       and count(*) filter (where normalize(name, NFC) ~ '[şŞğĞıİ]') > 0
    union all
    select workspace_id, lower(translate(normalize(name, NFC), 'şŞğĞıİ', 'sSgGiI'))
    from public.jobs where deleted_at is null
    group by 1, 2
    having count(*) > 1
       and count(*) filter (where archived_at is null) > 0
       and count(*) filter (where normalize(name, NFC) ~ '[şŞğĞıİ]') > 0
  ) clashing into clashes;

  if required_phones + record_phones + clashes > 0 then
    raise exception 'BL-969 stopped before changing anything: % required phone(s) are not US numbers; % account number(s) would clear or replace a different number on a live record; % name(s) would become the same as another once their letters are replaced',
      required_phones, record_phones, clashes
      using errcode = 'P0001';
  end if;
end;
$check$;

-- 1. The rows written before the rule -------------------------------------------------

-- A deleted catalog row refuses every edit from the screens. When one of them
-- holds such a letter, this one correction goes past that guard, which is back
-- before the block ends; otherwise the guards are not touched.
do $catalog$
declare
  deleted_rows boolean := exists (
      select 1 from public.locations
      where deleted_at is not null
        and (normalize(name, NFC) ~ '[şŞğĞıİ]' or normalize(street_address, NFC) ~ '[şŞğĞıİ]' or normalize(city, NFC) ~ '[şŞğĞıİ]' or normalize(region, NFC) ~ '[şŞğĞıİ]'))
    or exists (select 1 from public.departments where deleted_at is not null and normalize(name, NFC) ~ '[şŞğĞıİ]')
    or exists (select 1 from public.jobs where deleted_at is not null and normalize(name, NFC) ~ '[şŞğĞıİ]');
begin
  if deleted_rows then
    alter table public.locations disable trigger catalog_deletion_state_guard;
    alter table public.departments disable trigger catalog_deletion_state_guard;
    alter table public.jobs disable trigger jobs_deletion_state_guard;
  end if;

  update public.locations set
      name = case when normalize(name, NFC) ~ '[şŞğĞıİ]' then translate(normalize(name, NFC), 'şŞğĞıİ', 'sSgGiI') else name end,
      street_address = case when normalize(street_address, NFC) ~ '[şŞğĞıİ]' then translate(normalize(street_address, NFC), 'şŞğĞıİ', 'sSgGiI') else street_address end,
      city = case when normalize(city, NFC) ~ '[şŞğĞıİ]' then translate(normalize(city, NFC), 'şŞğĞıİ', 'sSgGiI') else city end,
      region = case when normalize(region, NFC) ~ '[şŞğĞıİ]' then translate(normalize(region, NFC), 'şŞğĞıİ', 'sSgGiI') else region end
  where normalize(name, NFC) ~ '[şŞğĞıİ]'
     or normalize(street_address, NFC) ~ '[şŞğĞıİ]'
     or normalize(city, NFC) ~ '[şŞğĞıİ]'
     or normalize(region, NFC) ~ '[şŞğĞıİ]';

  update public.departments set
      name = case when normalize(name, NFC) ~ '[şŞğĞıİ]' then translate(normalize(name, NFC), 'şŞğĞıİ', 'sSgGiI') else name end
  where normalize(name, NFC) ~ '[şŞğĞıİ]';

  update public.jobs set
      name = case when normalize(name, NFC) ~ '[şŞğĞıİ]' then translate(normalize(name, NFC), 'şŞğĞıİ', 'sSgGiI') else name end
  where normalize(name, NFC) ~ '[şŞğĞıİ]';

  if deleted_rows then
    alter table public.locations enable trigger catalog_deletion_state_guard;
    alter table public.departments enable trigger catalog_deletion_state_guard;
    alter table public.jobs enable trigger jobs_deletion_state_guard;
  end if;
end;
$catalog$;

update public.workspaces set
    name = case when normalize(name, NFC) ~ '[şŞğĞıİ]' then translate(normalize(name, NFC), 'şŞğĞıİ', 'sSgGiI') else name end
where normalize(name, NFC) ~ '[şŞğĞıİ]';

update public.employee_profiles set
    first_name = case when normalize(first_name, NFC) ~ '[şŞğĞıİ]' then translate(normalize(first_name, NFC), 'şŞğĞıİ', 'sSgGiI') else first_name end,
    middle_name = case when normalize(middle_name, NFC) ~ '[şŞğĞıİ]' then translate(normalize(middle_name, NFC), 'şŞğĞıİ', 'sSgGiI') else middle_name end,
    last_name = case when normalize(last_name, NFC) ~ '[şŞğĞıİ]' then translate(normalize(last_name, NFC), 'şŞğĞıİ', 'sSgGiI') else last_name end,
    preferred_name = case when normalize(preferred_name, NFC) ~ '[şŞğĞıİ]' then translate(normalize(preferred_name, NFC), 'şŞğĞıİ', 'sSgGiI') else preferred_name end
where normalize(first_name, NFC) ~ '[şŞğĞıİ]'
   or normalize(middle_name, NFC) ~ '[şŞğĞıİ]'
   or normalize(last_name, NFC) ~ '[şŞğĞıİ]'
   or normalize(preferred_name, NFC) ~ '[şŞğĞıİ]';

update public.employee_preferred_name_requests set
    requested_name = case when normalize(requested_name, NFC) ~ '[şŞğĞıİ]' then translate(normalize(requested_name, NFC), 'şŞğĞıİ', 'sSgGiI') else requested_name end
where normalize(requested_name, NFC) ~ '[şŞğĞıİ]';

-- A private record in one pass: its names and address, and both phones in E.164.
update public.employee_private_profiles set
    legal_first_name = case when normalize(legal_first_name, NFC) ~ '[şŞğĞıİ]' then translate(normalize(legal_first_name, NFC), 'şŞğĞıİ', 'sSgGiI') else legal_first_name end,
    legal_middle_name = case when normalize(legal_middle_name, NFC) ~ '[şŞğĞıİ]' then translate(normalize(legal_middle_name, NFC), 'şŞğĞıİ', 'sSgGiI') else legal_middle_name end,
    legal_last_name = case when normalize(legal_last_name, NFC) ~ '[şŞğĞıİ]' then translate(normalize(legal_last_name, NFC), 'şŞğĞıİ', 'sSgGiI') else legal_last_name end,
    preferred_name = case when normalize(preferred_name, NFC) ~ '[şŞğĞıİ]' then translate(normalize(preferred_name, NFC), 'şŞğĞıİ', 'sSgGiI') else preferred_name end,
    street_address = case when normalize(street_address, NFC) ~ '[şŞğĞıİ]' then translate(normalize(street_address, NFC), 'şŞğĞıİ', 'sSgGiI') else street_address end,
    city = case when normalize(city, NFC) ~ '[şŞğĞıİ]' then translate(normalize(city, NFC), 'şŞğĞıİ', 'sSgGiI') else city end,
    region = case when normalize(region, NFC) ~ '[şŞğĞıİ]' then translate(normalize(region, NFC), 'şŞğĞıİ', 'sSgGiI') else region end,
    emergency_contact_name = case when normalize(emergency_contact_name, NFC) ~ '[şŞğĞıİ]' then translate(normalize(emergency_contact_name, NFC), 'şŞğĞıİ', 'sSgGiI') else emergency_contact_name end,
    emergency_contact_relationship = case when normalize(emergency_contact_relationship, NFC) ~ '[şŞğĞıİ]' then translate(normalize(emergency_contact_relationship, NFC), 'şŞğĞıİ', 'sSgGiI') else emergency_contact_relationship end,
    phone = case when phone is not null and phone !~ '^\+1[2-9][0-9]{9}$' then pg_temp.us_phone(phone) else phone end,
    emergency_contact_phone = case
      when emergency_contact_phone is not null and emergency_contact_phone !~ '^\+1[2-9][0-9]{9}$'
        then pg_temp.us_phone(emergency_contact_phone)
      else emergency_contact_phone
    end
where normalize(legal_first_name, NFC) ~ '[şŞğĞıİ]'
   or normalize(legal_middle_name, NFC) ~ '[şŞğĞıİ]'
   or normalize(legal_last_name, NFC) ~ '[şŞğĞıİ]'
   or normalize(preferred_name, NFC) ~ '[şŞğĞıİ]'
   or normalize(street_address, NFC) ~ '[şŞğĞıİ]'
   or normalize(city, NFC) ~ '[şŞğĞıİ]'
   or normalize(region, NFC) ~ '[şŞğĞıİ]'
   or normalize(emergency_contact_name, NFC) ~ '[şŞğĞıİ]'
   or normalize(emergency_contact_relationship, NFC) ~ '[şŞğĞıİ]'
   or (phone is not null and phone !~ '^\+1[2-9][0-9]{9}$')
   or (emergency_contact_phone is not null and emergency_contact_phone !~ '^\+1[2-9][0-9]{9}$');

-- The account keeps one number: the US one in either column, or none. A number
-- from outside the US is cleared, and the person gives a US one in Account >
-- Profile. The old column says the same until it goes, so the web still live
-- reads no other number from it. The copy trigger carries a changed number to
-- the person's live records; the stop above made sure it replaces nothing else.
update public.user_profiles account
set phone_e164 = next.next_phone,
    phone = next.next_phone,
    updated_at = now()
from (
  select profile.user_id, coalesce(pg_temp.us_phone(profile.phone_e164), pg_temp.us_phone(profile.phone)) as next_phone
  from public.user_profiles profile
) next
where next.user_id = account.user_id
  and (account.phone_e164 is distinct from next.next_phone
       or account.phone is distinct from next.next_phone);

-- 2. One way in for a phone -------------------------------------------------------------

-- Only a US number, in E.164, read the way pg_temp.us_phone and toUsPhone read it.
create or replace function app_private.account_phone_e164(raw_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  typed text := normalize(coalesce(raw_phone, ''), NFKC);
  digits text;
  local_digits text;
begin
  if typed !~ '[^ \t\n\v\f\r]' then
    return null;
  end if;
  if typed ~ '\+[ \t\n\v\f\r().-]*[02-9]' then
    raise exception 'that phone number cannot be dialled' using errcode = '22023';
  end if;
  digits := regexp_replace(typed, '[^0-9]', '', 'g');
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

-- 3. The tables refuse the rest ---------------------------------------------------------

alter table public.employee_preferred_name_requests
  add constraint employee_preferred_name_requests_requested_name_us_letters check (normalize(requested_name, NFC) !~ '[şŞğĞıİ]');

alter table public.departments
  add constraint departments_name_us_letters check (normalize(name, NFC) !~ '[şŞğĞıİ]');

alter table public.jobs
  add constraint jobs_name_us_letters check (normalize(name, NFC) !~ '[şŞğĞıİ]');

alter table public.employee_private_profiles
  drop constraint employee_private_profiles_phone_check,
  drop constraint employee_private_profiles_emergency_contact_phone_check,
  add constraint employee_private_profiles_legal_first_name_us_letters check (normalize(legal_first_name, NFC) !~ '[şŞğĞıİ]'),
  add constraint employee_private_profiles_legal_middle_name_us_letters check (normalize(legal_middle_name, NFC) !~ '[şŞğĞıİ]'),
  add constraint employee_private_profiles_legal_last_name_us_letters check (normalize(legal_last_name, NFC) !~ '[şŞğĞıİ]'),
  add constraint employee_private_profiles_preferred_name_us_letters check (normalize(preferred_name, NFC) !~ '[şŞğĞıİ]'),
  add constraint employee_private_profiles_street_address_us_letters check (normalize(street_address, NFC) !~ '[şŞğĞıİ]'),
  add constraint employee_private_profiles_city_us_letters check (normalize(city, NFC) !~ '[şŞğĞıİ]'),
  add constraint employee_private_profiles_region_us_letters check (normalize(region, NFC) !~ '[şŞğĞıİ]'),
  add constraint employee_private_profiles_emergency_contact_name_us_letters check (normalize(emergency_contact_name, NFC) !~ '[şŞğĞıİ]'),
  add constraint employee_private_profiles_emergency_relationship_us_letters check (normalize(emergency_contact_relationship, NFC) !~ '[şŞğĞıİ]'),
  add constraint employee_private_profiles_phone_us_phone
    check (phone ~ '^\+1[2-9][0-9]{9}$'),
  add constraint employee_private_profiles_emergency_contact_phone_us_phone
    check (emergency_contact_phone ~ '^\+1[2-9][0-9]{9}$');

alter table public.user_profiles
  drop constraint user_profiles_phone_e164_check,
  add constraint user_profiles_phone_e164_us_phone
    check (phone_e164 ~ '^\+1[2-9][0-9]{9}$');

alter table public.employee_profiles
  add constraint employee_profiles_first_name_us_letters check (normalize(first_name, NFC) !~ '[şŞğĞıİ]'),
  add constraint employee_profiles_middle_name_us_letters check (normalize(middle_name, NFC) !~ '[şŞğĞıİ]'),
  add constraint employee_profiles_last_name_us_letters check (normalize(last_name, NFC) !~ '[şŞğĞıİ]'),
  add constraint employee_profiles_preferred_name_us_letters check (normalize(preferred_name, NFC) !~ '[şŞğĞıİ]');

alter table public.locations
  add constraint locations_name_us_letters check (normalize(name, NFC) !~ '[şŞğĞıİ]'),
  add constraint locations_street_address_us_letters check (normalize(street_address, NFC) !~ '[şŞğĞıİ]'),
  add constraint locations_city_us_letters check (normalize(city, NFC) !~ '[şŞğĞıİ]'),
  add constraint locations_region_us_letters check (normalize(region, NFC) !~ '[şŞğĞıİ]');

alter table public.workspaces
  add constraint workspaces_name_us_letters check (normalize(name, NFC) !~ '[şŞğĞıİ]');

drop function pg_temp.us_phone(text);

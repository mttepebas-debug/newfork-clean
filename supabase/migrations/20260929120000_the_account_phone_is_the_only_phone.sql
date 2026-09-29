-- BL-335 / KK-7. A person's phone lived in two places: the account
-- (user_profiles.phone_e164) and one copy per workspace on the employee record
-- (employee_private_profiles.phone). Changing one left the other behind, and the
-- Account redesign takes the per-workspace field off the screen, so nobody could
-- correct the copy any more.
--
-- Coordinator decision KK-7 (2026-09-29):
--   * The account is the only source. The record's phone is a read-only copy.
--   * One SECURITY DEFINER trigger copies it, in the same transaction as the
--     account change, onto the person's own live records only.
--   * Onboarding: when the account has no phone, the number typed there is
--     turned into E.164 and written to the account; the record gets it from the
--     account, never from the form.
--   * No manager path opens and no policy changes. authenticated still has no
--     privilege at all on employee_private_profiles.
--
-- nf-db decisions inside that frame (2026-09-29):
--   * "Live record" = not archived, and the person's membership in that
--     workspace is active or pending_activation. Onboarding runs while the
--     membership is pending_activation; leaving it out would give a joining
--     employee no phone on their record. Suspended and removed memberships keep
--     the number they had.
--   * Clearing the account phone clears the copies. The account is the source,
--     including when it says "no number".
--   * The two places that create a record row (onboarding and the owner's legal
--     name) take the account's number when they insert it; the trigger cannot
--     write a row that does not exist yet. Neither takes a number from its caller.
--   * When the account already has a phone, a number typed in onboarding does
--     not replace it (KK-7: "only when empty"). The person changes it in
--     Account > Profile, which is the one place that writes it.

-- 1. The same normalization the screens use ------------------------------------
--
-- Mirrors normalizeAccountPhone in packages/shared (US default calling code 1):
-- a leading + keeps the digits as given; 11+ digits starting with 1 already carry
-- the country code; anything else is a national number.

create or replace function app_private.account_phone_e164(raw_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  trimmed text := btrim(coalesce(raw_phone, ''));
  digits text;
  normalized text;
begin
  if trimmed = '' then
    return null;
  end if;
  digits := regexp_replace(trimmed, '\D', '', 'g');
  normalized := case
    when left(trimmed, 1) = '+' then '+' || digits
    when digits like '1%' and char_length(digits) > 10 then '+' || digits
    else '+1' || ltrim(digits, '0')
  end;
  if normalized !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'that phone number cannot be dialled' using errcode = '22023';
  end if;
  return normalized;
end;
$$;

revoke all on function app_private.account_phone_e164(text) from public, anon, authenticated;

-- 2. The one copy: account -> the person's own live records -----------------------

create or replace function app_private.account_phone_reaches_employee_records()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.phone_e164 is not distinct from old.phone_e164 then
    return null;
  end if;

  update public.employee_private_profiles private_record
  set phone = new.phone_e164,
      updated_at = now()
  from public.employee_profiles record
  join public.workspace_memberships membership
    on membership.workspace_id = record.workspace_id
   and membership.user_id = record.user_id
  where private_record.employee_id = record.id
    and private_record.workspace_id = record.workspace_id
    and record.user_id = new.user_id
    and record.archived_at is null
    and membership.status in ('active', 'pending_activation')
    and private_record.phone is distinct from new.phone_e164;

  return null;
end;
$$;

revoke all on function app_private.account_phone_reaches_employee_records()
  from public, anon, authenticated;

drop trigger if exists account_phone_reaches_employee_records on public.user_profiles;
create trigger account_phone_reaches_employee_records
after insert or update of phone_e164 on public.user_profiles
for each row execute function app_private.account_phone_reaches_employee_records();

-- 3. Onboarding fills an empty account, never a record ---------------------------

create or replace function app_private.adopt_account_phone(
  target_user_id uuid,
  typed_phone text,
  fallback_display_name text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_phone text;
  typed_e164 text;
begin
  select profile.phone_e164 into account_phone
  from public.user_profiles profile
  where profile.user_id = target_user_id
  for update;

  if account_phone is not null then
    return account_phone;
  end if;

  typed_e164 := app_private.account_phone_e164(typed_phone);
  if typed_e164 is null then
    return null;
  end if;

  -- The account row may not exist yet: nothing creates one at sign-up.
  insert into public.user_profiles (user_id, display_name, phone_e164)
  select
    target_user_id,
    left(coalesce(
      nullif(btrim(account.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(fallback_display_name), ''),
      split_part(account.email, '@', 1)
    ), 100),
    typed_e164
  from auth.users account
  where account.id = target_user_id
  on conflict (user_id) do update
    set phone_e164 = excluded.phone_e164,
        updated_at = now()
    where public.user_profiles.phone_e164 is null;

  return typed_e164;
end;
$$;

revoke all on function app_private.adopt_account_phone(uuid, text, text)
  from public, anon, authenticated;

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
    btrim(profile_payload->>'emergency_contact_phone'),
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

-- 4. Your own record: the personal phone goes to the account, not the record -----

create or replace function public.save_own_employment_contact_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid, contact_name text, contact_relationship text, contact_phone text, contact_email text DEFAULT ''::text, personal_phone text DEFAULT NULL::text)
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
  select * into employee_row
  from public.employee_profiles
  where id = target_employee_id
    and workspace_id = target_workspace_id
    and archived_at is null;

  if employee_row.id is null then
    raise exception 'employee not found' using errcode = 'P0002';
  end if;

  -- The one rule: your own record, whoever you are here.
  if employee_row.user_id is distinct from actor_user_id then
    raise exception 'this record belongs to somebody else' using errcode = '42501';
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
    emergency_contact_phone = btrim(contact_phone),
    emergency_contact_email = btrim(coalesce(contact_email, '')),
    updated_at = now()
  where employee_id = employee_row.id;
end;
$function$;

-- 5. The owner's record opens with the account's number -------------------------

create or replace function app_private.write_owner_legal_name(target_workspace_id uuid, target_employee_id uuid, first_name text, middle_name text, last_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cleaned_first text := btrim(coalesce(first_name, ''));
  cleaned_middle text := btrim(coalesce(middle_name, ''));
  cleaned_last text := btrim(coalesce(last_name, ''));
begin
  if cleaned_first = '' or cleaned_last = '' then
    raise exception 'a legal name needs a first and a last name' using errcode = '22023';
  end if;
  if char_length(cleaned_first) > 80 or char_length(cleaned_middle) > 80
    or char_length(cleaned_last) > 80 then
    raise exception 'each part of a legal name fits in 80 characters' using errcode = '22023';
  end if;

  insert into public.employee_private_profiles (
    employee_id, workspace_id, legal_first_name, legal_middle_name, legal_last_name, phone
  ) values (
    target_employee_id, target_workspace_id, cleaned_first, cleaned_middle, cleaned_last,
    (select profile.phone_e164
     from public.employee_profiles record
     join public.user_profiles profile on profile.user_id = record.user_id
     where record.id = target_employee_id and record.workspace_id = target_workspace_id)
  )
  on conflict (employee_id) do update set
    legal_first_name = excluded.legal_first_name,
    legal_middle_name = excluded.legal_middle_name,
    legal_last_name = excluded.legal_last_name,
    updated_at = now();
end;
$function$;

-- 6. One-time fill: every live record takes its account's number ----------------
--
-- No live data (CLAUDE.md §9). A record whose account has no phone is emptied:
-- the account is the source, including when it says "no number".

update public.employee_private_profiles private_record
set phone = profile.phone_e164,
    updated_at = now()
from public.employee_profiles record
join public.workspace_memberships membership
  on membership.workspace_id = record.workspace_id
 and membership.user_id = record.user_id
left join public.user_profiles profile on profile.user_id = record.user_id
where private_record.employee_id = record.id
  and private_record.workspace_id = record.workspace_id
  and record.archived_at is null
  and membership.status in ('active', 'pending_activation')
  and private_record.phone is distinct from profile.phone_e164;

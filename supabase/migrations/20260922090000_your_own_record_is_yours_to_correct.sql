-- The owner got a way to enter an emergency contact because they never run
-- onboarding and so were never asked for one. Everybody else was asked once,
-- while joining, and then had no way back to it: the only writers of
-- employee_private_profiles were the onboarding step and that owner-only
-- function.
--
-- JOIN-013 left a note about this: the general surface belongs in the account
-- area, and the owner-only path had to fold into it or there would be two ways
-- to write the same row. So this generalises the function rather than adding a
-- second one. Its owner check goes; the check that matters stays, which is that
-- the record is the caller's own.
--
-- A legal name is not editable here. Changing one during onboarding goes
-- through a review (`legal_name_changed` in save_employee_onboarding_profile_
-- service), and a free-form edit in the account area would walk around a gate
-- somebody put there on purpose.

drop function if exists public.save_owner_emergency_contact_service(
  uuid, uuid, uuid, text, text, text, text
);

create function public.save_own_employment_contact_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid,
  contact_name text,
  contact_relationship text,
  contact_phone text,
  contact_email text default ''::text,
  personal_phone text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  employee_row public.employee_profiles%rowtype;
  cleaned_personal_phone text := nullif(btrim(coalesce(personal_phone, '')), '');
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
  -- The column allows nothing shorter, and a half-typed number here would be
  -- refused by the constraint with nowhere to read the refusal.
  if cleaned_personal_phone is not null
    and char_length(cleaned_personal_phone) < 7 then
    raise exception 'a personal phone number is too short to reach anybody'
      using errcode = '22023';
  end if;

  insert into public.employee_private_profiles (
    employee_id, workspace_id, legal_first_name, legal_last_name, phone,
    emergency_contact_name, emergency_contact_relationship,
    emergency_contact_phone, emergency_contact_email
  ) values (
    employee_row.id,
    target_workspace_id,
    employee_row.first_name,
    employee_row.last_name,
    cleaned_personal_phone,
    btrim(contact_name),
    nullif(btrim(coalesce(contact_relationship, '')), ''),
    btrim(contact_phone),
    btrim(coalesce(contact_email, ''))
  )
  on conflict (employee_id) do update set
    -- A legal name already on file is left alone; only onboarding and its
    -- review write that.
    phone = coalesce(
      excluded.phone, public.employee_private_profiles.phone
    ),
    emergency_contact_name = excluded.emergency_contact_name,
    emergency_contact_relationship = coalesce(
      excluded.emergency_contact_relationship,
      public.employee_private_profiles.emergency_contact_relationship
    ),
    emergency_contact_phone = excluded.emergency_contact_phone,
    emergency_contact_email = excluded.emergency_contact_email,
    updated_at = now();
end;
$$;

revoke all on function public.save_own_employment_contact_service(
  uuid, uuid, uuid, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.save_own_employment_contact_service(
  uuid, uuid, uuid, text, text, text, text, text
) to service_role;

-- Reading it back. The record is per workspace, because an employment record
-- is, so an account in three workspaces has three of these and the screen says
-- which is which.
create function public.list_own_employment_records_service(actor_user_id uuid)
returns table (
  workspace_id uuid,
  workspace_name text,
  employee_id uuid,
  phone text,
  emergency_contact_name text,
  emergency_contact_relationship text,
  emergency_contact_phone text,
  emergency_contact_email text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    employee.workspace_id,
    workspace.name,
    employee.id,
    private_profile.phone,
    coalesce(private_profile.emergency_contact_name, ''),
    coalesce(private_profile.emergency_contact_relationship, ''),
    coalesce(private_profile.emergency_contact_phone, ''),
    coalesce(private_profile.emergency_contact_email, '')
  from public.employee_profiles employee
  join public.workspaces workspace on workspace.id = employee.workspace_id
  join public.workspace_memberships membership
    on membership.workspace_id = employee.workspace_id
   and membership.user_id = employee.user_id
  left join public.employee_private_profiles private_profile
    on private_profile.employee_id = employee.id
  where employee.user_id = actor_user_id
    and employee.archived_at is null
    and membership.status in (
      'active'::public.membership_status,
      'pending_activation'::public.membership_status
    )
    and workspace.lifecycle_status <> 'deleted'
  order by workspace.name;
$$;

revoke all on function public.list_own_employment_records_service(uuid)
  from public, anon, authenticated;
grant execute on function public.list_own_employment_records_service(uuid)
  to service_role;

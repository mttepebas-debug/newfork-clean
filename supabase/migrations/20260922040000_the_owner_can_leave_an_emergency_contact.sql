-- JOIN-013 rule 6: everyone except the owner gives an emergency contact during
-- onboarding, and the owner never runs onboarding. They had no way to record one
-- at all.
--
-- The blocker was the table, not the form: employee_private_profiles demanded a
-- personal phone number on every row, so a person the workspace only knows an
-- emergency contact for could not be recorded. That is a form's completeness
-- rule enforced at the table, and onboarding already tracks completeness in
-- employee_onboarding_requirements. The column becomes optional; the emergency
-- contact columns stay required, because the row is only created when somebody
-- enters one.
alter table public.employee_private_profiles
  alter column phone drop not null;

-- The owner's own emergency contact, entered by hand in their drawer. The legal
-- names come from the employee record rather than being asked twice, and only
-- the owner may write their own.
create or replace function public.save_owner_emergency_contact_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid,
  contact_name text,
  contact_relationship text,
  contact_phone text,
  contact_email text default ''
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  employee_row public.employee_profiles%rowtype;
begin
  select * into employee_row
  from public.employee_profiles
  where id = target_employee_id
    and workspace_id = target_workspace_id
    and archived_at is null;

  if employee_row.id is null then
    raise exception 'employee not found' using errcode = 'P0002';
  end if;

  -- Only the person themselves, and only when that person owns the workspace.
  if employee_row.user_id is distinct from actor_user_id then
    raise exception 'this record belongs to somebody else' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = actor_user_id
      and membership.role = 'owner'::public.workspace_role
      and membership.status = 'active'::public.membership_status
  ) then
    raise exception 'owner access required' using errcode = '42501';
  end if;

  if char_length(btrim(coalesce(contact_name, ''))) < 1
    or char_length(btrim(coalesce(contact_phone, ''))) < 7 then
    raise exception 'an emergency contact needs a name and a phone number'
      using errcode = '22023';
  end if;

  insert into public.employee_private_profiles (
    employee_id, workspace_id, legal_first_name, legal_last_name,
    emergency_contact_name, emergency_contact_relationship,
    emergency_contact_phone, emergency_contact_email
  ) values (
    employee_row.id,
    target_workspace_id,
    employee_row.first_name,
    employee_row.last_name,
    btrim(contact_name),
    nullif(btrim(coalesce(contact_relationship, '')), ''),
    btrim(contact_phone),
    btrim(coalesce(contact_email, ''))
  )
  on conflict (employee_id) do update set
    emergency_contact_name = excluded.emergency_contact_name,
    emergency_contact_relationship = coalesce(
      excluded.emergency_contact_relationship,
      public.employee_private_profiles.emergency_contact_relationship
    ),
    emergency_contact_phone = excluded.emergency_contact_phone,
    emergency_contact_email = excluded.emergency_contact_email,
    updated_at = now();
end;
$function$;

revoke all on function public.save_owner_emergency_contact_service(uuid, uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.save_owner_emergency_contact_service(uuid, uuid, uuid, text, text, text, text) to service_role;

-- EMP-001 B1 (BL-443, BL-444; user decision 2026-09-30). The last three
-- Employees entry points that decided on their own ask the authorization core,
-- so the API's own gate in front of them can go (B2).
--
-- 1. Writing the preferred-name setting asks settings.people, the action it
--    was already classified under.
-- 2. Reading it asks a new action, settings.people.read: about the workspace,
--    for whoever reads employees. The Employees drawer and Settings > General
--    both read it.
-- 3. One's own emergency contact asks a new action, employee.save_own_contact:
--    one's own record only, onboarding included. Somebody else's record and one
--    that does not exist now get the same answer, authz.out_of_scope (BL-444).
--    Somebody whose access was taken away no longer writes (authz.not_active).
--
-- The refusals are 42501 with an authz.* hint; workspace.employees_required
-- and workspace.settings_required are no longer said. 73 -> 75 actions.
-- Signatures, return types and grants are as they were.

insert into app_private.authz_actions
  (key, scope_class, effect, permission_key, owner_only, restricted_ok, self_ok, no_self, rank_below)
values
  ('settings.people.read', 'org', 'read', 'employees.read', false, false, false, false, false),
  ('employee.save_own_contact', 'own', 'write', null, false, true, false, false, false);

CREATE OR REPLACE FUNCTION public.get_employee_name_settings_service(actor_user_id uuid, target_workspace_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.people.read');
  return coalesce(
    (select preferred_name_approval from public.employee_name_settings
     where workspace_id = target_workspace_id),
    'auto'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_employee_name_settings_service(actor_user_id uuid, target_workspace_id uuid, approval text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.people');
  if approval not in ('auto', 'manager') then
    raise exception 'a preferred name is either answered here or let through'
      using errcode = '22023', hint = 'settings.preferred_name.invalid';
  end if;
  insert into public.employee_name_settings (
    workspace_id, preferred_name_approval, updated_by, updated_at
  )
  values (target_workspace_id, approval, actor_user_id, now())
  on conflict (workspace_id) do update set
    preferred_name_approval = excluded.preferred_name_approval,
    updated_by = excluded.updated_by,
    updated_at = now();
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
    emergency_contact_phone = btrim(contact_phone),
    emergency_contact_email = btrim(coalesce(contact_email, '')),
    updated_at = now()
  where employee_id = employee_row.id;
end;
$function$;

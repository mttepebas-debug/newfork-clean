-- TEL-2 (Mert, 2026-10-09): a phone given in onboarding is the person's own.
-- Somebody joining a workspace may not give a number another live record of
-- that workspace already holds, and an emergency contact is somebody else: its
-- number is never the person's own. Emergency contacts are not compared with
-- other people's numbers; two friends may name each other.
--
-- The onboarding screen asks onboarding_phone_in_use_service as the number is
-- typed; the onboarding save refuses the same number; the table refuses an
-- emergency number equal to the record's own wherever it is written.

-- A busy table answers in seconds with an error rather than holding the rest.
set local lock_timeout = '5s';

-- Whether another live record of the workspace holds this number. An archived
-- (terminated) record does not count, and neither does the person's own.
create function app_private.phone_used_in_workspace(
  target_workspace_id uuid,
  target_phone text,
  except_employee_id uuid
) returns boolean
language sql
stable
set search_path to ''
as $$
  select target_phone is not null and exists (
    select 1
    from public.employee_private_profiles private_record
    join public.employee_profiles record
      on record.id = private_record.employee_id
     and record.workspace_id = private_record.workspace_id
    where private_record.workspace_id = target_workspace_id
      and private_record.phone = target_phone
      and record.id is distinct from except_employee_id
      and record.archived_at is null
  );
$$;

revoke all on function app_private.phone_used_in_workspace(uuid, text, uuid) from public;

-- Asked while the number is typed. Only somebody onboarding in the workspace
-- may ask, and the answer names nobody.
create function public.onboarding_phone_in_use_service(
  target_user_id uuid,
  typed_phone text,
  target_workspace_id uuid default null
) returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  target_case public.employee_onboarding_cases%rowtype;
begin
  perform app_private.authorize(target_user_id, app_private.onboarding_self_workspace(target_user_id, target_workspace_id, true), 'onboarding.self');
  select onboarding.* into target_case
  from public.employee_onboarding_cases onboarding
  where onboarding.id = app_private.employee_onboarding_case_id(target_user_id, target_workspace_id);
  if target_case.id is null then
    raise exception 'onboarding unavailable' using errcode = 'P0002';
  end if;
  return app_private.phone_used_in_workspace(
    target_case.workspace_id,
    app_private.account_phone_e164(typed_phone),
    target_case.employee_id
  );
end;
$$;

revoke all on function public.onboarding_phone_in_use_service(uuid, text, uuid) from public;
grant execute on function public.onboarding_phone_in_use_service(uuid, text, uuid) to service_role;

-- The onboarding save refuses both, with a reason the screen names. The body
-- is edited where it stands, not re-created from a copy, so other work on the
-- same function stays (ACIL-40001's PT409; BL-969 code review, item 1).
do $edit$
declare
  target constant regprocedure :=
    'public.save_employee_onboarding_profile_service(uuid, jsonb, integer, uuid)'::regprocedure;
  anchor constant text := '  -- The account is the phone''s only source.';
  checks constant text := $checks$  -- TEL-2: the number is nobody else's in this workspace, and the
  -- emergency contact is somebody else.
  if app_private.phone_used_in_workspace(
    target_case.workspace_id,
    coalesce(account_phone, app_private.account_phone_e164(submitted_phone)),
    target_case.employee_id
  ) then
    raise exception 'phone used by someone else in this workspace'
      using errcode = '23505', hint = 'onboarding.phone_in_use';
  end if;
  if btrim(profile_payload->>'emergency_contact_phone')
    = coalesce(account_phone, app_private.account_phone_e164(submitted_phone)) then
    raise exception 'emergency contact phone is the person''s own'
      using errcode = '23514', hint = 'onboarding.emergency_is_own_phone';
  end if;

$checks$;
  definition text := pg_get_functiondef(target);
begin
  if position(anchor in definition) = 0 or position('onboarding.phone_in_use' in definition) > 0 then
    raise exception 'TEL-2: save_employee_onboarding_profile_service changed; read it before moving on';
  end if;
  execute replace(definition, anchor, checks || anchor);
end
$edit$;

-- The table refuses an emergency number equal to the record's own, from every
-- writer (onboarding, Account > Profile, the owner's own record in Employees,
-- the account phone that reaches the records). Rows that already break it stop
-- the migration with their count, and nothing changes.
do $check$
declare
  clashing integer;
begin
  select count(*) into clashing
  from public.employee_private_profiles
  where emergency_contact_phone = phone;
  if clashing > 0 then
    raise exception 'TEL-2 stopped before changing anything: % record(s) give their own phone as the emergency contact''s', clashing;
  end if;
end
$check$;

alter table public.employee_private_profiles
  add constraint employee_private_profiles_emergency_is_not_own_phone
  check (emergency_contact_phone <> phone);

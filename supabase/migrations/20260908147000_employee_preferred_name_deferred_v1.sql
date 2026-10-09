update public.employee_profiles
set preferred_name = ''
where preferred_name <> '';

alter table public.employee_profiles
  drop constraint if exists employee_profiles_preferred_name_v1_empty;

alter table public.employee_profiles
  add constraint employee_profiles_preferred_name_v1_empty
  check (preferred_name = '');

create or replace function public.save_employee_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid,
  employee_first_name text,
  employee_last_name text,
  employee_preferred_name text,
  employee_invitation_email text,
  employee_start_date date,
  employee_internal_note text,
  location_ids uuid[],
  primary_location_id uuid,
  job_ids uuid[],
  primary_job_id uuid,
  expected_revision integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);

  return public.save_employee(
    target_workspace_id,
    target_employee_id,
    employee_first_name,
    employee_last_name,
    '',
    employee_invitation_email,
    employee_start_date,
    employee_internal_note,
    location_ids,
    primary_location_id,
    job_ids,
    primary_job_id,
    expected_revision
  );
end;
$$;

revoke all on function public.save_employee_service(uuid, uuid, uuid, text, text, text, text, date, text, uuid[], uuid, uuid[], uuid, integer)
from public, anon, authenticated;

grant execute on function public.save_employee_service(uuid, uuid, uuid, text, text, text, text, date, text, uuid[], uuid, uuid[], uuid, integer)
to service_role;

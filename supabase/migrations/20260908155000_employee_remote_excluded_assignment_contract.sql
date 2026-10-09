alter table public.employee_profiles
  add column if not exists is_remote boolean not null default false,
  add column if not exists is_excluded_from_schedule boolean not null default false;

create or replace function public.save_employee(
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
  employee_is_remote boolean,
  employee_is_excluded_from_schedule boolean,
  expected_revision integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  saved_id uuid := target_employee_id;
  current_revision integer;
  next_code bigint;
  assignment_optional boolean := coalesce(employee_is_remote, false) or coalesce(employee_is_excluded_from_schedule, false);
begin
  if actor_id is null or not public.workspace_has_permission(target_workspace_id, 'employees.manage') then
    raise exception 'employee management access required' using errcode = '42501';
  end if;
  if char_length(btrim(employee_first_name)) not between 1 and 80 or char_length(btrim(employee_last_name)) not between 1 and 80 then
    raise exception 'employee first and last name are required' using errcode = '22023';
  end if;
  if not assignment_optional and (
    cardinality(coalesce(location_ids, '{}'::uuid[])) = 0
    or primary_location_id is null
    or cardinality(coalesce(job_ids, '{}'::uuid[])) = 0
    or primary_job_id is null
  ) then
    raise exception 'employee requires a location and job unless remote or excluded from schedule' using errcode = '22023';
  end if;
  if primary_location_id is not null and not primary_location_id = any(coalesce(location_ids, '{}'::uuid[])) then
    raise exception 'primary location must be assigned' using errcode = '22023';
  end if;
  if primary_job_id is not null and not primary_job_id = any(coalesce(job_ids, '{}'::uuid[])) then
    raise exception 'primary job must be assigned' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(location_ids, '{}'::uuid[])) selected(location_id) left join public.locations l on l.id = selected.location_id and l.workspace_id = target_workspace_id and l.archived_at is null where l.id is null or not public.can_access_location(target_workspace_id, selected.location_id)) then
    raise exception 'invalid or inaccessible employee location' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(coalesce(job_ids, '{}'::uuid[])) selected(job_id) left join public.jobs j on j.id = selected.job_id and j.workspace_id = target_workspace_id and j.archived_at is null where j.id is null) then
    raise exception 'invalid employee job' using errcode = '22023';
  end if;

  if saved_id is null then
    insert into public.workspace_employee_counters (workspace_id, next_value) values (target_workspace_id, 2)
    on conflict (workspace_id) do update set next_value = public.workspace_employee_counters.next_value + 1
    returning next_value - 1 into next_code;
    insert into public.employee_profiles (
      workspace_id, employee_code, first_name, last_name, preferred_name,
      invitation_email, start_date, internal_note, is_remote,
      is_excluded_from_schedule, created_by
    )
    values (
      target_workspace_id, 'E-' || lpad(next_code::text, 4, '0'),
      btrim(employee_first_name), btrim(employee_last_name),
      btrim(coalesce(employee_preferred_name, '')),
      nullif(lower(btrim(employee_invitation_email)), ''),
      employee_start_date, btrim(coalesce(employee_internal_note, '')),
      coalesce(employee_is_remote, false),
      coalesce(employee_is_excluded_from_schedule, false),
      actor_id
    )
    returning id into saved_id;
    insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
    values (target_workspace_id, saved_id, actor_id, 'employee.created', 'Employee record created');
  else
    select revision into current_revision from public.employee_profiles
    where id = saved_id and workspace_id = target_workspace_id and archived_at is null
      and public.can_access_employee(target_workspace_id, id) for update;
    if current_revision is null then raise exception 'employee not found' using errcode = 'P0002'; end if;
    if expected_revision is null or expected_revision <> current_revision then raise exception 'employee revision conflict' using errcode = '40001'; end if;
    update public.employee_profiles set
      first_name = btrim(employee_first_name),
      last_name = btrim(employee_last_name),
      preferred_name = btrim(coalesce(employee_preferred_name, '')),
      invitation_email = nullif(lower(btrim(employee_invitation_email)), ''),
      start_date = employee_start_date,
      internal_note = btrim(coalesce(employee_internal_note, '')),
      is_remote = coalesce(employee_is_remote, false),
      is_excluded_from_schedule = coalesce(employee_is_excluded_from_schedule, false),
      revision = revision + 1,
      updated_at = now()
    where id = saved_id;
    insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
    values (target_workspace_id, saved_id, actor_id, 'employee.updated', 'Employee profile and assignments updated');
  end if;

  update public.employee_location_assignments set ended_at = now() where employee_id = saved_id and ended_at is null;
  insert into public.employee_location_assignments (workspace_id, employee_id, location_id, is_primary, created_by)
  select target_workspace_id, saved_id, selected.location_id, selected.location_id = primary_location_id, actor_id from unnest(coalesce(location_ids, '{}'::uuid[])) selected(location_id);
  update public.employee_job_assignments set ended_at = now() where employee_id = saved_id and ended_at is null;
  insert into public.employee_job_assignments (workspace_id, employee_id, job_id, is_primary, created_by)
  select target_workspace_id, saved_id, selected.job_id, selected.job_id = primary_job_id, actor_id from unnest(coalesce(job_ids, '{}'::uuid[])) selected(job_id);
  return saved_id;
end;
$$;

create or replace function public.save_employee(
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
  return public.save_employee(
    target_workspace_id,
    target_employee_id,
    employee_first_name,
    employee_last_name,
    employee_preferred_name,
    employee_invitation_email,
    employee_start_date,
    employee_internal_note,
    location_ids,
    primary_location_id,
    job_ids,
    primary_job_id,
    false,
    false,
    expected_revision
  );
end;
$$;

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
  employee_is_remote boolean,
  employee_is_excluded_from_schedule boolean,
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
    employee_is_remote,
    employee_is_excluded_from_schedule,
    expected_revision
  );
end;
$$;

create or replace function public.get_employee_detail(target_workspace_id uuid, target_employee_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when employee.id is null then null else jsonb_build_object(
    'id', employee.id, 'workspace_id', employee.workspace_id,
    'employee_code', employee.employee_code, 'first_name', employee.first_name,
    'last_name', employee.last_name, 'preferred_name', employee.preferred_name,
    'display_name', concat_ws(' ', employee.first_name, employee.last_name),
    'invitation_email', employee.invitation_email, 'start_date', employee.start_date,
    'primary_location_id', primary_location.location_id, 'primary_location_name', location.name,
    'location_count', (select count(*) from public.employee_location_assignments a where a.employee_id = employee.id and a.ended_at is null),
    'primary_job_id', primary_job.job_id, 'primary_job_name', job.name,
    'job_count', (select count(*) from public.employee_job_assignments a where a.employee_id = employee.id and a.ended_at is null),
    'role_id', role.id,
    'role_name', role.name,
    'display_status', case when employee.archived_at is not null then 'archived' when membership.status = 'active' then 'active' when membership.status = 'pending_activation' then 'onboarding' when invitation.status = 'pending' and invitation.expires_at > now() then 'invited' else 'not_invited' end,
    'archived_at', employee.archived_at, 'revision', employee.revision,
    'user_id', employee.user_id, 'internal_note', employee.internal_note,
    'is_remote', employee.is_remote,
    'is_excluded_from_schedule', employee.is_excluded_from_schedule,
    'private_contact', case when private_profile.employee_id is null then null else jsonb_build_object(
      'phone', private_profile.phone,
      'date_of_birth', private_profile.date_of_birth,
      'emergency_contact_name', private_profile.emergency_contact_name,
      'emergency_contact_relationship', private_profile.emergency_contact_relationship,
      'emergency_contact_phone', private_profile.emergency_contact_phone,
      'emergency_contact_email', private_profile.emergency_contact_email,
      'share_phone_with_teammates', private_profile.share_phone_with_teammates,
      'share_email_with_teammates', private_profile.share_email_with_teammates
    ) end,
    'locations', coalesce((select jsonb_agg(jsonb_build_object('id', a.location_id, 'name', l.name, 'primary', a.is_primary, 'archived', l.archived_at is not null) order by a.is_primary desc, l.name) from public.employee_location_assignments a join public.locations l on l.id = a.location_id where a.employee_id = employee.id and a.ended_at is null), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(jsonb_build_object('id', a.job_id, 'name', j.name, 'primary', a.is_primary, 'archived', j.archived_at is not null) order by a.is_primary desc, j.name) from public.employee_job_assignments a join public.jobs j on j.id = a.job_id where a.employee_id = employee.id and a.ended_at is null), '[]'::jsonb),
    'invitation', case when invitation.id is null then null else jsonb_build_object('id', invitation.id, 'email', invitation.email, 'role_id', invitation.role_id, 'status', invitation.status, 'expires_at', invitation.expires_at, 'sent_at', invitation.sent_at) end,
    'onboarding', jsonb_build_object('status', case when membership.status = 'pending_activation' then 'in_progress' when invitation.status = 'pending' then 'invited' else 'not_requested' end, 'required_documents', (select count(*) from public.document_types d where d.workspace_id = employee.workspace_id and d.required_at_onboarding and d.archived_at is null), 'completed_documents', 0),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', event.id, 'action', event.action, 'occurred_at', event.occurred_at, 'actor_user_id', event.actor_user_id, 'summary', event.summary) order by event.occurred_at desc) from (select * from public.employee_events where employee_id = employee.id order by occurred_at desc limit 50) event), '[]'::jsonb)
  ) end
  from public.employee_profiles employee
  left join public.employee_private_profiles private_profile on private_profile.employee_id = employee.id
  left join public.employee_location_assignments primary_location on primary_location.employee_id = employee.id and primary_location.ended_at is null and primary_location.is_primary
  left join public.locations location on location.id = primary_location.location_id
  left join public.employee_job_assignments primary_job on primary_job.employee_id = employee.id and primary_job.ended_at is null and primary_job.is_primary
  left join public.jobs job on job.id = primary_job.job_id
  left join public.workspace_memberships membership on membership.workspace_id = employee.workspace_id and membership.user_id = employee.user_id
  left join public.workspace_roles role on role.id = membership.role_id
  left join lateral (select * from public.employee_invitations i where i.employee_id = employee.id order by i.created_at desc limit 1) invitation on true
  where employee.id = target_employee_id and employee.workspace_id = target_workspace_id
    and public.workspace_has_permission(target_workspace_id, 'employees.read')
    and public.can_access_employee(target_workspace_id, employee.id);
$$;

revoke all on function public.save_employee_service(uuid, uuid, uuid, text, text, text, text, date, text, uuid[], uuid, uuid[], uuid, boolean, boolean, integer)
from public, anon, authenticated;

grant execute on function public.save_employee_service(uuid, uuid, uuid, text, text, text, text, date, text, uuid[], uuid, uuid[], uuid, boolean, boolean, integer)
to service_role;

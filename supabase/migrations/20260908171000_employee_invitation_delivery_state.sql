alter table public.employee_invitations
  add column if not exists delivery_status text not null default 'sent'
    check (delivery_status in ('pending', 'sent', 'failed')),
  add column if not exists delivery_attempted_at timestamptz,
  add column if not exists delivery_failed_at timestamptz,
  add column if not exists delivery_error text check (
    delivery_error is null or char_length(delivery_error) <= 500
  );

create index if not exists employee_invitations_delivery_status_idx
  on public.employee_invitations (workspace_id, delivery_status, updated_at desc)
  where status = 'pending';

create or replace function public.prepare_employee_invitation_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid,
  employee_email text,
  target_role_id uuid,
  invitation_token_hash text,
  invitation_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_id uuid;
  actor_role public.workspace_role;
  invite_role public.workspace_roles%rowtype;
  assigned_location_ids uuid[];
begin
  if not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'employee_access.manage') then
    raise exception 'employee access management required' using errcode = '42501';
  end if;
  if employee_email <> lower(btrim(employee_email)) or employee_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'valid normalized invitation email required' using errcode = '22023';
  end if;
  if invitation_token_hash !~ '^[0-9a-f]{64}$' or invitation_expires_at <= now() then
    raise exception 'valid invitation token and expiry required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.employee_profiles employee
    where employee.id = target_employee_id
      and employee.workspace_id = target_workspace_id
      and employee.archived_at is null
      and employee.user_id is null
  ) then
    raise exception 'invitable employee not found' using errcode = 'P0002';
  end if;

  if target_role_id is null then
    select * into invite_role from public.workspace_roles
    where workspace_id = target_workspace_id and system_key = 'employee';
  else
    select * into invite_role from public.workspace_roles
    where workspace_id = target_workspace_id and id = target_role_id;
  end if;
  if invite_role.id is null then
    raise exception 'invitation role is unavailable' using errcode = '22023';
  end if;
  if invite_role.access_class = 'owner' then
    raise exception 'owner role cannot be assigned by invitation' using errcode = '42501';
  end if;
  select role into actor_role
  from public.workspace_memberships
  where user_id = actor_user_id
    and workspace_id = target_workspace_id
    and status = 'active';
  if actor_role <> 'owner' and invite_role.access_class = 'admin' then
    raise exception 'admin role assignment requires owner access' using errcode = '42501';
  end if;

  select coalesce(array_agg(location_id order by location_id), '{}') into assigned_location_ids
  from public.employee_location_assignments
  where employee_id = target_employee_id and ended_at is null;
  if cardinality(assigned_location_ids) = 0 then
    raise exception 'employee requires a location before invitation' using errcode = '22023';
  end if;

  update public.employee_invitations
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where employee_id = target_employee_id and status = 'pending';
  insert into public.employee_invitations (
    workspace_id, employee_id, email, role_id, all_locations, location_ids,
    token_hash, expires_at, created_by, delivery_status
  ) values (
    target_workspace_id, target_employee_id, employee_email, invite_role.id,
    false, assigned_location_ids, invitation_token_hash, invitation_expires_at,
    actor_user_id, 'pending'
  ) returning id into invitation_id;
  update public.employee_profiles
  set invitation_email = employee_email, revision = revision + 1, updated_at = now()
  where id = target_employee_id;
  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
  values (target_workspace_id, target_employee_id, actor_user_id, 'employee.invited', 'Employee invitation prepared');
  return invitation_id;
end;
$$;

create or replace function public.mark_employee_invitation_delivery_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_invitation_id uuid,
  delivery_result text,
  delivery_failure_message text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_row public.employee_invitations%rowtype;
begin
  if not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'employee_access.manage') then
    raise exception 'employee access management required' using errcode = '42501';
  end if;
  if delivery_result not in ('sent', 'failed') then
    raise exception 'valid invitation delivery result required' using errcode = '22023';
  end if;

  select * into invitation_row
  from public.employee_invitations
  where id = target_invitation_id
    and workspace_id = target_workspace_id
    and status = 'pending'
  for update;
  if invitation_row.id is null then
    raise exception 'pending invitation not found' using errcode = 'P0002';
  end if;

  update public.employee_invitations
  set delivery_status = delivery_result,
      delivery_attempted_at = now(),
      delivery_failed_at = case when delivery_result = 'failed' then now() else null end,
      delivery_error = case
        when delivery_result = 'failed' then left(coalesce(delivery_failure_message, 'Invitation delivery failed'), 500)
        else null
      end,
      sent_at = case when delivery_result = 'sent' then now() else sent_at end,
      updated_at = now()
  where id = invitation_row.id;

  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
  values (
    target_workspace_id,
    invitation_row.employee_id,
    actor_user_id,
    case when delivery_result = 'failed' then 'employee.invitation_delivery_failed' else 'employee.invitation_delivery_sent' end,
    case when delivery_result = 'failed' then 'Employee invitation delivery failed' else 'Employee invitation delivered' end
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
    'invitation', case when invitation.id is null then null else jsonb_build_object(
      'id', invitation.id,
      'email', invitation.email,
      'role_id', invitation.role_id,
      'status', invitation.status,
      'expires_at', invitation.expires_at,
      'sent_at', invitation.sent_at,
      'delivery_status', invitation.delivery_status,
      'delivery_attempted_at', invitation.delivery_attempted_at,
      'delivery_failed_at', invitation.delivery_failed_at,
      'delivery_error', invitation.delivery_error
    ) end,
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

revoke all on function public.mark_employee_invitation_delivery_service(uuid, uuid, uuid, text, text)
from public, anon, authenticated;

grant execute on function public.mark_employee_invitation_delivery_service(uuid, uuid, uuid, text, text)
to service_role;

-- JOIN-004: an invitation row showed its status and its date, but not the role
-- it grants or the person who sent it, so an admin looking at a pending invite
-- could not answer either question without leaving the drawer.

CREATE OR REPLACE FUNCTION public.get_employee_detail(target_workspace_id uuid, target_employee_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case when employee.id is null then null else jsonb_build_object(
    'id', employee.id,
    'workspace_id', employee.workspace_id,
    'employee_code', employee.employee_code,
    'first_name', employee.first_name,
    'last_name', employee.last_name,
    'preferred_name', employee.preferred_name,
    'display_name', concat_ws(' ', employee.first_name, employee.last_name),
    'invitation_email', employee.invitation_email,
    'account_email', account_user.email,
    'start_date', employee.start_date,
    'primary_location_id', primary_location.location_id,
    'primary_location_name', location.name,
    'location_count', (
      select count(*)
      from public.employee_location_assignments assignment
      where assignment.employee_id = employee.id and assignment.ended_at is null
    ),
    'primary_job_id', primary_job.job_id,
    'primary_job_name', job.name,
    'job_count', (
      select count(*)
      from public.employee_job_assignments assignment
      where assignment.employee_id = employee.id and assignment.ended_at is null
    ),
    'role_id', role.id,
    'role_name', role.name,
    'display_status', case
      when employee.archived_at is not null then 'archived'
      when membership.status = 'active' then 'active'
      when membership.status = 'pending_activation' then 'onboarding'
      when invitation.status = 'pending' and invitation.expires_at > now() then 'invited'
      else 'not_invited'
    end,
    'archived_at', employee.archived_at,
    'revision', employee.revision,
    'user_id', employee.user_id,
    'internal_note', employee.internal_note,
    'is_remote', employee.is_remote,
    'is_excluded_from_schedule', employee.is_excluded_from_schedule,
    'private_contact', case
      when private_profile.employee_id is null or not public.workspace_has_permission(target_workspace_id, 'employees.private.read') then null
      else jsonb_build_object(
        'legal_first_name', private_profile.legal_first_name,
        'legal_last_name', private_profile.legal_last_name,
        'preferred_name', private_profile.preferred_name,
        'phone', private_profile.phone,
        'street_address', private_profile.street_address,
        'city', private_profile.city,
        'region', private_profile.region,
        'postal_code', private_profile.postal_code,
        'country_code', private_profile.country_code,
        'date_of_birth', private_profile.date_of_birth,
        'emergency_contact_name', private_profile.emergency_contact_name,
        'emergency_contact_relationship', private_profile.emergency_contact_relationship,
        'emergency_contact_phone', private_profile.emergency_contact_phone,
        'emergency_contact_email', private_profile.emergency_contact_email,
        'share_phone_with_teammates', private_profile.share_phone_with_teammates,
        'share_email_with_teammates', private_profile.share_email_with_teammates
      )
    end,
    'locations', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', assignment.location_id,
          'name', assigned_location.name,
          'primary', assignment.is_primary,
          'archived', assigned_location.archived_at is not null
        )
        order by assignment.is_primary desc, assigned_location.name
      )
      from public.employee_location_assignments assignment
      join public.locations assigned_location on assigned_location.id = assignment.location_id
      where assignment.employee_id = employee.id and assignment.ended_at is null
    ), '[]'::jsonb),
    'jobs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', assignment.job_id,
          'name', assigned_job.name,
          'primary', assignment.is_primary,
          'archived', assigned_job.archived_at is not null
        )
        order by assignment.is_primary desc, assigned_job.name
      )
      from public.employee_job_assignments assignment
      join public.jobs assigned_job on assigned_job.id = assignment.job_id
      where assignment.employee_id = employee.id and assignment.ended_at is null
    ), '[]'::jsonb),
    'invitation', case
      when invitation.id is null or not public.workspace_has_permission(target_workspace_id, 'employee_access.read') then null
      else jsonb_build_object(
        'id', invitation.id,
        'email', invitation.email,
        'role_id', invitation.role_id,
        'status', invitation.status,
        'expires_at', invitation.expires_at,
        'sent_at', invitation.sent_at,
        'delivery_status', invitation.delivery_status,
        'delivery_attempted_at', invitation.delivery_attempted_at,
        'delivery_failed_at', invitation.delivery_failed_at,
        'delivery_error', invitation.delivery_error,
        'role_name', invitation_role.name,
        'invited_by_name', coalesce(
          nullif(btrim(inviter_profile.display_name), ''),
          inviter_user.email
        )
      )
    end,
    'onboarding', jsonb_build_object(
      'status', case
        when membership.status = 'pending_activation' then 'in_progress'
        when invitation.status = 'pending' then 'invited'
        else 'not_requested'
      end,
      'required_documents', (
        select count(*)
        from public.document_types document_type
        where document_type.workspace_id = employee.workspace_id
          and document_type.required_at_onboarding
          and document_type.archived_at is null
      ),
      'completed_documents', 0
    ),
    'events', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', event.id,
          'action', event.action,
          'occurred_at', event.occurred_at,
          'actor_user_id', event.actor_user_id,
          'summary', event.summary
        )
        order by event.occurred_at desc
      )
      from (
        select *
        from public.employee_events
        where employee_id = employee.id
        order by occurred_at desc
        limit 50
      ) event
    ), '[]'::jsonb)
  ) end
  from public.employee_profiles employee
  left join public.employee_private_profiles private_profile
    on private_profile.employee_id = employee.id
  left join auth.users account_user
    on account_user.id = employee.user_id
  left join public.employee_location_assignments primary_location
    on primary_location.employee_id = employee.id
    and primary_location.ended_at is null
    and primary_location.is_primary
  left join public.locations location on location.id = primary_location.location_id
  left join public.employee_job_assignments primary_job
    on primary_job.employee_id = employee.id
    and primary_job.ended_at is null
    and primary_job.is_primary
  left join public.jobs job on job.id = primary_job.job_id
  left join public.workspace_memberships membership
    on membership.workspace_id = employee.workspace_id
    and membership.user_id = employee.user_id
  left join public.workspace_roles role on role.id = membership.role_id
  left join lateral (
    select *
    from public.employee_invitations candidate
    where candidate.employee_id = employee.id
    order by candidate.created_at desc
    limit 1
  ) invitation on true
  left join public.workspace_roles invitation_role
    on invitation_role.id = invitation.role_id
  left join public.user_profiles inviter_profile
    on inviter_profile.user_id = invitation.created_by
  left join auth.users inviter_user
    on inviter_user.id = invitation.created_by
  where employee.id = target_employee_id
    and employee.workspace_id = target_workspace_id
    and public.workspace_has_permission(target_workspace_id, 'employees.read')
    and public.can_access_employee(target_workspace_id, employee.id);
$function$

;

-- Handing an admin the invitation link itself. Resend already recovers the
-- plaintext token to send it again, so nothing new is stored; this returns it
-- without pretending a delivery happened, and writes the copy to the record
-- because a link is a credential.
create or replace function public.load_employee_invitation_link_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  invitation_row public.employee_invitations%rowtype;
  recovered_token text;
begin
  if not public.service_actor_has_permission(
    actor_user_id,
    target_workspace_id,
    'employee_access.manage'
  ) then
    raise exception 'employee access management required' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  if not public.can_manage_employee_record(
    target_workspace_id,
    target_employee_id
  ) then
    raise exception 'employee access denied' using errcode = '42501';
  end if;

  select * into invitation_row
  from public.employee_invitations
  where workspace_id = target_workspace_id
    and employee_id = target_employee_id
    and status = 'pending'
  order by created_at desc
  limit 1;
  if invitation_row.id is null or invitation_row.expires_at <= now() then
    raise exception 'open invitation not found' using errcode = 'P0002';
  end if;

  select token into recovered_token
  from public.employee_invitation_delivery_secrets
  where invitation_id = invitation_row.id
    and workspace_id = invitation_row.workspace_id;
  if recovered_token is null then
    raise exception 'invitation link is unavailable; use Resend' using errcode = 'P0002';
  end if;

  insert into public.employee_events (
    workspace_id, employee_id, actor_user_id, action, summary
  ) values (
    target_workspace_id,
    target_employee_id,
    actor_user_id,
    'employee.invitation_link_copied',
    'Invitation link copied by an administrator'
  );

  return jsonb_build_object(
    'token', recovered_token,
    'expires_at', invitation_row.expires_at
  );
end;
$function$;

revoke all on function public.load_employee_invitation_link_service(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.load_employee_invitation_link_service(uuid, uuid, uuid) to service_role;

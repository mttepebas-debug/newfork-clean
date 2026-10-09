alter table public.kiosk_enrollment_codes
  add column replacement_for_device_id uuid,
  add foreign key (replacement_for_device_id, workspace_id)
    references public.kiosk_devices(id, workspace_id) on delete restrict;

create function public.get_kiosk_management_service(
  actor_user_id uuid,
  target_workspace_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
<<management>>
declare
  resolved_actor_id uuid := actor_user_id;
  locations jsonb;
  devices jsonb;
  employees jsonb;
  events jsonb;
begin
  if not exists (
    select 1 from public.workspace_memberships membership
    where membership.user_id = actor_user_id
      and membership.workspace_id = target_workspace_id
      and membership.status = 'active'
  ) then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', location.id,
    'name', location.name,
    'timezone', location.timezone,
    'can_enroll', public.service_actor_can_kiosk_location(
      actor_user_id, target_workspace_id, location.id, 'kiosk.device.enroll.location'),
    'can_reset_pin', public.service_actor_can_kiosk_location(
      actor_user_id, target_workspace_id, location.id, 'kiosk.pin.reset.location')
  ) order by location.sort_order, lower(location.name), location.id), '[]'::jsonb)
  into locations
  from public.locations location
  where location.workspace_id = target_workspace_id
    and location.archived_at is null
    and (
      public.service_actor_can_kiosk_location(actor_user_id, target_workspace_id, location.id, 'kiosk.device.read.location')
      or public.service_actor_can_kiosk_location(actor_user_id, target_workspace_id, location.id, 'kiosk.device.enroll.location')
      or public.service_actor_can_kiosk_location(actor_user_id, target_workspace_id, location.id, 'kiosk.device.revoke.location')
      or public.service_actor_can_kiosk_location(actor_user_id, target_workspace_id, location.id, 'kiosk.pin.reset.location')
      or public.service_actor_can_kiosk_location(actor_user_id, target_workspace_id, location.id, 'kiosk.audit.read.location')
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', device.id,
    'workspace_id', device.workspace_id,
    'location_id', device.location_id,
    'location_name', location.name,
    'label', device.label,
    'status', device.status,
    'credential_version', device.credential_version,
    'created_at', device.created_at,
    'last_seen_at', device.last_seen_at,
    'revoked_at', device.revoked_at
  ) order by (device.status = 'active') desc, lower(location.name), lower(device.label), device.id), '[]'::jsonb)
  into devices
  from public.kiosk_devices device
  join public.locations location on location.id = device.location_id
    and location.workspace_id = device.workspace_id
  where device.workspace_id = target_workspace_id
    and public.service_actor_can_kiosk_location(
      actor_user_id, target_workspace_id, device.location_id, 'kiosk.device.read.location');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', employee.id,
    'display_name', concat_ws(' ', coalesce(nullif(employee.preferred_name, ''), employee.first_name), employee.last_name),
    'employee_code', employee.employee_code,
    'location_ids', employee_scope.location_ids,
    'pin_configured', credential.employee_id is not null and credential.active
  ) order by lower(concat_ws(' ', coalesce(nullif(employee.preferred_name, ''), employee.first_name), employee.last_name)), employee.id), '[]'::jsonb)
  into employees
  from public.employee_profiles employee
  join lateral (
    select jsonb_agg(assignment.location_id order by assignment.location_id) as location_ids
    from public.employee_location_assignments assignment
    where assignment.employee_id = employee.id
      and assignment.workspace_id = employee.workspace_id
      and assignment.ended_at is null
      and public.service_actor_can_kiosk_location(
        actor_user_id, target_workspace_id, assignment.location_id, 'kiosk.pin.reset.location')
  ) employee_scope on jsonb_array_length(coalesce(employee_scope.location_ids, '[]'::jsonb)) > 0
  left join public.employee_kiosk_credentials credential
    on credential.employee_id = employee.id and credential.workspace_id = employee.workspace_id
  where employee.workspace_id = target_workspace_id and employee.archived_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', event.id,
    'action', event.action,
    'occurred_at', event.occurred_at,
    'location_id', event.location_id,
    'location_name', location.name,
    'device_id', event.device_id,
    'device_label', device.label,
    'employee_id', event.employee_id,
    'employee_name', case when employee.id is null then null else
      concat_ws(' ', coalesce(nullif(employee.preferred_name, ''), employee.first_name), employee.last_name) end,
    'actor_name', profile.display_name
  ) order by event.occurred_at desc, event.id desc), '[]'::jsonb)
  into events
  from (
    select scoped.* from public.kiosk_security_events scoped
    where scoped.workspace_id = target_workspace_id
      and scoped.location_id is not null
      and public.service_actor_can_kiosk_location(
        resolved_actor_id, target_workspace_id, scoped.location_id, 'kiosk.audit.read.location')
    order by scoped.occurred_at desc, scoped.id desc
    limit 100
  ) event
  left join public.locations location on location.id = event.location_id and location.workspace_id = event.workspace_id
  left join public.kiosk_devices device on device.id = event.device_id and device.workspace_id = event.workspace_id
  left join public.employee_profiles employee on employee.id = event.employee_id and employee.workspace_id = event.workspace_id
  left join public.user_profiles profile on profile.user_id = event.actor_user_id;

  return jsonb_build_object(
    'workspace_id', target_workspace_id,
    'locations', locations,
    'devices', devices,
    'employees', employees,
    'events', events
  );
end;
$$;

create function public.update_kiosk_device_label_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_device_id uuid,
  target_label text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  device public.kiosk_devices;
begin
  select * into device from public.kiosk_devices
  where id = target_device_id and workspace_id = target_workspace_id
  for update;
  if device.id is null then raise exception 'kiosk device not found' using errcode = 'P0002'; end if;
  if not public.service_actor_can_kiosk_location(
    actor_user_id, target_workspace_id, device.location_id, 'kiosk.device.enroll.location'
  ) then raise exception 'kiosk device update denied' using errcode = '42501'; end if;
  if char_length(btrim(target_label)) not between 1 and 80 then
    raise exception 'valid kiosk label required' using errcode = '22023';
  end if;

  update public.kiosk_devices set label = btrim(target_label)
  where id = device.id returning * into device;
  insert into public.kiosk_security_events (
    workspace_id, location_id, device_id, actor_user_id, action, metadata
  ) values (
    device.workspace_id, device.location_id, device.id, actor_user_id,
    'kiosk.device.label_updated', '{}'::jsonb
  );
  return public.kiosk_device_json(device);
end;
$$;

create function public.create_kiosk_reenrollment_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_device_id uuid,
  target_code_hash text,
  target_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  device public.kiosk_devices;
  enrollment public.kiosk_enrollment_codes;
begin
  select * into device from public.kiosk_devices
  where id = target_device_id and workspace_id = target_workspace_id
  for update;
  if device.id is null then raise exception 'kiosk device not found' using errcode = 'P0002'; end if;
  if not public.service_actor_can_kiosk_location(
    actor_user_id, target_workspace_id, device.location_id, 'kiosk.device.enroll.location'
  ) or not public.service_actor_can_kiosk_location(
    actor_user_id, target_workspace_id, device.location_id, 'kiosk.device.revoke.location'
  ) then raise exception 'kiosk re-enrollment denied' using errcode = '42501'; end if;
  if target_expires_at <= now() or target_expires_at > now() + interval '10 minutes 5 seconds' then
    raise exception 'valid kiosk enrollment expiry required' using errcode = '22023';
  end if;

  if device.status = 'active' then
    update public.kiosk_devices set status = 'revoked', revoked_at = now(), revoked_by = actor_user_id
    where id = device.id;
    update public.kiosk_action_sessions set revoked_at = now()
    where device_id = device.id and consumed_at is null and revoked_at is null;
  end if;
  insert into public.kiosk_enrollment_codes (
    workspace_id, location_id, label, code_hash, expires_at, created_by, replacement_for_device_id
  ) values (
    device.workspace_id, device.location_id, device.label, target_code_hash,
    target_expires_at, actor_user_id, device.id
  ) returning * into enrollment;
  insert into public.kiosk_security_events (
    workspace_id, location_id, device_id, actor_user_id, action, metadata
  ) values (
    device.workspace_id, device.location_id, device.id, actor_user_id,
    'kiosk.device.reenrollment_created',
    jsonb_build_object('enrollment_id', enrollment.id, 'expires_at', enrollment.expires_at)
  );
  return jsonb_build_object(
    'id', enrollment.id,
    'workspace_id', enrollment.workspace_id,
    'location_id', enrollment.location_id,
    'label', enrollment.label,
    'expires_at', enrollment.expires_at
  );
end;
$$;

revoke all on function public.get_kiosk_management_service(uuid, uuid) from public, anon, authenticated;
revoke all on function public.update_kiosk_device_label_service(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.create_kiosk_reenrollment_service(uuid, uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.get_kiosk_management_service(uuid, uuid) to service_role;
grant execute on function public.update_kiosk_device_label_service(uuid, uuid, uuid, text) to service_role;
grant execute on function public.create_kiosk_reenrollment_service(uuid, uuid, uuid, text, timestamptz) to service_role;

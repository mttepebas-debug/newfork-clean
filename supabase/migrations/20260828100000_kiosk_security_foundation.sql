insert into public.permissions (key, label, category, description, custom_grantable, sort_order)
values
  ('kiosk.device.enroll.location', 'Enroll kiosk devices', 'Kiosk', 'Enroll shared capture devices for assigned locations.', true, 400),
  ('kiosk.device.read.location', 'View kiosk devices', 'Kiosk', 'View shared capture devices for assigned locations.', true, 410),
  ('kiosk.device.revoke.location', 'Revoke kiosk devices', 'Kiosk', 'Revoke shared capture devices for assigned locations.', true, 420),
  ('kiosk.pin.reset.location', 'Reset kiosk PINs', 'Kiosk', 'Reset employee kiosk PINs for assigned locations.', true, 430),
  ('kiosk.audit.read.location', 'View kiosk audit history', 'Kiosk', 'View kiosk security history for assigned locations.', true, 440)
on conflict (key) do update set
  label = excluded.label,
  category = excluded.category,
  description = excluded.description,
  custom_grantable = excluded.custom_grantable,
  sort_order = excluded.sort_order;

insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
select role.workspace_id, role.id, permission.key
from public.workspace_roles role
cross join (
  values
    ('kiosk.device.enroll.location'),
    ('kiosk.device.read.location'),
    ('kiosk.device.revoke.location'),
    ('kiosk.pin.reset.location'),
    ('kiosk.audit.read.location')
) permission(key)
where role.system_key in ('owner', 'admin', 'manager')
on conflict do nothing;

create function public.grant_new_kiosk_system_role_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.system_key = 'manager' then
    insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
    select new.workspace_id, new.id, permission.key
    from public.permissions permission
    where permission.key like 'kiosk.%'
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger grant_new_kiosk_system_role_permissions_trigger
after insert on public.workspace_roles
for each row execute function public.grant_new_kiosk_system_role_permissions();

create type public.kiosk_device_status as enum ('active', 'revoked');
create type public.kiosk_enrollment_status as enum ('pending', 'consumed', 'expired');
create type public.kiosk_verification_outcome as enum ('pending', 'success', 'failure', 'rate_limited');

create table public.kiosk_devices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  location_id uuid not null,
  label text not null check (char_length(btrim(label)) between 1 and 80),
  credential_hash text not null unique check (credential_hash ~ '^[0-9a-f]{64}$'),
  credential_version integer not null default 1 check (credential_version > 0),
  status public.kiosk_device_status not null default 'active',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  unique (id, workspace_id),
  foreign key (location_id, workspace_id)
    references public.locations(id, workspace_id) on delete restrict,
  check ((status = 'active' and revoked_at is null and revoked_by is null)
    or (status = 'revoked' and revoked_at is not null and revoked_by is not null))
);

create index kiosk_devices_workspace_location_idx
  on public.kiosk_devices (workspace_id, location_id, status, created_at desc);

create table public.kiosk_enrollment_codes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  location_id uuid not null,
  label text not null check (char_length(btrim(label)) between 1 and 80),
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  status public.kiosk_enrollment_status not null default 'pending',
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  device_id uuid,
  unique (id, workspace_id),
  foreign key (location_id, workspace_id)
    references public.locations(id, workspace_id) on delete cascade,
  foreign key (device_id, workspace_id)
    references public.kiosk_devices(id, workspace_id) on delete restrict,
  check ((status = 'consumed' and consumed_at is not null and device_id is not null)
    or (status <> 'consumed' and consumed_at is null and device_id is null))
);

create index kiosk_enrollment_pending_idx
  on public.kiosk_enrollment_codes (expires_at)
  where status = 'pending';

create table public.employee_kiosk_credentials (
  employee_id uuid primary key,
  workspace_id uuid not null,
  pin_hash text not null check (char_length(pin_hash) between 40 and 255),
  version integer not null default 1 check (version > 0),
  active boolean not null default true,
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, workspace_id),
  foreign key (employee_id, workspace_id)
    references public.employee_profiles(id, workspace_id) on delete cascade
);

create table public.kiosk_verification_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  location_id uuid not null,
  device_id uuid not null,
  device_credential_version integer not null check (device_credential_version > 0),
  claimed_employee_id uuid not null,
  employee_id uuid,
  employee_credential_version integer check (employee_credential_version > 0),
  eligible boolean not null default false,
  outcome public.kiosk_verification_outcome not null,
  attempted_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, workspace_id),
  foreign key (device_id, workspace_id)
    references public.kiosk_devices(id, workspace_id) on delete cascade,
  foreign key (location_id, workspace_id)
    references public.locations(id, workspace_id) on delete cascade,
  foreign key (employee_id, workspace_id)
    references public.employee_profiles(id, workspace_id) on delete cascade,
  check ((outcome = 'pending' and completed_at is null)
    or (outcome <> 'pending' and completed_at is not null))
);

create index kiosk_attempt_device_time_idx
  on public.kiosk_verification_attempts (device_id, attempted_at desc);
create index kiosk_attempt_employee_time_idx
  on public.kiosk_verification_attempts (device_id, claimed_employee_id, attempted_at desc);

create table public.kiosk_action_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  location_id uuid not null,
  device_id uuid not null,
  employee_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (device_id, workspace_id)
    references public.kiosk_devices(id, workspace_id) on delete cascade,
  foreign key (location_id, workspace_id)
    references public.locations(id, workspace_id) on delete cascade,
  foreign key (employee_id, workspace_id)
    references public.employee_profiles(id, workspace_id) on delete cascade,
  check (expires_at > created_at),
  check (consumed_at is null or revoked_at is null)
);

create index kiosk_action_session_active_idx
  on public.kiosk_action_sessions (device_id, employee_id, expires_at)
  where consumed_at is null and revoked_at is null;

create table public.kiosk_security_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  location_id uuid,
  device_id uuid,
  employee_id uuid,
  actor_user_id uuid references auth.users(id),
  action text not null check (char_length(btrim(action)) between 1 and 120),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  foreign key (location_id, workspace_id)
    references public.locations(id, workspace_id) on delete cascade,
  foreign key (device_id, workspace_id)
    references public.kiosk_devices(id, workspace_id) on delete cascade,
  foreign key (employee_id, workspace_id)
    references public.employee_profiles(id, workspace_id) on delete cascade
);

create index kiosk_security_events_scope_idx
  on public.kiosk_security_events (workspace_id, location_id, occurred_at desc);

alter table public.kiosk_devices enable row level security;
alter table public.kiosk_enrollment_codes enable row level security;
alter table public.employee_kiosk_credentials enable row level security;
alter table public.kiosk_verification_attempts enable row level security;
alter table public.kiosk_action_sessions enable row level security;
alter table public.kiosk_security_events enable row level security;

revoke all on public.kiosk_devices, public.kiosk_enrollment_codes,
  public.employee_kiosk_credentials, public.kiosk_verification_attempts,
  public.kiosk_action_sessions, public.kiosk_security_events
from public, anon, authenticated;

create function public.service_actor_can_kiosk_location(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_location_id uuid,
  target_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_memberships membership
    join public.workspace_role_permissions permission
      on permission.workspace_id = membership.workspace_id
      and permission.role_id = membership.role_id
    where membership.user_id = actor_user_id
      and membership.workspace_id = target_workspace_id
      and membership.status = 'active'
      and permission.permission_key = target_permission
      and (
        membership.all_locations
        or exists (
          select 1 from public.membership_location_scopes scope
          where scope.membership_id = membership.id
            and scope.workspace_id = target_workspace_id
            and scope.location_id = target_location_id
        )
      )
  );
$$;

create function public.kiosk_device_json(device public.kiosk_devices)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', device.id,
    'workspace_id', device.workspace_id,
    'location_id', device.location_id,
    'label', device.label,
    'status', device.status,
    'credential_version', device.credential_version,
    'created_at', device.created_at,
    'last_seen_at', device.last_seen_at,
    'revoked_at', device.revoked_at
  );
$$;

create function public.create_kiosk_enrollment_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_location_id uuid,
  target_label text,
  target_code_hash text,
  target_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  enrollment public.kiosk_enrollment_codes;
begin
  if not public.service_actor_can_kiosk_location(
    actor_user_id, target_workspace_id, target_location_id, 'kiosk.device.enroll.location'
  ) then
    raise exception 'kiosk enrollment denied' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.locations location
    where location.id = target_location_id
      and location.workspace_id = target_workspace_id
      and location.archived_at is null
  ) then
    raise exception 'active location required' using errcode = 'P0002';
  end if;
  if char_length(btrim(target_label)) not between 1 and 80 then
    raise exception 'valid kiosk label required' using errcode = '22023';
  end if;
  if target_expires_at <= now() or target_expires_at > now() + interval '10 minutes 5 seconds' then
    raise exception 'valid kiosk enrollment expiry required' using errcode = '22023';
  end if;

  insert into public.kiosk_enrollment_codes (
    workspace_id, location_id, label, code_hash, expires_at, created_by
  ) values (
    target_workspace_id, target_location_id, btrim(target_label),
    target_code_hash, target_expires_at, actor_user_id
  ) returning * into enrollment;

  insert into public.kiosk_security_events (
    workspace_id, location_id, actor_user_id, action, metadata
  ) values (
    target_workspace_id, target_location_id, actor_user_id,
    'kiosk.enrollment.created',
    jsonb_build_object('enrollment_id', enrollment.id, 'label', enrollment.label,
      'expires_at', enrollment.expires_at)
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

create function public.exchange_kiosk_enrollment_service(
  target_code_hash text,
  target_credential_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  enrollment public.kiosk_enrollment_codes;
  device public.kiosk_devices;
begin
  select * into enrollment
  from public.kiosk_enrollment_codes candidate
  where candidate.code_hash = target_code_hash
  for update;

  if enrollment.id is null or enrollment.status <> 'pending'
    or enrollment.expires_at <= now()
    or not exists (
      select 1 from public.locations location
      where location.id = enrollment.location_id
        and location.workspace_id = enrollment.workspace_id
        and location.archived_at is null
    ) then
    if enrollment.id is not null and enrollment.status = 'pending' and enrollment.expires_at <= now() then
      update public.kiosk_enrollment_codes set status = 'expired' where id = enrollment.id;
    end if;
    raise exception 'active kiosk enrollment not found' using errcode = 'P0002';
  end if;

  insert into public.kiosk_devices (
    workspace_id, location_id, label, credential_hash, created_by
  ) values (
    enrollment.workspace_id, enrollment.location_id, enrollment.label,
    target_credential_hash, enrollment.created_by
  ) returning * into device;

  update public.kiosk_enrollment_codes
  set status = 'consumed', consumed_at = now(), device_id = device.id
  where id = enrollment.id;

  insert into public.kiosk_security_events (
    workspace_id, location_id, device_id, actor_user_id, action, metadata
  ) values (
    device.workspace_id, device.location_id, device.id, enrollment.created_by,
    'kiosk.device.enrolled',
    jsonb_build_object('enrollment_id', enrollment.id, 'label', device.label)
  );

  return jsonb_build_object('device', public.kiosk_device_json(device));
end;
$$;

create function public.rotate_kiosk_device_credential_service(
  target_credential_hash text,
  replacement_credential_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  device public.kiosk_devices;
begin
  select * into device
  from public.kiosk_devices candidate
  where candidate.credential_hash = target_credential_hash
    and candidate.status = 'active'
  for update;
  if device.id is null then
    raise exception 'active kiosk device not found' using errcode = 'P0002';
  end if;

  update public.kiosk_devices
  set credential_hash = replacement_credential_hash,
      credential_version = credential_version + 1,
      last_seen_at = now()
  where id = device.id
  returning * into device;

  update public.kiosk_action_sessions
  set revoked_at = now()
  where device_id = device.id and consumed_at is null and revoked_at is null;

  insert into public.kiosk_security_events (
    workspace_id, location_id, device_id, action, metadata
  ) values (
    device.workspace_id, device.location_id, device.id,
    'kiosk.device.credential_rotated',
    jsonb_build_object('credential_version', device.credential_version)
  );
  return public.kiosk_device_json(device);
end;
$$;

create function public.revoke_kiosk_device_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_device_id uuid
)
returns void
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
  if device.id is null then
    raise exception 'kiosk device not found' using errcode = 'P0002';
  end if;
  if not public.service_actor_can_kiosk_location(
    actor_user_id, target_workspace_id, device.location_id, 'kiosk.device.revoke.location'
  ) then
    raise exception 'kiosk revocation denied' using errcode = '42501';
  end if;
  if device.status = 'revoked' then return; end if;

  update public.kiosk_devices
  set status = 'revoked', revoked_at = now(), revoked_by = actor_user_id
  where id = device.id;
  update public.kiosk_action_sessions
  set revoked_at = now()
  where device_id = device.id and consumed_at is null and revoked_at is null;

  insert into public.kiosk_security_events (
    workspace_id, location_id, device_id, actor_user_id, action, metadata
  ) values (
    target_workspace_id, device.location_id, device.id, actor_user_id,
    'kiosk.device.revoked', jsonb_build_object('credential_version', device.credential_version)
  );
end;
$$;

create function public.set_employee_kiosk_pin_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_location_id uuid,
  target_employee_id uuid,
  target_pin_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_at timestamptz := now();
begin
  if not public.service_actor_can_kiosk_location(
    actor_user_id, target_workspace_id, target_location_id, 'kiosk.pin.reset.location'
  ) then
    raise exception 'kiosk PIN reset denied' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.employee_profiles employee
    join public.employee_location_assignments assignment
      on assignment.workspace_id = employee.workspace_id
      and assignment.employee_id = employee.id
      and assignment.location_id = target_location_id
      and assignment.ended_at is null
    join public.locations location
      on location.id = assignment.location_id
      and location.workspace_id = assignment.workspace_id
      and location.archived_at is null
    where employee.id = target_employee_id
      and employee.workspace_id = target_workspace_id
      and employee.archived_at is null
  ) then
    raise exception 'active employee location assignment required' using errcode = 'P0002';
  end if;

  insert into public.employee_kiosk_credentials (
    employee_id, workspace_id, pin_hash, updated_by, updated_at
  ) values (
    target_employee_id, target_workspace_id, target_pin_hash, actor_user_id, changed_at
  )
  on conflict (employee_id) do update set
    pin_hash = excluded.pin_hash,
    version = public.employee_kiosk_credentials.version + 1,
    active = true,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  update public.kiosk_action_sessions
  set revoked_at = changed_at
  where employee_id = target_employee_id and consumed_at is null and revoked_at is null;

  insert into public.kiosk_security_events (
    workspace_id, location_id, employee_id, actor_user_id, action, metadata
  ) values (
    target_workspace_id, target_location_id, target_employee_id, actor_user_id,
    'kiosk.employee_pin.reset', '{}'::jsonb
  );

  return jsonb_build_object(
    'employee_id', target_employee_id,
    'workspace_id', target_workspace_id,
    'location_id', target_location_id,
    'updated_at', changed_at
  );
end;
$$;

create function public.begin_kiosk_pin_verification_service(
  target_credential_hash text,
  target_employee_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  device public.kiosk_devices;
  credential public.employee_kiosk_credentials;
  attempt_id uuid;
  is_eligible boolean := false;
  is_rate_limited boolean := false;
begin
  select candidate.* into device
  from public.kiosk_devices candidate
  join public.locations location
    on location.id = candidate.location_id
    and location.workspace_id = candidate.workspace_id
    and location.archived_at is null
  where candidate.credential_hash = target_credential_hash
    and candidate.status = 'active'
  for update of candidate;
  if device.id is null then
    raise exception 'active kiosk device not found' using errcode = 'P0002';
  end if;

  select
    count(*) filter (where attempted_at >= now() - interval '15 minutes') >= 20
    or count(*) filter (
      where claimed_employee_id = target_employee_id
        and attempted_at >= now() - interval '5 minutes'
    ) >= 5
  into is_rate_limited
  from public.kiosk_verification_attempts
  where device_id = device.id
    and outcome in ('pending', 'failure', 'rate_limited')
    and attempted_at >= now() - interval '15 minutes';

  if is_rate_limited then
    insert into public.kiosk_verification_attempts (
      workspace_id, location_id, device_id, device_credential_version, claimed_employee_id,
      eligible, outcome, completed_at
    ) values (
      device.workspace_id, device.location_id, device.id, device.credential_version,
      target_employee_id,
      false, 'rate_limited', now()
    );
    insert into public.kiosk_security_events (
      workspace_id, location_id, device_id, action, metadata
    ) values (
      device.workspace_id, device.location_id, device.id,
      'kiosk.verification.rate_limited', '{}'::jsonb
    );
    return jsonb_build_object(
      'attempt_id', null, 'rate_limited', true, 'eligible', false, 'pin_hash', null
    );
  end if;

  select kiosk_credential.* into credential
  from public.employee_kiosk_credentials kiosk_credential
  join public.employee_profiles employee
    on employee.id = kiosk_credential.employee_id
    and employee.workspace_id = kiosk_credential.workspace_id
    and employee.archived_at is null
  join public.employee_location_assignments assignment
    on assignment.employee_id = employee.id
    and assignment.workspace_id = employee.workspace_id
    and assignment.location_id = device.location_id
    and assignment.ended_at is null
  where kiosk_credential.employee_id = target_employee_id
    and kiosk_credential.workspace_id = device.workspace_id
    and kiosk_credential.active;
  is_eligible := credential.employee_id is not null;

  insert into public.kiosk_verification_attempts (
    workspace_id, location_id, device_id, device_credential_version,
    claimed_employee_id, employee_id, employee_credential_version, eligible, outcome
  ) values (
    device.workspace_id, device.location_id, device.id, device.credential_version,
    target_employee_id,
    case when is_eligible then target_employee_id else null end,
    case when is_eligible then credential.version else null end,
    is_eligible, 'pending'
  ) returning id into attempt_id;

  update public.kiosk_devices set last_seen_at = now() where id = device.id;
  return jsonb_build_object(
    'attempt_id', attempt_id,
    'rate_limited', false,
    'eligible', is_eligible,
    'pin_hash', case when is_eligible then credential.pin_hash else null end
  );
end;
$$;

create function public.finish_kiosk_pin_verification_service(
  target_attempt_id uuid,
  target_verified boolean,
  target_action_token_hash text,
  target_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt public.kiosk_verification_attempts;
  actual_expiry timestamptz;
  accepted boolean := false;
begin
  select * into attempt
  from public.kiosk_verification_attempts
  where id = target_attempt_id and outcome = 'pending'
  for update;
  if attempt.id is null then
    return jsonb_build_object('verified', false, 'expires_at', null);
  end if;

  accepted := target_verified
    and attempt.eligible
    and attempt.employee_id is not null
    and attempt.attempted_at > now() - interval '60 seconds'
    and exists (
      select 1 from public.kiosk_devices device
      where device.id = attempt.device_id
        and device.workspace_id = attempt.workspace_id
        and device.status = 'active'
        and device.credential_version = attempt.device_credential_version
    )
    and exists (
      select 1 from public.employee_profiles employee
      join public.employee_location_assignments assignment
        on assignment.employee_id = employee.id
        and assignment.workspace_id = employee.workspace_id
        and assignment.location_id = attempt.location_id
        and assignment.ended_at is null
      where employee.id = attempt.employee_id
        and employee.workspace_id = attempt.workspace_id
        and employee.archived_at is null
    );
  accepted := accepted and exists (
    select 1 from public.employee_kiosk_credentials credential
    where credential.employee_id = attempt.employee_id
      and credential.workspace_id = attempt.workspace_id
      and credential.active
      and credential.version = attempt.employee_credential_version
  );

  if accepted then
    actual_expiry := least(target_expires_at, now() + interval '60 seconds');
    if actual_expiry <= now() then accepted := false; end if;
  end if;

  if accepted then
    update public.kiosk_action_sessions
    set revoked_at = now()
    where device_id = attempt.device_id
      and employee_id = attempt.employee_id
      and consumed_at is null and revoked_at is null;
    insert into public.kiosk_action_sessions (
      workspace_id, location_id, device_id, employee_id, token_hash, expires_at
    ) values (
      attempt.workspace_id, attempt.location_id, attempt.device_id,
      attempt.employee_id, target_action_token_hash, actual_expiry
    );
  end if;

  update public.kiosk_verification_attempts
  set outcome = case
        when accepted then 'success'::public.kiosk_verification_outcome
        else 'failure'::public.kiosk_verification_outcome
      end,
      completed_at = now()
  where id = attempt.id;

  insert into public.kiosk_security_events (
    workspace_id, location_id, device_id, employee_id, action, metadata
  ) values (
    attempt.workspace_id, attempt.location_id, attempt.device_id,
    case when accepted then attempt.employee_id else null end,
    case when accepted then 'kiosk.verification.succeeded' else 'kiosk.verification.failed' end,
    '{}'::jsonb
  );

  return jsonb_build_object(
    'verified', accepted,
    'expires_at', case when accepted then actual_expiry else null end
  );
end;
$$;

revoke all on function public.grant_new_kiosk_system_role_permissions() from public, anon, authenticated;
revoke all on function public.service_actor_can_kiosk_location(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.kiosk_device_json(public.kiosk_devices) from public, anon, authenticated;
revoke all on function public.create_kiosk_enrollment_service(uuid, uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.exchange_kiosk_enrollment_service(text, text) from public, anon, authenticated;
revoke all on function public.rotate_kiosk_device_credential_service(text, text) from public, anon, authenticated;
revoke all on function public.revoke_kiosk_device_service(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_employee_kiosk_pin_service(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.begin_kiosk_pin_verification_service(text, uuid) from public, anon, authenticated;
revoke all on function public.finish_kiosk_pin_verification_service(uuid, boolean, text, timestamptz) from public, anon, authenticated;

grant execute on function public.create_kiosk_enrollment_service(uuid, uuid, uuid, text, text, timestamptz) to service_role;
grant execute on function public.exchange_kiosk_enrollment_service(text, text) to service_role;
grant execute on function public.rotate_kiosk_device_credential_service(text, text) to service_role;
grant execute on function public.revoke_kiosk_device_service(uuid, uuid, uuid) to service_role;
grant execute on function public.set_employee_kiosk_pin_service(uuid, uuid, uuid, uuid, text) to service_role;
grant execute on function public.begin_kiosk_pin_verification_service(text, uuid) to service_role;
grant execute on function public.finish_kiosk_pin_verification_service(uuid, boolean, text, timestamptz) to service_role;

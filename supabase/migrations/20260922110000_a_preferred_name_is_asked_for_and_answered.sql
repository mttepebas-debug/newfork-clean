-- A preferred name has been storable in name only: the column exists and a
-- check constraint holds it at the empty string, because nothing had decided
-- who may set one or what happens when they do.
--
-- The decision: a workspace chooses between answering these itself and letting
-- them through. On auto, a preferred name takes effect when it is entered and
-- the managers are told. On manager approval, it waits; approved it takes
-- effect, refused it disappears without a word to anybody but the workspace.
--
-- This is not the onboarding approval setting. That one decides whether a
-- finished onboarding needs a human before the person becomes active, and the
-- two are deliberately kept in separate tables so nobody reads one as the
-- other.
--
-- Where the name is then shown — schedule, employee list, time off — is a
-- separate change: twenty-eight functions build a display name themselves, and
-- some of them use preferred_name in a search haystack rather than for
-- display. Converting those is its own pass with its own evidence.

create table public.employee_name_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  preferred_name_approval text not null default 'auto'
    check (preferred_name_approval in ('auto', 'manager')),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table public.employee_name_settings enable row level security;
revoke all on public.employee_name_settings from anon, authenticated;

comment on table public.employee_name_settings is
  'How a workspace answers a preferred name. Not the onboarding approval setting, which lives in employee_onboarding_settings.';

-- The column can hold a name now. The length limit stays; the emptiness does
-- not.
alter table public.employee_profiles
  drop constraint if exists employee_profiles_preferred_name_v1_empty;

create table public.employee_preferred_name_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  employee_id uuid not null references public.employee_profiles(id) on delete cascade,
  requested_name text not null check (char_length(btrim(requested_name)) between 1 and 80),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid not null references auth.users(id),
  requested_at timestamptz not null default now(),
  decided_by uuid references auth.users(id),
  decided_at timestamptz
);

alter table public.employee_preferred_name_requests enable row level security;
revoke all on public.employee_preferred_name_requests from anon, authenticated;

-- One question at a time per person. A second one replaces the first rather
-- than queueing behind it.
create unique index employee_preferred_name_requests_one_pending
  on public.employee_preferred_name_requests (employee_id)
  where status = 'pending';

comment on table public.employee_preferred_name_requests is
  'A preferred name waiting for an answer. A refused one is kept here and nowhere else: the person is not told, and the name never appears.';

insert into public.notification_catalog (
  type_key, schema_version, category, severity, sensitivity, supported_channels,
  default_cadence, audience_contract, action_route_contract, dedupe_policy,
  retention_class, template_key, lifecycle, mandatory_in_app, notification_scope
)
values
  (
    'people.preferred_name.review_required', 1, 'people', 'info', 'confidential',
    '{in_app}', 'immediate', 'workspace_employee_access_managers',
    '{"route": "/app/employees", "allowed_query_keys": ["employee"]}',
    '{"scope": "event_recipient", "strategy": "keep_first", "key_fields": ["event_id", "recipient_user_id"]}',
    'sensitive_30d', 'people.preferred_name.review_required.v1', 'active', false, 'workspace'
  ),
  (
    'people.preferred_name.published', 1, 'people', 'info', 'confidential',
    '{in_app}', 'immediate', 'workspace_employee_access_managers',
    '{"route": "/app/employees", "allowed_query_keys": ["employee"]}',
    '{"scope": "event_recipient", "strategy": "keep_first", "key_fields": ["event_id", "recipient_user_id"]}',
    'sensitive_30d', 'people.preferred_name.published.v1', 'active', false, 'workspace'
  )
on conflict (type_key, schema_version) do nothing;

create function public.get_employee_name_settings_service(
  actor_user_id uuid,
  target_workspace_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.service_actor_has_permission(
    actor_user_id, target_workspace_id, 'employees.read'
  ) then
    raise exception 'employee access required'
      using errcode = '42501', hint = 'workspace.employees_required';
  end if;
  return coalesce(
    (select preferred_name_approval from public.employee_name_settings
     where workspace_id = target_workspace_id),
    'auto'
  );
end;
$$;

create function public.set_employee_name_settings_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  approval text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.service_actor_has_permission(
    actor_user_id, target_workspace_id, 'settings.general.manage'
  ) then
    raise exception 'workspace settings access required'
      using errcode = '42501', hint = 'workspace.settings_required';
  end if;
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
$$;

-- The person asks for their own. On auto it is theirs straight away; on manager
-- approval it waits, and the managers are the ones told about it.
create function public.request_employee_preferred_name_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid,
  preferred_name text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  employee_row public.employee_profiles%rowtype;
  approval text;
  cleaned text := btrim(coalesce(preferred_name, ''));
  request_id uuid;
begin
  select * into employee_row
  from public.employee_profiles
  where id = target_employee_id
    and workspace_id = target_workspace_id
    and archived_at is null;

  if employee_row.id is null then
    raise exception 'employee not found'
      using errcode = 'P0002', hint = 'employee.not_found';
  end if;
  if employee_row.user_id is distinct from actor_user_id then
    raise exception 'this record belongs to somebody else'
      using errcode = '42501', hint = 'employee.not_yours';
  end if;
  if char_length(cleaned) > 80 then
    raise exception 'a preferred name is at most 80 characters'
      using errcode = '22023', hint = 'employee.preferred_name.too_long';
  end if;

  -- Clearing it is always the person's own business; there is nothing for a
  -- manager to answer about a name that will not be shown.
  if cleaned = '' then
    update public.employee_preferred_name_requests
    set status = 'rejected', decided_by = actor_user_id, decided_at = now()
    where employee_id = target_employee_id and status = 'pending';
    update public.employee_profiles set preferred_name = '', updated_at = now()
    where id = target_employee_id;
    return 'cleared';
  end if;

  approval := coalesce(
    (select preferred_name_approval from public.employee_name_settings
     where workspace_id = target_workspace_id),
    'auto'
  );

  -- Whatever was waiting is replaced: the latest answer is the one asked for.
  update public.employee_preferred_name_requests
  set status = 'rejected', decided_by = actor_user_id, decided_at = now()
  where employee_id = target_employee_id and status = 'pending';

  insert into public.employee_preferred_name_requests (
    workspace_id, employee_id, requested_name, status, requested_by,
    decided_by, decided_at
  )
  values (
    target_workspace_id, target_employee_id, cleaned,
    case when approval = 'auto' then 'approved' else 'pending' end,
    actor_user_id,
    case when approval = 'auto' then actor_user_id end,
    case when approval = 'auto' then now() end
  )
  returning id into request_id;

  if approval = 'auto' then
    update public.employee_profiles
    set preferred_name = cleaned, updated_at = now()
    where id = target_employee_id;
  end if;

  perform public.enqueue_notification_outbox_service(
    target_workspace_id,
    gen_random_uuid(),
    case
      when approval = 'auto' then 'people.preferred_name.published'
      else 'people.preferred_name.review_required'
    end,
    1,
    actor_user_id,
    'employee',
    target_employee_id::text,
    jsonb_build_object(
      'employee_id', target_employee_id,
      'requested_name', cleaned,
      'request_id', request_id
    ),
    now()
  );

  return case when approval = 'auto' then 'published' else 'waiting' end;
end;
$$;

-- A manager answers. Approved, the name takes effect. Refused, it disappears:
-- the person is not told, because being told would make a refusal a
-- conversation the workspace did not choose to have.
create function public.decide_employee_preferred_name_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_request_id uuid,
  approve boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.employee_preferred_name_requests%rowtype;
begin
  if not public.service_actor_has_permission(
    actor_user_id, target_workspace_id, 'employees.manage'
  ) then
    raise exception 'employee management access required'
      using errcode = '42501', hint = 'workspace.employees_manage_required';
  end if;

  select * into request_row
  from public.employee_preferred_name_requests
  where id = target_request_id
    and workspace_id = target_workspace_id
    and status = 'pending'
  for update;

  if request_row.id is null then
    raise exception 'that request is no longer waiting for an answer'
      using errcode = 'P0002', hint = 'employee.preferred_name.not_pending';
  end if;

  update public.employee_preferred_name_requests
  set status = case when approve then 'approved' else 'rejected' end,
      decided_by = actor_user_id,
      decided_at = now()
  where id = request_row.id;

  if approve then
    update public.employee_profiles
    set preferred_name = request_row.requested_name, updated_at = now()
    where id = request_row.employee_id;
  end if;
end;
$$;

create function public.list_pending_preferred_names_service(
  actor_user_id uuid,
  target_workspace_id uuid
)
returns table (
  request_id uuid,
  employee_id uuid,
  employee_name text,
  requested_name text,
  requested_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.service_actor_has_permission(
    actor_user_id, target_workspace_id, 'employees.manage'
  ) then
    raise exception 'employee management access required'
      using errcode = '42501', hint = 'workspace.employees_manage_required';
  end if;
  return query
  select
    request.id,
    request.employee_id,
    concat_ws(' ', employee.first_name, employee.last_name),
    request.requested_name,
    request.requested_at
  from public.employee_preferred_name_requests request
  join public.employee_profiles employee on employee.id = request.employee_id
  where request.workspace_id = target_workspace_id
    and request.status = 'pending'
    and employee.archived_at is null
  order by request.requested_at;
end;
$$;

revoke all on function public.get_employee_name_settings_service(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.set_employee_name_settings_service(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.request_employee_preferred_name_service(uuid, uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.decide_employee_preferred_name_service(uuid, uuid, uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.list_pending_preferred_names_service(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.get_employee_name_settings_service(uuid, uuid) to service_role;
grant execute on function public.set_employee_name_settings_service(uuid, uuid, text) to service_role;
grant execute on function public.request_employee_preferred_name_service(uuid, uuid, uuid, text) to service_role;
grant execute on function public.decide_employee_preferred_name_service(uuid, uuid, uuid, boolean) to service_role;
grant execute on function public.list_pending_preferred_names_service(uuid, uuid) to service_role;

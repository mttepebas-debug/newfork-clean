insert into public.permissions (
  key, label, category, description, custom_grantable, sort_order
)
values
  ('employees.read', 'View employees', 'Employees', 'View the employee directory and operational employee details.', true, 110),
  ('employees.manage', 'Manage employees', 'Employees', 'Create and edit employee records and assignments.', true, 120),
  ('employees.archive', 'Archive employees', 'Employees', 'Archive and restore employee records.', true, 130),
  ('employee_access.manage', 'Manage employee access', 'Employees', 'Invite employees and manage workspace role and location access.', true, 140);

insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
select role.workspace_id, role.id, permission.key
from public.workspace_roles role
cross join public.permissions permission
where (
    role.system_key in ('owner', 'admin')
    and permission.key in ('employees.read', 'employees.manage', 'employees.archive', 'employee_access.manage')
  ) or (
    role.system_key = 'manager'
    and permission.key in ('employees.read', 'employees.manage')
  )
on conflict do nothing;

create function public.grant_new_system_role_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.system_key in ('owner', 'admin') then
    insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
    select new.workspace_id, new.id, key from public.permissions on conflict do nothing;
  elsif new.system_key = 'manager' then
    insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
    select new.workspace_id, new.id, key from public.permissions
    where key in ('workspace.read', 'schedule.read', 'schedule.manage', 'employees.read', 'employees.manage')
    on conflict do nothing;
  elsif new.system_key = 'employee' then
    insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
    select new.workspace_id, new.id, key from public.permissions
    where key in ('workspace.read', 'schedule.read')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger grant_new_system_role_permissions_trigger
after insert on public.workspace_roles
for each row execute function public.grant_new_system_role_permissions();

create or replace function public.enforce_role_permission_dependencies()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  checked_role_id uuid := coalesce(new.role_id, old.role_id);
begin
  if exists (select 1 from public.workspace_role_permissions where role_id = checked_role_id and permission_key = 'schedule.manage')
    and not exists (select 1 from public.workspace_role_permissions where role_id = checked_role_id and permission_key = 'schedule.read') then
    raise exception 'schedule.manage requires schedule.read' using errcode = '23514';
  end if;
  if exists (select 1 from public.workspace_role_permissions where role_id = checked_role_id and permission_key = 'documents.manage')
    and not exists (select 1 from public.workspace_role_permissions where role_id = checked_role_id and permission_key = 'documents.read') then
    raise exception 'documents.manage requires documents.read' using errcode = '23514';
  end if;
  if exists (select 1 from public.workspace_role_permissions where role_id = checked_role_id and permission_key = 'signature_templates.manage')
    and not exists (select 1 from public.workspace_role_permissions where role_id = checked_role_id and permission_key = 'signature_templates.read') then
    raise exception 'signature_templates.manage requires signature_templates.read' using errcode = '23514';
  end if;
  if exists (select 1 from public.workspace_role_permissions where role_id = checked_role_id and permission_key in ('employees.manage', 'employees.archive'))
    and not exists (select 1 from public.workspace_role_permissions where role_id = checked_role_id and permission_key = 'employees.read') then
    raise exception 'employee management requires employees.read' using errcode = '23514';
  end if;
  if exists (select 1 from public.workspace_role_permissions where role_id = checked_role_id and permission_key = 'employee_access.manage')
    and not exists (select 1 from public.workspace_role_permissions where role_id = checked_role_id and permission_key = 'employees.read') then
    raise exception 'employee access management requires employees.read' using errcode = '23514';
  end if;
  if exists (select 1 from public.workspace_role_permissions where role_id = checked_role_id and permission_key = 'employee_access.manage')
    and not exists (select 1 from public.workspace_role_permissions where role_id = checked_role_id and permission_key = 'roles.read') then
    raise exception 'employee access management requires roles.read' using errcode = '23514';
  end if;
  return null;
end;
$$;

create type public.employee_invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');

create table public.workspace_employee_counters (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  next_value bigint not null default 1 check (next_value > 0)
);

create table public.employee_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete restrict,
  employee_code text not null check (employee_code ~ '^E-[0-9]{4,}$'),
  first_name text not null check (char_length(btrim(first_name)) between 1 and 80),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 80),
  preferred_name text not null default '' check (char_length(preferred_name) <= 80),
  invitation_email text check (invitation_email is null or invitation_email = lower(btrim(invitation_email))),
  start_date date,
  internal_note text not null default '' check (char_length(internal_note) <= 1000),
  revision integer not null default 1 check (revision > 0),
  archived_at timestamptz,
  archived_by uuid references auth.users(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  unique (workspace_id, employee_code)
);

create unique index employee_profiles_workspace_user_idx
  on public.employee_profiles (workspace_id, user_id) where user_id is not null;
create index employee_profiles_directory_idx
  on public.employee_profiles (workspace_id, archived_at, lower(last_name), lower(first_name));

create table public.employee_location_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  employee_id uuid not null,
  location_id uuid not null,
  is_primary boolean not null default false,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  created_by uuid not null references auth.users(id),
  unique (id, workspace_id),
  foreign key (employee_id, workspace_id) references public.employee_profiles(id, workspace_id) on delete cascade,
  foreign key (location_id, workspace_id) references public.locations(id, workspace_id) on delete restrict
);
create unique index employee_location_active_idx
  on public.employee_location_assignments (employee_id, location_id) where ended_at is null;
create unique index employee_location_primary_idx
  on public.employee_location_assignments (employee_id) where ended_at is null and is_primary;

create table public.employee_job_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  employee_id uuid not null,
  job_id uuid not null,
  is_primary boolean not null default false,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  created_by uuid not null references auth.users(id),
  unique (id, workspace_id),
  foreign key (employee_id, workspace_id) references public.employee_profiles(id, workspace_id) on delete cascade,
  foreign key (job_id, workspace_id) references public.jobs(id, workspace_id) on delete restrict
);
create unique index employee_job_active_idx
  on public.employee_job_assignments (employee_id, job_id) where ended_at is null;
create unique index employee_job_primary_idx
  on public.employee_job_assignments (employee_id) where ended_at is null and is_primary;

create table public.employee_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  employee_id uuid not null,
  email text not null check (email = lower(btrim(email))),
  role_id uuid not null,
  all_locations boolean not null default true,
  location_ids uuid[] not null default '{}',
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status public.employee_invitation_status not null default 'pending',
  expires_at timestamptz not null,
  sent_at timestamptz not null default now(),
  resend_count integer not null default 0 check (resend_count >= 0),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (employee_id, workspace_id) references public.employee_profiles(id, workspace_id) on delete cascade,
  foreign key (role_id, workspace_id) references public.workspace_roles(id, workspace_id) on delete restrict,
  check (all_locations or cardinality(location_ids) > 0)
);
create unique index employee_invitation_pending_idx
  on public.employee_invitations (employee_id) where status = 'pending';

create table public.employee_access_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  employee_id uuid not null,
  membership_id uuid not null,
  role_id uuid not null,
  all_locations boolean not null,
  location_ids uuid[] not null default '{}',
  captured_by uuid not null references auth.users(id),
  captured_at timestamptz not null default now(),
  restored_at timestamptz,
  unique (id, workspace_id),
  foreign key (employee_id, workspace_id) references public.employee_profiles(id, workspace_id) on delete cascade,
  foreign key (membership_id, workspace_id) references public.workspace_memberships(id, workspace_id) on delete restrict,
  foreign key (role_id, workspace_id) references public.workspace_roles(id, workspace_id) on delete restrict
);

create table public.employee_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  employee_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  action text not null check (char_length(btrim(action)) between 1 and 120),
  summary text not null default '' check (char_length(summary) <= 240),
  occurred_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (employee_id, workspace_id) references public.employee_profiles(id, workspace_id) on delete cascade
);
create index employee_events_employee_idx
  on public.employee_events (employee_id, occurred_at desc);

create function public.can_access_employee(target_workspace_id uuid, target_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and (
        membership.all_locations
        or exists (
          select 1 from public.employee_location_assignments assignment
          join public.membership_location_scopes scope
            on scope.membership_id = membership.id
           and scope.workspace_id = membership.workspace_id
           and scope.location_id = assignment.location_id
          where assignment.employee_id = target_employee_id
            and assignment.workspace_id = target_workspace_id
            and assignment.ended_at is null
        )
      )
  );
$$;

alter table public.workspace_employee_counters enable row level security;
alter table public.employee_profiles enable row level security;
alter table public.employee_location_assignments enable row level security;
alter table public.employee_job_assignments enable row level security;
alter table public.employee_invitations enable row level security;
alter table public.employee_access_snapshots enable row level security;
alter table public.employee_events enable row level security;

create policy employee_profiles_select on public.employee_profiles for select to authenticated
using (public.workspace_has_permission(workspace_id, 'employees.read') and public.can_access_employee(workspace_id, id));
create policy employee_locations_select on public.employee_location_assignments for select to authenticated
using (public.workspace_has_permission(workspace_id, 'employees.read') and public.can_access_employee(workspace_id, employee_id));
create policy employee_jobs_select on public.employee_job_assignments for select to authenticated
using (public.workspace_has_permission(workspace_id, 'employees.read') and public.can_access_employee(workspace_id, employee_id));
create policy employee_invitations_select on public.employee_invitations for select to authenticated
using (public.workspace_has_permission(workspace_id, 'employee_access.manage') and public.can_access_employee(workspace_id, employee_id));
create policy employee_events_select on public.employee_events for select to authenticated
using (public.workspace_has_permission(workspace_id, 'employees.read') and public.can_access_employee(workspace_id, employee_id));

revoke all on public.workspace_employee_counters, public.employee_profiles,
  public.employee_location_assignments, public.employee_job_assignments,
  public.employee_invitations, public.employee_access_snapshots, public.employee_events
from anon, authenticated;
grant select on public.employee_profiles, public.employee_location_assignments,
  public.employee_job_assignments, public.employee_events to authenticated;
grant select on public.employee_invitations to authenticated;

create function public.list_employees(
  target_workspace_id uuid,
  include_archived boolean default false,
  search_text text default '',
  status_filter text default 'all',
  page_limit integer default 100,
  page_offset integer default 0
)
returns table (
  id uuid, workspace_id uuid, employee_code text, first_name text, last_name text,
  preferred_name text, display_name text, invitation_email text, start_date date,
  primary_location_id uuid, primary_location_name text, location_count bigint,
  primary_job_id uuid, primary_job_name text, job_count bigint, role_name text,
  display_status text, archived_at timestamptz, revision integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with directory as (
    select employee.id, employee.workspace_id, employee.employee_code,
      employee.first_name, employee.last_name, employee.preferred_name,
      concat_ws(' ', nullif(employee.preferred_name, ''), employee.last_name) as display_name,
      employee.invitation_email, employee.start_date,
      primary_location.location_id as primary_location_id,
      location.name as primary_location_name,
      (select count(*) from public.employee_location_assignments a where a.employee_id = employee.id and a.ended_at is null) as location_count,
      primary_job.job_id as primary_job_id, job.name as primary_job_name,
      (select count(*) from public.employee_job_assignments a where a.employee_id = employee.id and a.ended_at is null) as job_count,
      role.name as role_name,
      case
        when employee.archived_at is not null then 'archived'
        when membership.status = 'active' then 'active'
        when membership.status = 'pending_activation' then 'onboarding'
        when invitation.status = 'pending' and invitation.expires_at > now() then 'invited'
        else 'not_invited'
      end as display_status,
      employee.archived_at, employee.revision
    from public.employee_profiles employee
    left join public.employee_location_assignments primary_location on primary_location.employee_id = employee.id and primary_location.ended_at is null and primary_location.is_primary
    left join public.locations location on location.id = primary_location.location_id
    left join public.employee_job_assignments primary_job on primary_job.employee_id = employee.id and primary_job.ended_at is null and primary_job.is_primary
    left join public.jobs job on job.id = primary_job.job_id
    left join public.workspace_memberships membership on membership.workspace_id = employee.workspace_id and membership.user_id = employee.user_id
    left join public.workspace_roles role on role.id = membership.role_id
    left join lateral (
      select candidate.status, candidate.expires_at
      from public.employee_invitations candidate
      where candidate.employee_id = employee.id
      order by candidate.created_at desc limit 1
    ) invitation on true
    where employee.workspace_id = target_workspace_id
      and public.workspace_has_permission(target_workspace_id, 'employees.read')
      and public.can_access_employee(target_workspace_id, employee.id)
      and (include_archived = (employee.archived_at is not null))
  )
  select * from directory
  where (btrim(search_text) = '' or concat_ws(' ', first_name, last_name, preferred_name, employee_code, invitation_email) ilike '%' || btrim(search_text) || '%')
    and (status_filter = 'all' or display_status = status_filter)
  order by lower(display_name), id
  limit least(greatest(page_limit, 1), 200)
  offset greatest(page_offset, 0);
$$;

create function public.get_employee_detail(target_workspace_id uuid, target_employee_id uuid)
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
    'display_name', concat_ws(' ', nullif(employee.preferred_name, ''), employee.last_name),
    'invitation_email', employee.invitation_email, 'start_date', employee.start_date,
    'primary_location_id', primary_location.location_id, 'primary_location_name', location.name,
    'location_count', (select count(*) from public.employee_location_assignments a where a.employee_id = employee.id and a.ended_at is null),
    'primary_job_id', primary_job.job_id, 'primary_job_name', job.name,
    'job_count', (select count(*) from public.employee_job_assignments a where a.employee_id = employee.id and a.ended_at is null),
    'role_name', role.name,
    'display_status', case when employee.archived_at is not null then 'archived' when membership.status = 'active' then 'active' when membership.status = 'pending_activation' then 'onboarding' when invitation.status = 'pending' and invitation.expires_at > now() then 'invited' else 'not_invited' end,
    'archived_at', employee.archived_at, 'revision', employee.revision,
    'user_id', employee.user_id, 'internal_note', employee.internal_note,
    'locations', coalesce((select jsonb_agg(jsonb_build_object('id', a.location_id, 'name', l.name, 'primary', a.is_primary, 'archived', l.archived_at is not null) order by a.is_primary desc, l.name) from public.employee_location_assignments a join public.locations l on l.id = a.location_id where a.employee_id = employee.id and a.ended_at is null), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(jsonb_build_object('id', a.job_id, 'name', j.name, 'primary', a.is_primary, 'archived', j.archived_at is not null) order by a.is_primary desc, j.name) from public.employee_job_assignments a join public.jobs j on j.id = a.job_id where a.employee_id = employee.id and a.ended_at is null), '[]'::jsonb),
    'invitation', case when invitation.id is null then null else jsonb_build_object('id', invitation.id, 'email', invitation.email, 'status', invitation.status, 'expires_at', invitation.expires_at, 'sent_at', invitation.sent_at) end,
    'onboarding', jsonb_build_object('status', case when membership.status = 'pending_activation' then 'in_progress' when invitation.status = 'pending' then 'invited' else 'not_requested' end, 'required_documents', (select count(*) from public.document_types d where d.workspace_id = employee.workspace_id and d.required_at_onboarding and d.archived_at is null), 'completed_documents', 0),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', event.id, 'action', event.action, 'occurred_at', event.occurred_at, 'actor_user_id', event.actor_user_id, 'summary', event.summary) order by event.occurred_at desc) from (select * from public.employee_events where employee_id = employee.id order by occurred_at desc limit 50) event), '[]'::jsonb)
  ) end
  from public.employee_profiles employee
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

create function public.save_employee(
  target_workspace_id uuid, target_employee_id uuid, employee_first_name text,
  employee_last_name text, employee_preferred_name text, employee_invitation_email text,
  employee_start_date date, employee_internal_note text, location_ids uuid[],
  primary_location_id uuid, job_ids uuid[], primary_job_id uuid, expected_revision integer
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
begin
  if actor_id is null or not public.workspace_has_permission(target_workspace_id, 'employees.manage') then
    raise exception 'employee management access required' using errcode = '42501';
  end if;
  if char_length(btrim(employee_first_name)) not between 1 and 80 or char_length(btrim(employee_last_name)) not between 1 and 80 then
    raise exception 'employee first and last name are required' using errcode = '22023';
  end if;
  if primary_location_id is not null and not primary_location_id = any(coalesce(location_ids, '{}')) then
    raise exception 'primary location must be assigned' using errcode = '22023';
  end if;
  if primary_job_id is not null and not primary_job_id = any(coalesce(job_ids, '{}')) then
    raise exception 'primary job must be assigned' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(location_ids, '{}')) selected(location_id) left join public.locations l on l.id = selected.location_id and l.workspace_id = target_workspace_id and l.archived_at is null where l.id is null or not public.can_access_location(target_workspace_id, selected.location_id)) then
    raise exception 'invalid or inaccessible employee location' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(coalesce(job_ids, '{}')) selected(job_id) left join public.jobs j on j.id = selected.job_id and j.workspace_id = target_workspace_id and j.archived_at is null where j.id is null) then
    raise exception 'invalid employee job' using errcode = '22023';
  end if;

  if saved_id is null then
    insert into public.workspace_employee_counters (workspace_id, next_value) values (target_workspace_id, 2)
    on conflict (workspace_id) do update set next_value = public.workspace_employee_counters.next_value + 1
    returning next_value - 1 into next_code;
    insert into public.employee_profiles (workspace_id, employee_code, first_name, last_name, preferred_name, invitation_email, start_date, internal_note, created_by)
    values (target_workspace_id, 'E-' || lpad(next_code::text, 4, '0'), btrim(employee_first_name), btrim(employee_last_name), btrim(coalesce(employee_preferred_name, '')), nullif(lower(btrim(employee_invitation_email)), ''), employee_start_date, btrim(coalesce(employee_internal_note, '')), actor_id)
    returning id into saved_id;
    insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
    values (target_workspace_id, saved_id, actor_id, 'employee.created', 'Employee record created');
  else
    select revision into current_revision from public.employee_profiles
    where id = saved_id and workspace_id = target_workspace_id and archived_at is null
      and public.can_access_employee(target_workspace_id, id) for update;
    if current_revision is null then raise exception 'employee not found' using errcode = 'P0002'; end if;
    if expected_revision is null or expected_revision <> current_revision then raise exception 'employee revision conflict' using errcode = '40001'; end if;
    update public.employee_profiles set first_name = btrim(employee_first_name), last_name = btrim(employee_last_name),
      preferred_name = btrim(coalesce(employee_preferred_name, '')), invitation_email = nullif(lower(btrim(employee_invitation_email)), ''),
      start_date = employee_start_date, internal_note = btrim(coalesce(employee_internal_note, '')),
      revision = revision + 1, updated_at = now() where id = saved_id;
    insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
    values (target_workspace_id, saved_id, actor_id, 'employee.updated', 'Employee profile and assignments updated');
  end if;

  update public.employee_location_assignments set ended_at = now() where employee_id = saved_id and ended_at is null;
  insert into public.employee_location_assignments (workspace_id, employee_id, location_id, is_primary, created_by)
  select target_workspace_id, saved_id, selected.location_id, selected.location_id = primary_location_id, actor_id from unnest(coalesce(location_ids, '{}')) selected(location_id);
  update public.employee_job_assignments set ended_at = now() where employee_id = saved_id and ended_at is null;
  insert into public.employee_job_assignments (workspace_id, employee_id, job_id, is_primary, created_by)
  select target_workspace_id, saved_id, selected.job_id, selected.job_id = primary_job_id, actor_id from unnest(coalesce(job_ids, '{}')) selected(job_id);
  return saved_id;
end;
$$;

create function public.set_employee_archived(target_workspace_id uuid, target_employee_id uuid, should_archive boolean, restore_access boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  employee_user_id uuid;
  member public.workspace_memberships%rowtype;
  snapshot public.employee_access_snapshots%rowtype;
begin
  if actor_id is null or not public.workspace_has_permission(target_workspace_id, 'employees.archive') then
    raise exception 'employee archive access required' using errcode = '42501';
  end if;
  select user_id into employee_user_id from public.employee_profiles
  where id = target_employee_id and workspace_id = target_workspace_id and public.can_access_employee(target_workspace_id, id) for update;
  if not found then raise exception 'employee not found' using errcode = 'P0002'; end if;
  if employee_user_id = actor_id then raise exception 'self archive is not permitted' using errcode = '42501'; end if;
  select * into member from public.workspace_memberships where workspace_id = target_workspace_id and user_id = employee_user_id;

  if should_archive and member.id is not null and member.status in ('active', 'pending_activation') then
    if not public.workspace_has_permission(target_workspace_id, 'employee_access.manage') then
      raise exception 'linked employee archive requires access management' using errcode = '42501';
    end if;
    insert into public.employee_access_snapshots (workspace_id, employee_id, membership_id, role_id, all_locations, location_ids, captured_by)
    select target_workspace_id, target_employee_id, member.id, member.role_id, member.all_locations,
      coalesce(array_agg(scope.location_id) filter (where scope.location_id is not null), '{}'), actor_id
    from public.membership_location_scopes scope where scope.membership_id = member.id;
    update public.workspace_memberships set status = 'suspended', updated_at = now() where id = member.id;
  end if;

  update public.employee_profiles set archived_at = case when should_archive then now() else null end,
    archived_by = case when should_archive then actor_id else null end,
    revision = revision + 1, updated_at = now() where id = target_employee_id;

  if not should_archive and restore_access then
    if not public.workspace_has_permission(target_workspace_id, 'employee_access.manage') then
      raise exception 'access restoration permission required' using errcode = '42501';
    end if;
    select * into snapshot from public.employee_access_snapshots where employee_id = target_employee_id and restored_at is null order by captured_at desc limit 1 for update;
    if snapshot.id is null then raise exception 'restorable access snapshot not found' using errcode = 'P0002'; end if;
    if not exists (select 1 from public.workspace_roles where id = snapshot.role_id and workspace_id = target_workspace_id) then raise exception 'snapshotted role is no longer available' using errcode = '22023'; end if;
    update public.workspace_memberships set role_id = snapshot.role_id, all_locations = snapshot.all_locations, status = 'active', updated_at = now() where id = snapshot.membership_id;
    delete from public.membership_location_scopes where membership_id = snapshot.membership_id;
    insert into public.membership_location_scopes (membership_id, workspace_id, location_id)
    select snapshot.membership_id, target_workspace_id, id from unnest(snapshot.location_ids) id join public.locations l on l.id = id and l.workspace_id = target_workspace_id and l.archived_at is null;
    update public.employee_access_snapshots set restored_at = now() where id = snapshot.id;
  end if;
  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
  values (target_workspace_id, target_employee_id, actor_id, case when should_archive then 'employee.archived' else 'employee.restored' end, case when should_archive then 'Employee archived and linked access suspended' else 'Employee record restored' end);
end;
$$;

revoke all on function public.can_access_employee(uuid, uuid) from public, anon;
revoke all on function public.list_employees(uuid, boolean, text, text, integer, integer) from public, anon;
revoke all on function public.get_employee_detail(uuid, uuid) from public, anon;
revoke all on function public.save_employee(uuid, uuid, text, text, text, text, date, text, uuid[], uuid, uuid[], uuid, integer) from public, anon;
revoke all on function public.set_employee_archived(uuid, uuid, boolean, boolean) from public, anon;
grant execute on function public.can_access_employee(uuid, uuid) to authenticated;
grant execute on function public.list_employees(uuid, boolean, text, text, integer, integer) to authenticated;
grant execute on function public.get_employee_detail(uuid, uuid) to authenticated;
grant execute on function public.save_employee(uuid, uuid, text, text, text, text, date, text, uuid[], uuid, uuid[], uuid, integer) to authenticated;
grant execute on function public.set_employee_archived(uuid, uuid, boolean, boolean) to authenticated;

create function public.service_actor_has_permission(
  actor_user_id uuid,
  target_workspace_id uuid,
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
    join public.workspace_role_permissions grant_row on grant_row.role_id = membership.role_id
    where membership.user_id = actor_user_id
      and membership.workspace_id = target_workspace_id
      and membership.status = 'active'
      and grant_row.permission_key = target_permission
  );
$$;

create function public.prepare_employee_invitation_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid,
  employee_email text,
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
  employee_role_id uuid;
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
  select id into employee_role_id from public.workspace_roles
  where workspace_id = target_workspace_id and system_key = 'employee';
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
    token_hash, expires_at, created_by
  ) values (
    target_workspace_id, target_employee_id, employee_email, employee_role_id,
    false, assigned_location_ids, invitation_token_hash, invitation_expires_at, actor_user_id
  ) returning id into invitation_id;
  update public.employee_profiles
  set invitation_email = employee_email, revision = revision + 1, updated_at = now()
  where id = target_employee_id;
  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
  values (target_workspace_id, target_employee_id, actor_user_id, 'employee.invited', 'Employee invitation prepared');
  return invitation_id;
end;
$$;

create function public.revoke_employee_invitation_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'employee_access.manage') then
    raise exception 'employee access management required' using errcode = '42501';
  end if;
  update public.employee_invitations
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where employee_id = target_employee_id and workspace_id = target_workspace_id and status = 'pending';
  if not found then raise exception 'pending invitation not found' using errcode = 'P0002'; end if;
  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
  values (target_workspace_id, target_employee_id, actor_user_id, 'employee.invitation_revoked', 'Employee invitation revoked');
end;
$$;

revoke all on function public.service_actor_has_permission(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.prepare_employee_invitation_service(uuid, uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.revoke_employee_invitation_service(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.prepare_employee_invitation_service(uuid, uuid, uuid, text, text, timestamptz) to service_role;
grant execute on function public.revoke_employee_invitation_service(uuid, uuid, uuid) to service_role;

create function public.accept_employee_invitation_service(
  target_user_id uuid,
  invitation_token_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.employee_invitations%rowtype;
  employee_role public.workspace_roles%rowtype;
  normalized_user_email text;
  membership_id uuid;
begin
  select * into invitation from public.employee_invitations
  where token_hash = invitation_token_hash and status = 'pending'
  for update;
  if invitation.id is null or invitation.expires_at <= now() then
    if invitation.id is not null then
      update public.employee_invitations set status = 'expired', updated_at = now() where id = invitation.id;
    end if;
    raise exception 'active invitation not found' using errcode = 'P0002';
  end if;
  select lower(email) into normalized_user_email from auth.users where id = target_user_id;
  if normalized_user_email is null or normalized_user_email <> invitation.email then
    raise exception 'invitation email does not match authenticated account' using errcode = '42501';
  end if;
  select * into employee_role from public.workspace_roles where id = invitation.role_id and workspace_id = invitation.workspace_id;
  if employee_role.id is null then raise exception 'invitation role is unavailable' using errcode = '22023'; end if;
  if exists (select 1 from public.workspace_memberships where workspace_id = invitation.workspace_id and user_id = target_user_id) then
    raise exception 'workspace membership already exists' using errcode = '23505';
  end if;
  update public.employee_profiles set user_id = target_user_id, revision = revision + 1, updated_at = now()
  where id = invitation.employee_id and workspace_id = invitation.workspace_id and user_id is null and archived_at is null;
  if not found then raise exception 'invitable employee is unavailable' using errcode = 'P0002'; end if;
  insert into public.workspace_memberships (workspace_id, user_id, role, role_id, status, all_locations)
  values (invitation.workspace_id, target_user_id, employee_role.access_class, invitation.role_id, 'pending_activation', invitation.all_locations)
  returning id into membership_id;
  insert into public.membership_location_scopes (membership_id, workspace_id, location_id)
  select membership_id, invitation.workspace_id, selected.location_id
  from unnest(invitation.location_ids) selected(location_id)
  join public.locations location on location.id = selected.location_id and location.workspace_id = invitation.workspace_id and location.archived_at is null;
  update public.employee_invitations set status = 'accepted', accepted_at = now(), updated_at = now() where id = invitation.id;
  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
  values (invitation.workspace_id, invitation.employee_id, target_user_id, 'employee.invitation_accepted', 'Employee invitation accepted; activation pending');
  return invitation.workspace_id;
end;
$$;

revoke all on function public.accept_employee_invitation_service(uuid, text) from public, anon, authenticated;
grant execute on function public.accept_employee_invitation_service(uuid, text) to service_role;

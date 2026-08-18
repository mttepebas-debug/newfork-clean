create type public.schedule_publication_status as enum (
  'current', 'superseded', 'unpublished'
);

create table public.employee_schedule_availability_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  employee_id uuid not null,
  version_number integer not null check (version_number > 0),
  timezone text not null check (char_length(btrim(timezone)) between 1 and 80),
  recurring_rules jsonb not null,
  source text not null default 'manager' check (source in ('onboarding', 'employee', 'manager')),
  effective_at timestamptz not null default now(),
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (employee_id, workspace_id)
    references public.employee_profiles(id, workspace_id) on delete cascade,
  unique (employee_id, version_number),
  check (jsonb_typeof(recurring_rules) = 'array' and jsonb_array_length(recurring_rules) = 7)
);

create table public.schedule_closures (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  location_id uuid not null,
  closed_date date not null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  is_all_day boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (location_id, workspace_id)
    references public.locations(id, workspace_id) on delete cascade,
  unique (location_id, closed_date, title)
);

create table public.schedule_location_publications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  location_id uuid not null,
  week_start date not null,
  version_number integer not null check (version_number > 0),
  status public.schedule_publication_status not null default 'current',
  published_by uuid not null references auth.users(id),
  published_at timestamptz not null default now(),
  unpublished_by uuid references auth.users(id),
  unpublished_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (location_id, workspace_id)
    references public.locations(id, workspace_id) on delete restrict,
  unique (id, workspace_id, location_id),
  unique (location_id, week_start, version_number),
  check (
    (status = 'unpublished' and unpublished_by is not null and unpublished_at is not null)
    or (status <> 'unpublished' and unpublished_by is null and unpublished_at is null)
  )
);

create unique index schedule_location_publications_current_idx
  on public.schedule_location_publications (location_id, week_start)
  where status = 'current';
create index schedule_location_publications_history_idx
  on public.schedule_location_publications (workspace_id, week_start, location_id, version_number desc);

create table public.schedule_published_shifts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  location_id uuid not null,
  publication_id uuid not null,
  employee_id uuid,
  job_id uuid not null,
  shift_type_id uuid,
  scheduled_date date not null,
  start_time time not null,
  end_time time not null,
  crosses_midnight boolean generated always as (end_time <= start_time) stored,
  note text not null default '' check (char_length(note) <= 500),
  source_shift_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (publication_id, workspace_id, location_id)
    references public.schedule_location_publications(id, workspace_id, location_id) on delete cascade,
  foreign key (employee_id, workspace_id)
    references public.employee_profiles(id, workspace_id) on delete restrict,
  foreign key (job_id, workspace_id)
    references public.jobs(id, workspace_id) on delete restrict,
  foreign key (shift_type_id, workspace_id)
    references public.shift_types(id, workspace_id) on delete restrict,
  unique (publication_id, source_shift_id),
  check (start_time <> end_time)
);

create index schedule_published_shifts_period_idx
  on public.schedule_published_shifts (workspace_id, scheduled_date, location_id);
create index schedule_published_shifts_employee_idx
  on public.schedule_published_shifts (employee_id, scheduled_date)
  where employee_id is not null;

alter table public.employee_schedule_availability_versions enable row level security;
alter table public.schedule_closures enable row level security;
alter table public.schedule_location_publications enable row level security;
alter table public.schedule_published_shifts enable row level security;

revoke all on public.employee_schedule_availability_versions,
  public.schedule_closures, public.schedule_location_publications,
  public.schedule_published_shifts
from public, anon, authenticated;
grant select on public.employee_schedule_availability_versions,
  public.schedule_closures, public.schedule_location_publications,
  public.schedule_published_shifts
to service_role;

create function public.get_schedule_read_model_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  settings public.workspace_scheduling_settings%rowtype;
  resolved_week_start date;
  result jsonb;
begin
  if not exists (
    select 1
    from public.workspace_memberships membership
    join public.workspace_roles role
      on role.id = membership.role_id and role.workspace_id = membership.workspace_id
    join public.workspace_role_permissions permission
      on permission.role_id = role.id and permission.workspace_id = role.workspace_id
    where membership.workspace_id = target_workspace_id
      and membership.user_id = actor_user_id
      and membership.status = 'active'
      and role.access_class in ('owner', 'admin', 'manager')
      and permission.permission_key = 'schedule.read'
  ) then
    raise exception 'manager schedule read access required' using errcode = '42501';
  end if;

  select * into settings
  from public.workspace_scheduling_settings
  where workspace_id = target_workspace_id;
  if settings.workspace_id is null then
    raise exception 'scheduling settings are unavailable' using errcode = 'P0002';
  end if;

  resolved_week_start := case settings.week_start_day
    when 'sunday' then target_date - extract(dow from target_date)::integer
    else target_date - (extract(isodow from target_date)::integer - 1)
  end;

  with actor_membership as (
    select membership.id, membership.all_locations
    from public.workspace_memberships membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = actor_user_id
      and membership.status = 'active'
    limit 1
  ), allowed_locations as (
    select location.*
    from public.locations location
    cross join actor_membership membership
    where location.workspace_id = target_workspace_id
      and location.archived_at is null
      and (
        membership.all_locations
        or exists (
          select 1 from public.membership_location_scopes scope
          where scope.membership_id = membership.id
            and scope.workspace_id = target_workspace_id
            and scope.location_id = location.id
        )
      )
  ), current_publications as (
    select publication.*
    from public.schedule_location_publications publication
    join allowed_locations location on location.id = publication.location_id
    where publication.week_start = resolved_week_start
      and publication.status = 'current'
  ), visible_employees as (
    select distinct employee.*
    from public.employee_profiles employee
    where employee.workspace_id = target_workspace_id
      and employee.archived_at is null
      and exists (
        select 1
        from public.employee_location_assignments assignment
        join allowed_locations location on location.id = assignment.location_id
        where assignment.employee_id = employee.id and assignment.ended_at is null
      )
  ), current_shifts as (
    select shift.*
    from public.schedule_published_shifts shift
    join current_publications publication on publication.id = shift.publication_id
    where shift.scheduled_date between resolved_week_start and resolved_week_start + 6
  )
  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'week_start', resolved_week_start,
    'week_start_day', settings.week_start_day,
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', location.id,
        'name', location.name,
        'timezone', location.timezone,
        'sort_order', location.sort_order,
        'publication_status', case when publication.id is null then 'unpublished' else 'published' end,
        'published_at', publication.published_at
      ) order by location.sort_order, location.name)
      from allowed_locations location
      left join current_publications publication on publication.location_id = location.id
    ), '[]'::jsonb),
    'departments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', department.id, 'name', department.name, 'color', department.color,
        'sort_order', department.sort_order
      ) order by department.sort_order, department.name)
      from public.departments department
      where department.workspace_id = target_workspace_id and department.archived_at is null
    ), '[]'::jsonb),
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', job.id, 'name', job.name, 'color', job.color,
        'sort_order', job.sort_order, 'department_id', job.department_id
      ) order by job.sort_order, job.name)
      from public.jobs job
      where job.workspace_id = target_workspace_id and job.archived_at is null
    ), '[]'::jsonb),
    'shift_types', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', shift_type.id, 'name', shift_type.name, 'color', shift_type.color,
        'sort_order', shift_type.sort_order,
        'default_start_time', case when shift_type.default_start_time is null then null else to_char(shift_type.default_start_time, 'HH24:MI') end,
        'default_end_time', case when shift_type.default_end_time is null then null else to_char(shift_type.default_end_time, 'HH24:MI') end
      ) order by shift_type.sort_order, shift_type.name)
      from public.shift_types shift_type
      where shift_type.workspace_id = target_workspace_id and shift_type.archived_at is null
    ), '[]'::jsonb),
    'employees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', employee.id,
        'employee_code', employee.employee_code,
        'display_name', coalesce(nullif(employee.preferred_name, ''), employee.first_name) || ' ' || employee.last_name,
        'location_ids', coalesce((select jsonb_agg(assignment.location_id order by assignment.location_id)
          from public.employee_location_assignments assignment
          join allowed_locations location on location.id = assignment.location_id
          where assignment.employee_id = employee.id and assignment.ended_at is null), '[]'::jsonb),
        'job_ids', coalesce((select jsonb_agg(assignment.job_id order by assignment.job_id)
          from public.employee_job_assignments assignment
          where assignment.employee_id = employee.id and assignment.ended_at is null), '[]'::jsonb),
        'availability', (select availability.recurring_rules
          from public.employee_schedule_availability_versions availability
          where availability.employee_id = employee.id
            and availability.effective_at <= now()
          order by availability.version_number desc limit 1)
      ) order by employee.last_name, employee.first_name, employee.id)
      from visible_employees employee
    ), '[]'::jsonb),
    'shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', shift.id,
        'location_id', shift.location_id,
        'employee_id', shift.employee_id,
        'job_id', shift.job_id,
        'shift_type_id', shift.shift_type_id,
        'scheduled_date', shift.scheduled_date,
        'start_time', to_char(shift.start_time, 'HH24:MI'),
        'end_time', to_char(shift.end_time, 'HH24:MI'),
        'crosses_midnight', shift.crosses_midnight,
        'note', shift.note,
        'warning_codes', to_jsonb(array_remove(array[
          case when exists (
            select 1 from public.schedule_closures closure
            where closure.location_id = shift.location_id
              and closure.closed_date = shift.scheduled_date and closure.is_all_day
          ) then 'closed_location' end,
          case when shift.employee_id is not null and exists (
            select 1
            from public.employee_schedule_availability_versions version,
              lateral jsonb_array_elements(version.recurring_rules) rule
            where version.employee_id = shift.employee_id
              and version.version_number = (
                select max(latest.version_number)
                from public.employee_schedule_availability_versions latest
                where latest.employee_id = shift.employee_id
              )
              and (rule->>'day')::integer = extract(dow from shift.scheduled_date)::integer
              and rule->>'mode' = 'unavailable'
          ) then 'availability' end,
          case when shift.employee_id is not null and exists (
            select 1 from current_shifts other
            where other.employee_id = shift.employee_id
              and other.scheduled_date = shift.scheduled_date
              and other.id <> shift.id
              and not shift.crosses_midnight and not other.crosses_midnight
              and shift.start_time < other.end_time and shift.end_time > other.start_time
          ) then 'overlap' end
        ]::text[], null))
      ) order by shift.scheduled_date, shift.start_time, shift.id)
      from current_shifts shift
    ), '[]'::jsonb),
    'closures', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', closure.id, 'location_id', closure.location_id,
        'closed_date', closure.closed_date, 'title', closure.title,
        'is_all_day', closure.is_all_day
      ) order by closure.closed_date, closure.title)
      from public.schedule_closures closure
      join allowed_locations location on location.id = closure.location_id
      where closure.closed_date between resolved_week_start and resolved_week_start + 6
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_schedule_read_model_service(uuid, uuid, date)
from public, anon, authenticated;
grant execute on function public.get_schedule_read_model_service(uuid, uuid, date)
to service_role;

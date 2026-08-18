create type public.schedule_week_start as enum ('sunday', 'monday');
create type public.schedule_deadline_day as enum (
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
);
create type public.schedule_conflict_policy as enum ('warn', 'block');
create type public.availability_enforcement as enum ('soft', 'hard');

create table public.workspace_scheduling_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  week_start_day public.schedule_week_start not null default 'monday',
  schedule_deadline_day public.schedule_deadline_day not null default 'sunday',
  conflict_policy public.schedule_conflict_policy not null default 'warn',
  availability_enforcement public.availability_enforcement not null default 'soft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.workspace_scheduling_settings (workspace_id)
select id from public.workspaces
on conflict (workspace_id) do nothing;

create function public.initialize_workspace_scheduling_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspace_scheduling_settings (workspace_id) values (new.id);
  return new;
end;
$$;

create trigger workspaces_scheduling_settings_trigger
after insert on public.workspaces
for each row execute function public.initialize_workspace_scheduling_settings();

create table public.shift_types (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  color text not null default '#5B7FA3' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  default_start_time time,
  default_end_time time,
  crosses_midnight boolean generated always as (
    coalesce(default_end_time <= default_start_time, false)
  ) stored,
  sort_order integer not null default 0 check (sort_order >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  check (
    (default_start_time is null and default_end_time is null)
    or (
      default_start_time is not null
      and default_end_time is not null
      and default_start_time <> default_end_time
    )
  )
);

create unique index shift_types_workspace_active_name_idx
  on public.shift_types (workspace_id, lower(name))
  where archived_at is null;
create index shift_types_workspace_order_idx
  on public.shift_types (workspace_id, archived_at, sort_order, name);

alter table public.workspace_scheduling_settings enable row level security;
alter table public.shift_types enable row level security;

create policy scheduling_settings_select_member
on public.workspace_scheduling_settings for select to authenticated
using ((select public.is_workspace_member(workspace_id)));

create policy scheduling_settings_insert_admin
on public.workspace_scheduling_settings for insert to authenticated
with check ((select public.can_manage_workspace(workspace_id)));

create policy scheduling_settings_update_admin
on public.workspace_scheduling_settings for update to authenticated
using ((select public.can_manage_workspace(workspace_id)))
with check ((select public.can_manage_workspace(workspace_id)));

create policy shift_types_select_member
on public.shift_types for select to authenticated
using ((select public.is_workspace_member(workspace_id)));

create policy shift_types_insert_admin
on public.shift_types for insert to authenticated
with check ((select public.can_manage_workspace(workspace_id)));

create policy shift_types_update_admin
on public.shift_types for update to authenticated
using ((select public.can_manage_workspace(workspace_id)))
with check ((select public.can_manage_workspace(workspace_id)));

revoke all on public.workspace_scheduling_settings from anon;
revoke all on public.shift_types from anon;
grant select, insert, update on public.workspace_scheduling_settings to authenticated;
grant select, insert, update on public.shift_types to authenticated;

create trigger shift_types_audit_trigger
after insert or update on public.shift_types
for each row execute function public.audit_organization_setting_change();

create function public.audit_scheduling_settings_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if row(new.week_start_day, new.schedule_deadline_day, new.conflict_policy, new.availability_enforcement)
    is distinct from
    row(old.week_start_day, old.schedule_deadline_day, old.conflict_policy, old.availability_enforcement)
    and (select auth.uid()) is not null
  then
    insert into public.audit_events (
      workspace_id, actor_user_id, action, target_type, target_id
    ) values (
      new.workspace_id,
      (select auth.uid()),
      'scheduling.settings_updated',
      'scheduling_settings',
      new.workspace_id::text
    );
  end if;
  return new;
end;
$$;

create trigger scheduling_settings_audit_trigger
after update on public.workspace_scheduling_settings
for each row execute function public.audit_scheduling_settings_change();

create function public.reorder_shift_types(
  target_workspace_id uuid,
  ordered_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_count integer;
  matched_count integer;
begin
  if not public.can_manage_workspace(target_workspace_id) then
    raise exception 'workspace management access required' using errcode = '42501';
  end if;
  if cardinality(ordered_ids) <> (
    select count(distinct item_id) from unnest(ordered_ids) item_id
  ) then
    raise exception 'shift type order contains duplicates' using errcode = '22023';
  end if;

  select count(*) into expected_count
  from public.shift_types
  where workspace_id = target_workspace_id and archived_at is null;
  select count(*) into matched_count
  from public.shift_types
  where workspace_id = target_workspace_id and archived_at is null and id = any(ordered_ids);

  if expected_count <> cardinality(ordered_ids) or matched_count <> expected_count then
    raise exception 'shift type order must include every active shift type' using errcode = '22023';
  end if;

  update public.shift_types shift_type
  set sort_order = ordered.position - 1, updated_at = now()
  from unnest(ordered_ids) with ordinality ordered(id, position)
  where shift_type.id = ordered.id
    and shift_type.workspace_id = target_workspace_id;
end;
$$;

revoke all on function public.reorder_shift_types(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_shift_types(uuid, uuid[]) to authenticated;

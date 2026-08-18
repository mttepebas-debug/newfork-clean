create table public.locations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  street_address text not null check (char_length(btrim(street_address)) between 1 and 180),
  city text not null check (char_length(btrim(city)) between 1 and 100),
  region text not null check (char_length(btrim(region)) between 1 and 100),
  postal_code text not null check (char_length(btrim(postal_code)) between 1 and 20),
  country_code text not null default 'US' check (country_code ~ '^[A-Z]{2}$'),
  timezone text not null check (char_length(btrim(timezone)) between 1 and 80),
  sort_order integer not null default 0 check (sort_order >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);

create unique index locations_workspace_active_name_idx
  on public.locations (workspace_id, lower(name))
  where archived_at is null;
create index locations_workspace_order_idx
  on public.locations (workspace_id, archived_at, sort_order, name);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  color text not null default '#3C7A68' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer not null default 0 check (sort_order >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);

create unique index departments_workspace_active_name_idx
  on public.departments (workspace_id, lower(name))
  where archived_at is null;
create index departments_workspace_order_idx
  on public.departments (workspace_id, archived_at, sort_order, name);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  department_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  color text not null default '#4478A8' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer not null default 0 check (sort_order >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (department_id, workspace_id)
    references public.departments(id, workspace_id) on delete restrict
);

create unique index jobs_workspace_active_name_idx
  on public.jobs (workspace_id, lower(name))
  where archived_at is null;
create index jobs_workspace_order_idx
  on public.jobs (workspace_id, archived_at, sort_order, name);
create index jobs_department_idx
  on public.jobs (workspace_id, department_id)
  where archived_at is null;

alter table public.membership_location_scopes
  add constraint membership_location_scopes_location_fk
  foreign key (location_id, workspace_id)
  references public.locations(id, workspace_id) on delete cascade;

create function public.can_access_location(target_workspace_id uuid, target_location_id uuid)
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
          select 1
          from public.membership_location_scopes scope
          where scope.membership_id = membership.id
            and scope.workspace_id = target_workspace_id
            and scope.location_id = target_location_id
        )
      )
  );
$$;

revoke all on function public.can_access_location(uuid, uuid) from public, anon;
grant execute on function public.can_access_location(uuid, uuid) to authenticated;

alter table public.locations enable row level security;
alter table public.departments enable row level security;
alter table public.jobs enable row level security;

create policy locations_select_scoped_member
on public.locations for select to authenticated
using ((select public.can_access_location(workspace_id, id)));

create policy locations_insert_admin
on public.locations for insert to authenticated
with check ((select public.can_manage_workspace(workspace_id)));

create policy locations_update_admin
on public.locations for update to authenticated
using ((select public.can_manage_workspace(workspace_id)))
with check ((select public.can_manage_workspace(workspace_id)));

create policy departments_select_member
on public.departments for select to authenticated
using ((select public.is_workspace_member(workspace_id)));

create policy departments_insert_admin
on public.departments for insert to authenticated
with check ((select public.can_manage_workspace(workspace_id)));

create policy departments_update_admin
on public.departments for update to authenticated
using ((select public.can_manage_workspace(workspace_id)))
with check ((select public.can_manage_workspace(workspace_id)));

create policy jobs_select_member
on public.jobs for select to authenticated
using ((select public.is_workspace_member(workspace_id)));

create policy jobs_insert_admin
on public.jobs for insert to authenticated
with check ((select public.can_manage_workspace(workspace_id)));

create policy jobs_update_admin
on public.jobs for update to authenticated
using ((select public.can_manage_workspace(workspace_id)))
with check ((select public.can_manage_workspace(workspace_id)));

revoke all on public.locations from anon;
revoke all on public.departments from anon;
revoke all on public.jobs from anon;
grant select, insert, update on public.locations to authenticated;
grant select, insert, update on public.departments to authenticated;
grant select, insert, update on public.jobs to authenticated;

create function public.audit_organization_setting_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  row_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
  tenant_id uuid := case when tg_op = 'DELETE' then old.workspace_id else new.workspace_id end;
  archived boolean := case
    when tg_table_name = 'workspaces' then false
    else (case when tg_op = 'DELETE' then old.archived_at else new.archived_at end) is not null
  end;
  action_name text;
begin
  if actor_id is null then return case when tg_op = 'DELETE' then old else new end; end if;

  action_name := case
    when tg_table_name = 'workspaces' then 'workspace.identity_updated'
    when tg_op = 'INSERT' then left(tg_table_name, -1) || '.created'
    when archived then left(tg_table_name, -1) || '.archived'
    else left(tg_table_name, -1) || '.updated'
  end;

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id
  ) values (
    tenant_id, actor_id, action_name, left(tg_table_name, -1), row_id::text
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger locations_audit_trigger
after insert or update on public.locations
for each row execute function public.audit_organization_setting_change();

create trigger departments_audit_trigger
after insert or update on public.departments
for each row execute function public.audit_organization_setting_change();

create trigger jobs_audit_trigger
after insert or update on public.jobs
for each row execute function public.audit_organization_setting_change();

create function public.audit_workspace_identity_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.name is distinct from new.name and (select auth.uid()) is not null then
    insert into public.audit_events (
      workspace_id, actor_user_id, action, target_type, target_id
    ) values (
      new.id, (select auth.uid()), 'workspace.identity_updated', 'workspace', new.id::text
    );
  end if;
  return new;
end;
$$;

create trigger workspaces_identity_audit_trigger
after update of name on public.workspaces
for each row execute function public.audit_workspace_identity_change();

create function public.prevent_department_archive_with_active_jobs()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.archived_at is null and new.archived_at is not null and exists (
    select 1 from public.jobs job
    where job.workspace_id = new.workspace_id
      and job.department_id = new.id
      and job.archived_at is null
  ) then
    raise exception 'archive active jobs before archiving their department' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger departments_archive_guard_trigger
before update of archived_at on public.departments
for each row execute function public.prevent_department_archive_with_active_jobs();

create function public.reorder_organization_entities(
  target_workspace_id uuid,
  entity_type text,
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
  if entity_type not in ('departments', 'jobs') then
    raise exception 'unsupported organization entity type' using errcode = '22023';
  end if;
  if cardinality(ordered_ids) <> (
    select count(distinct item_id) from unnest(ordered_ids) item_id
  ) then
    raise exception 'organization entity order contains duplicates' using errcode = '22023';
  end if;

  if entity_type = 'departments' then
    select count(*) into expected_count
    from public.departments
    where workspace_id = target_workspace_id and archived_at is null;
    select count(*) into matched_count
    from public.departments
    where workspace_id = target_workspace_id and archived_at is null and id = any(ordered_ids);

    if expected_count <> cardinality(ordered_ids) or matched_count <> expected_count then
      raise exception 'department order must include every active department' using errcode = '22023';
    end if;

    update public.departments department
    set sort_order = ordered.position - 1, updated_at = now()
    from unnest(ordered_ids) with ordinality ordered(id, position)
    where department.id = ordered.id
      and department.workspace_id = target_workspace_id;
  else
    select count(*) into expected_count
    from public.jobs
    where workspace_id = target_workspace_id and archived_at is null;
    select count(*) into matched_count
    from public.jobs
    where workspace_id = target_workspace_id and archived_at is null and id = any(ordered_ids);

    if expected_count <> cardinality(ordered_ids) or matched_count <> expected_count then
      raise exception 'job order must include every active job' using errcode = '22023';
    end if;

    update public.jobs job
    set sort_order = ordered.position - 1, updated_at = now()
    from unnest(ordered_ids) with ordinality ordered(id, position)
    where job.id = ordered.id
      and job.workspace_id = target_workspace_id;
  end if;
end;
$$;

revoke all on function public.reorder_organization_entities(uuid, text, uuid[]) from public, anon;
grant execute on function public.reorder_organization_entities(uuid, text, uuid[]) to authenticated;

insert into public.permissions (key, label, category, description, custom_grantable, sort_order)
values (
  'schedule.publish', 'Publish schedules', 'Schedule',
  'Publish and unpublish schedules for accessible locations.', true, 45
)
on conflict (key) do update set
  label = excluded.label,
  category = excluded.category,
  description = excluded.description,
  custom_grantable = excluded.custom_grantable,
  sort_order = excluded.sort_order;

update public.permissions
set description = 'Create and edit schedule drafts for accessible locations.'
where key = 'schedule.manage';

insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
select role.workspace_id, role.id, 'schedule.publish'
from public.workspace_roles role
where role.system_key in ('owner', 'admin', 'manager')
on conflict do nothing;

create or replace function public.initialize_workspace_roles(target_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_role_id uuid;
  admin_role_id uuid;
  manager_role_id uuid;
  employee_role_id uuid;
begin
  insert into public.workspace_roles (
    workspace_id, name, description, system_key, access_class, sort_order
  )
  values
    (target_workspace_id, 'Owner', 'Full workspace authority and ownership protection.', 'owner', 'owner', 0),
    (target_workspace_id, 'Admin', 'Workspace administration without ownership transfer.', 'admin', 'admin', 10),
    (target_workspace_id, 'Manager', 'Schedule operations for assigned locations.', 'manager', 'manager', 20),
    (target_workspace_id, 'Employee', 'Personal workspace and published schedule access.', 'employee', 'employee', 30)
  on conflict do nothing;

  select id into owner_role_id from public.workspace_roles
    where workspace_id = target_workspace_id and system_key = 'owner';
  select id into admin_role_id from public.workspace_roles
    where workspace_id = target_workspace_id and system_key = 'admin';
  select id into manager_role_id from public.workspace_roles
    where workspace_id = target_workspace_id and system_key = 'manager';
  select id into employee_role_id from public.workspace_roles
    where workspace_id = target_workspace_id and system_key = 'employee';

  insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
  select target_workspace_id, owner_role_id, key from public.permissions on conflict do nothing;
  insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
  select target_workspace_id, admin_role_id, key from public.permissions on conflict do nothing;
  insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
  values
    (target_workspace_id, manager_role_id, 'workspace.read'),
    (target_workspace_id, manager_role_id, 'schedule.read'),
    (target_workspace_id, manager_role_id, 'schedule.manage'),
    (target_workspace_id, manager_role_id, 'schedule.publish'),
    (target_workspace_id, manager_role_id, 'employees.read'),
    (target_workspace_id, manager_role_id, 'employees.manage'),
    (target_workspace_id, manager_role_id, 'employee_onboarding.review'),
    (target_workspace_id, employee_role_id, 'workspace.read'),
    (target_workspace_id, employee_role_id, 'schedule.read')
  on conflict do nothing;
end;
$$;

alter table public.schedule_location_publications
  add column source_draft_id uuid,
  add column source_draft_revision integer check (source_draft_revision is null or source_draft_revision > 0),
  add column content_fingerprint text check (content_fingerprint is null or char_length(content_fingerprint) = 64),
  add column superseded_by uuid references public.schedule_location_publications(id),
  add constraint schedule_location_publications_source_draft_fk
    foreign key (source_draft_id, workspace_id)
    references public.schedule_drafts(id, workspace_id) on delete restrict;

create type public.schedule_publication_event_action as enum ('published', 'unpublished');

create table public.schedule_publication_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  week_start date not null,
  action public.schedule_publication_event_action not null,
  actor_user_id uuid not null references auth.users(id),
  location_ids uuid[] not null check (cardinality(location_ids) > 0),
  source_draft_id uuid,
  source_draft_revision integer,
  publication_ids uuid[] not null check (cardinality(publication_ids) > 0),
  preflight_fingerprint text not null check (char_length(preflight_fingerprint) = 64),
  diff_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(diff_summary) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (source_draft_id, workspace_id)
    references public.schedule_drafts(id, workspace_id) on delete restrict
);

create table public.schedule_publication_overrides (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  publication_id uuid not null references public.schedule_location_publications(id) on delete restrict,
  source_draft_id uuid not null,
  source_draft_revision integer not null check (source_draft_revision > 0),
  finding_id text not null check (char_length(finding_id) between 12 and 64),
  finding_code text not null check (finding_code in ('availability', 'closed_location')),
  employee_id uuid,
  location_id uuid not null,
  scheduled_date date not null,
  source_shift_ids uuid[] not null check (cardinality(source_shift_ids) > 0),
  reason text not null check (char_length(btrim(reason)) between 10 and 500),
  actor_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (source_draft_id, workspace_id)
    references public.schedule_drafts(id, workspace_id) on delete restrict,
  foreign key (location_id, workspace_id)
    references public.locations(id, workspace_id) on delete restrict,
  foreign key (employee_id, workspace_id)
    references public.employee_profiles(id, workspace_id) on delete restrict,
  unique (publication_id, finding_id)
);

create index schedule_publication_events_week_idx
  on public.schedule_publication_events (workspace_id, week_start, created_at desc);
create index schedule_publication_overrides_publication_idx
  on public.schedule_publication_overrides (publication_id, created_at);

alter table public.schedule_publication_events enable row level security;
alter table public.schedule_publication_overrides enable row level security;
revoke all on public.schedule_publication_events, public.schedule_publication_overrides
from public, anon, authenticated;
grant select on public.schedule_publication_events, public.schedule_publication_overrides
to service_role;

create function public.schedule_actor_can_publish_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_location_id uuid default null
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
    join public.workspace_roles role
      on role.id = membership.role_id and role.workspace_id = membership.workspace_id
    join public.workspace_role_permissions permission
      on permission.role_id = role.id and permission.workspace_id = role.workspace_id
    where membership.workspace_id = target_workspace_id
      and membership.user_id = actor_user_id
      and membership.status = 'active'
      and role.access_class in ('owner', 'admin', 'manager')
      and permission.permission_key = 'schedule.publish'
      and (
        target_location_id is null
        or membership.all_locations
        or exists (
          select 1 from public.membership_location_scopes scope
          where scope.membership_id = membership.id
            and scope.workspace_id = target_workspace_id
            and scope.location_id = target_location_id
        )
      )
  );
$$;

create function public.schedule_current_week_start_service(target_workspace_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select case settings.week_start_day
    when 'sunday' then current_date - extract(dow from current_date)::integer
    else current_date - (extract(isodow from current_date)::integer - 1)
  end
  from public.workspace_scheduling_settings settings
  where settings.workspace_id = target_workspace_id;
$$;

create function public.preview_schedule_publication_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_draft_id uuid,
  target_location_ids uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_draft public.schedule_drafts%rowtype;
  normalized_locations uuid[];
  location_payload jsonb;
  finding_payload jsonb;
  unsigned_payload jsonb;
  preview_fingerprint text;
  hard_count integer;
  soft_count integer;
begin
  select * into target_draft
  from public.schedule_drafts draft
  where draft.id = target_draft_id
    and draft.workspace_id = target_workspace_id
    and draft.archived_at is null;
  if target_draft.id is null then
    raise exception 'schedule draft not found' using errcode = 'P0002';
  end if;
  if target_draft.week_start < public.schedule_current_week_start_service(target_workspace_id) then
    return jsonb_build_object(
      'status', 'past_week_closed', 'workspace_id', target_workspace_id,
      'week_start', target_draft.week_start, 'draft_id', target_draft.id,
      'draft_revision', target_draft.revision, 'fingerprint', repeat('0', 64),
      'locations', '[]'::jsonb, 'findings', '[]'::jsonb
    );
  end if;

  select array_agg(distinct location_id order by location_id)
  into normalized_locations
  from unnest(target_location_ids) location_id;
  if coalesce(cardinality(normalized_locations), 0) = 0 then
    raise exception 'at least one publication location required' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(normalized_locations) location_id
    where not exists (
      select 1 from public.locations location
      where location.id = location_id and location.workspace_id = target_workspace_id
        and location.archived_at is null
    ) or not public.schedule_actor_can_publish_service(
      actor_user_id, target_workspace_id, location_id
    )
  ) then
    raise exception 'schedule publication scope denied' using errcode = '42501';
  end if;

  with selected_locations as (
    select location.id, location.name
    from public.locations location
    where location.id = any(normalized_locations)
  ), active as (
    select publication.*
    from public.schedule_location_publications publication
    where publication.workspace_id = target_workspace_id
      and publication.week_start = target_draft.week_start
      and publication.location_id = any(normalized_locations)
      and publication.status = 'current'
  ), current_shift as (
    select shift.*
    from public.schedule_published_shifts shift
    join active publication on publication.id = shift.publication_id
  ), next_shift as (
    select shift.*
    from public.schedule_draft_shifts shift
    where shift.draft_id = target_draft.id
      and shift.location_id = any(normalized_locations)
  ), comparison as (
    select location.id as location_id, location.name as location_name,
      publication.id as active_publication_id,
      publication.version_number as active_version,
      (select count(*) from current_shift shift where shift.location_id = location.id)::integer as current_shift_count,
      (select count(*) from next_shift shift where shift.location_id = location.id)::integer as next_shift_count,
      (select count(*) from next_shift next_row where next_row.location_id = location.id and not exists (
        select 1 from current_shift current_row where current_row.location_id = location.id and current_row.source_shift_id = next_row.id
      ))::integer as added,
      (select count(*) from current_shift current_row where current_row.location_id = location.id and not exists (
        select 1 from next_shift next_row where next_row.location_id = location.id and next_row.id = current_row.source_shift_id
      ))::integer as removed,
      (select count(*) from next_shift next_row join current_shift current_row
        on current_row.location_id = next_row.location_id and current_row.source_shift_id = next_row.id
        where next_row.location_id = location.id and (
          current_row.employee_id is distinct from next_row.employee_id
          or current_row.job_id is distinct from next_row.job_id
          or current_row.shift_type_id is distinct from next_row.shift_type_id
          or current_row.scheduled_date is distinct from next_row.scheduled_date
          or current_row.start_time is distinct from next_row.start_time
          or current_row.end_time is distinct from next_row.end_time
          or current_row.note is distinct from next_row.note
        ))::integer as updated,
      (select count(*) from next_shift next_row join current_shift current_row
        on current_row.location_id = next_row.location_id and current_row.source_shift_id = next_row.id
        where next_row.location_id = location.id and not (
          current_row.employee_id is distinct from next_row.employee_id
          or current_row.job_id is distinct from next_row.job_id
          or current_row.shift_type_id is distinct from next_row.shift_type_id
          or current_row.scheduled_date is distinct from next_row.scheduled_date
          or current_row.start_time is distinct from next_row.start_time
          or current_row.end_time is distinct from next_row.end_time
          or current_row.note is distinct from next_row.note
        ))::integer as unchanged
    from selected_locations location
    left join active publication on publication.location_id = location.id
  )
  select jsonb_agg(to_jsonb(comparison) order by location_name, location_id)
  into location_payload from comparison;

  with next_shift as (
    select shift.*,
      coalesce(nullif(employee.preferred_name, ''), employee.first_name) || ' ' || employee.last_name as employee_name,
      location.name as location_name,
      tsrange(
        shift.scheduled_date::timestamp + shift.start_time,
        shift.scheduled_date::timestamp + shift.end_time
          + case when shift.end_time <= shift.start_time then interval '1 day' else interval '0' end,
        '[)'
      ) as occupied
    from public.schedule_draft_shifts shift
    join public.locations location on location.id = shift.location_id
    left join public.employee_profiles employee on employee.id = shift.employee_id
    where shift.draft_id = target_draft.id and shift.location_id = any(normalized_locations)
  ), raw_findings as (
    select
      'overlap'::text as code, 'hard'::text as severity, false as overrideable,
      first.location_id, first.employee_id, first.scheduled_date,
      array[first.id, second.id]::uuid[] as shift_ids,
      first.employee_name || ' has overlapping shifts on ' || first.scheduled_date::text || '.' as message
    from next_shift first
    join next_shift second on second.employee_id = first.employee_id and second.id > first.id
      and first.employee_id is not null and first.occupied && second.occupied
    union all
    select
      'availability', 'soft', true, shift.location_id, shift.employee_id,
      shift.scheduled_date, array[shift.id]::uuid[],
      shift.employee_name || ' is unavailable on ' || shift.scheduled_date::text || '.'
    from next_shift shift
    where shift.employee_id is not null and exists (
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
    )
    union all
    select
      'closed_location', 'soft', true, shift.location_id, shift.employee_id,
      shift.scheduled_date, array[shift.id]::uuid[],
      shift.location_name || ' is closed on ' || shift.scheduled_date::text || '.'
    from next_shift shift
    where exists (
      select 1 from public.schedule_closures closure
      where closure.location_id = shift.location_id
        and closure.closed_date = shift.scheduled_date and closure.is_all_day
    )
  ), findings as (
    select encode(extensions.digest(convert_to(
      code || '|' || coalesce(employee_id::text, '') || '|' || scheduled_date::text || '|' || array_to_string(shift_ids, ','),
      'UTF8'), 'sha256'), 'hex') as id, *
    from raw_findings
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'code', code, 'severity', severity, 'overrideable', overrideable,
    'message', message, 'location_id', location_id, 'employee_id', employee_id,
    'scheduled_date', scheduled_date, 'shift_ids', to_jsonb(shift_ids)
  ) order by severity, code, scheduled_date, id), '[]'::jsonb),
  count(*) filter (where severity = 'hard')::integer,
  count(*) filter (where severity = 'soft')::integer
  into finding_payload, hard_count, soft_count
  from findings;

  unsigned_payload := jsonb_build_object(
    'workspace_id', target_workspace_id,
    'week_start', target_draft.week_start,
    'draft_id', target_draft.id,
    'draft_revision', target_draft.revision,
    'locations', coalesce(location_payload, '[]'::jsonb),
    'findings', finding_payload
  );
  preview_fingerprint := encode(extensions.digest(convert_to(unsigned_payload::text, 'UTF8'), 'sha256'), 'hex');
  return unsigned_payload || jsonb_build_object(
    'status', case when hard_count > 0 then 'hard_blocked'
      when soft_count > 0 then 'override_required' else 'publish_ready' end,
    'fingerprint', preview_fingerprint
  );
end;
$$;

create function public.get_schedule_publication_history_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_week_start date
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'week_start', target_week_start,
    'publications', coalesce(jsonb_agg(jsonb_build_object(
      'id', publication.id,
      'location_id', publication.location_id,
      'location_name', location.name,
      'version', publication.version_number,
      'status', publication.status,
      'source_draft_id', publication.source_draft_id,
      'source_draft_revision', publication.source_draft_revision,
      'shift_count', (select count(*) from public.schedule_published_shifts shift where shift.publication_id = publication.id),
      'published_at', publication.published_at,
      'unpublished_at', publication.unpublished_at,
      'superseded_by', publication.superseded_by
    ) order by location.sort_order, publication.version_number desc) filter (where publication.id is not null), '[]'::jsonb)
  )
  from public.schedule_location_publications publication
  join public.locations location on location.id = publication.location_id
  where publication.workspace_id = target_workspace_id
    and publication.week_start = target_week_start
    and public.schedule_actor_can_publish_service(actor_user_id, target_workspace_id, publication.location_id);
$$;

create function public.publish_schedule_draft_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_draft_id uuid,
  target_location_ids uuid[],
  expected_draft_revision integer,
  expected_fingerprint text,
  override_decisions jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_draft public.schedule_drafts%rowtype;
  preview jsonb;
  location_item jsonb;
  finding jsonb;
  decision jsonb;
  publication_id uuid;
  previous_publication_id uuid;
  publication_ids uuid[] := '{}';
  normalized_locations uuid[];
  total_shift_count integer := 0;
  published_at timestamptz := now();
begin
  select * into target_draft from public.schedule_drafts draft
  where draft.id = target_draft_id and draft.workspace_id = target_workspace_id
    and draft.archived_at is null for update;
  if target_draft.id is null then raise exception 'schedule draft not found' using errcode = 'P0002'; end if;
  if target_draft.revision <> expected_draft_revision then
    raise exception 'stale publication preview' using errcode = '40001';
  end if;
  select array_agg(distinct location_id order by location_id) into normalized_locations
  from unnest(target_location_ids) location_id;
  perform 1 from public.schedule_location_publications publication
  where publication.workspace_id = target_workspace_id
    and publication.week_start = target_draft.week_start
    and publication.location_id = any(normalized_locations) for update;

  preview := public.preview_schedule_publication_service(
    actor_user_id, target_workspace_id, target_draft_id, normalized_locations
  );
  if preview->>'status' = 'past_week_closed' then
    raise exception 'past schedule week is closed' using errcode = '42501';
  end if;
  if preview->>'fingerprint' <> expected_fingerprint then
    raise exception 'stale publication preview' using errcode = '40001';
  end if;
  if preview->>'status' = 'hard_blocked' then
    raise exception 'schedule has hard publication blockers' using errcode = '23514';
  end if;
  if jsonb_typeof(coalesce(override_decisions, '[]'::jsonb)) <> 'array' then
    raise exception 'publication overrides must be an array' using errcode = '22023';
  end if;
  for finding in select value from jsonb_array_elements(preview->'findings')
  loop
    if finding->>'severity' <> 'soft' then continue; end if;
    select value into decision from jsonb_array_elements(override_decisions)
    where value->>'finding_id' = finding->>'id' limit 1;
    if decision is null or char_length(btrim(coalesce(decision->>'reason', ''))) not between 10 and 500 then
      raise exception 'publication override reason required' using errcode = '22023';
    end if;
  end loop;

  for location_item in select value from jsonb_array_elements(preview->'locations')
  loop
    previous_publication_id := nullif(location_item->>'active_publication_id', '')::uuid;
    publication_id := gen_random_uuid();
    if previous_publication_id is not null then
      update public.schedule_location_publications
      set status = 'superseded'
      where id = previous_publication_id and status = 'current';
      if not found then raise exception 'stale publication preview' using errcode = '40001'; end if;
    end if;
    insert into public.schedule_location_publications (
      id, workspace_id, location_id, week_start, version_number, status,
      published_by, published_at, source_draft_id, source_draft_revision, content_fingerprint
    ) values (
      publication_id, target_workspace_id, (location_item->>'location_id')::uuid,
      target_draft.week_start,
      coalesce((select max(version_number) + 1 from public.schedule_location_publications
        where location_id = (location_item->>'location_id')::uuid and week_start = target_draft.week_start), 1),
      'current', actor_user_id, published_at, target_draft.id, target_draft.revision,
      expected_fingerprint
    );
    if previous_publication_id is not null then
      update public.schedule_location_publications
      set superseded_by = publication_id
      where id = previous_publication_id;
    end if;
    insert into public.schedule_published_shifts (
      workspace_id, location_id, publication_id, employee_id, job_id, shift_type_id,
      scheduled_date, start_time, end_time, note, source_shift_id
    )
    select shift.workspace_id, shift.location_id, publication_id, shift.employee_id,
      shift.job_id, shift.shift_type_id, shift.scheduled_date, shift.start_time,
      shift.end_time, shift.note, shift.id
    from public.schedule_draft_shifts shift
    where shift.draft_id = target_draft.id
      and shift.location_id = (location_item->>'location_id')::uuid;
    get diagnostics total_shift_count = row_count;
    publication_ids := array_append(publication_ids, publication_id);

    for finding in select value from jsonb_array_elements(preview->'findings')
    loop
      if finding->>'severity' <> 'soft'
        or finding->>'location_id' <> location_item->>'location_id' then continue; end if;
      select value into decision from jsonb_array_elements(override_decisions)
      where value->>'finding_id' = finding->>'id' limit 1;
      insert into public.schedule_publication_overrides (
        workspace_id, publication_id, source_draft_id, source_draft_revision,
        finding_id, finding_code, employee_id, location_id, scheduled_date,
        source_shift_ids, reason, actor_user_id
      ) values (
        target_workspace_id, publication_id, target_draft.id, target_draft.revision,
        finding->>'id', finding->>'code', nullif(finding->>'employee_id', '')::uuid,
        (finding->>'location_id')::uuid, (finding->>'scheduled_date')::date,
        array(select jsonb_array_elements_text(finding->'shift_ids')::uuid),
        btrim(decision->>'reason'), actor_user_id
      );
    end loop;
  end loop;

  select count(*)::integer into total_shift_count
  from public.schedule_published_shifts shift where shift.publication_id = any(publication_ids);
  insert into public.schedule_publication_events (
    workspace_id, week_start, action, actor_user_id, location_ids,
    source_draft_id, source_draft_revision, publication_ids,
    preflight_fingerprint, diff_summary
  ) values (
    target_workspace_id, target_draft.week_start, 'published', actor_user_id,
    normalized_locations, target_draft.id, target_draft.revision, publication_ids,
    expected_fingerprint, jsonb_build_object('locations', preview->'locations')
  );
  return jsonb_build_object(
    'status', 'published', 'workspace_id', target_workspace_id,
    'week_start', target_draft.week_start, 'draft_id', target_draft.id,
    'draft_revision', target_draft.revision, 'location_ids', to_jsonb(normalized_locations),
    'publication_ids', to_jsonb(publication_ids), 'published_shift_count', total_shift_count,
    'published_at', published_at
  );
end;
$$;

create function public.preview_schedule_unpublication_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_week_start date,
  target_location_ids uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_locations uuid[];
  location_payload jsonb;
  unsigned_payload jsonb;
begin
  select array_agg(distinct location_id order by location_id) into normalized_locations
  from unnest(target_location_ids) location_id;
  if coalesce(cardinality(normalized_locations), 0) = 0 then
    raise exception 'at least one publication location required' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(normalized_locations) location_id
    where not public.schedule_actor_can_publish_service(actor_user_id, target_workspace_id, location_id)) then
    raise exception 'schedule publication scope denied' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'location_id', publication.location_id, 'location_name', location.name,
    'publication_id', publication.id, 'version', publication.version_number,
    'shift_count', (select count(*) from public.schedule_published_shifts shift where shift.publication_id = publication.id)
  ) order by location.name, location.id), '[]'::jsonb)
  into location_payload
  from public.schedule_location_publications publication
  join public.locations location on location.id = publication.location_id
  where publication.workspace_id = target_workspace_id
    and publication.week_start = target_week_start
    and publication.location_id = any(normalized_locations)
    and publication.status = 'current';
  if jsonb_array_length(location_payload) <> cardinality(normalized_locations) then
    raise exception 'current schedule publication not found' using errcode = 'P0002';
  end if;
  unsigned_payload := jsonb_build_object(
    'workspace_id', target_workspace_id, 'week_start', target_week_start,
    'locations', location_payload
  );
  return unsigned_payload || jsonb_build_object(
    'status', case when target_week_start < public.schedule_current_week_start_service(target_workspace_id)
      then 'past_week_closed' else 'unpublish_ready' end,
    'fingerprint', encode(extensions.digest(convert_to(unsigned_payload::text, 'UTF8'), 'sha256'), 'hex')
  );
end;
$$;

create function public.unpublish_schedule_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_week_start date,
  target_location_ids uuid[],
  expected_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  preview jsonb;
  normalized_locations uuid[];
  publication_ids uuid[];
  effective_unpublished_at timestamptz := now();
begin
  select array_agg(distinct location_id order by location_id) into normalized_locations
  from unnest(target_location_ids) location_id;
  perform 1 from public.schedule_location_publications publication
  where publication.workspace_id = target_workspace_id
    and publication.week_start = target_week_start
    and publication.location_id = any(normalized_locations)
    and publication.status = 'current' for update;
  preview := public.preview_schedule_unpublication_service(
    actor_user_id, target_workspace_id, target_week_start, normalized_locations
  );
  if preview->>'status' = 'past_week_closed' then
    raise exception 'past schedule week is closed' using errcode = '42501';
  end if;
  if preview->>'fingerprint' <> expected_fingerprint then
    raise exception 'stale unpublication preview' using errcode = '40001';
  end if;
  select array_agg((item->>'publication_id')::uuid order by item->>'publication_id')
  into publication_ids from jsonb_array_elements(preview->'locations') item;
  update public.schedule_location_publications
  set status = 'unpublished', unpublished_by = actor_user_id,
    unpublished_at = effective_unpublished_at
  where id = any(publication_ids) and status = 'current';
  if not found then raise exception 'stale unpublication preview' using errcode = '40001'; end if;
  insert into public.schedule_publication_events (
    workspace_id, week_start, action, actor_user_id, location_ids,
    publication_ids, preflight_fingerprint, diff_summary
  ) values (
    target_workspace_id, target_week_start, 'unpublished', actor_user_id,
    normalized_locations, publication_ids, expected_fingerprint,
    jsonb_build_object('locations', preview->'locations')
  );
  return jsonb_build_object(
    'status', 'unpublished', 'workspace_id', target_workspace_id,
    'week_start', target_week_start, 'location_ids', to_jsonb(normalized_locations),
    'publication_ids', to_jsonb(publication_ids),
    'unpublished_at', effective_unpublished_at
  );
end;
$$;

revoke all on function public.schedule_actor_can_publish_service(uuid, uuid, uuid),
  public.schedule_current_week_start_service(uuid),
  public.get_schedule_publication_history_service(uuid, uuid, date),
  public.preview_schedule_publication_service(uuid, uuid, uuid, uuid[]),
  public.publish_schedule_draft_service(uuid, uuid, uuid, uuid[], integer, text, jsonb),
  public.preview_schedule_unpublication_service(uuid, uuid, date, uuid[]),
  public.unpublish_schedule_service(uuid, uuid, date, uuid[], text)
from public, anon, authenticated;
grant execute on function public.schedule_actor_can_publish_service(uuid, uuid, uuid),
  public.schedule_current_week_start_service(uuid),
  public.get_schedule_publication_history_service(uuid, uuid, date),
  public.preview_schedule_publication_service(uuid, uuid, uuid, uuid[]),
  public.publish_schedule_draft_service(uuid, uuid, uuid, uuid[], integer, text, jsonb),
  public.preview_schedule_unpublication_service(uuid, uuid, date, uuid[]),
  public.unpublish_schedule_service(uuid, uuid, date, uuid[], text)
to service_role;

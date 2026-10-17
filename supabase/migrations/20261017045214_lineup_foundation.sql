-- LINEUP stage 1 (Line-up PLAN §5–§7; KARARLAR "Lineup", 13–14 Oct; Mert's go 16 Oct): what a lineup
-- keeps beside the Schedule, and the day's read. A lineup is the day's live Schedule per location and
-- shift type; what a manager changes there (section, order, call off, hours, job, labels, notes) stays in
-- the lineup and never changes the Schedule. Adds only: five tables, one core action, one service.
--   * location_sections: a location's sections (Patio, Section 1...), empty until a manager adds one;
--   * daily_lineups: one per location, day and shift type (none = the day's other shifts), with its notes;
--   * daily_lineup_rows: what the lineup changes about a Schedule shift (by its source shift, which a
--     republish keeps), or a person added in the lineup only;
--   * daily_lineup_versions and daily_lineup_acknowledgements: a shared version and who acknowledged it
--     (written from stage 5; read here so the read is whole);
--   * lineup.read: a place read behind the schedule.read permission (no new permission, KARARLAR);
--   * get_lineup_day_service: the day for the locations the actor reads, gated by the core.
-- Every table: row level security on, nothing granted to the browser; access is through the services.

-- Sections -----------------------------------------------------------------------------------------------

create table public.location_sections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  location_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  sort_order integer not null default 0 check (sort_order >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  unique (id, location_id),
  foreign key (location_id, workspace_id) references public.locations (id, workspace_id) on delete cascade
);

-- One live section of a name per location; an archived one keeps its name for history.
create unique index location_sections_name_idx
  on public.location_sections (location_id, lower(btrim(name))) where archived_at is null;

-- Lineups ------------------------------------------------------------------------------------------------

create table public.daily_lineups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  location_id uuid not null,
  service_date date not null,
  -- null: the day's shifts that have no shift type ("Other shifts").
  shift_type_id uuid,
  specials text not null default '' check (char_length(specials) <= 500),
  n86 text not null default '' check (char_length(n86) <= 500),
  shift_notes text not null default '' check (char_length(shift_notes) <= 1000),
  -- A shared lineup the manager opened again (Unpublish / Republish, stage 5).
  editing boolean not null default false,
  latest_version integer not null default 0 check (latest_version >= 0),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (id, workspace_id),
  unique (id, location_id, service_date),
  foreign key (location_id, workspace_id) references public.locations (id, workspace_id) on delete cascade,
  foreign key (shift_type_id, workspace_id) references public.shift_types (id, workspace_id) on delete restrict
);

create unique index daily_lineups_day_idx
  on public.daily_lineups (location_id, service_date, shift_type_id) nulls not distinct;

-- Rows ---------------------------------------------------------------------------------------------------

create table public.daily_lineup_rows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  lineup_id uuid not null,
  -- The lineup's location and day, kept on the row so it can only belong there.
  location_id uuid not null,
  service_date date not null,
  -- A Schedule shift: its source shift id, which every publication of the week keeps
  -- (schedule_published_shifts.source_shift_id). Null: a person added in the lineup only.
  source_shift_id uuid,
  employee_id uuid,
  -- The lineup's own values; null keeps the Schedule's.
  job_id uuid,
  starts time,
  ends time,
  label_ids uuid[],
  section_id uuid,
  sort_order integer check (sort_order is null or sort_order >= 0),
  called_off_at timestamptz,
  called_off_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  foreign key (lineup_id, workspace_id) references public.daily_lineups (id, workspace_id) on delete cascade,
  foreign key (lineup_id, location_id, service_date) references public.daily_lineups (id, location_id, service_date) on delete cascade,
  foreign key (section_id, location_id) references public.location_sections (id, location_id) on delete restrict,
  foreign key (employee_id, workspace_id) references public.employee_profiles (id, workspace_id) on delete cascade,
  foreign key (job_id, workspace_id) references public.jobs (id, workspace_id) on delete restrict,
  -- A Schedule shift, or a person added in the lineup only with her job and hours.
  constraint daily_lineup_rows_kind check (
    (source_shift_id is not null and employee_id is null)
    or (source_shift_id is null and employee_id is not null and job_id is not null and starts is not null and ends is not null)
  ),
  constraint daily_lineup_rows_hours check ((starts is null) = (ends is null) and (starts is null or starts <> ends)),
  constraint daily_lineup_rows_call_off check ((called_off_at is null) = (called_off_by is null))
);

-- A Schedule shift is in one lineup of its day. A shift the Schedule moves to another day leaves the
-- old day's row behind (the read only joins rows of the day it reads); the new day may have its own.
create unique index daily_lineup_rows_shift_idx
  on public.daily_lineup_rows (workspace_id, source_shift_id, service_date) where source_shift_id is not null;
create index daily_lineup_rows_lineup_idx on public.daily_lineup_rows (lineup_id);
create index daily_lineup_rows_employee_idx on public.daily_lineup_rows (employee_id) where employee_id is not null;
create index daily_lineup_rows_section_idx on public.daily_lineup_rows (section_id) where section_id is not null;

-- Shared versions and acknowledgements ---------------------------------------------------------------------

create table public.daily_lineup_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  lineup_id uuid not null,
  version integer not null check (version > 0),
  shared_at timestamptz not null default now(),
  shared_by uuid references auth.users (id) on delete set null,
  ask_ack boolean not null default true,
  -- The rows and notes as shared; an approved Shift Hub, time off or Schedule change patches it in place.
  snapshot jsonb not null,
  fingerprint text check (fingerprint is null or char_length(fingerprint) = 64),
  live_changes jsonb not null default '[]'::jsonb check (jsonb_typeof(live_changes) = 'array'),
  unique (lineup_id, version),
  unique (id, workspace_id),
  foreign key (lineup_id, workspace_id) references public.daily_lineups (id, workspace_id) on delete cascade
);

create table public.daily_lineup_acknowledgements (
  version_id uuid not null,
  workspace_id uuid not null,
  employee_id uuid not null,
  acknowledged_at timestamptz not null default now(),
  -- Carried from an earlier version when the person's row did not change.
  carried_from_version integer check (carried_from_version is null or carried_from_version > 0),
  primary key (version_id, employee_id),
  foreign key (version_id, workspace_id) references public.daily_lineup_versions (id, workspace_id) on delete cascade,
  foreign key (employee_id, workspace_id) references public.employee_profiles (id, workspace_id) on delete cascade
);

create index daily_lineup_acknowledgements_employee_idx on public.daily_lineup_acknowledgements (employee_id);

do $$
declare
  t text;
begin
  foreach t in array array['location_sections', 'daily_lineups', 'daily_lineup_rows', 'daily_lineup_versions',
                           'daily_lineup_acknowledgements'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end;
$$;

-- Who may read -------------------------------------------------------------------------------------------

insert into app_private.authz_actions (key, scope_class, effect, permission_key)
values ('lineup.read', 'place', 'read', 'schedule.read');

-- The day ------------------------------------------------------------------------------------------------

-- The day's lineups at the locations the actor reads (all of them, or those asked for, which the core
-- checks: an unknown location and one out of reach get the same answer). Each lineup is the live
-- Schedule's shifts of its shift type with what the lineup changed, and the people added in the lineup
-- only. A closed location has no lineup, only what closed it.
create function public.get_lineup_day_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_date date,
  target_location_ids uuid[] default null,
  target_shift_type_ids uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  reach uuid[] := app_private.scope_set(actor_user_id, target_workspace_id, 'lineup.read');
  first_day text;
  resolved_week_start date;
  result jsonb;
begin
  if target_date is null then
    raise exception 'a day is required' using errcode = '22023', hint = 'lineup.invalid_day';
  end if;
  if target_location_ids is not null then
    perform app_private.authorize(actor_user_id, target_workspace_id, 'lineup.read', target_locations => target_location_ids);
  elsif cardinality(reach) = 0
     and (app_private.authz_reason(actor_user_id, target_workspace_id, 'lineup.read') is distinct from 'out_of_scope'
          or exists (select 1 from public.locations l where l.workspace_id = target_workspace_id and l.deleted_at is null)) then
    -- Nowhere to read: the core says why. A workspace with no live location reads as empty.
    perform app_private.authorize(actor_user_id, target_workspace_id, 'lineup.read');
  end if;

  select s.week_start_day into first_day
  from public.workspace_scheduling_settings s where s.workspace_id = target_workspace_id;
  resolved_week_start := case first_day
    when 'sunday' then target_date - extract(dow from target_date)::integer
    else target_date - (extract(isodow from target_date)::integer - 1)
  end;

  with places as materialized (
    select l.id, l.name, l.timezone, l.sort_order
    from public.locations l
    where l.workspace_id = target_workspace_id and l.archived_at is null and l.deleted_at is null
      and l.id = any (reach)
      and (target_location_ids is null or l.id = any (target_location_ids))
  ), closures as materialized (
    select c.location_id, c.kind, c.title, c.opens, c.closes, c.status
    from public.schedule_closures c
    join places p on p.id = c.location_id
    where c.workspace_id = target_workspace_id and c.closed_date = target_date
  ), shifts as materialized (
    select s.*
    from public.schedule_published_shifts s
    join public.schedule_location_publications publication
      on publication.id = s.publication_id and publication.status = 'current'
     and publication.week_start = resolved_week_start
    join places p on p.id = s.location_id
    where s.workspace_id = target_workspace_id and s.scheduled_date = target_date
  ), headers as materialized (
    select d.*
    from public.daily_lineups d
    join places p on p.id = d.location_id
    where d.workspace_id = target_workspace_id and d.service_date = target_date
  ), rows_all as materialized (
    -- A Schedule shift, with what its lineup changed.
    select s.location_id,
      case when r.id is not null then h.shift_type_id else s.shift_type_id end as group_type,
      r.id as row_id, s.id as shift_id, s.source_shift_id, s.employee_id,
      coalesce(r.job_id, s.job_id) as job_id, s.job_id as schedule_job_id,
      coalesce(r.starts, s.start_time) as starts, coalesce(r.ends, s.end_time) as ends,
      s.start_time as schedule_starts, s.end_time as schedule_ends,
      coalesce(r.label_ids, s.label_ids) as label_ids, r.label_ids is not null as own_labels, s.label_names,
      s.shift_type_id as schedule_type, r.section_id, r.sort_order, r.called_off_at, r.called_off_by, false as lineup_only
    from shifts s
    -- Only a row of this day's lineups: a shift moved here from another day comes as the Schedule has it.
    left join (public.daily_lineup_rows r join headers h on h.id = r.lineup_id)
      on r.workspace_id = target_workspace_id and r.source_shift_id = s.source_shift_id
     and r.location_id = s.location_id and r.service_date = target_date
    union all
    -- A person added in the lineup only.
    select r.location_id, h.shift_type_id, r.id, null, null, r.employee_id,
      r.job_id, null, r.starts, r.ends, null, null,
      coalesce(r.label_ids, '{}'), true, '{}', null, r.section_id, r.sort_order, r.called_off_at, r.called_off_by, true
    from public.daily_lineup_rows r
    join headers h on h.id = r.lineup_id
    where r.source_shift_id is null
  ), rows_wanted as materialized (
    select r.* from rows_all r
    where target_shift_type_ids is null or r.group_type = any (target_shift_type_ids)
  ), groups as materialized (
    select distinct r.location_id, r.group_type from rows_wanted r
    union
    select h.location_id, h.shift_type_id from headers h
    where target_shift_type_ids is null or h.shift_type_id = any (target_shift_type_ids)
  )
  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'date', target_date,
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'timezone', p.timezone,
        'closed', (select jsonb_build_object('title', c.title, 'status', c.status)
                   from closures c where c.location_id = p.id and c.kind = 'closed' order by c.title limit 1),
        'short_hours', (select jsonb_build_object('title', c.title, 'status', c.status,
                          'opens', to_char(c.opens, 'HH24:MI'), 'closes', to_char(c.closes, 'HH24:MI'))
                        from closures c where c.location_id = p.id and c.kind = 'short' order by c.title limit 1),
        'lineups', case when exists (select 1 from closures c where c.location_id = p.id and c.kind = 'closed')
          then '[]'::jsonb
          else coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', h.id,
              'shift_type_id', g.group_type,
              'shift_type_name', t.name,
              'color', t.color,
              'status', case
                when target_date < (now() at time zone p.timezone)::date then 'past'
                when h.editing then 'editing'
                when coalesce(h.latest_version, 0) > 0 then 'shared'
                else 'draft' end,
              'version', nullif(h.latest_version, 0),
              'shared_at', v.shared_at,
              'ask_ack', v.ask_ack,
              'acknowledged', case when v.id is null then null
                else (select count(*) from public.daily_lineup_acknowledgements a where a.version_id = v.id) end,
              'revision', h.revision,
              'notes', jsonb_build_object('specials', coalesce(h.specials, ''), 'n86', coalesce(h.n86, ''),
                'shift_notes', coalesce(h.shift_notes, '')),
              'rows', coalesce((
                select jsonb_agg(jsonb_build_object(
                  'id', r.row_id,
                  'shift_id', r.shift_id,
                  'source_shift_id', r.source_shift_id,
                  'employee_id', r.employee_id,
                  'name', case when e.id is not null
                    then coalesce(nullif(e.preferred_name, ''), e.first_name) || ' ' || e.last_name end,
                  'job_id', r.job_id, 'job_name', j.name, 'job_color', j.color,
                  'department_id', dept.id, 'department_name', dept.name,
                  'start_time', to_char(r.starts, 'HH24:MI'), 'end_time', to_char(r.ends, 'HH24:MI'),
                  'crosses_midnight', r.ends <= r.starts,
                  'schedule_start_time', to_char(r.schedule_starts, 'HH24:MI'),
                  'schedule_end_time', to_char(r.schedule_ends, 'HH24:MI'),
                  'label_ids', to_jsonb(r.label_ids),
                  'label_names', case when r.own_labels
                    then coalesce((select jsonb_agg(sl.name order by array_position(r.label_ids, sl.id))
                                   from public.shift_labels sl
                                   where sl.workspace_id = target_workspace_id and sl.id = any (r.label_ids)), '[]'::jsonb)
                    else to_jsonb(r.label_names) end,
                  'section_id', r.section_id, 'section_name', sec.name,
                  'sort_order', r.sort_order,
                  'called_off_at', r.called_off_at, 'called_off_by', r.called_off_by,
                  'lineup_only', r.lineup_only,
                  'changed', to_jsonb(array_remove(array[
                    case when not r.lineup_only and r.starts is distinct from r.schedule_starts then 'start_time' end,
                    case when not r.lineup_only and r.ends is distinct from r.schedule_ends then 'end_time' end,
                    case when not r.lineup_only and r.job_id is distinct from r.schedule_job_id then 'job_id' end,
                    case when not r.lineup_only and r.own_labels then 'labels' end,
                    case when not r.lineup_only and r.group_type is distinct from r.schedule_type then 'shift_type' end
                  ]::text[], null))
                ) order by r.sort_order nulls last, r.starts, e.last_name nulls last, e.first_name, r.shift_id)
                from rows_wanted r
                left join public.employee_profiles e on e.id = r.employee_id and e.workspace_id = target_workspace_id
                -- Names as the Schedule names them: archived ones too, null once deleted.
                left join public.jobs j on j.id = r.job_id and j.workspace_id = target_workspace_id and j.deleted_at is null
                left join public.departments dept on dept.id = j.department_id and dept.workspace_id = target_workspace_id
                  and dept.deleted_at is null
                left join public.location_sections sec on sec.id = r.section_id
                where r.location_id = p.id and r.group_type is not distinct from g.group_type
              ), '[]'::jsonb)
            ) order by t.sort_order nulls last, t.name nulls last)
            from groups g
            left join public.shift_types t on t.id = g.group_type and t.workspace_id = target_workspace_id
              and t.deleted_at is null
            left join headers h on h.location_id = g.location_id and h.shift_type_id is not distinct from g.group_type
            left join public.daily_lineup_versions v on v.lineup_id = h.id and v.version = h.latest_version
            where g.location_id = p.id
          ), '[]'::jsonb) end
      ) order by p.sort_order, p.name)
      from places p
    ), '[]'::jsonb),
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'location_id', s.location_id, 'name', s.name,
        'sort_order', s.sort_order) order by s.location_id, s.sort_order, s.name)
      from public.location_sections s
      join places p on p.id = s.location_id
      where s.archived_at is null
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_lineup_day_service(uuid, uuid, date, uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.get_lineup_day_service(uuid, uuid, date, uuid[], uuid[]) to service_role;

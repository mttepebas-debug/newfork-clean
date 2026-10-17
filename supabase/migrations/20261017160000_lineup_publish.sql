-- LINEUP-PUBLISH (KARARLAR "Lineup yayını öne alındı", Mert 2026-10-17; Line-up PLAN §6, §7, §9, §10): a manager
-- publishes a day's lineups and takes them back; an employee reads the published lineups she is on and
-- acknowledges them. A published lineup shows the live day (the Schedule with what the lineup changed), never a
-- copy: an approved Shift Hub, time off or Schedule change shows on it at once without touching their code.
--   * lineup.share (place, write, behind schedule.publish) and lineup.acknowledge (one's own); no new permission.
--     An employee reads her lineups with employee_hub.read, as she reads the rest of her schedule;
--   * lineup_commands: what a command answered, so the same command id sent again answers the same, once;
--   * app_private.lineup_day: the day's read (the body get_lineup_day_service had), for the services below, so
--     the manager's day, the share's record and the employee's read come from one place;
--   * lineup_command_service: share and unpublish. Share records a version (the lineup as it was, for the
--     record) and tells the people on it once; unpublish takes it back (the lineup's editing flag) silently;
--   * get_my_lineups_service and acknowledge_lineup_service: the employee's side;
--   * get_lineup_day_service: as before, plus who published and when, and how many are on it and have the app;
--     each row says whether its person has the app and when she acknowledged the version staff see.
-- Changes an existing function (get_lineup_day_service, same answer with fields added): live class risky.

-- Actions -------------------------------------------------------------------------------------------------

insert into app_private.authz_actions (key, scope_class, effect, permission_key)
values ('lineup.share', 'place', 'write', 'schedule.publish'),
       ('lineup.acknowledge', 'own', 'write', null);

-- Commands ------------------------------------------------------------------------------------------------

create table public.lineup_commands (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  actor_user_id uuid not null references auth.users (id) on delete cascade,
  command_id uuid not null,
  kind text not null check (kind in ('share', 'unpublish')),
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, actor_user_id, command_id)
);

alter table public.lineup_commands enable row level security;
revoke all on public.lineup_commands from anon, authenticated;

-- The day's read ------------------------------------------------------------------------------------------

-- The first day of the week a day is in, as the workspace counts weeks.
create function app_private.lineup_week_start(target_workspace_id uuid, target_date date)
returns date
language sql
stable
set search_path = ''
as $$
  select case (select s.week_start_day from public.workspace_scheduling_settings s
               where s.workspace_id = lineup_week_start.target_workspace_id)
    when 'sunday' then lineup_week_start.target_date - extract(dow from lineup_week_start.target_date)::integer
    else lineup_week_start.target_date - (extract(isodow from lineup_week_start.target_date)::integer - 1)
  end
$$;

revoke all on function app_private.lineup_week_start(uuid, date) from public;

-- The day's lineups at the given locations, no question asked: whoever calls it has asked the core. Each
-- lineup is the live Schedule's shifts of its shift type with what the lineup changed, and the people added
-- in the lineup only. A closed location has no lineup, only what closed it.
create function app_private.lineup_day(
  target_workspace_id uuid,
  target_date date,
  target_places uuid[],
  target_shift_type_ids uuid[] default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  resolved_week_start date := app_private.lineup_week_start(target_workspace_id, target_date);
  result jsonb;
begin
  with places as materialized (
    select l.id, l.name, l.timezone, l.sort_order
    from public.locations l
    where l.workspace_id = target_workspace_id and l.archived_at is null and l.deleted_at is null
      and l.id = any (target_places)
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
  ), people as materialized (
    -- Who is on each lineup, and whether they have the app (a membership that can sign in).
    select r.location_id, r.group_type, count(distinct r.employee_id) as people,
      count(distinct r.employee_id) filter (where exists (
        select 1 from public.employee_profiles e
        join public.workspace_memberships m on m.workspace_id = target_workspace_id and m.user_id = e.user_id
        where e.id = r.employee_id and e.workspace_id = target_workspace_id
          and m.status in ('active', 'pending_activation'))) as with_app
    from rows_wanted r
    where r.employee_id is not null
    group by r.location_id, r.group_type
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
              -- LINEUP-PUBLISH: whether employees see it now, the version they see, who published it, and how
              -- many are on it and have the app ("Read 7/11" is acknowledged / with_app).
              'published', coalesce(h.latest_version, 0) > 0 and not h.editing,
              'version_id', v.id,
              'shared_by', v.shared_by,
              'shared_by_name', (select btrim(coalesce(nullif(e.preferred_name, ''), e.first_name) || ' ' || e.last_name)
                                 from public.employee_profiles e
                                 where e.workspace_id = target_workspace_id and e.user_id = v.shared_by
                                 order by e.archived_at nulls first limit 1),
              'people', coalesce(pc.people, 0),
              'with_app', coalesce(pc.with_app, 0),
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
                  -- The Read list (Mert 2026-10-17): whether the person has the app (what with_app counts) and
                  -- when she acknowledged the version staff see; null for anyone else, and for nobody.
                  'has_app', r.employee_id is not null and exists (
                    select 1 from public.workspace_memberships m
                    where m.workspace_id = target_workspace_id and m.user_id = e.user_id
                      and m.status in ('active', 'pending_activation')),
                  'acknowledged_at', case when v.id is not null and r.employee_id is not null then
                    (select a.acknowledged_at from public.daily_lineup_acknowledgements a
                     where a.version_id = v.id and a.employee_id = r.employee_id) end,
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
            left join people pc on pc.location_id = g.location_id and pc.group_type is not distinct from g.group_type
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

revoke all on function app_private.lineup_day(uuid, date, uuid[], uuid[]) from public;

-- The manager's day: the core says where the actor reads, the read is lineup_day's.
create or replace function public.get_lineup_day_service(
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

  return app_private.lineup_day(target_workspace_id, target_date,
    array(select x from unnest(reach) x where target_location_ids is null or x = any (target_location_ids)),
    target_shift_type_ids);
end;
$$;

-- Share and unpublish ---------------------------------------------------------------------------------------

-- app_private.notify, guarded: the lineup work outlives a notice that fails (domain_work_outlives_notifications).
create function app_private.lineup_tell(target_type text, target_workspace uuid, target_recipients uuid[],
  target_event_key text, target_title text, target_body text, target_url text, target_actor uuid,
  target_subject_type text, target_subject_id uuid, target_data jsonb default '{}')
returns integer
language plpgsql
set search_path = ''
as $$
begin
  return app_private.notify(target_type, target_workspace, target_recipients, target_event_key, target_title, target_body,
    target_url, target_actor, target_subject_type, target_subject_id, target_data);
exception when others then
  raise warning 'lineup_tell: % notice % skipped: % (%)', target_type, target_event_key, sqlerrm, sqlstate;
  return 0;
end;
$$;

revoke all on function app_private.lineup_tell(text, uuid, uuid[], text, text, text, text, uuid, text, uuid, jsonb) from public;

-- One entry for a manager's lineup commands (PLAN §6); this round share and unpublish. The same command id
-- sent again by the same person answers what it answered the first time and does nothing more.
--   share     {lineups: [{location_id, service_date, shift_type_id | null}], ask_ack}: each lineup is
--             published as a new version; one already published stays as it is.
--   unpublish {lineups: [...]}: employees no longer see it; the manager publishes it again to show it.
-- Only at locations where the core lets the actor share (lineup.share); an unknown location gets the same
-- answer as one out of reach. Not a past day (the location's own clock), not a closed one, and not before the
-- week's Schedule is published there.
create function public.lineup_command_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  command_id uuid,
  kind text,
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior public.lineup_commands;
  item jsonb;
  place public.locations;
  day date;
  type_id uuid;
  header public.daily_lineups;
  live jsonb;
  version_row public.daily_lineup_versions;
  ask boolean;
  done jsonb := '[]'::jsonb;
  told uuid[] := '{}';
  shared_lineups integer := 0;
  shared_names text[] := '{}';
  shared_day date;
  result jsonb;
begin
  if command_id is null or kind is null or kind not in ('share', 'unpublish')
     or jsonb_typeof(payload) is distinct from 'object' or jsonb_typeof(payload -> 'lineups') is distinct from 'array'
     or jsonb_array_length(payload -> 'lineups') = 0 or jsonb_array_length(payload -> 'lineups') > 50
     or (kind = 'share' and jsonb_typeof(payload -> 'ask_ack') is distinct from 'boolean') then
    raise exception 'Choose lineups to publish or unpublish' using errcode = '22023', hint = 'lineup.invalid_command';
  end if;
  -- The core first, every location named: a stranger learns nothing, not even a command id.
  for item in select value from jsonb_array_elements(payload -> 'lineups') loop
    if jsonb_typeof(item) is distinct from 'object' or item ->> 'location_id' is null or item ->> 'service_date' is null
       or (item ->> 'location_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or (item ->> 'service_date') !~ '^\d{4}-\d{2}-\d{2}$'
       or (item ->> 'shift_type_id' is not null
           and (item ->> 'shift_type_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
      raise exception 'Choose lineups to publish or unpublish' using errcode = '22023', hint = 'lineup.invalid_command';
    end if;
    perform app_private.authorize(actor_user_id, target_workspace_id, 'lineup.share',
      target_locations => array[(item ->> 'location_id')::uuid]);
  end loop;
  -- One command is one day: its notice names that day.
  if (select count(distinct x ->> 'service_date') from jsonb_array_elements(payload -> 'lineups') x) > 1 then
    raise exception 'Choose lineups of one day' using errcode = '22023', hint = 'lineup.one_day';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text, 1017));
  select * into prior from public.lineup_commands c
  where c.workspace_id = target_workspace_id and c.actor_user_id = lineup_command_service.actor_user_id
    and c.command_id = lineup_command_service.command_id;
  if prior.command_id is not null then
    if prior.kind <> lineup_command_service.kind or prior.payload <> lineup_command_service.payload then
      raise exception 'This command id was used for another command' using errcode = '22023', hint = 'lineup.command_reused';
    end if;
    return prior.result;
  end if;

  ask := coalesce((payload ->> 'ask_ack')::boolean, true);
  for item in select value from jsonb_array_elements(payload -> 'lineups') loop
    select * into place from public.locations l
    where l.id = (item ->> 'location_id')::uuid and l.workspace_id = target_workspace_id;
    day := (item ->> 'service_date')::date;
    type_id := (item ->> 'shift_type_id')::uuid;
    if type_id is not null and not exists (
      select 1 from public.shift_types t where t.id = type_id and t.workspace_id = target_workspace_id
        and (t.deleted_at is null or lineup_command_service.kind = 'unpublish')
    ) then
      -- An unknown shift type is an unknown lineup: the same answer as one out of reach. A deleted one is not
      -- published again, but a lineup published before it went can still be taken back.
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'lineup.share';
    end if;
    if day < (now() at time zone place.timezone)::date then
      raise exception 'This day has passed' using errcode = '22023', hint = 'lineup.past_day';
    end if;
    if exists (select 1 from public.schedule_closures c
               where c.workspace_id = target_workspace_id and c.location_id = place.id and c.closed_date = day
                 and c.kind = 'closed') then
      raise exception 'This location is closed that day' using errcode = '22023', hint = 'lineup.closed_day';
    end if;

    select * into header from public.daily_lineups d
    where d.workspace_id = target_workspace_id and d.location_id = place.id and d.service_date = day
      and d.shift_type_id is not distinct from type_id
    for update;

    if lineup_command_service.kind = 'share' then
      if not exists (select 1 from public.schedule_location_publications publication
                     where publication.workspace_id = target_workspace_id and publication.location_id = place.id
                       and publication.status = 'current'
                       and publication.week_start = app_private.lineup_week_start(target_workspace_id, day)) then
        raise exception 'Publish this week''s Schedule first' using errcode = '22023', hint = 'lineup.week_not_published';
      end if;
      if header.id is not null and header.latest_version > 0 and not header.editing then
        -- Already published: it stays as it is, its acknowledgements too.
        done := done || jsonb_build_object('lineup_id', header.id, 'version', header.latest_version, 'status', 'unchanged');
        continue;
      end if;
      if header.id is null then
        insert into public.daily_lineups (workspace_id, location_id, service_date, shift_type_id, updated_by)
        values (target_workspace_id, place.id, day, type_id, actor_user_id)
        returning * into header;
      end if;
      -- The lineup as it is now, for the record; employees read the live day, never this.
      select x into live
      from jsonb_array_elements(app_private.lineup_day(target_workspace_id, day, array[place.id]) -> 'locations') l,
        jsonb_array_elements(l -> 'lineups') x
      where (x ->> 'shift_type_id')::uuid is not distinct from type_id;
      live := jsonb_build_object('notes', live -> 'notes', 'rows', coalesce(live -> 'rows', '[]'::jsonb));
      insert into public.daily_lineup_versions (workspace_id, lineup_id, version, shared_by, ask_ack, snapshot, fingerprint)
      values (target_workspace_id, header.id, header.latest_version + 1, actor_user_id, ask, live,
        encode(sha256(convert_to(live::text, 'UTF8')), 'hex'))
      returning * into version_row;
      update public.daily_lineups d
      set latest_version = version_row.version, editing = false, revision = d.revision + 1,
        updated_at = now(), updated_by = actor_user_id
      where d.id = header.id;
      done := done || jsonb_build_object('lineup_id', header.id, 'version', version_row.version,
        'version_id', version_row.id, 'status', 'shared');
      -- Who hears of it: everybody on it with an account (notify_rows drops whoever is not a member now).
      told := told || array(
        select e.user_id from jsonb_array_elements(live -> 'rows') r
        join public.employee_profiles e on e.id = (r ->> 'employee_id')::uuid and e.workspace_id = target_workspace_id
        where e.user_id is not null);
      shared_lineups := shared_lineups + 1;
      shared_names := shared_names || coalesce((select t.name from public.shift_types t where t.id = type_id), '');
      shared_day := case when shared_day is null or shared_day = day then day else shared_day end;
    else
      if header.id is null or header.latest_version = 0 then
        raise exception 'This lineup is not published' using errcode = '22023', hint = 'lineup.not_shared';
      end if;
      if not header.editing then
        update public.daily_lineups d
        set editing = true, revision = d.revision + 1, updated_at = now(), updated_by = actor_user_id
        where d.id = header.id;
      end if;
      -- Unpublish tells nobody (PLAN §9).
      done := done || jsonb_build_object('lineup_id', header.id, 'version', header.latest_version, 'status', 'unpublished');
    end if;
  end loop;

  result := jsonb_build_object('command_id', command_id, 'kind', kind, 'lineups', done);
  insert into public.lineup_commands (workspace_id, actor_user_id, command_id, kind, payload, result)
  values (target_workspace_id, actor_user_id, command_id, kind, payload, result);

  -- One notice per person per share, however many lineups it published (PLAN §9; lineup.shared). Its event key
  -- is the transaction's, so a share sent again under the same command id (answered above) tells nobody again.
  if shared_lineups > 0 then
    perform app_private.lineup_tell('lineup.shared', target_workspace_id,
      array(select distinct x from unnest(told) x),
      'lineup_published:' || target_workspace_id::text || ':' || txid_current()::text,
      case when shared_lineups = 1
        then 'Your ' || coalesce(nullif(shared_names[1], '') || ' ', '') || 'lineup is ready'
        else 'Your lineups for ' || to_char(shared_day, 'Dy, Mon FMDD') || ' are ready' end
        || case when ask then ' · please acknowledge' else '' end,
      null,
      '/app/employee-hub/schedule/lineup?date=' || to_char(shared_day, 'YYYY-MM-DD'),
      actor_user_id, 'lineup_share', command_id,
      jsonb_build_object('date', shared_day, 'ask_ack', ask,
        'lineup_ids', (select jsonb_agg(d -> 'lineup_id') from jsonb_array_elements(done) d where d ->> 'status' = 'shared')));
  end if;
  return result;
end;
$$;

revoke all on function public.lineup_command_service(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.lineup_command_service(uuid, uuid, uuid, text, jsonb) to service_role;

-- The employee's side -----------------------------------------------------------------------------------------

-- The published lineups of a day she is on, each with her own rows, the team and the notes, as they are now
-- (PLAN §11.3: the whole team). One she is not on, one taken back and a draft are not hers to read.
create function public.get_my_lineups_service(
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
  me uuid;
  places uuid[];
  result jsonb;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee_hub.read');
  if target_date is null then
    raise exception 'a day is required' using errcode = '22023', hint = 'lineup.invalid_day';
  end if;
  select e.id into me from public.employee_profiles e
  where e.workspace_id = target_workspace_id and e.user_id = actor_user_id and e.archived_at is null;
  -- Only the locations with a published lineup that day: the read stays small.
  places := array(
    select distinct d.location_id from public.daily_lineups d
    where d.workspace_id = target_workspace_id and d.service_date = target_date
      and d.latest_version > 0 and not d.editing);
  if me is null or cardinality(places) = 0 then
    return jsonb_build_object('workspace_id', target_workspace_id, 'date', target_date, 'lineups', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', x -> 'id',
      'version_id', x -> 'version_id',
      'version', x -> 'version',
      'location', jsonb_build_object('id', l -> 'id', 'name', l -> 'name', 'timezone', l -> 'timezone'),
      'shift_type_id', x -> 'shift_type_id',
      'shift_type_name', x -> 'shift_type_name',
      'color', x -> 'color',
      'shared_at', x -> 'shared_at',
      'ask_ack', x -> 'ask_ack',
      'acknowledged_at', (select to_jsonb(a.acknowledged_at) from public.daily_lineup_acknowledgements a
                          where a.version_id = (x ->> 'version_id')::uuid and a.employee_id = me),
      'notes', x -> 'notes',
      'mine', (select jsonb_agg(mine_rows.v) from (
                 select jsonb_build_object('start_time', r -> 'start_time', 'end_time', r -> 'end_time',
                   'crosses_midnight', r -> 'crosses_midnight', 'job_name', r -> 'job_name', 'job_color', r -> 'job_color',
                   'section_name', r -> 'section_name', 'label_names', r -> 'label_names',
                   'called_off', r ->> 'called_off_at' is not null) v
                 from jsonb_array_elements(x -> 'rows') r where (r ->> 'employee_id')::uuid = me) mine_rows),
      -- The team as the lineup orders it: people only (an open shift is nobody's), no manager detail.
      'team', coalesce((select jsonb_agg(jsonb_build_object('employee_id', r -> 'employee_id', 'name', r -> 'name',
                   'job_name', r -> 'job_name', 'job_color', r -> 'job_color',
                   'department_name', r -> 'department_name', 'start_time', r -> 'start_time',
                   'end_time', r -> 'end_time', 'crosses_midnight', r -> 'crosses_midnight',
                   'section_name', r -> 'section_name', 'label_names', r -> 'label_names',
                   'called_off', r ->> 'called_off_at' is not null,
                   'is_me', (r ->> 'employee_id')::uuid = me) order by o)
                 from jsonb_array_elements(x -> 'rows') with ordinality t(r, o)
                 where r ->> 'employee_id' is not null), '[]'::jsonb)
    ) order by l ->> 'name', x ->> 'shift_type_name'), '[]'::jsonb)
  into result
  from jsonb_array_elements(app_private.lineup_day(target_workspace_id, target_date, places) -> 'locations') l,
    jsonb_array_elements(l -> 'lineups') x
  where (x -> 'published')::boolean
    and exists (select 1 from jsonb_array_elements(x -> 'rows') r where (r ->> 'employee_id')::uuid = me);

  return jsonb_build_object('workspace_id', target_workspace_id, 'date', target_date, 'lineups', result);
end;
$$;

revoke all on function public.get_my_lineups_service(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.get_my_lineups_service(uuid, uuid, date) to service_role;

-- She acknowledges the published version of a lineup she is on now. Again: the same answer.
create function public.acknowledge_lineup_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid;
  version_row public.daily_lineup_versions;
  header public.daily_lineups;
  acknowledged timestamptz;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'lineup.acknowledge');
  select e.id into me from public.employee_profiles e
  where e.workspace_id = target_workspace_id and e.user_id = actor_user_id and e.archived_at is null;
  select * into version_row from public.daily_lineup_versions v
  where v.id = acknowledge_lineup_service.version_id and v.workspace_id = target_workspace_id;
  select * into header from public.daily_lineups d where d.id = version_row.lineup_id;
  -- Unknown, someone else's, taken back, replaced, not asking, or a lineup she is not on: one answer.
  if me is null or version_row.id is null or not version_row.ask_ack or header.editing
     or header.latest_version <> version_row.version
     or not exists (
       select 1
       from jsonb_array_elements(app_private.lineup_day(target_workspace_id, header.service_date,
              array[header.location_id]) -> 'locations') l,
         jsonb_array_elements(l -> 'lineups') x, jsonb_array_elements(x -> 'rows') r
       where (x ->> 'id')::uuid = header.id and (r ->> 'employee_id')::uuid = me) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'lineup.acknowledge';
  end if;
  insert into public.daily_lineup_acknowledgements (version_id, workspace_id, employee_id)
  values (version_row.id, target_workspace_id, me)
  on conflict on constraint daily_lineup_acknowledgements_pkey do nothing;
  select a.acknowledged_at into acknowledged from public.daily_lineup_acknowledgements a
  where a.version_id = version_row.id and a.employee_id = me;
  return jsonb_build_object('status', 'saved', 'version_id', version_row.id, 'acknowledged_at', acknowledged);
end;
$$;

revoke all on function public.acknowledge_lineup_service(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.acknowledge_lineup_service(uuid, uuid, uuid) to service_role;

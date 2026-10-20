-- LINEUP-EDIT L2b, part 2 of 4: the day reads a row's section as one of its location's sections or the name typed
-- in that lineup ("Other…"); the manager's day, the employee's lineup and a published version all read it here.
-- The body is supabase/schema.sql's (origin/main a15bf72ad), changed only where marked.

CREATE OR REPLACE FUNCTION "app_private"."lineup_day"("target_workspace_id" "uuid", "target_date" "date", "target_places" "uuid"[], "target_shift_type_ids" "uuid"[] DEFAULT NULL::"uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
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
      s.shift_type_id as schedule_type, r.section_id, r.section_name, r.sort_order, r.called_off_at, r.called_off_by,
      false as lineup_only,
      r.replaced_by_row_id
    from shifts s
    -- Only a row of this day's lineups: a shift moved here from another day comes as the Schedule has it.
    left join (public.daily_lineup_rows r join headers h on h.id = r.lineup_id)
      on r.workspace_id = target_workspace_id and r.source_shift_id = s.source_shift_id
     and r.location_id = s.location_id and r.service_date = target_date
    union all
    -- A person added in the lineup only.
    select r.location_id, h.shift_type_id, r.id, null, null, r.employee_id,
      r.job_id, null, r.starts, r.ends, null, null,
      coalesce(r.label_ids, '{}'), true, '{}', null, r.section_id, r.section_name, r.sort_order, r.called_off_at,
      r.called_off_by, true,
      r.replaced_by_row_id
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
    -- Who is on each lineup, and whether they have the app (a membership that can sign in). A called off or
    -- replaced person is not on it (LINEUP-EDIT L1, S-178); the rows still read, for their own groups.
    select r.location_id, r.group_type, count(distinct r.employee_id) as people,
      count(distinct r.employee_id) filter (where exists (
        select 1 from public.employee_profiles e
        join public.workspace_memberships m on m.workspace_id = target_workspace_id and m.user_id = e.user_id
        where e.id = r.employee_id and e.workspace_id = target_workspace_id
          and m.status in ('active', 'pending_activation'))) as with_app
    from rows_wanted r
    where r.employee_id is not null and r.called_off_at is null and r.replaced_by_row_id is null
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
              -- Read's count above the line, like the one below it, is who is on the lineup (LINEUP-EDIT L2a).
              'acknowledged', case when v.id is null then null
                else (select count(*) from public.daily_lineup_acknowledgements a where a.version_id = v.id
                        and exists (select 1 from rows_wanted w where w.location_id = g.location_id
                          and w.group_type is not distinct from g.group_type and w.employee_id = a.employee_id
                          and w.called_off_at is null and w.replaced_by_row_id is null)) end,
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
                  -- LINEUP-EDIT L2b: one of the location's sections, or a name typed in this lineup only ("Other…").
                  'section_id', r.section_id, 'section_name', coalesce(sec.name, r.section_name),
                  'sort_order', r.sort_order,
                  'called_off_at', r.called_off_at, 'called_off_by', r.called_off_by,
                  -- LINEUP-EDIT L1: the row of this lineup that took this one's place (S-178 "Replaced").
                  'replaced_by_row_id', r.replaced_by_row_id,
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


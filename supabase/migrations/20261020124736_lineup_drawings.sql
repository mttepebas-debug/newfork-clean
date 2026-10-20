-- AVATAR-IKON slice 4: every Lineup row carries a drawing (design 2026-10-19 §6; Mert 2026-10-20 "Evet, başla").
-- The person's own archive drawing first (member_avatars.art_key); otherwise one of her job's Lineup icons, dealt
-- evenly across the lineup: no icon twice before every icon once. A job with no icons deals from the shared "team"
-- drawings. The deal is seeded by the lineup (location, day, shift type), so a draft reads the same every time; a
-- share writes it into daily_lineup_drawings and from then on it stays, whatever the job's icons become. A pair
-- not written yet (somebody added afterwards) is dealt on read, the least used icon first, and the next share
-- writes it. A photo never reaches a Lineup: only archive keys are read here. This part only adds and replaces.

-- The written drawings ------------------------------------------------------------------------------

create table public.daily_lineup_drawings (
  lineup_id uuid not null,
  workspace_id uuid not null,
  employee_id uuid not null,
  job_id uuid not null,
  art_key text not null,
  created_at timestamptz not null default now(),
  primary key (lineup_id, employee_id, job_id),
  constraint daily_lineup_drawings_lineup_fkey foreign key (lineup_id, workspace_id)
    references public.daily_lineups (id, workspace_id) on delete cascade,
  constraint daily_lineup_drawings_employee_fkey foreign key (employee_id, workspace_id)
    references public.employee_profiles (id, workspace_id) on delete cascade,
  constraint daily_lineup_drawings_job_fkey foreign key (job_id, workspace_id)
    references public.jobs (id, workspace_id) on delete cascade,
  -- A drawing taken out of the archive is dealt again on the next read.
  constraint daily_lineup_drawings_art_fkey foreign key (art_key) references app_private.lineup_art (key) on delete cascade
);

alter table public.daily_lineup_drawings enable row level security;
revoke all on public.daily_lineup_drawings from anon, authenticated;

comment on table public.daily_lineup_drawings is
  'The drawing each person and job of a lineup was dealt when the lineup was shared (AVATAR-IKON slice 4). Written by lineup_command_service, read by app_private.lineup_day; nothing else.';

-- The deal ------------------------------------------------------------------------------------------

create function app_private.deal_lineup_art(seed text, pairs jsonb, stored jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  team text[] := array(select a.key from app_private.lineup_art a where a.kind = 'team');
  dealt jsonb := '{}';
  used jsonb := '{}';
  pair record;
  best text;
begin
  -- pairs: [{employee_id, job_id, icons}]; stored: {"<employee>:<job>": key}. Returns {"<employee>:<job>": key}.
  -- The written pairs of this lineup stay as written, and count.
  for pair in
    select s.key as k, s.value as art
    from jsonb_each_text(coalesce(stored, '{}'::jsonb)) s
    where exists (select 1 from jsonb_array_elements(coalesce(pairs, '[]'::jsonb)) x
                  where (x ->> 'employee_id') || ':' || (x ->> 'job_id') = s.key)
  loop
    dealt := dealt || jsonb_build_object(pair.k, pair.art);
    used := used || jsonb_build_object(pair.art, coalesce((used ->> pair.art)::integer, 0) + 1);
  end loop;
  -- The rest in the seed's order, each the least used of its pool; a tie goes in the seed's order of the pool.
  for pair in
    select t.k, t.icons from (
      select distinct on (k) (x ->> 'employee_id') || ':' || (x ->> 'job_id') as k,
        array(select jsonb_array_elements_text(coalesce(x -> 'icons', '[]'::jsonb))) as icons
      from jsonb_array_elements(coalesce(pairs, '[]'::jsonb)) x
      order by k) t
    where not dealt ? t.k
    order by md5(seed || ':' || t.k), t.k
  loop
    select c into best
    from unnest(case when cardinality(pair.icons) > 0 then pair.icons else team end) c
    order by coalesce((used ->> c)::integer, 0), md5(seed || ':' || c), c
    limit 1;
    dealt := dealt || jsonb_build_object(pair.k, best);
    if best is not null then
      used := used || jsonb_build_object(best, coalesce((used ->> best)::integer, 0) + 1);
    end if;
  end loop;
  return dealt;
end;
$$;

comment on function app_private.deal_lineup_art(text, jsonb, jsonb) is
  'AVATAR-IKON slice 4: deals Lineup drawings to a lineup''s (person, job) pairs: written pairs stay; the rest, in md5(seed:pair) order, take the least used key of their job''s icons (the team drawings when it has none), ties in md5(seed:key) order.';

-- One lineup's drawings: its pairs with their jobs' icons, its written drawings, its seed.
create function app_private.lineup_deal(target_workspace_id uuid, target_location_id uuid, target_date date,
  target_shift_type_id uuid, people jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select app_private.deal_lineup_art(
    target_location_id || ':' || target_date || ':' || coalesce(target_shift_type_id::text, 'other'),
    coalesce((
      select jsonb_agg(jsonb_build_object('employee_id', p.employee_id, 'job_id', p.job_id,
        'icons', to_jsonb(coalesce(j.lineup_icons, '{}'::text[]))))
      from (select distinct (x ->> 'employee_id')::uuid as employee_id, (x ->> 'job_id')::uuid as job_id
            from jsonb_array_elements(coalesce(people, '[]'::jsonb)) x
            where x ->> 'employee_id' is not null and x ->> 'job_id' is not null) p
      left join public.jobs j on j.id = p.job_id and j.workspace_id = target_workspace_id and j.deleted_at is null
    ), '[]'::jsonb),
    coalesce((
      select jsonb_object_agg(s.employee_id || ':' || s.job_id, s.art_key)
      from public.daily_lineups d
      join public.daily_lineup_drawings s on s.lineup_id = d.id
      where d.workspace_id = target_workspace_id and d.location_id = target_location_id
        and d.service_date = target_date and d.shift_type_id is not distinct from target_shift_type_id
    ), '{}'::jsonb))
$$;

revoke all on function app_private.deal_lineup_art(text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function app_private.lineup_deal(uuid, uuid, date, uuid, jsonb) from public, anon, authenticated;

-- The reads and the share ---------------------------------------------------------------------------

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
  ), deals as materialized (
    -- AVATAR-IKON slice 4: each lineup's drawings, dealt once per read; everyone on it counts, called off too, so
    -- calling somebody off moves nobody else's drawing.
    select g.location_id, g.group_type, app_private.lineup_deal(target_workspace_id, g.location_id, target_date,
      g.group_type, (select jsonb_agg(jsonb_build_object('employee_id', r.employee_id, 'job_id', r.job_id))
                     from rows_wanted r
                     where r.location_id = g.location_id and r.group_type is not distinct from g.group_type
                       and r.employee_id is not null)) as art
    from groups g
  ), own_art as materialized (
    -- A drawing the person chose as her avatar here comes first; a photo never reaches a lineup.
    -- Her membership is her account's in this workspace, as has_app finds it.
    select e.id as employee_id, a.art_key
    from public.employee_profiles e
    join public.workspace_memberships m on m.workspace_id = target_workspace_id and m.user_id = e.user_id
    join public.member_avatars a on a.membership_id = m.id and a.workspace_id = target_workspace_id
    where e.workspace_id = target_workspace_id and a.art_key is not null
      and e.id in (select r.employee_id from rows_wanted r)
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
                  -- AVATAR-IKON slice 4: her own drawing, else the lineup's deal; null for nobody.
                  'art_key', case when r.employee_id is not null
                    then coalesce(oa.art_key, dl.art ->> (r.employee_id || ':' || r.job_id)) end,
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
                left join own_art oa on oa.employee_id = r.employee_id
                where r.location_id = p.id and r.group_type is not distinct from g.group_type
              ), '[]'::jsonb)
            ) order by t.sort_order nulls last, t.name nulls last)
            from groups g
            left join public.shift_types t on t.id = g.group_type and t.workspace_id = target_workspace_id
              and t.deleted_at is null
            left join headers h on h.location_id = g.location_id and h.shift_type_id is not distinct from g.group_type
            left join public.daily_lineup_versions v on v.lineup_id = h.id and v.version = h.latest_version
            left join people pc on pc.location_id = g.location_id and pc.group_type is not distinct from g.group_type
            left join deals dl on dl.location_id = g.location_id and dl.group_type is not distinct from g.group_type
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


CREATE OR REPLACE FUNCTION "public"."get_my_lineups_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_date" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
                   'art_key', r -> 'art_key',
                   'called_off', r ->> 'called_off_at' is not null,
                   -- LINEUP-EDIT L2a: someone took her place (S-178 "Replaced").
                   'replaced', r ->> 'replaced_by_row_id' is not null) v
                 from jsonb_array_elements(x -> 'rows') r where (r ->> 'employee_id')::uuid = me) mine_rows),
      -- The team as the lineup orders it: people only (an open shift is nobody's), no manager detail.
      'team', coalesce((select jsonb_agg(jsonb_build_object('employee_id', r -> 'employee_id', 'name', r -> 'name',
                   'job_name', r -> 'job_name', 'job_color', r -> 'job_color',
                   'department_name', r -> 'department_name', 'start_time', r -> 'start_time',
                   'end_time', r -> 'end_time', 'crosses_midnight', r -> 'crosses_midnight',
                   'section_name', r -> 'section_name', 'label_names', r -> 'label_names',
                   'called_off', r ->> 'called_off_at' is not null,
                   'art_key', r -> 'art_key',
                   'is_me', (r ->> 'employee_id')::uuid = me) order by o)
                 from jsonb_array_elements(x -> 'rows') with ordinality t(r, o)
                 -- A replaced person is not on the team; the one in her place is.
                 where r ->> 'employee_id' is not null and r ->> 'replaced_by_row_id' is null), '[]'::jsonb)
    ) order by l ->> 'name', x ->> 'shift_type_name'), '[]'::jsonb)
  into result
  from jsonb_array_elements(app_private.lineup_day(target_workspace_id, target_date, places) -> 'locations') l,
    jsonb_array_elements(l -> 'lineups') x
  where (x -> 'published')::boolean
    and exists (select 1 from jsonb_array_elements(x -> 'rows') r where (r ->> 'employee_id')::uuid = me);

  return jsonb_build_object('workspace_id', target_workspace_id, 'date', target_date, 'lineups', result);
end;
$$;


CREATE OR REPLACE FUNCTION "public"."lineup_command_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "command_id" "uuid", "kind" "text", "payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  prior public.lineup_commands;
  item jsonb;
  place public.locations;
  day date;
  type_id uuid;
  header public.daily_lineups;
  live jsonb;
  dealt jsonb;
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
      -- The drawings as shown now are this lineup's from here on (AVATAR-IKON slice 4); written ones stay.
      dealt := app_private.lineup_deal(target_workspace_id, place.id, day, type_id, live -> 'rows');
      insert into public.daily_lineup_drawings (lineup_id, workspace_id, employee_id, job_id, art_key)
      select header.id, target_workspace_id, split_part(d.key, ':', 1)::uuid, split_part(d.key, ':', 2)::uuid, d.value
      from jsonb_each_text(dealt) d
      where d.value is not null
      on conflict do nothing;
      -- The rows as published: who has the app, who read an earlier version and the drawings are the day's, not
      -- the record's.
      live := jsonb_build_object('notes', live -> 'notes', 'rows', coalesce(
        (select jsonb_agg(r - 'has_app' - 'acknowledged_at' - 'art_key' order by o)
         from jsonb_array_elements(live -> 'rows') with ordinality t(r, o)), '[]'::jsonb));
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
        -- LINEUP-EDIT L2b (Mert 2026-10-20, "Edit'e kadar kalsın"): a section removed while this lineup was
        -- published leaves its rows now that it is a draft again.
        update public.daily_lineup_rows r set section_id = null, updated_at = now(), updated_by = actor_user_id
        from public.location_sections s
        where r.lineup_id = header.id and s.id = r.section_id and s.archived_at is not null;
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
$_$;


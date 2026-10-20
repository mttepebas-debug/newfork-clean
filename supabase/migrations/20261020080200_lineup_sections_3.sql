-- LINEUP-EDIT L2b, part 3 of 4 (KARARLAR S-178 madde 4 and ek 3; Mert 2026-10-20 ~00:40 AM PT): a location's
-- sections are added, renamed, ordered and removed from the lineup (the Sections window), and a row takes a name
-- typed in that lineup only ("Other…"), which "Save to sections" adds to the location's sections. A section
-- removed leaves the draft rows of today and later that had it with none (Mert: "Satırdan da silinsin"); a
-- published lineup keeps it until Edit takes it back (part 4; Mert, same night: "Edit'e kadar kalsın"), and a day
-- that is over keeps its rows. Who may: lineup.share, by location, as for the lineup's edit. lineup_edit_service's
-- body is origin/main a15bf72ad's (20261020021123), changed only where marked.

-- The edit. payload: location_id, service_date, shift_type_id (null: the location's other shifts), action, and
--   set_row:   row: source_shift_id (a Schedule shift) or row_id (a person added in the lineup), and only the
--              fields that change: job_id, label_ids, starts + ends ('HH:MM', both or neither; null: back to the
--              Schedule's), and a section: section_id (one of the location's; null: none) or section_name (a
--              name typed in this lineup only, "Other…"; the location's section of that name if it has one;
--              save_section: true adds it to the location's sections first), never both.
--   set_notes: notes: specials, n86, shift_notes (only the ones sent change).
create or replace function public.lineup_edit_service(actor_user_id uuid, target_workspace_id uuid, command_id uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $_$
declare
  prior public.lineup_commands;
  place public.locations;
  day date;
  type_id uuid;
  header public.daily_lineups;
  target jsonb;
  edit jsonb := payload -> 'row';
  notes jsonb := payload -> 'notes';
  row_id uuid;
  label uuid;
  section uuid;
  typed text;
  result jsonb;
  uuid_shape constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  time_shape constant text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
begin
  if command_id is null or jsonb_typeof(payload) is distinct from 'object'
     or payload ->> 'action' is null or payload ->> 'action' not in ('set_row', 'set_notes')
     or payload ->> 'location_id' is null or (payload ->> 'location_id') !~* uuid_shape
     or payload ->> 'service_date' is null or (payload ->> 'service_date') !~ '^\d{4}-\d{2}-\d{2}$'
     or (payload ->> 'shift_type_id' is not null and (payload ->> 'shift_type_id') !~* uuid_shape)
     or (payload ->> 'action' = 'set_row' and (jsonb_typeof(edit) is distinct from 'object'
         or ((edit ->> 'source_shift_id') is null) = ((edit ->> 'row_id') is null)
         or coalesce(edit ->> 'source_shift_id', edit ->> 'row_id') !~* uuid_shape
         or (edit ? 'save_section' and jsonb_typeof(edit -> 'save_section') is distinct from 'boolean')))
     or (payload ->> 'action' = 'set_notes' and jsonb_typeof(notes) is distinct from 'object') then
    raise exception 'Choose what to change in the lineup' using errcode = '22023', hint = 'lineup.invalid_command';
  end if;
  -- The core first: a stranger learns nothing, not even a command id.
  perform app_private.authorize(actor_user_id, target_workspace_id, 'lineup.share',
    target_locations => array[(payload ->> 'location_id')::uuid]);

  perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text, 1017));
  select * into prior from public.lineup_commands c
  where c.workspace_id = target_workspace_id and c.actor_user_id = lineup_edit_service.actor_user_id
    and c.command_id = lineup_edit_service.command_id;
  if prior.command_id is not null then
    if prior.kind <> 'edit' or prior.payload <> lineup_edit_service.payload then
      raise exception 'This command id was used for another command' using errcode = '22023', hint = 'lineup.command_reused';
    end if;
    return prior.result;
  end if;

  select * into place from public.locations l
  where l.id = (payload ->> 'location_id')::uuid and l.workspace_id = target_workspace_id;
  day := (payload ->> 'service_date')::date;
  type_id := (payload ->> 'shift_type_id')::uuid;
  if type_id is not null and not exists (
    select 1 from public.shift_types t where t.id = type_id and t.workspace_id = target_workspace_id and t.deleted_at is null
  ) then
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
  if header.id is not null and header.latest_version > 0 and not header.editing then
    raise exception 'Take the lineup back with Edit first' using errcode = '22023', hint = 'lineup.live';
  end if;
  if app_private.lineup_started(target_workspace_id, place.id, day, type_id, now()) then
    raise exception 'This shift has started' using errcode = '22023', hint = 'lineup.started';
  end if;

  if payload ->> 'action' = 'set_row' then
    -- The row as the day reads it: on this lineup, or it is out of reach (an unknown row gets the same answer).
    select r into target
    from jsonb_array_elements(app_private.lineup_day(target_workspace_id, day, array[place.id]) -> 'locations') l,
      jsonb_array_elements(l -> 'lineups') x, jsonb_array_elements(x -> 'rows') r
    where (x ->> 'shift_type_id')::uuid is not distinct from type_id
      and (r ->> 'employee_id') is not null
      and ((edit ? 'source_shift_id' and r ->> 'source_shift_id' = edit ->> 'source_shift_id')
        or (edit ? 'row_id' and r ->> 'id' = edit ->> 'row_id' and (r -> 'lineup_only')::boolean));
    if target is null then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'lineup.share';
    end if;
    if edit ? 'starts' or edit ? 'ends' then
      if (edit ->> 'starts' is null) <> (edit ->> 'ends' is null)
         or (edit ->> 'starts' is not null and ((edit ->> 'starts') !~ time_shape or (edit ->> 'ends') !~ time_shape
             or edit ->> 'starts' = edit ->> 'ends'))
         or (edit ->> 'starts' is null and (target -> 'lineup_only')::boolean) then
        raise exception 'Use a time like 4:30 PM' using errcode = '22023', hint = 'lineup.invalid_hours';
      end if;
    end if;
    if edit ? 'job_id' and (edit ->> 'job_id' is null and (target -> 'lineup_only')::boolean
        or edit ->> 'job_id' is not null and ((edit ->> 'job_id') !~* uuid_shape or not exists (
          select 1 from public.jobs j where j.id = (edit ->> 'job_id')::uuid and j.workspace_id = target_workspace_id
            and j.archived_at is null))) then
      raise exception 'Choose a position' using errcode = '22023', hint = 'lineup.invalid_job';
    end if;
    if edit ? 'label_ids' then
      if edit -> 'label_ids' <> 'null'::jsonb and jsonb_typeof(edit -> 'label_ids') is distinct from 'array' then
        raise exception 'Choose labels' using errcode = '22023', hint = 'lineup.invalid_label';
      end if;
      for label in select (value #>> '{}')::uuid from jsonb_array_elements(coalesce(nullif(edit -> 'label_ids', 'null'::jsonb), '[]')) loop
        if not exists (select 1 from public.shift_labels s where s.id = label and s.workspace_id = target_workspace_id
                         and s.archived_at is null and s.deleted_at is null) then
          raise exception 'Choose labels' using errcode = '22023', hint = 'lineup.invalid_label';
        end if;
      end loop;
    end if;
    if edit ? 'section_id' and edit ->> 'section_id' is not null and ((edit ->> 'section_id') !~* uuid_shape or not exists (
         select 1 from public.location_sections s where s.id = (edit ->> 'section_id')::uuid
           and s.location_id = place.id and s.workspace_id = target_workspace_id and s.archived_at is null)) then
      raise exception 'Choose one of this location''s sections' using errcode = '22023', hint = 'lineup.invalid_section';
    end if;
    -- LINEUP-EDIT L2b: "Other…", a name typed in this lineup only (S-178 madde 4).
    if edit ? 'section_name' then
      if edit ? 'section_id' then
        raise exception 'Choose one of this location''s sections' using errcode = '22023', hint = 'lineup.invalid_section';
      end if;
      if edit -> 'section_name' <> 'null'::jsonb then
        typed := btrim(edit ->> 'section_name');
        if jsonb_typeof(edit -> 'section_name') <> 'string' or char_length(typed) not between 1 and 40 then
          raise exception 'Name the section in 40 characters or fewer' using errcode = '22023',
            hint = 'lineup.invalid_section_name';
        end if;
        -- The location's section of that name, if it has one; "Save to sections" adds it.
        select s.id into section from public.location_sections s
        where s.workspace_id = target_workspace_id and s.location_id = place.id and s.archived_at is null
          and lower(btrim(s.name)) = lower(typed);
        if section is null and (edit -> 'save_section') = 'true'::jsonb then
          insert into public.location_sections (workspace_id, location_id, name, sort_order)
          select target_workspace_id, place.id, typed, coalesce(max(s.sort_order) + 1, 0)
          from public.location_sections s
          where s.workspace_id = target_workspace_id and s.location_id = place.id and s.archived_at is null
          returning id into section;
        end if;
      end if;
    end if;

    if header.id is null then
      insert into public.daily_lineups (workspace_id, location_id, service_date, shift_type_id, updated_by)
      values (target_workspace_id, place.id, day, type_id, actor_user_id)
      returning * into header;
    end if;
    row_id := (target ->> 'id')::uuid;
    if row_id is null then
      insert into public.daily_lineup_rows (workspace_id, lineup_id, location_id, service_date, source_shift_id, updated_by)
      values (target_workspace_id, header.id, place.id, day, (target ->> 'source_shift_id')::uuid, actor_user_id)
      returning id into row_id;
    end if;
    update public.daily_lineup_rows r set
      job_id = case when edit ? 'job_id' then (edit ->> 'job_id')::uuid else r.job_id end,
      label_ids = case when edit ? 'label_ids' then
          case when edit -> 'label_ids' = 'null'::jsonb then null
            else array(select (value #>> '{}')::uuid from jsonb_array_elements(edit -> 'label_ids')) end
        else r.label_ids end,
      starts = case when edit ? 'starts' then (edit ->> 'starts')::time else r.starts end,
      ends = case when edit ? 'ends' then (edit ->> 'ends')::time else r.ends end,
      section_id = case when edit ? 'section_name' then section
        when edit ? 'section_id' then (edit ->> 'section_id')::uuid else r.section_id end,
      section_name = case when edit ? 'section_name' then case when section is null then typed end
        when edit ? 'section_id' then null else r.section_name end,
      updated_at = now(), updated_by = actor_user_id
    where r.id = row_id;
  else
    if char_length(coalesce(notes ->> 'specials', '')) > 500 or char_length(coalesce(notes ->> 'n86', '')) > 500
       or char_length(coalesce(notes ->> 'shift_notes', '')) > 1000 then
      raise exception 'This note is too long' using errcode = '22023', hint = 'lineup.note_too_long';
    end if;
    if header.id is null then
      insert into public.daily_lineups (workspace_id, location_id, service_date, shift_type_id, updated_by)
      values (target_workspace_id, place.id, day, type_id, actor_user_id)
      returning * into header;
    end if;
    update public.daily_lineups d set
      specials = case when notes ? 'specials' then coalesce(notes ->> 'specials', '') else d.specials end,
      n86 = case when notes ? 'n86' then coalesce(notes ->> 'n86', '') else d.n86 end,
      shift_notes = case when notes ? 'shift_notes' then coalesce(notes ->> 'shift_notes', '') else d.shift_notes end
    where d.id = header.id;
  end if;

  update public.daily_lineups d set revision = d.revision + 1, updated_at = now(), updated_by = actor_user_id
  where d.id = header.id;
  result := jsonb_build_object('command_id', command_id, 'kind', 'edit', 'lineup_id', header.id, 'row_id', row_id);
  insert into public.lineup_commands (workspace_id, actor_user_id, command_id, kind, payload, result)
  values (target_workspace_id, actor_user_id, command_id, 'edit', payload, result);
  return result;
end;
$_$;

-- The Sections window. payload: location_id, action, and
--   add:     name (the location's section of that name, if it has one, is the answer)
--   rename:  section_id, name
--   reorder: section_ids (every section of the location, in their new order)
--   remove:  section_id (one already removed answers the same)
-- Answers the location's sections in order.
create function public.lineup_sections_service(actor_user_id uuid, target_workspace_id uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $_$
declare
  place public.locations;
  section public.location_sections;
  typed text;
  wanted uuid[];
  uuid_shape constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if jsonb_typeof(payload) is distinct from 'object'
     or payload ->> 'action' is null or payload ->> 'action' not in ('add', 'rename', 'reorder', 'remove')
     or payload ->> 'location_id' is null or (payload ->> 'location_id') !~* uuid_shape
     or (payload ->> 'action' in ('rename', 'remove')
         and (payload ->> 'section_id' is null or (payload ->> 'section_id') !~* uuid_shape))
     or (payload ->> 'action' in ('add', 'rename') and jsonb_typeof(payload -> 'name') is distinct from 'string')
     or (payload ->> 'action' = 'reorder' and (jsonb_typeof(payload -> 'section_ids') is distinct from 'array'
         or exists (select 1 from jsonb_array_elements(payload -> 'section_ids') v
                    where jsonb_typeof(v) <> 'string' or (v #>> '{}') !~* uuid_shape))) then
    raise exception 'Choose what to change in the sections' using errcode = '22023', hint = 'lineup.invalid_command';
  end if;
  -- The core first: a stranger learns nothing.
  perform app_private.authorize(actor_user_id, target_workspace_id, 'lineup.share',
    target_locations => array[(payload ->> 'location_id')::uuid]);
  -- The lineup's edits and the sections, one at a time.
  perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text, 1017));

  select * into place from public.locations l
  where l.id = (payload ->> 'location_id')::uuid and l.workspace_id = target_workspace_id;
  if place.id is null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'lineup.share';
  end if;
  if payload ->> 'action' in ('rename', 'remove') then
    -- Another location's section, or none, gets the same answer.
    select * into section from public.location_sections s
    where s.id = (payload ->> 'section_id')::uuid and s.workspace_id = target_workspace_id and s.location_id = place.id
      and (s.archived_at is null or payload ->> 'action' = 'remove');
    if section.id is null then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'lineup.share';
    end if;
  end if;
  if payload ->> 'action' in ('add', 'rename') then
    typed := btrim(payload ->> 'name');
    if char_length(typed) not between 1 and 40 then
      raise exception 'Name the section in 40 characters or fewer' using errcode = '22023',
        hint = 'lineup.invalid_section_name';
    end if;
  end if;

  if payload ->> 'action' = 'add' then
    if not exists (select 1 from public.location_sections s
                   where s.workspace_id = target_workspace_id and s.location_id = place.id and s.archived_at is null
                     and lower(btrim(s.name)) = lower(typed)) then
      insert into public.location_sections (workspace_id, location_id, name, sort_order)
      select target_workspace_id, place.id, typed, coalesce(max(s.sort_order) + 1, 0)
      from public.location_sections s
      where s.workspace_id = target_workspace_id and s.location_id = place.id and s.archived_at is null;
    end if;
  elsif payload ->> 'action' = 'rename' then
    if exists (select 1 from public.location_sections s
               where s.workspace_id = target_workspace_id and s.location_id = place.id and s.archived_at is null
                 and s.id <> section.id and lower(btrim(s.name)) = lower(typed)) then
      raise exception 'This location has a section with that name' using errcode = '22023',
        hint = 'lineup.section_exists';
    end if;
    update public.location_sections s set name = typed, updated_at = now() where s.id = section.id;
  elsif payload ->> 'action' = 'reorder' then
    wanted := array(select (v #>> '{}')::uuid from jsonb_array_elements(payload -> 'section_ids') v);
    if cardinality(wanted) <> (select count(distinct w) from unnest(wanted) w)
       or array(select w from unnest(wanted) w order by w) is distinct from array(
         select s.id from public.location_sections s
         where s.workspace_id = target_workspace_id and s.location_id = place.id and s.archived_at is null
         order by s.id) then
      raise exception 'Order every section of this location' using errcode = '22023', hint = 'lineup.invalid_section';
    end if;
    update public.location_sections s set sort_order = o.ord - 1, updated_at = now()
    from unnest(wanted) with ordinality as o (id, ord)
    where s.id = o.id;
  elsif section.archived_at is null then
    update public.location_sections s set archived_at = now(), updated_at = now() where s.id = section.id;
    -- Mert 2026-10-20: the draft rows that had it, today and later, have none. A published lineup keeps it until
    -- Edit takes it back (lineup_command_service), and a day that is over keeps its rows.
    with cleared as (
      update public.daily_lineup_rows r set section_id = null, updated_at = now(), updated_by = actor_user_id
      from public.daily_lineups d
      where r.workspace_id = target_workspace_id and r.section_id = section.id
        and r.service_date >= (now() at time zone place.timezone)::date
        and d.id = r.lineup_id and (d.latest_version = 0 or d.editing)
      returning r.lineup_id
    )
    update public.daily_lineups d set revision = d.revision + 1, updated_at = now(), updated_by = actor_user_id
    where d.id in (select c.lineup_id from cleared c);
  end if;

  return jsonb_build_object('location_id', place.id, 'sections', coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'location_id', s.location_id, 'name', s.name,
      'sort_order', s.sort_order) order by s.sort_order, s.name)
    from public.location_sections s
    where s.workspace_id = target_workspace_id and s.location_id = place.id and s.archived_at is null
  ), '[]'::jsonb));
end;
$_$;

revoke all on function public.lineup_sections_service(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.lineup_sections_service(uuid, uuid, jsonb) to service_role;

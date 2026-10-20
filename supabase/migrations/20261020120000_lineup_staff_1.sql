-- LINEUP-EDIT L3a, part 1 of 2 (KARARLAR S-178 madde 5-7; Mert 2026-10-20 ~04:20 AM PT, "Bu kapsamla, Moved sonra"):
-- on a draft lineup that hasn't started, a manager calls a person off and back in, adds somebody who isn't on it
-- (Add Staff), puts somebody in a person's place (Replace) and takes that back (Undo). The Schedule never changes;
-- nobody is told (the notification engine's decision is open). Another location's row is never touched: someone
-- working there is added here as anyone else (Moved / Moved here is its own slice). lineup_edit_service's body is
-- supabase/schema.sql's (origin/main 49dd239d5), changed only where marked.

-- Who a lineup may take (as the Schedule's grid does): this workspace's person, not archived, at this location now,
-- with employee access, not kept off the Schedule.
create function app_private.lineup_staff_eligible(target_workspace_id uuid, target_location_id uuid, target_employee_id uuid)
returns boolean
language sql
stable
set search_path to ''
as $$
  select exists (
    select 1 from public.employee_profiles e
    where e.id = target_employee_id and e.workspace_id = target_workspace_id and e.archived_at is null
      and not e.is_excluded_from_schedule
      and app_private.has_employee_access(target_workspace_id, e.user_id)
      and exists (select 1 from public.employee_location_assignments a
                  where a.workspace_id = target_workspace_id and a.employee_id = e.id
                    and a.location_id = target_location_id and a.ended_at is null))
$$;
revoke all on function app_private.lineup_staff_eligible(uuid, uuid, uuid) from public, anon, authenticated;

-- The edit. payload: location_id, service_date, shift_type_id (null: the location's other shifts), action, and
--   set_row:      row: source_shift_id (a Schedule shift) or row_id (a person added in the lineup), and only the
--                 fields that change: job_id, label_ids, starts + ends ('HH:MM', both or neither; null: back to the
--                 Schedule's), and a section: section_id (one of the location's; null: none) or section_name (a
--                 name typed in this lineup only, "Other…"; the location's section of that name if it has one;
--                 save_section: true adds it to the location's sections first), never both.
--   set_notes:    notes: specials, n86, shift_notes (only the ones sent change).
--   call_off:     row (as set_row): the person stays on the lineup, called off (S-178 madde 5).
--   call_in:      row: back from called off.
--   add_person:   person: employee_id, job_id, and starts + ends (both or neither: neither takes the hours of
--                 someone in that position on this lineup, else the shift type's) (Add Staff, madde 6).
--   replace:      row, person: employee_id: the person takes the row's position, hours, labels and section; the
--                 row is Replaced (madde 7).
--   undo_replace: row: row_id of the person who took a place: the place goes back, that person leaves the lineup.
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
  -- LINEUP-EDIT L3a: who is added or put in a place.
  person jsonb := payload -> 'person';
  who uuid;
  hours_in time;
  hours_out time;
  place_row uuid;
  row_id uuid;
  label uuid;
  section uuid;
  typed text;
  result jsonb;
  uuid_shape constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  time_shape constant text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
begin
  if command_id is null or jsonb_typeof(payload) is distinct from 'object'
     or payload ->> 'action' is null
     or payload ->> 'action' not in ('set_row', 'set_notes', 'call_off', 'call_in', 'add_person', 'replace', 'undo_replace')
     or payload ->> 'location_id' is null or (payload ->> 'location_id') !~* uuid_shape
     or payload ->> 'service_date' is null or (payload ->> 'service_date') !~ '^\d{4}-\d{2}-\d{2}$'
     or (payload ->> 'shift_type_id' is not null and (payload ->> 'shift_type_id') !~* uuid_shape)
     or (payload ->> 'action' in ('set_row', 'call_off', 'call_in', 'replace', 'undo_replace')
         and (jsonb_typeof(edit) is distinct from 'object'
         or ((edit ->> 'source_shift_id') is null) = ((edit ->> 'row_id') is null)
         or coalesce(edit ->> 'source_shift_id', edit ->> 'row_id') !~* uuid_shape
         or (edit ? 'save_section' and jsonb_typeof(edit -> 'save_section') is distinct from 'boolean')))
     or (payload ->> 'action' = 'undo_replace' and edit ->> 'row_id' is null)
     or (payload ->> 'action' in ('add_person', 'replace') and (jsonb_typeof(person) is distinct from 'object'
         or person ->> 'employee_id' is null or (person ->> 'employee_id') !~* uuid_shape))
     or (payload ->> 'action' = 'add_person' and (person ->> 'job_id' is null or (person ->> 'job_id') !~* uuid_shape))
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

  -- LINEUP-EDIT L3a: the row a row action names, as the day reads it (set_row's, now shared).
  if payload ->> 'action' in ('set_row', 'call_off', 'call_in', 'replace', 'undo_replace') then
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
  end if;
  -- LINEUP-EDIT L3a: who is added or put in a place: someone this lineup may take, not on it already in any way
  -- (called off: Call in brings her back; replaced: Undo does).
  if payload ->> 'action' in ('add_person', 'replace') then
    who := (person ->> 'employee_id')::uuid;
    if not app_private.lineup_staff_eligible(target_workspace_id, place.id, who) then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'lineup.share';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(app_private.lineup_day(target_workspace_id, day, array[place.id]) -> 'locations') l,
        jsonb_array_elements(l -> 'lineups') x, jsonb_array_elements(x -> 'rows') r
      where (x ->> 'shift_type_id')::uuid is not distinct from type_id and (r ->> 'employee_id')::uuid = who
    ) then
      raise exception 'This person is on this lineup already' using errcode = '22023', hint = 'lineup.already_on';
    end if;
  end if;
  -- Called off or replaced, a person isn't on the lineup to be called off or replaced (Call in brings one back);
  -- a place taken from someone who took a place goes back the way it came, the last one first.
  if payload ->> 'action' in ('call_off', 'replace')
     and (target ->> 'called_off_at' is not null or target ->> 'replaced_by_row_id' is not null)
     or payload ->> 'action' in ('call_in', 'undo_replace') and target ->> 'replaced_by_row_id' is not null then
    raise exception 'This person isn''t on the lineup now' using errcode = '22023', hint = 'lineup.row_out';
  end if;

  if payload ->> 'action' = 'set_row' then
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
  elsif payload ->> 'action' = 'set_notes' then
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
  -- LINEUP-EDIT L3a: Call off and Call in (S-178 madde 5).
  elsif payload ->> 'action' in ('call_off', 'call_in') then
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
      called_off_at = case when payload ->> 'action' = 'call_off' then coalesce(r.called_off_at, now()) end,
      called_off_by = case when payload ->> 'action' = 'call_off' then coalesce(r.called_off_by, actor_user_id) end,
      updated_at = now(), updated_by = actor_user_id
    where r.id = row_id;
  -- LINEUP-EDIT L3a: Add Staff (S-178 madde 6): a person in the lineup only, the Schedule untouched.
  elsif payload ->> 'action' = 'add_person' then
    if not exists (select 1 from public.jobs j where j.id = (person ->> 'job_id')::uuid
                     and j.workspace_id = target_workspace_id and j.archived_at is null) then
      raise exception 'Choose a position' using errcode = '22023', hint = 'lineup.invalid_job';
    end if;
    if (person ->> 'starts' is null) <> (person ->> 'ends' is null)
       or (person ->> 'starts' is not null and ((person ->> 'starts') !~ time_shape or (person ->> 'ends') !~ time_shape
           or person ->> 'starts' = person ->> 'ends')) then
      raise exception 'Use a time like 4:30 PM' using errcode = '22023', hint = 'lineup.invalid_hours';
    end if;
    -- No hours sent: someone in that position on this lineup, else the shift type's.
    if person ->> 'starts' is not null then
      hours_in := (person ->> 'starts')::time;
      hours_out := (person ->> 'ends')::time;
    else
      select (r ->> 'start_time')::time, (r ->> 'end_time')::time into hours_in, hours_out
      from jsonb_array_elements(app_private.lineup_day(target_workspace_id, day, array[place.id]) -> 'locations') l,
        jsonb_array_elements(l -> 'lineups') x, jsonb_array_elements(x -> 'rows') r
      where (x ->> 'shift_type_id')::uuid is not distinct from type_id and r ->> 'job_id' = person ->> 'job_id'
        and r ->> 'employee_id' is not null and r ->> 'called_off_at' is null and r ->> 'replaced_by_row_id' is null
      order by r ->> 'start_time'
      limit 1;
      if hours_in is null then
        select t.default_start_time, t.default_end_time into hours_in, hours_out
        from public.shift_types t where t.id = type_id and t.workspace_id = target_workspace_id;
      end if;
      if hours_in is null or hours_out is null then
        raise exception 'Use a time like 4:30 PM' using errcode = '22023', hint = 'lineup.invalid_hours';
      end if;
    end if;
    if header.id is null then
      insert into public.daily_lineups (workspace_id, location_id, service_date, shift_type_id, updated_by)
      values (target_workspace_id, place.id, day, type_id, actor_user_id)
      returning * into header;
    end if;
    insert into public.daily_lineup_rows (workspace_id, lineup_id, location_id, service_date, employee_id, job_id,
      starts, ends, updated_by)
    values (target_workspace_id, header.id, place.id, day, who, (person ->> 'job_id')::uuid, hours_in, hours_out,
      actor_user_id)
    returning id into row_id;
  -- LINEUP-EDIT L3a: Replace (S-178 madde 7): the person takes the row's place, the row is Replaced.
  elsif payload ->> 'action' = 'replace' then
    if header.id is null then
      insert into public.daily_lineups (workspace_id, location_id, service_date, shift_type_id, updated_by)
      values (target_workspace_id, place.id, day, type_id, actor_user_id)
      returning * into header;
    end if;
    place_row := (target ->> 'id')::uuid;
    if place_row is null then
      insert into public.daily_lineup_rows (workspace_id, lineup_id, location_id, service_date, source_shift_id, updated_by)
      values (target_workspace_id, header.id, place.id, day, (target ->> 'source_shift_id')::uuid, actor_user_id)
      returning id into place_row;
    end if;
    insert into public.daily_lineup_rows (workspace_id, lineup_id, location_id, service_date, employee_id, job_id,
      starts, ends, label_ids, section_id, section_name, sort_order, updated_by)
    values (target_workspace_id, header.id, place.id, day, who, (target ->> 'job_id')::uuid,
      (target ->> 'start_time')::time, (target ->> 'end_time')::time,
      array(select (value #>> '{}')::uuid from jsonb_array_elements(coalesce(nullif(target -> 'label_ids', 'null'::jsonb), '[]'))),
      (target ->> 'section_id')::uuid,
      case when target ->> 'section_id' is null then target ->> 'section_name' end,
      (target ->> 'sort_order')::integer, actor_user_id)
    returning id into row_id;
    update public.daily_lineup_rows r set replaced_by_row_id = row_id, updated_at = now(), updated_by = actor_user_id
    where r.id = place_row;
  -- LINEUP-EDIT L3a: Undo (S-178 madde 7): the place goes back; who took it leaves the lineup.
  else
    if not exists (select 1 from public.daily_lineup_rows r
                   where r.workspace_id = target_workspace_id and r.replaced_by_row_id = (target ->> 'id')::uuid) then
      raise exception 'This person took nobody''s place' using errcode = '22023', hint = 'lineup.not_replacing';
    end if;
    update public.daily_lineup_rows r set replaced_by_row_id = null, updated_at = now(), updated_by = actor_user_id
    where r.workspace_id = target_workspace_id and r.replaced_by_row_id = (target ->> 'id')::uuid;
    -- A person added in the lineup only: the row goes (target is lineup_only; header is its lineup).
    delete from public.daily_lineup_rows r where r.id = (target ->> 'id')::uuid and r.source_shift_id is null;
  end if;

  update public.daily_lineups d set revision = d.revision + 1, updated_at = now(), updated_by = actor_user_id
  where d.id = header.id;
  result := jsonb_build_object('command_id', command_id, 'kind', 'edit', 'lineup_id', header.id, 'row_id', row_id);
  insert into public.lineup_commands (workspace_id, actor_user_id, command_id, kind, payload, result)
  values (target_workspace_id, actor_user_id, command_id, 'edit', payload, result);
  return result;
end;
$_$;

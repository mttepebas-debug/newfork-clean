-- LINEUP-EDIT L2a, part 2 of 3 (KARARLAR S-178 and its addenda; Mert 2026-10-19): a manager changes a lineup's
-- row (position, label, In and Out, section) and its notes, in the lineup only; the Schedule never changes. Only a
-- draft that has not started changes (BL-1148): a published lineup is taken back with Edit first, a started shift
-- and a day that is over are locked. Who may: lineup.share, by location (who publishes the Schedule there).

-- Two rows never replace each other, however long the chain (L1's review, finding 4).
create function app_private.daily_lineup_rows_no_replace_loop()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  step uuid := new.replaced_by_row_id;
  hops integer := 0;
begin
  -- A row pointing at itself is daily_lineup_rows_replaced_by_other's to refuse.
  if step = new.id then
    return new;
  end if;
  while step is not null and hops < 100 loop
    if step = new.id then
      raise exception 'A row cannot be replaced by one it replaced' using errcode = '23514',
        constraint = 'daily_lineup_rows_replaced_by_loop', hint = 'lineup.replace_loop';
    end if;
    select r.replaced_by_row_id into step from public.daily_lineup_rows r where r.id = step;
    hops := hops + 1;
  end loop;
  return new;
end;
$$;

create trigger daily_lineup_rows_no_replace_loop
  before insert or update of replaced_by_row_id on public.daily_lineup_rows
  for each row when (new.replaced_by_row_id is not null)
  execute function app_private.daily_lineup_rows_no_replace_loop();

-- Whether a lineup has started, at a moment, on its location's clock: the web's rule (lineupCardState), one place
-- for every write. The day is over, or it is that day there and its first person is in.
create function app_private.lineup_started(target_workspace_id uuid, target_location_id uuid, target_date date,
  target_shift_type_id uuid, at_moment timestamptz default now())
returns boolean
language plpgsql
stable
set search_path to ''
as $$
declare
  zone text;
  local_now timestamp;
  first_in text;
begin
  select l.timezone into zone from public.locations l
  where l.id = target_location_id and l.workspace_id = target_workspace_id;
  if zone is null then
    return false;
  end if;
  local_now := at_moment at time zone zone;
  if target_date < local_now::date then
    return true;
  end if;
  if target_date > local_now::date then
    return false;
  end if;
  select min(r ->> 'start_time') into first_in
  from jsonb_array_elements(app_private.lineup_day(target_workspace_id, target_date, array[target_location_id]) -> 'locations') l,
    jsonb_array_elements(l -> 'lineups') x, jsonb_array_elements(x -> 'rows') r
  where (x ->> 'shift_type_id')::uuid is not distinct from target_shift_type_id;
  return first_in is not null and to_char(local_now, 'HH24:MI') >= first_in;
end;
$$;

-- The edit. payload: location_id, service_date, shift_type_id (null: the location's other shifts), action, and
--   set_row:   row: source_shift_id (a Schedule shift) or row_id (a person added in the lineup), and only the
--              fields that change: job_id, label_ids, starts + ends ('HH:MM', both or neither; null: back to the
--              Schedule's), section_id (null: none).
--   set_notes: notes: specials, n86, shift_notes (only the ones sent change).
create function public.lineup_edit_service(actor_user_id uuid, target_workspace_id uuid, command_id uuid, payload jsonb)
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
         or coalesce(edit ->> 'source_shift_id', edit ->> 'row_id') !~* uuid_shape))
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
            and j.deleted_at is null))) then
      raise exception 'Choose a position' using errcode = '22023', hint = 'lineup.invalid_job';
    end if;
    if edit ? 'label_ids' then
      if edit -> 'label_ids' <> 'null'::jsonb and jsonb_typeof(edit -> 'label_ids') is distinct from 'array' then
        raise exception 'Choose labels' using errcode = '22023', hint = 'lineup.invalid_label';
      end if;
      for label in select (value #>> '{}')::uuid from jsonb_array_elements(coalesce(nullif(edit -> 'label_ids', 'null'::jsonb), '[]')) loop
        if not exists (select 1 from public.shift_labels s where s.id = label and s.workspace_id = target_workspace_id
                         and s.deleted_at is null) then
          raise exception 'Choose labels' using errcode = '22023', hint = 'lineup.invalid_label';
        end if;
      end loop;
    end if;
    if edit ? 'section_id' and edit ->> 'section_id' is not null and ((edit ->> 'section_id') !~* uuid_shape or not exists (
         select 1 from public.location_sections s where s.id = (edit ->> 'section_id')::uuid
           and s.location_id = place.id and s.workspace_id = target_workspace_id and s.archived_at is null)) then
      raise exception 'Choose one of this location''s sections' using errcode = '22023', hint = 'lineup.invalid_section';
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
      section_id = case when edit ? 'section_id' then (edit ->> 'section_id')::uuid else r.section_id end,
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

revoke all on function public.lineup_edit_service(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.lineup_edit_service(uuid, uuid, uuid, jsonb) to service_role;
revoke all on function app_private.lineup_started(uuid, uuid, date, uuid, timestamptz) from public, anon, authenticated;
revoke all on function app_private.daily_lineup_rows_no_replace_loop() from public, anon, authenticated;

-- LINEUP-EDIT L2b, part 4 of 4 (Mert 2026-10-20, after part 3's decision: "Edit'e kadar kalsın"): a section
-- removed while a lineup was published stays on its rows, as its employees see it, until Edit takes the lineup back;
-- then those rows have none. The body is supabase/schema.sql's (origin/main a15bf72ad), changed only where marked.

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
      -- The rows as published: who has the app and who read an earlier version are the day's, not the record's.
      live := jsonb_build_object('notes', live -> 'notes', 'rows', coalesce(
        (select jsonb_agg(r - 'has_app' - 'acknowledged_at' order by o)
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

-- Everyone at a location reads its published lineups (Mert 2026-10-24). get_my_lineups_service keeps the
-- lineups she is on in `lineups` (her ticket, her Acknowledge) and adds `others`: that day's other published
-- lineups at the locations she works at now, with the same fields minus `mine` and `acknowledged_at`. Only the
-- people on a lineup are told of it and may acknowledge it; that is unchanged. The gate is unchanged
-- (employee_hub.read); the read now reaches only the locations it answers for.

create or replace function public.get_my_lineups_service(actor_user_id uuid, target_workspace_id uuid, target_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  me uuid;
  assigned uuid[];
  places uuid[];
  mine_result jsonb;
  others_result jsonb;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee_hub.read');
  if target_date is null then
    raise exception 'a day is required' using errcode = '22023', hint = 'lineup.invalid_day';
  end if;
  select e.id into me from public.employee_profiles e
  where e.workspace_id = target_workspace_id and e.user_id = actor_user_id and e.archived_at is null;
  -- Where she works now: the others come from these locations only.
  assigned := array(
    select a.location_id from public.employee_location_assignments a
    where a.workspace_id = target_workspace_id and a.employee_id = me and a.ended_at is null);
  -- Only the locations with a published lineup that day where she works or has a shift or a lineup row: the
  -- read stays small. A wider set is harmless; the rows below decide.
  places := array(
    select distinct d.location_id from public.daily_lineups d
    where d.workspace_id = target_workspace_id and d.service_date = target_date
      and d.latest_version > 0 and not d.editing
      and (d.location_id = any (assigned)
        or exists (select 1 from public.schedule_published_shifts s
                   where s.workspace_id = target_workspace_id and s.employee_id = me
                     and s.scheduled_date = target_date and s.location_id = d.location_id)
        or exists (select 1 from public.daily_lineup_rows r
                   where r.workspace_id = target_workspace_id and r.employee_id = me
                     and r.service_date = target_date and r.location_id = d.location_id)));
  if me is null or cardinality(places) = 0 then
    return jsonb_build_object('workspace_id', target_workspace_id, 'date', target_date,
      'lineups', '[]'::jsonb, 'others', '[]'::jsonb);
  end if;

  select
    coalesce(jsonb_agg(base || jsonb_build_object(
        'acknowledged_at', (select to_jsonb(a.acknowledged_at) from public.daily_lineup_acknowledgements a
                            where a.version_id = (x ->> 'version_id')::uuid and a.employee_id = me),
        'mine', (select jsonb_agg(mine_rows.v) from (
                   select jsonb_build_object('start_time', r -> 'start_time', 'end_time', r -> 'end_time',
                     'crosses_midnight', r -> 'crosses_midnight', 'job_name', r -> 'job_name', 'job_color', r -> 'job_color',
                     'section_name', r -> 'section_name', 'label_names', r -> 'label_names',
                     'art_key', r -> 'art_key',
                     'called_off', r ->> 'called_off_at' is not null,
                     -- LINEUP-EDIT L2a: someone took her place (S-178 "Replaced").
                     'replaced', r ->> 'replaced_by_row_id' is not null) v
                   from jsonb_array_elements(x -> 'rows') r where (r ->> 'employee_id')::uuid = me) mine_rows))
      order by l ->> 'name', x ->> 'shift_type_name') filter (where on_it), '[]'::jsonb),
    -- Another lineup at her location: read whole, with no ticket and no acknowledgement of hers.
    coalesce(jsonb_agg(base order by l ->> 'name', x ->> 'shift_type_name')
      filter (where not on_it and (l ->> 'id')::uuid = any (assigned)), '[]'::jsonb)
  into mine_result, others_result
  from jsonb_array_elements(app_private.lineup_day(target_workspace_id, target_date, places) -> 'locations') l,
    jsonb_array_elements(l -> 'lineups') x,
    lateral (select exists (select 1 from jsonb_array_elements(x -> 'rows') r
                            where (r ->> 'employee_id')::uuid = me) as on_it) mine_check,
    lateral (select jsonb_build_object(
      'id', x -> 'id',
      'version_id', x -> 'version_id',
      'version', x -> 'version',
      'location', jsonb_build_object('id', l -> 'id', 'name', l -> 'name', 'timezone', l -> 'timezone'),
      'shift_type_id', x -> 'shift_type_id',
      'shift_type_name', x -> 'shift_type_name',
      'color', x -> 'color',
      'shared_at', x -> 'shared_at',
      'ask_ack', x -> 'ask_ack',
      'notes', x -> 'notes',
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
    ) as base) built
  where (x -> 'published')::boolean;

  return jsonb_build_object('workspace_id', target_workspace_id, 'date', target_date,
    'lineups', mine_result, 'others', others_result);
end;
$$;

revoke all on function public.get_my_lineups_service(uuid, uuid, date) from public;
revoke all on function public.get_my_lineups_service(uuid, uuid, date) from anon, authenticated;
grant execute on function public.get_my_lineups_service(uuid, uuid, date) to service_role;

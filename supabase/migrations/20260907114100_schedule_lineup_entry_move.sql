create or replace function public.move_schedule_lineup_entry_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  move jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  source_ref_id uuid := nullif(move->>'source_entry_id','')::uuid;
  source_entry public.schedule_lineup_entries%rowtype;
  source_shift public.schedule_published_shifts%rowtype;
  source_lineup public.schedule_lineups%rowtype;
  target_lineup public.schedule_lineups%rowtype;
  target_location_id uuid := nullif(move->>'target_location_id','')::uuid;
  target_date date := (move->>'target_date')::date;
  target_section_id uuid := nullif(move->>'target_section_id','')::uuid;
  target_display_order integer := coalesce((move->>'display_order')::integer,0);
  saved public.schedule_lineup_entries%rowtype;
begin
  select * into source_entry
  from public.schedule_lineup_entries
  where id = source_ref_id
    and workspace_id = target_workspace_id
  for update;

  if source_entry.id is null then
    select published_shift.* into source_shift
    from public.schedule_published_shifts published_shift
    join public.schedule_location_publications publication
      on publication.id = published_shift.publication_id
     and publication.status = 'current'
    where published_shift.id = source_ref_id
      and published_shift.workspace_id = target_workspace_id
    for update;

    if source_shift.id is null then
      raise exception 'line-up entry not found' using errcode = 'P0002';
    end if;

    if not public.schedule_actor_has_capability_service(
      actor_user_id,
      target_workspace_id,
      'schedule.lineup.manage',
      source_shift.location_id
    ) or not public.schedule_actor_has_capability_service(
      actor_user_id,
      target_workspace_id,
      'schedule.lineup.manage',
      target_location_id
    ) then
      raise exception 'schedule line-up manage access denied' using errcode='42501';
    end if;

    insert into public.schedule_lineups(
      workspace_id,
      location_id,
      lineup_date,
      created_by,
      updated_by
    )
    values (
      target_workspace_id,
      source_shift.location_id,
      source_shift.scheduled_date,
      actor_user_id,
      actor_user_id
    )
    on conflict(workspace_id,location_id,lineup_date)
    do update set updated_at = now(), updated_by = actor_user_id
    returning * into source_lineup;

    insert into public.schedule_lineup_entries(
      workspace_id,
      lineup_id,
      location_id,
      source_shift_id,
      employee_id,
      job_id,
      shift_type_id,
      start_time,
      end_time,
      section_id,
      station,
      call_off,
      hidden,
      display_order,
      created_by,
      updated_by
    )
    values (
      target_workspace_id,
      source_lineup.id,
      source_shift.location_id,
      source_shift.id,
      source_shift.employee_id,
      source_shift.job_id,
      source_shift.shift_type_id,
      source_shift.start_time,
      source_shift.end_time,
      null,
      '',
      false,
      true,
      0,
      actor_user_id,
      actor_user_id
    )
    on conflict do nothing
    returning * into source_entry;

    if source_entry.id is null then
      select * into source_entry
      from public.schedule_lineup_entries
      where lineup_id = source_lineup.id
        and source_shift_id = source_shift.id
      for update;
    end if;
  end if;

  select * into source_lineup
  from public.schedule_lineups
  where id = source_entry.lineup_id
    and workspace_id = target_workspace_id
  for update;

  if not public.schedule_actor_has_capability_service(
    actor_user_id,
    target_workspace_id,
    'schedule.lineup.manage',
    source_entry.location_id
  ) or not public.schedule_actor_has_capability_service(
    actor_user_id,
    target_workspace_id,
    'schedule.lineup.manage',
    target_location_id
  ) then
    raise exception 'schedule line-up manage access denied' using errcode='42501';
  end if;

  insert into public.schedule_lineups(
    workspace_id,
    location_id,
    lineup_date,
    created_by,
    updated_by
  )
  values (
    target_workspace_id,
    target_location_id,
    target_date,
    actor_user_id,
    actor_user_id
  )
  on conflict(workspace_id,location_id,lineup_date)
  do update set updated_at = now(), updated_by = actor_user_id
  returning * into target_lineup;

  if source_entry.source_shift_id is not null then
    update public.schedule_lineup_entries
    set hidden = true,
        revision = revision + 1,
        updated_by = actor_user_id,
        updated_at = now()
    where id = source_entry.id;

    insert into public.schedule_lineup_entries(
      workspace_id,
      lineup_id,
      location_id,
      source_shift_id,
      employee_id,
      job_id,
      shift_type_id,
      start_time,
      end_time,
      section_id,
      station,
      call_off,
      hidden,
      display_order,
      created_by,
      updated_by
    )
    values (
      target_workspace_id,
      target_lineup.id,
      target_location_id,
      null,
      source_entry.employee_id,
      source_entry.job_id,
      source_entry.shift_type_id,
      source_entry.start_time,
      source_entry.end_time,
      target_section_id,
      source_entry.station,
      source_entry.call_off,
      false,
      target_display_order,
      actor_user_id,
      actor_user_id
    )
    returning * into saved;
  else
    update public.schedule_lineup_entries
    set lineup_id = target_lineup.id,
        location_id = target_location_id,
        section_id = target_section_id,
        display_order = target_display_order,
        revision = revision + 1,
        updated_by = actor_user_id,
        updated_at = now()
    where id = source_entry.id
    returning * into saved;
  end if;

  update public.schedule_lineups
  set revision = revision + 1,
      updated_by = actor_user_id,
      updated_at = now()
  where id in (source_lineup.id, target_lineup.id);

  select * into target_lineup
  from public.schedule_lineups
  where id = saved.lineup_id;

  return jsonb_build_object(
    'status','saved',
    'lineup_id',target_lineup.id,
    'lineup_revision',target_lineup.revision,
    'entry_id',saved.id,
    'entry_revision',saved.revision
  );
end;
$$;

revoke all on function public.move_schedule_lineup_entry_service(uuid,uuid,jsonb)
from public, anon, authenticated;
grant execute on function public.move_schedule_lineup_entry_service(uuid,uuid,jsonb)
to service_role;

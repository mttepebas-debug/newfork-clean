-- Notification panel, slice 2 (KARARLAR S-247 (3)): a Schedule card closes when its work is over, for every
-- person who got it; it is never deleted, and each person's read state stays their own.
--
--   * "Shifts need people" (schedule.shifts_unassigned): app_private.unassigned_cards_settle still closes a card
--     'closed' once none of its shifts is left without anyone. A card whose shifts still without anyone are all
--     on a day that has passed where they are (the location's time zone) now closes 'expired', by nobody: the
--     work can no longer be done. It runs where it ran before (a shift given or removed, a publication
--     replaced); nothing runs it on a clock yet.
--   * "Scheduled email stopped" (schedule.export_email_stopped, subject scheduled_schedule_export): it closes
--     'fixed' when the email is turned back on or its recipients change (update_schedule_export_schedule_service),
--     and 'removed' when it is deleted (delete_schedule_export_schedule_service), by whoever did it. Their own
--     card is marked read (and seen); everybody else's read state is left as it was.
--
-- Only these three bodies change; signatures, security, search_path, owners and grants stay.

create or replace function app_private.unassigned_cards_settle(target_workspace uuid, target_shift uuid default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  card record;
  closed integer := 0;
begin
  for card in
    select distinct n.subject_id, n.data -> 'shift_ids' shift_ids
    from public.person_notifications n
    where n.workspace_id = target_workspace and n.subject_type = 'unassigned_shifts' and n.resolved_at is null
      and n.subject_id is not null and n.type_key = 'schedule.shifts_unassigned'
      and (target_shift is null or n.data -> 'shift_ids' ? target_shift::text)
  loop
    if not exists (
      select 1 from jsonb_array_elements_text(card.shift_ids) x
      join public.schedule_published_shifts s on s.id = x::uuid
      join public.schedule_location_publications p on p.id = s.publication_id and p.status = 'current'
      where s.employee_id is null) then
      closed := closed + app_private.notification_resolve(target_workspace, 'unassigned_shifts', card.subject_id, 'closed', null);
    -- S-247: every shift still without anyone is on a day that has passed at its location: nobody can fill it now.
    elsif not exists (
      select 1 from jsonb_array_elements_text(card.shift_ids) x
      join public.schedule_published_shifts s on s.id = x::uuid
      join public.schedule_location_publications p on p.id = s.publication_id and p.status = 'current'
      join public.locations l on l.id = s.location_id and l.workspace_id = s.workspace_id
      where s.employee_id is null and s.scheduled_date >= (now() at time zone l.timezone)::date) then
      closed := closed + app_private.notification_resolve(target_workspace, 'unassigned_shifts', card.subject_id, 'expired', null);
    end if;
  end loop;
  return closed;
exception when others then
  raise warning 'unassigned_cards_settle: cards in % not settled: % (%)', target_workspace, sqlerrm, sqlstate;
  return 0;
end;
$$;

create or replace function public.update_schedule_export_schedule_service(actor_user_id uuid, target_workspace_id uuid,
  target_schedule_id uuid, target_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.scheduled_schedule_exports%rowtype;
  updated public.scheduled_schedule_exports%rowtype;
  next_location_ids uuid[];
  added_location_ids uuid[];
  next_preset_id uuid;
  preset_name text;
  reset_failure_state boolean := false;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.export',
    target_locations => app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.export'));

  select * into existing
    from public.scheduled_schedule_exports s
   where s.id = target_schedule_id
     and s.workspace_id = target_workspace_id
   for update;

  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.export',
    target_locations => public.live_location_ids(target_workspace_id, existing.location_ids));

  if existing.id is null then
    raise exception 'scheduled export not found' using errcode='P0002';
  end if;

  -- The locations it will export once saved.
  next_location_ids := case
    when target_payload ? 'location_ids' then
      array(select jsonb_array_elements_text(target_payload->'location_ids')::uuid)
    else existing.location_ids
  end;
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.export',
    -- A location already on the rule and no longer live is not asked about;
    -- every location added is, so an archived one cannot be slipped in.
    target_locations => array(
      select distinct requested.id from unnest(next_location_ids) requested(id)
      where requested.id = any (public.live_location_ids(target_workspace_id, next_location_ids))
         or not requested.id = any (coalesce(existing.location_ids, '{}'::uuid[]))));
  -- The rule sends as the person who set it up (the cron exports as them): a
  -- location they cannot export would switch the rule off at its first send.
  -- Whoever edits the rule may not reach past its owner with it.
  added_location_ids := array(
    select distinct requested.id from unnest(next_location_ids) requested(id)
    where not requested.id = any (coalesce(existing.location_ids, '{}'::uuid[])));
  if actor_user_id is distinct from existing.created_by
     and cardinality(added_location_ids) > 0
     and app_private.authz_reason(existing.created_by, target_workspace_id, 'schedule.export',
       target_locations => added_location_ids) is not null then
    raise exception 'The person who set up this export cannot export a location you added.'
      using errcode = '22023', hint = 'schedule.export_rule_beyond_its_owner';
  end if;

  -- The address list and the name: its maker, the owner and admins (KK-224).
  if actor_user_id is distinct from existing.created_by
     and ((target_payload ? 'recipients' and target_payload->'recipients' is distinct from existing.recipients)
       or (target_payload ? 'name' and btrim(target_payload->>'name') is distinct from existing.name)) then
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.export',
      target_locations => '{}'::uuid[]);
  end if;

  next_preset_id := coalesce((target_payload->>'preset_id')::uuid, existing.preset_id);
  if not exists (
    select 1
      from public.schedule_export_presets p
     where p.id = next_preset_id
       and p.workspace_id = target_workspace_id
       and (p.id = existing.preset_id
         or (actor_user_id = existing.created_by and p.created_by = actor_user_id))
  ) then
    raise exception 'schedule export preset not found' using errcode='P0002';
  end if;

  reset_failure_state :=
    target_payload ? 'enabled' and (target_payload->>'enabled')::boolean = true;

  update public.scheduled_schedule_exports
     set preset_id = next_preset_id,
         name = coalesce(btrim(target_payload->>'name'), existing.name),
         recipients = coalesce(target_payload->'recipients', existing.recipients),
         location_ids = next_location_ids,
         day_of_week = coalesce((target_payload->>'day_of_week')::smallint, existing.day_of_week),
         send_hour = coalesce((target_payload->>'send_hour')::smallint, existing.send_hour),
         timezone = coalesce(btrim(target_payload->>'timezone'), existing.timezone),
         enabled = coalesce((target_payload->>'enabled')::boolean, existing.enabled),
         updated_by = actor_user_id,
         updated_at = now(),
         consecutive_failures = case when reset_failure_state then 0 else consecutive_failures end,
         last_error = case when reset_failure_state then null else last_error end,
         auto_disabled_at = case when reset_failure_state then null else auto_disabled_at end
   where id = target_schedule_id
     and workspace_id = target_workspace_id
   returning * into updated;

  -- S-247: on again, or sent to other addresses: the "email stopped" card is done for everyone who got it;
  -- whoever fixed it has read their own. (person_notifications has an actor_user_id column: the argument is named.)
  if (updated.enabled or updated.recipients is distinct from existing.recipients)
     and app_private.notification_resolve(target_workspace_id, 'scheduled_schedule_export', updated.id, 'fixed',
       update_schedule_export_schedule_service.actor_user_id) > 0 then
    update public.person_notifications n set read_at = coalesce(n.read_at, now()), seen_at = coalesce(n.seen_at, now())
    where n.workspace_id = target_workspace_id and n.subject_type = 'scheduled_schedule_export'
      and n.subject_id = updated.id and n.user_id = update_schedule_export_schedule_service.actor_user_id
      and n.resolved_by = update_schedule_export_schedule_service.actor_user_id and n.resolved_at = now();
  end if;

  select p.name into preset_name
    from public.schedule_export_presets p
   where p.id = updated.preset_id;

  return public.schedule_export_schedule_json(updated, preset_name);
exception
  when unique_violation then
    raise exception 'scheduled export name conflict' using errcode='23505';
end;
$$;

create or replace function public.delete_schedule_export_schedule_service(actor_user_id uuid, target_workspace_id uuid,
  target_schedule_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.scheduled_schedule_exports%rowtype;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.export',
    target_locations => app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.export'));

  select * into existing
    from public.scheduled_schedule_exports s
   where s.id = target_schedule_id
     and s.workspace_id = target_workspace_id
   for update;

  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.export',
    target_locations => public.live_location_ids(target_workspace_id, existing.location_ids));

  if existing.id is null then
    raise exception 'scheduled export not found' using errcode='P0002';
  end if;

  delete from public.scheduled_schedule_exports
   where id = target_schedule_id
     and workspace_id = target_workspace_id;

  -- S-247: gone, so its "email stopped" card is done for everyone who got it; whoever deleted it has read their own.
  -- (person_notifications has an actor_user_id column: the argument is named.)
  if app_private.notification_resolve(target_workspace_id, 'scheduled_schedule_export', target_schedule_id, 'removed',
       delete_schedule_export_schedule_service.actor_user_id) > 0 then
    update public.person_notifications n set read_at = coalesce(n.read_at, now()), seen_at = coalesce(n.seen_at, now())
    where n.workspace_id = target_workspace_id and n.subject_type = 'scheduled_schedule_export'
      and n.subject_id = target_schedule_id and n.user_id = delete_schedule_export_schedule_service.actor_user_id
      and n.resolved_by = delete_schedule_export_schedule_service.actor_user_id and n.resolved_at = now();
  end if;

  return jsonb_build_object('status', 'deleted', 'schedule_id', target_schedule_id);
end;
$$;

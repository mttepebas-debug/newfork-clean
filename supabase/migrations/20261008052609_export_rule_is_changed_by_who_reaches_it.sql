-- EKRAN-01 #18 (BL-494; KARARLAR Schedule, user decision 2026-10-01): a
-- weekly export rule is changed and deleted by whoever reaches its locations,
-- whoever set it up. The owner and admins reach every rule; a manager reaches
-- a rule whose live locations they all manage (the rule the list shows them
-- by); a rule with no live location left is the workspace's, which only the
-- owner and admins reach. Until now only the person who set it up could: the
-- owner could not change the address on Ayşe's Moda rule while she was away.
--
-- After the "somewhere" gate every Schedule entry point keeps, the rule's own
-- locations go to the authorization core. An unknown rule has none and asks
-- like a workspace-wide one, so a manager hears the same out_of_scope for a
-- rule that does not exist as for one out of reach.
-- Where the rule goes and what it is called stay with the person who set it
-- up and with the owner and admins (KK-224): Can, who manages Kadıköy too,
-- changes the day, hour, on/off and locations of Ayşe's Kadıköy rule, not who
-- reads it, and cannot probe the names of rules he did not make (a rename to a
-- taken name answered 409). The owner still changes the address on her rule
-- while she is away. The check goes to the authorization core as a
-- workspace-wide ask, which only the owner and admins reach.
-- Keeping the rule's own preset is always allowed; switching it takes one of
-- its maker's presets and only its maker does that: her email does not go out
-- with Can's settings, nor does her rule keep Can from deleting his preset
-- (B9). The rule still sends as the person who set it up, so a location added
-- by someone else must be one that person can export (review O1): the owner
-- cannot add Beşiktaş to Ayşe's Kadıköy rule; changing its hour is free.

create or replace function public.update_schedule_export_schedule_service(actor_user_id uuid, target_workspace_id uuid, target_schedule_id uuid, target_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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

  select p.name into preset_name
    from public.schedule_export_presets p
   where p.id = updated.preset_id;

  return public.schedule_export_schedule_json(updated, preset_name);
exception
  when unique_violation then
    raise exception 'scheduled export name conflict' using errcode='23505';
end;
$function$;

create or replace function public.delete_schedule_export_schedule_service(actor_user_id uuid, target_workspace_id uuid, target_schedule_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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

  return jsonb_build_object('status', 'deleted', 'schedule_id', target_schedule_id);
end;
$function$;

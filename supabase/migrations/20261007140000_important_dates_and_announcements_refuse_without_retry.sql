-- BL-958 (ACIL-40001, KK-211): the important date and announcement services
-- refused a lasting conflict (a closed day's list changed or was never shown,
-- an old revision, an archived record) with SQLSTATE 40001. PostgREST takes
-- 40001 for a passing serialization failure and runs the same request again,
-- without end, holding one of its pooled connections; about ten such saves
-- stopped the API for every workspace (EKRAN-08-CEKMECE, 2026-10-07).
--
-- Each service now turns a 40001 from its own body or from a helper it calls
-- (app_private.important_date_close_shifts) into PT409 at its edge, keeping the
-- sentence and the hint. The API already answers both codes with 409 and the
-- same reason (apps/api/src/http-error.ts), so nothing changes on the screen.
-- Bodies are today's definitions from supabase/schema.sql; only the handler is new.

CREATE OR REPLACE FUNCTION "public"."save_important_date_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_important_date_id" "uuid", "target_title" "text", "target_type" "text", "target_starts_on" "date", "target_ends_on" "date", "target_recurrence" "text", "target_note" "text", "target_affects_scheduling" boolean, "target_location_ids" "uuid"[], "target_expected_revision" integer, "target_keep_shift_ids" "uuid"[] DEFAULT '{}'::"uuid"[], "target_expected_fingerprint" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  item public.important_dates;
  before public.important_dates;
  line date := public.schedule_current_week_start_service(target_workspace_id);
  content_changed boolean := true;
  untouched boolean := false;
  was public.important_dates;
  ahead integer;
  impact jsonb;
  opened jsonb := '[]';
  removed uuid[] := '{}';
  reached uuid[];
  told uuid[];
  dropped uuid[];
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.important_dates.read');
  target_location_ids := array(select distinct id from unnest(coalesce(target_location_ids, '{}')) id order by id);
  if target_important_date_id is null then
    perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'important_date', target_location_ids, actor_user_id);
  else
    select * into before from public.important_dates
    where id = target_important_date_id and workspace_id = target_workspace_id for update;
    if before.id is null or not app_private.important_date_visible(actor_user_id, before) then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'important_date.write';
    end if;
    perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'important_date', before.location_ids, before.created_by, before.location_ids);
    perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'important_date', target_location_ids, before.created_by, before.location_ids);
    if before.archived_at is not null then
      raise exception 'Restore this date before you edit it' using errcode = '40001';
    end if;
    if before.revision is distinct from target_expected_revision then
      raise exception 'This date changed. Reload and try again.' using errcode = '40001';
    end if;
    -- The same as an announcement's (KK-86).
    if cardinality(target_location_ids) = 0
       and cardinality(before.location_ids) > cardinality(app_private.live_locations(target_workspace_id, before.location_ids)) then
      raise exception 'Choose at least one location' using errcode = '22023';
    end if;
  end if;

  if cardinality(target_location_ids) > 100 then
    raise exception 'too many locations' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(target_title, ''))) not between 1 and 120 or char_length(coalesce(target_note, '')) > 500
     or target_type not in ('holiday', 'event', 'blackout', 'closed_day') or target_recurrence not in ('none', 'annual')
     or target_starts_on is null or target_ends_on is null or target_ends_on < target_starts_on then
    raise exception 'valid important date required' using errcode = '22023';
  end if;
  if target_type = 'closed_day' then
    target_affects_scheduling := true;
  end if;

  -- K11. A save that changes nothing touches nothing.
  if before.id is not null then
    untouched := (before.title, before.type::text, before.starts_on, before.ends_on, before.recurrence::text, before.note,
      before.affects_scheduling, before.location_ids)
      is not distinct from (btrim(target_title), target_type, target_starts_on, target_ends_on, target_recurrence,
      coalesce(target_note, ''), coalesce(target_affects_scheduling, true), target_location_ids);
    if not untouched and app_private.important_date_is_past(before, line) then
      perform app_private.important_date_refuse_past();
    end if;
  end if;
  if not untouched then
    if target_recurrence = 'annual' and target_starts_on < line then
      -- A yearly date given a past year starts with its next day from the line on.
      ahead := (select min(k) from generate_series(1, extract(year from line)::integer - extract(year from target_starts_on)::integer + 1) k
                where (target_starts_on + make_interval(years => k))::date >= line);
      target_ends_on := (target_ends_on + make_interval(years => ahead))::date;
      target_starts_on := (target_starts_on + make_interval(years => ahead))::date;
    elsif target_starts_on < line then
      -- The past days of a date that began before the line stay its own; its
      -- unchanged start is not a change.
      if before.id is null or before.recurrence <> 'none' or target_starts_on <> before.starts_on or target_ends_on < line then
        perform app_private.important_date_refuse_past();
      end if;
      target_starts_on := line;
    end if;
  end if;

  -- K13: what a published closed day would newly land on.
  if before.id is null or before.status = 'published' then
    impact := app_private.important_date_closure_impact(target_workspace_id, before, target_type, target_starts_on,
      target_ends_on, target_recurrence, target_location_ids);
    if jsonb_array_length(impact -> 'shifts') > 0
       and target_expected_fingerprint is distinct from impact ->> 'fingerprint' then
      raise exception 'Review the shifts on this closed day again.' using errcode = '40001', hint = 'important_date.closure_changed';
    end if;
  end if;

  if before.id is not null and not untouched then
    -- The history keeps the version as it was, not the part left ahead.
    was := before;
    before := app_private.important_date_keep_past(before, line);
  end if;

  if target_important_date_id is null then
    insert into public.important_dates (workspace_id, title, type, starts_on, ends_on, recurrence, note,
      affects_scheduling, location_ids, location_id, created_by, updated_by)
    values (target_workspace_id, btrim(target_title), target_type::public.important_date_type, target_starts_on,
      target_ends_on, target_recurrence::public.important_date_recurrence, coalesce(target_note, ''),
      coalesce(target_affects_scheduling, true), target_location_ids,
      case when cardinality(target_location_ids) = 1 then target_location_ids[1] end, actor_user_id, actor_user_id)
    returning * into item;
  else
    content_changed := (before.title, before.type::text, before.starts_on, before.ends_on, before.recurrence::text,
      before.note, before.affects_scheduling)
      is distinct from (btrim(target_title), target_type, target_starts_on, target_ends_on, target_recurrence,
      coalesce(target_note, ''), coalesce(target_affects_scheduling, true));
    update public.important_dates
    set title = btrim(target_title), type = target_type::public.important_date_type, starts_on = target_starts_on,
        ends_on = target_ends_on, recurrence = target_recurrence::public.important_date_recurrence,
        note = coalesce(target_note, ''), affects_scheduling = coalesce(target_affects_scheduling, true),
        location_ids = target_location_ids,
        location_id = case when cardinality(target_location_ids) = 1 then target_location_ids[1] end,
        content_revision = content_revision + case when content_changed then 1 else 0 end,
        revision = revision + 1, updated_by = actor_user_id, updated_at = now()
    where id = before.id
    returning * into item;
  end if;

  if impact is not null then
    opened := app_private.important_date_close_shifts(actor_user_id, item, impact, target_keep_shift_ids);
  end if;

  if item.status = 'published' then
    -- Everybody it is for, and those told now: not where it is already over.
    reached := app_private.important_date_recipients(item);
    told := app_private.important_date_notified(item);
    if content_changed and before.id is not null then
      perform app_private.communication_withdraw(target_workspace_id, 'schedule.important_date.available',
        'important_date', item.id::text, 'superseded');
    end if;
    -- K14: who lost a shift hears it in its own notice, not in the common one.
    removed := app_private.important_date_tell_removed(item, opened);
    if content_changed then
      perform app_private.important_date_deliver(item, array(select who from unnest(told) who where not who = any (removed)));
    else
      -- Those it no longer reaches lose it (BL-534); the new people are told.
      dropped := array(select who from unnest(item.delivered_to) who where not who = any (reached) and not who = any (removed));
      if cardinality(dropped) > 0 then
        perform app_private.communication_withdraw(target_workspace_id, 'schedule.important_date.available',
          'important_date', item.id::text, 'cancelled', dropped);
      end if;
      perform app_private.important_date_deliver(item,
        array(select who from unnest(told) who where not who = any (item.delivered_to) and not who = any (removed)));
      told := array(select distinct who from unnest(told || array(
        select who from unnest(item.delivered_to) who where who = any (reached))) who);
    end if;
    update public.important_dates set delivered_to = array(select distinct who from unnest(told || removed) who)
    where id = item.id returning * into item;
  end if;

  insert into public.important_date_changes (workspace_id, important_date_id, actor_user_id, action, before, after)
  values (target_workspace_id, item.id, actor_user_id,
    case when before.id is null then 'created' else 'updated' end,
    case when before.id is null then null else app_private.important_date_snapshot(coalesce(was, before)) end,
    app_private.important_date_snapshot(item));
  return jsonb_build_object('important_date_id', item.id, 'status', item.status, 'revision', item.revision,
    'recipient_count', cardinality(item.delivered_to),
    'shifts_opened', jsonb_array_length(opened),
    'draft_shifts_opened', coalesce(jsonb_array_length(impact -> 'draft_shift_ids'), 0),
    'shifts_stay_open', case when before.id is null then 0 else app_private.important_date_stay_open(item) end);
exception when serialization_failure then
  -- BL-958: a conflict that is still there on the next try answers PT409, which
  -- PostgREST does not run again; 40001 it retries forever. Same refusal, same
  -- sentence and reason (hint), as publish_schedule_draft_service does.
  declare
    why text;
  begin
    get stacked diagnostics why = pg_exception_hint;
    raise exception '%', sqlerrm using errcode = 'PT409', hint = why;
  end;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."set_important_date_state_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_important_date_id" "uuid", "target_action" "text", "target_keep_shift_ids" "uuid"[] DEFAULT '{}'::"uuid"[], "target_expected_fingerprint" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  item public.important_dates;
  before public.important_dates;
  line date := public.schedule_current_week_start_service(target_workspace_id);
  was public.important_dates;
  impact jsonb;
  opened jsonb := '[]';
  removed uuid[] := '{}';
  reached uuid[];
  opened_notice uuid[];
  told uuid[];
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.important_dates.read');
  select * into before from public.important_dates
  where id = target_important_date_id and workspace_id = target_workspace_id for update;
  if before.id is null or not app_private.important_date_visible(actor_user_id, before) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'important_date.write';
  end if;
  perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'important_date', before.location_ids, before.created_by, before.location_ids);
  if target_action not in ('unpublish', 'republish', 'archive', 'restore') then
    raise exception 'valid important date action required' using errcode = '22023';
  end if;
  if app_private.important_date_is_past(before, line) then
    perform app_private.important_date_refuse_past();
  end if;
  if (target_action = 'unpublish' and (before.archived_at is not null or before.status <> 'published'))
     or (target_action = 'republish' and (before.archived_at is not null or before.status <> 'unpublished'))
     or (target_action = 'archive' and before.archived_at is not null)
     or (target_action = 'restore' and before.archived_at is null) then
    raise exception 'This date changed. Reload and try again.' using errcode = '40001';
  end if;

  if target_action = 'republish' then
    impact := app_private.important_date_closure_impact(target_workspace_id, before, before.type::text, before.starts_on,
      before.ends_on, before.recurrence::text, before.location_ids);
    if jsonb_array_length(impact -> 'shifts') > 0
       and target_expected_fingerprint is distinct from impact ->> 'fingerprint' then
      raise exception 'Review the shifts on this closed day again.' using errcode = '40001', hint = 'important_date.closure_changed';
    end if;
  end if;

  was := before;
  before := app_private.important_date_keep_past(before, line);
  if target_action in ('unpublish', 'archive') then
    perform app_private.communication_withdraw(target_workspace_id, 'schedule.important_date.available',
      'important_date', before.id::text, 'cancelled');
  end if;
  update public.important_dates
  set status = case when target_action in ('unpublish', 'restore') then 'unpublished'
                    when target_action = 'republish' then 'published' else status end,
      archived_at = case target_action when 'archive' then now() when 'restore' then null else archived_at end,
      revision = revision + 1, updated_by = actor_user_id, updated_at = now()
  where id = before.id
  returning * into item;

  if target_action = 'republish' then
    opened := app_private.important_date_close_shifts(actor_user_id, item, impact, target_keep_shift_ids);
    removed := app_private.important_date_tell_removed(item, opened);
    reached := app_private.important_date_recipients(item);
    -- Who opened the current content already is not told again (K7).
    opened_notice := array(
      select who from unnest(reached) who
      where exists (
        select 1 from public.notification_outbox outbox
        join public.notification_recipients recipient
          on recipient.workspace_id = outbox.workspace_id and recipient.event_id = outbox.event_id
        join public.notification_inbox_items inbox on inbox.recipient_projection_id = recipient.id
        where outbox.workspace_id = item.workspace_id and outbox.type_key = 'schedule.important_date.available'
          and outbox.subject_type = 'important_date' and outbox.subject_id = item.id::text
          and outbox.payload ->> 'content_revision' = item.content_revision::text
          and recipient.recipient_user_id = who and inbox.read_at is not null));
    told := array(select who from unnest(app_private.important_date_notified(item)) who
                  where not who = any (opened_notice) and not who = any (removed));
    perform app_private.important_date_deliver(item, told);
    update public.important_dates set delivered_to = array(select distinct who from unnest(told || opened_notice || removed) who)
    where id = item.id returning * into item;
  end if;

  insert into public.important_date_changes (workspace_id, important_date_id, actor_user_id, action, before, after)
  values (target_workspace_id, item.id, actor_user_id,
    case target_action when 'unpublish' then 'unpublished' when 'republish' then 'republished'
      when 'archive' then 'archived' else 'restored' end,
    app_private.important_date_snapshot(was), app_private.important_date_snapshot(item));
  return jsonb_build_object('important_date_id', item.id, 'status', item.status, 'revision', item.revision,
    'archived_at', item.archived_at,
    'shifts_opened', jsonb_array_length(opened),
    'draft_shifts_opened', coalesce(jsonb_array_length(impact -> 'draft_shift_ids'), 0),
    'shifts_stay_open', app_private.important_date_stay_open(item));
exception when serialization_failure then
  -- BL-958: a conflict that is still there on the next try answers PT409, which
  -- PostgREST does not run again; 40001 it retries forever. Same refusal, same
  -- sentence and reason (hint), as publish_schedule_draft_service does.
  declare
    why text;
  begin
    get stacked diagnostics why = pg_exception_hint;
    raise exception '%', sqlerrm using errcode = 'PT409', hint = why;
  end;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."publish_announcement_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_announcement_id" "uuid", "target_expected_revision" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  item public.announcements;
  reached uuid[];
  told uuid[];
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'announcement.read');
  perform app_private.announcement_release(target_workspace_id);
  select * into item from public.announcements
  where id = target_announcement_id and workspace_id = target_workspace_id for update;
  if item.id is null or not app_private.announcement_visible(actor_user_id, item) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'announcement.write';
  end if;
  perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'announcement',
    app_private.announcement_places(item.id),
    item.created_by, app_private.announcement_places(item.id));
  if item.revision is distinct from target_expected_revision or item.archived_at is not null
     or item.status not in ('draft', 'scheduled', 'unpublished') then
    raise exception 'stale announcement revision' using errcode = '40001';
  end if;

  if item.expires_at is not null and item.expires_at <= now() then
    raise exception 'This announcement has expired' using errcode = '22023';
  end if;
  if item.publish_at is not null and item.publish_at > now() then
    update public.announcements
    set status = 'scheduled', release_failed_at = null, published_at = null, revision = revision + 1, updated_by = actor_user_id, updated_at = now()
    where id = item.id returning * into item;
    told := '{}';
  else
    reached := app_private.announcement_recipients(item);
    told := case when item.status = 'unpublished'
      then array(select who from unnest(reached) who where not exists (
        select 1 from public.announcement_acknowledgements a where a.announcement_id = item.id and a.user_id = who))
      else reached end;
    update public.announcements
    set status = 'published', published_at = now(), publish_at = coalesce(publish_at, now()),
        delivered_to = reached, revision = revision + 1, updated_by = actor_user_id, updated_at = now()
    where id = item.id returning * into item;
    perform app_private.announcement_deliver(item, told);
  end if;

  insert into public.audit_events (workspace_id, actor_user_id, action, target_type, target_id, metadata)
  values (target_workspace_id, actor_user_id, 'announcement.published', 'announcement', item.id::text,
    jsonb_build_object('status', item.status, 'recipient_count', cardinality(told)));
  return jsonb_build_object('status', item.status, 'announcement_id', item.id, 'revision', item.revision,
    'recipient_count', cardinality(told), 'notification_enqueued_count', cardinality(told));
exception when serialization_failure then
  -- BL-958: a conflict that is still there on the next try answers PT409, which
  -- PostgREST does not run again; 40001 it retries forever. Same refusal, same
  -- sentence and reason (hint), as publish_schedule_draft_service does.
  declare
    why text;
  begin
    get stacked diagnostics why = pg_exception_hint;
    raise exception '%', sqlerrm using errcode = 'PT409', hint = why;
  end;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."save_announcement_audience_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_announcement_id" "uuid", "target_expected_revision" integer, "target_title" "text", "target_body" "text", "target_category" "text", "target_audience_roles" "text"[], "target_location_ids" "uuid"[], "target_publish_at" timestamp with time zone, "target_expires_at" timestamp with time zone, "target_action_url" "text", "target_department_ids" "uuid"[], "target_job_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  item public.announcements;
  before public.announcements;
  stored uuid[];
  content_changed boolean := false;
  reached uuid[];
  dropped uuid[];
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'announcement.read');
  target_location_ids := array(select distinct id from unnest(coalesce(target_location_ids, '{}')) id order by id);
  if target_announcement_id is null then
    perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'announcement', target_location_ids, actor_user_id);
  else
    perform app_private.announcement_release(target_workspace_id);
    select * into before from public.announcements
    where id = target_announcement_id and workspace_id = target_workspace_id for update;
    if before.id is null or not app_private.announcement_visible(actor_user_id, before) then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'announcement.write';
    end if;
    stored := app_private.announcement_places(before.id);
    perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'announcement', stored, before.created_by, stored);
    perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'announcement', target_location_ids, before.created_by, stored);
    -- A record kept at an archived location never becomes the whole workspace
    -- by losing its locations (KK-86); the owner may still widen a live one (K1).
    if cardinality(target_location_ids) = 0
       and cardinality(stored) > cardinality(app_private.live_locations(target_workspace_id, stored)) then
      raise exception 'Choose at least one location' using errcode = '22023';
    end if;
  end if;

  target_department_ids := coalesce(target_department_ids, '{}');
  target_job_ids := coalesce(target_job_ids, '{}');
  if coalesce(cardinality(target_audience_roles), 0) = 0 then
    target_audience_roles := array['owner', 'admin', 'manager', 'employee'];
  end if;
  if cardinality(target_department_ids) > 100 or cardinality(target_job_ids) > 100 or cardinality(target_location_ids) > 100 then
    raise exception 'too many audience filters' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(target_department_ids) selected(id) where not exists (
       select 1 from public.departments d where d.id = selected.id and d.workspace_id = target_workspace_id and d.archived_at is null))
  or exists (select 1 from unnest(target_job_ids) selected(id) where not exists (
       select 1 from public.jobs j where j.id = selected.id and j.workspace_id = target_workspace_id and j.archived_at is null)) then
    raise exception 'active workspace department and job required' using errcode = '22023';
  end if;
  if char_length(btrim(target_title)) not between 1 and 120 or char_length(btrim(target_body)) not between 1 and 5000
     or target_category not in ('general', 'operations', 'schedule') then
    raise exception 'valid announcement content required' using errcode = '22023';
  end if;
  if cardinality(target_audience_roles) not between 1 and 4
     or exists (select 1 from unnest(target_audience_roles) role_name where role_name not in ('owner', 'admin', 'manager', 'employee')) then
    raise exception 'valid announcement audience required' using errcode = '22023';
  end if;
  if target_action_url is not null and (char_length(target_action_url) > 500 or target_action_url !~ '^/app(/|$)') then
    raise exception 'valid app action required' using errcode = '22023';
  end if;
  if target_expires_at is not null and target_publish_at is not null and target_expires_at <= target_publish_at then
    raise exception 'expiry must follow publication' using errcode = '22023';
  end if;

  if target_announcement_id is null then
    insert into public.announcements (workspace_id, title, body, category, audience_roles, publish_at, expires_at,
      action_url, department_ids, job_ids, created_by, updated_by)
    values (target_workspace_id, btrim(target_title), btrim(target_body), target_category::public.announcement_category,
      array(select distinct role_name::public.workspace_role from unnest(target_audience_roles) role_name),
      target_publish_at, target_expires_at, target_action_url,
      array(select distinct unnest(target_department_ids)), array(select distinct unnest(target_job_ids)),
      actor_user_id, actor_user_id)
    returning * into item;
  else
    if before.revision is distinct from target_expected_revision then
      raise exception 'stale announcement revision' using errcode = '40001';
    end if;
    if before.archived_at is not null then
      raise exception 'announcement can no longer be edited' using errcode = '40001';
    end if;
    content_changed := (before.title, before.body, before.category::text, before.action_url)
      is distinct from (btrim(target_title), btrim(target_body), target_category, target_action_url);
    update public.announcements
    set title = btrim(target_title), body = btrim(target_body), category = target_category::public.announcement_category,
        audience_roles = array(select distinct role_name::public.workspace_role from unnest(target_audience_roles) role_name),
        publish_at = target_publish_at, expires_at = target_expires_at, action_url = target_action_url,
        department_ids = array(select distinct unnest(target_department_ids)),
        job_ids = array(select distinct unnest(target_job_ids)),
        content_revision = content_revision + case when content_changed then 1 else 0 end,
        -- A scheduled one with its time taken away waits as a draft (P10).
        status = case when status = 'scheduled' and target_publish_at is null then 'draft' else status end,
        release_failed_at = null, release_error = null,
        revision = revision + 1, updated_by = actor_user_id, updated_at = now()
    where id = before.id
    returning * into item;
  end if;

  delete from public.announcement_locations where announcement_id = item.id;
  insert into public.announcement_locations (workspace_id, announcement_id, location_id)
  select target_workspace_id, item.id, id from unnest(target_location_ids) id;

  if content_changed then
    update public.announcements
    set acknowledged_before = array(select distinct who from unnest(acknowledged_before || array(
      select a.user_id from public.announcement_acknowledgements a where a.announcement_id = item.id)) who)
    where id = item.id returning * into item;
    delete from public.announcement_acknowledgements where announcement_id = item.id;
  end if;
  if item.status = 'published' then
    -- Past its end it reaches nobody (K12).
    reached := case when item.expires_at <= now() then '{}'::uuid[] else app_private.announcement_recipients(item) end;
    if content_changed then
      perform app_private.communication_withdraw(target_workspace_id, 'communications.announcement.available',
        'announcement', item.id::text, 'superseded');
      perform app_private.announcement_deliver(item, reached);
    else
      -- Those it no longer reaches lose it (BL-534); the new people are told.
      dropped := array(select who from unnest(item.delivered_to) who where not who = any (reached));
      if cardinality(dropped) > 0 then
        perform app_private.communication_withdraw(target_workspace_id, 'communications.announcement.available',
          'announcement', item.id::text, 'cancelled', dropped);
      end if;
      perform app_private.announcement_deliver(item,
        array(select who from unnest(reached) who where not who = any (item.delivered_to)));
    end if;
    update public.announcements set delivered_to = reached where id = item.id returning * into item;
  elsif content_changed then
    update public.announcements set delivered_to = '{}' where id = item.id returning * into item;
  end if;

  insert into public.audit_events (workspace_id, actor_user_id, action, target_type, target_id, metadata)
  values (target_workspace_id, actor_user_id,
    case when target_announcement_id is null then 'announcement.created' else 'announcement.updated' end,
    'announcement', item.id::text, jsonb_build_object('content_changed', content_changed));
  return jsonb_build_object('status', item.status, 'announcement_id', item.id, 'revision', item.revision,
    'recipient_count', cardinality(item.delivered_to));
exception when serialization_failure then
  -- BL-958: a conflict that is still there on the next try answers PT409, which
  -- PostgREST does not run again; 40001 it retries forever. Same refusal, same
  -- sentence and reason (hint), as publish_schedule_draft_service does.
  declare
    why text;
  begin
    get stacked diagnostics why = pg_exception_hint;
    raise exception '%', sqlerrm using errcode = 'PT409', hint = why;
  end;
end;
$_$;

CREATE OR REPLACE FUNCTION "public"."set_announcement_state_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_announcement_id" "uuid", "target_expected_revision" integer, "target_action" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  item public.announcements;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'announcement.read');
  perform app_private.announcement_release(target_workspace_id);
  select * into item from public.announcements
  where id = target_announcement_id and workspace_id = target_workspace_id for update;
  if item.id is null or not app_private.announcement_visible(actor_user_id, item) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'announcement.write';
  end if;
  perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'announcement',
    app_private.announcement_places(item.id),
    item.created_by, app_private.announcement_places(item.id));
  if target_action not in ('unpublish', 'archive', 'restore') then
    raise exception 'valid announcement action required' using errcode = '22023';
  end if;
  if item.revision is distinct from target_expected_revision
     or (target_action = 'unpublish' and (item.archived_at is not null or item.status not in ('scheduled', 'published')))
     or (target_action = 'archive' and item.archived_at is not null)
     or (target_action = 'restore' and item.archived_at is null) then
    raise exception 'stale announcement revision' using errcode = '40001';
  end if;

  if target_action in ('unpublish', 'archive') then
    perform app_private.communication_withdraw(target_workspace_id, 'communications.announcement.available',
      'announcement', item.id::text, 'cancelled');
  end if;
  update public.announcements
  set status = case
        when target_action = 'unpublish' then 'unpublished'
        when target_action = 'restore' and status <> 'draft' then 'unpublished'
        else status end,
      archived_at = case target_action when 'archive' then now() when 'restore' then null else archived_at end,
      revision = revision + 1, updated_by = actor_user_id, updated_at = now()
  where id = item.id returning * into item;

  insert into public.audit_events (workspace_id, actor_user_id, action, target_type, target_id)
  values (target_workspace_id, actor_user_id,
    'announcement.' || case target_action when 'unpublish' then 'unpublished' when 'archive' then 'archived' else 'restored' end,
    'announcement', item.id::text);
  return jsonb_build_object('status', item.status, 'announcement_id', item.id, 'revision', item.revision,
    'archived_at', item.archived_at, 'recipient_count', 0);
exception when serialization_failure then
  -- BL-958: a conflict that is still there on the next try answers PT409, which
  -- PostgREST does not run again; 40001 it retries forever. Same refusal, same
  -- sentence and reason (hint), as publish_schedule_draft_service does.
  declare
    why text;
  begin
    get stacked diagnostics why = pg_exception_hint;
    raise exception '%', sqlerrm using errcode = 'PT409', hint = why;
  end;
end;
$$;

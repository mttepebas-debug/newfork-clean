-- BILDIRIM-U6 (KARARLAR S-123, S-124, S-126 (2), S-127; docs/plan/research/BILDIRIM-URETICILER.md §2.7): announcements
-- write their own notices into the new core (part 4, the announcements slice), and Remind comes back.
--   * published: whoever the post reaches now (announcement_recipients), on publishing it, on its scheduled
--     hour, and to people a save newly reaches; brought out again, not those who acknowledged it; never its
--     writer nor whoever published it;
--   * updated: a change in what it says (or acknowledgements asked again) tells whoever it reached before
--     and has not acknowledged it;
--   * cancelled: a dated post taken back tells whoever it reaches now; one without a day tells nobody, as
--     its History has always said;
--   * reminder: Remind (set_announcement_state_service 'remind') tells who it asks and has not acknowledged
--     it (announcement_respondents less announcement_acknowledgements). The domain tracks acknowledgement,
--     not reading, so only a post that asks for an acknowledgement has Remind. At most twice a day for one
--     post, in the post's time zone, here in the database (S-126 (2)); get_announcement_service says how
--     many are left today so the drawer's button can rest and say why;
--   * publish failed: a scheduled post that could not go out tells whoever scheduled it while the domain's
--     own rule (announcement_reason) still lets them write it, otherwise every member it lets write it now,
--     and the owner when nobody is left (S-127); its card closes when the post is scheduled, published, put
--     back to draft or archived;
--   * shifts brought back from an unpublished post have no notice yet, so its History counts nobody told.
-- Recipients are always the audience as the domain computes it at that moment, never a stored list
-- (delivered_to only says who is new to it). A notice that fails is logged and the announcement's work
-- stands. A shift a post changed or brought back is the Schedule's notice (schedule_tell_closed_day).

-- How many Reminds are left today for one post: two a day, the day in the post's own time zone.
create function app_private.announcement_reminders_left(item public.announcements)
returns integer
language sql
stable
set search_path = ''
as $$
  select greatest(0, 2 - count(*)::integer) from public.announcement_changes change
  where change.announcement_id = item.id and change.action = 'reminded'
    and (change.changed_at at time zone item.time_zone)::date = (now() at time zone item.time_zone)::date
$$;

revoke all on function app_private.announcement_reminders_left(public.announcements) from public;

-- One announcement notice to these people (the core leaves out the actor and anyone no longer a member).
-- key_part names the event when the revision alone does not (one Remind press).
create function app_private.announcement_tell(actor uuid, item public.announcements, kind text, people uuid[],
  key_part text default null, why text default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  on_text text := case
    when item.starts_on is null then null
    when coalesce(item.ends_on, item.starts_on) > item.starts_on
      then to_char(item.starts_on, 'FMMon FMDD') || '–' || to_char(item.ends_on, 'FMMon FMDD')
    else to_char(item.starts_on, 'FMDy, FMMon FMDD') end;
  preview text := nullif(btrim(left(item.body, 200)), '');
begin
  if cardinality(coalesce(people, '{}')) = 0 then
    return 0;
  end if;
  -- The post's work stands whatever its notice does: a failure is logged.
  begin
    return app_private.notify('announcements.' || kind, item.workspace_id, people,
      'announcement:' || item.id::text || ':' || kind || ':' || coalesce(key_part, item.revision::text),
      case kind
        when 'published' then item.title
        when 'updated' then 'Updated: ' || item.title
        when 'reminder' then 'Reminder: ' || item.title
        when 'cancelled' then item.title || coalesce(' on ' || on_text, '') || ' is cancelled'
        else 'Couldn''t publish "' || item.title || '"' end,
      case kind
        when 'reminder' then 'Open it to acknowledge it.'
        when 'publish_failed' then why
        when 'cancelled' then null
        else concat_ws(' · ', on_text, preview) end,
      '/app/announcements/' || case when item.on_important_dates then 'important-dates/' else '' end || item.id::text,
      actor, 'announcement', item.id, jsonb_build_object('announcement_id', item.id));
  exception when others then
    raise warning 'announcement_tell: % notice for % skipped: % (%)', kind, item.id, sqlerrm, sqlstate;
    return 0;
  end;
end;
$$;

revoke all on function app_private.announcement_tell(uuid, public.announcements, text, uuid[], text, text) from public;

-- A scheduled post that could not go out: whoever scheduled it (or wrote it) while the domain's own rule
-- still lets them write this post (announcement_reason: every place it names, its dates, its writer);
-- otherwise every member that rule lets write it now (S-127). Never silent: with nobody left, the owner.
-- The core's place-scoped check would not do: a post for two places, or for none left, is out of scope for
-- everybody there.
create function app_private.announcement_tell_release_failed(item public.announcements, why text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  scheduler uuid := coalesce(item.scheduled_by, item.created_by);
  places uuid[] := app_private.announcement_places(item.id);
  dates boolean := app_private.announcement_dates(item);
  people uuid[];
begin
  if app_private.announcement_reason(app_private.actor(scheduler, item.workspace_id), places, item.created_by, dates) is null then
    people := array[scheduler];
  else
    -- ponytail: one rule check per active member; a workspace is tens of people.
    people := array(select m.user_id from public.workspace_memberships m
                    where m.workspace_id = item.workspace_id and m.status = 'active'
                      and app_private.announcement_reason(app_private.actor(m.user_id, item.workspace_id), places,
                        item.created_by, dates) is null);
  end if;
  if cardinality(people) = 0 then
    people := array(select m.user_id from public.workspace_memberships m
                    join public.workspace_roles r on r.id = m.role_id and r.workspace_id = m.workspace_id
                    where m.workspace_id = item.workspace_id and m.status = 'active'
                      and app_private.authz_rank(r.access_class) = app_private.authz_rank('owner'));
  end if;
  return app_private.announcement_tell(null, item, 'publish_failed', people, null, why);
exception when others then
  -- Called from the release's own failure branch: nothing here may stop the next post going out.
  raise warning 'announcement_tell_release_failed: notice for % skipped: % (%)', item.id, sqlerrm, sqlstate;
  return 0;
end;
$$;

revoke all on function app_private.announcement_tell_release_failed(public.announcements, text) from public;

CREATE OR REPLACE FUNCTION "app_private"."announcement_release"("w" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  place uuid;
  item public.announcements;
  publisher uuid;
  impact jsonb;
  reached uuid[];
  told integer;
  released integer := 0;
  failure text;
  failure_hint text;
  failure_text text;
begin
  for place in
    select distinct announcement.workspace_id from public.announcements announcement
    where (w is null or announcement.workspace_id = w) and announcement.archived_at is null
      and ((announcement.status = 'scheduled' and announcement.publish_at <= now() and announcement.release_failed_at is null)
        or (announcement.status = 'published'
            and coalesce(announcement.ends_on, announcement.starts_on) <= (now() at time zone 'UTC')::date + 1
            and (cardinality(announcement.delivered_to) > 0 or (announcement.recurrence <> 'none' and not exists (
              select 1 from public.announcements other where other.repeats_from = announcement.id)))))
    order by 1
  loop
    -- The order a save takes: this lock, the record, then the Schedule's.
    perform pg_advisory_xact_lock(hashtextextended(place::text, 931));
    for item in
      select * from public.announcements announcement
      where announcement.workspace_id = place and announcement.status = 'scheduled' and announcement.archived_at is null
        and announcement.publish_at <= now() and announcement.release_failed_at is null
      order by announcement.publish_at, announcement.id
      for update skip locked
    loop
      begin
        perform public.availability_lock_workspace(place);
        publisher := coalesce(item.scheduled_by, item.created_by);
        if exists (select 1 from app_private.announcement_moments(item) moment where moment.starts_at <= now()) then
          raise exception 'too_late' using errcode = '22023', hint = 'announcement.too_late';
        end if;
        failure := app_private.announcement_reason(app_private.actor(publisher, place), app_private.announcement_places(item.id),
          item.created_by, app_private.announcement_dates(item));
        if failure is not null then
          raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || failure, detail = 'announcement.write';
        end if;
        impact := app_private.announcement_impact(place, item.id, item.starts_on, item.ends_on,
          app_private.announcement_rows(item.id), item.shift_choices, item.choices_saved_at);
        update public.announcements
        set status = 'published', published_at = item.publish_at, published_by = publisher, unpublished_at = null,
            release_error = null, revision = revision + 1
        where id = item.id returning * into item;
        told := app_private.announcement_apply(publisher, item, impact);
        reached := app_private.announcement_recipients(item);
        update public.announcements set delivered_to = reached where id = item.id;
        -- Out on time: whoever it reaches who has not acknowledged it (brought out again), not its publisher.
        perform app_private.announcement_tell(publisher, item, 'published', array(
          select who from unnest(reached) who where not exists (select 1 from public.announcement_acknowledgements ack
            where ack.announcement_id = item.id and ack.user_id = who)));
        insert into public.announcement_changes (workspace_id, announcement_id, actor_user_id, action, detail)
        values (place, item.id, publisher, 'published', jsonb_strip_nulls(jsonb_build_object('auto', true,
          'shift_changes', nullif(told, 0), 'told', cardinality(reached))));
        released := released + 1;
      exception when others then
        get stacked diagnostics failure = returned_sqlstate, failure_hint = pg_exception_hint, failure_text = message_text;
        if failure = '42501' or failure_hint = 'announcement.too_late' then
          update public.announcements
          set release_failed_at = now(), release_error = left(failure || ': ' || failure_text, 2000), revision = revision + 1
          where id = item.id returning * into item;
          insert into public.announcement_changes (workspace_id, announcement_id, actor_user_id, action, detail)
          values (place, item.id, null, 'publish_failed',
            jsonb_build_object('code', case when failure = '42501' then 'not_allowed' else 'too_late' end));
          perform app_private.announcement_tell_release_failed(item, case when failure = '42501'
            then 'Whoever scheduled it may no longer publish it.' else 'Its day started before it could go out.' end);
        else
          -- One broken row must not hold up every workspace's, nor the read
          -- that called this (O2). It tries again the next minute (KK-98).
          update public.announcements set release_error = left(failure || ': ' || failure_text, 2000) where id = item.id;
        end if;
      end;
    end loop;

    for item in
      select * from public.announcements announcement
      where announcement.workspace_id = place and announcement.status = 'published' and announcement.archived_at is null
        and coalesce(announcement.ends_on, announcement.starts_on) <= (now() at time zone 'UTC')::date + 1
        and (cardinality(announcement.delivered_to) > 0 or (announcement.recurrence <> 'none' and not exists (
          select 1 from public.announcements other where other.repeats_from = announcement.id)))
        and exists (select 1 from app_private.announcement_moments(announcement) moment where moment.ends_at <= now())
      for update skip locked
    loop
      begin
        if cardinality(item.delivered_to) > 0 then
          update public.announcements set delivered_to = '{}' where id = item.id;
        end if;
        if item.recurrence <> 'none' then
          perform app_private.announcement_repeat(item);
        end if;
      exception when others then
        -- The next minute tries again.
        raise warning 'announcement % did not close: %', item.id, sqlerrm;
      end;
    end loop;
  end loop;
  return released;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."save_announcement_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_announcement_id" "uuid", "target_expected_revision" integer, "target_payload" "jsonb", "target_intent" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  w uuid := target_workspace_id;
  me app_private.actor_state;
  stored public.announcements;
  item public.announcements;
  shown text := 'new';
  n jsonb;
  author uuid;
  reason text;
  found jsonb;
  impact jsonb;
  offered jsonb := '[]'::jsonb;
  back jsonb := '[]'::jsonb;
  told integer := 0;
  reached uuid[] := '{}';
  content_changed boolean := true;
  reset boolean := false;
  acked uuid[] := '{}';
  earlier uuid[] := '{}';
  touched uuid[] := '{}';
  notified uuid[] := '{}';
  history_action text;
begin
  perform app_private.authorize(actor_user_id, w, 'announcement.read');
  if target_intent is null or target_intent not in ('draft', 'schedule', 'publish', 'save')
     or jsonb_typeof(coalesce(target_payload -> 'bring_back', '[]'::jsonb)) <> 'array'
     or exists (select 1 from jsonb_array_elements(coalesce(target_payload -> 'bring_back', '[]'::jsonb)) x
                where jsonb_typeof(x) <> 'string'
                   or x #>> '{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'valid announcement intent required' using errcode = '22023', hint = 'announcement.invalid';
  end if;
  -- S4 and the shifts: one record at a time, then the Schedule's own lock.
  perform pg_advisory_xact_lock(hashtextextended(w::text, 931));
  if target_intent <> 'draft' then
    perform public.availability_lock_workspace(w);
  end if;
  perform app_private.announcement_release(w);
  me := app_private.actor(actor_user_id, w);

  if target_announcement_id is not null then
    select * into stored from public.announcements where id = target_announcement_id and workspace_id = w for update;
    if stored.id is null or not app_private.announcement_visible(me, stored) then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'announcement.write';
    end if;
    reason := app_private.announcement_reason(me, app_private.announcement_places(stored.id), stored.created_by,
      app_private.announcement_dates(stored));
    if reason is not null then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || reason, detail = 'announcement.write';
    end if;
    if stored.revision is distinct from target_expected_revision then
      raise exception 'This post changed since you opened it.' using errcode = 'PT409', hint = 'announcement.changed';
    end if;
    shown := app_private.announcement_display_status(stored);
    if shown in ('past', 'archived') then
      raise exception 'This post can''t change anymore.' using errcode = 'PT409', hint = 'announcement.read_only';
    end if;
  end if;
  if not ((target_intent = 'save' and shown = 'published')
          or (target_intent <> 'save' and shown in ('new', 'draft', 'scheduled', 'publish_failed', 'unpublished'))) then
    raise exception 'This post changed since you opened it.' using errcode = 'PT409', hint = 'announcement.changed';
  end if;

  author := coalesce(stored.created_by, actor_user_id);
  n := app_private.announcement_proposal(w, stored, coalesce(target_payload, '{}'::jsonb), author);
  perform app_private.announcement_authorize(me, n, author);
  found := app_private.announcement_problems(w, stored, n, target_intent);
  if jsonb_array_length(found) > 0 then
    raise exception '%', found -> 0 ->> 'message'
      using errcode = '22023', hint = 'announcement.' || (found -> 0 ->> 'code'), detail = found -> 0 ->> 'field';
  end if;

  if target_intent in ('publish', 'save') then
    impact := app_private.announcement_impact(w, stored.id, (n ->> 'starts_on')::date, (n ->> 'ends_on')::date,
      n -> 'locations', n -> 'choices', stored.choices_saved_at);
    if (jsonb_array_length(impact -> 'shifts') > 0 or jsonb_array_length(impact -> 'quiet') > 0)
       and (target_payload ->> 'fingerprint') is distinct from (impact ->> 'fingerprint') then
      raise exception 'The shifts on these days changed. Review the Shifts tab again.'
        using errcode = 'PT409', hint = 'announcement.shifts_changed';
    end if;
  end if;
  if target_intent = 'save' then
    offered := app_private.announcement_back_rows(stored, (n ->> 'starts_on')::date, (n ->> 'ends_on')::date, n -> 'locations');
  end if;

  if stored.id is null then
    insert into public.announcements (workspace_id, title, body, time_zone, created_by, updated_by)
    values (w, n ->> 'title', n ->> 'body', n ->> 'time_zone', actor_user_id, actor_user_id)
    returning * into item;
    insert into public.announcement_changes (workspace_id, announcement_id, actor_user_id, action)
    values (w, item.id, actor_user_id, 'created');
  else
    item := stored;
    -- K4: what it says (its text, its days, what a day does at a location it
    -- already had) is content; a location or a person added or taken off is
    -- only who gets it.
    content_changed := (stored.title, stored.body, stored.category::text, stored.category_other, stored.starts_on,
        stored.ends_on, stored.event_from, stored.event_until, stored.recurrence)
      is distinct from (n ->> 'title', n ->> 'body', n ->> 'category', n ->> 'category_other', (n ->> 'starts_on')::date,
        (n ->> 'ends_on')::date, (n ->> 'event_from')::time, (n ->> 'event_until')::time, n ->> 'recurrence')
      or exists (
        select 1 from jsonb_array_elements(app_private.announcement_rows(stored.id)) was
        join jsonb_array_elements(n -> 'locations') now_row on now_row ->> 'location_id' = was ->> 'location_id'
        where (was ->> 'day', was ->> 'opens', was ->> 'closes')
          is distinct from (now_row ->> 'day', now_row ->> 'opens', now_row ->> 'closes'));
  end if;

  update public.announcements
  set title = n ->> 'title', body = n ->> 'body',
      category = (n ->> 'category')::public.announcement_category, category_other = n ->> 'category_other',
      starts_on = (n ->> 'starts_on')::date, ends_on = (n ->> 'ends_on')::date,
      event_from = (n ->> 'event_from')::time, event_until = (n ->> 'event_until')::time,
      recurrence = n ->> 'recurrence',
      on_important_dates = (n ->> 'on_important_dates')::boolean, on_calendar = (n ->> 'on_calendar')::boolean,
      on_schedule = (n ->> 'on_schedule')::boolean, ask_ack = (n ->> 'ask_ack')::boolean,
      time_zone = n ->> 'time_zone',
      publish_at = case target_intent when 'publish' then now() when 'save' then item.publish_at
                                      else (n ->> 'publish_at')::timestamptz end,
      status = case target_intent when 'draft' then 'draft' when 'schedule' then 'scheduled'
                                  else 'published' end::public.announcement_status,
      scheduled_by = case target_intent when 'schedule' then actor_user_id when 'draft' then null else item.scheduled_by end,
      published_by = case when target_intent = 'publish' then actor_user_id else item.published_by end,
      published_at = case when target_intent = 'publish' then now() else item.published_at end,
      unpublished_at = case when target_intent = 'publish' then null else item.unpublished_at end,
      shift_choices = n -> 'choices',
      choices_saved_at = case when target_intent = 'draft' then null else now() end,
      release_failed_at = null, release_error = null,
      content_revision = item.content_revision + case when content_changed and stored.id is not null then 1 else 0 end,
      revision = item.revision + case when stored.id is null then 0 else 1 end,
      updated_by = actor_user_id, updated_at = now()
  where id = item.id
  returning * into item;

  delete from public.announcement_locations where announcement_id = item.id;
  insert into public.announcement_locations (workspace_id, announcement_id, location_id, day, opens, closes)
  select w, item.id, (r ->> 'location_id')::uuid, r ->> 'day', (r ->> 'opens')::time, (r ->> 'closes')::time
  from jsonb_array_elements(n -> 'locations') r;
  delete from public.announcement_people where announcement_id = item.id;
  insert into public.announcement_people (workspace_id, announcement_id, user_id)
  select w, item.id, x::uuid from jsonb_array_elements_text(n -> 'people') x;

  if target_intent = 'save' then
    back := app_private.announcement_bring_back(actor_user_id, item,
      array(select x::uuid from jsonb_array_elements_text(coalesce(target_payload -> 'bring_back', '[]'::jsonb)) x), offered);
  end if;
  if target_intent in ('publish', 'save') then
    earlier := array(select change.id from public.announcement_shift_changes change where change.announcement_id = item.id);
    told := app_private.announcement_apply(actor_user_id, item, impact);
    reached := app_private.announcement_recipients(item);
    -- Whoever's shift this write changed hears it, whatever else holds.
    touched := array(select distinct person.user_id from public.announcement_shift_changes change
                     join public.employee_profiles person on person.id = change.employee_id
                     where change.announcement_id = item.id and not change.silent and change.brought_back_at is null
                       and not change.id = any (earlier) and person.user_id is not null);
    -- K27: acknowledgements stay unless the writer asks for them again; then
    -- everyone it reaches answers anew.
    if item.ask_ack and coalesce((target_payload ->> 'reset_acknowledgements')::boolean, false)
       and exists (select 1 from public.announcement_acknowledgements ack where ack.announcement_id = item.id) then
      update public.announcements
      set acknowledged_before = array(select distinct who from unnest(acknowledged_before || array(
            select ack.user_id from public.announcement_acknowledgements ack where ack.announcement_id = item.id)) who)
      where id = item.id returning * into item;
      delete from public.announcement_acknowledgements where announcement_id = item.id;
      reset := true;
    end if;
    acked := array(select ack.user_id from public.announcement_acknowledgements ack where ack.announcement_id = item.id);
  end if;

  if target_intent = 'publish' then
    -- K4 (3), K27: brought out again with its acknowledgements kept, it is for
    -- whoever hasn't acknowledged; the first time, for everyone.
    notified := array(select who from unnest(reached) who where not who = any (acked) or who = any (touched));
  elsif target_intent = 'save' then
    -- K4: new people; a change in what it says for whoever hasn't acknowledged
    -- it (everyone, once asked again, K27); a changed or returned shift for its person.
    notified := array(select who from unnest(reached) who
                      where not who = any (item.delivered_to) or who = any (touched)
                         or ((content_changed or reset) and not who = any (acked))
                         or who = any (array(select (x ->> 'employee_user_id')::uuid from jsonb_array_elements(back) x
                                             where not coalesce((x ->> 'silent')::boolean, false))));
  end if;
  if target_intent = 'publish' then
    perform app_private.announcement_tell(actor_user_id, item, 'published', notified);
  elsif target_intent = 'save' then
    -- People it newly reaches hear it is out, unless they acknowledged it already (taken off, put back); a
    -- change in what it says, whoever it reached before and has not acknowledged it. A changed or returned shift is the Schedule's notice (schedule_tell_closed_day).
    perform app_private.announcement_tell(actor_user_id, item, 'published',
      array(select who from unnest(reached) who where not who = any (item.delivered_to) and not who = any (acked)));
    if content_changed or reset then
      perform app_private.announcement_tell(actor_user_id, item, 'updated',
        array(select who from unnest(reached) who where who = any (item.delivered_to) and not who = any (acked)));
    end if;
  end if;
  if target_intent in ('publish', 'save') then
    update public.announcements set delivered_to = reached where id = item.id returning * into item;
  end if;
  -- Scheduled, published or put back to draft: a failed schedule's card is done.
  if stored.release_failed_at is not null then
    perform app_private.notification_resolve(w, 'announcement', item.id, 'closed', actor_user_id);
  end if;

  history_action := case
    when target_intent = 'draft' and stored.status = 'scheduled' then 'unscheduled'
    when target_intent = 'draft' then 'saved'
    when target_intent = 'schedule' then 'scheduled'
    when target_intent = 'publish' then 'published'
    else 'updated' end;
  insert into public.announcement_changes (workspace_id, announcement_id, actor_user_id, action, detail)
  values (w, item.id, actor_user_id, history_action, jsonb_strip_nulls(jsonb_build_object(
    'publish_at', case when target_intent = 'schedule' then item.publish_at end,
    'rescheduled', case when target_intent = 'schedule' and stored.status = 'scheduled' then true end,
    'shift_changes', nullif(told, 0),
    'brought_back', nullif(jsonb_array_length(back), 0),
    'told', case when target_intent in ('publish', 'save') then cardinality(notified) end,
    'acknowledgements_reset', case when reset then true end)));
  insert into public.audit_events (workspace_id, actor_user_id, action, target_type, target_id, metadata)
  values (w, actor_user_id, 'announcement.' || history_action, 'announcement', item.id::text,
    jsonb_build_object('content_changed', content_changed, 'shift_changes', told, 'brought_back', jsonb_array_length(back)));

  return jsonb_build_object('status', item.status, 'display_status', app_private.announcement_display_status(item),
    'announcement_id', item.id, 'revision', item.revision, 'recipient_count', cardinality(item.delivered_to),
    'shift_changes', told, 'brought_back', jsonb_array_length(back));
end;
$_$;

CREATE OR REPLACE FUNCTION "public"."set_announcement_state_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_announcement_id" "uuid", "target_expected_revision" integer, "target_action" "text", "target_bring_back" "uuid"[] DEFAULT '{}'::"uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  w uuid := target_workspace_id;
  me app_private.actor_state;
  item public.announcements;
  shown text;
  reason text;
  told integer := 0;
  back jsonb := '[]'::jsonb;
  people uuid[];
begin
  perform app_private.authorize(actor_user_id, w, 'announcement.read');
  if target_action is null or target_action not in ('unschedule', 'unpublish', 'archive', 'bring_back', 'remind') then
    raise exception 'valid announcement action required' using errcode = '22023', hint = 'announcement.invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(w::text, 931));
  if target_action = 'bring_back' then
    perform public.availability_lock_workspace(w);
  end if;
  perform app_private.announcement_release(w);
  me := app_private.actor(actor_user_id, w);
  select * into item from public.announcements where id = target_announcement_id and workspace_id = w for update;
  if item.id is null or not app_private.announcement_visible(me, item) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'announcement.write';
  end if;
  reason := app_private.announcement_reason(me, app_private.announcement_places(item.id), item.created_by,
    app_private.announcement_dates(item));
  if reason is not null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || reason, detail = 'announcement.write';
  end if;
  shown := app_private.announcement_display_status(item);
  -- A past post can only be archived; an archived one is done (Mert, 2026-10-12).
  if (shown = 'past' and target_action <> 'archive') or shown = 'archived' then
    raise exception 'This post can''t change anymore.' using errcode = 'PT409', hint = 'announcement.read_only';
  end if;
  if item.revision is distinct from target_expected_revision
     or (target_action = 'unschedule' and shown not in ('scheduled', 'publish_failed'))
     or (target_action = 'unpublish' and shown <> 'published')
     or (target_action = 'archive' and shown not in ('draft', 'unpublished', 'past'))
     or (target_action = 'bring_back' and shown <> 'unpublished')
     -- Remind asks for an acknowledgement: only a post that asks for one has it.
     or (target_action = 'remind' and (shown <> 'published' or not item.ask_ack)) then
    raise exception 'This post changed since you opened it.' using errcode = 'PT409', hint = 'announcement.changed';
  end if;

  if target_action = 'unschedule' then
    update public.announcements
    set status = 'draft', scheduled_by = null, choices_saved_at = null, release_failed_at = null, release_error = null
    where id = item.id;
  elsif target_action = 'unpublish' then
    -- A dated post taken back tells whoever it reaches now; one without a day, nobody.
    people := case when item.starts_on is null then '{}'::uuid[] else app_private.announcement_recipients(item) end;
    told := cardinality(people);
    update public.announcements set status = 'unpublished', unpublished_at = now(), delivered_to = '{}' where id = item.id;
  elsif target_action = 'archive' then
    update public.announcements set archived_at = now(), delivered_to = '{}' where id = item.id;
  elsif target_action = 'remind' then
    -- S-126 (2): twice a day for one post at most, in the post's time zone; then the drawer's button rests.
    if app_private.announcement_reminders_left(item) = 0 then
      raise exception 'You can remind people about this post twice a day.' using errcode = 'PT409',
        hint = 'announcement.remind_limit';
    end if;
    people := array(select who from unnest(app_private.announcement_respondents(item)) who
                    where not exists (select 1 from public.announcement_acknowledgements ack
                                      where ack.announcement_id = item.id and ack.user_id = who));
    if cardinality(people) = 0 then
      raise exception 'Everyone acknowledged.' using errcode = 'PT409', hint = 'announcement.changed';
    end if;
    told := cardinality(people);
  else
    back := app_private.announcement_bring_back(actor_user_id, item, target_bring_back,
      app_private.announcement_back_rows(item, null, null, '[]'::jsonb));
    if jsonb_array_length(back) = 0 then
      raise exception 'Pick the shifts to bring back.' using errcode = '22023', hint = 'announcement.invalid';
    end if;
    -- Bringing shifts back has no notice yet: nobody is told, and its History counts nobody.
  end if;

  update public.announcements set revision = revision + 1, updated_by = actor_user_id, updated_at = now()
  where id = item.id returning * into item;
  insert into public.announcement_changes (workspace_id, announcement_id, actor_user_id, action, detail)
  values (w, item.id, actor_user_id,
    case target_action when 'unschedule' then 'unscheduled' when 'unpublish' then 'unpublished' when 'archive' then 'archived'
                       when 'remind' then 'reminded' else 'brought_back' end,
    jsonb_strip_nulls(jsonb_build_object('told', case when target_action in ('unpublish', 'remind') then told end,
      'brought_back', nullif(jsonb_array_length(back), 0))));
  insert into public.audit_events (workspace_id, actor_user_id, action, target_type, target_id, metadata)
  values (w, actor_user_id, 'announcement.' || case target_action when 'unschedule' then 'unscheduled'
      when 'unpublish' then 'unpublished' when 'archive' then 'archived' when 'remind' then 'reminded' else 'brought_back' end,
    'announcement', item.id::text, jsonb_build_object('told', told, 'brought_back', jsonb_array_length(back)));
  if target_action = 'unpublish' then
    perform app_private.announcement_tell(actor_user_id, item, 'cancelled', people);
  elsif target_action = 'remind' then
    -- One key per press: the day and which press it is (this one is already in the History).
    perform app_private.announcement_tell(actor_user_id, item, 'reminder', people,
      'remind:' || (now() at time zone item.time_zone)::date::text || ':' || (2 - app_private.announcement_reminders_left(item))::text);
  elsif target_action in ('unschedule', 'archive') then
    perform app_private.notification_resolve(w, 'announcement', item.id, 'closed', actor_user_id);
  end if;
  return jsonb_build_object('status', item.status, 'display_status', app_private.announcement_display_status(item),
    'announcement_id', item.id, 'revision', item.revision, 'archived_at', item.archived_at, 'told', told,
    'reminders_left_today', app_private.announcement_reminders_left(item));
end;
$$;

CREATE OR REPLACE FUNCTION "public"."get_announcement_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_announcement_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  w uuid := target_workspace_id;
  reader app_private.actor_state;
  item public.announcements;
  allowed boolean;
  seen uuid[];
begin
  perform app_private.authorize(actor_user_id, w, 'announcement.read');
  perform app_private.announcement_release(w);
  reader := app_private.actor(actor_user_id, w);
  select * into item from public.announcements where id = target_announcement_id and workspace_id = w;
  if item.id is null or not app_private.announcement_visible(reader, item) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'announcement.read';
  end if;
  allowed := app_private.announcement_reason(reader, app_private.announcement_places(item.id), item.created_by,
    app_private.announcement_dates(item)) is null;
  if not allowed then
    return app_private.announcement_item(reader, item, false);
  end if;
  seen := app_private.scope_set(actor_user_id, w, 'schedule.read');
  return app_private.announcement_item(reader, item, true) || jsonb_build_object(
    'people', coalesce((
      select jsonb_agg(app_private.announcement_person(w, person.user_id) order by person.user_id)
      from public.announcement_people person where person.announcement_id = item.id), '[]'::jsonb),
    'shift_choices', item.shift_choices,
    'reminders_left_today', app_private.announcement_reminders_left(item),
    'choices_saved_at', item.choices_saved_at,
    -- Whose shifts it changed, where the reader may read the Schedule (D1).
    'changes', coalesce((
      select jsonb_agg(app_private.announcement_change_item(change) order by change.scheduled_date, change.changed_at, change.id)
      from public.announcement_shift_changes change
      where change.announcement_id = item.id and change.location_id = any (seen)), '[]'::jsonb),
    'hidden_change_count', (select count(*) from public.announcement_shift_changes change
      where change.announcement_id = item.id and not change.location_id = any (seen)),
    'acknowledgements', coalesce((
      select jsonb_agg(app_private.announcement_person(w, who) || jsonb_build_object('acknowledged_at', ack.acknowledged_at)
        order by ack.acknowledged_at is not null, ack.acknowledged_at, who)
      from unnest(case when item.ask_ack and item.status = 'published'
                       then app_private.announcement_respondents(item) else '{}'::uuid[] end) who
      left join public.announcement_acknowledgements ack on ack.announcement_id = item.id and ack.user_id = who), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('id', change.id, 'action', change.action, 'detail', change.detail,
        'changed_at', change.changed_at, 'actor_user_id', change.actor_user_id,
        'actor_name', coalesce(account.display_name, case when change.actor_user_id is null then null else 'Workspace member' end))
        order by change.changed_at desc, change.id)
      from public.announcement_changes change
      left join public.user_profiles account on account.user_id = change.actor_user_id
      where change.announcement_id = item.id), '[]'::jsonb));
end;
$$;

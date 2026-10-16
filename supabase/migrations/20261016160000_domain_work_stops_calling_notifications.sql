-- BILDIRIM-04 (teardown part C1): the domain work stops calling the old notification system.
-- Mert, 2026-10-16 (KARARLAR S-123): the old system goes; nothing is notified until the new one
-- comes (S-96). Each function below loses only its "send a notification" call and the lines that
-- only fed it; what it does to the domain stays as it was. The notification objects themselves
-- (tables, functions, type, policies, permissions) stay for part C2, which drops them.
--
-- Also here: the three triggers that turned a domain row into a notification, the outbox cron job
-- and the account notification table's place in the realtime publication.
--
-- One signature changes: publish_schedule_draft_service loses target_notify_employee_ids (the API
-- stopped sending it in BILDIRIM-03), so the old one is dropped and the new one granted again.

-- Announcements -------------------------------------------------------------------------------------
-- delivered_to is the announcement's own state (who it reaches; it decides when it ends): it is
-- written here as before. "told" counts in the history and the answers stay what they were.

create or replace function app_private.announcement_release(w uuid default null::uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
$function$;

create or replace function public.save_announcement_service(actor_user_id uuid, target_workspace_id uuid, target_announcement_id uuid, target_expected_revision integer, target_payload jsonb, target_intent text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
  if target_intent in ('publish', 'save') then
    update public.announcements set delivered_to = reached where id = item.id returning * into item;
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
$function$;

-- "told" was what the notice went to: one person each, and none for a cancelled announcement
-- with no day (its cancel notice had nothing to say). The same count, without the notice.
create or replace function public.set_announcement_state_service(actor_user_id uuid, target_workspace_id uuid, target_announcement_id uuid, target_expected_revision integer, target_action text, target_bring_back uuid[] default '{}'::uuid[])
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
     or (target_action = 'remind' and (shown <> 'published' or not item.ask_ack)) then
    raise exception 'This post changed since you opened it.' using errcode = 'PT409', hint = 'announcement.changed';
  end if;

  if target_action = 'unschedule' then
    update public.announcements
    set status = 'draft', scheduled_by = null, choices_saved_at = null, release_failed_at = null, release_error = null
    where id = item.id;
  elsif target_action = 'unpublish' then
    told := case when item.starts_on is null then 0 else coalesce(cardinality(item.delivered_to), 0) end;
    update public.announcements set status = 'unpublished', unpublished_at = now(), delivered_to = '{}' where id = item.id;
  elsif target_action = 'archive' then
    update public.announcements set archived_at = now(), delivered_to = '{}' where id = item.id;
  elsif target_action = 'bring_back' then
    back := app_private.announcement_bring_back(actor_user_id, item, target_bring_back,
      app_private.announcement_back_rows(item, null, null, '[]'::jsonb));
    if jsonb_array_length(back) = 0 then
      raise exception 'Pick the shifts to bring back.' using errcode = '22023', hint = 'announcement.invalid';
    end if;
    people := array(select distinct (x ->> 'employee_user_id')::uuid from jsonb_array_elements(back) x
                    where x ->> 'employee_user_id' is not null and not coalesce((x ->> 'silent')::boolean, false));
    told := case when item.starts_on is null then 0 else coalesce(cardinality(people), 0) end;
  else
    people := array(select who from unnest(app_private.announcement_respondents(item)) who
                    where not exists (select 1 from public.announcement_acknowledgements ack
                                      where ack.announcement_id = item.id and ack.user_id = who));
    if cardinality(people) = 0 then
      raise exception 'Everyone acknowledged.' using errcode = 'PT409', hint = 'announcement.changed';
    end if;
    told := cardinality(people);
  end if;

  update public.announcements set revision = revision + 1, updated_by = actor_user_id, updated_at = now()
  where id = item.id returning * into item;
  insert into public.announcement_changes (workspace_id, announcement_id, actor_user_id, action, detail)
  values (w, item.id, actor_user_id,
    case target_action when 'unschedule' then 'unscheduled' when 'unpublish' then 'unpublished' when 'archive' then 'archived'
                       when 'bring_back' then 'brought_back' else 'reminded' end,
    jsonb_strip_nulls(jsonb_build_object('told', case when target_action in ('unpublish', 'bring_back', 'remind') then told end,
      'brought_back', nullif(jsonb_array_length(back), 0))));
  insert into public.audit_events (workspace_id, actor_user_id, action, target_type, target_id, metadata)
  values (w, actor_user_id, 'announcement.' || case target_action when 'unschedule' then 'unscheduled'
      when 'unpublish' then 'unpublished' when 'archive' then 'archived' when 'bring_back' then 'brought_back' else 'reminded' end,
    'announcement', item.id::text, jsonb_build_object('told', told, 'brought_back', jsonb_array_length(back)));
  return jsonb_build_object('status', item.status, 'display_status', app_private.announcement_display_status(item),
    'announcement_id', item.id, 'revision', item.revision, 'archived_at', item.archived_at, 'told', told);
end;
$function$;

-- Time off ------------------------------------------------------------------------------------------

create or replace function app_private.shorten_time_off(actor uuid, w uuid, emp uuid, cut tstzmultirange, note text, source jsonb)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare parent public.schedule_time_off_requests%rowtype; seg record; rid uuid; sid uuid; zone_name text;
 given tstzmultirange; remaining tstzmultirange; next_status public.time_off_request_status; said text; result jsonb:='[]';
begin
 perform public.availability_lock_workspace(w);
 if cut is null or isempty(cut) then return result; end if;
 if exists(select 1 from unnest(cut) x where lower(x)<=now() or not isfinite(lower(x)) or not isfinite(upper(x))) then
  raise exception 'Only future approved hours can be given back' using errcode='22023'; end if;
 said:=left(btrim(coalesce(note,'')),1000);
 for parent in select r.* from public.schedule_time_off_requests r
  where r.workspace_id=w and r.employee_id=emp and r.request_type='time_off' and r.status = 'approved'
   and exists(select 1 from public.schedule_time_off_segments s where s.request_id=r.id and s.workspace_id=w and public.time_off_effective_ranges(s.id) && cut)
  order by r.created_at, r.id for update loop
  rid:=gen_random_uuid(); given:='{}';
  insert into public.schedule_time_off_requests(id,workspace_id,employee_id,request_type,reason,created_by)
   values(rid,w,emp,'time_off_cancellation',said,actor);
  insert into public.time_off_cancellation_links values(rid,w,parent.id,parent.revision);
  for seg in select s.id,s.time_timezone,p.piece from public.schedule_time_off_segments s
   cross join lateral unnest(public.time_off_effective_ranges(s.id)*cut) p(piece)
   where s.request_id=parent.id and s.workspace_id=w order by lower(p.piece) loop
   zone_name:=seg.time_timezone; sid:=gen_random_uuid();
   insert into public.schedule_time_off_segments(id,workspace_id,request_id,segment_date,start_time,end_time,time_timezone,starts_at,ends_at,ends_next_day)
    values(sid,w,rid,(lower(seg.piece) at time zone zone_name)::date,(lower(seg.piece) at time zone zone_name)::time,(upper(seg.piece) at time zone zone_name)::time,
     zone_name,lower(seg.piece),upper(seg.piece),(upper(seg.piece) at time zone zone_name)::date>(lower(seg.piece) at time zone zone_name)::date);
   insert into public.time_off_cancellation_periods values(sid,w,rid,seg.id,parent.id);
   given:=given+tstzmultirange(seg.piece);
  end loop;
  insert into public.schedule_time_off_events(workspace_id,request_id,action,actor_user_id,note,metadata)
   values(w,rid,'submitted',actor,said,jsonb_build_object('parent_request_id',parent.id,'parent_revision',parent.revision,'shortened',true,'source',source));
  -- The hours given back are settled at once (a request with no location has no zone for the old decision path).
  update public.schedule_time_off_segments set status='approved' where request_id=rid and workspace_id=w;
  update public.schedule_time_off_requests set status='approved',revision=revision+1,updated_at=now() where id=rid;
  insert into public.schedule_time_off_events(workspace_id,request_id,action,actor_user_id,note,metadata)
   values(w,rid,'approved',actor,said,jsonb_build_object('revision',2,'shortened',true,'source',source));
  select coalesce(range_agg(p.span),'{}') into remaining from public.schedule_time_off_segments s
   cross join lateral unnest(public.time_off_effective_ranges(s.id)) p(span) where s.request_id=parent.id and s.workspace_id=w;
  next_status:=case when isempty(remaining) then 'revoked'::public.time_off_request_status else parent.status end;
  update public.schedule_time_off_requests set status=next_status,revision=revision+1,updated_at=now() where id=parent.id returning * into parent;
  -- Nothing of the time off is left: a cancellation waiting on it closes (as a revoke does).
  if next_status = 'revoked' then
   update public.schedule_time_off_requests cr set status='revoked',revision=cr.revision+1,updated_at=now()
   from public.time_off_cancellation_links cl
   where cl.request_id=cr.id and cl.parent_request_id=parent.id and cl.workspace_id=w and cr.status='pending' and cr.id<>rid;
   insert into public.schedule_time_off_events(workspace_id,request_id,action,actor_user_id,note,metadata)
   select w,cr.id,'revoked',actor,'Closed because the time off was given back in full.',jsonb_build_object('parent_request_id',parent.id)
   from public.time_off_cancellation_links cl join public.schedule_time_off_requests cr on cr.id=cl.request_id
   where cl.parent_request_id=parent.id and cl.workspace_id=w and cr.id<>rid and cr.status='revoked'
    and not exists(select 1 from public.schedule_time_off_events e where e.request_id=cr.id and e.action='revoked');
  end if;
  insert into public.schedule_time_off_events(workspace_id,request_id,action,actor_user_id,note,metadata)
   values(w,parent.id,next_status::text,actor,said,jsonb_build_object('revision',parent.revision,'cancellation_request_id',rid,
    'cancelled_intervals',public.availability_ranges_json(given),'shortened',true,'source',source));
  result:=result||jsonb_build_array(jsonb_build_object('request_id',parent.id,'revision',parent.revision,'status',parent.status,
   'cancellation_request_id',rid,'intervals',public.availability_ranges_json(given)));
 end loop;
 return result;
end;
$function$;

create or replace function app_private.time_off_release_shifts(w uuid, rid uuid, actor uuid, decision integer, recorded_by uuid default null::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  person uuid := (select r.employee_id from public.schedule_time_off_requests r where r.id = rid and r.workspace_id = w);
  -- The records need a person; the job (no actor) names an approval that counts.
  who uuid := coalesce(actor, recorded_by);
  s jsonb;
  changes jsonb := '[]';
  other record;
begin
  for s in select x from jsonb_array_elements(app_private.time_off_impact(w, rid) -> 'shifts') x loop
    insert into public.time_off_assignment_releases(workspace_id, request_id, decision_revision, published_shift_id, before_assignment, actor_user_id)
    values (w, rid, decision, (s ->> 'id')::uuid, s, who);
    update public.schedule_published_shifts set employee_id = null where workspace_id = w and id = (s ->> 'id')::uuid and employee_id = person;
    if not found then raise exception 'A published shift changed before it could be opened; try again' using errcode = 'PT409', hint = 'time_off.changed'; end if;
    changes := changes || jsonb_build_array(s || jsonb_build_object('new_employee_id', null));
  end loop;
  if jsonb_array_length(changes) > 0 then
    perform public.shift_exchange_reconcile_batch(who, w, changes);
    for other in select c.id from public.shift_exchange_cases c where c.workspace_id = w and c.status = 'open'
     and exists (select 1 from jsonb_array_elements(changes) x where (x ->> 'source_id')::uuid in (c.offered_source_id, c.requested_source_id)) loop
      update public.shift_exchange_cases set status = 'invalidated', revision = revision + 1, updated_at = now() where id = other.id;
      update public.shift_exchange_applications set status = 'invalidated', updated_at = now() where case_id = other.id and status in ('invited', 'pending_manager');
      perform public.shift_exchange_emit(who, w, other.id, null, 'invalidated', 'An involved assignment was released with approved time off. Review the current schedule.');
    end loop;
    perform realtime.send(jsonb_build_object('workspace_id', w, 'request_id', rid), 'changed', 'shift-exchanges:' || w::text, true);
  end if;
  return changes;
end;
$function$;

-- The sweep keeps its decisions: a request past its deadline is declined, a stale vote is let go,
-- a request every deciding location approved is approved. The "tell an admin" and twelve-hour
-- reminder steps only sent notices, and go with them (their marks, fallback_notified_at and
-- reminded_at, are no longer written here).
create or replace function app_private.time_off_sweep(pass_limit integer default 500)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  r record;
  st jsonb;
  v jsonb;
  done integer := 0;
begin
  -- ponytail: every workspace lock is held to the end of the pass (BL-506), and
  -- the second loop always takes the earliest deadlines of every workspace, so
  -- request 501 waits behind 500 with nothing due. Fix both together: commit per
  -- request in a procedure and take loop two in a fair turn.
  -- Not decided in time: the system declines it.
  for r in select q.id, q.workspace_id from public.schedule_time_off_requests q
    where q.status = 'pending' and q.decide_by is not null and q.decide_by <= now()
    order by q.decide_by, q.id limit pass_limit loop
    -- Each request on its own: one that fails is rolled back alone and named,
    -- the rest of the pass and every other workspace go on.
    begin
      perform public.availability_lock_workspace(r.workspace_id);
      -- Read again under the lock: a withdrawal or a last vote may have closed it.
      if exists (select 1 from public.schedule_time_off_requests q where q.id = r.id and q.status = 'pending' and q.decide_by <= now()) then
        perform app_private.time_off_finalize(r.workspace_id, r.id, 'deny', null, 'Not decided in time', false, true);
        done := done + 1;
      end if;
    exception when others then
      insert into app_private.time_off_sweep_failures (request_id, workspace_id, sqlstate, message)
      values (r.id, r.workspace_id, sqlstate, sqlerrm)
      on conflict (request_id) do update set last_failed_at = now(), attempts = app_private.time_off_sweep_failures.attempts + 1,
        sqlstate = excluded.sqlstate, message = excluded.message;
      raise warning 'time-off-deadlines: request % of workspace % failed: % %', r.id, r.workspace_id, sqlstate, sqlerrm;
    end;
  end loop;

  for r in select q.* from public.schedule_time_off_requests q
    where q.status = 'pending' and q.decide_by > now()
    order by q.decide_by, q.id limit pass_limit loop
    begin
    perform public.availability_lock_workspace(r.workspace_id);
    -- Read again under the lock: a withdrawal or a last vote may have closed it.
    select q.* into r from public.schedule_time_off_requests q where q.id = r.id;
    if r.status <> 'pending' or r.decide_by <= now() then
      continue;
    end if;
    st := app_private.time_off_state(r.workspace_id, r.id);

    -- A vote on shifts that changed is let go; its manager looks again.
    for v in select x from jsonb_array_elements(st -> 'votes') x where (x ->> 'stale')::boolean loop
      delete from public.time_off_votes where request_id = r.id and voter_user_id = (v ->> 'voter')::uuid;
      done := done + 1;
    end loop;

    -- Every location still deciding has approved (another dropped out, KARARLAR
    -- "İzin" 2026-09-30): the request is settled, by the system.
    if (st ->> 'remaining')::integer = 0 and not (st ->> 'fallback')::boolean then
      perform app_private.time_off_finalize(r.workspace_id, r.id, 'approve', null, 'All deciding locations approved', false);
      done := done + 1;
      continue;
    end if;
    exception when others then
      insert into app_private.time_off_sweep_failures (request_id, workspace_id, sqlstate, message)
      values (r.id, r.workspace_id, sqlstate, sqlerrm)
      on conflict (request_id) do update set last_failed_at = now(), attempts = app_private.time_off_sweep_failures.attempts + 1,
        sqlstate = excluded.sqlstate, message = excluded.message;
      raise warning 'time-off-deadlines: request % of workspace % failed: % %', r.id, r.workspace_id, sqlstate, sqlerrm;
    end;
  end loop;
  return done;
end;
$function$;

-- Shift exchanges -----------------------------------------------------------------------------------

create or replace function public.shift_exchange_emit(actor uuid, w uuid, cid uuid, aid uuid, act text, msg text, private_msg text default ''::text)
 returns void
 language plpgsql
 set search_path to ''
as $function$
begin
 -- The case's history (Shift Hub, Requests): one row per step.
 insert into public.shift_exchange_events(workspace_id,case_id,application_id,actor_user_id,action,message,private_note)
 values(w,cid,aid,actor,act,msg,private_msg);
end; $function$;

-- The event this call just wrote is found without the notification sequence: it is the case's
-- newest row of that action, its own (no application), and nothing has filled its details yet.
-- A second change in the same transaction (same created_at) finds its own row by that last part.
create or replace function public.refresh_weekly_exchange_terms(w uuid, cid uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare c public.shift_exchange_cases%rowtype; s jsonb; t jsonb; fp text; deadline timestamptz;
 event_action text; message text; prior_details jsonb; given_up jsonb; dropped uuid[]:='{}'; ended uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(w::text,921));
 select * into c from public.shift_exchange_cases where workspace_id=w and id=cid for update;
 -- Expired, invalidated and completed requests must never be revived.
 if c.id is null or c.status<>'open' or c.expires_at<=clock_timestamp() then return; end if;
 s:=public.shift_exchange_shift(w,c.offered_source_id); t:=public.shift_exchange_shift(w,c.requested_source_id);
 if not public.weekly_exchange_same_responsibility(c.offered_snapshot,s)
  or not public.weekly_exchange_same_responsibility(c.requested_snapshot,t) then return; end if;
 if public.shift_exchange_terms(c.offered_snapshot)=public.shift_exchange_terms(s)
  and public.shift_exchange_terms(c.requested_snapshot)=public.shift_exchange_terms(t) then return; end if;
 fp:=public.shift_exchange_fingerprint(w,s,t);
 if fp=c.consent_fingerprint then return; end if;
 deadline:=coalesce(least((s->>'starts_at')::timestamptz,(t->>'starts_at')::timestamptz),c.expires_at);
 event_action:=case when deadline<=clock_timestamp() then 'expired' else 'terms_changed' end;
 if event_action='terms_changed' then
  given_up:=to_jsonb(array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null));
  if c.kind='swap' and t is not null and app_private.eligibility(w,c.owner_id,t,
   jsonb_build_object('operation','swap','excluded',given_up))->'blockers' @> '[{"code":"time_overlap"}]' then
   event_action:='invalidated';
  else
   select coalesce(array_agg(a.id order by a.id),'{}') into dropped from public.shift_exchange_applications a
    where a.case_id=cid and a.workspace_id=w and a.status='pending_manager'
     and app_private.eligibility(w,a.employee_id,s,jsonb_build_object('operation',
      case when c.kind in ('swap','open_pickup') then c.kind when c.audience='direct' then 'cover_accept' else 'release_pickup' end,
      'excluded',given_up))->'blockers' @> '[{"code":"time_overlap"}]';
   if c.audience='direct' and cardinality(dropped)>0 then event_action:='invalidated'; dropped:='{}'; end if;
  end if;
 end if;
 prior_details:=jsonb_build_object('before',jsonb_build_object('offered',c.offered_snapshot,'requested',c.requested_snapshot,
  'consent_fingerprint',c.consent_fingerprint,'revision',c.revision),
  'after',jsonb_build_object('offered',s,'requested',t,'consent_fingerprint',fp,'revision',c.revision+1),
  'acceptance_retained',event_action='terms_changed','acceptances_ended',to_jsonb(dropped),'cause','published_assignment_changed');
 update public.shift_exchange_cases set offered_snapshot=s,requested_snapshot=t,consent_fingerprint=fp,
  expires_at=deadline,status=case when event_action in ('expired','invalidated') then event_action else status end,
  revision=revision+1,updated_at=now() where id=cid;
 update public.shift_exchange_applications set consent_fingerprint=fp,
  status=case when event_action in ('expired','invalidated') then event_action when id=any(dropped) then 'invalidated' else status end,updated_at=now()
  where case_id=cid and workspace_id=w and status in ('invited','pending_manager');
 -- Employee consent survives; a manager's old scoped review does not.
 delete from public.shift_exchange_votes where workspace_id=w and case_id=cid;
 message:=case when event_action='expired' then
  'The updated shift has already started. This request closed without a transfer. Check your current schedule.'
 when event_action='invalidated' then
  'The new shift hours overlap another shift. This request ended without a transfer. Start a new request from the current schedule.'
 else format('Shift details changed: %s, %s, %s-%s (%s).%s Existing acceptances remain valid; pending invitations still need a response. Final manager approval is required.',
  s->>'location_name',s->>'date',s->>'start_time',s->>'end_time',coalesce(s->>'time_timezone',s->>'timezone'),
  case when t is null then '' else format(' Swap shift: %s, %s, %s-%s (%s).',t->>'location_name',t->>'date',t->>'start_time',t->>'end_time',coalesce(t->>'time_timezone',t->>'timezone')) end) end;
 perform public.shift_exchange_emit(null,w,cid,null,event_action,message);
 -- emit is synchronous under the workspace lock; its newest event is ours.
 update public.shift_exchange_events set details=prior_details where id=(select id from public.shift_exchange_events
  where workspace_id=w and case_id=cid and action=event_action and application_id is null and details='{}'::jsonb
  order by created_at desc, id desc limit 1);
 foreach ended in array dropped loop
  perform public.shift_exchange_emit(null,w,cid,ended,'invalidated',
   'The new shift hours overlap another shift of the teammate who accepted. That acceptance ended; no assignment changed.');
 end loop;
 perform realtime.send(jsonb_build_object('workspace_id',w,'case_id',cid,'revision',c.revision+1),
  'changed','shift-exchanges:'||w::text,true);
end; $function$;

-- People ------------------------------------------------------------------------------------------

create or replace function public.terminate_employee_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid, effective_local timestamp without time zone, worksite_timezone text, termination_reason text, target_idempotency_key uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  employee public.employee_profiles%rowtype;
  member public.workspace_memberships%rowtype;
  existing_termination public.employee_terminations%rowtype;
  v_termination_id uuid;
  resolved_effective_at timestamptz;
  released_count integer := 0;
  response jsonb;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.terminate', target_person => target_employee_id);
  perform public.availability_lock_workspace(target_workspace_id);
  if effective_local is null or target_idempotency_key is null then
    raise exception 'effective time and idempotency key are required' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(termination_reason, ''))) not between 3 and 240 then
    raise exception 'termination reason must be between 3 and 240 characters' using errcode = '22023';
  end if;
  if not app_private.timezone_name_valid(worksite_timezone) then
    raise exception 'invalid worksite timezone' using errcode = '22023';
  end if;

  resolved_effective_at := effective_local at time zone worksite_timezone;
  if resolved_effective_at > now() + interval '5 minutes' then
    raise exception 'future termination requires a scheduled offboarding workflow' using errcode = '22023';
  end if;

  select candidate.* into existing_termination
  from public.employee_terminations candidate
  where candidate.workspace_id = target_workspace_id
    and candidate.actor_user_id = terminate_employee_service.actor_user_id
    and candidate.idempotency_key = target_idempotency_key
  for update;
  if found then
    if existing_termination.employee_id <> target_employee_id
      or existing_termination.effective_at <> resolved_effective_at
      or existing_termination.worksite_timezone <> worksite_timezone
      or existing_termination.reason <> btrim(termination_reason) then
      raise exception 'idempotency key payload conflict' using errcode = '23505';
    end if;
    return existing_termination.result || jsonb_build_object('idempotent_replay', true);
  end if;

  select candidate.* into employee
  from public.employee_profiles candidate
  where candidate.id = target_employee_id
    and candidate.workspace_id = target_workspace_id
    and candidate.archived_at is null
  for update;
  if not found then
    raise exception 'active employee not found' using errcode = 'P0002';
  end if;
  -- The time zone is one of the places they work; somebody with no location
  -- left (S1) has nothing to match, and any valid one is taken.
  if exists (
      select 1 from public.employee_location_assignments assignment
      where assignment.employee_id = target_employee_id and assignment.ended_at is null
    )
    and not exists (
      select 1
      from public.employee_location_assignments assignment
      join public.locations location
        on location.id = assignment.location_id
       and location.workspace_id = assignment.workspace_id
      where assignment.workspace_id = target_workspace_id
        and assignment.employee_id = target_employee_id
        and assignment.ended_at is null
        and location.timezone = worksite_timezone
    ) then
    raise exception 'worksite timezone must match an active employee location' using errcode = '22023';
  end if;

  select candidate.* into member
  from public.workspace_memberships candidate
  where candidate.workspace_id = target_workspace_id
    and candidate.user_id = employee.user_id
  for update;

  insert into public.employee_terminations (
    workspace_id, employee_id, actor_user_id, effective_at, worksite_timezone,
    reason, idempotency_key
  ) values (
    target_workspace_id, target_employee_id, actor_user_id, resolved_effective_at,
    worksite_timezone, btrim(termination_reason), target_idempotency_key
  ) returning id into v_termination_id;

  if member.id is not null and member.status in ('active', 'pending_activation') then
    insert into public.employee_access_snapshots (workspace_id, employee_id, membership_id, role_id, captured_by)
    values (target_workspace_id, target_employee_id, member.id, member.role_id, actor_user_id);
    update public.workspace_memberships
    set status = 'suspended', updated_at = now()
    where id = member.id;
  end if;

  update public.employee_invitations
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where workspace_id = target_workspace_id
    and employee_id = target_employee_id
    and status = 'pending';

  insert into public.employee_offboarding_shift_actions (
    workspace_id, termination_id, shift_id, location_id,
    previous_employee_id, shift_start_at
  )
  select shift.workspace_id, v_termination_id, shift.id, shift.location_id,
    shift.employee_id,
    (shift.scheduled_date + shift.start_time) at time zone location.timezone
  from public.schedule_published_shifts shift
  join public.schedule_location_publications publication
    on publication.id = shift.publication_id
   and publication.workspace_id = shift.workspace_id
   and publication.location_id = shift.location_id
   and publication.status = 'current'
  join public.locations location
    on location.id = shift.location_id
   and location.workspace_id = shift.workspace_id
  where shift.workspace_id = target_workspace_id
    and shift.employee_id = target_employee_id
    and (shift.scheduled_date + shift.start_time) at time zone location.timezone >= greatest(resolved_effective_at, now());

  get diagnostics released_count = row_count;

  update public.schedule_published_shifts shift
  set employee_id = null
  from public.employee_offboarding_shift_actions action
  where action.termination_id = v_termination_id
    and action.shift_id = shift.id
    and action.workspace_id = shift.workspace_id;

  update public.employee_profiles
  set archived_at = resolved_effective_at, archived_by = actor_user_id,
    revision = revision + 1, updated_at = now()
  where id = target_employee_id;

  insert into public.employee_events (
    workspace_id, employee_id, actor_user_id, action, summary, occurred_at
  ) values (
    target_workspace_id, target_employee_id, actor_user_id, 'employee.terminated',
    format('Employee terminated; %s published shift(s) released', released_count),
    resolved_effective_at
  );

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata, occurred_at
  ) values (
    target_workspace_id, actor_user_id, 'employee.terminated', 'employee', target_employee_id::text,
    jsonb_build_object(
      'termination_id', v_termination_id,
      'effective_at', resolved_effective_at,
      'worksite_timezone', worksite_timezone,
      'released_shift_count', released_count
    ),
    resolved_effective_at
  );

  response := jsonb_build_object(
    'termination_id', v_termination_id,
    'effective_at', resolved_effective_at,
    'worksite_timezone', worksite_timezone,
    'released_shift_count', released_count,
    'idempotent_replay', false
  );
  update public.employee_terminations
  set released_shift_count = released_count, result = response
  where id = v_termination_id;
  return response;
end;
$function$;

create or replace function public.request_employee_preferred_name_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid, preferred_name text)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  employee_row public.employee_profiles%rowtype;
  approval text;
  cleaned text := btrim(coalesce(preferred_name, ''));
  deciders uuid[];
begin
  -- Only on one's own record; somebody else's and an unknown one get the same
  -- answer (authz.out_of_scope).
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.request_preferred_name',
    target_person => target_employee_id);
  select * into employee_row
  from public.employee_profiles
  where id = target_employee_id
    and workspace_id = target_workspace_id
    and archived_at is null;

  if employee_row.id is null then
    raise exception 'employee not found'
      using errcode = 'P0002', hint = 'employee.not_found';
  end if;
  if char_length(cleaned) > 80 then
    raise exception 'a preferred name is at most 80 characters'
      using errcode = '22023', hint = 'employee.preferred_name.too_long';
  end if;

  -- Clearing it is always the person's own business; there is nothing for a
  -- manager to answer about a name that will not be shown.
  if cleaned = '' then
    update public.employee_preferred_name_requests
    set status = 'rejected', decided_by = actor_user_id, decided_at = now()
    where employee_id = target_employee_id and status = 'pending';
    update public.employee_profiles set preferred_name = '', updated_at = now()
    where id = target_employee_id;
    return 'cleared';
  end if;

  approval := coalesce(
    (select preferred_name_approval from public.employee_name_settings
     where workspace_id = target_workspace_id),
    'auto'
  );

  -- Whoever the core lets decide this person's preferred name.
  -- ponytail: one core call per active member; a workspace is tens of people.
  select coalesce(array_agg(member.user_id order by member.user_id), '{}')
  into deciders
  from public.workspace_memberships member
  where member.workspace_id = target_workspace_id
    and member.status = 'active'
    and app_private.authz_reason(member.user_id, target_workspace_id,
      'employee.decide_preferred_name', null, target_employee_id) is null;

  -- Nobody ranks above the owner: with nobody to answer it, a request does
  -- not wait (KK-17).
  if cardinality(deciders) = 0 then
    approval := 'auto';
  end if;

  -- Whatever was waiting is replaced: the latest answer is the one asked for.
  update public.employee_preferred_name_requests
  set status = 'rejected', decided_by = actor_user_id, decided_at = now()
  where employee_id = target_employee_id and status = 'pending';

  insert into public.employee_preferred_name_requests (
    workspace_id, employee_id, requested_name, status, requested_by,
    decided_by, decided_at
  )
  values (
    target_workspace_id, target_employee_id, cleaned,
    case when approval = 'auto' then 'approved' else 'pending' end,
    actor_user_id,
    case when approval = 'auto' then actor_user_id end,
    case when approval = 'auto' then now() end
  );

  if approval = 'auto' then
    update public.employee_profiles
    set preferred_name = cleaned, updated_at = now()
    where id = target_employee_id;
  end if;

  return case when approval = 'auto' then 'published' else 'waiting' end;
end;
$function$;

create or replace function public.decide_employee_preferred_name_service(actor_user_id uuid, target_workspace_id uuid, target_request_id uuid, approve boolean)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  request_row public.employee_preferred_name_requests%rowtype;
  asker uuid;
begin
  select request.employee_id into asker
  from public.employee_preferred_name_requests request
  where request.id = target_request_id
    and request.workspace_id = target_workspace_id;
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.decide_preferred_name', target_person => asker);

  select * into request_row
  from public.employee_preferred_name_requests
  where id = target_request_id
    and workspace_id = target_workspace_id
    and status = 'pending'
  for update;

  if request_row.id is null then
    raise exception 'that request is no longer waiting for an answer'
      using errcode = 'P0002', hint = 'employee.preferred_name.not_pending';
  end if;

  update public.employee_preferred_name_requests
  set status = case when approve then 'approved' else 'rejected' end,
      decided_by = actor_user_id,
      decided_at = now()
  where id = request_row.id;

  if approve then
    update public.employee_profiles
    set preferred_name = request_row.requested_name, updated_at = now()
    where id = request_row.employee_id
      and workspace_id = target_workspace_id;
  end if;
end;
$function$;

create or replace function public.remove_employee_from_location_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid, target_location_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  assignment public.employee_location_assignments%rowtype;
  employee public.employee_profiles%rowtype;
  released uuid[];
  locations_left integer;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.remove_from_location',
    array[target_location_id], target_employee_id);

  select * into assignment
  from public.employee_location_assignments candidate
  where candidate.workspace_id = target_workspace_id
    and candidate.employee_id = target_employee_id
    and candidate.location_id = target_location_id
    and candidate.ended_at is null
  for update;
  -- Not working there is answered as a target out of reach: the refusal does
  -- not tell what the record holds.
  if assignment.id is null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope',
      detail = 'employee.remove_from_location';
  end if;

  select * into employee from public.employee_profiles where id = target_employee_id for update;

  update public.employee_location_assignments set ended_at = now(), is_primary = false
  where id = assignment.id;
  -- Another location they still work at becomes the primary one.
  if assignment.is_primary then
    update public.employee_location_assignments set is_primary = true
    where id = (
      select other.id from public.employee_location_assignments other
      where other.employee_id = target_employee_id and other.ended_at is null
      order by other.assigned_at, other.id
      limit 1
    );
  end if;

  -- K4: a manager's last location is not taken; the record of anybody else
  -- stays, with no location if this was the only one.
  perform app_private.keep_manager_at_a_location(target_workspace_id, target_employee_id);

  -- Their published shifts there from now on are left open, as when
  -- employment ends; their shifts elsewhere stay.
  with open_up as (
    update public.schedule_published_shifts shift
    set employee_id = null
    from public.schedule_location_publications publication, public.locations location
    where publication.id = shift.publication_id
      and publication.workspace_id = shift.workspace_id
      and publication.location_id = shift.location_id
      and publication.status = 'current'
      and location.id = shift.location_id
      and location.workspace_id = shift.workspace_id
      and shift.workspace_id = target_workspace_id
      and shift.employee_id = target_employee_id
      and shift.location_id = target_location_id
      and (shift.scheduled_date + shift.start_time) at time zone location.timezone >= now()
    returning shift.id
  )
  select coalesce(array_agg(id), '{}') into released from open_up;

  update public.employee_profiles
  set revision = revision + 1, updated_at = now()
  where id = target_employee_id;

  select count(*) into locations_left
  from public.employee_location_assignments other
  where other.employee_id = target_employee_id and other.ended_at is null;

  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary, occurred_at)
  values (target_workspace_id, target_employee_id, actor_user_id, 'employee.location_removed',
    format('Removed from a location; %s published shift(s) left open', cardinality(released)), now());

  insert into public.audit_events (workspace_id, actor_user_id, action, target_type, target_id, metadata)
  values (target_workspace_id, actor_user_id, 'employee.location_removed', 'employee', target_employee_id::text,
    jsonb_build_object('location_id', target_location_id, 'released_shift_ids', to_jsonb(released),
      'locations_left', locations_left));

  -- No location left: whoever may end their employment or give them another
  -- location decides (the owner and admins; S1). The record stays.
  return jsonb_build_object(
    'employee_id', target_employee_id,
    'location_id', target_location_id,
    'released_shift_count', cardinality(released),
    'locations_left', locations_left
  );
end;
$function$;

-- Account deletion still cancels every invitation waiting for this address.
create or replace function public.request_account_deletion_v2_service(actor_user_id uuid, recovery_token_digest text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  actor_email text;
  blockers jsonb;
  existing_request public.account_deletion_requests%rowtype;
  created_request public.account_deletion_requests%rowtype;
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;
  if recovery_token_digest is null
    or recovery_token_digest !~ '^[a-f0-9]{64}$' then
    raise exception 'valid recovery token digest required' using errcode = '22023';
  end if;

  select lower(btrim(auth_user.email)) into actor_email
  from auth.users auth_user
  where auth_user.id = actor_user_id;
  if actor_email is null then
    raise exception 'account not found' using errcode = 'P0002';
  end if;

  blockers := public.get_account_deletion_blockers_service(actor_user_id);
  if jsonb_array_length(blockers) > 0 then
    raise exception 'account deletion blocked: %', blockers::text
      using errcode = '23514';
  end if;

  select * into existing_request
  from public.account_deletion_requests request
  where request.user_id = actor_user_id
    and request.status = 'pending'
  order by request.requested_at desc
  limit 1
  for update;

  if existing_request.id is not null then
    update public.account_deletion_requests
    set recovery_token_digest = request_account_deletion_v2_service.recovery_token_digest,
        recovery_token_rotated_at = now(),
        updated_at = now()
    where id = existing_request.id
    returning * into existing_request;

    return jsonb_build_object(
      'status', existing_request.status,
      'request_id', existing_request.id,
      'email', actor_email,
      'restore_until', existing_request.restore_until
    );
  end if;

  update public.employee_invitations invitation
  set status = 'revoked'::public.employee_invitation_status,
      revoked_at = now(),
      updated_at = now()
  where invitation.email = actor_email
    and invitation.status = 'pending'::public.employee_invitation_status;

  insert into public.account_deletion_requests (
    user_id, typed_email, acknowledged, recovery_token_digest,
    recovery_token_rotated_at
  ) values (
    actor_user_id, actor_email, true, recovery_token_digest, now()
  )
  returning * into created_request;

  perform app_private.record_security_audit_event_service(
    actor_user_id, null, 'account.deletion_requested', 'account.security',
    'account_deletion_request', created_request.id::text,
    jsonb_build_object('restore_until', created_request.restore_until)
  );

  return jsonb_build_object(
    'status', created_request.status,
    'request_id', created_request.id,
    'email', actor_email,
    'restore_until', created_request.restore_until
  );
end;
$function$;

-- Availability --------------------------------------------------------------------------------------

create or replace function public.weekly_preferences_save_service(actor uuid, w uuid, command jsonb, request_key uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare emp uuid:=(command->>'employee_id')::uuid; source text:=command->>'source'; model jsonb; prior jsonb; preference jsonb;
 old_command public.weekly_preference_commands%rowtype; event uuid:=gen_random_uuid(); result jsonb:='{}';
 summary text; changed_days text;
begin
 if request_key is null then raise exception 'Idempotency key required' using errcode='22023'; end if;
 perform public.availability_lock_workspace(w);
 -- Authorize again before idempotent replay; never return a stored private read model.
 model:=public.weekly_preferences_read_service(actor,w,emp);
 perform app_private.weekly_preference_may_write(actor,w,source,model);
 select * into old_command from public.weekly_preference_commands q where q.workspace_id=w and q.actor_user_id=actor and q.request_key=weekly_preferences_save_service.request_key;
 if old_command.request_key is not null then
  if old_command.command<>command then raise exception 'Idempotency key was used for another save' using errcode='22023'; end if;
  return old_command.result||jsonb_build_object('model',model);
 end if;
 model:=public.validate_weekly_preference_command(actor,w,command); prior:=model->source;
 emp:=(model->>'employee_id')::uuid;
 -- A pending swap, cover or pickup is never asked about and never changed:
 -- the employee withdraws one in Shift Hub if they want to (M5).
 preference:=app_private.weekly_preference_whole_days(w,command->'preference');
 insert into public.weekly_preference_events(id,workspace_id,employee_id,source,actor_user_id,before_record,after_record)
  values(event,w,emp,source,actor,prior,'{}');
 if source='employee' then
  insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by)
   values(w,emp,preference,1,actor) on conflict(workspace_id,employee_id) do update set preference=excluded.preference,revision=employee_weekly_preferences.revision+1,updated_by=actor,updated_at=now();
  update public.employee_onboarding_requirements set status='completed',completed_at=now(),rejection_reason=null,updated_at=now() where workspace_id=w and employee_id=emp and kind='availability';
  update public.employee_onboarding_cases set revision=revision+1,updated_at=now() where workspace_id=w and employee_id=emp;
 else
  insert into public.manager_weekly_reminders(workspace_id,employee_id,preference,enabled,notes,revision,updated_by)
   values(w,emp,preference,(command->>'enabled')::boolean,array(select jsonb_array_elements_text(command->'notes')),1,actor)
   on conflict(workspace_id,employee_id) do update set preference=excluded.preference,enabled=excluded.enabled,notes=excluded.notes,revision=manager_weekly_reminders.revision+1,updated_by=actor,updated_at=now();
 end if;
 model:=public.weekly_preferences_read_service(actor,w,emp);
 update public.weekly_preference_events set after_record=model->(command->>'source') where id=event;
 select string_agg((array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[(d->>'day')::integer+1],', ' order by (d->>'day')::integer) into changed_days
 from jsonb_array_elements(preference->'days') d
 where d is distinct from (select value from jsonb_array_elements(prior->'preference'->'days') where value->'day'=d->'day');
 summary:=case when source='manager' then 'Manager reminders updated.' else 'Weekly availability updated. '||case when changed_days is null then 'Week confirmed.' else 'Changed days: '||changed_days||'.' end end;
 insert into public.employee_events(workspace_id,employee_id,actor_user_id,action,summary) values(w,emp,actor,case when source='manager' then 'manager_reminders_updated' else 'weekly_availability_updated' end,summary);
 insert into public.weekly_preference_commands(workspace_id,actor_user_id,request_key,command,result) values(w,actor,request_key,command,result);
 return result||jsonb_build_object('model',model);
end; $function$;

create or replace function public.weekly_preference_settings_save_service(actor uuid, w uuid, command jsonb, request_key uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare model jsonb; prior jsonb; stored public.weekly_preference_commands%rowtype;
 envelope jsonb:=jsonb_build_object('kind','settings','value',command);
begin
 perform public.availability_lock_workspace(w);
 perform app_private.authorize(actor,w,'settings.availability.write');
 model:=public.weekly_preference_settings_read_service(actor,w);
 if request_key is null then raise exception 'A save key is required' using errcode='22023'; end if;
 select * into stored from public.weekly_preference_commands q where q.workspace_id=w and q.actor_user_id=actor and q.request_key=weekly_preference_settings_save_service.request_key;
 if found then
  if stored.command<>envelope then raise exception 'Idempotency key was used for another save' using errcode='22023'; end if;
  return model;
 end if;
 if jsonb_typeof(command) is distinct from 'object' or command->>'input_mode' is null or command->>'input_mode' not in ('time_range','shift_type')
  or jsonb_typeof(command->'onboarding_required') is distinct from 'boolean'
  or jsonb_typeof(command->'expected_revision') is distinct from 'number' or (command->>'expected_revision') !~ '^[0-9]+$' then
  raise exception 'Choose valid availability settings' using errcode='22023'; end if;
 perform 1 from public.workspace_scheduling_settings where workspace_id=w for update;
 model:=public.weekly_preference_settings_read_service(actor,w); prior:=model->'settings';
 if (command->>'expected_revision')::integer is distinct from (prior->>'revision')::integer then
  raise exception 'Availability settings changed. Reload the latest settings before saving.' using errcode = 'PT409',hint='availability.changed'; end if;
 if command->>'input_mode'='shift_type' and jsonb_array_length(model->'missing_shift_types')>0 then
  raise exception 'Complete default hours for all active shift types before using shift type availability' using errcode='22023',detail=(model->'missing_shift_types')::text; end if;
 if (command-'expected_revision') is distinct from (prior-'revision') then
  update public.workspace_scheduling_settings set availability_input_mode=command->>'input_mode',
   availability_onboarding_required=(command->>'onboarding_required')::boolean,updated_at=now() where workspace_id=w;
  model:=public.weekly_preference_settings_read_service(actor,w);
  insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata)
   values(w,actor,'availability.settings_updated','scheduling_settings',w::text,jsonb_build_object('before',prior,'after',model->'settings'));
  if prior->>'input_mode' is distinct from command->>'input_mode' then
   -- Every saved week and manager note is converted to the new way of entering it (M4, D4).
   with history as (
    insert into public.weekly_preference_events(workspace_id,employee_id,source,actor_user_id,before_record,after_record)
    select w,p.employee_id,'employee',actor,jsonb_build_object('revision',p.revision,'preference',p.preference),
     jsonb_build_object('revision',p.revision+1,'preference',public.weekly_preference_convert(w,p.preference,command->>'input_mode'))
    from public.employee_weekly_preferences p where p.workspace_id=w and p.preference->>'input_mode'<>command->>'input_mode'
    returning employee_id,after_record)
   update public.employee_weekly_preferences p set preference=h.after_record->'preference',revision=p.revision+1,updated_by=actor,updated_at=now()
    from history h where p.workspace_id=w and p.employee_id=h.employee_id;
   with history as (
    insert into public.weekly_preference_events(workspace_id,employee_id,source,actor_user_id,before_record,after_record)
    select w,p.employee_id,'manager',actor,jsonb_build_object('revision',p.revision,'preference',p.preference),
     jsonb_build_object('revision',p.revision+1,'preference',public.weekly_preference_convert(w,p.preference,command->>'input_mode'))
    from public.manager_weekly_reminders p where p.workspace_id=w and p.preference->>'input_mode'<>command->>'input_mode'
    returning employee_id,after_record)
   update public.manager_weekly_reminders p set preference=h.after_record->'preference',revision=p.revision+1,updated_by=actor,updated_at=now()
    from history h where p.workspace_id=w and p.employee_id=h.employee_id;
  end if;
 end if;
 insert into public.weekly_preference_commands(workspace_id,actor_user_id,request_key,command,result) values(w,actor,request_key,envelope,'{}');
 return model;
end; $function$;

-- Documents -----------------------------------------------------------------------------------------

-- The to-do list is all this sync does now.
create or replace function public.sync_expiring_document_todos_service(target_workspace_id uuid default null::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  inserted_count integer := 0;
  resolved_count integer := 0;
begin
  with latest_documents as (
    select distinct on (document.workspace_id, document.requirement_id)
      document.*
    from public.employee_documents document
    where document.review_status <> 'superseded'::public.employee_document_review_status
      and (target_workspace_id is null or document.workspace_id = target_workspace_id)
    order by document.workspace_id, document.requirement_id, document.version_number desc
  ),
  eligible as (
    select
      document.workspace_id,
      document.id as document_id,
      document.employee_id,
      document.requirement_id,
      document.expiry_date,
      requirement.title as document_title,
      employee.first_name,
      employee.last_name,
      type.expiry_schedule_impact
    from latest_documents document
    join public.workspaces workspace
      on workspace.id = document.workspace_id
     and app_private.workspace_allows_interactive_access(workspace.id)
    join public.employee_onboarding_requirements requirement
      on requirement.id = document.requirement_id
     and requirement.workspace_id = document.workspace_id
     and requirement.kind = 'document'::public.employee_onboarding_requirement_kind
     and requirement.status <> 'superseded'::public.employee_onboarding_requirement_status
    join public.document_types type
      on type.id = requirement.source_id
     and type.workspace_id = document.workspace_id
     and type.archived_at is null
     and type.tracks_expiry
    join public.employee_profiles employee
      on employee.id = document.employee_id
     and employee.workspace_id = document.workspace_id
     and employee.archived_at is null
    where document.review_status = 'accepted'::public.employee_document_review_status
      and document.expiry_date is not null
      and document.expiry_date <= current_date + type.expiry_warning_days
  )
  insert into public.workspace_todos (
    workspace_id,
    title,
    body,
    severity,
    status,
    system_generated,
    source_type,
    source_id,
    source_key,
    employee_id,
    due_at,
    action_url,
    resolved_at
  )
  select
    eligible.workspace_id,
    case
      when eligible.expiry_date < current_date then 'Expired employee document'
      else 'Employee document expires soon'
    end,
    btrim(eligible.first_name || ' ' || eligible.last_name) || ' - ' || eligible.document_title,
    case
      when eligible.expiry_date < current_date then 'action_required'::public.workspace_todo_severity
      else 'warning'::public.workspace_todo_severity
    end,
    'open'::public.workspace_todo_status,
    true,
    'employee_document_expiry',
    eligible.document_id,
    'requirement:' || eligible.requirement_id::text,
    eligible.employee_id,
    eligible.expiry_date::timestamptz,
    '/app/employees',
    null
  from eligible
  on conflict (workspace_id, source_type, source_id, source_key)
  do update set
    title = excluded.title,
    body = excluded.body,
    severity = excluded.severity,
    status = 'open'::public.workspace_todo_status,
    employee_id = excluded.employee_id,
    due_at = excluded.due_at,
    action_url = excluded.action_url,
    resolved_at = null,
    updated_at = now()
  where public.workspace_todos.status <> 'open'::public.workspace_todo_status
     or public.workspace_todos.title <> excluded.title
     or public.workspace_todos.body <> excluded.body
     or public.workspace_todos.severity <> excluded.severity
     or public.workspace_todos.employee_id is distinct from excluded.employee_id
     or public.workspace_todos.due_at is distinct from excluded.due_at
     or public.workspace_todos.action_url is distinct from excluded.action_url;
  get diagnostics inserted_count = row_count;

  with latest_documents as (
    select distinct on (document.workspace_id, document.requirement_id)
      document.*
    from public.employee_documents document
    where document.review_status <> 'superseded'::public.employee_document_review_status
      and (target_workspace_id is null or document.workspace_id = target_workspace_id)
    order by document.workspace_id, document.requirement_id, document.version_number desc
  ),
  eligible as (
    select document.workspace_id, document.id as document_id, document.requirement_id
    from latest_documents document
    join public.workspaces workspace
      on workspace.id = document.workspace_id
     and app_private.workspace_allows_interactive_access(workspace.id)
    join public.employee_onboarding_requirements requirement
      on requirement.id = document.requirement_id
     and requirement.workspace_id = document.workspace_id
     and requirement.kind = 'document'::public.employee_onboarding_requirement_kind
     and requirement.status <> 'superseded'::public.employee_onboarding_requirement_status
    join public.document_types type
      on type.id = requirement.source_id
     and type.workspace_id = document.workspace_id
     and type.archived_at is null
     and type.tracks_expiry
    join public.employee_profiles employee
      on employee.id = document.employee_id
     and employee.workspace_id = document.workspace_id
     and employee.archived_at is null
    where document.review_status = 'accepted'::public.employee_document_review_status
      and document.expiry_date is not null
      and document.expiry_date <= current_date + type.expiry_warning_days
  )
  update public.workspace_todos todo
  set status = 'resolved'::public.workspace_todo_status,
      resolved_at = now(),
      updated_at = now()
  where todo.source_type = 'employee_document_expiry'
    and todo.system_generated
    and todo.status = 'open'::public.workspace_todo_status
    and (target_workspace_id is null or todo.workspace_id = target_workspace_id)
    and not exists (
      select 1
      from eligible
      where eligible.workspace_id = todo.workspace_id
        and eligible.document_id = todo.source_id
        and 'requirement:' || eligible.requirement_id::text = todo.source_key
    );
  get diagnostics resolved_count = row_count;

  return jsonb_build_object(
    'status', 'synced',
    'affected', inserted_count + resolved_count,
    'opened_or_refreshed', inserted_count,
    'resolved', resolved_count
  );
end;
$function$;

-- Document maintenance keeps the restriction (KARARLAR K:87) and its batch queue of cases, oldest
-- checked first; the reminders that ran per case are gone, and with them the "enqueued" count
-- (the API reads it as optional since BILDIRIM-03).
create or replace function public.documents_maintain_service(target_batch_size integer default 100, at_time timestamp with time zone default now())
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare c public.employee_onboarding_cases%rowtype; checked integer:=0; suspended integer;
begin
 if target_batch_size not between 1 and 500 or at_time is null then raise exception 'valid maintenance batch required' using errcode='22023'; end if;
 -- The restriction first, for every case and on its own.
 suspended:=app_private.document_suspend_overdue();
 -- A batch of cases at a time, oldest checked first.
 for c in select oc.* from public.employee_onboarding_cases oc
  join public.employee_profiles p on p.id=oc.employee_id and p.workspace_id=oc.workspace_id and p.archived_at is null
  join public.workspace_memberships m on m.id=oc.membership_id and m.user_id=p.user_id and m.status in ('active','pending_activation')
  where app_private.workspace_allows_interactive_access(oc.workspace_id)
   and exists(select 1 from public.employee_onboarding_requirements q where q.case_id=oc.id and q.kind in ('document','acknowledgement') and q.lifecycle_retired_at is null)
  order by oc.document_notification_checked_at nulls first,oc.id limit target_batch_size for update of oc skip locked loop
  checked:=checked+1;
  update public.employee_onboarding_cases set document_notification_checked_at=at_time where id=c.id;
 end loop;
 return jsonb_build_object('checked',checked,'failed_cases',0,'suspended',suspended);
end;
$function$;

create or replace function public.set_document_publication_service(actor_user_id uuid, target_workspace_id uuid, target_document_type_id uuid, expected_revision integer, expected_publication_revision integer, expected_preview_token text, publish_reason text, target_status text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare d public.document_types%rowtype; preview jsonb; core_preview jsonb; result jsonb; r public.employee_onboarding_requirements%rowtype;
begin
 perform app_private.authorize(actor_user_id,target_workspace_id,'settings.documents.write');
 if target_status is null or target_status not in ('draft','published') or nullif(btrim(publish_reason),'') is null or char_length(publish_reason)>500 then raise exception 'Valid publication status and reason required' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,52001));
 select * into d from public.document_types where id=target_document_type_id and workspace_id=target_workspace_id for update;
 if d.id is null then raise exception 'document type not found' using errcode='P0002'; end if;
 if d.lifecycle_revision is distinct from expected_revision or d.publication_revision is distinct from expected_publication_revision or d.publication_status=target_status then raise exception 'Document publication changed; refresh required' using errcode='PT409',hint='document.changed'; end if;
 -- Assignment mutations use this same tenant advisory lock. Lock cases before requirements, as Submit/review do.
 perform 1 from public.employee_profiles where workspace_id=target_workspace_id order by id for update;
 perform 1 from public.employee_onboarding_cases where workspace_id=target_workspace_id order by id for update;
 perform 1 from public.employee_onboarding_requirements where workspace_id=target_workspace_id and source_id=d.id and kind='document' order by id for update;
 perform 1 from public.departments where workspace_id=target_workspace_id order by id for share;
 perform 1 from public.employee_location_assignments where workspace_id=target_workspace_id order by id for share;
 preview:=public.preview_document_publication_service(actor_user_id,target_workspace_id,d.id);
 if preview->>'preview_token' is distinct from expected_preview_token then raise exception 'Document publication impact changed; refresh preview' using errcode='PT409',hint='document.changed'; end if;
 if target_status='published' then
  update public.document_types set publication_status='published',publication_revision=publication_revision+1,published_at=now() where id=d.id;
  core_preview:=app_private.preview_lifecycle_definition(actor_user_id,target_workspace_id,d.id,'document');
  result:=app_private.apply_lifecycle_definition(actor_user_id,target_workspace_id,d.id,d.lifecycle_revision,core_preview->>'preview_token',publish_reason,'document');
  update public.employee_onboarding_requirements set publication_paused_at=null,lifecycle_revision=lifecycle_revision+1 where workspace_id=target_workspace_id and source_id=d.id and kind='document' and publication_paused_at is not null and (lifecycle_exempt or lifecycle_closed_at is not null or lifecycle_retired_at is not null or lifecycle_assignment_disabled or status='superseded');
  for r in select * from public.employee_onboarding_requirements where workspace_id=target_workspace_id and source_id=d.id and kind='document'
   and owner_excused and lifecycle_retired_at is null and not app_private.employee_record_is_workspace_owner(workspace_id,employee_id) loop
   perform app_private.set_document_exemption(r,actor_user_id,false,'No longer the owner',r.lifecycle_revision);
  end loop;
 else
  update public.document_types set publication_status='draft',publication_revision=publication_revision+1 where id=d.id;
  for r in update public.employee_onboarding_requirements set publication_paused_at=now(),deadline_at=null,document_suspended_at=null,lifecycle_revision=lifecycle_revision+1,updated_at=now()
   where workspace_id=target_workspace_id and source_id=d.id and kind='document' and lifecycle_retired_at is null and lifecycle_closed_at is null and not lifecycle_exempt and not lifecycle_assignment_disabled returning * loop
   perform app_private.document_audit(r,actor_user_id,'document.publication_paused',jsonb_build_object('reason',btrim(publish_reason),'publication_revision',d.publication_revision+1));
  end loop;
  result:=jsonb_build_object('paused',jsonb_array_length(preview->'employees'));
 end if;
 insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata)
 values(target_workspace_id,actor_user_id,case when target_status='published' then 'document_type.published' else 'document_type.unpublished' end,'document_type',d.id::text,jsonb_build_object('reason',btrim(publish_reason),'definition_revision',d.lifecycle_revision,'publication_revision',d.publication_revision+1,'impact',preview->'employees'));
 return result||jsonb_build_object('publication_status',target_status,'publication_revision',d.publication_revision+1);
end;
$function$;

-- Workspace -----------------------------------------------------------------------------------------

-- The Workspace home answer keeps its shape: its notifications box stays on the page until part C2,
-- so the list is empty and the unread count 0.
create or replace function public.get_workspace_dashboard_service(actor_user_id uuid, target_workspace_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  me app_private.actor_state := app_private.actor(actor_user_id, target_workspace_id);
  read_rule app_private.authz_actions;
  documents_rule app_private.authz_actions;
  schedule_places uuid[];
  result jsonb;
begin
  -- Workspace home is the to-do list's page: one gate (KK-32, KK-34).
  perform app_private.authorize(actor_user_id, target_workspace_id, 'workspace.todos');
  select * into read_rule from app_private.authz_actions r where r.key = 'employee.read';
  select * into documents_rule from app_private.authz_actions r where r.key = 'documents.read';
  schedule_places := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.read');

  perform public.sync_expiring_document_todos_service(target_workspace_id);

  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'display_name', profile.display_name,
    'metrics', jsonb_build_object(
      'today_shift_count', (
        select count(*)
        from public.schedule_published_shifts shift
        join public.schedule_location_publications publication
          on publication.id = shift.publication_id and publication.status = 'current'
        join public.locations location on location.id = shift.location_id
        where shift.workspace_id = target_workspace_id
          -- Every zone's date is within a day of UTC's: keeps the date index range.
          and shift.scheduled_date between (now() at time zone 'UTC')::date - 1 and (now() at time zone 'UTC')::date + 1
          and shift.location_id = any(schedule_places)
          and shift.scheduled_date = (now() at time zone location.timezone)::date
      ),
      'today_open_shift_count', (
        select count(*)
        from public.schedule_published_shifts shift
        join public.schedule_location_publications publication
          on publication.id = shift.publication_id and publication.status = 'current'
        join public.locations location on location.id = shift.location_id
        where shift.workspace_id = target_workspace_id
          -- Every zone's date is within a day of UTC's: keeps the date index range.
          and shift.scheduled_date between (now() at time zone 'UTC')::date - 1 and (now() at time zone 'UTC')::date + 1
          and shift.location_id = any(schedule_places)
          and shift.employee_id is null
          and shift.scheduled_date = (now() at time zone location.timezone)::date
      ),
      'pending_time_off_count', (select count(*) from public.schedule_time_off_requests request where request.workspace_id = target_workspace_id and request.status = 'pending'
        and app_private.time_off_reason(actor_user_id, target_workspace_id, 'requests.read', request.employee_id) is null),
      'unread_notification_count', 0
    ),
    'today_ends_at', (
      select min(((now() at time zone location.timezone)::date + 1)::timestamp at time zone location.timezone)
      from public.locations location
      where location.workspace_id = target_workspace_id
        and location.id = any(schedule_places)
    ),
    'announcements', coalesce((select jsonb_agg(item.value) from (select value from jsonb_array_elements((public.get_announcements_service(actor_user_id, target_workspace_id)->'announcements')) value
      -- K28: what is live; scheduled, past, unpublished and archived stay in the list only.
      where value->>'display_status' = 'published' limit 5) item), '[]'::jsonb),
    'notifications', '[]'::jsonb,
    'todos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', todo.id,
        'workspace_id', todo.workspace_id,
        'title', todo.title,
        'body', todo.body,
        'severity', todo.severity,
        'status', todo.status,
        'system_generated', todo.system_generated,
        'source_type', todo.source_type,
        'source_id', todo.source_id,
        'source_key', todo.source_key,
        'employee_id', todo.employee_id,
        'due_at', todo.due_at,
        'action_url', todo.action_url,
        'created_at', todo.created_at
      ) order by todo.due_at nulls last, todo.created_at, todo.id)
      from (
        select todo.*
        from public.workspace_todos todo
        where todo.workspace_id = target_workspace_id
          and todo.status = 'open'::public.workspace_todo_status
          and (
            todo.employee_id is null
            -- KK-179 (5): a document to-do is read like the documents it is about.
            or app_private.authz_check(me,
                 case when todo.source_type = 'employee_document_expiry' then documents_rule else read_rule end,
                 null, todo.employee_id, null) is null
          )
        order by todo.due_at nulls last, todo.created_at, todo.id
        limit 5
      ) todo
    ), '[]'::jsonb),
    'layout', jsonb_build_object(
      'widget_order', public.normalize_workspace_widget_order(preference.widget_order),
      'hidden_widget_ids', array(
        select distinct value
        from unnest(coalesce(preference.hidden_widget_ids, '{}'::text[])) value
        where value = any(array[
          'operations',
          'pending_requests',
          'open_shifts',
          'announcements',
          'todos',
          'notifications',
          'quick_actions'
        ])
      )
    )
  ) into result
  from public.user_profiles profile
  left join public.workspace_layout_preferences preference
    on preference.workspace_id = target_workspace_id
   and preference.user_id = actor_user_id
  where profile.user_id = actor_user_id;

  return result;
end;
$function$;

-- Closing a workspace no longer marks its waiting notifications: nothing sends them any more.
-- The audit row keeps its runtime_revocation object, with the edit sessions it closed.
create or replace function app_private.finish_workspace_closure(target_workspace_id uuid, closing_actor uuid, closure_request uuid, closed_at_time timestamp with time zone, closure_mode text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  edit_sessions_expired integer := 0;
  revocation jsonb;
begin
  update public.workspaces
  set lifecycle_status = 'deleted',
      closure_scheduled_at = null,
      closure_effective_at = closed_at_time,
      closed_at = closed_at_time,
      closed_by = closing_actor,
      updated_at = now()
  where id = target_workspace_id;

  perform set_config('app.workspace_closure', 'on', true);

  update public.workspace_memberships
  set status = 'suspended',
      updated_at = now()
  where workspace_id = target_workspace_id
    and status <> 'suspended';

  update public.employee_invitations
  set status = 'revoked',
      revoked_at = coalesce(revoked_at, now()),
      updated_at = now()
  where workspace_id = target_workspace_id
    and status = 'pending';

  update public.schedule_edit_sessions
  set status = 'expired',
      closed_at = coalesce(closed_at, now()),
      expires_at = now()
  where workspace_id = target_workspace_id
    and status = 'active';
  get diagnostics edit_sessions_expired = row_count;

  delete from public.user_workspace_preferences
  where active_workspace_id = target_workspace_id;

  revocation := jsonb_build_object(
    'schedule_edit_sessions_expired', edit_sessions_expired
  );

  insert into public.audit_events (
    workspace_id,
    actor_user_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    target_workspace_id,
    closing_actor,
    case closure_mode
      when 'immediate' then 'workspace.closure.completed_immediate'
      else 'workspace.closure.completed_scheduled'
    end,
    'workspace',
    target_workspace_id::text,
    jsonb_build_object('closure_request_id', closure_request, 'runtime_revocation', revocation)
  );

  return revocation;
end;
$function$;

-- Schedule: publish names nobody to notify ---------------------------------------------------------

drop function public.publish_schedule_draft_service(uuid, uuid, uuid, uuid[], uuid[], boolean, integer, text, jsonb, uuid[]);

create function public.publish_schedule_draft_service(actor_user_id uuid, target_workspace_id uuid, target_draft_id uuid, target_location_ids uuid[], target_department_ids uuid[], include_no_department boolean, expected_draft_revision integer, expected_fingerprint text, override_decisions jsonb default '[]'::jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  requested uuid;
  result jsonb;
  target_draft public.schedule_drafts%rowtype;
  preview jsonb;
  location_item jsonb;
  finding jsonb;
  decision jsonb;
  new_publication_id uuid;
  previous_publication_id uuid;
  publication_ids uuid[] := '{}'::uuid[];
  normalized_locations uuid[];
  normalized_departments uuid[];
  effective_include_no_department boolean := coalesce(include_no_department, true);
  total_shift_count integer := 0;
  published_at timestamptz := now();
begin
  if cardinality(coalesce(target_location_ids, '{}'::uuid[])) = 0 then
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.publish', target_locations => '{}'::uuid[]);
  end if;
  foreach requested in array target_location_ids loop
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.publish', target_locations => array[requested]);
  end loop;
  perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,921));

  perform public.availability_lock_workspace(target_workspace_id);
  select * into target_draft from public.schedule_drafts draft
  where draft.id = target_draft_id and draft.workspace_id = target_workspace_id
    and draft.archived_at is null for update;
  if target_draft.id is null then raise exception 'schedule draft not found' using errcode = 'P0002'; end if;
  if target_draft.revision <> expected_draft_revision then
    raise exception 'stale publication preview' using errcode = '40001';
  end if;
  select array_agg(distinct location_id order by location_id) into normalized_locations
  from unnest(target_location_ids) location_id;

  if target_department_ids is not null then
    select coalesce(array_agg(distinct department.id order by department.id), '{}'::uuid[])
    into normalized_departments
    from public.departments department
    join unnest(target_department_ids) requested(id) on requested.id = department.id
    where department.workspace_id = target_workspace_id
      and department.archived_at is null;

    if cardinality(normalized_departments) = 0
      and not effective_include_no_department then
      raise exception 'invalid department publication scope' using errcode = '22023';
    end if;
  end if;

  perform 1 from public.schedule_location_publications publication
  where publication.workspace_id = target_workspace_id
    and publication.week_start = target_draft.week_start
    and publication.location_id = any(normalized_locations) for update;

  preview := public.preview_schedule_publication_service(
    actor_user_id,
    target_workspace_id,
    target_draft_id,
    normalized_locations,
    normalized_departments,
    effective_include_no_department
  );
  if preview->>'status' = 'past_week_closed' then
    raise exception 'past schedule week is closed' using errcode = 'P0001', hint = 'schedule.past_week_closed';
  end if;
  if preview->>'fingerprint' <> expected_fingerprint then
    raise exception 'stale publication preview' using errcode = '40001';
  end if;
  if preview->>'status' = 'hard_blocked' then
    raise exception 'schedule has hard publication blockers' using errcode = '23514';
  end if;
  if jsonb_typeof(coalesce(override_decisions, '[]'::jsonb)) <> 'array' then
    raise exception 'publication overrides must be an array' using errcode = '22023';
  end if;
  -- The one place that says which findings are recorded and with which
  -- sentence (BL-190); the publisher's id and the time go with each row.
  override_decisions:=public.weekly_publication_decisions(preview,override_decisions);
  perform set_config('newfork.schedule_publish_scope',jsonb_build_object('workspace_id',target_workspace_id,'draft_id',target_draft_id,
   '_publish_locations',(select jsonb_agg(x->'location_id') from jsonb_array_elements(preview->'locations') x),
   '_publish_departments',preview->'department_ids','_publish_no_department',coalesce((preview->>'include_no_department')::boolean,true))::text,true);
  for location_item in select value from jsonb_array_elements(preview->'locations')
  loop
    previous_publication_id := nullif(location_item->>'active_publication_id', '')::uuid;
    new_publication_id := gen_random_uuid();
    if previous_publication_id is not null then
      update public.schedule_location_publications
      set status = 'superseded'
      where id = previous_publication_id and status = 'current';
      if not found then raise exception 'stale publication preview' using errcode = '40001'; end if;
    end if;
    insert into public.schedule_location_publications (
      id, workspace_id, location_id, week_start, version_number, status,
      published_by, published_at, source_draft_id, source_draft_revision,
      content_fingerprint, department_ids, include_no_department
    ) values (
      new_publication_id, target_workspace_id, (location_item->>'location_id')::uuid,
      target_draft.week_start,
      coalesce((select max(version_number) + 1 from public.schedule_location_publications
        where location_id = (location_item->>'location_id')::uuid and week_start = target_draft.week_start), 1),
      'current', actor_user_id, published_at, target_draft.id, target_draft.revision,
      expected_fingerprint, normalized_departments, effective_include_no_department
    );
    for finding in select value from jsonb_array_elements(preview->'findings')
    loop
      if finding->>'severity' <> 'soft'
        or finding->>'location_id' <> location_item->>'location_id' then continue; end if;
      select value into decision from jsonb_array_elements(override_decisions)
      where value->>'finding_id' = finding->>'id' limit 1;
      if decision is null then continue; end if;
      insert into public.schedule_publication_overrides (
        workspace_id, publication_id, source_draft_id, source_draft_revision,
        finding_id, finding_code, employee_id, location_id, scheduled_date,
        source_shift_ids, reason, actor_user_id
      ) values (
        target_workspace_id, new_publication_id, target_draft.id, target_draft.revision,
        finding->>'id', finding->>'code', nullif(finding->>'employee_id', '')::uuid,
        (finding->>'location_id')::uuid, (finding->>'scheduled_date')::date,
        array(select jsonb_array_elements_text(finding->'shift_ids')::uuid),
        btrim(decision->>'reason'), actor_user_id
      );
    end loop;
    if previous_publication_id is not null then
      update public.schedule_location_publications
      set superseded_by = new_publication_id
      where id = previous_publication_id;

      insert into public.schedule_published_shifts (workspace_id, location_id, publication_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, source_shift_id, label_ids, label_names)
      select shift.workspace_id, shift.location_id, new_publication_id, shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date, shift.start_time, shift.end_time, shift.time_basis, shift.time_snapshot, shift.time_timezone, shift.unpaid_break_minutes, shift.hide_time_on_badge, shift.note, shift.source_shift_id, shift.label_ids, shift.label_names from public.schedule_published_shifts shift
      where shift.publication_id = previous_publication_id
        and not public.schedule_shift_in_department_scope_service(
          shift.job_id, normalized_departments, effective_include_no_department
        );
    end if;

    insert into public.schedule_published_shifts (workspace_id, location_id, publication_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, source_shift_id, label_ids, label_names)
    select shift.workspace_id, shift.location_id, new_publication_id, shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date, shift.start_time, shift.end_time, shift.time_basis, shift.time_snapshot, shift.time_timezone, shift.unpaid_break_minutes, shift.hide_time_on_badge, shift.note, shift.id, shift.label_ids, shift.label_names from public.schedule_draft_shifts shift
    where shift.draft_id = target_draft.id
      and shift.location_id = (location_item->>'location_id')::uuid
      and public.schedule_shift_in_department_scope_service(
        shift.job_id, normalized_departments, effective_include_no_department
      );
    publication_ids := array_append(publication_ids, new_publication_id);

  end loop;

  select count(*)::integer into total_shift_count
  from public.schedule_published_shifts shift where shift.publication_id = any(publication_ids);
  insert into public.schedule_publication_events (
    workspace_id, week_start, action, actor_user_id, location_ids,
    source_draft_id, source_draft_revision, publication_ids,
    preflight_fingerprint, diff_summary
  ) values (
    target_workspace_id, target_draft.week_start, 'published', actor_user_id,
    normalized_locations, target_draft.id, target_draft.revision, publication_ids,
    expected_fingerprint,
    jsonb_build_object(
      'locations', preview->'locations',
      'department_ids', to_jsonb(normalized_departments),
      'include_no_department', effective_include_no_department
    )
  );
  result := jsonb_build_object(
    'status', 'published', 'workspace_id', target_workspace_id,
    'week_start', target_draft.week_start, 'draft_id', target_draft.id,
    'draft_revision', target_draft.revision, 'location_ids', to_jsonb(normalized_locations),
    'publication_ids', to_jsonb(publication_ids), 'published_shift_count', total_shift_count,
    'published_at', published_at
  );

  -- Nobody missing a required document goes out on the published week.
  if public.schedule_draft_has_hard_document_conflicts_service(
      actor_user_id,
      target_workspace_id,
      target_draft_id,
      (result->>'week_start')::date,
      target_location_ids,
      target_department_ids,
      include_no_department
    ) then
    raise exception 'schedule has hard document blockers' using errcode = '23514';
  end if;

  return result;
exception when serialization_failure then raise exception '%',SQLERRM using errcode='PT409', hint='schedule.publication_changed';
end;
$function$;

revoke all on function public.publish_schedule_draft_service(uuid, uuid, uuid, uuid[], uuid[], boolean, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.publish_schedule_draft_service(uuid, uuid, uuid, uuid[], uuid[], boolean, integer, text, jsonb) to service_role;

-- What turned a domain row into a notification -----------------------------------------------------
-- The trigger functions stay for part C2.

drop trigger notify_time_off_event on public.schedule_time_off_events;
drop trigger document_notification_audit on public.onboarding_events;
drop trigger project_account_security_notification on app_private.security_audit_events;

select cron.unschedule(jobid) from cron.job where jobname = 'notification-outbox';

do $$
begin
  if exists (select 1 from pg_publication_tables
             where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'account_notification_items') then
    alter publication supabase_realtime drop table public.account_notification_items;
  end if;
end $$;

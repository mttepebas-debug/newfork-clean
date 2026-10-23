-- Notification panel, slice 2 (KARARLAR S-247 (3), Mert 2026-10-23): every person's notification is their own.
-- Time off: one open card per decider per request.
--
-- A day before a request starts, still waiting, the sweep reminds whoever would be asked now
-- (time_off.decision_reminder). Until now the card that asked them (time_off.requested) stayed open beside the
-- reminder, so a decider had two cards waiting for the same request. Now, once the reminder is written, each
-- person it reached has their earlier open cards for the request (time_off.requested, an earlier
-- time_off.decision_reminder) closed as 'superseded', by nobody; the reminder is the card that waits, and the
-- answer, the withdrawal or the start passing closes it with the outcome and who did it (notification_resolve,
-- unchanged). Only the people reminded: a decider asked before and not reminded now keeps their card open until
-- the request closes. A closed card is never deleted and closing it marks nothing seen or read. Each person whose
-- card closed hears the same contentless signal notification_resolve sends.
--
-- And a notice is short (S-248, Mert 2026-10-23): who and what, then the days; the note, the hours and the
-- shifts are on the request it opens. A person is named short, "Ali P." (preferred or first name and the last
-- name's initial), as the shift change notices name people.
--
-- Only app_private.time_off_request_tell changes.

create or replace function app_private.time_off_request_tell(r public.time_off_requests, what text, actor uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  person public.employee_profiles%rowtype;
  name text;
  days text := app_private.time_off_days_label(r);
  card_url text := '/app/schedule/requests?type=time_off&request=' || r.id::text;
  mine_url text := '/app/employee-hub/my-availability?section=time-off';
  asked uuid[];
  opened integer;
  sent integer := 0;
  reminder_key text := 'time_off:' || r.id::text || ':reminder';
  superseded uuid[];
  decider uuid;
begin
  select * into person from public.employee_profiles e where e.id = r.employee_id and e.workspace_id = r.workspace_id;
  name := btrim(coalesce(nullif(btrim(person.preferred_name), ''), person.first_name)
    || coalesce(' ' || nullif(left(btrim(person.last_name), 1), '') || '.', ''));
  if what = 'requested' or (r.kind = 'leave' and what in ('approved', 'revoked', 'entered', 'reminder')) then
    asked := app_private.notify_deciders(r.workspace_id, 'time_off.decide', array(
      select a.location_id
      from public.employee_location_assignments a
      join public.locations l on l.id = a.location_id and l.workspace_id = a.workspace_id
      where a.workspace_id = r.workspace_id and a.employee_id = r.employee_id and a.ended_at is null
        and app_private.location_is_live(l)
      order by a.location_id), r.employee_id, 'time_off.decide_alone');
  end if;

  if r.kind = 'cancel' then
    if what = 'requested' then
      sent := app_private.notify('time_off.requested', r.workspace_id, asked,
        'time_off:' || r.id::text || ':requested', name || ' asks to cancel time off',
        days, card_url, actor, 'time_off', r.id,
        jsonb_build_object('request_id', r.id, 'kind', 'cancel', 'cancels_id', r.cancels_id, 'kind_of_leave', r.kind_of_leave));
      return sent;
    end if;
    if what in ('approved', 'declined') then
      sent := app_private.notify('time_off.decided', r.workspace_id, array[person.user_id],
        'time_off:' || r.id::text || ':' || what,
        case what when 'approved' then 'Your time off ' || days || ' is cancelled'
          else 'Your request to cancel time off ' || days || ' is declined' end,
        r.decision_note, mine_url, actor, 'time_off', r.id,
        jsonb_build_object('request_id', r.id, 'kind', 'cancel', 'cancels_id', r.cancels_id, 'outcome', what));
    end if;
    perform app_private.notification_resolve(r.workspace_id, 'time_off', r.id, what, actor);
    return sent;
  end if;

  if what = 'requested' then
    return app_private.notify('time_off.requested', r.workspace_id, asked,
      'time_off:' || r.id::text || ':requested', name || ' asks for time off',
      days || ' · Decide before it starts', card_url, actor, 'time_off', r.id,
      jsonb_build_object('request_id', r.id, 'kind_of_leave', r.kind_of_leave));
  end if;

  -- A day before it starts, still waiting (D6): whoever would be asked now. Each of them keeps one open card for
  -- the request (S-247): the reminder; their earlier open ones close as superseded, by nobody. A decider not
  -- reminded keeps theirs open until the request closes.
  if what = 'reminder' then
    sent := app_private.notify('time_off.decision_reminder', r.workspace_id, asked,
      reminder_key, name || '''s time off still waits',
      days || ' · Decide before it starts', card_url, null, 'time_off', r.id,
      jsonb_build_object('request_id', r.id, 'kind_of_leave', r.kind_of_leave));
    with closed as (
      update public.person_notifications n
      set resolved_at = now(), resolution = 'superseded', resolved_by = null
      where n.workspace_id = r.workspace_id and n.subject_type = 'time_off' and n.subject_id = r.id
        and n.resolved_at is null
        and n.type_key in ('time_off.requested', 'time_off.decision_reminder')
        and not (n.type_key = 'time_off.decision_reminder' and n.event_key = reminder_key)
        and n.user_id = any (asked)
        -- Only who holds the reminder now: nobody is left without a card waiting.
        and exists (select 1 from public.person_notifications k
                    where k.workspace_id = r.workspace_id and k.user_id = n.user_id
                      and k.type_key = 'time_off.decision_reminder' and k.event_key = reminder_key
                      and k.resolved_at is null)
      returning n.user_id
    )
    select coalesce(array_agg(distinct c.user_id), '{}'::uuid[]) into superseded from closed c;
    foreach decider in array superseded loop
      perform realtime.send(jsonb_build_object('workspace_id', r.workspace_id), 'changed', 'notifications:' || decider::text, true);
    end loop;
    return sent;
  end if;

  -- Entered for the person (D5): approved at once; nobody was asked, so no card closes.
  if what = 'entered' then
    opened := (select count(*)::integer from public.time_off_request_releases x
               where x.workspace_id = r.workspace_id and x.request_id = r.id);
    sent := app_private.notify('time_off.decided', r.workspace_id, array[person.user_id],
      'time_off:' || r.id::text || ':entered', 'Time off ' || days || ' was added for you',
      r.note, mine_url, actor, 'time_off', r.id,
      jsonb_build_object('request_id', r.id, 'outcome', 'approved', 'entered', true, 'shifts_opened', opened));
    sent := sent + app_private.notify('time_off.decided', r.workspace_id,
      array(select u from unnest(asked) u where u is distinct from actor and u is distinct from person.user_id),
      'time_off:' || r.id::text || ':entered', name || '''s time off ' || days || ' was added',
      case when opened = 1 then '1 shift went to open shifts.' when opened > 1 then opened || ' shifts went to open shifts.' end,
      card_url, actor, 'time_off', r.id,
      jsonb_build_object('request_id', r.id, 'outcome', 'approved', 'entered', true, 'shifts_opened', opened));
    return sent;
  end if;

  if what in ('approved', 'declined') then
    opened := (select count(*)::integer from public.time_off_request_releases x
               where x.workspace_id = r.workspace_id and x.request_id = r.id);
    sent := app_private.notify('time_off.decided', r.workspace_id, array[person.user_id],
      'time_off:' || r.id::text || ':' || what,
      'Your time off ' || days || case what when 'approved' then ' is approved' else ' is declined' end,
      r.decision_note, mine_url, actor, 'time_off', r.id,
      jsonb_build_object('request_id', r.id, 'outcome', what, 'shifts_opened', opened));
    if what = 'approved' then
      sent := sent + app_private.notify('time_off.decided', r.workspace_id,
        array(select u from unnest(asked) u where u is distinct from actor and u is distinct from person.user_id),
        'time_off:' || r.id::text || ':approved', name || '''s time off ' || days || ' is approved',
        case when opened = 1 then '1 shift went to open shifts.' when opened > 1 then opened || ' shifts went to open shifts.' end,
        card_url, actor, 'time_off', r.id,
        jsonb_build_object('request_id', r.id, 'outcome', what, 'shifts_opened', opened));
    end if;
  end if;

  -- Nobody answered before it started (D6): the employee hears it, as the old system's "wasn't decided in time".
  if what = 'expired' then
    sent := app_private.notify('time_off.decided', r.workspace_id, array[person.user_id],
      'time_off:' || r.id::text || ':expired', 'Your time off ' || days || ' wasn''t answered in time',
      'Nobody answered it before it started.', mine_url, null, 'time_off', r.id,
      jsonb_build_object('request_id', r.id, 'outcome', 'expired'));
  end if;

  if what = 'revoked' then
    sent := app_private.notify('time_off.decided', r.workspace_id, array[person.user_id],
      'time_off:' || r.id::text || ':revoked', 'Your time off ' || days || ' was revoked',
      r.ended_note, mine_url, actor, 'time_off', r.id,
      jsonb_build_object('request_id', r.id, 'outcome', what));
    sent := sent + app_private.notify('time_off.decided', r.workspace_id,
      array(select u from unnest(asked) u where u is distinct from actor and u is distinct from person.user_id),
      'time_off:' || r.id::text || ':revoked', name || '''s time off ' || days || ' was revoked',
      r.ended_note, card_url, actor, 'time_off', r.id,
      jsonb_build_object('request_id', r.id, 'outcome', what));
  end if;
  perform app_private.notification_resolve(r.workspace_id, 'time_off', r.id, what, actor);
  return sent;
end;
$$;

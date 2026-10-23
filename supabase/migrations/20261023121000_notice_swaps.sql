-- Shift change cards: every person's card is their own (KARARLAR S-247 (3), Mert 2026-10-23; notification
-- panel slice 2). A card that asks for something is never deleted when its request moves on: it stops
-- waiting and says what happened and who did it. And a notice is short (S-248): who wants what, and by when;
-- the shift's day, hours, job and place are on the request it opens.
--   (a) shift_exchange_remind: a reminder or the last call replaces the decider's open "needs your
--       approval" card and the reminder before it, as 'superseded', by nobody (it closed only the earlier
--       reminder, as 'reminded_again', and the first card stayed open beside it). The new reminder is written
--       first, and only who holds it has their earlier cards closed: nobody is left without a card waiting.
--       One open card per decider per request.
--   (b) shift_exchange_tell, "Extra shift available": a teammate who asks for the shift has their own card
--       closed as 'applied', by them (it stayed open). When the shift goes to someone, every card still open
--       closes as 'taken', by who got it (it said 'approved' to teammates who never asked); the deciders'
--       cards close as 'approved' as before.
--   (c) "No one could cover your shift" tells the owner, it asks nothing of them in the app: it is no longer a
--       needs-action type (it was closed as 'withdrawn' in the transaction that wrote it, and once that was
--       fixed nothing would ever have closed it). The other open cards close before it is written.
--   (d) Short texts (S-248): titles say who and what ("Ali P. wants to swap with Deniz K."), the second line the
--       deadline ("Decide by Tue 2:00 PM") or one short fact; names are short (app_private.shift_exchange_name,
--       20261023120000_notice_core).
-- Same signatures, language, volatility and search_path; grants and owners are kept by create or replace.

update public.notification_types set needs_action = false where key = 'shift_changes.cover_unfilled';

create or replace function app_private.shift_exchange_remind(pass_limit integer default 500) returns integer
language plpgsql set search_path = '' as $$
declare
  c public.shift_exchange_cases%rowtype;
  a public.shift_exchange_applications%rowtype;
  first_ask timestamptz;
  waiting uuid[];
  owner_name text;
  who_name text;
  heading text;
  deadline text;
  reminder_key text;
  superseded uuid[];
  decider uuid;
  zone text;
  fmt text;
  turn integer;
  done integer := 0;
begin
  for c in select x.* from public.shift_exchange_cases x
    where x.status = 'open' and x.expires_at > now()
      and exists (select 1 from public.shift_exchange_applications p where p.case_id = x.id and p.status = 'pending_manager')
    order by x.expires_at, x.id limit pass_limit loop
    begin
    reminder_key := null;
    -- The lock a decision holds (shift_exchanges_command_service): a case being decided waits for the next pass.
    if not pg_try_advisory_xact_lock(hashtextextended(c.workspace_id::text, 921)) then
      continue;
    end if;
    if not exists (select 1 from public.shift_exchange_cases x where x.id = c.id and x.status = 'open')
      or public.shift_exchange_live_status(c.workspace_id, c.id) <> 'open' then
      continue;
    end if;
    select min(e.created_at) into first_ask from public.shift_exchange_events e
    where e.case_id = c.id and e.action in ('application_submitted', 'peer_accepted');
    if first_ask is null then
      continue;
    end if;
    select * into a from public.shift_exchange_applications p where p.case_id = c.id and p.status = 'pending_manager'
    order by p.created_at, p.id limit 1;
    waiting := app_private.shift_exchange_deciders(c.workspace_id, c.id, a.employee_id, true);
    owner_name := app_private.shift_exchange_name(c.workspace_id, c.owner_id);
    who_name := app_private.shift_exchange_name(c.workspace_id, a.employee_id);
    -- Who wants what (S-248); the request it opens shows the shifts.
    heading := case when c.kind = 'swap' then owner_name || ' wants to swap with ' || who_name
      -- An open shift a publish offered has nobody's name on it (Mert, 2026-10-20).
      when c.owner_id is null then who_name || ' wants the open shift'
      else who_name || ' wants ' || owner_name || '''s shift' end;
    zone := coalesce(c.offered_snapshot ->> 'timezone', 'UTC');
    fmt := (select x.time_format from public.workspace_scheduling_settings x where x.workspace_id = c.workspace_id);
    deadline := to_char(c.expires_at at time zone zone, case when fmt = '24h' then 'FMDy HH24:MI' else 'FMDy FMHH12:MI AM' end);
    if now() >= c.expires_at - interval '4 hours' then
      if first_ask >= c.expires_at - interval '4 hours'
        or exists (select 1 from public.person_notifications n where n.workspace_id = c.workspace_id
                   and n.subject_id = c.id and n.event_key = 'case:' || c.id::text || ':last_call') then
        continue;
      end if;
      reminder_key := 'case:' || c.id::text || ':last_call';
      done := done + app_private.notify('shift_changes.approval_reminder', c.workspace_id, waiting, reminder_key,
        heading, 'Decide by ' || deadline || ' or it closes',
        '/app/schedule/requests?type=shift_changes', null, 'shift_exchange_case', c.id,
        jsonb_build_object('case_id', c.id, 'kind', c.kind, 'audience', c.audience, 'last_call', true));
    elsif not exists (select 1 from public.person_notifications n where n.workspace_id = c.workspace_id
                      and n.subject_id = c.id and n.event_key = 'case:' || c.id::text || ':last_call') then
      turn := floor(extract(epoch from now() - first_ask) / 43200)::integer;
      if turn >= 1 and not exists (select 1 from public.person_notifications n where n.workspace_id = c.workspace_id
                                   and n.subject_id = c.id and n.event_key = 'case:' || c.id::text || ':reminder:' || turn::text) then
        reminder_key := 'case:' || c.id::text || ':reminder:' || turn::text;
        done := done + app_private.notify('shift_changes.approval_reminder', c.workspace_id, waiting, reminder_key,
          heading, 'Still waiting. Decide by ' || deadline,
          '/app/schedule/requests?type=shift_changes', null, 'shift_exchange_case', c.id,
          jsonb_build_object('case_id', c.id, 'kind', c.kind, 'audience', c.audience));
      end if;
    end if;
    if reminder_key is not null then
      -- The reminder replaces the decider's open card, first ask or reminder: one open card each (S-247). Only who
      -- holds the new reminder: nobody is left without a card waiting. Closed by nobody, so nobody's card is read.
      with closed as (
        update public.person_notifications n
        set resolved_at = now(), resolution = 'superseded', resolved_by = null
        where n.workspace_id = c.workspace_id and n.subject_type = 'shift_exchange_case' and n.subject_id = c.id
          and n.resolved_at is null
          and n.type_key in ('shift_changes.approval_needed', 'shift_changes.approval_reminder')
          and not (n.type_key = 'shift_changes.approval_reminder' and n.event_key = reminder_key)
          and n.user_id = any (waiting)
          and exists (select 1 from public.person_notifications k
                      where k.workspace_id = c.workspace_id and k.user_id = n.user_id
                        and k.type_key = 'shift_changes.approval_reminder' and k.event_key = reminder_key
                        and k.resolved_at is null)
        returning n.user_id
      )
      select coalesce(array_agg(distinct x.user_id), '{}'::uuid[]) into superseded from closed x;
      foreach decider in array superseded loop
        perform realtime.send(jsonb_build_object('workspace_id', c.workspace_id), 'changed', 'notifications:' || decider::text, true);
      end loop;
    end if;
    exception when others then
      -- One broken case does not stop the others' reminders (as time_off_sweep).
      raise warning 'shift-exchange-reminders: case % of workspace % failed: % %', c.id, c.workspace_id, sqlstate, sqlerrm;
    end;
  end loop;
  return done;
end;
$$;

create or replace function app_private.shift_exchange_tell(actor uuid, w uuid, cid uuid, aid uuid, act text)
returns integer
language plpgsql set search_path = '' as $$
declare
  c public.shift_exchange_cases%rowtype;
  a public.shift_exchange_applications%rowtype;
  approvals constant text[] := array['shift_changes.approval_needed', 'shift_changes.approval_reminder'];
  invitations constant text[] := array['shift_changes.cover_asked', 'shift_changes.swap_offered'];
  hub text;
  desk text := '/app/schedule/requests?type=shift_changes';
  key text := 'case:' || cid::text;
  owner_user uuid;
  owner_name text;
  whose text;
  who_user uuid;
  who_name text;
  day_only text;
  theirs_day text;
  deadline text;
  pool boolean;
  what text;
  askers uuid[];
  deciders uuid[];
  facts jsonb;
  sent integer := 0;
begin
  select * into c from public.shift_exchange_cases x where x.id = cid and x.workspace_id = w;
  if c.id is null then
    return 0;
  end if;
  if aid is not null then
    select * into a from public.shift_exchange_applications x where x.id = aid and x.case_id = cid;
    who_user := app_private.shift_exchange_user(w, a.employee_id);
    who_name := app_private.shift_exchange_name(w, a.employee_id);
  end if;
  owner_user := app_private.shift_exchange_user(w, c.owner_id);
  owner_name := app_private.shift_exchange_name(w, c.owner_id);
  -- An open shift a publish offered has nobody's name on it (Mert, 2026-10-20).
  whose := case when c.owner_id is null then 'the open shift' else owner_name || '''s shift' end;
  -- A notice names the shift by its day only (S-248): its hours, job and place are on the request it opens.
  day_only := to_char((c.offered_snapshot ->> 'date')::date, 'FMDy, FMMon FMDD');
  theirs_day := case when c.kind = 'swap' then to_char((c.requested_snapshot ->> 'date')::date, 'FMDy, FMMon FMDD') end;
  -- When the request closes, on the shift's clock and the workspace's 12/24 h.
  deadline := to_char(c.expires_at at time zone coalesce(c.offered_snapshot ->> 'timezone', 'UTC'),
    case when (select x.time_format from public.workspace_scheduling_settings x where x.workspace_id = w) = '24h'
      then 'FMDy HH24:MI' else 'FMDy FMHH12:MI AM' end);
  pool := c.audience = 'eligible_pool';
  -- Shift Hub opens on the case and its days (it reads 42 days from today otherwise).
  hub := '/app/employee-hub/shift-hub?case=' || cid::text
    || '&from=' || least(c.offered_snapshot ->> 'date', coalesce(c.requested_snapshot ->> 'date', c.offered_snapshot ->> 'date'))
    || '&to=' || greatest(c.offered_snapshot ->> 'date', coalesce(c.requested_snapshot ->> 'date', c.offered_snapshot ->> 'date'));
  what := case when c.kind = 'swap' then 'swap' else 'cover' end;
  facts := jsonb_build_object('case_id', cid, 'kind', c.kind, 'audience', c.audience)
    || case when aid is not null then jsonb_build_object('application_id', aid) else '{}'::jsonb end;

  if act = 'cover_opened' then
    -- An offered open shift waits in Shift Hub: nobody is told until the notification program starts.
    if c.owner_id is null then
      return 0;
    end if;
    -- A release, to everyone it reaches (plan 04:51).
    return app_private.notify('shift_changes.open_shift_available', w, app_private.shift_exchange_pool(w, cid), key || ':open',
      'Extra shift on ' || day_only, owner_name || ' can''t make it. Want it?', hub || '&hub_view=available', actor, 'shift_exchange_case', cid, facts);

  elsif act = 'peer_invited' then
    if c.kind = 'swap' then
      return app_private.notify('shift_changes.swap_offered', w, array[who_user], key || ':invite:' || aid::text,
        owner_name || ' wants to swap with you', 'Your ' || theirs_day || ' for ' || day_only, hub, actor, 'shift_exchange_case', cid, facts);
    end if;
    return app_private.notify('shift_changes.cover_asked', w, array[who_user], key || ':invite:' || aid::text,
      owner_name || ' asked you to cover', day_only, hub, actor, 'shift_exchange_case', cid, facts);

  elsif act in ('application_submitted', 'peer_accepted') then
    if act = 'application_submitted' then
      -- Who asks for an extra shift has their own card closed: they applied (S-247).
      perform app_private.shift_exchange_resolve(w, cid, array['shift_changes.open_shift_available'], 'applied', who_user, array[who_user]);
    end if;
    if act = 'peer_accepted' then
      perform app_private.shift_exchange_resolve(w, cid, invitations, 'accepted', actor, array[who_user]);
      if c.kind = 'swap' then
        sent := sent + app_private.notify('shift_changes.swap_answered', w, array[owner_user], key || ':answer:' || aid::text,
          who_name || ' confirmed your swap', 'Your manager decides next.',
          hub, actor, 'shift_exchange_case', cid, facts);
      end if;
    end if;
    -- Who decides hears it once while a card of theirs is open (plan 05:03: the first one asking rings).
    deciders := array(select u from unnest(app_private.shift_exchange_deciders(w, cid, a.employee_id)) u
      where not exists (select 1 from public.person_notifications n where n.workspace_id = w
        and n.subject_type = 'shift_exchange_case' and n.subject_id = cid and n.user_id = u
        and n.type_key = any (approvals) and n.resolved_at is null));
    return sent + app_private.notify('shift_changes.approval_needed', w, deciders, key || ':approval:' || aid::text,
      case when c.kind = 'swap' then owner_name || ' wants to swap with ' || who_name
        else who_name || ' wants ' || whose end,
      'Decide by ' || deadline,
      desk, actor, 'shift_exchange_case', cid, facts);

  elsif act in ('peer_declined', 'application_withdrawn', 'application_closed') then
    -- An answer: declined, taken back, or closed because its teammate left (close_employee_side).
    perform app_private.shift_exchange_resolve(w, cid, invitations,
      case act when 'peer_declined' then 'declined' when 'application_withdrawn' then 'withdrawn' else 'closed' end, actor, array[who_user]);
    if not pool then
      -- The other open cards close first; the owner's notice below tells, it asks nothing (S-247).
      perform app_private.shift_exchange_resolve(w, cid, null, 'withdrawn', actor);
      if c.kind = 'swap' then
        sent := app_private.notify('shift_changes.swap_answered', w, array[owner_user], key || ':answer:' || aid::text,
          who_name || case act when 'peer_declined' then ' declined your swap' when 'application_withdrawn' then ' withdrew from your swap'
            else ' can no longer swap with you' end,
          'Nothing changed.', hub, actor, 'shift_exchange_case', cid, facts);
      else
        sent := app_private.notify('shift_changes.cover_unfilled', w, array[owner_user], key || ':unfilled:' || aid::text,
          'No one could cover your ' || day_only || ' shift',
          who_name || case when act = 'peer_declined' then ' can''t cover it.' else ' can no longer cover it.' end
            || ' You still work it.', hub, actor, 'shift_exchange_case', cid, facts);
      end if;
    elsif not exists (select 1 from public.shift_exchange_applications x where x.case_id = cid and x.status = 'pending_manager') then
      perform app_private.shift_exchange_resolve(w, cid, approvals, 'withdrawn', actor);
    end if;
    return sent;

  elsif act = 'scope_approved' then
    -- One location approved a two-location swap: its deciders' cards close; the other location's wait.
    perform app_private.shift_exchange_resolve(w, cid, approvals, 'approved', actor,
      array(select u from unnest(app_private.shift_exchange_deciders(w, cid, a.employee_id)) u
            where u <> all (app_private.shift_exchange_deciders(w, cid, a.employee_id, true))));
    return 0;

  elsif act = 'application_rejected' then
    -- The reason is the applicant's (BL-910); the owner reads that it was declined.
    sent := app_private.notify('shift_changes.decided', w, array[who_user], key || ':decided:' || aid::text,
      case when pool then 'Your pickup request was declined'
        when c.kind = 'swap' then 'Your swap with ' || owner_name || ' was declined'
        else 'Your cover for ' || owner_name || ' was declined' end,
      coalesce(nullif(btrim(coalesce(a.reason, '')), ''), 'Your schedule has not changed.'),
      hub, actor, 'shift_exchange_case', cid, facts || jsonb_build_object('outcome', 'declined'));
    if not pool then
      sent := sent + app_private.notify('shift_changes.decided', w, array[owner_user], key || ':decided:' || aid::text,
        'Your manager declined the ' || what,
        case when c.kind = 'swap' then 'Nothing changed.'
          else who_name || ' won''t cover it. You still work it.' end,
        hub, actor, 'shift_exchange_case', cid, facts || jsonb_build_object('outcome', 'declined'));
      perform app_private.shift_exchange_resolve(w, cid, null, 'declined', actor);
    elsif not exists (select 1 from public.shift_exchange_applications x where x.case_id = cid and x.status = 'pending_manager') then
      perform app_private.shift_exchange_resolve(w, cid, approvals, 'declined', actor);
    end if;
    return sent;

  elsif act = 'other_selected' then
    if pool then
      return app_private.notify('shift_changes.open_shift_taken', w, array[who_user], key || ':taken:' || aid::text,
        'Another teammate got it', 'Your schedule has not changed.', hub, actor, 'shift_exchange_case', cid, facts);
    end if;
    return app_private.notify('shift_changes.cover_taken', w, array[who_user], key || ':taken:' || aid::text,
      'Someone else is covering', 'Your schedule has not changed.', hub, actor, 'shift_exchange_case', cid, facts);

  elsif act = 'transfer_completed' then
    if c.kind = 'swap' then
      sent := app_private.notify('shift_changes.decided', w, array[who_user], key || ':decided:' || aid::text,
        'Your swap is approved', 'You now work ' || day_only || '.', hub, actor, 'shift_exchange_case', cid,
        facts || jsonb_build_object('outcome', 'approved'))
        + app_private.notify('shift_changes.decided', w, array[owner_user], key || ':decided:' || aid::text,
        'Your swap is approved', 'You now work ' || theirs_day || '.', hub, actor, 'shift_exchange_case', cid,
        facts || jsonb_build_object('outcome', 'approved'));
    else
      sent := app_private.notify('shift_changes.decided', w, array[who_user], key || ':decided:' || aid::text,
        case when pool then 'Your pickup is approved' else 'Your cover is approved' end, day_only || ' is yours now.',
        hub, actor, 'shift_exchange_case', cid, facts || jsonb_build_object('outcome', 'approved'))
        + app_private.notify('shift_changes.decided', w, array[owner_user], key || ':decided:' || aid::text,
        'Your ' || day_only || ' shift is covered', who_name || ' works it now.',
        hub, actor, 'shift_exchange_case', cid, facts || jsonb_build_object('outcome', 'approved'));
    end if;
    -- The shift went to someone: an extra shift card still open says it was taken, by who got it, never
    -- approved (S-247).
    perform app_private.shift_exchange_resolve(w, cid, array['shift_changes.open_shift_available'], 'taken', who_user);
    perform app_private.shift_exchange_resolve(w, cid, null, 'approved', actor);
    return sent;

  elsif act = 'case_closed' then
    askers := array(select app_private.shift_exchange_user(w, x.employee_id) from public.shift_exchange_applications x
      where x.case_id = cid and x.status = 'closed_case_cancelled');
    if c.owner_id is not null and actor is not distinct from owner_user then
      -- Taken back (plan §3 Release: "Maria kept this shift").
      sent := app_private.notify(case when pool then 'shift_changes.open_shift_kept' else 'shift_changes.closed' end, w, askers,
        key || ':closed', case when pool then owner_name || ' kept this shift' else owner_name || ' cancelled the request' end,
        'Your schedule has not changed.', hub, actor, 'shift_exchange_case', cid, facts);
    else
      -- A manager's reason is for who asked, as a decline's is.
      sent := app_private.notify_rows(w, actor, (
        select coalesce(jsonb_agg(jsonb_build_object('type', 'shift_changes.closed', 'user_id', app_private.shift_exchange_user(w, x.employee_id),
          'event_key', key || ':closed', 'title', 'A manager closed the request for ' || whose,
          'body', coalesce(nullif(btrim(coalesce(x.reason, '')), ''), 'Your schedule has not changed.'),
          'url', hub, 'subject_type', 'shift_exchange_case', 'subject_id', cid, 'data', facts)), '[]'::jsonb)
        from public.shift_exchange_applications x where x.case_id = cid and x.status = 'closed_case_cancelled'))
        + app_private.notify('shift_changes.closed', w, array[owner_user], key || ':closed', 'A manager closed your request',
        'You still work your ' || day_only || ' shift.', hub, actor, 'shift_exchange_case', cid, facts);
    end if;
    perform app_private.shift_exchange_resolve(w, cid, null, 'cancelled', actor);
    return sent;

  elsif act in ('expired', 'invalidated') and aid is not null then
    -- One acceptance ended (refresh_weekly_exchange_terms: the new hours overlap the teammate's other shift);
    -- the request stays open: only that teammate hears it, and only their cards close.
    sent := app_private.notify('shift_changes.closed', w, array[who_user], key || ':ended:' || aid::text,
      'Your request for ' || whose || ' ended',
      'The shift changed and now overlaps another of your shifts. Your schedule has not changed.',
      hub, actor, 'shift_exchange_case', cid, facts);
    perform app_private.shift_exchange_resolve(w, cid, null, 'shift_changed', actor, array[who_user]);
    if not exists (select 1 from public.shift_exchange_applications x where x.case_id = cid and x.status = 'pending_manager') then
      perform app_private.shift_exchange_resolve(w, cid, approvals, 'shift_changed', actor);
    end if;
    return sent;

  elsif act in ('expired', 'invalidated') then
    -- Everything closes 4 hours before the shift, and a changed shift ends it; everyone it held hears it
    -- (plan §4.1, §4.2).
    askers := array(select app_private.shift_exchange_user(w, x.employee_id) from public.shift_exchange_applications x
      where x.case_id = cid and x.status = act);
    sent := app_private.notify('shift_changes.closed', w, array[owner_user], key || ':closed', 'Your shift change request closed',
        case when act = 'expired' then 'It closed 4 hours before the shift. ' else 'The shift changed, so it ended. ' end
        || 'You are still responsible for this shift.', hub, actor, 'shift_exchange_case', cid, facts)
      + app_private.notify('shift_changes.closed', w, askers, key || ':closed', 'The request for ' || whose || ' closed',
        case when act = 'expired' then 'It closed 4 hours before the shift. ' else 'The shift changed, so it ended. ' end
        || 'Your schedule has not changed.', hub, actor, 'shift_exchange_case', cid, facts);
    perform app_private.shift_exchange_resolve(w, cid, null, case when act = 'expired' then 'expired' else 'shift_changed' end, actor);
    return sent;
  end if;
  return 0;
end;
$$;

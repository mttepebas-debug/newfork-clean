-- TAKAS-BILDIRIM (Mert, 2026-10-20, items 30 and 32: "Hatırlatmalar da bu işte"). Shift changes write
-- their notices into the core (20261016220000_notification_core): a release, a cover asked by name and a
-- swap, from the first step to the last. KARARLAR S-126 (1) changes: the notices no longer wait for the
-- rest of the shift change work. What each step says and to whom follows the shift change plan
-- (PD\notes\vardiya-degisim\PLAN.md §3), with the types the core already lists.
--
--   one place   every step of a case goes through public.shift_exchange_emit, which writes its history;
--               it now also tells the people the step changes (app_private.shift_exchange_tell).
--   recipients  a release goes to the teammates who find it in Available Shifts (the read service's
--               rule); a request waiting for a decision goes to who may decide it at its location: the
--               managers, past them the admins, the owner only without one (KARARLAR S-169, as time off).
--   reasons     a manager's reason reaches only the employee who asked (BL-910); the owner reads that it
--               was declined.
--   cards       a decision closes the deciders' cards; an answer closes the invitee's; a request that
--               ends closes every card about it.
--   reminders   a request still waiting is reminded every 12 hours to whoever has not decided, and once
--               more 4 hours before it closes (plan §3 Müdür); a pg_cron pass every 5 minutes.
--
-- Out of this slice (later shift change slices): the note on a swap answer (the command takes none yet),
-- "Ask someone else" on an unfilled cover, "Post this shift to open shifts?".

-- 1. Words ---------------------------------------------------------------------------------------------

create or replace function app_private.shift_exchange_name(w uuid, emp uuid) returns text
language sql stable set search_path = '' as $$
  select btrim(coalesce(nullif(e.preferred_name, ''), e.first_name) || ' ' || e.last_name)
  from public.employee_profiles e where e.workspace_id = shift_exchange_name.w and e.id = shift_exchange_name.emp
$$;

create or replace function app_private.shift_exchange_user(w uuid, emp uuid) returns uuid
language sql stable set search_path = '' as $$
  select e.user_id from public.employee_profiles e where e.workspace_id = shift_exchange_user.w and e.id = shift_exchange_user.emp
$$;

-- "Mon, Oct 19 · 4:00 PM–10:00 PM · Cook, Kadikoy", in the workspace's time format.
create or replace function app_private.shift_exchange_shift_text(w uuid, s jsonb) returns text
language sql stable set search_path = '' as $$
  select to_char((s ->> 'date')::date, 'FMDy, FMMon FMDD') || ' · '
    || app_private.announcement_hours_text((s ->> 'start_time')::time, (s ->> 'end_time')::time,
         (select x.time_format from public.workspace_scheduling_settings x where x.workspace_id = shift_exchange_shift_text.w))
    || ' · ' || coalesce(s ->> 'job_name', 'Unassigned position') || ', ' || coalesce(s ->> 'location_name', '')
$$;

-- 2. Who hears it ----------------------------------------------------------------------------------------

-- Who may decide this case for this receiver, location by location (the command's own rule,
-- app_private.exchange_decision_reason): the managers; past them the admins; the owner only without
-- one (KARARLAR S-169). waiting = only the locations that have not voted yet.
create or replace function app_private.shift_exchange_deciders(w uuid, cid uuid, receiver uuid, waiting boolean default false)
returns uuid[]
language plpgsql stable set search_path = '' as $$
declare
  c public.shift_exchange_cases%rowtype;
  loc uuid;
  here uuid[];
  found uuid[] := '{}';
begin
  select * into c from public.shift_exchange_cases x where x.id = cid and x.workspace_id = w;
  for loc in select distinct x from unnest(array_remove(array[(c.offered_snapshot ->> 'location_id')::uuid,
    (c.requested_snapshot ->> 'location_id')::uuid], null)) x loop
    if waiting and exists (select 1 from public.shift_exchange_votes v where v.case_id = cid and v.location_id = loc) then
      continue;
    end if;
    here := array(select u from unnest(app_private.notify_holders(w, 'exchange.approve', array[loc])) u
                  where app_private.exchange_decision_reason(u, w, c.owner_id, receiver, loc) is null);
    found := found || coalesce(
      nullif(array(select u from unnest(here) u where (app_private.actor(u, w)).class not in ('owner', 'admin')), '{}'),
      nullif(array(select u from unnest(here) u where (app_private.actor(u, w)).class = 'admin'), '{}'),
      here);
  end loop;
  return array(select distinct u from unnest(found) u order by u);
end;
$$;

-- The teammates a release reaches: who finds it in Available Shifts (shift_exchanges_read_service): an
-- active member who may ask for shifts, eligible for the full shift or held back only by approved time
-- off (an employee may pick up onto a leave day), never its owner.
create or replace function app_private.shift_exchange_pool(w uuid, cid uuid) returns uuid[]
language plpgsql stable set search_path = '' as $$
declare
  c public.shift_exchange_cases%rowtype;
  s jsonb;
  e record;
  checked jsonb;
  found uuid[] := '{}';
begin
  select * into c from public.shift_exchange_cases x where x.id = cid and x.workspace_id = w;
  s := public.shift_exchange_shift(w, c.offered_source_id);
  if s is null then
    return found;
  end if;
  for e in select p.id, p.user_id from public.employee_profiles p
    join public.workspace_memberships m on m.workspace_id = p.workspace_id and m.user_id = p.user_id and m.status = 'active'
    where p.workspace_id = w and p.archived_at is null and p.id <> c.owner_id
    order by p.id loop
    if app_private.authz_reason(e.user_id, w, 'exchange.apply_own') is not null then
      continue;
    end if;
    checked := app_private.eligibility(w, e.id, s, '{"operation":"release_pickup"}');
    if checked ->> 'status' = 'eligible' or (checked ->> 'status' = 'ineligible' and not exists (
      select 1 from jsonb_array_elements(checked -> 'blockers') b where b ->> 'code' <> 'approved_time_off')) then
      found := found || e.user_id;
    end if;
  end loop;
  return found;
end;
$$;

-- 3. Closing cards -----------------------------------------------------------------------------------------

-- notification_resolve, for some types of a case and, when named, some people only.
create or replace function app_private.shift_exchange_resolve(w uuid, cid uuid, kinds text[], how text, by_user uuid,
  people uuid[] default null) returns integer
language plpgsql set search_path = '' as $$
declare
  told uuid[];
  person uuid;
begin
  with closed as (
    update public.person_notifications n
    set resolved_at = now(), resolution = how, resolved_by = by_user
    from public.notification_types t
    where t.key = n.type_key and t.needs_action
      and n.workspace_id = w and n.subject_type = 'shift_exchange_case' and n.subject_id = cid
      and n.resolved_at is null
      and (kinds is null or n.type_key = any (kinds))
      and (people is null or n.user_id = any (people))
    returning n.user_id
  )
  select coalesce(array_agg(x.user_id), '{}'::uuid[]) into told from closed x;
  foreach person in array array(select distinct x from unnest(told) x) loop
    perform realtime.send(jsonb_build_object('workspace_id', w), 'changed', 'notifications:' || person::text, true);
  end loop;
  return cardinality(told);
end;
$$;

-- 4. What each step says ---------------------------------------------------------------------------------

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
  who_user uuid;
  who_name text;
  day text;
  day_only text;
  theirs text;
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
  day := app_private.shift_exchange_shift_text(w, c.offered_snapshot);
  day_only := to_char((c.offered_snapshot ->> 'date')::date, 'FMDy, FMMon FMDD');
  theirs := case when c.kind = 'swap' then app_private.shift_exchange_shift_text(w, c.requested_snapshot) end;
  pool := c.audience = 'eligible_pool';
  -- Shift Hub opens on the case and its days (it reads 42 days from today otherwise).
  hub := '/app/employee-hub/shift-hub?case=' || cid::text
    || '&from=' || least(c.offered_snapshot ->> 'date', coalesce(c.requested_snapshot ->> 'date', c.offered_snapshot ->> 'date'))
    || '&to=' || greatest(c.offered_snapshot ->> 'date', coalesce(c.requested_snapshot ->> 'date', c.offered_snapshot ->> 'date'));
  what := case when c.kind = 'swap' then 'swap' else 'cover' end;
  facts := jsonb_build_object('case_id', cid, 'kind', c.kind, 'audience', c.audience)
    || case when aid is not null then jsonb_build_object('application_id', aid) else '{}'::jsonb end;

  if act = 'cover_opened' then
    -- A release, to everyone it reaches (plan 04:51).
    return app_private.notify('shift_changes.open_shift_available', w, app_private.shift_exchange_pool(w, cid), key || ':open',
      'Extra shift available', owner_name || ' can''t make ' || day || '. Want it?', hub || '&hub_view=available', actor, 'shift_exchange_case', cid, facts);

  elsif act = 'peer_invited' then
    if c.kind = 'swap' then
      return app_private.notify('shift_changes.swap_offered', w, array[who_user], key || ':invite:' || aid::text,
        'Confirm your swap with ' || owner_name, 'You give ' || theirs || ' · You get ' || day, hub, actor, 'shift_exchange_case', cid, facts);
    end if;
    return app_private.notify('shift_changes.cover_asked', w, array[who_user], key || ':invite:' || aid::text,
      owner_name || ' asked you to cover', day, hub, actor, 'shift_exchange_case', cid, facts);

  elsif act in ('application_submitted', 'peer_accepted') then
    if act = 'peer_accepted' then
      perform app_private.shift_exchange_resolve(w, cid, invitations, 'accepted', actor, array[who_user]);
      if c.kind = 'swap' then
        sent := sent + app_private.notify('shift_changes.swap_answered', w, array[owner_user], key || ':answer:' || aid::text,
          who_name || ' confirmed your swap', 'You give ' || day || ' · You get ' || theirs || '. Your manager decides.',
          hub, actor, 'shift_exchange_case', cid, facts);
      end if;
    end if;
    -- Who decides hears it once while a card of theirs is open (plan 05:03: the first one asking rings).
    deciders := array(select u from unnest(app_private.shift_exchange_deciders(w, cid, a.employee_id)) u
      where not exists (select 1 from public.person_notifications n where n.workspace_id = w
        and n.subject_type = 'shift_exchange_case' and n.subject_id = cid and n.user_id = u
        and n.type_key = any (approvals) and n.resolved_at is null));
    return sent + app_private.notify('shift_changes.approval_needed', w, deciders, key || ':approval:' || aid::text,
      'Shift change needs your approval',
      case when c.kind = 'swap' then owner_name || ' and ' || who_name || ' want to swap ' || day || ' for ' || theirs
        else who_name || ' wants ' || owner_name || '''s ' || day end,
      desk, actor, 'shift_exchange_case', cid, facts);

  elsif act in ('peer_declined', 'application_withdrawn', 'application_closed') then
    -- An answer: declined, taken back, or closed because its teammate left (close_employee_side).
    perform app_private.shift_exchange_resolve(w, cid, invitations,
      case act when 'peer_declined' then 'declined' when 'application_withdrawn' then 'withdrawn' else 'closed' end, actor, array[who_user]);
    if not pool then
      if c.kind = 'swap' then
        sent := app_private.notify('shift_changes.swap_answered', w, array[owner_user], key || ':answer:' || aid::text,
          who_name || case act when 'peer_declined' then ' declined your swap' when 'application_withdrawn' then ' withdrew from your swap'
            else ' can no longer swap with you' end,
          'Nothing changed. You still work ' || day || '.', hub, actor, 'shift_exchange_case', cid, facts);
      else
        sent := app_private.notify('shift_changes.cover_unfilled', w, array[owner_user], key || ':unfilled:' || aid::text,
          'No one could cover your ' || day_only || ' shift',
          who_name || case when act = 'peer_declined' then ' can''t cover it.' else ' can no longer cover it.' end
            || ' You are still responsible for this shift.', hub, actor, 'shift_exchange_case', cid, facts);
      end if;
      perform app_private.shift_exchange_resolve(w, cid, null, 'withdrawn', actor);
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
      coalesce(nullif(btrim(coalesce(a.reason, '')), ''), day || '. Your schedule has not changed.'),
      hub, actor, 'shift_exchange_case', cid, facts || jsonb_build_object('outcome', 'declined'));
    if not pool then
      sent := sent + app_private.notify('shift_changes.decided', w, array[owner_user], key || ':decided:' || aid::text,
        'Your manager declined the ' || what,
        case when c.kind = 'swap' then 'Nothing changed. You still work ' || day || '.'
          else who_name || ' won''t cover ' || day || '. You are still responsible for this shift.' end,
        hub, actor, 'shift_exchange_case', cid, facts || jsonb_build_object('outcome', 'declined'));
      perform app_private.shift_exchange_resolve(w, cid, null, 'declined', actor);
    elsif not exists (select 1 from public.shift_exchange_applications x where x.case_id = cid and x.status = 'pending_manager') then
      perform app_private.shift_exchange_resolve(w, cid, approvals, 'declined', actor);
    end if;
    return sent;

  elsif act = 'other_selected' then
    if pool then
      return app_private.notify('shift_changes.open_shift_taken', w, array[who_user], key || ':taken:' || aid::text,
        'Another teammate got it', day || '. Your schedule has not changed.', hub, actor, 'shift_exchange_case', cid, facts);
    end if;
    return app_private.notify('shift_changes.cover_taken', w, array[who_user], key || ':taken:' || aid::text,
      'Someone else is covering', day || '. Your schedule has not changed.', hub, actor, 'shift_exchange_case', cid, facts);

  elsif act = 'transfer_completed' then
    if c.kind = 'swap' then
      sent := app_private.notify('shift_changes.decided', w, array[who_user], key || ':decided:' || aid::text,
        'Your swap is approved', 'You now work ' || day || '.', hub, actor, 'shift_exchange_case', cid,
        facts || jsonb_build_object('outcome', 'approved'))
        + app_private.notify('shift_changes.decided', w, array[owner_user], key || ':decided:' || aid::text,
        'Your swap is approved', 'You now work ' || theirs || '.', hub, actor, 'shift_exchange_case', cid,
        facts || jsonb_build_object('outcome', 'approved'));
    else
      sent := app_private.notify('shift_changes.decided', w, array[who_user], key || ':decided:' || aid::text,
        case when pool then 'Your pickup is approved' else 'Your cover is approved' end, day || '. It''s yours now.',
        hub, actor, 'shift_exchange_case', cid, facts || jsonb_build_object('outcome', 'approved'))
        + app_private.notify('shift_changes.decided', w, array[owner_user], key || ':decided:' || aid::text,
        'You are no longer responsible for this shift', who_name || ' works ' || day || ' now.',
        hub, actor, 'shift_exchange_case', cid, facts || jsonb_build_object('outcome', 'approved'));
    end if;
    perform app_private.shift_exchange_resolve(w, cid, null, 'approved', actor);
    return sent;

  elsif act = 'case_closed' then
    askers := array(select app_private.shift_exchange_user(w, x.employee_id) from public.shift_exchange_applications x
      where x.case_id = cid and x.status = 'closed_case_cancelled');
    if actor is not distinct from owner_user then
      -- Taken back (plan §3 Release: "Maria kept this shift").
      sent := app_private.notify(case when pool then 'shift_changes.open_shift_kept' else 'shift_changes.closed' end, w, askers,
        key || ':closed', case when pool then owner_name || ' kept this shift' else owner_name || ' cancelled the request' end,
        day || '. Your schedule has not changed.', hub, actor, 'shift_exchange_case', cid, facts);
    else
      -- A manager's reason is for who asked, as a decline's is.
      sent := app_private.notify_rows(w, actor, (
        select coalesce(jsonb_agg(jsonb_build_object('type', 'shift_changes.closed', 'user_id', app_private.shift_exchange_user(w, x.employee_id),
          'event_key', key || ':closed', 'title', 'A manager closed the request for ' || owner_name || '''s shift',
          'body', coalesce(nullif(btrim(coalesce(x.reason, '')), ''), day || '. Your schedule has not changed.'),
          'url', hub, 'subject_type', 'shift_exchange_case', 'subject_id', cid, 'data', facts)), '[]'::jsonb)
        from public.shift_exchange_applications x where x.case_id = cid and x.status = 'closed_case_cancelled'))
        + app_private.notify('shift_changes.closed', w, array[owner_user], key || ':closed', 'A manager closed your request',
        day || '. You are still responsible for this shift.', hub, actor, 'shift_exchange_case', cid, facts);
    end if;
    perform app_private.shift_exchange_resolve(w, cid, null, 'cancelled', actor);
    return sent;

  elsif act in ('expired', 'invalidated') and aid is not null then
    -- One acceptance ended (refresh_weekly_exchange_terms: the new hours overlap the teammate's other shift);
    -- the request stays open: only that teammate hears it, and only their cards close.
    sent := app_private.notify('shift_changes.closed', w, array[who_user], key || ':ended:' || aid::text,
      'Your request for ' || owner_name || '''s shift ended',
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
      + app_private.notify('shift_changes.closed', w, askers, key || ':closed', 'The request for ' || owner_name || '''s shift closed',
        case when act = 'expired' then 'It closed 4 hours before the shift. ' else 'The shift changed, so it ended. ' end
        || 'Your schedule has not changed.', hub, actor, 'shift_exchange_case', cid, facts);
    perform app_private.shift_exchange_resolve(w, cid, null, case when act = 'expired' then 'expired' else 'shift_changed' end, actor);
    return sent;
  end if;
  return 0;
end;
$$;

-- 5. The one place every step goes through --------------------------------------------------------------

create or replace function public.shift_exchange_emit(actor uuid, w uuid, cid uuid, aid uuid, act text, msg text,
  private_msg text default '') returns void
language plpgsql set search_path = '' as $$
begin
  -- The case's history (Shift Hub, Requests): one row per step.
  insert into public.shift_exchange_events(workspace_id,case_id,application_id,actor_user_id,action,message,private_note)
  values(w,cid,aid,actor,act,msg,private_msg);
  -- And the people the step changes (TAKAS-BILDIRIM).
  perform app_private.shift_exchange_tell(actor, w, cid, aid, act);
end; $$;

-- 6. Reminders --------------------------------------------------------------------------------------------

-- A request waiting for a manager: every 12 hours from the first ask to whoever has not decided, and once
-- 4 hours before it closes (plan §3 Müdür). A request first asked inside those last 4 hours had its
-- first notice as its last. Each notice once (its event key); returns how many were written.
create or replace function app_private.shift_exchange_remind(pass_limit integer default 500) returns integer
language plpgsql set search_path = '' as $$
declare
  c public.shift_exchange_cases%rowtype;
  a public.shift_exchange_applications%rowtype;
  first_ask timestamptz;
  waiting uuid[];
  owner_name text;
  who_name text;
  said text;
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
    said := case when c.kind = 'swap'
      then owner_name || ' and ' || who_name || ' want to swap ' || app_private.shift_exchange_shift_text(c.workspace_id, c.offered_snapshot)
        || ' for ' || app_private.shift_exchange_shift_text(c.workspace_id, c.requested_snapshot)
      else who_name || ' wants ' || owner_name || '''s ' || app_private.shift_exchange_shift_text(c.workspace_id, c.offered_snapshot) end;
    if now() >= c.expires_at - interval '4 hours' then
      if first_ask >= c.expires_at - interval '4 hours'
        or exists (select 1 from public.person_notifications n where n.workspace_id = c.workspace_id
                   and n.subject_id = c.id and n.event_key = 'case:' || c.id::text || ':last_call') then
        continue;
      end if;
      -- A new reminder replaces the one before it.
      perform app_private.shift_exchange_resolve(c.workspace_id, c.id, array['shift_changes.approval_reminder'], 'reminded_again', null, waiting);
      zone := coalesce(c.offered_snapshot ->> 'timezone', 'UTC');
      fmt := (select x.time_format from public.workspace_scheduling_settings x where x.workspace_id = c.workspace_id);
      done := done + app_private.notify('shift_changes.approval_reminder', c.workspace_id, waiting, 'case:' || c.id::text || ':last_call',
        'Decide by ' || to_char(c.expires_at at time zone zone, case when fmt = '24h' then 'FMDy HH24:MI' else 'FMDy FMHH12:MI AM' end)
          || ' or it closes',
        said, '/app/schedule/requests?type=shift_changes', null, 'shift_exchange_case', c.id,
        jsonb_build_object('case_id', c.id, 'kind', c.kind, 'audience', c.audience, 'last_call', true));
    elsif not exists (select 1 from public.person_notifications n where n.workspace_id = c.workspace_id
                      and n.subject_id = c.id and n.event_key = 'case:' || c.id::text || ':last_call') then
      turn := floor(extract(epoch from now() - first_ask) / 43200)::integer;
      if turn >= 1 and not exists (select 1 from public.person_notifications n where n.workspace_id = c.workspace_id
                                   and n.subject_id = c.id and n.event_key = 'case:' || c.id::text || ':reminder:' || turn::text) then
        perform app_private.shift_exchange_resolve(c.workspace_id, c.id, array['shift_changes.approval_reminder'], 'reminded_again', null, waiting);
        done := done + app_private.notify('shift_changes.approval_reminder', c.workspace_id, waiting,
          'case:' || c.id::text || ':reminder:' || turn::text, 'Shift change still waits for your approval',
          said, '/app/schedule/requests?type=shift_changes', null, 'shift_exchange_case', c.id,
          jsonb_build_object('case_id', c.id, 'kind', c.kind, 'audience', c.audience));
      end if;
    end if;
    exception when others then
      -- One broken case does not stop the others' reminders (as time_off_sweep).
      raise warning 'shift-exchange-reminders: case % of workspace % failed: % %', c.id, c.workspace_id, sqlstate, sqlerrm;
    end;
  end loop;
  return done;
end;
$$;

revoke all on function app_private.shift_exchange_name(uuid, uuid) from public;
revoke all on function app_private.shift_exchange_user(uuid, uuid) from public;
revoke all on function app_private.shift_exchange_shift_text(uuid, jsonb) from public;
revoke all on function app_private.shift_exchange_deciders(uuid, uuid, uuid, boolean) from public;
revoke all on function app_private.shift_exchange_pool(uuid, uuid) from public;
revoke all on function app_private.shift_exchange_resolve(uuid, uuid, text[], text, uuid, uuid[]) from public;
revoke all on function app_private.shift_exchange_tell(uuid, uuid, uuid, uuid, text) from public;
revoke all on function app_private.shift_exchange_remind(integer) from public;

select cron.unschedule(jobid) from cron.job where jobname = 'shift-exchange-reminders';
select cron.schedule('shift-exchange-reminders', '*/5 * * * *', 'select app_private.shift_exchange_remind()');

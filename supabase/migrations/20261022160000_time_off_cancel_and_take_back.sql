-- Time off rebuild D4 (KARARLAR S-239 (4), (6), (1)): approved time off is cancelled or taken back.
--
-- The employee asks to cancel approved time off, started or not (ask_time_off_cancellation_service): a row of
-- kind 'cancel' in public.time_off_requests, with the time off's range and no time off of its own. One waits
-- per time off (time_off_requests_one_cancel). It is answered like a request (answer_time_off_service, which
-- now branches on the row's kind): the same people, nobody their own. Approved, only what is left of the time
-- off goes: from the answer on, or from its start when it has not started. Declined, nothing changes. Once
-- the time off is over a cancellation still waiting reads as expired; the sweep that writes it is D6.
-- A cancellation waiting is withdrawn like a request (withdraw_time_off_service).
--
-- Whoever may answer takes approved time off back with a note (take_back_time_off_service): only what has
-- not started goes, and a cancellation waiting closes.
--
-- Status words: time off cancelled is 'cancelled' and time off taken back 'revoked', whether or not some of
-- it was used; what was used stays in `effective`, and the view says until when ('used_until', null when
-- nothing was used). Shifts the approval opened stay open in every case: nothing here gives a shift back.
--
-- app_private.time_off_cut is the one helper that takes a range out of `effective`; it takes the workspace's
-- availability lock first, as every path that changes `effective` does.
--
-- Notices (subject 'time_off'): a cancellation asked goes to whoever may answer (S-169's order); its answer
-- to the employee; a revoke to the employee and the others who may answer. Open cards close on every end.

create unique index time_off_requests_one_cancel on public.time_off_requests (cancels_id)
where kind = 'cancel' and status = 'pending';

-- Takes `cut` out of what is left of the time off `target_request` and gives the row back. The workspace's
-- availability lock comes first: everything that changes `effective` holds it.
create function app_private.time_off_cut(target_request uuid, cut tstzrange)
returns public.time_off_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_request public.time_off_requests;
begin
  select * into found_request from public.time_off_requests r where r.id = target_request;
  if not found or found_request.kind <> 'leave' then
    raise exception 'Time off request not found' using errcode = 'P0002', hint = 'time_off.not_found';
  end if;
  perform public.availability_lock_workspace(found_request.workspace_id);
  update public.time_off_requests r
  set effective = r.effective - tstzmultirange(time_off_cut.cut), revision = r.revision + 1, updated_at = now()
  where r.id = target_request
  returning * into found_request;
  return found_request;
end;
$$;

revoke all on function app_private.time_off_cut(uuid, tstzrange) from public;

-- One request as the employee's screen reads it. Waiting past its start (time off) or past its end (a
-- cancellation) reads as expired. Time off says the cancellation last asked of it, unless withdrawn, and
-- until when it was used once cancelled or taken back.
create or replace function app_private.time_off_request_view(r public.time_off_requests)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id,
    'kind', r.kind,
    'cancels_id', r.cancels_id,
    'kind_of_leave', r.kind_of_leave,
    'status', case when r.status = 'pending' and r.kind = 'leave' and r.starts_at <= now() then 'expired'
      when r.status = 'pending' and r.kind = 'cancel' and r.ends_at <= now() then 'expired'
      else r.status end,
    'starts_at', r.starts_at,
    'ends_at', r.ends_at,
    'all_day', r.all_day,
    'time_timezone', r.time_timezone,
    'start_date', (r.starts_at at time zone r.time_timezone)::date,
    'end_date', case when r.all_day or (r.ends_at at time zone r.time_timezone)::time = '00:00'
      then (r.ends_at at time zone r.time_timezone)::date - 1 else (r.ends_at at time zone r.time_timezone)::date end,
    'start_time', case when r.all_day then null else to_char(r.starts_at at time zone r.time_timezone, 'HH24:MI') end,
    'end_time', case when r.all_day then null
      when (r.ends_at at time zone r.time_timezone)::time = '00:00' then '24:00'
      else to_char(r.ends_at at time zone r.time_timezone, 'HH24:MI') end,
    'note', r.note,
    'revision', r.revision,
    'created_at', r.created_at,
    'decided_at', r.decided_at,
    'decided_by_name', case when r.decided_by is null then null else app_private.account_name(r.decided_by) end,
    'decision_note', r.decision_note,
    'ended_at', r.ended_at,
    'ended_by_name', case when r.ended_by is null then null else app_private.account_name(r.ended_by) end,
    'ended_note', r.ended_note,
    'used_until', case when r.kind = 'leave' and r.status in ('cancelled', 'revoked') and not isempty(r.effective)
      then upper(r.effective) end,
    'cancellation', (
      select jsonb_build_object(
        'id', c.id,
        'status', case when c.status = 'pending' and c.ends_at <= now() then 'expired' else c.status end,
        'note', c.note,
        'revision', c.revision,
        'created_at', c.created_at,
        'decided_at', c.decided_at,
        'decided_by_name', case when c.decided_by is null then null else app_private.account_name(c.decided_by) end,
        'decision_note', c.decision_note)
      from public.time_off_requests c
      where r.kind = 'leave' and c.cancels_id = r.id and c.workspace_id = r.workspace_id and c.kind = 'cancel'
        and c.status <> 'withdrawn'
      order by c.status = 'pending' desc, c.created_at desc, c.id desc
      limit 1))
$$;

-- The notices of a request (subject 'time_off'). Time off asked: whoever may answer, in S-169's order (a
-- manager of the person's location; where a location has none, the admins; with no admin, the owner).
-- Answered: the employee, either way; on an approval also those who were asked. Revoked: the employee and
-- the others who may answer. A cancellation asked: whoever may answer; answered: the employee. Every end
-- closes the cards still waiting for an answer.
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
begin
  select * into person from public.employee_profiles e where e.id = r.employee_id and e.workspace_id = r.workspace_id;
  name := btrim(coalesce(nullif(btrim(person.preferred_name), ''), person.first_name) || ' ' || person.last_name);
  if what = 'requested' or (r.kind = 'leave' and what in ('approved', 'revoked')) then
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
        days || coalesce(' · ' || left(r.note, 900), ''), card_url, actor, 'time_off', r.id,
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
      'time_off:' || r.id::text || ':requested', 'Time off request from ' || name,
      days || coalesce(' · ' || left(r.note, 900), ''), card_url, actor, 'time_off', r.id,
      jsonb_build_object('request_id', r.id, 'kind_of_leave', r.kind_of_leave));
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

-- The employee asks to cancel approved time off, as they last read it (its revision). The same request key
-- gives back the same cancellation; used for another, it is refused. Gives back the time off, carrying the
-- cancellation. Asking changes no time off and touches no shift: only the person's lock.
create function public.ask_time_off_cancellation_service(actor_user_id uuid, target_workspace_id uuid,
  target_request_id uuid, asked_note text, expected_revision integer, request_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_request public.time_off_requests;
  prior public.time_off_requests;
  created public.time_off_requests;
  note_text text := nullif(btrim(coalesce(asked_note, '')), '');
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'time_off.request_own');
  select * into found_request from public.time_off_requests r
  where r.id = target_request_id and r.workspace_id = target_workspace_id and r.kind = 'leave';
  if not found then
    raise exception 'Time off request not found' using errcode = 'P0002', hint = 'time_off.not_found';
  end if;
  perform app_private.authorize(actor_user_id, target_workspace_id, 'time_off.request_own', target_person => found_request.employee_id);
  if request_key is null or char_length(note_text) > 1000 then
    raise exception 'A request key is required; a note is at most 1000 characters' using errcode = '22023', hint = 'time_off.invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('time_off_person:' || found_request.employee_id::text, 0));

  select * into prior from public.time_off_requests r where r.client_key = request_key;
  if found then
    if prior.kind <> 'cancel' or prior.cancels_id is distinct from found_request.id or prior.note is distinct from note_text then
      raise exception 'This request key was used for something else' using errcode = 'PT409', hint = 'time_off.key_reused';
    end if;
    return app_private.time_off_request_view(found_request);
  end if;

  select * into found_request from public.time_off_requests r where r.id = target_request_id for update;
  if found_request.revision is distinct from expected_revision then
    raise exception 'This time off changed. Check it again' using errcode = 'PT409', hint = 'time_off.changed';
  end if;
  if found_request.status <> 'approved' then
    raise exception 'Only approved time off can be cancelled' using errcode = 'PT409', hint = 'time_off.not_approved';
  end if;
  if found_request.ends_at <= now() then
    raise exception 'This time off is over' using errcode = 'PT409', hint = 'time_off.ended';
  end if;
  if exists (select 1 from public.time_off_requests c
             where c.cancels_id = found_request.id and c.kind = 'cancel' and c.status = 'pending') then
    raise exception 'A cancellation is already waiting for an answer' using errcode = 'PT409', hint = 'time_off.cancel_pending';
  end if;

  insert into public.time_off_requests (workspace_id, employee_id, kind, cancels_id, starts_at, ends_at, all_day,
    time_timezone, kind_of_leave, note, created_by, client_key)
  values (found_request.workspace_id, found_request.employee_id, 'cancel', found_request.id, found_request.starts_at,
    found_request.ends_at, found_request.all_day, found_request.time_timezone, found_request.kind_of_leave, note_text,
    actor_user_id, request_key)
  returning * into created;
  perform app_private.time_off_request_tell(created, 'requested', actor_user_id);
  return app_private.time_off_request_view(found_request);
end;
$$;

revoke all on function public.ask_time_off_cancellation_service(uuid, uuid, uuid, text, integer, uuid) from public;
grant execute on function public.ask_time_off_cancellation_service(uuid, uuid, uuid, text, integer, uuid) to service_role;

-- The employee withdraws a request still waiting for an answer: time off before it starts, a cancellation
-- before the time off ends.
create or replace function public.withdraw_time_off_service(actor_user_id uuid, target_workspace_id uuid, target_request_id uuid,
  expected_revision integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_request public.time_off_requests;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'time_off.request_own');
  select * into found_request from public.time_off_requests r
  where r.id = target_request_id and r.workspace_id = target_workspace_id;
  if not found then
    raise exception 'Time off request not found' using errcode = 'P0002', hint = 'time_off.not_found';
  end if;
  perform app_private.authorize(actor_user_id, target_workspace_id, 'time_off.request_own', target_person => found_request.employee_id);
  perform pg_advisory_xact_lock(hashtextextended('time_off_person:' || found_request.employee_id::text, 0));
  select * into found_request from public.time_off_requests r where r.id = target_request_id for update;
  if found_request.revision is distinct from expected_revision then
    raise exception 'This request changed. Check it again' using errcode = 'PT409', hint = 'time_off.changed';
  end if;
  if found_request.status <> 'pending'
     or (found_request.kind = 'leave' and found_request.starts_at <= now())
     or (found_request.kind = 'cancel' and found_request.ends_at <= now()) then
    raise exception 'Only a request waiting for an answer can be withdrawn' using errcode = 'PT409', hint = 'time_off.not_pending';
  end if;
  update public.time_off_requests
  set status = 'withdrawn', ended_by = actor_user_id, ended_at = now(), revision = revision + 1, updated_at = now()
  where id = found_request.id
  returning * into found_request;
  perform app_private.time_off_request_tell(found_request, 'withdrawn', actor_user_id);
  return app_private.time_off_request_view(found_request);
end;
$$;

-- The answer. Approve or decline what was read (its revision). Time off: an approval also gives the print of
-- the shifts it opens; one whose start passed while it waited has expired, which is written and given back
-- with no error. A cancellation: an approval takes the rest of the time off out (from now, or from its start
-- when it has not started) and gives no shift back; one still waiting when the time off ended has expired.
create or replace function public.answer_time_off_service(actor_user_id uuid, target_workspace_id uuid, target_request_id uuid,
  verdict text, note text, expected_revision integer, expected_impact text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me app_private.actor_state;
  why text;
  found_request public.time_off_requests;
  parent public.time_off_requests;
  note_text text := nullif(btrim(coalesce(note, '')), '');
begin
  perform public.availability_lock_workspace(target_workspace_id);
  me := app_private.actor(actor_user_id, target_workspace_id);
  why := app_private.time_off_decider_why(me, null);
  if why is not null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || why, detail = 'time_off.decide';
  end if;
  select * into found_request from public.time_off_requests r
  where r.id = target_request_id and r.workspace_id = target_workspace_id;
  if not found then
    raise exception 'Time off request not found' using errcode = 'P0002', hint = 'time_off.not_found';
  end if;
  why := app_private.time_off_decider_why(me, found_request.employee_id);
  if why is not null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || why, detail = 'time_off.decide';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('time_off_person:' || found_request.employee_id::text, 0));
  select * into found_request from public.time_off_requests r where r.id = target_request_id for update;

  if verdict is null or verdict not in ('approve', 'decline') or char_length(note_text) > 1000 then
    raise exception 'Approve or decline; a note is at most 1000 characters' using errcode = '22023', hint = 'time_off.invalid';
  end if;

  if found_request.kind = 'cancel' then
    -- The time off ended while it waited: expired (the sweep would write the same).
    if found_request.status = 'pending' and found_request.ends_at <= now() then
      update public.time_off_requests
      set status = 'expired', revision = revision + 1, updated_at = now()
      where id = found_request.id
      returning * into found_request;
      perform app_private.time_off_request_tell(found_request, 'expired', null);
      return app_private.time_off_decider_view(found_request);
    end if;
    if found_request.revision is distinct from expected_revision then
      raise exception 'This request changed. Review it again' using errcode = 'PT409', hint = 'time_off.changed';
    end if;
    if found_request.status <> 'pending' then
      raise exception 'This request was already answered' using errcode = 'PT409', hint = 'time_off.not_pending';
    end if;
    select * into parent from public.time_off_requests r where r.id = found_request.cancels_id for update;
    if parent.status <> 'approved' then
      raise exception 'This time off is no longer approved' using errcode = 'PT409', hint = 'time_off.not_pending';
    end if;
    if verdict = 'approve' then
      parent := app_private.time_off_cut(parent.id, tstzrange(greatest(now(), parent.starts_at), parent.ends_at, '[)'));
      update public.time_off_requests
      set status = 'cancelled', ended_by = actor_user_id, ended_at = now(), updated_at = now()
      where id = parent.id;
      update public.time_off_requests
      set status = 'approved', decided_by = actor_user_id, decided_at = now(), decision_note = note_text,
          revision = revision + 1, updated_at = now()
      where id = found_request.id
      returning * into found_request;
    else
      update public.time_off_requests
      set status = 'declined', decided_by = actor_user_id, decided_at = now(), decision_note = note_text,
          revision = revision + 1, updated_at = now()
      where id = found_request.id
      returning * into found_request;
    end if;
    perform app_private.time_off_request_tell(found_request, found_request.status, actor_user_id);
    return app_private.time_off_decider_view(found_request);
  end if;

  -- Its start passed while it waited: expired (the sweep would write the same).
  if found_request.status = 'pending' and found_request.starts_at <= now() then
    update public.time_off_requests
    set status = 'expired', revision = revision + 1, updated_at = now()
    where id = found_request.id
    returning * into found_request;
    perform app_private.time_off_request_tell(found_request, 'expired', null);
    return app_private.time_off_decider_view(found_request);
  end if;
  if found_request.revision is distinct from expected_revision then
    raise exception 'This request changed. Review it again' using errcode = 'PT409', hint = 'time_off.changed';
  end if;
  if found_request.status <> 'pending' then
    raise exception 'This request was already answered' using errcode = 'PT409', hint = 'time_off.not_pending';
  end if;

  if verdict = 'approve' then
    if expected_impact is distinct from app_private.time_off_shifts_print(app_private.time_off_shifts_at_stake(found_request)) then
      raise exception 'The shifts this time off opens changed. Review them again' using errcode = 'PT409', hint = 'time_off.changed';
    end if;
    update public.time_off_requests
    set status = 'approved', effective = tstzmultirange(tstzrange(starts_at, ends_at, '[)')),
        decided_by = actor_user_id, decided_at = now(), decision_note = note_text,
        revision = revision + 1, updated_at = now()
    where id = found_request.id
    returning * into found_request;
    perform app_private.time_off_open_shifts(found_request, actor_user_id);
  else
    update public.time_off_requests
    set status = 'declined', decided_by = actor_user_id, decided_at = now(), decision_note = note_text,
        revision = revision + 1, updated_at = now()
    where id = found_request.id
    returning * into found_request;
  end if;
  perform app_private.time_off_request_tell(found_request, found_request.status, actor_user_id);
  return app_private.time_off_decider_view(found_request);
end;
$$;

-- Whoever may answer takes approved time off back, with a note, as they last read it. Only what has not
-- started goes; shifts its approval opened stay open; a cancellation waiting closes.
create function public.take_back_time_off_service(actor_user_id uuid, target_workspace_id uuid, target_request_id uuid,
  note text, expected_revision integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me app_private.actor_state;
  why text;
  found_request public.time_off_requests;
  closed uuid;
  note_text text := nullif(btrim(coalesce(note, '')), '');
begin
  perform public.availability_lock_workspace(target_workspace_id);
  me := app_private.actor(actor_user_id, target_workspace_id);
  why := app_private.time_off_decider_why(me, null);
  if why is not null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || why, detail = 'time_off.decide';
  end if;
  select * into found_request from public.time_off_requests r
  where r.id = target_request_id and r.workspace_id = target_workspace_id and r.kind = 'leave';
  if not found then
    raise exception 'Time off request not found' using errcode = 'P0002', hint = 'time_off.not_found';
  end if;
  why := app_private.time_off_decider_why(me, found_request.employee_id);
  if why is not null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || why, detail = 'time_off.decide';
  end if;
  if note_text is null then
    raise exception 'Say why you revoke this time off' using errcode = '22023', hint = 'time_off.note_required';
  end if;
  if char_length(note_text) > 1000 then
    raise exception 'A note is at most 1000 characters' using errcode = '22023', hint = 'time_off.invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('time_off_person:' || found_request.employee_id::text, 0));
  select * into found_request from public.time_off_requests r where r.id = target_request_id for update;
  if found_request.revision is distinct from expected_revision then
    raise exception 'This time off changed. Review it again' using errcode = 'PT409', hint = 'time_off.changed';
  end if;
  if found_request.status <> 'approved' then
    raise exception 'Only approved time off can be revoked' using errcode = 'PT409', hint = 'time_off.not_approved';
  end if;
  if found_request.ends_at <= now() then
    raise exception 'This time off is over' using errcode = 'PT409', hint = 'time_off.ended';
  end if;

  perform app_private.time_off_cut(found_request.id, tstzrange(greatest(now(), found_request.starts_at), found_request.ends_at, '[)'));
  update public.time_off_requests
  set status = 'revoked', ended_by = actor_user_id, ended_at = now(), ended_note = note_text, updated_at = now()
  where id = found_request.id
  returning * into found_request;

  for closed in
    update public.time_off_requests c
    set status = 'withdrawn', ended_by = actor_user_id, ended_at = now(), ended_note = 'The time off was revoked.',
        revision = c.revision + 1, updated_at = now()
    where c.cancels_id = found_request.id and c.kind = 'cancel' and c.status = 'pending'
    returning c.id
  loop
    perform app_private.notification_resolve(found_request.workspace_id, 'time_off', closed, 'revoked', actor_user_id);
  end loop;

  perform app_private.time_off_request_tell(found_request, 'revoked', actor_user_id);
  return app_private.time_off_decider_view(found_request);
end;
$$;

revoke all on function public.take_back_time_off_service(uuid, uuid, uuid, text, integer) from public;
grant execute on function public.take_back_time_off_service(uuid, uuid, uuid, text, integer) to service_role;

-- The employee's own time off: their zone and today there, where an answer comes from (their live
-- locations, primary first), and their time off, newest first; each carries its cancellation.
create or replace function public.my_time_off_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  person uuid;
  zone_name text;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee_hub.read');
  select e.id into person from public.employee_profiles e
  where e.workspace_id = target_workspace_id and e.user_id = actor_user_id and e.archived_at is null;
  if person is null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'employee_hub.read';
  end if;
  zone_name := app_private.time_off_timezone(target_workspace_id, person);
  return jsonb_build_object(
    'time_zone', zone_name,
    'today', case when zone_name is null then null else (now() at time zone zone_name)::date end,
    'location_names', coalesce((
      select jsonb_agg(l.name order by a.is_primary desc, a.assigned_at)
      from public.employee_location_assignments a
      join public.locations l on l.id = a.location_id and l.workspace_id = a.workspace_id
      where a.workspace_id = target_workspace_id and a.employee_id = person and a.ended_at is null
        and app_private.location_is_live(l)), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(app_private.time_off_request_view(r) order by r.starts_at desc, r.created_at desc)
      from (select * from public.time_off_requests q
            where q.workspace_id = target_workspace_id and q.employee_id = person and q.kind = 'leave'
            order by q.starts_at desc limit 200) r), '[]'::jsonb));
end;
$$;

-- Requests → Time off: the requests this person may answer, waiting or answered (withdrawn ones close
-- quietly and are not listed, S-161), one page at a time; a cancellation is a request of its own. Waiting:
-- time off before it starts, a cancellation before the time off ends. Sorted and paged here (BL-724, BL-729):
--   needs_decision  waiting first, the soonest start first; then the rest, the latest answer first
--   starts          the soonest start first
--   newest          the newest request first
-- A view narrows it: all, open (waiting), closed (the rest). One request by its id for a link.
create or replace function public.time_off_requests_service(actor_user_id uuid, target_workspace_id uuid,
  target_view text default 'all', target_location_id uuid default null, target_search text default '',
  target_sort text default 'needs_decision', target_page integer default 1, target_page_size integer default 50,
  target_request_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me app_private.actor_state := app_private.actor(actor_user_id, target_workspace_id);
  why text := app_private.time_off_decider_why(me, null);
  needle text := nullif(btrim(coalesce(target_search, '')), '');
  result jsonb;
begin
  if why is not null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || why, detail = 'time_off.decide';
  end if;
  if target_view is null or target_view not in ('all', 'open', 'closed')
     or target_sort is null or target_sort not in ('needs_decision', 'starts', 'newest')
     or target_page is null or target_page < 1 or target_page_size is null or target_page_size not in (25, 50, 100)
     or char_length(needle) > 200 then
    raise exception 'Choose a view, a sort and a page' using errcode = '22023', hint = 'time_off.invalid';
  end if;

  with answerable as materialized (
    select e.id, btrim(coalesce(nullif(btrim(e.preferred_name), ''), e.first_name) || ' ' || e.last_name) as name
    from public.employee_profiles e
    where e.workspace_id = target_workspace_id
      and exists (select 1 from public.time_off_requests q where q.workspace_id = target_workspace_id and q.employee_id = e.id)
      and app_private.time_off_decider_why(me, e.id) is null
  ), listed as materialized (
    select r as request, r.id, r.starts_at, r.created_at, coalesce(greatest(r.decided_at, r.ended_at), r.updated_at) as answered_at,
      (r.status = 'pending' and case when r.kind = 'cancel' then r.ends_at else r.starts_at end > now()) as waiting
    from public.time_off_requests r
    join answerable person on person.id = r.employee_id
    where r.workspace_id = target_workspace_id
      and r.status in ('pending', 'approved', 'declined', 'expired', 'cancelled', 'revoked')
      and (target_request_id is null or r.id = target_request_id)
      and (target_location_id is null or exists (
        select 1 from public.employee_location_assignments a
        where a.workspace_id = target_workspace_id and a.employee_id = r.employee_id and a.location_id = target_location_id
          and a.ended_at is null))
      and (needle is null or strpos(lower(person.name), lower(needle)) > 0 or strpos(lower(coalesce(r.note, '')), lower(needle)) > 0)
  ), viewed as (
    select * from listed l
    where target_view = 'all' or (target_view = 'open') = l.waiting
  ), page as (
    select v.request, row_number() over (order by
        case when target_sort = 'needs_decision' then not v.waiting end,
        case when target_sort = 'needs_decision' and v.waiting then v.starts_at end,
        case when target_sort = 'needs_decision' then v.answered_at end desc,
        case when target_sort = 'starts' then v.starts_at end,
        case when target_sort = 'newest' then v.created_at end desc,
        v.id) as at
    from viewed v
  )
  select jsonb_build_object(
    'total', (select count(*)::integer from viewed),
    'waiting', (select count(*)::integer from listed l where l.waiting),
    'page', target_page,
    'page_size', target_page_size,
    'requests', coalesce((
      select jsonb_agg(app_private.time_off_decider_view(p.request) order by p.at)
      from page p
      where p.at > (target_page - 1) * target_page_size and p.at <= target_page * target_page_size), '[]'::jsonb))
  into result;
  return result;
end;
$$;

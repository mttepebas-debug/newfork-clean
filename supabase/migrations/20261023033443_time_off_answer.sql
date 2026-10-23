-- Time off rebuild D3 (KARARLAR S-239): a manager, an admin or the owner answers a time off request. One
-- answer is enough. Approving opens the person's published shifts that the time off covers and that have not
-- started; the employee hears the answer either way, and on an approval so do the others who could have
-- answered. Nothing here touches the old tables.
--
-- Who answers: app_private.time_off_decider_why. A manager of one of the person's live locations who may
-- decide there (time_off.decide, place), or an admin or the owner (time_off.decide_alone, org), asked of the
-- core in that order after the question without a target (BL-411). The core's no_self holds for both
-- actions: nobody answers their own request, the owner neither (S-239 (1)); the old system's "nobody else,
-- so the owner answers their own" (decision_tier) is not asked here. A one-person workspace's owner gets no
-- answer and their request expires at its start. A manager past a document deadline drops out in the core
-- (document_blocked).
--
-- Everything that changes `effective` takes the workspace's availability lock first, then the person's.
--
-- New: time_off_request_releases (what an approval opened), the answer, the shifts at stake, the deciders'
-- list, the employee form's shift count, and the notices. Readers that now read the new table too: the
-- announcement's tie to a time off decision, Home's waiting and answered time off, the dashboard's count,
-- and Employee Hub's leave_days (My shifts and Home's week).

update public.notification_types set heard_by = '{self,time_off.decide}' where key = 'time_off.decided';

-- What an approval opened: the shift as it was, and who answered. Kept for the record and for the
-- announcement's rule that a shift tied to a time off decision is not removed.
create table public.time_off_request_releases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  request_id uuid not null,
  published_shift_id uuid not null,
  before_assignment jsonb not null,
  actor_user_id uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  constraint time_off_request_releases_request_fkey foreign key (request_id, workspace_id)
    references public.time_off_requests (id, workspace_id),
  constraint time_off_request_releases_shift_fkey foreign key (published_shift_id, workspace_id)
    references public.schedule_published_shifts (id, workspace_id),
  constraint time_off_request_releases_once unique (request_id, published_shift_id)
);

create index time_off_request_releases_shift on public.time_off_request_releases (published_shift_id, workspace_id);

alter table public.time_off_request_releases enable row level security;
revoke all on table public.time_off_request_releases from anon, authenticated;

-- Why `state` may not answer a request of `person`, or null when they may. With no person, only the question
-- without a target: whoever may answer nowhere hears why before a request is looked up (BL-411).
create function app_private.time_off_decider_why(state app_private.actor_state, person uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  decide_rule app_private.authz_actions;
  alone_rule app_private.authz_actions;
  why text;
  alone text;
  place uuid;
begin
  select * into decide_rule from app_private.authz_actions a where a.key = 'time_off.decide';
  select * into alone_rule from app_private.authz_actions a where a.key = 'time_off.decide_alone';
  why := app_private.authz_check(state, decide_rule, null, null, null);
  if why is not null and why <> 'out_of_scope' then
    return why;
  end if;
  if person is null then
    return null;
  end if;
  alone := app_private.authz_check(state, alone_rule, null, person, null);
  -- 'rank' is their own request (no_self): no location changes that.
  if alone is null or alone = 'rank' then
    return alone;
  end if;
  for place in
    select a.location_id
    from public.employee_location_assignments a
    join public.locations l on l.id = a.location_id and l.workspace_id = a.workspace_id
    where a.workspace_id = state.workspace_id and a.employee_id = person and a.ended_at is null
      and app_private.location_is_live(l)
    order by a.is_primary desc, a.location_id
  loop
    if app_private.authz_check(state, decide_rule, array[place], person, null) is null then
      return null;
    end if;
  end loop;
  return alone;
end;
$$;

revoke all on function app_private.time_off_decider_why(app_private.actor_state, uuid) from public;

create function app_private.time_off_decider_reason(actor uuid, w uuid, person uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.time_off_decider_why(app_private.actor(time_off_decider_reason.actor, time_off_decider_reason.w),
    time_off_decider_reason.person)
$$;

revoke all on function app_private.time_off_decider_reason(uuid, uuid, uuid) from public;

-- "Nov 3", "Nov 3–5", "Nov 30–Dec 2": the request's days in the zone it was asked in.
create function app_private.time_off_days_label(r public.time_off_requests)
returns text
language sql
stable
set search_path = ''
as $$
  select case when d.first_day = d.last_day then to_char(d.first_day, 'FMMon FMDD')
    when date_trunc('month', d.first_day) = date_trunc('month', d.last_day)
      then to_char(d.first_day, 'FMMon FMDD') || '–' || to_char(d.last_day, 'FMDD')
    else to_char(d.first_day, 'FMMon FMDD') || '–' || to_char(d.last_day, 'FMMon FMDD') end
  from (select (r.starts_at at time zone r.time_timezone)::date as first_day,
               ((r.ends_at - interval '1 microsecond') at time zone r.time_timezone)::date as last_day) d
$$;

revoke all on function app_private.time_off_days_label(public.time_off_requests) from public;

-- The person's published shifts the request covers that have not started: what an approval opens.
create function app_private.time_off_shifts_at_stake(r public.time_off_requests)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by x ->> 'starts_at', x ->> 'id'), '[]'::jsonb)
  from jsonb_array_elements(public.time_off_assignment_impact(r.workspace_id, r.employee_id,
    tstzmultirange(tstzrange(r.starts_at, r.ends_at, '[)')))) x
  where (x ->> 'starts_at')::timestamptz > now()
$$;

revoke all on function app_private.time_off_shifts_at_stake(public.time_off_requests) from public;

-- One print of those shifts: an answer given on another picture of them is refused (time_off.changed).
create function app_private.time_off_shifts_print(shifts jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(coalesce(string_agg(concat_ws('|', x ->> 'id', x ->> 'location_id', x ->> 'job_id', x ->> 'scheduled_date',
    x ->> 'start_time', x ->> 'end_time', x ->> 'employee_id'), ',' order by x ->> 'id'), ''))
  from jsonb_array_elements(coalesce(shifts, '[]'::jsonb)) x
$$;

revoke all on function app_private.time_off_shifts_print(jsonb) from public;

-- A request as the people who answer it read it: the employee's view, who asked, where they work (live
-- locations, primary first) and how many shifts its approval opened.
create function app_private.time_off_decider_view(r public.time_off_requests)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.time_off_request_view(r) || jsonb_build_object(
    'employee_id', r.employee_id,
    'employee_name', (select btrim(coalesce(nullif(btrim(e.preferred_name), ''), e.first_name) || ' ' || e.last_name)
                      from public.employee_profiles e where e.id = r.employee_id),
    'location_names', coalesce((
      select jsonb_agg(l.name order by a.is_primary desc, l.name)
      from public.employee_location_assignments a
      join public.locations l on l.id = a.location_id and l.workspace_id = a.workspace_id
      where a.workspace_id = r.workspace_id and a.employee_id = r.employee_id and a.ended_at is null
        and app_private.location_is_live(l)), '[]'::jsonb),
    'shifts_opened', (select count(*)::integer from public.time_off_request_releases x
                      where x.workspace_id = r.workspace_id and x.request_id = r.id))
$$;

revoke all on function app_private.time_off_decider_view(public.time_off_requests) from public;

-- An approval opens the shifts at stake: each is recorded and unassigned from the person only if it is still
-- theirs (time_off.changed otherwise); the shift changes they were part of are reconciled, and the ones still
-- open on them can no longer happen.
create function app_private.time_off_open_shifts(r public.time_off_requests, actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s jsonb;
  changes jsonb := '[]';
  other record;
begin
  for s in select x from jsonb_array_elements(app_private.time_off_shifts_at_stake(r)) x loop
    insert into public.time_off_request_releases (workspace_id, request_id, published_shift_id, before_assignment, actor_user_id)
    values (r.workspace_id, r.id, (s ->> 'id')::uuid, s, actor);
    update public.schedule_published_shifts set employee_id = null
    where workspace_id = r.workspace_id and id = (s ->> 'id')::uuid and employee_id = r.employee_id;
    if not found then
      raise exception 'A published shift changed before it could be opened. Review it again'
        using errcode = 'PT409', hint = 'time_off.changed';
    end if;
    changes := changes || jsonb_build_array(s || jsonb_build_object('new_employee_id', null));
  end loop;
  if jsonb_array_length(changes) > 0 then
    perform public.shift_exchange_reconcile_batch(actor, r.workspace_id, changes);
    for other in select c.id from public.shift_exchange_cases c where c.workspace_id = r.workspace_id and c.status = 'open'
     and exists (select 1 from jsonb_array_elements(changes) x where (x ->> 'source_id')::uuid in (c.offered_source_id, c.requested_source_id)) loop
      update public.shift_exchange_cases set status = 'invalidated', revision = revision + 1, updated_at = now() where id = other.id;
      update public.shift_exchange_applications set status = 'invalidated', updated_at = now()
      where case_id = other.id and status in ('invited', 'pending_manager');
      perform public.shift_exchange_emit(actor, r.workspace_id, other.id, null, 'invalidated',
        'An involved assignment was released with approved time off. Review the current schedule.');
    end loop;
    perform realtime.send(jsonb_build_object('workspace_id', r.workspace_id, 'request_id', r.id), 'changed',
      'shift-exchanges:' || r.workspace_id::text, true);
  end if;
  return changes;
end;
$$;

revoke all on function app_private.time_off_open_shifts(public.time_off_requests, uuid) from public;

-- The notices of a request (subject 'time_off'). Asked: whoever may answer, in S-169's order (a manager of
-- the person's location; where a location has none, the admins; with no admin, the owner). Answered: the
-- employee, either way; on an approval also those who were asked. Every answer, a withdrawal and an expiry
-- close the cards still waiting for one.
create function app_private.time_off_request_tell(r public.time_off_requests, what text, actor uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  person public.employee_profiles%rowtype;
  name text;
  days text := app_private.time_off_days_label(r);
  card_url text := '/app/schedule/requests?type=time_off&request=' || r.id::text;
  asked uuid[];
  opened integer;
  sent integer := 0;
begin
  select * into person from public.employee_profiles e where e.id = r.employee_id and e.workspace_id = r.workspace_id;
  name := btrim(coalesce(nullif(btrim(person.preferred_name), ''), person.first_name) || ' ' || person.last_name);
  if what in ('requested', 'approved') then
    asked := app_private.notify_deciders(r.workspace_id, 'time_off.decide', array(
      select a.location_id
      from public.employee_location_assignments a
      join public.locations l on l.id = a.location_id and l.workspace_id = a.workspace_id
      where a.workspace_id = r.workspace_id and a.employee_id = r.employee_id and a.ended_at is null
        and app_private.location_is_live(l)
      order by a.location_id), r.employee_id, 'time_off.decide_alone');
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
      r.decision_note, '/app/employee-hub/my-availability?section=time-off', actor, 'time_off', r.id,
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
  perform app_private.notification_resolve(r.workspace_id, 'time_off', r.id, what, actor);
  return sent;
end;
$$;

revoke all on function app_private.time_off_request_tell(public.time_off_requests, text, uuid) from public;

-- The answer. Approve or decline what was read (its revision; an approval also the shifts it opens, as a
-- print). A request whose start passed while it waited has expired: that is written and given back, with
-- no error.
create function public.answer_time_off_service(actor_user_id uuid, target_workspace_id uuid, target_request_id uuid,
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

  if verdict is null or verdict not in ('approve', 'decline') or char_length(note_text) > 1000
     or found_request.kind <> 'leave' then
    raise exception 'Approve or decline; a note is at most 1000 characters' using errcode = '22023', hint = 'time_off.invalid';
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

revoke all on function public.answer_time_off_service(uuid, uuid, uuid, text, text, integer, text) from public;
grant execute on function public.answer_time_off_service(uuid, uuid, uuid, text, text, integer, text) to service_role;

-- What approving would open, location by location, with the print the answer gives back. The answerer sees
-- the shifts of the locations whose schedule they read; the others only as a count.
create function public.time_off_impact_service(actor_user_id uuid, target_workspace_id uuid, target_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me app_private.actor_state := app_private.actor(actor_user_id, target_workspace_id);
  read_rule app_private.authz_actions;
  why text;
  found_request public.time_off_requests;
  at_stake jsonb := '[]';
begin
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
  select * into read_rule from app_private.authz_actions a where a.key = 'schedule.read';
  if found_request.status = 'pending' and found_request.starts_at > now() then
    at_stake := app_private.time_off_shifts_at_stake(found_request);
  end if;
  return jsonb_build_object(
    'request', app_private.time_off_decider_view(found_request),
    'fingerprint', app_private.time_off_shifts_print(at_stake),
    'shift_count', jsonb_array_length(at_stake),
    'hidden_shift_count', (select count(*)::integer from jsonb_array_elements(at_stake) x
      where app_private.authz_check(me, read_rule, array[(x ->> 'location_id')::uuid], null, null) is not null),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object('location_id', place.location_id, 'location_name', place.location_name,
        'shifts', place.shifts) order by place.location_name, place.location_id)
      from (
        select (x ->> 'location_id')::uuid as location_id, min(x ->> 'location_name') as location_name,
          jsonb_agg(jsonb_build_object(
            'id', x ->> 'id',
            'scheduled_date', x ->> 'scheduled_date',
            'start_time', to_char((x ->> 'start_time')::time, 'HH24:MI'),
            'end_time', to_char((x ->> 'end_time')::time, 'HH24:MI'),
            'job_name', x ->> 'job_name',
            'starts_at', x ->> 'starts_at',
            'ends_at', x ->> 'ends_at',
            'timezone', x ->> 'timezone') order by x ->> 'starts_at', x ->> 'id') as shifts
        from jsonb_array_elements(at_stake) x
        where app_private.authz_check(me, read_rule, array[(x ->> 'location_id')::uuid], null, null) is null
        group by (x ->> 'location_id')::uuid
      ) place), '[]'::jsonb));
end;
$$;

revoke all on function public.time_off_impact_service(uuid, uuid, uuid) from public;
grant execute on function public.time_off_impact_service(uuid, uuid, uuid) to service_role;

-- Requests → Time off: the requests this person may answer, waiting or answered (withdrawn ones close
-- quietly and are not listed, S-161), one page at a time. Sorted and paged here (BL-724, BL-729):
--   needs_decision  waiting first, the soonest start first; then the rest, the latest answer first
--   starts          the soonest start first
--   newest          the newest request first
-- A view narrows it: all, open (waiting), closed (the rest). One request by its id for a link.
create function public.time_off_requests_service(actor_user_id uuid, target_workspace_id uuid,
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
    select r as request, r.id, r.starts_at, r.created_at, coalesce(r.decided_at, r.updated_at) as answered_at,
      (r.status = 'pending' and r.starts_at > now()) as waiting
    from public.time_off_requests r
    join answerable person on person.id = r.employee_id
    where r.workspace_id = target_workspace_id
      and r.kind = 'leave'
      and r.status in ('pending', 'approved', 'declined', 'expired')
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

revoke all on function public.time_off_requests_service(uuid, uuid, text, uuid, text, text, integer, integer, uuid) from public;
grant execute on function public.time_off_requests_service(uuid, uuid, text, uuid, text, text, integer, integer, uuid) to service_role;

-- The employee's form: their published shifts in the days and hours they are asking for, that have not
-- started (an approval would open them). The same range as ask_time_off_service; no hours is All day.
create function public.my_time_off_shifts_service(actor_user_id uuid, target_workspace_id uuid, first_day date,
  last_day date, from_clock time default null, to_clock time default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  person uuid;
  zone_name text;
  begins timestamptz;
  ends timestamptz;
  at_stake jsonb;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'time_off.request_own');
  select e.id into person from public.employee_profiles e
  where e.workspace_id = target_workspace_id and e.user_id = actor_user_id and e.archived_at is null;
  if person is null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'time_off.request_own';
  end if;
  if first_day is null or last_day is null or (from_clock is null) <> (to_clock is null) or from_clock = '24:00' then
    raise exception 'Choose the days, and both hours unless it is all day' using errcode = '22023', hint = 'time_off.invalid';
  end if;
  if last_day < first_day then
    raise exception 'The last day is before the first day' using errcode = '22023', hint = 'time_off.order';
  end if;
  zone_name := app_private.time_off_timezone(target_workspace_id, person);
  if zone_name is null then
    raise exception 'You need a location before you can ask for time off' using errcode = '55000', hint = 'time_off.no_location';
  end if;
  if from_clock is null then
    if last_day - first_day + 1 > 31 then
      raise exception 'Ask for 31 days or fewer at a time' using errcode = '22023', hint = 'time_off.too_long';
    end if;
    begins := first_day::timestamp at time zone zone_name;
    ends := (last_day + 1)::timestamp at time zone zone_name;
  else
    if last_day + to_clock <= first_day + from_clock then
      raise exception 'The end is before the start' using errcode = '22023', hint = 'time_off.order';
    end if;
    if (last_day + to_clock) - (first_day + from_clock) > interval '31 days' then
      raise exception 'Ask for 31 days or fewer at a time' using errcode = '22023', hint = 'time_off.too_long';
    end if;
    begin
      begins := public.time_off_resolve_clock(first_day + from_clock, zone_name, 'earlier');
      ends := public.time_off_resolve_clock(last_day + to_clock, zone_name, 'earlier');
    exception when sqlstate '22023' then
      raise exception 'These hours do not exist on this date in your time zone'
        using errcode = '22023', hint = 'time_off.no_such_time';
    end;
  end if;
  select coalesce(jsonb_agg(x order by x ->> 'starts_at', x ->> 'id'), '[]'::jsonb) into at_stake
  from jsonb_array_elements(public.time_off_assignment_impact(target_workspace_id, person,
    tstzmultirange(tstzrange(begins, ends, '[)')))) x
  where (x ->> 'starts_at')::timestamptz > now();
  return jsonb_build_object(
    'count', jsonb_array_length(at_stake),
    'shifts', coalesce((select jsonb_agg(jsonb_build_object(
        'id', x ->> 'id',
        'location_name', x ->> 'location_name',
        'job_name', x ->> 'job_name',
        'scheduled_date', x ->> 'scheduled_date',
        'start_time', to_char((x ->> 'start_time')::time, 'HH24:MI'),
        'end_time', to_char((x ->> 'end_time')::time, 'HH24:MI'))) from jsonb_array_elements(at_stake) x), '[]'::jsonb));
end;
$$;

revoke all on function public.my_time_off_shifts_service(uuid, uuid, date, date, time, time) from public;
grant execute on function public.my_time_off_shifts_service(uuid, uuid, date, date, time, time) to service_role;

-- The employee asks: as in D2, and now whoever may answer hears of it.
create or replace function public.ask_time_off_service(
  actor_user_id uuid, target_workspace_id uuid, asked_kind text, first_day date, last_day date,
  asked_all_day boolean, from_clock time, to_clock time, asked_note text, expected_timezone text, request_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  person uuid;
  zone_name text;
  prior public.time_off_requests;
  shown jsonb;
  note_text text := nullif(btrim(coalesce(asked_note, '')), '');
  begins timestamptz;
  ends timestamptz;
  created public.time_off_requests;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'time_off.request_own');
  select e.id into person from public.employee_profiles e
  where e.workspace_id = target_workspace_id and e.user_id = actor_user_id and e.archived_at is null;
  if person is null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'time_off.request_own';
  end if;
  if request_key is null then
    raise exception 'A request key is required' using errcode = '22023', hint = 'time_off.invalid';
  end if;
  -- One request at a time per person, so two cannot both pass the overlap check. Nothing else waits.
  perform pg_advisory_xact_lock(hashtextextended('time_off_person:' || person::text, 0));

  select * into prior from public.time_off_requests r where r.client_key = request_key;
  if found then
    shown := app_private.time_off_request_view(prior);
    if prior.employee_id is distinct from person or prior.kind <> 'leave'
       or prior.kind_of_leave is distinct from asked_kind or prior.all_day is distinct from asked_all_day
       or prior.note is distinct from note_text
       or shown ->> 'start_date' is distinct from first_day::text or shown ->> 'end_date' is distinct from last_day::text
       or shown ->> 'start_time' is distinct from (case when asked_all_day then null else to_char(from_clock, 'HH24:MI') end)
       or shown ->> 'end_time' is distinct from (case when asked_all_day then null else to_char(to_clock, 'HH24:MI') end) then
      raise exception 'This request key was used for other time off' using errcode = 'PT409', hint = 'time_off.key_reused';
    end if;
    return shown;
  end if;

  if asked_kind is null or asked_kind not in ('vacation', 'sick', 'personal', 'other')
     or first_day is null or last_day is null or asked_all_day is null
     or (not asked_all_day and (from_clock is null or to_clock is null or from_clock = '24:00'))
     or char_length(note_text) > 1000 then
    raise exception 'Choose a type, the days, and the hours unless it is all day; a note is at most 1000 characters'
      using errcode = '22023', hint = 'time_off.invalid';
  end if;
  if last_day < first_day then
    raise exception 'The last day is before the first day' using errcode = '22023', hint = 'time_off.order';
  end if;

  zone_name := app_private.time_off_timezone(target_workspace_id, person);
  if zone_name is null then
    raise exception 'You need a location before you can ask for time off' using errcode = '55000', hint = 'time_off.no_location';
  end if;
  if expected_timezone is distinct from zone_name then
    raise exception 'The time zone of your location changed. Check the hours again before sending'
      using errcode = 'PT409', hint = 'time_off.timezone_changed';
  end if;

  if asked_all_day then
    if last_day - first_day + 1 > 31 then
      raise exception 'Ask for 31 days or fewer at a time' using errcode = '22023', hint = 'time_off.too_long';
    end if;
    begins := first_day::timestamp at time zone zone_name;
    ends := (last_day + 1)::timestamp at time zone zone_name;
  else
    if last_day + to_clock <= first_day + from_clock then
      raise exception 'The end is before the start' using errcode = '22023', hint = 'time_off.order';
    end if;
    if (last_day + to_clock) - (first_day + from_clock) > interval '31 days' then
      raise exception 'Ask for 31 days or fewer at a time' using errcode = '22023', hint = 'time_off.too_long';
    end if;
    begin
      -- A clock the zone repeats is its first time; one it skips does not exist.
      begins := public.time_off_resolve_clock(first_day + from_clock, zone_name, 'earlier');
      ends := public.time_off_resolve_clock(last_day + to_clock, zone_name, 'earlier');
    exception when sqlstate '22023' then
      raise exception 'These hours do not exist on this date in your time zone'
        using errcode = '22023', hint = 'time_off.no_such_time';
    end;
  end if;
  if begins <= now() then
    raise exception 'That time has already started' using errcode = '22023', hint = 'time_off.started';
  end if;
  if exists (select 1 from app_private.leave_spans(target_workspace_id, array[person], tstzrange(begins, ends, '[)'))) then
    raise exception 'You already have time off or a request in these hours' using errcode = 'PT409', hint = 'time_off.overlap';
  end if;

  insert into public.time_off_requests (workspace_id, employee_id, starts_at, ends_at, all_day, time_timezone,
    kind_of_leave, note, created_by, client_key)
  values (target_workspace_id, person, begins, ends, asked_all_day, zone_name, asked_kind, note_text, actor_user_id, request_key)
  returning * into created;
  -- Whoever may answer hears of it (time off rebuild D3).
  perform app_private.time_off_request_tell(created, 'requested', actor_user_id);
  return app_private.time_off_request_view(created);
end;
$$;


-- The employee withdraws: as in D2, and the cards asking for an answer close.
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
  if found_request.kind <> 'leave' or found_request.status <> 'pending' or found_request.starts_at <= now() then
    raise exception 'Only a request waiting for an answer can be withdrawn' using errcode = 'PT409', hint = 'time_off.not_pending';
  end if;
  update public.time_off_requests
  set status = 'withdrawn', ended_by = actor_user_id, ended_at = now(), revision = revision + 1, updated_at = now()
  where id = found_request.id
  returning * into found_request;
  -- Its cards close (time off rebuild D3).
  perform app_private.time_off_request_tell(found_request, 'withdrawn', actor_user_id);
  return app_private.time_off_request_view(found_request);
end;
$$;


-- Closing the employee side: as in D2, and the new table's cards close too.
CREATE OR REPLACE FUNCTION "app_private"."close_employee_side"("w" "uuid", "emp" "uuid", "actor" "uuid", "reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  impact jsonb;
  opened uuid[];
  closed record;
  why text := case reason
    when 'terminated' then 'This person no longer works here.'
    when 'access_removed' then 'This person no longer has access to the workspace.'
    else 'This person no longer works shifts here.' end;
begin
  if reason is null or reason not in ('access_dropped', 'terminated', 'access_removed') then
    raise exception 'unknown reason to close the employee side' using errcode = '22023';
  end if;
  perform public.availability_lock_workspace(w);
  impact := app_private.employee_side_impact(w, emp);

  if reason = 'access_dropped' then
    with released as (
      update public.schedule_published_shifts shift
      set employee_id = null
      from public.schedule_location_publications publication, public.locations location
      where publication.id = shift.publication_id and publication.workspace_id = shift.workspace_id
        and publication.location_id = shift.location_id and publication.status = 'current'
        and location.id = shift.location_id and location.workspace_id = shift.workspace_id
        and shift.workspace_id = w and shift.employee_id = emp
        and (shift.scheduled_date + shift.start_time) at time zone location.timezone >= now()
      returning shift.id)
    select coalesce(array_agg(id), '{}') into opened from released;
    perform app_private.schedule_tell_unassigned(w, opened, actor);
  else
    impact := impact || jsonb_build_object('shifts_opened', 0, 'availability_deleted', false);
  end if;

  -- Their own requests: a swap, a cover, a release.
  for closed in
    update public.shift_exchange_cases c
    set status = 'cancelled', revision = c.revision + 1, updated_at = now()
    where c.workspace_id = w and c.owner_id = emp and c.status = 'open'
    returning c.id
  loop
    update public.shift_exchange_applications
    set status = 'closed_case_cancelled', updated_at = now()
    where case_id = closed.id and status in ('invited', 'pending_manager');
    delete from public.shift_exchange_votes where case_id = closed.id;
    perform public.shift_exchange_emit(actor, w, closed.id, null, 'case_closed',
      why || case when reason = 'access_removed' then ' This request was closed. The owner keeps this shift.'
        else ' This request was closed. The shift is open for someone else to pick up.' end);
  end loop;

  -- What they answered on somebody else's request; a request made to them alone closes with it.
  for closed in
    update public.shift_exchange_applications a
    set status = 'closed_case_cancelled', updated_at = now()
    from public.shift_exchange_cases c
    where c.id = a.case_id and c.workspace_id = a.workspace_id and c.status = 'open'
      and a.workspace_id = w and a.employee_id = emp and a.status in ('invited', 'pending_manager')
    returning a.id, a.case_id, c.audience
  loop
    delete from public.shift_exchange_votes where case_id = closed.case_id and application_id = closed.id;
    update public.shift_exchange_cases
    set status = case when closed.audience = 'direct' then 'cancelled' else status end,
        revision = revision + 1, updated_at = now()
    where id = closed.case_id;
    perform public.shift_exchange_emit(actor, w, closed.case_id, closed.id, 'application_closed',
      why || ' Their answer was closed. No assignment changed.');
  end loop;

  -- Their time off waiting for a decision is withdrawn (design §4.8).
  for closed in
    update public.schedule_time_off_requests r
    set status = 'revoked', revision = r.revision + 1, updated_at = now()
    where r.workspace_id = w and r.employee_id = emp and r.status = 'pending'
    returning r.id
  loop
    insert into public.schedule_time_off_events (workspace_id, request_id, action, actor_user_id, note)
    values (w, closed.id, 'revoked', actor, why);
    perform app_private.time_off_tell(w, closed.id, 'withdrawn', actor);
  end loop;
  -- And in the new table (time off rebuild D2); its cards close (D3).
  for closed in
    update public.time_off_requests r
    set status = 'withdrawn', ended_by = actor, ended_at = now(), ended_note = why, revision = r.revision + 1, updated_at = now()
    where r.workspace_id = w and r.employee_id = emp and r.status = 'pending'
    returning r.id
  loop
    perform app_private.notification_resolve(w, 'time_off', closed.id, 'withdrawn', actor);
  end loop;

  return impact;
end;
$$;


-- A shift an approval opened is tied to that decision, in the new table too: an announcement does not remove it.
CREATE OR REPLACE FUNCTION "app_private"."announcement_impact"("w" "uuid", "record" "uuid", "first_day" "date", "last_day" "date", "day_rows" "jsonb", "choices" "jsonb", "saved_at" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  with stored as (
    select item.id, item.starts_on, item.ends_on from public.announcements item
    where item.id = record and item.workspace_id = w and item.status = 'published' and item.archived_at is null
  ), old_days as (
    select day.* from stored
    cross join lateral app_private.announcement_days(app_private.announcement_rows(stored.id), stored.starts_on, stored.ends_on) day
  ), new_days as (
    select day.*, location.timezone, location.name location_name, location.sort_order
    from app_private.announcement_days(day_rows, first_day, last_day) day
    join public.locations location on location.id = day.location_id and location.workspace_id = w and location.archived_at is null
    where day.on_date >= (now() at time zone location.timezone)::date
  ), done as (
    select change.source_shift_id from public.announcement_shift_changes change
    where change.announcement_id = record and change.brought_back_at is null
  ), reached as (
    select shift.id, shift.source_shift_id, shift.location_id, shift.scheduled_date, shift.employee_id, shift.job_id,
      shift.start_time, shift.end_time, new_days.kind, new_days.opens, new_days.closes, new_days.location_name,
      new_days.sort_order, why.reason,
      lower(app_private.shift_time_range(shift.scheduled_date, shift.start_time, shift.end_time,
        coalesce(shift.time_timezone, new_days.timezone))) <= now() started,
      exists (select 1 from public.employee_offboarding_shift_actions tie where tie.shift_id = shift.id and tie.workspace_id = w)
        or exists (select 1 from public.time_off_assignment_releases tie
                   where tie.published_shift_id = shift.id and tie.workspace_id = w)
        -- The new time off's (time off rebuild D3).
        or exists (select 1 from public.time_off_request_releases tie
                   where tie.published_shift_id = shift.id and tie.workspace_id = w) tied,
      coalesce(saved_at < (
        select min(copy.created_at) from public.schedule_published_shifts copy
        where copy.workspace_id = w and copy.source_shift_id = shift.source_shift_id
          and (copy.location_id, copy.scheduled_date, copy.employee_id, copy.start_time, copy.end_time)
            is not distinct from (shift.location_id, shift.scheduled_date, shift.employee_id, shift.start_time, shift.end_time)), false) changed
    from new_days
    join public.schedule_published_shifts shift
      on shift.workspace_id = w and shift.location_id = new_days.location_id and shift.scheduled_date = new_days.on_date
    join public.schedule_location_publications publication on publication.id = shift.publication_id and publication.status = 'current'
    left join old_days on old_days.location_id = shift.location_id and old_days.on_date = shift.scheduled_date
    cross join lateral (select
      app_private.closure_reason(new_days.kind, new_days.opens, new_days.closes, shift.start_time, shift.end_time) reason,
      app_private.closure_reason(old_days.kind, old_days.opens, old_days.closes, shift.start_time, shift.end_time) old_reason) why
    where why.reason is not null and why.reason is distinct from why.old_reason
      and not shift.source_shift_id in (select done.source_shift_id from done)
  ), defaulted as (
    select reached.*,
      case when reached.started or reached.changed or reached.tied or reached.reason in ('prep', 'over') then 'keep'
           else 'remove' end default_choice,
      choices -> reached.source_shift_id::text picked
    from reached
  ), decided as (
    select defaulted.*, case
        when defaulted.started then 'keep'
        when defaulted.picked ->> 'choice' = 'keep' then 'keep'
        when defaulted.picked ->> 'choice' = 'remove' and not defaulted.tied then 'remove'
        when defaulted.picked ->> 'choice' = 'open' and defaulted.employee_id is not null then 'open'
        when defaulted.picked ->> 'choice' = 'edit' and defaulted.kind = 'short'
          and (defaulted.picked ->> 'from')::time is distinct from (defaulted.picked ->> 'until')::time
          and (defaulted.picked ->> 'from') is not null and (defaulted.picked ->> 'until') is not null then 'edit'
        when defaulted.picked ->> 'choice' is not null and defaulted.picked ->> 'choice' not in ('keep', 'remove', 'open', 'edit') then 'keep'
        else defaulted.default_choice end choice
    from defaulted
  ), listed as (
    select decided.*,
      case when decided.choice = 'edit' then (decided.picked ->> 'from')::time end from_time,
      case when decided.choice = 'edit' then (decided.picked ->> 'until')::time end until_time,
      case decided.choice when 'remove' then 'removed' when 'open' then 'opened'
        when 'edit' then case when ((decided.picked ->> 'from')::time, (decided.picked ->> 'until')::time)
                                    = (decided.start_time, decided.end_time) then 'kept' else 'edited' end
        else 'kept' end outcome
    from decided
  ), quiet as (
    select draft_shift.id, draft_shift.location_id, draft_shift.scheduled_date, draft_shift.employee_id
    from new_days
    join public.schedule_draft_shifts draft_shift
      on draft_shift.workspace_id = w and draft_shift.location_id = new_days.location_id and draft_shift.scheduled_date = new_days.on_date
    join public.schedule_drafts draft on draft.id = draft_shift.draft_id and draft.archived_at is null
    left join old_days on old_days.location_id = draft_shift.location_id and old_days.on_date = draft_shift.scheduled_date
    cross join lateral (select
      app_private.closure_reason(new_days.kind, new_days.opens, new_days.closes, draft_shift.start_time, draft_shift.end_time) reason,
      app_private.closure_reason(old_days.kind, old_days.opens, old_days.closes, draft_shift.start_time, draft_shift.end_time) old_reason) why
    where why.reason in ('closed', 'after_close') and why.reason is distinct from why.old_reason
      and (saved_at is null or draft_shift.updated_at <= saved_at)
      and lower(app_private.shift_time_range(draft_shift.scheduled_date, draft_shift.start_time, draft_shift.end_time,
            coalesce(draft_shift.time_timezone, new_days.timezone))) > now()
      and not draft_shift.id in (select done.source_shift_id from done)
      and not exists (
        select 1 from public.schedule_published_shifts published
        join public.schedule_location_publications publication on publication.id = published.publication_id and publication.status = 'current'
        where published.workspace_id = w and published.source_shift_id = draft_shift.id)
    union
    select edit_shift.id, edit_shift.location_id, edit_shift.scheduled_date, edit_shift.employee_id
    from new_days
    join public.schedule_edit_session_shifts edit_shift
      on edit_shift.workspace_id = w and edit_shift.location_id = new_days.location_id and edit_shift.scheduled_date = new_days.on_date
     and edit_shift.source_published_shift_id is null and edit_shift.pending_op_type is distinct from 'delete'
    join public.schedule_edit_sessions session on session.id = edit_shift.session_id and session.status = 'active'
    left join old_days on old_days.location_id = edit_shift.location_id and old_days.on_date = edit_shift.scheduled_date
    cross join lateral (select
      app_private.closure_reason(new_days.kind, new_days.opens, new_days.closes, edit_shift.start_time, edit_shift.end_time) reason,
      app_private.closure_reason(old_days.kind, old_days.opens, old_days.closes, edit_shift.start_time, edit_shift.end_time) old_reason) why
    where why.reason in ('closed', 'after_close') and why.reason is distinct from why.old_reason
      and (saved_at is null or edit_shift.updated_at <= saved_at)
      and lower(app_private.shift_time_range(edit_shift.scheduled_date, edit_shift.start_time, edit_shift.end_time,
            coalesce(edit_shift.time_timezone, new_days.timezone))) > now()
      and not edit_shift.id in (select done.source_shift_id from done)
      and not exists (
        select 1 from public.schedule_published_shifts published
        join public.schedule_location_publications publication on publication.id = published.publication_id and publication.status = 'current'
        where published.workspace_id = w and (published.source_shift_id = edit_shift.id or published.id = edit_shift.id))
  ), quiet_one as (
    select quiet.id, min(quiet.location_id::text)::uuid location_id, min(quiet.scheduled_date) scheduled_date,
      min(quiet.employee_id::text)::uuid employee_id
    from quiet group by quiet.id
  )
  select jsonb_build_object(
    'fingerprint', md5(coalesce((select string_agg(concat_ws('|', listed.source_shift_id, listed.employee_id, listed.start_time,
        listed.end_time, listed.choice, listed.from_time, listed.until_time), ',' order by listed.source_shift_id) from listed), '')
      || ';' || coalesce((select string_agg(quiet_one.id::text, ',' order by quiet_one.id) from quiet_one), '')),
    'shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', listed.id, 'source_id', listed.source_shift_id, 'location_id', listed.location_id,
        'location_name', listed.location_name, 'scheduled_date', listed.scheduled_date,
        'employee_id', listed.employee_id, 'employee_user_id', person.user_id,
        'employee_name', case when person.id is not null
          then concat_ws(' ', coalesce(nullif(person.preferred_name, ''), person.first_name), person.last_name) end,
        'job_id', listed.job_id, 'job_name', coalesce(job.name, 'Unassigned position'),
        'start_time', to_char(listed.start_time, 'HH24:MI'), 'end_time', to_char(listed.end_time, 'HH24:MI'),
        'day', listed.kind, 'opens', to_char(listed.opens, 'HH24:MI'), 'closes', to_char(listed.closes, 'HH24:MI'),
        'reason', listed.reason, 'started', listed.started, 'tied', listed.tied, 'changed_in_schedule', listed.changed,
        'default', listed.default_choice, 'choice', listed.choice,
        'from', to_char(listed.from_time, 'HH24:MI'), 'until', to_char(listed.until_time, 'HH24:MI'),
        'outcome', listed.outcome)
        order by listed.scheduled_date, listed.sort_order, listed.location_name, listed.start_time, listed.source_shift_id)
      from listed
      left join public.employee_profiles person on person.id = listed.employee_id and person.workspace_id = w
      left join public.jobs job on job.id = listed.job_id and job.workspace_id = w), '[]'::jsonb),
    'quiet', coalesce((
      select jsonb_agg(jsonb_build_object('id', quiet_one.id, 'location_id', quiet_one.location_id,
        'scheduled_date', quiet_one.scheduled_date, 'employee_id', quiet_one.employee_id) order by quiet_one.id)
      from quiet_one), '[]'::jsonb),
    'counts', jsonb_build_object(
      'removed', (select count(*) from listed where listed.outcome = 'removed'),
      'edited', (select count(*) from listed where listed.outcome = 'edited'),
      'opened', (select count(*) from listed where listed.outcome = 'opened'),
      'kept', (select count(*) from listed where listed.outcome = 'kept'),
      'quiet', (select count(*) from quiet_one)))
$$;


-- Home: the new time off waiting for this person's answer, and what was answered in the last seven days.
CREATE OR REPLACE FUNCTION "public"."get_manager_home_service"("actor_user_id" "uuid", "target_workspace_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me app_private.actor_state;
  documents_rule app_private.authz_actions;
  employee_rule app_private.authz_actions;
  places uuid[];
  exchange_places uuid[];
  saved public.workspace_layout_preferences;
  local_today date;
  result jsonb;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'workspace.todos');
  me := app_private.actor(actor_user_id, target_workspace_id);
  places := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.read');
  exchange_places := app_private.scope_set(actor_user_id, target_workspace_id, 'exchange.read');
  select * into documents_rule from app_private.authz_actions r where r.key = 'documents.read';
  select * into employee_rule from app_private.authz_actions r where r.key = 'employee.read';
  select * into saved from public.workspace_layout_preferences p
  where p.workspace_id = target_workspace_id and p.user_id = actor_user_id;
  -- Coming up starts on the earliest "today" among the locations in view.
  local_today := coalesce(
    (select min((now() at time zone l.timezone)::date) from public.locations l
     where l.workspace_id = target_workspace_id and l.id = any(places)),
    (now() at time zone 'UTC')::date);

  with place as (
    select l.id, l.name, l.timezone, (now() at time zone l.timezone)::date as today
    from public.locations l
    where l.workspace_id = target_workspace_id
      and l.id = any(places)
  ),
  shift as (
    select s.id, s.location_id, s.employee_id, s.job_id, s.scheduled_date,
      (s.scheduled_date + s.start_time) at time zone s.time_timezone as starts_at,
      (s.scheduled_date + s.end_time + case when s.crosses_midnight then interval '1 day' else interval '0 days' end)
        at time zone s.time_timezone as ends_at
    from public.schedule_published_shifts s
    join public.schedule_location_publications p on p.id = s.publication_id and p.status = 'current'
    join place on place.id = s.location_id
    where s.workspace_id = target_workspace_id
      -- Every zone's date is within a day of UTC's: keeps the date index range.
      and s.scheduled_date between (now() at time zone 'UTC')::date - 2 and (now() at time zone 'UTC')::date + 8
      and s.scheduled_date between place.today - 1 and place.today + 6
  ),
  person as (
    select e.id, e.user_id, btrim(coalesce(nullif(btrim(e.preferred_name), ''), e.first_name) || ' ' || e.last_name) as name
    from public.employee_profiles e
    where e.workspace_id = target_workspace_id
  ),
  -- Updates (S-225), the last seven days. A location-week published, its latest version.
  published as (
    select distinct on (p.location_id, p.week_start) p.id, p.location_id, p.week_start, p.published_at, p.published_by
    from public.schedule_location_publications p
    where p.workspace_id = target_workspace_id
      and p.location_id = any(places)
      and p.published_at > now() - interval '7 days'
    order by p.location_id, p.week_start, p.published_at desc
  ),
  -- Time off decided: the request's own verdict (not a shortening or a cancellation's echo), still standing.
  decided_time_off as materialized (
    -- decided_by, not actor_user_id: a column named as the parameter makes the whole read ambiguous (42702).
    select distinct on (event.request_id) event.id, event.request_id, event.action, event.actor_user_id as decided_by, event.created_at,
      request.employee_id
    from public.schedule_time_off_events event
    join public.schedule_time_off_requests request on request.id = event.request_id
    where event.workspace_id = target_workspace_id
      and event.created_at > now() - interval '7 days'
      and event.action in ('approved', 'denied')
      and not event.metadata ? 'shortened'
      and not event.metadata ? 'cancellation_request_id'
      and request.request_type = 'time_off'
      and request.status::text = event.action
    order by event.request_id, event.created_at desc
  ),
  -- A shift change a manager closed: approved, or declined where that ends it (a direct request).
  decided_exchange as (
    select distinct on (event.case_id) event.id, event.action, event.actor_user_id as decided_by, event.created_at, exchange.kind,
      exchange.owner_id, exchange.offered_snapshot, exchange.requested_snapshot
    from public.shift_exchange_events event
    join public.shift_exchange_cases exchange on exchange.id = event.case_id
    where event.workspace_id = target_workspace_id
      and event.created_at > now() - interval '7 days'
      and (event.action = 'transfer_completed' or (event.action = 'application_rejected' and exchange.audience = 'direct'))
      and ((exchange.offered_snapshot ->> 'location_id')::uuid = any(exchange_places)
        or (exchange.kind = 'swap' and (exchange.requested_snapshot ->> 'location_id')::uuid = any(exchange_places)))
    order by event.case_id, event.created_at desc
  ),
  joined as materialized (
    select invitation.id, invitation.employee_id, invitation.accepted_at
    from public.employee_invitations invitation
    where invitation.workspace_id = target_workspace_id
      and invitation.accepted_at > now() - interval '7 days'
  ),
  update_line as (
    select published.published_at as at, jsonb_build_object(
      'kind', 'published',
      'id', published.id::text,
      'at', published.published_at,
      'location_ids', jsonb_build_array(published.location_id),
      'by', (select person.name from person where person.user_id = published.published_by limit 1),
      'first_date', published.week_start,
      'last_date', published.week_start + 6,
      'shifts', (select count(*) from public.schedule_published_shifts s
        where s.workspace_id = target_workspace_id and s.location_id = published.location_id
          and s.scheduled_date between published.week_start and published.week_start + 6
          and s.publication_id = published.id)
    ) as line
    from published
    union all
    select decided.created_at, jsonb_build_object(
      'kind', 'time_off',
      'id', decided.id::text,
      'at', decided.created_at,
      'location_ids', coalesce((
        select jsonb_agg(assignment.location_id order by assignment.is_primary desc, assignment.location_id)
        from public.employee_location_assignments assignment
        where assignment.employee_id = decided.employee_id and assignment.ended_at is null
          and assignment.location_id = any(places)
      ), '[]'::jsonb),
      'approved', decided.action = 'approved',
      'person', who.name,
      'by', (select person.name from person where person.user_id = decided.decided_by limit 1),
      'first_date', (select min(segment.segment_date) from public.schedule_time_off_segments segment where segment.request_id = decided.request_id),
      'last_date', (select max(segment.segment_date) from public.schedule_time_off_segments segment where segment.request_id = decided.request_id)
    )
    from decided_time_off decided
    join person who on who.id = decided.employee_id
    where app_private.time_off_reason(actor_user_id, target_workspace_id, 'requests.read', decided.employee_id) is null
    union all
    -- The new time off's answers (time off rebuild D3), from the request itself: approved or declined in the
    -- last seven days and still so, read by whoever may answer it.
    select answered.decided_at, jsonb_build_object(
      'kind', 'time_off',
      'id', answered.id::text,
      'at', answered.decided_at,
      'location_ids', coalesce((
        select jsonb_agg(assignment.location_id order by assignment.is_primary desc, assignment.location_id)
        from public.employee_location_assignments assignment
        where assignment.employee_id = answered.employee_id and assignment.ended_at is null
          and assignment.location_id = any(places)
      ), '[]'::jsonb),
      'approved', answered.status = 'approved',
      'person', who.name,
      'by', (select person.name from person where person.user_id = answered.decided_by limit 1),
      'first_date', (answered.starts_at at time zone answered.time_timezone)::date,
      'last_date', ((answered.ends_at - interval '1 microsecond') at time zone answered.time_timezone)::date
    )
    from public.time_off_requests answered
    join person who on who.id = answered.employee_id
    where answered.workspace_id = target_workspace_id
      and answered.kind = 'leave'
      and answered.decided_at > now() - interval '7 days'
      and answered.status in ('approved', 'declined')
      and app_private.time_off_decider_why(me, answered.employee_id) is null
    union all
    select decided.created_at, jsonb_build_object(
      'kind', decided.kind,
      'id', decided.id::text,
      'at', decided.created_at,
      'location_ids', to_jsonb(array(
        select distinct side from unnest(array[(decided.offered_snapshot ->> 'location_id')::uuid,
          (decided.requested_snapshot ->> 'location_id')::uuid]) side
        where side = any(exchange_places))),
      'approved', decided.action = 'transfer_completed',
      'person', coalesce(owner.name, 'Somebody'),
      'by', (select person.name from person where person.user_id = decided.decided_by limit 1),
      'first_date', (decided.offered_snapshot ->> 'date')::date,
      'last_date', (decided.offered_snapshot ->> 'date')::date
    )
    from decided_exchange decided
    left join person owner on owner.id = decided.owner_id
    union all
    select joined.accepted_at, jsonb_build_object(
      'kind', 'joined',
      'id', joined.id::text,
      'at', joined.accepted_at,
      'location_ids', coalesce((
        select jsonb_agg(assignment.location_id order by assignment.is_primary desc, assignment.location_id)
        from public.employee_location_assignments assignment
        where assignment.employee_id = joined.employee_id and assignment.ended_at is null
          and assignment.location_id = any(places)
      ), '[]'::jsonb),
      'person', who.name
    )
    from joined
    join person who on who.id = joined.employee_id
    where who.user_id is distinct from actor_user_id
      and app_private.authz_check(me, employee_rule, null, joined.employee_id, null) is null
  ),
  -- Coming up (S-225), the next fourteen days. A day an announcement closes a location in view.
  closed as (
    select closure.announcement_id, closure.title, min(closure.closed_date) as first_date, max(closure.closed_date) as last_date,
      jsonb_agg(distinct closure.location_id) as location_ids
    from public.schedule_closures closure
    join place on place.id = closure.location_id
    where closure.workspace_id = target_workspace_id
      and closure.kind = 'closed'
      and closure.closed_date between place.today and place.today + 13
    group by closure.announcement_id, closure.title
  ),
  -- Time off as it is now (D1a): the days left of it, in the zone it was asked in. A piece that
  -- ends at midnight is that day's; the next fourteen days hold it.
  approved_off as materialized (
    select away.request_id as id, away.employee_id,
      greatest(min((lower(away.span) at time zone away.zone)::date), local_today) as first_date,
      least(max(((upper(away.span) - interval '1 microsecond') at time zone away.zone)::date), local_today + 13) as last_date
    from app_private.leave_spans(target_workspace_id,
      array(select e.id from public.employee_profiles e where e.workspace_id = target_workspace_id),
      tstzrange((local_today - 1)::timestamp at time zone 'UTC', (local_today + 15)::timestamp at time zone 'UTC', '[)')) away
    where not away.pending
      and (lower(away.span) at time zone away.zone)::date <= local_today + 13
      and ((upper(away.span) - interval '1 microsecond') at time zone away.zone)::date >= local_today
    group by away.request_id, away.employee_id
  ),
  -- Days past the next seven (those are in "Needs you") with no current publication.
  unpublished as (
    select place.id as location_id, min(day.date) as first_date, max(day.date) as last_date
    from place
    cross join lateral (select (place.today + offset_days)::date as date from generate_series(7, 13) offset_days) day
    where not exists (
      select 1 from public.schedule_location_publications publication
      where publication.location_id = place.id and publication.status = 'current'
        and day.date >= publication.week_start and day.date < publication.week_start + 7)
    group by place.id
  ),
  coming_line as (
    select closed.first_date, 1 as rank, jsonb_build_object(
      'kind', 'closed', 'id', closed.announcement_id::text, 'location_ids', closed.location_ids, 'name', closed.title,
      'first_date', closed.first_date, 'last_date', closed.last_date) as line
    from closed
    union all
    select off.first_date, 2, jsonb_build_object(
      'kind', 'time_off', 'id', off.id::text,
      'location_ids', coalesce((
        select jsonb_agg(assignment.location_id order by assignment.is_primary desc, assignment.location_id)
        from public.employee_location_assignments assignment
        where assignment.employee_id = off.employee_id and assignment.ended_at is null
          and assignment.location_id = any(places)
      ), '[]'::jsonb),
      'person', who.name, 'first_date', off.first_date, 'last_date', off.last_date)
    from approved_off off
    join person who on who.id = off.employee_id
    where app_private.time_off_reason(actor_user_id, target_workspace_id, 'requests.read', off.employee_id) is null
    union all
    select unpublished.first_date, 3, jsonb_build_object(
      'kind', 'unpublished', 'id', unpublished.location_id::text || ':' || unpublished.first_date::text,
      'location_ids', jsonb_build_array(unpublished.location_id),
      'first_date', unpublished.first_date, 'last_date', unpublished.last_date)
    from unpublished
  )
  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'now', now(),
    -- S-220: in the person's own order; a location they have not placed comes after, by name.
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', place.id,
        'name', place.name,
        'timezone', place.timezone,
        'today', place.today,
        -- Today's shifts there, last night's that run into it too: "on now" and the hours line.
        'today_shifts', coalesce((
          select jsonb_agg(jsonb_build_object('starts_at', shift.starts_at, 'ends_at', shift.ends_at,
            'open', shift.employee_id is null) order by shift.starts_at, shift.id)
          from shift
          where shift.location_id = place.id
            and shift.scheduled_date <= place.today
            and shift.ends_at > place.today::timestamp at time zone place.timezone
        ), '[]'::jsonb),
        -- S-163 (7): somebody in a Management job on a published shift there today.
        'floor_managers', coalesce((
          select jsonb_agg(jsonb_build_object('name', person.name, 'starts_at', shift.starts_at, 'ends_at', shift.ends_at)
            order by shift.starts_at, person.name)
          from shift
          join person on person.id = shift.employee_id
          join public.jobs job on job.id = shift.job_id
          join public.departments department on department.id = job.department_id and department.system_key = 'management'
          where shift.location_id = place.id
            and shift.scheduled_date <= place.today
            and shift.ends_at > place.today::timestamp at time zone place.timezone
        ), '[]'::jsonb),
        'week', (
          select jsonb_agg(jsonb_build_object(
            'date', day.date,
            'shifts', (select count(*) from shift where shift.location_id = place.id and shift.scheduled_date = day.date),
            'open', (select count(*) from shift where shift.location_id = place.id and shift.scheduled_date = day.date and shift.employee_id is null),
            'published', exists (
              select 1 from public.schedule_location_publications publication
              where publication.location_id = place.id and publication.status = 'current'
                and day.date >= publication.week_start and day.date < publication.week_start + 7)
          ) order by day.date)
          from (select (place.today + offset_days)::date as date from generate_series(0, 6) offset_days) day
        ),
        'open_shifts', coalesce((
          select jsonb_agg(jsonb_build_object('date', open_shift.scheduled_date, 'starts_at', open_shift.starts_at,
            'ends_at', open_shift.ends_at, 'job_name', open_shift.job_name) order by open_shift.starts_at)
          from (
            select shift.scheduled_date, shift.starts_at, shift.ends_at, job.name as job_name
            from shift join public.jobs job on job.id = shift.job_id
            where shift.location_id = place.id and shift.employee_id is null and shift.ends_at > now()
            order by shift.starts_at, shift.id
            limit 12
          ) open_shift
        ), '[]'::jsonb),
        -- S-206: whoever works here without a required document, as the documents rule lets the actor see.
        'missing_documents', coalesce((
          select jsonb_agg(jsonb_build_object('employee_id', missing.employee_id, 'name', missing.name,
            'document', missing.title, 'requirement_id', missing.id, 'status', missing.state)
            order by missing.name, missing.title, missing.id)
          from (
            select requirement.id, requirement.employee_id, person.name, requirement.title, obligation.state
            from public.employee_onboarding_requirements requirement
            join person on person.id = requirement.employee_id
            join public.employee_profiles profile on profile.id = requirement.employee_id and profile.archived_at is null
            cross join lateral (select app_private.document_obligation_state(requirement, now()) as state) obligation
            where requirement.workspace_id = target_workspace_id
              and requirement.kind = 'document'
              and requirement.required
              and not requirement.owner_excused
              and exists (
                select 1 from public.employee_location_assignments assignment
                where assignment.employee_id = requirement.employee_id and assignment.location_id = place.id
                  and assignment.ended_at is null)
              and obligation.state in ('missing', 'rejected', 'expired')
              and app_private.authz_check(me, documents_rule, null, requirement.employee_id, null) is null
            order by person.name, requirement.title, requirement.id
            limit 20
          ) missing
        ), '[]'::jsonb)
      ) order by array_position(coalesce(saved.location_order, '{}'::uuid[]), place.id) nulls last, place.name, place.id)
      from place
    ), '[]'::jsonb),
    -- Time off waiting on an answer the actor may read, with the person's locations in view.
    'time_off', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', request.id,
        'employee_id', request.employee_id,
        'employee_name', person.name,
        'first_date', request.first_date,
        'last_date', request.last_date,
        'location_ids', coalesce((
          select jsonb_agg(assignment.location_id order by assignment.is_primary desc, assignment.location_id)
          from public.employee_location_assignments assignment
          where assignment.employee_id = request.employee_id and assignment.ended_at is null
            and assignment.location_id = any(places)
        ), '[]'::jsonb)
      ) order by request.created_at, request.id)
      from (
        select waiting.* from (
          select r.id, r.employee_id, r.created_at,
            (select min(segment.segment_date) from public.schedule_time_off_segments segment where segment.request_id = r.id) as first_date,
            (select max(segment.segment_date) from public.schedule_time_off_segments segment where segment.request_id = r.id) as last_date
          from public.schedule_time_off_requests r
          where r.workspace_id = target_workspace_id
            and r.status = 'pending'
            and r.request_type = 'time_off'
            and app_private.time_off_reason(actor_user_id, target_workspace_id, 'requests.read', r.employee_id) is null
          union all
          -- The new time off's (time off rebuild D3): waiting, not started, and this person may answer it.
          select r.id, r.employee_id, r.created_at,
            (r.starts_at at time zone r.time_timezone)::date,
            ((r.ends_at - interval '1 microsecond') at time zone r.time_timezone)::date
          from public.time_off_requests r
          where r.workspace_id = target_workspace_id
            and r.kind = 'leave'
            and r.status = 'pending'
            and r.starts_at > now()
            and app_private.time_off_decider_why(me, r.employee_id) is null
        ) waiting
        order by waiting.created_at, waiting.id
        limit 50
      ) request
      join person on person.id = request.employee_id
    ), '[]'::jsonb),
    -- S-220: the person's sections, the two new ones after what they placed.
    'layout', jsonb_build_object(
      'widget_order', to_jsonb(app_private.home_section_order(saved.widget_order)),
      'hidden_widget_ids', to_jsonb(array(
        select distinct value from unnest(coalesce(saved.hidden_widget_ids, '{}'::text[])) value
        where value = any(app_private.home_section_order(null))))
    ),
    'updates', coalesce((
      select jsonb_agg(item.line order by item.at desc, item.line ->> 'id')
      from (select * from update_line order by at desc, line ->> 'id' limit 30) item
    ), '[]'::jsonb),
    'coming_up', coalesce((
      select jsonb_agg(item.line order by item.first_date, item.rank, item.line ->> 'id')
      from (select * from coming_line order by first_date, rank, line ->> 'id' limit 30) item
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;


-- Workspace home: the count of time off waiting counts the new table's too.
CREATE OR REPLACE FUNCTION "public"."get_workspace_dashboard_service"("actor_user_id" "uuid", "target_workspace_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
        and app_private.time_off_reason(actor_user_id, target_workspace_id, 'requests.read', request.employee_id) is null)
        -- The new time off's (time off rebuild D3): a request waiting that this person may answer.
        + (select count(*) from public.time_off_requests request
           where request.workspace_id = target_workspace_id and request.status = 'pending' and request.starts_at > now()
             and app_private.time_off_decider_why(me, request.employee_id) is null)
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
$$;


-- Employee Hub: leave_days, the days with time off (old and new alike).
CREATE OR REPLACE FUNCTION "public"."get_employee_hub_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_from" "date", "target_to" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare employee public.employee_profiles%rowtype; result jsonb;
begin
  if target_to < target_from or target_to > target_from + 62 then
    raise exception 'employee hub date range is invalid' using errcode = '22023';
  end if;
  employee := public.employee_hub_actor_service(actor_user_id, target_workspace_id);

  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'employee', jsonb_build_object(
      'id', employee.id,
      'display_name', concat_ws(' ', coalesce(nullif(employee.preferred_name,''),employee.first_name), employee.last_name)
    ),
    'time_off_timezone', app_private.time_off_timezone(target_workspace_id, employee.id),
    'settings', jsonb_build_object('time_off_lead_hours', coalesce((select s.time_off_lead_hours from public.workspace_scheduling_settings s where s.workspace_id = target_workspace_id), 24)),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object('id',location.id,'name',location.name) order by location.sort_order,location.name)
      from public.employee_location_assignments assignment
      join public.locations location on location.id=assignment.location_id and location.archived_at is null
      where assignment.employee_id=employee.id and assignment.ended_at is null
    ),'[]'::jsonb),
    'shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',shift.id,'location_id',shift.location_id,'location_name',location.name,'job_name',job.name,
        'scheduled_date',shift.scheduled_date,'time_basis',shift.time_basis,'time_snapshot',shift.time_snapshot,'time_timezone',shift.time_timezone,'start_time',to_char(shift.start_time,'HH24:MI'),
        'end_time',to_char(shift.end_time,'HH24:MI'),'note',shift.note,'employee_id',shift.employee_id,
        'shift_type_name',shift_type.name
      ) order by shift.scheduled_date,shift.start_time)
      from public.schedule_published_shifts shift
      join public.schedule_location_publications publication on publication.id=shift.publication_id and publication.status='current'
      join public.locations location on location.id=shift.location_id
      join public.jobs job on job.id=shift.job_id
      left join public.shift_types shift_type on shift_type.id=shift.shift_type_id and shift_type.workspace_id=shift.workspace_id
      where shift.workspace_id=target_workspace_id and shift.employee_id=employee.id
        and shift.scheduled_date between target_from and target_to
    ),'[]'::jsonb),
    -- An open shift reaches an employee only offered, in Shift Hub, to who is eligible (Mert, 2026-10-20).
    -- The field stays empty until the clients stop reading it (EKRAN 02 #47).
    'open_shifts', '[]'::jsonb,
    'team_shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',shift.id,'location_id',shift.location_id,'location_name',location.name,'job_name',job.name,
        'scheduled_date',shift.scheduled_date,'time_basis',shift.time_basis,'time_snapshot',shift.time_snapshot,'time_timezone',shift.time_timezone,'start_time',to_char(shift.start_time,'HH24:MI'),
        'end_time',to_char(shift.end_time,'HH24:MI'),'note','','employee_id',shift.employee_id,
        'employee_name',concat_ws(' ',coalesce(nullif(teammate.preferred_name,''),teammate.first_name),teammate.last_name),
        'is_management',coalesce((select department.system_key='management' from public.departments department
          where department.id=job.department_id and department.workspace_id=shift.workspace_id),false)
      ) order by shift.scheduled_date,shift.start_time)
      from public.schedule_published_shifts shift
      join public.schedule_location_publications publication on publication.id=shift.publication_id and publication.status='current'
      join public.locations location on location.id=shift.location_id
      join public.jobs job on job.id=shift.job_id
      join public.employee_profiles teammate on teammate.id=shift.employee_id
      where shift.workspace_id=target_workspace_id and shift.employee_id<>employee.id
        and shift.scheduled_date between target_from and target_to
        and exists(select 1 from public.employee_location_assignments assignment
          where assignment.employee_id=employee.id and assignment.location_id=shift.location_id and assignment.ended_at is null)
    ),'[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(request_row order by request_row->>'created_at' desc) from (
        select jsonb_build_object(
          'id',request.id,'kind','time_off','request_type',request.request_type,'cancellation',public.time_off_cancellation_context(target_workspace_id,request.id),'periods',public.time_off_request_periods(request.id,target_workspace_id), 'decision_events',coalesce((select jsonb_agg(jsonb_build_object('id',ev.id,'action',ev.action,'note',ev.note,'created_at',ev.created_at,'revision',ev.metadata->'revision','released_assignments',public.time_off_event_released_assignments(get_employee_hub_service.actor_user_id,target_workspace_id,ev.id)) order by ev.created_at,ev.id)
  from public.schedule_time_off_events ev where ev.request_id=request.id and ev.workspace_id=target_workspace_id and ev.action in('approved','denied','revoked','expired')),'[]'), 'status',request.status::text,'display_status',app_private.time_off_display_status(target_workspace_id,request.id),'decide_by',request.decide_by,
          'title',case when request.request_type='time_off_cancellation' then 'Cancel approved leave · ' else 'Time off · ' end||to_char(min(segment.segment_date),'Mon DD')||case when min(segment.segment_date)<>max(segment.segment_date) then '–'||to_char(max(segment.segment_date),'Mon DD') else '' end,
          'detail',coalesce(nullif(request.reason,''),'No note'),'revision',request.revision,'created_at',request.created_at,
          'can_cancel',request.status='pending'
        ) request_row
        from public.schedule_time_off_requests request
        join public.schedule_time_off_segments segment on segment.request_id=request.id
        where request.workspace_id=target_workspace_id and request.employee_id=employee.id
        group by request.id
      ) requests
    ),'[]'::jsonb),
    -- The days of the range with time off the person has (time off rebuild D3): approved, or what is left
    -- of it, in the old tables and the new one alike (app_private.leave_spans), as days of the zone it was
    -- asked in. A piece that ends at midnight is the day before's. My shifts and Home's week read it.
    'leave_days', coalesce((
      select jsonb_agg(to_char(off_day.day, 'YYYY-MM-DD') order by off_day.day)
      from (
        select distinct d::date as day
        from app_private.leave_spans(target_workspace_id, array[employee.id],
          tstzrange((target_from - 1)::timestamp at time zone 'UTC', (target_to + 2)::timestamp at time zone 'UTC', '[)')) away
        cross join lateral generate_series((lower(away.span) at time zone away.zone)::date,
          ((upper(away.span) - interval '1 microsecond') at time zone away.zone)::date, interval '1 day') d
        where not away.pending
      ) off_day
      where off_day.day between target_from and target_to
    ),'[]'::jsonb),
    'team', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',teammate.id,
        'display_name',concat_ws(' ',coalesce(nullif(teammate.preferred_name,''),teammate.first_name),teammate.last_name),
        'job_names',coalesce((select jsonb_agg(job.name order by lower(job.name),job.id) from public.employee_job_assignments assignment join public.jobs job on job.id=assignment.job_id where assignment.employee_id=teammate.id and assignment.ended_at is null),'[]'::jsonb),
        'location_names',coalesce((select jsonb_agg(location.name order by location.sort_order,location.name) from public.employee_location_assignments assignment join public.locations location on location.id=assignment.location_id where assignment.employee_id=teammate.id and assignment.ended_at is null),'[]'::jsonb)
      ) order by teammate.last_name,teammate.first_name)
      from public.employee_profiles teammate
      where teammate.workspace_id=target_workspace_id and teammate.archived_at is null and teammate.id<>employee.id
        and exists(select 1 from public.employee_location_assignments mine join public.employee_location_assignments theirs on theirs.location_id=mine.location_id and theirs.ended_at is null where mine.employee_id=employee.id and mine.ended_at is null and theirs.employee_id=teammate.id)
    ),'[]'::jsonb)
  ) into result;
  return result;
end; $$;


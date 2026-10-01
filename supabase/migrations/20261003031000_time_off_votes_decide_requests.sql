-- FB-6.3.3: the managers of the person's locations vote on time off.
--
-- Rules (user decisions 2026-09-30 and 2026-10-01, KARARLAR "İzin", "Rütbe"):
-- * A request belongs to the person: no location. When it is sent, the
--   locations the person works at that have a manager who may decide it are
--   fixed (time_off_required_locations). A location archived, left by the
--   person or left without such a manager later drops out; none left means an
--   admin or the owner decides it.
-- * At each location one manager's approval counts; one denial closes the
--   request; a manager of several locations votes for all of them at once. An
--   admin or the owner decides alone, at once (time_off.decide_alone). Rank:
--   a manager's request is for an admin or the owner, an admin's for the
--   owner; nobody decides their own. The owner's own time off is recorded
--   approved.
-- * An approval stands on the published shifts it would open at the voter's
--   locations when it was given (a fingerprint of their content, so an
--   unchanged republish keeps it). When that changes the vote no longer
--   counts. The last approval opens every published shift of the time off
--   that has not started; drafts and running shifts are left alone.
-- * Revoke (time_off.revoke): a manager of one of the person's locations, an
--   admin or the owner, with a reason. What has not started is taken back;
--   what was taken stays on record. A cancellation is voted on like a request.
-- * The owner is never held back by a missing document (user decision
--   2026-10-01): app_private.time_off_reason() reads the core with that one
--   difference, for these services only.
--
-- Old single-location services keep working until FB-6.3.7; a request they
-- file still has a location, which stands in for the fixed list.
-- The notify trigger no longer reads membership scopes or all_locations: the
-- "own scope logic" ceiling in authz_catalog comes down 41 -> 40.

-- 1. The catalog ---------------------------------------------------------------

insert into app_private.authz_actions
  (key, scope_class, effect, permission_key, owner_only, restricted_ok, self_ok, no_self, rank_below) values
  -- At once and final: an admin or the owner, one rank up.
  ('time_off.decide_alone', 'org', 'write', 'schedule.time_off_requests.manage', false, false, false, true, true),
  -- Taking approved time off back: anybody who reaches the person, one rank up.
  ('time_off.revoke', 'person', 'write', 'schedule.time_off_requests.manage', false, false, false, true, true);

-- The Requests queue shows the time off of the people the actor reaches.
update app_private.authz_actions set scope_class = 'person' where key = 'requests.read';

-- 2. Locationless requests read their own time zone ---------------------------

create or replace function public.time_off_period_span(segment_id uuid)
returns tstzrange
language sql
stable security definer
set search_path = ''
as $$
 select case when s.starts_at is not null then tstzrange(s.starts_at, s.ends_at, '[)')
  when s.start_time is null then tstzrange(s.segment_date::timestamp at time zone l.timezone, (s.segment_date + 1)::timestamp at time zone l.timezone, '[)')
  else tstzrange((s.segment_date + s.start_time) at time zone l.timezone,
   (s.segment_date + s.end_time + case when s.end_time <= s.start_time then interval '1 day' else interval '0' end) at time zone l.timezone, '[)') end
 from public.schedule_time_off_segments s
 join public.schedule_time_off_requests r on r.id = s.request_id and r.workspace_id = s.workspace_id
 left join public.locations l on l.id = r.location_id and l.workspace_id = r.workspace_id
 where s.id = segment_id;
$$;

create or replace function public.time_off_request_periods(request_id uuid, w uuid)
returns jsonb
language sql
stable security definer
set search_path = ''
as $$
 select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'segment_date', s.segment_date, 'start_time', s.start_time, 'end_time', s.end_time, 'status', s.status,
  'effective_intervals', case when r.status in ('approved', 'partially_approved') then public.availability_ranges_json(public.time_off_effective_ranges(s.id)) else '[]'::jsonb end,
  'cancelled_intervals', public.availability_ranges_json(public.time_off_cancelled_ranges(s.id)),
  'decision_revision', (select max(p.decision_revision) from public.time_off_decision_pieces p where p.segment_id = s.id and p.decision_revision <= r.revision),
  'decision_pieces', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'starts_at', p.starts_at, 'ends_at', p.ends_at, 'time_timezone', p.time_timezone, 'status', p.status) order by p.starts_at)
   from public.time_off_decision_pieces p where p.segment_id = s.id
    and p.decision_revision = (select max(p2.decision_revision) from public.time_off_decision_pieces p2 where p2.segment_id = s.id and p2.decision_revision <= r.revision)
    and r.status in ('approved', 'partially_approved', 'denied', 'revoked')), '[]'),
  'ends_next_day', case when s.starts_at is null then coalesce(s.end_time < s.start_time, false) else s.ends_next_day end,
  'time_timezone', coalesce(s.time_timezone, l.timezone), 'starts_at', lower(public.time_off_period_span(s.id)), 'ends_at', upper(public.time_off_period_span(s.id)),
  'time_source', case when s.starts_at is null then 'legacy_location' else 'snapshot' end, 'fold_choices', s.fold_choices)
  order by s.segment_date, s.start_time, s.id), '[]')
 from public.schedule_time_off_segments s
 join public.schedule_time_off_requests r on r.id = s.request_id and r.workspace_id = s.workspace_id
 left join public.locations l on l.id = r.location_id and l.workspace_id = r.workspace_id
 where s.request_id = time_off_request_periods.request_id and s.workspace_id = w;
$$;

-- A request with no location keeps the time zone it was asked in.
create or replace function public.guard_time_off_requested_period()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare parent public.schedule_time_off_requests%rowtype; zone_name text; resolved jsonb;
begin
 select * into parent from public.schedule_time_off_requests where id = coalesce(new.request_id, old.request_id);
 if tg_op in ('UPDATE', 'DELETE') and (old.starts_at is not null or parent.period_version = 2) then
  if tg_op = 'DELETE' or (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
   raise exception 'Requested time-off periods are immutable; submit a new request to change the hours' using errcode = '55000'; end if;
 end if;
 if tg_op = 'INSERT' and (parent.period_version = 2 or new.time_timezone is not null) then
  if parent.status <> 'pending' then raise exception 'Requested periods can only be added to a pending request' using errcode = '55000'; end if;
  if parent.request_type = 'time_off_cancellation' then
   if not exists (select 1 from public.time_off_cancellation_links cl
    join public.schedule_time_off_segments original on original.request_id = cl.parent_request_id and original.workspace_id = cl.workspace_id
    where cl.request_id = parent.id and cl.workspace_id = parent.workspace_id and original.time_timezone = new.time_timezone
     and public.time_off_effective_ranges(original.id) @> tstzrange(new.starts_at, new.ends_at, '[)'))
    or (new.segment_date, new.start_time, new.end_time, new.ends_next_day) is distinct from
     ((new.starts_at at time zone new.time_timezone)::date, (new.starts_at at time zone new.time_timezone)::time,
      (new.ends_at at time zone new.time_timezone)::time, (new.ends_at at time zone new.time_timezone)::date > (new.starts_at at time zone new.time_timezone)::date)
    then raise exception 'Cancellation hours must match approved leave in its original time zone' using errcode = '22023'; end if;
   return new;
  end if;
  select timezone into zone_name from public.locations where id = parent.location_id and workspace_id = parent.workspace_id;
  resolved := public.time_off_resolve_period(jsonb_build_object('segment_date', new.segment_date, 'start_time', new.start_time, 'end_time', new.end_time,
   'ends_next_day', new.ends_next_day) || new.fold_choices, coalesce(zone_name, new.time_timezone));
  if (new.time_timezone, new.starts_at, new.ends_at) is distinct from
   (resolved ->> 'time_timezone', (resolved ->> 'starts_at')::timestamptz, (resolved ->> 'ends_at')::timestamptz) then
   raise exception 'Requested time-off clock and time-zone snapshot must agree' using errcode = '22023'; end if;
 end if;
 return case when tg_op = 'DELETE' then old else new end;
end $$;

-- When a request was sent is not part of what it asks (the reminder reads it).
create or replace function public.guard_time_off_request_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
 if old.period_version = 2 and (new.id, new.workspace_id, new.employee_id, new.location_id, new.request_type, new.reason, new.created_by, new.period_version)
  is distinct from (old.id, old.workspace_id, old.employee_id, old.location_id, old.request_type, old.reason, old.created_by, old.period_version) then
  raise exception 'The original time-off request is immutable' using errcode = '55000'; end if;
 return new;
end $$;

-- 3. Who may act, and who decides ---------------------------------------------

-- The core's answer for the time-off services, with one difference: the owner
-- is never held back by a missing document (user decision 2026-10-01).
create function app_private.time_off_reason(actor uuid, w uuid, action text, person uuid default null, place uuid default null)
returns text
language plpgsql
stable security definer
set search_path = ''
as $$
declare
  state app_private.actor_state := app_private.actor(actor, w);
  rule_row app_private.authz_actions;
begin
  select * into rule_row from app_private.authz_actions a where a.key = action;
  if not found then
    raise exception 'Unknown action %', action using errcode = '22023';
  end if;
  if state.class = 'owner' then
    state.document_blocked := false;
  end if;
  return app_private.authz_check(state, rule_row, case when place is null then null else array[place] end, person, null);
end;
$$;

create function app_private.time_off_authorize(actor uuid, w uuid, action text, person uuid default null)
returns void
language plpgsql
stable security definer
set search_path = ''
as $$
declare why text := app_private.time_off_reason(actor, w, action, person);
begin
  if why is not null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || why, detail = action;
  end if;
end;
$$;

-- The members who vote at one location: they may decide there but not alone.
create function app_private.time_off_location_voters(w uuid, person uuid, place uuid)
returns uuid[]
language sql
stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.user_id order by m.user_id), '{}')
  from public.workspace_memberships m
  where m.workspace_id = w and m.status = 'active'
    and app_private.time_off_reason(m.user_id, w, 'time_off.decide', person, place) is null
    and app_private.time_off_reason(m.user_id, w, 'time_off.decide_alone', person) is not null;
$$;

-- The admins and the owner who may decide a person's request alone.
create function app_private.time_off_alone_deciders(w uuid, person uuid)
returns uuid[]
language sql
stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.user_id order by m.user_id), '{}')
  from public.workspace_memberships m
  where m.workspace_id = w and m.status = 'active'
    and app_private.time_off_reason(m.user_id, w, 'time_off.decide_alone', person) is null;
$$;

-- The locations of a person whose managers would decide a request sent now.
create function app_private.time_off_deciding_locations(w uuid, person uuid)
returns uuid[]
language sql
stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct a.location_id order by a.location_id), '{}')
  from public.employee_location_assignments a
  join public.locations l on l.id = a.location_id and l.workspace_id = a.workspace_id
  where a.workspace_id = w and a.employee_id = person and a.ended_at is null
    and app_private.location_is_live(l)
    and cardinality(app_private.time_off_location_voters(w, person, a.location_id)) > 0;
$$;

-- The fixed list as it stands now: still live, still the person's, still with
-- a manager who may decide. A request of the old services has its location.
create function app_private.time_off_live_locations(w uuid, rid uuid)
returns uuid[]
language sql
stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(place order by place), '{}')
  from (
    select x.location_id place from public.time_off_required_locations x where x.request_id = rid and x.workspace_id = w
    union
    select r.location_id from public.schedule_time_off_requests r
    where r.id = rid and r.workspace_id = w and r.location_id is not null
      and not exists (select 1 from public.time_off_required_locations x where x.request_id = rid)
  ) listed
  join public.schedule_time_off_requests r on r.id = rid and r.workspace_id = w
  join public.locations l on l.id = listed.place and l.workspace_id = w
  where app_private.location_is_live(l)
    and exists (select 1 from public.employee_location_assignments a
                where a.workspace_id = w and a.employee_id = r.employee_id and a.location_id = listed.place and a.ended_at is null)
    and cardinality(app_private.time_off_location_voters(w, r.employee_id, listed.place)) > 0;
$$;

-- Who hears of a request: the managers of its locations, or an admin and the
-- owner when none is left.
create function app_private.time_off_deciders(w uuid, rid uuid, fallback_ok boolean default true)
returns uuid[]
language plpgsql
stable security definer
set search_path = ''
as $$
declare
  person uuid := (select r.employee_id from public.schedule_time_off_requests r where r.id = rid and r.workspace_id = w);
  voters uuid[];
begin
  select coalesce(array_agg(distinct v order by v), '{}') into voters
  from unnest(app_private.time_off_live_locations(w, rid)) place,
       unnest(app_private.time_off_location_voters(w, person, place)) v;
  if cardinality(voters) = 0 and fallback_ok then
    return app_private.time_off_alone_deciders(w, person);
  end if;
  return voters;
end;
$$;

-- 4. What an approval would open ----------------------------------------------

-- The content of the published shifts, not their ids: republishing the same
-- shifts keeps a vote.
create function app_private.time_off_shifts_fingerprint(shifts jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(coalesce(string_agg(line, ',' order by line), ''))
  from (select concat_ws('|', x ->> 'location_id', x ->> 'job_id', x ->> 'scheduled_date', x ->> 'start_time', x ->> 'end_time') line
        from jsonb_array_elements(coalesce(shifts, '[]')) x) lines;
$$;

-- The published shifts of the person, not yet started, that the time off
-- would open, per location: the fixed locations and wherever such a shift is.
-- A cancellation opens nothing.
create function app_private.time_off_impact(w uuid, rid uuid)
returns jsonb
language sql
stable security definer
set search_path = ''
as $$
  with r as (
    select * from public.schedule_time_off_requests where id = rid and workspace_id = w
  ), shifts as (
    select x from r,
      lateral (select coalesce(range_agg(public.time_off_period_span(s.id)), '{}') m
               from public.schedule_time_off_segments s where s.request_id = r.id and s.workspace_id = w) asked,
      lateral jsonb_array_elements(public.time_off_assignment_impact(w, r.employee_id, asked.m)) x
    where r.request_type = 'time_off' and (x ->> 'starts_at')::timestamptz > now()
  ), places as (
    select (x ->> 'location_id')::uuid place from shifts
    union select unnest(app_private.time_off_live_locations(w, rid))
  ), per_place as (
    select p.place, coalesce(jsonb_agg(s.x order by s.x ->> 'starts_at', s.x ->> 'id') filter (where s.x is not null), '[]') shifts
    from places p left join shifts s on (s.x ->> 'location_id')::uuid = p.place
    group by p.place
  )
  select jsonb_build_object(
    'fingerprint', app_private.time_off_shifts_fingerprint((select jsonb_agg(x) from shifts)),
    'shifts', coalesce((select jsonb_agg(x order by x ->> 'starts_at', x ->> 'id') from shifts), '[]'),
    'locations', coalesce((select jsonb_object_agg(place, jsonb_build_object(
        'fingerprint', app_private.time_off_shifts_fingerprint(shifts), 'shifts', shifts)) from per_place), '{}'));
$$;

-- 5. Where a request stands ----------------------------------------------------

-- The one evaluation that votes, reads, the deadline job and notices share.
-- A vote counts at a location it was given for while its voter may still
-- decide there and the shifts there are still the ones it saw.
create function app_private.time_off_state(w uuid, rid uuid)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $$
declare
  r public.schedule_time_off_requests%rowtype;
  pictured jsonb;
  live uuid[];
  empty_print text := app_private.time_off_shifts_fingerprint('[]');
  votes jsonb;
  places jsonb;
begin
  select * into r from public.schedule_time_off_requests where id = rid and workspace_id = w;
  if r.id is null then
    return null;
  end if;
  pictured := app_private.time_off_impact(w, rid);
  live := app_private.time_off_live_locations(w, rid);

  select coalesce(jsonb_agg(jsonb_build_object(
      'voter', v.voter_user_id, 'verdict', v.verdict, 'note', v.note, 'at', v.updated_at,
      'stale', exists (select 1 from jsonb_each_text(v.impact) seen
                       where seen.value is distinct from coalesce(pictured -> 'locations' -> seen.key ->> 'fingerprint', empty_print)),
      'locations', (select coalesce(jsonb_agg(seen.key order by seen.key), '[]') from jsonb_each_text(v.impact) seen))
    order by v.updated_at, v.voter_user_id), '[]')
  into votes
  from public.time_off_votes v
  where v.request_id = rid and v.workspace_id = w;

  -- A vote that still counts, at each fixed location.
  select coalesce(jsonb_agg(jsonb_build_object('id', place, 'approved_by', counted.voter, 'approved_at', counted.voted_at) order by place), '[]')
  into places
  from unnest(live) place
  left join lateral (
    select (v ->> 'voter')::uuid voter, v ->> 'at' voted_at
    from jsonb_array_elements(votes) v
    where v ->> 'verdict' = 'approve' and not (v ->> 'stale')::boolean
      and v -> 'locations' ? place::text
      and (v ->> 'voter')::uuid = any (app_private.time_off_location_voters(w, r.employee_id, place))
    order by v ->> 'at' limit 1
  ) counted on true;

  return jsonb_build_object(
    'status', r.status,
    'fallback', cardinality(live) = 0,
    'locations', places,
    'remaining', (select count(*)::integer from jsonb_array_elements(places) p where p -> 'approved_by' = 'null'::jsonb),
    'votes', votes,
    'decide_by', r.decide_by,
    'fingerprint', pictured ->> 'fingerprint');
end;
$$;

-- 6. Closing a request ---------------------------------------------------------

-- "Olcay is off — 2 shifts are open": the managers of each location whose
-- shifts the time off opened, but not the one who settled it.
create function app_private.time_off_notify_shifts_opened(actor uuid, w uuid, rid uuid, decision integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare fmt text; person_name text; g record;
begin
 fmt := case when (select s.time_format from public.workspace_scheduling_settings s where s.workspace_id = w) = '24h'
  then 'HH24:MI' else 'FMHH12:MI AM' end;
 select coalesce(nullif(e.preferred_name, ''), e.first_name) into person_name
  from public.schedule_time_off_requests r join public.employee_profiles e on e.id = r.employee_id and e.workspace_id = r.workspace_id
  where r.id = rid and r.workspace_id = w;
 for g in
  with opened as (
   select p.location_id, l.name location_name, p.scheduled_date, p.start_time, p.end_time
   from public.time_off_assignment_releases rel
   join public.schedule_published_shifts p on p.id = rel.published_shift_id and p.workspace_id = w
   join public.locations l on l.id = p.location_id and l.workspace_id = w
   where rel.workspace_id = w and rel.request_id = rid and rel.decision_revision = decision
  ), managers as (
   select m.user_id from public.workspace_memberships m
   where m.workspace_id = w and m.status = 'active' and m.user_id is distinct from actor
    -- A manager: deciding alone is not theirs anywhere (the core, no role reading).
    and app_private.authz_reason(m.user_id, w, 'time_off.decide_alone') is not null
  ), told as (
   select mg.user_id, o.* from managers mg join opened o
    on app_private.authz_reason(mg.user_id, w, 'schedule.edit', array[o.location_id]) is null
  ), per_person as (
   select t.user_id, count(*)::integer n, min(t.scheduled_date) first_day,
    array_agg(to_char(t.scheduled_date, 'Dy, Mon FMDD') || ', ' || to_char(t.start_time, fmt) || '–' || to_char(t.end_time, fmt)
     || ' (' || t.location_name || ')' order by t.scheduled_date, t.start_time, t.location_name) shift_lines
   from told t group by t.user_id
  ), worded as (
   select p.*, array_to_string(p.shift_lines[1:3], '; ')
     || case when cardinality(p.shift_lines) > 3 then '; +' || (cardinality(p.shift_lines) - 3) || ' more' else '' end lines
   from per_person p
  )
  select n, first_day, lines, array_agg(user_id order by user_id) recipients
  from worded group by n, first_day, lines
 loop
  perform public.enqueue_notification_outbox_service(w, gen_random_uuid(), 'schedule.time_off.shifts_opened', 1, actor,
   'schedule_time_off_requests', rid::text,
   jsonb_build_object('request_id', rid, 'recipient_user_ids', to_jsonb(g.recipients),
    'audience_contract', 'time_off_location_managers', 'category', 'schedule',
    'title', left(coalesce(person_name, 'A teammate') || ' is off — ' || g.n || case when g.n = 1 then ' shift is open' else ' shifts are open' end, 160),
    'body', g.lines,
    'safe_preview', 'Approved time off left shifts open.',
    'action_url', '/app/schedule?date=' || g.first_day::text,
    'group_key', 'schedule_time_off_requests:' || rid::text),
   now());
 end loop;
end;
$$;

-- The last approval opens every published shift of the time off that has not
-- started, at every location; the release is kept for the record.
create function app_private.time_off_release_shifts(w uuid, rid uuid, actor uuid, decision integer, recorded_by uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
    if not found then raise exception 'A published shift changed before it could be opened; try again' using errcode = '40001'; end if;
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
    perform app_private.time_off_notify_shifts_opened(actor, w, rid, decision);
  end if;
  return changes;
end;
$$;

-- Settles a request: approved or denied (expired: denied by the system). An
-- approved request opens its shifts; an approved cancellation gives the hours
-- back, and the time off is revoked when nothing of it is left.
create function app_private.time_off_finalize(w uuid, rid uuid, verdict text, actor uuid, note text, alone boolean, expired boolean default false)
returns public.schedule_time_off_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.schedule_time_off_requests%rowtype;
  parent public.schedule_time_off_requests%rowtype;
  decided jsonb;
  released jsonb := '[]';
  given tstzmultirange;
  remaining tstzmultirange;
begin
  select * into r from public.schedule_time_off_requests where id = rid and workspace_id = w for update;
  -- Whoever got here first closed it (a withdrawal, a last vote, the job).
  if r.status <> 'pending' then
    raise exception 'This request is already closed' using errcode = '40001';
  end if;
  if verdict = 'approve' and r.request_type = 'time_off_cancellation' then
    select p.* into parent from public.time_off_cancellation_links cl
    join public.schedule_time_off_requests p on p.id = cl.parent_request_id and p.workspace_id = cl.workspace_id
    where cl.request_id = rid and cl.workspace_id = w for update of p;
    if parent.status not in ('approved', 'partially_approved') then
      raise exception 'The time off this cancellation is about has changed; refresh' using errcode = '40001';
    end if;
  end if;
  update public.schedule_time_off_segments
  set status = case verdict when 'approve' then 'approved' else 'denied' end::public.time_off_segment_status
  where request_id = rid and workspace_id = w;
  update public.schedule_time_off_requests
  set status = case verdict when 'approve' then 'approved' else 'denied' end::public.time_off_request_status,
      revision = revision + 1, updated_at = now()
  where id = rid returning * into r;
  select coalesce(jsonb_agg(jsonb_build_object('segment_id', s.id, 'status', s.status) order by s.starts_at, s.id), '[]') into decided
  from public.schedule_time_off_segments s where s.request_id = rid and s.workspace_id = w;
  if verdict = 'approve' and r.request_type = 'time_off' then
    -- The job settles it with no actor; the records name an approval that still counts.
    released := app_private.time_off_release_shifts(w, rid, actor, r.revision, case when actor is null then
      (select (x ->> 'approved_by')::uuid from jsonb_array_elements(app_private.time_off_state(w, rid) -> 'locations') x
       where x -> 'approved_by' <> 'null'::jsonb order by x ->> 'approved_at' desc limit 1) end);
  end if;
  insert into public.schedule_time_off_events(workspace_id, request_id, action, actor_user_id, note, metadata)
  values (w, rid, case when expired then 'expired' else r.status::text end, actor, coalesce(note, ''),
    jsonb_build_object('revision', r.revision, 'alone', alone, 'segments', decided, 'released_assignments', released));

  if verdict = 'approve' and r.request_type = 'time_off_cancellation' then
    select coalesce(range_agg(public.time_off_period_span(s.id)), '{}') into given
    from public.schedule_time_off_segments s where s.request_id = rid and s.workspace_id = w;
    select coalesce(range_agg(p.span), '{}') into remaining
    from public.schedule_time_off_segments s cross join lateral unnest(public.time_off_effective_ranges(s.id)) p(span)
    where s.request_id = parent.id and s.workspace_id = w;
    update public.schedule_time_off_requests
    set status = case when isempty(remaining) then 'revoked'::public.time_off_request_status else status end,
        revision = revision + 1, updated_at = now()
    where id = parent.id returning * into parent;
    insert into public.schedule_time_off_events(workspace_id, request_id, action, actor_user_id, note, metadata)
    values (w, parent.id, case when isempty(remaining) then 'revoked' else parent.status::text end, actor,
      'Cancellation approved. Shifts opened earlier stay open.',
      jsonb_build_object('revision', parent.revision, 'cancellation_request_id', rid, 'cancelled_intervals', public.availability_ranges_json(given)));
  end if;
  return r;
end;
$$;

-- 7. Sending -------------------------------------------------------------------

-- The deadline: the start minus the workspace's lead time, or the start itself
-- for a request sent inside it.
create function app_private.time_off_decide_by(w uuid, starts timestamptz)
returns timestamptz
language sql
stable security definer
set search_path = ''
as $$
  select case when starts - make_interval(hours => lead) > now() then starts - make_interval(hours => lead) else starts end
  from (select coalesce((select s.time_off_lead_hours from public.workspace_scheduling_settings s where s.workspace_id = w), 24) lead) setting;
$$;

-- Employee Hub > My availability > Request time off: one run of days in a
-- row, hours per day, in the primary location's time zone (the device's for
-- somebody who works nowhere), never already started.
create function public.submit_time_off_service(actor uuid, w uuid, periods jsonb, reason text, expected_timezone text, operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  employee public.employee_profiles%rowtype;
  zone_name text;
  command jsonb;
  prior public.time_off_commands%rowtype;
  period jsonb;
  resolved jsonb;
  asked jsonb := '[]';
  span tstzrange;
  covered tstzmultirange := '{}';
  rid uuid;
  result jsonb;
begin
  perform public.availability_lock_workspace(w);
  perform app_private.time_off_authorize(actor, w, 'time_off.request_own');
  select * into employee from public.employee_profiles e where e.workspace_id = w and e.user_id = actor and e.archived_at is null;
  if employee.id is null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'time_off.request_own';
  end if;
  if operation_id is null then raise exception 'A request key is required' using errcode = '22023'; end if;
  command := jsonb_build_object('kind', 'request', 'periods', periods, 'reason', btrim(coalesce(reason, '')), 'expected_timezone', expected_timezone);
  select * into prior from public.time_off_commands c where c.workspace_id = w and c.actor_user_id = actor and c.operation_id = submit_time_off_service.operation_id;
  if found then
    if prior.input <> command then raise exception 'This request key was used for different time-off hours' using errcode = '40001'; end if;
    return prior.result;
  end if;
  if jsonb_typeof(periods) is distinct from 'array' then raise exception 'Enter the requested time-off periods' using errcode = '22023'; end if;
  if jsonb_array_length(periods) not between 1 and 31 or char_length(btrim(coalesce(reason, ''))) > 1000 then
    raise exception 'Enter between 1 and 31 days and a note of at most 1000 characters' using errcode = '22023'; end if;

  select l.timezone into zone_name
  from public.employee_location_assignments a
  join public.locations l on l.id = a.location_id and l.workspace_id = a.workspace_id
  where a.workspace_id = w and a.employee_id = employee.id and a.ended_at is null and app_private.location_is_live(l)
  order by a.is_primary desc, a.assigned_at limit 1;
  if zone_name is null then
    zone_name := expected_timezone;
  elsif expected_timezone is distinct from zone_name then
    raise exception 'The time zone of your location changed. Review the hours in the current time zone before sending' using errcode = '40001';
  end if;

  for period in select value from jsonb_array_elements(periods) loop
    resolved := public.time_off_resolve_period(period, zone_name);
    span := tstzrange((resolved ->> 'starts_at')::timestamptz, (resolved ->> 'ends_at')::timestamptz, '[)');
    if covered && span then raise exception 'Requested time-off periods must not overlap or repeat' using errcode = '22023'; end if;
    covered := covered + tstzmultirange(span);
    asked := asked || jsonb_build_array(resolved);
  end loop;
  if lower(range_merge(covered)) <= now() then
    raise exception 'Time off that has already started cannot be asked for here. Talk to your manager directly' using errcode = '22023';
  end if;
  if (select max((p ->> 'segment_date')::date) - min((p ->> 'segment_date')::date) + 1 <> count(distinct p ->> 'segment_date')
      from jsonb_array_elements(asked) p) then
    raise exception 'A request is one run of days in a row' using errcode = '22023';
  end if;
  if exists (select 1 from public.schedule_time_off_requests other
    join public.schedule_time_off_segments s on s.request_id = other.id and s.workspace_id = other.workspace_id
    where other.workspace_id = w and other.employee_id = employee.id and other.request_type = 'time_off'
      and other.status in ('pending', 'approved', 'partially_approved') and s.status in ('pending', 'approved')
      and covered && public.time_off_effective_ranges(s.id)) then
    raise exception 'overlapping time off request exists' using errcode = '23514';
  end if;

  insert into public.schedule_time_off_requests(workspace_id, employee_id, location_id, reason, created_by, period_version, decide_by)
  values (w, employee.id, null, btrim(coalesce(reason, '')), actor, 2, app_private.time_off_decide_by(w, lower(range_merge(covered))))
  returning id into rid;
  insert into public.schedule_time_off_segments(workspace_id, request_id, segment_date, start_time, end_time, time_timezone, starts_at, ends_at, ends_next_day, fold_choices)
  select w, rid, (p ->> 'segment_date')::date, (p ->> 'start_time')::time, (p ->> 'end_time')::time, p ->> 'time_timezone',
    (p ->> 'starts_at')::timestamptz, (p ->> 'ends_at')::timestamptz, (p ->> 'ends_next_day')::boolean, p -> 'fold_choices'
  from jsonb_array_elements(asked) p;
  insert into public.time_off_required_locations(request_id, workspace_id, location_id)
  select rid, w, place from unnest(app_private.time_off_deciding_locations(w, employee.id)) place;
  insert into public.schedule_time_off_events(workspace_id, request_id, action, actor_user_id, metadata)
  values (w, rid, 'submitted', actor, jsonb_build_object('periods', asked, 'operation_id', submit_time_off_service.operation_id));
  -- The owner's own time off is recorded approved (K12, BL-221).
  if public.time_off_is_the_owners_own(actor, w, rid) then
    perform app_private.time_off_finalize(w, rid, 'approve', actor, '', true);
  end if;
  select jsonb_build_object('status', r.status, 'request_id', r.id, 'revision', r.revision, 'decide_by', r.decide_by) into result
  from public.schedule_time_off_requests r where r.id = rid;
  insert into public.time_off_commands(workspace_id, actor_user_id, operation_id, input, result)
  values (w, actor, submit_time_off_service.operation_id, command, result);
  return result;
end;
$$;

-- Asking to cancel approved time off, whole or in part: voted on like a
-- request; the time off stands while it waits.
create function public.request_time_off_cancellation_service(actor uuid, w uuid, parent_id uuid, expected_revision integer, periods jsonb, reason text, operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  employee public.employee_profiles%rowtype;
  parent public.schedule_time_off_requests%rowtype;
  original public.schedule_time_off_segments%rowtype;
  prior public.time_off_commands%rowtype;
  command jsonb;
  result jsonb;
  p jsonb;
  a timestamptz;
  b timestamptz;
  span tstzrange;
  covered tstzmultirange := '{}';
  rid uuid := gen_random_uuid();
  sid uuid;
begin
  perform public.availability_lock_workspace(w);
  perform app_private.time_off_authorize(actor, w, 'time_off.request_own');
  select r.* into parent from public.schedule_time_off_requests r
  join public.employee_profiles e on e.id = r.employee_id and e.workspace_id = r.workspace_id
  where r.id = parent_id and r.workspace_id = w and e.user_id = actor and e.archived_at is null
  for update of r;
  if parent.id is null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'time_off.request_own';
  end if;
  if operation_id is null then raise exception 'A cancellation request key is required' using errcode = '22023'; end if;
  command := jsonb_build_object('kind', 'cancellation', 'parent', parent_id, 'revision', expected_revision, 'reason', btrim(coalesce(reason, '')), 'periods', periods);
  select * into prior from public.time_off_commands c where c.workspace_id = w and c.actor_user_id = actor and c.operation_id = request_time_off_cancellation_service.operation_id;
  if found then
    if prior.input <> command then raise exception 'This request key was used for a different cancellation' using errcode = '40001'; end if;
    return prior.result;
  end if;
  if expected_revision is null or parent.revision <> expected_revision or parent.request_type <> 'time_off' or parent.status not in ('approved', 'partially_approved') then
    raise exception 'stale approved leave; refresh before requesting cancellation' using errcode = '40001'; end if;
  if exists (select 1 from public.time_off_cancellation_links cl join public.schedule_time_off_requests cr on cr.id = cl.request_id
    where cl.parent_request_id = parent.id and cr.status = 'pending') then
    raise exception 'A cancellation request is already pending for this leave' using errcode = '23514'; end if;
  if jsonb_typeof(periods) is distinct from 'array' then raise exception 'Choose approved hours to cancel' using errcode = '22023'; end if;
  if jsonb_array_length(periods) not between 1 and 124 or char_length(btrim(coalesce(reason, ''))) > 1000 then
    raise exception 'Choose up to 124 periods and a note of at most 1000 characters' using errcode = '22023'; end if;

  insert into public.schedule_time_off_requests(id, workspace_id, employee_id, location_id, request_type, reason, created_by, period_version)
  values (rid, w, parent.employee_id, parent.location_id, 'time_off_cancellation', btrim(coalesce(reason, '')), actor, 2);
  insert into public.time_off_cancellation_links values (rid, w, parent.id, parent.revision);
  for p in select value from jsonb_array_elements(periods) loop
    select * into original from public.schedule_time_off_segments where id = (p ->> 'segment_id')::uuid and workspace_id = w and request_id = parent.id;
    if original.id is null or original.time_timezone is null then raise exception 'Choose a snapshotted approved period from this leave' using errcode = '22023'; end if;
    if coalesce(p ->> 'starts_at', '') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' or coalesce(p ->> 'ends_at', '') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then
      raise exception 'Cancellation needs exact start and end instants' using errcode = '22023'; end if;
    a := (p ->> 'starts_at')::timestamptz; b := (p ->> 'ends_at')::timestamptz;
    if not isfinite(a) or not isfinite(b) or a >= b or a <= now() then raise exception 'Only future approved hours can be cancelled' using errcode = '22023'; end if;
    span := tstzrange(a, b, '[)');
    if not (public.time_off_effective_ranges(original.id) @> span) or covered && span then
      raise exception 'Cancellation must select approved hours without overlap' using errcode = '22023'; end if;
    covered := covered + tstzmultirange(span);
    sid := gen_random_uuid();
    insert into public.schedule_time_off_segments(id, workspace_id, request_id, segment_date, start_time, end_time, time_timezone, starts_at, ends_at, ends_next_day)
    values (sid, w, rid, (a at time zone original.time_timezone)::date, (a at time zone original.time_timezone)::time, (b at time zone original.time_timezone)::time,
      original.time_timezone, a, b, (b at time zone original.time_timezone)::date > (a at time zone original.time_timezone)::date);
    insert into public.time_off_cancellation_periods values (sid, w, rid, original.id, parent.id);
  end loop;
  update public.schedule_time_off_requests set decide_by = app_private.time_off_decide_by(w, lower(range_merge(covered))) where id = rid;
  insert into public.time_off_required_locations(request_id, workspace_id, location_id)
  select rid, w, place from unnest(app_private.time_off_deciding_locations(w, parent.employee_id)) place;
  insert into public.schedule_time_off_events(workspace_id, request_id, action, actor_user_id, note, metadata)
  values (w, rid, 'submitted', actor, btrim(coalesce(reason, '')),
    jsonb_build_object('parent_request_id', parent.id, 'parent_revision', parent.revision, 'operation_id', request_time_off_cancellation_service.operation_id));
  if public.time_off_is_the_owners_own(actor, w, rid) then
    perform app_private.time_off_finalize(w, rid, 'approve', actor, '', true);
  end if;
  select jsonb_build_object('status', r.status, 'request_id', r.id, 'revision', r.revision, 'decide_by', r.decide_by) into result
  from public.schedule_time_off_requests r where r.id = rid;
  insert into public.time_off_commands(workspace_id, actor_user_id, operation_id, input, result)
  values (w, actor, request_time_off_cancellation_service.operation_id, command, result);
  return result;
end;
$$;

-- 8. Deciding ------------------------------------------------------------------

-- Requests > Time off: approve or deny. An admin or the owner decides alone; a
-- manager votes for each of the person's fixed locations they may decide at.
-- The approval names the picture of the shifts it was given on (fingerprint
-- from app_private.time_off_impact); another picture is refused with 40001.
create function public.decide_time_off_service(actor uuid, w uuid, rid uuid, verdict text, note text, expected_impact text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.schedule_time_off_requests%rowtype;
  alone_why text;
  mine uuid[];
  pictured jsonb;
  state jsonb;
  settled public.schedule_time_off_requests%rowtype;
begin
  perform public.availability_lock_workspace(w);
  select * into r from public.schedule_time_off_requests where id = rid and workspace_id = w for update;
  if r.id is null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'time_off.decide';
  end if;
  alone_why := app_private.time_off_reason(actor, w, 'time_off.decide_alone', r.employee_id);
  if alone_why is not null then
    if alone_why not in ('rank', 'out_of_scope') then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || alone_why, detail = 'time_off.decide';
    end if;
    select coalesce(array_agg(place order by place), '{}') into mine
    from unnest(app_private.time_off_live_locations(w, rid)) place
    where app_private.time_off_reason(actor, w, 'time_off.decide', r.employee_id, place) is null;
    if cardinality(mine) = 0 then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || alone_why, detail = 'time_off.decide';
    end if;
  end if;
  if verdict is null or verdict not in ('approve', 'deny') then raise exception 'Choose approve or deny' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(note, ''))) > 1000 then raise exception 'The note can be at most 1000 characters' using errcode = '22023'; end if;
  if r.status <> 'pending' then raise exception 'This request is already closed' using errcode = '40001'; end if;
  if r.decide_by is not null and r.decide_by <= now() then raise exception 'This request was not decided in time' using errcode = '40001'; end if;
  pictured := app_private.time_off_impact(w, rid);
  if expected_impact is distinct from pictured ->> 'fingerprint' then
    raise exception 'The shifts this time off affects have changed. Review them again' using errcode = '40001';
  end if;

  if alone_why is null then
    settled := app_private.time_off_finalize(w, rid, verdict, actor, btrim(coalesce(note, '')), true);
    return jsonb_build_object('status', settled.status, 'final', true, 'alone', true, 'remaining', 0,
      'revision', settled.revision, 'request_id', rid);
  end if;

  insert into public.time_off_votes(request_id, workspace_id, voter_user_id, verdict, note, impact)
  values (rid, w, actor, verdict, btrim(coalesce(note, '')),
    (select jsonb_object_agg(place, coalesce(pictured -> 'locations' -> place::text ->> 'fingerprint', app_private.time_off_shifts_fingerprint('[]')))
     from unnest(mine) place))
  on conflict (request_id, voter_user_id) do update
  set verdict = excluded.verdict, note = excluded.note, impact = excluded.impact, updated_at = now();

  if verdict = 'deny' then
    settled := app_private.time_off_finalize(w, rid, 'deny', actor, btrim(coalesce(note, '')), false);
    return jsonb_build_object('status', settled.status, 'final', true, 'alone', false, 'remaining', 0,
      'revision', settled.revision, 'request_id', rid);
  end if;
  state := app_private.time_off_state(w, rid);
  if (state ->> 'remaining')::integer = 0 and not (state ->> 'fallback')::boolean then
    settled := app_private.time_off_finalize(w, rid, 'approve', actor, btrim(coalesce(note, '')), false);
    return jsonb_build_object('status', settled.status, 'final', true, 'alone', false, 'remaining', 0,
      'revision', settled.revision, 'request_id', rid);
  end if;
  update public.schedule_time_off_requests set revision = revision + 1, updated_at = now() where id = rid returning * into r;
  return jsonb_build_object('status', r.status, 'final', false, 'alone', false, 'remaining', (state ->> 'remaining')::integer,
    'revision', r.revision, 'request_id', rid);
end;
$$;

-- Taking approved time off back, with a reason: what has not started goes;
-- what was taken stays on record ("taken until"). A cancellation waiting on it
-- closes.
create function public.revoke_time_off_service(actor uuid, w uuid, rid uuid, expected_revision integer, reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.schedule_time_off_requests%rowtype;
  said text := btrim(coalesce(reason, ''));
  taken tstzmultirange;
  ahead tstzmultirange;
  cut_id uuid;
  sid uuid;
  seg record;
  other record;
begin
  perform public.availability_lock_workspace(w);
  select * into r from public.schedule_time_off_requests where id = rid and workspace_id = w and request_type = 'time_off' for update;
  if r.id is null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'time_off.revoke';
  end if;
  perform app_private.time_off_authorize(actor, w, 'time_off.revoke', r.employee_id);
  if said = '' or char_length(said) > 1000 then raise exception 'Say why the time off is revoked (at most 1000 characters)' using errcode = '22023'; end if;
  if expected_revision is null or r.revision <> expected_revision or r.status not in ('approved', 'partially_approved') then
    raise exception 'This time off changed; refresh before revoking it' using errcode = '40001'; end if;

  select coalesce(range_agg(s.span), '{}') into taken
  from (select unnest(public.time_off_effective_ranges(x.id)) * tstzrange(null, now(), '[)') span
        from public.schedule_time_off_segments x where x.request_id = rid and x.workspace_id = w) s
  where not isempty(s.span);
  select coalesce(range_agg(s.span), '{}') into ahead
  from (select unnest(public.time_off_effective_ranges(x.id)) * tstzrange(now(), null, '[)') span
        from public.schedule_time_off_segments x where x.request_id = rid and x.workspace_id = w) s
  where not isempty(s.span);
  if isempty(ahead) then
    raise exception 'Nothing of this time off is left to revoke' using errcode = '22023';
  end if;

  if not isempty(taken) then
    -- Already under way: the hours from now on are given back by a
    -- cancellation the revoke settles itself; the time off stays approved.
    cut_id := gen_random_uuid();
    insert into public.schedule_time_off_requests(id, workspace_id, employee_id, location_id, request_type, reason, created_by, period_version)
    values (cut_id, w, r.employee_id, r.location_id, 'time_off_cancellation', said, actor, 2);
    insert into public.time_off_cancellation_links values (cut_id, w, r.id, r.revision);
    for seg in select s.id, s.time_timezone, p.piece from public.schedule_time_off_segments s
      cross join lateral unnest(public.time_off_effective_ranges(s.id) * tstzmultirange(tstzrange(now(), null, '[)'))) p(piece)
      where s.request_id = rid and s.workspace_id = w order by lower(p.piece) loop
      if seg.time_timezone is null then
        raise exception 'Review the original time zone of this time off before revoking it' using errcode = '22023'; end if;
      sid := gen_random_uuid();
      insert into public.schedule_time_off_segments(id, workspace_id, request_id, segment_date, start_time, end_time, time_timezone, starts_at, ends_at, ends_next_day)
      values (sid, w, cut_id, (lower(seg.piece) at time zone seg.time_timezone)::date, (lower(seg.piece) at time zone seg.time_timezone)::time,
        (upper(seg.piece) at time zone seg.time_timezone)::time, seg.time_timezone, lower(seg.piece), upper(seg.piece),
        (upper(seg.piece) at time zone seg.time_timezone)::date > (lower(seg.piece) at time zone seg.time_timezone)::date);
      insert into public.time_off_cancellation_periods values (sid, w, cut_id, seg.id, r.id);
    end loop;
    insert into public.schedule_time_off_events(workspace_id, request_id, action, actor_user_id, note, metadata)
    values (w, cut_id, 'submitted', actor, said, jsonb_build_object('parent_request_id', r.id, 'parent_revision', r.revision, 'shortened', true, 'source', 'revoke'));
    update public.schedule_time_off_segments set status = 'approved' where request_id = cut_id and workspace_id = w;
    update public.schedule_time_off_requests set status = 'approved', revision = revision + 1, updated_at = now() where id = cut_id;
    insert into public.schedule_time_off_events(workspace_id, request_id, action, actor_user_id, note, metadata)
    values (w, cut_id, 'approved', actor, said, jsonb_build_object('shortened', true, 'source', 'revoke'));
  end if;

  update public.schedule_time_off_requests
  set status = case when isempty(taken) then 'revoked'::public.time_off_request_status else status end,
      revision = revision + 1, updated_at = now()
  where id = rid returning * into r;
  insert into public.schedule_time_off_events(workspace_id, request_id, action, actor_user_id, note, metadata)
  values (w, rid, 'revoked', actor, said,
    jsonb_build_object('revision', r.revision) || case when isempty(taken) then '{}'::jsonb
      else jsonb_build_object('taken_until', now(), 'cancellation_request_id', cut_id) end);

  for other in select cr.id from public.time_off_cancellation_links cl join public.schedule_time_off_requests cr on cr.id = cl.request_id
    where cl.parent_request_id = rid and cl.workspace_id = w and cr.status = 'pending' for update of cr loop
    update public.schedule_time_off_requests set status = 'revoked', revision = revision + 1, updated_at = now() where id = other.id;
    insert into public.schedule_time_off_events(workspace_id, request_id, action, actor_user_id, note, metadata)
    values (w, other.id, 'revoked', actor, 'Closed because the time off was revoked.', jsonb_build_object('parent_request_id', rid));
  end loop;
  return jsonb_build_object('status', r.status, 'request_id', r.id, 'revision', r.revision);
end;
$$;

-- 9. Notices -------------------------------------------------------------------

insert into public.notification_catalog (
  type_key, schema_version, category, severity, sensitivity, supported_channels,
  default_cadence, audience_contract, action_route_contract, dedupe_policy,
  retention_class, template_key, lifecycle, mandatory_in_app, notification_scope
) values
  ('requests.time_off.decided', 1, 'requests', 'info', 'confidential', '{in_app}', 'immediate', 'time_off_deciders',
   '{"route": "/app/schedule/requests", "allowed_query_keys": ["tab", "request"]}',
   '{"scope": "event_recipient", "strategy": "keep_first", "key_fields": ["event_id", "recipient_user_id"]}',
   'sensitive_30d', 'requests.time_off.decided.v1', 'active', false, 'workspace'),
  ('schedule.time_off.shifts_opened', 1, 'schedule', 'action_required', 'confidential', '{in_app}', 'immediate', 'time_off_location_managers',
   '{"route": "/app/schedule", "allowed_query_keys": ["date"]}',
   '{"scope": "event_recipient", "strategy": "keep_first", "key_fields": ["event_id", "recipient_user_id"]}',
   'sensitive_30d', 'schedule.time_off.shifts_opened.v1', 'active', false, 'workspace');
insert into public.notification_producer_registry (type_key, schema_version, producer_id, source_migration, source_function, integration_contract) values
  ('requests.time_off.decided', 1, 'time-off-decided', '20261003031000_time_off_votes_decide_requests.sql', 'notify_schedule_request_event_service', 'outbox_v1'),
  ('schedule.time_off.shifts_opened', 1, 'time-off-shifts-opened', '20261003031000_time_off_votes_decide_requests.sql', 'time_off_notify_shifts_opened', 'outbox_v1');
insert into public.notification_template_versions (type_key, schema_version, channel, locale, template_version, template_key, content, status, published_at) values
  ('requests.time_off.decided', 1, 'in_app', 'en', 1, 'requests.time_off.decided.v1',
   '{"title": "Time-off request closed", "body": "A time-off request you could decide was closed.", "action_url": "/app/schedule/requests", "safe_preview": "A time-off request was closed."}',
   'published', now()),
  ('schedule.time_off.shifts_opened', 1, 'in_app', 'en', 1, 'schedule.time_off.shifts_opened.v1',
   '{"title": "Shifts are open", "body": "Approved time off left shifts open.", "action_url": "/app/schedule", "safe_preview": "Approved time off left shifts open."}',
   'published', now());

-- A request event tells the people it concerns. Sent: those who decide it.
-- Closed: the person, and the managers who could have decided it. The owner's
-- own time off asks nobody. A request of the old services stands in for its
-- list with its location.
create or replace function public.notify_schedule_request_event_service()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.schedule_time_off_requests%rowtype;
  requester uuid;
  recipients uuid[];
  is_cancel boolean;
  title text;
  body text;
  preview text;
  url text;
  places jsonb;
begin
  select * into r from public.schedule_time_off_requests where id = new.request_id and workspace_id = new.workspace_id;
  if r.id is null or new.action in ('viewed', 'returned_to_pending') then
    return new;
  end if;
  -- BL-182/BL-127: a shortening tells its own people (requests.time_off.shortened).
  if public.time_off_event_is_shortening(new.workspace_id, new.request_id, new.metadata) then
    return new;
  end if;
  is_cancel := r.request_type = 'time_off_cancellation';
  places := case when r.location_id is null then '{}'::jsonb
    else jsonb_build_object('location_id', r.location_id, 'location_ids', jsonb_build_array(r.location_id)) end;
  select e.user_id into requester from public.employee_profiles e where e.id = r.employee_id and e.workspace_id = r.workspace_id;

  if new.action = 'submitted' then
    -- The owner's own time off is recorded without review (BL-183).
    if public.time_off_is_the_owners_own(new.actor_user_id, new.workspace_id, new.request_id) then
      return new;
    end if;
    select coalesce(array_agg(u order by u), '{}') into recipients
    from unnest(app_private.time_off_deciders(new.workspace_id, r.id)) u where u is distinct from new.actor_user_id;
    perform public.enqueue_notification_outbox_service(new.workspace_id, new.id, 'requests.time_off.submitted', 1, new.actor_user_id,
      tg_table_name, new.request_id::text,
      jsonb_build_object('correlation_id', new.id, 'request_id', new.request_id, 'request_event_id', new.id, 'request_action', new.action,
        'recipient_user_ids', to_jsonb(recipients), 'audience_contract', 'schedule_request_reviewers', 'category', 'request',
        'title', case when is_cancel then 'Leave cancellation requested' else 'New time-off request' end,
        'body', case when is_cancel then 'Review the proposed cancellation. Approved leave stays in effect until accepted.'
          else 'A time-off request needs your decision.' end,
        'safe_preview', case when is_cancel then 'A leave cancellation needs review.' else 'A schedule request needs review.' end,
        'action_url', '/app/schedule/requests?tab=time-off&request=' || new.request_id::text,
        'group_key', tg_table_name || ':' || new.request_id::text) || places,
      new.created_at);
    return new;
  end if;

  -- The person who asked, unless they did it themselves.
  title := case when is_cancel then 'Leave cancellation updated' else 'Time-off request updated' end;
  body := case
    when new.action = 'expired' then 'Your request was not decided in time and was declined.'
    when is_cancel and new.action = 'denied' then 'Your cancellation was declined. The approved leave remains in effect.'
    when is_cancel and new.action = 'revoked' then 'Your cancellation request was closed. Review the original leave for its current status.'
    when is_cancel then 'Your leave cancellation was reviewed. Shifts opened earlier stay open.'
    else 'Your time-off request status changed.' end;
  preview := case when is_cancel then 'A leave cancellation was updated.' else 'A schedule request was updated.' end;
  url := case when is_cancel then '/app/employee-hub/my-availability#request-' || new.request_id::text else '/app/employee-hub/my-availability' end;
  perform public.enqueue_notification_outbox_service(new.workspace_id, new.id, 'requests.time_off.status_changed', 1, new.actor_user_id,
    tg_table_name, new.request_id::text,
    jsonb_build_object('correlation_id', new.id, 'request_id', new.request_id, 'request_event_id', new.id, 'request_action', new.action,
      'recipient_user_ids', to_jsonb(case when requester is not null and requester is distinct from new.actor_user_id then array[requester] else '{}'::uuid[] end),
      'audience_contract', 'time_off_requester', 'category', 'request',
      'title', title, 'body', body, 'safe_preview', preview, 'action_url', url,
      'group_key', tg_table_name || ':' || new.request_id::text) || places,
    new.created_at);

  -- The managers who could have decided it, but not who closed it; never for
  -- the owner's own time off.
  -- No actor (the system's own decline) is never the owner's own.
  if new.action in ('approved', 'denied', 'revoked', 'expired', 'partially_approved')
     and not coalesce(public.time_off_is_the_owners_own(new.actor_user_id, new.workspace_id, new.request_id), false) then
    select coalesce(array_agg(u order by u), '{}') into recipients
    from unnest(app_private.time_off_deciders(new.workspace_id, r.id, false)) u where u is distinct from new.actor_user_id;
    if cardinality(recipients) > 0 then
      perform public.enqueue_notification_outbox_service(new.workspace_id, gen_random_uuid(), 'requests.time_off.decided', 1, new.actor_user_id,
        tg_table_name, new.request_id::text,
        jsonb_build_object('correlation_id', new.id, 'request_id', new.request_id, 'request_event_id', new.id, 'request_action', new.action,
          'recipient_user_ids', to_jsonb(recipients), 'audience_contract', 'time_off_deciders', 'category', 'request',
          'title', case new.action when 'approved' then 'Time off approved' when 'denied' then 'Time off declined'
            when 'expired' then 'Time off not decided in time' else 'Time off withdrawn or revoked' end,
          'body', case when is_cancel then 'A leave cancellation you could decide was closed.' else 'A time-off request you could decide was closed.' end,
          'safe_preview', 'A time-off request was closed.',
          'action_url', '/app/schedule/requests?tab=time-off&request=' || new.request_id::text,
          'group_key', tg_table_name || ':' || new.request_id::text) || places,
        new.created_at);
    end if;
  end if;
  return new;
end;
$$;

-- 10. Who may call what -------------------------------------------------------

revoke all on function
  app_private.time_off_reason(uuid, uuid, text, uuid, uuid),
  app_private.time_off_authorize(uuid, uuid, text, uuid),
  app_private.time_off_location_voters(uuid, uuid, uuid),
  app_private.time_off_alone_deciders(uuid, uuid),
  app_private.time_off_deciding_locations(uuid, uuid),
  app_private.time_off_live_locations(uuid, uuid),
  app_private.time_off_deciders(uuid, uuid, boolean),
  app_private.time_off_shifts_fingerprint(jsonb),
  app_private.time_off_impact(uuid, uuid),
  app_private.time_off_state(uuid, uuid),
  app_private.time_off_notify_shifts_opened(uuid, uuid, uuid, integer),
  app_private.time_off_release_shifts(uuid, uuid, uuid, integer, uuid),
  app_private.time_off_finalize(uuid, uuid, text, uuid, text, boolean, boolean),
  app_private.time_off_decide_by(uuid, timestamptz)
from public, anon, authenticated, service_role;

revoke all on function
  public.submit_time_off_service(uuid, uuid, jsonb, text, text, uuid),
  public.request_time_off_cancellation_service(uuid, uuid, uuid, integer, jsonb, text, uuid),
  public.decide_time_off_service(uuid, uuid, uuid, text, text, text),
  public.revoke_time_off_service(uuid, uuid, uuid, integer, text)
from public, anon, authenticated;
grant execute on function
  public.submit_time_off_service(uuid, uuid, jsonb, text, text, uuid),
  public.request_time_off_cancellation_service(uuid, uuid, uuid, integer, jsonb, text, uuid),
  public.decide_time_off_service(uuid, uuid, uuid, text, text, text),
  public.revoke_time_off_service(uuid, uuid, uuid, integer, text)
to service_role;

-- 11. Shortening asks time_off.revoke and leaves the time off approved ---------

CREATE OR REPLACE FUNCTION public.shorten_time_off_service(actor uuid, w uuid, rid uuid, expected_revision integer, periods jsonb, note text, operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare parent public.schedule_time_off_requests%rowtype; prior public.time_off_commands%rowtype; command jsonb; result jsonb;
 p jsonb; a timestamptz; b timestamptz; span tstzrange; cut tstzmultirange:='{}';
begin
 perform public.availability_lock_workspace(w);
 select * into parent from public.schedule_time_off_requests where id=rid and workspace_id=w and request_type='time_off' for update;
 if parent.id is null then raise exception 'Not allowed' using errcode='42501', hint='authz.out_of_scope', detail='time_off.revoke'; end if;
 perform app_private.time_off_authorize(actor,w,'time_off.revoke',parent.employee_id);
 if operation_id is null then raise exception 'A request key is required' using errcode='22023'; end if;
 command:=jsonb_build_object('kind','shorten','request_id',rid,'expected_revision',expected_revision,'periods',periods,'note',btrim(coalesce(note,'')));
 select * into prior from public.time_off_commands c where c.workspace_id=w and c.actor_user_id=actor and c.operation_id=shorten_time_off_service.operation_id;
 if found then
  if prior.input<>command then raise exception 'This request key was used for a different change' using errcode='40001'; end if;
  return prior.result;
 end if;
 if expected_revision is null or parent.revision<>expected_revision or parent.status not in('approved','partially_approved') then
  raise exception 'stale approved leave; refresh before shortening it' using errcode='40001'; end if;
 if jsonb_typeof(periods) is distinct from 'array' or jsonb_array_length(periods) not between 1 and 124 then
  raise exception 'Choose up to 124 periods of approved hours' using errcode='22023'; end if;
 if char_length(btrim(coalesce(note,'')))>1000 then raise exception 'The note can be at most 1000 characters' using errcode='22023'; end if;
 for p in select value from jsonb_array_elements(periods) loop
  if coalesce(p->>'starts_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' or coalesce(p->>'ends_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then
   raise exception 'Each period needs exact start and end instants' using errcode='22023'; end if;
  a:=(p->>'starts_at')::timestamptz; b:=(p->>'ends_at')::timestamptz;
  if not isfinite(a) or not isfinite(b) or a>=b or a<=now() then raise exception 'Only future approved hours can be given back' using errcode='22023'; end if;
  span:=tstzrange(a,b,'[)');
  if cut && span or not exists(select 1 from public.schedule_time_off_segments s where s.id=(p->>'segment_id')::uuid and s.workspace_id=w
   and s.request_id=parent.id and public.time_off_effective_ranges(s.id) @> span) then
   raise exception 'Choose approved hours of this time off, without overlap' using errcode='22023'; end if;
  cut:=cut+tstzmultirange(span);
 end loop;
 perform app_private.shorten_time_off(actor,w,parent.employee_id,cut,coalesce(nullif(btrim(coalesce(note,'')),''),'Shortened by a manager.'),
  jsonb_build_object('source','manager','request_id',rid));
 select jsonb_build_object('status',r.status,'request_id',r.id,'revision',r.revision) into result
  from public.schedule_time_off_requests r where r.id=rid;
 insert into public.time_off_commands(workspace_id,actor_user_id,operation_id,input,result) values(w,actor,operation_id,command,result);
 return result;
end;
$function$;

CREATE OR REPLACE FUNCTION app_private.shorten_time_off(actor uuid, w uuid, emp uuid, cut tstzmultirange, note text, source jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare parent public.schedule_time_off_requests%rowtype; seg record; rid uuid; sid uuid; zone_name text;
 given tstzmultirange; remaining tstzmultirange; next_status public.time_off_request_status; said text; result jsonb:='[]';
begin
 perform public.availability_lock_workspace(w);
 if cut is null or isempty(cut) then return result; end if;
 if exists(select 1 from unnest(cut) x where lower(x)<=now() or not isfinite(lower(x)) or not isfinite(upper(x))) then
  raise exception 'Only future approved hours can be given back' using errcode='22023'; end if;
 said:=left(btrim(coalesce(note,'')),1000);
 for parent in select r.* from public.schedule_time_off_requests r
  where r.workspace_id=w and r.employee_id=emp and r.request_type='time_off' and r.status in('approved','partially_approved')
   and exists(select 1 from public.schedule_time_off_segments s where s.request_id=r.id and s.workspace_id=w and public.time_off_effective_ranges(s.id) && cut)
  order by r.created_at, r.id for update loop
  rid:=gen_random_uuid(); given:='{}';
  insert into public.schedule_time_off_requests(id,workspace_id,employee_id,location_id,request_type,reason,created_by,period_version)
   values(rid,w,emp,parent.location_id,'time_off_cancellation',said,actor,2);
  insert into public.time_off_cancellation_links values(rid,w,parent.id,parent.revision);
  for seg in select s.id,s.time_timezone,p.piece from public.schedule_time_off_segments s
   cross join lateral unnest(public.time_off_effective_ranges(s.id)*cut) p(piece)
   where s.request_id=parent.id and s.workspace_id=w order by lower(p.piece) loop
   if seg.time_timezone is null then
    raise exception 'Review the original time zone of this time off before shortening it' using errcode='22023'; end if;
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
  perform public.notify_time_off_shortened(actor,w,parent.id,given,zone_name,source);
  result:=result||jsonb_build_array(jsonb_build_object('request_id',parent.id,'revision',parent.revision,'status',parent.status,
   'cancellation_request_id',rid,'intervals',public.availability_ranges_json(given)));
 end loop;
 return result;
end;
$function$;

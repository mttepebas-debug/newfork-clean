-- Time off rebuild D6 (KARARLAR S-239 (2)): no setting and no automatic decline. A request still waiting a day
-- before it starts reminds whoever may answer it, once; still waiting when it starts, it expires. A cancellation
-- still waiting when the time off is over expires and the time off stays; nobody is reminded of a cancellation.
--
-- app_private.time_off_requests_sweep() writes it, every five minutes (pg_cron job time-off-requests). The readers
-- already read a started request (and a cancellation of time off that is over) as expired (D2–D5); the sweep
-- writes the same state, so nothing reads differently before and after it.
--   * Each request on its own, its row locked and skipped when somebody holds it (an answer in progress): one
--     that fails is rolled back alone and kept in app_private.time_off_request_sweep_failures (BL-507); the rest
--     of the pass goes on. A request that later goes through clears its failure.
--   * No workspace lock: the sweep never changes `effective` (BL-506). A pass stops at its count (500) or its
--     time (30 seconds), the earliest due first; the rest wait for the next pass.
--   * A reminder writes reminded_at once and leaves the revision: an answer in hand still holds. A request asked
--     in its last day is not reminded of.
--   * Expired writes ended_at as the moment it expired (the start; for a cancellation, the end of the time off),
--     by nobody, and a new revision.
--
-- Notices (subject 'time_off'): the reminder is time_off.decision_reminder to who would be asked now, in S-169's
-- order (notify_deciders); an expired request tells the employee (time_off.decided, outcome 'expired', as the
-- old system's "wasn't decided in time") and closes the cards still waiting, as an expired cancellation does.
-- An answer given after the start (D3, D4) writes the same expiry, so the employee hears it there too.
-- The reminder's body is dates and fixed words: a lock screen may show it (push_shows_body), as the old one's.
--
-- The old system's sweep (time_off_sweep, cron time-off-deadlines, time_off_sweep_failures) stays as it is for
-- the old rows until D8.

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

  -- A day before it starts, still waiting (D6): whoever would be asked now; nothing closes.
  if what = 'reminder' then
    return app_private.notify('time_off.decision_reminder', r.workspace_id, asked,
      'time_off:' || r.id::text || ':reminder', 'Time off request from ' || name || ' still waits',
      days || ' · It starts in less than a day. Answer it before it starts.', card_url, null, 'time_off', r.id,
      jsonb_build_object('request_id', r.id, 'kind_of_leave', r.kind_of_leave));
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

-- The reminder's body is the dates and fixed words, so a lock screen may show it, as the old reminder's.
create or replace function app_private.push_shows_body(target_type text, target_subject text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (target_type, target_subject) in (
    ('schedule.published', 'schedule_publication'), ('schedule.shift_added', 'schedule_publication'),
    ('schedule.shift_changed', 'schedule_publication'), ('schedule.shift_removed', 'schedule_publication'),
    ('people.onboarding_completed', 'onboarding_case'), ('time_off.decision_reminder', 'time_off_request'),
    ('time_off.decision_reminder', 'time_off'))
$$;

-- A request the sweep could not remind of or expire, kept so it is seen and not only logged (BL-507).
create table app_private.time_off_request_sweep_failures (
  request_id uuid primary key references public.time_off_requests (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  first_failed_at timestamptz not null default now(),
  last_failed_at timestamptz not null default now(),
  attempts integer not null default 1,
  sqlstate text not null,
  message text not null
);

comment on table app_private.time_off_request_sweep_failures is
  'A time off request (public.time_off_requests) the sweep could not remind of or expire, kept so it is seen and not only logged (BL-507).';

alter table app_private.time_off_request_sweep_failures enable row level security;
revoke all on table app_private.time_off_request_sweep_failures from public, anon, authenticated;

-- The sweep. Due: a leave request still waiting at its start (expire) or a day before it when it was asked earlier
-- than that and nobody has been reminded (remind); a cancellation still waiting at the end of the time off
-- (expire). Gives back how many it reminded of or expired.
create function app_private.time_off_requests_sweep(pass_limit integer default 500,
  pass_time interval default interval '30 seconds')
returns integer
language plpgsql
set search_path = ''
as $$
declare
  started timestamptz := clock_timestamp();
  due record;
  r public.time_off_requests;
  done integer := 0;
begin
  for due in
    select q.id, q.workspace_id
    from public.time_off_requests q
    where q.status = 'pending'
      and ((q.kind = 'leave' and (q.starts_at <= now()
             or (q.reminded_at is null and q.starts_at - interval '1 day' <= now()
                 and q.created_at < q.starts_at - interval '1 day')))
        or (q.kind = 'cancel' and q.ends_at <= now()))
    order by case when q.kind = 'cancel' then q.ends_at when q.starts_at <= now() then q.starts_at
                  else q.starts_at - interval '1 day' end, q.id
    limit pass_limit
  loop
    -- Each request on its own: one that fails is rolled back alone and kept; the rest of the pass goes on.
    begin
      -- Read again under its row lock: an answer or a withdrawal may have closed it. One that somebody holds
      -- now is left for the next pass.
      select * into r from public.time_off_requests q where q.id = due.id and q.status = 'pending'
      for update skip locked;
      if found then
        if (r.kind = 'leave' and r.starts_at <= now()) or (r.kind = 'cancel' and r.ends_at <= now()) then
          update public.time_off_requests
          set status = 'expired', ended_at = case when r.kind = 'cancel' then r.ends_at else r.starts_at end,
              revision = revision + 1, updated_at = now()
          where id = r.id
          returning * into r;
          perform app_private.time_off_request_tell(r, 'expired', null);
          done := done + 1;
        elsif r.kind = 'leave' and r.reminded_at is null and r.starts_at - interval '1 day' <= now()
              and r.created_at < r.starts_at - interval '1 day' then
          update public.time_off_requests set reminded_at = now() where id = r.id returning * into r;
          perform app_private.time_off_request_tell(r, 'reminder', null);
          done := done + 1;
        end if;
        delete from app_private.time_off_request_sweep_failures f where f.request_id = r.id;
      end if;
    exception when others then
      insert into app_private.time_off_request_sweep_failures (request_id, workspace_id, sqlstate, message)
      values (due.id, due.workspace_id, sqlstate, sqlerrm)
      on conflict (request_id) do update
      set last_failed_at = now(), attempts = app_private.time_off_request_sweep_failures.attempts + 1,
          sqlstate = excluded.sqlstate, message = excluded.message;
      raise warning 'time-off-requests: request % of workspace % failed: % %', due.id, due.workspace_id, sqlstate, sqlerrm;
    end;
    -- Out of time: the request in hand is done; the rest wait for the next pass.
    exit when clock_timestamp() - started >= pass_time;
  end loop;
  return done;
end;
$$;

revoke all on function app_private.time_off_requests_sweep(integer, interval) from public;

select cron.unschedule(jobid) from cron.job where jobname = 'time-off-requests';
select cron.schedule('time-off-requests', '*/5 * * * *', 'select app_private.time_off_requests_sweep()');

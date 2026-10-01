-- FB-6.3 D1, D2 (third nf-guvenlik review): the deadline job's reminder and
-- notice when a location's managers are held back for now (a missing
-- document; user decisions 2026-10-01: such a location stays and goes to an
-- admin and the owner, the reminder goes to those who have not decided).
-- D1: twelve hours before the deadline, a fixed location nobody can vote at
--     now is reminded through an admin and the owner; the managers of the
--     other waiting locations are reminded as before, each person once.
-- D2: the notice to an admin and the owner no longer says no manager is
--     left: one may only be held back.
-- Only app_private.time_off_sweep() is redefined.

create or replace function app_private.time_off_sweep()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  st jsonb;
  v jsonb;
  waiting uuid[];
  done integer := 0;
begin
  -- Not decided in time: the system declines it.
  for r in select q.id, q.workspace_id from public.schedule_time_off_requests q
    where q.status = 'pending' and q.decide_by is not null and q.decide_by <= now()
    order by q.decide_by, q.id limit 500 loop
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
      raise warning 'time-off-deadlines: request % of workspace % failed: % %', r.id, r.workspace_id, sqlstate, sqlerrm;
    end;
  end loop;

  for r in select q.* from public.schedule_time_off_requests q
    where q.status = 'pending' and q.decide_by > now()
    order by q.decide_by, q.id limit 500 loop
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
      perform app_private.time_off_notice(r.workspace_id, r.id, 'requests.time_off.review_again', array[(v ->> 'voter')::uuid], 'time_off_voter',
        'Look at this time off again', 'The shifts it affects changed, so your approval no longer counts.');
      done := done + 1;
    end loop;

    -- Every location still deciding has approved (another dropped out, KARARLAR
    -- "İzin" 2026-09-30): the request is settled, by the system.
    if (st ->> 'remaining')::integer = 0 and not (st ->> 'fallback')::boolean then
      perform app_private.time_off_finalize(r.workspace_id, r.id, 'approve', null, 'All deciding locations approved', false);
      done := done + 1;
      continue;
    end if;

    -- Only an admin or the owner can decide it now: tell them once.
    if ((st ->> 'fallback')::boolean or (st ->> 'unattended')::integer > 0) and r.fallback_notified_at is null
       and exists (select 1 from public.time_off_required_locations x where x.request_id = r.id) then
      perform app_private.time_off_notice(r.workspace_id, r.id, 'requests.time_off.reminder',
        app_private.time_off_alone_deciders(r.workspace_id, r.employee_id), 'time_off_fallback_deciders',
        'Time off waits for an admin', 'No manager can decide this now.');
      update public.schedule_time_off_requests set fallback_notified_at = now() where id = r.id;
      done := done + 1;
    end if;

    -- Twelve hours before the deadline, once; not for one sent inside them.
    if r.reminded_at is null and r.decide_by - interval '12 hours' <= now() and r.created_at < r.decide_by - interval '12 hours' then
      st := app_private.time_off_state(r.workspace_id, r.id);
      if (st ->> 'fallback')::boolean then
        waiting := app_private.time_off_alone_deciders(r.workspace_id, r.employee_id);
      else
        select coalesce(array_agg(distinct u order by u), '{}') into waiting
        from jsonb_array_elements(st -> 'locations') x,
             unnest(app_private.time_off_location_voters(r.workspace_id, r.employee_id, (x ->> 'id')::uuid)) u
        where x -> 'approved_by' = 'null'::jsonb;
        -- A location nobody can vote at now: an admin and the owner, who can decide it.
        if (st ->> 'unattended')::integer > 0 then
          waiting := array(select distinct u from unnest(waiting || app_private.time_off_alone_deciders(r.workspace_id, r.employee_id)) u order by u);
        end if;
      end if;
      perform app_private.time_off_notice(r.workspace_id, r.id, 'requests.time_off.reminder', waiting, 'time_off_deciders',
        'Time off waits for your decision', 'Decide before the deadline or it is declined.');
      update public.schedule_time_off_requests set reminded_at = now() where id = r.id;
      done := done + 1;
    end if;
    exception when others then
      raise warning 'time-off-deadlines: request % of workspace % failed: % %', r.id, r.workspace_id, sqlstate, sqlerrm;
    end;
  end loop;
  return done;
end;
$$;

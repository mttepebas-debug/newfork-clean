-- FB-6.3.8b (user decision 2026-10-01, KARARLAR "İzin" - one time-off notice
-- per pass): when the deadline job would tell an admin and the owner both
-- "Time off waits for an admin" and "Time off waits for your decision" about
-- one request in the same pass, they get one line carrying both. Managers
-- still waiting are reminded as before; with only one of the two due,
-- nothing changes. Only app_private.time_off_sweep() is redefined.

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
  alone uuid[];
  fallback_due boolean;
  reminder_due boolean;
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

    fallback_due := ((st ->> 'fallback')::boolean or (st ->> 'unattended')::integer > 0) and r.fallback_notified_at is null
      and exists (select 1 from public.time_off_required_locations x where x.request_id = r.id);
    -- Twelve hours before the deadline, once; not for one sent inside them.
    reminder_due := r.reminded_at is null and r.decide_by - interval '12 hours' <= now()
      and r.created_at < r.decide_by - interval '12 hours';
    alone := app_private.time_off_alone_deciders(r.workspace_id, r.employee_id);

    -- Only an admin or the owner can decide it now: tell them once. When the
    -- reminder is due in the same pass, this one line carries it for them.
    if fallback_due then
      perform app_private.time_off_notice(r.workspace_id, r.id, 'requests.time_off.reminder',
        alone, 'time_off_fallback_deciders', 'Time off waits for an admin',
        case when reminder_due then 'No manager can decide this now. Decide before the deadline or it is declined.'
             else 'No manager can decide this now.' end);
      update public.schedule_time_off_requests set fallback_notified_at = now() where id = r.id;
      done := done + 1;
    end if;

    if reminder_due then
      st := app_private.time_off_state(r.workspace_id, r.id);
      if (st ->> 'fallback')::boolean then
        waiting := alone;
      else
        select coalesce(array_agg(distinct u order by u), '{}') into waiting
        from jsonb_array_elements(st -> 'locations') x,
             unnest(app_private.time_off_location_voters(r.workspace_id, r.employee_id, (x ->> 'id')::uuid)) u
        where x -> 'approved_by' = 'null'::jsonb;
        -- A location nobody can vote at now: an admin and the owner, who can decide it.
        if (st ->> 'unattended')::integer > 0 then
          waiting := array(select distinct u from unnest(waiting || alone) u order by u);
        end if;
      end if;
      -- An admin and the owner already have it in the line above.
      if fallback_due then
        waiting := array(select u from unnest(waiting) u where u <> all (alone) order by u);
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

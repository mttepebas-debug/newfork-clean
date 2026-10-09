-- Reacquiring one's active working copy renews its lease, including after expiry.
-- Keep the workspace/row locks, permission guard, working shifts and revision.
-- Another holder still follows the existing conflict/recovery path.
do $migration$
declare
  definition text := pg_get_functiondef('public.acquire_schedule_edit_session_service_past_week_base(uuid,uuid,date,public.schedule_edit_source,uuid)'::regprocedure);
  anchor text := 'if existing_session.holder_user_id = actor_user_id then';
begin
  -- The local SQL verification may already have applied this exact change.
  if position($renewed$set last_heartbeat = now(), expires_at = now() + interval '4 minutes'$renewed$ in definition) > 0 then
    return;
  end if;
  if (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'Schedule resume lease anchor changed';
  end if;
  execute replace(definition, anchor, anchor || $renew$
      -- BL-069: renew same-holder lease
      update public.schedule_edit_sessions
      set last_heartbeat = now(), expires_at = now() + interval '4 minutes'
      where id = existing_session.id;
  $renew$);
end;
$migration$;

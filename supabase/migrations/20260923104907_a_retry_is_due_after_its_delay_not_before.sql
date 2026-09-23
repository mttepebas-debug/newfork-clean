-- A failed notification is retried after its delay, measured from the moment
-- it failed. The immediate deliveries (flush_shift_exchange_*,
-- flush_lineup_staffing_*) run inside the command's own transaction and pick
-- due work with clock_timestamp(); stamping the retry from now(), the start of
-- that transaction, put it in the past whenever the transaction had already
-- run longer than the delay, and the same flush picked it straight back up.
-- CI caught it on a slow runner (shift_exchange_immediate_inbox #17-19).
CREATE OR REPLACE FUNCTION public.fail_notification_outbox_service(target_worker_id text, target_outbox_id uuid, target_error text, target_max_attempts integer DEFAULT 5, target_base_delay_seconds integer DEFAULT 15)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  outbox public.notification_outbox%rowtype;
  next_status text;
  retry_delay_seconds integer;
begin
  if target_max_attempts not between 1 and 20 then
    raise exception 'notification max attempts must be between 1 and 20' using errcode = '22023';
  end if;
  if target_base_delay_seconds not between 1 and 3600 then
    raise exception 'notification retry delay must be between 1 and 3600' using errcode = '22023';
  end if;

  select * into outbox
  from public.notification_outbox item
  where item.id = target_outbox_id
  for update;
  if outbox.id is null then
    raise exception 'notification outbox item not found' using errcode = 'P0002';
  end if;
  if outbox.status <> 'leased' or outbox.lease_owner <> btrim(target_worker_id) then
    raise exception 'owned notification lease required' using errcode = '42501';
  end if;

  next_status := case when outbox.attempt_count >= target_max_attempts then 'dead_letter' else 'retry' end;
  retry_delay_seconds := least(
    86400,
    target_base_delay_seconds * power(2, greatest(outbox.attempt_count - 1, 0))::integer
  );

  update public.notification_outbox
  set status = next_status,
      available_at = case
        when next_status = 'retry' then clock_timestamp() + make_interval(secs => retry_delay_seconds)
        else available_at
      end,
      lease_owner = null,
      lease_expires_at = null,
      last_error = left(coalesce(nullif(btrim(target_error), ''), 'notification processing failed'), 2000)
  where id = outbox.id;

  return jsonb_build_object(
    'status', next_status,
    'outbox_id', outbox.id,
    'attempt_count', outbox.attempt_count,
    'retry_delay_seconds', case when next_status = 'retry' then retry_delay_seconds else null end
  );
end;
$function$;

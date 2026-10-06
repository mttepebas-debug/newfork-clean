-- EKRAN-01 BE-2b (KK-166, KARARLAR Schedule "Haftalık e-postada kısmi teslim
-- kuralı kapatmaz"): the weekly export email reached 9 of 10 people. It is
-- recorded as sent (so the 9 are not emailed again by the next hourly run),
-- the week says who missed it, and the count of sends that reached nobody
-- starts over: only those three switch the rule off. The cron passes the
-- missed addresses as target_undelivered; a send that reached nobody still
-- goes to record_schedule_export_schedule_failure_service.
drop function public.record_schedule_export_schedule_success_service(uuid, uuid, timestamp with time zone, text, jsonb);

CREATE OR REPLACE FUNCTION public.record_schedule_export_schedule_success_service(target_workspace_id uuid, target_schedule_id uuid, target_sent_at timestamp with time zone, target_format text, target_params jsonb, target_undelivered text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  updated public.scheduled_schedule_exports%rowtype;
begin
  update public.scheduled_schedule_exports
     set last_sent_at = target_sent_at,
         consecutive_failures = 0,
         -- Reached some, not all: the week says who missed it (KK-166).
         last_error = left(nullif(btrim(target_undelivered), ''), 500),
         auto_disabled_at = null,
         updated_at = now()
   where id = target_schedule_id
     and workspace_id = target_workspace_id
   returning * into updated;

  if not found then
    raise exception 'scheduled export not found' using errcode='P0002';
  end if;

  insert into public.schedule_export_events(
    workspace_id,
    actor_user_id,
    surface,
    format,
    params
  )
  values (
    target_workspace_id,
    updated.created_by,
    'scheduled_email',
    btrim(target_format),
    coalesce(target_params, '{}'::jsonb)
  );

  return public.schedule_export_schedule_json(
    updated,
    (select p.name from public.schedule_export_presets p where p.id = updated.preset_id)
  );
end;
$function$
;
revoke all on function public.record_schedule_export_schedule_success_service(uuid, uuid, timestamp with time zone, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.record_schedule_export_schedule_success_service(uuid, uuid, timestamp with time zone, text, jsonb, text) to service_role;

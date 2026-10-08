-- EKRAN-01 #20 (BL-795): the weekly Schedule email switches itself off after
-- three weeks that reached nobody (KARARLAR Schedule, KK-166), not after three
-- tries. The cron tries every five minutes through the send hour; when the
-- email service was down for 15 minutes, each try counted and the rule went
-- off on the first bad Sunday. A failure within 20 hours of the last counted
-- one (the same window that stops a second send, isScheduledExportDue) is the
-- same week's send: it updates the note, not the count.

alter table public.scheduled_schedule_exports
  add column last_failed_at timestamptz;

create or replace function public.record_schedule_export_schedule_failure_service(target_workspace_id uuid, target_schedule_id uuid, target_error text, auto_disable_after integer default 3)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  failures integer;
  updated public.scheduled_schedule_exports%rowtype;
begin
  select case
           when s.consecutive_failures > 0 and s.last_failed_at > now() - interval '20 hours'
             then s.consecutive_failures
           else s.consecutive_failures + 1
         end
    into failures
    from public.scheduled_schedule_exports s
   where s.id = target_schedule_id
     and s.workspace_id = target_workspace_id
   for update;

  if not found then
    raise exception 'scheduled export not found' using errcode='P0002';
  end if;

  update public.scheduled_schedule_exports
     set consecutive_failures = failures,
         last_failed_at = now(),
         last_error = left(coalesce(nullif(btrim(target_error), ''), 'Scheduled export failed'), 500),
         enabled = case
           when failures >= auto_disable_after then false
           else enabled
         end,
         auto_disabled_at = case
           when failures >= auto_disable_after then now()
           else auto_disabled_at
         end,
         updated_at = now()
   where id = target_schedule_id
     and workspace_id = target_workspace_id
   returning * into updated;

  return public.schedule_export_schedule_json(
    updated,
    (select p.name from public.schedule_export_presets p where p.id = updated.preset_id)
  );
end;
$function$;

-- B8: a send that reached nobody is not tried again on the cron's next
-- five-minute round; the rule waits 15 minutes, so a broken one is tried a few
-- times in its send hour instead of twelve and does not hold up other
-- workspaces' sends. Changed on the definition the database holds
-- (pg_get_functiondef), so a newer version keeps its own changes.
do $migration$
declare
  anchor constant text := 'where s.enabled';
  definition text := pg_get_functiondef('public.list_schedule_export_cron_candidates_service(timestamptz)'::regprocedure);
begin
  if (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'EKRAN-01 B8: list_schedule_export_cron_candidates_service no longer reads as this expects';
  end if;
  execute replace(definition, anchor,
    anchor || E'\n    and (s.last_failed_at is null or s.last_failed_at <= target_now - interval ''15 minutes'')');
end
$migration$;

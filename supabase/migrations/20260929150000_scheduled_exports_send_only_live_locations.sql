-- G4 (BL-101, BL-225, Q-C): the weekly export email hands the cron only what
-- it may send.
--
-- Before: the cron candidate list returned every stored location id, deleted
-- ones included. The export then asked the authorization core about a deleted
-- location, was told "out of scope", and after three weeks switched itself off
-- without a word. The API also read workspace_scheduling_settings on its own
-- for the week start day.
--
-- After: each candidate carries only its live locations (live_location_ids,
-- the one place that drops deleted locations) and its workspace's week start
-- day. A candidate whose every location was deleted is still listed, with an
-- empty list, so the cron can switch it off and say why. Whether the person
-- who set it up may still export is decided by the core inside
-- preview_schedule_export_service, as for a manual download.
--
-- Example: Meyhouse's "Both kitchens" export covers Kadikoy + Besiktas.
-- Besiktas is deleted; next Monday the email goes out for Kadikoy alone.

create or replace function public.list_schedule_export_cron_candidates_service(
  target_now timestamptz default now()
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'schedules',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'workspace_id', s.workspace_id,
          'workspace_name', w.name,
          'created_by', s.created_by,
          'preset_id', s.preset_id,
          'preset_name', p.name,
          'settings', p.settings,
          'name', s.name,
          'recipients', s.recipients,
          'location_ids', to_jsonb(public.live_location_ids(s.workspace_id, s.location_ids)),
          'day_of_week', s.day_of_week,
          'send_hour', s.send_hour,
          'timezone', s.timezone,
          'week_start_day', coalesce(settings.week_start_day::text, 'monday'),
          'last_sent_at', s.last_sent_at,
          'consecutive_failures', s.consecutive_failures
        )
        order by s.workspace_id, s.send_hour, s.id
      ),
      '[]'::jsonb
    )
  )
  from public.scheduled_schedule_exports s
  join public.schedule_export_presets p
    on p.id = s.preset_id
   and p.workspace_id = s.workspace_id
  join public.workspaces w
    on w.id = s.workspace_id
  left join public.workspace_scheduling_settings settings
    on settings.workspace_id = s.workspace_id
  where s.enabled
    and s.auto_disabled_at is null
    and cardinality(s.location_ids) > 0
    and app_private.workspace_allows_interactive_access(s.workspace_id)
    and (
      s.last_sent_at is null
      or s.last_sent_at <= target_now - interval '20 hours'
    );
$$;

create function public.list_schedule_export_cron_candidates_service(
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
          'location_ids', to_jsonb(s.location_ids),
          'day_of_week', s.day_of_week,
          'send_hour', s.send_hour,
          'timezone', s.timezone,
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
  where s.enabled
    and s.auto_disabled_at is null
    and cardinality(s.location_ids) > 0
    and (
      s.last_sent_at is null
      or s.last_sent_at <= target_now - interval '20 hours'
    );
$$;

create function public.record_schedule_export_schedule_success_service(
  target_workspace_id uuid,
  target_schedule_id uuid,
  target_sent_at timestamptz,
  target_format text,
  target_params jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  updated public.scheduled_schedule_exports%rowtype;
begin
  update public.scheduled_schedule_exports
     set last_sent_at = target_sent_at,
         consecutive_failures = 0,
         last_error = null,
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
$$;

create function public.record_schedule_export_schedule_failure_service(
  target_workspace_id uuid,
  target_schedule_id uuid,
  target_error text,
  auto_disable_after integer default 3
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  updated public.scheduled_schedule_exports%rowtype;
begin
  update public.scheduled_schedule_exports
     set consecutive_failures = consecutive_failures + 1,
         last_error = left(coalesce(nullif(btrim(target_error), ''), 'Scheduled export failed'), 500),
         enabled = case
           when consecutive_failures + 1 >= auto_disable_after then false
           else enabled
         end,
         auto_disabled_at = case
           when consecutive_failures + 1 >= auto_disable_after then now()
           else auto_disabled_at
         end,
         updated_at = now()
   where id = target_schedule_id
     and workspace_id = target_workspace_id
   returning * into updated;

  if not found then
    raise exception 'scheduled export not found' using errcode='P0002';
  end if;

  return public.schedule_export_schedule_json(
    updated,
    (select p.name from public.schedule_export_presets p where p.id = updated.preset_id)
  );
end;
$$;

revoke all on function public.list_schedule_export_cron_candidates_service(
  timestamptz
) from public, anon, authenticated;
revoke all on function public.record_schedule_export_schedule_success_service(
  uuid,
  uuid,
  timestamptz,
  text,
  jsonb
) from public, anon, authenticated;
revoke all on function public.record_schedule_export_schedule_failure_service(
  uuid,
  uuid,
  text,
  integer
) from public, anon, authenticated;

grant execute on function public.list_schedule_export_cron_candidates_service(
  timestamptz
) to service_role;
grant execute on function public.record_schedule_export_schedule_success_service(
  uuid,
  uuid,
  timestamptz,
  text,
  jsonb
) to service_role;
grant execute on function public.record_schedule_export_schedule_failure_service(
  uuid,
  uuid,
  text,
  integer
) to service_role;

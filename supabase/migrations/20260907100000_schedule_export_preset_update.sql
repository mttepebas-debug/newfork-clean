create function public.update_schedule_export_preset_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_preset_id uuid,
  target_name text,
  target_settings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  p public.schedule_export_presets%rowtype;
begin
  if not public.schedule_actor_has_capability_service(
    actor_user_id,
    target_workspace_id,
    'schedule.export'
  ) then
    raise exception 'schedule export access denied' using errcode='42501';
  end if;

  update public.schedule_export_presets
     set name = btrim(target_name),
         settings = target_settings,
         updated_by = actor_user_id,
         updated_at = now()
   where id = target_preset_id
     and workspace_id = target_workspace_id
     and created_by = actor_user_id
   returning * into p;

  if not found then
    raise exception 'schedule export preset not found' using errcode='P0002';
  end if;

  return jsonb_build_object(
    'id', p.id,
    'workspace_id', p.workspace_id,
    'name', p.name,
    'settings', p.settings,
    'created_by', p.created_by,
    'updated_at', p.updated_at
  );
exception
  when unique_violation then
    raise exception 'schedule export preset name conflict' using errcode='23505';
end;
$$;

revoke all on function public.update_schedule_export_preset_service(
  uuid,
  uuid,
  uuid,
  text,
  jsonb
) from public, anon, authenticated;

grant execute on function public.update_schedule_export_preset_service(
  uuid,
  uuid,
  uuid,
  text,
  jsonb
) to service_role;

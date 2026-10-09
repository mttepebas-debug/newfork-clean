alter table public.workspace_scheduling_settings
add column if not exists time_format text not null default '12h';

alter table public.workspace_scheduling_settings
drop constraint if exists workspace_scheduling_settings_time_format_check;

alter table public.workspace_scheduling_settings
add constraint workspace_scheduling_settings_time_format_check
check (time_format in ('12h', '24h'));

create or replace function public.audit_scheduling_settings_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if row(
    new.week_start_day,
    new.schedule_deadline_day,
    new.conflict_policy,
    new.availability_enforcement,
    new.time_format
  ) is distinct from row(
    old.week_start_day,
    old.schedule_deadline_day,
    old.conflict_policy,
    old.availability_enforcement,
    old.time_format
  ) then
    insert into public.audit_events (
      workspace_id,
      actor_user_id,
      entity_type,
      entity_id,
      action,
      metadata
    ) values (
      new.workspace_id,
      auth.uid(),
      'scheduling_settings',
      new.workspace_id,
      'updated',
      jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new))
    );
  end if;
  return new;
end;
$$;

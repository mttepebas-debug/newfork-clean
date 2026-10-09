insert into public.permissions(key,label,category,description,custom_grantable,sort_order)
 values('schedule.conflict_rules.manage','Manage conflict rules','Schedule','View and change workspace conflict handling.',true,619);
insert into app_private.role_permission_dependencies(permission_key,required_key)
 values('schedule.conflict_rules.manage','settings.schedule_rules.read');
-- Preserve existing configuration managers' access; operational schedule edit
-- permission alone does not grant configuration management.
insert into public.workspace_role_permissions(workspace_id,role_id,permission_key)
 select workspace_id,role_id,'schedule.conflict_rules.manage' from public.workspace_role_permissions
 where permission_key='settings.schedule_rules.manage' on conflict do nothing;

create or replace function public.update_scheduling_settings_service(actor_user_id uuid,target_workspace_id uuid,settings jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous public.workspace_scheduling_settings; proposed public.workspace_scheduling_settings; saved public.workspace_scheduling_settings;
 conflict_keys text[]:=array['conflict_rules','conflict_rules_revision','minimum_travel_minutes','minimum_rest_minutes'];
begin
 if jsonb_typeof(settings) is distinct from 'object' then raise exception 'Valid settings required' using errcode='22023'; end if;
 if settings ?| conflict_keys and not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.conflict_rules.manage') then
  raise exception 'Conflict settings access denied' using errcode='42501';
 end if;
 if settings-conflict_keys<>'{}'::jsonb and not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'settings.schedule_rules.manage') then
  raise exception 'Scheduling settings access denied' using errcode='42501';
 end if;
 if settings='{}'::jsonb then raise exception 'Settings are required' using errcode='22023'; end if;
 perform public.availability_lock_workspace(target_workspace_id);
 perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,921));
 select * into previous from public.workspace_scheduling_settings where workspace_id=target_workspace_id for update;
 if not found then raise exception 'Scheduling settings not found'; end if;
 if settings ?| conflict_keys and (settings->>'conflict_rules_revision')::integer is distinct from previous.conflict_rules_revision then
  raise exception 'Conflict rules changed. Reload the current rules before saving.' using errcode='PT409';
 end if;
 -- Partial calls preserve every omitted field. Revision is stamped by trigger.
 select * into proposed from jsonb_populate_record(previous,settings);
 update public.workspace_scheduling_settings set
  week_start_day=proposed.week_start_day,schedule_deadline_day=proposed.schedule_deadline_day,
  conflict_policy=proposed.conflict_policy,availability_enforcement=proposed.availability_enforcement,
  time_format=proposed.time_format,availability_ownership=proposed.availability_ownership,
  availability_approval=proposed.availability_approval,availability_initial_review=proposed.availability_initial_review,
  availability_notice_days=proposed.availability_notice_days,minimum_travel_minutes=proposed.minimum_travel_minutes,
  minimum_rest_minutes=proposed.minimum_rest_minutes,conflict_rules=proposed.conflict_rules,updated_at=now()
 where workspace_id=target_workspace_id returning * into saved;
 if auth.uid() is null and (to_jsonb(previous)-'updated_at') is distinct from (to_jsonb(saved)-'updated_at') then
  insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata)
  values(target_workspace_id,actor_user_id,'scheduling.settings_updated','scheduling_settings',target_workspace_id::text,
   jsonb_build_object('before',to_jsonb(previous),'after',to_jsonb(saved)));
 end if;
 return to_jsonb(saved);
end;
$$;
revoke all on function public.update_scheduling_settings_service(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.update_scheduling_settings_service(uuid,uuid,jsonb) to service_role;

-- The old weekly form keeps entry mode/onboarding settings. It cannot rewrite
-- conflict policy; that decision now belongs to the single guarded catalog.
do $patch$
declare body text;
begin
 body:=pg_get_functiondef('public.sync_schedule_conflict_rules()'::regprocedure);
 body:=replace(body,$old$if tg_op='INSERT' then$old$,
  $new$if tg_op='UPDATE' and auth.uid() is not null and (new.conflict_rules,new.minimum_travel_minutes,new.minimum_rest_minutes,new.availability_warning_policy)
   is distinct from (old.conflict_rules,old.minimum_travel_minutes,old.minimum_rest_minutes,old.availability_warning_policy)
   and not public.workspace_has_permission(new.workspace_id,'schedule.conflict_rules.manage') then
   raise exception 'Conflict settings access denied' using errcode='42501';
  end if;
  if tg_op='INSERT' then$new$);
 execute body;
 body:=pg_get_functiondef('public.weekly_preference_settings_save_service(uuid,uuid,jsonb,uuid)'::regprocedure);
 body:=replace(body,$old$or command->>'warning_policy' is null or command->>'warning_policy' not in ('warn','confirm')$old$,
  $new$or (command ? 'warning_policy' and command->>'warning_policy' not in ('warn','confirm'))$new$);
 body:=replace(body,$old$model:=public.weekly_preference_settings_read_service(actor,w); prior:=model->'settings';$old$,
  $new$model:=public.weekly_preference_settings_read_service(actor,w); prior:=model->'settings';
 if command ? 'warning_policy' and command->>'warning_policy' is distinct from prior->>'warning_policy' then
  raise exception 'Use Conflict handling to change conflict rules.' using errcode='PT409';
 end if;$new$);
 body:=replace(body,$old$availability_warning_policy=command->>'warning_policy',$old$,'');
 execute body;
end;
$patch$;

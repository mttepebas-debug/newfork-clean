-- Settings use their own optimistic revision and the existing staffing lock.
create function public.weekly_preference_settings_read_service(actor uuid,w uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare settings public.workspace_scheduling_settings%rowtype; can_edit boolean; missing jsonb;
begin
 if not exists(select 1 from public.workspace_memberships where workspace_id=w and user_id=actor and status in ('active','pending_activation')) then
  raise exception 'Organization membership required' using errcode='42501'; end if;
 select exists(select 1 from public.workspace_memberships m join public.workspace_roles r on r.id=m.role_id and r.workspace_id=m.workspace_id
  where m.workspace_id=w and m.user_id=actor and m.status='active' and r.access_class in ('owner','admin')) into can_edit;
 select * into settings from public.workspace_scheduling_settings where workspace_id=w;
 if not found then raise exception 'Availability settings not found' using errcode='P0002'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by sort_order,name,id),'[]') into missing
  from public.shift_types where workspace_id=w and archived_at is null and deleted_at is null
   and (default_start_time is null or default_end_time is null or default_start_time=default_end_time or default_start_time='24:00'::time);
 return jsonb_build_object('settings',jsonb_build_object('input_mode',settings.availability_input_mode,'warning_policy',settings.availability_warning_policy,
  'onboarding_required',settings.availability_onboarding_required,'revision',settings.availability_preferences_revision),
  'can_edit',can_edit,'missing_shift_types',missing);
end; $$;
revoke all on function public.weekly_preference_settings_read_service(uuid,uuid) from public,anon,authenticated;
grant execute on function public.weekly_preference_settings_read_service(uuid,uuid) to service_role;

create function public.version_weekly_preference_settings() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if (new.availability_input_mode,new.availability_warning_policy,new.availability_onboarding_required)
  is distinct from (old.availability_input_mode,old.availability_warning_policy,old.availability_onboarding_required) then
  if auth.uid() is not null then raise exception 'Use Availability settings to save these changes' using errcode='42501'; end if;
  new.availability_preferences_revision:=old.availability_preferences_revision+1;
 else new.availability_preferences_revision:=old.availability_preferences_revision; end if;
 return new;
end; $$;
revoke all on function public.version_weekly_preference_settings() from public,anon,authenticated,service_role;
create trigger weekly_preference_settings_revision before update on public.workspace_scheduling_settings
 for each row execute function public.version_weekly_preference_settings();

-- Raw catalog edits use a try-lock because the row may already be locked. A
-- settings transition must not race an insert/removal of valid default hours.
create trigger a_weekly_preference_catalog_lock before insert or update or delete on public.shift_types
 for each row execute function public.guard_schedule_availability_input_write();
create function public.guard_weekly_preference_type_hours() returns trigger
language plpgsql security definer set search_path='' as $$
declare must_have_hours boolean;
begin
 if new.archived_at is not null or new.deleted_at is not null then return new; end if;
 if tg_op='INSERT' then must_have_hours:=true;
 else must_have_hours:=old.archived_at is not null or old.deleted_at is not null
   or (new.default_start_time,new.default_end_time) is distinct from (old.default_start_time,old.default_end_time)
   or (select availability_input_mode='shift_type' from public.workspace_scheduling_settings where workspace_id=new.workspace_id);
 end if;
 if must_have_hours and (new.default_start_time is null or new.default_end_time is null
  or new.default_start_time=new.default_end_time or new.default_start_time='24:00'::time) then
  raise exception 'Set valid default start and end times for this shift type' using errcode='22023'; end if;
 return new;
end; $$;
revoke all on function public.guard_weekly_preference_type_hours() from public,anon,authenticated,service_role;
create trigger weekly_preference_type_hours before insert or update on public.shift_types
 for each row execute function public.guard_weekly_preference_type_hours();

create function public.weekly_preference_settings_save_service(actor uuid,w uuid,command jsonb,request_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare model jsonb; prior jsonb; stored public.weekly_preference_commands%rowtype;
 envelope jsonb:=jsonb_build_object('kind','settings','value',command); event uuid:=gen_random_uuid(); recipients uuid[];
begin
 perform public.availability_lock_workspace(w);
 model:=public.weekly_preference_settings_read_service(actor,w);
 if not (model->>'can_edit')::boolean then raise exception 'Only an organization owner or admin can change availability settings' using errcode='42501'; end if;
 if request_key is null then raise exception 'A save key is required' using errcode='22023'; end if;
 select * into stored from public.weekly_preference_commands q where q.workspace_id=w and q.actor_user_id=actor and q.request_key=weekly_preference_settings_save_service.request_key;
 if found then
  if stored.command<>envelope then raise exception 'Idempotency key was used for another save' using errcode='22023'; end if;
  return model;
 end if;
 if jsonb_typeof(command) is distinct from 'object' or command->>'input_mode' is null or command->>'input_mode' not in ('time_range','shift_type')
  or command->>'warning_policy' is null or command->>'warning_policy' not in ('warn','confirm')
  or jsonb_typeof(command->'onboarding_required') is distinct from 'boolean'
  or jsonb_typeof(command->'expected_revision') is distinct from 'number' or (command->>'expected_revision') !~ '^[0-9]+$' then
  raise exception 'Choose valid availability settings' using errcode='22023'; end if;
 perform 1 from public.workspace_scheduling_settings where workspace_id=w for update;
 model:=public.weekly_preference_settings_read_service(actor,w); prior:=model->'settings';
 if (command->>'expected_revision')::integer is distinct from (prior->>'revision')::integer then
  raise exception 'Availability settings changed. Reload the latest settings before saving.' using errcode='40001'; end if;
 if command->>'input_mode'='shift_type' and jsonb_array_length(model->'missing_shift_types')>0 then
  raise exception 'Complete default hours for all active shift types before using shift type availability' using errcode='22023',detail=(model->'missing_shift_types')::text; end if;
 if (command-'expected_revision') is distinct from (prior-'revision') then
  update public.workspace_scheduling_settings set availability_input_mode=command->>'input_mode',availability_warning_policy=command->>'warning_policy',
   availability_onboarding_required=(command->>'onboarding_required')::boolean,updated_at=now() where workspace_id=w;
  model:=public.weekly_preference_settings_read_service(actor,w);
  insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata)
   values(w,actor,'availability.settings_updated','scheduling_settings',w::text,jsonb_build_object('before',prior,'after',model->'settings'));
  if prior->>'input_mode' is distinct from command->>'input_mode' then
   select coalesce(array_agg(distinct e.user_id),'{}') into recipients from public.employee_weekly_preferences p
    join public.employee_profiles e on e.id=p.employee_id and e.workspace_id=p.workspace_id
    join public.workspace_memberships m on m.workspace_id=e.workspace_id and m.user_id=e.user_id and m.status in ('active','pending_activation')
    where p.workspace_id=w and e.archived_at is null and p.preference->>'input_mode'<>command->>'input_mode';
   perform public.enqueue_notification_outbox_service(w,event,'availability.status_changed',1,actor,'availability_settings',w::text,
    jsonb_build_object('recipient_user_ids',to_jsonb(recipients),'audience_contract','availability_scoped_recipients','category','request',
     'title','Update your availability','body','Your organization changed availability entry. Your saved week stays in effect until you update it.',
     'safe_preview','Availability entry settings changed.','action_url','/app/employee-hub/my-availability',
     'input_mode',command->>'input_mode','group_key','availability-settings:'||w::text),now());
  end if;
 end if;
 insert into public.weekly_preference_commands(workspace_id,actor_user_id,request_key,command,result) values(w,actor,request_key,envelope,'{}');
 return model;
end; $$;
revoke all on function public.weekly_preference_settings_save_service(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.weekly_preference_settings_save_service(uuid,uuid,jsonb,uuid) to service_role;

-- Employee edits notify managers and open the specific employee drawer, not
-- the employee-only destination of the old lifecycle status event.
insert into public.notification_catalog(type_key,schema_version,category,severity,sensitivity,supported_channels,default_cadence,
 audience_contract,action_route_contract,dedupe_policy,retention_class,template_key,lifecycle,mandatory_in_app)
select 'availability.weekly_updated',1,category,severity,sensitivity,supported_channels,default_cadence,audience_contract,
 '{"route":"/app/employees","allowed_query_keys":["employeeId","section"]}',dedupe_policy,retention_class,'availability.weekly_updated.v1',lifecycle,mandatory_in_app
 from public.notification_catalog where type_key='availability.status_changed' and schema_version=1;
insert into public.notification_template_versions(type_key,schema_version,channel,locale,template_version,template_key,content,status,published_at)
select 'availability.weekly_updated',1,channel,locale,1,'availability.weekly_updated.v1',content||'{"action_url":"/app/employees"}',status,now()
 from public.notification_template_versions where type_key='availability.status_changed' and schema_version=1 and template_version=1;
insert into public.notification_producer_registry(type_key,schema_version,producer_id,source_migration,source_function)
 values('availability.weekly_updated',1,'weekly_preferences_v1','20260909042000_weekly_preference_settings.sql','weekly_preferences_save_service');
do $destination$ declare body text; anchor text; begin
 body:=pg_get_functiondef('public.weekly_preferences_save_service(uuid,uuid,jsonb,uuid)'::regprocedure);
 anchor:='''availability.status_changed'',1,actor,''weekly_availability''';
 if position(anchor in body)=0 then raise exception 'Weekly notification producer changed'; end if;
 body:=replace(body,anchor,'''availability.weekly_updated'',1,actor,''weekly_availability''');
 anchor:='''action_url'',''/app/employees'',''employee_id'',emp';
 if position(anchor in body)=0 then raise exception 'Weekly notification destination changed'; end if;
 body:=replace(body,anchor,'''action_url'',''/app/employees?employeeId=''||emp::text||''&section=availability'',''employee_id'',emp');
 execute body;
end $destination$;

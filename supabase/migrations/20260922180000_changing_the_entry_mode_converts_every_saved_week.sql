-- Settings > Scheduling > Availability, Entry mode ("Time range" / "Shift
-- type"). Changing it used to leave every saved week in the mode it was written
-- in, still in effect, until its owner saved it again. Now the save converts
-- every saved week in the workspace -- the employee's own week and the
-- manager's reminder week alike -- and only then tells the people whose week
-- was converted.
--
-- The days record UNAVAILABLE time; an empty day is a fully available day.
-- Each day converts on its own:
--  time range -> shift type: every active type that overlaps the range by at
--   least one minute is marked. Touching a boundary is not overlap. A range
--   that reaches no type clears the day.
--  shift type -> time range: one range, from the earliest start of the marked
--   types to their latest end; the gap between them counts as unavailable too.
--  An all-day day and an empty day stay as they are.
-- A type that crosses midnight cannot fit a range on its own day, so it counts
-- from its start to the end of the day: 24:00, the editor's "End of day".
--
-- Converting loses detail (a round trip does not bring the old hours back), so
-- the week as it was is written to its history before it is replaced.
create function public.weekly_preference_convert(w uuid,preference jsonb,target_mode text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare days jsonb:='[]'; rule jsonb; marked jsonb; span jsonb; resolved integer;
begin
 if preference->>'input_mode'=target_mode then return preference; end if;
 for rule in select value from jsonb_array_elements(preference->'days') loop
  -- An all-day day and an empty day read the same in both modes. (An empty day
  -- must not reach the overlap test: least/greatest skip a null clock.)
  if (rule->>'all_day')::boolean or (rule->'range'='null'::jsonb and rule->'shift_type_ids'='[]'::jsonb) then
   days:=days||jsonb_build_array(rule); continue; end if;
  if target_mode='shift_type' then
   -- ponytail: a range reaching more than 64 active types fails the week's check; cap it when a workspace has that many.
   select coalesce(jsonb_agg(t.id order by t.sort_order,t.name,t.id),'[]') into marked from public.shift_types t
    where t.workspace_id=w and t.archived_at is null and t.deleted_at is null
     and least((rule->'range'->>'end')::time,case when t.default_end_time>t.default_start_time then t.default_end_time else '24:00'::time end)
      -greatest((rule->'range'->>'start')::time,t.default_start_time)>=interval '1 minute';
   days:=days||jsonb_build_array(jsonb_build_object('day',rule->'day','all_day',false,'range',null,'shift_type_ids',marked));
  else
   -- A picked type means the hours weekly_preference_intersections reads for it:
   -- the live type while it is active, its last saved hours once archived.
   select count(*),jsonb_build_object('start',to_char(min(h.start_clock),'HH24:MI'),
    'end',to_char(max(case when h.end_clock>h.start_clock then h.end_clock else '24:00'::time end),'HH24:MI'))
    into resolved,span
   from jsonb_array_elements_text(rule->'shift_type_ids') picked(id)
   left join public.shift_types t on t.workspace_id=w and t.id=picked.id::uuid and t.archived_at is null and t.deleted_at is null
   left join public.weekly_preference_type_defaults d on d.workspace_id=w and d.shift_type_id=picked.id::uuid
   cross join lateral (select case when t.id is not null then t.default_start_time else d.start_time end start_clock,
    case when t.id is not null then t.default_end_time else d.end_time end end_clock) h
   where h.start_clock is not null and h.end_clock is not null and h.start_clock<>h.end_clock;
   if resolved<>jsonb_array_length(rule->'shift_type_ids') then
    raise exception 'A saved week names a shift type with no valid default hours' using errcode='22023'; end if;
   days:=days||jsonb_build_array(jsonb_build_object('day',rule->'day','all_day',false,'shift_type_ids','[]'::jsonb,'range',span));
  end if;
 end loop;
 return jsonb_build_object('input_mode',target_mode,'days',days);
end; $$;
revoke all on function public.weekly_preference_convert(uuid,jsonb,text) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.weekly_preference_settings_save_service(actor uuid, w uuid, command jsonb, request_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare model jsonb; prior jsonb; stored public.weekly_preference_commands%rowtype;
 envelope jsonb:=jsonb_build_object('kind','settings','value',command); event uuid:=gen_random_uuid(); recipients uuid[];
begin
 perform public.availability_lock_workspace(w);
 model:=public.weekly_preference_settings_read_service(actor,w);
 if not (model->>'can_edit')::boolean then raise exception 'Schedule rules edit access required' using errcode='42501'; end if;
 if request_key is null then raise exception 'A save key is required' using errcode='22023'; end if;
 select * into stored from public.weekly_preference_commands q where q.workspace_id=w and q.actor_user_id=actor and q.request_key=weekly_preference_settings_save_service.request_key;
 if found then
  if stored.command<>envelope then raise exception 'Idempotency key was used for another save' using errcode='22023'; end if;
  return model;
 end if;
 if jsonb_typeof(command) is distinct from 'object' or command->>'input_mode' is null or command->>'input_mode' not in ('time_range','shift_type')
  or (command ? 'warning_policy' and command->>'warning_policy' not in ('warn','confirm'))
  or jsonb_typeof(command->'onboarding_required') is distinct from 'boolean'
  or jsonb_typeof(command->'expected_revision') is distinct from 'number' or (command->>'expected_revision') !~ '^[0-9]+$' then
  raise exception 'Choose valid availability settings' using errcode='22023'; end if;
 perform 1 from public.workspace_scheduling_settings where workspace_id=w for update;
 model:=public.weekly_preference_settings_read_service(actor,w); prior:=model->'settings';
 if command ? 'warning_policy' and command->>'warning_policy' is distinct from prior->>'warning_policy' then
  raise exception 'Use Conflict handling to change conflict rules.' using errcode='PT409';
 end if;
 if (command->>'expected_revision')::integer is distinct from (prior->>'revision')::integer then
  raise exception 'Availability settings changed. Reload the latest settings before saving.' using errcode='40001'; end if;
 if command->>'input_mode'='shift_type' and jsonb_array_length(model->'missing_shift_types')>0 then
  raise exception 'Complete default hours for all active shift types before using shift type availability' using errcode='22023',detail=(model->'missing_shift_types')::text; end if;
 if (command-'expected_revision') is distinct from (prior-'revision') then
  update public.workspace_scheduling_settings set availability_input_mode=command->>'input_mode',
   availability_onboarding_required=(command->>'onboarding_required')::boolean,updated_at=now() where workspace_id=w;
  model:=public.weekly_preference_settings_read_service(actor,w);
  insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata)
   values(w,actor,'availability.settings_updated','scheduling_settings',w::text,jsonb_build_object('before',prior,'after',model->'settings'));
  if prior->>'input_mode' is distinct from command->>'input_mode' then
   -- Read who is told before converting: afterwards every week is in the new mode.
   select coalesce(array_agg(distinct e.user_id),'{}') into recipients from public.employee_weekly_preferences p
    join public.employee_profiles e on e.id=p.employee_id and e.workspace_id=p.workspace_id
    join public.workspace_memberships m on m.workspace_id=e.workspace_id and m.user_id=e.user_id and m.status in ('active','pending_activation')
    where p.workspace_id=w and e.archived_at is null and p.preference->>'input_mode'<>command->>'input_mode';
   with history as (
    insert into public.weekly_preference_events(workspace_id,employee_id,source,actor_user_id,before_record,after_record)
    select w,p.employee_id,'employee',actor,jsonb_build_object('revision',p.revision,'preference',p.preference),
     jsonb_build_object('revision',p.revision+1,'preference',public.weekly_preference_convert(w,p.preference,command->>'input_mode'))
    from public.employee_weekly_preferences p where p.workspace_id=w and p.preference->>'input_mode'<>command->>'input_mode'
    returning employee_id,after_record)
   update public.employee_weekly_preferences p set preference=h.after_record->'preference',revision=p.revision+1,updated_by=actor,updated_at=now()
    from history h where p.workspace_id=w and p.employee_id=h.employee_id;
   with history as (
    insert into public.weekly_preference_events(workspace_id,employee_id,source,actor_user_id,before_record,after_record)
    select w,p.employee_id,'manager',actor,jsonb_build_object('revision',p.revision,'preference',p.preference),
     jsonb_build_object('revision',p.revision+1,'preference',public.weekly_preference_convert(w,p.preference,command->>'input_mode'))
    from public.manager_weekly_reminders p where p.workspace_id=w and p.preference->>'input_mode'<>command->>'input_mode'
    returning employee_id,after_record)
   update public.manager_weekly_reminders p set preference=h.after_record->'preference',revision=p.revision+1,updated_by=actor,updated_at=now()
    from history h where p.workspace_id=w and p.employee_id=h.employee_id;
   perform public.enqueue_notification_outbox_service(w,event,'availability.status_changed',1,actor,'availability_settings',w::text,
    jsonb_build_object('recipient_user_ids',to_jsonb(recipients),'audience_contract','availability_scoped_recipients','category','request',
     'title','Check your availability','body','Your organization changed how availability is entered. Your saved week was converted; check that it is still right.',
     'safe_preview','Availability entry settings changed.','action_url','/app/employee-hub/my-availability',
     'input_mode',command->>'input_mode','group_key','availability-settings:'||w::text),now());
  end if;
 end if;
 insert into public.weekly_preference_commands(workspace_id,actor_user_id,request_key,command,result) values(w,actor,request_key,envelope,'{}');
 return model;
end; $function$;
revoke all on function public.weekly_preference_settings_save_service(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.weekly_preference_settings_save_service(uuid,uuid,jsonb,uuid) to service_role;

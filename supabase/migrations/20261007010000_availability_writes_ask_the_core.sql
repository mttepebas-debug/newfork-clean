-- AVAIL-002 A2 (KARARLAR "Müsaitlik" M3, M4, M5, M13; Mert 2026-10-04).
-- * M13 on the core: one's own availability is an employee's own action.
--   availability.own is open to somebody still finishing onboarding (the
--   onboarding step writes the same week, M2) and to employees only; an own
--   action marked employee_target now asks the actor's rank too.
-- * The week's read and save and the entry-mode settings ask the core; no raw
--   membership check and no old permission helper are left in them.
-- * M5: no keep / cancel. Saving a week never asks about pending requests and
--   never changes one; the preview, the commitment readers, the decisions
--   table and the history's decisions column go.
-- * M3: in shift type mode a day with every selectable type marked is saved
--   as all day.
-- * M4: "Check your availability" goes to every employee (active or still
--   onboarding), whether or not they had saved a week; never to a manager.

update app_private.authz_actions set restricted_ok = true, employee_target = true where key = 'availability.own';

-- ==== core_authz_check
CREATE OR REPLACE FUNCTION app_private.authz_check(state app_private.actor_state, rule_row app_private.authz_actions, target_locations uuid[], target_person uuid, target_user uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_workspace uuid;
  person uuid := target_person;
  whose uuid;
  target_access public.workspace_role;
  target_is_self boolean;
  places uuid[];
  reach text;
begin
  if state.user_id is null then
    return 'not_member';
  end if;
  if rule_row.scope_class = 'account' then
    -- An account action is about one's own account.
    if target_user is not null and target_user is distinct from state.user_id then
      return 'out_of_scope';
    end if;
    return null;
  end if;
  if state.membership_id is null then
    return 'not_member';
  end if;
  if not state.workspace_open then
    return 'workspace_closed';
  end if;

  if person is not null then
    select profile.workspace_id, profile.user_id into target_workspace, whose
    from public.employee_profiles profile
    where profile.id = person;
    if target_workspace is distinct from state.workspace_id then
      return 'out_of_scope';
    end if;
  end if;
  if target_user is not null then
    if person is not null and whose is distinct from target_user then
      return 'out_of_scope';
    end if;
    whose := target_user;
    if person is null then
      select profile.id into person
      from public.employee_profiles profile
      where profile.workspace_id = state.workspace_id
        and profile.user_id = target_user
        and profile.archived_at is null;
      if person is null and not exists (
        select 1 from public.workspace_memberships membership
        where membership.workspace_id = state.workspace_id and membership.user_id = target_user
      ) then
        return 'out_of_scope';
      end if;
    end if;
  end if;
  target_is_self := coalesce(whose = state.user_id, false);

  -- Their own row is theirs to read in any state.
  if rule_row.self_ok and target_is_self then
    return null;
  end if;

  if state.status = 'pending_activation' then
    if not rule_row.restricted_ok then
      return 'not_active';
    end if;
  elsif state.status <> 'active' then
    return 'not_active';
  elsif state.document_blocked and not rule_row.restricted_ok then
    return 'document_blocked';
  end if;

  if rule_row.scope_class = 'own' then
    -- One's own availability is an employee's (M13): a manager, an admin or
    -- the owner has no own record of that kind.
    if rule_row.employee_target and not app_private.ranks_as_employee(state.workspace_id, state.user_id) then
      return 'rank';
    end if;
    if (person is null and whose is null) or target_is_self then
      return null;
    end if;
    return 'out_of_scope';
  end if;

  if rule_row.owner_only and state.class <> 'owner' then
    return 'owner_only';
  end if;
  -- The owner holds every permission.
  if state.class <> 'owner'
     and rule_row.permission_key is not null
     and not rule_row.permission_key = any (state.permissions) then
    return 'missing_permission';
  end if;
  if state.class = 'employee' then
    return 'missing_permission';
  end if;

  if rule_row.no_self and target_is_self then
    return 'rank';
  end if;
  -- A manager's own record goes one level up; owners and admins keep theirs
  -- (user decision 2026-09-24, 2A).
  if rule_row.rank_below and target_is_self and state.class not in ('owner', 'admin') then
    return 'rank';
  end if;
  if rule_row.rank_below and (person is not null or whose is not null) and not target_is_self then
    select role.access_class into target_access
    from public.workspace_memberships membership
    join public.workspace_roles role
      on role.id = membership.role_id and role.workspace_id = membership.workspace_id
    where membership.workspace_id = state.workspace_id and membership.user_id = whose;
    -- ponytail: somebody without a membership yet ranks as an employee; use the
    -- invitation's role if a manager ever invites into a higher one.
    if app_private.authz_rank(coalesce(target_access, 'employee')) >= app_private.authz_rank(state.class) then
      return 'rank';
    end if;
  end if;

  -- Some actions are about employees only: never a manager, an admin or the
  -- owner, whoever asks, themselves included (the Manager note, 2026-09-26).
  if rule_row.employee_target and (person is not null or whose is not null)
     and not app_private.ranks_as_employee(state.workspace_id, whose) then
    return 'rank';
  end if;

  -- A record whose author outranks the actor today is not theirs to change;
  -- a peer's is (FB-6.7 K2, KK-87).
  if rule_row.outranked_no and whose is not null and not target_is_self then
    select role.access_class into target_access
    from public.workspace_memberships membership
    join public.workspace_roles role
      on role.id = membership.role_id and role.workspace_id = membership.workspace_id
    where membership.workspace_id = state.workspace_id and membership.user_id = whose;
    if app_private.authz_rank(coalesce(target_access, 'employee')) > app_private.authz_rank(state.class) then
      return 'rank';
    end if;
  end if;

  if state.class in ('owner', 'admin') then
    reach := 'org';
  else
    select rule.manager_rule into reach
    from app_private.authz_scope_rules rule
    join app_private.authz_settings setting on setting.scope_model = rule.model
    where rule.scope_class = rule_row.scope_class and rule.effect = rule_row.effect;
    reach := coalesce(reach, 'none');
  end if;

  if rule_row.scope_class = 'org' then
    if reach = 'none' then
      return 'out_of_scope';
    end if;
    return null;
  end if;

  if target_locations is not null then
    places := target_locations;
    if array_position(places, null) is not null then
      return 'out_of_scope';
    end if;
    if rule_row.scope_class = 'place' and cardinality(places) <> 1 then
      return 'out_of_scope';
    end if;
    if exists (
      select 1 from unnest(places) place
      where not exists (
        select 1 from public.locations location
        where location.id = place and location.workspace_id = state.workspace_id and app_private.location_is_live(location)
      )
    ) then
      return 'out_of_scope';
    end if;
  elsif rule_row.scope_class = 'person' and (person is not null or whose is not null) then
    -- Where the person is assigned; somebody with no employee record works nowhere.
    places := coalesce((
      select array_agg(distinct assignment.location_id)
      from public.employee_location_assignments assignment
      join public.locations location on location.id = assignment.location_id
      where assignment.employee_id = person and assignment.ended_at is null
        and app_private.location_is_live(location)
    ), '{}');
  else
    return 'out_of_scope';
  end if;

  if reach = 'org' then
    return null;
  end if;
  if reach = 'none' or cardinality(places) = 0 then
    return 'out_of_scope';
  end if;
  if reach = 'any' and places && state.manages then
    return null;
  end if;
  if reach = 'all' and places <@ state.manages then
    return null;
  end if;
  return 'out_of_scope';
end;
$function$;

-- ==== weekly_preferences_read_service
CREATE OR REPLACE FUNCTION public.weekly_preferences_read_service(actor uuid, w uuid, emp uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare employee public.employee_profiles%rowtype; settings public.workspace_scheduling_settings%rowtype;
 own_record boolean; can_manage boolean; can_read boolean; can_view_manager boolean; employee_record jsonb; manager_record jsonb; types jsonb; selected_ids uuid[];
begin
 select * into employee from public.employee_profiles e where e.workspace_id=w and (e.id=emp or (emp is null and e.user_id=actor)) and e.archived_at is null;
 if employee.id is null then
  -- Nobody there: the same no as somebody out of reach (a non-member hears that first).
  perform app_private.authorize(actor,w,'availability.own',target_person=>emp);
  raise exception 'Not allowed' using errcode='42501',hint='authz.out_of_scope',detail='availability.own';
 end if;
 -- One's own week is an employee's own action (M13), asked of the core.
 own_record:=app_private.authz_reason(actor,w,'availability.own',target_person=>employee.id) is null;
 can_manage:=public.weekly_preference_manager_scope(actor,w,employee.id,'availability.manage');
 can_read:=public.weekly_preference_manager_scope(actor,w,employee.id,'availability.read');
 -- The Manager note exists for employees only (availability.note_read).
 can_view_manager:=can_manage or public.weekly_preference_manager_scope(actor,w,employee.id,'availability.note');
 if not own_record and not can_read and not can_view_manager then
  -- The core says why: their own week, or somebody else's.
  perform app_private.authorize(actor,w,case when employee.user_id=actor then 'availability.own' else 'availability.team_read' end,target_person=>employee.id);
  raise exception 'Not allowed' using errcode='42501',hint='authz.out_of_scope',detail='availability.team_read';
 end if;
 select * into settings from public.workspace_scheduling_settings where workspace_id=w;
 if settings.workspace_id is null then raise exception 'Scheduling settings unavailable' using errcode='P0002'; end if;
 select jsonb_build_object('revision',p.revision,'submitted',true,'updated_at',p.updated_at,'preference',p.preference) into employee_record
  from public.employee_weekly_preferences p where p.workspace_id=w and p.employee_id=employee.id;
 employee_record:=coalesce(employee_record,jsonb_build_object('revision',0,'submitted',false,'updated_at',null,'preference',public.empty_weekly_preference(settings.availability_input_mode)));
 if can_view_manager then
  select jsonb_build_object('revision',p.revision,'submitted',true,'updated_at',p.updated_at,'preference',p.preference,'enabled',p.enabled,'notes',to_jsonb(p.notes)) into manager_record
   from public.manager_weekly_reminders p where p.workspace_id=w and p.employee_id=employee.id;
  manager_record:=coalesce(manager_record,jsonb_build_object('revision',0,'submitted',false,'updated_at',null,'preference',public.empty_weekly_preference(settings.availability_input_mode),'enabled',true,'notes',jsonb_build_array('','','','','','','')));
 end if;
 -- Include fallback names only for records this actor can read. Reminder-only
 -- selections must not be inferred from the employee's catalog response.
 select coalesce(array_agg(distinct id::uuid),'{}') into selected_ids
 from jsonb_array_elements((employee_record->'preference'->'days')||coalesce(manager_record->'preference'->'days','[]')) day
 cross join lateral jsonb_array_elements_text(day->'shift_type_ids') id;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'start_time',to_char(start_time,'HH24:MI'),'end_time',to_char(end_time,'HH24:MI'),
  'archived',archived,'selectable',selectable) order by sort_order,name,id),'[]') into types from (
  select t.id,t.name,t.default_start_time start_time,t.default_end_time end_time,false archived,
   (t.default_start_time is not null and t.default_end_time is not null and t.default_start_time<>t.default_end_time) selectable,t.sort_order
  from public.shift_types t where t.workspace_id=w and t.archived_at is null and t.deleted_at is null
  union all
  select d.shift_type_id,d.name,d.start_time,d.end_time,true,false,2147483647 from public.weekly_preference_type_defaults d
  where d.workspace_id=w and d.shift_type_id=any(selected_ids) and not exists(select 1 from public.shift_types t where t.workspace_id=w and t.id=d.shift_type_id and t.archived_at is null and t.deleted_at is null)
 ) catalog;
 return jsonb_build_object('employee_id',employee.id,'employee_name',concat_ws(' ',coalesce(nullif(employee.preferred_name,''),employee.first_name),employee.last_name),
  'can_edit_employee',own_record,'can_manage',can_manage,
  'settings',jsonb_build_object('input_mode',settings.availability_input_mode,
   'onboarding_required',settings.availability_onboarding_required,'revision',settings.availability_preferences_revision),
  'employee',employee_record,'shift_types',types,'time_format',settings.time_format)
  -- The manager part: the note when it is this reader's to see; null for an
  -- employee's note they may not see; left out when there is no note at all
  -- (the person is not an employee).
  || case when can_view_manager then jsonb_build_object('manager',manager_record)
     when app_private.ranks_as_employee(w,employee.user_id) then jsonb_build_object('manager',null)
     else '{}'::jsonb end;
end; $function$;

-- ==== who may write this week: the employee their own (M13), a manager the note.
create function app_private.weekly_preference_may_write(actor uuid, w uuid, source text, model jsonb)
returns void
language plpgsql
stable security definer
set search_path = ''
as $$
begin
 if source is null or source not in ('employee','manager') then raise exception 'Choose whose week to save' using errcode='22023'; end if;
 if not coalesce((model->>case when source='employee' then 'can_edit_employee' else 'can_manage' end)::boolean,false) then
  -- The core says why.
  perform app_private.authorize(actor,w,case when source='employee' then 'availability.own' else 'availability.team_write' end,
   target_person=>(model->>'employee_id')::uuid);
  raise exception 'Not allowed' using errcode='42501',hint='authz.out_of_scope',detail='availability';
 end if;
end;
$$;

-- ==== M3: a day with every selectable shift type marked is all day (D6:
-- selectable = active with default hours; "Previous" archived types never count).
create function app_private.weekly_preference_whole_days(w uuid, preference jsonb)
returns jsonb
language sql
stable security definer
set search_path = ''
as $$
 with selectable as (
  select t.id::text as id from public.shift_types t
  where t.workspace_id = w and t.archived_at is null and t.deleted_at is null
   and t.default_start_time is not null and t.default_end_time is not null and t.default_start_time <> t.default_end_time
 )
 select case when preference->>'input_mode' <> 'shift_type' or not exists (select 1 from selectable) then preference
  else jsonb_set(preference, '{days}', (
   select jsonb_agg(case when not (d->>'all_day')::boolean
      and not exists (select 1 from selectable s where not (d->'shift_type_ids') ? s.id)
     then d || jsonb_build_object('all_day', true, 'shift_type_ids', '[]'::jsonb) else d end
     order by (d->>'day')::integer)
   from jsonb_array_elements(preference->'days') d)) end
$$;
revoke all on function app_private.weekly_preference_may_write(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function app_private.weekly_preference_whole_days(uuid, jsonb) from public, anon, authenticated;

-- ==== validate_weekly_preference_command
CREATE OR REPLACE FUNCTION public.validate_weekly_preference_command(actor uuid, w uuid, command jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare model jsonb; prior jsonb; pref jsonb:=command->'preference'; source text:=command->>'source'; copied boolean:=false;
 rule jsonb; type_id uuid; old_rule jsonb; notes jsonb:=command->'notes';
begin
 model:=public.weekly_preferences_read_service(actor,w,(command->>'employee_id')::uuid);
 perform app_private.weekly_preference_may_write(actor,w,source,model);
 if not public.weekly_preference_valid(pref) then raise exception 'Check the weekly unavailable hours' using errcode='22023'; end if;
 perform 1 from public.workspace_scheduling_settings where workspace_id=w for share;
 model:=public.weekly_preferences_read_service(actor,w,(command->>'employee_id')::uuid);
 prior:=model->source;
 if (command->>'expected_revision')::integer is distinct from (prior->>'revision')::integer then raise exception 'Availability changed. Reload before saving; your draft has not been saved.' using errcode='PT409'; end if;
 if (command->>'settings_revision')::integer is distinct from (model->'settings'->>'revision')::integer then raise exception 'Availability settings changed. Reload before saving.' using errcode='PT409'; end if;
 if source='employee' and (command ? 'notes' or command ? 'enabled' or command ? 'copy_employee_revision') then raise exception 'Manager fields cannot be saved with employee preferences' using errcode='42501'; end if;
 if source='manager' then
  if jsonb_typeof(command->'enabled') is distinct from 'boolean' or jsonb_typeof(notes) is distinct from 'array' or jsonb_array_length(notes)<>7
   or exists(select 1 from jsonb_array_elements(notes) n where jsonb_typeof(n)<>'string' or length(n#>>'{}')>1000) then raise exception 'Include reminder state and seven valid notes' using errcode='22023'; end if;
  if command ? 'copy_employee_revision' then
   if not (model->'employee'->>'submitted')::boolean or (command->>'copy_employee_revision')::integer is distinct from (model->'employee'->>'revision')::integer
    or pref is distinct from model->'employee'->'preference' then raise exception 'Employee preferences changed. Copy the latest saved week again.' using errcode='PT409'; end if;
   copied:=true;
  end if;
  if not (prior->>'enabled')::boolean and not (command->>'enabled')::boolean and (pref<>prior->'preference' or notes<>prior->'notes' or copied) then
   raise exception 'Turn reminders on before editing or copying' using errcode='22023'; end if;
 end if;
 if pref->>'input_mode'<>model->'settings'->>'input_mode' then
  raise exception 'Use the current organization entry mode' using errcode='PT409'; end if;
 perform 1 from public.shift_types where workspace_id=w order by id for share;
 for rule in select value from jsonb_array_elements(pref->'days') loop
  select value into old_rule from jsonb_array_elements((case when copied then model->'employee' else prior end)->'preference'->'days') where value->'day'=rule->'day';
  for type_id in select value::uuid from jsonb_array_elements_text(rule->'shift_type_ids') loop
   if not exists(select 1 from public.shift_types t where t.workspace_id=w and t.id=type_id and t.archived_at is null and t.deleted_at is null
    and t.default_start_time is not null and t.default_end_time is not null and t.default_start_time<>t.default_end_time)
    and not (coalesce(old_rule->'shift_type_ids','[]') @> jsonb_build_array(type_id) and exists(select 1 from public.weekly_preference_type_defaults d where d.workspace_id=w and d.shift_type_id=type_id)) then
     raise exception 'A selected shift type is no longer available. Reload before saving.' using errcode='PT409'; end if;
  end loop;
 end loop;
 return model;
end; $function$;

-- ==== weekly_preferences_save_service
CREATE OR REPLACE FUNCTION public.weekly_preferences_save_service(actor uuid, w uuid, command jsonb, request_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare emp uuid:=(command->>'employee_id')::uuid; source text:=command->>'source'; model jsonb; prior jsonb; preference jsonb;
 old_command public.weekly_preference_commands%rowtype; event uuid:=gen_random_uuid(); result jsonb:='{}';
 recipients uuid[]; summary text; changed_days text;
begin
 if request_key is null then raise exception 'Idempotency key required' using errcode='22023'; end if;
 perform public.availability_lock_workspace(w);
 -- Authorize again before idempotent replay; never return a stored private read model.
 model:=public.weekly_preferences_read_service(actor,w,emp);
 perform app_private.weekly_preference_may_write(actor,w,source,model);
 select * into old_command from public.weekly_preference_commands q where q.workspace_id=w and q.actor_user_id=actor and q.request_key=weekly_preferences_save_service.request_key;
 if old_command.request_key is not null then
  if old_command.command<>command then raise exception 'Idempotency key was used for another save' using errcode='22023'; end if;
  return old_command.result||jsonb_build_object('model',model);
 end if;
 model:=public.validate_weekly_preference_command(actor,w,command); prior:=model->source;
 emp:=(model->>'employee_id')::uuid;
 -- A pending swap, cover or pickup is never asked about and never changed:
 -- the employee withdraws one in Shift Hub if they want to (M5).
 preference:=app_private.weekly_preference_whole_days(w,command->'preference');
 insert into public.weekly_preference_events(id,workspace_id,employee_id,source,actor_user_id,before_record,after_record)
  values(event,w,emp,source,actor,prior,'{}');
 if source='employee' then
  insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by)
   values(w,emp,preference,1,actor) on conflict(workspace_id,employee_id) do update set preference=excluded.preference,revision=employee_weekly_preferences.revision+1,updated_by=actor,updated_at=now();
  update public.employee_onboarding_requirements set status='completed',completed_at=now(),rejection_reason=null,updated_at=now() where workspace_id=w and employee_id=emp and kind='availability';
  update public.employee_onboarding_cases set revision=revision+1,updated_at=now() where workspace_id=w and employee_id=emp;
 else
  insert into public.manager_weekly_reminders(workspace_id,employee_id,preference,enabled,notes,revision,updated_by)
   values(w,emp,preference,(command->>'enabled')::boolean,array(select jsonb_array_elements_text(command->'notes')),1,actor)
   on conflict(workspace_id,employee_id) do update set preference=excluded.preference,enabled=excluded.enabled,notes=excluded.notes,revision=manager_weekly_reminders.revision+1,updated_by=actor,updated_at=now();
 end if;
 model:=public.weekly_preferences_read_service(actor,w,emp);
 update public.weekly_preference_events set after_record=model->(command->>'source') where id=event;
 select string_agg((array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[(d->>'day')::integer+1],', ' order by (d->>'day')::integer) into changed_days
 from jsonb_array_elements(preference->'days') d
 where d is distinct from (select value from jsonb_array_elements(prior->'preference'->'days') where value->'day'=d->'day');
 summary:=case when source='manager' then 'Manager reminders updated.' else 'Weekly availability updated. '||case when changed_days is null then 'Week confirmed.' else 'Changed days: '||changed_days||'.' end end;
 insert into public.employee_events(workspace_id,employee_id,actor_user_id,action,summary) values(w,emp,actor,case when source='manager' then 'manager_reminders_updated' else 'weekly_availability_updated' end,summary);
 if source='employee' then
  select coalesce(array_agg(m.user_id),'{}') into recipients from public.workspace_memberships m where m.workspace_id=w and m.status='active' and m.user_id<>actor
   and public.weekly_preference_manager_scope(m.user_id,w,emp,'availability.read');
  perform public.enqueue_notification_outbox_service(w,event,'availability.weekly_updated',1,actor,'weekly_availability',emp::text,
   jsonb_build_object('recipient_user_ids',to_jsonb(recipients),'audience_contract','availability_scoped_recipients','category','request',
    'title','Availability updated','body',(model->>'employee_name')||': '||summary,'safe_preview','An employee updated weekly availability.',
    'action_url','/app/employees?employeeId='||emp::text||'&section=availability','employee_id',emp,'changed_days',changed_days,'group_key','weekly-availability:'||emp::text),now());
 end if;
 insert into public.weekly_preference_commands(workspace_id,actor_user_id,request_key,command,result) values(w,actor,request_key,command,result);
 return result||jsonb_build_object('model',model);
end; $function$;

-- ==== weekly_preference_settings_read_service
CREATE OR REPLACE FUNCTION public.weekly_preference_settings_read_service(actor uuid, w uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare settings public.workspace_scheduling_settings%rowtype; can_edit boolean; missing jsonb;
begin
 perform app_private.authorize(actor,w,'settings.availability.read');
 can_edit:=app_private.authz_reason(actor,w,'settings.availability.write') is null;
 select * into settings from public.workspace_scheduling_settings where workspace_id=w;
 if not found then raise exception 'Availability settings not found' using errcode='P0002'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by sort_order,name,id),'[]') into missing
  from public.shift_types where workspace_id=w and archived_at is null and deleted_at is null
   and (default_start_time is null or default_end_time is null or default_start_time=default_end_time or default_start_time='24:00'::time);
 return jsonb_build_object('settings',jsonb_build_object('input_mode',settings.availability_input_mode,
  'onboarding_required',settings.availability_onboarding_required,'revision',settings.availability_preferences_revision),
  'can_edit',can_edit,'missing_shift_types',missing);
end; $function$;

-- ==== weekly_preference_settings_save_service
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
 perform app_private.authorize(actor,w,'settings.availability.write');
 model:=public.weekly_preference_settings_read_service(actor,w);
 if request_key is null then raise exception 'A save key is required' using errcode='22023'; end if;
 select * into stored from public.weekly_preference_commands q where q.workspace_id=w and q.actor_user_id=actor and q.request_key=weekly_preference_settings_save_service.request_key;
 if found then
  if stored.command<>envelope then raise exception 'Idempotency key was used for another save' using errcode='22023'; end if;
  return model;
 end if;
 if jsonb_typeof(command) is distinct from 'object' or command->>'input_mode' is null or command->>'input_mode' not in ('time_range','shift_type')
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
  update public.workspace_scheduling_settings set availability_input_mode=command->>'input_mode',
   availability_onboarding_required=(command->>'onboarding_required')::boolean,updated_at=now() where workspace_id=w;
  model:=public.weekly_preference_settings_read_service(actor,w);
  insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata)
   values(w,actor,'availability.settings_updated','scheduling_settings',w::text,jsonb_build_object('before',prior,'after',model->'settings'));
  if prior->>'input_mode' is distinct from command->>'input_mode' then
   -- Every employee is told, active or still onboarding, whether or not they
   -- had saved a week (M4, D4); a manager whose note was converted is not.
   select coalesce(array_agg(distinct e.user_id),'{}') into recipients from public.employee_profiles e
    join public.workspace_memberships m on m.workspace_id=e.workspace_id and m.user_id=e.user_id and m.status in ('active','pending_activation')
    where e.workspace_id=w and e.archived_at is null and app_private.ranks_as_employee(w,e.user_id);
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


-- ==== M5: keep / cancel is gone everywhere.
drop function public.weekly_preferences_preview_service(uuid, uuid, jsonb);
drop function public.weekly_preference_commitment_conflicts(uuid, uuid, jsonb);
drop function public.weekly_preference_commitments(uuid, uuid, text, uuid);
drop table public.weekly_preference_commitment_decisions;
alter table public.weekly_preference_events drop column decisions;

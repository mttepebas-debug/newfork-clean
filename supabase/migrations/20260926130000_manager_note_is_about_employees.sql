-- BL-139 addition (user decision 2026-09-26, REUSE "Müsaitlik notu yalnız
-- çalışan için"): the Manager note (manager_weekly_reminders) is about
-- employees only. Nobody writes or reads one about a manager, an admin or the
-- owner, themselves included; this replaces "owner and admins write their
-- own note". Reading a person's weekly availability does not change: Ayşe
-- still reads Can's week, and the read model gives `manager: null` for him.
--
-- The core learns one rule, employee_target: the target must be an employee
-- (no = 42501 authz.rank). availability.team_write takes it in place of
-- rank_below; the note gets its own read, availability.note_read.
-- availability.team_read drops no_self: it only kept the note from its subject,
-- and a note about a non-employee no longer exists. The old helper
-- service_actor_can_access_employee leaves the write path: the core now says
-- everything it said (employees only, at the manager's locations).

alter table app_private.authz_actions add column employee_target boolean not null default false;

update app_private.authz_actions set employee_target = true, rank_below = false where key = 'availability.team_write';
update app_private.authz_actions set no_self = false where key = 'availability.team_read';
insert into app_private.authz_actions (key, scope_class, effect, permission_key, employee_target)
values ('availability.note_read', 'person', 'read', 'availability.read', true);

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
  if rule_row.employee_target and (person is not null or whose is not null) then
    target_access := null;
    select role.access_class into target_access
    from public.workspace_memberships membership
    join public.workspace_roles role
      on role.id = membership.role_id and role.workspace_id = membership.workspace_id
    where membership.workspace_id = state.workspace_id and membership.user_id = whose;
    if coalesce(target_access, 'employee') <> 'employee' then
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
        where location.id = place and location.workspace_id = state.workspace_id and location.deleted_at is null
      )
    ) then
      return 'out_of_scope';
    end if;
  elsif rule_row.scope_class = 'person' and (person is not null or whose is not null) then
    -- Where the person works; somebody with no employee record works nowhere.
    places := coalesce((
      select array_agg(distinct assignment.location_id)
      from public.employee_location_assignments assignment
      where assignment.employee_id = person and assignment.ended_at is null
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

CREATE OR REPLACE FUNCTION public.weekly_preference_manager_scope(actor uuid, w uuid, emp uuid, capability text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select case when capability in ('availability.read','availability.note','availability.manage') then
  app_private.authz_reason(actor,w,case capability
   when 'availability.read' then 'availability.team_read'
   when 'availability.note' then 'availability.note_read'
   else 'availability.team_write' end,target_person=>emp) is null
  else false end;
$function$;

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
 if employee.id is null then raise exception 'Employee not found' using errcode='42501'; end if;
 own_record:=employee.user_id=actor and exists(select 1 from public.workspace_memberships m where m.workspace_id=w and m.user_id=actor and m.status in ('active','pending_activation'));
 can_manage:=public.weekly_preference_manager_scope(actor,w,employee.id,'availability.manage');
 can_read:=public.weekly_preference_manager_scope(actor,w,employee.id,'availability.read');
 -- The Manager note exists for employees only (availability.note_read).
 can_view_manager:=can_manage or public.weekly_preference_manager_scope(actor,w,employee.id,'availability.note');
 if not coalesce(own_record,false) and not can_read and not can_view_manager then raise exception 'Employee access required' using errcode='42501'; end if;
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
  'can_edit_employee',coalesce(own_record,false),'can_manage',can_manage,
  'settings',jsonb_build_object('input_mode',settings.availability_input_mode,
   'onboarding_required',settings.availability_onboarding_required,'revision',settings.availability_preferences_revision),
  'employee',employee_record,'manager',manager_record,'shift_types',types,'time_format',settings.time_format);
end; $function$;

-- No old data is kept (CLAUDE.md §9): notes about somebody who is not an
-- employee go. Somebody with no membership yet counts as an employee.
delete from public.manager_weekly_reminders note
using public.employee_profiles employee, public.workspace_memberships membership, public.workspace_roles role
where employee.id = note.employee_id and employee.workspace_id = note.workspace_id
  and membership.workspace_id = employee.workspace_id and membership.user_id = employee.user_id
  and role.id = membership.role_id and role.workspace_id = membership.workspace_id
  and role.access_class <> 'employee';

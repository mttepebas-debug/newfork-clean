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
--
-- The read model: `manager` is the note when the reader may see it, null for
-- an employee's note they may not see (the employee's own view), and absent
-- when the person is not an employee.
--
-- A person who stops being an employee loses their note for good (user
-- decision 2026-09-26, REUSE a9c7797): one trigger on the membership row, the
-- one place every role change passes (role change, invitation, ownership
-- transfer, setup). Made an employee again, they start with an empty note.
-- Who hears of an update is exactly who reads it: the recipients ask
-- availability.team_read alone, owner and admins included.

alter table app_private.authz_actions add column employee_target boolean not null default false;

update app_private.authz_actions set employee_target = true, rank_below = false where key = 'availability.team_write';
update app_private.authz_actions set no_self = false where key = 'availability.team_read';
insert into app_private.authz_actions (key, scope_class, effect, permission_key, employee_target)
values ('availability.note_read', 'person', 'read', 'availability.read', true);

-- Whether an account ranks as an employee in a workspace: the one definition
-- the core, the read model and the role-change trigger share. Somebody with no
-- account or membership yet ranks as an employee.
create function app_private.ranks_as_employee(workspace uuid, account uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select app_private.authz_rank(role.access_class) = app_private.authz_rank('employee')
    from public.workspace_memberships membership
    join public.workspace_roles role
      on role.id = membership.role_id and role.workspace_id = membership.workspace_id
    where membership.workspace_id = workspace and membership.user_id = account
  ), true);
$$;
revoke all on function app_private.ranks_as_employee(uuid, uuid) from public, anon, authenticated;

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
  if rule_row.employee_target and (person is not null or whose is not null)
     and not app_private.ranks_as_employee(state.workspace_id, whose) then
    return 'rank';
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

-- Whether a manager reaches this person's availability, asked of the core
-- about the person: availability.read -> availability.team_read (their week;
-- who hears of an update), availability.note -> availability.note_read (the
-- Manager note, employees only), availability.manage -> availability.team_write.
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
  -- Any other capability is nobody's: no, never an error the caller could skip.
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
  'employee',employee_record,'shift_types',types,'time_format',settings.time_format)
  -- The manager part: the note when it is this reader's to see; null for an
  -- employee's note they may not see; left out when there is no note at all
  -- (the person is not an employee).
  || case when can_view_manager then jsonb_build_object('manager',manager_record)
     when app_private.ranks_as_employee(w,employee.user_id) then jsonb_build_object('manager',null)
     else '{}'::jsonb end;
end; $function$;

CREATE OR REPLACE FUNCTION public.weekly_preferences_save_service(actor uuid, w uuid, command jsonb, request_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare emp uuid:=(command->>'employee_id')::uuid; source text:=command->>'source'; model jsonb; prior jsonb;
 old_command public.weekly_preference_commands%rowtype; required jsonb; choice jsonb; row_value jsonb; commitment record;
 event uuid:=gen_random_uuid(); kept integer:=0; cancelled integer:=0; resolved integer:=0; finalized jsonb:='[]'; result jsonb;
 c public.shift_exchange_cases%rowtype; a public.shift_exchange_applications%rowtype; recipients uuid[]; summary text; changed_days text;
begin
 if request_key is null then raise exception 'Idempotency key required' using errcode='22023'; end if;
 perform public.availability_lock_workspace(w);
 -- Authorize again before idempotent replay; never return a stored private read model.
 model:=public.weekly_preferences_read_service(actor,w,emp);
 if source is null or source not in ('employee','manager') or not coalesce((model->>case when source='employee' then 'can_edit_employee' else 'can_manage' end)::boolean,false) then raise exception 'Preference write access required' using errcode='42501'; end if;
 select * into old_command from public.weekly_preference_commands q where q.workspace_id=w and q.actor_user_id=actor and q.request_key=weekly_preferences_save_service.request_key;
 if old_command.request_key is not null then
  if old_command.command<>command then raise exception 'Idempotency key was used for another save' using errcode='22023'; end if;
  return old_command.result||jsonb_build_object('model',model);
 end if;
 model:=public.validate_weekly_preference_command(actor,w,command); prior:=model->source;
 if source='employee' then
  required:=public.weekly_preference_commitment_conflicts(w,emp,command->'preference');
  if exists(select 1 from jsonb_array_elements(coalesce(command->'decisions','[]')) d group by d->>'kind',d->>'id' having count(*)>1) then raise exception 'Choose each request once' using errcode='22023'; end if;
  for row_value in select value from jsonb_array_elements(required) loop
   if not exists(select 1 from jsonb_array_elements(coalesce(command->'decisions','[]')) d where d->>'kind'=row_value->>'kind' and d->>'id'=row_value->>'id' and d->>'fingerprint'=row_value->>'fingerprint' and d->>'action' in ('keep','cancel')) then
    raise exception 'Pending requests changed. Review each conflicting request before saving.' using errcode='PT409'; end if;
  end loop;
 end if;
 insert into public.weekly_preference_events(id,workspace_id,employee_id,source,actor_user_id,before_record,after_record,decisions)
  values(event,w,emp,source,actor,prior,'{}',coalesce(command->'decisions','[]'));
 for choice in select value from jsonb_array_elements(coalesce(command->'decisions','[]')) loop
  if choice->>'action' is null or choice->>'action' not in ('keep','cancel') then raise exception 'Choose keep or cancel' using errcode='22023'; end if;
  select * into commitment from public.weekly_preference_commitments(w,emp,choice->>'kind',(choice->>'id')::uuid);
  if not found then raise exception 'Request does not belong to this employee' using errcode='42501'; end if;
  if commitment.status='finalized' then finalized:=finalized||jsonb_build_array(jsonb_build_object('kind',commitment.kind,'id',commitment.id)); continue; end if;
  if commitment.status='resolved' then resolved:=resolved+1; continue; end if;
  select value into row_value from jsonb_array_elements(required) where value->>'kind'=choice->>'kind' and value->>'id'=choice->>'id' and value->>'fingerprint'=choice->>'fingerprint';
  if row_value is null then raise exception 'The request conflict changed. Review it again before saving.' using errcode='PT409'; end if;
  insert into public.weekly_preference_commitment_decisions(workspace_id,employee_id,kind,request_id,conflict_fingerprint,action,event_id)
   values(w,emp,commitment.kind,commitment.id,choice->>'fingerprint',choice->>'action',event)
   on conflict(workspace_id,employee_id,kind,request_id) do update set conflict_fingerprint=excluded.conflict_fingerprint,action=excluded.action,event_id=excluded.event_id;
  if choice->>'action'='keep' then kept:=kept+1; continue; end if;
  if commitment.kind='exchange_swap' then
   select * into c from public.shift_exchange_cases where workspace_id=w and id=commitment.id for update;
   update public.shift_exchange_cases set status='cancelled',revision=revision+1,updated_at=now() where id=c.id;
   update public.shift_exchange_applications set status='closed_case_cancelled',updated_at=now() where workspace_id=w and case_id=c.id and status in ('invited','pending_manager');
   delete from public.shift_exchange_votes where workspace_id=w and case_id=c.id;
   perform public.shift_exchange_emit(actor,w,c.id,null,'case_closed','Employee cancelled the swap after updating availability. No assignment changed.');
  else
   select * into a from public.shift_exchange_applications where workspace_id=w and id=commitment.id for update;
   select * into c from public.shift_exchange_cases where workspace_id=w and id=a.case_id for update;
   update public.shift_exchange_applications set status='withdrawn',updated_at=now() where id=a.id;
   update public.shift_exchange_cases set status=case when audience='direct' then 'cancelled' else status end,revision=revision+1,updated_at=now() where id=c.id;
   delete from public.shift_exchange_votes where workspace_id=w and case_id=c.id and application_id=a.id;
   perform public.shift_exchange_emit(actor,w,c.id,a.id,'application_withdrawn','Employee withdrew this request after updating availability. No assignment changed.');
  end if;
  cancelled:=cancelled+1;
 end loop;
 if source='employee' then
  insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by)
   values(w,emp,command->'preference',1,actor) on conflict(workspace_id,employee_id) do update set preference=excluded.preference,revision=employee_weekly_preferences.revision+1,updated_by=actor,updated_at=now();
  update public.employee_onboarding_requirements set status='completed',completed_at=now(),rejection_reason=null,updated_at=now() where workspace_id=w and employee_id=emp and kind='availability';
  update public.employee_onboarding_cases set revision=revision+1,updated_at=now() where workspace_id=w and employee_id=emp;
 else
  insert into public.manager_weekly_reminders(workspace_id,employee_id,preference,enabled,notes,revision,updated_by)
   values(w,emp,command->'preference',(command->>'enabled')::boolean,array(select jsonb_array_elements_text(command->'notes')),1,actor)
   on conflict(workspace_id,employee_id) do update set preference=excluded.preference,enabled=excluded.enabled,notes=excluded.notes,revision=manager_weekly_reminders.revision+1,updated_by=actor,updated_at=now();
 end if;
 model:=public.weekly_preferences_read_service(actor,w,emp);
 update public.weekly_preference_events set after_record=model->(command->>'source') where id=event;
 select string_agg((array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[(d->>'day')::integer+1],', ' order by (d->>'day')::integer) into changed_days
 from jsonb_array_elements(command->'preference'->'days') d
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
 result:=jsonb_build_object('kept_count',kept,'cancelled_count',cancelled,'resolved_count',resolved,'finalized',finalized);
 insert into public.weekly_preference_commands(workspace_id,actor_user_id,request_key,command,result) values(w,actor,request_key,command,result);
 return result||jsonb_build_object('model',model);
end; $function$;

create function app_private.manager_note_follows_role() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Above employee: the Manager note about them goes, for good.
  if not app_private.ranks_as_employee(new.workspace_id, new.user_id) then
    delete from public.manager_weekly_reminders note
    using public.employee_profiles employee
    where employee.workspace_id = new.workspace_id and employee.user_id = new.user_id
      and note.workspace_id = employee.workspace_id and note.employee_id = employee.id;
  end if;
  return null;
end;
$$;
revoke all on function app_private.manager_note_follows_role() from public, anon, authenticated;

create trigger manager_note_follows_role
after insert or update of role, role_id on public.workspace_memberships
for each row execute function app_private.manager_note_follows_role();

-- No old data is kept (CLAUDE.md §9): notes about somebody who is not an
-- employee go. Somebody with no membership yet counts as an employee.
delete from public.manager_weekly_reminders note
using public.employee_profiles employee, public.workspace_memberships membership, public.workspace_roles role
where employee.id = note.employee_id and employee.workspace_id = note.workspace_id
  and membership.workspace_id = employee.workspace_id and membership.user_id = employee.user_id
  and role.id = membership.role_id and role.workspace_id = membership.workspace_id
  and role.access_class <> 'employee';

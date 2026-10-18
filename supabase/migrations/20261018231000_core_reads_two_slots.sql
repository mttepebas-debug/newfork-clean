-- ROL-CIFT 1.2: the authorization core reads the two access slots (KARARLAR S-164 ... S-169; design
-- docs/superpowers/specs/2026-10-18-rol-cift-design.md §3, §4.2, §4.4, §4.10, §4.11).
--
--   class            the management slot's class; employee when that slot is empty
--   has_employee     the employee slot is filled
--   works            where the person works, only with the employee slot
--   manages          owner and admin: every live location; manager: Manages (membership_managed_locations)
--   permissions      the management role's (somebody who only works: their employee role's, as before)
--   own_permissions  the employee role's employee eligible ones: what one may do for oneself
--
-- What one does for oneself as an employee (availability, offering or taking a shift, time off) needs the
-- employee slot: those actions are employee_target, and the core answers 'rank' without the slot.
-- ranks_as_employee goes for has_employee_access. The core helpers that still named the dropped role
-- (workspace_open_to_actor, workspace_role_for, service_actor_has_permission, can_access_location,
-- employee_record_is_workspace_owner) read the slots.
--
-- Riskli canlı migration (yetki çekirdeği, CREATE OR REPLACE): goes live with the rest of slice 1.

alter type app_private.actor_state
  add attribute has_employee boolean,
  add attribute own_permissions text[];

-- Somebody holds the employee slot. Somebody without a membership yet (an invited person) ranks as an
-- employee, as before.
create function app_private.has_employee_access(w uuid, account uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select membership.employee_role_id is not null
    from public.workspace_memberships membership
    where membership.workspace_id = w and membership.user_id = account
  ), true);
$$;
revoke all on function app_private.has_employee_access(uuid, uuid) from public, anon, authenticated;

create or replace function app_private.actor(actor uuid, w uuid)
returns app_private.actor_state
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  state app_private.actor_state;
  management_role uuid;
  employee_role uuid;
begin
  state.user_id := actor;
  state.workspace_id := w;
  state.works := '{}';
  state.manages := '{}';
  state.permissions := '{}';
  state.own_permissions := '{}';
  state.has_employee := false;

  select membership.id, membership.status, coalesce(role.access_class, 'employee'::public.workspace_role),
         membership.role_id, membership.employee_role_id
    into state.membership_id, state.status, state.class, management_role, employee_role
  from public.workspace_memberships membership
  left join public.workspace_roles role
    on role.id = membership.role_id and role.workspace_id = membership.workspace_id
  where membership.workspace_id = w and membership.user_id = actor;
  if state.membership_id is null then
    return state;
  end if;
  state.has_employee := employee_role is not null;

  state.workspace_open := app_private.workspace_open_to_actor(w, actor);
  state.document_blocked := coalesce(app_private.document_actor_blocked(actor, w), false);

  select profile.id into state.employee_id
  from public.employee_profiles profile
  where profile.workspace_id = w and profile.user_id = actor and profile.archived_at is null;

  -- Works at belongs to the employee slot.
  if state.has_employee then
    state.works := coalesce((
      select array_agg(distinct assignment.location_id order by assignment.location_id)
      from public.employee_location_assignments assignment
      join public.locations location on location.id = assignment.location_id
      where assignment.workspace_id = w
        and assignment.employee_id = state.employee_id
        and assignment.ended_at is null
        and app_private.location_is_live(location)
    ), '{}');
  end if;

  -- A manager manages their Manages; admins and the owner manage every live location (design §4.2).
  state.manages := case
    when state.class in ('owner', 'admin') then coalesce((
      select array_agg(location.id order by location.id)
      from public.locations location
      where location.workspace_id = w and app_private.location_is_live(location)
    ), '{}')
    when state.class = 'manager' then coalesce((
      select array_agg(location.id order by location.id)
      from public.membership_managed_locations managed
      join public.locations location on location.id = managed.location_id
      where managed.membership_id = state.membership_id and app_private.location_is_live(location)
    ), '{}')
    else '{}'::uuid[]
  end;

  if employee_role is not null then
    state.own_permissions := coalesce((
      select array_agg(grant_row.permission_key order by grant_row.permission_key)
      from public.workspace_role_permissions grant_row
      join public.permissions permission on permission.key = grant_row.permission_key
      where grant_row.workspace_id = w and grant_row.role_id = employee_role and permission.employee_eligible
    ), '{}');
  end if;
  if management_role is not null then
    state.permissions := coalesce((
      select array_agg(grant_row.permission_key order by grant_row.permission_key)
      from public.workspace_role_permissions grant_row
      where grant_row.workspace_id = w and grant_row.role_id = management_role
    ), '{}');
  else
    -- Somebody who only works reads with their employee role, as before.
    state.permissions := state.own_permissions;
  end if;

  return state;
end;
$$;

-- K4 in the two-slot model: a manager who is not remote manages a location.
create or replace function app_private.keep_manager_at_a_location(w uuid, target_employee uuid, becoming public.workspace_role default null)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  record public.employee_profiles%rowtype;
  holder app_private.actor_state;
begin
  select * into record
  from public.employee_profiles employee
  where employee.id = target_employee and employee.workspace_id = w;
  if record.id is null or record.archived_at is not null or record.is_remote then
    return;
  end if;

  if becoming is null then
    if record.user_id is null then
      return;
    end if;
    holder := app_private.actor(record.user_id, w);
    if holder.class is distinct from 'manager' or holder.status not in ('active', 'pending_activation') then
      return;
    end if;
    if cardinality(holder.manages) = 0 then
      raise exception 'a manager needs a location to manage'
        using errcode = '22023', hint = 'employee.manager_location_required';
    end if;
    return;
  elsif becoming <> 'manager' then
    return;
  end if;

  -- ponytail: somebody becoming a manager (an invitation) is checked on the locations the invitation
  -- gives, Manages' first rows, until the invitation fills Manages itself (ROL-CIFT slice 5).
  if not exists (
    select 1 from public.employee_location_assignments assignment
    where assignment.employee_id = record.id and assignment.ended_at is null
  ) then
    raise exception 'a manager needs a location to manage'
      using errcode = '22023', hint = 'employee.manager_location_required';
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION "app_private"."authz_check"("state" "app_private"."actor_state", "rule_row" "app_private"."authz_actions", "target_locations" "uuid"[], "target_person" "uuid", "target_user" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
  elsif state.document_blocked and not (rule_row.restricted_ok or rule_row.documents_ok) then
    return 'document_blocked';
  end if;

  if rule_row.scope_class = 'own' then
    -- What one does for oneself as an employee (availability, offering or
    -- taking a shift, time off) needs the employee slot (ROL-CIFT, design
    -- §4.4, §4.10, §4.11); a management access alone has no such record.
    if rule_row.employee_target and not coalesce(state.has_employee, false) then
      return 'rank';
    end if;
    -- A permission for oneself comes from the employee slot's role.
    if rule_row.permission_key is not null
       and not rule_row.permission_key = any (coalesce(state.own_permissions, '{}')) then
      return 'missing_permission';
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
    if app_private.authz_rank(coalesce(target_access, 'employee')) >= app_private.authz_rank(state.class)
       and not (rule_row.owner_target_ok and target_access = 'owner') then
      return 'rank';
    end if;
  end if;

  -- Some actions are about employees only: about somebody's employee slot,
  -- whoever asks, themselves included (the Manager note, 2026-09-26; ROL-CIFT).
  if rule_row.employee_target and (person is not null or whose is not null)
     and not app_private.has_employee_access(state.workspace_id, whose) then
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
$$;

CREATE OR REPLACE FUNCTION "app_private"."availability_follows_role"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare employee uuid; is_employee boolean := app_private.has_employee_access(new.workspace_id, new.user_id);
begin
  select e.id into employee from public.employee_profiles e where e.workspace_id = new.workspace_id and e.user_id = new.user_id;
  if employee is null then return null; end if;
  if not is_employee then
    delete from public.manager_weekly_reminders where workspace_id = new.workspace_id and employee_id = employee;
    delete from public.employee_weekly_preferences where workspace_id = new.workspace_id and employee_id = employee;
    delete from public.weekly_preference_events
    where workspace_id = new.workspace_id and employee_id = employee and source = 'employee';
    delete from public.weekly_preference_commands
    where workspace_id = new.workspace_id and command ->> 'employee_id' = employee::text and command ->> 'source' = 'employee';
  end if;

  -- An open onboarding gains or loses the Availability step with the role.
  with open_cases as (
    select c.id from public.employee_onboarding_cases c
    where c.workspace_id = new.workspace_id and c.employee_id = employee
      and c.status in ('in_progress', 'submitted', 'changes_requested')
    order by c.id for update),
  dropped as (
    delete from public.employee_onboarding_requirements r using open_cases c
    where not is_employee and r.case_id = c.id and r.kind = 'availability' and r.lifecycle_retired_at is null
    returning r.case_id),
  added as (
    insert into public.employee_onboarding_requirements (workspace_id, case_id, employee_id, kind, title, description,
      required, blocks_activation, requires_review, sort_order, source_snapshot)
    select new.workspace_id, c.id, employee, 'availability', 'Availability', 'Confirmed recurring weekly availability.',
      false, false, false, 500, '{}'::jsonb
    from open_cases c
    where is_employee and not exists (select 1 from public.employee_onboarding_requirements r
      where r.case_id = c.id and r.kind = 'availability' and r.lifecycle_retired_at is null)
    returning case_id)
  update public.employee_onboarding_cases set revision = revision + 1, updated_at = now()
  where id in (select case_id from dropped union select case_id from added);
  return null;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."guard_weekly_onboarding_requirement"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare declared_at timestamptz;
begin
 if tg_op='INSERT' and new.kind='availability' and not app_private.has_employee_access(new.workspace_id,
  (select e.user_id from public.employee_profiles e where e.workspace_id=new.workspace_id and e.id=new.employee_id)) then
  return null;
 end if;
 if new.lifecycle_retired_at is not null or new.kind <> 'availability' or exists (
  select 1 from public.employee_onboarding_cases c where c.id=new.case_id and c.status in ('approved','cancelled')
 ) then return new; end if;
 select s.availability_onboarding_required into new.required
 from public.workspace_scheduling_settings s where s.workspace_id=new.workspace_id;
 if new.required is null then raise exception 'Scheduling settings unavailable' using errcode='P0002'; end if;
 new.blocks_activation:=new.required;
 new.requires_review:=false;
 select p.updated_at into declared_at from public.employee_weekly_preferences p
 where p.workspace_id=new.workspace_id and p.employee_id=new.employee_id;
 new.status:=case when declared_at is null then 'not_started' else 'completed' end;
 new.completed_at:=declared_at;
 new.rejection_reason:=null;
 new.reviewed_at:=null;
 new.reviewed_by:=null;
 return new;
end; $$;

CREATE OR REPLACE FUNCTION "public"."weekly_preferences_read_service"("actor" "uuid", "w" "uuid", "emp" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare employee public.employee_profiles%rowtype; settings public.workspace_scheduling_settings%rowtype;
 own_record boolean; can_manage boolean; can_read boolean; can_view_manager boolean; employee_record jsonb; manager_record jsonb; types jsonb;
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
 employee_record:=coalesce(employee_record,jsonb_build_object('revision',0,'submitted',false,'updated_at',null,'preference',public.empty_weekly_preference()));
 if can_view_manager then
  select jsonb_build_object('revision',p.revision,'submitted',true,'updated_at',p.updated_at,'preference',p.preference,'enabled',p.enabled,'notes',to_jsonb(p.notes)) into manager_record
   from public.manager_weekly_reminders p where p.workspace_id=w and p.employee_id=employee.id;
  manager_record:=coalesce(manager_record,jsonb_build_object('revision',0,'submitted',false,'updated_at',null,'preference',public.empty_weekly_preference(),'enabled',true,'notes',jsonb_build_array('','','','','','','')));
 end if;
 -- The workspace's live shift types, for Time off's "Replace hours with a shift
 -- type" (Employee Hub); availability itself never reads them.
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'start_time',to_char(t.default_start_time,'HH24:MI'),'end_time',to_char(t.default_end_time,'HH24:MI'),
  'archived',false,'selectable',(t.default_start_time is not null and t.default_end_time is not null and t.default_start_time<>t.default_end_time))
  order by t.sort_order,t.name,t.id),'[]') into types
 from public.shift_types t where t.workspace_id=w and t.archived_at is null and t.deleted_at is null;
 return jsonb_build_object('employee_id',employee.id,'employee_name',concat_ws(' ',coalesce(nullif(employee.preferred_name,''),employee.first_name),employee.last_name),
  'can_edit_employee',own_record,'can_manage',can_manage,
  'settings',jsonb_build_object(
   'onboarding_required',settings.availability_onboarding_required,'revision',settings.availability_preferences_revision),
  'employee',employee_record,'shift_types',types,'time_format',settings.time_format)
  -- The manager part: the note when it is this reader's to see; null for an
  -- employee's note they may not see; left out when there is no note at all
  -- (the person is not an employee).
  || case when can_view_manager then jsonb_build_object('manager',manager_record)
     when app_private.has_employee_access(w,employee.user_id) then jsonb_build_object('manager',null)
     else '{}'::jsonb end;
end; $$;

CREATE OR REPLACE FUNCTION "public"."weekly_team_read_service"("actor" "uuid", "w" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare result jsonb; read_scope uuid[]; org_wide boolean;
begin
 read_scope:=app_private.scope_set(actor,w,'availability.team_read');
 -- Nowhere to read the team's availability: asked with nobody named, the core says
 -- why; with no live location in the workspace, only the people with none show.
 if cardinality(read_scope)=0 and (app_private.authz_reason(actor,w,'availability.team_read') is distinct from 'out_of_scope'
  or exists(select 1 from public.locations l where l.workspace_id=w and l.deleted_at is null)) then
  perform app_private.authorize(actor,w,'availability.team_read');
 end if;
 org_wide:=app_private.authz_reason(actor,w,'availability.team_read','{}'::uuid[]) is null;
 with scope as materialized (
  select l.id,l.name,l.sort_order from public.locations l where l.workspace_id=w and l.archived_at is null
   and l.id=any(read_scope)
 ), people as materialized (
  select e.id,e.employee_code,coalesce(nullif(e.preferred_name,''),e.first_name)||' '||e.last_name display_name,
   coalesce((select jsonb_agg(a.location_id order by a.location_id) from public.employee_location_assignments a
    join scope s on s.id=a.location_id where a.workspace_id=w and a.employee_id=e.id and a.ended_at is null),'[]') location_ids,
   -- The job the Employees list names.
   app_private.listed_job_name(e.id) job_name,
   p.employee_id is not null submitted,coalesce(p.preference,public.empty_weekly_preference()) preference,
   p.updated_at,
   (public.weekly_preference_manager_scope(actor,w,e.id,'availability.read')
    or public.weekly_preference_manager_scope(actor,w,e.id,'availability.manage')) can_open
  from public.employee_profiles e
  left join public.employee_weekly_preferences p on p.workspace_id=e.workspace_id and p.employee_id=e.id
  -- Only an employee enters availability (M13): nobody ranking above one is
  -- listed, nor counted as a week not submitted (KK-178). Somebody not joined
  -- yet has no account to rank by: the role they were last invited with says.
  where e.workspace_id=w and e.archived_at is null and app_private.has_employee_access(w,e.user_id)
   and (e.user_id is not null or coalesce((select app_private.authz_rank(r.access_class)=app_private.authz_rank('employee')
    from public.employee_invitations i join public.workspace_roles r on r.id=i.role_id and r.workspace_id=i.workspace_id
    where i.workspace_id=w and i.employee_id=e.id order by i.created_at desc,i.id desc limit 1),true)) and (
   exists(select 1 from public.employee_location_assignments a join scope l on l.id=a.location_id
    where a.workspace_id=w and a.employee_id=e.id and a.ended_at is null)
   or (not exists(select 1 from public.employee_location_assignments a where a.workspace_id=w and a.employee_id=e.id and a.ended_at is null)
    and org_wide)
  )
 )
 select jsonb_build_object(
  'locations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by sort_order,name,id) from scope),'[]'),
  'time_format',(select time_format from public.workspace_scheduling_settings where workspace_id=w),
  'employees',coalesce((select jsonb_agg(to_jsonb(p) order by display_name,employee_code,id) from people p),'[]')
 ) into result;
 return result;
end; $$;

CREATE OR REPLACE FUNCTION "app_private"."workspace_open_to_actor"("target_workspace_id" "uuid", "actor_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select app_private.workspace_allows_interactive_access(target_workspace_id)
    or exists (
      select 1
      from public.workspaces workspace
      join public.workspace_memberships membership
        on membership.workspace_id = workspace.id
      join public.workspace_roles role
        on role.id = membership.role_id and role.workspace_id = membership.workspace_id
      where workspace.id = target_workspace_id
        and workspace.lifecycle_status = 'draft'
        and membership.user_id = actor_user_id
        and membership.status = 'active'
        and role.access_class = 'owner'
    );
$$;

CREATE OR REPLACE FUNCTION "app_private"."workspace_role_for"("target_workspace_id" "uuid") RETURNS "public"."workspace_role"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  -- The management slot's class, else employee (ROL-CIFT).
  select coalesce(role.access_class, 'employee'::public.workspace_role)
  from public.workspace_memberships membership
  left join public.workspace_roles role
    on role.id = membership.role_id and role.workspace_id = membership.workspace_id
  where membership.workspace_id = target_workspace_id
    and membership.user_id = (select auth.uid())
    and membership.status = 'active'
    and not app_private.document_actor_blocked((select auth.uid()), target_workspace_id)
    and app_private.workspace_open_to_actor(target_workspace_id, (select auth.uid()))
  limit 1;
$$;

CREATE OR REPLACE FUNCTION "public"."service_actor_has_permission"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_permission" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
 select not app_private.document_actor_blocked(actor_user_id,target_workspace_id) and exists(select 1 from public.workspace_memberships m
 where m.user_id=actor_user_id and m.workspace_id=target_workspace_id and m.status='active'
 and (target_permission in ('workspace.read','notifications.read','notifications.read_own','notifications.preferences.write_own')
 or exists(select 1 from public.workspace_role_permissions g where g.role_id=m.role_id and g.workspace_id=m.workspace_id and g.permission_key=target_permission)
 or exists(select 1 from public.workspace_role_permissions g join public.permissions p on p.key=g.permission_key and p.employee_eligible
   where g.role_id=m.employee_role_id and g.workspace_id=m.workspace_id and g.permission_key=target_permission)));
$$;

CREATE OR REPLACE FUNCTION "app_private"."can_access_location"("target_workspace_id" "uuid", "target_location_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select not app_private.document_actor_blocked((select auth.uid()), target_workspace_id) and exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and app_private.workspace_open_to_actor(target_workspace_id, (select auth.uid()))
      and (
        exists (
          select 1 from public.workspace_roles role
          where role.id = membership.role_id and role.access_class in ('owner', 'admin')
        )
        or exists (
          select 1 from public.membership_managed_locations managed
          where managed.membership_id = membership.id and managed.location_id = target_location_id
        )
        or exists (
          select 1
          from public.membership_location_scopes scope
          where scope.membership_id = membership.id
            and scope.workspace_id = target_workspace_id
            and scope.location_id = target_location_id
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION "app_private"."employee_record_is_workspace_owner"("target_workspace_id" "uuid", "target_employee_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.employee_profiles employee
    join public.workspace_memberships membership
      on membership.workspace_id = employee.workspace_id
     and membership.user_id = employee.user_id
    where employee.id = target_employee_id
      and employee.workspace_id = target_workspace_id
      and employee.user_id is not null
      and exists (select 1 from public.workspace_roles role
                  where role.id = membership.role_id and role.access_class = 'owner')
  );
$$;

-- Offering, taking and asking time off for oneself are an employee's (design §4.4, §4.10).
update app_private.authz_actions set employee_target = true
where key in ('exchange.offer_own', 'exchange.apply_own', 'time_off.request_own');

drop function app_private.ranks_as_employee(uuid, uuid);

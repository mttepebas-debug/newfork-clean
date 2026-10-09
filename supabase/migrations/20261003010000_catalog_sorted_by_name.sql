-- BL-475 (user decisions 2026-09-30: "A to Z, no more ordering by hand"; then
-- "departments too, Management with no privilege").
-- Departments and jobs are listed by name everywhere: lower(name), then id.
-- Nobody orders them by hand: Settings > Jobs' Move up / Move down goes, and the
-- reorder RPC with it. When a job has to be chosen for a person (a new primary
-- job when the primary one is taken away or deleted, the job the Employees list
-- names) the same order decides.
-- Example: departments "Bar, Kitchen, Management, Service"; Kitchen's jobs
-- "Cook, Line Cook, Prep Cook"; whatever order they were added in.
--
-- sort_order stays on both tables for now: the API and the web still select it
-- and the shared schemas require the key (dropping the column is a second step,
-- after they stop). The reads keep answering the key, but the value means
-- nothing any more: every row is set to 0 and a CHECK keeps it there, which
-- closes every way of writing one (the create RPCs, a direct table write by an
-- admin).

-- 1. No department or job keeps a hand-given position --------------------------------

alter table public.jobs drop constraint jobs_sort_order_check;
alter table public.departments drop constraint departments_sort_order_check;
-- ponytail: the active-name indexes (workspace_id, lower(name)) already serve the
-- A-to-Z reads; a workspace holds tens of these rows, not thousands.
drop index public.jobs_workspace_order_idx;
drop index public.departments_workspace_order_idx;
update public.jobs set sort_order = 0 where sort_order <> 0;
update public.departments set sort_order = 0 where sort_order <> 0;
-- The job update queued the deferred document trigger; ALTER TABLE refuses to
-- run over pending trigger events, so fire them now and put the trigger back to
-- its initial (deferred) state afterwards.
set constraints public.document_assignment_changed immediate;
alter table public.jobs add constraint jobs_sort_order_unused check (sort_order = 0);
alter table public.departments add constraint departments_sort_order_unused check (sort_order = 0);
set constraints public.document_assignment_changed deferred;

-- 2. The hand ordering goes ----------------------------------------------------------

drop function public.reorder_organization_entities_service(uuid, uuid, text, uuid[]);
drop function public.reorder_organization_entities(uuid, text, uuid[]);

-- 3. Reads list departments and jobs A to Z; picks choose A to Z ---------------------

CREATE OR REPLACE FUNCTION app_private.schedule_departments_and_jobs(target_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'departments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', department.id, 'name', department.name, 'color', department.color,
        'sort_order', department.sort_order, 'system_key', department.system_key
      ) order by lower(department.name), department.id)
      from public.departments department
      where department.workspace_id = target_workspace_id and department.archived_at is null
    ), '[]'::jsonb),
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', job.id, 'name', job.name, 'color', job.color,
        'sort_order', job.sort_order, 'department_id', job.department_id, 'system_key', job.system_key
      ) order by lower(job.name), job.id)
      from public.jobs job
      where job.workspace_id = target_workspace_id and job.archived_at is null
    ), '[]'::jsonb)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.create_department_jobs_service(actor_user_id uuid, target_workspace_id uuid, target_department_id uuid, jobs_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare dep public.departments; item jsonb; job public.jobs; result jsonb:='[]';
begin
  if actor_user_id is null then raise exception 'valid actor required' using errcode='42501'; end if;
  perform set_config('request.jwt.claim.sub',actor_user_id::text,true);
  if not public.workspace_has_permission(target_workspace_id, 'settings.jobs.manage') then
    raise exception 'workspace management access required' using errcode='42501'; end if;
  if jsonb_typeof(jobs_input) is distinct from 'array' then
    raise exception 'Jobs must be an array' using errcode='22023'; end if;
  if jsonb_array_length(jobs_input) not between 1 and 500 then
    raise exception 'Provide between 1 and 500 jobs' using errcode='22023'; end if;
  perform 1 from public.workspaces where id=target_workspace_id for update;
  select * into dep from public.departments where id=target_department_id and workspace_id=target_workspace_id for update;
  if not found then raise exception 'Department not found' using errcode='P0002'; end if;
  if dep.archived_at is not null then raise exception 'Restore the department before adding jobs' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(jobs_input) loop
    if jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'name') is distinct from 'string'
      or jsonb_typeof(item->'color') is distinct from 'string' then
      raise exception 'Valid job name and color required' using errcode='22023'; end if;
    insert into public.jobs(workspace_id,department_id,name,color)
      values(target_workspace_id,dep.id,btrim(item->>'name'),item->>'color') returning * into job;
    result:=result||jsonb_build_array(to_jsonb(job));
  end loop;
  return result;
exception when unique_violation then
  raise exception 'A job with that name already exists. Names must be unique in this organization.' using errcode='23505';
end; $function$
;

CREATE OR REPLACE FUNCTION public.create_department_with_jobs_service(actor_user_id uuid, target_workspace_id uuid, department_input jsonb, jobs_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare dep public.departments; item jsonb; result_jobs jsonb;
begin
  if actor_user_id is null then raise exception 'valid actor required' using errcode='42501'; end if;
  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  if not public.workspace_has_permission(target_workspace_id, 'settings.jobs.manage') then
    raise exception 'workspace management access required' using errcode='42501';
  end if;
  if jsonb_typeof(department_input) is distinct from 'object'
    or jsonb_typeof(department_input->'name') is distinct from 'string'
    or jsonb_typeof(department_input->'color') is distinct from 'string'
    or jsonb_typeof(jobs_input) is distinct from 'array' then
    raise exception 'Valid department and jobs required' using errcode='22023';
  end if;
  if jsonb_array_length(jobs_input)>500 then raise exception 'Too many jobs' using errcode='22023'; end if;
  -- Serialize organization creation order without modifying existing definitions.
  perform 1 from public.workspaces where id=target_workspace_id for update;
  insert into public.departments(workspace_id,name,color)
  values(target_workspace_id,btrim(department_input->>'name'),department_input->>'color')
  returning * into dep;
  for item in select value from jsonb_array_elements(jobs_input) loop
    if jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'name') is distinct from 'string'
      or jsonb_typeof(item->'color') is distinct from 'string' then
      raise exception 'Valid job name and color required' using errcode='22023';
    end if;
    insert into public.jobs(workspace_id,department_id,name,color)
    values(target_workspace_id,dep.id,btrim(item->>'name'),item->>'color');
  end loop;
  select coalesce(jsonb_agg(to_jsonb(j) order by lower(j.name),j.id),'[]') into result_jobs
  from public.jobs j where j.workspace_id=target_workspace_id and j.department_id=dep.id;
  return jsonb_build_object('department',to_jsonb(dep),'jobs',result_jobs);
exception when unique_violation then
  raise exception 'A department or job with that name already exists. Names must be unique in this organization.' using errcode='23505';
end; $function$
;

CREATE OR REPLACE FUNCTION public.create_job_with_assignments_service(actor_user_id uuid, target_workspace_id uuid, job_input jsonb, assignment_changes jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target public.jobs;
  department public.departments;
  selected_department_id uuid;
  result jsonb := '{"changed_count":0,"unchanged_count":0}'::jsonb;
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;
  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  if not public.workspace_has_permission(target_workspace_id, 'settings.jobs.manage') then
    raise exception 'workspace management access required' using errcode = '42501';
  end if;
  if jsonb_typeof(job_input) is distinct from 'object'
    or jsonb_typeof(job_input->'name') is distinct from 'string'
    or char_length(btrim(job_input->>'name')) not between 1 and 100
    or jsonb_typeof(job_input->'color') is distinct from 'string'
    or (job_input->>'color') !~ '^#[0-9a-fA-F]{6}$'
    or not (job_input ? 'department_id')
    or jsonb_typeof(job_input->'department_id') not in ('string', 'null') then
    raise exception 'Valid job name, color and department required' using errcode = '22023';
  end if;
  if jsonb_typeof(assignment_changes) is distinct from 'array'
    or jsonb_array_length(assignment_changes) > 10000 then
    raise exception 'Choose at most 10000 employees' using errcode = '22023';
  end if;

  selected_department_id := (job_input->>'department_id')::uuid;
  if selected_department_id is not null then
    select * into department from public.departments d
      where d.id = selected_department_id and d.workspace_id = target_workspace_id for share;
    if department.id is null or department.archived_at is not null or department.deleted_at is not null then
      raise exception 'Choose an active department in this workspace' using errcode = '22023';
    end if;
  end if;

  perform 1 from public.workspaces where id = target_workspace_id for update;

  begin
    insert into public.jobs(workspace_id, department_id, name, color)
    values(
      target_workspace_id,
      selected_department_id,
      btrim(job_input->>'name'),
      job_input->>'color'
    )
    returning * into target;
  exception when unique_violation then
    raise exception 'This job name already exists. Choose a unique name.' using errcode = '23505';
  end;

  if jsonb_array_length(assignment_changes) > 0 then
    result := public.update_job_assignments_service(
      actor_user_id, target_workspace_id, target.id, assignment_changes
    );
  end if;

  return result || jsonb_build_object('job', to_jsonb(target));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_job_with_assignments_service(actor_user_id uuid, target_workspace_id uuid, target_job_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target public.jobs; a public.employee_job_assignments; replacement uuid; removed integer:=0;
  me app_private.actor_state; save_rule app_private.authz_actions; reason text;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.jobs.write');
  select * into target from public.jobs where id=target_job_id and workspace_id=target_workspace_id for update;
  if not found then raise exception 'Job not found' using errcode='P0002'; end if;
  if target.deleted_at is not null then return jsonb_build_object('removed_count',0); end if;
  if target.system_key is not null then
    raise exception 'Management and Owner are kept; rename them instead' using errcode='23514', hint='catalog.system_record'; end if;
  -- Taking a job off somebody changes their record: everyone on it must be
  -- somebody the actor may save.
  me := app_private.actor(actor_user_id, target_workspace_id);
  select * into save_rule from app_private.authz_actions r where r.key = 'employee.save';
  select min(app_private.authz_check(me, save_rule, null, employee.id, null)) into reason
  from public.employee_profiles employee
  where employee.workspace_id=target_workspace_id and exists(select 1 from public.employee_job_assignments assignment
    where assignment.employee_id=employee.id and assignment.job_id=target_job_id and assignment.ended_at is null);
  if reason is not null then
    raise exception 'This job is assigned to an employee you cannot manage. Ask an authorized administrator to delete it.'
      using errcode='42501', hint='authz.' || reason, detail='employee.save'; end if;
  perform 1 from public.employee_profiles employee
  where employee.workspace_id=target_workspace_id and exists(select 1 from public.employee_job_assignments assignment
    where assignment.employee_id=employee.id and assignment.job_id=target_job_id and assignment.ended_at is null)
  order by employee.id for update;
  for a in select * from public.employee_job_assignments where workspace_id=target_workspace_id and job_id=target_job_id and ended_at is null order by employee_id loop
    update public.employee_job_assignments set ended_at=now() where id=a.id;
    if a.is_primary then
      select other.id into replacement from public.employee_job_assignments other join public.jobs j on j.id=other.job_id
        where other.employee_id=a.employee_id and other.ended_at is null and j.system_key is distinct from 'owner'
        order by (j.archived_at is not null),lower(j.name),j.id limit 1;
      if replacement is not null then update public.employee_job_assignments set is_primary=true where id=replacement; end if;
    end if;
    update public.employee_profiles set revision=revision+1,updated_at=now() where id=a.employee_id;
    insert into public.employee_events(workspace_id,employee_id,actor_user_id,action,summary)
      values(target_workspace_id,a.employee_id,actor_user_id,'job.unassigned','Removed from deleted job '||target.name);
    removed:=removed+1;
  end loop;
  update public.jobs set deleted_at=now(),archived_at=coalesce(archived_at,now()),updated_at=now() where id=target_job_id;
  return jsonb_build_object('removed_count',removed);
end; $function$
;

CREATE OR REPLACE FUNCTION public.document_definition_target_options_service(actor_user_id uuid, target_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if not (public.service_actor_has_permission(actor_user_id,target_workspace_id,'documents.manage') or public.service_actor_has_permission(actor_user_id,target_workspace_id,'signature_templates.manage')) then raise exception 'document management access required' using errcode='42501'; end if;
 select jsonb_build_object(
  'locations',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name) order by l.name) from public.locations l where l.workspace_id=target_workspace_id and l.archived_at is null
   and exists(select 1 from public.workspace_memberships m where m.workspace_id=l.workspace_id and m.user_id=actor_user_id and m.status='active'
    and (m.all_locations or exists(select 1 from public.membership_location_scopes s where s.membership_id=m.id and s.workspace_id=m.workspace_id and s.location_id=l.id)))),'[]'),
  'departments',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.name) order by lower(d.name),d.id) from public.departments d where d.workspace_id=target_workspace_id and d.archived_at is null),'[]'),
  'jobs',coalesce((select jsonb_agg(jsonb_build_object('id',j.id,'name',j.name,'department_id',j.department_id) order by lower(j.name),j.id) from public.jobs j where j.workspace_id=target_workspace_id and j.archived_at is null),'[]'),
  'employees',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'name',concat_ws(' ',e.first_name,e.last_name)) order by e.first_name,e.last_name) from public.employee_profiles e where e.workspace_id=target_workspace_id and e.archived_at is null and public.service_actor_can_access_employee(actor_user_id,target_workspace_id,e.id)),'[]')
 ) into result;
 return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_announcements_service(actor_user_id uuid, target_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare can_manage boolean; result jsonb;
begin
 if not public.communication_actor_has_capability_service(actor_user_id,target_workspace_id,'announcements.read') then raise exception 'announcement access required' using errcode='42501'; end if;
 can_manage:=public.communication_actor_has_capability_service(actor_user_id,target_workspace_id,'announcements.manage');
 select jsonb_build_object(
  'workspace_id',target_workspace_id,
  'can_manage',can_manage,
  'locations',coalesce((select jsonb_agg(jsonb_build_object('id',location.id,'name',location.name) order by location.sort_order,location.name) from public.locations location where location.workspace_id=target_workspace_id and location.archived_at is null and public.communication_actor_has_capability_service(actor_user_id,target_workspace_id,'announcements.read',location.id)),'[]'::jsonb),
  'departments',case when can_manage then coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.name) order by lower(d.name),d.id) from public.departments d where d.workspace_id=target_workspace_id and d.archived_at is null),'[]'::jsonb) else '[]'::jsonb end,
  'jobs',case when can_manage then coalesce((select jsonb_agg(jsonb_build_object('id',j.id,'name',j.name,'department_id',j.department_id) order by lower(j.name),j.id) from public.jobs j where j.workspace_id=target_workspace_id and j.archived_at is null),'[]'::jsonb) else '[]'::jsonb end,
  'announcements',coalesce((
   select jsonb_agg(jsonb_build_object(
    'id',announcement.id,'workspace_id',announcement.workspace_id,'title',announcement.title,'body',announcement.body,
    'category',announcement.category,'status',announcement.status,'audience_roles',announcement.audience_roles,
    'location_ids',coalesce(targets.ids,'{}'::uuid[]),'location_names',coalesce(targets.names,'{}'::text[]),
    'department_ids',announcement.department_ids,'job_ids',announcement.job_ids,'archived_at',announcement.archived_at,
    'department_names',coalesce((select jsonb_agg(d.name order by lower(d.name),d.id) from public.departments d where d.workspace_id=target_workspace_id and d.id=any(announcement.department_ids)),'[]'::jsonb),
    'job_names',coalesce((select jsonb_agg(j.name order by lower(j.name),j.id) from public.jobs j where j.workspace_id=target_workspace_id and j.id=any(announcement.job_ids)),'[]'::jsonb),
    'publish_at',announcement.publish_at,'published_at',announcement.published_at,'expires_at',announcement.expires_at,
    'action_url',announcement.action_url,'author_name',coalesce(author.display_name,'Workspace member'),
    'revision',announcement.revision,'created_at',announcement.created_at,'updated_at',announcement.updated_at,
    'read_at',notification.read_at,
    'acknowledged_at',acknowledgement.acknowledged_at,
    'can_edit',public.communication_actor_can_control_announcement_service(actor_user_id,target_workspace_id,announcement.id) and announcement.status in('draft','scheduled'),
    'can_publish',public.communication_actor_can_control_announcement_service(actor_user_id,target_workspace_id,announcement.id) and announcement.status in('draft','scheduled'),
    'can_cancel',public.communication_actor_can_control_announcement_service(actor_user_id,target_workspace_id,announcement.id) and announcement.archived_at is null
   ) order by coalesce(announcement.publish_at,announcement.created_at) desc,announcement.id)
   from public.announcements announcement
   join public.user_profiles author on author.user_id=announcement.created_by
   join public.workspace_memberships viewer on viewer.workspace_id=target_workspace_id and viewer.user_id=actor_user_id and viewer.status='active'
   join public.workspace_roles viewer_role on viewer_role.id=viewer.role_id
   left join lateral(select array_agg(location.id order by location.sort_order) ids,array_agg(location.name order by location.sort_order) names from public.announcement_locations target join public.locations location on location.id=target.location_id where target.announcement_id=announcement.id) targets on true
   left join public.notifications notification on notification.recipient_user_id=actor_user_id and notification.source_type='announcement' and notification.source_id=announcement.id and notification.event_key='published'
   left join public.announcement_acknowledgements acknowledgement on acknowledgement.announcement_id=announcement.id and acknowledgement.user_id=actor_user_id
   where announcement.workspace_id=target_workspace_id
    and (
     public.communication_actor_can_control_announcement_service(actor_user_id,target_workspace_id,announcement.id)
     or (
      announcement.archived_at is null and public.announcement_member_matches_jobs_service(actor_user_id,target_workspace_id,announcement.department_ids,announcement.job_ids)
      and announcement.status in('published','scheduled') and coalesce(announcement.publish_at,announcement.published_at)<=now()
      and (announcement.expires_at is null or announcement.expires_at>now()) and viewer_role.access_class=any(announcement.audience_roles)
      and public.announcement_member_matches_locations_service(actor_user_id,target_workspace_id,announcement.id)
     )
    )
  ),'[]'::jsonb)
 ) into result;
 return result;
end; $function$
;

CREATE OR REPLACE FUNCTION public.get_employee_detail_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me app_private.actor_state;
  reads_private boolean;
  reads_access boolean;
  removal app_private.authz_actions;
  answer jsonb;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.read', target_person => target_employee_id);
  me := app_private.actor(actor_user_id, target_workspace_id);
  -- The owner holds every permission.
  reads_private := me.class = 'owner' or 'employees.private.read' = any (me.permissions);
  reads_access := me.class = 'owner' or 'employee_access.read' = any (me.permissions);
  select * into removal from app_private.authz_actions action where action.key = 'employee.remove_from_location';
  if not found then
    raise exception 'core action employee.remove_from_location is missing' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'id', employee.id,
    'workspace_id', employee.workspace_id,
    'employee_code', employee.employee_code,
    'first_name', employee.first_name,
    'last_name', employee.last_name,
    'preferred_name', employee.preferred_name,
    'display_name', concat_ws(' ', employee.first_name, employee.last_name),
    'invitation_email', employee.invitation_email,
    'account_email', account_user.email,
    'start_date', employee.start_date,
    'primary_location_id', primary_location.location_id,
    'primary_location_name', location.name,
    'location_count', (
      select count(*)
      from public.employee_location_assignments assignment
      where assignment.employee_id = employee.id and assignment.ended_at is null
    ),
    'primary_job_id', primary_job.job_id,
    'primary_job_name', job.name,
    'job_count', (
      select count(*)
      from public.employee_job_assignments assignment
      where assignment.employee_id = employee.id and assignment.ended_at is null
    ),
    'role_id', role.id,
    'role_name', role.name,
    'display_status', case
      when employee.archived_at is not null then 'archived'
      when membership.status = 'active' then 'active'
      when membership.status = 'pending_activation' then 'onboarding'
      when invitation.status = 'pending' and invitation.expires_at > now() then 'invited'
      else 'not_invited'
    end,
    'archived_at', employee.archived_at,
    'revision', employee.revision,
    'user_id', employee.user_id,
    'internal_note', employee.internal_note,
    'is_remote', employee.is_remote,
    'is_excluded_from_schedule', employee.is_excluded_from_schedule,
    -- Whether this is the workspace owner's record: the drawer asks here, not
    -- the role's name (BL-421).
    'is_workspace_owner', app_private.employee_record_is_workspace_owner(employee.workspace_id, employee.id),
    -- null only when the reader may not read it. Somebody with nothing on file
    -- yet reads as an empty profile: no names, nothing given, the defaults the
    -- shared employeeDetailSchema needs (7b QA finding 1, shape agreed with
    -- nf-backend).
    'private_contact', case
      when not reads_private then null
      else jsonb_strip_nulls(jsonb_build_object(
        'legal_first_name', private_profile.legal_first_name,
        'legal_last_name', private_profile.legal_last_name,
        'preferred_name', private_profile.preferred_name
      )) || jsonb_build_object(
        'phone', private_profile.phone,
        'street_address', private_profile.street_address,
        'city', private_profile.city,
        'region', private_profile.region,
        'postal_code', private_profile.postal_code,
        'country_code', private_profile.country_code,
        'date_of_birth', private_profile.date_of_birth,
        'emergency_contact_name', private_profile.emergency_contact_name,
        'emergency_contact_relationship', private_profile.emergency_contact_relationship,
        'emergency_contact_phone', private_profile.emergency_contact_phone,
        'emergency_contact_email', coalesce(private_profile.emergency_contact_email, ''),
        'share_phone_with_teammates', coalesce(private_profile.share_phone_with_teammates, false),
        'share_email_with_teammates', coalesce(private_profile.share_email_with_teammates, false)
      )
    end,
    'locations', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', assignment.location_id,
          'name', assigned_location.name,
          'primary', assignment.is_primary,
          'archived', assigned_location.archived_at is not null,
          -- May the reader take them off this location.
          'removable', app_private.authz_check(me, removal, array[assignment.location_id], employee.id, null) is null
        )
        order by assignment.is_primary desc, assigned_location.name
      )
      from public.employee_location_assignments assignment
      join public.locations assigned_location on assigned_location.id = assignment.location_id
      where assignment.employee_id = employee.id and assignment.ended_at is null
    ), '[]'::jsonb),
    'jobs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', assignment.job_id,
          'name', assigned_job.name,
          'primary', assignment.is_primary,
          'archived', assigned_job.archived_at is not null
        )
        order by assignment.is_primary desc, lower(assigned_job.name), assigned_job.id
      )
      from public.employee_job_assignments assignment
      join public.jobs assigned_job on assigned_job.id = assignment.job_id
      where assignment.employee_id = employee.id and assignment.ended_at is null
    ), '[]'::jsonb),
    'invitation', case
      when invitation.id is null or not reads_access then null
      else jsonb_build_object(
        'id', invitation.id,
        'email', invitation.email,
        'role_id', invitation.role_id,
        'status', invitation.status,
        'expires_at', invitation.expires_at,
        'sent_at', invitation.sent_at,
        'delivery_status', invitation.delivery_status,
        'delivery_attempted_at', invitation.delivery_attempted_at,
        'delivery_failed_at', invitation.delivery_failed_at,
        'delivery_error', invitation.delivery_error,
        'role_name', invitation_role.name,
        'invited_by_name', coalesce(
          nullif(btrim(inviter_profile.display_name), ''),
          inviter_user.email
        )
      )
    end,
    'onboarding', jsonb_build_object(
      'status', case
        when membership.status = 'pending_activation' then 'in_progress'
        when invitation.status = 'pending' then 'invited'
        else 'not_requested'
      end,
      'required_documents', (
        select count(*)
        from public.document_types document_type
        where document_type.workspace_id = employee.workspace_id
          and document_type.required_at_onboarding
          and document_type.archived_at is null
      ),
      'completed_documents', 0
    ),
    'events', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', event.id,
          'action', event.action,
          'occurred_at', event.occurred_at,
          'actor_user_id', event.actor_user_id,
          'summary', event.summary
        )
        order by event.occurred_at desc
      )
      from (
        select *
        from public.employee_events
        where employee_id = employee.id
        order by occurred_at desc
        limit 50
      ) event
    ), '[]'::jsonb),
    -- What the reader may do to this record, by the same rules the actions ask.
    'allowed', (
      select jsonb_object_agg(replace(replace(action.key, 'employee.', ''), '.', '_'),
        app_private.authz_check(me, action, null, employee.id, null) is null
        -- Only a live record with no account on it is invitable, as
        -- prepare_employee_invitation_service says (7b QA finding 2).
        and (action.key <> 'employee.invite'
          or (employee.user_id is null and employee.archived_at is null)))
      from app_private.authz_actions action
      where action.key in ('employee.save', 'employee.terminate', 'employee.archive',
        'employee.remove_access', 'employee.change_role', 'employee.make_admin',
        'employee.invite', 'onboarding.review')
    )
  ) into answer
  from public.employee_profiles employee
  left join public.employee_private_profiles private_profile
    on private_profile.employee_id = employee.id
  left join auth.users account_user
    on account_user.id = employee.user_id
  left join public.employee_location_assignments primary_location
    on primary_location.employee_id = employee.id
    and primary_location.ended_at is null
    and primary_location.is_primary
  left join public.locations location on location.id = primary_location.location_id
  left join public.employee_job_assignments primary_job
    on primary_job.employee_id = employee.id
    and primary_job.ended_at is null
    and primary_job.is_primary
  left join public.jobs job on job.id = primary_job.job_id
  left join public.workspace_memberships membership
    on membership.workspace_id = employee.workspace_id
    and membership.user_id = employee.user_id
  left join public.workspace_roles role on role.id = membership.role_id
  left join lateral (
    select *
    from public.employee_invitations candidate
    where candidate.employee_id = employee.id
    order by candidate.created_at desc
    limit 1
  ) invitation on true
  left join public.workspace_roles invitation_role
    on invitation_role.id = invitation.role_id
  left join public.user_profiles inviter_profile
    on inviter_profile.user_id = invitation.created_by
  left join auth.users inviter_user
    on inviter_user.id = invitation.created_by
  where employee.id = target_employee_id
    and employee.workspace_id = target_workspace_id;

  return answer;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_employee_hub_service(actor_user_id uuid, target_workspace_id uuid, target_from date, target_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare employee public.employee_profiles%rowtype; result jsonb;
begin
  if target_to < target_from or target_to > target_from + 62 then
    raise exception 'employee hub date range is invalid' using errcode = '22023';
  end if;
  employee := public.employee_hub_actor_service(actor_user_id, target_workspace_id);

  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'employee', jsonb_build_object(
      'id', employee.id,
      'display_name', concat_ws(' ', coalesce(nullif(employee.preferred_name,''),employee.first_name), employee.last_name)
    ),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object('id',location.id,'name',location.name) order by location.sort_order,location.name)
      from public.employee_location_assignments assignment
      join public.locations location on location.id=assignment.location_id and location.archived_at is null
      where assignment.employee_id=employee.id and assignment.ended_at is null
    ),'[]'::jsonb),
    'shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',shift.id,'location_id',shift.location_id,'location_name',location.name,'job_name',job.name,
        'scheduled_date',shift.scheduled_date,'time_basis',shift.time_basis,'time_snapshot',shift.time_snapshot,'time_timezone',shift.time_timezone,'start_time',to_char(shift.start_time,'HH24:MI'),
        'end_time',to_char(shift.end_time,'HH24:MI'),'note',shift.note,'employee_id',shift.employee_id
      ) order by shift.scheduled_date,shift.start_time)
      from public.schedule_published_shifts shift
      join public.schedule_location_publications publication on publication.id=shift.publication_id and publication.status='current'
      join public.locations location on location.id=shift.location_id
      join public.jobs job on job.id=shift.job_id
      where shift.workspace_id=target_workspace_id and shift.employee_id=employee.id
        and shift.scheduled_date between target_from and target_to
    ),'[]'::jsonb),
    'open_shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',shift.id,'location_id',shift.location_id,'location_name',location.name,'job_name',job.name,
        'scheduled_date',shift.scheduled_date,'time_basis',shift.time_basis,'time_snapshot',shift.time_snapshot,'time_timezone',shift.time_timezone,'start_time',to_char(shift.start_time,'HH24:MI'),
        'end_time',to_char(shift.end_time,'HH24:MI'),'note',shift.note,'employee_id',null
      ) order by shift.scheduled_date,shift.start_time)
      from public.schedule_published_shifts shift
      join public.schedule_location_publications publication on publication.id=shift.publication_id and publication.status='current'
      join public.locations location on location.id=shift.location_id
      join public.jobs job on job.id=shift.job_id
      where shift.workspace_id=target_workspace_id and shift.employee_id is null
        and shift.scheduled_date between target_from and target_to
        and exists(select 1 from public.employee_location_assignments assignment
          where assignment.employee_id=employee.id and assignment.location_id=shift.location_id and assignment.ended_at is null)
    ),'[]'::jsonb),
    'team_shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',shift.id,'location_id',shift.location_id,'location_name',location.name,'job_name',job.name,
        'scheduled_date',shift.scheduled_date,'time_basis',shift.time_basis,'time_snapshot',shift.time_snapshot,'time_timezone',shift.time_timezone,'start_time',to_char(shift.start_time,'HH24:MI'),
        'end_time',to_char(shift.end_time,'HH24:MI'),'note','','employee_id',shift.employee_id,
        'employee_name',concat_ws(' ',coalesce(nullif(teammate.preferred_name,''),teammate.first_name),teammate.last_name)
      ) order by shift.scheduled_date,shift.start_time)
      from public.schedule_published_shifts shift
      join public.schedule_location_publications publication on publication.id=shift.publication_id and publication.status='current'
      join public.locations location on location.id=shift.location_id
      join public.jobs job on job.id=shift.job_id
      join public.employee_profiles teammate on teammate.id=shift.employee_id
      where shift.workspace_id=target_workspace_id and shift.employee_id<>employee.id
        and shift.scheduled_date between target_from and target_to
        and exists(select 1 from public.employee_location_assignments assignment
          where assignment.employee_id=employee.id and assignment.location_id=shift.location_id and assignment.ended_at is null)
    ),'[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(request_row order by request_row->>'created_at' desc) from (
        select jsonb_build_object(
          'id',request.id,'kind','time_off','request_type',request.request_type,'cancellation',public.time_off_cancellation_context(target_workspace_id,request.id),'periods',public.time_off_request_periods(request.id,target_workspace_id), 'decision_events',coalesce((select jsonb_agg(jsonb_build_object('id',ev.id,'action',ev.action,'note',ev.note,'created_at',ev.created_at,'revision',ev.metadata->'revision','released_assignments',public.time_off_event_released_assignments(get_employee_hub_service.actor_user_id,target_workspace_id,ev.id)) order by ev.created_at,ev.id)
  from public.schedule_time_off_events ev where ev.request_id=request.id and ev.workspace_id=target_workspace_id and ev.action in('approved','partially_approved','denied','returned_to_pending','revoked')),'[]'), 'status',request.status::text,
          'title',case when request.request_type='time_off_cancellation' then 'Cancel approved leave · ' else 'Time off · ' end||to_char(min(segment.segment_date),'Mon DD')||case when min(segment.segment_date)<>max(segment.segment_date) then '–'||to_char(max(segment.segment_date),'Mon DD') else '' end,
          'detail',coalesce(nullif(request.reason,''),'No note'),'revision',request.revision,'created_at',request.created_at,
          'can_cancel',request.status='pending'
        ) request_row
        from public.schedule_time_off_requests request
        join public.schedule_time_off_segments segment on segment.request_id=request.id
        where request.workspace_id=target_workspace_id and request.employee_id=employee.id
        group by request.id
      ) requests
    ),'[]'::jsonb),
    'team', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',teammate.id,
        'display_name',concat_ws(' ',coalesce(nullif(teammate.preferred_name,''),teammate.first_name),teammate.last_name),
        'job_names',coalesce((select jsonb_agg(job.name order by lower(job.name),job.id) from public.employee_job_assignments assignment join public.jobs job on job.id=assignment.job_id where assignment.employee_id=teammate.id and assignment.ended_at is null),'[]'::jsonb),
        'location_names',coalesce((select jsonb_agg(location.name order by location.sort_order,location.name) from public.employee_location_assignments assignment join public.locations location on location.id=assignment.location_id where assignment.employee_id=teammate.id and assignment.ended_at is null),'[]'::jsonb)
      ) order by teammate.last_name,teammate.first_name)
      from public.employee_profiles teammate
      where teammate.workspace_id=target_workspace_id and teammate.archived_at is null and teammate.id<>employee.id
        and exists(select 1 from public.employee_location_assignments mine join public.employee_location_assignments theirs on theirs.location_id=mine.location_id and theirs.ended_at is null where mine.employee_id=employee.id and mine.ended_at is null and theirs.employee_id=teammate.id)
    ),'[]'::jsonb)
  ) into result;
  return result;
end; $function$
;

CREATE OR REPLACE FUNCTION public.get_employee_onboarding_service(target_user_id uuid, target_workspace_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_case public.employee_onboarding_cases%rowtype;
  employee public.employee_profiles%rowtype;
  membership public.workspace_memberships%rowtype;
  profile jsonb;
  requirements jsonb;
  completed_count integer;
  total_count integer;
  first_path text;
begin
  perform public.initialize_employee_onboarding_service(target_user_id, target_workspace_id);
  select onboarding.* into target_case
  from public.employee_onboarding_cases onboarding
  where onboarding.id = app_private.employee_onboarding_case_id(target_user_id, target_workspace_id);
  if target_case.id is null then
    raise exception 'employee onboarding is unavailable' using errcode = 'P0002';
  end if;
  select * into employee from public.employee_profiles where id = target_case.employee_id;
  select * into membership from public.workspace_memberships where id = target_case.membership_id;

  select to_jsonb(private_profile) - 'created_at' - 'updated_at' - 'employee_id' - 'workspace_id'
  into profile from public.employee_private_profiles private_profile
  where private_profile.employee_id = employee.id;
  profile := coalesce(
    profile,
    jsonb_build_object(
      'legal_first_name', employee.first_name,
      'legal_last_name', employee.last_name
    )
  );


  select coalesce(jsonb_agg(jsonb_build_object(
    'id', requirement.id,
    'kind', requirement.kind,
    'title', requirement.title,
    'description', requirement.description,
    'status', requirement.status,
    'required', requirement.required,'document_mode',requirement.lifecycle_settings->>'mode', 'conditional_reason',requirement.conditional_reason,
    'blocks_activation', requirement.blocks_activation,
    'requires_review', requirement.requires_review,
    'sort_order', requirement.sort_order,
    'source_id', requirement.source_id,
    'accepted_formats', coalesce(requirement.source_snapshot->'accepted_formats', '[]'::jsonb),
    'content_text', requirement.source_snapshot->>'content_text',
    'content_digest', requirement.source_snapshot->>'content_digest',
    'intent_statement', requirement.source_snapshot->>'intent_statement',
    'rejection_reason', requirement.rejection_reason
  ) order by requirement.sort_order, requirement.id), '[]'::jsonb),
  count(*) filter (where requirement.required or (requirement.kind='document' and requirement.lifecycle_settings->>'mode'='conditional')),
  count(*) filter (where (requirement.required and requirement.status in ('completed', 'awaiting_review')) or (requirement.kind='document' and requirement.lifecycle_settings->>'mode'='conditional' and not app_private.document_initial_action_missing(requirement)))
  into requirements, total_count, completed_count
  from public.employee_onboarding_requirements requirement
  where requirement.case_id = target_case.id and requirement.status <> 'superseded' and requirement.lifecycle_retired_at is null and (requirement.kind<>'document' or (not requirement.lifecycle_exempt and requirement.lifecycle_closed_at is null));

  select case requirement.kind
    when 'profile' then '/welcome/profile'
    when 'ssn' then '/welcome/review'
    when 'document' then '/welcome/documents/' || requirement.id
    when 'acknowledgement' then '/welcome/acknowledgements/' || requirement.id
    when 'availability' then '/welcome/availability'
  end into first_path
  from public.employee_onboarding_requirements requirement
  where requirement.case_id = target_case.id
    and (requirement.required or app_private.document_initial_action_missing(requirement))
    and requirement.status in ('not_started', 'in_progress', 'rejected', 'manual_follow_up')
  order by case when requirement.status = 'rejected' then 0 else 1 end,
    requirement.sort_order, requirement.id
  limit 1;
  first_path := coalesce(first_path,
    case when target_case.status = 'approved' then '/app/employee-hub' else '/welcome/review' end);

  return jsonb_build_object(
    'case_id', target_case.id,
    'workspace_id', target_case.workspace_id,
    'workspace_name', (select name from public.workspaces where id = target_case.workspace_id),
    'employee_id', employee.id,
    'employee_name', concat_ws(' ', employee.first_name, employee.last_name),
    'membership_id', membership.id,
    'membership_status', membership.status,
    'case_status', target_case.status,
    'revision', target_case.revision,
    'progress_completed', completed_count,
    'progress_total', total_count,
    'first_actionable_path', first_path,
    'ssn_status', jsonb_build_object(
      'present', false,
      'last_four', null
    ),
    'profile', profile,
    'assignments', jsonb_build_object(
      'locations', coalesce((select jsonb_agg(location.name order by assignment.is_primary desc, location.name)
        from public.employee_location_assignments assignment join public.locations location on location.id = assignment.location_id
        where assignment.employee_id = employee.id and assignment.ended_at is null), '[]'::jsonb),
      'jobs', coalesce((select jsonb_agg(job.name order by assignment.is_primary desc, lower(job.name), job.id)
        from public.employee_job_assignments assignment join public.jobs job on job.id = assignment.job_id
        where assignment.employee_id = employee.id and assignment.ended_at is null), '[]'::jsonb)
    ),
    'requirements', requirements
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_employees_service(actor_user_id uuid, target_workspace_id uuid, include_archived boolean DEFAULT false, search_text text DEFAULT ''::text, status_filter text DEFAULT 'all'::text, page_limit integer DEFAULT 100, page_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, workspace_id uuid, employee_code text, first_name text, last_name text, preferred_name text, display_name text, invitation_email text, start_date date, primary_location_id uuid, primary_location_name text, location_count bigint, primary_job_id uuid, primary_job_name text, job_count bigint, role_name text, display_status text, archived_at timestamp with time zone, revision integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me app_private.actor_state := app_private.actor(actor_user_id, target_workspace_id);
  rule_row app_private.authz_actions;
  reason text;
begin
  select * into rule_row from app_private.authz_actions action where action.key = 'employee.list';
  if not found then
    raise exception 'core action employee.list is missing' using errcode = '22023';
  end if;
  -- May they list anybody at all; who, is answered row by row.
  reason := app_private.authz_check(me, rule_row, null, null, null);
  if reason is not null and reason <> 'out_of_scope' then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || reason, detail = 'employee.list';
  end if;

  return query
  with directory as (
    select employee.id, employee.workspace_id, employee.employee_code,
      employee.first_name, employee.last_name, employee.preferred_name,
      concat_ws(' ', coalesce(nullif(employee.preferred_name, ''), employee.first_name), employee.last_name) as display_name,
      employee.invitation_email, employee.start_date,
      primary_location.location_id as primary_location_id,
      location.name as primary_location_name,
      (select count(*) from public.employee_location_assignments a where a.employee_id = employee.id and a.ended_at is null) as location_count,
      primary_job.job_id as primary_job_id, listed_job.name as primary_job_name,
      (select count(*) from public.employee_job_assignments a where a.employee_id = employee.id and a.ended_at is null) as job_count,
      role.name as role_name,
      case
        when employee.archived_at is not null then 'archived'
        when membership.status = 'active' then 'active'
        when onboarding.status in ('submitted', 'changes_requested') then 'needs_attention'
        when membership.status = 'pending_activation' then 'onboarding'
        when invitation.status = 'pending' and invitation.expires_at > now() then 'invited'
        else 'not_invited'
      end as display_status,
      employee.archived_at, employee.revision
    from public.employee_profiles employee
    left join public.employee_location_assignments primary_location on primary_location.employee_id = employee.id and primary_location.ended_at is null and primary_location.is_primary
    left join public.locations location on location.id = primary_location.location_id
    left join public.employee_job_assignments primary_job on primary_job.employee_id = employee.id and primary_job.ended_at is null and primary_job.is_primary
    -- The job the list names: the stored primary; failing that the Owner job
    -- (the owner's, never stored as primary), then the first job in the
    -- catalog's order (A to Z, BL-475).
    left join lateral (
      select job.name
      from public.employee_job_assignments assignment
      join public.jobs job on job.id = assignment.job_id
      where assignment.employee_id = employee.id and assignment.ended_at is null
        and (assignment.is_primary or job.archived_at is null)
      order by assignment.is_primary desc, coalesce(job.system_key = 'owner', false) desc,
        lower(job.name), job.id
      limit 1
    ) listed_job on true
    left join public.workspace_memberships membership on membership.workspace_id = employee.workspace_id and membership.user_id = employee.user_id
    left join public.workspace_roles role on role.id = membership.role_id
    left join public.employee_onboarding_cases onboarding on onboarding.employee_id = employee.id
    left join lateral (
      select candidate.status, candidate.expires_at
      from public.employee_invitations candidate
      where candidate.employee_id = employee.id
      order by candidate.created_at desc limit 1
    ) invitation on true
    where employee.workspace_id = target_workspace_id
      and (include_archived = (employee.archived_at is not null))
      and app_private.authz_check(me, rule_row, null, employee.id, null) is null
  )
  select * from directory
  where (
      btrim(search_text) = ''
      or concat_ws(
        ' ',
        directory.first_name,
        directory.last_name,
        directory.preferred_name,
        directory.employee_code,
        directory.invitation_email,
        directory.primary_location_name,
        directory.primary_job_name
      ) ilike '%' || btrim(search_text) || '%'
    )
    and (status_filter = 'all' or directory.display_status = status_filter)
  order by lower(directory.display_name), directory.id
  limit least(greatest(page_limit, 1), 200)
  offset greatest(page_offset, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.read_employee_references_service(actor_user_id uuid, target_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  reach uuid[] := app_private.scope_set(actor_user_id, target_workspace_id, 'employee.references.read');
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.references.read',
    target_locations => reach);
  return jsonb_build_object(
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', location.id, 'name', location.name,
        'archived_at', location.archived_at, 'timezone', location.timezone
      ) order by location.sort_order, location.name, location.id)
      from public.locations location
      where location.workspace_id = target_workspace_id and location.deleted_at is null
        and location.id = any (reach)
    ), '[]'::jsonb),
    -- Listed as the jobs are: the archived one included, so an archived job
    -- still finds its department; the deleted one not.
    'departments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', department.id, 'name', department.name,
        'archived_at', department.archived_at, 'system_key', department.system_key
      ) order by lower(department.name), department.id)
      from public.departments department
      where department.workspace_id = target_workspace_id and department.deleted_at is null
    ), '[]'::jsonb),
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', job.id, 'name', job.name, 'archived_at', job.archived_at,
        'department_id', job.department_id, 'system_key', job.system_key
      ) order by lower(job.name), job.id)
      from public.jobs job
      where job.workspace_id = target_workspace_id and job.deleted_at is null
    ), '[]'::jsonb),
    'invite_roles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', role.id, 'name', role.name,
        'system_key', role.system_key, 'access_class', role.access_class
      ) order by role.sort_order, role.name, role.id)
      from public.workspace_roles role
      where role.workspace_id = target_workspace_id
        and app_private.can_invite_with_role(actor_user_id, target_workspace_id, role.id)
    ), '[]'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.read_settings_jobs_service(actor_user_id uuid, target_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.jobs.read');
  return jsonb_build_object(
    'departments', (
      select coalesce(jsonb_agg(to_jsonb(d) order by lower(d.name), d.id), '[]'::jsonb)
      from (
        select department.id, department.workspace_id, department.name, department.color,
          department.sort_order, department.archived_at, department.system_key
        from public.departments department
        where department.workspace_id = target_workspace_id and department.deleted_at is null
      ) d),
    'jobs', (
      select coalesce(jsonb_agg(to_jsonb(j) order by lower(j.name), j.id), '[]'::jsonb)
      from (
        select job.id, job.workspace_id, job.department_id, job.name, job.color, job.sort_order, job.archived_at,
          job.system_key
        from public.jobs job
        where job.workspace_id = target_workspace_id and job.deleted_at is null
      ) j)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_job_assignments_service(actor_user_id uuid, target_workspace_id uuid, target_job_id uuid, assignment_changes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare item jsonb; employee public.employee_profiles; target public.jobs; existing public.employee_job_assignments;
  actual boolean; desired boolean; changed integer:=0; unchanged integer:=0; replacement uuid;
  me app_private.actor_state := app_private.actor(actor_user_id, target_workspace_id);
  save_rule app_private.authz_actions; reason text;
begin
  select * into save_rule from app_private.authz_actions r where r.key = 'employee.save';
  -- May they change anybody's jobs at all; whose, is asked person by person.
  reason := app_private.authz_check(me, save_rule, null, null, null);
  if reason is not null and reason <> 'out_of_scope' then
    raise exception 'Not allowed' using errcode='42501', hint='authz.' || reason, detail='employee.save'; end if;
  select * into target from public.jobs where id=target_job_id and workspace_id=target_workspace_id for update;
  if target.id is null then raise exception 'Job not found' using errcode='P0002'; end if;
  if target.deleted_at is not null then raise exception 'This job was deleted and is no longer available' using errcode='P0002'; end if;
  if target.archived_at is not null then raise exception 'Restore this job before changing assignments' using errcode='22023'; end if;
  if jsonb_typeof(assignment_changes) is distinct from 'array' then
    raise exception 'Valid assignment changes required' using errcode='22023'; end if;
  if jsonb_array_length(assignment_changes) not between 1 and 10000 then
    raise exception 'Choose between 1 and 10000 employees' using errcode='22023'; end if;
  if (select count(*)<>count(distinct value->>'employee_id') from jsonb_array_elements(assignment_changes)) then
    raise exception 'An employee may only appear once in a batch' using errcode='22023'; end if;
  -- Ask, lock and validate the entire batch before applying any change.
  for item in select value from jsonb_array_elements(assignment_changes) order by value->>'employee_id' loop
    if jsonb_typeof(item->'employee_id') is distinct from 'string'
      or jsonb_typeof(item->'assigned') is distinct from 'boolean'
      or jsonb_typeof(item->'expected_revision') is distinct from 'number'
      or (item->>'expected_revision') !~ '^[1-9][0-9]*$' then
      raise exception 'Valid employee assignment required' using errcode='22023'; end if;
    -- Somebody unknown gets the answer somebody out of reach gets.
    reason := app_private.authz_check(me, save_rule, null, (item->>'employee_id')::uuid, null);
    if reason is not null then
      raise exception 'Not allowed' using errcode='42501', hint='authz.' || reason, detail='employee.save'; end if;
    select * into employee from public.employee_profiles e
    where e.id=(item->>'employee_id')::uuid and e.workspace_id=target_workspace_id for update;
    if employee.archived_at is not null then raise exception 'An employee was archived. Reload the employee list.' using errcode='PT409'; end if;
    select exists(select 1 from public.employee_job_assignments a where a.employee_id=employee.id
      and a.job_id=target_job_id and a.ended_at is null) into actual;
    if actual<>(item->>'assigned')::boolean and employee.revision<>(item->>'expected_revision')::integer then
      raise exception 'Employee % changed. Reload employees and review your pending changes.',employee.employee_code using errcode='PT409';
    end if;
  end loop;
  for item in select value from jsonb_array_elements(assignment_changes) order by value->>'employee_id' loop
    select * into existing from public.employee_job_assignments a where a.employee_id=(item->>'employee_id')::uuid
      and a.job_id=target_job_id and a.ended_at is null;
    desired:=(item->>'assigned')::boolean;
    if (existing.id is not null)=desired then unchanged:=unchanged+1; continue; end if;
    if desired then
      insert into public.employee_job_assignments(workspace_id,employee_id,job_id,is_primary,created_by)
      values(target_workspace_id,(item->>'employee_id')::uuid,target_job_id,
        target.system_key is distinct from 'owner'
        and not exists(select 1 from public.employee_job_assignments a where a.employee_id=(item->>'employee_id')::uuid
          and a.ended_at is null and a.is_primary),actor_user_id);
    else
      update public.employee_job_assignments set ended_at=now() where id=existing.id;
      if existing.is_primary then
        select a.id into replacement from public.employee_job_assignments a join public.jobs j on j.id=a.job_id
        where a.employee_id=existing.employee_id and a.ended_at is null and j.system_key is distinct from 'owner'
        order by (j.archived_at is not null),lower(j.name),j.id limit 1;
        if replacement is not null then update public.employee_job_assignments set is_primary=true where id=replacement; end if;
      end if;
    end if;
    update public.employee_profiles set revision=revision+1,updated_at=now()
    where id=(item->>'employee_id')::uuid and workspace_id=target_workspace_id;
    insert into public.employee_events(workspace_id,employee_id,actor_user_id,action,summary)
    values(target_workspace_id,(item->>'employee_id')::uuid,actor_user_id,
      case when desired then 'job.assigned' else 'job.unassigned' end,
      case when desired then 'Assigned to ' else 'Removed from ' end||target.name);
    changed:=changed+1;
  end loop;
  return jsonb_build_object('changed_count',changed,'unchanged_count',unchanged);
end; $function$
;


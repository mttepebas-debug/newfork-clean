-- BL-051: capture before changing grants. Private recovery data; no client access.
create table app_private.bl051_role_grant_snapshot as
select r.id role_id, r.workspace_id, r.system_key, r.access_class, r.updated_at,
  coalesce(array_agg(g.permission_key order by g.permission_key) filter(where g.permission_key is not null), '{}'::text[]) permission_keys,
  clock_timestamp() captured_at
from public.workspace_roles r left join public.workspace_role_permissions g on g.role_id=r.id group by r.id;
alter table app_private.bl051_role_grant_snapshot enable row level security;
revoke all on app_private.bl051_role_grant_snapshot from public, anon, authenticated, service_role;

insert into public.permissions(key,label,category,description,custom_grantable,sort_order) values
('availability.read', 'Availability Read', 'Roles', 'Independently controlled availability read access.', true, 600),
('availability.manage', 'Availability Manage', 'Roles', 'Independently controlled availability manage access.', true, 601),
('schedule.templates.read', 'Schedule Templates Read', 'Roles', 'Independently controlled schedule templates read access.', true, 602),
('employee_access.read', 'Employee Access Read', 'Roles', 'Independently controlled employee access read access.', true, 603),
('employees.private.read', 'Employees Private Read', 'Roles', 'Independently controlled employees private read access.', true, 604),
('employees.private.manage', 'Employees Private Manage', 'Roles', 'Independently controlled employees private manage access.', true, 605),
('employee_documents.read', 'Employee Documents Read', 'Roles', 'Independently controlled employee documents read access.', true, 606),
('important_dates.read', 'Important Dates Read', 'Roles', 'Independently controlled important dates read access.', true, 607),
('important_dates.manage', 'Important Dates Manage', 'Roles', 'Independently controlled important dates manage access.', true, 608),
('settings.general.read', 'Settings General Read', 'Roles', 'Independently controlled settings general read access.', true, 609),
('settings.general.manage', 'Settings General Manage', 'Roles', 'Independently controlled settings general manage access.', true, 610),
('settings.locations.read', 'Settings Locations Read', 'Roles', 'Independently controlled settings locations read access.', true, 611),
('settings.locations.manage', 'Settings Locations Manage', 'Roles', 'Independently controlled settings locations manage access.', true, 612),
('settings.jobs.read', 'Settings Jobs Read', 'Roles', 'Independently controlled settings jobs read access.', true, 613),
('settings.jobs.manage', 'Settings Jobs Manage', 'Roles', 'Independently controlled settings jobs manage access.', true, 614),
('settings.shift_catalog.read', 'Settings Shift Catalog Read', 'Roles', 'Independently controlled settings shift catalog read access.', true, 615),
('settings.shift_catalog.manage', 'Settings Shift Catalog Manage', 'Roles', 'Independently controlled settings shift catalog manage access.', true, 616),
('settings.schedule_rules.read', 'Settings Schedule Rules Read', 'Roles', 'Independently controlled settings schedule rules read access.', true, 617),
('settings.schedule_rules.manage', 'Settings Schedule Rules Manage', 'Roles', 'Independently controlled settings schedule rules manage access.', true, 618);
update public.permissions set custom_grantable=true where key in ('notifications.settings.read','notifications.settings.write');

create table app_private.role_permission_dependencies(permission_key text not null references public.permissions(key), required_key text not null references public.permissions(key), primary key(permission_key,required_key));
alter table app_private.role_permission_dependencies enable row level security;
revoke all on app_private.role_permission_dependencies from public,anon,authenticated,service_role;
insert into app_private.role_permission_dependencies values
('schedule.manage','schedule.read'),
('schedule.publish','schedule.manage'),
('schedule.availability.override','schedule.manage'),
('schedule.lineup.read','schedule.read'),
('schedule.lineup.manage','schedule.lineup.read'),
('schedule.lineup.share','schedule.lineup.read'),
('schedule.templates.read','schedule.read'),
('schedule.templates.manage','schedule.templates.read'),
('schedule.templates.manage','schedule.manage'),
('schedule.export','schedule.read'),
('schedule.time_off_requests.read','schedule.read'),
('schedule.time_off_requests.manage','schedule.time_off_requests.read'),
('schedule.shift_change_requests.read','schedule.read'),
('schedule.shift_change_requests.manage','schedule.shift_change_requests.read'),
('availability.read','employees.read'),
('availability.manage','availability.read'),
('employees.manage','employees.read'),
('employees.archive','employees.read'),
('employee_onboarding.review','employees.read'),
('employee_access.read','employees.read'),
('employee_access.manage','employee_access.read'),
('employee_access.manage','roles.read'),
('employees.private.read','employees.read'),
('employees.private.manage','employees.private.read'),
('employee_documents.read','employees.read'),
('employee_documents.review','employee_documents.read'),
('announcements.manage','announcements.read'),
('important_dates.manage','important_dates.read'),
('documents.manage','documents.read'),
('signature_templates.manage','signature_templates.read'),
('roles.manage','roles.read'),
('notifications.settings.write','notifications.settings.read'),
('settings.general.manage','settings.general.read'),
('settings.locations.manage','settings.locations.read'),
('settings.jobs.manage','settings.jobs.read'),
('settings.shift_catalog.manage','settings.shift_catalog.read'),
('settings.schedule_rules.manage','settings.schedule_rules.read'),
('time.capture.own','time.read.own'),
('time.correction.request.own','time.read.own');

create or replace function public.enforce_role_permission_dependencies() returns trigger language plpgsql security definer set search_path='' as $$
declare rid uuid := coalesce(new.role_id,old.role_id);
begin
 if exists(select 1 from public.workspace_role_permissions g join app_private.role_permission_dependencies d on d.permission_key=g.permission_key where g.role_id=rid and not exists(select 1 from public.workspace_role_permissions r where r.role_id=rid and r.permission_key=d.required_key)) then
  raise exception 'permission set requires dependent read access' using errcode='23514';
 end if;
 return null;
end; $$;

-- Keep custom grants independent. New read grants below only replace access the old
-- write grant already provided, never a new management action or built-in defaults.
insert into public.workspace_role_permissions(workspace_id,role_id,permission_key)
select distinct r.workspace_id,r.id,m.new_key from public.workspace_roles r
join public.workspace_role_permissions g on g.role_id=r.id
join (values ('schedule.templates.manage','schedule.templates.read'), ('employee_access.manage','employee_access.read'), ('employee_documents.review','employee_documents.read')) m(old_key,new_key) on g.permission_key=m.old_key
where r.system_key is null on conflict do nothing;

create function app_private.role_default_permissions(role_class public.workspace_role) returns text[] language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(key order by key),'{}'::text[]) from public.permissions where
 role_class='owner' or (role_class='admin' and key<>'roles.manage')
 or (role_class='manager' and key in (
 'workspace.read','schedule.read','schedule.manage','schedule.availability.override','schedule.publish','schedule.templates.read','schedule.templates.manage','schedule.export',
 'schedule.lineup.read','schedule.lineup.manage','schedule.lineup.share','schedule.time_off_requests.read','schedule.time_off_requests.manage','schedule.shift_change_requests.read','schedule.shift_change_requests.manage',
 'availability.read','availability.manage','employees.read','employees.manage','employees.archive','employee_onboarding.review','announcements.read','announcements.manage','important_dates.read','important_dates.manage',
 'notifications.read','notifications.read_own','notifications.preferences.write_own',
 'time.capture.own','time.read.own','time.correction.request.own','time.read.location','time.amend.location','time.correction.review.location','time.review.approve.location',
 'time.export.preview.location','time.export.create.location','time.export.read.location','time.export.audit.read','kiosk.device.enroll.location','kiosk.device.read.location','kiosk.device.revoke.location','kiosk.pin.reset.location','kiosk.audit.read.location'))
 or (role_class='employee' and key in ('workspace.read','schedule.read','announcements.read','notifications.read','notifications.read_own','notifications.preferences.write_own','time.capture.own','time.read.own','time.correction.request.own'));
$$;
revoke all on function app_private.role_default_permissions(public.workspace_role) from public,anon,authenticated,service_role;

create or replace function public.grant_new_system_role_permissions() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.system_key is not null then
 insert into public.workspace_role_permissions(workspace_id,role_id,permission_key)
 select new.workspace_id,new.id,unnest(app_private.role_default_permissions(new.system_key)) on conflict do nothing;
 end if; return new;
end; $$;
create or replace function public.initialize_workspace_roles(target_workspace_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.workspace_roles(workspace_id,name,description,system_key,access_class,sort_order) values
 (target_workspace_id,'Owner','Full workspace authority and ownership protection.','owner','owner',0),
 (target_workspace_id,'Admin','Organization-wide administration with individually controlled permissions.','admin','admin',10),
 (target_workspace_id,'Manager','Operations for assigned employee locations.','manager','manager',20),
 (target_workspace_id,'Employee','Personal account and published schedule access.','employee','employee',30)
 on conflict do nothing;
end; $$;
-- Built-in transition only. Membership and invitation references remain unchanged.
delete from public.workspace_role_permissions g using public.workspace_roles r where r.id=g.role_id and r.system_key is not null;
insert into public.workspace_role_permissions(workspace_id,role_id,permission_key)
select r.workspace_id,r.id,unnest(app_private.role_default_permissions(r.system_key)) from public.workspace_roles r where r.system_key is not null;
update public.workspace_roles set updated_at=clock_timestamp() where system_key is not null;

create function app_private.can_edit_role(actor uuid,w uuid,rid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.workspace_memberships m join public.workspace_roles ar on ar.id=m.role_id
 left join public.workspace_roles target on target.id=rid and target.workspace_id=w
 where m.user_id=actor and m.workspace_id=w and m.status='active' and m.role_id is distinct from rid
 and public.service_actor_has_permission(actor,w,'roles.manage')
 and (rid is null or (target.id is not null and target.access_class<>'owner'))
 and (ar.access_class='owner' or (ar.access_class='admin' and (rid is null or target.access_class in ('manager','employee')))));
$$;
revoke all on function app_private.can_edit_role(uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- Replace the old unversioned service entry point; the service is the only writer.
drop function public.save_workspace_role_service(uuid,uuid,uuid,text,text,public.workspace_role,text[]);
create function public.save_workspace_role_service(actor_user_id uuid,target_workspace_id uuid,target_role_id uuid,role_name text,role_description text,role_access_class public.workspace_role,permission_keys text[],expected_updated_at timestamptz default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare target public.workspace_roles; saved uuid; normalized text[]; actor_class public.workspace_role;
begin
 -- Serialize role editors, including concurrent actor-grant changes.
 perform pg_advisory_xact_lock(hashtextextended('roles:'||target_workspace_id::text,0));
 if not app_private.can_edit_role(actor_user_id,target_workspace_id,target_role_id) then raise exception 'role management access denied' using errcode='42501'; end if;
 select role into actor_class from public.workspace_memberships where user_id=actor_user_id and workspace_id=target_workspace_id and status='active';
 if target_role_id is not null then
  select * into target from public.workspace_roles where id=target_role_id and workspace_id=target_workspace_id for update;
  if expected_updated_at is null or expected_updated_at<>target.updated_at then raise exception 'Role changed since you opened it. Reload before saving.' using errcode='PT409'; end if;
  if role_access_class<>target.access_class then raise exception 'Existing role experience cannot change' using errcode='22023'; end if;
 elsif role_access_class not in ('manager','employee') then raise exception 'Custom roles require a manager or employee experience' using errcode='42501'; end if;
 if role_name is null or char_length(btrim(role_name)) not between 1 and 64 or char_length(coalesce(role_description,''))>240 then raise exception 'Valid role details required' using errcode='22023'; end if;
 select coalesce(array_agg(distinct key order by key),'{}'::text[]) into normalized from unnest(coalesce(permission_keys,'{}'::text[])) key;
 if not 'workspace.read'=any(normalized) then raise exception 'Basic account access required' using errcode='22023'; end if;
 if exists(select 1 from unnest(normalized) k left join public.permissions p on p.key=k where p.key is null) then raise exception 'Unknown permission' using errcode='22023'; end if;
 if role_access_class<>'admin' and exists(select 1 from public.permissions p where p.key=any(normalized) and not p.custom_grantable and not exists(select 1 from public.workspace_role_permissions old_grant where old_grant.role_id=target_role_id and old_grant.permission_key=p.key)) then raise exception 'Permission is not eligible for a lower role' using errcode='42501'; end if;
 if role_access_class<>'admin' and normalized && array['roles.manage','workspace.manage'] then raise exception 'Protected management access denied' using errcode='42501'; end if;
 if role_access_class='employee' and exists(select 1 from unnest(normalized) k where k not in ('workspace.read','schedule.read','announcements.read','notifications.read','notifications.read_own','notifications.preferences.write_own','time.capture.own','time.read.own','time.correction.request.own')) then raise exception 'Employee roles are limited to personal access' using errcode='42501'; end if;
 -- Admin delegation cannot manufacture permissions it does not itself hold.
 if actor_class='admin' and exists(select 1 from unnest(normalized) k where not public.service_actor_has_permission(actor_user_id,target_workspace_id,k)) then raise exception 'Cannot grant access beyond your own permissions' using errcode='42501'; end if;
 if exists(select 1 from app_private.role_permission_dependencies d where d.permission_key=any(normalized) and not d.required_key=any(normalized)) then raise exception 'Permission set requires dependent read access' using errcode='22023'; end if;
 if target_role_id is null then
  insert into public.workspace_roles(workspace_id,name,description,access_class,sort_order,created_by) values(target_workspace_id,btrim(role_name),btrim(coalesce(role_description,'')),role_access_class,100,actor_user_id) returning id into saved;
 else
  saved:=target_role_id;
  update public.workspace_roles set name=case when system_key is null then btrim(role_name) else name end,description=case when system_key is null then btrim(coalesce(role_description,'')) else description end,updated_at=clock_timestamp() where id=saved;
 end if;
 delete from public.workspace_role_permissions where role_id=saved;
 insert into public.workspace_role_permissions(workspace_id,role_id,permission_key) select target_workspace_id,saved,unnest(normalized);
 insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata) values(target_workspace_id,actor_user_id,case when target_role_id is null then 'role.created' else 'role.updated' end,'workspace_role',saved::text,jsonb_build_object('permissions',normalized));
 return saved;
end; $$;
revoke all on function public.save_workspace_role_service(uuid,uuid,uuid,text,text,public.workspace_role,text[],timestamptz) from public,anon,authenticated;
grant execute on function public.save_workspace_role_service(uuid,uuid,uuid,text,text,public.workspace_role,text[],timestamptz) to service_role;
-- Retire the old path so it cannot bypass controlled built-in editing/conflicts.
revoke all on function public.save_workspace_role(uuid,uuid,text,text,public.workspace_role,text[]) from public,anon,authenticated,service_role;

create or replace function public.delete_workspace_role_service(actor_user_id uuid,target_workspace_id uuid,target_role_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare target public.workspace_roles;
begin
 perform pg_advisory_xact_lock(hashtextextended('roles:'||target_workspace_id::text,0));
 if not app_private.can_edit_role(actor_user_id,target_workspace_id,target_role_id) then raise exception 'role management access denied' using errcode='42501'; end if;
 select * into target from public.workspace_roles where id=target_role_id and workspace_id=target_workspace_id for update;
 if target.system_key is not null then raise exception 'Built-in roles cannot be deleted' using errcode='42501'; end if;
 if exists(select 1 from public.workspace_memberships where role_id=target_role_id) or exists(select 1 from public.employee_invitations where role_id=target_role_id) or exists(select 1 from public.employee_access_snapshots where role_id=target_role_id) then raise exception 'Role has member or invitation references. Resolve these dependencies before deleting.' using errcode='PT409'; end if;
 delete from public.workspace_roles where id=target_role_id;
 insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata) values(target_workspace_id,actor_user_id,'role.deleted','workspace_role',target_role_id::text,jsonb_build_object('name',target.name));
end; $$;

create function public.read_role_workspace(target_workspace_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.workspace_has_permission(target_workspace_id,'roles.read') then raise exception 'role read access denied' using errcode='42501'; end if;
 return jsonb_build_object('permissions',(select jsonb_agg(p order by sort_order) from public.permissions p), 'roles',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object(
 'permission_keys',coalesce((select jsonb_agg(g.permission_key order by g.permission_key) from public.workspace_role_permissions g where g.role_id=r.id),'[]'::jsonb),
 'member_count',(select count(*) from public.workspace_memberships m where m.role_id=r.id and m.status='active'),
 'pending_invite_count',(select count(*) from public.employee_invitations i where i.role_id=r.id and i.status='pending' and i.expires_at>now()),
 'blocking_member_count',(select count(*) from public.workspace_memberships m where m.role_id=r.id)+(select count(*) from public.employee_access_snapshots snap where snap.role_id=r.id),
 'blocking_invite_count',(select count(*) from public.employee_invitations i where i.role_id=r.id),
 'editable',app_private.can_edit_role(auth.uid(),target_workspace_id,r.id),
 'deletable',r.system_key is null and app_private.can_edit_role(auth.uid(),target_workspace_id,r.id) and not exists(select 1 from public.workspace_memberships m where m.role_id=r.id) and not exists(select 1 from public.employee_invitations i where i.role_id=r.id) and not exists(select 1 from public.employee_access_snapshots snap where snap.role_id=r.id)
 ) order by r.sort_order,r.name) from public.workspace_roles r where r.workspace_id=target_workspace_id),'[]'::jsonb));
end; $$;
revoke all on function public.read_role_workspace(uuid) from public,anon;
grant execute on function public.read_role_workspace(uuid) to authenticated;

-- Independent authorization at the data boundary.
CREATE OR REPLACE FUNCTION public.update_job_details_and_assignments_service(actor_user_id uuid, target_workspace_id uuid, target_job_id uuid, job_input jsonb DEFAULT NULL::jsonb, expected_job jsonb DEFAULT NULL::jsonb, assignment_changes jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target public.jobs;
  department public.departments;
  desired jsonb;
  actual jsonb;
  selected_department_id uuid;
  result jsonb := '{"changed_count":0,"unchanged_count":0}'::jsonb;
begin
  if actor_user_id is null then
    raise exception 'Valid actor required' using errcode = '42501';
  end if;
  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  if job_input is not null then
    if not public.workspace_has_permission(target_workspace_id, 'settings.jobs.manage') then
      raise exception 'Workspace management access required' using errcode = '42501';
    end if;
  elsif not public.workspace_has_permission(target_workspace_id, 'employees.manage')
    or not public.workspace_has_permission(target_workspace_id, 'employees.read') then
    raise exception 'Employee management access required' using errcode = '42501';
  end if;
  if jsonb_typeof(assignment_changes) is distinct from 'array' then
    raise exception 'Valid assignment changes required' using errcode = '22023';
  end if;
  if jsonb_array_length(assignment_changes) > 10000
    or (job_input is null and jsonb_array_length(assignment_changes) = 0) then
    raise exception 'Choose at least one change and at most 10000 employees' using errcode = '22023';
  end if;
  if (job_input is null) <> (expected_job is null) then
    raise exception 'Job details require their original values' using errcode = '22023';
  end if;

  select * into target from public.jobs
    where id = target_job_id and workspace_id = target_workspace_id for update;
  if target.id is null or target.deleted_at is not null then
    raise exception 'This job is no longer available' using errcode = 'P0002';
  end if;

  if job_input is not null then
    if jsonb_typeof(job_input) is distinct from 'object'
      or jsonb_typeof(expected_job) is distinct from 'object'
      or jsonb_typeof(job_input->'name') is distinct from 'string'
      or char_length(btrim(job_input->>'name')) not between 1 and 100
      or jsonb_typeof(job_input->'color') is distinct from 'string'
      or (job_input->>'color') !~ '^#[0-9a-fA-F]{6}$'
      or not (job_input ? 'department_id')
      or jsonb_typeof(job_input->'department_id') not in ('string', 'null') then
      raise exception 'Valid job name, color and department required' using errcode = '22023';
    end if;
    selected_department_id := (job_input->>'department_id')::uuid;
    desired := jsonb_build_object(
      'name', btrim(job_input->>'name'), 'color', job_input->>'color', 'department_id', selected_department_id
    );
    actual := jsonb_build_object(
      'name', target.name, 'color', target.color, 'department_id', target.department_id
    );
    -- A successful request can be retried with the same original values.
    if desired is distinct from actual then
      if expected_job is distinct from actual then
        raise exception 'Job details changed. Reload the latest job and review your draft.' using errcode = 'PT409';
      end if;
      if selected_department_id is not null and selected_department_id is distinct from target.department_id then
        select * into department from public.departments d
          where d.id = selected_department_id and d.workspace_id = target_workspace_id for share;
        if department.id is null or department.archived_at is not null or department.deleted_at is not null then
          raise exception 'Choose an active department in this workspace' using errcode = '22023';
        end if;
      end if;
      begin
        update public.jobs set
          name = desired->>'name', color = desired->>'color',
          department_id = selected_department_id,
          updated_at = now()
          where id = target_job_id and workspace_id = target_workspace_id
          returning * into target;
      exception when unique_violation then
        raise exception 'This job name already exists. Choose a unique name.' using errcode = '23505';
      end;
    end if;
  end if;

  if jsonb_array_length(assignment_changes) > 0 then
    result := public.update_job_assignments_service(
      actor_user_id, target_workspace_id, target_job_id, assignment_changes
    );
  end if;
  return result || jsonb_build_object('job', to_jsonb(target));
end;
$function$;

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
  next_order integer;
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
  select coalesce(max(sort_order), -1) + 1 into next_order
    from public.jobs where workspace_id = target_workspace_id;

  begin
    insert into public.jobs(workspace_id, department_id, name, color, sort_order)
    values(
      target_workspace_id,
      selected_department_id,
      btrim(job_input->>'name'),
      job_input->>'color',
      next_order
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
$function$;

CREATE OR REPLACE FUNCTION public.create_department_jobs_service(actor_user_id uuid, target_workspace_id uuid, target_department_id uuid, jobs_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare dep public.departments; item jsonb; job public.jobs; result jsonb:='[]'; next_order integer;
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
  select coalesce(max(sort_order),-1)+1 into next_order from public.jobs where workspace_id=target_workspace_id;
  for item in select value from jsonb_array_elements(jobs_input) loop
    if jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'name') is distinct from 'string'
      or jsonb_typeof(item->'color') is distinct from 'string' then
      raise exception 'Valid job name and color required' using errcode='22023'; end if;
    insert into public.jobs(workspace_id,department_id,name,color,sort_order)
      values(target_workspace_id,dep.id,btrim(item->>'name'),item->>'color',next_order) returning * into job;
    result:=result||jsonb_build_array(to_jsonb(job)); next_order:=next_order+1;
  end loop;
  return result;
exception when unique_violation then
  raise exception 'A job with that name already exists. Names must be unique in this organization.' using errcode='23505';
end; $function$;

CREATE OR REPLACE FUNCTION public.update_department_with_jobs_service(actor_user_id uuid, target_workspace_id uuid, target_department_id uuid, department_input jsonb, jobs_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare dep public.departments; added jsonb:='[]';
begin
  if actor_user_id is null then raise exception 'valid actor required' using errcode='42501'; end if;
  perform set_config('request.jwt.claim.sub',actor_user_id::text,true);
  if not public.workspace_has_permission(target_workspace_id, 'settings.jobs.manage') then raise exception 'workspace management access required' using errcode='42501'; end if;
  if jsonb_typeof(department_input->'name') is distinct from 'string' or jsonb_typeof(department_input->'color') is distinct from 'string'
    or jsonb_typeof(jobs_input) is distinct from 'array' then raise exception 'Valid department and jobs required' using errcode='22023'; end if;
  perform 1 from public.workspaces where id=target_workspace_id for update;
  update public.departments set name=btrim(department_input->>'name'),color=department_input->>'color',updated_at=now()
    where id=target_department_id and workspace_id=target_workspace_id returning * into dep;
  if not found then raise exception 'Department not found' using errcode='P0002'; end if;
  if jsonb_array_length(jobs_input)>0 then
    added:=public.create_department_jobs_service(actor_user_id,target_workspace_id,target_department_id,jobs_input);
  end if;
  return jsonb_build_object('department',to_jsonb(dep),'jobs',added);
exception when unique_violation then raise exception 'A department or job with that name already exists.' using errcode='23505';
end; $function$;

CREATE OR REPLACE FUNCTION public.delete_job_with_assignments_service(actor_user_id uuid, target_workspace_id uuid, target_job_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target public.jobs; e public.employee_profiles; a public.employee_job_assignments; replacement uuid; removed integer:=0;
begin
  if actor_user_id is null then raise exception 'valid actor required' using errcode='42501'; end if;
  perform set_config('request.jwt.claim.sub',actor_user_id::text,true);
  if not public.workspace_has_permission(target_workspace_id, 'settings.jobs.manage') or not public.workspace_has_permission(target_workspace_id,'employees.manage')
    or not public.workspace_has_permission(target_workspace_id,'employees.read') then raise exception 'Job and employee management access required' using errcode='42501'; end if;
  select * into target from public.jobs where id=target_job_id and workspace_id=target_workspace_id for update;
  if not found then raise exception 'Job not found' using errcode='P0002'; end if;
  if target.deleted_at is not null then return jsonb_build_object('removed_count',0); end if;
  for e in select employee.* from public.employee_profiles employee
    where employee.workspace_id=target_workspace_id and exists(select 1 from public.employee_job_assignments assignment
      where assignment.employee_id=employee.id and assignment.job_id=target_job_id and assignment.ended_at is null)
    order by employee.id for update loop
    if not public.can_access_employee(target_workspace_id,e.id) or not public.can_manage_employee_record(target_workspace_id,e.id) then
      raise exception 'This job is assigned to an employee you cannot manage. Ask an authorized administrator to delete it.' using errcode='42501'; end if;
  end loop;
  for a in select * from public.employee_job_assignments where workspace_id=target_workspace_id and job_id=target_job_id and ended_at is null order by employee_id loop
    update public.employee_job_assignments set ended_at=now() where id=a.id;
    if a.is_primary then
      select other.id into replacement from public.employee_job_assignments other join public.jobs j on j.id=other.job_id
        where other.employee_id=a.employee_id and other.ended_at is null
        order by (j.archived_at is not null),j.sort_order,lower(j.name),j.id limit 1;
      if replacement is not null then update public.employee_job_assignments set is_primary=true where id=replacement; end if;
    end if;
    update public.employee_profiles set revision=revision+1,updated_at=now() where id=a.employee_id;
    insert into public.employee_events(workspace_id,employee_id,actor_user_id,action,summary)
      values(target_workspace_id,a.employee_id,actor_user_id,'job.unassigned','Removed from deleted job '||target.name);
    removed:=removed+1;
  end loop;
  update public.jobs set deleted_at=now(),archived_at=coalesce(archived_at,now()),updated_at=now() where id=target_job_id;
  return jsonb_build_object('removed_count',removed);
end; $function$;

CREATE OR REPLACE FUNCTION public.create_department_with_jobs_service(actor_user_id uuid, target_workspace_id uuid, department_input jsonb, jobs_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare dep public.departments; item jsonb; result_jobs jsonb; next_order integer;
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
  insert into public.departments(workspace_id,name,color,sort_order)
  values(target_workspace_id,btrim(department_input->>'name'),department_input->>'color',
    (select coalesce(max(sort_order),-1)+1 from public.departments where workspace_id=target_workspace_id))
  returning * into dep;
  select coalesce(max(sort_order),-1)+1 into next_order from public.jobs where workspace_id=target_workspace_id;
  for item in select value from jsonb_array_elements(jobs_input) loop
    if jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'name') is distinct from 'string'
      or jsonb_typeof(item->'color') is distinct from 'string' then
      raise exception 'Valid job name and color required' using errcode='22023';
    end if;
    insert into public.jobs(workspace_id,department_id,name,color,sort_order)
    values(target_workspace_id,dep.id,btrim(item->>'name'),item->>'color',next_order);
    next_order:=next_order+1;
  end loop;
  select coalesce(jsonb_agg(to_jsonb(j) order by sort_order,id),'[]') into result_jobs
  from public.jobs j where j.workspace_id=target_workspace_id and j.department_id=dep.id;
  return jsonb_build_object('department',to_jsonb(dep),'jobs',result_jobs);
exception when unique_violation then
  raise exception 'A department or job with that name already exists. Names must be unique in this organization.' using errcode='23505';
end; $function$;

CREATE OR REPLACE FUNCTION public.reorder_organization_entities(target_workspace_id uuid, entity_type text, ordered_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  expected_count integer;
  matched_count integer;
begin
  if not public.workspace_has_permission(target_workspace_id, 'settings.jobs.manage') then
    raise exception 'workspace management access required' using errcode = '42501';
  end if;
  if entity_type not in ('departments', 'jobs') then
    raise exception 'unsupported organization entity type' using errcode = '22023';
  end if;
  if cardinality(ordered_ids) <> (
    select count(distinct item_id) from unnest(ordered_ids) item_id
  ) then
    raise exception 'organization entity order contains duplicates' using errcode = '22023';
  end if;

  if entity_type = 'departments' then
    select count(*) into expected_count
    from public.departments
    where workspace_id = target_workspace_id and archived_at is null;
    select count(*) into matched_count
    from public.departments
    where workspace_id = target_workspace_id and archived_at is null and id = any(ordered_ids);

    if expected_count <> cardinality(ordered_ids) or matched_count <> expected_count then
      raise exception 'department order must include every active department' using errcode = '22023';
    end if;

    update public.departments department
    set sort_order = ordered.position - 1, updated_at = now()
    from unnest(ordered_ids) with ordinality ordered(id, position)
    where department.id = ordered.id
      and department.workspace_id = target_workspace_id;
  else
    select count(*) into expected_count
    from public.jobs
    where workspace_id = target_workspace_id and archived_at is null;
    select count(*) into matched_count
    from public.jobs
    where workspace_id = target_workspace_id and archived_at is null and id = any(ordered_ids);

    if expected_count <> cardinality(ordered_ids) or matched_count <> expected_count then
      raise exception 'job order must include every active job' using errcode = '22023';
    end if;

    update public.jobs job
    set sort_order = ordered.position - 1, updated_at = now()
    from unnest(ordered_ids) with ordinality ordered(id, position)
    where job.id = ordered.id
      and job.workspace_id = target_workspace_id;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reorder_shift_types(target_workspace_id uuid, ordered_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  expected_count integer;
  matched_count integer;
begin
  if not public.workspace_has_permission(target_workspace_id, 'settings.shift_catalog.manage') then
    raise exception 'workspace management access required' using errcode = '42501';
  end if;
  if cardinality(ordered_ids) <> (
    select count(distinct item_id) from unnest(ordered_ids) item_id
  ) then
    raise exception 'shift type order contains duplicates' using errcode = '22023';
  end if;

  select count(*) into expected_count
  from public.shift_types
  where workspace_id = target_workspace_id and archived_at is null;
  select count(*) into matched_count
  from public.shift_types
  where workspace_id = target_workspace_id and archived_at is null and id = any(ordered_ids);

  if expected_count <> cardinality(ordered_ids) or matched_count <> expected_count then
    raise exception 'shift type order must include every active shift type' using errcode = '22023';
  end if;

  update public.shift_types shift_type
  set sort_order = ordered.position - 1, updated_at = now()
  from unnest(ordered_ids) with ordinality ordered(id, position)
  where shift_type.id = ordered.id
    and shift_type.workspace_id = target_workspace_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reorder_shift_labels(target_workspace_id uuid, ordered_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  expected_count integer;
  matched_count integer;
begin
  if not public.workspace_has_permission(target_workspace_id, 'settings.shift_catalog.manage') then
    raise exception 'workspace management access required' using errcode = '42501';
  end if;
  if cardinality(ordered_ids) <> (
    select count(distinct item_id) from unnest(ordered_ids) item_id
  ) then
    raise exception 'shift label order contains duplicates' using errcode = '22023';
  end if;

  select count(*) into expected_count
  from public.shift_labels
  where workspace_id = target_workspace_id and archived_at is null;
  select count(*) into matched_count
  from public.shift_labels
  where workspace_id = target_workspace_id and archived_at is null and id = any(ordered_ids);

  if expected_count <> cardinality(ordered_ids) or matched_count <> expected_count then
    raise exception 'shift label order must include every active shift label' using errcode = '22023';
  end if;

  update public.shift_labels shift_label
  set sort_order = ordered.position - 1, updated_at = now()
  from unnest(ordered_ids) with ordinality ordered(id, position)
  where shift_label.id = ordered.id
    and shift_label.workspace_id = target_workspace_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_scheduling_settings_service(actor_user_id uuid, target_workspace_id uuid, settings jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare previous public.workspace_scheduling_settings; proposed public.workspace_scheduling_settings; saved public.workspace_scheduling_settings;
begin
 if not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'settings.schedule_rules.manage') then
  raise exception 'Scheduling settings access denied' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,921));
 select * into previous from public.workspace_scheduling_settings where workspace_id=target_workspace_id for update;
 if not found then raise exception 'Scheduling settings not found'; end if;
 -- Populate from the saved row: omitted optional fields never reset existing policy.
 select * into proposed from jsonb_populate_record(previous,settings);
 update public.workspace_scheduling_settings set
  week_start_day=proposed.week_start_day,schedule_deadline_day=proposed.schedule_deadline_day,
  conflict_policy=proposed.conflict_policy,availability_enforcement=proposed.availability_enforcement,
  time_format=proposed.time_format,availability_ownership=proposed.availability_ownership,
  availability_approval=proposed.availability_approval,availability_initial_review=proposed.availability_initial_review,
  availability_notice_days=proposed.availability_notice_days,minimum_travel_minutes=proposed.minimum_travel_minutes,
  updated_at=now()
 where workspace_id=target_workspace_id returning * into saved;
 -- Service-role requests have no auth.uid(); retain the authenticated API actor.
 if auth.uid() is null and (to_jsonb(previous)-'updated_at') is distinct from (to_jsonb(saved)-'updated_at') then
  insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata)
  values(target_workspace_id,actor_user_id,'scheduling.settings_updated','scheduling_settings',target_workspace_id::text,
   jsonb_build_object('before',to_jsonb(previous),'after',to_jsonb(saved)));
 end if;
 return to_jsonb(saved);
end; $function$;

CREATE OR REPLACE FUNCTION public.get_owner_setup_checklist_progress_service(actor_user_id uuid, target_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  progress public.owner_setup_checklist_progress%rowtype;
begin
  if actor_user_id is null then
    raise exception 'workspace management required' using errcode = '42501';
  end if;
  if not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'settings.general.read') then
    raise exception 'workspace management required' using errcode = '42501';
  end if;

  select * into progress
  from public.owner_setup_checklist_progress
  where workspace_id = target_workspace_id
    and user_id = actor_user_id;

  return jsonb_build_object(
    'workspace_id', target_workspace_id,
    'user_id', actor_user_id,
    'completed_item_ids', coalesce(progress.completed_item_ids, '{}'::text[]),
    'closed_at', progress.closed_at
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.mark_owner_setup_checklist_item_service(actor_user_id uuid, target_workspace_id uuid, target_item_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  normalized_item_id text := lower(btrim(coalesce(target_item_id, '')));
begin
  if actor_user_id is null then
    raise exception 'workspace management required' using errcode = '42501';
  end if;
  if not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'settings.general.manage') then
    raise exception 'workspace management required' using errcode = '42501';
  end if;
  if normalized_item_id <> all(app_private.owner_setup_checklist_item_ids()) then
    raise exception 'valid setup checklist item required' using errcode = '22023';
  end if;

  insert into public.owner_setup_checklist_progress (
    workspace_id,
    user_id,
    completed_item_ids
  )
  values (
    target_workspace_id,
    actor_user_id,
    array[normalized_item_id]
  )
  on conflict (workspace_id, user_id)
  do update set
    completed_item_ids = (
      select array_agg(distinct item order by item)
      from unnest(
        public.owner_setup_checklist_progress.completed_item_ids ||
        excluded.completed_item_ids
      ) item
    ),
    updated_at = now();

  return public.get_owner_setup_checklist_progress_service(
    actor_user_id,
    target_workspace_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_owner_setup_checklist_closed_service(actor_user_id uuid, target_workspace_id uuid, should_close boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if actor_user_id is null then
    raise exception 'workspace management required' using errcode = '42501';
  end if;
  if not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'settings.general.manage') then
    raise exception 'workspace management required' using errcode = '42501';
  end if;

  insert into public.owner_setup_checklist_progress (
    workspace_id,
    user_id,
    completed_item_ids,
    closed_at
  )
  values (
    target_workspace_id,
    actor_user_id,
    '{}'::text[],
    case when should_close then now() else null end
  )
  on conflict (workspace_id, user_id)
  do update set
    closed_at = case when should_close then now() else null end,
    updated_at = now();

  return public.get_owner_setup_checklist_progress_service(
    actor_user_id,
    target_workspace_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_catalog_entity_service(actor_user_id uuid, target_workspace_id uuid, entity_kind text, target_entity_id uuid, department_jobs text DEFAULT 'keep'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare tbl text; target record; e public.employee_profiles; assignment public.employee_location_assignments;
  job record; replacement uuid; affected integer:=0;
begin
  if actor_user_id is null then raise exception 'Valid actor required' using errcode='42501'; end if;
  perform set_config('request.jwt.claim.sub',actor_user_id::text,true);
  if not public.workspace_has_permission(target_workspace_id, case entity_kind when 'locations' then 'settings.locations.manage' when 'departments' then 'settings.jobs.manage' else 'settings.shift_catalog.manage' end) then
    raise exception 'Workspace management access required' using errcode='42501'; end if;
  tbl:=case entity_kind when 'locations' then 'locations' when 'departments' then 'departments'
    when 'shift-types' then 'shift_types' when 'shift-labels' then 'shift_labels' end;
  if tbl is null or department_jobs not in ('keep','delete') or department_jobs is null then
    raise exception 'Valid catalog deletion required' using errcode='22023'; end if;
  -- Shares creation's catalog lock; relation triggers serialize stale writes too.
  perform 1 from public.workspaces where id=target_workspace_id for update;
  execute format('select id,name,deleted_at from public.%I where id=$1 and workspace_id=$2 for update',tbl)
    into target using target_entity_id,target_workspace_id;
  if target.id is null then raise exception 'Catalog item not found' using errcode='P0002'; end if;
  if target.deleted_at is not null then return jsonb_build_object('removed_count',0); end if;
  if entity_kind='departments' then
    for job in select id from public.jobs where workspace_id=target_workspace_id and department_id=target_entity_id
      and deleted_at is null order by id for update loop
      if department_jobs='delete' then
        perform public.delete_job_with_assignments_service(actor_user_id,target_workspace_id,job.id);
      else
        update public.jobs set department_id=null,updated_at=now() where id=job.id;
      end if;
      affected:=affected+1;
    end loop;
  elsif entity_kind='locations' then
    if not public.can_access_location(target_workspace_id,target_entity_id) then
      raise exception 'Location access required' using errcode='42501'; end if;
    for e in select employee.* from public.employee_profiles employee
      where employee.workspace_id=target_workspace_id and exists(select 1 from public.employee_location_assignments a
        where a.employee_id=employee.id and a.location_id=target_entity_id and a.ended_at is null)
      order by employee.id for update loop
      if not public.workspace_has_permission(target_workspace_id,'employees.manage')
        or not public.workspace_has_permission(target_workspace_id,'employees.read')
        or not public.can_access_employee(target_workspace_id,e.id)
        or not public.can_manage_employee_record(target_workspace_id,e.id) then
        raise exception 'This location has employees you cannot manage. Ask an authorized administrator to delete it.' using errcode='42501'; end if;
    end loop;
    for assignment in select * from public.employee_location_assignments
      where workspace_id=target_workspace_id and location_id=target_entity_id and ended_at is null order by employee_id loop
      update public.employee_location_assignments set ended_at=now() where id=assignment.id;
      if assignment.is_primary then
        select a.id into replacement from public.employee_location_assignments a join public.locations l on l.id=a.location_id
          where a.employee_id=assignment.employee_id and a.ended_at is null
          order by (l.archived_at is not null),l.sort_order,lower(l.name),l.id limit 1;
        if replacement is not null then update public.employee_location_assignments set is_primary=true where id=replacement; end if;
      end if;
      update public.employee_profiles set revision=revision+1,updated_at=now() where id=assignment.employee_id;
      insert into public.employee_events(workspace_id,employee_id,actor_user_id,action,summary)
        values(target_workspace_id,assignment.employee_id,actor_user_id,'location.unassigned','Removed from deleted location '||target.name);
      affected:=affected+1;
    end loop;
  end if;
  execute format('update public.%I set deleted_at=now(),archived_at=coalesce(archived_at,now()),updated_at=now() where id=$1',tbl)
    using target_entity_id;
  return jsonb_build_object('removed_count',affected);
end; $function$;
CREATE OR REPLACE FUNCTION public.get_employee_detail(target_workspace_id uuid, target_employee_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case when employee.id is null then null else jsonb_build_object(
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
    'private_contact', case
      when private_profile.employee_id is null or not public.workspace_has_permission(target_workspace_id, 'employees.private.read') then null
      else jsonb_build_object(
        'legal_first_name', private_profile.legal_first_name,
        'legal_last_name', private_profile.legal_last_name,
        'preferred_name', private_profile.preferred_name,
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
        'emergency_contact_email', private_profile.emergency_contact_email,
        'share_phone_with_teammates', private_profile.share_phone_with_teammates,
        'share_email_with_teammates', private_profile.share_email_with_teammates
      )
    end,
    'locations', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', assignment.location_id,
          'name', assigned_location.name,
          'primary', assignment.is_primary,
          'archived', assigned_location.archived_at is not null
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
        order by assignment.is_primary desc, assigned_job.name
      )
      from public.employee_job_assignments assignment
      join public.jobs assigned_job on assigned_job.id = assignment.job_id
      where assignment.employee_id = employee.id and assignment.ended_at is null
    ), '[]'::jsonb),
    'invitation', case
      when invitation.id is null or not public.workspace_has_permission(target_workspace_id, 'employee_access.read') then null
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
        'delivery_error', invitation.delivery_error
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
    ), '[]'::jsonb)
  ) end
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
  where employee.id = target_employee_id
    and employee.workspace_id = target_workspace_id
    and public.workspace_has_permission(target_workspace_id, 'employees.read')
    and public.can_access_employee(target_workspace_id, employee.id);
$function$;
CREATE OR REPLACE FUNCTION public.get_employee_document_path_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid, target_requirement_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  document_path text;
begin
  if not app_private.workspace_allows_interactive_access(target_workspace_id) then
    raise exception 'employee document unavailable' using errcode = 'P0002';
  end if;
  if not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'employee_documents.read') then
    raise exception 'employee document read required' using errcode = '42501';
  end if;
  if not public.service_actor_can_access_employee(actor_user_id, target_workspace_id, target_employee_id) then
    raise exception 'employee document unavailable' using errcode = 'P0002';
  end if;

  select document.object_path into document_path
  from public.employee_documents document
  join public.employee_onboarding_requirements requirement
    on requirement.id = document.requirement_id
  where document.workspace_id = target_workspace_id
    and document.employee_id = target_employee_id
    and document.requirement_id = target_requirement_id
    and requirement.kind = 'document'::public.employee_onboarding_requirement_kind
    and document.review_status <> 'superseded'::public.employee_document_review_status
  order by document.version_number desc
  limit 1;

  if document_path is null then
    raise exception 'employee document unavailable' using errcode = 'P0002';
  end if;

  return document_path;
end;
$function$;
CREATE OR REPLACE FUNCTION public.get_employee_onboarding_review_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target_case public.employee_onboarding_cases%rowtype; requirement_rows jsonb; total_count integer; completed_count integer;
begin
  if not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'employees.read') then
    raise exception 'employee onboarding review required' using errcode = '42501';
  end if;
  if not public.service_actor_can_access_employee(actor_user_id, target_workspace_id, target_employee_id) then
    raise exception 'onboarding case unavailable' using errcode = 'P0002';
  end if;
  select * into target_case from public.employee_onboarding_cases
  where workspace_id = target_workspace_id and employee_id = target_employee_id;
  if target_case.id is null then raise exception 'onboarding case unavailable' using errcode = 'P0002'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', requirement.id, 'kind', requirement.kind, 'title', requirement.title,
    'description', requirement.description, 'status', requirement.status,
    'required', requirement.required, 'blocks_activation', requirement.blocks_activation,
    'requires_review', requirement.requires_review, 'sort_order', requirement.sort_order,
    'source_id', requirement.source_id,
    'accepted_formats', coalesce(requirement.source_snapshot->'accepted_formats', '[]'::jsonb),
    'content_text', null, 'content_digest', requirement.source_snapshot->>'content_digest',
    'intent_statement', null, 'rejection_reason', requirement.rejection_reason
  ) order by requirement.sort_order), '[]'::jsonb),
  count(*) filter (where requirement.required),
  count(*) filter (where requirement.required and requirement.status = 'completed')
  into requirement_rows, total_count, completed_count
  from public.employee_onboarding_requirements requirement
  where requirement.case_id = target_case.id and requirement.status <> 'superseded' and (requirement.kind <> 'document' or public.service_actor_has_permission(actor_user_id,target_workspace_id,'employee_documents.read'));
  return jsonb_build_object(
    'case_id', target_case.id, 'employee_id', target_case.employee_id,
    'case_status', target_case.status, 'revision', target_case.revision,
    'submitted_at', target_case.submitted_at,
    'progress_completed', completed_count, 'progress_total', total_count,
    'ssn_present', false,
    'requirements', requirement_rows
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.review_employee_onboarding_before_availability_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid, review_action text, target_requirement_id uuid, review_reason text, expected_revision integer, production_ready boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_case public.employee_onboarding_cases%rowtype;
  requirement public.employee_onboarding_requirements%rowtype;
  private_profile public.employee_private_profiles%rowtype;
  actor_system_key text;
  target_employee_user_id uuid;
begin
  if not (public.service_actor_has_permission(actor_user_id, target_workspace_id, 'employee_onboarding.review') or public.service_actor_has_permission(actor_user_id,target_workspace_id,'employee_documents.review') or public.service_actor_has_permission(actor_user_id,target_workspace_id,'employees.private.manage')) then
    raise exception 'employee onboarding review required' using errcode = '42501';
  end if;
  if not public.service_actor_can_access_employee(actor_user_id, target_workspace_id, target_employee_id) then
    raise exception 'onboarding case unavailable' using errcode = 'P0002';
  end if;
  select role.system_key into actor_system_key
  from public.workspace_memberships membership
  join public.workspace_roles role on role.id = membership.role_id
  where membership.workspace_id = target_workspace_id
    and membership.user_id = actor_user_id
    and membership.status = 'active'
  order by membership.created_at
  limit 1;

  select onboarding.* into target_case
  from public.employee_onboarding_cases onboarding
  where onboarding.workspace_id = target_workspace_id
    and onboarding.employee_id = target_employee_id
  for update of onboarding;
  if target_case.id is null or target_case.revision <> expected_revision then raise exception 'onboarding changed; refresh required' using errcode = '40001'; end if;
  select employee.user_id into target_employee_user_id
  from public.employee_profiles employee
  where employee.id = target_employee_id
    and employee.workspace_id = target_workspace_id;
  if review_action in ('accept_requirement', 'reject_requirement') then
    select * into requirement from public.employee_onboarding_requirements
    where id = target_requirement_id and case_id = target_case.id for update;
    if requirement.id is null or not requirement.requires_review then raise exception 'reviewable requirement unavailable' using errcode = 'P0002'; end if;
    if requirement.kind = 'document'::public.employee_onboarding_requirement_kind and not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'employee_documents.review') then
      raise exception 'employee document review required' using errcode = '42501';
    end if;
    if requirement.kind = 'profile'::public.employee_onboarding_requirement_kind and not public.service_actor_has_permission(actor_user_id,target_workspace_id,'employees.private.manage') then
      raise exception 'private information edit access required' using errcode = '42501';
    end if;
    if requirement.kind not in ('profile','document') and not public.service_actor_has_permission(actor_user_id,target_workspace_id,'employee_onboarding.review') then raise exception 'onboarding edit access required' using errcode='42501'; end if;
    if review_action = 'reject_requirement' and char_length(btrim(coalesce(review_reason, ''))) not between 1 and 500 then
      raise exception 'specific correction reason required' using errcode = '22023';
    end if;
    update public.employee_onboarding_requirements set
      status = case
        when review_action = 'accept_requirement' then 'completed'::public.employee_onboarding_requirement_status
        else 'rejected'::public.employee_onboarding_requirement_status
      end,
      rejection_reason = case when review_action = 'reject_requirement' then btrim(review_reason) else null end,
      reviewed_by = actor_user_id,
      reviewed_at = now(),
      completed_at = case when review_action = 'accept_requirement' then now() else null end,
      updated_at = now()
    where id = requirement.id;
    if requirement.kind = 'document'::public.employee_onboarding_requirement_kind then
      update public.employee_documents set
        review_status = case
          when review_action = 'accept_requirement' then 'accepted'::public.employee_document_review_status
          else 'rejected'::public.employee_document_review_status
        end,
        rejection_reason = case when review_action = 'reject_requirement' then btrim(review_reason) else null end,
        reviewed_by = actor_user_id, reviewed_at = now()
      where requirement_id = requirement.id and review_status = 'awaiting_review'::public.employee_document_review_status;
    end if;
    if requirement.kind = 'profile'::public.employee_onboarding_requirement_kind and review_action = 'accept_requirement' then
      select * into private_profile
      from public.employee_private_profiles
      where employee_id = target_employee_id;
      if private_profile.employee_id is null then
        raise exception 'private profile unavailable' using errcode = 'P0002';
      end if;
      update public.employee_profiles set
        first_name = private_profile.legal_first_name,
        last_name = private_profile.legal_last_name,
        revision = revision + 1,
        updated_at = now()
      where id = target_employee_id;
      insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
      values (target_workspace_id, target_employee_id, actor_user_id,
        'employee.legal_name_approved', 'Employee legal name change approved from onboarding');
    end if;
    if review_action = 'reject_requirement' then
      update public.employee_onboarding_cases set status = 'changes_requested'::public.employee_onboarding_case_status, revision = revision + 1,
        updated_at = now() where id = target_case.id returning revision into expected_revision;
    else
      update public.employee_onboarding_cases set revision = revision + 1, updated_at = now()
      where id = target_case.id returning revision into expected_revision;
      if target_case.status = 'submitted'::public.employee_onboarding_case_status
        and not public.employee_onboarding_final_approval_required(target_workspace_id)
        and not exists (
          select 1
          from public.employee_onboarding_requirements
          where case_id = target_case.id
            and required
            and blocks_activation
            and status <> 'completed'::public.employee_onboarding_requirement_status
        ) then
        expected_revision := public.activate_employee_onboarding_case_service(
          target_case.id,
          actor_user_id,
          'employee.auto_activated_after_review'
        );
      end if;
    end if;
  elsif review_action = 'activate' then
    if not public.service_actor_has_permission(actor_user_id,target_workspace_id,'employee_onboarding.review') then raise exception 'onboarding edit access required' using errcode='42501'; end if;
    if target_employee_user_id = actor_user_id then raise exception 'submitter cannot activate own onboarding' using errcode = '42501'; end if;
    if target_case.status <> 'submitted'::public.employee_onboarding_case_status then raise exception 'submitted onboarding required' using errcode = '23514'; end if;
    if not production_ready then raise exception 'sensitive infrastructure readiness required' using errcode = '55000'; end if;
    if exists (select 1 from public.employee_onboarding_requirements
      where case_id = target_case.id and required and blocks_activation and status <> 'completed'::public.employee_onboarding_requirement_status) then
      raise exception 'activation-blocking requirements remain' using errcode = '23514';
    end if;
    expected_revision := public.activate_employee_onboarding_case_service(
      target_case.id,
      actor_user_id,
      'employee.activated'
    );
  else
    raise exception 'unsupported onboarding review action' using errcode = '22023';
  end if;
  insert into public.onboarding_events (workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id, metadata)
  values (target_workspace_id, target_employee_id, target_case.id, actor_user_id,
    'onboarding.' || review_action, 'onboarding_case', target_case.id::text,
    jsonb_build_object('requirement_id', target_requirement_id, 'reason_present', nullif(btrim(coalesce(review_reason, '')), '') is not null));
  return expected_revision;
end;
$function$;
CREATE OR REPLACE FUNCTION public.weekly_preferences_read_service(actor uuid, w uuid, emp uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare employee public.employee_profiles%rowtype; settings public.workspace_scheduling_settings%rowtype;
 own_record boolean; can_manage boolean; can_view_manager boolean; employee_record jsonb; manager_record jsonb; types jsonb; selected_ids uuid[];
begin
 select * into employee from public.employee_profiles e where e.workspace_id=w and (e.id=emp or (emp is null and e.user_id=actor)) and e.archived_at is null;
 if employee.id is null then raise exception 'Employee not found' using errcode='42501'; end if;
 own_record:=employee.user_id=actor and exists(select 1 from public.workspace_memberships m where m.workspace_id=w and m.user_id=actor and m.status in ('active','pending_activation'));
 can_manage:=public.weekly_preference_manager_scope(actor,w,employee.id,'availability.manage');
 can_view_manager:=can_manage or public.weekly_preference_manager_scope(actor,w,employee.id,'availability.read');
 if not coalesce(own_record,false) and not can_view_manager then raise exception 'Employee access required' using errcode='42501'; end if;
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
  'settings',jsonb_build_object('input_mode',settings.availability_input_mode,'warning_policy',settings.availability_warning_policy,
   'onboarding_required',settings.availability_onboarding_required,'revision',settings.availability_preferences_revision),
  'employee',employee_record,'manager',manager_record,'shift_types',types,'time_format',settings.time_format);
end; $function$;
CREATE OR REPLACE FUNCTION public.weekly_team_read_service(actor uuid, w uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if not exists(select 1 from public.workspace_memberships m where m.workspace_id=w and m.user_id=actor
  and m.status='active' and m.role in ('owner','admin','manager')) then
  raise exception 'Manager workspace access required' using errcode='42501';
 end if;
 if not public.schedule_actor_has_capability_service(actor,w,'availability.read',null)
  and not exists(select 1 from public.locations l where l.workspace_id=w and l.archived_at is null
   and public.schedule_actor_has_capability_service(actor,w,'availability.read',l.id)) then
  raise exception 'Schedule read access required' using errcode='42501';
 end if;
 with scope as materialized (
  select l.id,l.name,l.sort_order from public.locations l where l.workspace_id=w and l.archived_at is null
   and public.schedule_actor_has_capability_service(actor,w,'availability.read',l.id)
 ), people as materialized (
  select e.id,e.employee_code,coalesce(nullif(e.preferred_name,''),e.first_name)||' '||e.last_name display_name,
   coalesce((select jsonb_agg(a.location_id order by a.location_id) from public.employee_location_assignments a
    join scope s on s.id=a.location_id where a.workspace_id=w and a.employee_id=e.id and a.ended_at is null),'[]') location_ids,
   p.employee_id is not null submitted,coalesce(p.preference,public.empty_weekly_preference(s.availability_input_mode)) preference,
   (public.weekly_preference_manager_scope(actor,w,e.id,'availability.read')
    or public.weekly_preference_manager_scope(actor,w,e.id,'availability.manage')) can_open
  from public.employee_profiles e
  join public.workspace_scheduling_settings s on s.workspace_id=e.workspace_id
  left join public.employee_weekly_preferences p on p.workspace_id=e.workspace_id and p.employee_id=e.id
  where e.workspace_id=w and e.archived_at is null and (
   exists(select 1 from public.employee_location_assignments a join scope l on l.id=a.location_id
    where a.workspace_id=w and a.employee_id=e.id and a.ended_at is null)
   or (not exists(select 1 from public.employee_location_assignments a where a.workspace_id=w and a.employee_id=e.id and a.ended_at is null)
    and exists(select 1 from public.workspace_memberships m where m.workspace_id=w and m.user_id=actor and m.all_locations)
    and public.schedule_actor_has_capability_service(actor,w,'availability.read',null))
  )
 ), selected_types as (
  select distinct type_id::uuid id from people p cross join lateral jsonb_array_elements(p.preference->'days') day
   cross join lateral jsonb_array_elements_text(day->'shift_type_ids') type_id
 ), types as (
  select x.id,coalesce(t.name,d.name,'Unavailable shift type') name,
   to_char(case when t.id is not null and t.archived_at is null and t.deleted_at is null then t.default_start_time else d.start_time end,'HH24:MI') start_time,
   to_char(case when t.id is not null and t.archived_at is null and t.deleted_at is null then t.default_end_time else d.end_time end,'HH24:MI') end_time,
   (t.id is null or t.archived_at is not null or t.deleted_at is not null) archived,false selectable
  from selected_types x left join public.shift_types t on t.workspace_id=w and t.id=x.id
   left join public.weekly_preference_type_defaults d on d.workspace_id=w and d.shift_type_id=x.id
 )
 select jsonb_build_object(
  'locations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by sort_order,name,id) from scope),'[]'),
  'time_format',(select time_format from public.workspace_scheduling_settings where workspace_id=w),
  'employees',coalesce((select jsonb_agg(to_jsonb(p) order by display_name,employee_code,id) from people p),'[]'),
  'shift_types',coalesce((select jsonb_agg(to_jsonb(t) order by name,id) from types t),'[]')
 ) into result;
 return result;
end; $function$;
CREATE OR REPLACE FUNCTION public.weekly_preference_settings_read_service(actor uuid, w uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare settings public.workspace_scheduling_settings%rowtype; can_edit boolean; missing jsonb;
begin
 if not exists(select 1 from public.workspace_memberships where workspace_id=w and user_id=actor and status in ('active','pending_activation')) then
  raise exception 'Organization membership required' using errcode='42501'; end if;
 select public.service_actor_has_permission(actor,w,'settings.schedule_rules.manage') into can_edit;
 select * into settings from public.workspace_scheduling_settings where workspace_id=w;
 if not found then raise exception 'Availability settings not found' using errcode='P0002'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by sort_order,name,id),'[]') into missing
  from public.shift_types where workspace_id=w and archived_at is null and deleted_at is null
   and (default_start_time is null or default_end_time is null or default_start_time=default_end_time or default_start_time='24:00'::time);
 return jsonb_build_object('settings',jsonb_build_object('input_mode',settings.availability_input_mode,'warning_policy',settings.availability_warning_policy,
  'onboarding_required',settings.availability_onboarding_required,'revision',settings.availability_preferences_revision),
  'can_edit',can_edit,'missing_shift_types',missing);
end; $function$;
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
end; $function$;
CREATE OR REPLACE FUNCTION public.weekly_preference_manager_scope(actor uuid, w uuid, emp uuid, capability text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select public.service_actor_can_access_employee(actor,w,emp) and exists(select 1 from public.employee_profiles e where e.workspace_id=w and e.id=emp and (
  exists(select 1 from public.employee_location_assignments a where a.workspace_id=w and a.employee_id=emp and a.ended_at is null
   and public.schedule_actor_has_capability_service(actor,w,capability,a.location_id))
  or exists(select 1 from public.workspace_memberships m where m.workspace_id=w and m.user_id=actor and m.all_locations
   and public.schedule_actor_has_capability_service(actor,w,capability,null))
 ));
$function$;
CREATE OR REPLACE FUNCTION public.communication_actor_has_all_locations_service(actor_user_id uuid, target_workspace_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.workspace_memberships membership where membership.user_id=actor_user_id and membership.workspace_id=target_workspace_id and membership.status='active' and membership.role in ('owner','admin') and membership.all_locations);
$function$;
CREATE OR REPLACE FUNCTION public.list_schedule_templates_service(actor_user_id uuid, target_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('templates',coalesce(jsonb_agg(jsonb_build_object(
   'id',t.id,'workspace_id',t.workspace_id,'name',t.name,'revision',t.revision,
   'shift_count',x.shift_count,'open_slot_count',x.open_slot_count,
   'created_by_name',coalesce(u.display_name,'Manager'),'updated_at',t.updated_at
 ) order by t.updated_at desc,t.id) filter(where t.id is not null),'[]'::jsonb))
 from public.schedule_templates t join public.user_profiles u on u.user_id=t.created_by
 cross join lateral (select count(*)::integer shift_count,count(*) filter(where s.employee_id is null)::integer open_slot_count from public.schedule_template_shifts s where s.template_id=t.id) x
 where t.workspace_id=target_workspace_id and public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.templates.read')
 and not exists(select 1 from public.schedule_template_shifts s where s.template_id=t.id and not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.templates.read',s.location_id));
$function$;
CREATE OR REPLACE FUNCTION public.get_schedule_template_service(actor_user_id uuid, target_workspace_id uuid, target_template_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 select jsonb_build_object('template',jsonb_build_object('id',t.id,'workspace_id',t.workspace_id,'name',t.name,'revision',t.revision,
   'shift_count',(select count(*) from public.schedule_template_shifts s where s.template_id=t.id),
   'open_slot_count',(select count(*) from public.schedule_template_shifts s where s.template_id=t.id and s.employee_id is null),
   'created_by_name',coalesce(u.display_name,'Manager'),'updated_at',t.updated_at),
   'shifts',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'location_id',s.location_id,'employee_id',s.employee_id,'job_id',s.job_id,
     'shift_type_id',s.shift_type_id,'day_offset',s.day_offset,'time_basis',s.time_basis,'time_snapshot',s.time_snapshot,'time_timezone',s.time_timezone,'start_time',to_char(s.start_time,'HH24:MI'),'end_time',to_char(s.end_time,'HH24:MI'),
     'crosses_midnight',s.crosses_midnight,'hide_time_on_badge',coalesce(s.hide_time_on_badge,false),'label_ids',to_jsonb(coalesce(s.label_ids,'{}'::uuid[])),
     'label_names',to_jsonb(coalesce(s.label_names,'{}'::text[])),'note',s.note) order by s.day_offset,s.start_time,s.id) from public.schedule_template_shifts s where s.template_id=t.id),'[]'::jsonb))
 into result from public.schedule_templates t join public.user_profiles u on u.user_id=t.created_by
 where t.id=target_template_id and t.workspace_id=target_workspace_id
 and public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.templates.read')
 and not exists(select 1 from public.schedule_template_shifts s where s.template_id=t.id and not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.templates.read',s.location_id));
 if result is null then raise exception 'schedule template not found' using errcode='P0002'; end if; return result;
end; $function$;
alter policy workspace_logos_delete_admin on storage.objects using (((bucket_id = 'workspace-logos'::text) AND ((storage.foldername(name))[2] = 'logo'::text) AND ( SELECT public.workspace_has_permission(((storage.foldername(objects.name))[1])::uuid, 'settings.general.manage')))) ;
alter policy workspace_logos_update_admin on storage.objects using (((bucket_id = 'workspace-logos'::text) AND ((storage.foldername(name))[2] = 'logo'::text) AND ( SELECT public.workspace_has_permission(((storage.foldername(objects.name))[1])::uuid, 'settings.general.manage')))) with check (((bucket_id = 'workspace-logos'::text) AND ((storage.foldername(name))[2] = 'logo'::text) AND ( SELECT public.workspace_has_permission(((storage.foldername(objects.name))[1])::uuid, 'settings.general.manage')))) ;
alter policy workspace_logos_insert_admin on storage.objects with check (((bucket_id = 'workspace-logos'::text) AND ((storage.foldername(name))[2] = 'logo'::text) AND ( SELECT public.workspace_has_permission(((storage.foldername(objects.name))[1])::uuid, 'settings.general.manage')))) ;
alter policy jobs_update_admin on public.jobs using (( SELECT public.workspace_has_permission(jobs.workspace_id, 'settings.jobs.manage'))) with check (( SELECT public.workspace_has_permission(jobs.workspace_id, 'settings.jobs.manage'))) ;
alter policy jobs_insert_admin on public.jobs with check (( SELECT public.workspace_has_permission(jobs.workspace_id, 'settings.jobs.manage'))) ;
alter policy departments_update_admin on public.departments using (( SELECT public.workspace_has_permission(departments.workspace_id, 'settings.jobs.manage'))) with check (( SELECT public.workspace_has_permission(departments.workspace_id, 'settings.jobs.manage'))) ;
alter policy departments_insert_admin on public.departments with check (( SELECT public.workspace_has_permission(departments.workspace_id, 'settings.jobs.manage'))) ;
alter policy shift_types_update_admin on public.shift_types using (( SELECT public.workspace_has_permission(shift_types.workspace_id, 'settings.shift_catalog.manage'))) with check (( SELECT public.workspace_has_permission(shift_types.workspace_id, 'settings.shift_catalog.manage'))) ;
alter policy shift_types_insert_admin on public.shift_types with check (( SELECT public.workspace_has_permission(shift_types.workspace_id, 'settings.shift_catalog.manage'))) ;
alter policy locations_update_admin on public.locations using (( SELECT public.workspace_has_permission(locations.workspace_id, 'settings.locations.manage'))) with check (( SELECT public.workspace_has_permission(locations.workspace_id, 'settings.locations.manage'))) ;
alter policy locations_insert_admin on public.locations with check (( SELECT public.workspace_has_permission(locations.workspace_id, 'settings.locations.manage'))) ;
alter policy scheduling_settings_update_admin on public.workspace_scheduling_settings using (( SELECT public.workspace_has_permission(workspace_scheduling_settings.workspace_id, 'settings.schedule_rules.manage'))) with check (( SELECT public.workspace_has_permission(workspace_scheduling_settings.workspace_id, 'settings.schedule_rules.manage'))) ;
alter policy scheduling_settings_insert_admin on public.workspace_scheduling_settings with check (( SELECT public.workspace_has_permission(workspace_scheduling_settings.workspace_id, 'settings.schedule_rules.manage'))) ;
alter policy shift_labels_update_admin on public.shift_labels using (( SELECT public.workspace_has_permission(shift_labels.workspace_id, 'settings.shift_catalog.manage'))) with check (( SELECT public.workspace_has_permission(shift_labels.workspace_id, 'settings.shift_catalog.manage'))) ;
alter policy shift_labels_insert_admin on public.shift_labels with check (( SELECT public.workspace_has_permission(shift_labels.workspace_id, 'settings.shift_catalog.manage'))) ;
alter policy workspaces_update_manager on public.workspaces using (( SELECT public.workspace_has_permission(workspaces.id, 'settings.general.manage'))) with check (( SELECT public.workspace_has_permission(workspaces.id, 'settings.general.manage'))) ;

alter policy locations_select_scoped_member on public.locations using (public.can_access_location(workspace_id,id) or public.workspace_has_permission(workspace_id,'settings.locations.read'));
create function app_private.can_manage_important_date(w uuid,locations uuid[]) returns boolean language sql stable security definer set search_path='' as $$
 select public.workspace_has_permission(w,'important_dates.manage') and exists(select 1 from public.workspace_memberships m where m.workspace_id=w and m.user_id=auth.uid() and m.status='active' and (m.role in ('owner','admin') or (m.role='manager' and cardinality(locations)>0 and not exists(select 1 from unnest(locations) l where not public.can_access_location(w,l)))));
$$;
revoke all on function app_private.can_manage_important_date(uuid,uuid[]) from public,anon;
grant execute on function app_private.can_manage_important_date(uuid,uuid[]) to authenticated;
alter policy important_dates_insert_admin on public.important_dates with check (app_private.can_manage_important_date(workspace_id,location_ids));
alter policy important_dates_update_admin on public.important_dates using (app_private.can_manage_important_date(workspace_id,location_ids)) with check (app_private.can_manage_important_date(workspace_id,location_ids));

-- Manager location scope is a projection of employee work locations, not a second role setting.
create table app_private.bl051_membership_scope_snapshot as
select m.id membership_id,m.workspace_id,m.all_locations,coalesce(array_agg(s.location_id) filter(where s.location_id is not null),'{}'::uuid[]) location_ids
from public.workspace_memberships m left join public.membership_location_scopes s on s.membership_id=m.id group by m.id;
alter table app_private.bl051_membership_scope_snapshot enable row level security;
revoke all on app_private.bl051_membership_scope_snapshot from public,anon,authenticated,service_role;

create function app_private.sync_manager_location_scope(w uuid,uid uuid) returns void language plpgsql security definer set search_path='' as $$
declare mid uuid;
begin
 select id into mid from public.workspace_memberships where workspace_id=w and user_id=uid and role='manager';
 if mid is null then return; end if;
 delete from public.membership_location_scopes s where s.membership_id=mid and not exists(
  select 1 from public.employee_profiles e join public.employee_location_assignments a on a.employee_id=e.id and a.workspace_id=e.workspace_id
  where e.workspace_id=w and e.user_id=uid and e.archived_at is null and a.ended_at is null and a.location_id=s.location_id);
 insert into public.membership_location_scopes(membership_id,workspace_id,location_id)
 select distinct mid,w,a.location_id from public.employee_profiles e join public.employee_location_assignments a on a.employee_id=e.id and a.workspace_id=e.workspace_id
 where e.workspace_id=w and e.user_id=uid and e.archived_at is null and a.ended_at is null on conflict do nothing;
end; $$;
revoke all on function app_private.sync_manager_location_scope(uuid,uuid) from public,anon,authenticated,service_role;
create function app_private.sync_role_location_scope_trigger() returns trigger language plpgsql security definer set search_path='' as $$
declare w uuid; uid uuid;
begin
 if tg_table_name='workspace_memberships' then
  perform app_private.sync_manager_location_scope(new.workspace_id,new.user_id);
 elsif tg_table_name='employee_profiles' then
  if tg_op<>'INSERT' then perform app_private.sync_manager_location_scope(old.workspace_id,old.user_id); end if;
  if tg_op<>'DELETE' then perform app_private.sync_manager_location_scope(new.workspace_id,new.user_id); end if;
 else
  if tg_op<>'INSERT' then
   select workspace_id,user_id into w,uid from public.employee_profiles where id=old.employee_id;
   perform app_private.sync_manager_location_scope(w,uid);
  end if;
  if tg_op<>'DELETE' then
   select workspace_id,user_id into w,uid from public.employee_profiles where id=new.employee_id;
   perform app_private.sync_manager_location_scope(w,uid);
  end if;
 end if;
 return null;
end; $$;
revoke all on function app_private.sync_role_location_scope_trigger() from public,anon,authenticated,service_role;
create constraint trigger bl051_sync_membership_scope after insert or update on public.workspace_memberships deferrable initially deferred for each row execute function app_private.sync_role_location_scope_trigger();
create constraint trigger bl051_sync_employee_scope after insert or update or delete on public.employee_profiles deferrable initially deferred for each row execute function app_private.sync_role_location_scope_trigger();
create constraint trigger bl051_sync_assignment_scope after insert or update or delete on public.employee_location_assignments deferrable initially deferred for each row execute function app_private.sync_role_location_scope_trigger();
create function app_private.enforce_role_location_scope() returns trigger language plpgsql set search_path='' as $$
begin
 if new.role in ('owner','admin') then new.all_locations:=true;
 elsif new.role='manager' then new.all_locations:=false;
 end if;
 return new;
end; $$;
revoke all on function app_private.enforce_role_location_scope() from public,anon,authenticated,service_role;
create trigger b_enforce_role_location_scope before insert or update on public.workspace_memberships for each row execute function app_private.enforce_role_location_scope();
update public.workspace_memberships set all_locations=(role in ('owner','admin')) where role in ('owner','admin','manager');
select app_private.sync_manager_location_scope(workspace_id,user_id) from public.workspace_memberships where role='manager';

-- Existing employee-based custom roles retain their stored grants, but management
-- grants can never become effective in the employee experience.
create or replace function public.service_actor_has_permission(actor_user_id uuid,target_workspace_id uuid,target_permission text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.workspace_memberships m join public.workspace_role_permissions g on g.role_id=m.role_id and g.workspace_id=m.workspace_id
 where m.user_id=actor_user_id and m.workspace_id=target_workspace_id and m.status='active' and g.permission_key=target_permission
 and (m.role<>'employee' or target_permission in ('workspace.read','schedule.read','announcements.read','notifications.read','notifications.read_own','notifications.preferences.write_own','time.capture.own','time.read.own','time.correction.request.own')));
$$;
create or replace function app_private.workspace_has_permission(target_workspace_id uuid,target_permission text) returns boolean language sql stable security definer set search_path='' as $$
 select public.service_actor_has_permission(auth.uid(),target_workspace_id,target_permission);
$$;

-- BL-231: the Employees drawer (Employees > a person, or Add employee) reads
-- its pickers through one entry point instead of three browser reads of
-- locations, jobs and workspace_roles.
--
-- The core decides who may read it: employees.read, set-scoped, so a manager
-- reads the locations they work at (M2) and a manager who works nowhere is
-- authz.out_of_scope. The invitation roles are the ones
-- app_private.can_invite_with_role allows (the rule create_employee_command_service
-- checks); anybody who may invite with none reads an empty list, so they can
-- still open the drawer.

insert into app_private.authz_actions (key, scope_class, effect, permission_key) values
  ('employee.references.read', 'set', 'read', 'employees.read');

-- Who may invite with a role: one rule for the drawer's list and for
-- create_employee_command_service. employee_access.manage, and a role ranked
-- below the actor's own (owner: every other; admin: manager and employee;
-- manager: employee). Moved here as it stood in create_employee_command_service.
create function app_private.can_invite_with_role(actor_user_id uuid, target_workspace_id uuid, target_role_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.service_actor_has_permission(actor_user_id, target_workspace_id, 'employee_access.manage')
    and exists (
      select 1 from public.workspace_roles role
      join public.workspace_memberships actor on actor.workspace_id = role.workspace_id
      where role.id = target_role_id and role.workspace_id = target_workspace_id
        and actor.user_id = actor_user_id and actor.status = 'active'
        and role.access_class <> 'owner'
        and (actor.role = 'owner' or (actor.role = 'admin' and role.access_class <> 'admin')
          or (actor.role = 'manager' and role.access_class = 'employee'))
    );
$$;
revoke all on function app_private.can_invite_with_role(uuid, uuid, uuid) from public;

create function public.read_employee_references_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', job.id, 'name', job.name, 'archived_at', job.archived_at
      ) order by job.sort_order, job.name, job.id)
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
$$;

revoke all on function public.read_employee_references_service(uuid, uuid) from public, anon, authenticated;
grant execute on function public.read_employee_references_service(uuid, uuid) to service_role;

-- create_employee_command_service asks the same helper.
CREATE OR REPLACE FUNCTION public.create_employee_command_service(actor_user_id uuid, target_workspace_id uuid, command_id uuid, employee_input jsonb, invite_role_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  stored public.employee_create_commands%rowtype;
  invite public.employee_invitations%rowtype;
  fingerprint text;
  saved_id uuid;
  prepared_id uuid;
  secret_token text;
begin
  if actor_user_id is null or command_id is null
    or not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'employees.manage') then
    raise exception 'employee management access required' using errcode = '42501';
  end if;
  if invite_role_id is not null and not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'employee_access.manage') then
    raise exception 'employee access required' using errcode = '42501';
  end if;
  fingerprint := encode(extensions.digest(jsonb_build_object('employee', employee_input, 'role', invite_role_id)::text, 'sha256'), 'hex');
  -- Serializes retries before creating anything, including concurrent requests.
  perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text || actor_user_id::text || command_id::text, 0));
  select * into stored from public.employee_create_commands c
    where c.workspace_id = target_workspace_id and c.actor_user_id = create_employee_command_service.actor_user_id
      and c.command_id = create_employee_command_service.command_id;
  if found then
    if stored.input_hash <> fingerprint then
      raise exception 'idempotency key belongs to different employee details' using errcode = '40001';
    end if;
    if invite_role_id is not null
      and not app_private.can_invite_with_role(actor_user_id, target_workspace_id, invite_role_id) then
      raise exception 'role assignment access denied' using errcode = '42501';
    end if;
  else
    if coalesce(employee_input->>'invitation_email', '') <> ''
      and (employee_input->>'invitation_email') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      raise exception 'valid invitation email required' using errcode = '22023';
    end if;
    saved_id := public.save_employee_service(
      actor_user_id, target_workspace_id, null,
      employee_input->>'first_name',
      coalesce(employee_input->>'middle_name', ''),
      employee_input->>'last_name', '',
      employee_input->>'invitation_email', nullif(employee_input->>'start_date', '')::date,
      employee_input->>'internal_note',
      array(select jsonb_array_elements_text(employee_input->'location_ids'))::uuid[],
      (employee_input->>'primary_location_id')::uuid,
      array(select jsonb_array_elements_text(employee_input->'job_ids'))::uuid[],
      (employee_input->>'primary_job_id')::uuid,
      coalesce((employee_input->>'is_remote')::boolean, false),
      coalesce((employee_input->>'is_excluded_from_schedule')::boolean, false), null
    );
    if invite_role_id is not null then
      secret_token := encode(extensions.gen_random_bytes(32), 'hex');
      prepared_id := public.prepare_employee_invitation_service(
        actor_user_id, target_workspace_id, saved_id, lower(btrim(employee_input->>'invitation_email')),
        invite_role_id, encode(extensions.digest(secret_token, 'sha256'), 'hex'), now() + interval '7 days'
      );
    end if;
    insert into public.employee_create_commands
      (workspace_id, actor_user_id, command_id, input_hash, employee_id, invitation_id, invitation_token)
      values (target_workspace_id, actor_user_id, command_id, fingerprint, saved_id, prepared_id, secret_token)
      returning * into stored;
  end if;
  if stored.invitation_id is not null then
    select * into invite from public.employee_invitations where id = stored.invitation_id;
  end if;
  return jsonb_build_object(
    'id', stored.employee_id, 'invitation_id', stored.invitation_id,
    'token', case when invite.status = 'pending' and invite.expires_at > now() then stored.invitation_token else null end,
    'delivery_status', invite.delivery_status
  );
end;
$function$
;

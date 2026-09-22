-- Dropping a function drops its grants with it, and the replacement comes back
-- executable by PUBLIC. Two of the JOIN migrations recreated a SECURITY DEFINER
-- function and left exactly that behind: list_my_workspaces() and the
-- save_employee overload that learned a middle name. Both were reachable by the
-- `anon` role through PostgREST. Their own guards read auth.uid(), so an
-- anonymous call gets nothing back, but a definer function on the public API
-- surface is not something to leave standing on that argument alone.
--
-- Nothing calls either one. The app goes through the _service variants, which
-- are granted to service_role and nobody else.

revoke all on function public.list_my_workspaces()
  from public, anon, authenticated;

revoke all on function public.save_employee(
  uuid, uuid, text, text, text, text, text, date, text,
  uuid[], uuid, uuid[], uuid, boolean, boolean, integer
) from public, anon, authenticated;

-- The signatures these replaced are still here, one argument set behind. A call
-- that omits the new arguments would resolve to them and write a record with no
-- middle name and no remote or schedule-exclusion flags, quietly.
drop function if exists public.save_employee(
  uuid, uuid, text, text, text, text, date, text, uuid[], uuid, uuid[], uuid, integer
);

drop function if exists public.save_employee_service(
  uuid, uuid, uuid, text, text, text, text, date, text,
  uuid[], uuid, uuid[], uuid, integer
);

-- And its callers move with it. create_employee_command_service was written
-- against the signature before a middle name existed, and passed sixteen
-- positional arguments into a seventeen-argument function that still accepted
-- them because the old overload carried defaults. So every employee added
-- through the create command lost their middle name on the way in, silently,
-- and dropping that overload above turned the silence into an error.
--
-- The middle name now travels with the first and the last, where the rest of
-- the app already puts it.

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
    if invite_role_id is not null and not exists (
      select 1 from public.workspace_roles role
      join public.workspace_memberships actor on actor.workspace_id = role.workspace_id
      where role.id = invite_role_id and role.workspace_id = target_workspace_id
        and actor.user_id = actor_user_id and actor.status = 'active'
        and role.access_class <> 'owner'
        and (actor.role = 'owner' or (actor.role = 'admin' and role.access_class <> 'admin')
          or (actor.role = 'manager' and role.access_class = 'employee'))
    ) then
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
$function$;

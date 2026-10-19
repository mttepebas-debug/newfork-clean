-- ROL-CIFT slice 6.2 (design §4.1): the employee interface is the employee access's. One's own hub, what one
-- changes of it and one's lineup to acknowledge need the employee slot, as the other employee-side actions
-- do (employee_target); somebody who only manages has none. Posts stay readable and acknowledgeable from
-- the management interface (announcement.read, announcement.acknowledge are left as they are).

update app_private.authz_actions set employee_target = true
where key in ('employee_hub.read', 'employee_hub.self', 'lineup.acknowledge');

CREATE OR REPLACE FUNCTION "public"."employee_hub_actor_service"("actor_user_id" "uuid", "target_workspace_id" "uuid") RETURNS "public"."employee_profiles"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me app_private.actor_state := app_private.actor(actor_user_id, target_workspace_id);
  employee public.employee_profiles%rowtype;
begin
  if me.membership_id is null then
    raise exception 'active employee membership required' using errcode = '42501', hint = 'authz.not_member';
  end if;
  if me.status <> 'active' then
    raise exception 'active employee membership required' using errcode = '42501', hint = 'authz.not_active';
  end if;
  if not me.workspace_open then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.workspace_closed';
  end if;
  -- The hub is the employee access's (ROL-CIFT 6.2): the core's answer for an employee-side action
  -- without it. A missing document still opens the hub, as before.
  if not coalesce(me.has_employee, false) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.rank', detail = 'employee_hub.read';
  end if;
  select * into employee from public.employee_profiles profile
  where profile.workspace_id = target_workspace_id
    and profile.user_id = actor_user_id
    and profile.archived_at is null;
  -- A member with no employee record of their own has no hub here.
  if employee.id is null then
    raise exception 'employee profile required' using errcode = '42501', hint = 'authz.out_of_scope';
  end if;
  return employee;
end;
$$;

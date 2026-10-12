-- BL-1069 (Mert 2026-10-12): a manager who may invite somebody sees that
-- person's invitation in the Employees drawer, and so its Send reminder,
-- Copy link and Revoke buttons. The drawer read gave the invitation only to who
-- reads access (employee_access.read), which the built-in Manager role does not
-- hold: Ayse invited Pia, still read "Ready to invite", and a second Invite took
-- the first link back.
-- The invitation is now also read by the rule its buttons ask
-- (revoke_employee_invitation_service, load_employee_invitation_link_service,
-- load_employee_invitation_retry_service): employee.invite on the person, and a
-- role the reader may give (app_private.can_invite_with_role). Whoever sent it.
-- Nobody may do more than before; an invitation into a role the reader cannot
-- give stays hidden from them.
--
-- The function changes on the definition the database holds
-- (pg_get_functiondef): each anchor must be found exactly as often as
-- expected, or nothing changes.

create or replace function pg_temp.patch(fn regprocedure, edits text[]) returns void language plpgsql as $patch$
declare
  definition text := pg_get_functiondef(fn);
  i integer;
  found integer;
begin
  -- [anchor, replacement, expected count] triples.
  for i in 1 .. array_length(edits, 1) by 3 loop
    found := (length(definition) - length(replace(definition, edits[i], ''))) / length(edits[i]);
    if found <> edits[i + 2]::integer then
      raise exception 'manager sees the invitation: % no longer reads as this expects (anchor %, found % times)', fn, (i + 2) / 3, found;
    end if;
    definition := replace(definition, edits[i], edits[i + 1]);
  end loop;
  execute definition;
end
$patch$;

select pg_temp.patch('public.get_employee_detail_service(uuid,uuid,uuid)', array[
  E'  removal app_private.authz_actions;\n',
  E'  removal app_private.authz_actions;\n  invite_rule app_private.authz_actions;\n', '1',
  E'    raise exception ''core action employee.remove_from_location is missing'' using errcode = ''22023'';\n  end if;\n',
  E'    raise exception ''core action employee.remove_from_location is missing'' using errcode = ''22023'';\n  end if;\n'
  || E'  select * into invite_rule from app_private.authz_actions action where action.key = ''employee.invite'';\n'
  || E'  if not found then\n'
  || E'    raise exception ''core action employee.invite is missing'' using errcode = ''22023'';\n'
  || E'  end if;\n', '1',
  E'      when invitation.id is null or not reads_access then null\n',
  E'      -- Who reads access reads it; so does whoever its buttons answer to\n'
  || E'      -- (employee.invite, a role they may give; BL-1069).\n'
  || E'      when invitation.id is null or not (reads_access\n'
  || E'        or (app_private.authz_check(me, invite_rule, null, employee.id, null) is null\n'
  || E'          and app_private.can_invite_with_role(actor_user_id, target_workspace_id, invitation.role_id))) then null\n', '1'
]);

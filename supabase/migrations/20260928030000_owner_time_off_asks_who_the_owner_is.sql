-- BL-221 (user, K12): the owner's own leave is recorded approved when filed,
-- with no exception, a missing required document included. "Is this the
-- owner's own request?" asked workspace.setup, which also refuses an owner
-- blocked by a document; both places now ask the core who the owner is.

CREATE OR REPLACE FUNCTION public.time_off_is_the_owners_own(actor uuid, w uuid, rid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select (app_private.actor(actor, w)).class = 'owner'
  and exists (select 1 from public.schedule_time_off_requests r
   join public.employee_profiles e on e.id = r.employee_id and e.workspace_id = r.workspace_id
   where r.id = rid and r.workspace_id = w and e.user_id = actor);
$function$
;

CREATE OR REPLACE FUNCTION app_private.authorize_time_off_decision(actor uuid, w uuid, requester uuid, place uuid, verb text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  -- The owner's own request is recorded approved (record_owner_time_off),
  -- whatever else stands in the owner's way, a missing document included
  -- (BL-221). time_off.decide refuses the owner only their own (rank);
  -- everyone else ranks below them.
  if verb = 'approve'
     and (app_private.actor(actor, w)).class = 'owner'
     and exists (select 1 from public.employee_profiles employee
                 where employee.id = requester and employee.workspace_id = w and employee.user_id = actor) then
    return;
  end if;
  perform app_private.authorize(actor, w, 'time_off.decide', target_locations => array[place], target_person => requester);
end;
$function$
;

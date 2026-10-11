-- Mert, 2026-10-11 (Requests, EKRAN-02 review): "a swap or a cover reaches a
-- manager once both sides agreed" is one rule, asked by both Requests reads.
-- An open request has agreement while somebody's application waits for the
-- manager (or a manager already voted on it): the only person asking taking it
-- back hides the cover again; a manager's own decline keeps it listed, with
-- its reason. A closed request reached the manager if anybody
-- ever asked or accepted, so its record stays in the manager's closed list.
-- An open shift is listed as before: its case only exists once somebody asked.
--
-- The reads change on the definitions the database holds (pg_get_functiondef):
-- each anchor must be found exactly as often as expected, or nothing changes.

create function app_private.shift_exchange_reached_managers(w uuid, cid uuid) returns boolean
language sql volatile set search_path = '' as $$
  select c.kind = 'open_pickup' or case
    when c.status = 'open' and public.shift_exchange_live_status(shift_exchange_reached_managers.w, c.id) = 'open' then
      exists (select 1 from public.shift_exchange_applications a where a.case_id = c.id and a.status in ('pending_manager', 'rejected_by_manager'))
      or exists (select 1 from public.shift_exchange_votes v where v.case_id = c.id)
    else exists (select 1 from public.shift_exchange_events e
      where e.workspace_id = shift_exchange_reached_managers.w and e.case_id = c.id
        and e.action in ('application_submitted', 'peer_accepted'))
  end
  from public.shift_exchange_cases c
  where c.workspace_id = shift_exchange_reached_managers.w and c.id = shift_exchange_reached_managers.cid
$$;
revoke all on function app_private.shift_exchange_reached_managers(uuid, uuid) from public;

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
      raise exception 'agreement from live applications: % no longer reads as this expects (anchor %, found % times)', fn, (i + 2) / 3, found;
    end if;
    definition := replace(definition, edits[i], edits[i + 1]);
  end loop;
  execute definition;
end
$patch$;

select pg_temp.patch('public.shift_exchanges_read_service(uuid,uuid,boolean,date,date,uuid)', array[
  E'  -- A swap or a cover reaches a manager once both sides agreed (Mert, 2026-10-11):\n'
  || E'  -- somebody asked for the shift, or the teammate accepted the swap.\n'
  || E'  if manager_view and c.kind<>''open_pickup'' and not mine\n'
  || E'   and not exists(select 1 from public.shift_exchange_applications where case_id=c.id and employee_id=emp.id)\n'
  || E'   and not exists(select 1 from public.shift_exchange_events where workspace_id=w and case_id=c.id and action in(''application_submitted'',''peer_accepted''))\n'
  || E'   then continue; end if;\n',
  E'  -- A swap or a cover reaches a manager once both sides agreed (Mert, 2026-10-11):\n'
  || E'  -- somebody asks for the shift, or the teammate accepted the swap.\n'
  || E'  if manager_view and not mine\n'
  || E'   and not exists(select 1 from public.shift_exchange_applications where case_id=c.id and employee_id=emp.id)\n'
  || E'   and not coalesce(app_private.shift_exchange_reached_managers(w,c.id),false)\n'
  || E'   then continue; end if;\n', '1'
]);

select pg_temp.patch('public.get_schedule_requests_closed_service(uuid,uuid,text[],uuid,text,integer,integer)', array[
  E'        or exists (select 1 from public.shift_exchange_applications a where a.case_id = c.id and a.employee_id = emp_id))\n',
  E'        or exists (select 1 from public.shift_exchange_applications a where a.case_id = c.id and a.employee_id = emp_id))\n'
  || E'   -- Reached the manager only once both sides agreed (Mert, 2026-10-11), as the open list.\n'
  || E'   and (c.owner_id = emp_id\n'
  || E'        or exists (select 1 from public.shift_exchange_applications a where a.case_id = c.id and a.employee_id = emp_id)\n'
  || E'        or coalesce(app_private.shift_exchange_reached_managers(target_workspace_id, c.id), false))\n', '1'
]);

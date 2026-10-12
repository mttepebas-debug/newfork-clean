-- Mert, 2026-10-11 (Requests, EKRAN-02): a swap or a cover reaches a manager
-- only once both sides agreed. A swap waits for the teammate to accept; a cover
-- waits for somebody to ask for the shift. Until then Requests does not list it
-- ("Waiting for Maria to accept" was noise), and a request that closed before
-- anybody agreed never reaches the manager's list either. The manager is told
-- at that same moment already (the notice goes on application_submitted or
-- peer_accepted), so the list now follows the notice. An open shift is listed
-- as before: its case only exists once somebody asked for it. The owner and
-- the people asked still read the request in Shift Hub (the employee view),
-- and a manager who is one of them still reads it in Requests.
--
-- The read changes on the definition the database holds (pg_get_functiondef):
-- the anchor must be found exactly once, or nothing changes.

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
      raise exception 'agreed shift changes: % no longer reads as this expects (anchor %, found % times)', fn, (i + 2) / 3, found;
    end if;
    definition := replace(definition, edits[i], edits[i + 1]);
  end loop;
  execute definition;
end
$patch$;

select pg_temp.patch('public.shift_exchanges_read_service(uuid,uuid,boolean,date,date,uuid)', array[
  E'  if not allowed and not mine and not exists(select 1 from public.shift_exchange_applications where case_id=c.id and employee_id=emp.id) then continue; end if;\n',
  E'  if not allowed and not mine and not exists(select 1 from public.shift_exchange_applications where case_id=c.id and employee_id=emp.id) then continue; end if;\n'
  || E'  -- A swap or a cover reaches a manager once both sides agreed (Mert, 2026-10-11):\n'
  || E'  -- somebody asked for the shift, or the teammate accepted the swap.\n'
  || E'  if manager_view and c.kind<>''open_pickup'' and not mine\n'
  || E'   and not exists(select 1 from public.shift_exchange_applications where case_id=c.id and employee_id=emp.id)\n'
  || E'   and not exists(select 1 from public.shift_exchange_events where workspace_id=w and case_id=c.id and action in(''application_submitted'',''peer_accepted''))\n'
  || E'   then continue; end if;\n', '1'
]);

-- Team availability follows "only an employee enters availability" (M13;
-- KK-178, S-32):
--   BL-789  the team list showed managers, admins and the owner with a working
--           employee record, always as "Not submitted", and counted them in
--           "N employees". Only people who rank as employees are listed now;
--           somebody not yet joined (no account) still ranks as one.
--   BL-790  a save that changed no day sent every manager, admin and the owner
--           an "Availability updated · Week confirmed." notification. Only the
--           first save of a week, or a save that changes a day, tells them now.
--           The save itself, its history row and the person's history line
--           ("Week confirmed.") stay as they were.
--
-- The functions change on the definitions the database holds
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
      raise exception 'availability lists employees: % no longer reads as this expects (anchor %, found % times)', fn, (i + 2) / 3, found;
    end if;
    definition := replace(definition, edits[i], edits[i + 1]);
  end loop;
  execute definition;
end
$patch$;

select pg_temp.patch('public.weekly_team_read_service(uuid,uuid)', array[
  E'  where e.workspace_id=w and e.archived_at is null and (\n',
  E'  -- Only an employee enters availability (M13): nobody ranking above one is\n'
  || E'  -- listed, nor counted as a week not submitted (KK-178).\n'
  || E'  where e.workspace_id=w and e.archived_at is null and app_private.ranks_as_employee(w,e.user_id) and (\n', '1'
]);

select pg_temp.patch('public.weekly_preferences_save_service(uuid,uuid,jsonb,uuid)', array[
  E' if source=''employee'' then\n  select coalesce(array_agg(m.user_id)',
  E' -- A save that changes no day is news only the first time (S-32, KK-178).\n'
  || E' if source=''employee'' and (changed_days is not null or not coalesce((prior->>''submitted'')::boolean,false)) then\n  select coalesce(array_agg(m.user_id)', '1'
]);

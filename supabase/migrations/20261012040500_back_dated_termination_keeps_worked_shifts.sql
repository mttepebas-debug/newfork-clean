-- BL-766: a termination back-dated to an earlier day emptied the published
-- shifts the person had already worked since then. Effective 1 September,
-- entered on 12 October, turned every September shift of theirs into an open
-- shift on the Schedule, and Restore did not give them back.
--
-- The effective time may still lie in the past (K1): it is when employment
-- ended, and it is what the record and the audit keep. Releasing shifts never
-- reaches back before now, as removing someone from a location already does
-- (`>= now()`): a shift that has started stays with the person who worked it
-- (P09, a published record does not change after the fact). Only the line
-- that picks the shifts to release changes; everything else stays as it was.
--
-- The function changes on the definition the database holds
-- (pg_get_functiondef): the anchor must be found exactly once, or nothing
-- changes.

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
      raise exception 'back-dated termination: % no longer reads as this expects (anchor %, found % times)', fn, (i + 2) / 3, found;
    end if;
    definition := replace(definition, edits[i], edits[i + 1]);
  end loop;
  execute definition;
end
$patch$;

select pg_temp.patch(
  'public.terminate_employee_service(uuid, uuid, uuid, timestamp without time zone, text, text, uuid)',
  array[
    'at time zone location.timezone >= resolved_effective_at;',
    'at time zone location.timezone >= greatest(resolved_effective_at, now());',
    '1'
  ]
);

drop function pg_temp.patch(regprocedure, text[]);

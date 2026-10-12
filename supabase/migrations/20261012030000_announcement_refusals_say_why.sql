-- BL-1047: an announcement write refused with PT409 now says which kind of
-- refusal in its hint, the machine key the API passes on as `reason` (the
-- method of BL-1028). The editor showed the database's own words ("stale
-- announcement revision") because it had nothing else to go on. Only the hints
-- are added; every sentence, code and check stays as it was.
--   announcement.changed   the announcement moved on since the editor opened it
--                          (another edit, publish, unpublish, archive or restore):
--                          the editor's revision is old, reopen it
--   announcement.archived  an archived announcement cannot be edited
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
      raise exception 'announcement refusals say why: % no longer reads as this expects (anchor %, found % times)', fn, (i + 2) / 3, found;
    end if;
    definition := replace(definition, edits[i], edits[i + 1]);
  end loop;
  execute definition;
end
$patch$;

select pg_temp.patch('public.publish_announcement_service(uuid,uuid,uuid,integer)', array[
  '''stale announcement revision'' using errcode = ''PT409'';',
  '''stale announcement revision'' using errcode = ''PT409'', hint = ''announcement.changed'';', '1'
]);

select pg_temp.patch('public.save_announcement_audience_service(uuid,uuid,uuid,integer,text,text,text,text[],uuid[],timestamp with time zone,timestamp with time zone,text,uuid[],uuid[])', array[
  '''stale announcement revision'' using errcode = ''PT409'';',
  '''stale announcement revision'' using errcode = ''PT409'', hint = ''announcement.changed'';', '1',
  '''announcement can no longer be edited'' using errcode = ''PT409'';',
  '''announcement can no longer be edited'' using errcode = ''PT409'', hint = ''announcement.archived'';', '1'
]);

select pg_temp.patch('public.set_announcement_state_service(uuid,uuid,uuid,integer,text)', array[
  '''stale announcement revision'' using errcode = ''PT409'';',
  '''stale announcement revision'' using errcode = ''PT409'', hint = ''announcement.changed'';', '1'
]);

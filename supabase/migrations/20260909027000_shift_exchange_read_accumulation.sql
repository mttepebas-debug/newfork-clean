-- CLI-generated migration ordered after the existing 20260909026001 migration.
-- Keep request order and full per-actor output; serialize the case collection once.
-- No persistent cache, permission change or assignment mutation.
do $migration$
declare definition text; old_part text; new_part text;
begin
 definition:=pg_get_functiondef('public.shift_exchanges_read_service(uuid,uuid,boolean,date,date,uuid)'::regprocedure);
 for old_part,new_part in select * from (values
  ($old$cases jsonb:='[]'$old$,$new$case_items jsonb[]:='{}'$new$),
  ($old$cases:=cases||jsonb_build_array(jsonb_build_object($old$,$new$case_items:=array_append(case_items,jsonb_build_object($new$),
  ($old$'cases',cases$old$,$new$'cases',to_jsonb(case_items)$new$)
 ) changes(old_value,new_value) loop
  if length(definition)-length(replace(definition,old_part,'')) <> length(old_part) then
   raise exception 'Expected one request accumulation fragment: %',old_part;
  end if;
  definition:=replace(definition,old_part,new_part);
 end loop;
 execute definition;
end;
$migration$;

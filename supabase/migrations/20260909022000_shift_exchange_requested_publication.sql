-- Both sides must distinguish a current published assignment from a retained
-- request snapshot before an inbox reader can describe current responsibility.
do $migration$
declare definition text; needle text := $needle$'current_published',current_published,$needle$;
begin
 definition := pg_get_functiondef('public.shift_exchanges_read_service(uuid,uuid,boolean,date,date,uuid)'::regprocedure);
 if length(definition)-length(replace(definition,needle,'')) <> length(needle) then
  raise exception 'Expected exactly one current publication field in exchange reader';
 end if;
 definition := replace(definition,needle,needle || $addition$'requested_current_published',case when c.kind='swap' then public.shift_exchange_shift(w,c.requested_source_id) is not null else null end,$addition$);
 execute definition;
end;
$migration$;

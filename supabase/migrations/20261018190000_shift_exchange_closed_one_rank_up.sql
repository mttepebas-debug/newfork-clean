-- EXCHANGE-CLOSE-RANK (ILKELER P07, KARARLAR G1, K-S1): closing a shift change
-- asks the core one rank up, as approving and declining already do. Its owner
-- takes it back; otherwise who closes it outranks the owner at one of its
-- locations, the same test Requests draws its buttons with (can_manage). Before,
-- any manager of the location closed it: Can closed his peer Ayse's cover.
-- A peer still reads the case, with its buttons faded (G1).
--
-- The function changes on the definition the database holds (pg_get_functiondef):
-- the anchor must be found once, or nothing changes.

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
      raise exception 'EXCHANGE-CLOSE-RANK: % no longer reads as this expects (anchor %, found % times)', fn, (i + 2) / 3, found;
    end if;
    definition := replace(definition, edits[i], edits[i + 1]);
  end loop;
  execute definition;
end
$patch$;

select pg_temp.patch('public.shift_exchanges_command_service(uuid,uuid,jsonb,uuid)', array[
  E'   if not coalesce(owns,false) and not coalesce(manager,false) then raise exception ''Only the owner or a manager can close this search'' using errcode=''42501'',hint=''authz.out_of_scope''; end if;\n',
  E'   -- P07: a peer reads the case (G1) and does not close it; the reason comes from the core.\n'
  || E'   if not coalesce(owns,false) and not exists(select 1 from unnest(array_remove(array[(c.offered_snapshot->>''location_id'')::uuid,(c.requested_snapshot->>''location_id'')::uuid],null)) x\n'
  || E'    where app_private.exchange_decision_reason(actor,w,c.owner_id,null,x) is null) then\n'
  || E'    raise exception ''Only the owner or someone with a higher role can close this request'' using errcode=''42501'',detail=''exchange.approve'',hint=''authz.''||coalesce((select r from\n'
  || E'     unnest(array_remove(array[(c.offered_snapshot->>''location_id'')::uuid,(c.requested_snapshot->>''location_id'')::uuid],null)) x,\n'
  || E'     app_private.exchange_decision_reason(actor,w,c.owner_id,null,x) r where r<>''out_of_scope'' limit 1),''out_of_scope'');\n'
  || E'   end if;\n',
  '1'
]);

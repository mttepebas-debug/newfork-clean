-- ROL-CIFT 3.1, part 3 of 4 of one_decision_chain: split at function boundaries to go live in pieces;
-- runs after part 2, part 4 after it.
-- The owner's own time off follows the decision chain too (KARARLAR S-169; design §8.1): it waits for
-- the managers of the owner's locations or an admin like anybody's, and the owner decides it alone in
-- Requests only when nobody else can (part 1). Nothing records it approved at once any more, nor a
-- cancellation of the owner's own leave, so public.time_off_is_the_owners_own goes. The reminder that
-- no manager can decide a request goes to the admins, and to the owner only without one, as the
-- request itself does (part 1). Refusing to close a shift change says who may close it under the
-- chain: the person who asked or someone who decides it, not "someone with a higher role".
--
-- The functions change on the definition the database holds (pg_get_functiondef): each anchor must be
-- found once, or nothing changes.

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
      raise exception 'ROL-CIFT 3.1: % no longer reads as this expects (anchor %, found % times)', fn, (i + 2) / 3, found;
    end if;
    definition := replace(definition, edits[i], edits[i + 1]);
  end loop;
  execute definition;
end
$patch$;

select pg_temp.patch('public.submit_time_off_service(uuid,uuid,jsonb,text,text,uuid)', array[
  $a0$  -- The owner's own time off is recorded approved (K12, BL-221).
  if public.time_off_is_the_owners_own(actor, w, rid) then
    perform app_private.time_off_finalize(w, rid, 'approve', actor, '', true);
  end if;
$a0$,
  $b0$$b0$,
  '1'
]);

select pg_temp.patch('public.request_time_off_cancellation_service(uuid,uuid,uuid,integer,jsonb,text,uuid)', array[
  $a0$  if public.time_off_is_the_owners_own(actor, w, rid) then
    perform app_private.time_off_finalize(w, rid, 'approve', actor, '', true);
  end if;
$a0$,
  $b0$$b0$,
  '1'
]);

select pg_temp.patch('app_private.time_off_remind(uuid,uuid)', array[
  $a0$  alone := app_private.notify_holders(target_workspace, 'time_off.decide_alone', null, r.employee_id);
$a0$,
  $b0$  -- Past the managers, the admins; the owner only without one (KARARLAR S-169).
  alone := app_private.notify_deciders(target_workspace, 'time_off.decide', '{}', r.employee_id, 'time_off.decide_alone');
$b0$,
  '1'
]);

select pg_temp.patch('app_private.time_off_tell(uuid,uuid,text,uuid,text)', array[
  $a0$    -- The owner's own is recorded approved at once: nobody is asked.
$a0$,
  $b0$    -- A request settled before its notice asks nobody.
$b0$,
  '1'
]);

select pg_temp.patch('public.shift_exchanges_command_service(uuid,uuid,jsonb,uuid)', array[
  $a0$    raise exception 'Only the owner or someone with a higher role can close this request' using$a0$,
  $b0$    raise exception 'Only the person who asked or someone who decides this request can close it' using$b0$,
  '1'
]);

comment on column app_private.authz_actions.owner_target_ok is
  'With rank_below: a request of the owner''s own is decided like a lower rank''s, by whoever may decide the place. No action sets it since the decision chain (KARARLAR S-169).';

drop function public.time_off_is_the_owners_own(uuid, uuid, uuid);

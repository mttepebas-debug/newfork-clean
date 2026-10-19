-- ROL-CIFT 3.1, part 2 of 4 of one_decision_chain: split at function boundaries to go live in pieces;
-- runs after part 1, parts 3-4 after it.
-- The Requests reads and the approval preview follow the one decision helper (part 1). A reader's own
-- request is not in their Requests, open or closed (design §4.6): Dora, a manager who works at Kadikoy,
-- follows her own cover in the employee view and Can decides it; the owner whom nobody else can answer
-- finds their own there and decides it (KARARLAR S-169). The employee view tells, for each of the
-- person's own shifts, who a request for it would go to (decision_tier), so the request dialog can say
-- when nobody else can approve it. The approval preview says "a separate manager" to a side of it only.
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

select pg_temp.patch('public.shift_exchange_preview(uuid,uuid,uuid,uuid)', array[
  $a0$ if exists(select 1 from public.employee_profiles where workspace_id=w and user_id=actor and id in(c.owner_id,a.employee_id)) then problems:=array_append(problems,'A separate manager must approve your own exchange');
 -- D3: a peer manager reads the case and cannot decide it.
 elsif not exists(select 1 from unnest(array_remove(array[(c.offered_snapshot->>'location_id')::uuid,(c.requested_snapshot->>'location_id')::uuid],null)) x
  where app_private.exchange_decision_reason(actor,w,c.owner_id,a.employee_id,x) is null) then
  problems:=array_append(problems,'Someone with a higher role must approve this exchange'); end if;
$a0$,
  $b0$ -- Nobody decides their own, but the owner whom nobody else can answer (KARARLAR S-164, S-169).
 if not exists(select 1 from unnest(array_remove(array[(c.offered_snapshot->>'location_id')::uuid,(c.requested_snapshot->>'location_id')::uuid],null)) x
  where app_private.exchange_decision_reason(actor,w,c.owner_id,a.employee_id,x) is null) then
  problems:=array_append(problems,'A separate manager must approve your own exchange'); end if;
$b0$,
  '1'
]);

select pg_temp.patch('public.shift_exchanges_read_service(uuid,uuid,boolean,date,date,uuid)', array[
  $a0$ read_scope uuid[]:='{}';
$a0$,
  $b0$ read_scope uuid[]:='{}'; tiers jsonb:='{}';
$b0$,
  '1',
  $a1$   and not coalesce(app_private.shift_exchange_reached_managers(w,c.id),false)
   then continue; end if;
$a1$,
  $b1$   and not coalesce(app_private.shift_exchange_reached_managers(w,c.id),false)
   then continue; end if;
  -- Requests holds what its reader answers: their own request is not there (design §4.6), but for
  -- the owner whom nobody else can answer (KARARLAR S-169).
  if manager_view and (mine or exists(select 1 from public.shift_exchange_applications a where a.case_id=c.id and a.employee_id=emp.id))
   and not exists(select 1 from unnest(array_remove(array[(c.offered_snapshot->>'location_id')::uuid,(c.requested_snapshot->>'location_id')::uuid],null)) x
    where app_private.exchange_decision_reason(actor,w,c.owner_id,case when mine then null else emp.id end,x) is null)
   then continue; end if;
$b1$,
  '1',
  $a2$   if (s->>'employee_id')::uuid=emp.id then own_shifts:=own_shifts||jsonb_build_array(s); continue; end if;
$a2$,
  $b2$   if (s->>'employee_id')::uuid=emp.id then
    -- Who a request for it would go to (KARARLAR S-169): 'self_only' tells the owner nobody else can approve it.
    if not tiers ? (s->>'location_id') then
     tiers:=tiers||jsonb_build_object(s->>'location_id',app_private.decision_tier(w,emp.id,(s->>'location_id')::uuid));
    end if;
    own_shifts:=own_shifts||jsonb_build_array(s||jsonb_build_object('decision_tier',tiers->(s->>'location_id'))); continue;
   end if;
$b2$,
  '1'
]);

select pg_temp.patch('public.get_schedule_requests_closed_service(uuid,uuid,text[],uuid,text,integer,integer)', array[
  $a0$        or coalesce(app_private.shift_exchange_reached_managers(target_workspace_id, c.id), false))
$a0$,
  $b0$        or coalesce(app_private.shift_exchange_reached_managers(target_workspace_id, c.id), false))
   -- Requests holds what its reader answers: not their own (design §4.6), but for the owner whom
   -- nobody else can answer (KARARLAR S-169).
   and (not (coalesce(c.owner_id = emp_id, false)
             or exists (select 1 from public.shift_exchange_applications a where a.case_id = c.id and a.employee_id = emp_id))
        or exists (select 1 from unnest(array_remove(array[(c.offered_snapshot ->> 'location_id')::uuid,
                     (c.requested_snapshot ->> 'location_id')::uuid], null)) x
                   where app_private.exchange_decision_reason(actor_user_id, target_workspace_id, c.owner_id,
                     case when c.owner_id = emp_id then null else emp_id end, x) is null))
$b0$,
  '1'
]);

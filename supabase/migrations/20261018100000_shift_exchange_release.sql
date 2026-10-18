-- TAKAS-RELEASE: the first slice of the shift change plan (Mert, 2026-10-13/14,
-- PD\notes\vardiya-degisim\PLAN.md; slice chosen 2026-10-17). A release is one's
-- own shift put in the open pool: a cover asked of everyone eligible
-- (kind 'cover', audience 'eligible_pool'), as before. What changes:
--
--   pool       only a release reaches the pool. A published shift nobody holds
--              stays the manager's to fill (plan 06:43, 07:08); the open pickup
--              kind goes, and its rows with it (CLAUDE.md §3.A.4-5: live data is
--              test data).
--   4 hours    every request closes 4 hours before its shift, the earlier one in
--              a swap, and none opens after that (plan 04:54, 04:56).
--   not for me a teammate passes on a released shift: the card leaves their
--              Available Shifts, and nobody else learns it (plan 04:52). The pass
--              is a 'declined_by_employee' application on the pool request.
--   reasons    the owner takes a release back without a reason (Take back), and a
--              manager declines without one (plan 05:03; Mert, 2026-10-16).
--   note       a release carries an optional note for teammates, read by everyone
--              it reaches (plan 04:53, the release window). The private note for
--              the manager stays as it was.
--
-- Nobody is notified yet: the shift change notices come with their own slice
-- (KARARLAR S-126).

-- 0. A helper that edits a function by its own text --------------------------------

create or replace function pg_temp.patch(fn regprocedure, edits text[]) returns void
language plpgsql as $patch$
declare
  definition text := pg_get_functiondef(fn);
  i integer;
  found integer;
begin
  for i in 1 .. array_length(edits, 1) by 3 loop
    found := (length(definition) - length(replace(definition, edits[i], ''))) / length(edits[i]);
    if found <> edits[i + 2]::integer then
      raise exception '%: anchor % found % times', fn, (i + 2) / 3, found;
    end if;
    definition := replace(definition, edits[i], edits[i + 1]);
  end loop;
  execute definition;
end
$patch$;

-- 1. The open pickup goes ------------------------------------------------------------

delete from public.shift_exchange_votes v using public.shift_exchange_cases c
where v.case_id = c.id and c.kind = 'open_pickup';
delete from public.shift_exchange_events e using public.shift_exchange_cases c
where e.case_id = c.id and c.kind = 'open_pickup';
delete from public.shift_exchange_applications a using public.shift_exchange_cases c
where a.case_id = c.id and c.kind = 'open_pickup';
delete from public.shift_exchange_cases where kind = 'open_pickup';

alter table public.shift_exchange_cases
  drop constraint shift_exchange_cases_check1,
  drop constraint shift_exchange_cases_kind_check,
  add constraint shift_exchange_cases_kind_check check (kind in ('cover', 'swap')),
  alter column owner_id set not null;

alter table public.shift_exchange_cases
  add column teammate_note text not null default ''
    constraint shift_exchange_cases_teammate_note_check check (length(teammate_note) <= 200);
comment on column public.shift_exchange_cases.teammate_note is
  'A release''s note for teammates: everyone it reaches reads it (TAKAS-RELEASE).';

-- 2. The 4-hour mark -----------------------------------------------------------------

create function app_private.shift_exchange_deadline(s jsonb, t jsonb) returns timestamptz
language sql stable
set search_path = ''
as $$
  select least((s ->> 'starts_at')::timestamptz, (t ->> 'starts_at')::timestamptz) - interval '4 hours'
$$;
comment on function app_private.shift_exchange_deadline(jsonb, jsonb) is
  'When a shift change closes: 4 hours before its shift, the earlier one in a swap (TAKAS-RELEASE).';
revoke all on function app_private.shift_exchange_deadline(jsonb, jsonb) from public;

update public.shift_exchange_cases
set expires_at = app_private.shift_exchange_deadline(offered_snapshot, requested_snapshot), updated_at = now()
where status = 'open';

-- 3. Asking, passing, taking back, declining -------------------------------------------

CREATE OR REPLACE FUNCTION "public"."shift_exchanges_command_service"("actor" "uuid", "w" "uuid", "command" "jsonb", "idempotency_key" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare emp public.employee_profiles%rowtype; c public.shift_exchange_cases%rowtype; a public.shift_exchange_applications%rowtype;
 old_cmd public.shift_exchange_commands%rowtype; s jsonb; t jsonb; checked jsonb; result jsonb; fp text;
 action text:=command->>'action'; cid uuid:=(command->>'case_id')::uuid; aid uuid:=(command->>'application_id')::uuid;
 candidate uuid; loc uuid; other record; expires timestamptz; owns boolean; manager boolean;
 decides uuid[]:='{}'; fresh boolean:=false;
begin
 if idempotency_key is null then raise exception 'Idempotency key required'; end if;
 -- The core says who may act (FB-6.4 A2): one's own offer and application,
 -- never while restricted (D4); a decision on a case is asked below, per case.
 perform app_private.authorize(actor,w,case when action in('apply','pass','accept','decline','withdraw') then 'exchange.apply_own' else 'exchange.offer_own' end);
 perform pg_advisory_xact_lock(hashtextextended(w::text,921));
 select * into old_cmd from public.shift_exchange_commands q where q.workspace_id=w and q.actor_user_id=actor and q.idempotency_key=shift_exchanges_command_service.idempotency_key;
 if old_cmd.idempotency_key is not null then
  if old_cmd.command<>command then raise exception 'Idempotency key was used for another action' using errcode='22023'; end if;
  return old_cmd.result;
 end if;
 select * into emp from public.employee_profiles where workspace_id=w and user_id=actor and archived_at is null;
 if action in('create','apply','pass') then
  if emp.id is null then raise exception 'Employee profile required' using errcode='42501',hint='authz.out_of_scope'; end if;
  s:=public.shift_exchange_shift(w,(command->>'shift_id')::uuid);
  if s is null or (s->>'starts_at')::timestamptz<=clock_timestamp() then raise exception 'Choose an upcoming published shift' using errcode='PT409'; end if;
  if action='create' then
   if (s->>'employee_id')::uuid is distinct from emp.id then raise exception 'Only the current owner can offer this shift' using errcode='42501',hint='authz.out_of_scope'; end if;
   if command->>'kind' not in('cover','swap') then raise exception 'Invalid exchange kind'; end if;
   if command->>'kind'='swap' then
    t:=public.shift_exchange_shift(w,(command->>'requested_shift_id')::uuid);
    if t is null or t->>'employee_id' is null or t->>'employee_id'=emp.id::text or (t->>'starts_at')::timestamptz<=clock_timestamp() then raise exception 'Choose an upcoming teammate shift'; end if;
    candidate:=(t->>'employee_id')::uuid;
    perform public.require_weekly_exchange_employee_warning(actor,w,emp.id,t,command);
    if app_private.eligibility(w,emp.id,t,jsonb_build_object('operation','swap','excluded',jsonb_build_array(s->>'id',t->>'id')))->>'status'<>'eligible' then raise exception 'You are not eligible for the teammate shift'; end if;
   else candidate:=(command->>'employee_id')::uuid; end if;
   if candidate=emp.id then raise exception 'Choose a different teammate'; end if;
   if candidate is not null and app_private.eligibility(w,candidate,s,jsonb_build_object('operation',case when t is null then 'cover_accept' else 'swap' end,'excluded',to_jsonb(array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null))))->>'status'<>'eligible' then raise exception 'This teammate is not eligible for the full shift'; end if;
   for other in select x.id,public.shift_exchange_live_status(w,x.id) live_status from public.shift_exchange_cases x
    where x.workspace_id=w and x.status='open' and x.offered_source_id=(s->>'source_id')::uuid loop
    if other.live_status<>'open' then
     update public.shift_exchange_cases set status=other.live_status,revision=revision+1,updated_at=now() where id=other.id;
     update public.shift_exchange_applications set status=other.live_status,updated_at=now() where case_id=other.id and status in('invited','pending_manager');
     delete from public.shift_exchange_votes where case_id=other.id;
     perform public.shift_exchange_emit(actor,w,other.id,null,other.live_status,'This offer ended because the shift changed or started. Review the current schedule before making a new request.');
    end if;
   end loop;
   fp:=public.shift_exchange_fingerprint(w,s,t);
   -- Nothing opens in the last 4 hours before the shift (plan 04:56).
   expires:=app_private.shift_exchange_deadline(s,t);
   if expires<=clock_timestamp() then raise exception 'Too close to the shift. Talk to your manager.' using errcode='PT409',hint='exchange.too_close'; end if;
   insert into public.shift_exchange_cases(workspace_id,kind,audience,offered_source_id,requested_source_id,owner_id,offered_snapshot,requested_snapshot,consent_fingerprint,expires_at,private_note,teammate_note,created_by)
   values(w,command->>'kind',case when candidate is null then 'eligible_pool' else 'direct' end,(s->>'source_id')::uuid,(t->>'source_id')::uuid,emp.id,s,t,fp,expires,coalesce(command->>'note',''),
    case when candidate is null then coalesce(trim(command->>'teammate_note'),'') else '' end,actor) returning * into c;
   cid:=c.id;
   if candidate is not null then
    insert into public.shift_exchange_applications(workspace_id,case_id,employee_id,status,consent_fingerprint) values(w,cid,candidate,'invited',fp) returning id into aid;
   end if;
   perform public.shift_exchange_emit(actor,w,cid,aid,case when candidate is null then 'cover_opened' else 'peer_invited' end,'Cover or swap requested. The current owner remains responsible until manager approval.');
  else
   if (s->>'employee_id')::uuid=emp.id then raise exception 'You already own this shift'; end if;
   select * into c from public.shift_exchange_cases where workspace_id=w and offered_source_id=(s->>'source_id')::uuid and status='open' for update;
   -- Only a release reaches the pool: a shift nobody holds stays the manager's (plan 07:08).
   if c.id is null then raise exception 'This shift has not been released'; end if;
   if c.audience<>'eligible_pool' or c.kind='swap' or (cid is not null and cid<>c.id) then raise exception 'This offer is not available' using errcode='42501',hint='authz.out_of_scope'; end if;
   if c.expires_at<=clock_timestamp() then raise exception 'This request closed 4 hours before the shift' using errcode='PT409'; end if;
   cid:=c.id;
   if action='pass' then
    -- Not for me (plan 04:52): the card leaves this person's Available Shifts. Only
    -- they read it; the request itself does not change, so the owner's Take back holds.
    -- One passes only on a card one is shown: eligible, or held back by approved time off alone.
    checked:=app_private.eligibility(w,emp.id,s,'{"operation":"release_pickup"}');
    if checked->>'status'<>'eligible' and exists(select 1 from jsonb_array_elements(checked->'blockers') b where b->>'code'<>'approved_time_off') then
     raise exception 'This offer is not available' using errcode='42501',hint='authz.out_of_scope';
    end if;
    if not exists(select 1 from public.shift_exchange_applications where case_id=cid and employee_id=emp.id and status='declined_by_employee') then
     insert into public.shift_exchange_applications(workspace_id,case_id,employee_id,status,consent_fingerprint) values(w,cid,emp.id,'declined_by_employee',c.consent_fingerprint);
    end if;
   else
    if public.shift_exchange_fingerprint(w,s,null)<>c.consent_fingerprint then raise exception 'Shift conditions changed. The owner must renew this offer' using errcode='PT409'; end if;
    perform public.require_weekly_exchange_employee_warning(actor,w,emp.id,s,command);
    if app_private.eligibility(w,emp.id,s,'{"operation":"release_pickup"}')->>'status'<>'eligible' then raise exception 'You are not eligible for the full shift'; end if;
    if exists(select 1 from public.shift_exchange_applications where case_id=cid and employee_id=emp.id and status='pending_manager') then raise exception 'You already have an active application'; end if;
    insert into public.shift_exchange_applications(workspace_id,case_id,employee_id,status,consent_fingerprint) values(w,cid,emp.id,'pending_manager',c.consent_fingerprint) returning id into aid;
    update public.shift_exchange_cases set revision=revision+1,updated_at=now() where id=cid returning * into c;
    perform public.shift_exchange_emit(actor,w,cid,aid,'application_submitted','A teammate requested this shift. The current owner remains responsible.');
   end if;
  end if;
 else
  select * into c from public.shift_exchange_cases where id=cid and workspace_id=w for update;
  if c.id is null then raise exception 'Request not found' using errcode='P0002'; end if;
  s:=public.shift_exchange_shift(w,c.offered_source_id); t:=public.shift_exchange_shift(w,c.requested_source_id);
  owns:=c.owner_id=emp.id;
  manager:=app_private.authz_reason(actor,w,'exchange.approve',array[(c.offered_snapshot->>'location_id')::uuid]) is null
   or (c.kind='swap' and app_private.authz_reason(actor,w,'exchange.approve',array[(c.requested_snapshot->>'location_id')::uuid]) is null);
  -- A pass on a release is no request of one's own (TAKAS-RELEASE).
  if not coalesce(owns,false) and not coalesce(manager,false) and not exists(select 1 from public.shift_exchange_applications ap where ap.case_id=cid and ap.employee_id=emp.id and (ap.status<>'declined_by_employee' or c.audience='direct')) then raise exception 'Request access denied' using errcode='42501',hint='authz.out_of_scope'; end if;
  if c.status<>'open' or c.revision is distinct from (command->>'expected_revision')::integer then raise exception 'This request changed. Review the latest details' using errcode='PT409'; end if;
  if c.expires_at<=clock_timestamp() then
   update public.shift_exchange_cases set status='expired',revision=revision+1,updated_at=now() where id=cid returning * into c;
   update public.shift_exchange_applications set status='expired',updated_at=now() where case_id=cid and status in('invited','pending_manager');
   delete from public.shift_exchange_votes where case_id=cid;
   perform public.shift_exchange_emit(null,w,cid,null,'expired','This request closed 4 hours before the shift. The current owner remains responsible.');
  elsif public.shift_exchange_live_status(w,cid)='invalidated' then
   update public.shift_exchange_cases set status='invalidated',revision=revision+1,updated_at=now() where id=cid returning * into c;
   update public.shift_exchange_applications set status='invalidated',updated_at=now() where case_id=cid and status in('invited','pending_manager');
   delete from public.shift_exchange_votes where case_id=cid;
   perform public.shift_exchange_emit(actor,w,cid,null,'invalidated','Shift details changed. This offer ended without a transfer. Start a new request from the current schedule.');
  elsif action='close' then
   if not coalesce(owns,false) and not coalesce(manager,false) then raise exception 'Only the owner or a manager can close this search' using errcode='42501',hint='authz.out_of_scope'; end if;
   update public.shift_exchange_cases set status='cancelled',revision=revision+1,updated_at=now() where id=cid returning * into c;
   -- Take back needs no reason (plan 04:52); the owner keeps the shift.
   update public.shift_exchange_applications set status='closed_case_cancelled',reason=coalesce(trim(command->>'reason'),''),updated_at=now() where case_id=cid and status in('invited','pending_manager');
   perform public.shift_exchange_emit(actor,w,cid,null,'case_closed',coalesce(nullif(trim(command->>'reason'),''),
    case when coalesce(owns,false) then 'Taken back. The owner keeps this shift.' else 'A manager closed this request. The owner keeps this shift.' end),coalesce(command->>'private_note',''));
  else
   select * into a from public.shift_exchange_applications where id=aid and case_id=cid and workspace_id=w for update;
   if a.id is null or a.status not in('invited','pending_manager') then raise exception 'This application is no longer active' using errcode='PT409'; end if;
   if action in('accept','decline','withdraw') then
    if a.employee_id is distinct from emp.id then raise exception 'Only the invited employee can respond' using errcode='42501',hint='authz.out_of_scope'; end if;
    if action in('accept','decline') and a.status<>'invited' then raise exception 'This invitation already has a response'; end if;
    if action='accept' then
     if public.shift_exchange_fingerprint(w,s,t) is distinct from c.consent_fingerprint then raise exception 'Shift conditions changed. Ask for a new offer' using errcode='PT409'; end if;
     perform public.require_weekly_exchange_employee_warning(actor,w,emp.id,s,command);
     if app_private.eligibility(w,emp.id,s,jsonb_build_object('operation',case when c.kind='swap' then 'swap' when c.audience='direct' then 'cover_accept' else 'release_pickup' end,'excluded',to_jsonb(array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null))))->>'status'<>'eligible'
      or (c.kind='swap' and app_private.eligibility(w,c.owner_id,t,jsonb_build_object('operation','swap','excluded',jsonb_build_array(s->>'id',t->>'id')))->>'status'<>'eligible') then raise exception 'Both employees must be eligible for the full exchange'; end if;
    end if;
    update public.shift_exchange_applications set status=case action when 'accept' then 'pending_manager' when 'decline' then 'declined_by_employee' else 'withdrawn' end,
     updated_at=now() where id=aid;
    delete from public.shift_exchange_votes where case_id=cid and application_id=aid;
    if c.audience='direct' and action in('decline','withdraw') then update public.shift_exchange_cases set status='cancelled' where id=cid; end if;
    perform public.shift_exchange_emit(actor,w,cid,aid,case action when 'accept' then 'peer_accepted' when 'decline' then 'peer_declined' else 'application_withdrawn' end,
     case action when 'accept' then 'Accepted. Awaiting manager approval; the original owner remains responsible.' when 'decline' then 'The teammate declined. No assignment changed.' else case when c.audience='direct' then 'The employee withdrew consent. This request ended without a transfer.' else 'The application was withdrawn. Other candidates remain available.' end end);
   elsif action in('reject','approve') then
    -- D3, K-S1, P07: a manager decides, approve or reject, where they outrank
    -- both people who change shifts; nobody decides their own.
    decides:=array(select x from unnest(array_remove(array[(c.offered_snapshot->>'location_id')::uuid,(c.requested_snapshot->>'location_id')::uuid],null)) x
     where app_private.exchange_decision_reason(actor,w,c.owner_id,a.employee_id,x) is null);
    if cardinality(decides)=0 then
     raise exception 'Not allowed' using errcode='42501',detail='exchange.approve',hint='authz.'||coalesce((select r from
      unnest(array_remove(array[(c.offered_snapshot->>'location_id')::uuid,(c.requested_snapshot->>'location_id')::uuid],null)) x,
      app_private.exchange_decision_reason(actor,w,c.owner_id,a.employee_id,x) r where r<>'out_of_scope' limit 1),'out_of_scope');
    end if;
    if action='reject' then
     -- The reason is optional; when given, the employee reads it (plan 05:03; Mert, 2026-10-16).
     update public.shift_exchange_applications set status='rejected_by_manager',reason=coalesce(trim(command->>'reason'),''),updated_at=now() where id=aid;
     delete from public.shift_exchange_votes where case_id=cid and application_id=aid;
     if c.audience='direct' then update public.shift_exchange_cases set status='cancelled' where id=cid; end if;
     perform public.shift_exchange_emit(actor,w,cid,aid,'application_rejected',coalesce(nullif(trim(command->>'reason'),''),'Your manager declined this request.'),coalesce(command->>'private_note',''));
    else
     checked:=public.shift_exchange_preview(actor,w,cid,aid);
     if not (checked->>'allowed')::boolean then raise exception '%',checked->'reasons' using errcode='PT409'; end if;
     if command->>'fingerprint' is distinct from checked->>'fingerprint' then raise exception 'This approval preview changed. Review the latest details' using errcode='PT409'; end if;
     fp:=checked->>'fingerprint';
     for loc in select distinct x from unnest(array[(s->>'location_id')::uuid,(t->>'location_id')::uuid]) x where x is not null loop
      if loc=any(decides) then
       fresh:=fresh or not exists(select 1 from public.shift_exchange_votes v where v.case_id=cid and v.location_id=loc
        and v.application_id=aid and v.actor_user_id=actor and v.fingerprint=fp);
       insert into public.shift_exchange_votes(case_id,workspace_id,application_id,location_id,actor_user_id,fingerprint) values(cid,w,aid,loc,actor,fp)
       on conflict(case_id,location_id) do update set application_id=excluded.application_id,actor_user_id=excluded.actor_user_id,fingerprint=excluded.fingerprint,created_at=now();
      end if;
     end loop;
     if (checked->>'requires_other_manager')::boolean then
      -- R2-18: the same manager approving again tells nobody again.
      if fresh then
       perform public.shift_exchange_emit(actor,w,cid,aid,'scope_approved','One location approved. Awaiting the other manager; assignments are unchanged.');
      end if;
     else
      perform 1 from public.schedule_published_shifts where id in((s->>'id')::uuid,(t->>'id')::uuid) order by id for update;
      -- Recheck after row locks as external Schedule writers may predate the shared workspace lock.
      checked:=public.shift_exchange_preview(actor,w,cid,aid);
      if not (checked->>'allowed')::boolean or checked->>'fingerprint'<>fp then raise exception 'Schedule changed during approval' using errcode='PT409'; end if;
      perform public.record_weekly_exchange_acceptance(w,cid,aid);
      -- BL-092: the two sides of a swap are one change for the assignment guard,
      -- in the publication and in the drafts reconciled after it.
      perform set_config('newfork.shift_exchange_scope',jsonb_build_object('workspace_id',w,'shift_ids',to_jsonb(array_remove(array[(s->>'source_id')::uuid,(t->>'source_id')::uuid],null)))::text,true);
      update public.schedule_published_shifts set employee_id=a.employee_id where id=(s->>'id')::uuid;
      if c.kind='swap' then update public.schedule_published_shifts set employee_id=c.owner_id where id=(t->>'id')::uuid; end if;
      perform public.shift_exchange_reconcile_batch(actor,w,jsonb_build_array(s||jsonb_build_object('new_employee_id',a.employee_id))||case when c.kind='swap' then jsonb_build_array(t||jsonb_build_object('new_employee_id',c.owner_id)) else '[]'::jsonb end);
      perform set_config('newfork.shift_exchange_scope','',true);
      
      update public.shift_exchange_applications set status='approved',updated_at=now() where id=aid;
      for other in select id from public.shift_exchange_applications where case_id=cid and id<>aid and status in('invited','pending_manager') loop
       update public.shift_exchange_applications set status='closed_other_selected',updated_at=now() where id=other.id;
       perform public.shift_exchange_emit(actor,w,cid,other.id,'other_selected','Another teammate was selected. Your schedule has not changed.');
      end loop;
      update public.shift_exchange_cases set status='completed' where id=cid;
      perform public.shift_exchange_emit(actor,w,cid,aid,'transfer_completed','Manager approved the transfer. The receiving employee is now responsible; the previous owner is released.',coalesce(command->>'private_note',''));
      for other in select x.id from public.shift_exchange_cases x where x.workspace_id=w and x.status='open' and x.id<>cid
       and (x.offered_source_id in(c.offered_source_id,c.requested_source_id) or x.requested_source_id in(c.offered_source_id,c.requested_source_id)) loop
       update public.shift_exchange_cases set status='invalidated',revision=revision+1,updated_at=now() where id=other.id;
       update public.shift_exchange_applications set status='invalidated',updated_at=now() where case_id=other.id and status in('invited','pending_manager');
       perform public.shift_exchange_emit(actor,w,other.id,null,'invalidated','An involved shift changed owner. Start a new request using the current schedule.');
      end loop;
     end if;
    end if;
   else raise exception 'Unknown exchange action'; end if;
   -- BL-228: when it was decided, not when its transaction began; an approval
   -- that waited for the workspace lock behind a publish is newer than it.
   update public.shift_exchange_cases set revision=revision+1,updated_at=clock_timestamp() where id=cid returning * into c;
  end if;
 end if;
 -- A pass changes nothing anyone else reads, so it tells nobody.
 if action<>'pass' then
  perform realtime.send(jsonb_build_object('workspace_id',w,'case_id',cid,'revision',c.revision),'changed','shift-exchanges:'||w::text,true);
 end if;
 result:=jsonb_build_object('case_id',cid,'status',c.status,'revision',c.revision);
 insert into public.shift_exchange_commands(workspace_id,actor_user_id,idempotency_key,command,result) values(w,actor,idempotency_key,command,result);
 return result;
end; $$;


-- 4. Shift Hub lists only released shifts, minus the ones one passed on --------------

CREATE OR REPLACE FUNCTION "public"."shift_exchanges_read_service"("actor" "uuid", "w" "uuid", "manager_view" boolean DEFAULT false, "from_date" "date" DEFAULT CURRENT_DATE, "to_date" "date" DEFAULT (CURRENT_DATE + 42), "focused_case_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare emp public.employee_profiles%rowtype; c public.shift_exchange_cases%rowtype; s jsonb; t jsonb; allowed boolean; mine boolean;
 case_items jsonb[]:='{}'; opportunities jsonb:='[]'; own_shifts jsonb:='[]'; chk jsonb; shift_row record; live_status text; published_cache jsonb:='{}'; source_key text;
 read_scope uuid[]:='{}';
begin
 if to_date<from_date or to_date>from_date+62 then raise exception 'Choose a date range up to 62 days'; end if;
 if not manager_view then perform app_private.authorize(actor,w,'employee_hub.read'); end if;
 select * into emp from public.employee_profiles where workspace_id=w and user_id=actor and archived_at is null;
 if not manager_view and emp.id is null then raise exception 'Employee profile required' using errcode='42501',hint='authz.out_of_scope'; end if;
 if manager_view then
  read_scope:=app_private.scope_set(actor,w,'exchange.read');
  -- Nowhere to read requests: asked with no location, the core says why; with
  -- no live location in the workspace there is nothing to read.
  if cardinality(read_scope)=0 and (app_private.authz_reason(actor,w,'exchange.read') is distinct from 'out_of_scope'
   or exists(select 1 from public.locations l where l.workspace_id=w and l.deleted_at is null)) then
   perform app_private.authorize(actor,w,'exchange.read');
  end if;
 end if;
 for c in select * from public.shift_exchange_cases x where x.workspace_id=w and (x.status='open' or x.id=focused_case_id
  or (x.offered_snapshot->>'date')::date between from_date and to_date
  or (x.requested_snapshot->>'date')::date between from_date and to_date
  or exists(select 1 from public.schedule_published_shifts p
   join public.schedule_location_publications pub on pub.id=p.publication_id and pub.status='current'
   where p.workspace_id=w and coalesce(p.source_shift_id,p.id) in(x.offered_source_id,x.requested_source_id)
   and p.scheduled_date between from_date and to_date)) order by x.expires_at,x.created_at loop
  allowed:=manager_view and coalesce((c.offered_snapshot->>'location_id')::uuid=any(read_scope) or (c.kind='swap' and (c.requested_snapshot->>'location_id')::uuid=any(read_scope)),false);
  mine:=coalesce(c.owner_id=emp.id,false);
  if not allowed and not mine and not exists(select 1 from public.shift_exchange_applications a where a.case_id=c.id and a.employee_id=emp.id and (a.status<>'declined_by_employee' or c.audience='direct')) then continue; end if;
  -- A swap or a cover reaches a manager once both sides agreed (Mert, 2026-10-11):
  -- somebody asks for the shift, or the teammate accepted the swap.
  if manager_view and not mine
   and not exists(select 1 from public.shift_exchange_applications a where a.case_id=c.id and a.employee_id=emp.id and (a.status<>'declined_by_employee' or c.audience='direct'))
   and not coalesce(app_private.shift_exchange_reached_managers(w,c.id),false)
   then continue; end if;
  -- Repeated historical requests refer to the same published source. Resolve
  -- each source once in this read only; no cache survives the function call.
  foreach source_key in array array_remove(array[c.offered_source_id::text,c.requested_source_id::text],null) loop
   if not published_cache ? source_key then
    published_cache:=published_cache||jsonb_build_object(source_key,public.shift_exchange_shift(w,source_key::uuid));
   end if;
  end loop;
  s:=nullif(published_cache->c.offered_source_id::text,'null'::jsonb);
  t:=nullif(published_cache->c.requested_source_id::text,'null'::jsonb);
  live_status:=public.shift_exchange_live_status(w,c.id);
  -- The list follows the displayed dates on either side; in Requests an open
  -- request is listed whatever its date (BL-839). A focused deep link bypasses
  -- only the range, never the actor checks above.
  if c.id is distinct from focused_case_id and not (manager_view and live_status='open') and not (
   coalesce((coalesce(s,c.offered_snapshot)->>'date')::date between from_date and to_date,false)
   or coalesce((coalesce(t,c.requested_snapshot)->>'date')::date between from_date and to_date,false)
  ) then continue; end if;
  case_items:=array_append(case_items,app_private.shift_exchange_case_item(actor,w,c,allowed,emp.id,s,t,live_status));
 end loop;
 if not manager_view then
  for shift_row in select p.id from public.schedule_published_shifts p join public.schedule_location_publications pub on pub.id=p.publication_id and pub.status='current'
   where p.workspace_id=w and p.scheduled_date between from_date and to_date order by p.scheduled_date,p.start_time loop
   s:=public.shift_exchange_shift(w,shift_row.id);
   if (s->>'starts_at')::timestamptz<=clock_timestamp() then continue; end if;
   if (s->>'employee_id')::uuid=emp.id then own_shifts:=own_shifts||jsonb_build_array(s); continue; end if;
   -- Only a release is in the pool (plan 07:08), and not one this person passed on (04:52).
   select * into c from public.shift_exchange_cases where workspace_id=w and offered_source_id=(s->>'source_id')::uuid and status='open' and expires_at>clock_timestamp() and audience='eligible_pool' and kind<>'swap';
   if c.id is null or exists(select 1 from public.shift_exchange_applications a where a.case_id=c.id and a.employee_id=emp.id and a.status='declined_by_employee') then continue; end if;
   chk:=(app_private.eligibility(w,emp.id,s,'{"operation":"release_pickup"}')-'approval_flags')||jsonb_build_object('availability_warning',public.weekly_exchange_employee_warning(w,emp.id,s));
   if (chk->>'status'='eligible' or (chk->>'status'='ineligible' and not exists(select 1 from jsonb_array_elements(chk->'blockers') b
     where b->>'code'<>'approved_time_off'))) and c.consent_fingerprint=public.shift_exchange_fingerprint(w,s,null) then
    opportunities:=opportunities||jsonb_build_array(jsonb_build_object('case_id',c.id,'shift',s,'eligibility',chk,'note',c.teammate_note));
   end if;
  end loop;
 end if;
 return jsonb_build_object('employee_id',emp.id,'cases',to_jsonb(case_items),'opportunities',opportunities,'own_shifts',own_shifts);
end; $$;


-- 5. The rest follows: no open pickup, the 4-hour mark, passes stay private ------------

select pg_temp.patch('app_private.shift_exchange_case_item(uuid, uuid, public.shift_exchange_cases, boolean, uuid, jsonb, jsonb, text)', array[
  $a$case when c.kind in ('swap','open_pickup') then c.kind when$a$, $a$case when c.kind='swap' then 'swap' when$a$, '1',
  $a$where a.case_id=c.id and (allowed or mine or a.employee_id=emp_id);$a$,
  $a$where a.case_id=c.id and (allowed or mine or a.employee_id=emp_id) and (a.status<>'declined_by_employee' or c.audience='direct');$a$, '1',
  $a$'is_owner',mine,$a$, $a$'is_owner',mine,'teammate_note',c.teammate_note,$a$, '1'
]);

select pg_temp.patch('app_private.shift_exchange_reached_managers(uuid, uuid)', array[
  $a$select c.kind = 'open_pickup' or case$a$, $a$select case$a$, '1'
]);

select pg_temp.patch('app_private.eligibility(uuid, uuid, jsonb, jsonb)', array[
  $a$op not in ('swap','release_pickup','open_pickup','cover_accept')$a$, $a$op not in ('swap','release_pickup','cover_accept')$a$, '1'
]);

select pg_temp.patch('public.record_weekly_exchange_acceptance(uuid, uuid, uuid)', array[
  $a$case when c.kind in ('swap','open_pickup') then c.kind when$a$, $a$case when c.kind='swap' then 'swap' when$a$, '1'
]);

select pg_temp.patch('public.refresh_weekly_exchange_terms(uuid, uuid)', array[
  $a$case when c.kind in ('swap','open_pickup') then c.kind when$a$, $a$case when c.kind='swap' then 'swap' when$a$, '1',
  $a$deadline:=coalesce(least((s->>'starts_at')::timestamptz,(t->>'starts_at')::timestamptz),c.expires_at);$a$,
  $a$deadline:=coalesce(app_private.shift_exchange_deadline(s,t),c.expires_at);$a$, '1',
  $a$'The updated shift has already started. This request closed without a transfer. Check your current schedule.'$a$,
  $a$'The updated shift starts within 4 hours. This request closed without a transfer. Check your current schedule.'$a$, '1'
]);

select pg_temp.patch('public.shift_exchange_preview(uuid, uuid, uuid, uuid)', array[
  $a$case when c.kind in ('swap','open_pickup') then c.kind when$a$, $a$case when c.kind='swap' then 'swap' when$a$, '1',
  $a$if c.expires_at<=clock_timestamp() or (s->>'starts_at')::timestamptz<=clock_timestamp() or (t->>'starts_at')::timestamptz<=clock_timestamp() then problems:=array_append(problems,'This shift has already started'); end if;$a$,
  $a$if c.expires_at<=clock_timestamp() then problems:=array_append(problems,'This request closed 4 hours before the shift');
 elsif (s->>'starts_at')::timestamptz<=clock_timestamp() or (t->>'starts_at')::timestamptz<=clock_timestamp() then problems:=array_append(problems,'This shift has already started'); end if;$a$, '1'
]);

-- Requests -> Closed counts a pass as no request of one's own, and never finds a passer by name.
select pg_temp.patch('public.get_schedule_requests_closed_service(uuid, uuid, text[], uuid, text, integer, integer)', array[
  $a$exists (select 1 from public.shift_exchange_applications a where a.case_id = c.id and a.employee_id = emp_id)$a$,
  $a$exists (select 1 from public.shift_exchange_applications a where a.case_id = c.id and a.employee_id = emp_id
         and (a.status <> 'declined_by_employee' or c.audience = 'direct'))$a$, '2',
  $a$where a.case_id = c.id and (a.employee_id = emp_id or c.owner_id = emp_id$a$,
  $a$where a.case_id = c.id and (a.status <> 'declined_by_employee' or c.audience = 'direct') and (a.employee_id = emp_id or c.owner_id = emp_id$a$, '1'
]);

select pg_temp.patch('public.shift_exchange_guard_commit_deadline()', array[
  $a$'The shift started before this approval could finish. No transfer was made. Refresh the request.'$a$,
  $a$'This request closed 4 hours before the shift, before this approval could finish. No transfer was made. Refresh the request.'$a$, '1'
]);

-- A draft that misses an approved change names who handed it to whom; an open
-- pickup has no previous owner any more.
select pg_temp.patch('public.shift_exchange_draft_undoes(uuid, uuid, uuid[], uuid[], boolean)', array[
  $a$'message',case when x.from_id is null
     then coalesce(x.to_name,'A teammate')||' picked up this open shift after the schedule was last published, and this draft does not have it. Publishing would undo it.'
     else 'This shift was '$a$, $a$'message','This shift was '$a$, '1',
  $a$Publishing would undo it.' end)$a$, $a$Publishing would undo it.')$a$, '1'
]);

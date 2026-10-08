-- Shift Hub asks the authorization core (FB-6.4 A2, EKRAN-02 A2).
--   D3, P07  a shift change is decided one rank above both people who change
--            shifts, at the shift's location; nobody decides their own, and a
--            manager neither approves nor rejects a case of their own (BL-726).
--   K-S1     the owner's own change goes to whoever decides the place: the
--            location's manager or an admin (authz_actions.owner_target_ok).
--   D4       somebody restricted neither offers, applies nor accepts.
--   K-S4     the review notice goes to the location's managers who decide it;
--            admins and the owner hear only where no manager may.
--   K-S5     a case's private notes reach only those who decide it.
--   R2-18    a manager approving again tells nobody again.
--   every refusal says why (42501 + authz.*); the three Schedule helpers go.

alter table app_private.authz_actions
  add column owner_target_ok boolean not null default false;
comment on column app_private.authz_actions.owner_target_ok is
  'With rank_below: a request of the owner''s own is decided like a lower rank''s, by whoever may decide the place; never by the owner (EKRAN-02 K-S1).';
update app_private.authz_actions set owner_target_ok = true where key = 'exchange.approve';

CREATE OR REPLACE FUNCTION app_private.authz_check(state app_private.actor_state, rule_row app_private.authz_actions, target_locations uuid[], target_person uuid, target_user uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_workspace uuid;
  person uuid := target_person;
  whose uuid;
  target_access public.workspace_role;
  target_is_self boolean;
  places uuid[];
  reach text;
begin
  if state.user_id is null then
    return 'not_member';
  end if;
  if rule_row.scope_class = 'account' then
    -- An account action is about one's own account.
    if target_user is not null and target_user is distinct from state.user_id then
      return 'out_of_scope';
    end if;
    return null;
  end if;
  if state.membership_id is null then
    return 'not_member';
  end if;
  if not state.workspace_open then
    return 'workspace_closed';
  end if;

  if person is not null then
    select profile.workspace_id, profile.user_id into target_workspace, whose
    from public.employee_profiles profile
    where profile.id = person;
    if target_workspace is distinct from state.workspace_id then
      return 'out_of_scope';
    end if;
  end if;
  if target_user is not null then
    if person is not null and whose is distinct from target_user then
      return 'out_of_scope';
    end if;
    whose := target_user;
    if person is null then
      select profile.id into person
      from public.employee_profiles profile
      where profile.workspace_id = state.workspace_id
        and profile.user_id = target_user
        and profile.archived_at is null;
      if person is null and not exists (
        select 1 from public.workspace_memberships membership
        where membership.workspace_id = state.workspace_id and membership.user_id = target_user
      ) then
        return 'out_of_scope';
      end if;
    end if;
  end if;
  target_is_self := coalesce(whose = state.user_id, false);

  -- Their own row is theirs to read in any state.
  if rule_row.self_ok and target_is_self then
    return null;
  end if;

  if state.status = 'pending_activation' then
    if not rule_row.restricted_ok then
      return 'not_active';
    end if;
  elsif state.status <> 'active' then
    return 'not_active';
  elsif state.document_blocked and not rule_row.restricted_ok then
    return 'document_blocked';
  end if;

  if rule_row.scope_class = 'own' then
    -- One's own availability is an employee's (M13): a manager, an admin or
    -- the owner has no own record of that kind.
    if rule_row.employee_target and state.class <> 'employee' then
      return 'rank';
    end if;
    if (person is null and whose is null) or target_is_self then
      return null;
    end if;
    return 'out_of_scope';
  end if;

  if rule_row.owner_only and state.class <> 'owner' then
    return 'owner_only';
  end if;
  -- The owner holds every permission.
  if state.class <> 'owner'
     and rule_row.permission_key is not null
     and not rule_row.permission_key = any (state.permissions) then
    return 'missing_permission';
  end if;
  if state.class = 'employee' then
    return 'missing_permission';
  end if;

  if rule_row.no_self and target_is_self then
    return 'rank';
  end if;
  -- A manager's own record goes one level up; owners and admins keep theirs
  -- (user decision 2026-09-24, 2A).
  if rule_row.rank_below and target_is_self and state.class not in ('owner', 'admin') then
    return 'rank';
  end if;
  if rule_row.rank_below and (person is not null or whose is not null) and not target_is_self then
    select role.access_class into target_access
    from public.workspace_memberships membership
    join public.workspace_roles role
      on role.id = membership.role_id and role.workspace_id = membership.workspace_id
    where membership.workspace_id = state.workspace_id and membership.user_id = whose;
    -- ponytail: somebody without a membership yet ranks as an employee; use the
    -- invitation's role if a manager ever invites into a higher one.
    if app_private.authz_rank(coalesce(target_access, 'employee')) >= app_private.authz_rank(state.class)
       and not (rule_row.owner_target_ok and target_access = 'owner') then
      return 'rank';
    end if;
  end if;

  -- Some actions are about employees only: never a manager, an admin or the
  -- owner, whoever asks, themselves included (the Manager note, 2026-09-26).
  if rule_row.employee_target and (person is not null or whose is not null)
     and not app_private.ranks_as_employee(state.workspace_id, whose) then
    return 'rank';
  end if;

  -- A record whose author outranks the actor today is not theirs to change;
  -- a peer's is (FB-6.7 K2, KK-87).
  if rule_row.outranked_no and whose is not null and not target_is_self then
    select role.access_class into target_access
    from public.workspace_memberships membership
    join public.workspace_roles role
      on role.id = membership.role_id and role.workspace_id = membership.workspace_id
    where membership.workspace_id = state.workspace_id and membership.user_id = whose;
    if app_private.authz_rank(coalesce(target_access, 'employee')) > app_private.authz_rank(state.class) then
      return 'rank';
    end if;
  end if;

  if state.class in ('owner', 'admin') then
    reach := 'org';
  else
    select rule.manager_rule into reach
    from app_private.authz_scope_rules rule
    join app_private.authz_settings setting on setting.scope_model = rule.model
    where rule.scope_class = rule_row.scope_class and rule.effect = rule_row.effect;
    reach := coalesce(reach, 'none');
  end if;

  if rule_row.scope_class = 'org' then
    if reach = 'none' then
      return 'out_of_scope';
    end if;
    return null;
  end if;

  if target_locations is not null then
    places := target_locations;
    if array_position(places, null) is not null then
      return 'out_of_scope';
    end if;
    if rule_row.scope_class = 'place' and cardinality(places) <> 1 then
      return 'out_of_scope';
    end if;
    if exists (
      select 1 from unnest(places) place
      where not exists (
        select 1 from public.locations location
        where location.id = place and location.workspace_id = state.workspace_id and app_private.location_is_live(location)
      )
    ) then
      return 'out_of_scope';
    end if;
  elsif rule_row.scope_class = 'person' and (person is not null or whose is not null) then
    -- Where the person is assigned; somebody with no employee record works nowhere.
    places := coalesce((
      select array_agg(distinct assignment.location_id)
      from public.employee_location_assignments assignment
      join public.locations location on location.id = assignment.location_id
      where assignment.employee_id = person and assignment.ended_at is null
        and app_private.location_is_live(location)
    ), '{}');
  else
    return 'out_of_scope';
  end if;

  if reach = 'org' then
    return null;
  end if;
  if reach = 'none' or cardinality(places) = 0 then
    return 'out_of_scope';
  end if;
  if reach = 'any' and places && state.manages then
    return null;
  end if;
  if reach = 'all' and places <@ state.manages then
    return null;
  end if;
  return 'out_of_scope';
end;
$function$;

-- Who decides a shift change at one location: the core's reason, null when
-- they may. The giver (the case's owner; none for an open shift) and the
-- receiver are both checked; unknown ones are skipped.
create function app_private.exchange_decision_reason(actor uuid, w uuid, giver uuid, receiver uuid, loc uuid)
returns text
language sql
stable security definer
set search_path = ''
as $$
  select coalesce(
    case when giver is not null then app_private.authz_reason(actor, w, 'exchange.approve', array[loc], giver) end,
    case when receiver is not null then app_private.authz_reason(actor, w, 'exchange.approve', array[loc], receiver) end,
    case when giver is null and receiver is null then app_private.authz_reason(actor, w, 'exchange.approve', array[loc]) end);
$$;
revoke all on function app_private.exchange_decision_reason(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.shift_exchanges_command_service(actor uuid, w uuid, command jsonb, idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare emp public.employee_profiles%rowtype; c public.shift_exchange_cases%rowtype; a public.shift_exchange_applications%rowtype;
 old_cmd public.shift_exchange_commands%rowtype; s jsonb; t jsonb; checked jsonb; result jsonb; fp text;
 action text:=command->>'action'; cid uuid:=(command->>'case_id')::uuid; aid uuid:=(command->>'application_id')::uuid;
 candidate uuid; loc uuid; other record; expires timestamptz; owns boolean; manager boolean; consent jsonb:='[]';
 decides uuid[]:='{}'; fresh boolean:=false;
begin
 if idempotency_key is null then raise exception 'Idempotency key required'; end if;
 -- The core says who may act (FB-6.4 A2): one's own offer and application,
 -- never while restricted (D4); a decision on a case is asked below, per case.
 perform app_private.authorize(actor,w,case when action in('apply','accept','decline','withdraw') then 'exchange.apply_own' else 'exchange.offer_own' end);
 perform pg_advisory_xact_lock(hashtextextended(w::text,921));
 select * into old_cmd from public.shift_exchange_commands q where q.workspace_id=w and q.actor_user_id=actor and q.idempotency_key=shift_exchanges_command_service.idempotency_key;
 if old_cmd.idempotency_key is not null then
  if old_cmd.command<>command then raise exception 'Idempotency key was used for another action' using errcode='22023'; end if;
  return old_cmd.result;
 end if;
 select * into emp from public.employee_profiles where workspace_id=w and user_id=actor and archived_at is null;
 if action in('create','apply') then
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
    consent:=public.weekly_exchange_time_off_consent(w,emp.id,t);
    if app_private.eligibility(w,emp.id,t,jsonb_build_object('operation','swap','consent',consent,'excluded',jsonb_build_array(s->>'id',t->>'id')))->>'status'<>'eligible' then raise exception 'You are not eligible for the teammate shift'; end if;
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
   expires:=least((s->>'starts_at')::timestamptz,(t->>'starts_at')::timestamptz);
   insert into public.shift_exchange_cases(workspace_id,kind,audience,offered_source_id,requested_source_id,owner_id,offered_snapshot,requested_snapshot,consent_fingerprint,expires_at,private_note,created_by,owner_time_off_consent)
   values(w,command->>'kind',case when candidate is null then 'eligible_pool' else 'direct' end,(s->>'source_id')::uuid,(t->>'source_id')::uuid,emp.id,s,t,fp,expires,coalesce(command->>'note',''),actor,consent) returning * into c;
   cid:=c.id;
   if candidate is not null then
    insert into public.shift_exchange_applications(workspace_id,case_id,employee_id,status,consent_fingerprint) values(w,cid,candidate,'invited',fp) returning id into aid;
   end if;
   perform public.shift_exchange_emit(actor,w,cid,aid,case when candidate is null then 'cover_opened' else 'peer_invited' end,'Cover or swap requested. The current owner remains responsible until manager approval.');
  else
   if (s->>'employee_id')::uuid=emp.id then raise exception 'You already own this shift'; end if;
   select * into c from public.shift_exchange_cases where workspace_id=w and offered_source_id=(s->>'source_id')::uuid and status='open' for update;
   if c.id is null then
    if s->>'employee_id' is not null then raise exception 'This shift has not been offered for cover'; end if;
    fp:=public.shift_exchange_fingerprint(w,s,null);
    insert into public.shift_exchange_cases(workspace_id,kind,offered_source_id,offered_snapshot,consent_fingerprint,expires_at,created_by)
    values(w,'open_pickup',(s->>'source_id')::uuid,s,fp,(s->>'starts_at')::timestamptz,actor) returning * into c;
   end if;
   if c.audience<>'eligible_pool' or c.kind='swap' or (cid is not null and cid<>c.id) then raise exception 'This offer is not available' using errcode='42501',hint='authz.out_of_scope'; end if;
   if public.shift_exchange_fingerprint(w,s,null)<>c.consent_fingerprint then raise exception 'Shift conditions changed. The owner must renew this offer' using errcode='PT409'; end if;
   perform public.require_weekly_exchange_employee_warning(actor,w,emp.id,s,command);
   consent:=public.weekly_exchange_time_off_consent(w,emp.id,s);
   if app_private.eligibility(w,emp.id,s,jsonb_build_object('operation',case when c.kind='open_pickup' then 'open_pickup' else 'release_pickup' end,'consent',consent))->>'status'<>'eligible' then raise exception 'You are not eligible for the full shift'; end if;
   cid:=c.id;
   if exists(select 1 from public.shift_exchange_applications where case_id=cid and employee_id=emp.id and status='pending_manager') then raise exception 'You already have an active application'; end if;
   insert into public.shift_exchange_applications(workspace_id,case_id,employee_id,status,consent_fingerprint,time_off_consent) values(w,cid,emp.id,'pending_manager',c.consent_fingerprint,consent) returning id into aid;
   update public.shift_exchange_cases set revision=revision+1,updated_at=now() where id=cid returning * into c;
   perform public.shift_exchange_emit(actor,w,cid,aid,'application_submitted','A teammate requested this shift. The current owner remains responsible.');
  end if;
 else
  select * into c from public.shift_exchange_cases where id=cid and workspace_id=w for update;
  if c.id is null then raise exception 'Request not found' using errcode='P0002'; end if;
  s:=public.shift_exchange_shift(w,c.offered_source_id); t:=public.shift_exchange_shift(w,c.requested_source_id);
  owns:=c.owner_id=emp.id;
  manager:=app_private.authz_reason(actor,w,'exchange.approve',array[(c.offered_snapshot->>'location_id')::uuid]) is null
   or (c.kind='swap' and app_private.authz_reason(actor,w,'exchange.approve',array[(c.requested_snapshot->>'location_id')::uuid]) is null);
  if not coalesce(owns,false) and not coalesce(manager,false) and not exists(select 1 from public.shift_exchange_applications where case_id=cid and employee_id=emp.id) then raise exception 'Request access denied' using errcode='42501',hint='authz.out_of_scope'; end if;
  if c.status<>'open' or c.revision is distinct from (command->>'expected_revision')::integer then raise exception 'This request changed. Review the latest details' using errcode='PT409'; end if;
  if c.expires_at<=clock_timestamp() then
   update public.shift_exchange_cases set status='expired',revision=revision+1,updated_at=now() where id=cid returning * into c;
   update public.shift_exchange_applications set status='expired',updated_at=now() where case_id=cid and status in('invited','pending_manager');
   delete from public.shift_exchange_votes where case_id=cid;
   perform public.shift_exchange_emit(null,w,cid,null,'expired','The shift has started. The current owner remains responsible.');
  elsif public.shift_exchange_live_status(w,cid)='invalidated' then
   update public.shift_exchange_cases set status='invalidated',revision=revision+1,updated_at=now() where id=cid returning * into c;
   update public.shift_exchange_applications set status='invalidated',updated_at=now() where case_id=cid and status in('invited','pending_manager');
   delete from public.shift_exchange_votes where case_id=cid;
   perform public.shift_exchange_emit(actor,w,cid,null,'invalidated','Shift details changed. This offer ended without a transfer. Start a new request from the current schedule.');
  elsif action='close' then
   if not coalesce(owns,false) and not coalesce(manager,false) then raise exception 'Only the owner or a manager can close this search' using errcode='42501',hint='authz.out_of_scope'; end if;
   if coalesce(length(trim(command->>'reason')),0)=0 then raise exception 'Choose a reason for closing this search'; end if;
   update public.shift_exchange_cases set status='cancelled',revision=revision+1,updated_at=now() where id=cid returning * into c;
   update public.shift_exchange_applications set status='closed_case_cancelled',reason=command->>'reason',updated_at=now() where case_id=cid and status in('invited','pending_manager');
   perform public.shift_exchange_emit(actor,w,cid,null,'case_closed',command->>'reason',coalesce(command->>'private_note',''));
  else
   select * into a from public.shift_exchange_applications where id=aid and case_id=cid and workspace_id=w for update;
   if a.id is null or a.status not in('invited','pending_manager') then raise exception 'This application is no longer active' using errcode='PT409'; end if;
   if action in('accept','decline','withdraw') then
    if a.employee_id is distinct from emp.id then raise exception 'Only the invited employee can respond' using errcode='42501',hint='authz.out_of_scope'; end if;
    if action in('accept','decline') and a.status<>'invited' then raise exception 'This invitation already has a response'; end if;
    if action='accept' then
     if public.shift_exchange_fingerprint(w,s,t) is distinct from c.consent_fingerprint then raise exception 'Shift conditions changed. Ask for a new offer' using errcode='PT409'; end if;
     perform public.require_weekly_exchange_employee_warning(actor,w,emp.id,s,command);
     consent:=public.weekly_exchange_time_off_consent(w,emp.id,s);
     if app_private.eligibility(w,emp.id,s,jsonb_build_object('operation',case when c.kind in ('swap','open_pickup') then c.kind when c.audience='direct' then 'cover_accept' else 'release_pickup' end,'consent',consent,'excluded',to_jsonb(array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null))))->>'status'<>'eligible'
      or (c.kind='swap' and app_private.eligibility(w,c.owner_id,t,jsonb_build_object('operation','swap','consent',c.owner_time_off_consent,'excluded',jsonb_build_array(s->>'id',t->>'id')))->>'status'<>'eligible') then raise exception 'Both employees must be eligible for the full exchange'; end if;
    end if;
    update public.shift_exchange_applications set status=case action when 'accept' then 'pending_manager' when 'decline' then 'declined_by_employee' else 'withdrawn' end,
     time_off_consent=case when action='accept' then consent else time_off_consent end,updated_at=now() where id=aid;
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
     if coalesce(length(trim(command->>'reason')),0)=0 then raise exception 'Provide a reason visible to this employee'; end if;
     update public.shift_exchange_applications set status='rejected_by_manager',reason=command->>'reason',updated_at=now() where id=aid;
     delete from public.shift_exchange_votes where case_id=cid and application_id=aid;
     if c.audience='direct' then update public.shift_exchange_cases set status='cancelled' where id=cid; end if;
     perform public.shift_exchange_emit(actor,w,cid,aid,'application_rejected',command->>'reason',coalesce(command->>'private_note',''));
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
      -- BL-182, KK-19: the approved time off each side agreed to give up ends
      -- now, at the manager's approval, never at the application.
      if (checked->'receiver'->>'shortens_time_off')::boolean then
       perform app_private.shorten_time_off(actor,w,a.employee_id,tstzmultirange(tstzrange((s->>'starts_at')::timestamptz,(s->>'ends_at')::timestamptz,'[)')),
        'Shortened for a shift they took through Shift Hub.',jsonb_build_object('source','shift_exchange','case_id',cid,'application_id',aid));
      end if;
      if c.kind='swap' and (checked->'giver'->>'shortens_time_off')::boolean then
       perform app_private.shorten_time_off(actor,w,c.owner_id,tstzmultirange(tstzrange((t->>'starts_at')::timestamptz,(t->>'ends_at')::timestamptz,'[)')),
        'Shortened for a shift they took through Shift Hub.',jsonb_build_object('source','shift_exchange','case_id',cid,'application_id',aid));
      end if;
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
 perform realtime.send(jsonb_build_object('workspace_id',w,'case_id',cid,'revision',c.revision),'changed','shift-exchanges:'||w::text,true);
 result:=jsonb_build_object('case_id',cid,'status',c.status,'revision',c.revision);
 insert into public.shift_exchange_commands(workspace_id,actor_user_id,idempotency_key,command,result) values(w,actor,idempotency_key,command,result);
 return result;
end; $function$;
CREATE OR REPLACE FUNCTION public.shift_exchange_preview(actor uuid, w uuid, cid uuid, aid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.shift_exchange_cases%rowtype; a public.shift_exchange_applications%rowtype;
 s jsonb; t jsonb; r jsonb; g jsonb; problems text[]:='{}'; loc uuid; scoped boolean:=false; missing boolean:=false; fp text;
begin
 select * into c from public.shift_exchange_cases where workspace_id=w and id=cid;
 if c.id is null then raise exception 'Request not found' using errcode='P0002'; end if;
 s:=public.shift_exchange_shift(w,c.offered_source_id); t:=public.shift_exchange_shift(w,c.requested_source_id);
 for loc in select distinct x from unnest(array[(c.offered_snapshot->>'location_id')::uuid,(c.requested_snapshot->>'location_id')::uuid]) x where x is not null loop
  scoped:=scoped or app_private.authz_reason(actor,w,'exchange.approve',array[loc]) is null;
 end loop;
 if not scoped then perform app_private.authorize(actor,w,'exchange.approve',array[(c.offered_snapshot->>'location_id')::uuid]); end if;
 select * into a from public.shift_exchange_applications where workspace_id=w and case_id=cid and id=aid;
 if a.id is null then raise exception 'Application not found' using errcode='P0002'; end if;
 if c.status<>'open' or a.status<>'pending_manager' then problems:=array_append(problems,'This request is no longer ready for approval'); end if;
 if s is null or (c.kind='swap' and t is null) then problems:=array_append(problems,'The published shift changed or was unpublished'); end if;
 fp:=public.shift_exchange_fingerprint(w,s,t);
 if fp is distinct from c.consent_fingerprint or fp is distinct from a.consent_fingerprint then problems:=array_append(problems,'Shift conditions changed. New employee consent is required'); end if;
 if c.expires_at<=clock_timestamp() or (s->>'starts_at')::timestamptz<=clock_timestamp() or (t->>'starts_at')::timestamptz<=clock_timestamp() then problems:=array_append(problems,'This shift has already started'); end if;
 if exists(select 1 from public.employee_profiles where workspace_id=w and user_id=actor and id in(c.owner_id,a.employee_id)) then problems:=array_append(problems,'A separate manager must approve your own exchange');
 -- D3: a peer manager reads the case and cannot decide it.
 elsif not exists(select 1 from unnest(array_remove(array[(c.offered_snapshot->>'location_id')::uuid,(c.requested_snapshot->>'location_id')::uuid],null)) x
  where app_private.exchange_decision_reason(actor,w,c.owner_id,a.employee_id,x) is null) then
  problems:=array_append(problems,'Someone with a higher role must approve this exchange'); end if;
 if s is not null then r:=app_private.eligibility(w,a.employee_id,s,jsonb_build_object('operation',case when c.kind in ('swap','open_pickup') then c.kind when c.audience='direct' then 'cover_accept' else 'release_pickup' end,'consent',a.time_off_consent,'excluded',to_jsonb(array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null)))); end if;
 if r is null then r:='{"status":"ineligible","reasons":["Published shift unavailable"]}'; end if;
 if r->>'status'<>'eligible' then problems:=array_append(problems,'The receiving employee is not eligible for the full shift'); end if;
 if c.kind='swap' and t is not null then
  g:=app_private.eligibility(w,c.owner_id,t,jsonb_build_object('operation','swap','consent',c.owner_time_off_consent,'excluded',jsonb_build_array(s->>'id',t->>'id')));
  if g->>'status'<>'eligible' then problems:=array_append(problems,'The other employee is not eligible for the exchanged shift'); end if;
 end if;
 for loc in select distinct x from unnest(array[(s->>'location_id')::uuid,(t->>'location_id')::uuid]) x where x is not null loop
  if app_private.exchange_decision_reason(actor,w,c.owner_id,a.employee_id,loc) is not null
   and not exists(select 1 from public.shift_exchange_votes v where v.case_id=cid and v.application_id=aid and v.location_id=loc and v.fingerprint=fp
   and app_private.exchange_decision_reason(v.actor_user_id,w,c.owner_id,a.employee_id,loc) is null
   and not exists(select 1 from public.employee_profiles e where e.workspace_id=w and e.user_id=v.actor_user_id and e.id in(c.owner_id,a.employee_id))) then missing:=true; end if;
 end loop;
 return jsonb_build_object('allowed',cardinality(problems)=0,'fingerprint',fp,'reasons',to_jsonb(problems),'receiver',r,'giver',g,'requires_other_manager',missing,
 'other_applications',(select count(*) from public.shift_exchange_applications where case_id=cid and id<>aid and status in('invited','pending_manager')));
end; $function$;
CREATE OR REPLACE FUNCTION public.shift_exchange_emit_notification_base(actor uuid, w uuid, cid uuid, aid uuid, act text, msg text, private_msg text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare eid uuid; loc uuid; recipients uuid[]; reviewers uuid[]; c public.shift_exchange_cases%rowtype; recipient uuid; body text; destination text; offered jsonb;
begin
 select * into c from public.shift_exchange_cases where id=cid and workspace_id=w;
 loc:=(c.offered_snapshot->>'location_id')::uuid;
 insert into public.shift_exchange_events(workspace_id,case_id,application_id,actor_user_id,action,message,private_note)
 values(w,cid,aid,actor,act,msg,private_msg) returning id into eid;
 select coalesce(array_agg(distinct e.user_id),'{}'::uuid[]) into recipients from public.employee_profiles e join public.workspace_memberships m on m.workspace_id=w and m.user_id=e.user_id and m.status='active'
 where e.workspace_id=w and e.archived_at is null and ((e.id=c.owner_id and act<>'other_selected') or exists(select 1 from public.shift_exchange_applications a where a.case_id=cid and a.employee_id=e.id and (aid is null or a.id=aid) and (act<>'terms_changed' or a.status in ('invited','pending_manager')))) and e.user_id is distinct from actor;
 foreach recipient in array recipients loop
  body:=case when act='transfer_completed' then
   case when c.kind='swap' then 'Your swap is approved. Your updated shifts are now your responsibility. Open your schedule to review both changes.'
    when exists(select 1 from public.employee_profiles e where e.id=c.owner_id and e.user_id=recipient) then 'Your cover is approved. You are no longer responsible for this shift.'
    else 'Your pickup is approved. This shift is now assigned to you and is your responsibility.' end else msg end;
  perform public.enqueue_notification_outbox_service(w,gen_random_uuid(),'requests.shift_change.status_changed',1,actor,'shift_exchange_cases',cid::text,
   jsonb_build_object('correlation_id',eid,'request_id',cid,'request_event_id',eid,'request_action',act,'location_id',loc,'location_ids',jsonb_build_array(loc),'recipient_user_ids',jsonb_build_array(recipient),
   'audience_contract','shift_change_participants','category','request','title',case when act='transfer_completed' then 'Shift change approved' when act='other_selected' then 'Another teammate was selected' when act='peer_invited' then 'A teammate needs your response' else 'Shift request updated' end,
   'body',body,'safe_preview','A shift request was updated.','action_url','/app/employee-hub/shift-hub?case='||cid::text||'&hub_view=requests','group_key','shift_exchange:'||cid::text),now());
 end loop;
 if act='cover_opened' then
  offered:=public.shift_exchange_shift(w,c.offered_source_id);
  select coalesce(array_agg(e.user_id),'{}'::uuid[]) into recipients from public.employee_profiles e
   join public.workspace_memberships m on m.workspace_id=w and m.user_id=e.user_id and m.status='active'
   where e.workspace_id=w and e.archived_at is null and e.id<>c.owner_id and app_private.eligibility(w,e.id,offered,'{"operation":"release_pickup"}')->>'status'='eligible';
  if cardinality(recipients)>0 then
   perform public.enqueue_notification_outbox_service(w,gen_random_uuid(),'requests.shift_change.status_changed',1,actor,'shift_exchange_cases',cid::text,
    jsonb_build_object('correlation_id',eid,'request_id',cid,'request_event_id',eid,'request_action',act,'location_id',loc,'location_ids',jsonb_build_array(loc),'recipient_user_ids',to_jsonb(recipients),
    'audience_contract','eligible_shift_cover_candidates','category','request','title','A shift is available for cover','body',(offered->>'location_name')||' · '||(offered->>'date')||' · '||(offered->>'start_time')||'–'||(offered->>'end_time')||'. Apply in Shift Hub; final assignment requires manager approval.',
    'safe_preview','A teammate is looking for cover.','action_url','/app/employee-hub/shift-hub?hub_view=available&q='||(offered->>'date'),'group_key','shift_exchange_available:'||cid::text),now());
  end if;
 end if;
 if act in('application_submitted','peer_accepted','scope_approved') or
  (act='terms_changed' and exists(select 1 from public.shift_exchange_applications where case_id=cid and status='pending_manager')) then
 -- K-S4: the people who decide the case at each location, its managers when
 -- it has any who may; else the admins and the owner who may (D3, K-S1).
 with place as (
  select distinct x loc from unnest(array_remove(array[loc,(c.requested_snapshot->>'location_id')::uuid],null)) x
 ), decider as (
  select m.user_id,place.loc,(app_private.actor(m.user_id,w)).class cls
  from public.workspace_memberships m cross join place
  where m.workspace_id=w and m.status='active' and m.user_id is distinct from actor
   and not exists(select 1 from public.shift_exchange_applications a where a.case_id=cid
    and (a.id=aid or (act='terms_changed' and a.status='pending_manager'))
    and app_private.exchange_decision_reason(m.user_id,w,c.owner_id,a.employee_id,place.loc) is not null)
   and app_private.exchange_decision_reason(m.user_id,w,c.owner_id,null,place.loc) is null
 )
 select coalesce(array_agg(distinct d.user_id),'{}'::uuid[]) into reviewers from decider d
 where d.cls='manager' or not exists(select 1 from decider x where x.loc=d.loc and x.cls='manager');
 if cardinality(reviewers)>0 then
 perform public.enqueue_notification_outbox_service(w,gen_random_uuid(),'requests.shift_change.submitted',1,actor,'shift_exchange_cases',cid::text,
 jsonb_build_object('correlation_id',eid,'request_id',cid,'request_event_id',eid,'request_action',act,'location_ids',to_jsonb(array_remove(array[loc,(c.requested_snapshot->>'location_id')::uuid],null)),'recipient_user_ids',to_jsonb(reviewers),
 'audience_contract','schedule_request_reviewers','category','request','title','Shift change ready for review','body','A teammate is ready. Review the candidates before approving.',
 'safe_preview','A shift request needs review.','action_url','/app/schedule/requests?tab=shift-changes&case='||cid::text,'group_key','shift_exchange_review:'||cid::text),now());
 end if;
 end if;
end; $function$;
CREATE OR REPLACE FUNCTION public.shift_exchange_notification_allowed(oid uuid, recipient uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare o public.notification_outbox%rowtype; c public.shift_exchange_cases%rowtype;
 e public.shift_exchange_events%rowtype; person uuid; offered jsonb; audience text;
begin
 select * into o from public.notification_outbox where id=oid;
 if o.id is null then return false; end if;
 if o.subject_type<>'shift_exchange_cases' then return true; end if;
 select * into c from public.shift_exchange_cases where workspace_id=o.workspace_id and id::text=o.subject_id;
 if c.id is null or not app_private.workspace_allows_interactive_access(o.workspace_id)
  or not exists(select 1 from public.workspace_memberships m where m.workspace_id=o.workspace_id and m.user_id=recipient and m.status='active') then return false; end if;
 select * into e from public.shift_exchange_events where workspace_id=o.workspace_id and case_id=c.id and id::text=o.payload->>'request_event_id';
 if e.id is null then return false; end if;
 select id into person from public.employee_profiles where workspace_id=o.workspace_id and user_id=recipient and archived_at is null;
 audience:=o.payload->>'audience_contract';
 if audience='schedule_request_reviewers' then
  return public.shift_exchange_live_status(o.workspace_id,c.id)='open'
   and exists(select 1 from public.shift_exchange_applications a where a.case_id=c.id and a.status='pending_manager')
   -- Still somebody who decides it (D3, K-S1).
   and exists(select 1 from unnest(array_remove(array[(c.offered_snapshot->>'location_id')::uuid,(c.requested_snapshot->>'location_id')::uuid],null)) x
    where app_private.exchange_decision_reason(recipient,o.workspace_id,c.owner_id,
     (select a.employee_id from public.shift_exchange_applications a where a.id=e.application_id),x) is null)
   and (person is null or (person is distinct from c.owner_id and not exists(select 1 from public.shift_exchange_applications a where a.id=e.application_id and a.employee_id=person)));
 elsif audience='eligible_shift_cover_candidates' then
  if public.shift_exchange_live_status(o.workspace_id,c.id)<>'open' or person is null or person=c.owner_id then return false; end if;
  offered:=public.shift_exchange_shift(o.workspace_id,c.offered_source_id);
  return coalesce(app_private.eligibility(o.workspace_id,person,offered,'{"operation":"release_pickup"}')->>'status'='eligible',false);
 elsif audience='shift_change_participants' then
  if person is null or not (person is not distinct from c.owner_id or exists(select 1 from public.shift_exchange_applications a where a.case_id=c.id and a.employee_id=person and (e.application_id is null or a.id=e.application_id))) then return false; end if;

  if e.action='terms_changed' then
   return public.shift_exchange_live_status(o.workspace_id,c.id)='open' and
    (person=c.owner_id or exists(select 1 from public.shift_exchange_applications a
     where a.case_id=c.id and a.employee_id=person and a.status in ('invited','pending_manager')));
  end if;
  if e.action in('application_submitted','peer_accepted','scope_approved','peer_invited') then
   return public.shift_exchange_live_status(o.workspace_id,c.id)='open'
    and exists(select 1 from public.shift_exchange_applications a where a.id=e.application_id and a.status=case when e.action='peer_invited' then 'invited' else 'pending_manager' end);
  end if;
  return true;
 end if;
 return false;
end; $function$;
CREATE OR REPLACE FUNCTION public.shift_exchanges_read_service(actor uuid, w uuid, manager_view boolean DEFAULT false, from_date date DEFAULT CURRENT_DATE, to_date date DEFAULT (CURRENT_DATE + 42), focused_case_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare emp public.employee_profiles%rowtype; c public.shift_exchange_cases%rowtype; s jsonb; t jsonb; allowed boolean; decides boolean; mine boolean;
 case_items jsonb[]:='{}'; opportunities jsonb:='[]'; own_shifts jsonb:='[]'; apps jsonb; hist jsonb; chk jsonb; shift_row record; stage text; live_status text; current_published boolean; requested_published boolean; published_cache jsonb:='{}'; source_key text;
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
  -- Who decides the case (D3, K-S1) gets its buttons and its private notes (K-S5).
  decides:=allowed and exists(select 1 from unnest(array_remove(array[(c.offered_snapshot->>'location_id')::uuid,(c.requested_snapshot->>'location_id')::uuid],null)) x
   where app_private.exchange_decision_reason(actor,w,c.owner_id,null,x) is null);
  mine:=coalesce(c.owner_id=emp.id,false);
  if not allowed and not mine and not exists(select 1 from public.shift_exchange_applications where case_id=c.id and employee_id=emp.id) then continue; end if;
  -- Repeated historical requests refer to the same published source. Resolve
  -- each source once in this read only; no cache survives the function call.
  foreach source_key in array array_remove(array[c.offered_source_id::text,c.requested_source_id::text],null) loop
   if not published_cache ? source_key then
    published_cache:=published_cache||jsonb_build_object(source_key,public.shift_exchange_shift(w,source_key::uuid));
   end if;
  end loop;
  s:=nullif(published_cache->c.offered_source_id::text,'null'::jsonb);
  t:=nullif(published_cache->c.requested_source_id::text,'null'::jsonb);
  current_published:=s is not null;
  requested_published:=t is not null;
  s:=coalesce(s,c.offered_snapshot);
  t:=coalesce(t,c.requested_snapshot);
  -- The list follows the displayed dates on either side. A focused deep link
  -- bypasses only the range, never the actor checks above.
  if c.id is distinct from focused_case_id and not (
   coalesce((s->>'date')::date between from_date and to_date,false)
   or coalesce((t->>'date')::date between from_date and to_date,false)
  ) then continue; end if;
  live_status:=public.shift_exchange_live_status(w,c.id);
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'employee_id',a.employee_id,'employee_name',coalesce(nullif(e.preferred_name,''),concat_ws(' ',e.first_name,e.last_name)),
   'status',case when live_status in('expired','invalidated') and a.status in('invited','pending_manager') then live_status else a.status end,'created_at',a.created_at,'reason',case when allowed or a.employee_id=emp.id then a.reason else '' end,
   'eligibility',case when (allowed or a.employee_id=emp.id) and live_status='open' then (app_private.eligibility(w,a.employee_id,s,jsonb_build_object('operation',case when c.kind in ('swap','open_pickup') then c.kind when c.audience='direct' then 'cover_accept' else 'release_pickup' end,'consent',case when a.employee_id=emp.id and a.status='invited' then 'true'::jsonb else a.time_off_consent end,'excluded',to_jsonb(array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null))))-case when allowed then '{}'::text[] else array['approval_flags'] end) || case when a.employee_id=emp.id and a.status='invited' then jsonb_build_object('availability_warning',public.weekly_exchange_employee_warning(w,emp.id,s)) else '{}'::jsonb end end) order by a.created_at),'[]'::jsonb)
  into apps from public.shift_exchange_applications a join public.employee_profiles e on e.id=a.employee_id where a.case_id=c.id and (allowed or mine or a.employee_id=emp.id);
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'created_at',e.created_at,'message',e.message,
   -- K-S5: the note goes to who decides this case for this application too.
   'private_note',case when decides and exists(select 1 from unnest(array_remove(array[(c.offered_snapshot->>'location_id')::uuid,(c.requested_snapshot->>'location_id')::uuid],null)) x
    where app_private.exchange_decision_reason(actor,w,c.owner_id,(select a.employee_id from public.shift_exchange_applications a where a.id=e.application_id),x) is null)
    then nullif(e.private_note,'') end) order by e.created_at),'[]'::jsonb)
  into hist from public.shift_exchange_events e where e.case_id=c.id and (allowed or mine or e.application_id is null or exists(select 1 from public.shift_exchange_applications a where a.id=e.application_id and a.employee_id=emp.id));
  stage:=case when live_status<>'open' then 'closed'
   when exists(select 1 from public.shift_exchange_votes where case_id=c.id) then 'awaiting_other_manager'
   when exists(select 1 from public.shift_exchange_applications where case_id=c.id and status='pending_manager') then 'ready_for_manager'
   when exists(select 1 from public.shift_exchange_applications where case_id=c.id and status='invited') then 'awaiting_peer' else 'seeking_candidates' end;
  case_items:=array_append(case_items,jsonb_build_object('id',c.id,'kind',c.kind,'audience',c.audience,'status',live_status,'current_published',current_published,'requested_current_published',case when c.kind='swap' then requested_published else null end,
   'stage',stage,'revision',c.revision,'created_at',c.created_at,'expires_at',c.expires_at,'owner_id',c.owner_id,'owner_name',c.offered_snapshot->'employee_name',
   'shift',s,'requested_shift',t,'applications',apps,'candidate_count',(select count(*) from public.shift_exchange_applications where case_id=c.id and status in('invited','pending_manager') and live_status='open'),
   'can_manage',decides,
   'is_owner',mine,'private_note',case when allowed or mine then c.private_note else '' end,'history',hist));
 end loop;
 if not manager_view then
  for shift_row in select p.id from public.schedule_published_shifts p join public.schedule_location_publications pub on pub.id=p.publication_id and pub.status='current'
   where p.workspace_id=w and p.scheduled_date between from_date and to_date order by p.scheduled_date,p.start_time loop
   s:=public.shift_exchange_shift(w,shift_row.id);
   if (s->>'starts_at')::timestamptz<=clock_timestamp() then continue; end if;
   if (s->>'employee_id')::uuid=emp.id then own_shifts:=own_shifts||jsonb_build_array(s); continue; end if;
   select * into c from public.shift_exchange_cases where workspace_id=w and offered_source_id=(s->>'source_id')::uuid and status='open' and expires_at>clock_timestamp() and audience='eligible_pool' and kind<>'swap';
   if s->>'employee_id' is not null and c.id is null then continue; end if;
   chk:=(app_private.eligibility(w,emp.id,s,jsonb_build_object('operation',case when c.id is null then 'open_pickup' else 'release_pickup' end,'consent',true))-'approval_flags')||jsonb_build_object('availability_warning',public.weekly_exchange_employee_warning(w,emp.id,s));
   if chk->>'status'='eligible' and (c.id is null or c.consent_fingerprint=public.shift_exchange_fingerprint(w,s,null)) then
    opportunities:=opportunities||jsonb_build_array(jsonb_build_object('case_id',c.id,'shift',s,'eligibility',chk));
   end if;
  end loop;
 end if;
 return jsonb_build_object('employee_id',emp.id,'cases',to_jsonb(case_items),'opportunities',opportunities,'own_shifts',own_shifts);
end; $function$;
CREATE OR REPLACE FUNCTION public.shift_exchanges_candidates_service(actor uuid, w uuid, shift_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare emp public.employee_profiles%rowtype; s jsonb; t jsonb; e record; p record; checked jsonb; employees jsonb:='[]'; shifts jsonb:='[]';
begin
 emp:=public.employee_hub_actor_service(actor,w); s:=public.shift_exchange_shift(w,shift_id);
 if s is null or (s->>'employee_id')::uuid is distinct from emp.id then raise exception 'Only the owner can search for a replacement' using errcode='42501',hint='authz.out_of_scope'; end if;
 for e in select id,coalesce(nullif(preferred_name,''),concat_ws(' ',first_name,last_name)) name from public.employee_profiles where workspace_id=w and archived_at is null and id<>emp.id order by first_name loop
  checked:=app_private.eligibility(w,e.id,s,'{"operation":"cover_accept"}')-'approval_flags';
  -- A teammate's own marks stay theirs: the owner sees what they set aside, not when.
  checked:=jsonb_set(checked,'{acknowledgements}',coalesce((select jsonb_agg(jsonb_build_object('code',k->>'code'))
   from jsonb_array_elements(checked->'acknowledgements') k),'[]'::jsonb));
  if checked->>'status'='eligible' then employees:=employees||jsonb_build_array(jsonb_build_object('id',e.id,'name',e.name,'eligibility',checked)); end if;
 end loop;
 for p in select x.id from public.schedule_published_shifts x join public.schedule_location_publications pub on pub.id=x.publication_id and pub.status='current'
  where x.workspace_id=w and x.employee_id is not null and x.employee_id<>emp.id and x.scheduled_date between current_date-1 and current_date+62 order by x.scheduled_date,x.start_time loop
  t:=public.shift_exchange_shift(w,p.id);
  if (t->>'starts_at')::timestamptz>clock_timestamp() and app_private.eligibility(w,emp.id,t,jsonb_build_object('operation','swap','consent',true,'excluded',jsonb_build_array(s->>'id',t->>'id')))->>'status'='eligible'
   and app_private.eligibility(w,(t->>'employee_id')::uuid,s,jsonb_build_object('operation','swap','excluded',jsonb_build_array(s->>'id',t->>'id')))->>'status'='eligible' then shifts:=shifts||jsonb_build_array(t||jsonb_build_object('availability_warning',public.weekly_exchange_employee_warning(w,emp.id,t))); end if;
 end loop;
 return jsonb_build_object('employees',employees,'shifts',shifts);
end; $function$;
CREATE OR REPLACE FUNCTION public.require_weekly_exchange_employee_warning(actor uuid, w uuid, emp uuid, target jsonb, command jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare warning jsonb;
begin
 if not exists(select 1 from public.employee_profiles e join public.workspace_memberships m
  on m.workspace_id=e.workspace_id and m.user_id=e.user_id and m.status='active'
  where e.workspace_id=w and e.id=emp and e.user_id=actor and e.archived_at is null) then
  raise exception 'Employee acceptance access denied' using errcode='42501',hint='authz.out_of_scope'; end if;
 warning:=public.weekly_exchange_employee_warning(w,emp,target);
 if warning is not null and command->>'availability_fingerprint' is distinct from warning->>'fingerprint' then
  raise exception 'Your availability conflicts with this shift. Refresh the request and choose to continue anyway.' using errcode='PT409'; end if;
end; $function$;
CREATE OR REPLACE FUNCTION public.record_weekly_exchange_acceptance(w uuid, cid uuid, aid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.shift_exchange_cases%rowtype; app public.shift_exchange_applications%rowtype;
 s jsonb; t jsonb; item record; a jsonb; e jsonb; actor uuid; normalized jsonb;
begin
 select * into c from public.shift_exchange_cases where workspace_id=w and id=cid;
 select * into app from public.shift_exchange_applications where workspace_id=w and case_id=cid and id=aid;
 s:=public.shift_exchange_shift(w,c.offered_source_id); t:=public.shift_exchange_shift(w,c.requested_source_id);
 if c.id is null or app.id is null or c.status<>'open' or app.status<>'pending_manager'
  or public.shift_exchange_fingerprint(w,s,t) is distinct from c.consent_fingerprint
  or app.consent_fingerprint is distinct from c.consent_fingerprint then
  raise exception 'Current employee acceptance is required' using errcode='PT409'; end if;
 for item in select s target,app.employee_id emp union all select t,c.owner_id where c.kind='swap' loop
  normalized:=item.target||jsonb_build_object('id',item.target->>'source_id','employee_id',item.emp);
  e:=app_private.eligibility(w,item.emp,normalized,jsonb_build_object('operation',case when c.kind in ('swap','open_pickup') then c.kind when c.audience='direct' then 'cover_accept' else 'release_pickup' end,
   'excluded',to_jsonb(array_remove(array[(s->>'source_id')::uuid,(t->>'source_id')::uuid],null)),'with_assessment',true));
  a:=e->'assessment';
  if not (e->>'eligible')::boolean then
   raise exception 'Resolve shift hours or approved time off before transfer' using errcode='23514'; end if;
  select user_id into actor from public.employee_profiles where workspace_id=w and id=item.emp;
  if actor is null then raise exception 'Employee acceptance identity unavailable' using errcode='42501',hint='authz.out_of_scope'; end if;
  if a->>'operation'='warning_requires_override' then
   update public.schedule_availability_overrides set revoked_at=now()
    where workspace_id=w and shift_id=(item.target->>'source_id')::uuid and revoked_at is null;
   insert into public.schedule_availability_overrides(workspace_id,shift_id,employee_id,location_id,assessment_fingerprint,assessment,reason,actor_user_id)
   values(w,(item.target->>'source_id')::uuid,item.emp,(item.target->>'location_id')::uuid,a->>'fingerprint',
    a||jsonb_build_object('consent_source','shift_exchange','consent_case_id',cid,'consent_application_id',aid),
    'Employee voluntarily accepted this shift through Shift Hub.',actor);
  end if;
 end loop;
end; $function$;
CREATE OR REPLACE FUNCTION public.shift_exchange_schedule_recovery_service(actor uuid, w uuid, sid uuid, expected_fingerprint text DEFAULT NULL::text, idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare sess public.schedule_edit_sessions%rowtype; ps record; draft public.schedule_edit_session_shifts%rowtype;
 changes jsonb:='[]'; current_shift jsonb; result jsonb; fp text; command jsonb; prior public.shift_exchange_commands%rowtype;
 row_id uuid; edited_name text;
begin
 perform pg_advisory_xact_lock(hashtextextended(w::text,921));
 select * into sess from public.schedule_edit_sessions where workspace_id=w and id=sid for update;
 if sess.id is null or sess.holder_user_id<>actor then raise exception 'Your edit session was not found' using errcode='42501',hint='authz.out_of_scope'; end if;
 if sess.expires_at<=now() then raise exception 'This edit session expired. Reopen it before reviewing assignments' using errcode='PT409'; end if;
 -- BL-189: the edit's locations, asked of the core.
 perform app_private.authorize(actor,w,'schedule.edit',array(select distinct d.location_id from public.schedule_edit_session_shifts d where d.session_id=sid));
 command:=jsonb_build_object('action','recover_schedule','session_id',sid,'fingerprint',expected_fingerprint);
 if expected_fingerprint is not null then
  if idempotency_key is null then raise exception 'Idempotency key required' using errcode='22023'; end if;
  select * into prior from public.shift_exchange_commands c where c.workspace_id=w and c.actor_user_id=actor and c.idempotency_key=shift_exchange_schedule_recovery_service.idempotency_key;
  if prior.workspace_id is not null then
   if prior.command is distinct from command then raise exception 'Idempotency key already used' using errcode='22023'; end if;
   return prior.result;
  end if;
 end if;
 for ps in
  select distinct p.* from public.shift_exchange_cases c
  join public.schedule_published_shifts p on p.workspace_id=w and coalesce(p.source_shift_id,p.id) in(c.offered_source_id,c.requested_source_id)
  join public.schedule_location_publications pub on pub.id=p.publication_id and pub.status='current'
  where c.workspace_id=w and c.status='completed' and c.updated_at>sess.created_at
   and p.scheduled_date between sess.week_start and sess.week_start+6
   and exists(select 1 from public.schedule_edit_session_shifts scope where scope.session_id=sid and scope.location_id=p.location_id)
  order by p.id
 loop
  perform app_private.authorize(actor,w,'schedule.edit',array[ps.location_id]);
  select * into draft from public.schedule_edit_session_shifts d where d.workspace_id=w and d.session_id=sid
   and (d.id in(ps.id,ps.source_shift_id) or d.source_published_shift_id=ps.id) order by d.id limit 1;
  if draft.id is not null and draft.pending_op_type is distinct from 'delete' and public.shift_exchange_edit_matches(to_jsonb(draft),to_jsonb(ps)) then continue; end if;
  current_shift:=public.shift_exchange_shift(w,ps.id)||jsonb_build_object('shift_type_name',(select name from public.shift_types where id=ps.shift_type_id and workspace_id=w));
  select coalesce(nullif(preferred_name,''),concat_ws(' ',first_name,last_name)) into edited_name from public.employee_profiles where workspace_id=w and id=draft.employee_id;
  changes:=changes||jsonb_build_array(jsonb_build_object('current',current_shift,'session_shift_id',draft.id,'edited_revision',draft.revision,
   'edited_employee_name',edited_name,'edited_start_time',draft.start_time,'edited_end_time',draft.end_time,
   'edited_job_name',(select name from public.jobs where id=draft.job_id and workspace_id=w),
   'edited_shift_type_name',(select name from public.shift_types where id=draft.shift_type_id and workspace_id=w),
   'edited_timezone',draft.time_timezone,'edited_unpaid_break_minutes',draft.unpaid_break_minutes,
   'removed',draft.id is null or draft.pending_op_type='delete'));
 end loop;
 fp:=md5(jsonb_build_object('session_id',sid,'revision',sess.revision,'changes',changes)::text);
 if expected_fingerprint is null then return jsonb_build_object('session_id',sid,'session_revision',sess.revision,'fingerprint',fp,'changes',changes); end if;
 if fp is distinct from expected_fingerprint then raise exception 'Schedule or your edits changed. Review the latest comparison' using errcode='PT409'; end if;
 for current_shift in select x->'current' from jsonb_array_elements(changes) x loop
  select * into ps from public.schedule_published_shifts where workspace_id=w and id=(current_shift->>'id')::uuid;
  select id into row_id from public.schedule_edit_session_shifts d where d.workspace_id=w and d.session_id=sid
   and (d.id in(ps.id,ps.source_shift_id) or d.source_published_shift_id=ps.id) order by d.id limit 1;
  if row_id is null then
   insert into public.schedule_edit_session_shifts(id,workspace_id,session_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,time_basis,time_snapshot,time_timezone,unpaid_break_minutes,hide_time_on_badge,note,source_published_shift_id,label_ids,label_names)
   values(ps.id,w,sid,ps.location_id,ps.employee_id,ps.job_id,ps.shift_type_id,ps.scheduled_date,ps.start_time,ps.end_time,ps.time_basis,ps.time_snapshot,ps.time_timezone,ps.unpaid_break_minutes,ps.hide_time_on_badge,ps.note,ps.id,ps.label_ids,ps.label_names);
  else
   update public.schedule_edit_session_shifts set location_id=ps.location_id,employee_id=ps.employee_id,job_id=ps.job_id,shift_type_id=ps.shift_type_id,
    scheduled_date=ps.scheduled_date,start_time=ps.start_time,end_time=ps.end_time,time_basis=ps.time_basis,time_snapshot=ps.time_snapshot,time_timezone=ps.time_timezone,
    unpaid_break_minutes=ps.unpaid_break_minutes,source_published_shift_id=ps.id,pending_op_type=null,revision=revision+1,updated_at=now()
    where workspace_id=w and session_id=sid and id=row_id;
  end if;
 end loop;
 if jsonb_array_length(changes)>0 then
  update public.schedule_edit_sessions set revision=revision+1,dirty=true,last_heartbeat=now(),expires_at=now()+interval '4 minutes' where id=sid;
 end if;
 -- EKRAN-01 Undo: the restore is not a step; Undo does not take it back.
 perform app_private.schedule_edit_undo_barrier();
 result:=public.get_schedule_edit_session_service(actor,w,sid);
 insert into public.shift_exchange_commands(workspace_id,actor_user_id,idempotency_key,command,result) values(w,actor,idempotency_key,command,result);
 return result;
end; $function$;
CREATE OR REPLACE FUNCTION public.time_off_event_released_assignments(actor uuid, w uuid, event_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(item order by ord),'[]') from public.schedule_time_off_events ev
 join public.schedule_time_off_requests r on r.id=ev.request_id and r.workspace_id=ev.workspace_id
 join public.employee_profiles emp on emp.id=r.employee_id and emp.workspace_id=r.workspace_id
 cross join lateral jsonb_array_elements(coalesce(ev.metadata->'released_assignments','[]')) with ordinality changes(item,ord)
 where ev.id=event_id and ev.workspace_id=w
  and (emp.user_id=actor or app_private.authz_reason(actor,w,'schedule.read',array[(item->>'location_id')::uuid]) is null);
$function$;

-- The three Schedule helpers retire in 20261008020500 (they go live once main CI is green).

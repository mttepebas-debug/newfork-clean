-- Keep original consent snapshots in private history while updating the
-- current request descriptor. No employee is marked accepted by this change.
alter table public.shift_exchange_events add column details jsonb not null default '{}';

create function public.weekly_exchange_same_responsibility(before_shift jsonb,current_shift jsonb) returns boolean
language sql immutable set search_path='' as $$
 select case when before_shift is null and current_shift is null then true
  when before_shift is null or current_shift is null or nullif(before_shift->>'source_id','') is null then false
  else (public.shift_exchange_terms(before_shift)-array['date','start','end','location','time_basis','time_snapshot','time_timezone'])
   = (public.shift_exchange_terms(current_shift)-array['date','start','end','location','time_basis','time_snapshot','time_timezone']) end;
$$;

create function public.refresh_weekly_exchange_terms(w uuid,cid uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c public.shift_exchange_cases%rowtype; s jsonb; t jsonb; fp text; deadline timestamptz;
 event_action text; message text; prior_details jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(w::text,921));
 select * into c from public.shift_exchange_cases where workspace_id=w and id=cid for update;
 -- Expired, invalidated and completed requests must never be revived.
 if c.id is null or c.status<>'open' or c.expires_at<=clock_timestamp() then return; end if;
 s:=public.shift_exchange_shift(w,c.offered_source_id); t:=public.shift_exchange_shift(w,c.requested_source_id);
 if not public.weekly_exchange_same_responsibility(c.offered_snapshot,s)
  or not public.weekly_exchange_same_responsibility(c.requested_snapshot,t) then return; end if;
 if public.shift_exchange_terms(c.offered_snapshot)=public.shift_exchange_terms(s)
  and public.shift_exchange_terms(c.requested_snapshot)=public.shift_exchange_terms(t) then return; end if;
 fp:=public.shift_exchange_fingerprint(w,s,t);
 if fp=c.consent_fingerprint then return; end if;
 deadline:=coalesce(least((s->>'starts_at')::timestamptz,(t->>'starts_at')::timestamptz),c.expires_at);
 event_action:=case when deadline<=clock_timestamp() then 'expired' else 'terms_changed' end;
 prior_details:=jsonb_build_object('before',jsonb_build_object('offered',c.offered_snapshot,'requested',c.requested_snapshot,
  'consent_fingerprint',c.consent_fingerprint,'revision',c.revision),
  'after',jsonb_build_object('offered',s,'requested',t,'consent_fingerprint',fp,'revision',c.revision+1),
  'acceptance_retained',event_action='terms_changed','cause','published_assignment_changed');
 update public.shift_exchange_cases set offered_snapshot=s,requested_snapshot=t,consent_fingerprint=fp,
  expires_at=deadline,status=case when event_action='expired' then 'expired' else status end,
  revision=revision+1,updated_at=now() where id=cid;
 update public.shift_exchange_applications set consent_fingerprint=fp,
  status=case when event_action='expired' then 'expired' else status end,updated_at=now()
  where case_id=cid and workspace_id=w and status in ('invited','pending_manager');
 -- Employee consent survives; a manager's old scoped review does not.
 delete from public.shift_exchange_votes where workspace_id=w and case_id=cid;
 message:=case when event_action='expired' then
  'The updated shift has already started. This request closed without a transfer. Check your current schedule.'
 else format('Shift details changed: %s, %s, %s-%s (%s).%s Existing acceptances remain valid; pending invitations still need a response. Final manager approval is required.',
  s->>'location_name',s->>'date',s->>'start_time',s->>'end_time',coalesce(s->>'time_timezone',s->>'timezone'),
  case when t is null then '' else format(' Swap shift: %s, %s, %s-%s (%s).',t->>'location_name',t->>'date',t->>'start_time',t->>'end_time',coalesce(t->>'time_timezone',t->>'timezone')) end) end;
 perform public.shift_exchange_emit(null,w,cid,null,event_action,message);
 -- emit is synchronous under the workspace lock; its newest event is ours.
 update public.shift_exchange_events set details=prior_details where id=(select id from public.shift_exchange_events
  where workspace_id=w and case_id=cid and action=event_action order by notification_sequence desc limit 1);
 perform realtime.send(jsonb_build_object('workspace_id',w,'case_id',cid,'revision',c.revision+1),
  'changed','shift-exchanges:'||w::text,false);
end; $$;

create function public.refresh_weekly_exchange_terms_after_publication() returns trigger
language plpgsql security definer set search_path='' as $$
declare w uuid; source_ids uuid[]; item record;
begin
 w:=case when tg_op='DELETE' then old.workspace_id else new.workspace_id end;
 if tg_table_name='schedule_published_shifts' then
  source_ids:=case when tg_op='DELETE' then array[old.source_shift_id]
   when tg_op='INSERT' then array[new.source_shift_id] else array[old.source_shift_id,new.source_shift_id] end;
 else
  select array_agg(source_shift_id) into source_ids from public.schedule_published_shifts
   where workspace_id=w and publication_id=case when tg_op='DELETE' then old.id else new.id end;
 end if;
 for item in select id from public.shift_exchange_cases where workspace_id=w and status='open'
  and (offered_source_id=any(source_ids) or requested_source_id=any(source_ids)) order by id loop
  perform public.refresh_weekly_exchange_terms(w,item.id);
 end loop;
 return null;
end; $$;

-- A replacement publication has an intermediate missing/duplicate source.
-- Evaluate only the final transactional state, including multi-location swaps.
create constraint trigger weekly_exchange_shift_terms_changed
after insert or update or delete on public.schedule_published_shifts
deferrable initially deferred for each row execute function public.refresh_weekly_exchange_terms_after_publication();
create constraint trigger weekly_exchange_publication_terms_changed
after update on public.schedule_location_publications
deferrable initially deferred for each row execute function public.refresh_weekly_exchange_terms_after_publication();

do $term_notifications$
declare body text; anchor text;
begin
 body:=pg_get_functiondef('public.shift_exchange_emit_notification_base(uuid,uuid,uuid,uuid,text,text,text)'::regprocedure);
 anchor:='a.employee_id=e.id and (aid is null or a.id=aid)';
 if position(anchor in body)=0 then raise exception 'Participant notification selection changed'; end if;
 body:=replace(body,anchor,anchor||' and (act<>''terms_changed'' or a.status in (''invited'',''pending_manager''))');
 anchor:='if act in(''application_submitted'',''peer_accepted'',''scope_approved'') then';
 if position(anchor in body)=0 then raise exception 'Reviewer notification selection changed'; end if;
 body:=replace(body,anchor,'if act in(''application_submitted'',''peer_accepted'',''scope_approved'') or
  (act=''terms_changed'' and exists(select 1 from public.shift_exchange_applications where case_id=cid and status=''pending_manager'')) then');
 anchor:='a.id=aid and a.employee_id=e.id';
 if position(anchor in body)=0 then raise exception 'Reviewer participant exclusion changed'; end if;
 body:=replace(body,anchor,'a.case_id=cid and (a.id=aid or (act=''terms_changed'' and a.status=''pending_manager'')) and a.employee_id=e.id');
 execute body;

 body:=pg_get_functiondef('public.shift_exchange_notification_allowed_staffing_base(uuid,uuid)'::regprocedure);
 anchor:='  if e.action in(''application_submitted'',''peer_accepted'',''scope_approved'',''peer_invited'') then';
 if position(anchor in body)=0 then raise exception 'Participant delivery policy changed'; end if;
 body:=replace(body,anchor,$policy$
  if e.action='terms_changed' then
   return public.shift_exchange_live_status(o.workspace_id,c.id)='open' and
    (person=c.owner_id or exists(select 1 from public.shift_exchange_applications a
     where a.case_id=c.id and a.employee_id=person and a.status in ('invited','pending_manager')));
  end if;
$policy$||anchor);
 execute body;
end; $term_notifications$;

revoke all on function public.weekly_exchange_same_responsibility(jsonb,jsonb),
 public.refresh_weekly_exchange_terms(uuid,uuid),public.refresh_weekly_exchange_terms_after_publication()
 from public,anon,authenticated,service_role;

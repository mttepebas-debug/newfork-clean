-- An exchange is one assignment delta, including a same-day two-sided swap.
-- Never publish an intermediate snapshot or copy a departing person's duties.
create function public.shift_exchange_person_scheduled(w uuid,loc uuid,d date,service uuid,person uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(
  select 1 from public.schedule_published_shifts ps
  join public.schedule_location_publications pub on pub.id=ps.publication_id and pub.status='current'
  left join public.schedule_lineup_entries e on e.workspace_id=w and e.source_shift_id=ps.id
  where ps.workspace_id=w and ps.location_id=loc and ps.scheduled_date=d
   and coalesce(e.employee_id,ps.employee_id)=person
   and (service is null or coalesce(e.shift_type_id,ps.shift_type_id)=service)
   and not coalesce(e.hidden,false) and not coalesce(e.call_off,false)
  union all
  select 1 from public.schedule_lineup_entries e join public.schedule_lineups ln on ln.id=e.lineup_id
  where e.workspace_id=w and ln.location_id=loc and ln.lineup_date=d and e.source_shift_id is null
   and e.employee_id=person and (service is null or e.shift_type_id=service) and not e.hidden and not e.call_off
 );
$$;

create function public.shift_exchange_reconcile_batch(actor uuid,w uuid,changes jsonb) returns void
language plpgsql set search_path='' as $$
declare s jsonb; place record; p record; person uuid; new_name text; fp text; ver integer;
 prior public.schedule_lineup_snapshots%rowtype; snap public.schedule_lineup_snapshots%rowtype;
 old_receipt public.lineup_receipts%rowtype; entries jsonb; notes jsonb; item jsonb; n jsonb;
begin
 -- Update every live assignment before checking duties or creating any share.
 for s in select * from jsonb_array_elements(changes) loop
  update public.schedule_lineup_entries set employee_id=(s->>'new_employee_id')::uuid,
   call_off=false,source_changed=false,note='',revision=revision+1,updated_by=actor,updated_at=now()
   where workspace_id=w and source_shift_id=(s->>'id')::uuid;
  perform public.shift_exchange_rebase_drafts(w,s,(s->>'new_employee_id')::uuid);
 end loop;
 for place in select distinct (x->>'location_id')::uuid loc,(x->>'date')::date work_date from jsonb_array_elements(changes) x loop
  update public.lineup_section_plans lp set lead_employee_id=null,revision=revision+1,updated_by=actor,updated_at=now()
   where lp.workspace_id=w and lp.location_id=place.loc and lp.date=place.work_date
    and exists(select 1 from jsonb_array_elements(changes) x where x->>'employee_id'=lp.lead_employee_id::text)
    and not public.shift_exchange_person_scheduled(w,place.loc,place.work_date,lp.shift_type_id,lp.lead_employee_id);

  select * into prior from public.schedule_lineup_snapshots
   where workspace_id=w and location_id=place.loc and lineup_date=place.work_date order by version_number desc limit 1;
  if prior.id is null then continue; end if;
  entries:=prior.content->'entries'; notes:=coalesce(prior.content->'notes','[]'::jsonb);
  for s in select * from jsonb_array_elements(changes) x where x->>'location_id'=place.loc::text and x->>'date'=place.work_date::text loop
   select coalesce(nullif(preferred_name,''),concat_ws(' ',first_name,last_name)) into new_name
    from public.employee_profiles where workspace_id=w and id=(s->>'new_employee_id')::uuid;
   select coalesce(jsonb_agg(case when e->>'source_shift_id'=s->>'id' or exists(
    select 1 from public.schedule_published_shifts ps where ps.workspace_id=w and ps.id=(e->>'source_shift_id')::uuid and coalesce(ps.source_shift_id,ps.id)=(s->>'source_id')::uuid)
    then e||jsonb_build_object('employee_id',s->'new_employee_id','employee_name',new_name,'call_off',false,'note','','source_shift_id',s->'id') else e end order by ord),'[]'::jsonb)
    into entries from jsonb_array_elements(entries) with ordinality q(e,ord);
   -- Structured metadata is used for new shares. The exact old display name is
   -- a conservative compatibility fallback for previously shared briefing rows.
   for n in select * from jsonb_array_elements(notes) loop
    if exists(select 1 from public.lineup_section_plans lp where lp.workspace_id=w and lp.id=(n->>'id')::uuid)
     and (n->>'lead_employee_id'=s->>'employee_id' or
       (not(n ? 'lead_employee_id') and split_part(n->>'content',E'\n',1) like '% · Lead: '||(s->>'employee_name')))
     and not public.shift_exchange_person_scheduled(w,place.loc,place.work_date,(n->>'shift_type_id')::uuid,(s->>'employee_id')::uuid) then
     select jsonb_agg(case when e->>'id'=n->>'id' then e||jsonb_build_object('lead_employee_id',null,
      'content',regexp_replace(e->>'content',E' · Lead: [^\n]*',' · Lead: Needs assignment')) else e end order by ord)
      into notes from jsonb_array_elements(notes) with ordinality q(e,ord);
    end if;
   end loop;
  end loop;
  if entries is not distinct from prior.content->'entries' and notes is not distinct from coalesce(prior.content->'notes','[]'::jsonb) then continue; end if;
  ver:=prior.version_number+1;
  item:=prior.content||jsonb_build_object('entries',entries,'notes',notes,'share_version',ver,'shared_at',now());
  insert into public.schedule_lineup_snapshots(workspace_id,location_id,lineup_date,version_number,fingerprint,content,shared_by)
   values(w,place.loc,place.work_date,ver,encode(extensions.digest(convert_to(item::text,'UTF8'),'sha256'),'hex'),item,actor) returning * into snap;
  update public.schedule_lineups set share_version=ver,shared_at=now(),updated_by=actor where workspace_id=w and location_id=place.loc and lineup_date=place.work_date;
  for person in select distinct (e->>'employee_id')::uuid from jsonb_array_elements(entries||(prior.content->'entries')) e where e->>'employee_id' is not null loop
   fp:=public.lineup_person_fingerprint(item,person);
   select * into old_receipt from public.lineup_receipts where snapshot_id=prior.id and employee_id=person;
   insert into public.lineup_receipts(snapshot_id,workspace_id,employee_id,content_fingerprint,viewed_at,acknowledged_at)
    values(snap.id,w,person,fp,case when old_receipt.content_fingerprint=fp then old_receipt.viewed_at end,case when old_receipt.content_fingerprint=fp then old_receipt.acknowledged_at end);
   if old_receipt.content_fingerprint is distinct from fp then
    insert into public.lineup_notification_outbox(workspace_id,snapshot_id,employee_id) values(w,snap.id,person) on conflict do nothing;
   end if;
  end loop;
 end loop;

 -- Close only proposals tied to a changed source/target, not this person's
 -- unrelated work. The usual final fingerprint guard remains a second defence.
 for p in
  update public.lineup_proposals lp set status='cancelled',responded_at=now(),
   result=jsonb_build_object('reason','This assignment changed through an approved shift exchange. Review the current Schedule before creating a new proposal.')
   where lp.workspace_id=w and lp.status in('pending','accepted') and exists(
    select 1 from jsonb_array_elements(changes) x where lp.source_state->>'source_shift_id'=x->>'id'
     or lp.operation->>'source_entry_id'=x->>'id' or lp.operation->>'target_entry_id'=x->>'id'
     or exists(select 1 from public.schedule_lineup_entries e where e.workspace_id=w and e.source_shift_id=(x->>'id')::uuid
       and e.id::text in(lp.operation->>'source_entry_id',lp.operation->>'target_entry_id')))
   returning lp.*
 loop
  insert into public.notifications(workspace_id,recipient_user_id,category,title,body,action_url,source_type,source_id,event_key)
   select w,m.user_id,'schedule','Staffing proposal closed',p.result->>'reason',
    case when m.user_id=p.created_by then '/app/schedule/lineup?date='||p.source_date::text else '/app/employee-hub/shift-hub' end,
    'lineup_proposal',p.id,'shift_exchange_closed'
   from public.workspace_memberships m where m.workspace_id=w and m.status='active'
    and (m.user_id=p.created_by or exists(select 1 from public.employee_profiles e where e.workspace_id=w and e.id=p.employee_id and e.user_id=m.user_id)) on conflict do nothing;
 end loop;
end; $$;

create or replace function public.shift_exchange_reconcile(actor uuid,w uuid,s jsonb,new_employee uuid) returns void
language plpgsql set search_path='' as $$
begin
 perform public.shift_exchange_reconcile_batch(actor,w,jsonb_build_array(s||jsonb_build_object('new_employee_id',new_employee)));
end; $$;

do $upgrade$
declare definition text; original text;
begin
 select pg_get_functiondef('public.shift_exchanges_command_service(uuid,uuid,jsonb,uuid)'::regprocedure) into definition;
 original:=definition;
 definition:=replace(definition,
  'perform public.shift_exchange_reconcile(actor,w,s,a.employee_id);',
  'perform public.shift_exchange_reconcile_batch(actor,w,jsonb_build_array(s||jsonb_build_object(''new_employee_id'',a.employee_id))||case when c.kind=''swap'' then jsonb_build_array(t||jsonb_build_object(''new_employee_id'',c.owner_id)) else ''[]''::jsonb end);');
 if definition=original then raise exception 'Exchange reconciliation call sites changed; review migration'; end if;
 definition:=replace(definition,'if c.kind=''swap'' then perform public.shift_exchange_reconcile(actor,w,t,c.owner_id); end if;','');
 execute definition;
 select pg_get_functiondef('public.lineup_share_content(uuid,uuid,date,uuid[])'::regprocedure) into definition;
 definition:=replace(definition,'''pinned'',false)) from public.lineup_section_plans','''pinned'',false,''lead_employee_id'',p.lead_employee_id)) from public.lineup_section_plans');
 execute definition;
end; $upgrade$;

revoke all on function public.shift_exchange_person_scheduled(uuid,uuid,date,uuid,uuid),public.shift_exchange_reconcile_batch(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

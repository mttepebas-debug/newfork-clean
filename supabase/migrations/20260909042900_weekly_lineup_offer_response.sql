-- Employee response cutover. Manager assignment/proposal finalization remains
-- on its existing adapter until weekly acceptance is connected there too.
alter table public.lineup_proposals add column employee_acceptance jsonb;

create function public.weekly_lineup_offer_warning(w uuid,pid uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select public.weekly_exchange_employee_warning(w,p.employee_id,
  p.operation->'target'||jsonb_build_object('source_id',p.id,'time_basis','explicit'))
 from public.lineup_proposals p where p.workspace_id=w and p.id=pid and p.kind='offer'
  and p.status='pending' and p.expires_at>now();
$$;

create function public.require_weekly_lineup_offer_acceptance(actor uuid,w uuid,pid uuid,command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.lineup_proposals%rowtype; target jsonb; candidate jsonb; warning jsonb;
begin
 perform public.availability_lock_workspace(w);
 select * into p from public.lineup_proposals where workspace_id=w and id=pid and kind='offer' for update;
 if p.id is null or not exists(select 1 from public.employee_profiles e
  join public.workspace_memberships m on m.workspace_id=w and m.user_id=e.user_id and m.status='active'
  where e.workspace_id=w and e.id=p.employee_id and e.user_id=actor and e.archived_at is null) then
  raise exception 'Offer access denied' using errcode='42501'; end if;
 if p.status<>'pending' or p.expires_at<=now() then
  raise exception 'Refresh the expired or changed offer' using errcode='PT409'; end if;
 target:=p.operation->'target'||jsonb_build_object('source_id',p.id,'time_basis','explicit','requires_employee_access',true);
 candidate:=public.weekly_assignment_candidate_check(w,p.employee_id,target);
 if candidate->>'status' is distinct from 'eligible' then
  raise exception 'This offer cannot be accepted with the current shift hours or assignment conflicts. Refresh the offer.' using errcode='PT409'; end if;
 warning:=public.weekly_lineup_offer_warning(w,pid);
 if warning is not null and command->>'availability_fingerprint' is distinct from warning->>'fingerprint' then
  raise exception 'This offer conflicts with your availability. Refresh it and choose Accept anyway to continue.' using errcode='PT409'; end if;
 return jsonb_build_object('proposal_id',p.id,'employee_id',p.employee_id,'actor_user_id',actor,
  'accepted_at',now(),'target',p.operation->'target','availability_fingerprint',warning->>'fingerprint');
end; $$;

do $offer_response$
declare body text; anchor text;
begin
 body:=pg_get_functiondef('public.lineup_proposals_service(uuid,uuid,text,jsonb)'::regprocedure);
 anchor:='''expires_at'',pr.expires_at) order by pr.created_at)';
 if position(anchor in body)=0 then raise exception 'Employee offer projection changed'; end if;
 body:=replace(body,anchor,'''expires_at'',pr.expires_at,''availability_warning'',public.weekly_lineup_offer_warning(w,pr.id)) order by pr.created_at)');
 anchor:='    select * into p from public.lineup_proposals where id=(payload->>''id'')::uuid and workspace_id=w and employee_id=emp.id and kind=''offer'' for update;';
 if position(anchor in body)=0 then raise exception 'Employee offer lock boundary changed'; end if;
 body:=replace(body,anchor,E'    perform public.availability_lock_workspace(w);\n'||anchor);
 anchor:='    update public.lineup_proposals set status=case when payload->>''response''=''accept'' then ''accepted'' else ''declined'' end,responded_at=now() where id=p.id returning * into p;';
 if position(anchor in body)=0 then raise exception 'Employee response command changed'; end if;
 body:=replace(body,anchor,$accept$
    if payload->>'response'='accept' then
      operation_result:=public.require_weekly_lineup_offer_acceptance(actor,w,p.id,payload);
    end if;
    update public.lineup_proposals set status=case when payload->>'response'='accept' then 'accepted' else 'declined' end,
      responded_at=now(),employee_acceptance=case when payload->>'response'='accept' then operation_result else null end
      where id=p.id returning * into p;
$accept$);
 execute body;
end; $offer_response$;

revoke all on function public.weekly_lineup_offer_warning(uuid,uuid),
 public.require_weekly_lineup_offer_acceptance(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;

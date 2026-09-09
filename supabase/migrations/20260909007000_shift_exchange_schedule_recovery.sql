-- Compare assignment terms consistently in automatic rebase and save/publish guards.
create function public.shift_exchange_edit_matches(a jsonb,b jsonb) returns boolean
language sql immutable set search_path='' as $$
 select (a->>'employee_id',a->>'location_id',a->>'job_id',a->>'shift_type_id',
  coalesce(a->>'scheduled_date',a->>'date'),(a->>'start_time')::time,(a->>'end_time')::time,
  coalesce((a->>'unpaid_break_minutes')::integer,0),a->>'time_basis',a->'time_snapshot',a->>'time_timezone')
 is not distinct from
 (b->>'employee_id',b->>'location_id',b->>'job_id',b->>'shift_type_id',
  coalesce(b->>'scheduled_date',b->>'date'),(b->>'start_time')::time,(b->>'end_time')::time,
  coalesce((b->>'unpaid_break_minutes')::integer,0),b->>'time_basis',b->'time_snapshot',b->>'time_timezone');
$$;
create or replace function public.shift_exchange_rebase_drafts(w uuid,s jsonb,recipient uuid) returns void
language plpgsql set search_path='' as $$
begin
 with changed as (
  update public.schedule_draft_shifts d set employee_id=recipient,revision=revision+1,updated_at=now()
  where d.workspace_id=w and d.id in((s->>'source_id')::uuid,(s->>'id')::uuid)
   and public.shift_exchange_edit_matches(to_jsonb(d),s) returning d.draft_id
 ) update public.schedule_drafts set revision=revision+1,updated_at=now() where id in(select draft_id from changed);
 with changed as (
  update public.schedule_edit_session_shifts d set employee_id=recipient,revision=revision+1,updated_at=now()
  where d.workspace_id=w and (d.id in((s->>'source_id')::uuid,(s->>'id')::uuid) or d.source_published_shift_id=(s->>'id')::uuid)
   and public.shift_exchange_edit_matches(to_jsonb(d),s) and d.pending_op_type is distinct from 'delete' returning d.session_id
 ) update public.schedule_edit_sessions set revision=revision+1 where id in(select session_id from changed);
end; $$;
do $guards$
declare fname text; definition text;
begin
 foreach fname in array array['public.shift_exchange_assert_draft(uuid,uuid,uuid[],uuid[],boolean)','public.shift_exchange_assert_session(uuid,uuid)'] loop
  definition:=pg_get_functiondef(fname::regprocedure);
  definition:=replace(definition,'(d.employee_id,d.location_id,d.job_id,d.scheduled_date,d.start_time,d.end_time) is not distinct from (shift.employee_id,shift.location_id,shift.job_id,shift.scheduled_date,shift.start_time,shift.end_time)','public.shift_exchange_edit_matches(to_jsonb(d),to_jsonb(shift))');
  execute definition;
 end loop;
end; $guards$;

create function public.shift_exchange_schedule_recovery_service(actor uuid,w uuid,sid uuid,
 expected_fingerprint text default null,idempotency_key uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sess public.schedule_edit_sessions%rowtype; ps record; draft public.schedule_edit_session_shifts%rowtype;
 changes jsonb:='[]'; current_shift jsonb; result jsonb; fp text; command jsonb; prior public.shift_exchange_commands%rowtype;
 row_id uuid; edited_name text;
begin
 perform pg_advisory_xact_lock(hashtextextended(w::text,921));
 select * into sess from public.schedule_edit_sessions where workspace_id=w and id=sid for update;
 if sess.id is null or sess.holder_user_id<>actor then raise exception 'Your edit session was not found' using errcode='42501'; end if;
 if sess.expires_at<=now() then raise exception 'This edit session expired. Reopen it before reviewing assignments' using errcode='PT409'; end if;
 if exists(select 1 from public.schedule_edit_session_shifts d where d.session_id=sid and not public.schedule_actor_can_manage_service(actor,w,d.location_id)) then
  raise exception 'Schedule edit scope required' using errcode='42501';
 end if;
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
  if not public.schedule_actor_can_manage_service(actor,w,ps.location_id) then raise exception 'Schedule edit scope required' using errcode='42501'; end if;
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
   insert into public.schedule_edit_session_shifts(id,workspace_id,session_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,time_basis,time_snapshot,time_timezone,unpaid_break_minutes,source_published_shift_id)
   values(ps.id,w,sid,ps.location_id,ps.employee_id,ps.job_id,ps.shift_type_id,ps.scheduled_date,ps.start_time,ps.end_time,ps.time_basis,ps.time_snapshot,ps.time_timezone,ps.unpaid_break_minutes,ps.id);
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
 result:=public.get_schedule_edit_session_service(actor,w,sid);
 insert into public.shift_exchange_commands(workspace_id,actor_user_id,idempotency_key,command,result) values(w,actor,idempotency_key,command,result);
 return result;
end; $$;
revoke all on function public.shift_exchange_edit_matches(jsonb,jsonb),public.shift_exchange_schedule_recovery_service(uuid,uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.shift_exchange_schedule_recovery_service(uuid,uuid,uuid,text,uuid) to service_role;

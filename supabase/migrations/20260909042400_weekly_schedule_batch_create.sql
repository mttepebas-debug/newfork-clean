-- A paste is one command. Reuse all canonical single-shift guards inside one transaction.
create table public.schedule_shift_batch_commands (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 actor_user_id uuid not null references auth.users(id),
 idempotency_key uuid not null,
 session_id uuid not null references public.schedule_edit_sessions(id) on delete cascade,
 expected_revision integer not null,
 shifts jsonb not null,
 created_at timestamptz not null default now(),
 primary key(workspace_id,actor_user_id,idempotency_key)
);
alter table public.schedule_shift_batch_commands enable row level security;
revoke all on public.schedule_shift_batch_commands from public,anon,authenticated,service_role;

create function public.create_schedule_shifts_batch_service(actor uuid,w uuid,sid uuid,expected_revision integer,shifts jsonb,request_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare session public.schedule_edit_sessions%rowtype; receipt public.schedule_shift_batch_commands%rowtype;
 item jsonb; result jsonb; next_revision integer;
begin
 if jsonb_typeof(shifts) is distinct from 'array' then
  raise exception 'Choose 1 to 200 shifts' using errcode='22023'; end if;
 if jsonb_array_length(shifts) not between 1 and 200 or request_key is null or expected_revision is null
  or exists(select 1 from jsonb_array_elements(shifts) v where jsonb_typeof(v) is distinct from 'object') then
  raise exception 'Valid shifts, revision and request key required' using errcode='22023'; end if;
 perform public.availability_lock_workspace(w);
 select * into session from public.schedule_edit_sessions where workspace_id=w and id=sid for update;
 if session.id is null or session.holder_user_id is distinct from actor
  or not public.schedule_actor_can_manage_service(actor,w) then
  raise exception 'Schedule manage access required' using errcode='42501'; end if;
 if session.status<>'active' or session.expires_at<=now() then
  raise exception 'Schedule editing expired; reopen the schedule' using errcode='40001'; end if;
 for item in select value from jsonb_array_elements(shifts) loop
  if item->>'location_id' is null or not public.schedule_actor_can_manage_service(actor,w,(item->>'location_id')::uuid) then
   raise exception 'Schedule location access denied' using errcode='42501'; end if;
 end loop;
 select * into receipt from public.schedule_shift_batch_commands c
  where c.workspace_id=w and c.actor_user_id=actor and c.idempotency_key=request_key;
 if found then
  if receipt.session_id is distinct from sid or receipt.expected_revision is distinct from expected_revision or receipt.shifts is distinct from shifts then
   raise exception 'Request key already used for a different batch' using errcode='40001'; end if;
  return public.get_schedule_edit_session_service(actor,w,sid);
 end if;
 if session.revision is distinct from expected_revision then
  raise exception 'Schedule editing changed; reload before pasting' using errcode='40001'; end if;
 next_revision:=session.revision;
 for item in select value from jsonb_array_elements(shifts) loop
  result:=public.mutate_schedule_edit_shift_service(actor,w,sid,next_revision,'create',gen_random_uuid(),null,item,gen_random_uuid());
  next_revision:=(result->>'revision')::integer;
 end loop;
 insert into public.schedule_shift_batch_commands(workspace_id,actor_user_id,idempotency_key,session_id,expected_revision,shifts)
  values(w,actor,request_key,sid,expected_revision,shifts);
 return result;
end; $$;
revoke all on function public.create_schedule_shifts_batch_service(uuid,uuid,uuid,integer,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.create_schedule_shifts_batch_service(uuid,uuid,uuid,integer,jsonb,uuid) to service_role;

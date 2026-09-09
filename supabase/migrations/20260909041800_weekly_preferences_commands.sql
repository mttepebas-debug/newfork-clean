-- CLI-created; placed after the existing future-dated preference foundation.
-- No live availability consumer is switched by this additive command layer.
create table public.weekly_preference_commands (
 workspace_id uuid not null references public.workspaces(id), actor_user_id uuid not null references auth.users(id),
 request_key uuid not null, command jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
 primary key(workspace_id,actor_user_id,request_key)
);
create table public.weekly_preference_events (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, employee_id uuid not null,
 source text not null check(source in ('employee','manager')), actor_user_id uuid not null references auth.users(id),
 before_record jsonb, after_record jsonb not null, decisions jsonb not null default '[]', created_at timestamptz not null default now(),
 foreign key(workspace_id,employee_id) references public.employee_profiles(workspace_id,id)
);
create index weekly_preference_employee_history on public.weekly_preference_events(workspace_id,employee_id,created_at desc);
create table public.weekly_preference_commitment_decisions (
 workspace_id uuid not null, employee_id uuid not null, kind text not null check(kind in ('exchange_application','exchange_swap','lineup_offer','legacy_request')),
 request_id uuid not null, conflict_fingerprint text not null, action text not null check(action in ('keep','cancel')),
 event_id uuid not null references public.weekly_preference_events(id),
 primary key(workspace_id,employee_id,kind,request_id),
 foreign key(workspace_id,employee_id) references public.employee_profiles(workspace_id,id)
);
alter table public.weekly_preference_commands enable row level security;
alter table public.weekly_preference_events enable row level security;
alter table public.weekly_preference_commitment_decisions enable row level security;
revoke all on public.weekly_preference_commands,public.weekly_preference_events,public.weekly_preference_commitment_decisions from public,anon,authenticated,service_role;

create function public.validate_weekly_preference_command(actor uuid,w uuid,command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare model jsonb; prior jsonb; pref jsonb:=command->'preference'; source text:=command->>'source'; copied boolean:=false;
 rule jsonb; type_id uuid; old_rule jsonb; notes jsonb:=command->'notes';
begin
 model:=public.weekly_preferences_read_service(actor,w,(command->>'employee_id')::uuid);
 if source is null or source not in ('employee','manager') or not coalesce((model->>case when source='employee' then 'can_edit_employee' else 'can_manage' end)::boolean,false) then
  raise exception 'Only the employee can change their preferences; managers can change their own reminders' using errcode='42501'; end if;
 if not public.weekly_preference_valid(pref) then raise exception 'Check the weekly unavailable hours' using errcode='22023'; end if;
 perform 1 from public.workspace_scheduling_settings where workspace_id=w for share;
 model:=public.weekly_preferences_read_service(actor,w,(command->>'employee_id')::uuid);
 prior:=model->source;
 if (command->>'expected_revision')::integer is distinct from (prior->>'revision')::integer then raise exception 'Availability changed. Reload before saving; your draft has not been saved.' using errcode='PT409'; end if;
 if (command->>'settings_revision')::integer is distinct from (model->'settings'->>'revision')::integer then raise exception 'Availability settings changed. Reload before saving.' using errcode='PT409'; end if;
 if command ? 'decisions' and jsonb_typeof(command->'decisions') is distinct from 'array' then raise exception 'Invalid request decisions' using errcode='22023'; end if;
 if source='employee' and (command ? 'notes' or command ? 'enabled' or command ? 'copy_employee_revision') then raise exception 'Manager fields cannot be saved with employee preferences' using errcode='42501'; end if;
 if source='manager' then
  if jsonb_typeof(command->'enabled') is distinct from 'boolean' or jsonb_typeof(notes) is distinct from 'array' or jsonb_array_length(notes)<>7
   or exists(select 1 from jsonb_array_elements(notes) n where jsonb_typeof(n)<>'string' or length(n#>>'{}')>1000) then raise exception 'Include reminder state and seven valid notes' using errcode='22023'; end if;
  if jsonb_array_length(coalesce(command->'decisions','[]'))>0 then raise exception 'Only the employee can decide pending requests' using errcode='42501'; end if;
  if command ? 'copy_employee_revision' then
   if not (model->'employee'->>'submitted')::boolean or (command->>'copy_employee_revision')::integer is distinct from (model->'employee'->>'revision')::integer
    or pref is distinct from model->'employee'->'preference' then raise exception 'Employee preferences changed. Copy the latest saved week again.' using errcode='PT409'; end if;
   copied:=true;
  end if;
  if not (prior->>'enabled')::boolean and not (command->>'enabled')::boolean and (pref<>prior->'preference' or notes<>prior->'notes' or copied) then
   raise exception 'Turn reminders on before editing or copying' using errcode='22023'; end if;
 end if;
 if pref->>'input_mode'<>model->'settings'->>'input_mode' and not copied and not (source='manager' and pref=prior->'preference') then
  raise exception 'Use the current organization entry mode' using errcode='PT409'; end if;
 if prior->'preference'->>'input_mode'<>pref->>'input_mode'
  and exists(select 1 from jsonb_array_elements(prior->'preference'->'days') d where (d->>'all_day')::boolean or d->'range'<>'null'::jsonb or d->'shift_type_ids'<>'[]'::jsonb)
  and not exists(select 1 from jsonb_array_elements(pref->'days') d where (d->>'all_day')::boolean or d->'range'<>'null'::jsonb or d->'shift_type_ids'<>'[]'::jsonb)
  and not coalesce((command->>'confirm_clear')::boolean,false) and not copied then
   raise exception 'Confirm removing the previous unavailable hours' using errcode='22023'; end if;
 perform 1 from public.shift_types where workspace_id=w order by id for share;
 for rule in select value from jsonb_array_elements(pref->'days') loop
  select value into old_rule from jsonb_array_elements((case when copied then model->'employee' else prior end)->'preference'->'days') where value->'day'=rule->'day';
  for type_id in select value::uuid from jsonb_array_elements_text(rule->'shift_type_ids') loop
   if not exists(select 1 from public.shift_types t where t.workspace_id=w and t.id=type_id and t.archived_at is null and t.deleted_at is null
    and t.default_start_time is not null and t.default_end_time is not null and t.default_start_time<>t.default_end_time)
    and not (coalesce(old_rule->'shift_type_ids','[]') @> jsonb_build_array(type_id) and exists(select 1 from public.weekly_preference_type_defaults d where d.workspace_id=w and d.shift_type_id=type_id)) then
     raise exception 'A selected shift type is no longer available. Reload before saving.' using errcode='PT409'; end if;
  end loop;
 end loop;
 return model;
end; $$;
revoke all on function public.validate_weekly_preference_command(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

-- Each row represents a shift this employee would RECEIVE, never one given away.
create function public.weekly_preference_commitments(w uuid,emp uuid,selected_kind text default null,selected_id uuid default null)
returns table(kind text,id uuid,status text,request_revision text,request_type text,target jsonb)
language sql stable security definer set search_path='' as $$
 select 'exchange_application',a.id,
  case when a.status='approved' then 'finalized' when a.status='pending_manager' and c.status='open' and c.expires_at>now() then 'pending' else 'resolved' end,
  md5(jsonb_build_array(c.revision,a.updated_at,a.status)::text),c.kind,
  coalesce(public.shift_exchange_shift(w,c.offered_source_id),c.offered_snapshot)
 from public.shift_exchange_applications a join public.shift_exchange_cases c on c.workspace_id=w and c.id=a.case_id
 where a.workspace_id=w and a.employee_id=emp and (selected_kind is null or selected_kind='exchange_application')
  and ((selected_id is null and a.status='pending_manager' and c.status='open' and c.expires_at>now()) or a.id=selected_id)
 union all
 select 'exchange_swap',c.id,case when c.status='completed' then 'finalized' when c.status='open' and c.expires_at>now() then 'pending' else 'resolved' end,
  c.revision::text,c.kind,coalesce(public.shift_exchange_shift(w,c.requested_source_id),c.requested_snapshot)
 from public.shift_exchange_cases c where c.workspace_id=w and c.owner_id=emp and c.kind='swap' and (selected_kind is null or selected_kind='exchange_swap')
  and ((selected_id is null and c.status='open' and c.expires_at>now()) or c.id=selected_id)
 union all
 select 'lineup_offer',p.id,case when p.status='confirmed' then 'finalized' when p.status='accepted' and p.expires_at>now() then 'pending' else 'resolved' end,
  md5(jsonb_build_array(p.fingerprint,p.responded_at,p.status,p.operation)::text),'lineup_offer',
  p.operation->'target'||jsonb_build_object('location_id',p.target_location_id)
 from public.lineup_proposals p where p.workspace_id=w and p.employee_id=emp and p.kind='offer' and (selected_kind is null or selected_kind='lineup_offer')
  and ((selected_id is null and p.status='accepted' and p.expires_at>now()) or p.id=selected_id)
 union all
 select 'legacy_request',r.id,case when r.status='approved' then 'finalized' when r.status='pending_manager_approval' then 'pending' else 'resolved' end,
  r.revision::text,case r.request_type when 'direct_swap' then 'swap' when 'direct_coverage' then 'cover' else 'open_pickup' end,
  coalesce(public.shift_exchange_shift(w,s.id),public.schedule_request_shift_payload_service(s.id)||jsonb_build_object('time_basis',s.time_basis,'time_timezone',s.time_timezone))
 from public.schedule_shift_change_requests r join public.schedule_published_shifts s on s.workspace_id=w
  and s.id=case when r.request_type='direct_swap' and r.expected_offered_employee_id=emp then r.requested_shift_id else r.offered_shift_id end
 where r.workspace_id=w and (selected_kind is null or selected_kind='legacy_request')
  and ((selected_id is null and r.status='pending_manager_approval') or r.id=selected_id)
  and ((r.request_type='direct_swap' and r.expected_offered_employee_id=emp) or (r.participant_response in ('accepted','not_required') and exists(
   select 1 from public.schedule_shift_change_participants part where part.workspace_id=w and part.request_id=r.id and part.employee_id=emp and part.participant_role='receiver')));
$$;
revoke all on function public.weekly_preference_commitments(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;

create function public.weekly_preference_commitment_conflicts(w uuid,emp uuid,proposal jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare prior jsonb; commitment record; span tstzrange; zone_name text; location_name text; conflict_ranges tstzmultirange; previous tstzmultirange;
 fp text; results jsonb:='[]';
begin
 select preference into prior from public.employee_weekly_preferences where workspace_id=w and employee_id=emp;
 prior:=coalesce(prior,public.empty_weekly_preference('time_range'));
 for commitment in select * from public.weekly_preference_commitments(w,emp) where status='pending' order by kind,id loop
  select l.timezone,l.name into zone_name,location_name from public.locations l where l.workspace_id=w and l.id=(commitment.target->>'location_id')::uuid;
  if zone_name is null or nullif(commitment.target->>'start_time','') is null or nullif(commitment.target->>'end_time','') is null
   or commitment.target->>'time_basis' in ('unresolved','legacy_unverified') then
   raise exception 'Pending request hours could not be checked. Ask a manager to confirm them before saving.' using errcode='22023'; end if;
  span:=public.lineup_shift_range(coalesce(commitment.target->>'date',commitment.target->>'scheduled_date')::date,
   (commitment.target->>'start_time')::time,(commitment.target->>'end_time')::time,coalesce(nullif(commitment.target->>'time_timezone',''),zone_name));
  if span is null or isempty(span) then raise exception 'Pending request hours could not be checked' using errcode='22023'; end if;
  conflict_ranges:=public.weekly_preference_intersections(w,proposal,span,zone_name);
  previous:=public.weekly_preference_intersections(w,prior,span,zone_name);
  if isempty(conflict_ranges) or conflict_ranges=previous then continue; end if;
  fp:=encode(extensions.digest(convert_to(jsonb_build_array(commitment.kind,commitment.id,public.availability_ranges_json(conflict_ranges))::text,'UTF8'),'sha256'),'hex');
  if exists(select 1 from public.weekly_preference_commitment_decisions d where d.workspace_id=w and d.employee_id=emp and d.kind=commitment.kind and d.request_id=commitment.id and d.action='keep' and d.conflict_fingerprint=fp) then continue; end if;
  results:=results||jsonb_build_array(jsonb_build_object('kind',commitment.kind,'id',commitment.id,'fingerprint',fp,'request_revision',commitment.request_revision,
   'request_type',commitment.request_type,'location_name',location_name,'date',coalesce(commitment.target->>'date',commitment.target->>'scheduled_date'),
   'start_time',commitment.target->>'start_time','end_time',commitment.target->>'end_time','timezone',zone_name,'intervals',public.availability_ranges_json(conflict_ranges)));
 end loop;
 return results;
end; $$;
revoke all on function public.weekly_preference_commitment_conflicts(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create function public.weekly_preferences_preview_service(actor uuid,w uuid,command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform public.validate_weekly_preference_command(actor,w,command);
 return jsonb_build_object('items',case when command->>'source'='employee' then public.weekly_preference_commitment_conflicts(w,(command->>'employee_id')::uuid,command->'preference') else '[]'::jsonb end);
end; $$;
revoke all on function public.weekly_preferences_preview_service(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.weekly_preferences_preview_service(uuid,uuid,jsonb) to service_role;

create function public.weekly_preferences_save_service(actor uuid,w uuid,command jsonb,request_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare emp uuid:=(command->>'employee_id')::uuid; source text:=command->>'source'; model jsonb; prior jsonb;
 old_command public.weekly_preference_commands%rowtype; required jsonb; choice jsonb; row_value jsonb; commitment record;
 event uuid:=gen_random_uuid(); kept integer:=0; cancelled integer:=0; resolved integer:=0; finalized jsonb:='[]'; result jsonb;
 c public.shift_exchange_cases%rowtype; a public.shift_exchange_applications%rowtype; recipients uuid[]; summary text; changed_days text;
begin
 if request_key is null then raise exception 'Idempotency key required' using errcode='22023'; end if;
 perform public.availability_lock_workspace(w);
 -- Authorize again before idempotent replay; never return a stored private read model.
 model:=public.weekly_preferences_read_service(actor,w,emp);
 if source is null or source not in ('employee','manager') or not coalesce((model->>case when source='employee' then 'can_edit_employee' else 'can_manage' end)::boolean,false) then raise exception 'Preference write access required' using errcode='42501'; end if;
 select * into old_command from public.weekly_preference_commands q where q.workspace_id=w and q.actor_user_id=actor and q.request_key=weekly_preferences_save_service.request_key;
 if old_command.request_key is not null then
  if old_command.command<>command then raise exception 'Idempotency key was used for another save' using errcode='22023'; end if;
  return old_command.result||jsonb_build_object('model',model);
 end if;
 model:=public.validate_weekly_preference_command(actor,w,command); prior:=model->source;
 if source='employee' then
  -- The workspace lock serializes exchange approval; row locks also cover offer
  -- responses that predate that common lock in the existing Line Up service.
  perform 1 from public.lineup_proposals where workspace_id=w and employee_id=emp and kind='offer' and status in ('pending','accepted') order by id for update;
  perform 1 from public.schedule_shift_change_requests r where r.workspace_id=w and r.status='pending_manager_approval' and exists(
   select 1 from public.schedule_shift_change_participants p where p.workspace_id=w and p.request_id=r.id and p.employee_id=emp) order by r.id for update;
  required:=public.weekly_preference_commitment_conflicts(w,emp,command->'preference');
  if exists(select 1 from jsonb_array_elements(coalesce(command->'decisions','[]')) d group by d->>'kind',d->>'id' having count(*)>1) then raise exception 'Choose each request once' using errcode='22023'; end if;
  for row_value in select value from jsonb_array_elements(required) loop
   if not exists(select 1 from jsonb_array_elements(coalesce(command->'decisions','[]')) d where d->>'kind'=row_value->>'kind' and d->>'id'=row_value->>'id' and d->>'fingerprint'=row_value->>'fingerprint' and d->>'action' in ('keep','cancel')) then
    raise exception 'Pending requests changed. Review each conflicting request before saving.' using errcode='PT409'; end if;
  end loop;
 end if;
 insert into public.weekly_preference_events(id,workspace_id,employee_id,source,actor_user_id,before_record,after_record,decisions)
  values(event,w,emp,source,actor,prior,'{}',coalesce(command->'decisions','[]'));
 for choice in select value from jsonb_array_elements(coalesce(command->'decisions','[]')) loop
  if choice->>'action' is null or choice->>'action' not in ('keep','cancel') then raise exception 'Choose keep or cancel' using errcode='22023'; end if;
  select * into commitment from public.weekly_preference_commitments(w,emp,choice->>'kind',(choice->>'id')::uuid);
  if not found then raise exception 'Request does not belong to this employee' using errcode='42501'; end if;
  if commitment.status='finalized' then finalized:=finalized||jsonb_build_array(jsonb_build_object('kind',commitment.kind,'id',commitment.id)); continue; end if;
  if commitment.status='resolved' then resolved:=resolved+1; continue; end if;
  select value into row_value from jsonb_array_elements(required) where value->>'kind'=choice->>'kind' and value->>'id'=choice->>'id' and value->>'fingerprint'=choice->>'fingerprint';
  if row_value is null then raise exception 'The request conflict changed. Review it again before saving.' using errcode='PT409'; end if;
  insert into public.weekly_preference_commitment_decisions(workspace_id,employee_id,kind,request_id,conflict_fingerprint,action,event_id)
   values(w,emp,commitment.kind,commitment.id,choice->>'fingerprint',choice->>'action',event)
   on conflict(workspace_id,employee_id,kind,request_id) do update set conflict_fingerprint=excluded.conflict_fingerprint,action=excluded.action,event_id=excluded.event_id;
  if choice->>'action'='keep' then kept:=kept+1; continue; end if;
  if commitment.kind='legacy_request' then
   update public.schedule_shift_change_requests set status='cancelled',revision=revision+1,updated_at=now() where workspace_id=w and id=commitment.id;
   insert into public.schedule_shift_change_events(workspace_id,request_id,action,actor_user_id,note) values(w,commitment.id,'cancelled',actor,'Employee withdrew this request after updating availability.');
  elsif commitment.kind='lineup_offer' then
   update public.lineup_proposals set status='declined',responded_at=now(),result=jsonb_build_object('reason','Employee withdrew acceptance after updating availability.') where workspace_id=w and id=commitment.id and status='accepted';
  else
   if commitment.kind='exchange_swap' then
    select * into c from public.shift_exchange_cases where workspace_id=w and id=commitment.id for update;
    update public.shift_exchange_cases set status='cancelled',revision=revision+1,updated_at=now() where id=c.id;
    update public.shift_exchange_applications set status='closed_case_cancelled',updated_at=now() where workspace_id=w and case_id=c.id and status in ('invited','pending_manager');
    delete from public.shift_exchange_votes where workspace_id=w and case_id=c.id;
    perform public.shift_exchange_emit(actor,w,c.id,null,'case_closed','Employee cancelled the swap after updating availability. No assignment changed.');
   else
    select * into a from public.shift_exchange_applications where workspace_id=w and id=commitment.id for update;
    select * into c from public.shift_exchange_cases where workspace_id=w and id=a.case_id for update;
    update public.shift_exchange_applications set status='withdrawn',updated_at=now() where id=a.id;
    update public.shift_exchange_cases set status=case when audience='direct' then 'cancelled' else status end,revision=revision+1,updated_at=now() where id=c.id;
    delete from public.shift_exchange_votes where workspace_id=w and case_id=c.id and application_id=a.id;
    perform public.shift_exchange_emit(actor,w,c.id,a.id,'application_withdrawn','Employee withdrew this request after updating availability. No assignment changed.');
   end if;
  end if;
  cancelled:=cancelled+1;
 end loop;
 if source='employee' then
  insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by)
   values(w,emp,command->'preference',1,actor) on conflict(workspace_id,employee_id) do update set preference=excluded.preference,revision=employee_weekly_preferences.revision+1,updated_by=actor,updated_at=now();
  update public.employee_onboarding_requirements set status='completed',completed_at=now(),rejection_reason=null,updated_at=now() where workspace_id=w and employee_id=emp and kind='availability';
  update public.employee_onboarding_cases set revision=revision+1,updated_at=now() where workspace_id=w and employee_id=emp;
 else
  insert into public.manager_weekly_reminders(workspace_id,employee_id,preference,enabled,notes,revision,updated_by)
   values(w,emp,command->'preference',(command->>'enabled')::boolean,array(select jsonb_array_elements_text(command->'notes')),1,actor)
   on conflict(workspace_id,employee_id) do update set preference=excluded.preference,enabled=excluded.enabled,notes=excluded.notes,revision=manager_weekly_reminders.revision+1,updated_by=actor,updated_at=now();
 end if;
 model:=public.weekly_preferences_read_service(actor,w,emp);
 update public.weekly_preference_events set after_record=model->(command->>'source') where id=event;
 select string_agg((array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[(d->>'day')::integer+1],', ' order by (d->>'day')::integer) into changed_days
 from jsonb_array_elements(command->'preference'->'days') d
 where d is distinct from (select value from jsonb_array_elements(prior->'preference'->'days') where value->'day'=d->'day');
 summary:=case when source='manager' then 'Manager reminders updated.' else 'Weekly availability updated. '||case when changed_days is null then 'Week confirmed.' else 'Changed days: '||changed_days||'.' end end;
 insert into public.employee_events(workspace_id,employee_id,actor_user_id,action,summary) values(w,emp,actor,case when source='manager' then 'manager_reminders_updated' else 'weekly_availability_updated' end,summary);
 if source='employee' then
  select coalesce(array_agg(m.user_id),'{}') into recipients from public.workspace_memberships m where m.workspace_id=w and m.status='active' and m.user_id<>actor
   and (public.weekly_preference_manager_scope(m.user_id,w,emp,'employees.manage') or exists(select 1 from public.workspace_roles r where r.workspace_id=w and r.id=m.role_id and r.access_class in ('owner','admin')));
  perform public.enqueue_notification_outbox_service(w,event,'availability.status_changed',1,actor,'weekly_availability',emp::text,
   jsonb_build_object('recipient_user_ids',to_jsonb(recipients),'audience_contract','availability_scoped_recipients','category','request',
    'title','Availability updated','body',(model->>'employee_name')||': '||summary,'safe_preview','An employee updated weekly availability.',
    'action_url','/app/employees','employee_id',emp,'changed_days',changed_days,'group_key','weekly-availability:'||emp::text),now());
 end if;
 result:=jsonb_build_object('kept_count',kept,'cancelled_count',cancelled,'resolved_count',resolved,'finalized',finalized);
 insert into public.weekly_preference_commands(workspace_id,actor_user_id,request_key,command,result) values(w,actor,request_key,command,result);
 return result||jsonb_build_object('model',model);
end; $$;
revoke all on function public.weekly_preferences_save_service(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.weekly_preferences_save_service(uuid,uuid,jsonb,uuid) to service_role;

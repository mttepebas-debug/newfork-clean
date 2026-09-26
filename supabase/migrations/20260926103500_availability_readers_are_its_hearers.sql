-- BL-139: whoever hears of a person's weekly availability update reads it,
-- the Manager note included (user decision 2026-09-26, REUSE "Müsaitlik okuma =
-- bildirim alıcıları"). Ayşe (Kadıköy manager) now opens the availability of
-- Can (a manager at Kadıköy), the admins who work there and the owner, as the
-- notification she gets promises. The read asks availability.team_read alone;
-- the old service_actor_can_access_employee (employees only, admins and owner
-- everywhere) stays on the write path, whose rule does not change.
--
-- Nobody reads the Manager note about themselves through the team path
-- (no_self): today's behaviour. Owner and admins keep reading their own as
-- its writers (availability.team_write). The recipients' query never counts the
-- person themselves, so the two sets stay one.

update app_private.authz_actions set no_self = true where key = 'availability.team_read';

CREATE OR REPLACE FUNCTION public.weekly_preference_manager_scope(actor uuid, w uuid, emp uuid, capability text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select case capability
  when 'availability.read' then app_private.authz_reason(actor,w,'availability.team_read',target_person=>emp) is null
  when 'availability.manage' then public.service_actor_can_access_employee(actor,w,emp)
   and app_private.authz_reason(actor,w,'availability.team_write',target_person=>emp) is null
  else false end;
$function$;

-- The recipients asked 'employees.manage', which the scope read as
-- availability.team_read; they now say so.
CREATE OR REPLACE FUNCTION public.weekly_preferences_save_service(actor uuid, w uuid, command jsonb, request_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
   and (public.weekly_preference_manager_scope(m.user_id,w,emp,'availability.read') or exists(select 1 from public.workspace_roles r where r.workspace_id=w and r.id=m.role_id and r.access_class in ('owner','admin')));
  perform public.enqueue_notification_outbox_service(w,event,'availability.weekly_updated',1,actor,'weekly_availability',emp::text,
   jsonb_build_object('recipient_user_ids',to_jsonb(recipients),'audience_contract','availability_scoped_recipients','category','request',
    'title','Availability updated','body',(model->>'employee_name')||': '||summary,'safe_preview','An employee updated weekly availability.',
    'action_url','/app/employees?employeeId='||emp::text||'&section=availability','employee_id',emp,'changed_days',changed_days,'group_key','weekly-availability:'||emp::text),now());
 end if;
 result:=jsonb_build_object('kept_count',kept,'cancelled_count',cancelled,'resolved_count',resolved,'finalized',finalized);
 insert into public.weekly_preference_commands(workspace_id,actor_user_id,request_key,command,result) values(w,actor,request_key,command,result);
 return result||jsonb_build_object('model',model);
end; $function$;

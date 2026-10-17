-- BILDIRIM-U7 (KARARLAR S-123, S-126, S-127, S-32, "Müsaitlik güncelleme bildirimi" 2026-09-26;
-- docs/plan/research/BILDIRIM-URETICILER.md §2.4 #18): an employee's saved week writes its own notice into the
-- new core (part 4, the availability slice). Built on hours-only availability (AVAIL-GUN-DB).
--   * an employee who saves their week tells everyone who may read their availability now
--     (availability.team_read over the person; no rank rule): the owner, the admins and the managers of their
--     locations. Never the person; a manager's own notes about them tell nobody;
--   * once a day per person, by the day at their home location (the same row is not written twice that day);
--   * a save that changes no day tells nobody, except the very first one, which confirms the week;
--   * the notice work runs in one guarded helper: a failure is logged, and the save stands.
-- Hours only (AVAIL-GUN-DB) took the entry mode away, so nothing changes how availability is entered any more:
-- its notice, availability.mode_changed ("The owner changed how availability works"), leaves the catalog.

-- Who may read the person's availability hears it changed (or, the first time, confirmed), once a day.
create function app_private.availability_tell_updated(target_workspace uuid, target_employee uuid, confirmed boolean,
  actor uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  day date;
  told uuid[];
begin
  day := (now() at time zone coalesce(app_private.time_off_timezone(target_workspace, target_employee), 'UTC'))::date;
  told := app_private.notify_holders(target_workspace, 'availability.team_read', null, target_employee);
  return app_private.notify('availability.updated', target_workspace, told,
    'availability:' || target_employee::text || ':' || day::text,
    app_private.people_name(target_employee)
      || case when confirmed then ' confirmed their availability' else ' changed their availability' end,
    null, '/app/employees?employeeId=' || target_employee::text || '&section=availability', actor,
    'employee', target_employee, jsonb_build_object('employee_id', target_employee, 'day', day));
exception when others then
  raise warning 'availability_tell_updated: notice for % skipped: % (%)', target_employee, sqlerrm, sqlstate;
  return 0;
end;
$$;

revoke all on function app_private.availability_tell_updated(uuid, uuid, boolean, uuid) from public;

-- The mode notice goes with the mode. No producer ever wrote it; a row of it would go with it.
delete from public.person_notifications where type_key = 'availability.mode_changed';
delete from public.notification_workspace_muted_types where type_key = 'availability.mode_changed';
delete from public.notification_types where key = 'availability.mode_changed';


CREATE OR REPLACE FUNCTION "public"."weekly_preferences_save_service"("actor" "uuid", "w" "uuid", "command" "jsonb", "request_key" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare emp uuid:=(command->>'employee_id')::uuid; source text:=command->>'source'; model jsonb; prior jsonb; preference jsonb;
 old_command public.weekly_preference_commands%rowtype; event uuid:=gen_random_uuid(); result jsonb:='{}';
 summary text; changed_days text;
begin
 if request_key is null then raise exception 'Idempotency key required' using errcode='22023'; end if;
 perform public.availability_lock_workspace(w);
 -- Authorize again before idempotent replay; never return a stored private read model.
 model:=public.weekly_preferences_read_service(actor,w,emp);
 perform app_private.weekly_preference_may_write(actor,w,source,model);
 select * into old_command from public.weekly_preference_commands q where q.workspace_id=w and q.actor_user_id=actor and q.request_key=weekly_preferences_save_service.request_key;
 if old_command.request_key is not null then
  if old_command.command<>command then raise exception 'Idempotency key was used for another save' using errcode='22023'; end if;
  return old_command.result||jsonb_build_object('model',model);
 end if;
 model:=public.validate_weekly_preference_command(actor,w,command); prior:=model->source;
 emp:=(model->>'employee_id')::uuid;
 -- A pending swap, cover or pickup is never asked about and never changed:
 -- the employee withdraws one in Shift Hub if they want to (M5).
 preference:=command->'preference';
 insert into public.weekly_preference_events(id,workspace_id,employee_id,source,actor_user_id,before_record,after_record)
  values(event,w,emp,source,actor,prior,'{}');
 if source='employee' then
  insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by)
   values(w,emp,preference,1,actor) on conflict(workspace_id,employee_id) do update set preference=excluded.preference,revision=employee_weekly_preferences.revision+1,updated_by=actor,updated_at=now();
  update public.employee_onboarding_requirements set status='completed',completed_at=now(),rejection_reason=null,updated_at=now() where workspace_id=w and employee_id=emp and kind='availability';
  update public.employee_onboarding_cases set revision=revision+1,updated_at=now() where workspace_id=w and employee_id=emp;
 else
  insert into public.manager_weekly_reminders(workspace_id,employee_id,preference,enabled,notes,revision,updated_by)
   values(w,emp,preference,(command->>'enabled')::boolean,array(select jsonb_array_elements_text(command->'notes')),1,actor)
   on conflict(workspace_id,employee_id) do update set preference=excluded.preference,enabled=excluded.enabled,notes=excluded.notes,revision=manager_weekly_reminders.revision+1,updated_by=actor,updated_at=now();
 end if;
 model:=public.weekly_preferences_read_service(actor,w,emp);
 update public.weekly_preference_events set after_record=model->(command->>'source') where id=event;
 select string_agg((array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[(d->>'day')::integer+1],', ' order by (d->>'day')::integer) into changed_days
 from jsonb_array_elements(preference->'days') d
 where d is distinct from (select value from jsonb_array_elements(prior->'preference'->'days') where value->'day'=d->'day');
 summary:=case when source='manager' then 'Manager reminders updated.' else 'Weekly availability updated. '||case when changed_days is null then 'Week confirmed.' else 'Changed days: '||changed_days||'.' end end;
 insert into public.employee_events(workspace_id,employee_id,actor_user_id,action,summary) values(w,emp,actor,case when source='manager' then 'manager_reminders_updated' else 'weekly_availability_updated' end,summary);
 -- Who may read their availability hears of it, once a day; a save that changes no day is news only the
 -- first time (S-32). A manager's own notes tell nobody (availability_tell_updated).
 if source='employee' and (changed_days is not null or not coalesce((prior->>'submitted')::boolean,false)) then
  perform app_private.availability_tell_updated(w,emp,changed_days is null,actor);
 end if;
 insert into public.weekly_preference_commands(workspace_id,actor_user_id,request_key,command,result) values(w,actor,request_key,command,result);
 return result||jsonb_build_object('model',model);
end; $$;

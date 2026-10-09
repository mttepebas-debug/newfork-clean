-- FB-6.5 / BL-086: changing the entry mode converts every saved week -- the
-- employee's and the manager note's -- in the same transaction as the setting
-- (20260922180000), and a missing week is projected in the current mode. A saved
-- week is therefore always in the current mode, so two branches of the save check
-- can no longer be reached and go:
--  * the cross-mode exemptions of "Use the current organization entry mode"
--    (a copy, or an unchanged manager week, in an older mode);
--  * the "Confirm removing the previous unavailable hours" check and its
--    confirm_clear flag, which fired only when the mode of the saved week and
--    the new week differed.
-- A copy of the employee's week in the same mode (copy_employee_revision) stays.
-- Signature, grants and every other check are unchanged.

create or replace function public.validate_weekly_preference_command(actor uuid, w uuid, command jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
 if pref->>'input_mode'<>model->'settings'->>'input_mode' then
  raise exception 'Use the current organization entry mode' using errcode='PT409'; end if;
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
end; $function$;

-- FB-6.7 C (the removing half): "Closed location" has three steps (KARARLAR
-- K17: block, confirm each cell, confirm once per editing session); "warn" was
-- not one of them. Runs on hosted after main's Settings > Conflict handling no
-- longer offers it (KARARLAR OPS-03). A workspace left on "warn" takes the
-- softest of the three.
update public.workspace_scheduling_settings
set conflict_rules = jsonb_set(conflict_rules, '{closed_location}', '"confirm_once"')
where conflict_rules ->> 'closed_location' = 'warn';

alter table public.workspace_scheduling_settings drop constraint scheduling_conflict_rules_valid;
alter table public.workspace_scheduling_settings add constraint scheduling_conflict_rules_valid check (
  jsonb_typeof(conflict_rules) = 'object'
  and conflict_rules ?& array['approved_time_off', 'closed_location', 'minimum_travel', 'minimum_rest', 'document_required',
    'document_conditional_grace', 'document_conditional_overdue']
  and conflict_rules - array['approved_time_off', 'closed_location', 'minimum_travel', 'minimum_rest', 'document_required',
    'document_conditional_grace', 'document_conditional_overdue'] = '{}'::jsonb
  and conflict_rules ->> 'approved_time_off' = 'block'
  and conflict_rules ->> 'closed_location' = any (array['confirm', 'confirm_once', 'block'])
  and conflict_rules ->> 'minimum_travel' = any (array['warn', 'confirm', 'block'])
  and conflict_rules ->> 'minimum_rest' = any (array['warn', 'confirm', 'block'])
  and conflict_rules ->> 'document_required' = any (array['warn', 'confirm', 'block'])
  and conflict_rules ->> 'document_conditional_grace' = any (array['warn', 'confirm', 'block'])
  and conflict_rules ->> 'document_conditional_overdue' = any (array['confirm', 'block'])
  and array_position(array['warn', 'confirm', 'block'], conflict_rules ->> 'document_conditional_overdue')
      >= array_position(array['warn', 'confirm', 'block'], conflict_rules ->> 'document_conditional_grace'));

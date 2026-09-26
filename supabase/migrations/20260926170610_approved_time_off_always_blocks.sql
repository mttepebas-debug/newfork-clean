-- FB-6.1.6 (T5): approved time off is always a hard block when a manager
-- writes a shift; it has no setting (REUSE "İzin"). The stored rule can only
-- say 'block', so the one place that reads it
-- (public.assess_weekly_shift_availability) always blocks.
-- An employee taking a shift over their own leave through a swap, pickup or
-- cover does not go through this setting and is not changed here.
-- ponytail: the read stays; the constraint is the single source of the rule.

-- No live data: any older softer value is replaced, not tolerated (CLAUDE.md §9).
update public.workspace_scheduling_settings
   set conflict_rules = jsonb_set(conflict_rules, '{approved_time_off}', '"block"')
 where conflict_rules->>'approved_time_off' is distinct from 'block';

alter table public.workspace_scheduling_settings drop constraint scheduling_conflict_rules_valid;
alter table public.workspace_scheduling_settings add constraint scheduling_conflict_rules_valid CHECK (((jsonb_typeof(conflict_rules) = 'object'::text) AND (conflict_rules ?& ARRAY['availability'::text, 'approved_time_off'::text, 'closed_location'::text, 'minimum_travel'::text, 'minimum_rest'::text, 'document_required'::text, 'document_conditional_grace'::text, 'document_conditional_overdue'::text]) AND ((conflict_rules - ARRAY['availability'::text, 'approved_time_off'::text, 'closed_location'::text, 'minimum_travel'::text, 'minimum_rest'::text, 'document_required'::text, 'document_conditional_grace'::text, 'document_conditional_overdue'::text]) = '{}'::jsonb) AND ((conflict_rules ->> 'availability'::text) = ANY (ARRAY['warn'::text, 'confirm'::text, 'block'::text])) AND ((conflict_rules ->> 'approved_time_off'::text) = 'block'::text) AND ((conflict_rules ->> 'closed_location'::text) = ANY (ARRAY['warn'::text, 'confirm'::text, 'block'::text])) AND ((conflict_rules ->> 'minimum_travel'::text) = ANY (ARRAY['warn'::text, 'confirm'::text, 'block'::text])) AND ((conflict_rules ->> 'minimum_rest'::text) = ANY (ARRAY['warn'::text, 'confirm'::text, 'block'::text])) AND ((conflict_rules ->> 'document_required'::text) = ANY (ARRAY['warn'::text, 'confirm'::text, 'block'::text])) AND ((conflict_rules ->> 'document_conditional_grace'::text) = ANY (ARRAY['warn'::text, 'confirm'::text, 'block'::text])) AND ((conflict_rules ->> 'document_conditional_overdue'::text) = ANY (ARRAY['confirm'::text, 'block'::text])) AND (array_position(ARRAY['warn'::text, 'confirm'::text, 'block'::text], (conflict_rules ->> 'document_conditional_overdue'::text)) >= array_position(ARRAY['warn'::text, 'confirm'::text, 'block'::text], (conflict_rules ->> 'document_conditional_grace'::text)))));

---
name: leave-rules-in-code
description: Where approved time off is judged in SQL, and the KARARLAR rule the exchange code does not follow (employee overriding own leave)
metadata:
  type: project
---

- The workspace setting `conflict_rules->>'approved_time_off'` is read in exactly one place: the severity CASE in `public.assess_weekly_shift_availability`. Since FB-6.1.6 the CHECK `scheduling_conflict_rules_valid` only allows `'block'`; since BL-186 there is no `availability` key at all.
- Every trigger/command that writes an assignment (`guard_schedule_assignment_availability` on edit-session/draft/published shifts, `prepare_weekly_schedule_assignment`, publish preflight, `record_weekly_exchange_acceptance`) routes through that assessment. A draft shift cannot be inserted over existing approved leave (the trigger refuses): to test publish over leave, insert the shift first, then the leave.
- KARARLAR "Takas, pickup, cover" says an employee may take a shift over their own approved leave and the leave shortens. The code does NOT do this: exchange acceptance raises on `blocked`, and tests assert the block (`weekly_exchange_acceptance.test.sql:88`, `weekly_exchange_changed_terms.test.sql:116`, `shift_exchanges_v1.test.sql` AT21). Reported to the coordinator 2026-09-26 as an open product/implementation gap; do not "fix" it inside an unrelated slice.

**Why:** FB-6.1.6 freshness check, 2026-09-26.
**How to apply:** before touching leave or exchange rules, re-grep `pg_proc.prosrc like '%approved_time_off%'` on the local DB and check whether the exchange gap has been decided. See [[sql-traps-core-translation]].

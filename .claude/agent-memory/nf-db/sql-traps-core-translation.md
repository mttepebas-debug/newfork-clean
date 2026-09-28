---
name: sql-traps-core-translation
description: SQL/plpgsql traps and test recipes met while moving entry points onto the authorization core (FB-6.1 .2)
metadata:
  type: feedback
---

- `x = any ((select app_private.scope_set(...)))` fails ("uuid = uuid[]"): a parenthesised subquery after ANY is read as a set. Cast it: `any ((select app_private.scope_set(...))::uuid[])`.
- plpgsql cannot parse `if case when a then b else c end then`: the IF scanner stops at the CASE's THEN. Use nested IFs.
- `jsonb - text[]` errors on a non-object; guard with `jsonb_typeof(...) = 'object'` before, not in the same AND.
- "Somewhere" shape (K-bir-yerde) is only for set actions; the O-3 catalog check in `supabase/tests/schedule_asks_the_core.test.sql` parses `app_private.authorize(a, w, 'act', target_locations => app_private.scope_set(a, w, 'act'))` with plain identifiers as arguments, so keep that exact form. Place/person actions: `if cardinality(scope_set(...)) = 0 then perform app_private.authorize(a, w, act); end if;` (no target always raises).
- A location cannot get `deleted_at` alone: `guard_catalog_deletion_state` wants `archived_at` too.
- A document-blocked person in a test: publish a document type to everybody (`save_document_type_lifecycle_service` with conditional mode, suspend_on_overdue, empty target; preview; `set_document_publication_service` Publish), `tests.settle()`, then move only that person's requirement `deadline_at` into the past. Individual targeting (`employee_ids`) is refused by the service.

- An edit opened from the published week (`acquire ... 'published'`) keys its rows by the draft source id: `row.id = row.source_published_shift_id = published.source_shift_id`, not the published id. Match rows the way the swap review does: `row.id in (p.id, p.source_shift_id) or row.source_published_shift_id = p.id`, or by person + date.
- In a `pg_temp` plpgsql helper, `tests.id('<w>:case:x')` right after `perform tests.cover_case(...)` in the same function raised "no such label" (2026-09-26). Use the helper's return value, or call the builder at top level.
- Swap review rule already pinned by a green test: `shift_exchanges_v1` AT27 "recovery preserves manager note" — a shift that is in the edit takes only who/where/when from the swap. Changing that is a product question, not a fix (BL-167).
- Custom GUC scope flags (`newfork.*_scope`) read back as `''`, not NULL, on a pooled connection that set them earlier with `set_config(..., true)`. `nullif(current_setting(x,true),'') is not null and exists(... = (current_setting(x,true)::jsonb->>'k')::uuid)` still raises 22P02: the planner evaluates the stable expression inside EXISTS to estimate selectivity (even `EXPLAIN` fails). Read it once: `scope jsonb := nullif(current_setting(x,true),'')::jsonb;`. Found 2026-09-26 in `guard_schedule_assignment_availability` (intermittent two-location swap 500).
- In a `language sql` function a bare name that is both an argument and a column in scope binds to the COLUMN, silently. BL-234: `schedule_edit_starting_point(..., source_draft_id)` vs `schedule_location_publications.source_draft_id` made a twice-published week 500 on the publish preview. Qualify arguments as `fn_name.arg`; check with `information_schema.columns where column_name in (<arg names>)` for the tables in the body.
- A test borrowed from another branch may lean on that branch's builder.sql: list them with `git log origin/main..<sha> -- supabase/test-support/builder.sql` and cherry-pick all, in order (BL-234 first took only one of two).

**Why:** each cost a failed trial run on 2026-09-25.
**How to apply:** check these before the first trial of any Stage 6 slice migration. See [[rollback-trial-runner]].

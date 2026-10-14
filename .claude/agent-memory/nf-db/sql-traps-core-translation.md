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

**Why:** each cost a failed trial run on 2026-09-25.
**How to apply:** check these before the first trial of any Stage 6 slice migration. See [[rollback-trial-runner]].

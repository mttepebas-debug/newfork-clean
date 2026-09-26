---
name: shared-db-unscoped-count-flakiness
description: pgTAP files that superuser-count(*) a whole real-data table (no where on the test's own fixture id) are flaky only in a full local test:db run, because the shared local DB is long-lived and other sessions/tests can leave committed rows behind
metadata:
  type: feedback
---

A pgTAP assertion like `select count(*) from public.employee_documents where
review_status='accepted'` with no fixture-scoped `where` passes standalone
and in CI (fresh DB every run) but can flake in a full local `test:db` run
(`have 2 / want 1`) because the shared local Postgres container is reused
across sessions and can carry committed rows from elsewhere (another
session's manual testing, a leftover row from a differently-failed sibling
test). Confirmed by reproducing it directly: insert an unrelated workspace's
`accepted` document row in a rolled-back transaction, then compare the old
unscoped query (returns 2) against the same query scoped by this test's own
`requirement_id` (still returns 1).

**Why:** BL-170. Found the same unscoped-count pattern copy-pasted into
sibling files from the same bl052 batch (`bl052_document_lifecycle.test.sql`
lines 74/97 on `employee_documents`, `bl052_document_rehire.test.sql` and
`bl052_policy_lifecycle.test.sql`/`bl052_policy_withdrawal.test.sql` on
`employee_acknowledgement_envelopes`, `employee_termination_offboarding.test.sql`
on `employee_offboarding_shift_actions`/`employee_offboarding_followups`,
`time_off_cancellation_requests.test.sql` and
`time_off_partial_period_decisions.test.sql`) — none fixed yet (BL-170 was
scoped to one file only; the rest were reported to the coordinator, not
touched).

**How to apply:** when asked to make a red pgTAP test green, or when writing
a new count assertion, check first whether the query runs superuser/`postgres`
(no `set local role`) over a real per-tenant table with no fixture-id filter.
If so, scope it (usually the test's own `workspace_id` or `requirement_id` is
tightest and least likely to ever collide). A count under `set local role
authenticated` + a JWT claim is a different, safe pattern — RLS itself scopes
it to that session's own tenant, so it is not the same bug class (seen in
`workspace_rls.test.sql`, `document_types_rls.test.sql`,
`organization_basics_rls.test.sql`, `signature_templates_rls.test.sql`).
A `>=` invariant over a whole table (e.g. `account_organization_history.test.sql:41`)
is also a different, intentionally-global check, not this bug.

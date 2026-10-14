---
name: owner-cannot-delete-own-location
description: fresh test-world owner is blocked from deleting a location they're personally assigned to work at; end that assignment first
metadata:
  type: project
---

`delete_catalog_entity_service` (kind='locations', `supabase/migrations/20260909041000_catalog_entity_deletion.sql:88-98`)
loops every employee still assigned to the location and requires
`can_manage_employee_record()` true for each. That function's owner branch is
`actor.access_class='owner' and target.access_class<>'owner'` — it excludes
the case where the target employee record IS the owner's own. `tests.world()`
(`supabase/test-support/builder.sql`) files the owner as an employee at BOTH
starter locations (K and B). Result: an owner built via `tests.world()` gets
"This location has employees you cannot manage. Ask an authorized
administrator to delete it." (42501) the first time they try to delete/close
either starter location — even though they're the owner.

**Why:** verified 2026-09-26 empirically (FB-6.1.4 screenshot task) by
diagnosing `can_manage_employee_record(workspace, owner_employee_id)` →
`false` inside a single transaction with both `request.jwt.claim.sub` and
`request.jwt.claims` set (setting only one, or setting them in separate
non-transactional `psql` statements, makes `auth.uid()` read null/stale —
see [[supabase-db-query-file-single-statement]] for the multi-statement
trap; this is the *same-transaction* trap, distinct from it).

**How to apply:** before any test/demo that deletes or closes one of the
world's starter locations as the owner, first end the owner's own assignment
there: `select tests.stops_working_at('<owner_membership_id>'::uuid,
tests.id('<w>:B'));` (membership id from
`workspace_memberships where user_id = tests.user('<w>:owner')`). This is a
real product gap worth flagging to nf-db/koordinatör (an owner cannot close
a location they work at without first reassigning themselves, and the error
message gives no hint that self-assignment is the blocker) — not something
to silently work around in a shipped test without saying so.

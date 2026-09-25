---
name: rolled-back-trial-runner
description: How to run a new migration + any pgTAP file together in one rolled-back transaction on the shared local DB (no psql on the host; docker exec)
metadata:
  type: reference
---

No `psql` on the Windows host. Use the DB container:
`docker exec -i supabase_db_newfork-clean psql -U postgres -d postgres -X -q -At -v ON_ERROR_STOP=1`

Trial pattern (migration not applied, nothing kept): pipe `begin;` + migration file + the test
file with its first `begin;` line stripped (`sed '1{/^begin;/d}'`). The test's own trailing
`rollback;` undoes the migration too. Search path already includes `extensions`, so pgTAP works.
Take `db.lock` first (CLAUDE.md s.7) -- another nf-db agent may hold it; wait with a background
`until [ ! -f .../db.lock ]; do sleep 5; done`.

Worktree-isolated agents: Bash refuses compound commands that write outside the worktree; write
helper scripts with the Write tool into the scratchpad instead.

Tuzak: `app_private.authz_check` returns early for `scope_class = 'own'` before the `owner_only`
check, so an "owner-only, own record" rule cannot be an `own` action. Use an `org` + `owner_only`
action and resolve the record from the actor instead of taking a target id. See [[owner-legal-name]].

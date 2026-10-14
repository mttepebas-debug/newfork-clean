---
name: feedback-rollback-trial-safety
description: Rolled-back migration trial on the shared local DB silently becomes permanent if "begin" lacks its semicolon; how to run it safely and check it stayed rolled back
metadata:
  type: feedback
---

When feeding psql `{ echo ...; echo "begin;"; cat migration; cat test; }`, the word begin MUST carry its semicolon inside the quotes. `echo begin;` (the nf-db recipe in `.claude/agent-memory/nf-db/rollback-trial-runner.md` as of `2a5322b`) prints `begin` with no `;`, psql joins it with the next line into a syntax error, and the migration then runs in autocommit: applied for good, without a schema_migrations row.

**Why:** 2026-09-25, FB-6.1 .2 review: my first trial run applied `20260925173926` permanently to the shared local DB for ~8 minutes. Restored by re-running the pre-trial `pg_get_functiondef` dumps, deleting the 3 inserted authz_actions rows, recreating the 2 dropped functions with ACL `{postgres=X, service_role=X}`; verified byte-identical. `supabase/tests/ci-green.txt` has CRLF line endings, which broke the loop too.

**How to apply:** before any trial: (1) dump `pg_get_functiondef` of every function the migration replaces (the way back); (2) `echo "begin;"`, strip `\r` from list files; (3) run ONE file first and check a migration marker (a new authz_actions key, a dropped function) is absent afterwards; only then loop. Related: [[checklist-api-gate-core-actions]].

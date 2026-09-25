---
name: authz-matrix-twin
description: How the TS authorization twin (packages/shared/src/authorization.ts) is kept equal to the SQL matrix; dump command, hash guard, coverage traps
metadata:
  type: reference
---

- SQL matrix `supabase/tests/authorization_matrix.test.sql` is the source; `packages/shared/src/authorization-matrix.expected.json` is its dumped answers (every cell), `expected()` in `authorization.ts` is the twin. Added FB-6.0-can, 2026-09-25.
- Regenerate after any change to matrix sections 2-5: `pnpm.cmd --filter @newfork/shared dump:authz-matrix` (docker exec psql into `supabase_db_newfork-clean`, temp tables in a rolled-back transaction, no world build, no db.lock needed). The test compares a sha256 of sections "-- 2. Who they are" .. "-- 6. Where the app is known" (CRLF normalized).
- Trap: not every rule branch has a matrix cell. E.g. time_off.decide admin-on-admin is never asked (the only admin is zeynep, self). Breaking such a branch keeps the twin test green; to prove the test catches a change, break a covered branch (employee.save manager rank → `can | ayse`).
- `can(ctx, action)` without a target reads `ctx.actions` (server `app_private.actor_actions`), not expected(); only targeted asks use the twin.
- API global error handler (`apps/api/src/app.ts` setErrorHandler) sends `reason`/`detail` for a thrown `HttpError` below 500 since BL-128. Schedule services still throw plain `Error` (no reason) until FB-6.1 .3a/.3b move them to `rpcFailure`.

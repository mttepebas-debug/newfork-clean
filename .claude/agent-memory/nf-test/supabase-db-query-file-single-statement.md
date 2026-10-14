---
name: supabase-db-query-file-single-statement
description: supabase CLI's `db query --file` runs the file as one prepared statement; it errors on any multi-statement SQL file (e.g. supabase/test-support/builder.sql)
metadata:
  type: project
---

`supabase db query --local --file <path>` fails with `cannot insert multiple
commands into a prepared statement` on any file that contains more than one
SQL statement (builder.sql, most migrations, any file with several
`create ...;` lines). It only works for a single query/expression.

**Why:** discovered while wiring BL-171 (reload the test-support builder
before `pnpm test:db`, since the CLI's normal seed pipeline only runs on
`supabase db reset`). Tried `supabase db query --file supabase/test-support/builder.sql`
first; it is the CLI-native way to run SQL against the local DB without
hardcoding ports/containers, but it cannot run more than one statement.

**How to apply:** for a real multi-statement `.sql` file against the local
Supabase Postgres, pipe it into the running container's own `psql` instead:
`docker exec -i supabase_db_<project_id> psql -U postgres -d postgres -f -`.
Read `project_id` from `supabase/config.toml` at runtime rather than
hardcoding the container name (CI renames it per runner, see
`scripts/ci-supabase-apart.sh`). See `scripts/reload-test-builder.mjs` for
the working pattern (Node `child_process.spawnSync`, cross-platform,
no bash-only syntax so it also works via `pnpm.cmd` on Windows).

#!/usr/bin/env node
/**
 * BL-171: `supabase test db` runs pgTAP files against whatever the local
 * Supabase database already has loaded -- it does not re-seed. The test
 * world builder (supabase/test-support/builder.sql) is normally only (re)
 * applied by `supabase db reset`'s seed pipeline (config.toml [db.seed]
 * sql_paths), so editing the builder and then running `pnpm test:db`
 * silently tests against the OLD builder until someone resets the database
 * (destructive: wipes local fixture data) or reapplies the file by hand.
 *
 * This applies the current builder.sql to the already-running local database
 * before the pgTAP run, without touching any other data. The container name
 * is derived from supabase/config.toml's project_id, never hardcoded, so it
 * still works after a rename (see scripts/ci-supabase-apart.sh). Every
 * statement in builder.sql is `create or replace` / `if not exists`, so
 * reapplying it is safe to repeat.
 *
 * Usage: node scripts/reload-test-builder.mjs
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configToml = readFileSync(resolve(root, "supabase/config.toml"), "utf8");
const projectId = configToml.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
if (!projectId) {
  console.error("reload-test-builder: could not read project_id from supabase/config.toml");
  process.exit(1);
}

const container = `supabase_db_${projectId}`;
const builderSql = readFileSync(resolve(root, "supabase/test-support/builder.sql"));

const result = spawnSync(
  "docker",
  ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"],
  { input: builderSql, stdio: ["pipe", "inherit", "inherit"] },
);

if (result.error) {
  console.error(`reload-test-builder: failed to run docker exec against ${container}: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);

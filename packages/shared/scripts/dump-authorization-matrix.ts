// Dumps the answer of every cell of the SQL authorization matrix
// (supabase/tests/authorization_matrix.test.sql, pg_temp.expected()) into
// src/authorization-matrix.expected.json, so the TypeScript twin in
// src/authorization.ts can be checked cell by cell without a database.
//
// The SQL file is the source; this file only copies its answers. The test
// refuses a dump whose sourceSha256 no longer matches the rule sections of the
// SQL file, so a rule change there forces a fresh dump here.
//
// Needs the local Supabase database running. It only reads: the rule sections
// run inside one transaction on temporary tables and are rolled back; the test
// world is not built (expected() never reads it).
//
//   pnpm.cmd --filter @newfork/shared dump:authz-matrix
//
// A branch whose migration is not on the local database yet (it is applied
// only when the branch reaches main) names it in AUTHZ_MATRIX_PRELUDE, paths
// from the repository root separated by ";". It runs first, inside the same
// rolled-back transaction, so the core answers as it will after the migration.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { matrixRuleSections, sha256 } from "../src/authorization-matrix-source.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const sqlPath = resolve(root, "supabase/tests/authorization_matrix.test.sql");
const outPath = resolve(here, "../src/authorization-matrix.expected.json");
const container = process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_newfork-clean";

const prelude = (process.env.AUTHZ_MATRIX_PRELUDE ?? "")
  .split(";")
  .filter(Boolean)
  .map((file) => readFileSync(resolve(root, file), "utf8"))
  .join("\n");

const rules = matrixRuleSections(readFileSync(sqlPath, "utf8"));
const runnable = rules
  // These two need the test world; expected() does not.
  .replace(/create temporary table actor as[\s\S]*?from persona p;\n/, "")
  .replace(/create temporary table target_id as[\s\S]*?from target t;\n/, "")
  // pgTAP assertions; the dump is not a test run.
  .replace(/select is\([\s\S]*?\n\);\n/g, "");

const script = `
begin;
${prelude}
${runnable}
select json_build_object(
  'coreActionKeys', (select json_agg(a.key order by a.key) from app_private.authz_actions a),
  'personas', (select json_agg(json_build_object(
      'label', p.label, 'tenant', p.tenant, 'class', p.class, 'status', p.status,
      'locs', p.locs, 'permissionsRemoved', p.permissions_removed,
      'employee', p.employee, 'manages', p.manages) order by p.label) from persona p),
  'targets', (select json_agg(json_build_object(
      'label', t.label, 'kind', t.kind, 'tenant', t.tenant, 'locs', t.locs,
      'class', t.class, 'holder', t.holder, 'employee', t.employee) order by t.label) from target t),
  'actions', (select json_agg(json_build_object(
      'key', a.key, 'targetKind', a.target_kind, 'permission', a.permission,
      'coreKey', c.core_key, 'blank', c.blank) order by a.key)
    from action a join core_action c on c.key = a.key),
  'cells', (select json_agg(json_build_array(a.key, p.label, t.label,
      pg_temp.expected(p.label, a.key, t.label)) order by a.key, p.label, t.label)
    from persona p
    cross join action a
    join (select label, kind from target union all select 'self', 'person') t on t.kind = a.target_kind)
);
rollback;
`;

const output = execFileSync(
  "docker",
  ["exec", "-i", container, "psql", "-U", "postgres", "-q", "-At", "-v", "ON_ERROR_STOP=1"],
  { input: script, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);
const line = output.split("\n").find((text) => text.startsWith("{"));
if (!line) throw new Error(`no JSON in psql output:\n${output}`);
const dump = JSON.parse(line) as { cells: unknown[] };

writeFileSync(
  outPath,
  `${JSON.stringify({ sourceSha256: sha256(rules), ...dump }, null, 1)}\n`,
);
console.log(`wrote ${dump.cells.length} cells to ${outPath}`);

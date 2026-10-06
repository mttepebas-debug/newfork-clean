import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// psql inside the database container of the project this checkout starts.
// Locally that is the shared stack (newfork-clean); CI renames its project
// (newfork-ci) so its world never lands in the stack every session uses.
const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(
  readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8"),
)?.[1];
if (!projectId) throw new Error("supabase/config.toml has no project_id");
export const psql = `docker exec -i supabase_db_${projectId} psql -U postgres -d postgres -At -q -v ON_ERROR_STOP=1`;

// A fresh world for every run, built through the product's own entry points
// (supabase/test-support/builder.sql) and committed, because the browser signs
// in through the auth server in its own connection. Kadikoy has manager Ayse
// and employee Emre; Besiktas has manager Mehmet; Zeynep is an admin; Ali and
// Deniz work at both locations.
// Everyone shares one password.

export const password = "world-pass-2026";
export const worldFile = fileURLToPath(new URL("./.world.json", import.meta.url));

const people = [
  ["ayse", "manager", ["K"], "cook"],
  ["emre", "employee", ["K"], "cook"],
  ["mehmet", "manager", ["B"], "cook"],
  ["zeynep", "admin", ["K"], "server"],
  ["ali", "employee", ["K", "B"], "cook"],
  ["deniz", "employee", ["K", "B"], "cook"],
] as const;

export default function globalSetup() {
  const run = `e2e${Date.now()}`;
  const sql = [
    `select tests.world('${run}');`,
    ...people.map(
      ([label, role, locations, job]) =>
        `select tests.person('${run}', '${label}', '${role}', array[${locations.map((location) => `'${location}'`).join(", ")}], array['${job}']);`,
    ),
    `select json_build_object(${people
      .map(([label]) => `'${label}', tests.password('${run}:${label}', '${password}')`)
      .join(", ")})::text;`,
  ].join("\n");
  const printed = execSync(psql, { input: sql, encoding: "utf8" });
  const emails = JSON.parse(printed.trim().split(/\r?\n/).at(-1) ?? "{}");
  writeFileSync(worldFile, JSON.stringify({ run, password, emails }, null, 2));
}

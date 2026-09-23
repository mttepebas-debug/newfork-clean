import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// A fresh world for every run, built through the product's own entry points
// (supabase/test-support/builder.sql) and committed, because the browser signs
// in through the auth server in its own connection. Kadikoy has manager Ayse
// and employee Emre; Besiktas has manager Mehmet. Everyone shares one password.

export const password = "world-pass-2026";
export const worldFile = fileURLToPath(new URL("./.world.json", import.meta.url));

const people = [
  ["ayse", "manager", "K", "cook"],
  ["emre", "employee", "K", "cook"],
  ["mehmet", "manager", "B", "cook"],
] as const;

export default function globalSetup() {
  const run = `e2e${Date.now()}`;
  const sql = [
    `select tests.world('${run}');`,
    ...people.map(
      ([label, role, location, job]) =>
        `select tests.person('${run}', '${label}', '${role}', array['${location}'], array['${job}']);`,
    ),
    `select json_build_object(${people
      .map(([label]) => `'${label}', tests.password('${run}:${label}', '${password}')`)
      .join(", ")})::text;`,
  ].join("\n");
  const printed = execSync(
    "docker exec -i supabase_db_newfork-clean psql -U postgres -d postgres -At -q -v ON_ERROR_STOP=1",
    { input: sql, encoding: "utf8" },
  );
  const emails = JSON.parse(printed.trim().split(/\r?\n/).at(-1) ?? "{}");
  writeFileSync(worldFile, JSON.stringify({ run, password, emails }, null, 2));
}

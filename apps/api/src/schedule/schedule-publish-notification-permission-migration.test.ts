import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = resolve(process.cwd(), "../../supabase/migrations");
const functionPattern =
  /create or replace function public\.create_schedule_publish_notifications_service\([\s\S]*?\)\s*returns jsonb[\s\S]*?as \$\$([\s\S]*?)\$\$;/i;

function finalFunctionMigration() {
  const definitions = readdirSync(migrationsDirectory)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort()
    .map((fileName) => ({
      fileName,
      sql: readFileSync(resolve(migrationsDirectory, fileName), "utf8"),
    }))
    .filter(({ sql }) => functionPattern.test(sql));

  const finalDefinition = definitions.at(-1);
  if (!finalDefinition) {
    throw new Error(
      "create_schedule_publish_notifications_service migration not found",
    );
  }
  return finalDefinition;
}

describe("final schedule publish notification permission migration", () => {
  it("keeps the final function actor-bound and location-scoped", () => {
    const migration = finalFunctionMigration();
    const body = migration.sql.match(functionPattern)?.[1] ?? "";

    expect(migration.fileName).toBe(
      "20260908105000_restore_schedule_publish_notification_actor_binding.sql",
    );
    expect(body).toMatch(/actor_user_id is null/i);
    expect(body).toMatch(
      /schedule_actor_can_publish_service\(\s*actor_user_id/i,
    );
    expect(body).toMatch(/publication\.location_id/i);
    expect(body).not.toMatch(/workspace_has_permission/i);
    expect(body).not.toMatch(/auth\.uid\(\)/i);
  });

  it("keeps execution restricted to the API service role", () => {
    const { sql } = finalFunctionMigration();

    expect(sql).toMatch(
      /revoke all on function public\.create_schedule_publish_notifications_service\([\s\S]*?\) from public, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.create_schedule_publish_notifications_service\([\s\S]*?\) to service_role/i,
    );
  });
});

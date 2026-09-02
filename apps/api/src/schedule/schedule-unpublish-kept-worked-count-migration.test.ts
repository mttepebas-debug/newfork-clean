import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "../../supabase/migrations/20260908101000_schedule_unpublish_kept_worked_count.sql",
  ),
  "utf8",
);

describe("schedule unpublish kept worked count migration", () => {
  it("returns a worked-shift retention count from unpublish_schedule_service", () => {
    expect(migration).toMatch(/create or replace function public\.unpublish_schedule_service/i);
    expect(migration).toMatch(/kept_worked_count integer := 0/i);
    expect(migration).toMatch(/from public\.schedule_published_shifts shift/i);
    expect(migration).toMatch(/from public\.time_sessions session/i);
    expect(migration).toMatch(/session\.employee_id = shift\.employee_id/i);
    expect(migration).toMatch(/session\.location_id = shift\.location_id/i);
    expect(migration).toMatch(/at time zone location\.timezone/i);
    expect(migration).toMatch(/'kept_worked_count', kept_worked_count/i);
  });
});

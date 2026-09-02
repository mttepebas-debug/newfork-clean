import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "../../supabase/migrations/20260907122000_schedule_retroactive_edit_guard.sql",
  ),
  "utf8",
);

const acquireLockMigration = readFileSync(
  resolve(
    process.cwd(),
    "../../supabase/migrations/20260908102000_schedule_past_week_acquire_lock.sql",
  ),
  "utf8",
);

describe("schedule retroactive edit guard migration", () => {
  it("adds an acknowledged save overload around the existing save service", () => {
    expect(migration).toMatch(
      /rename to save_schedule_edit_session_service_retroactive_base/i,
    );
    expect(migration).toMatch(/acknowledge_past_edits boolean default false/i);
    expect(migration).toMatch(
      /save_schedule_edit_session_service_retroactive_base/i,
    );
  });

  it("blocks past weeks and warns for started changed shifts", () => {
    expect(migration).toMatch(/schedule_current_week_start_service/i);
    expect(migration).toMatch(/'status', 'past_edit_blocked'/i);
    expect(migration).toMatch(/'reason', 'past_week'/i);
    expect(migration).toMatch(/'status', 'past_shift_edit_requires_ack'/i);
    expect(migration).toMatch(/'reason', 'shift_started'/i);
    expect(migration).toMatch(/shift\.pending_op_type in \('create', 'update', 'delete'\)/i);
  });

  it("keeps the guarded function executable by the API service role", () => {
    expect(migration).toMatch(
      /grant execute on function public\.save_schedule_edit_session_service\(\s*uuid, uuid, uuid, integer, text, uuid, integer, boolean\s*\) to service_role/i,
    );
  });

  it("blocks acquiring any edit source for a past week", () => {
    expect(acquireLockMigration).toMatch(
      /rename to acquire_schedule_edit_session_service_past_week_base/i,
    );
    expect(acquireLockMigration).toMatch(
      /target_week_start < current_week_start/i,
    );
    expect(acquireLockMigration).toMatch(/'status', 'past_edit_blocked'/i);
    expect(acquireLockMigration).not.toMatch(/publication_status/i);
    expect(acquireLockMigration).toMatch(
      /grant execute on function public\.acquire_schedule_edit_session_service\([\s\S]*?\) to service_role/i,
    );
  });
});

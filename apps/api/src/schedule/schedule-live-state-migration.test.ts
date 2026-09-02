import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "../../supabase/migrations/20260905100000_schedule_live_shift_state.sql",
  ),
  "utf8",
);

describe("schedule live shift state migration", () => {
  it("persists live-backed edit-session shift state for the frontend", () => {
    expect(migration).toMatch(/source_published_shift_id uuid/i);
    expect(migration).toMatch(/pending_op_type text/i);
    expect(migration).toMatch(/locked boolean not null default false/i);
    expect(migration).toMatch(/mark_schedule_edit_session_shift_source_trigger/i);
  });

  it("stages live deletes instead of removing live-backed rows", () => {
    expect(migration).toMatch(
      /rename to mutate_schedule_edit_shift_service_base/i,
    );
    expect(migration).toMatch(/set pending_op_type = 'delete'/i);
    expect(migration).toMatch(/return public\.get_schedule_edit_session_service/i);
  });

  it("restores staged live removals without falling back to undo snapshots", () => {
    expect(migration).toMatch(/operation not in \('create', 'update', 'delete', 'restore'\)/i);
    expect(migration).toMatch(/if operation = 'restore' then/i);
    expect(migration).toMatch(/set pending_op_type = null/i);
  });

  it("omits staged live removals from saved drafts", () => {
    expect(migration).toMatch(
      /rename to save_schedule_edit_session_service_base/i,
    );
    expect(migration).toMatch(/shift\.pending_op_type = 'delete'/i);
  });
});

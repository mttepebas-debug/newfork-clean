import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readMigration(name: string) {
  return readFileSync(
    resolve(process.cwd(), `../../supabase/migrations/${name}`),
    "utf8",
  );
}

const migration = readMigration(
  "20260908104000_schedule_rpc_shift_fields_forward_fix.sql",
);

describe("schedule RPC shift fields forward migration", () => {
  it("repairs every existing base RPC that predates the shift fields", () => {
    expect(migration).toMatch(
      /create or replace function public\.get_schedule_read_model_service_label_base/i,
    );
    expect(migration).toMatch(
      /create or replace function public\.get_schedule_edit_session_service_base/i,
    );
    expect(migration).toMatch(
      /create or replace function public\.mutate_schedule_edit_shift_service_base/i,
    );
    expect(migration).toMatch(
      /create or replace function public\.save_schedule_edit_session_service_base/i,
    );
    expect(migration).toMatch(
      /create or replace function public\.create_schedule_template_service_label_base/i,
    );
    expect(migration).toMatch(/'primary_job_id'/i);
    expect(migration).toMatch(/unpaid_break_minutes/i);
    expect(migration).toMatch(/hide_time_on_badge/i);
  });

  it("keeps already-applied migrations immutable", () => {
    expect(
      readMigration("20260817190000_scheduling_settings_shift_types.sql"),
    ).not.toMatch(/time_format text/i);
    expect(readMigration("20260818190000_schedule_read_model.sql")).not.toMatch(
      /unpaid_break_minutes integer/i,
    );
    expect(readMigration("20260818220000_schedule_edit_sessions.sql")).not.toMatch(
      /hide_time_on_badge boolean/i,
    );
    expect(
      readMigration("20260819150000_schedule_templates_autofill_export.sql"),
    ).not.toMatch(/hide_time_on_badge boolean/i);
  });
});

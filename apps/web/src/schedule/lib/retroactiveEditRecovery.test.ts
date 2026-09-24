import { describe, expect, it } from "vitest";

import { ScheduleRequestError } from "../schedule-data";
import {
  parsePastEditFinding,
  parseRetroactiveEditError,
} from "./retroactiveEditRecovery";

describe("retroactiveEditRecovery", () => {
  it("parses valid past edit findings", () => {
    expect(
      parsePastEditFinding({
        op_type: "update",
        shift_id: "shift-1",
        scheduled_date: "2026-08-17",
        location_name: "Main Dining",
        employee_name: "Alex Rivera",
        reason: "shift_started",
        severity: "warning",
      }),
    ).toEqual({
      op_type: "update",
      shift_id: "shift-1",
      scheduled_date: "2026-08-17",
      location_name: "Main Dining",
      employee_name: "Alex Rivera",
      reason: "shift_started",
      severity: "warning",
    });
  });

  it("drops malformed past edit findings", () => {
    expect(
      parsePastEditFinding({
        op_type: "update",
        scheduled_date: "2026-08-17",
        location_name: "Main Dining",
        reason: "unknown",
        severity: "warning",
      }),
    ).toBeNull();
  });

  it("parses retroactive confirmation errors", () => {
    const parsed = parseRetroactiveEditError(
      new ScheduleRequestError("ack required", 409, {
        status: "past_shift_edit_requires_ack",
        past_edits: [
          {
            op_type: "delete",
            scheduled_date: "2026-08-17",
            location_name: "Main Dining",
            employee_name: null,
            reason: "past_week",
            severity: "warning",
          },
          { op_type: "bad" },
        ],
        past_edit_messages: ["Past shift warning", 7],
      }),
    );

    expect(parsed).toEqual({
      mode: "confirm",
      findings: [
        {
          op_type: "delete",
          shift_id: null,
          scheduled_date: "2026-08-17",
          location_name: "Main Dining",
          employee_name: null,
          reason: "past_week",
          severity: "warning",
        },
      ],
      messages: ["Past shift warning"],
    });
  });

  it("parses retroactive blocked errors", () => {
    expect(
      parseRetroactiveEditError(
        new ScheduleRequestError("blocked", 409, {
          status: "past_edit_blocked",
          past_edits: [],
          past_edit_messages: [],
        }),
      )?.mode,
    ).toBe("blocked");
  });

  it("ignores unrelated errors", () => {
    expect(parseRetroactiveEditError(new Error("nope"))).toBeNull();
    expect(
      parseRetroactiveEditError(
        new ScheduleRequestError("conflict", 409, {
          status: "schedule_conflicts",
        }),
      ),
    ).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { employeeRequestActionInputSchema } from "./employee-hub";
const id = "af9c0000-0000-4000-8000-000000000001";
const period = { segment_id: id, starts_at: "2035-01-15T15:00:00Z", ends_at: "2035-01-15T19:00:00Z" };
const command = { request_id: id, kind: "time_off", action: "request_cancellation", expected_revision: 2, operation_id: id, reason: "Plans changed", periods: [period] };
describe("approved leave cancellation contract", () => {
  it("requires a parent revision, operation key and exact approved periods", () => {
    expect(employeeRequestActionInputSchema.parse(command)).toEqual(command);
    for (const key of ["expected_revision", "operation_id", "periods"]) expect(employeeRequestActionInputSchema.safeParse({ ...command, [key]: undefined }).success).toBe(false);
  });
  it("does not reinterpret pending withdrawal or shift-change actions", () => {
    expect(employeeRequestActionInputSchema.parse({ request_id: id, kind: "time_off", action: "cancel", expected_revision: 1 }).action).toBe("cancel");
    expect(employeeRequestActionInputSchema.safeParse({ ...command, kind: "shift_change" }).success).toBe(false);
  });
  it("rejects empty, reversed or overlapping periods", () => {
    for (const periods of [[], [period, period], [{ ...period, ends_at: period.starts_at }]]) expect(employeeRequestActionInputSchema.safeParse({ ...command, periods }).success).toBe(false);
  });
  it("compares physical instants while preserving both repeated clock occurrences", () => {
    const periods = [
      { segment_id: id, starts_at: "2035-11-04T01:00:00-04:00", ends_at: "2035-11-04T01:30:00-04:00" },
      { segment_id: id, starts_at: "2035-11-04T01:00:00-05:00", ends_at: "2035-11-04T01:30:00-05:00" },
    ];
    expect(employeeRequestActionInputSchema.safeParse({ ...command, periods }).success).toBe(true);
  });
});

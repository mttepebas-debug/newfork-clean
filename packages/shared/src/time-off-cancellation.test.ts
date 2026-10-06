import { describe, expect, it } from "vitest";
import * as shared from "./index";
import { employeeRequestActionInputSchema, timeOffRequestSchema, timeOffRequestStatusSchema } from "./index";

const id = "af9c0000-0000-4000-8000-000000000001";
// The Requests queue row as get_schedule_requests_service sends it since FB-6.3.7.
const row = {
  id, employee_id: id, employee_name: "Ayse Kaya", request_type: "time_off", reason: "", status: "pending",
  start_date: "2035-01-15", end_date: "2035-01-15", revision: 1, created_at: "2035-01-01T10:00:00Z",
  decide_by: null, conflict_count: 0, segments: [], events: [], progress: null,
};

describe("FB-6.3.7: the old time-off path is gone", () => {
  it("withdrawing a pending request is the only Employee Hub request action", () => {
    expect(employeeRequestActionInputSchema.parse({ request_id: id, kind: "time_off", action: "cancel", expected_revision: 1 }).action).toBe("cancel");
    expect(employeeRequestActionInputSchema.safeParse({
      request_id: id, kind: "time_off", action: "request_cancellation", expected_revision: 2, operation_id: id, reason: "",
      periods: [{ segment_id: id, starts_at: "2035-01-15T15:00:00Z", ends_at: "2035-01-15T19:00:00Z" }],
    }).success).toBe(false);
  });
  it("a request has no location, no viewed mark and no partial approval", () => {
    expect(timeOffRequestSchema.parse(row)).not.toHaveProperty("location_id");
    expect(timeOffRequestSchema.parse(row)).not.toHaveProperty("viewed_at");
    expect(timeOffRequestStatusSchema.safeParse("partially_approved").success).toBe(false);
  });
  it("the old decision, preview and submit contracts are not exported", () => {
    for (const name of ["timeOffDecisionInputSchema", "timeOffAssignmentPreviewSchema", "timeOffAssignmentPreviewInputSchema",
      "timeOffAssignmentDispositionSchema", "timeOffSegmentDecisionSchema", "timeOffDecisionPieceSchema", "employeeTimeOffInputSchema"])
      expect(name in shared).toBe(false);
  });
});

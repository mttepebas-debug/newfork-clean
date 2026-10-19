import { describe, expect, it } from "vitest";
import {
  timeOffApprovalAsksFirst,
  employeeHubRequestSchema,
  schedulePublishFindingSchema,
  schedulingSettingsSchema,
  timeOffCancellationRequestInputSchema,
  timeOffRequestSchema,
  timeOffRevokeInputSchema,
  timeOffRevokeResultSchema,
  timeOffSubmitInputSchema,
  timeOffSubmitResultSchema,
  timeOffVerdictInputSchema,
  timeOffVerdictResultSchema,
} from "./index";

const id = "af9c0000-0000-4000-8000-000000000001";
const other = "af9c0000-0000-4000-8000-000000000002";
const day = (segment_date: string) => ({ segment_date, start_time: null, end_time: null, ends_next_day: false });
const submit = { periods: [day("2035-01-15"), day("2035-01-16")], reason: "Family", expected_timezone: "America/New_York", operation_id: id };
const fingerprint = "0123456789abcdef0123456789abcdef";

describe("asking for time off (FB-6.3.5)", () => {
  it("names no location: the request belongs to the person", () => {
    const parsed = timeOffSubmitInputSchema.parse(submit);
    expect(parsed).not.toHaveProperty("location_id");
    expect(timeOffSubmitInputSchema.safeParse({ ...submit, location_id: id }).success).toBe(false);
  });
  it("is one run of days in a row, hours per day allowed", () => {
    const hours = { segment_date: "2035-01-16", start_time: "09:00", end_time: "13:00", ends_next_day: false };
    expect(timeOffSubmitInputSchema.safeParse({ ...submit, periods: [day("2035-01-15"), hours, { ...hours, start_time: "15:00", end_time: "17:00" }] }).success).toBe(true);
    expect(timeOffSubmitInputSchema.safeParse({ ...submit, periods: [day("2035-01-15"), day("2035-01-17")] }).success).toBe(false);
  });
  it("needs a request key, the time zone it was shown in and 1 to 31 periods", () => {
    for (const key of ["operation_id", "expected_timezone", "periods"])
      expect(timeOffSubmitInputSchema.safeParse({ ...submit, [key]: undefined }).success).toBe(false);
    expect(timeOffSubmitInputSchema.safeParse({ ...submit, periods: [] }).success).toBe(false);
    const month = Array.from({ length: 32 }, (_, i) => day(new Date(Date.UTC(2035, 0, 1 + i)).toISOString().slice(0, 10)));
    expect(timeOffSubmitInputSchema.safeParse({ ...submit, periods: month }).success).toBe(false);
    expect(timeOffSubmitInputSchema.safeParse({ ...submit, periods: month.slice(0, 31) }).success).toBe(true);
  });
  it("answers with the status and the deadline", () => {
    expect(timeOffSubmitResultSchema.parse({ status: "approved", request_id: id, revision: 2, decide_by: "2035-01-14T05:00:00+00:00" }).decide_by).toBeTruthy();
    expect(timeOffSubmitResultSchema.parse({ status: "pending", request_id: id, revision: 1, decide_by: null }).decide_by).toBeNull();
  });
  it("asks to cancel approved hours with the leave's revision", () => {
    const cancel = { expected_revision: 3, periods: [{ segment_id: id, starts_at: "2035-01-15T15:00:00Z", ends_at: "2035-01-15T19:00:00Z" }], reason: "", operation_id: id };
    expect(timeOffCancellationRequestInputSchema.parse(cancel).expected_revision).toBe(3);
    expect(timeOffCancellationRequestInputSchema.safeParse({ ...cancel, periods: [] }).success).toBe(false);
  });
});

describe("deciding time off (FB-6.3.5)", () => {
  it("is approve or deny with the impact the voter saw; no partial approval", () => {
    expect(timeOffVerdictInputSchema.parse({ verdict: "deny", note: "Only Jan 16 works", expected_impact: fingerprint }).note).toBe("Only Jan 16 works");
    expect(timeOffVerdictInputSchema.parse({ verdict: "approve", expected_impact: fingerprint }).note).toBe("");
    for (const verdict of ["partial_approve", "return_to_pending", "revoke"])
      expect(timeOffVerdictInputSchema.safeParse({ verdict, expected_impact: fingerprint }).success).toBe(false);
    expect(timeOffVerdictInputSchema.safeParse({ verdict: "approve" }).success).toBe(false);
    expect(timeOffVerdictInputSchema.safeParse({ verdict: "approve", expected_impact: "nope" }).success).toBe(false);
  });
  it("says whether the vote settled it and how many locations are left", () => {
    const vote = timeOffVerdictResultSchema.parse({ status: "pending", final: false, alone: false, remaining: 1, revision: 4, request_id: id });
    expect(vote.remaining).toBe(1);
  });
  it("revokes only with a reason", () => {
    expect(timeOffRevokeInputSchema.safeParse({ expected_revision: 2, reason: "  " }).success).toBe(false);
    expect(timeOffRevokeInputSchema.parse({ expected_revision: 2, reason: " Short staffed " }).reason).toBe("Short staffed");
    expect(timeOffRevokeResultSchema.parse({ status: "approved", request_id: id, revision: 5 }).status).toBe("approved");
  });
});

describe("what the deciders and the person read (FB-6.3.5)", () => {
  const shift = {
    id: other, source_id: other, publication_id: other, location_id: id, location_name: "Kadikoy", employee_id: id,
    scheduled_date: "2035-01-15", start_time: "09:00:00", end_time: "17:00:00", timezone: "America/New_York",
    time_basis: "location_wall_clock", time_unknown: false, job_name: "Server",
    starts_at: "2035-01-15T14:00:00+00:00", ends_at: "2035-01-15T22:00:00+00:00",
  };
  const request = {
    id, employee_id: id, employee_name: "Ali Kaya", request_type: "time_off",
    reason: "", status: "pending", start_date: "2035-01-15", end_date: "2035-01-16", revision: 1,
    created_at: "2035-01-01T10:00:00+00:00", decide_by: "2035-01-14T14:00:00+00:00", conflict_count: 1, segments: [],
    events: [{ id: other, action: "expired", actor_name: "System", note: "Not decided in time", created_at: "2035-01-14T14:00:00+00:00" }],
    progress: {
      remaining: 1, fallback: false, decide_by: "2035-01-14T14:00:00+00:00", can_vote: true, can_decide_alone: false,
      my_vote: null, my_approval_finalizes: false,
      locations: [
        { id, name: "Kadikoy", approved_by: other, approved_by_name: "Ayse", approved_at: "2035-01-02T10:00:00+00:00" },
        { id: other, name: "Besiktas", approved_by: null, approved_by_name: null, approved_at: null },
      ],
      impact: { fingerprint, locations: { [id]: { fingerprint, shifts: [shift] } }, hidden_shift_count: 2 },
    },
  };
  it("reads a request with no location, its deadline and its progress", () => {
    const parsed = timeOffRequestSchema.parse(request);
    expect(parsed).not.toHaveProperty("location_id");
    expect(parsed.progress?.locations.map((l) => l.approved_by_name)).toEqual(["Ayse", null]);
    expect(parsed.progress?.impact?.hidden_shift_count).toBe(2);
  });
  it("has no progress once the request closed, and none for a reader who cannot decide", () => {
    expect(timeOffRequestSchema.parse({ ...request, status: "denied", progress: null }).progress).toBeNull();
    expect(timeOffRequestSchema.parse({ ...request, progress: { ...request.progress, can_vote: false, impact: null } }).progress?.impact).toBeNull();
  });
  it("shows the person a display status and the deadline, never the votes", () => {
    const row = { id, kind: "time_off", status: "denied", title: "Time off", detail: "", revision: 2, created_at: "2035-01-01T10:00:00+00:00",
      can_cancel: false, display_status: "Not decided in time", decide_by: "2035-01-14T14:00:00+00:00" };
    expect(employeeHubRequestSchema.parse(row).display_status).toBe("Not decided in time");
    expect(employeeHubRequestSchema.parse({ ...row, display_status: "Revoked · taken until Oct 3, 2:00 PM" }).display_status).toContain("taken until");
  });
});

describe("the workspace setting and the publish note (FB-6.3.5)", () => {
  const settings = { workspace_id: id, week_start_day: "monday", schedule_deadline_day: "friday", time_format: "12h" };
  it("keeps the time-off decision lead time in whole hours, 0 to 720", () => {
    expect(schedulingSettingsSchema.parse({ ...settings, time_off_lead_hours: 24 }).time_off_lead_hours).toBe(24);
    for (const hours of [-1, 721, 1.5]) expect(schedulingSettingsSchema.safeParse({ ...settings, time_off_lead_hours: hours }).success).toBe(false);
  });
  it("knows a shift that meets time off still waiting for a decision", () => {
    const finding = { id: "time_off_pending:1", code: "time_off_pending", severity: "soft", overrideable: false, tier: "note",
      message: "Ali has time off waiting for a decision on Jan 15", location_id: id, employee_id: id, scheduled_date: "2035-01-15",
      shift_ids: [other], time_off_request_id: other };
    expect(schedulePublishFindingSchema.parse(finding).time_off_request_id).toBe(other);
  });
});

describe("timeOffApprovalAsksFirst", () => {
  const impact = (hidden: number) => ({ fingerprint: "0123456789abcdef0123456789abcdef", locations: {}, hidden_shift_count: hidden });
  it("asks when the last approval opens shifts, or when an admin or owner decides alone", () => {
    expect(timeOffApprovalAsksFirst({ can_decide_alone: false, my_approval_finalizes: true, impact: impact(1) })).toBe(true);
    expect(timeOffApprovalAsksFirst({ can_decide_alone: true, my_approval_finalizes: false, impact: impact(0) })).toBe(true);
  });
  it("acts on the click otherwise", () => {
    expect(timeOffApprovalAsksFirst({ can_decide_alone: false, my_approval_finalizes: true, impact: impact(0) })).toBe(false);
    expect(timeOffApprovalAsksFirst({ can_decide_alone: false, my_approval_finalizes: false, impact: impact(3) })).toBe(false);
    expect(timeOffApprovalAsksFirst({ can_decide_alone: false, my_approval_finalizes: true, impact: null })).toBe(false);
  });
});

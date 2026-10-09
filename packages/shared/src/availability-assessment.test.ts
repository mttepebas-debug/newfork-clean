import { describe, expect, it } from "vitest";
import { closedLocationSeverity, DEFAULT_SCHEDULE_CONFLICT_RULES, scheduleConflictRulesSchema, shiftAvailabilityAssessmentSchema } from "./availability-assessment";
import { schedulePublicationOverrideInputSchema, schedulePublishFindingSchema } from "./index";

describe("scheduleConflictRulesSchema", () => {
  it("only accepts block for approved time off (FB-6.1.6)", () => {
    expect(scheduleConflictRulesSchema.safeParse(DEFAULT_SCHEDULE_CONFLICT_RULES).success).toBe(true);
    expect(scheduleConflictRulesSchema.safeParse({ ...DEFAULT_SCHEDULE_CONFLICT_RULES, approved_time_off: "confirm" }).success).toBe(false);
    const { approved_time_off: _omitted, ...withoutKey } = DEFAULT_SCHEDULE_CONFLICT_RULES;
    expect(scheduleConflictRulesSchema.safeParse(withoutKey).success).toBe(false);
  });
  it("has no availability rule: availability is always a warning, never a setting (M8)", () => {
    expect("availability" in DEFAULT_SCHEDULE_CONFLICT_RULES).toBe(false);
    expect(scheduleConflictRulesSchema.safeParse({ ...DEFAULT_SCHEDULE_CONFLICT_RULES, availability: "warn" }).success).toBe(false);
  });
});

describe("closed location in three steps (K17)", () => {
  it("is block, confirm each cell, or confirm once per editing session; warn is not one of them", () => {
    for (const step of ["block", "confirm", "confirm_once"] as const)
      expect(scheduleConflictRulesSchema.safeParse({ ...DEFAULT_SCHEDULE_CONFLICT_RULES, closed_location: step }).success).toBe(true);
    expect(scheduleConflictRulesSchema.safeParse({ ...DEFAULT_SCHEDULE_CONFLICT_RULES, closed_location: "warn" }).success).toBe(false);
  });
  it("asks on confirm_once like confirm, and refuses on block", () => {
    expect(closedLocationSeverity("confirm_once")).toBe("confirm");
    expect(closedLocationSeverity("block")).toBe("block");
  });
  it("keeps the server's confirm once mark on the reason (BL-685)", () => {
    const reason = { code: "closed_location", message: "Closed.", definite: true, severity: "confirm", confirm_scope: "edit_session" };
    const shape = shiftAvailabilityAssessmentSchema.shape.reasons.element;
    expect(shape.parse(reason).confirm_scope).toBe("edit_session");
    expect(shape.parse({ ...reason, confirm_scope: undefined }).confirm_scope).toBeUndefined();
    expect(shape.safeParse({ ...reason, confirm_scope: "forever" }).success).toBe(false);
  });
});

describe("publish lists availability, never asks (M9)", () => {
  const finding = { id: "a".repeat(64), code: "availability", severity: "soft", overrideable: false, tier: "note",
    conflict_severity: "warn", message: "Ali Person shows as unavailable for this shift.",
    location_id: "10000000-0000-4000-8000-000000000001", employee_id: "10000000-0000-4000-8000-000000000002",
    scheduled_date: "2026-09-29", shift_ids: [] };
  it("is a note with nobody's acknowledgement", () => {
    const parsed = schedulePublishFindingSchema.parse({ ...finding,
      acknowledged_by_user_id: "10000000-0000-4000-8000-000000000003", acknowledged_by_name: "Ayse Manager",
      acknowledged_at: "2026-09-26T18:00:00+00:00" });
    expect(parsed).toMatchObject({ code: "availability", tier: "note", overrideable: false });
    expect(Object.keys(parsed).filter((key) => key.startsWith("acknowledged"))).toEqual([]);
  });
  it("a decision on another finding names only the finding; there is no written reason", () => {
    expect(schedulePublicationOverrideInputSchema.parse({ finding_id: finding.id })).toEqual({ finding_id: finding.id });
  });
});

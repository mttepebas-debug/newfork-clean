import { describe, expect, it } from "vitest";
import { closedLocationAsks, closedLocationSeverity, DEFAULT_SCHEDULE_CONFLICT_RULES, scheduleConflictRulesSchema } from "./availability-assessment";
import { schedulePublicationOverrideInputSchema, schedulePublishFindingSchema } from "./index";

describe("scheduleConflictRulesSchema", () => {
  it("only accepts block for approved time off (FB-6.1.6)", () => {
    expect(scheduleConflictRulesSchema.safeParse(DEFAULT_SCHEDULE_CONFLICT_RULES).success).toBe(true);
    expect(scheduleConflictRulesSchema.safeParse({ ...DEFAULT_SCHEDULE_CONFLICT_RULES, approved_time_off: "confirm" }).success).toBe(false);
    const { approved_time_off: _omitted, ...withoutKey } = DEFAULT_SCHEDULE_CONFLICT_RULES;
    expect(scheduleConflictRulesSchema.safeParse(withoutKey).success).toBe(false);
  });
  it("has no availability rule: availability is a preference, never a conflict (BL-186)", () => {
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
  it("asks once a session on confirm_once, every cell on confirm, never on block (it refuses)", () => {
    expect(closedLocationSeverity("confirm_once")).toBe("confirm");
    expect(closedLocationSeverity("block")).toBe("block");
    expect(closedLocationAsks("confirm_once", false)).toBe(true);
    expect(closedLocationAsks("confirm_once", true)).toBe(false);
    expect(closedLocationAsks("confirm", true)).toBe(true);
    expect(closedLocationAsks("block", false)).toBe(false);
  });
});

describe("publish availability acknowledgement (BL-186)", () => {
  const finding = { id: "a".repeat(64), code: "availability", severity: "soft", overrideable: true, tier: "note",
    availability_state: "accepted", warning_policy: "confirm", message: "Ali Person shows as unavailable for this shift.",
    location_id: "10000000-0000-4000-8000-000000000001", employee_id: "10000000-0000-4000-8000-000000000002",
    scheduled_date: "2026-09-29", shift_ids: [],
    acknowledged_by_user_id: "10000000-0000-4000-8000-000000000003", acknowledged_by_name: "Ayse Manager",
    acknowledged_at: "2026-09-26T18:00:00+00:00" };
  it("keeps who acknowledged an earlier warning and when", () => {
    expect(schedulePublishFindingSchema.parse(finding)).toMatchObject({ acknowledged_by_name: "Ayse Manager", acknowledged_at: finding.acknowledged_at });
  });
  it("an acknowledgement names only the finding; there is no written reason", () => {
    expect(schedulePublicationOverrideInputSchema.parse({ finding_id: finding.id })).toEqual({ finding_id: finding.id });
  });
});

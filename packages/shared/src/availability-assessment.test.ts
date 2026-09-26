import { describe, expect, it } from "vitest";
import { DEFAULT_SCHEDULE_CONFLICT_RULES, scheduleConflictRulesSchema } from "./availability-assessment";

describe("scheduleConflictRulesSchema", () => {
  it("only accepts block for approved time off (FB-6.1.6)", () => {
    expect(scheduleConflictRulesSchema.safeParse(DEFAULT_SCHEDULE_CONFLICT_RULES).success).toBe(true);
    expect(scheduleConflictRulesSchema.safeParse({ ...DEFAULT_SCHEDULE_CONFLICT_RULES, approved_time_off: "confirm" }).success).toBe(false);
    const { approved_time_off: _omitted, ...withoutKey } = DEFAULT_SCHEDULE_CONFLICT_RULES;
    expect(scheduleConflictRulesSchema.safeParse(withoutKey).success).toBe(false);
  });
});

import type { ExchangeApplication } from "@newfork/shared";
import { describe, expect, it } from "vitest";
import { candidateChecks, shiftLength } from "./exchange-review";

type Eligibility = NonNullable<ExchangeApplication["eligibility"]>;
const eligible = (extra: Partial<Eligibility> = {}): Eligibility => ({ status: "eligible", reasons: [], ...extra });

// Mert, 2026-10-11: the cover and open shift drawer lists who can take the
// shift, each with chips from the core's eligibility check.
describe("candidateChecks", () => {
  it("says Available, with the rest the core measured, when nothing stands in the way", () => {
    expect(candidateChecks(eligible({ measures: { rest_gap_minutes: 720, travel_gap_minutes: null, rest_rule_minutes: 600, travel_rule_minutes: 30 } })))
      .toEqual({ chips: [{ text: "Available", tone: "ok" }, { text: "12 h of rest", tone: "ok" }], blocked: false, warned: false });
    expect(candidateChecks(eligible({ measures: { rest_gap_minutes: null, travel_gap_minutes: null, rest_rule_minutes: 600, travel_rule_minutes: 30 } })).chips)
      .toEqual([{ text: "Available", tone: "ok" }, { text: "No shift nearby", tone: "ok" }]);
  });

  it("turns each rule set aside into an orange chip that still lets the manager choose", () => {
    const result = candidateChecks(eligible({ approval_flags: [
      { code: "minimum_rest", gap_minutes: 480, rule_minutes: 600 },
      { code: "minimum_travel", gap_minutes: 15, rule_minutes: 30 },
      { code: "availability_consent" },
    ] }));
    expect(result).toEqual({ chips: [
      { text: "8 h of rest · 10 h needed", tone: "warn" },
      { text: "15 min to travel · 30 min needed", tone: "warn" },
      { text: "Unavailable · chose to take it", tone: "warn" },
    ], blocked: false, warned: true });
  });

  it("an availability chip alone is information, not a warning to set aside (Müsaitlik tercih 3)", () => {
    expect(candidateChecks(eligible({ approval_flags: [{ code: "availability_consent" }] }))).toEqual({
      chips: [{ text: "Unavailable · chose to take it", tone: "warn" }], blocked: false, warned: false });
  });

  it("stops a person on approved time off or whom the core finds ineligible", () => {
    expect(candidateChecks({ status: "ineligible", reasons: ["Approved time off overlaps."], blockers: [{ code: "approved_time_off" }] }))
      .toEqual({ chips: [{ text: "On time off", tone: "red" }], blocked: true, warned: false });
    expect(candidateChecks({ status: "ineligible", reasons: ["Overlaps another shift."] }))
      .toEqual({ chips: [{ text: "Overlaps another shift", tone: "red" }], blocked: true, warned: false });
  });

  it("asks for a recheck when the core could not finish the check", () => {
    expect(candidateChecks({ status: "verification_required", reasons: ["Shift hours need verification."] }))
      .toEqual({ chips: [{ text: "Shift hours need verification", tone: "warn" }], blocked: false, warned: true });
    expect(candidateChecks(null)).toEqual({ chips: [{ text: "Not checked yet", tone: "grey" }], blocked: false, warned: false });
  });
});

describe("shiftLength", () => {
  it("counts paid hours and names the unpaid break, across midnight too", () => {
    expect(shiftLength("16:00", "22:00", 30)).toBe("5.5 h, 30 min unpaid break");
    expect(shiftLength("22:00", "06:00", 0)).toBe("8 h");
    expect(shiftLength(null, "06:00", 0)).toBe("");
  });
});

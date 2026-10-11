import { describe, expect, it } from "vitest";
import { reviewBoxes, timeOffStops, type ReviewSide, blockerLines } from "./swap-review";

// EKRAN-02 C2 (KARARLAR "Takas inceleme penceresi H2", uyarı kutuları, 2026-10-07):
// a rule that fails on one shift gets an orange box there and a green box on the
// other shift, so neither card has a gap; no failure, no box. Ali gives Wednesday
// (Deniz takes it: the receiver); Deniz gives Friday (Ali takes it: the giver).
const measures = { rest_gap_minutes: 720, travel_gap_minutes: null, rest_rule_minutes: 600, travel_rule_minutes: 45 };
function side(date: string, check: Partial<NonNullable<ReviewSide["check"]>> = {}): ReviewSide {
  return { date, check: { approval_flags: [], measures, blockers: [], ...check } };
}
const wednesday = "2026-10-14";
const friday = "2026-10-16";
const text = (boxes: ReturnType<typeof reviewBoxes>) => boxes.map((card) => card.map((box) => `${box.tone}: ${box.top} / ${box.bottom}`));

describe("reviewBoxes", () => {
  it("draws no box when every rule holds", () => {
    expect(reviewBoxes([side(wednesday), side(friday)])).toEqual([[], []]);
  });

  it("puts a short travel gap in orange and the travel that holds in green", () => {
    const boxes = reviewBoxes([side(wednesday, { approval_flags: [{ code: "minimum_travel", gap_minutes: 30, rule_minutes: 45 }] }), side(friday)]);
    expect(text(boxes)).toEqual([["warn: 30 min to travel / 45 min needed"], ["ok: Travel time OK / 45 min needed"]]);
  });

  it("names the rest measured on the shift where it holds", () => {
    const boxes = reviewBoxes([side(wednesday), side(friday, { approval_flags: [{ code: "minimum_rest", gap_minutes: 480, rule_minutes: 600 }] })]);
    expect(text(boxes)).toEqual([["ok: 12 h of rest / 10 h needed"], ["warn: 8 h of rest / 10 h needed"]]);
  });

  it("says no shift is nearby when nothing was measured on the side where rest holds", () => {
    const boxes = reviewBoxes([
      side(wednesday, { measures: { ...measures, rest_gap_minutes: null } }),
      side(friday, { approval_flags: [{ code: "minimum_rest", gap_minutes: 450, rule_minutes: 600 }] }),
    ]);
    expect(text(boxes)).toEqual([["ok: No shift nearby / 10 h needed"], ["warn: 7.5 h of rest / 10 h needed"]]);
  });

  it("tells availability set aside by consent from the other shift's free day", () => {
    const boxes = reviewBoxes([side(wednesday, { approval_flags: [{ code: "availability_consent" }] }), side(friday)]);
    expect(text(boxes)).toEqual([["warn: Unavailable / chose to take it"], ["ok: Available / on Friday"]]);
  });

  // KARARLAR §1.1 (Mert, 2026-10-09): approved time off is never given up by consent.
  it("says the person on time off can't take the shift, against the other shift's day without it", () => {
    const boxes = reviewBoxes([side(wednesday), side(friday, { blockers: [{ code: "approved_time_off" }] })]);
    expect(text(boxes)).toEqual([["ok: No time off / on Wednesday"], ["warn: On time off / can't take this shift"]]);
  });

  it("tells whether approved time off stops the swap", () => {
    expect(timeOffStops([side(wednesday), side(friday)])).toBe(false);
    expect(timeOffStops([side(wednesday), side(friday, { blockers: [{ code: "approved_time_off" }] })])).toBe(true);
    expect(timeOffStops([{ date: wednesday, check: null }, side(friday)])).toBe(false);
  });

  it("keeps the rules in one order on both cards, so the boxes line up", () => {
    const boxes = reviewBoxes([
      side(wednesday, { approval_flags: [{ code: "minimum_rest", gap_minutes: 480, rule_minutes: 600 }, { code: "minimum_travel", gap_minutes: 30, rule_minutes: 45 }] }),
      side(friday, { blockers: [{ code: "approved_time_off" }] }),
    ]);
    expect(boxes.map((card) => card.map((box) => box.rule))).toEqual([
      ["travel", "rest", "time_off"],
      ["travel", "rest", "time_off"],
    ]);
  });

  it("shows nothing for a side the core could not check", () => {
    expect(reviewBoxes([side(wednesday, { approval_flags: [{ code: "availability_consent" }] }), { date: friday, check: null }])).toEqual([
      [{ rule: "availability", tone: "warn", top: "Unavailable", bottom: "chose to take it" }],
      [],
    ]);
  });
});

// EKRAN-02 recovery: the red line names whom and which rule (nf-guvenlik ONAY @432e0097 follow-up).
describe("blockerLines", () => {
  const names = { owner: "Ali", other: "Deniz" };
  it("names the receiver, whose shift they would take, and the rule", () => {
    expect(blockerLines(["The receiving employee is not eligible for the full shift"],
      { receiver: { reasons: ["Required document is expired."] }, giver: null }, names))
      .toEqual(["Deniz can't take Ali's shift: Required document is expired."]);
  });
  it("names the giver in a swap, joining several rules", () => {
    expect(blockerLines(["The other employee is not eligible for the exchanged shift"],
      { receiver: { reasons: [] }, giver: { reasons: ["Not assigned to this location", "Employee already has an overlapping shift."] } }, names))
      .toEqual(["Ali can't take Deniz's shift: Not assigned to this location; Employee already has an overlapping shift."]);
  });
  it("says an open shift, which nobody holds yet", () => {
    expect(blockerLines(["The receiving employee is not eligible for the full shift"],
      { receiver: { reasons: ["Required document is expired."] }, giver: null }, { owner: null, other: "Emma" }))
      .toEqual(["Emma can't take this open shift: Required document is expired."]);
  });
  it("keeps the server's sentence when the check gives no rule", () => {
    const reason = "The receiving employee is not eligible for the full shift";
    expect(blockerLines([reason], { receiver: { reasons: [] }, giver: null }, names)).toEqual([reason]);
  });
  it("leaves any other sentence as it is", () => {
    expect(blockerLines(["This shift has already started"], { receiver: { reasons: ["x"] }, giver: null }, names))
      .toEqual(["This shift has already started"]);
  });
});

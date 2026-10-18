import { describe, expect, it } from "vitest";
import { exchangeCommandSchema, exchangePreviewSchema } from "./shift-exchanges";

// EKRAN-02 C2 (KARARLAR "Takas inceleme penceresi H2", uyarı kutuları): the swap
// review draws its boxes from the decision preview, so the manager's flags and
// what the core measured must survive the parse.
describe("exchangePreviewSchema", () => {
  const side = {
    status: "eligible",
    reasons: [],
    approval_flags: [{ code: "minimum_rest", gap_minutes: 480, rule_minutes: 600 }, { code: "availability_consent" }],
    measures: { rest_gap_minutes: 480, travel_gap_minutes: null, rest_rule_minutes: 600, travel_rule_minutes: 45 },
  };

  it("keeps each side's approval flags and measures", () => {
    const preview = exchangePreviewSchema.parse({
      allowed: true, fingerprint: "f", reasons: [], receiver: side, giver: side, requires_other_manager: false, other_applications: 0,
    });
    expect(preview.receiver.approval_flags).toEqual(side.approval_flags);
    expect(preview.giver?.measures).toEqual(side.measures);
  });

  it("reads a preview without them, as the employee's own reads come", () => {
    const preview = exchangePreviewSchema.parse({
      allowed: true, fingerprint: "f", reasons: [], receiver: { status: "eligible", reasons: [] }, giver: null,
      requires_other_manager: false, other_applications: 0,
    });
    expect(preview.receiver.approval_flags).toBeUndefined();
  });
});

// TAKAS-RELEASE: "Not for me" names the released shift and its request; Take back
// and a manager's decline need no reason.
describe("exchangeCommandSchema", () => {
  const ids = { shift_id: "11111111-1111-4111-8111-111111111111", case_id: "22222222-2222-4222-8222-222222222222" };
  it("takes a pass on a released shift", () => {
    expect(exchangeCommandSchema.parse({ action: "pass", ...ids })).toEqual({ action: "pass", ...ids });
  });
  it("refuses a pass without its request", () => {
    expect(exchangeCommandSchema.safeParse({ action: "pass", shift_id: ids.shift_id }).success).toBe(false);
  });
  it("closes and declines without a reason", () => {
    for (const action of ["close", "reject"] as const)
      expect(exchangeCommandSchema.parse({ action, case_id: ids.case_id, expected_revision: 2 })).toMatchObject({ action, reason: "" });
  });
});

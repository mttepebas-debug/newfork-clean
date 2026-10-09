import { describe, expect, it } from "vitest";
import { exchangePreviewSchema } from "./shift-exchanges";

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

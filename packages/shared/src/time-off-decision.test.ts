import { describe, expect, it } from "vitest";
import { timeOffDecisionInputSchema } from "./index";

const first = "af950000-0000-4000-8000-000000000001";
const second = "af950000-0000-4000-8000-000000000002";
const parse = (segment_decisions: unknown[]) =>
  timeOffDecisionInputSchema.safeParse({
    action: "partial_approve",
    expected_revision: 1,
    segment_decisions,
  });
describe("partial time-off decision identity", () => {
  it("accepts one explicit decision for each distinct period", () => {
    expect(
      parse([
        { segment_id: first, status: "approved" },
        { segment_id: second, status: "denied" },
      ]).success,
    ).toBe(true);
  });
  it.each([first, first.toUpperCase()])(
    "rejects a repeated ID even when the second spelling is %s",
    (duplicate) => {
      expect(
        parse([
          { segment_id: first, status: "approved" },
          { segment_id: duplicate, status: "denied" },
        ]).success,
      ).toBe(false);
    },
  );
  it("requires at least one period and accepts only explicit approval or denial", () => {
    expect(parse([]).success).toBe(false);
    expect(parse([{ segment_id: first, status: "pending" }]).success).toBe(
      false,
    );
  });
  it("retains full approval without per-period decisions", () => {
    expect(
      timeOffDecisionInputSchema.safeParse({
        action: "approve",
        expected_revision: 1,
      }).success,
    ).toBe(true);
  });
  it("allows contiguous pieces and rejects gaps, overlap and contradictory whole-period status", () => {
    const pieces = [
      { starts_at: "2035-01-15T10:00:00Z", ends_at: "2035-01-15T12:00:00Z", status: "approved" },
      { starts_at: "2035-01-15T12:00:00Z", ends_at: "2035-01-15T17:00:00Z", status: "denied" },
    ];
    expect(parse([{ segment_id: first, pieces }]).success).toBe(true);
    expect(parse([{ segment_id: first, pieces: [...pieces].reverse() }]).success).toBe(true);
    expect(parse([{ segment_id: first, status: "approved", pieces }]).success).toBe(false);
    for (const starts_at of ["2035-01-15T11:00:00Z", "2035-01-15T13:00:00Z"])
      expect(parse([{ segment_id: first, pieces: [pieces[0], { ...pieces[1], starts_at }] }]).success).toBe(false);
    expect(parse([{ segment_id: first }]).success).toBe(false);
  });
});

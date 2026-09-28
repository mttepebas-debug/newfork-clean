import { describe, expect, it } from "vitest";
import { templateAppliedDescription } from "./templateApplyMessage";

const label = (name: string, shift_count: number) =>
  ({ kind: "archived_label", name, shift_count }) as const;

describe("templateAppliedDescription", () => {
  it("says only what was added when nothing was left off", () => {
    expect(
      templateAppliedDescription("Summer weekdays", { applied_shift_count: 1, skipped: [] }),
    ).toBe("Summer weekdays: 1 shift added.");
    expect(
      templateAppliedDescription("Summer weekdays", { applied_shift_count: 22, skipped: [] }),
    ).toBe("Summer weekdays: 22 shifts added.");
  });

  it("names one archived label and the shifts that came in without it", () => {
    expect(
      templateAppliedDescription("Summer weekdays", {
        applied_shift_count: 2,
        skipped: [label("Standby", 2)],
      }),
    ).toBe(
      "Summer weekdays: 2 shifts added. Standby is archived, so 2 shifts were added without it.",
    );
    expect(
      templateAppliedDescription("Brunch", {
        applied_shift_count: 5,
        skipped: [label("Standby", 1)],
      }),
    ).toBe("Brunch: 5 shifts added. Standby is archived, so 1 shift was added without it.");
  });

  it("lists several labels, sums their shifts, and shortens long names", () => {
    expect(
      templateAppliedDescription("Brunch", {
        applied_shift_count: 9,
        skipped: [label("Standby", 2), label("Trainee", 3)],
      }),
    ).toBe(
      "Brunch: 9 shifts added. Standby and Trainee are archived, so 5 shifts were added without them.",
    );
    expect(
      templateAppliedDescription("Brunch", {
        applied_shift_count: 9,
        skipped: [
          label("Standby", 1),
          label("Trainee", 1),
          label("Patio", 1),
          label("Private event staffing for large parties", 1),
        ],
      }),
    ).toBe(
      "Brunch: 9 shifts added. Standby, Trainee and 2 more are archived, so 4 shifts were added without them.",
    );
    expect(
      templateAppliedDescription("Brunch", {
        applied_shift_count: 1,
        skipped: [label("Private event staffing for large parties", 1)],
      }),
    ).toBe(
      "Brunch: 1 shift added. Private event staffing for… is archived, so 1 shift was added without it.",
    );
  });
});
